import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  isPendingInvitationRecoveryEnabled, PENDING_INVITATION_RECOVERY_SQL,
  CLAIM_INVITATION_RECOVERY_SQL, RECOVERY_MARKER,
} from "../../server/oneTimePendingInvitationRecovery";

import { isHistoricalWelcomeRemainderEnabled } from "../../server/oneTimeHistoricalWelcomeRemainder";

const source = (path:string) => readFileSync(resolve(process.cwd(),path),"utf8");

describe("One-time broker invitation resend: pending recipients only",()=>{
  const ok={
    RAILWAY_ENVIRONMENT_NAME:"production",
    INVITATION_RESEND_20261105_ENABLED:"enabled",
    RESEND_API_KEY:"only-a-test-value",
    FRONTEND_BASE_URL:"https://app.creditonegocios.com.mx",
    NODE_ENV:"production",
  };
  it("requires a strict opt-in, production and configured HTTPS transport",()=>{
    expect(isPendingInvitationRecoveryEnabled(ok)).toBe(true);
    for(const override of [
      {RAILWAY_ENVIRONMENT_NAME:"staging"},
      {INVITATION_RESEND_20261105_ENABLED:"disabled"},
      {RESEND_API_KEY:""},
      {FRONTEND_BASE_URL:"http://localhost:3000"},
      {NODE_ENV:"test"},
    ]) expect(isPendingInvitationRecoveryEnabled({...ok,...override})).toBe(false);
  });
  it("backfills only registered accounts not already covered by a welcome event",()=>{
    const enabled={RAILWAY_ENVIRONMENT_NAME:"production",
      WELCOME_REMAINDER_20261105_ENABLED:"enabled",RESEND_API_KEY:"test",NODE_ENV:"production"};
    expect(isHistoricalWelcomeRemainderEnabled(enabled)).toBe(true);
    expect(isHistoricalWelcomeRemainderEnabled({...enabled,RAILWAY_ENVIRONMENT_NAME:"staging"})).toBe(false);
    expect(isHistoricalWelcomeRemainderEnabled({...enabled,WELCOME_REMAINDER_20261105_ENABLED:"disabled"})).toBe(false);
    const src=source("server/oneTimeHistoricalWelcomeRemainder.ts");
    expect(src).toContain("u.password IS NOT NULL");
    expect(src).toContain("NOT EXISTS (");
    expect(src).toContain("ON CONFLICT(user_id) DO NOTHING RETURNING user_id");
    expect(src).toContain("dispatchCommercialActivationWelcome(user.id)");
  });
  it("queries only the originally invited, unactivated, active broker/master cohort",()=>{
    expect(PENDING_INVITATION_RECOVERY_SQL).toContain("u.password IS NULL");
    expect(PENDING_INVITATION_RECOVERY_SQL).toContain("u.is_active IS DISTINCT FROM FALSE");
    expect(PENDING_INVITATION_RECOVERY_SQL).toContain("u.status='active'");
    expect(PENDING_INVITATION_RECOVERY_SQL).toContain("invitationFollowupPaused");
    expect(PENDING_INVITATION_RECOVERY_SQL).toContain("n.type='broker_invitation_sent'");
    expect(PENDING_INVITATION_RECOVERY_SQL).toContain("('broker','master_broker')");
    expect(PENDING_INVITATION_RECOVERY_SQL).toContain(RECOVERY_MARKER);
  });
  it("uses a conditional atomic claim before sending, so deploy restarts cannot duplicate messages",()=>{
    const src=source("server/oneTimePendingInvitationRecovery.ts");
    expect(CLAIM_INVITATION_RECOVERY_SQL).toContain("WHERE id=$1");
    expect(CLAIM_INVITATION_RECOVERY_SQL).toContain("password IS NULL");
    expect(CLAIM_INVITATION_RECOVERY_SQL).toContain("NOT (COALESCE(profile_data");
    expect(CLAIM_INVITATION_RECOVERY_SQL).toContain("RETURNING id");
    expect(src.indexOf("pool.query(CLAIM_INVITATION_RECOVERY_SQL")).toBeLessThan(
      src.indexOf("sendAccountInvitationEmail("));
    expect(src).toContain("resolveOptionalInvitationPromo");
    expect(src).toContain("providerMessageId");
    expect(src).not.toContain("reset_token=$2, reset_token_expiry=NULL");
  });
  it("does not overwrite an unexpired invitation with a scheduled reminder",()=>{
    const src=source("server/brokerInvitationReminders.ts");
    expect(src).toContain("u.reset_token_expiry IS NULL OR u.reset_token_expiry <= NOW()");
    expect(src).toContain("reset_token_expiry IS NULL OR reset_token_expiry <= NOW()");
  });
});
