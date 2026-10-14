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
      institution_product_id varchar, version_number integer, product_template_id varchar, linked_submission_id varchar,
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
      financial_institution_id varchar NOT NULL, institution_product_id varchar, version_number integer,
      status varchar NOT NULL DEFAULT 'pending_admin',
      admin_notes text, details text, reviewed_by varchar, reviewed_at timestamp,
      institution_proposal jsonb DEFAULT '{}', proposal_received_at timestamp,
      proposal_document varchar, is_winner boolean DEFAULT false, dispersed_at timestamp,
      credit_id varchar REFERENCES credits(id),
      created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now()
    )`);
    await pool.query(`CREATE UNIQUE INDEX cst_credit_link_unique
      ON credit_submission_targets (credit_id)`);
    await pool.query(`CREATE TABLE commissions (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id varchar,
      credit_id varchar NOT NULL REFERENCES credits(id), broker_id varchar NOT NULL,
      master_broker_id varchar, commission_type varchar,
      institution_product_id varchar, version_number integer, amount numeric(15,2) NOT NULL, broker_share numeric(15,2),
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

    // COM-28 legacy chronology gate is now inside PG winner/disbursement
    // transactions, so this fixture must also create the parent catalog.
    await pool.query("DROP TABLE IF EXISTS institution_product_versions CASCADE");
    await pool.query("DROP TABLE IF EXISTS institution_products CASCADE");
    await pool.query(`CREATE TABLE institution_products (
      id varchar PRIMARY KEY, institution_id varchar NOT NULL,
      status varchar DEFAULT 'draft', is_active boolean DEFAULT true
    )`);
    await pool.query(`CREATE TABLE institution_product_versions (
      id varchar PRIMARY KEY, institution_product_id varchar NOT NULL
        REFERENCES institution_products(id),
      status varchar DEFAULT 'draft', published_at timestamp
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

  it("P0 linked legacy insert rejects a missing winner even when linkedSubmissionId exists", async () => {
    const fixture = await seed("target-linked-no-winner", false);
    const proposed = paramsFor(fixture, "linked-bypass-no-winner").newCredit!;
    const storage = Object.create(DbStorage.prototype) as DbStorage;
    await expect(storage.createCredit(proposed as any))
      .rejects.toThrow("OFFER_LINKED_WINNER_TARGET_NOT_VERIFIED");
    const found = await db.select().from(credits).where(eq(credits.id, proposed.id));
    expect(found).toHaveLength(0);
  });

  it("P0 linked legacy insert denies new versionless credits after published catalog", async () => {
    const fixture = await seed("target-linked-published-bypass");
    await pool.query(`INSERT INTO institution_products
      (id,institution_id,status,is_active) VALUES ('linked-fixture-offer','test-financial','published',true)`);
    await pool.query(`INSERT INTO institution_product_versions
      (id,institution_product_id,status,published_at)
      VALUES ('linked-fixture-v1','linked-fixture-offer','published',NOW())`);
    try {
      const proposed = paramsFor(fixture, "linked-bypass-published").newCredit!;
      const storage = Object.create(DbStorage.prototype) as DbStorage;
      await expect(storage.createCredit(proposed as any))
        .rejects.toThrow("OFFER_VERSION_REQUIRED_FOR_PUBLISHED_INSTITUTION");
      const found = await db.select().from(credits).where(eq(credits.id, proposed.id));
      expect(found).toHaveLength(0);
    } finally {
      // This file intentionally shares a synthetic database across tests.
      // Never poison the legacy eligibility state of following cases.
      await pool.query("DELETE FROM institution_product_versions WHERE id='linked-fixture-v1'");
      await pool.query("DELETE FROM institution_products WHERE id='linked-fixture-offer'");
    }
  });

  it("P0 linked legacy insert with no published catalog verifies winner and attribution", async () => {
    const fixture = await seed("target-linked-legacy-valid");
    const proposed = paramsFor(fixture, "linked-legacy-allowed").newCredit!;
    const storage = Object.create(DbStorage.prototype) as DbStorage;
    const created = await storage.createCredit(proposed as any);
    expect(created.id).toBe(proposed.id);
    expect(created.linkedSubmissionId).toBe(fixture.request.id);
    expect(created.originMasterBrokerId).toBeNull();
    const [linked] = await db.select().from(creditSubmissionTargets)
      .where(eq(creditSubmissionTargets.id, fixture.target.id));
    expect(linked.creditId).toBe(created.id);
  });

  it("P0 serializes concurrent legacy linked credit creation and links exactly once", async () => {
    const fixture = await seed("target-linked-double-insert");
    const first = paramsFor(fixture, "linked-concurrency-one").newCredit!;
    const second = { ...first, id: "linked-concurrency-two" };
    const storage = Object.create(DbStorage.prototype) as DbStorage;
    const attempts = await Promise.allSettled([
      storage.createCredit(first as any),
      storage.createCredit(second as any),
    ]);
    expect(attempts.filter(x => x.status === "fulfilled")).toHaveLength(1);
    const denied = attempts.filter(x => x.status === "rejected") as PromiseRejectedResult[];
    expect(denied).toHaveLength(1);
    expect(String(denied[0].reason)).toContain("OFFER_LINKED_WINNER_TARGET_NOT_VERIFIED");
    const linkedCredits = await db.select().from(credits);
    expect(linkedCredits.filter(x => x.linkedSubmissionId === fixture.request.id)).toHaveLength(1);
    const [linked] = await db.select().from(creditSubmissionTargets)
      .where(eq(creditSubmissionTargets.id, fixture.target.id));
    const winnerCredit = linkedCredits.find(x => x.linkedSubmissionId === fixture.request.id);
    expect(linked.creditId).toBe(winnerCredit?.id);
  });

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

  it("OPE-06 allows separate financings for two targets of the same request", async () => {
    const fixture = await seed("target-multi-finance-a", true, "master-multi-finance");
    const secondId = "target-multi-finance-b";
    await pool.query(`INSERT INTO credit_submission_targets
      (id,request_id,financial_institution_id,status,is_winner,institution_proposal)
      VALUES ($1,$2,'test-financial-two','institution_approved',false,$3::jsonb)`,
      [secondId, fixture.request.id, JSON.stringify(fixture.target.institutionProposal)]);
    const [other] = await db.select().from(creditSubmissionTargets)
      .where(eq(creditSubmissionTargets.id, secondId));
    const firstCredit = paramsFor(fixture,"multi-finance-credit-a").newCredit!;
    const selectionA = {
      targetId: fixture.target.id, requestId: fixture.request.id,
      expectedProposal: fixture.target.institutionProposal,
      newCredit: firstCredit,
    };
    const selectionB = {
      targetId: other.id, requestId: fixture.request.id,
      expectedProposal: other.institutionProposal,
      newCredit: { ...firstCredit, id: "multi-finance-credit-b", financialInstitutionId: other.financialInstitutionId },
    };
    const results = await Promise.all([select(selectionA), select(selectionB)]);
    expect(results.map(r => r.alreadySelected)).toEqual([false, false]);
    expect(new Set(results.map(r => r.credit.id)).size).toBe(2);
    expect(results.every(r => r.credit.originMasterBrokerId === "master-multi-finance")).toBe(true);
    const stored = await db.select().from(creditSubmissionTargets)
      .where(eq(creditSubmissionTargets.requestId, fixture.request.id));
    expect(stored.filter(r => r.isWinner && r.creditId)).toHaveLength(2);
    const creditsForRequest = await db.select().from(credits)
      .where(eq(credits.linkedSubmissionId, fixture.request.id));
    expect(creditsForRequest).toHaveLength(2);
    const replays = await Promise.all([select(selectionA), select(selectionB)]);
    expect(replays.every(r => r.alreadySelected)).toBe(true);
    expect(replays.map(r => r.credit.id)).toEqual(results.map(r => r.credit.id));
  });

  it("OPE-06 forbids linking one credit to two different targets", async () => {
    const fixture = await seed("target-credit-unique-one");
    const creditData = paramsFor(fixture, "target-credit-unique-credit").newCredit!;
    const selected = await select({
      targetId: fixture.target.id, requestId: fixture.request.id,
      expectedProposal: fixture.target.institutionProposal,
      newCredit: creditData,
    });
    const secondId = "target-credit-unique-two";
    await pool.query(`INSERT INTO credit_submission_targets
      (id,request_id,financial_institution_id,status,is_winner,institution_proposal)
      VALUES ($1,$2,'test-financial-two','institution_approved',false,$3::jsonb)`,
      [secondId, fixture.request.id, JSON.stringify(fixture.target.institutionProposal)]);
    await expect(pool.query(
      "UPDATE credit_submission_targets SET credit_id=$1 WHERE id=$2",
      [selected.credit.id, secondId]
    )).rejects.toThrow(/duplicate key value violates unique constraint/);
    const [other] = await db.select().from(creditSubmissionTargets)
      .where(eq(creditSubmissionTargets.id, secondId));
    expect(other.creditId).toBeNull();
  });

  it("FIN-P0 persists exact target -> credit -> commission offer/version in PostgreSQL", async () => {
    const fixture = await seed("target-version-chain", true, "master-chain");
    const taggedProposal = {
      ...(fixture.target.institutionProposal as Record<string, unknown>),
      institutionProductId: "offer-chain-A", versionNumber: 3,
    };
    await pool.query("UPDATE credit_submission_targets SET institution_proposal=$1::jsonb WHERE id=$2",
      [JSON.stringify(taggedProposal), fixture.target.id]);
    const [target] = await db.select().from(creditSubmissionTargets)
      .where(eq(creditSubmissionTargets.id, fixture.target.id));
    const data = paramsFor({ request: fixture.request, target }, "credit-version-chain");
    const snapshot = { ...(data.newCredit!.finalProposal as Record<string, unknown>),
      institutionProductId: "offer-chain-A", versionNumber: 3 };
    const winner = await select({ targetId: target.id, requestId: fixture.request.id,
      expectedProposal: taggedProposal,
      newCredit: { ...data.newCredit!, finalProposal: snapshot } });
    expect(winner.target.institutionProductId).toBe("offer-chain-A");
    expect(winner.target.versionNumber).toBe(3);
    expect(winner.credit.institutionProductId).toBe("offer-chain-A");
    expect(winner.credit.versionNumber).toBe(3);
    const settled = await settle({ ...data, newCredit: undefined,
      expectedTargetProposal: taggedProposal, expectedProposal: snapshot });
    expect(settled.commission.institutionProductId).toBe("offer-chain-A");
    expect(settled.commission.versionNumber).toBe(3);
    const [stored] = await db.select().from(commissions)
      .where(eq(commissions.id, settled.commission.id));
    expect(stored.versionNumber).toBe(3);
  });

  it("FIN-P0 refuses a commission with a different version, atomically", async () => {
    const fixture = await seed("target-version-wrong-commission");
    const data = paramsFor(fixture,"credit-wrong-commission-version");
    await expect(settle({ ...data, commission: {
      ...data.commission, institutionProductId: "other-offer", versionNumber: 2,
    } })).rejects.toThrow("DISBURSEMENT_OFFER_VERSION_MISMATCH");
    expect(await db.select().from(credits)
      .where(eq(credits.id, data.newCredit!.id))).toHaveLength(0);
    const [target] = await db.select().from(creditSubmissionTargets)
      .where(eq(creditSubmissionTargets.id, fixture.target.id));
    expect(target.creditId).toBeNull();
  });

  it("FIN-P0 rejects offer/version switching during winner selection without persisting credit", async () => {
    const fixture = await seed("winner-version-mismatch");
    const targetProposal = {
      ...(fixture.target.institutionProposal as object),
      institutionProductId: "published-product-A",
      versionNumber: 2,
    };
    await pool.query("UPDATE credit_submission_targets SET institution_proposal=$1::jsonb WHERE id=$2",
      [JSON.stringify(targetProposal), fixture.target.id]);
    const badCredit = paramsFor(fixture, "version-switch-credit").newCredit!;
    await expect(select({
      targetId: fixture.target.id, requestId: fixture.request.id,
      expectedProposal: targetProposal,
      newCredit: {
        ...badCredit,
        finalProposal: { ...(badCredit.finalProposal as object), institutionProductId: "published-product-B", versionNumber: 2 },
      },
    })).rejects.toThrow("OFFER_VERSION_IDENTITY_MISMATCH");
    const creditsForRequest = await db.select().from(credits)
      .where(eq(credits.linkedSubmissionId, fixture.request.id));
    expect(creditsForRequest).toHaveLength(0);
    const [target] = await db.select().from(creditSubmissionTargets)
      .where(eq(creditSubmissionTargets.id, fixture.target.id));
    expect(target.creditId).toBeNull();
  });

  it("FIN-P0 freezes institution proposal updates after winner selection", async () => {
    const fixture = await seed("winner-proposal-edit-frozen");
    const p = paramsFor(fixture,"winner-proposal-edit-credit").newCredit!;
    await select({
      targetId: fixture.target.id, requestId: fixture.request.id,
      expectedProposal: fixture.target.institutionProposal, newCredit: p,
    });
    await expect(DbStorage.prototype.updateCreditSubmissionTarget(fixture.target.id, {
      status: "institution_approved",
      institutionProposal: { approvedAmount: 7000, interestRate: 14, term: 24 },
    })).rejects.toThrow("TARGET_ALREADY_SELECTED");
    const [target] = await db.select().from(creditSubmissionTargets)
      .where(eq(creditSubmissionTargets.id, fixture.target.id));
    expect((target.institutionProposal as any).approvedAmount).toBe(8000);
    expect(target.creditId).toBe(p.id);
  });

  it("OPE-P0 locks selected target against all administrative review reversals", async () => {
    const fixture = await seed("frozen-admin-review", true);
    const frozenBefore = fixture.target;
    const submitBefore = fixture.request;
    const run = async (action: "approve" | "reject" | "return") => {
      if(action==="approve") return DbStorage.prototype.approveCreditSubmissionTarget(
        fixture.target.id,"test-admin","changed");
      if(action==="reject") return DbStorage.prototype.rejectCreditSubmissionTarget(
        fixture.target.id,"test-admin","changed");
      return DbStorage.prototype.returnCreditSubmissionTargetToBroker(
        fixture.target.id,"test-admin","changed");
    };
    for(const action of ["approve","reject","return"] as const) {
      await expect(run(action)).rejects.toThrow("TARGET_ALREADY_SELECTED");
    }
    await expect(DbStorage.prototype.updateCreditSubmissionTarget(fixture.target.id,
      {status:"sent"})).rejects.toThrow("TARGET_ALREADY_SELECTED");
    const [after] = await db.select().from(creditSubmissionTargets)
      .where(eq(creditSubmissionTargets.id, fixture.target.id));
    const [submissionAfter] = await db.select().from(creditSubmissionRequests)
      .where(eq(creditSubmissionRequests.id, fixture.request.id));
    expect(after.status).toBe(frozenBefore.status);
    expect(after.isWinner).toBe(frozenBefore.isWinner);
    expect(after.creditId).toBe(frozenBefore.creditId);
    expect(submissionAfter.status).toBe(submitBefore.status);
  });

  it("OPE-P0 still permits reviewing a different target of the same request",async()=> {
    const fixture = await seed("frozen-sibling-primary",true);
    const siblingId="frozen-sibling-pending";
    await pool.query(`INSERT INTO credit_submission_targets
      (id,request_id,financial_institution_id,status,is_winner,institution_proposal)
      VALUES($1,$2,'another-financial','pending_admin',false,'{}'::jsonb)`,
      [siblingId,fixture.request.id]);
    const ok=await DbStorage.prototype.approveCreditSubmissionTarget(siblingId,"admin-a");
    expect(ok?.status).toBe("approved");
    const [first] = await db.select().from(creditSubmissionTargets)
      .where(eq(creditSubmissionTargets.id,fixture.target.id));
    expect(first.isWinner).toBe(true);
    expect(first.status).toBe("selected_winner");
    const [requestAfterApprove] = await db.select().from(creditSubmissionRequests)
      .where(eq(creditSubmissionRequests.id, fixture.request.id));
    expect(requestAfterApprove.status).toBe(fixture.request.status);
    const returned = await DbStorage.prototype.returnCreditSubmissionTargetToBroker(
      siblingId, "admin-a", "needs additional evidence");
    expect(returned?.status).toBe("returned_to_broker");
    const [requestAfterReturn] = await db.select().from(creditSubmissionRequests)
      .where(eq(creditSubmissionRequests.id, fixture.request.id));
    expect(requestAfterReturn.status).toBe(fixture.request.status);
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
