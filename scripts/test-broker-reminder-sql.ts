/** SQL regression test: in-memory PostgreSQL only, never connects to production or sends email. */
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { BROKER_INVITATION_DAY_15_MIGRATION_SQL } from "../server/brokerInvitationReminderSchema";
import {
  REMINDER_CLAIM_SQL, REMINDER_OUTCOME_SQL, UNCERTAIN_REMINDER_PREFIX,
} from "../server/brokerInvitationReminders";

test("reminder result SQL and retry boundaries in isolated PostgreSQL", async () => {
  const pg = await PGlite.create();
  try {
    await pg.exec(`
      CREATE TABLE public.broker_invitation_reminder_events (
        user_id varchar NOT NULL,
        reminder_day smallint NOT NULL CHECK (reminder_day IN (3,7,12)),
        status varchar(16) NOT NULL DEFAULT 'claimed'
          CHECK (status IN ('claimed','sent','failed','skipped')),
        claimed_at timestamp NOT NULL DEFAULT NOW(),
        sent_at timestamp,
        updated_at timestamp NOT NULL DEFAULT NOW(),
        last_error text,
        PRIMARY KEY (user_id, reminder_day)
      );
    `);
    // Preserve historic D12 events; permit D15 without unlocking other days.
    await pg.query("INSERT INTO public.broker_invitation_reminder_events (user_id,reminder_day) VALUES ($1,12)", ["existing-d12"]);
    await pg.exec("ALTER TABLE public.broker_invitation_reminder_events ADD COLUMN provider_message_id VARCHAR(255)");
    await pg.exec(BROKER_INVITATION_DAY_15_MIGRATION_SQL);
    await pg.exec(BROKER_INVITATION_DAY_15_MIGRATION_SQL);
    const existing = await pg.query("SELECT reminder_day FROM public.broker_invitation_reminder_events WHERE user_id=$1", ["existing-d12"]);
    assert.equal(existing.rows.length, 1, "historic events must be kept");
    assert.equal((existing.rows[0] as any).reminder_day, 12);
    const day15 = await pg.query("INSERT INTO public.broker_invitation_reminder_events (user_id,reminder_day,status) VALUES ($1,15,'claimed') RETURNING reminder_day", ["new-day-15"]);
    assert.equal(day15.rows.length, 1);
    await assert.rejects(pg.query("INSERT INTO public.broker_invitation_reminder_events (user_id,reminder_day) VALUES ($1,14)", ["invalid-day-14"]));
    const oldFailure = "inconsistent types deduced for parameter $3";
    for (const [userId, error, ageHours] of [
      ["legacy", oldFailure, 48],
      ["unknown", UNCERTAIN_REMINDER_PREFIX + " persistence timeout", 48],
      ["provider-failed", "Provider temporarily unavailable", 22],
      ["recent-failure", "Provider temporarily unavailable", 19],
    ] as const) {
      await pg.query(
        `INSERT INTO public.broker_invitation_reminder_events
          (user_id,reminder_day,status,updated_at,last_error)
         VALUES ($1,3,'failed',NOW()-($2::int * INTERVAL '1 hour'),$3)`,
        [userId, ageHours, error],
      );
    }
    const claim = async (userId: string, day: number) =>
      (await pg.query(REMINDER_CLAIM_SQL, [userId, day])).rows.length;
    assert.equal(await claim("legacy", 3), 0, "historic SQL failures may have reached Resend");
    assert.equal(await claim("unknown", 3), 0, "unknown post-dispatch state must not retry");
    assert.equal(await claim("recent-failure", 3), 0, "ordinary failure retries only after 20h");
    assert.equal(await claim("provider-failed", 3), 1, "known provider failures may retry");
    assert.equal(await claim("provider-failed", 3), 0, "an active claim cannot duplicate dispatch");
    assert.equal(await claim("new-sent", 3), 1);
    const sent = await pg.query(REMINDER_OUTCOME_SQL, ["new-sent", 3, "sent", "", true, "message-accepted-123"]);
    assert.equal(sent.affectedRows, 1, "the result UPDATE must parse and execute");
    const sentState = (await pg.query<{status:string; sent_at:Date|null;last_error:string|null;provider_message_id:string|null}>(
      "SELECT status,sent_at,last_error,provider_message_id FROM public.broker_invitation_reminder_events WHERE user_id='new-sent'"
    )).rows[0];
    assert.equal(sentState.status, "sent");
    assert.ok(sentState.sent_at);
    assert.equal(sentState.last_error, null);
    assert.equal(sentState.provider_message_id, "message-accepted-123", "Resend identifier is stored with send outcome");
    assert.equal(await claim("new-sent", 3), 0, "confirmed sends must never repeat");
    assert.equal(await claim("new-failed", 7), 1);
    await pg.query(REMINDER_OUTCOME_SQL, ["new-failed", 7, "failed", "Recipient rejected", false, null]);
    const failedState = (await pg.query<{status:string;sent_at:Date|null;last_error:string|null}>(
      "SELECT status,sent_at,last_error FROM public.broker_invitation_reminder_events WHERE user_id='new-failed'"
    )).rows[0];
    assert.equal(failedState.status, "failed");
    assert.equal(failedState.sent_at, null);
    assert.equal(failedState.last_error, "Recipient rejected");
  } finally {
    await pg.close();
  }
});
