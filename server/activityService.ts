import type { RequestHandler } from "express";
import { pool } from "./db";

const SESSION_IDLE_MINUTES = 30;
const ACTIVE_IDLE_SECONDS = 5 * 60;
const MAX_HEARTBEAT_CREDIT_SECONDS = 60;

type EventInput = {
  userId?: string | null;
  tenantId?: string | null;
  sessionId?: string | null;
  category: "security" | "product" | "governance";
  eventType: string;
  moduleId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  outcome?: "success" | "failure";
  actorRole?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
};

function cleanText(value: unknown, max = 255): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function getReqUserId(req: any): string | null {
  return req?.dbUser?.id || req?.user?.claims?.sub || req?.user?.id || null;
}

function getReqUserRole(req: any): string | null {
  return req?.dbUser?.role || req?.user?.role || null;
}

export function getRequestIp(req: any): string | null {
  const ip = req?.ip || req?.socket?.remoteAddress || null;
  return cleanText(ip, 64);
}

export function getRequestUserAgent(req: any): string | null {
  return cleanText(req?.headers?.["user-agent"], 1000);
}

function safeChangedFields(body: unknown): string[] {
  if (!body || typeof body !== "object" || Array.isArray(body)) return [];
  const blocked = /password|token|secret|clabe|account|document|file|content/i;
  return Object.keys(body as Record<string, unknown>)
    .filter((key) => !blocked.test(key))
    .slice(0, 30);
}

async function findUserByEmail(email: unknown): Promise<{ id: string; role: string | null } | null> {
  const normalized = cleanText(email, 320)?.toLowerCase();
  if (!normalized) return null;
  const result = await pool.query(
    `SELECT id, role FROM public.users WHERE LOWER(email) = $1 LIMIT 1`,
    [normalized],
  );
  return result.rows[0] || null;
}

async function findUserByResetToken(token: unknown): Promise<{ id: string; role: string | null } | null> {
  const safeToken = cleanText(token, 512);
  if (!safeToken) return null;
  const result = await pool.query(
    `SELECT id, role FROM public.users WHERE reset_token = $1 LIMIT 1`,
    [safeToken],
  );
  return result.rows[0] || null;
}

export async function resolveActivityTenant(
  userId: string,
  requestedTenantId?: string | null,
  role?: string | null,
): Promise<string | null> {
  if (requestedTenantId) {
    if (role === "super_admin" || role === "admin") {
      const tenant = await pool.query(`SELECT id FROM public.tenants WHERE id = $1 LIMIT 1`, [requestedTenantId]);
      if (tenant.rowCount) return requestedTenantId;
    } else {
      const membership = await pool.query(
        `SELECT tenant_id FROM public.tenant_members
         WHERE user_id = $1 AND tenant_id = $2 AND is_active = TRUE
         LIMIT 1`,
        [userId, requestedTenantId],
      );
      if (membership.rowCount) return requestedTenantId;
    }
  }

  const membership = await pool.query(
    `SELECT tm.tenant_id
     FROM public.tenant_members tm
     JOIN public.tenants t ON t.id = tm.tenant_id
     WHERE tm.user_id = $1 AND tm.is_active = TRUE AND COALESCE(t.is_active, TRUE) = TRUE
     ORDER BY
       CASE tm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
       tm.joined_at ASC
     LIMIT 1`,
    [userId],
  );
  return membership.rows[0]?.tenant_id || null;
}

export async function recordUserActivityEvent(input: EventInput): Promise<void> {
  const metadata = input.metadata || {};
  let sessionId = input.sessionId || null;
  let tenantId = input.tenantId || null;

  // Attach significant actions to the active usage session whenever possible.
  if (!sessionId && input.userId) {
    const activeSession = await pool.query(
      `SELECT id, tenant_id
       FROM public.user_activity_sessions
       WHERE user_id = $1
         AND ended_at IS NULL
         AND last_active_at >= NOW() - INTERVAL '30 minutes'
       ORDER BY started_at DESC
       LIMIT 1`,
      [input.userId],
    );
    if (activeSession.rowCount) {
      sessionId = activeSession.rows[0].id;
      tenantId = tenantId || activeSession.rows[0].tenant_id || null;
    }
  }

  await pool.query(
    `INSERT INTO public.user_activity_events
      (user_id, tenant_id, session_id, category, event_type, module_id,
       entity_type, entity_id, outcome, actor_role, ip_address, user_agent, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)`,
    [
      input.userId || null,
      tenantId,
      sessionId,
      input.category,
      input.eventType,
      input.moduleId || null,
      input.entityType || null,
      input.entityId || null,
      input.outcome || "success",
      input.actorRole || null,
      input.ipAddress || null,
      input.userAgent || null,
      JSON.stringify(metadata),
    ],
  );

  if (
    input.userId &&
    (input.outcome || "success") === "success" &&
    (input.category === "product" || input.category === "governance")
  ) {
    await pool.query(
      `UPDATE public.users SET last_activity_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [input.userId],
    );
  }
}

export async function closeStaleActivitySessions(): Promise<void> {
  await pool.query(
    `UPDATE public.user_activity_sessions
     SET ended_at = last_active_at,
         end_reason = 'timeout',
         updated_at = NOW()
     WHERE ended_at IS NULL
       AND last_active_at < NOW() - ($1::text || ' minutes')::interval`,
    [SESSION_IDLE_MINUTES],
  );
}

export async function endLatestActivitySession(userId: string, reason = "logout"): Promise<void> {
  await pool.query(
    `UPDATE public.user_activity_sessions
     SET ended_at = NOW(),
         end_reason = $2,
         updated_at = NOW()
     WHERE id = (
       SELECT id FROM public.user_activity_sessions
       WHERE user_id = $1 AND ended_at IS NULL
       ORDER BY started_at DESC
       LIMIT 1
     )`,
    [userId, reason],
  );
}

export async function recordHeartbeat(params: {
  userId: string;
  role?: string | null;
  tenantId?: string | null;
  moduleId?: string | null;
  active: boolean;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<{ sessionId: string; tenantId: string | null; activeSeconds: number }> {
  await closeStaleActivitySessions();

  const now = new Date();
  const tenantId = await resolveActivityTenant(params.userId, params.tenantId, params.role);
  const safeModule = cleanText(params.moduleId, 64)?.replace(/[^a-zA-Z0-9_\-]/g, "") || null;

  const existing = await pool.query(
    `SELECT *
     FROM public.user_activity_sessions
     WHERE user_id = $1 AND ended_at IS NULL
     ORDER BY started_at DESC
     LIMIT 1`,
    [params.userId],
  );

  let session = existing.rows[0] || null;
  const tenantChanged = session && (session.tenant_id || null) !== (tenantId || null);

  if (tenantChanged) {
    await pool.query(
      `UPDATE public.user_activity_sessions
       SET ended_at = last_active_at, end_reason = 'tenant_switched', updated_at = NOW()
       WHERE id = $1`,
      [session.id],
    );
    session = null;
  }

  if (!session) {
    const created = await pool.query(
      `INSERT INTO public.user_activity_sessions
        (user_id, tenant_id, started_at, last_active_at, last_heartbeat_at,
         active_seconds, last_module_id, ip_address, user_agent)
       VALUES ($1,$2,NOW(),NOW(),NOW(),0,$3,$4,$5)
       RETURNING *`,
      [params.userId, tenantId, safeModule, params.ipAddress || null, params.userAgent || null],
    );
    session = created.rows[0];
  }

  const lastHeartbeat = new Date(session.last_heartbeat_at || now);
  const elapsedSeconds = Math.max(0, Math.floor((now.getTime() - lastHeartbeat.getTime()) / 1000));
  const creditSeconds =
    params.active && elapsedSeconds <= ACTIVE_IDLE_SECONDS
      ? Math.min(MAX_HEARTBEAT_CREDIT_SECONDS, elapsedSeconds)
      : 0;
  const previousModule = cleanText(session.last_module_id, 64);
  const moduleChanged = Boolean(safeModule && safeModule !== previousModule);
  // Elapsed time belongs to the module that was active since the previous heartbeat.
  const creditedModule = previousModule || safeModule;

  const updated = await pool.query(
    `UPDATE public.user_activity_sessions
     SET last_heartbeat_at = NOW(),
         last_active_at = CASE WHEN $2 THEN NOW() ELSE last_active_at END,
         active_seconds = active_seconds + $3,
         last_module_id = COALESCE($4, last_module_id),
         ip_address = COALESCE(ip_address, $5),
         user_agent = COALESCE(user_agent, $6),
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, active_seconds`,
    [
      session.id,
      params.active,
      creditSeconds,
      safeModule,
      params.ipAddress || null,
      params.userAgent || null,
    ],
  );

  if (params.active) {
    await pool.query(
      `UPDATE public.users SET last_activity_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [params.userId],
    );
  }

  if (params.active && creditedModule) {
    await pool.query(
      `INSERT INTO public.user_activity_session_modules
        (session_id, user_id, tenant_id, module_id, first_seen_at, last_seen_at, active_seconds, enter_count)
       VALUES ($1,$2,$3,$4,NOW(),NOW(),$5,1)
       ON CONFLICT (session_id, module_id)
       DO UPDATE SET
         last_seen_at = NOW(),
         active_seconds = public.user_activity_session_modules.active_seconds + EXCLUDED.active_seconds,
         enter_count = public.user_activity_session_modules.enter_count + $6`,
      [
        session.id,
        params.userId,
        tenantId,
        creditedModule,
        creditSeconds,
        !moduleChanged && safeModule === creditedModule ? 0 : 0,
      ],
    );
  }

  if (params.active && safeModule && moduleChanged) {
    // Register the module transition now; its elapsed time starts on the next heartbeat.
    await pool.query(
      `INSERT INTO public.user_activity_session_modules
        (session_id, user_id, tenant_id, module_id, first_seen_at, last_seen_at, active_seconds, enter_count)
       VALUES ($1,$2,$3,$4,NOW(),NOW(),0,1)
       ON CONFLICT (session_id, module_id)
       DO UPDATE SET
         last_seen_at = NOW(),
         enter_count = public.user_activity_session_modules.enter_count + 1`,
      [session.id, params.userId, tenantId, safeModule],
    );
  }

  return {
    sessionId: session.id,
    tenantId,
    activeSeconds: Number(updated.rows[0]?.active_seconds || 0),
  };
}

type MappedRequestEvent = {
  category: "security" | "product" | "governance";
  eventType: string;
  moduleId?: string;
  entityType?: string;
  entityId?: string | null;
};

function mapRequestToEvent(method: string, path: string): MappedRequestEvent | null {
  const m = method.toUpperCase();
  let match: RegExpMatchArray | null;

  if (m === "POST" && path === "/api/clients")
    return { category: "product", eventType: "client.created", moduleId: "clientes", entityType: "client" };
  if ((m === "PUT" || m === "PATCH") && (match = path.match(/^\/api\/clients\/([^/]+)$/)))
    return { category: "product", eventType: "client.updated", moduleId: "clientes", entityType: "client", entityId: match[1] };

  if (m === "POST" && path === "/api/credits")
    return { category: "product", eventType: "credit.created", moduleId: "creditos", entityType: "credit" };
  if ((m === "PUT" || m === "PATCH") && (match = path.match(/^\/api\/credits\/([^/]+)$/)))
    return { category: "product", eventType: "credit.updated", moduleId: "creditos", entityType: "credit", entityId: match[1] };
  if (m === "POST" && /\/submit|submission|proposals?/.test(path))
    return { category: "product", eventType: "submission.sent", moduleId: "creditos", entityType: "submission" };

  if (m === "POST" && /\/documents?(\/upload)?$/.test(path))
    return { category: "product", eventType: "document.uploaded", moduleId: "documentos", entityType: "document" };
  if (m === "GET" && (match = path.match(/^\/api\/documents\/([^/]+)\/(download|file)$/)))
    return { category: "product", eventType: "document.downloaded", moduleId: "documentos", entityType: "document", entityId: match[1] };

  if ((match = path.match(/^\/api\/commissions\/([^/]+)\/(approve|cancel|disperse|mark-paid)/)) && ["POST","PATCH","PUT"].includes(m))
    return { category: "governance", eventType: `commission.${match[2]}`, moduleId: "comisiones", entityType: "commission", entityId: match[1] };

  if ((match = path.match(/^\/api\/admin\/users\/([^/]+)\/operational-status$/)) && ["PATCH","PUT"].includes(m))
    return { category: "security", eventType: "user.status_changed", moduleId: "usuarios", entityType: "user", entityId: match[1] };

  if ((match = path.match(/^\/api\/users\/([^/]+)$/)) && ["PATCH","PUT"].includes(m))
    return { category: "security", eventType: "user.updated", moduleId: "usuarios", entityType: "user", entityId: match[1] };

  if (/\/members(\/[^/]+)?$/.test(path) && ["POST","PATCH","PUT","DELETE"].includes(m))
    return { category: "governance", eventType: "user.membership_changed", moduleId: "usuarios", entityType: "tenant_member" };

  if (/commercial/.test(path) && ["POST","PATCH","PUT"].includes(m))
    return { category: "governance", eventType: "commercial.action", moduleId: "aprobaciones", entityType: "commercial" };

  return null;
}

/**
 * Registered after passport/session middleware and before application routes.
 * It observes only significant auth/security/product mutations; it is NOT a clickstream.
 */
export const activityObserverMiddleware: RequestHandler = (req: any, res: any, next: any) => {
  const requestPath = req.path;
  const requestMethod = req.method;
  const beforeUserId = getReqUserId(req);
  const beforeRole = getReqUserRole(req);
  const ipAddress = getRequestIp(req);
  const userAgent = getRequestUserAgent(req);
  const email = req.body?.email;
  // Start resolving the reset-token owner before the route clears the token.
  // Only the user id/role is retained; the token is never written to activity logs.
  const resetUserLookup =
    requestPath === "/api/auth/reset-password" && requestMethod === "POST"
      ? findUserByResetToken(req.body?.token).catch(() => null)
      : Promise.resolve(null);

  res.on("finish", () => {
    void (async () => {
      try {
        const success = res.statusCode >= 200 && res.statusCode < 400;

        if (requestPath === "/api/auth/login" && requestMethod === "POST") {
          const dbUser = await findUserByEmail(email);
          if (success && dbUser) {
            const tenantId = await resolveActivityTenant(dbUser.id, null, dbUser.role);
            await pool.query(
              `UPDATE public.users
               SET first_login_at = COALESCE(first_login_at, NOW()),
                   last_login_at = NOW(),
                   last_activity_at = NOW(),
                   updated_at = NOW()
               WHERE id = $1`,
              [dbUser.id],
            );
            await recordUserActivityEvent({
              userId: dbUser.id,
              tenantId,
              category: "security",
              eventType: "auth.login_succeeded",
              actorRole: dbUser.role,
              ipAddress,
              userAgent,
            });
          } else {
            await recordUserActivityEvent({
              userId: dbUser?.id || null,
              category: "security",
              eventType: "auth.login_failed",
              outcome: "failure",
              actorRole: dbUser?.role || null,
              ipAddress,
              userAgent,
              metadata: { knownAccount: Boolean(dbUser) },
            });
          }
          return;
        }

        if (requestPath === "/api/logout") {
          if (beforeUserId) {
            const tenantId = await resolveActivityTenant(beforeUserId, null, beforeRole);
            await endLatestActivitySession(beforeUserId, "logout");
            await recordUserActivityEvent({
              userId: beforeUserId,
              tenantId,
              category: "security",
              eventType: "auth.logout",
              actorRole: beforeRole,
              ipAddress,
              userAgent,
            });
          }
          return;
        }

        if (requestPath === "/api/auth/forgot-password" && requestMethod === "POST" && success) {
          const dbUser = await findUserByEmail(email);
          if (dbUser) {
            const tenantId = await resolveActivityTenant(dbUser.id, null, dbUser.role);
            await recordUserActivityEvent({
              userId: dbUser.id,
              tenantId,
              category: "security",
              eventType: "auth.password_reset_requested",
              actorRole: dbUser.role,
              ipAddress,
              userAgent,
            });
          }
          return;
        }

        if (requestPath === "/api/auth/reset-password" && requestMethod === "POST" && success) {
          const resetUser = await resetUserLookup;
          if (resetUser) {
            const tenantId = await resolveActivityTenant(resetUser.id, null, resetUser.role);
            await recordUserActivityEvent({
              userId: resetUser.id,
              tenantId,
              category: "security",
              eventType: "auth.password_changed",
              actorRole: resetUser.role,
              ipAddress,
              userAgent,
            });
          }
          return;
        }

        if (!success) return;

        const userId = getReqUserId(req) || beforeUserId;
        const role = getReqUserRole(req) || beforeRole;
        if (!userId) return;

        const mapped = mapRequestToEvent(requestMethod, requestPath);
        if (!mapped) return;

        const tenantId = await resolveActivityTenant(userId, req.body?.tenantId || null, role);
        await recordUserActivityEvent({
          userId,
          tenantId,
          category: mapped.category,
          eventType: mapped.eventType,
          moduleId: mapped.moduleId || null,
          entityType: mapped.entityType || null,
          entityId: mapped.entityId || null,
          actorRole: role,
          ipAddress: mapped.category === "security" ? ipAddress : null,
          userAgent: mapped.category === "security" ? userAgent : null,
          metadata: {
            changedFields: ["POST", "PUT", "PATCH"].includes(requestMethod.toUpperCase())
              ? safeChangedFields(req.body)
              : [],
          },
        });
      } catch (error) {
        // Activity telemetry must never break a successful business/auth request.
        console.error("[Activity] Observer error:", error);
      }
    })();
  });

  next();
};
