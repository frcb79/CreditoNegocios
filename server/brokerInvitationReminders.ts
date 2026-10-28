import { randomBytes } from "node:crypto";
import { pool } from "./db";
import { storage } from "./storage";
import { sendBrokerInvitationReminderEmail } from "./emailService";

/** At most one reminder on a scheduled run, never three catch-up emails at once. */
export function selectReminderDay(invitedAt: Date, now = new Date()): 3 | 7 | 12 | null {
  const elapsed = now.getTime() - invitedAt.getTime();
  if (elapsed < 3 * 86400000) return null;
  if (elapsed < 7 * 86400000) return 3;
  if (elapsed < 12 * 86400000) return 7;
  return 12;
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
       AND coalesce(u.profile_data->>'invitationFollowupPaused', 'false') <> 'true'
       AND fi.invited_at <= NOW() - INTERVAL '3 days'
     ORDER BY fi.invited_at ASC LIMIT 250`);
  const output = { due: 0, sent: 0, failed: 0, skipped: 0 };
  for (const user of rows) {
    const day = selectReminderDay(new Date(user.invited_at));
    if (!day) continue;
    // Uniqueness in Postgres is the cross-worker/idempotency boundary.
    const claim = await pool.query(
      `INSERT INTO public.broker_invitation_reminder_events
          (user_id, reminder_day, status)
        VALUES ($1, $2, 'claimed')
        ON CONFLICT (user_id, reminder_day) DO UPDATE
           SET status='claimed', claimed_at=NOW(), updated_at=NOW(), last_error=NULL
         WHERE broker_invitation_reminder_events.status='failed'
           AND broker_invitation_reminder_events.updated_at < NOW()-INTERVAL '20 hours'
        RETURNING user_id`,
      [user.id, day],
    );
    if (!claim.rowCount) continue;
    output.due++;
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
      await storage.setPasswordResetToken(user.id, token, new Date(Date.now() + 86400000));
      const name = [user.first_name, user.last_name].filter(Boolean).join(" ");
      const delivered = await sendBrokerInvitationReminderEmail(user.email, token, day, name);
      await pool.query(
        `UPDATE public.broker_invitation_reminder_events
            SET status=$3, sent_at=CASE WHEN $3='sent' THEN NOW() ELSE NULL END,
                last_error=CASE WHEN $3='sent' THEN NULL ELSE LEFT($4, 500) END, updated_at=NOW()
          WHERE user_id=$1 AND reminder_day=$2`,
        [user.id, day, delivered.success ? "sent" : "failed", delivered.error || ""],
      );
      if (delivered.success) output.sent++;
      else output.failed++;
    } catch (error: any) {
      output.failed++;
      await pool.query(
        `UPDATE public.broker_invitation_reminder_events
            SET status='failed', last_error=$3, updated_at=NOW()
          WHERE user_id=$1 AND reminder_day=$2`,
        [user.id, day, String(error?.message || error || "Error").slice(0, 500)],
      ).catch(() => {});
    }
  }
  return output;
}
