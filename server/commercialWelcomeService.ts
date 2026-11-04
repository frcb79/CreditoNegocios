import { randomBytes } from "node:crypto";
import { Resend } from "resend";
import { pool } from "./db";
import { renderCommercialActivationWelcome } from "./commercialWelcomeEmail";

type WelcomeRow = {
  id: string; email: string | null; first_name: string | null;
  role: string; status: string | null; is_active: boolean | null;
};

/**
 * At-most-once delivery. The unique user_id is inserted transactionally with
 * initial invitation activation; only one worker can claim it. Unknown provider
 * outcomes are never retried automatically, preventing duplicate mail.
 */
export async function dispatchCommercialActivationWelcome(userId: string): Promise<void> {
  // No real email to test/staging accounts, regardless of provider credentials.
  if (process.env.NODE_ENV === "test" ||
      process.env.RAILWAY_ENVIRONMENT_NAME !== "production") return;
  if (!process.env.RESEND_API_KEY) {
    console.error("[WELCOME-63] Mail provider unavailable; welcome remains pending");
    return;
  }
  const user = (await pool.query<WelcomeRow>(
    "SELECT id,email,first_name,role,status,is_active FROM public.users WHERE id=$1",
    [userId]
  )).rows[0];
  if (!user || !user.email || !["broker","master_broker"].includes(user.role) ||
      user.status !== "active" || user.is_active === false) return;

  // Claim once. A crash or uncertain provider response cannot send another copy.
  const claimed = await pool.query(
    "UPDATE public.broker_activation_welcome_events SET status='claimed',claimed_at=NOW() " +
    "WHERE user_id=$1 AND status='pending' RETURNING user_id", [userId]
  );
  if (!claimed.rowCount) return;
  try {
    // Campaign links already use one stable, opaque token per user. Keep this
    // same token instead of inventing a second attribution mechanism.
    const existing = await pool.query<{token:string;disabled_at:Date|null;tenant_id:string|null}>(
      "SELECT token,disabled_at,tenant_id FROM public.commercial_campaign_links " +
      "WHERE owner_user_id=$1 AND template_id IS NULL LIMIT 1", [userId]
    );
    let token = existing.rows[0]?.token;
    if (existing.rows.length && existing.rows[0].disabled_at) {
      throw new Error("El enlace de captación del asesor está desactivado");
    }
    if (existing.rows[0]?.tenant_id) {
      const membership = await pool.query(
        "SELECT 1 FROM public.tenant_members tm JOIN public.tenants t ON t.id=tm.tenant_id " +
        "WHERE tm.user_id=$1 AND tm.tenant_id=$2 AND tm.is_active=TRUE " +
        "AND t.is_active IS DISTINCT FROM FALSE LIMIT 1", [userId,existing.rows[0].tenant_id]
      );
      if (!membership.rowCount) throw new Error("Membresía comercial no disponible");
    }
    if (!token) {
      const member = await pool.query<{tenant_id:string}>(
        "SELECT tm.tenant_id FROM public.tenant_members tm JOIN public.tenants t ON t.id=tm.tenant_id " +
        "WHERE tm.user_id=$1 AND tm.is_active=TRUE AND t.is_active IS DISTINCT FROM FALSE " +
        "ORDER BY tm.id LIMIT 1", [userId]
      );
      const created = await pool.query<{token:string}>(
        "INSERT INTO public.commercial_campaign_links(token,owner_user_id,tenant_id,template_id) " +
        "VALUES($1,$2,$3,NULL) ON CONFLICT DO NOTHING RETURNING token",
        [randomBytes(24).toString("base64url"),userId,member.rows[0]?.tenant_id??null]
      );
      token = created.rows[0]?.token || (await pool.query<{token:string}>(
        "SELECT token FROM public.commercial_campaign_links WHERE owner_user_id=$1 " +
        "AND template_id IS NULL AND disabled_at IS NULL LIMIT 1", [userId]
      )).rows[0]?.token;
    }
    if (!token) throw new Error("No se pudo crear el enlace de captación");
    const message = renderCommercialActivationWelcome({
      firstName:user.first_name || "asesor",role:user.role as "broker"|"master_broker",
      appBaseUrl:"https://app.creditonegocios.com.mx",campaignToken:token
    });
    const resend = new Resend(process.env.RESEND_API_KEY);
    const result = await resend.emails.send({
      from:process.env.EMAIL_FROM || "Crédito Negocios <noreply@creditonegocios.com.mx>",
      to:[user.email],subject:message.subject,html:message.html,text:message.text,
    });
    if (result.error || !result.data?.id)
      throw new Error("Proveedor rechazó o no confirmó el mensaje");
    await pool.query(
      "UPDATE public.broker_activation_welcome_events " +
      "SET status='sent',sent_at=NOW(),provider_message_id=$2,updated_at=NOW() " +
      "WHERE user_id=$1 AND status='claimed'",[userId,result.data.id]
    );
    console.info("[WELCOME-63] Sent one activation welcome");
  } catch (error) {
    const reason = error instanceof Error ? error.message.slice(0,230) : "Error desconocido";
    try {
      await pool.query(
        "UPDATE public.broker_activation_welcome_events " +
        "SET status='failed',last_error=$2,updated_at=NOW() " +
        "WHERE user_id=$1 AND status='claimed'",[userId,reason]
      );
    } catch {
      console.error("[WELCOME-63] Failed to persist delivery outcome");
    }
    console.error("[WELCOME-63] Delivery not confirmed; no automatic retry");
  }
}
