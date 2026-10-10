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
