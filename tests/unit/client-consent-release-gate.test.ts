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
    expect(sql).toContain("r.id AS revocation_id");
    expect(sql).not.toContain("AND r.id IS NULL");
    expect(sql).toContain("d.id=(SELECT id FROM public.client_consent_document_versions");
    expect(sql).toContain("effective_at <= NOW() ORDER BY effective_at DESC LIMIT 1");
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
  it("never resurrects an older unrevoked consent after the latest one was revoked",async()=>{
    process.env.CLIENT_CONSENT_RELEASE_APPROVED="true";
    const text="Specific customer consent for this target";
    const hash=createHash("sha256").update(text).digest("hex");
    const query=jest.spyOn(pool,"query") as any;
    const signedRow={
      content:text,content_sha256:hash,exact_document_content:text,
      exact_document_sha256:hash,signer_capacity:"client",
      representation_review_status:"not_applicable",
    };
    // Query must read the latest signed evidence INCLUDING revocations. A
    // WHERE r.id IS NULL filter would silently fall back to an older signature.
    query.mockResolvedValueOnce({rows:[{...signedRow,revocation_id:"revoke-newest"}]});
    expect((await authorizeClientSensitiveDisclosure(scope)).authorized).toBe(false);
    const sql=String(query.mock.calls[0][0]);
    expect(sql).toContain("r.id AS revocation_id");
    expect(sql).not.toContain("AND r.id IS NULL");
    expect(sql).toContain("ORDER BY e.accepted_at DESC, e.id DESC LIMIT 1");

    // A NEW valid signature for this same target may authorize later operations.
    query.mockResolvedValueOnce({rows:[{...signedRow,revocation_id:null}]});
    expect((await authorizeClientSensitiveDisclosure(scope)).authorized).toBe(true);
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
