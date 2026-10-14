/**
 * LEG-10 release gate: preparing a client's file is not permission to disclose
 * financial/patrimonial information to a financial institution.
 *
 * Fail closed until an approved, versioned instrument AND server-verified
 * signer/purpose/recipient evidence are durably implemented.  This function
 * deliberately has no client-controlled override, admin bypass or environment
 * bypass (including staging).  NEVER treat a Broker action, a checkbox in
 * req.body, or the Broker's own legal acceptance as the client's consent.
 *
 * A later implementation may replace the denied result only after validating
 * the evidence transactionally against approved legal instruments, signer
 * identity/representation, tenant, recipient, revocation and exact snapshot.
 */
export type ClientDisclosurePurpose =
  | "financial_institution_submission"
  | "financial_institution_pdf_export";

export type ClientDisclosureContext = {
  clientId: string | null | undefined;
  tenantId: string | null | undefined;
  recipientInstitutionId: string | null | undefined;
  purpose: ClientDisclosurePurpose;
};

export type ClientDisclosureDecision = {
  authorized: false;
  code: "CLIENT_CONSENT_REQUIRED";
  message: string;
};

export function authorizeClientSensitiveDisclosure(
  _context: ClientDisclosureContext,
): ClientDisclosureDecision {
  // No verified client-consent evidence repository or signer-verification
  // workflow exists in this release. Never synthesize an approval.
  return {
    authorized: false,
    code: "CLIENT_CONSENT_REQUIRED",
    message: "Se requiere autorización verificable del cliente para compartir información con esta financiera. La formalización del Broker no sustituye esa autorización.",
  };
}
