import type { Express, RequestHandler } from "express";
import { storage } from "./storage";
import { isAuthenticated } from "./auth";

/** A separate entity type keeps operational activity distinct from governance evidence.
 * Only allowlisted metadata is persisted: never request/response bodies, URLs with
 * query parameters, cookies, passwords, tokens, documents or banking details. */
export async function recordAdministrativeActivity(actor: any, action: string, route: string, method: string, status: number, resourceId?: string) {
  if (!actor?.id) return;
  try {
    await storage.createCommercialAuditLog({
      entityType: "administrative_activity", entityId: actor.id, performedBy: actor.id,
      action, newState: status >= 400 ? "failed" : "success",
      metadata: {
        actorName: [actor.firstName, actor.lastName].filter(Boolean).join(" "),
        actorEmail: actor.email || "", actorRole: actor.role,
        route, method, statusCode: status,
        ...(resourceId ? {resourceId} : {}),
      },
    });
  } catch (error) {
    // Do not report a committed business operation as failed or trigger a duplicate retry.
    console.error("[ADMIN_AUDIT_WRITE_FAILED]", { action, route, actorId: actor.id });
  }
}

export const administrativeActivityMiddleware: RequestHandler = (req: any, res, next) => {
  res.once("finish", () => {
    // req.route.path contains the route template, NOT user-supplied tokens or IDs.
    const route = req.route?.path;
    if (typeof route !== "string" || !route.startsWith("/api/") || (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method) && req.administrativeAction !== "session_access")) return;
    if (/\/(preview|validate|calculate|search)$/.test(route)) return;
    const actor = req.administrativeActor || req.dbUser;
    if (!actor?.id) return;
    const action = req.administrativeAction ||
      (res.statusCode >= 400 ? "operation_failed" : req.method === "DELETE" ? "operation_deleted" : req.method === "POST" ? "operation_created" : "operation_updated");
    const resourceId = typeof req.params?.id === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(req.params.id) ? req.params.id : undefined;
    void recordAdministrativeActivity(actor, action, route, req.method, res.statusCode, resourceId);
  });
  next();
};

export function registerAdministrativeAudit(app: Express) {
  app.use(administrativeActivityMiddleware);
  app.get("/api/admin/activity-audit", isAuthenticated, async (req: any, res) => {
    try {
      const actor = await storage.getUser(req.user?.claims?.sub || req.user?.id);
      if (actor?.role !== "super_admin") return res.status(403).json({message: "Sólo Super Admin puede consultar la actividad administrativa."});
      const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
      const offset = Number(req.query.offset) || 0;
      if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit)) return res.status(400).json({message: "Paginación inválida"});
      const logs = await storage.getCommercialAuditLogs({entityType: "administrative_activity", limit: limit + 1, offset});
      return res.json({logs: logs.slice(0, limit), hasMore: logs.length > limit, nextOffset: offset + limit});
    } catch (error) { return res.status(500).json({message: "No se pudo consultar la actividad administrativa."}); }
  });
}
