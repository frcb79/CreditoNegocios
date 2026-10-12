import pg from "pg";
import { db } from "../../server/db";
import { credits, commissions, commissionAuditLogs } from "../../shared/schema";
import { DbStorage } from "../../server/dbStorage";
import { eq } from "drizzle-orm";
import { assertSafeIsolatedTestDatabase } from "../testDbSafety";

const testUrl = process.env.TEST_DATABASE_URL;
if (testUrl) assertSafeIsolatedTestDatabase(testUrl);
const describePg = testUrl ? describe : describe.skip;

describePg("OPE-10/11: atomic and idempotent credit disbursements in PostgreSQL", () => {
  let pool: pg.Pool;
  type Payload = Parameters<DbStorage["confirmCreditDisbursementAtomic"]>[0];
  const settle = (p: Payload) => DbStorage.prototype.confirmCreditDisbursementAtomic(p);

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: testUrl });
    // All destructive fixtures require the isolated TEST_DATABASE_URL verified above.
    await pool.query("DROP TABLE IF EXISTS commission_audit_logs CASCADE");
    await pool.query("DROP TABLE IF EXISTS commissions CASCADE");
    await pool.query("DROP TABLE IF EXISTS credits CASCADE");
    await pool.query(`CREATE TABLE credits (
      id varchar PRIMARY KEY, tenant_id varchar, client_id varchar NOT NULL,
      broker_id varchar NOT NULL, created_by varchar, financial_institution_id varchar,
      product_template_id varchar, linked_submission_id varchar, amount numeric(15,2) NOT NULL,
      interest_rate numeric(5,2), term integer, frequency varchar, purpose text,
      status varchar NOT NULL DEFAULT 'draft', start_date date, end_date date,
      payment_amount numeric(15,2), remaining_balance numeric(15,2),
      payment_history jsonb DEFAULT '[]', amortization_table jsonb DEFAULT '[]',
      documents jsonb DEFAULT '[]', final_proposal jsonb DEFAULT '{}',
      mortgage_data jsonb DEFAULT '{}', origin_master_broker_id varchar,
      notes text, created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now()
    )`);
    await pool.query(`CREATE TABLE commissions (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id varchar,
      credit_id varchar NOT NULL REFERENCES credits(id),
      broker_id varchar NOT NULL, master_broker_id varchar, commission_type varchar,
      amount numeric(15,2) NOT NULL, broker_share numeric(15,2),
      master_broker_share numeric(15,2), app_share numeric(15,2),
      frozen_amount numeric(15,2), status varchar NOT NULL,
      approved_at timestamp, approved_by varchar, paid_at timestamp,
      paid_by varchar, payment_method varchar, clabe varchar, bank_name varchar,
      account_holder varchar, idempotency_key varchar UNIQUE, tracking_key varchar,
      provider_response jsonb DEFAULT '{}', notes text,
      created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now(),
      UNIQUE(credit_id,commission_type)
    )`);
    await pool.query(`CREATE TABLE commission_audit_logs (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      commission_id varchar NOT NULL REFERENCES commissions(id),
      action varchar NOT NULL, performed_by varchar,
      previous_status varchar, new_status varchar, details jsonb DEFAULT '{}',
      created_at timestamp DEFAULT now()
    )`);
  });
  afterAll(async () => { await pool?.end(); });

  async function seed(id: string, amount = 10000, masterId: string | null = null) {
    await pool.query(`INSERT INTO credits
      (id,client_id,broker_id,financial_institution_id,amount,status,origin_master_broker_id,final_proposal)
      VALUES ($1,'test-client','test-broker','test-financial',$2,'approved',$3,
        '{"commissionRates":{"financiera":{"apertura":5},"broker":{"apertura":2}}}'::jsonb)`,
      [id,amount,masterId]);
    const [credit] = await db.select().from(credits).where(eq(credits.id,id));
    return credit;
  }
  function requestFor(credit: Awaited<ReturnType<typeof seed>>,
      amount: number, index: number, key: string | null = null): Payload {
    return {
      creditId: credit.id,
      expectedProposal: credit.finalProposal,
      expectedAmount: credit.amount,
      confirmedAmount: amount,
      dispersalIndex: index,
      commission: {
        creditId: credit.id,
        brokerId: credit.brokerId,
        masterBrokerId: credit.originMasterBrokerId,
        commissionType: `apertura_parcial_${index}`,
        amount: (amount * 0.05).toFixed(2),
        brokerShare: (amount * 0.02).toFixed(2),
        masterBrokerShare: "0.00",
        appShare: (amount * 0.03).toFixed(2),
        status: "generated",
        idempotencyKey: key,
      },
      performedBy: "super-admin-test",
      actorEmail: "admin@example.test",
      idempotencyKey: key,
    };
  }
  async function creditState(id: string) {
    const [c] = await db.select().from(credits).where(eq(credits.id,id));
    return c;
  }

  it("serializes two identical confirmations, creating one commission and two audit records", async () => {
    const credit = await seed("credit-dupe");
    const args = requestFor(credit,3000,1,"credit-dupe-key");
    const result = await Promise.all([settle(args),settle(args)]);
    expect(result.map(r=>r.alreadyConfirmed).sort()).toEqual([false,true]);
    const rows = await db.select().from(commissions).where(eq(commissions.creditId,credit.id));
    expect(rows).toHaveLength(1);
    const logs = await db.select().from(commissionAuditLogs).where(eq(commissionAuditLogs.commissionId,rows[0].id));
    expect(logs.map(l=>l.action).sort()).toEqual(["created","disbursement_confirmed"]);
    const stored = await creditState(credit.id);
    expect((stored.finalProposal as any).disbursementTranches).toHaveLength(1);
    expect((stored.finalProposal as any).disbursementTranches[0].commissionId).toBe(rows[0].id);
  });

  it("prevents over-disbursement with simultaneous DIFFERENT partialities", async () => {
    const credit = await seed("credit-max");
    const results = await Promise.allSettled([
      settle(requestFor(credit,6000,1)),
      settle(requestFor(credit,6000,2)),
    ]);
    expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
    expect(results.filter(r=>r.status==="rejected")).toHaveLength(1);
    const stored = await creditState(credit.id);
    expect((stored.finalProposal as any).confirmedDisbursedAmount).toBe(6000);
    const remainingAttempt = requestFor(stored,6000,2);
    await expect(settle(remainingAttempt)).rejects.toThrow("TOTAL_DISBURSEMENT_EXCEEDS_APPROVED_AMOUNT");
  });

  it("rolls back credit, commission and tranche if audit insertion fails", async () => {
    const credit = await seed("credit-audit-fail");
    await pool.query(`CREATE FUNCTION pg_credit_audit_fail() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.details->>'creditId' = 'credit-audit-fail' THEN
        RAISE EXCEPTION 'injected disbursement audit failure';
      END IF; RETURN NEW; END $$`);
    await pool.query(`CREATE TRIGGER pg_credit_audit_trigger BEFORE INSERT ON commission_audit_logs
      FOR EACH ROW EXECUTE FUNCTION pg_credit_audit_fail()`);
    try {
      await expect(settle(requestFor(credit,2000,1))).rejects.toThrow(/injected disbursement audit failure/);
      const stored = await creditState(credit.id);
      expect(stored.status).toBe("approved");
      expect((stored.finalProposal as any).disbursementTranches).toBeUndefined();
      const rows = await db.select().from(commissions).where(eq(commissions.creditId,credit.id));
      expect(rows).toHaveLength(0);
    } finally {
      await pool.query("DROP TRIGGER pg_credit_audit_trigger ON commission_audit_logs");
      await pool.query("DROP FUNCTION pg_credit_audit_fail()");
    }
  });

  it("rejects a changed commercial snapshot without creating a commission", async () => {
    const credit = await seed("credit-stale","10000" as any);
    await pool.query(`UPDATE credits SET final_proposal = '{"commissionRates":{"financiera":{"apertura":8}}}'::jsonb
      WHERE id='credit-stale'`);
    await expect(settle(requestFor(credit,1000,1))).rejects.toThrow("DISBURSEMENT_STALE_COMMERCIAL_SNAPSHOT");
  });

  it("does not allow one idempotency key to be reused on another credit", async () => {
    const a = await seed("credit-key-a"), b = await seed("credit-key-b");
    await settle(requestFor(a,500,1,"same-key-global"));
    await expect(settle(requestFor(b,500,1,"same-key-global")))
      .rejects.toThrow("DISBURSEMENT_DUPLICATE_IDEMPOTENCY_KEY");
  });

  it("does not alter a frozen tranche when a retry changes the amount", async () => {
    const c=await seed("credit-immutable");
    await settle(requestFor(c,1500,1,"immut-key"));
    const current=await creditState(c.id);
    await expect(settle(requestFor(current,1700,1,"immut-key")))
      .rejects.toThrow("DISBURSEMENT_TRANCHE_ALREADY_CONFIRMED");
  });
});
