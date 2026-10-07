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

export type LegalAcceptanceType = "accept_terms" | "acknowledge_privacy";

export interface LegalAcceptanceRecord {
  id: string;
  userId: string;
  userEmail: string;
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


