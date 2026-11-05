import type { PoolClient } from "pg";
import { normalizeProspectPhone } from "../shared/prospectContact";
import { publishProspectNotification, type ProspectNotificationPublisher } from "./prospectNotifications";
import type { Express } from "express";
import { createHash, randomBytes } from "node:crypto";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { pool } from "./db";
import { storage } from "./storage";
import { isAuthenticated } from "./auth";
import { getPublishedLegalDocument } from "./legalDocuments";
import { publicClientProfileSchema } from "../shared/clientProfileValidation";
import { persistProspectProfile, profileIsBlank } from "./prospectProfilePersistence";
import { prospectFinancingSchema } from "../shared/prospectFinancing";
import { insertProspectPreapplication, evaluateProspectPreapplication } from "./prospectAutoMatching";

export const completionTokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
export const makeCompletionToken = () => randomBytes(24).toString("base64url");
const tokenSchema = z.string().regex(/^[a-zA-Z0-9_-]{32}$/);
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: "draft-7", legacyHeaders: false });
const input = z.object({ profile: publicClientProfileSchema.refine(profile=>Boolean(profile.email?.trim()), {message:"Es necesario proporcionar correo electrónico.",path:["email"]}), financing: prospectFinancingSchema.optional(), acknowledgePrivacy: z.literal(true),
  privacyVersion: z.string().min(1).max(40), companyWebsite: z.literal("").optional() }).strict();
const lookup = `SELECT l.*,u.first_name,u.last_name,u.brand_name
  FROM public.prospect_completion_links l JOIN public.users u ON u.id=l.owner_user_id
  WHERE l.token_hash=$1 AND l.used_at IS NULL AND l.disabled_at IS NULL AND l.expires_at>NOW()
  AND u.is_active IS DISTINCT FROM FALSE AND u.status='active' AND u.role IN ('broker','master_broker')
  AND (l.tenant_id IS NULL OR EXISTS (SELECT 1 FROM public.tenant_members m JOIN public.tenants t ON t.id=m.tenant_id
    WHERE m.user_id=l.owner_user_id AND m.tenant_id=l.tenant_id AND m.is_active=TRUE AND t.is_active IS DISTINCT FROM FALSE))`;

export function registerProspectCompletionRoutes(app: Express, publish?: ProspectNotificationPublisher) {
  app.post("/api/commercial-resources/completion-links", isAuthenticated, async (req: any, res) => {
    try {
      const owner = await storage.getUser(req.user?.claims?.sub || req.user?.id);
      if (!owner || !["broker", "master_broker"].includes(owner.role) || owner.isActive === false || owner.status !== "active") return res.status(403).json({ message: "No autorizado" });
      const parsed = z.object({ clientId: z.string().min(1).max(100).optional(), leadId: z.string().min(1).max(100).optional() }).strict().safeParse(req.body || {});
      if (!parsed.success || (parsed.data.clientId && parsed.data.leadId)) return res.status(400).json({ message: "Solicitud de enlace inválida" });
      const members = await storage.getTenantMembersByUser(owner.id);
      let tenantId = members.find(m => m.isActive && m.role === "owner")?.tenantId || members.find(m => m.isActive)?.tenantId || null;
      let clientId = parsed.data.clientId || null;
      const leadId = parsed.data.leadId || null;
      if (leadId) {
        const result = await pool.query("SELECT tenant_id,linked_client_id FROM public.commercial_marketing_leads WHERE id=$1 AND owner_user_id=$2", [leadId, owner.id]);
        if (!result.rows[0]) return res.status(404).json({ message: "Prospecto no encontrado" });
        tenantId = result.rows[0].tenant_id; clientId = result.rows[0].linked_client_id;
      }
      if (clientId) {
        const client = await storage.getClient(clientId);
        if (!client || client.brokerId !== owner.id) return res.status(403).json({ message: "Sólo puedes solicitar información de tus propios prospectos" });
        tenantId = client.tenantId;
      }
      if (tenantId && !members.some(m => m.isActive && m.tenantId === tenantId)) return res.status(403).json({ message: "El prospecto no pertenece a tu organización activa" });
      const token = makeCompletionToken();
      const result = await pool.query(`INSERT INTO public.prospect_completion_links (token_hash,owner_user_id,tenant_id,client_id,lead_id)
        VALUES ($1,$2,$3,$4,$5) RETURNING expires_at`, [completionTokenHash(token), owner.id, tenantId, clientId, leadId]);
      res.setHeader("Cache-Control", "private, no-store");
      return res.json({ path: "/completar-perfil/" + token, expiresAt: result.rows[0].expires_at });
    } catch { return res.status(503).json({ message: "No se pudo preparar el enlace del prospecto" }); }
  });
  app.get("/api/public/prospect-completion/:token", limiter, async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    if (!tokenSchema.safeParse(req.params.token).success) return res.status(404).json({ message: "Enlace no disponible" });
    try {
      const result = await pool.query(lookup, [completionTokenHash(req.params.token)]);
      const link = result.rows[0], notice = getPublishedLegalDocument("aviso");
      if (!link) return res.status(404).json({ message: "El enlace venció o ya fue utilizado. Solicita uno nuevo a tu asesor." });
      if (!notice) return res.status(503).json({ message: "Aviso de privacidad no disponible" });
      // No existing personal or financial information is exposed by a link.
      return res.json({ advisorName: link.brand_name || [link.first_name, link.last_name].filter(Boolean).join(" "), privacyVersion: notice.version });
    } catch { return res.status(503).json({ message: "No se pudo cargar el formulario" }); }
  });
  app.post("/api/public/prospect-completion/:token", limiter, async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    if (!tokenSchema.safeParse(req.params.token).success) return res.status(404).json({ message: "Enlace no disponible" });
    const parsed = input.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message || "Revisa los datos del perfil" });
    const notice = getPublishedLegalDocument("aviso");
    if (!notice || notice.version !== parsed.data.privacyVersion) return res.status(409).json({ message: "Actualiza el formulario y confirma el Aviso de Privacidad vigente" });
    let tx: PoolClient | undefined;
    try {
      tx = await pool.connect();
      await tx.query("BEGIN");
      const result = await tx.query(lookup + " FOR UPDATE OF l,u", [completionTokenHash(req.params.token)]);
      const link = result.rows[0];
      if (!link) { await tx.query("ROLLBACK"); return res.status(404).json({ message: "El enlace venció o ya fue utilizado" }); }
      const profile = parsed.data.profile;
      const incrementalProfile = Object.fromEntries(Object.entries(profile).filter(([,value]) => !profileIsBlank(value)));
      const clientId = await persistProspectProfile(tx, link, profile);
      let leadId = link.lead_id;
      if (leadId) {
        const updated = await tx.query(`UPDATE public.commercial_marketing_leads SET profile_data=COALESCE(profile_data,'{}'::jsonb)||$1::jsonb,profile_received_at=NOW(),
          linked_client_id=COALESCE($2,linked_client_id) WHERE id=$3 AND owner_user_id=$4 AND tenant_id IS NOT DISTINCT FROM $5
          AND ($2::varchar IS NULL OR linked_client_id IS NULL OR linked_client_id=$2) RETURNING id`,
        [JSON.stringify(incrementalProfile), clientId, leadId, link.owner_user_id, link.tenant_id]);
        if (updated.rowCount !== 1) throw new Error("PROSPECT_OWNER_CHANGED");
      } else {
        const campaignToken = makeCompletionToken();
        await tx.query(`INSERT INTO public.commercial_campaign_links (token,owner_user_id,tenant_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [campaignToken, link.owner_user_id, link.tenant_id]);
        const campaign = await tx.query("SELECT id FROM public.commercial_campaign_links WHERE owner_user_id=$1 AND template_id IS NULL", [link.owner_user_id]);
        const created = await tx.query(`INSERT INTO public.commercial_marketing_leads
          (link_id,owner_user_id,tenant_id,source_channel,full_name,phone,email,privacy_version,profile_data,profile_received_at,linked_client_id)
          VALUES ($1,$2,$3,'contacto_directo',$4,$5,$6,$7,$8,NOW(),$9) RETURNING id`,
        [campaign.rows[0].id, link.owner_user_id, link.tenant_id, [profile.firstName, profile.lastName].filter(Boolean).join(" ") || profile.businessName,
          normalizeProspectPhone(profile.phone!), profile.email || null, notice.version, JSON.stringify(incrementalProfile), clientId]);
        leadId = created.rows[0].id;
      }
      await tx.query(`INSERT INTO public.prospect_profile_submissions (completion_link_id,lead_id,profile_data,privacy_version)
        VALUES ($1,$2,$3,$4)`, [link.id,leadId,JSON.stringify(profile),notice.version]);
      // Internal preapplication shares the same atomic boundary as the submitted profile.
      // If the request has no exact amount/term or the identity requires review,
      // retain the preapplication but do not invent a financial institution count.
      await insertProspectPreapplication(tx, {
        leadId, ownerUserId: link.owner_user_id, tenantId: link.tenant_id,
        clientId, completionLinkId: link.id, profile,
        financing: parsed.data.financing, privacyVersion: notice.version,
      });
      await tx.query("UPDATE public.prospect_completion_links SET used_at=NOW() WHERE id=$1", [link.id]);
      const notified = await tx.query(`INSERT INTO public.notifications (user_id,type,title,message,data) VALUES ($1,'prospect_profile_received','Información de prospecto recibida',
        'Tu prospecto completó información. Puedes consultarla en Clientes → Prospectos recibidos.',$2) RETURNING *`,
      [link.owner_user_id, JSON.stringify({ leadId, clientId, actionUrl: "/clientes?tab=recibidos" })]);
      await tx.query("COMMIT");
      // Release the profile transaction before matching. This prevents pool exhaustion
      // (or deadlocks under a single test/worker connection) during catalogue evaluation.
      tx.release();
      tx = undefined;
      publishProspectNotification(publish, notified.rows[0]);
      // Match only after COMMIT. A catalogue failure cannot erase the captured profile.
      // The public assessment is deliberately anonymized; lender details stay internal.
      const assessment = await evaluateProspectPreapplication(leadId,link.owner_user_id);
      return res.status(201).json({ message: "Tu información fue recibida por tu asesor.", assessment });
    } catch {
      if (tx) await tx.query("ROLLBACK").catch(() => {});
      return res.status(503).json({ message: "No se pudo guardar el perfil. Tu enlace sigue disponible para reintentar." });
    } finally { tx?.release(); }
  });
}
