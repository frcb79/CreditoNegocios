import pg from "pg";
import { randomUUID } from "node:crypto";
import { assertSafeIsolatedTestDatabase } from "../testDbSafety";
import { recordHistoricalCreditIntake,listHistoricalCreditIntakes,reconcileHistoricalCreditIntake } from "../../server/historicalCreditIntakeService";
import { historicalCreditIntakeSchema } from "../../shared/historicalCreditIntake";

const testUrl=process.env.TEST_DATABASE_URL;
if(testUrl)assertSafeIsolatedTestDatabase(testUrl);
const describePg=testUrl?describe:describe.skip;

describePg("Historical credit evidence intake — isolated PostgreSQL",()=>{
  let control:pg.Pool;
  let pool:pg.Pool;
  let created=false;
  const name="creditonegocios_test_history_"+randomUUID().replace(/-/g,"").slice(0,16);
  const fixture={clientId:"client",brokerId:"broker",financialInstitutionId:"lender",productTemplateId:"simple",externalReference:"REF QA 001",actualDate:"2025-10-01",amount:"1000000.00",termMonths:36,evidenceDocumentId:"doc",historicalNetwork:"unknown",commissionStatus:"pending",originatorConfirmed:true};
  const input=(changes:Record<string,unknown>={})=>historicalCreditIntakeSchema.parse({...fixture,...changes});
  beforeAll(async()=>{
    control=new pg.Pool({connectionString:testUrl});
    await control.query('CREATE DATABASE "'+name+'"');created=true;
    const url=new URL(testUrl!);url.pathname="/"+name;assertSafeIsolatedTestDatabase(url.toString());
    pool=new pg.Pool({connectionString:url.toString()});
    await pool.query(`
      CREATE TABLE users(id varchar PRIMARY KEY,role varchar,is_active boolean,status varchar,first_name varchar,last_name varchar);
      CREATE TABLE clients(id varchar PRIMARY KEY,tenant_id varchar,broker_id varchar,business_name varchar,first_name varchar,last_name varchar);
      CREATE TABLE financial_institutions(id varchar PRIMARY KEY,name varchar);
      CREATE TABLE product_templates(id varchar PRIMARY KEY);
      CREATE TABLE documents(id varchar PRIMARY KEY,client_id varchar,credit_id varchar,is_valid boolean,file_name varchar);
      CREATE TABLE credits(id varchar PRIMARY KEY,client_id varchar,financial_institution_id varchar,amount numeric(15,2),start_date date,tenant_id varchar,broker_id varchar,created_by varchar,product_template_id varchar,term integer,status varchar,origin_master_broker_id varchar,final_proposal jsonb);
      CREATE TABLE commissions(id varchar PRIMARY KEY);
      CREATE TABLE commercial_audit_logs(id varchar PRIMARY KEY DEFAULT gen_random_uuid(),entity_type varchar,entity_id varchar,client_id varchar,broker_id varchar,performed_by varchar,action varchar,previous_state varchar,new_state varchar,metadata jsonb,created_at timestamp DEFAULT now());
      INSERT INTO users(id,role,is_active,status) VALUES ('admin','admin',true,'active'),('super','super_admin',true,'active'),('broker','broker',true,'active'),('other','broker',true,'active'),('master','master_broker',true,'active');
      INSERT INTO clients VALUES ('client','tenant','broker','Empresa QA',NULL,NULL),('foreign','other-tenant','other','Ajena QA',NULL,NULL);
      INSERT INTO financial_institutions VALUES ('lender','Financiera QA');
      INSERT INTO product_templates VALUES ('simple');
      INSERT INTO documents(id,client_id,credit_id,is_valid) VALUES ('doc','client',NULL,true),('payment','client',NULL,true),('foreign-doc','foreign',NULL,true),('linked-doc','client','old-credit',true);
    `);
  });
  afterAll(async()=>{
    if(pool)await pool.end();
    if(control){if(created)await control.query('DROP DATABASE "'+name+'"');await control.end();}
  });
  it("serializes concurrent captures of the same lender reference; no credit or commission is generated",async()=>{
    const out=await Promise.allSettled([
      recordHistoricalCreditIntake(pool,"admin",input()),
      recordHistoricalCreditIntake(pool,"admin",input({externalReference:"ref  qa 001"}))
    ]);
    expect(out.filter(x=>x.status==="fulfilled")).toHaveLength(1);
    const rejected=out.find(x=>x.status==="rejected") as PromiseRejectedResult;
    expect(rejected.reason.code).toBe("HISTORICAL_REFERENCE_EXISTS");
    const rows=(await pool.query("SELECT * FROM commercial_audit_logs")).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].performed_by).toBe("admin");
    expect(rows[0].broker_id).toBe("broker");
    expect(rows[0].metadata.tenantId).toBe("tenant");
    expect(rows[0].new_state).toBe("pending_reconciliation");
    expect(rows[0].metadata.commissionEffect).toBe("none");
    expect((await pool.query("SELECT * FROM credits")).rowCount).toBe(0);
    expect((await pool.query("SELECT * FROM commissions")).rowCount).toBe(0);
    const list=await listHistoricalCreditIntakes(pool,"admin");
    expect(list).toHaveLength(1);
    expect(list[0].status).toBe("pending_reconciliation");
  });
  it("rejects cross-client evidence, mismatched originator and unauthorized roles",async()=>{
    await expect(recordHistoricalCreditIntake(pool,"broker",input({externalReference:"OTHER QA"}))).rejects.toMatchObject({code:"HISTORICAL_ADMIN_REQUIRED"});
    await expect(listHistoricalCreditIntakes(pool,"broker")).rejects.toMatchObject({code:"HISTORICAL_ADMIN_REQUIRED"});
    await expect(recordHistoricalCreditIntake(pool,"admin",input({externalReference:"OTHER QA",brokerId:"other"}))).rejects.toMatchObject({code:"HISTORICAL_ORIGINATOR_MISMATCH"});
    for(const id of ["foreign-doc","linked-doc"])await expect(recordHistoricalCreditIntake(pool,"admin",input({externalReference:"OTHER QA",evidenceDocumentId:id}))).rejects.toMatchObject({code:"HISTORICAL_EVIDENCE_INVALID"});
    expect((await pool.query("SELECT * FROM commercial_audit_logs")).rowCount).toBe(1);
  });
  it("detects a possible already registered credit and rolls back a failed evidence write",async()=>{
    await pool.query("INSERT INTO credits(id,client_id,financial_institution_id,amount,start_date) VALUES ('old-credit','client','lender',1000000,'2025-10-01')");
    await expect(recordHistoricalCreditIntake(pool,"admin",input({externalReference:"POSSIBLE QA"}))).rejects.toMatchObject({code:"HISTORICAL_POSSIBLE_DUPLICATE"});
    await pool.query("ALTER TABLE commercial_audit_logs ADD CONSTRAINT reject_test_write CHECK (metadata->>'externalReference' <> 'ROLLBACK QA')");
    await expect(recordHistoricalCreditIntake(pool,"admin",input({externalReference:"ROLLBACK QA",amount:"2000000.00"}))).rejects.toThrow();
    expect((await pool.query("SELECT * FROM commercial_audit_logs")).rowCount).toBe(1);
    expect((await pool.query("SELECT * FROM credits")).rowCount).toBe(1);
    expect((await pool.query("SELECT * FROM commissions")).rowCount).toBe(0);
  });
  it("reconciles only with Super Admin and explicit historic origin; simultaneous review creates one tracking credit",async()=>{
    const report=await recordHistoricalCreditIntake(pool,"admin",input({externalReference:"REF QA 002",amount:"3000000",historicalNetwork:"master",historicalMasterName:"Master QA",commissionStatus:"paid_external",commissionEvidenceDocumentId:"payment"}));
    const review={historicalNetwork:"master" as const,originMasterBrokerId:"master",evidenceReviewed:true as const,reviewReason:"Se revisó evidencia QA."};
    await expect(reconcileHistoricalCreditIntake(pool,"admin",report.id,review)).rejects.toMatchObject({code:"HISTORICAL_REVIEW_REQUIRED"});
    await expect(reconcileHistoricalCreditIntake(pool,"super",report.id,{...review,originMasterBrokerId:"other"})).rejects.toMatchObject({code:"HISTORICAL_MASTER_INVALID"});
    const result=await Promise.all([reconcileHistoricalCreditIntake(pool,"super",report.id,review),reconcileHistoricalCreditIntake(pool,"super",report.id,review)]);
    expect(result.map(x=>x.alreadyRecorded).sort()).toEqual([false,true]);
    expect(result[0].creditId).toBe(result[1].creditId);
    const credit=(await pool.query("SELECT * FROM credits WHERE id=$1",[result[0].creditId])).rows[0];
    expect(credit.status).toBe("historical_recorded");
    expect(credit.origin_master_broker_id).toBe("master");
    expect(credit.created_by).toBe("admin");
    expect(credit.final_proposal.historicalRecord.trackingOnly).toBe(true);
    expect(credit.final_proposal.disbursementStatus).toBeUndefined();
    expect((await pool.query("SELECT * FROM commissions")).rowCount).toBe(0);
    expect((await listHistoricalCreditIntakes(pool,"admin")).find(x=>x.id===report.id)?.status).toBe("historical_recorded");
  });

});
