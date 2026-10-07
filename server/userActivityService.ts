import type { Request, RequestHandler } from "express";
import { pool } from "./db";
import { storage } from "./storage";

const ACTIVE_DELTA_CAP_SECONDS = 75;
const ACTIVE_GAP_RESET_SECONDS = 120;
const STALE_SESSION_MINUTES = 15;

function getUserId(req: any): string | null {
  return req.user?.claims?.sub || req.user?.id || req.dbUser?.id || null;
}

function getTenantId(req: any): string | null {
  return req.tenantContext?.tenant?.id || null;
}

function getIpAddress(req: Request): string | null {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim().slice(0, 120);
  }
  return (req.ip || req.socket?.remoteAddress || "").slice(0, 120) || null;
}

function getUserAgent(req: Request): string | null {
  const ua = req.headers["user-agent"];
  return typeof ua === "string" ? ua.slice(0, 1000) : null;
}

function sanitizeMetadata(metadata: Record<string, unknown> = {}) {
  const blocked = new Set(["password", "token", "resetToken", "clabe", "accountNumber", "authorization"]);
  return Object.fromEntries(Object.entries(metadata).filter(([key]) => !blocked.has(key)));
}

export async function recordActivityEvent(req: any, input: {
  category: string;
  eventType: string;
  module?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  success?: boolean;
  userId?: string | null;
  tenantId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    const userId = input.userId ?? getUserId(req);
    const tenantId = input.tenantId ?? getTenantId(req);
    const sessionId = req.session?.activitySessionId || null;

    await pool.query(
      `INSERT INTO public.user_activity_events
        (session_id, user_id, tenant_id, category, event_type, module, entity_type, entity_id, success, ip_address, user_agent, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)`,
      [
        sessionId,
        userId,
        tenantId,
        input.category,
        input.eventType,
        input.module || null,
        input.entityType || null,
        input.entityId || null,
        input.success !== false,
        getIpAddress(req),
        getUserAgent(req),
        JSON.stringify(sanitizeMetadata(input.metadata || {})),
      ],
    );
  } catch (error) {
    console.error("[Activity] Could not record event:", error);
  }
}

export async function startUserActivitySession(req: any, userId: string) {
  try {
    const tenantId = getTenantId(req);
    const result = await pool.query(
      `INSERT INTO public.user_activity_sessions
        (user_id, tenant_id, ip_address, user_agent)
       VALUES ($1,$2,$3,$4)
       RETURNING id`,
      [userId, tenantId, getIpAddress(req), getUserAgent(req)],
    );
    const activitySessionId = result.rows[0]?.id;
    if (activitySessionId && req.session) {
      req.session.activitySessionId = activitySessionId;
    }

    await pool.query(
      `UPDATE public.users
       SET first_login_at = COALESCE(first_login_at, NOW()),
           last_login_at = NOW(),
           last_seen_at = NOW()
       WHERE id = $1`,
      [userId],
    );

    await recordActivityEvent(req, {
      category: "auth",
      eventType: "auth.login",
      success: true,
      userId,
      tenantId,
    });
    return activitySessionId || null;
  } catch (error) {
    console.error("[Activity] Could not start usage session:", error);
    return null;
  }
}

export async function recordFailedLogin(req: any, attemptedEmail: string, reason: string, userId?: string | null) {
  await recordActivityEvent(req, {
    category: "security",
    eventType: "auth.login_failed",
    success: false,
    userId: userId || null,
    metadata: {
      attemptedEmail: attemptedEmail.trim().toLowerCase().slice(0, 320),
      reason,
    },
  });
}

export async function endUserActivitySession(req: any, reason = "logout") {
  try {
    const userId = getUserId(req);
    const sessionId = req.session?.activitySessionId;
    if (sessionId) {
      await pool.query(
        `UPDATE public.user_activity_sessions
         SET ended_at = COALESCE(ended_at, NOW()),
             last_activity_at = NOW(),
             end_reason = COALESCE(end_reason, $2)
         WHERE id = $1`,
        [sessionId, reason],
      );
    }
    if (userId) {
      await pool.query(`UPDATE public.users SET last_seen_at = NOW() WHERE id = $1`, [userId]);
      await recordActivityEvent(req, {
        category: "auth",
        eventType: "auth.logout",
        success: true,
        userId,
        metadata: { reason },
      });
    }
  } catch (error) {
    console.error("[Activity] Could not end usage session:", error);
  }
}

async function ensureActivitySession(req: any): Promise<string | null> {
  const userId = getUserId(req);
  if (!userId) return null;
  const current = req.session?.activitySessionId;
  if (current) {
    const found = await pool.query(
      `SELECT id FROM public.user_activity_sessions WHERE id = $1 AND user_id = $2 AND ended_at IS NULL LIMIT 1`,
      [current, userId],
    );
    if (found.rows[0]) return current;
  }
  return startUserActivitySession(req, userId);
}

export async function heartbeat(req: any, moduleName?: string | null) {
  const userId = getUserId(req);
  if (!userId) return null;

  try {
    const sessionId = await ensureActivitySession(req);
    if (!sessionId) return null;

    const current = await pool.query(
      `SELECT last_activity_at, modules_visited, entry_module
       FROM public.user_activity_sessions
       WHERE id = $1 AND user_id = $2 LIMIT 1`,
      [sessionId, userId],
    );
    if (!current.rows[0]) return null;

    const previous = new Date(current.rows[0].last_activity_at).getTime();
    const now = Date.now();
    const elapsed = Math.max(0, Math.floor((now - previous) / 1000));
    const activeDelta = elapsed > ACTIVE_GAP_RESET_SECONDS ? 0 : Math.min(elapsed, ACTIVE_DELTA_CAP_SECONDS);
    const modules = Array.isArray(current.rows[0].modules_visited) ? current.rows[0].modules_visited : [];
    const cleanModule = moduleName ? moduleName.slice(0, 80) : null;
    if (cleanModule && !modules.includes(cleanModule)) modules.push(cleanModule);
    const tenantId = getTenantId(req);

    await pool.query(
      `UPDATE public.user_activity_sessions
       SET last_activity_at = NOW(),
           active_seconds = active_seconds + $2,
           heartbeat_count = heartbeat_count + 1,
           tenant_id = COALESCE($3, tenant_id),
           entry_module = COALESCE(entry_module, $4),
           last_module = COALESCE($4, last_module),
           modules_visited = $5::jsonb
       WHERE id = $1`,
      [sessionId, activeDelta, tenantId, cleanModule, JSON.stringify(modules)],
    );
    await pool.query(`UPDATE public.users SET last_seen_at = NOW() WHERE id = $1`, [userId]);

    return { sessionId, activeDelta };
  } catch (error) {
    console.error("[Activity] Heartbeat failed:", error);
    return null;
  }
}

export async function finalizeStaleSessions() {
  try {
    await pool.query(
      `UPDATE public.user_activity_sessions
       SET ended_at = last_activity_at, end_reason = COALESCE(end_reason, 'timeout')
       WHERE ended_at IS NULL
         AND last_activity_at < NOW() - ($1::text || ' minutes')::interval`,
      [STALE_SESSION_MINUTES],
    );
  } catch (error) {
    console.error("[Activity] Could not finalize stale sessions:", error);
  }
}

type ActivityScope = {
  userIds: string[] | null;
  tenantIds: string[] | null;
};

async function resolveActivityScope(req: any, requestedTenantId?: string | null): Promise<ActivityScope> {
  const userId = getUserId(req);
  const user = req.dbUser || (userId ? await storage.getUser(userId) : null);
  if (!userId || !user) return { userIds: [], tenantIds: [] };

  const isPlatformAdmin = user.role === "super_admin" || user.role === "admin";
  if (isPlatformAdmin && !requestedTenantId) {
    return { userIds: null, tenantIds: null };
  }

  if (requestedTenantId) {
    if (!isPlatformAdmin) {
      const membership = await storage.getUserTenantMembership(userId, requestedTenantId);
      if (!membership || !membership.isActive || !["owner", "admin"].includes(membership.role)) {
        return { userIds: [], tenantIds: [] };
      }
    }
    const members = await storage.getTenantMembers(requestedTenantId);
    return {
      userIds: Array.from(new Set(members.filter((m: any) => m.isActive).map((m: any) => m.userId))),
      tenantIds: [requestedTenantId],
    };
  }

  const memberships = (await storage.getTenantMembersByUser(userId)).filter((m: any) => m.isActive);
  const manageable = memberships.filter((m: any) => ["owner", "admin"].includes(m.role));
  if (manageable.length === 0) {
    return {
      userIds: [userId],
      tenantIds: memberships.map((m: any) => m.tenantId),
    };
  }

  const userIds = new Set<string>([userId]);
  const tenantIds = manageable.map((m: any) => m.tenantId);
  for (const membership of manageable) {
    const members = await storage.getTenantMembers(membership.tenantId);
    for (const member of members) {
      if ((member as any).isActive) userIds.add((member as any).userId);
    }
  }
  return { userIds: [...userIds], tenantIds };
}

function inClause(values: string[], startParam: number) {
  return {
    sql: values.map((_, i) => `$${startParam + i}`).join(","),
    params: values,
  };
}

function scopedTenantPredicate(column: string, tenantIds: string[] | null, params: any[]) {
  if (!tenantIds) return "";
  if (tenantIds.length === 0) return " AND 1=0";
  const clause = inClause(tenantIds, params.length + 1);
  params.push(...clause.params);
  return ` AND ${column} IN (${clause.sql})`;
}

export async function getActivitySummary(req: any, days: number, tenantId?: string | null) {
  await finalizeStaleSessions();
  const scope = await resolveActivityScope(req, tenantId);
  if (scope.userIds && scope.userIds.length === 0) return [];

  const params: any[] = [days];
  const userConditions: string[] = [];
  if (scope.userIds) {
    const clause = inClause(scope.userIds, params.length + 1);
    userConditions.push(`u.id IN (${clause.sql})`);
    params.push(...clause.params);
  }

  const sessionTenantFilter = scopedTenantPredicate("tenant_id", scope.tenantIds, params);
  const eventTenantFilter = scopedTenantPredicate("tenant_id", scope.tenantIds, params);
  const where = userConditions.length ? `WHERE ${userConditions.join(" AND ")}` : "";

  const result = await pool.query(
    `WITH session_stats AS (
       SELECT user_id,
         COUNT(*) FILTER (WHERE started_at >= NOW() - ($1::text || ' days')::interval)::int AS sessions_period,
         COUNT(DISTINCT DATE(started_at)) FILTER (WHERE started_at >= NOW() - ($1::text || ' days')::interval)::int AS active_days_period,
         COALESCE(SUM(active_seconds) FILTER (WHERE started_at >= NOW() - ($1::text || ' days')::interval),0)::int AS active_seconds_period,
         MAX(last_activity_at) AS last_activity_at
       FROM public.user_activity_sessions
       WHERE 1=1${sessionTenantFilter}
       GROUP BY user_id
     ),
     event_stats AS (
       SELECT user_id, MAX(created_at) AS last_event_at
       FROM public.user_activity_events
       WHERE 1=1${eventTenantFilter}
       GROUP BY user_id
     )
     SELECT
       u.id, u.email, u.first_name, u.last_name, u.role, u.custom_role_title,
       u.first_login_at, u.last_login_at, u.last_seen_at, u.status, u.is_active,
       COALESCE(ss.sessions_period,0)::int AS sessions_period,
       COALESCE(ss.active_days_period,0)::int AS active_days_period,
       COALESCE(ss.active_seconds_period,0)::int AS active_seconds_period,
       ss.last_activity_at,
       es.last_event_at
     FROM public.users u
     LEFT JOIN session_stats ss ON ss.user_id = u.id
     LEFT JOIN event_stats es ON es.user_id = u.id
     ${where}
     ORDER BY u.last_seen_at DESC NULLS LAST, u.created_at DESC`,
    params,
  );
  return result.rows;
}

export async function getUserActivityDetail(req: any, targetUserId: string, days: number, tenantId?: string | null) {
  const scope = await resolveActivityScope(req, tenantId);
  if (scope.userIds && !scope.userIds.includes(targetUserId)) return null;

  await finalizeStaleSessions();

  const sessionParams: any[] = [targetUserId, days];
  const eventParams: any[] = [targetUserId, days];
  const sessionTenantFilter = scopedTenantPredicate("tenant_id", scope.tenantIds, sessionParams);
  const eventTenantFilter = scopedTenantPredicate("tenant_id", scope.tenantIds, eventParams);

  const [userResult, sessionsResult, eventsResult] = await Promise.all([
    pool.query(
      `SELECT id,email,first_name,last_name,role,custom_role_title,first_login_at,last_login_at,last_seen_at,status,is_active
       FROM public.users WHERE id=$1 LIMIT 1`,
      [targetUserId],
    ),
    pool.query(
      `SELECT id,tenant_id,started_at,last_activity_at,ended_at,active_seconds,end_reason,entry_module,last_module,modules_visited,ip_address,user_agent
       FROM public.user_activity_sessions
       WHERE user_id=$1
         AND started_at >= NOW() - ($2::text || ' days')::interval${sessionTenantFilter}
       ORDER BY started_at DESC LIMIT 100`,
      sessionParams,
    ),
    pool.query(
      `SELECT id,session_id,tenant_id,category,event_type,module,entity_type,entity_id,success,ip_address,user_agent,metadata,created_at
       FROM public.user_activity_events
       WHERE user_id=$1
         AND created_at >= NOW() - ($2::text || ' days')::interval${eventTenantFilter}
       ORDER BY created_at DESC LIMIT 250`,
      eventParams,
    ),
  ]);

  if (!userResult.rows[0]) return null;
  return { user: userResult.rows[0], sessions: sessionsResult.rows, events: eventsResult.rows };
}

type ClassifiedAction = {
  category: string; eventType: string; module: string; entityType?: string;
};

function classifyMutation(method: string, path: string): ClassifiedAction | null {
  const m = method.toUpperCase();
  if (m === "GET" && /^\/api\/documents\/[^/]+\/download$/.test(path)) {
    return { category: "business", eventType: "document.downloaded", module: "documentos", entityType: "document" };
  }
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(m)) return null;
  const rules: Array<[RegExp, ClassifiedAction]> = [
    [/^\/api\/clients(?:\/[^/]+)?$/, { category: "business", eventType: m === "POST" ? "client.created" : m === "DELETE" ? "client.deleted" : "client.updated", module: "clientes", entityType: "client" }],
    [/^\/api\/credits(?:\/[^/]+)?$/, { category: "business", eventType: m === "POST" ? "credit.created" : m === "DELETE" ? "credit.deleted" : "credit.updated", module: "creditos", entityType: "credit" }],
    [/\/documents(?:\/|$)/, { category: "business", eventType: m === "DELETE" ? "document.deleted" : m === "POST" ? "document.uploaded" : "document.updated", module: "documentos", entityType: "document" }],
    [/credit-submission|submission-target|submit/i, { category: "business", eventType: "submission.changed", module: "creditos", entityType: "submission" }],
    [/commission/i, { category: "business", eventType: "commission.changed", module: "comisiones", entityType: "commission" }],
    [/\/members(?:\/|$)/, { category: "governance", eventType: "user_membership.changed", module: "usuarios", entityType: "membership" }],
    [/status-requests|operational-status/i, { category: "governance", eventType: "user_status.changed", module: "usuarios", entityType: "user" }],
  ];
  for (const [pattern, action] of rules) if (pattern.test(path)) return action;
  return null;
}

export const activityMutationAuditMiddleware: RequestHandler = (req: any, res, next) => {
  const path = (req.path || req.originalUrl || "").split("?")[0];
  const action = classifyMutation(req.method, path);
  if (!action || path.startsWith("/api/activity/") || path.startsWith("/api/auth/")) return next();

  res.on("finish", () => {
    const userId = getUserId(req);
    if (!userId) return;
    const success = res.statusCode >= 200 && res.statusCode < 400;
    if (!success && res.statusCode < 500) return;
    const entityId = req.params?.id || req.params?.clientId || req.params?.creditId || null;
    void recordActivityEvent(req, {
      ...action,
      entityId,
      success,
      metadata: { method: req.method, path, statusCode: res.statusCode },
    });
  });
  next();
};
