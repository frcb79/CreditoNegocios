import { createHash } from "node:crypto";
import type { InstitutionProductVersion, LegalAcceptance, User } from "../shared/schema";
import type { IStorage } from "./storage";
import { compareOfferIntermediaryCommissions, computeInstitutionProductVersionHash } from "./offerVersionService";

type OfferVersion = Pick<InstitutionProductVersion, "institutionProductId" | "versionNumber" | "versionHash" | "conditions" | "requirements" | "requiredDocuments" | "variablesConfiguration" | "status">;
export const OFFER_COMMISSION_DOCUMENT = "comisiones-oferta";

export function offerCommissionDocumentId(offerId: string, versionNumber: number): string {
  return `${OFFER_COMMISSION_DOCUMENT}:${offerId}:${versionNumber}`;
}

function publicRates(version: OfferVersion): Record<string, unknown> {
  const rate = ((version.conditions || {}) as Record<string, any>).commissionRates || {};
  return {
    type: rate.type ?? null,
    broker: rate.broker ?? null,
    masterBroker: rate.masterBroker ?? null,
  };
}

export function buildOfferCommissionDocument(
  previous: OfferVersion | null | undefined,
  published: OfferVersion,
) {
  if (!previous) return null;
  const delta = compareOfferIntermediaryCommissions(previous as InstitutionProductVersion, published as InstitutionProductVersion);
  if (delta.requiresManualReview) throw new Error("OFFER_COMMISSION_MANUAL_REVIEW_REQUIRED");
  if (!delta.requiresAnyAcceptance) return null;
  const hash = computeInstitutionProductVersionHash({
    institutionProductId: published.institutionProductId,
    versionNumber: published.versionNumber,
    conditions: published.conditions,
    requirements: published.requirements,
    requiredDocuments: published.requiredDocuments || [],
    variablesConfiguration: published.variablesConfiguration,
  });
  if (!published.versionHash || published.versionHash !== hash) {
    throw new Error("OFFER_VERSION_HASH_MISMATCH");
  }
  const content = JSON.stringify({
    instrument: OFFER_COMMISSION_DOCUMENT,
    offerId: published.institutionProductId,
    versionNumber: published.versionNumber,
    offerVersionHash: hash,
    previousVersionNumber: previous.versionNumber,
    previousRates: publicRates(previous),
    newRates: publicRates(published),
    affected: {
      directBroker: delta.directBrokerChanged,
      masterBroker: delta.masterBrokerChanged,
    },
  });
  return {
    id: offerCommissionDocumentId(published.institutionProductId, published.versionNumber),
    document: OFFER_COMMISSION_DOCUMENT,
    title: `Actualización de comisiones — oferta ${published.institutionProductId} v${published.versionNumber}`,
    version: String(published.versionNumber),
    sourceFile: "institution_product_versions",
    content,
    contentSha256: createHash("sha256").update(content, "utf8").digest("hex"),
  };
}

export type OfferCommissionStatus = {
  offerId: string;
  versionNumber: number;
  requiresAcceptance: boolean;
  accepted: boolean;
  pending: boolean;
  documentId: string | null;
  contentSha256: string | null;
  applicableRole: "broker_directo" | "master_broker" | null;
  previousRates: unknown;
  newRates: unknown;
  reason?: string;
};

export async function getOfferCommissionStatus(
  targetStorage: IStorage,
  user: User,
  offerId: string,
  versionNumber: number,
): Promise<OfferCommissionStatus> {
  const versions = await targetStorage.getInstitutionProductVersions(offerId);
  const current = versions.find(v => v.versionNumber === versionNumber);
  if (!current || current.institutionProductId !== offerId || current.status !== "published") {
    throw new Error("OFFER_VERSION_NOT_CURRENT");
  }
  const previous = versions
    .filter(v => v.versionNumber < versionNumber && ["superseded", "published", "active"].includes(v.status))
    .sort((a, b) => b.versionNumber - a.versionNumber)[0] || null;
  // A Broker affiliated to a Master must NOT see or accept the Master's
  // wholesale offer margin. Their individual rate is governed by the
  // separate, accepted network-rate document.
  const applicableRole = user.role === "master_broker" ? "master_broker" :
    user.role === "broker" && !user.masterBrokerId ? "broker_directo" : null;
  const summary: OfferCommissionStatus = {
    offerId, versionNumber, requiresAcceptance: false, accepted: true, pending: false,
    documentId: null, contentSha256: null, applicableRole,
    previousRates: null, newRates: null,
  };
  if (!applicableRole || !previous) return summary;
  const delta = compareOfferIntermediaryCommissions(previous, current);
  // Existing data with no comparable economic schedule must not silently pass.
  if (delta.requiresManualReview) return { ...summary, requiresAcceptance: true, accepted: false, pending: true, reason: "OFFER_COMMISSION_MANUAL_REVIEW_REQUIRED" };
  const affected = applicableRole === "broker_directo" ? delta.directBrokerChanged : delta.masterBrokerChanged;
  if (!affected) return summary;
  const expected = buildOfferCommissionDocument(previous, current);
  if (!expected) return summary;
  const doc = await targetStorage.getLegalDocumentVersion(expected.id);
  if (!doc || doc.document !== expected.document || doc.contentSha256 !== expected.contentSha256 ||
      createHash("sha256").update(doc.content, "utf8").digest("hex") !== expected.contentSha256) {
    return { ...summary, requiresAcceptance: true, accepted: false, pending: true, reason: "OFFER_COMMISSION_DOCUMENT_UNAVAILABLE" };
  }
  const accepted = (await targetStorage.getLegalAcceptancesByUser(user.id)).some(a =>
    isOfferCommissionAcceptanceValid(a, expected.id, expected.contentSha256, applicableRole));
  const evidence = JSON.parse(expected.content);
  const channel = applicableRole === "broker_directo" ? "broker" : "masterBroker";
  return {
    ...summary, requiresAcceptance: true, accepted, pending: !accepted,
    documentId: doc.id, contentSha256: doc.contentSha256,
    previousRates: { type: evidence.previousRates.type, [channel]: evidence.previousRates[channel] },
    newRates: { type: evidence.newRates.type, [channel]: evidence.newRates[channel] },
  };
}

function isOfferCommissionAcceptanceValid(
  a: LegalAcceptance, documentId: string, sha: string, applicableRole: string,
): boolean {
  const snapshot = a.personalizedSnapshot as any;
  return a.document === OFFER_COMMISSION_DOCUMENT &&
    a.documentId === documentId &&
    a.contentSha256 === sha &&
    a.templateSha256 === sha &&
    a.acceptanceType === "accept_offer_commissions" &&
    snapshot?.applicableRole === applicableRole &&
    snapshot?.documentId === documentId &&
    snapshot?.contentSha256 === sha &&
    a.personalizedSha256 === createHash("sha256").update(JSON.stringify(snapshot), "utf8").digest("hex");
}

export async function acceptOfferCommission(
  targetStorage: IStorage,
  user: User,
  offerId: string,
  versionNumber: number,
  ipAddress: string | null,
  userAgent: string,
) {
  const current = await getOfferCommissionStatus(targetStorage, user, offerId, versionNumber);
  if (!current.requiresAcceptance || !current.documentId || !current.contentSha256) {
    throw new Error(current.reason || "OFFER_COMMISSIONS_NOT_PENDING");
  }
  if (current.accepted) return { alreadyAccepted: true, status: current };
  const doc = await targetStorage.getLegalDocumentVersion(current.documentId);
  if (!doc || doc.contentSha256 !== current.contentSha256) throw new Error("OFFER_COMMISSION_DOCUMENT_UNAVAILABLE");
  const now = new Date();
  const snapshot = {
    documentId: doc.id, contentSha256: doc.contentSha256, offerId, versionNumber,
    applicableRole: current.applicableRole, previousRates: current.previousRates,
    newRates: current.newRates, userId: user.id, acceptedAt: now.toISOString(),
    ipAddress, userAgent,
  };
  const acceptanceId = createHash("sha256").update(`${user.id}:${doc.id}:${current.applicableRole}`).digest("hex");
  // Deterministic primary key prevents duplicate evidence even under concurrent
  // retries in PostgreSQL; a racing insert may raise 23505, then re-read it.
  const evidence = {
    id: acceptanceId,
    userId: user.id,
    userEmail: user.email || "",
    userName: [user.firstName, user.lastName].filter(Boolean).join(" ") || null,
    documentId: doc.id,
    document: OFFER_COMMISSION_DOCUMENT,
    version: doc.version,
    contentSha256: doc.contentSha256,
    acceptanceType: "accept_offer_commissions",
    ipAddress,
    userAgent,
    templateSha256: doc.contentSha256,
    personalizedSha256: createHash("sha256").update(JSON.stringify(snapshot), "utf8").digest("hex"),
    personalizedSnapshot: snapshot,
  };
  try {
    await targetStorage.createLegalAcceptance(evidence);
  } catch (error: any) {
    if (error?.code !== "23505") throw error;
    const existing = await targetStorage.getLegalAcceptanceById(acceptanceId);
    if (!existing || !isOfferCommissionAcceptanceValid(existing, doc.id, doc.contentSha256, current.applicableRole!)) throw error;
  }
  const refreshed = await getOfferCommissionStatus(targetStorage, user, offerId, versionNumber);
  if (!refreshed.accepted) throw new Error("OFFER_COMMISSION_ACCEPTANCE_NOT_VERIFIED");
  return { alreadyAccepted: false, status: refreshed };
}
