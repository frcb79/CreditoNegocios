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
