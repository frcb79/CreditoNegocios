import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseResendDeliveryEvent, verifyResendSignature } from "../../server/resendDeliveryWebhook";
import { EMAIL_DELIVERY_AUDIT_SQL } from "../../server/emailDeliveryAuditRoutes";
import { PILOT_WELCOME_TARGETS, isPilotWelcomeEnabled } from "../../server/oneTimeHistoricWelcomePilot";

const key = Buffer.from("unit-test-svix-secret-material-2026");
const secret = "whsec_" + key.toString("base64");
const eventId = "msg_resend_test_001";
const timestamp = String(Math.floor(Date.now() / 1000));
const raw = Buffer.from(JSON.stringify({
  type: "email.delivered", created_at: "2026-11-04T12:00:00.000Z",
  data: { email_id: "email-123", to: ["broker@example.test"], subject: "private" },
}));
function sign(payload: Buffer, ts = timestamp, id = eventId) {
  return "v1," + createHmac("sha256", key).update(Buffer.concat([
    Buffer.from(id + "." + ts + "."), payload,
  ])).digest("base64");
}
const source = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("Resend delivery audit: signed events only", () => {
  it("validates the unchanged raw bytes, Svix timestamp and signature", () => {
    const headers = { id: eventId, timestamp, signature: sign(raw) };
    expect(verifyResendSignature(raw, headers, secret)).toBe(true);
    const modified = Buffer.from(raw.toString("utf8").replace("email.delivered", "email.bounced"));
    expect(verifyResendSignature(modified, headers, secret)).toBe(false);
    expect(verifyResendSignature(raw, { ...headers, signature: "v1,not-valid" }, secret)).toBe(false);
    expect(verifyResendSignature(raw, headers, "invalid-secret")).toBe(false);
    expect(verifyResendSignature(raw, { ...headers, id: "msg-other" }, secret)).toBe(false);
    const past = String(Number(timestamp) - 301);
    expect(verifyResendSignature(raw, { id: eventId, timestamp: past, signature: sign(raw, past) }, secret)).toBe(false);
  });
  it("parses only supported delivery events and ignores raw body PII", () => {
    expect(parseResendDeliveryEvent(eventId, raw)).toEqual({
      eventId, providerMessageId: "email-123",
      eventType: "email.delivered", occurredAt: new Date("2026-11-04T12:00:00.000Z"),
    });
    expect(parseResendDeliveryEvent(eventId, Buffer.from("{}"))).toBeNull();
    expect(parseResendDeliveryEvent(eventId, Buffer.from("{broken"))).toBeNull();
    expect(parseResendDeliveryEvent(eventId, Buffer.from(JSON.stringify({
      type: "email.opened", created_at: "2026-11-04T12:00:00.000Z", data: { email_id: "email-123" },
    })))).toBeNull();
    expect(parseResendDeliveryEvent("fake id", raw)).toBeNull();
  });
  it("keeps original body before JSON parser and restricts admin visibility", () => {
    const server = source("server/index.ts");
    expect(server.indexOf("registerResendWebhook(app)")).toBeLessThan(server.indexOf("app.use(express.json())"));
    const handler = source("server/resendDeliveryWebhook.ts");
    expect(handler).toContain("express.raw(");
    expect(handler).toContain('ON CONFLICT (event_id) DO NOTHING');
    expect(handler).not.toContain("JSON.stringify(req.body)");
    const api = source("server/emailDeliveryAuditRoutes.ts");
    expect(api).toContain('caller.role !== "super_admin"');
    expect(api).toContain('isAuthenticated');
    expect(api).toContain('"private, no-store"');
    expect(EMAIL_DELIVERY_AUDIT_SQL).toContain("LEFT JOIN LATERAL");
    expect(EMAIL_DELIVERY_AUDIT_SQL).toContain("COALESCE(r.claimed_at,r.updated_at,r.sent_at) AS created_at");
    expect(EMAIL_DELIVERY_AUDIT_SQL).not.toContain("r.created_at");
    expect(EMAIL_DELIVERY_AUDIT_SQL.indexOf("'email.complained'")).toBeGreaterThan(-1);
    expect(EMAIL_DELIVERY_AUDIT_SQL).toContain("LIMIT 200");
    expect(EMAIL_DELIVERY_AUDIT_SQL).not.toContain("reset_token");
  });
  it("keeps a private, idempotent persistence model and no secret content", () => {
    const migration = source("server/autoMigrate.ts");
    expect(migration).toContain("resend_delivery_events");
    expect(migration).toContain("event_id VARCHAR(150) PRIMARY KEY");
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("REVOKE ALL ON public.resend_delivery_events FROM PUBLIC");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS provider_message_id");
    const reminders = source("server/brokerInvitationReminders.ts");
    expect(reminders).toContain("provider_message_id=CASE WHEN $5::boolean THEN $6::varchar");
    const invites = source("server/brokerInvitationDispatch.ts");
    expect(invites).toContain("resendMessageId: delivered.providerMessageId");
    const welcome = source("server/commercialWelcomeService.ts");
    expect(welcome).toContain("provider_message_id=$2");
    const audit = source("client/src/pages/SuperAdminAudit.tsx");
    expect(audit).toContain('value="email"');
    const component = source("client/src/components/EmailDeliveryAudit.tsx");
    expect(component).toContain("Entregado al servidor");
    expect(component).toContain("Histórico sin seguimiento");
  });

  it("allows a production pilot for only the two explicitly authorized registered accounts", () => {
    expect(PILOT_WELCOME_TARGETS).toEqual([
      { email:"fcb@creditonegocios.com.mx",role:"master_broker" },
      { email:"fcb@10xteam.com.mx",role:"broker" },
    ]);
    const settings = {RAILWAY_ENVIRONMENT_NAME:"production", MAIL_PILOT_20261104_ENABLED:"enabled",
      RESEND_API_KEY:"test-not-a-real-key", NODE_ENV:"production"};
    expect(isPilotWelcomeEnabled(settings)).toBe(true);
    expect(isPilotWelcomeEnabled({...settings,RAILWAY_ENVIRONMENT_NAME:"staging"})).toBe(false);
    expect(isPilotWelcomeEnabled({...settings,MAIL_PILOT_20261104_ENABLED:"disabled"})).toBe(false);
    expect(isPilotWelcomeEnabled({...settings,NODE_ENV:"test"})).toBe(false);
    expect(isPilotWelcomeEnabled({...settings,RESEND_API_KEY:""})).toBe(false);
    const sourceText=source("server/oneTimeHistoricWelcomePilot.ts");
    expect(sourceText).toContain("ON CONFLICT(user_id) DO NOTHING");
    expect(sourceText).toContain("dispatchCommercialActivationWelcome(id)");
    expect(sourceText).not.toContain("SELECT id FROM public.users");
  });

});
