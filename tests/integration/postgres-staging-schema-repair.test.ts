import pg from "pg";
import { randomUUID } from "node:crypto";
import { assertSafeIsolatedTestDatabase } from "../testDbSafety";
import { applyAdditivePrelaunchSchemaRepair, repairStagingSchemaOnStartup } from "../../server/stagingSchemaRepair";

const url=process.env.TEST_DATABASE_URL;
if(url)assertSafeIsolatedTestDatabase(url);
const describeIsolated=url?describe:describe.skip;

describeIsolated("MVP staging legacy SQL repair (isolated PostgreSQL only)",()=>{
  let pool:pg.Pool;
  let client:pg.PoolClient;
  const schema="prelaunch_"+randomUUID().replace(/-/g,"").slice(0,19);
  const tables=[
    "credits","commissions","credit_submission_targets",
    "credit_submission_requests","legal_acceptances","institution_products"
  ];
  beforeAll(async()=>{
    if(!url)throw new Error("TEST_DATABASE_URL required");
    pool=new pg.Pool({connectionString:url});
    client=await pool.connect();
    await client.query("CREATE EXTENSION IF NOT EXISTS pgcrypto");
    await client.query('CREATE SCHEMA "'+schema+'"');
    for(const name of tables){
      await client.query('CREATE TABLE "'+schema+'"."'+name+'" (id VARCHAR PRIMARY KEY)');
    }
    await client.query('INSERT INTO "'+schema+'".credits (id) VALUES ($1)',["preserved-credit"]);
    await client.query('INSERT INTO "'+schema+'".legal_acceptances (id) VALUES ($1)',["preserved-legal-evidence"]);
  });
  afterAll(async()=>{
    if(client){
      await client.query('DROP SCHEMA IF EXISTS "'+schema+'" CASCADE');
      client.release();
    }
    await pool?.end();
  });
  it("adds required columns without replacing historical rows, and is idempotent",async()=>{
    await applyAdditivePrelaunchSchemaRepair(client,schema);
    await applyAdditivePrelaunchSchemaRepair(client,schema);
    const result=await client.query(
      "SELECT table_name,column_name FROM information_schema.columns "+
      "WHERE table_schema=$1 AND (column_name IN ('institution_product_id','version_number',"+
      "'template_sha256','personalized_sha256','name','origin_master_broker_id'))",[schema]);
    const columns=new Set(result.rows.map(r=>r.table_name+"."+r.column_name));
    for(const required of [
      "credits.institution_product_id",
      "commissions.institution_product_id",
      "credit_submission_targets.version_number",
      "credit_submission_requests.origin_master_broker_id",
      "legal_acceptances.template_sha256",
      "legal_acceptances.personalized_sha256",
      "institution_products.name",
    ])expect(columns.has(required)).toBe(true);
    const saved=await client.query('SELECT id FROM "'+schema+'".credits');
    expect(saved.rows.map(x=>x.id)).toEqual(["preserved-credit"]);
    const evidence=await client.query('SELECT id FROM "'+schema+'".legal_acceptances');
    expect(evidence.rows.map(x=>x.id)).toEqual(["preserved-legal-evidence"]);
    const versions=await client.query('SELECT * FROM "'+schema+'".institution_product_versions');
    expect(versions.rows).toHaveLength(0);
  });
  it("does not modify PostgreSQL if the Railway environment is Production",async()=>{
    const oldEnv=process.env.RAILWAY_ENVIRONMENT_NAME;
    process.env.RAILWAY_ENVIRONMENT_NAME="production";
    const fake={query:jest.fn()};
    try{
      await repairStagingSchemaOnStartup(fake as any);
      expect(fake.query).not.toHaveBeenCalled();
    }finally{
      if(oldEnv===undefined)delete process.env.RAILWAY_ENVIRONMENT_NAME;
      else process.env.RAILWAY_ENVIRONMENT_NAME=oldEnv;
    }
  });
});
