import { createHmac } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseResendDeliveryEvent, verifyResendSignature } from "../../server/resendDeliveryWebhook";
import { EMAIL_DELIVERY_AUDIT_SQL } from "../../server/emailDeliveryAuditRoutes";

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
  it("correlates events with outbound messages, de-duplicates and prioritizes bounces", async () => {
    const pg = await PGlite.create();
    try {
      await pg.exec(`
        CREATE TABLE public.users (id varchar PRIMARY KEY,email varchar,first_name varchar,last_name varchar,role varchar);
        CREATE TABLE public.broker_activation_welcome_events
          (user_id varchar PRIMARY KEY,status varchar,provider_message_id varchar,
           created_at timestamp default now(),sent_at timestamp);
        CREATE TABLE public.broker_invitation_reminder_events
          (user_id varchar,reminder_day smallint,status varchar,provider_message_id varchar,
           created_at timestamp default now(),sent_at timestamp,
           PRIMARY KEY(user_id,reminder_day));
        CREATE TABLE public.notifications (id varchar PRIMARY KEY,type varchar,data jsonb,created_at timestamp default now());
        CREATE TABLE public.resend_delivery_events
          (event_id varchar PRIMARY KEY,provider_message_id varchar,event_type varchar,
           occurred_at timestamp,received_at timestamp default now());
        INSERT INTO public.users(id,email,first_name,last_name,role)
          VALUES('broker-a','broker@example.test','Eva','Broker','broker');
        INSERT INTO public.resend_delivery_events(event_id,provider_message_id,event_type,occurred_at)
          VALUES ('event-2','email-welcome','email.bounced',NOW());
        INSERT INTO public.broker_activation_welcome_events(user_id,status,provider_message_id)
          VALUES('broker-a','sent','email-welcome');
        INSERT INTO public.broker_invitation_reminder_events(user_id,reminder_day,status,provider_message_id)
          VALUES('broker-a',15,'sent','email-reminder');
        INSERT INTO public.notifications(id,type,data)
          VALUES('invite-1','broker_invitation_sent',
                 '{"brokerId":"broker-a","resendMessageId":"email-invitation"}');
        INSERT INTO public.resend_delivery_events(event_id,provider_message_id,event_type,occurred_at)
          VALUES('event-1','email-welcome','email.delivered',NOW());
        INSERT INTO public.resend_delivery_events(event_id,provider_message_id,event_type,occurred_at)
          VALUES('event-3','email-invitation','email.delivered',NOW());
      `);
      await pg.query(
        "INSERT INTO public.resend_delivery_events(event_id,provider_message_id,event_type,occurred_at) " +
        "VALUES ($1,$2,'email.delivered',NOW()) ON CONFLICT(event_id) DO NOTHING",
        ["event-1","email-welcome"],
      );
      const count = await pg.query<{ count: number }>("SELECT count(*)::int AS count FROM public.resend_delivery_events");
      expect(count.rows[0].count).toBe(3);
      const rows = (await pg.query<any>(EMAIL_DELIVERY_AUDIT_SQL)).rows;
      expect(rows).toHaveLength(3);
      expect(rows.find(x => x.kind === "welcome")?.eventType).toBe("email.bounced");
      expect(rows.find(x => x.kind === "reminder")?.eventType).toBeNull();
      expect(rows.find(x => x.kind === "reminder")?.providerMessageId).toBe("email-reminder");
      expect(rows.find(x => x.kind === "invitation")?.eventType).toBe("email.delivered");
      expect(rows.every(x => x.email === "broker@example.test")).toBe(true);
    } finally { await pg.close(); }
  });

});
