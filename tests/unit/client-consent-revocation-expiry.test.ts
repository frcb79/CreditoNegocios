import { createHmac,createHash } from "node:crypto";
import { pool } from "../../server/db";
import type { PoolClient } from "pg";
import {
  inspectConsentLink,prepareConsentRevocationOtp,revokeConsentWithOtp,
} from "../../server/clientConsentService";

describe("LEG-10: revocation remains possible after signing link expires",()=>{
  const token="a".repeat(64);
  const yesterday=new Date(Date.now()-24*60*60*1000);
  const twoHoursAgo=new Date(Date.now()-2*60*60*1000);
  const oneHourLater=new Date(Date.now()+60*60*1000);
  afterEach(()=>jest.restoreAllMocks());

  it("does not expose the signed document or identity from an expired bearer link",async()=>{
    const document="Private, client-specific financial data";
    const hash=createHash("sha256").update(document).digest("hex");
    const q=jest.spyOn(pool,"query") as any;
    q.mockResolvedValueOnce({rows:[{
      id:"challenge-a",signer_name:"Sensitive Name",signer_capacity:"client",
      exact_document_content:document,exact_document_sha256:hash,
      token_expires_at:yesterday,status:"verified",
    }]}).mockResolvedValueOnce({rows:[{revoked:null}]});
    const publicResponse=await inspectConsentLink(token);
    expect(publicResponse).toMatchObject({signed:true,revoked:false,linkExpired:true,signerName:""});
    expect(publicResponse).not.toHaveProperty("document");
  });

  it("permits a fresh OTP to the ORIGINAL signer after 48 hours and older resend quota",async()=>{
    const query=jest.fn(async(sql:string,params?:any[])=>{
      if(sql.includes("SELECT c.*,e.id AS evidence_id")) return {rows:[{
        id:"challenge-a",status:"verified",token_expires_at:yesterday,
        revocation_id:null,otp_request_count:5,otp_requested_at:twoHoursAgo,
        otp_resend_after:twoHoursAgo,signer_email:"customer@example.test",
        signer_name:"Cliente Ejemplo",
      }]};
      return {rows:[]};
    });
    const release=jest.fn();
    const connectSpy=jest.spyOn(pool,"connect") as unknown as jest.SpyInstance<Promise<PoolClient>,[]>;
    connectSpy.mockResolvedValue({query,release} as unknown as PoolClient);
    const result=await prepareConsentRevocationOtp(token);
    expect(result.to).toBe("customer@example.test");
    expect(result.code).toMatch(/^\d{6}$/);
    expect(query.mock.calls.some(([sql])=>String(sql).includes("otp_request_count=CASE"))).toBe(true);
    expect(query.mock.calls.some(([sql])=>String(sql)==="COMMIT")).toBe(true);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("revokes only using a NEW code, while retaining the signed historical evidence",async()=>{
    const code="123456";
    const hash=createHmac("sha256","test-formalization-otp-secret-key-32b")
      .update("client-consent:challenge-a:"+code).digest("hex");
    const query=jest.fn(async(sql:string,params?:any[])=>{
      if(sql.includes("SELECT c.*,e.id AS evidence_id,e.accepted_at")) return {rows:[{
        id:"challenge-a",status:"verified",token_expires_at:yesterday,
        revocation_id:null,evidence_id:"evidence-a",otp_hash:hash,
        otp_expires_at:oneHourLater,otp_requested_at:new Date(),
        accepted_at:yesterday,otp_attempts:0,otp_max_attempts:5,
        signer_email:"customer@example.test",
      }]};
      return {rows:[]};
    });
    const release=jest.fn();
    const connectSpy=jest.spyOn(pool,"connect") as unknown as jest.SpyInstance<Promise<PoolClient>,[]>;
    connectSpy.mockResolvedValue({query,release} as unknown as PoolClient);
    const r=await revokeConsentWithOtp({token,code,ip:null,userAgent:"unit-test"});
    expect(r).toMatchObject({success:true});
    const mutations=query.mock.calls.map(([sql])=>String(sql));
    expect(mutations.some(sql=>sql.includes("INSERT INTO public.client_consent_revocations"))).toBe(true);
    expect(mutations.some(sql=>sql.includes("DELETE FROM public.client_consent_evidences"))).toBe(false);
    expect(mutations).toContain("COMMIT");
    expect(release).toHaveBeenCalledTimes(1);
  });
});
