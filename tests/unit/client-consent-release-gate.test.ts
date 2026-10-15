import {createHash} from "crypto";
import {pool} from "../../server/db";
import {authorizeClientSensitiveDisclosure} from "../../server/clientConsentGate";

describe("LEG-10: recipient-bound client evidence cannot be bypassed",()=>{
  const previous=process.env.CLIENT_CONSENT_RELEASE_APPROVED;
  const scope={
    clientId:"client-A",tenantId:"tenant-A",targetId:"target-A",
    recipientInstitutionId:"bank-A",purpose:"financial_institution_submission" as const,
  };
  afterEach(()=>{
    if(previous===undefined) delete process.env.CLIENT_CONSENT_RELEASE_APPROVED;
    else process.env.CLIENT_CONSENT_RELEASE_APPROVED=previous;
    jest.restoreAllMocks();
  });
  it("fails closed when the legal release is not authorized",async()=>{
    delete process.env.CLIENT_CONSENT_RELEASE_APPROVED;
    const spy=jest.spyOn(pool,"query");
    const d=await authorizeClientSensitiveDisclosure(scope);
    expect(d).toEqual(expect.objectContaining({authorized:false,code:"CLIENT_CONSENT_REQUIRED"}));
    expect(spy).not.toHaveBeenCalled();
  });
  it("rejects incomplete target and recipient even after rollout approval",async()=>{
    process.env.CLIENT_CONSENT_RELEASE_APPROVED="true";
    const spy=jest.spyOn(pool,"query");
    expect((await authorizeClientSensitiveDisclosure({...scope,targetId:null})).authorized).toBe(false);
    expect((await authorizeClientSensitiveDisclosure({...scope,recipientInstitutionId:null})).authorized).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });
  it("requires durable, exact, hash-verified and non-revoked evidence",async()=>{
    process.env.CLIENT_CONSENT_RELEASE_APPROVED="true";
    const text="Versioned client authorization";
    const hash=createHash("sha256").update(text).digest("hex");
    const query=jest.spyOn(pool,"query") as any;
    query.mockResolvedValue({rows:[]});
    expect((await authorizeClientSensitiveDisclosure(scope)).authorized).toBe(false);
    const sql=String(query.mock.calls[0][0]);
    expect(sql).toContain("e.target_id=$3");
    expect(sql).toContain("e.institution_id=$4");
    expect(sql).toContain("r.id IS NULL");
    expect(query.mock.calls[0][1]).toEqual(["tenant-A","client-A","target-A","bank-A"]);

    query.mockResolvedValue({rows:[{
      content:text,content_sha256:hash,exact_document_content:text,
      exact_document_sha256:hash,signer_capacity:"client",representation_review_status:"not_applicable",
    }]});
    expect((await authorizeClientSensitiveDisclosure(scope)).authorized).toBe(true);
    expect((await authorizeClientSensitiveDisclosure({...scope,purpose:"financial_institution_pdf_export"})).authorized).toBe(true);

    query.mockResolvedValue({rows:[{
      content:text,content_sha256:"tampered",exact_document_content:text,
      exact_document_sha256:hash,signer_capacity:"client",representation_review_status:"not_applicable",
    }]});
    expect((await authorizeClientSensitiveDisclosure(scope)).authorized).toBe(false);
  });
  it("PM OTP receipt is not sufficient without verified legal representation",async()=>{
    process.env.CLIENT_CONSENT_RELEASE_APPROVED="true";
    const text="PM exact snapshot";
    const hash=createHash("sha256").update(text).digest("hex");
    const query=jest.spyOn(pool,"query") as any;
    query.mockResolvedValue({rows:[{
      content:text,content_sha256:hash,exact_document_content:text,
      exact_document_sha256:hash,signer_capacity:"legal_representative",
      representation_review_status:"pending",
    }]});
    expect((await authorizeClientSensitiveDisclosure(scope)).authorized).toBe(false);
    query.mockRejectedValue(new Error("isolated DB unavailable"));
    expect((await authorizeClientSensitiveDisclosure(scope)).authorized).toBe(false);
  });
});
