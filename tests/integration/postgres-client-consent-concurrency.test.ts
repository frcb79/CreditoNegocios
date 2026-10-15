import fs from "node:fs";
import path from "node:path";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { pool as appPool } from "../../server/db";
import { markTargetSentWithClientConsent, revokeConsentWithOtp } from "../../server/clientConsentService";
import { getFormalizationOtpSecret } from "../../server/legalDocuments";
import { assertSafeIsolatedTestDatabase } from "../testDbSafety";

const url=process.env.TEST_DATABASE_URL;
if(url) assertSafeIsolatedTestDatabase(url);
const describeIsolated=url?describe:describe.skip;
const digest=(value:string)=>createHash("sha256").update(value).digest("hex");
const OTP="123456";

describeIsolated("LEG-10 real PostgreSQL concurrency: revocation vs send",()=>{
  let db:pg.Pool;
  const oldFlag=process.env.CLIENT_CONSENT_RELEASE_APPROVED;

  beforeAll(async()=>{
    if(!url) throw new Error("TEST_DATABASE_URL must be isolated");
    process.env.CLIENT_CONSENT_RELEASE_APPROVED="true";
    db=new pg.Pool({connectionString:url,max:8});
    await db.query("CREATE EXTENSION IF NOT EXISTS pgcrypto");
    for(const table of ["users","tenants","clients","financial_institutions","documents"]){
      await db.query("CREATE TABLE IF NOT EXISTS public."+table+" (id VARCHAR PRIMARY KEY)");
    }
    await db.query("ALTER TABLE public.users ADD COLUMN IF NOT EXISTS role VARCHAR");
    await db.query("ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS tenant_id VARCHAR");
    await db.query("ALTER TABLE public.financial_institutions ADD COLUMN IF NOT EXISTS name VARCHAR");
    await db.query("CREATE TABLE IF NOT EXISTS public.credit_submission_requests (id VARCHAR PRIMARY KEY)");
    for(const field of [
      "client_id VARCHAR","tenant_id VARCHAR","status VARCHAR","broker_id VARCHAR",
      "requested_amount NUMERIC(15,2)","updated_at TIMESTAMP"
    ]) await db.query("ALTER TABLE public.credit_submission_requests ADD COLUMN IF NOT EXISTS "+field);
    await db.query("CREATE TABLE IF NOT EXISTS public.credit_submission_targets (id VARCHAR PRIMARY KEY)");
    for(const field of [
      "request_id VARCHAR","financial_institution_id VARCHAR","institution_product_id VARCHAR",
      "version_number INTEGER","status VARCHAR","is_winner BOOLEAN","credit_id VARCHAR",
      "institution_proposal JSONB","reviewed_by VARCHAR","reviewed_at TIMESTAMP",
      "updated_at TIMESTAMP"
    ]) await db.query("ALTER TABLE public.credit_submission_targets ADD COLUMN IF NOT EXISTS "+field);
    const migration=fs.readFileSync(path.join(process.cwd(),"migrations/0008_client_consent_email_otp.sql"),"utf8");
    await db.query(migration);
  });
  afterAll(async()=>{
    if(oldFlag===undefined)delete process.env.CLIENT_CONSENT_RELEASE_APPROVED;
    else process.env.CLIENT_CONSENT_RELEASE_APPROVED=oldFlag;
    await db?.end();
  });

  async function seed(){
    const id=randomUUID();
    const tenant="leg10-tenant-"+id,user="leg10-user-"+id,client="leg10-client-"+id;
    const institution="leg10-bank-"+id,request="leg10-request-"+id,target="leg10-target-"+id;
    const version="leg10-document-"+id,challenge="leg10-challenge-"+id,evidence="leg10-evidence-"+id;
    const token=randomBytes(32).toString("hex");
    const document="Consentimiento ficticio LEG-10 "+id;
    const signature=createHmac("sha256",getFormalizationOtpSecret())
      .update("client-consent:"+challenge+":"+OTP).digest("hex");
    await db.query("INSERT INTO public.tenants(id) VALUES($1)",[tenant]);
    await db.query("INSERT INTO public.users(id,role) VALUES($1,'super_admin')",[user]);
    await db.query("INSERT INTO public.clients(id,tenant_id) VALUES($1,$2)",[client,tenant]);
    await db.query("INSERT INTO public.financial_institutions(id,name) VALUES($1,$2)",[institution,"Banco sintético LEG-10"]);
    await db.query(
      "INSERT INTO public.credit_submission_requests(id,client_id,tenant_id,broker_id,requested_amount,status,updated_at) "+
      "VALUES($1,$2,$3,$4,1000,'approved',NOW())",[request,client,tenant,user]);
    await db.query(
      "INSERT INTO public.credit_submission_targets(id,request_id,financial_institution_id,"+
      "status,is_winner,institution_proposal,updated_at) "+
      "VALUES($1,$2,$3,'approved',false,'{}'::jsonb,NOW())",[target,request,institution]);
    await db.query(
      "INSERT INTO public.client_consent_document_versions(id,version,title,content,content_sha256,status,effective_at,published_at) "+
      "VALUES($1,$2,'Ficticio', $3,$4,'published',NOW(),NOW())",
      [version,"test-"+id.slice(0,18),document,digest(document)]);
    await db.query(
      "INSERT INTO public.client_consent_challenges(id,tenant_id,client_id,target_id,institution_id,document_version_id,"+
      "exact_document_content,exact_document_sha256,purpose,signer_name,signer_email,signer_capacity,"+
      "representation_review_status,requested_by,token_hash,token_expires_at,otp_hash,otp_expires_at,"+
      "otp_requested_at,status) "+
      "VALUES($1,$2,$3,$4,$5,$6,$7,$8,'financial_institution_submission',"+
      "'Test Client','client@synthetic.invalid','client','not_applicable',$9,$10,"+
      "NOW()+INTERVAL '2 days',$11,NOW()+INTERVAL '5 minutes',NOW(),'verified')",
      [challenge,tenant,client,target,institution,version,document,digest(document),
       user,digest(token),signature]);
    await db.query(
      "INSERT INTO public.client_consent_evidences(id,challenge_id,tenant_id,client_id,target_id,"+
      "institution_id,document_version_id,purpose,signer_name,signer_email,signer_capacity,"+
      "representation_review_status,exact_document_content,exact_document_sha256,accepted_at) "+
      "VALUES($1,$2,$3,$4,$5,$6,$7,'financial_institution_submission',"+
      "'Test Client','client@synthetic.invalid','client','not_applicable',$8,$9,NOW()-INTERVAL '1 minute')",
      [evidence,challenge,tenant,client,target,institution,version,document,digest(document)]);
    return {
      target,request,evidence,token,
      send:()=>markTargetSentWithClientConsent({targetId:target,requestId:request,
        clientId:client,tenantId:tenant,institutionId:institution,reviewedBy:user}),
      revoke:()=>revokeConsentWithOtp({token,code:OTP,ip:null,userAgent:"postgres-concurrency-fixture"})
    };
  }

  async function awaitLockWait(fragment:string){
    for(let attempt=0;attempt<160;attempt++){
      const result=await db.query(
        "SELECT count(*)::int AS total FROM pg_stat_activity "+
        "WHERE pid<>pg_backend_pid() AND datname=current_database() "+
        "AND wait_event_type='Lock' AND query LIKE $1",
        ["%"+fragment+"%"]);
      if(Number(result.rows[0].total)>0)return;
      await new Promise(resolve=>setTimeout(resolve,25));
    }
    throw new Error("Expected PostgreSQL row lock wait was not observed: "+fragment);
  }

  async function order(first:"revoke"|"send"){
    const settle=(promise:Promise<unknown>)=>promise.then(
      ()=>({ok:true,error:null}),error=>({ok:false,error}));
    const f=await seed();
    // A third connection holds the target row so both actions truly contend
    // for the same PostgreSQL lock. Wait until each is blocked before release.
    const holder=await db.connect();
    await holder.query("BEGIN");
    await holder.query("SELECT id FROM public.credit_submission_targets WHERE id=$1 FOR UPDATE",[f.target]);
    let released=false;
    const unlock=async()=>{
      if(released)return;
      released=true;
      await holder.query("COMMIT");
      holder.release();
    };
    try{
      const firstCall=settle(first==="revoke"?f.revoke():f.send());
      await awaitLockWait(first==="revoke"?"SELECT id FROM public.credit_submission_targets":"FOR UPDATE OF t,s");
      const secondCall=settle(first==="revoke"?f.send():f.revoke());
      await awaitLockWait(first==="revoke"?"FOR UPDATE OF t,s":"SELECT id FROM public.credit_submission_targets");
      await unlock();
      const results=await Promise.all([firstCall,secondCall]);
      expect(results.map(x=>x.ok)).toEqual(first==="revoke"?[true,false]:[true,true]);
      if(first==="revoke")expect(results[1].error).toMatchObject({code:"CLIENT_CONSENT_REQUIRED"});
      const state=await db.query(
        "SELECT t.status AS target_status,s.status AS request_status FROM public.credit_submission_targets t "+
        "JOIN public.credit_submission_requests s ON s.id=t.request_id WHERE t.id=$1",[f.target]);
      if(first==="revoke"){
        expect(state.rows[0]).toMatchObject({target_status:"approved",request_status:"approved"});
      }else{
        expect(state.rows[0]).toMatchObject({target_status:"sent",request_status:"sent_to_institutions"});
      }
      const revocations=await db.query(
        "SELECT count(*)::int AS total FROM public.client_consent_revocations WHERE evidence_id=$1",[f.evidence]);
      expect(revocations.rows[0].total).toBe(1);
    }finally{
      await unlock();
    }
  }
  it("rolls back both status changes if the request update fails",async()=>{
    const f=await seed();
    await db.query("CREATE OR REPLACE FUNCTION public.leg10_reject_request_update() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic request write failure'; END; $$");
    await db.query("CREATE TRIGGER leg10_reject_request_update BEFORE UPDATE ON public.credit_submission_requests FOR EACH ROW EXECUTE FUNCTION public.leg10_reject_request_update()");
    try{
      await expect(f.send()).rejects.toThrow("synthetic request write failure");
      const state=await db.query("SELECT t.status AS target_status,s.status AS request_status FROM public.credit_submission_targets t JOIN public.credit_submission_requests s ON s.id=t.request_id WHERE t.id=$1",[f.target]);
      expect(state.rows[0]).toMatchObject({target_status:"approved",request_status:"approved"});
    }finally{
      await db.query("DROP TRIGGER leg10_reject_request_update ON public.credit_submission_requests");
      await db.query("DROP FUNCTION public.leg10_reject_request_update()");
    }
  },20000);
  it("revocation locks first: a competing send is rejected, both states stay unchanged",async()=>{
    await order("revoke");
  },20000);
  it("send locks first: its committed send precedes a subsequent valid revocation",async()=>{
    await order("send");
  },20000);
});
