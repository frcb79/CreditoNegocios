/** Isolated SQL regression: runs with Node/tsx, never with Jest's VM loader. */
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { EMAIL_DELIVERY_AUDIT_SQL } from "../server/emailDeliveryAuditRoutes";

test("Resend delivery audit handles duplicate and out-of-order events", async () => {
  const pg = await PGlite.create();
  try {
    await pg.exec(`
      CREATE TABLE public.users (id varchar PRIMARY KEY,email varchar,first_name varchar,last_name varchar,role varchar,profile_data jsonb,updated_at timestamp default now());
      CREATE TABLE public.broker_activation_welcome_events
        (user_id varchar PRIMARY KEY,status varchar,provider_message_id varchar,
         created_at timestamp default now(),sent_at timestamp);
      CREATE TABLE public.broker_invitation_reminder_events
        (user_id varchar,reminder_day smallint,status varchar,provider_message_id varchar,
         claimed_at timestamp default now(),updated_at timestamp default now(),sent_at timestamp,last_error text,
         PRIMARY KEY(user_id,reminder_day));
      CREATE TABLE public.notifications (id varchar PRIMARY KEY,type varchar,data jsonb,created_at timestamp default now());
      CREATE TABLE public.resend_delivery_events
        (event_id varchar PRIMARY KEY,provider_message_id varchar,event_type varchar,
         occurred_at timestamp,received_at timestamp default now());
      INSERT INTO public.users(id,email,first_name,last_name,role)
        VALUES('broker-a','broker@example.test','Eva','Broker','broker');
      INSERT INTO public.users(id,email,first_name,last_name,role,profile_data)
        VALUES('broker-b','reinvited@example.test','Berta','Broker','broker',
          '{"invitationRecovery20261105":{"status":"sent","providerMessageId":"email-reinvite","at":"2026-11-05T03:00:00.000Z"}}');
      -- A webhook can precede persistence of the outgoing mail's provider ID.
      INSERT INTO public.resend_delivery_events(event_id,provider_message_id,event_type,occurred_at)
        VALUES ('event-2','email-welcome','email.bounced',NOW());
      INSERT INTO public.broker_activation_welcome_events(user_id,status,provider_message_id)
        VALUES('broker-a','sent','email-welcome');
      INSERT INTO public.broker_invitation_reminder_events(user_id,reminder_day,status,provider_message_id)
        VALUES('broker-a',15,'sent','email-reminder');
      INSERT INTO public.broker_invitation_reminder_events(user_id,reminder_day,status,provider_message_id,last_error)
        VALUES('broker-a',3,'failed',NULL,'inconsistent types deduced for parameter $3');
      INSERT INTO public.notifications(id,type,data)
        VALUES('invite-1','broker_invitation_sent',
               '{"brokerId":"broker-a","resendMessageId":"email-invitation"}');
      INSERT INTO public.resend_delivery_events(event_id,provider_message_id,event_type,occurred_at)
        VALUES('event-1','email-welcome','email.delivered',NOW());
      INSERT INTO public.resend_delivery_events(event_id,provider_message_id,event_type,occurred_at)
        VALUES('event-3','email-invitation','email.delivered',NOW());
      INSERT INTO public.resend_delivery_events(event_id,provider_message_id,event_type,occurred_at)
        VALUES('event-4','email-reinvite','email.delivered',NOW());
      INSERT INTO public.resend_delivery_events(event_id,provider_message_id,event_type,occurred_at)
        VALUES('event-5','email-orphan','email.suppressed',NOW());
    `);
    const duplicate = await pg.query(
      "INSERT INTO public.resend_delivery_events(event_id,provider_message_id,event_type,occurred_at) " +
      "VALUES ($1,$2,'email.delivered',NOW()) ON CONFLICT(event_id) DO NOTHING",
      ["event-1","email-welcome"],
    );
    assert.equal(duplicate.affectedRows, 0, "replayed event does not insert a second row");
    const count = await pg.query<{ count: number }>("SELECT count(*)::int AS count FROM public.resend_delivery_events");
    assert.equal(count.rows[0].count, 5);
    const rows = (await pg.query<any>(EMAIL_DELIVERY_AUDIT_SQL)).rows;
    assert.equal(rows.length, 6);
    assert.equal(rows.find(x => x.kind === "welcome")?.eventType, "email.bounced");
    assert.equal(rows.find(x => x.kind === "reminder" && x.reminderDay === 15)?.eventType, null);
    assert.equal(rows.find(x => x.kind === "reminder" && x.reminderDay === 3)?.dispatchStatus, "uncertain");
    assert.equal(rows.find(x => x.kind === "reminder" && x.reminderDay === 15)?.providerMessageId, "email-reminder");
    assert.equal(rows.find(x => x.kind === "invitation")?.eventType, "email.delivered");
    assert.equal(rows.find(x => x.kind === "reinvitation")?.eventType, "email.delivered");
    assert.equal(rows.find(x => x.kind === "reinvitation")?.email, "reinvited@example.test");
    assert.equal(rows.find(x => x.kind === "provider_only")?.eventType, "email.suppressed");
    assert.equal(rows.find(x => x.kind === "provider_only")?.email, null);
    assert.equal(rows.filter(x => x.kind === "provider_only").length, 1);
    assert.ok(rows.filter(x => x.kind !== "provider_only").every(x =>
      ["broker@example.test", "reinvited@example.test"].includes(x.email)));
  } finally { await pg.close(); }
});
