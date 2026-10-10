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
  ipAddress: string | null;
  userAgent: string;
  acceptedAt: Date | string;
}
