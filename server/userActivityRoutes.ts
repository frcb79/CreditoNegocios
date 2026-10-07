import type { Express } from "express";
import { z } from "zod";
import { isAuthenticated } from "./auth";
import { heartbeat, getActivitySummary, getUserActivityDetail } from "./userActivityService";

const heartbeatSchema = z.object({
  module: z.string().max(80).optional().nullable(),
  active: z.boolean().default(true),
});

function clampDays(raw: unknown) {
  const parsed = Number(raw || 30);
  if (!Number.isFinite(parsed)) return 30;
  return Math.min(365, Math.max(1, Math.floor(parsed)));
}

export function registerUserActivityRoutes(app: Express) {
  app.post("/api/activity/heartbeat", isAuthenticated, async (req: any, res) => {
    const parsed = heartbeatSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ message: "Heartbeat inválido" });
    if (!parsed.data.active) return res.json({ ok: true, counted: false });
    const result = await heartbeat(req, parsed.data.module || null);
    return res.json({ ok: true, counted: Boolean(result), activeDelta: result?.activeDelta || 0 });
  });

  app.get("/api/activity/summary", isAuthenticated, async (req: any, res) => {
    try {
      const days = clampDays(req.query.days);
      const tenantId = typeof req.query.tenantId === "string" ? req.query.tenantId : null;
      const rows = await getActivitySummary(req, days, tenantId);
      res.json({ days, users: rows });
    } catch (error) {
      console.error("[Activity] Summary error:", error);
      res.status(500).json({ message: "No se pudo consultar la actividad de usuarios" });
    }
  });

  app.get("/api/activity/users/:userId", isAuthenticated, async (req: any, res) => {
    try {
      const days = clampDays(req.query.days);
      const detail = await getUserActivityDetail(req, req.params.userId, days);
      if (!detail) return res.status(403).json({ message: "No tienes acceso a la actividad de este usuario" });
      res.json({ days, ...detail });
    } catch (error) {
      console.error("[Activity] User detail error:", error);
      res.status(500).json({ message: "No se pudo consultar la bitácora del usuario" });
    }
  });
}
