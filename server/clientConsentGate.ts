/**
 * LEG-10: no financial package or "sent" status without exact customer
 * consent.  The commercial Broker convenio never authorizes this disclosure.
 * CLIENT_CONSENT_RELEASE_APPROVED stays unset until LEG-10 legal approval,
 * controlled migration and E2E. The flag alone can NEVER authorize a file.
 */
import {hasValidClientConsent} from "./clientConsentService";

export type ClientDisclosurePurpose =
  | "financial_institution_submission"
  | "financial_institution_pdf_export";
export type ClientDisclosureContext = {
  clientId:string|null|undefined;
  tenantId:string|null|undefined;
  targetId:string|null|undefined;
  recipientInstitutionId:string|null|undefined;
  purpose:ClientDisclosurePurpose;
};
export type ClientDisclosureDecision =
  | {authorized:false;code:"CLIENT_CONSENT_REQUIRED";message:string}
  | {authorized:true};
export async function authorizeClientSensitiveDisclosure(
  ctx:ClientDisclosureContext,
):Promise<ClientDisclosureDecision> {
  const denied:ClientDisclosureDecision={
    authorized:false,code:"CLIENT_CONSENT_REQUIRED",
    message:"Se requiere autorización verificable del cliente para compartir este expediente con esta financiera.",
  };
  // Release is deliberately a separately reviewed decision.  Not a client,
  // broker, admin or HTTP-controlled bypass.
  if (process.env.CLIENT_CONSENT_RELEASE_APPROVED !== "true") return denied;
  if (!ctx.clientId || !ctx.tenantId || !ctx.targetId || !ctx.recipientInstitutionId ||
      !["financial_institution_submission","financial_institution_pdf_export"].includes(ctx.purpose))
    return denied;
  const evidence=await hasValidClientConsent({
    clientId:ctx.clientId,tenantId:ctx.tenantId,targetId:ctx.targetId,
    institutionId:ctx.recipientInstitutionId,
  });
  return evidence?{authorized:true}:denied;
}
