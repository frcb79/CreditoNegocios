import pg from "pg";
import { db } from "../../server/db";
import {
  credits, commissions, commissionAuditLogs,
  creditSubmissionTargets, creditSubmissionRequests,
} from "../../shared/schema";
import { DbStorage } from "../../server/dbStorage";
import { eq } from "drizzle-orm";
import { assertSafeIsolatedTestDatabase } from "../testDbSafety";

const testUrl = process.env.TEST_DATABASE_URL;
if (testUrl) assertSafeIsolatedTestDatabase(testUrl);
const describePg = testUrl ? describe : describe.skip;

describePg("OPE-12: winning target and credit creation in one PostgreSQL transaction", () => {
  let pool: pg.Pool;
  type P = Parameters<DbStorage["confirmTargetDisbursementAtomic"]>[0];
  const settle = (p: P) => DbStorage.prototype.confirmTargetDisbursementAtomic(p);

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: testUrl });
    // Destructive DDL is restricted to an isolated TEST_DATABASE_URL, never Railway.
    for (const name of ["credit_submission_targets","credit_submission_requests","commission_audit_logs","commissions","credits"]) {
      await pool.query(`DROP TABLE IF EXISTS ${name} CASCADE`);
    }
    await pool.query(`CREATE TABLE credits (
      id varchar PRIMARY KEY, tenant_id varchar, client_id varchar NOT NULL,
      broker_id varchar NOT NULL, created_by varchar, financial_institution_id varchar,
      product_template_id varchar, linked_submission_id varchar,
      amount numeric(15,2) NOT NULL, interest_rate numeric(5,2), term integer,
      frequency varchar, purpose text, status varchar NOT NULL DEFAULT 'draft',
      start_date date, end_date date, payment_amount numeric(15,2),
      remaining_balance numeric(15,2), payment_history jsonb DEFAULT '[]',
      amortization_table jsonb DEFAULT '[]', documents jsonb DEFAULT '[]',
      final_proposal jsonb DEFAULT '{}', mortgage_data jsonb DEFAULT '{}',
      origin_master_broker_id varchar, notes text,
      created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now()
    )`);
    await pool.query(`CREATE TABLE credit_submission_requests (
      id varchar PRIMARY KEY, tenant_id varchar, client_id varchar NOT NULL,
      broker_id varchar NOT NULL, origin_master_broker_id varchar,
      created_by varchar, product_template_id varchar,
      requested_amount numeric(15,2) NOT NULL, purpose text, broker_notes text,
      mortgage_data jsonb DEFAULT '{}', status varchar DEFAULT 'pending_admin',
      created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now()
    )`);
    await pool.query(`CREATE TABLE credit_submission_targets (
      id varchar PRIMARY KEY, request_id varchar NOT NULL REFERENCES credit_submission_requests(id),
      financial_institution_id varchar NOT NULL, status varchar NOT NULL DEFAULT 'pending_admin',
      admin_notes text, details text, reviewed_by varchar, reviewed_at timestamp,
      institution_proposal jsonb DEFAULT '{}', proposal_received_at timestamp,
      proposal_document varchar, is_winner boolean DEFAULT false, dispersed_at timestamp,
      credit_id varchar REFERENCES credits(id),
      created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now()
    )`);
    await pool.query(`CREATE TABLE commissions (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id varchar,
      credit_id varchar NOT NULL REFERENCES credits(id), broker_id varchar NOT NULL,
      master_broker_id varchar, commission_type varchar,
      amount numeric(15,2) NOT NULL, broker_share numeric(15,2),
      master_broker_share numeric(15,2), app_share numeric(15,2),
      frozen_amount numeric(15,2), status varchar NOT NULL,
      approved_at timestamp, approved_by varchar, paid_at timestamp, paid_by varchar,
      payment_method varchar, clabe varchar, bank_name varchar, account_holder varchar,
      idempotency_key varchar UNIQUE, tracking_key varchar,
      provider_response jsonb DEFAULT '{}', notes text,
      created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now(),
      UNIQUE(credit_id,commission_type)
    )`);
    await pool.query(`CREATE TABLE commission_audit_logs (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      commission_id varchar NOT NULL REFERENCES commissions(id),
      action varchar NOT NULL, performed_by varchar, previous_status varchar,
      new_status varchar, details jsonb DEFAULT '{}', created_at timestamp DEFAULT now()
    )`);
  });
  afterAll(async () => { await pool?.end(); });

  async function seed(id: string, winner = true, historicalMaster: string | null = null) {
    const requestId = `request-${id}`;
    await pool.query(`INSERT INTO credit_submission_requests
      (id,client_id,broker_id,origin_master_broker_id,requested_amount,status)
      VALUES ($1,'test-client','test-broker',$2,10000,'approved')`, [requestId,historicalMaster]);
    const proposal = { approvedAmount: 8000, interestRate: 12, term: 24, commissionRates: {
      financiera: { apertura: 5 }, broker: { apertura: 2 }, masterBroker: { apertura: 1 },
    }};
    await pool.query(`INSERT INTO credit_submission_targets
      (id,request_id,financial_institution_id,status,is_winner,institution_proposal)
      VALUES ($1,$2,'test-financial','selected_winner',$3,$4::jsonb)`,
      [id,requestId,winner,JSON.stringify(proposal)]);
    const [target] = await db.select().from(creditSubmissionTargets).where(eq(creditSubmissionTargets.id,id));
    const [request] = await db.select().from(creditSubmissionRequests).where(eq(creditSubmissionRequests.id,requestId));
    return { target,request };
  }
  function paramsFor(fixture: Awaited<ReturnType<typeof seed>>, creditId: string): P {
    const { target, request } = fixture;
    const snapshot = {
      financialInstitutionId: target.financialInstitutionId,
      originMasterBrokerId: request.originMasterBrokerId,
      originBrokerId: request.brokerId,
      commissionRates: (target.institutionProposal as any).commissionRates,
    };
    return {
      targetId: target.id, requestId: request.id,
      expectedTargetProposal: target.institutionProposal,
      expectedBrokerId: request.brokerId,
      expectedOriginMasterBrokerId: request.originMasterBrokerId,
      newCredit: {
        id: creditId, clientId: request.clientId, brokerId: request.brokerId,
        originMasterBrokerId: request.originMasterBrokerId,
        financialInstitutionId: target.financialInstitutionId,
        linkedSubmissionId: request.id, amount: "8000.00",
        interestRate: "12.00", term: 24,
        status: "approved", finalProposal: snapshot,
      },
      expectedProposal: snapshot, expectedAmount: "8000.00",
      confirmedAmount: 3000, dispersalIndex: 1,
      commission: {
        creditId, brokerId: request.brokerId,
        masterBrokerId: request.originMasterBrokerId,
        amount: "150.00", brokerShare: "60.00",
        masterBrokerShare: request.originMasterBrokerId ? "30.00" : "0.00",
        appShare: "90.00", status: "generated",
        commissionType: "apertura_parcial_1", idempotencyKey: `key-${target.id}`,
      },
      performedBy: "super-admin",
      idempotencyKey: `key-${target.id}`,
    };
  }

  // OPE-06 is a distinct step from confirmation of actual disbursement.
  const select = (p: Parameters<DbStorage["selectWinningTargetAtomic"]>[0]) =>
    DbStorage.prototype.selectWinningTargetAtomic(p);

  it("OPE-06 serializes winner double-clicks and creates exactly one linked credit",async()=>{
    const fixture = await seed("target-winner-concurrency", true, "master-original-winner");
    const base = paramsFor(fixture,"winner-concurrency-one");
    const first = {
      targetId: fixture.target.id, requestId: fixture.request.id,
      expectedProposal: fixture.target.institutionProposal,
      newCredit: base.newCredit!,
    };
    const second = {
      ...first,
      newCredit: { ...base.newCredit!, id: "winner-concurrency-two" },
    };
    const outcomes = await Promise.all([select(first),select(second)]);
    expect(outcomes.map(o=>o.alreadySelected).sort()).toEqual([false,true]);
    expect(outcomes[0].credit.id).toBe(outcomes[1].credit.id);
    const all = await db.select().from(credits);
    expect(all.filter(c=>c.linkedSubmissionId === fixture.request.id)).toHaveLength(1);
    const [target] = await db.select().from(creditSubmissionTargets)
      .where(eq(creditSubmissionTargets.id,fixture.target.id));
    expect(target.creditId).toBe(outcomes[0].credit.id);
    expect(outcomes[0].credit.originMasterBrokerId).toBe("master-original-winner");
  });

  it("OPE-06 permits exactly one winner across competing financial targets", async () => {
    const initial = await seed("target-winner-cross-a", false, "master-cross-winner");
    await pool.query(`UPDATE credit_submission_targets SET status='institution_approved'
      WHERE id=$1`, [initial.target.id]);
    const [targetA] = await db.select().from(creditSubmissionTargets)
      .where(eq(creditSubmissionTargets.id, initial.target.id));
    const targetBId = "target-winner-cross-b";
    await pool.query(`INSERT INTO credit_submission_targets
      (id,request_id,financial_institution_id,status,is_winner,institution_proposal)
      VALUES ($1,$2,'test-financial-two','institution_approved',false,$3::jsonb)`,
      [targetBId, initial.request.id, JSON.stringify(targetA.institutionProposal)]);
    const [targetB] = await db.select().from(creditSubmissionTargets)
      .where(eq(creditSubmissionTargets.id, targetBId));
    const firstCredit = paramsFor({ request: initial.request, target: targetA }, "cross-a-credit").newCredit!;
    const selectionA = {
      targetId: targetA.id, requestId: initial.request.id,
      expectedProposal: targetA.institutionProposal, newCredit: firstCredit,
    };
    const selectionB = {
      targetId: targetB.id, requestId: initial.request.id,
      expectedProposal: targetB.institutionProposal,
      newCredit: { ...firstCredit, id: "cross-b-credit", financialInstitutionId: targetB.financialInstitutionId },
    };
    const outcomes = await Promise.allSettled([select(selectionA), select(selectionB)]);
    expect(outcomes.map(o => o.status).sort()).toEqual(["fulfilled", "rejected"]);
    const success = outcomes.find((o): o is PromiseFulfilledResult<Awaited<ReturnType<typeof select>>> =>
      o.status === "fulfilled");
    const failure = outcomes.find((o): o is PromiseRejectedResult => o.status === "rejected");
    expect(success?.value.alreadySelected).toBe(false);
    expect(failure?.reason?.message).toBe("WINNER_ALREADY_SELECTED_FOR_REQUEST");
    const targets = await db.select().from(creditSubmissionTargets)
      .where(eq(creditSubmissionTargets.requestId, initial.request.id));
    expect(targets.filter(x => x.isWinner)).toHaveLength(1);
    expect(targets.filter(x => x.creditId !== null)).toHaveLength(1);
    const linked = await db.select().from(credits)
      .where(eq(credits.linkedSubmissionId, initial.request.id));
    expect(linked).toHaveLength(1);
    expect(linked[0].id).toBe(success?.value.credit.id);
    const winningSelection = success?.value.target.id === targetA.id ? selectionA : selectionB;
    const losingSelection = success?.value.target.id === targetA.id ? selectionB : selectionA;
    expect((await select(winningSelection)).alreadySelected).toBe(true);
    await expect(select(losingSelection)).rejects.toThrow("WINNER_ALREADY_SELECTED_FOR_REQUEST");
  });

  it("OPE-06 rejects another winner when a legacy credit already references the request", async () => {
    const fixture = await seed("target-winner-legacy-credit", false);
    await pool.query(`UPDATE credit_submission_targets SET status='institution_approved'
      WHERE id=$1`, [fixture.target.id]);
    const newCredit = paramsFor(fixture, "winner-legacy-new-credit").newCredit!;
    await pool.query(`INSERT INTO credits
      (id, client_id, broker_id, linked_submission_id, amount, status)
      VALUES ($1, $2, $3, $4, 8000, 'approved')`,
      ["winner-legacy-old-credit", fixture.request.clientId, fixture.request.brokerId, fixture.request.id]);
    await expect(select({
      targetId: fixture.target.id, requestId: fixture.request.id,
      expectedProposal: fixture.target.institutionProposal, newCredit,
    })).rejects.toThrow("WINNER_REQUEST_CREDIT_ALREADY_EXISTS");
    const all = await db.select().from(credits)
      .where(eq(credits.linkedSubmissionId, fixture.request.id));
    expect(all).toHaveLength(1);
  });

  it("OPE-06 rolls back a winner on credit insertion failure and supports clean retry",async()=>{
    const fixture = await seed("target-winner-failure");
    const data = paramsFor(fixture,"winner-failure-credit");
    const draft = {
      targetId: fixture.target.id, requestId: fixture.request.id,
      expectedProposal: fixture.target.institutionProposal,
      newCredit: data.newCredit!,
    };
    await pool.query(`CREATE FUNCTION pg_winner_fail_credit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.id='winner-failure-credit' THEN
        RAISE EXCEPTION 'injected winner credit insert failure';
      END IF; RETURN NEW; END $$`);
    await pool.query(`CREATE TRIGGER pg_winner_fail_credit_trigger BEFORE INSERT ON credits
      FOR EACH ROW EXECUTE FUNCTION pg_winner_fail_credit()`);
    try {
      await expect(select(draft)).rejects.toThrow("injected winner credit insert failure");
      const [target] = await db.select().from(creditSubmissionTargets)
        .where(eq(creditSubmissionTargets.id,fixture.target.id));
      expect(target.creditId).toBeNull();
      const found = await db.select().from(credits).where(eq(credits.id,draft.newCredit.id));
      expect(found).toHaveLength(0);
    } finally {
      await pool.query("DROP TRIGGER pg_winner_fail_credit_trigger ON credits");
      await pool.query("DROP FUNCTION pg_winner_fail_credit()");
    }
    const completed = await select(draft);
    expect(completed.alreadySelected).toBe(false);
    expect(completed.credit.id).toBe("winner-failure-credit");
  });

  it("OPE-06 prevents selecting incomplete financial proposals",async()=>{
    const fixture = await seed("target-winner-incomplete");
    const data = paramsFor(fixture,"winner-incomplete-credit");
    await pool.query(`UPDATE credit_submission_targets
      SET institution_proposal='{"approvedAmount":8000,"interestRate":12}'::jsonb
      WHERE id='target-winner-incomplete'`);
    const [target] = await db.select().from(creditSubmissionTargets)
      .where(eq(creditSubmissionTargets.id,fixture.target.id));
    await expect(select({
      targetId: target.id, requestId: fixture.request.id,
      expectedProposal: target.institutionProposal, newCredit: data.newCredit!,
    })).rejects.toThrow("WINNER_PROPOSAL_INCOMPLETE");
    const found = await db.select().from(credits).where(eq(credits.id,data.newCredit!.id));
    expect(found).toHaveLength(0);
  });

  it("creates credit and links winner exactly once for concurrent requests",async()=>{
    const fixture = await seed("target-same");
    const data = paramsFor(fixture,"credit-target-same");
    const result = await Promise.all([settle(data),settle(data)]);
    expect(result.map(x=>x.alreadyConfirmed).sort()).toEqual([false,true]);
    const [storedTarget] = await db.select().from(creditSubmissionTargets)
      .where(eq(creditSubmissionTargets.id,fixture.target.id));
    expect(storedTarget.creditId).toBe("credit-target-same");
    const linked = await db.select().from(credits).where(eq(credits.id,storedTarget.creditId!));
    expect(linked).toHaveLength(1);
    expect((linked[0].finalProposal as any).disbursementTranches).toHaveLength(1);
    const comm = await db.select().from(commissions).where(eq(commissions.creditId,storedTarget.creditId!));
    expect(comm).toHaveLength(1);
  });

  it("never creates a credit for a non-winning target",async()=>{
    const fixture = await seed("target-not-winner", false);
    await expect(settle(paramsFor(fixture,"credit-orphan"))).rejects.toThrow("DISBURSEMENT_TARGET_NOT_ELIGIBLE");
    const rows = await db.select().from(credits).where(eq(credits.id,"credit-orphan"));
    expect(rows).toHaveLength(0);
  });

  it("audit failure rolls back new credit and target association",async()=>{
    const fixture = await seed("target-rollback");
    const data = paramsFor(fixture,"credit-target-rollback");
    await pool.query(`CREATE FUNCTION pg_target_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.details->>'creditId' = 'credit-target-rollback' THEN
        RAISE EXCEPTION 'injected target audit failure';
      END IF; RETURN NEW; END $$`);
    await pool.query(`CREATE TRIGGER pg_target_fail_audit_trigger BEFORE INSERT ON commission_audit_logs
      FOR EACH ROW EXECUTE FUNCTION pg_target_fail_audit()`);
    try {
      await expect(settle(data)).rejects.toThrow(/injected target audit failure/);
      const rows = await db.select().from(credits).where(eq(credits.id,data.newCredit!.id));
      expect(rows).toHaveLength(0);
      const [target] = await db.select().from(creditSubmissionTargets).where(eq(creditSubmissionTargets.id,fixture.target.id));
      expect(target.creditId).toBeNull();
    } finally {
      await pool.query("DROP TRIGGER pg_target_fail_audit_trigger ON commission_audit_logs");
      await pool.query("DROP FUNCTION pg_target_fail_audit()");
    }
  });

  it("preserves the historical Master, never the Broker current affiliation",async()=>{
    const fixture = await seed("target-historic-master", true, "master-original");
    const data = paramsFor(fixture,"credit-historic-master");
    const result = await settle(data);
    expect(result.credit.originMasterBrokerId).toBe("master-original");
    expect(result.commission.masterBrokerId).toBe("master-original");
  });
});
