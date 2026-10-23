import type { Express, Response } from "express";
import rateLimit from "express-rate-limit";
import { pool } from "./db";
import { storage } from "./storage";
import { isAuthenticated } from "./auth";
import {
  commercialResourceUploadSchema, commercialSuggestionSchema,
  type CommercialResourceUpload,
} from "../shared/commercialResourceDefinition";

const READ_ROLES = new Set(["broker", "master_broker", "admin", "super_admin"]);
const SUGGEST_ROLES = new Set(["broker", "master_broker"]);

type Identity = { id: string; role: string };

async function identify(req: any): Promise<Identity | null> {
  const id = req.user?.claims?.sub || req.user?.id || req.dbUser?.id;
  if (typeof id !== "string" || !id) return null;
  const user = await storage.getUser(id);
  if (!user || user.isActive === false || !READ_ROLES.has(user.role)) return null;
  return { id: user.id, role: user.role };
}

function forbid(res: Response) {
  return res.status(403).json({ message: "Acceso no autorizado" });
}

const suggestionsRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 6,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Has enviado demasiadas sugerencias. Intenta más tarde." }
});

/**
 * Security invariants:
 * - All writes of templates/publication are strictly Super Admin.
 * - Broker/master cannot access drafts or suggestions from others.
 * - No endpoint to alter published copy, upload binary media or edit suggestions.
 * - Published versions are immutable. Replace by creating a new version.
 * - No suggestion workflow status, assignment or moderation.
 */
export function registerCommercialResourceRoutes(app: Express) {
  app.get("/api/commercial-resources/templates", isAuthenticated, async (req: any, res) => {
    const user = await identify(req);
    if (!user) return forbid(res);
    try {
      const result = await pool.query(
        "SELECT id, slug, version, name, product, channel, definition, published_at FROM public.commercial_resource_templates WHERE status = 'published' ORDER BY published_at DESC, name ASC LIMIT 200"
      );
      return res.json(result.rows);
    } catch (error) {
      console.error("[COM_RES] Published catalog read failed", error);
      return res.status(503).json({ message: "Catálogo de recursos no disponible" });
    }
  });

  app.get("/api/admin/commercial-resources/templates", isAuthenticated, async (req: any, res) => {
    const user = await identify(req);
    if (user?.role !== "super_admin") return forbid(res);
    try {
      const result = await pool.query(
        "SELECT id, slug, version, name, product, channel, definition, status, created_at, published_at, retired_at FROM public.commercial_resource_templates ORDER BY created_at DESC LIMIT 300"
      );
      return res.json(result.rows);
    } catch (error) {
      console.error("[COM_RES] Admin templates list failed", error);
      return res.status(503).json({ message: "No fue posible cargar las plantillas" });
    }
  });

  app.post("/api/admin/commercial-resources/templates", isAuthenticated, async (req: any, res) => {
    const user = await identify(req);
    if (user?.role !== "super_admin") return forbid(res);
    if (JSON.stringify(req.body ?? {}).length > 32_000) {
      return res.status(413).json({ message: "La plantilla excede el límite de 32 KB" });
    }
    const parsed = commercialResourceUploadSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Plantilla inválida", detail: parsed.error.issues[0]?.message });
    const input: CommercialResourceUpload = parsed.data;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["resources:" + input.slug]);
      const num = await client.query(
        "SELECT COALESCE(MAX(version),0)+1 AS version FROM public.commercial_resource_templates WHERE slug=$1",
        [input.slug]
      );
      const version = Number(num.rows[0]?.version || 1);
      const created = await client.query(
        "INSERT INTO public.commercial_resource_templates (slug,version,name,product,channel,definition,status,created_by) VALUES ($1,$2,$3,$4,$5,$6::jsonb,'draft',$7) RETURNING id,slug,version,name,product,channel,definition,status,created_at",
        [input.slug, version, input.name, input.product, input.channel, JSON.stringify(input.definition), user.id]
      );
      await client.query("COMMIT");
      return res.status(201).json(created.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("[COM_RES] Template draft create failed", error);
      return res.status(500).json({ message: "No se pudo guardar la plantilla" });
    } finally {
      client.release();
    }
  });

  app.post("/api/admin/commercial-resources/templates/:id/publish", isAuthenticated, async (req: any, res) => {
    const user = await identify(req);
    if (user?.role !== "super_admin") return forbid(res);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // Serialize publication per slug and prevent concurrent double-publish.
      const found = await client.query("SELECT id,slug,status FROM public.commercial_resource_templates WHERE id=$1", [req.params.id]);
      if (found.rowCount !== 1 || found.rows[0].status !== "draft") {
        await client.query("ROLLBACK");
        return res.status(409).json({ message: "Solo puede publicarse una versión en borrador" });
      }
      const slug: string = found.rows[0].slug;
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["resources:" + slug]);
      const current = await client.query("SELECT id,status FROM public.commercial_resource_templates WHERE id=$1 FOR UPDATE", [req.params.id]);
      if (current.rows[0]?.status !== "draft") {
        await client.query("ROLLBACK");
        return res.status(409).json({ message: "La plantilla ya cambió de estado" });
      }
      await client.query(
        "UPDATE public.commercial_resource_templates SET status='retired',retired_at=NOW() WHERE slug=$1 AND status='published'",
        [slug]
      );
      const result = await client.query(
        "UPDATE public.commercial_resource_templates SET status='published',published_by=$2,published_at=NOW() WHERE id=$1 AND status='draft' RETURNING id,slug,version,status,published_at",
        [req.params.id, user.id]
      );
      await client.query("COMMIT");
      return res.json(result.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("[COM_RES] Publish failed", error);
      return res.status(500).json({ message: "No se pudo publicar la plantilla" });
    } finally {
      client.release();
    }
  });

  app.post("/api/admin/commercial-resources/templates/:id/retire", isAuthenticated, async (req: any, res) => {
    const user = await identify(req);
    if (user?.role !== "super_admin") return forbid(res);
    try {
      const result = await pool.query(
        "UPDATE public.commercial_resource_templates SET status='retired',retired_at=NOW() WHERE id=$1 AND status='published' RETURNING id,status",
        [req.params.id]
      );
      if (result.rowCount !== 1) return res.status(409).json({ message: "Solo puede retirarse una plantilla publicada" });
      return res.json(result.rows[0]);
    } catch (error) {
      console.error("[COM_RES] Retire failed", error);
      return res.status(500).json({ message: "No se pudo retirar la plantilla" });
    }
  });

  app.post("/api/commercial-resources/suggestions", isAuthenticated, suggestionsRateLimit, async (req: any, res) => {
    const user = await identify(req);
    if (!user || !SUGGEST_ROLES.has(user.role)) return forbid(res);
    const parsed = commercialSuggestionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message || "Sugerencia inválida" });
    try {
      const count = await pool.query(
        "SELECT COUNT(*)::int AS n FROM public.commercial_resource_suggestions WHERE user_id=$1 AND created_at>NOW()-INTERVAL '24 hours'",
        [user.id]
      );
      if (Number(count.rows[0]?.n || 0) >= 12) return res.status(429).json({ message: "Límite de sugerencias alcanzado por hoy" });
      const memberships = await storage.getTenantMembersByUser(user.id);
      const tenantId = memberships.find(member => member.isActive)?.tenantId || null;
      await pool.query(
        "INSERT INTO public.commercial_resource_suggestions (user_id,tenant_id,product,channel,suggestion) VALUES ($1,$2,$3,$4,$5)",
        [user.id, tenantId, parsed.data.product || null, parsed.data.channel || null, parsed.data.suggestion]
      );
      return res.status(201).json({ message: "Sugerencia enviada" });
    } catch (error) {
      console.error("[COM_RES] Suggestion creation failed", error);
      return res.status(500).json({ message: "No fue posible recibir tu sugerencia" });
    }
  });

  app.get("/api/admin/commercial-resources/suggestions", isAuthenticated, async (req: any, res) => {
    const user = await identify(req);
    if (user?.role !== "super_admin") return forbid(res);
    try {
      const result = await pool.query(
        "SELECT s.id, s.user_id, s.tenant_id, s.product, s.channel, s.suggestion, s.created_at, u.first_name, u.last_name FROM public.commercial_resource_suggestions s JOIN public.users u ON u.id=s.user_id ORDER BY s.created_at DESC LIMIT 300"
      );
      return res.json(result.rows);
    } catch (error) {
      console.error("[COM_RES] Suggestion inbox failed", error);
      return res.status(503).json({ message: "No fue posible cargar las sugerencias" });
    }
  });
}
