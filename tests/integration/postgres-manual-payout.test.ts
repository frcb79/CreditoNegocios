import pg from "pg";
import { db } from "../../server/db";
import { commissions, commissionAuditLogs } from "../../shared/schema";
import { DbStorage } from "../../server/dbStorage";
import { eq } from "drizzle-orm";
import { assertSafeIsolatedTestDatabase } from "../testDbSafety";

const testUrl = process.env.TEST_DATABASE_URL;
if (testUrl) assertSafeIsolatedTestDatabase(testUrl);
const describePg = testUrl ? describe : describe.skip;

describePg("Manual payout: PostgreSQL ACID and concurrency", () => {
  let pool: pg.Pool;
  type Payload = Parameters<DbStorage["recordManualCommissionPayment"]>[0];
  const settle = (params: Payload) => DbStorage.prototype.recordManualCommissionPayment(params);

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: testUrl });
    // Only CI's TEST_DATABASE_URL can reach this destructive fixture.
    await pool.query("DROP TABLE IF EXISTS commission_audit_logs CASCADE");
    await pool.query("DROP TABLE IF EXISTS commissions CASCADE");
    await pool.query(`CREATE TABLE commissions (
      id varchar PRIMARY KEY, tenant_id varchar, credit_id varchar NOT NULL,
      broker_id varchar NOT NULL, master_broker_id varchar, commission_type varchar,
      institution_product_id varchar, version_number integer, amount numeric(15,2) NOT NULL, broker_share numeric(15,2),
      master_broker_share numeric(15,2), app_share numeric(15,2),
      frozen_amount numeric(15,2), status varchar NOT NULL,
      approved_at timestamp, approved_by varchar, paid_at timestamp,
      paid_by varchar, payment_method varchar, clabe varchar, bank_name varchar,
      account_holder varchar, idempotency_key varchar, tracking_key varchar,
      provider_response jsonb DEFAULT '{}', notes text,
      created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now()
    )`);
    await pool.query(`CREATE TABLE commission_audit_logs (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      commission_id varchar NOT NULL, action varchar NOT NULL,
      performed_by varchar, previous_status varchar,
      new_status varchar, details jsonb DEFAULT '{}',
      created_at timestamp DEFAULT now()
    )`);
  });
  afterAll(async () => { await pool?.end(); });

  async function seed(id: string) {
    await pool.query(`INSERT INTO commissions
      (id, credit_id, broker_id, commission_type, amount, broker_share,
       frozen_amount, status, approved_at, approved_by)
      VALUES ($1, 'credit-test', 'broker-test', 'apertura', 300, 200,
              200, 'approved', now(), 'super-admin-test')`, [id]);
    const [creditCommission] = await db.select().from(commissions).where(eq(commissions.id, id));
    return creditCommission;
  }
  function input(expected: Awaited<ReturnType<typeof seed>>, reference: string): Payload {
    return {
      commissionId: expected.id, expected,
      updates: {
        status: "paid", trackingKey: reference,
        paidBy: "super-admin-test", paidAt: new Date(),
        paymentMethod: "manual", notes: "SPEI revisado por Super Admin",
      },
      audit: {
        commissionId: expected.id, performedBy: "super-admin-test",
        action: "marked_paid_manually", details: { reference },
      },
    };
  }

  it("two concurrent requests commit only one payment and one audit row", async () => {
    const original = await seed("pg-manual-dupe");
    const outcomes = await Promise.all([
      settle(input(original, "PG-REF-TEST-1")),
      settle(input(original, "PG-REF-TEST-1")),
    ]);
    expect(outcomes.map(x => x.alreadyPaid).sort()).toEqual([false, true]);
    const logs = await db.select().from(commissionAuditLogs).where(eq(commissionAuditLogs.commissionId, original.id));
    expect(logs).toHaveLength(1);
  });

  it("if audit fails, the paid status and bank reference roll back", async () => {
    const original = await seed("pg-manual-rollback");
    await pool.query(`CREATE FUNCTION pg_fail_manual_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.commission_id = 'pg-manual-rollback' THEN
        RAISE EXCEPTION 'injected audit failure';
      END IF; RETURN NEW; END $$`);
    await pool.query(`CREATE TRIGGER pg_fail_manual_audit_trigger
      BEFORE INSERT ON commission_audit_logs
      FOR EACH ROW EXECUTE FUNCTION pg_fail_manual_audit()`);
    try {
      // Newer Drizzle wraps PostgreSQL errors in DrizzleQueryError with
      // `cause`. Verify the original trigger error through that chain, then
      // independently assert ACID rollback of the payment and bank reference.
      const failure = await settle(input(original, "PG-REF-TEST-2")).then(
        () => null,
        (error: unknown) => error,
      );
      expect(failure).toBeInstanceOf(Error);
      const messages: string[] = [];
      let current: unknown = failure;
      for (let depth = 0; current instanceof Error && depth < 6; depth++) {
        messages.push(current.message);
        current = (current as Error & { cause?: unknown }).cause;
      }
      expect(messages.join(" | caused by: ")).toMatch(/injected audit failure/);
      const [stored] = await db.select().from(commissions).where(eq(commissions.id, original.id));
      expect(stored.status).toBe("approved");
      expect(stored.trackingKey).toBeNull();
    } finally {
      await pool.query("DROP TRIGGER pg_fail_manual_audit_trigger ON commission_audit_logs");
      await pool.query("DROP FUNCTION pg_fail_manual_audit()");
    }
  });

  it("rejects payout when an approved amount changed since validation", async () => {
    const original = await seed("pg-manual-stale");
    await pool.query("UPDATE commissions SET frozen_amount=199 WHERE id=$1", [original.id]);
    await expect(settle(input(original, "PG-REF-TEST-3"))).rejects.toThrow("MANUAL_PAYOUT_STALE_REVIEW");
    const [stored] = await db.select().from(commissions).where(eq(commissions.id, original.id));
    expect(stored.status).toBe("approved");
  });

  it("a bank reference cannot pay two different commissions", async () => {
    const a = await seed("pg-manual-ref-a");
    const b = await seed("pg-manual-ref-b");
    await settle(input(a, "PG-REF-TEST-4"));
    await expect(settle(input(b, "PG-REF-TEST-4"))).rejects.toThrow("MANUAL_PAYOUT_DUPLICATE_BANK_REFERENCE");
  });

  it("concurrent payments with one reference cannot double-settle", async () => {
    const a = await seed("pg-manual-cross-a");
    const b = await seed("pg-manual-cross-b");
    const results = await Promise.allSettled([
      settle(input(a, "PG-REF-TEST-5")), settle(input(b, "PG-REF-TEST-5")),
    ]);
    expect(results.filter(x => x.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(x => x.status === "rejected")).toHaveLength(1);
  });
});
