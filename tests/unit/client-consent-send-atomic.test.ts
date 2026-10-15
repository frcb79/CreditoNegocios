import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { pool } from "../../server/db";
import { markTargetSentWithClientConsent } from "../../server/clientConsentService";

describe("LEG-10: atomic send vs OTP revocation",()=>{
  const prev=process.env.CLIENT_CONSENT_RELEASE_APPROVED;
  const scope={targetId:"target-1",requestId:"request-1",clientId:"client-1",
    tenantId:"tenant-1",institutionId:"bank-1",reviewedBy:"admin-1"};
  const doc="Firmado por cliente";const hash=createHash("sha256").update(doc).digest("hex");
  const evidence={content:doc,content_sha256:hash,exact_document_content:doc,
    exact_document_sha256:hash,signer_capacity:"client",revocation_id:null};
  afterEach(()=>{
    if(prev===undefined)delete process.env.CLIENT_CONSENT_RELEASE_APPROVED;
    else process.env.CLIENT_CONSENT_RELEASE_APPROVED=prev;
    jest.restoreAllMocks();
  });
  function mock(e:any,change:Record<string,any>={}){
    const query=jest.fn(async(sql:string)=>{
      if(sql.includes("FOR UPDATE OF t,s"))return {rows:[{
        id:scope.targetId,request_id:scope.requestId,client_id:scope.clientId,
        tenant_id:scope.tenantId,client_tenant_id:scope.tenantId,
        financial_institution_id:scope.institutionId,status:"approved",
        request_status:"partially_approved",is_winner:false,credit_id:null,...change,
      }]};
      if(sql.includes("FROM public.client_consent_evidences e"))return {rows:[e]};
      return {rows:[]};
    });
    const release=jest.fn();
    const spy=jest.spyOn(pool,"connect") as unknown as jest.SpyInstance<Promise<PoolClient>,[]>;
    spy.mockResolvedValue({query,release} as unknown as PoolClient);
    return {query,release};
  }
  it("does not touch DB without legal release",async()=>{
    delete process.env.CLIENT_CONSENT_RELEASE_APPROVED;
    const connect=jest.spyOn(pool,"connect");
    await expect(markTargetSentWithClientConsent(scope)).rejects.toMatchObject({code:"CLIENT_CONSENT_REQUIRED"});
    expect(connect).not.toHaveBeenCalled();
  });
  it("locks, rechecks evidence, updates target/request and commits",async()=>{
    process.env.CLIENT_CONSENT_RELEASE_APPROVED="true";
    const {query,release}=mock(evidence);
    await markTargetSentWithClientConsent(scope);
    const sql=query.mock.calls.map(([q])=>String(q));
    expect(sql[0]).toBe("BEGIN");
    expect(sql[1]).toContain("FOR UPDATE OF t,s");
    const read=sql.findIndex(q=>q.includes("FROM public.client_consent_evidences e"));
    const write=sql.findIndex(q=>q.includes("SET status='sent'"));
    expect(read).toBeGreaterThan(1);expect(write).toBeGreaterThan(read);
    expect(sql.some(q=>q.includes("SET status='sent_to_institutions'"))).toBe(true);
    expect(sql.at(-1)).toBe("COMMIT");expect(release).toHaveBeenCalledTimes(1);
  });
  it("rejects a revoked signature and rolls back with no writes",async()=>{
    process.env.CLIENT_CONSENT_RELEASE_APPROVED="true";
    const {query}=mock({...evidence,revocation_id:"revoke-1"});
    await expect(markTargetSentWithClientConsent(scope)).rejects.toMatchObject({code:"CLIENT_CONSENT_REQUIRED"});
    const sql=query.mock.calls.map(([q])=>String(q));
    expect(sql).toContain("ROLLBACK");
    expect(sql.some(q=>q.includes("SET status='sent'"))).toBe(false);
  });
  it("rejects recipient drift while holding the target lock",async()=>{
    process.env.CLIENT_CONSENT_RELEASE_APPROVED="true";
    const {query}=mock(evidence,{financial_institution_id:"other-bank"});
    await expect(markTargetSentWithClientConsent(scope)).rejects.toMatchObject({code:"CLIENT_CONSENT_SCOPE_MISMATCH"});
    expect(query.mock.calls.some(([q])=>String(q).includes("client_consent_evidences e"))).toBe(false);
  });
});
