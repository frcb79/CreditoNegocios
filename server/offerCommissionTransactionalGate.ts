import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import {
  institutionProducts, institutionProductVersions, users,
  legalDocumentVersions, legalAcceptances,
} from "../shared/schema";
import {
  buildOfferCommissionDocument, isOfferCommissionAcceptanceValid,
  isQuoteHistoricallyFrozen,
} from "./offerCommissionAcceptance";
import { compareOfferIntermediaryCommissions } from "./offerVersionService";

/**
 * A proposal created BEFORE a financial institution first published an offer
 * may be kept as legacy history. If a catalog already existed, creating a NEW
 * unversioned credit must fail; there is no approved commission schedule.
 *
 * This is evaluated in the same transaction as the financial write, using
 * server-owned proposalReceivedAt and publishedAt (never a client timestamp).
 */
export async function assertLegacyProposalPredatesPublishedCatalogInTransaction(
  tx: any,
  args: { financialInstitutionId: string | null; proposalRecordedAt?: Date | string | null },
): Promise<void> {
  if (!args.financialInstitutionId) return; // unassigned draft (no institution)
  const products = await tx.select({ id: institutionProducts.id }).from(institutionProducts)
    .where(and(
      eq(institutionProducts.institutionId, args.financialInstitutionId),
      eq(institutionProducts.status, "published"),
      eq(institutionProducts.isActive, true),
    ));
  if (!products.length) return; // institution does not yet have a published catalog
  const timestamp = args.proposalRecordedAt
    ? new Date(args.proposalRecordedAt).getTime() : NaN;
  if (!Number.isFinite(timestamp)) {
    throw new Error("OFFER_VERSION_REQUIRED_FOR_PUBLISHED_INSTITUTION");
  }
  let earliestPublishedAt = Infinity;
  for (const product of products) {
    const versions = await tx.select({
      publishedAt: institutionProductVersions.publishedAt,
    }).from(institutionProductVersions).where(and(
      eq(institutionProductVersions.institutionProductId, product.id),
    ));
    for (const item of versions) {
      if (!item.publishedAt) continue;
      const when = new Date(item.publishedAt).getTime();
      if (Number.isFinite(when)) earliestPublishedAt = Math.min(earliestPublishedAt, when);
    }
  }
  if (timestamp >= earliestPublishedAt) {
    throw new Error("OFFER_VERSION_REQUIRED_FOR_PUBLISHED_INSTITUTION");
  }
  if (earliestPublishedAt === Infinity) {
    // Missing authoritative publication timestamps must not permit a bypass.
    throw new Error("OFFER_VERSION_PUBLICATION_HISTORY_UNVERIFIED");
  }
}

/**
 * COM-28: Re-check version + accepted SHA *inside the same PostgreSQL
 * transaction* as winner/credit creation. Lock the parent offer so publish
 * cannot supersede this version between the gate and the financial write.
 *
 * No acceptance is backdated for an already-frozen proposal. Never use the
 * Broker's current Master for a submission's historical payout attribution.
 */
export async function assertOfferCommissionAcceptanceInTransaction(
  tx: any,
  args: {
    offerId: string;
    versionNumber: number;
    financialInstitutionId: string | null;
    brokerId: string;
    originMasterBrokerId: string | null;
    proposalRecordedAt?: string | Date | null;
  },
): Promise<void> {
  // Lock ordering is offer -> version -> evidence; no schema modification.
  await tx.execute(sql`SELECT id FROM institution_products WHERE id = ${args.offerId} FOR UPDATE`);
  const [product] = await tx.select().from(institutionProducts)
    .where(eq(institutionProducts.id, args.offerId)).limit(1);
  if (!product || (args.financialInstitutionId && product.institutionId !== args.financialInstitutionId)) {
    throw new Error("OFFER_VERSION_INSTITUTION_MISMATCH");
  }
  const history = await tx.select().from(institutionProductVersions)
    .where(eq(institutionProductVersions.institutionProductId, args.offerId));
  const current = history.find((v: any) => v.versionNumber === args.versionNumber);
  if (!current || !["published", "superseded"].includes(current.status)) {
    throw new Error("OFFER_VERSION_NOT_PUBLISHED");
  }
  if (current.status === "superseded") {
    if (!isQuoteHistoricallyFrozen(current, args.proposalRecordedAt)) {
      throw new Error("OFFER_VERSION_SUPERSEDED_NEW_OPERATION");
    }
    return;
  }

  const payeeColumns = { id: users.id, role: users.role, masterBrokerId: users.masterBrokerId };
  const [broker] = await tx.select(payeeColumns).from(users)
    .where(eq(users.id, args.brokerId)).limit(1);
  if (!broker) throw new Error("OFFER_ACCEPTANCE_ORIGINATOR_UNAVAILABLE");

  const payeeId = args.originMasterBrokerId || args.brokerId;
  const [payee] = payeeId === broker.id ? [broker] : await tx.select(payeeColumns).from(users)
    .where(eq(users.id, payeeId)).limit(1);
  if (!payee) throw new Error("OFFER_ACCEPTANCE_PAYEE_NOT_FOUND");
  if (args.originMasterBrokerId && payee.role !== "master_broker") {
    throw new Error("OFFER_ACCEPTANCE_MASTER_ROLE_MISMATCH");
  }
  if (!args.originMasterBrokerId && broker.role === "broker" && broker.masterBrokerId) {
    const [parent] = await tx.select(payeeColumns).from(users)
      .where(eq(users.id, broker.masterBrokerId)).limit(1);
    if (!parent) throw new Error("OFFER_MASTER_AFFILIATION_UNVERIFIED");
    if (parent.role === "master_broker") throw new Error("MISSING_ORIGIN_MASTER_FOR_OFFER");
  }
  const channel = payee.role === "master_broker" ? "master_broker" :
    payee.role === "broker" ? "broker_directo" : null;
  if (!channel) return; // self-originating platform Admin is not an intermediary payee

  const previous = history.filter((v: any) => v.versionNumber < args.versionNumber &&
    v.status !== "draft").sort((a: any, b: any) => b.versionNumber - a.versionNumber)[0] || null;
  if (!previous) return; // first published economic terms are baseline
  const delta = compareOfferIntermediaryCommissions(previous, current);
  if (delta.requiresManualReview) throw new Error("OFFER_COMMISSION_MANUAL_REVIEW_REQUIRED");
  const materialForPayee = channel === "master_broker"
    ? delta.masterBrokerChanged : delta.directBrokerChanged;
  if (!materialForPayee) return;
  const expected = buildOfferCommissionDocument(previous, current);
  if (!expected) throw new Error("OFFER_COMMISSION_DOCUMENT_UNAVAILABLE");
  const [doc] = await tx.select().from(legalDocumentVersions)
    .where(eq(legalDocumentVersions.id, expected.id)).limit(1);
  if (!doc || doc.document !== expected.document ||
      doc.contentSha256 !== expected.contentSha256 ||
      doc.content !== expected.content ||
      createHash("sha256").update(doc.content, "utf8").digest("hex") !== expected.contentSha256) {
    throw new Error("OFFER_COMMISSION_DOCUMENT_UNAVAILABLE");
  }
  const acceptances = await tx.select().from(legalAcceptances).where(and(
    eq(legalAcceptances.userId, payee.id),
    eq(legalAcceptances.documentId, doc.id),
  ));
  if (!acceptances.some((a: any) =>
    isOfferCommissionAcceptanceValid(a, doc.id, doc.contentSha256, channel))) {
    throw new Error("OFFER_COMMISSION_ACCEPTANCE_REQUIRED");
  }
}
