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


