import fs from "fs";
import path from "path";
import pg from "pg";
import {assertSafeIsolatedTestDatabase} from "../testDbSafety";

const url=process.env.TEST_DATABASE_URL;
if(url) assertSafeIsolatedTestDatabase(url);
const describeIsolated=url?describe:describe.skip;
describeIsolated("LEG-10: aditiva, versioned consent and immutable PostgreSQL evidence",()=>{
  let pgPool:pg.Pool;
  beforeAll(async()=>{
    pgPool=new pg.Pool({connectionString:url});
    await pgPool.query("CREATE EXTENSION IF NOT EXISTS pgcrypto");
    for(const parent of ["users","tenants","clients","financial_institutions","credit_submission_targets"]){
      await pgPool.query("CREATE TABLE IF NOT EXISTS public."+parent+"(id VARCHAR PRIMARY KEY)");
    }
    for(const child of ["client_consent_revocations","client_consent_evidences",
      "client_consent_challenges","client_consent_document_versions"]){
      await pgPool.query("DROP TABLE IF EXISTS public."+child+" CASCADE");
    }
  });
  afterAll(async()=>{await pgPool?.end();});
  it("applies twice, retains version hash and prevents tampering after publication",async()=>{
    const migration=fs.readFileSync(path.join(process.cwd(),"migrations/0008_client_consent_email_otp.sql"),"utf8");
    await pgPool.query(migration);
    await pgPool.query(migration);
    await pgPool.query(
      "INSERT INTO public.client_consent_document_versions(id,version,title,content,content_sha256,status,effective_at,published_at) "+
      "VALUES('leg10-test-v1','1.0','Consentimiento de prueba','Documento de prueba','abc','published',NOW(),NOW())"
    );
    await expect(pgPool.query(
      "UPDATE public.client_consent_document_versions SET content='Modificado' WHERE id='leg10-test-v1'"
    )).rejects.toThrow();
    await expect(pgPool.query(
      "DELETE FROM public.client_consent_document_versions WHERE id='leg10-test-v1'"
    )).rejects.toThrow();
    const indexes=await pgPool.query(
      "SELECT tablename,indexname FROM pg_indexes WHERE schemaname='public' AND tablename LIKE 'client_consent_%'"
    );
    expect(indexes.rows.some(r=>r.tablename==="client_consent_evidences")).toBe(true);
    const triggers=await pgPool.query(
      "SELECT tgname FROM pg_trigger WHERE tgname LIKE 'client_consent_%immutable'"
    );
    expect(triggers.rows.map(x=>x.tgname)).toEqual(expect.arrayContaining([
      "client_consent_evidences_immutable","client_consent_revocations_immutable",
      "client_consent_documents_immutable"
    ]));
    const otp=await pgPool.query(
      "SELECT column_name FROM information_schema.columns "+
      "WHERE table_name='client_consent_challenges' AND column_name IN ('token_hash','otp_hash','otp_attempts','otp_request_count','exact_document_sha256')"
    );
    expect(otp.rows).toHaveLength(5);
  });
});
