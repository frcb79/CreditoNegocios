import type { Express, Response } from "express";
import { randomBytes } from "node:crypto";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { pool } from "./db";
import { storage } from "./storage";
import { isAuthenticated } from "./auth";
import { getPublishedLegalDocument } from "./legalDocuments";
import { resourceProductSchema } from "../shared/commercialResourceDefinition";

const tokenSchema = z.string().regex(/^[a-zA-Z0-9_-]{32}$/);
const linkInput = z.object({ templateId: z.string().min(10).max(80).optional() }).strict();
const intakeInput = z.object({
  fullName: z.string().trim().min(3).max(120),
  phone: z.string().trim().min(10).max(25),
  email: z.union([z.string().trim().email().max(160), z.literal("")]).optional(),
  product: resourceProductSchema.optional(),
  amountRange: z.string().trim().max(80).optional(),
  message: z.string().trim().max(600).optional(),
  acknowledgePrivacy: z.literal(true),
  privacyVersion: z.string().trim().min(1).max(40),
  companyWebsite: z.literal("").optional()
}).strict();

const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 15,
  standardHeaders: "draft-7", legacyHeaders: false,
  message: { message: "Demasiadas solicitudes. Intenta nuevamente más tarde." }
});

type AuthUser = { id: string; role: string };
async function identify(req: any): Promise<AuthUser | null> {
  const id = req.user?.claims?.sub || req.user?.id || req.dbUser?.id;
  if (typeof id !== "string" || !id) return null;
  const user = await storage.getUser(id);
  if (!user || user.isActive === false || (user.status && user.status !== "active")) return null;
  if (!["broker", "master_broker", "admin", "super_admin"].includes(user.role)) return null;
  return { id: user.id, role: user.role };
}
const allowedOwner = (u: AuthUser | null) => u?.role === "broker" || u?.role === "master_broker";
function noAccess(res: Response) { return res.status(403).json({ message: "No autorizado" }); }

const linkLookup = [
  "SELECT l.id, l.token, l.owner_user_id, l.tenant_id, l.template_id,",
  "l.click_count, l.created_at, l.disabled_at, u.first_name, u.last_name, u.brand_name,",
  "u.role AS owner_role, u.is_active, t.product, t.channel, t.name AS campaign_name,",
  "t.status AS template_status",
  "FROM public.commercial_campaign_links l",
  "JOIN public.users u ON u.id = l.owner_user_id",
  "LEFT JOIN public.commercial_resource_templates t ON t.id = l.template_id"
].join(" ");

const activeLinkCondition = [
  "l.disabled_at IS NULL",
  "AND u.is_active IS DISTINCT FROM FALSE AND u.status = 'active'",
  "AND u.role IN ('broker','master_broker')",
  "AND (l.template_id IS NULL OR t.status = 'published')",
  "AND (l.tenant_id IS NULL OR EXISTS (",
  "SELECT 1 FROM public.tenant_members tm",
  "JOIN public.tenants tn ON tn.id = tm.tenant_id",
  "WHERE tm.user_id = l.owner_user_id AND tm.tenant_id = l.tenant_id",
  "AND tm.is_active = TRUE AND tn.is_active IS DISTINCT FROM FALSE",
  "))"
].join(" ");

export function registerCampaignAcquisitionRoutes(app: Express) {
  app.post("/api/commercial-resources/links", isAuthenticated, async (req: any, res) => {
    const user = await identify(req);
    if (!allowedOwner(user)) return noAccess(res);
    const parsed = linkInput.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ message: "Solicitud de enlace inválida" });
    // The same opaque referral token is reused for every template and channel.
    // A cached older frontend may still send templateId: accept for backward
    // compatibility but never create new template-specific campaign links.
    const templateId = null;
    try {
      const members = await storage.getTenantMembersByUser(user!.id);
      const tenantId = members.find(m => m.isActive)?.tenantId ?? null;
      const token = randomBytes(24).toString("base64url");
      const result = await pool.query(
        ["INSERT INTO public.commercial_campaign_links (token,owner_user_id,tenant_id,template_id)",
         "VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING token,template_id,click_count"].join(" "),
        [token,user!.id,tenantId,templateId]
      );
      let link = result.rows[0];
      if (!link) {
        const existing = await pool.query(
          ["SELECT token,template_id,click_count,disabled_at FROM public.commercial_campaign_links",
           "WHERE owner_user_id=$1 AND template_id IS NOT DISTINCT FROM $2"].join(" "),
          [user!.id,templateId]
        );
        link = existing.rows[0];
      }
      if (!link || link.disabled_at) return res.status(409).json({ message: "Este enlace está inactivo" });
      return res.json({ path: "/c/" + link.token, templateId: link.template_id, clicks: link.click_count });
    } catch (error) {
      console.error("[CampaignLinks] Generation failed", error);
      return res.status(503).json({ message: "No fue posible generar tu enlace" });
    }
  });

  app.get("/api/commercial-resources/overview", isAuthenticated, async (req: any, res) => {
    const user = await identify(req);
    if (!user || (!allowedOwner(user) && user.role !== "super_admin")) return noAccess(res);
    try {
      const filter = user.role === "super_admin" ? "" : "WHERE owner_user_id = $1";
      const params = user.role === "super_admin" ? [] : [user.id];
      const [links, leads] = await Promise.all([
        pool.query("SELECT COALESCE(SUM(click_count),0)::integer AS clicks, COUNT(*)::integer AS links FROM public.commercial_campaign_links " + filter, params),
        pool.query("SELECT COUNT(*)::integer AS submitted, COUNT(linked_client_id)::integer AS linked FROM public.commercial_marketing_leads " + filter, params)
      ]);
      return res.json({
        clicks: links.rows[0]?.clicks || 0,
        links: links.rows[0]?.links || 0,
        received: leads.rows[0]?.submitted || 0,
        linked: leads.rows[0]?.linked || 0
      });
    } catch (error) {
      console.error("[CampaignLinks] Metrics failed", error);
      return res.status(503).json({ message: "No fue posible cargar las métricas" });
    }
  });

  app.get("/api/commercial-resources/received", isAuthenticated, async (req: any, res) => {
    const user = await identify(req);
    if (!allowedOwner(user)) return noAccess(res);
    try {
      const results = await pool.query(
        ["SELECT m.id,m.full_name,m.phone,m.email,m.product,m.amount_range,m.message,",
         "m.created_at,m.linked_client_id,t.name AS campaign_name,t.channel",
         "FROM public.commercial_marketing_leads m",
         "LEFT JOIN public.commercial_resource_templates t ON t.id=m.template_id",
         "WHERE m.owner_user_id=$1 ORDER BY m.created_at DESC LIMIT 200"].join(" "),
        [user!.id]
      );
      return res.json(results.rows);
    } catch (error) {
      console.error("[CampaignLinks] Inbox failed", error);
      return res.status(503).json({ message: "No fue posible cargar prospectos recibidos" });
    }
  });

  // Only the originating broker/master may link a received lead to their
  // legitimately created Client after manual review and duplicate checking.
  app.post("/api/commercial-resources/received/:id/link-client", isAuthenticated, async (req: any, res) => {
    const user = await identify(req);
    if (!allowedOwner(user)) return noAccess(res);
    const parsed = z.object({ clientId: z.string().min(3).max(100) }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Cliente inválido" });
    try {
      const client = await storage.getClient(parsed.data.clientId);
      if (!client || client.brokerId !== user!.id) return noAccess(res);
      const lead = await pool.query(
        "SELECT id,tenant_id,linked_client_id FROM public.commercial_marketing_leads WHERE id=$1 AND owner_user_id=$2",
        [req.params.id,user!.id]
      );
      if (!lead.rows[0]) return res.status(404).json({ message: "Prospecto no encontrado" });
      if (lead.rows[0].tenant_id !== (client.tenantId ?? null)) {
        return noAccess(res);
      }
      if (lead.rows[0].linked_client_id && lead.rows[0].linked_client_id !== client.id) {
        return res.status(409).json({ message: "El prospecto ya está vinculado a otro cliente" });
      }
      const updated = await pool.query(
        "UPDATE public.commercial_marketing_leads SET linked_client_id=$1 WHERE id=$2 AND owner_user_id=$3 AND (linked_client_id IS NULL OR linked_client_id=$1) RETURNING linked_client_id",
        [client.id,req.params.id,user!.id]
      );
      if (updated.rowCount !== 1) return res.status(409).json({ message: "El prospecto ya fue vinculado" });
      return res.json({ linkedClientId: client.id });
    } catch (error) {
      console.error("[CampaignLinks] Link to reviewed client failed", error);
      return res.status(503).json({ message: "No fue posible vincular el prospecto a tu cliente" });
    }
  });

  app.get("/api/public/campaign/:token", publicLimiter, async (req: any, res) => {
    if (!tokenSchema.safeParse(req.params.token).success) return res.status(404).json({ message: "Enlace no disponible" });
    try {
      const link = await pool.query(linkLookup + " WHERE l.token=$1 AND " + activeLinkCondition, [req.params.token]);
      if (!link.rows[0]) return res.status(404).json({ message: "Enlace no disponible" });
      const notice = getPublishedLegalDocument("aviso");
      if (!notice) return res.status(503).json({ message: "Aviso de privacidad no disponible" });
      await pool.query("UPDATE public.commercial_campaign_links SET click_count=click_count+1 WHERE id=$1", [link.rows[0].id]);
      const data = link.rows[0];
      const advisorName = data.brand_name || [data.first_name,data.last_name].filter(Boolean).join(" ") || "Asesor de Crédito Negocios";
      return res.json({
        advisorName, campaignName: data.campaign_name || "Financiamiento",
        product: data.product || null, privacyVersion: notice.version
      });
    } catch (error) {
      console.error("[CampaignLinks] Public link failed", error);
      return res.status(503).json({ message: "No fue posible cargar el formulario" });
    }
  });

  app.post("/api/public/campaign/:token/submit", publicLimiter, async (req: any, res) => {
    if (!tokenSchema.safeParse(req.params.token).success) return res.status(404).json({ message: "Enlace no disponible" });
    const parsed = intakeInput.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message || "Datos incorrectos" });
    const data = parsed.data;
    const digits = data.phone.replace(/\D/g, "");
    if (digits.length < 10 || digits.length > 15) return res.status(400).json({ message: "Proporciona un teléfono válido" });
    const notice = getPublishedLegalDocument("aviso");
    if (!notice || notice.version !== data.privacyVersion) return res.status(409).json({ message: "Actualiza y confirma el Aviso de Privacidad vigente" });
    try {
      const link = await pool.query(linkLookup + " WHERE l.token=$1 AND " + activeLinkCondition, [req.params.token]);
      if (!link.rows[0]) return res.status(404).json({ message: "Enlace no disponible" });
      const row = link.rows[0], product = row.product || data.product || null;
      // Serialize submissions for the same link and normalized phone so that
      // simultaneous retries cannot create duplicate marketing leads.
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["marketing-lead:" + row.id + ":" + digits]);
        const existing = await client.query(
          ["SELECT id FROM public.commercial_marketing_leads",
           "WHERE link_id=$1 AND phone=$2 AND created_at > NOW() - INTERVAL '7 days' LIMIT 1"].join(" "),
          [row.id,digits]
        );
        if (!existing.rows[0]) {
          await client.query(
            ["INSERT INTO public.commercial_marketing_leads",
             "(link_id,owner_user_id,tenant_id,template_id,source_channel,",
             "full_name,phone,email,product,amount_range,message,privacy_version)",
             "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)"].join(" "),
            [row.id,row.owner_user_id,row.tenant_id,row.template_id,row.channel || (row.template_id ? null : "redes_sociales"),
             data.fullName,digits,data.email || null,product,data.amountRange || null,
             data.message || null,notice.version]
          );
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
      return res.status(201).json({ message: "Solicitud recibida. Tu asesor podrá contactarte." });
    } catch (error) {
      console.error("[CampaignLinks] Public intake failed", error);
      return res.status(503).json({ message: "No fue posible registrar tu solicitud" });
    }
  });
}
