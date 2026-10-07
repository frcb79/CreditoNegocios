import type { Express } from "express";
import { pool } from "./db";
import { isAuthenticated } from "./auth";
import { getEffectivePermissions } from "./middleware/rbacMiddleware";
import {
  closeStaleActivitySessions,
  getRequestIp,
  getRequestUserAgent,
  recordHeartbeat,
} from "./activityService";

function clampDays(value: unknown): number {
  const parsed = Number(value || 30);
  if (!Number.isFinite(parsed)) return 30;
  return Math.max(1, Math.min(365, Math.floor(parsed)));
}

function clampLimit(value: unknown, fallback = 50): number {
  const parsed = Number(value || fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(200, Math.floor(parsed)));
}

function dbUser(req: any): any {
  return req.dbUser || req.user || null;
}

function canViewActivity(user: any): boolean {
  if (!user) return false;
  if (user.role === "super_admin") return true;
  const perms = getEffectivePermissions(user);
  return perms.modules.includes("usuarios") &&
    (perms.actions.includes("view_user_activity") || perms.actions.includes("manage_users"));
}

async function visibleTenantIdsFor(user: any): Promise<string[] | null> {
  const perms = getEffectivePermissions(user);
  if (user.role === "super_admin" || (user.role === "admin" && perms.scope === "global")) {
    return null;
  }

  if (perms.scope === "network" || user.role === "master_broker") {
    const result = await pool.query(
      `WITH RECURSIVE roots AS (
         SELECT t.id
         FROM public.tenant_members tm
         JOIN public.tenants t ON t.id = tm.tenant_id
         WHERE tm.user_id = $1 AND tm.is_active = TRUE
       ),
       network AS (
         SELECT id FROM roots
         UNION
         SELECT t.id
         FROM public.tenants t
         JOIN network n ON t.parent_tenant_id = n.id
       )
       SELECT DISTINCT id FROM network`,
      [user.id],
    );
    return result.rows.map((r) => r.id);
  }

  const result = await pool.query(
    `SELECT tenant_id AS id
     FROM public.tenant_members
     WHERE user_id = $1 AND is_active = TRUE`,
    [user.id],
  );
  return result.rows.map((r) => r.id);
}

async function visibleUserIdsFor(user: any): Promise<string[] | null> {
  const tenants = await visibleTenantIdsFor(user);
  if (tenants === null) return null;

  const ids = new Set<string>([user.id]);
  if (tenants.length) {
    const result = await pool.query(
      `SELECT DISTINCT user_id
       FROM public.tenant_members
       WHERE is_active = TRUE AND tenant_id = ANY($1::varchar[])`,
      [tenants],
    );
    result.rows.forEach((r) => ids.add(r.user_id));
  }

  if (user.role === "master_broker") {
    const legacy = await pool.query(
      `SELECT id FROM public.users WHERE master_broker_id = $1`,
      [user.id],
    );
    legacy.rows.forEach((r) => ids.add(r.id));
  }

  return [...ids];
}

function maskIp(ip: string | null): string | null {
  if (!ip) return null;
  if (ip.includes(".")) {
    const parts = ip.split(".");
    if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.*`;
  }
  if (ip.includes(":")) {
    const parts = ip.split(":").filter(Boolean);
    return parts.slice(0, 3).join(":") + ":*";
  }
  return "*";
}

function requireActivityViewer(req: any, res: any, next: any) {
  const user = dbUser(req);
  if (!canViewActivity(user)) {
    return res.status(403).json({ message: "No tienes permiso para consultar actividad de usuarios." });
  }
  next();
}

async function assertTenantVisible(user: any, tenantId: string | null): Promise<boolean> {
  if (!tenantId) return true;
  const visible = await visibleTenantIdsFor(user);
  return visible === null || visible.includes(tenantId);
}

async function assertUserVisible(user: any, targetUserId: string): Promise<boolean> {
  const visible = await visibleUserIdsFor(user);
  return visible === null || visible.includes(targetUserId);
}

export function registerActivityRoutes(app: Express): void {
  app.post("/api/activity/heartbeat", isAuthenticated, async (req: any, res) => {
    try {
      const user = dbUser(req);
      const moduleId = typeof req.body?.moduleId === "string" ? req.body.moduleId : null;
      const active = req.body?.active !== false;
      const requestedTenantId = typeof req.body?.tenantId === "string" ? req.body.tenantId : null;

      const result = await recordHeartbeat({
        userId: user.id,
        role: user.role,
        tenantId: requestedTenantId,
        moduleId,
        active,
        ipAddress: getRequestIp(req),
        userAgent: getRequestUserAgent(req),
      });

      res.json({ ok: true, ...result });
    } catch (error) {
      console.error("[Activity] Heartbeat error:", error);
      res.status(500).json({ message: "No se pudo registrar actividad" });
    }
  });

  app.get("/api/user-activity/overview", isAuthenticated, requireActivityViewer, async (req: any, res) => {
    try {
      await closeStaleActivitySessions();
      const user = dbUser(req);
      const days = clampDays(req.query.days);
      const requestedTenantId = typeof req.query.tenantId === "string" ? req.query.tenantId : null;

      if (!(await assertTenantVisible(user, requestedTenantId))) {
        return res.status(403).json({ message: "Organización fuera de tu alcance." });
      }

      const visibleUserIds = await visibleUserIdsFor(user);
      const users = await pool.query(
        `SELECT
           COUNT(*)::int AS total_users,
           COUNT(*) FILTER (
             WHERE u.last_activity_at >= NOW() - ($2::text || ' days')::interval
           )::int AS active_users,
           COUNT(*) FILTER (WHERE u.first_login_at IS NULL)::int AS never_used,
           COUNT(*) FILTER (
             WHERE u.first_login_at IS NOT NULL
               AND (u.last_activity_at IS NULL OR u.last_activity_at < NOW() - INTERVAL '30 days')
           )::int AS inactive_30d
         FROM public.users u
         WHERE ($1::varchar[] IS NULL OR u.id = ANY($1::varchar[]))
           AND (
             $3::varchar IS NULL OR EXISTS (
               SELECT 1 FROM public.tenant_members tm
               WHERE tm.user_id = u.id AND tm.tenant_id = $3 AND tm.is_active = TRUE
             )
           )`,
        [visibleUserIds, days, requestedTenantId],
      );

      const sessions = await pool.query(
        `SELECT
           COUNT(*)::int AS sessions,
           COALESCE(SUM(active_seconds),0)::bigint AS active_seconds
         FROM public.user_activity_sessions s
         WHERE s.started_at >= NOW() - ($2::text || ' days')::interval
           AND ($1::varchar[] IS NULL OR s.user_id = ANY($1::varchar[]))
           AND ($3::varchar IS NULL OR s.tenant_id = $3)`,
        [visibleUserIds, days, requestedTenantId],
      );

      res.json({
        periodDays: days,
        totalUsers: users.rows[0]?.total_users || 0,
        activeUsers: users.rows[0]?.active_users || 0,
        neverUsed: users.rows[0]?.never_used || 0,
        inactive30d: users.rows[0]?.inactive_30d || 0,
        sessions: sessions.rows[0]?.sessions || 0,
        activeSeconds: Number(sessions.rows[0]?.active_seconds || 0),
      });
    } catch (error) {
      console.error("[Activity] Overview error:", error);
      res.status(500).json({ message: "No se pudo consultar el resumen de actividad" });
    }
  });

  app.get("/api/user-activity/users", isAuthenticated, requireActivityViewer, async (req: any, res) => {
    try {
      const user = dbUser(req);
      const days = clampDays(req.query.days);
      const limit = clampLimit(req.query.limit, 100);
      const search = typeof req.query.search === "string" ? req.query.search.trim().toLowerCase() : "";
      const requestedTenantId = typeof req.query.tenantId === "string" ? req.query.tenantId : null;

      if (!(await assertTenantVisible(user, requestedTenantId))) {
        return res.status(403).json({ message: "Organización fuera de tu alcance." });
      }

      const visibleUserIds = await visibleUserIdsFor(user);
      const result = await pool.query(
        `SELECT
           u.id, u.email, u.first_name, u.last_name, u.role, u.custom_role_title,
           u.status, u.is_active, u.first_login_at, u.last_login_at, u.last_activity_at,
           tenant_info.tenant_id, tenant_info.tenant_name,
           COALESCE(activity.sessions_30d, 0)::int AS sessions,
           COALESCE(activity.active_seconds_30d, 0)::bigint AS active_seconds,
           COALESCE(activity.active_days_30d, 0)::int AS active_days,
           last_event.event_type AS last_event_type,
           last_event.occurred_at AS last_event_at
         FROM public.users u
         LEFT JOIN LATERAL (
           SELECT tm.tenant_id, t.name AS tenant_name
           FROM public.tenant_members tm
           JOIN public.tenants t ON t.id = tm.tenant_id
           WHERE tm.user_id = u.id AND tm.is_active = TRUE
             AND ($4::varchar IS NULL OR tm.tenant_id = $4)
           ORDER BY CASE tm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, tm.joined_at ASC
           LIMIT 1
         ) tenant_info ON TRUE
         LEFT JOIN LATERAL (
           SELECT
             COUNT(*)::int AS sessions_30d,
             COALESCE(SUM(s.active_seconds),0)::bigint AS active_seconds_30d,
             COUNT(DISTINCT DATE(s.last_active_at))::int AS active_days_30d
           FROM public.user_activity_sessions s
           WHERE s.user_id = u.id
             AND s.started_at >= NOW() - ($2::text || ' days')::interval
             AND ($4::varchar IS NULL OR s.tenant_id = $4)
         ) activity ON TRUE
         LEFT JOIN LATERAL (
           SELECT e.event_type, e.occurred_at
           FROM public.user_activity_events e
           WHERE e.user_id = u.id
             AND ($4::varchar IS NULL OR e.tenant_id = $4)
           ORDER BY e.occurred_at DESC
           LIMIT 1
         ) last_event ON TRUE
         WHERE ($1::varchar[] IS NULL OR u.id = ANY($1::varchar[]))
           AND (
             $4::varchar IS NULL OR EXISTS (
               SELECT 1 FROM public.tenant_members tm2
               WHERE tm2.user_id = u.id AND tm2.tenant_id = $4 AND tm2.is_active = TRUE
             )
           )
           AND (
             $3 = '' OR LOWER(COALESCE(u.email,'') || ' ' || COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')) LIKE '%' || $3 || '%'
           )
         ORDER BY u.last_activity_at DESC NULLS LAST, u.created_at DESC
         LIMIT $5`,
        [visibleUserIds, days, search, requestedTenantId, limit],
      );

      res.json(result.rows.map((row) => ({
        ...row,
        active_seconds: Number(row.active_seconds || 0),
      })));
    } catch (error) {
      console.error("[Activity] Users error:", error);
      res.status(500).json({ message: "No se pudo consultar la actividad de usuarios" });
    }
  });

  app.get("/api/user-activity/organizations", isAuthenticated, requireActivityViewer, async (req: any, res) => {
    try {
      const user = dbUser(req);
      const days = clampDays(req.query.days);
      const tenantIds = await visibleTenantIdsFor(user);
      const result = await pool.query(
        `SELECT
           t.id, t.name, t.type,
           COUNT(DISTINCT tm.user_id) FILTER (WHERE tm.is_active = TRUE)::int AS members,
           COUNT(DISTINCT tm.user_id) FILTER (
             WHERE tm.is_active = TRUE
               AND u.last_activity_at >= NOW() - ($2::text || ' days')::interval
           )::int AS active_users,
           MAX(u.last_activity_at) AS last_activity_at,
           COALESCE(SUM(session_metrics.active_seconds),0)::bigint AS active_seconds
         FROM public.tenants t
         LEFT JOIN public.tenant_members tm ON tm.tenant_id = t.id
         LEFT JOIN public.users u ON u.id = tm.user_id
         LEFT JOIN LATERAL (
           SELECT COALESCE(SUM(s.active_seconds),0)::bigint AS active_seconds
           FROM public.user_activity_sessions s
           WHERE s.user_id = tm.user_id
             AND s.tenant_id = t.id
             AND s.started_at >= NOW() - ($2::text || ' days')::interval
         ) session_metrics ON TRUE
         WHERE ($1::varchar[] IS NULL OR t.id = ANY($1::varchar[]))
         GROUP BY t.id, t.name, t.type
         ORDER BY active_users DESC, t.name ASC`,
        [tenantIds, days],
      );

      res.json(result.rows.map((row) => ({
        ...row,
        active_seconds: Number(row.active_seconds || 0),
      })));
    } catch (error) {
      console.error("[Activity] Organizations error:", error);
      res.status(500).json({ message: "No se pudo consultar la actividad por organización" });
    }
  });

  app.get("/api/user-activity/users/:userId", isAuthenticated, requireActivityViewer, async (req: any, res) => {
    try {
      const viewer = dbUser(req);
      const targetId = req.params.userId;
      const days = clampDays(req.query.days);

      if (!(await assertUserVisible(viewer, targetId))) {
        return res.status(403).json({ message: "Usuario fuera de tu alcance." });
      }

      const userResult = await pool.query(
        `SELECT id, email, first_name, last_name, role, custom_role_title, status, is_active,
                first_login_at, last_login_at, last_activity_at, created_at
         FROM public.users WHERE id = $1 LIMIT 1`,
        [targetId],
      );
      if (!userResult.rowCount) return res.status(404).json({ message: "Usuario no encontrado" });

      const sessions = await pool.query(
        `SELECT id, tenant_id, started_at, last_active_at, ended_at, end_reason,
                active_seconds, ip_address, user_agent
         FROM public.user_activity_sessions
         WHERE user_id = $1
         ORDER BY started_at DESC
         LIMIT 25`,
        [targetId],
      );

      const modules = await pool.query(
        `SELECT module_id,
                SUM(active_seconds)::bigint AS active_seconds,
                SUM(enter_count)::bigint AS enter_count,
                MAX(last_seen_at) AS last_seen_at
         FROM public.user_activity_session_modules
         WHERE user_id = $1
           AND last_seen_at >= NOW() - ($2::text || ' days')::interval
         GROUP BY module_id
         ORDER BY active_seconds DESC, last_seen_at DESC`,
        [targetId, days],
      );

      const viewerIsPlatformAdmin = viewer.role === "super_admin" || viewer.role === "admin";
      res.json({
        user: userResult.rows[0],
        sessions: sessions.rows.map((row) => ({
          ...row,
          active_seconds: Number(row.active_seconds || 0),
          ip_address: viewerIsPlatformAdmin ? row.ip_address : maskIp(row.ip_address),
        })),
        modules: modules.rows.map((row) => ({
          ...row,
          active_seconds: Number(row.active_seconds || 0),
          enter_count: Number(row.enter_count || 0),
        })),
      });
    } catch (error) {
      console.error("[Activity] User detail error:", error);
      res.status(500).json({ message: "No se pudo consultar el detalle de actividad" });
    }
  });

  app.get("/api/user-activity/users/:userId/events", isAuthenticated, requireActivityViewer, async (req: any, res) => {
    try {
      const viewer = dbUser(req);
      const targetId = req.params.userId;
      const limit = clampLimit(req.query.limit, 100);
      const category = typeof req.query.category === "string" ? req.query.category : null;

      if (!(await assertUserVisible(viewer, targetId))) {
        return res.status(403).json({ message: "Usuario fuera de tu alcance." });
      }

      const result = await pool.query(
        `SELECT id, tenant_id, session_id, category, event_type, module_id,
                entity_type, entity_id, outcome, actor_role, ip_address, user_agent,
                metadata, occurred_at
         FROM public.user_activity_events
         WHERE user_id = $1
           AND ($2::varchar IS NULL OR category = $2)
         ORDER BY occurred_at DESC
         LIMIT $3`,
        [targetId, category, limit],
      );

      const viewerIsPlatformAdmin = viewer.role === "super_admin" || viewer.role === "admin";
      res.json(result.rows.map((row) => ({
        ...row,
        ip_address: viewerIsPlatformAdmin ? row.ip_address : maskIp(row.ip_address),
      })));
    } catch (error) {
      console.error("[Activity] Events error:", error);
      res.status(500).json({ message: "No se pudo consultar la bitácora del usuario" });
    }
  });
}
