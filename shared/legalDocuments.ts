export type PublicLegalDocument = "terminos" | "aviso";
export type PrivateLegalDocument = "convenio" | "reglas-red" | "reglas-master";
export type CommercialLegalDocument = "condiciones-comerciales" | "comisiones-red";
export type LegalDocumentType = PublicLegalDocument | PrivateLegalDocument | CommercialLegalDocument;

export interface LegalDocumentVersion {
  id: string;
  document: string;
  title: string;
  version: string;
  sourceFile: string;
  content: string;
  contentSha256: string;
  effectiveAt?: string;
}

export interface PublishedLegalDocument extends LegalDocumentVersion {
  document: PublicLegalDocument;
  effectiveAt: string;
}

export type LegalAcceptanceType =
  | "accept_terms"
  | "acknowledge_privacy"
  | "accept_agreement"
  | "accept_convenio"
  | "accept_reglas_red"
  | "accept_reglas_master"
  | "accept_commercial_terms"
  | "accept_network_rates";

export interface LegalAcceptanceRecord {
  id: string;
  userId: string;
  userEmail: string;
  userName?: string | null;
  documentId: string;
  document: string;
  version: string;
  contentSha256: string;
  acceptanceType: LegalAcceptanceType | string;
  ipAddress: string | null;
  userAgent: string;
  acceptedAt: Date | string;
}

export const FORMALIZATION_NOTICE_TEXT =
  "Para comenzar a registrar clientes y generar comisiones deberás formalizar tu Convenio de Colaboración.";

export function shouldShowFormalizationNotice(role?: string | null): boolean {
  return role === "broker" || role === "master_broker";
}

export function isRoleSubjectToFormalization(role?: string | null): boolean {
  return role === "broker" || role === "master_broker";
}

export function getRequiredFormalizationDocuments(role?: string | null): string[] {
  if (role === "broker") {
    return ["convenio", "reglas-red"];
  }
  if (role === "master_broker") {
    return ["convenio", "reglas-red", "reglas-master"];
  }
  return [];
}

export function maskEmail(email: string): string {
  if (!email || !email.includes("@")) return email || "";
  const [local, domain] = email.split("@");
  if (local.length <= 2) {
    return `${local[0]}***@${domain}`;
  }
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}

export interface PersonalizedAgreementData {
  fullName: string;
  rfc?: string | null;
  address?: string | {
    street?: string | null;
    exteriorNumber?: string | null;
    interiorNumber?: string | null;
    colonia?: string | null;
    city?: string | null;
    state?: string | null;
    postalCode?: string | null;
  } | null;
  email: string;
  phone?: string | null;
  role: string;
  bankName?: string | null;
  clabe?: string | null;
  profileType?: string | null;
  businessName?: string | null;
  legalRepresentativeName?: string | null;
  legalRepresentativePosition?: string | null;
}

export function derivePersonalizedAgreementData(user: any): PersonalizedAgreementData {
  const profile = user?.profileData && typeof user.profileData === "object" ? user.profileData : {};
  const business = profile.business && typeof profile.business === "object" ? profile.business : {};
  const signerName = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim()
    || user?.accountHolder || user?.email || "";
  const isCompany = user?.profileType === "persona_moral";
  return {
    fullName: signerName,
    profileType: user?.profileType || null,
    businessName: isCompany ? (business.businessName || null) : null,
    legalRepresentativeName: isCompany ? (business.legalRepresentativeName || null) : null,
    legalRepresentativePosition: isCompany ? (business.legalRepresentativePosition || null) : null,
    rfc: (isCompany ? business.taxId : null) || profile.rfc || user?.rfc || null,
    address: (isCompany ? business.businessAddress : null) || profile.address || user?.address || null,
    email: user?.email || "",
    phone: (isCompany ? business.businessPhone : null) || profile.phone || user?.phone || null,
    role: user?.role || "",
    bankName: user?.bankName || null,
    clabe: user?.clabe || null,
  };
}

/** A self-declared company signer must match the authenticated account identity.
 * This check does not substitute legal review of the signer's authority. */
export function validateCompanyAgreementIdentity(data: PersonalizedAgreementData): string | null {
  if (data.profileType !== "persona_moral") return null;
  if (!data.businessName?.trim()) return "Registra la razón social de la empresa en Configuración → Negocio antes de formalizar.";
  if (!data.legalRepresentativeName?.trim()) return "Registra el nombre del representante legal que firmará por la empresa.";
  const normalize = (v: string) => v.normalize("NFD").replace(/\p{M}/gu, "").replace(/\s+/g, " ").trim().toLowerCase();
  if (normalize(data.legalRepresentativeName) !== normalize(data.fullName)) {
    return "El nombre del representante legal debe coincidir con el titular de la cuenta que recibirá el OTP. Usa una cuenta personal del firmante.";
  }
  return null;
}

/** Guard against changes to a legal entity while its signature OTP is pending. */
export function hasCompanyAgreementIdentityDrift(user: any, otpData: any): boolean {
  const current = derivePersonalizedAgreementData(user);
  if (current.profileType !== "persona_moral" && otpData?.profileType !== "persona_moral") return false;
  if (validateCompanyAgreementIdentity(current)) return true;
  return ["profileType", "businessName", "legalRepresentativeName", "legalRepresentativePosition", "rfc"]
    .some((key) => (current as any)[key] !== otpData?.[key]);
}

export interface PersonalizedAgreementEvidence {
  acceptedAt: Date | string;
  ipAddress?: string | null;
  userAgent?: string;
  otpMethod?: string;
  otpRequestId?: string;
}

export interface FormalizationDocumentItem {
  id?: string;
  document: string;
  title?: string;
  version: string;
  content?: string;
  contentSha256?: string;
  effectiveAt?: string | Date | null;
  isPrivate?: boolean;
  personalized?: boolean;
  incorporatedData?: any;
}

export interface FormalizationDocumentsResult {
  requiresFormalization: boolean;
  isFormalized: boolean;
  message?: string;
  user?: {
    id: string;
    email: string;
    name?: string;
    role: string;
  };
  requiredDocuments?: string[];
  documents: FormalizationDocumentItem[];
}

export interface FormalizationStatusResult {
  requiresFormalization: boolean;
  isFormalized: boolean;
  formalizedAt?: Date | string | null;
  requiredDocuments: string[];
  acceptedDocuments: string[];
}

export interface PersonalizedDocumentSnapshot {
  id: string;
  document: string;
  version: string;
  title: string;
  templateSha256: string;
  personalizedSha256: string;
  personalizedContent: string;
  incorporatedData: {
    fullName: string;
    rfc?: string;
    address?: string;
    email: string;
    phone?: string;
    role: string;
    roleLabel?: string;
    bankName?: string;
    clabe?: string;
    bankClabeSummary?: string;
    account?: string;
    bankAccount?: string;
    bankClabe?: string;
  };
  evidence?: {
    acceptedAt: string;
    ipAddress: string | null;
    userAgent: string;
    otpMethod: string;
  };
}

export function buildPersonalizedAgreement(
  templateContent: string,
  data: PersonalizedAgreementData,
  evidence?: PersonalizedAgreementEvidence,
): string {
  const rfcText = data.rfc?.trim() || "Pendiente de proporcionar";
  // Settings persists profileData.address as a structured object, while
  // older profiles may carry an address string. Render BOTH safely before
  // snapshotting the legal agreement; never call .trim() on an object.
  const addressText = typeof data.address === "string"
    ? (data.address.trim() || "Pendiente de proporcionar")
    : data.address && typeof data.address === "object"
    ? ([
        data.address.street,
        data.address.exteriorNumber && `Ext. ${data.address.exteriorNumber}`,
        data.address.interiorNumber && `Int. ${data.address.interiorNumber}`,
        data.address.colonia,
        data.address.city,
        data.address.state,
        data.address.postalCode && `C.P. ${data.address.postalCode}`,
      ].filter((part): part is string => typeof part === "string" && Boolean(part.trim()))
        .join(", ") || "Pendiente de proporcionar")
    : "Pendiente de proporcionar";
  const phoneText = data.phone?.trim() || "Pendiente de proporcionar";
  const bankClabeText =
    data.bankName?.trim() && data.clabe?.trim()
      ? `${data.bankName.trim()} / ${data.clabe.trim()}`
      : data.bankName?.trim()
      ? `${data.bankName.trim()} / Pendiente de proporcionar CLABE`
      : data.clabe?.trim()
      ? `Banco pendiente / ${data.clabe.trim()}`
      : "Pendiente de proporcionar";

  const isMaster = data.role === "master_broker";
  const tipoText = isMaster ? "☐ Broker    ☑ Master Broker" : "☑ Broker    ☐ Master Broker";

  const company = data.profileType === "persona_moral";
  const legalName = company ? data.businessName?.trim() || "Pendiente de proporcionar" : data.fullName;
  const repText = company
    ? [data.legalRepresentativeName?.trim(), data.legalRepresentativePosition?.trim()]
        .filter(Boolean).join(" — ") || "Pendiente de proporcionar"
    : "No aplica";
  const firmaText = evidence
    ? `Aceptado electrónicamente mediante Código de Verificación OTP (${evidence.otpMethod || "Correo Electrónico"})`
    : "Pendiente de formalización digital mediante OTP";
  const fechaText = evidence
    ? `${formatAcceptedDate(evidence.acceptedAt).formatted} (IP: ${evidence.ipAddress || "No registrada"})`
    : "Pendiente de formalizar";

  return templateContent
    .replace("Nombre o razón social: _________________________________", `Nombre o razón social: ${legalName}`)
    .replace("\tRFC\n\t_________________________________", `\tRFC\n\t${rfcText}`)
    .replace("\tDomicilio\n\t_________________________________", `\tDomicilio\n\t${addressText}`)
    .replace("\tCorreo electrónico\n\t_________________________________", `\tCorreo electrónico\n\t${data.email}`)
    .replace("\tTeléfono\n\t_________________________________", `\tTeléfono\n\t${phoneText}`)
    .replace("\tTipo\n\t☐ Broker    ☐ Master Broker", `\tTipo\n\t${tipoText}`)
    .replace("\tBanco / CLABE\n\t_________________________________", `\tBanco / CLABE\n\t${bankClabeText}`)
    .replace("Nombre / razón social: _______________________________", `Nombre / razón social: ${legalName}`)
    .replace("Representante, cuando corresponda: __________________", `Representante, cuando corresponda: ${repText}`)
    .replace("Firma / aceptación: _______________________________", `Firma / aceptación: ${firmaText}`)
    .replace("\tFecha\n\t_________________________________", `\tFecha\n\t${fechaText}`);
}


export interface PendingCommercialTerm {
  type: "global" | "network";
  document: string;
  version: string;
  title: string;
  description: string;
  effectiveDate: string;
  previousConditions?: Record<string, any>;
  newConditions: Record<string, any>;
  modifiedParams?: string[];
  masterBrokerId?: string;
  masterBrokerName?: string;
}

export interface PendingCommercialTermsStatus {
  hasPending: boolean;
  currentGlobalVersion: string;
  pendingTerms: PendingCommercialTerm[];
}

export function getExactDocumentUrl(document: string, version: string): string {
  return `/legal/${encodeURIComponent(document)}?version=${encodeURIComponent(version)}`;
}

export function getDocumentTitle(document: string): string {
  switch (document) {
    case "terminos":
      return "Términos y Condiciones";
    case "aviso":
      return "Aviso de Privacidad Integral";
    case "convenio":
      return "Convenio de Colaboración";
    case "reglas-red":
      return "Reglas de la Red";
    case "reglas-master":
      return "Reglas Master Broker";
    case "condiciones-comerciales":
      return "Condiciones Comerciales y Plazos Operativos";
    case "comisiones-red":
      return "Comisiones de Red";
    default:
      return document;
  }
}

export function getAcceptanceTypeLabel(type: string): string {
  switch (type) {
    case "accept_terms":
      return "Aceptación de Términos";
    case "acknowledge_privacy":
      return "Reconocimiento del Aviso";
    case "accept_agreement":
    case "accept_convenio":
      return "Aceptación de Convenio";
    case "accept_reglas_red":
      return "Aceptación de Reglas de la Red";
    case "accept_reglas_master":
      return "Aceptación de Reglas Master Broker";
    case "accept_commercial_terms":
      return "Aceptación de Condiciones Comerciales";
    case "accept_network_rates":
      return "Aceptación de Comisiones de Red";
    default:
      return type;
  }
}

export function formatAcceptedDate(dateValue: string | Date): { formatted: string; iso: string } {
  try {
    const d = new Date(dateValue);
    if (isNaN(d.getTime())) {
      return { formatted: String(dateValue), iso: String(dateValue) };
    }
    const formatted = new Intl.DateTimeFormat("es-MX", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "America/Mexico_City",
    }).format(d);
    return {
      formatted: `${formatted} (CDMX)`,
      iso: d.toISOString(),
    };
  } catch {
    return { formatted: String(dateValue), iso: String(dateValue) };
  }
}
