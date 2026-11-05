import { randomBytes } from "node:crypto";
import { pool } from "./db";
import { sendAccountInvitationEmail } from "./emailService";
import { resolveOptionalInvitationPromo } from "./invitationWelcomePromo";

type PendingAccount = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  role: "broker" | "master_broker";
  promo_code: string | null;
};

/** Manually approved, one-time re-invitation of the original, unactivated cohort.
 * This is NOT a retry of ambiguous historical day-3 reminder outcomes.
 * All sends require a fresh token, preserve the original courtesy and are
 * locked before contacting Resend. No registered account can be targeted.
 */
export const RECOVERY_MARKER = "invitationRecovery20261105";

export function isPendingInvitationRecoveryEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.RAILWAY_ENVIRONMENT_NAME === "production" &&
    env.INVITATION_RESEND_20261105_ENABLED === "enabled" &&
    env.NODE_ENV !== "test" &&
    Boolean(env.RESEND_API_KEY) &&
    Boolean(env.FRONTEND_BASE_URL?.startsWith("https://"));
}

export const PENDING_INVITATION_RECOVERY_SQL = `
  SELECT u.id,u.email,u.first_name,u.last_name,u.role,
         NULLIF(u.profile_data->>'invitationPromoCode','') AS promo_code
  FROM public.users u
  WHERE u.role IN ('broker','master_broker')
    AND u.password IS NULL
    AND u.status='active'
    AND u.is_active IS DISTINCT FROM FALSE
    AND COALESCE(u.profile_data->>'invitationFollowupPaused','false') <> 'true'
    AND NOT (COALESCE(u.profile_data,'{}'::jsonb) ? 'invitationRecovery20261105')
    AND EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.type='broker_invitation_sent'
        AND n.data->>'brokerId'=u.id
    )
  ORDER BY u.created_at ASC
  LIMIT 250
`;

export const CLAIM_INVITATION_RECOVERY_SQL = `
  UPDATE public.users
  SET reset_token=$2,
      reset_token_expiry=$3,
      updated_at=NOW(),
      profile_data=jsonb_set(
        COALESCE(profile_data,'{}'::jsonb),
        '{invitationRecovery20261105}',
        jsonb_build_object('status','claimed','at',NOW()),true
      )
  WHERE id=$1
    AND role IN ('broker','master_broker')
    AND password IS NULL
    AND status='active'
    AND is_active IS DISTINCT FROM FALSE
    AND COALESCE(profile_data->>'invitationFollowupPaused','false') <> 'true'
    AND NOT (COALESCE(profile_data,'{}'::jsonb) ? 'invitationRecovery20261105')
  RETURNING id
`;

export async function dispatchOneTimePendingInvitations(): Promise<{
  eligible: number; sent: number; failed: number; skipped: number;
}> {
  const totals = { eligible: 0, sent: 0, failed: 0, skipped: 0 };
  if (!isPendingInvitationRecoveryEnabled()) return totals;

  const { rows } = await pool.query<PendingAccount>(PENDING_INVITATION_RECOVERY_SQL);
  totals.eligible = rows.length;
  for (const user of rows) {
    try {
      // Ensure the originally offered courtesy is still valid before claiming.
      // Do not silently remove a benefit when re-sending an invitation.
      const courtesy = user.promo_code ?
        await resolveOptionalInvitationPromo(user.promo_code, user.role) : null;
      const token = randomBytes(32).toString("hex");
      const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const claim = await pool.query(CLAIM_INVITATION_RECOVERY_SQL, [user.id,token,expires]);
      if (!claim.rowCount) { totals.skipped++; continue; }
      let result: {success:boolean;error?:string;providerMessageId?:string};
      try {
        const name = [user.first_name,user.last_name].filter(Boolean).join(" ");
        result = await sendAccountInvitationEmail(
          user.email,token,user.role,name||undefined,undefined,courtesy||undefined
        );
      } catch {
        result = {success:false,error:"SEND_UNAVAILABLE"};
      }
      // Once claimed, never repeat automatically, even if provider result or
      // audit update is ambiguous. The claim protects against deploy restarts.
      try {
        await pool.query(`
          UPDATE public.users
          SET profile_data=jsonb_set(
                COALESCE(profile_data,'{}'::jsonb),
                '{invitationRecovery20261105}',
                jsonb_build_object(
                  'status',$2::text,
                  'at',NOW(),
                  'providerMessageId',$3::text,
                  'errorCode',$4::text
                ),true
              ),
              updated_at=NOW()
          WHERE id=$1
            AND profile_data->'invitationRecovery20261105'->>'status'='claimed'
        `,[user.id,result.success?"sent":"failed",
          result.providerMessageId||null,
          result.success?null:(result.error||"UNKNOWN").slice(0,150)]);
      } catch {
        console.error("[INVITATION-RECOVERY] Audit update failed; not retrying send");
      }
      if (result.success) totals.sent++;
      else totals.failed++;
    } catch {
      // A preclaim error is safely distinguishable from a mail attempt.
      totals.failed++;
      console.error("[INVITATION-RECOVERY] Recipient not processed (details withheld)");
    }
  }
  console.info("[INVITATION-RECOVERY] Batch finished",totals);
  return totals;
}
