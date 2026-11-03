/** SQL regression test: in-memory PostgreSQL only, never connects to production or sends email. */
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
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
    const sent = await pg.query(REMINDER_OUTCOME_SQL, ["new-sent", 3, "sent", "", true]);
    assert.equal(sent.affectedRows, 1, "the result UPDATE must parse and execute");
    const sentState = (await pg.query<{status:string; sent_at:Date|null;last_error:string|null}>(
      "SELECT status,sent_at,last_error FROM public.broker_invitation_reminder_events WHERE user_id='new-sent'"
    )).rows[0];
    assert.equal(sentState.status, "sent");
    assert.ok(sentState.sent_at);
    assert.equal(sentState.last_error, null);
    assert.equal(await claim("new-sent", 3), 0, "confirmed sends must never repeat");
    assert.equal(await claim("new-failed", 7), 1);
    await pg.query(REMINDER_OUTCOME_SQL, ["new-failed", 7, "failed", "Recipient rejected", false]);
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
