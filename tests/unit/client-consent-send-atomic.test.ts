import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { pool } from "../../server/db";
import { markTargetSentWithClientConsent,withAuthorizedClientPdfDisclosure } from "../../server/clientConsentService";

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
    const query=jest.fn(async(sql:string,params?:unknown[])=>{
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
    const update=query.mock.calls.find(([q])=>String(q).includes("UPDATE public.credit_submission_targets"));
    expect(update?.[1]).toEqual([scope.targetId,scope.reviewedBy,null,null]);
  });
  it("rejects a revoked signature and rolls back with no writes",async()=>{
    process.env.CLIENT_CONSENT_RELEASE_APPROVED="true";
    const {query}=mock({...evidence,revocation_id:"revoke-1"});
    await expect(markTargetSentWithClientConsent(scope)).rejects.toMatchObject({code:"CLIENT_CONSENT_REQUIRED"});
    const sql=query.mock.calls.map(([q])=>String(q));
    expect(sql).toContain("ROLLBACK");
    expect(sql.some(q=>q.includes("SET status='sent'"))).toBe(false);
  });
  it("preserves valid frozen offer identity in the atomic update",async()=>{
    process.env.CLIENT_CONSENT_RELEASE_APPROVED="true";
    const {query}=mock(evidence,{institution_product_id:"offer-A",version_number:2,
      institution_proposal:{institutionProductId:"offer-A",versionNumber:2}});
    await markTargetSentWithClientConsent(scope);
    const update=query.mock.calls.find(([q])=>String(q).includes("UPDATE public.credit_submission_targets"));
    expect(update?.[1]).toEqual([scope.targetId,scope.reviewedBy,"offer-A",2]);
  });
  it("rejects mismatched published offer identity and rolls back",async()=>{
    process.env.CLIENT_CONSENT_RELEASE_APPROVED="true";
    const {query}=mock(evidence,{institution_product_id:"offer-A",version_number:2,
      institution_proposal:{institutionProductId:"offer-B",versionNumber:2}});
    await expect(markTargetSentWithClientConsent(scope)).rejects.toMatchObject({
      code:"OFFER_VERSION_IDENTITY_MISMATCH",status:409,
    });
    expect(query.mock.calls.map(([q])=>String(q))).toContain("ROLLBACK");
    expect(query.mock.calls.some(([q])=>String(q).includes("SET status='sent'"))).toBe(false);
  });
  it("rejects recipient drift while holding the target lock",async()=>{
    process.env.CLIENT_CONSENT_RELEASE_APPROVED="true";
    const {query}=mock(evidence,{financial_institution_id:"other-bank"});
    await expect(markTargetSentWithClientConsent(scope)).rejects.toMatchObject({code:"CLIENT_CONSENT_SCOPE_MISMATCH"});
    expect(query.mock.calls.some(([q])=>String(q).includes("client_consent_evidences e"))).toBe(false);
  });
  it("final PDF gate denies revoked consent without delivering any bytes",async()=>{
    process.env.CLIENT_CONSENT_RELEASE_APPROVED="true";
    const {query}=mock({...evidence,revocation_id:"revoked"});
    const deliver=jest.fn(async()=>{});
    await expect(withAuthorizedClientPdfDisclosure({
      tenantId:scope.tenantId,clientId:scope.clientId,targetId:scope.targetId,
      institutionId:scope.institutionId,
    },deliver)).rejects.toMatchObject({code:"CLIENT_CONSENT_REQUIRED"});
    expect(deliver).not.toHaveBeenCalled();
    expect(query.mock.calls.map(([sql])=>sql)).toContain("ROLLBACK");
  });
  it("final PDF gate holds the target lock until delivery is completed",async()=>{
    process.env.CLIENT_CONSENT_RELEASE_APPROVED="true";
    const {query,release}=mock(evidence);
    const events:string[]=[];
    const deliver=jest.fn(async()=>{events.push("deliver");});
    await withAuthorizedClientPdfDisclosure({
      tenantId:scope.tenantId,clientId:scope.clientId,targetId:scope.targetId,
      institutionId:scope.institutionId,
    },deliver);
    const sql=query.mock.calls.map(([q])=>String(q));
    expect(sql[0]).toBe("BEGIN");
    expect(sql[1]).toContain("FOR UPDATE OF t,s");
    expect(sql.findIndex(q=>q.includes("client_consent_evidences"))).toBeGreaterThan(1);
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(events).toEqual(["deliver"]);
    expect(sql.at(-1)).toBe("COMMIT");
    expect(release).toHaveBeenCalledTimes(1);
  });
  it("final PDF gate revalidates recipient identity under the row lock",async()=>{
    process.env.CLIENT_CONSENT_RELEASE_APPROVED="true";
    const {query}=mock(evidence,{financial_institution_id:"switched"});
    const deliver=jest.fn(async()=>{});
    await expect(withAuthorizedClientPdfDisclosure({
      tenantId:scope.tenantId,clientId:scope.clientId,targetId:scope.targetId,
      institutionId:scope.institutionId,
    },deliver)).rejects.toMatchObject({code:"CLIENT_CONSENT_SCOPE_MISMATCH"});
    expect(deliver).not.toHaveBeenCalled();
    expect(query.mock.calls.map(([q])=>q)).toContain("ROLLBACK");
  });

});
