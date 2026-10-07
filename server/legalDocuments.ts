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

export const FORMALIZATION_OTP_EXPIRATION_MS = 10 * 60 * 1000; // 10 minutes
export const FORMALIZATION_OTP_COOLDOWN_MS = 60 * 1000; // 60 seconds
export const FORMALIZATION_OTP_MAX_ATTEMPTS = 5;
export const FORMALIZATION_OTP_MAX_REQUESTS_PER_WINDOW = 5;
export const FORMALIZATION_OTP_WINDOW_MS = 60 * 60 * 1000; // 60 minutes

import { randomInt, createHmac, timingSafeEqual } from "node:crypto";
import { getRequiredFormalizationDocuments } from "../shared/legalDocuments";

// Currently enabled active versions for formalization documents
export const ACTIVE_FORMALIZATION_VERSIONS: Record<string, string> = {
  convenio: "1.0",
  "reglas-red": "1.0",
  "reglas-master": "1.0",
};

export function getActiveFormalizationDocument(document: string): Readonly<LegalDocumentVersion> | undefined {
  const activeVersion = ACTIVE_FORMALIZATION_VERSIONS[document];
  if (!activeVersion) return undefined;
  return getApprovedLegalDocument(document, activeVersion);
}

export function getFormalizationCatalogDocuments(role?: string | null): Readonly<LegalDocumentVersion>[] {
  const required = getRequiredFormalizationDocuments(role);
  const result: Readonly<LegalDocumentVersion>[] = [];
  for (const docType of required) {
    const activeDoc = getActiveFormalizationDocument(docType);
    if (!activeDoc) {
      throw new Error(`Documento requerido no encontrado o no habilitado en el catálogo aprobado: ${docType}`);
    }
    result.push(activeDoc);
  }
  return result;
}

export interface FormalizationValidationResult {
  valid: boolean;
  error?: string;
  catalogDocs?: Readonly<LegalDocumentVersion>[];
}

export function validateFormalizationConfirmation(
  role: string,
  confirmedDocuments?: Array<{ document: string; version: string }>,
): FormalizationValidationResult {
  const requiredDocTypes = getRequiredFormalizationDocuments(role);
  if (requiredDocTypes.length === 0) {
    return {
      valid: false,
      error: `El rol '${role}' no requiere formalización de Convenio de Colaboración.`,
    };
  }

  if (!Array.isArray(confirmedDocuments) || confirmedDocuments.length === 0) {
    return {
      valid: false,
      error: "Debes confirmar explícitamente todos los documentos aplicables para formalizar.",
    };
  }

  // Check for duplicate confirmations in the payload
  const confirmedTypes = new Set<string>();
  for (const item of confirmedDocuments) {
    if (confirmedTypes.has(item.document)) {
      return {
        valid: false,
        error: `El documento '${item.document}' se encuentra duplicado en la confirmación.`,
      };
    }
    confirmedTypes.add(item.document);
  }

  // Ensure all required types are confirmed
  for (const reqType of requiredDocTypes) {
    if (!confirmedTypes.has(reqType)) {
      return {
        valid: false,
        error: `Falta confirmar el documento requerido: '${reqType}'.`,
      };
    }
  }

  // Ensure no unneeded documents are confirmed
  for (const confType of Array.from(confirmedTypes)) {
    if (!requiredDocTypes.includes(confType)) {
      return {
        valid: false,
        error: `El documento '${confType}' no corresponde a los documentos de formalización para tu rol.`,
      };
    }
  }

  // Validate versions against currently enabled active versions in catalog
  const catalogDocs: Readonly<LegalDocumentVersion>[] = [];
  for (const item of confirmedDocuments) {
    const activeVersion = ACTIVE_FORMALIZATION_VERSIONS[item.document];
    if (!activeVersion || item.version !== activeVersion) {
      return {
        valid: false,
        error: `La versión '${item.version}' para el documento '${item.document}' no está habilitada actualmente (versión vigente: ${activeVersion || 'ninguna'}).`,
      };
    }

    const approved = getApprovedLegalDocument(item.document, item.version);
    if (!approved) {
      return {
        valid: false,
        error: `La versión '${item.version}' para el documento '${item.document}' no está aprobada en el catálogo.`,
      };
    }
    catalogDocs.push(approved);
  }

  return {
    valid: true,
    catalogDocs,
  };
}

export function generateOtpCode(): string {
  // Cryptographically secure 6-digit random code (100000 - 999999)
  return randomInt(100000, 1000000).toString();
}

export function getFormalizationOtpSecret(): string {
  const secret =
    process.env.FORMALIZATION_OTP_SECRET ||
    (process.env.NODE_ENV === "test" ? "test-formalization-otp-secret-key-32b" : undefined);
  if (!secret) {
    throw new Error("FORMALIZATION_OTP_SECRET no está configurado en las variables de entorno del servidor.");
  }
  return secret;
}

export function hashOtpCode(code: string): string {
  const secret = getFormalizationOtpSecret();
  return createHmac("sha256", secret).update(code.trim(), "utf8").digest("hex");
}

export function verifyOtpCode(code: string, hash: string): boolean {
  if (!code || !hash) return false;
  try {
    const computed = hashOtpCode(code);
    const computedBuf = Buffer.from(computed, "hex");
    const storedBuf = Buffer.from(hash, "hex");
    if (computedBuf.length !== storedBuf.length) {
      return false;
    }
    return timingSafeEqual(computedBuf, storedBuf);
  } catch {
    return false;
  }
}



