import { randomBytes } from "node:crypto";
import { pool } from "./db";
import { storage } from "./storage";
import { sendBrokerInvitationReminderEmail } from "./emailService";

/** The delivery may have happened even if updating its audit row failed. Never auto-retry it. */
export const UNCERTAIN_REMINDER_PREFIX = "Estado de envío no confirmado:";

/** A failed send may retry after 20h. Unknown delivery and the Nov 1-3 SQL
 * regression must be reviewed against Resend before any manual re-send. */
export const REMINDER_CLAIM_SQL = `INSERT INTO public.broker_invitation_reminder_events
          (user_id, reminder_day, status)
        VALUES ($1, $2, 'claimed')
        ON CONFLICT (user_id, reminder_day) DO UPDATE
           SET status='claimed', claimed_at=NOW(), updated_at=NOW(), last_error=NULL
         WHERE broker_invitation_reminder_events.status='failed'
           AND broker_invitation_reminder_events.updated_at < NOW()-INTERVAL '20 hours'
           AND COALESCE(broker_invitation_reminder_events.last_error,'')
             NOT LIKE 'Estado de envío no confirmado:%'
           AND COALESCE(broker_invitation_reminder_events.last_error,'')
             NOT ILIKE '%inconsistent types deduced for parameter $3%'
        RETURNING user_id`;

/** $3 is only inferred as the status varchar; $5 is explicitly boolean.
 * This avoids the PostgreSQL "inconsistent types deduced for parameter $3"
 * failure from referencing the same parameter in both varchar and text contexts. */
export const REMINDER_OUTCOME_SQL = `UPDATE public.broker_invitation_reminder_events
            SET status=$3::varchar,
                sent_at=CASE WHEN $5::boolean THEN NOW() ELSE NULL END,
                last_error=CASE WHEN $5::boolean THEN NULL ELSE LEFT($4::text, 500) END,
                provider_message_id=CASE WHEN $5::boolean THEN $6::varchar ELSE provider_message_id END,
                updated_at=NOW()
          WHERE user_id=$1 AND reminder_day=$2`;

/** At most one reminder on a scheduled run, never three catch-up emails at once. */
export function selectReminderDay(invitedAt: Date, now = new Date()): 3 | 7 | 12 | 15 | null {
  const elapsed = now.getTime() - invitedAt.getTime();
  if (elapsed < 3 * 86400000) return null;
  if (elapsed < 7 * 86400000) return 3;
  if (elapsed < 12 * 86400000) return 7;
  if (elapsed < 15 * 86400000) return 12;
  return 15;
}

export async function runBrokerInvitationReminders(): Promise<{
  due: number; sent: number; failed: number; skipped: number;
}> {
  // Staging must never send actual reminder email to real/test invitees.
  if (process.env.NODE_ENV === "test" ||
      process.env.RAILWAY_ENVIRONMENT_NAME !== "production")
    return { due: 0, sent: 0, failed: 0, skipped: 0 };
  const { rows } = await pool.query<{
    id: string; email: string; first_name: string | null;
    last_name: string | null; invited_at: Date;
  }>(`WITH first_invite AS (
      SELECT n.data->>'brokerId' AS user_id, MIN(n.created_at) AS invited_at
        FROM public.notifications n
       WHERE n.type = 'broker_invitation_sent'
         AND n.data->>'brokerId' IS NOT NULL
       GROUP BY n.data->>'brokerId'
    )
    SELECT u.id, u.email, u.first_name, u.last_name, fi.invited_at
      FROM first_invite fi JOIN public.users u ON u.id = fi.user_id
     WHERE u.role IN ('broker', 'master_broker')
       AND u.password IS NULL AND u.is_active IS DISTINCT FROM FALSE
       AND (u.reset_token_expiry IS NULL OR u.reset_token_expiry <= NOW())
       AND coalesce(u.profile_data->>'invitationFollowupPaused', 'false') <> 'true'
       AND fi.invited_at <= NOW() - INTERVAL '3 days'
     ORDER BY fi.invited_at ASC LIMIT 250`);
  const output = { due: 0, sent: 0, failed: 0, skipped: 0 };
  for (const user of rows) {
    const day = selectReminderDay(new Date(user.invited_at));
    if (!day) continue;
    // Uniqueness in Postgres is the cross-worker/idempotency boundary.
    const claim = await pool.query(
      REMINDER_CLAIM_SQL,
      [user.id, day],
    );
    if (!claim.rowCount) continue;
    output.due++;
    let deliveryAttempted = false;
    try {
      const refreshed = await storage.getUser(user.id);
      if (!refreshed || refreshed.password || refreshed.isActive === false ||
          (refreshed.profileData as any)?.invitationFollowupPaused === true) {
        await pool.query(
          "UPDATE public.broker_invitation_reminder_events SET status='skipped', updated_at=NOW() WHERE user_id=$1 AND reminder_day=$2",
          [user.id, day]);
        output.skipped++;
        continue;
      }
      const token = randomBytes(32).toString("hex");
      // An activation or opt-out may race with this scheduled job. Never replace
      // a token once a password has been registered, nor for paused accounts.
      const tokenSet = await pool.query(
        `UPDATE public.users SET reset_token=$2, reset_token_expiry=$3, updated_at=NOW()
          WHERE id=$1 AND password IS NULL AND is_active IS DISTINCT FROM FALSE
            AND (reset_token_expiry IS NULL OR reset_token_expiry <= NOW())
            AND COALESCE(profile_data->>'invitationFollowupPaused','false') <> 'true'
        RETURNING id`,
        [user.id, token, new Date(Date.now() + 86400000)],
      );
      if (!tokenSet.rowCount) {
        await pool.query(
          "UPDATE public.broker_invitation_reminder_events SET status='skipped', updated_at=NOW() WHERE user_id=$1 AND reminder_day=$2",
          [user.id, day]);
        output.skipped++;
        continue;
      }
      const name = [user.first_name, user.last_name].filter(Boolean).join(" ");
      // After dispatch starts, any persistence failure has an unknown delivery
      // outcome. Never retry automatically or replace a potentially delivered link.
      deliveryAttempted = true;
      const delivered = await sendBrokerInvitationReminderEmail(user.email, token, day, name);
      await pool.query(
        REMINDER_OUTCOME_SQL,
        [user.id, day, delivered.success ? "sent" : "failed", delivered.error || "", delivered.success, delivered.providerMessageId || null],
      );
      if (delivered.success) output.sent++;
      else output.failed++;
    } catch (error: any) {
      output.failed++;
      const errorText = String(error?.message || error || "Error");
      const lastError = (deliveryAttempted
        ? `${UNCERTAIN_REMINDER_PREFIX} ${errorText}`
        : errorText).slice(0, 500);
      await pool.query(
        `UPDATE public.broker_invitation_reminder_events
            SET status='failed', last_error=$3, updated_at=NOW()
          WHERE user_id=$1 AND reminder_day=$2`,
        [user.id, day, lastError],
      ).catch(() => {});
    }
  }
  return output;
}
