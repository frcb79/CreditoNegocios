import { pool } from "./db";
import { dispatchCommercialActivationWelcome } from "./commercialWelcomeService";

/** Backfill welcome emails for already-registered accounts not covered by the
 * explicitly approved two-account pilot. This never resends an existing event.
 */
export function isHistoricalWelcomeRemainderEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.RAILWAY_ENVIRONMENT_NAME === "production" &&
    env.WELCOME_REMAINDER_20261105_ENABLED === "enabled" &&
    env.NODE_ENV !== "test" &&
    Boolean(env.RESEND_API_KEY);
}

export async function dispatchHistoricalWelcomeRemainder() {
  if (!isHistoricalWelcomeRemainderEnabled()) return {eligible:0,claimed:0,skipped:0};
  const users = await pool.query<{id:string}>(`
    SELECT u.id
    FROM public.users u
    WHERE u.role IN ('broker','master_broker')
      AND u.password IS NOT NULL AND LENGTH(u.password)>0
      AND u.status='active'
      AND u.is_active IS DISTINCT FROM FALSE
      AND NOT EXISTS (
        SELECT 1 FROM public.broker_activation_welcome_events w WHERE w.user_id=u.id
      )
    ORDER BY u.created_at ASC
    LIMIT 250
  `);
  const summary={eligible:users.rowCount||0,claimed:0,skipped:0};
  for(const user of users.rows) {
    try {
      const claimed=await pool.query<{user_id:string}>(`
        INSERT INTO public.broker_activation_welcome_events (user_id,status)
        SELECT u.id,'pending' FROM public.users u
        WHERE u.id=$1
          AND u.role IN ('broker','master_broker')
          AND u.password IS NOT NULL AND LENGTH(u.password)>0
          AND u.status='active'
          AND u.is_active IS DISTINCT FROM FALSE
        ON CONFLICT(user_id) DO NOTHING RETURNING user_id
      `,[user.id]);
      if (!claimed.rowCount) {summary.skipped++;continue;}
      summary.claimed++;
      await dispatchCommercialActivationWelcome(user.id);
      await new Promise(resolve => setTimeout(resolve,650));
    } catch {
      // The pending/sent/failed row is the at-most-once audit. Never retry unknowns.
      console.error("[WELCOME-REMAINDER] Recipient outcome requires audit review");
    }
  }
  console.info("[WELCOME-REMAINDER] Attempted historic registered welcomes",summary);
  return summary;
}
