import { createHash } from "node:crypto";
import catalog from "./legalDocumentCatalog.json";
import type { LegalDocumentVersion, PublishedLegalDocument } from "../shared/legalDocuments";

// Accepted versions must never be edited or removed: append a new version instead.
// This catalog is the document source, not a record of anybody's acceptance.
const versions: readonly Readonly<LegalDocumentVersion>[] = Object.freeze(
  catalog.map((entry) => Object.freeze({ ...entry })),
);

const identities = new Set<string>();
for (const entry of versions) {
  if (identities.has(entry.id) || entry.id !== `${entry.document}:${entry.version}`) {
    throw new Error(`Invalid legal document identity: ${entry.id}`);
  }
  identities.add(entry.id);
  const digest = createHash("sha256").update(entry.content, "utf8").digest("hex");
  if (digest !== entry.contentSha256) {
    throw new Error(`Legal document content differs from its fingerprint: ${entry.id}`);
  }
  if (entry.effectiveAt && !Number.isFinite(Date.parse(entry.effectiveAt))) {
    throw new Error(`Invalid legal document effective date: ${entry.id}`);
  }
}

export function getPublishedLegalDocument(
  document: string,
  version?: string,
  now = new Date(),
): Readonly<PublishedLegalDocument> | undefined {
  if (document !== "terminos" && document !== "aviso") return undefined;
  const candidates = versions.filter((entry) =>
    entry.document === document && entry.effectiveAt &&
    Date.parse(entry.effectiveAt) <= now.getTime() &&
    (version === undefined || entry.version === version),
  );
  candidates.sort((a, b) => Date.parse(b.effectiveAt!) - Date.parse(a.effectiveAt!));
  return candidates[0] as Readonly<PublishedLegalDocument> | undefined;
}

export function getAllApprovedCatalogVersions(): readonly Readonly<LegalDocumentVersion>[] {
  return versions;
}

export function getApprovedLegalDocument(
  document: string,
  version: string,
): Readonly<LegalDocumentVersion> | undefined {
  return versions.find((entry) => entry.document === document && entry.version === version);
}

export interface LegalAcceptanceValidationResult {
  valid: boolean;
  error?: string;
  termsDoc?: PublishedLegalDocument;
  privacyDoc?: PublishedLegalDocument;
}

export function validateRegistrationAcceptance(params: {
  acceptTerms?: boolean;
  termsVersion?: string;
  acknowledgePrivacy?: boolean;
  privacyVersion?: string;
  now?: Date;
}): LegalAcceptanceValidationResult {
  if (params.acceptTerms !== true) {
    return {
      valid: false,
      error: "Debes aceptar los Términos y Condiciones para registrarte.",
    };
  }
  if (params.acknowledgePrivacy !== true) {
    return {
      valid: false,
      error: "Debes confirmar que has leído el Aviso de Privacidad para registrarte.",
    };
  }

  const currentTerms = getPublishedLegalDocument("terminos", undefined, params.now);
  if (!currentTerms) {
    return {
      valid: false,
      error: "Los Términos y Condiciones vigentes no están disponibles.",
    };
  }
  if (!params.termsVersion || params.termsVersion !== currentTerms.version) {
    return {
      valid: false,
      error: `La versión de Términos y Condiciones no está vigente o está desactualizada (vigente: ${currentTerms.version}).`,
    };
  }

  const currentPrivacy = getPublishedLegalDocument("aviso", undefined, params.now);
  if (!currentPrivacy) {
    return {
      valid: false,
      error: "El Aviso de Privacidad vigente no está disponible.",
    };
  }
  if (!params.privacyVersion || params.privacyVersion !== currentPrivacy.version) {
    return {
      valid: false,
      error: `La versión del Aviso de Privacidad no está vigente o está desactualizada (vigente: ${currentPrivacy.version}).`,
    };
  }

  return {
    valid: true,
    termsDoc: currentTerms,
    privacyDoc: currentPrivacy,
  };
}

