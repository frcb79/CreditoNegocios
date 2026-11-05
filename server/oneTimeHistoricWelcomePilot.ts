import { pool } from "./db";
import { dispatchCommercialActivationWelcome } from "./commercialWelcomeService";

/**
 * Explicit, one-time pilot for two previously registered accounts.
 * Never processes all historical users. At-most-once is enforced by the
 * broker_activation_welcome_events unique(user_id) and the pending claim.
 * This can only run in Railway production with an additional opt-in flag.
 */
export const PILOT_WELCOME_TARGETS = [
  { email: "fcb@creditonegocios.com.mx", role: "master_broker" },
  { email: "fcb@10xteam.com.mx", role: "broker" },
] as const;

export function isPilotWelcomeEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.RAILWAY_ENVIRONMENT_NAME === "production" &&
    env.MAIL_PILOT_20261104_ENABLED === "enabled" &&
    env.NODE_ENV !== "test" &&
    Boolean(env.RESEND_API_KEY);
}

export async function dispatchOneTimeHistoricWelcomePilot() {
  if (!isPilotWelcomeEnabled()) return;
  let successes = 0;
  let skipped = 0;
  for (const target of PILOT_WELCOME_TARGETS) {
    try {
      // Confirm the exact registered email AND role before inserting a
      // one-time event. Never change or requeue prior sent/claimed/failed rows.
      const result = await pool.query<{user_id:string}>(`
        INSERT INTO public.broker_activation_welcome_events (user_id,status)
        SELECT u.id,'pending' FROM public.users u
        WHERE lower(u.email)=lower($1) AND u.role=$2
          AND u.status='active' AND u.is_active IS DISTINCT FROM FALSE
        ON CONFLICT(user_id) DO NOTHING
        RETURNING user_id
      `,[target.email,target.role]);
      const id = result.rows[0]?.user_id;
      if (!id) { skipped++; continue; }
      // The existing production dispatcher supplies the real personalized
      // HTML and branded, attributed links and keeps Resend's message ID.
      await dispatchCommercialActivationWelcome(id);
      successes++;
    } catch (error) {
      console.error("[MAIL-PILOT-20261104] Pilot dispatch unavailable", {
        code: (error as any)?.code || "UNAVAILABLE",
      });
    }
  }
  console.info("[MAIL-PILOT-20261104] Dispatch attempts finished", { attempted: successes, skipped });
}
