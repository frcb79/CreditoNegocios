export type PublicLegalDocument = "terminos" | "aviso";

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
  | "accept_convenio"
  | "accept_reglas_red"
  | "accept_reglas_master";

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
  ipAddress: string;
  userAgent: string;
  acceptedAt: Date | string;
}

export interface FormalizationStatusResult {
  requiresFormalization: boolean;
  isFormalized: boolean;
  formalizedAt?: string | null;
  requiredDocuments: string[];
  acceptedDocuments: string[];
}

export interface FormalizationDocumentItem {
  document: string;
  version: string;
  title: string;
  content: string;
  contentSha256: string;
  effectiveAt?: string;
}

export interface FormalizationDocumentsResult {
  requiresFormalization: boolean;
  isFormalized: boolean;
  user?: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
  documents: FormalizationDocumentItem[];
  message?: string;
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
    case "accept_convenio":
      return "Aceptación de Convenio";
    case "accept_reglas_red":
      return "Aceptación de Reglas de la Red";
    case "accept_reglas_master":
      return "Aceptación de Reglas Master Broker";
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

/**
 * Validates if the user has all profile fields required to populate and formalize the Convenio.
 * Returns an array of human-readable missing field names.
 */
export function getFormalizationProfileMissingFields(user: any): string[] {
  if (!user) return ["Datos de usuario no disponibles"];
  const missing: string[] = [];

  const fullName =
    (user.profileData as any)?.businessName ||
    [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
    user.brandName;
  if (!fullName) {
    missing.push("Nombre o razón social");
  }

  const rfc =
    (user.profileData as any)?.taxId ||
    (user.profileData as any)?.rfc ||
    user.taxId ||
    user.rfc;
  if (!rfc || typeof rfc !== "string" || rfc.trim().length < 12) {
    missing.push("RFC con homoclave (12 o 13 caracteres)");
  }

  const addr = (user.profileData as any)?.address;
  const hasStreet = addr?.street && String(addr.street).trim().length > 0;
  const hasCityOrState =
    (addr?.city && String(addr.city).trim().length > 0) ||
    (addr?.state && String(addr.state).trim().length > 0);
  const hasPostalCode = addr?.postalCode && String(addr.postalCode).trim().length > 0;
  if (!hasStreet || !hasCityOrState || !hasPostalCode) {
    missing.push("Domicilio fiscal completo (calle, estado y código postal)");
  }

  const phone = user.phone || (user.profileData as any)?.phone;
  if (!phone || String(phone).trim().length < 8) {
    missing.push("Teléfono de contacto");
  }

  const bankName = user.bankName;
  if (!bankName || String(bankName).trim().length === 0) {
    missing.push("Institución bancaria para comisiones");
  }

  const clabe = user.clabe;
  const hasClabe = clabe && /^\d{18}$/.test(String(clabe).trim());
  if (!hasClabe) {
    missing.push("CLABE interbancaria (18 dígitos numéricos)");
  }

  return missing;
}

/**
 * Replaces placeholders in the Convenio de Colaboración template with real user profile data.
 */
export function interpolateConvenioContent(
  rawContent: string,
  user: any,
  acceptanceInfo?: { acceptedAt?: string | Date; otpCodeMasked?: string }
): string {
  if (!rawContent || !rawContent.includes("CONVENIO DE COLABORACIÓN")) {
    return rawContent;
  }
  if (!user) return rawContent;

  const fullName =
    (user.profileData as any)?.businessName ||
    [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
    user.accountHolder ||
    "_________________________________";

  const rfc =
    (user.profileData as any)?.taxId ||
    (user.profileData as any)?.rfc ||
    user.taxId ||
    user.rfc ||
    "_________________________________";

  const addr = (user.profileData as any)?.address;
  let formattedAddress = "_________________________________";
  if (addr?.street) {
    const ext = addr.exteriorNumber ? ` #${addr.exteriorNumber}` : "";
    const int = addr.interiorNumber ? ` Int. ${addr.interiorNumber}` : "";
    const col = addr.colonia ? `, Col. ${addr.colonia}` : "";
    const city = addr.city ? `, ${addr.city}` : "";
    const state = addr.state ? `, ${addr.state}` : "";
    const cp = addr.postalCode ? `, C.P. ${addr.postalCode}` : "";
    formattedAddress = `${addr.street}${ext}${int}${col}${city}${state}${cp}`.trim();
  }

  const email = user.email || "_________________________________";
  const phone = user.phone || (user.profileData as any)?.phone || "_________________________________";

  const isMaster = user.role === "master_broker";
  const tipoMarkup = isMaster
    ? "☐ Broker    ☒ Master Broker"
    : "☒ Broker    ☐ Master Broker";

  const bankName = user.bankName || "Por definir";
  const clabe = user.clabe || "_________________________________";
  const holder = user.accountHolder || fullName;
  const bancoClabe = `${bankName} | Titular: ${holder} | CLABE: ${clabe}`;

  let content = rawContent
    .replace("Nombre o razón social: _________________________________", `Nombre o razón social: ${fullName}`)
    .replace("RFC\n\t_________________________________", `RFC\n\t${rfc}`)
    .replace("Domicilio\n\t_________________________________", `Domicilio\n\t${formattedAddress}`)
    .replace("Correo electrónico\n\t_________________________________", `Correo electrónico\n\t${email}`)
    .replace("Teléfono\n\t_________________________________", `Teléfono\n\t${phone}`)
    .replace("☐ Broker    ☐ Master Broker", tipoMarkup)
    .replace("Banco / CLABE\n\t_________________________________", `Banco / TITULAR y CLABE\n\t${bancoClabe}`);

  // Acceptance footer
  const dateFormatted = acceptanceInfo?.acceptedAt
    ? formatAcceptedDate(acceptanceInfo.acceptedAt).formatted
    : formatAcceptedDate(new Date()).formatted;

  const firmaElectronica = `Aceptación electrónica mediante código OTP verificado (${email})`;

  content = content
    .replace(
      "\tColaborador\n\tNombre / razón social: _______________________________\nRepresentante, cuando corresponda: __________________\nFirma / aceptación: _______________________________",
      `\tColaborador\n\tNombre / razón social: ${fullName}\n\tFirma / aceptación: ${firmaElectronica}`
    )
    .replace(
      "\tFecha\n\t_________________________________",
      `\tFecha\n\t${dateFormatted}`
    );

  return content;
}



