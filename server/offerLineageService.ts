/**
 * FIN-P0: A versioned commercial proposal must carry BOTH immutable identifiers.
 * Legacy targets with no offer identity remain readable. Never infer an offer
 * from financialInstitutionId or from the latest product version.
 */
export interface FrozenOfferLineage {
  institutionProductId: string;
  versionNumber: number;
}
export function readFrozenOfferLineage(snapshot: unknown): FrozenOfferLineage | null {
  const p = (snapshot && typeof snapshot === "object") ? snapshot as Record<string, unknown> : {};
  const productId = p.institutionProductId ?? p.offerId;
  const altId = p.offerId;
  const version = p.versionNumber;
  if (productId == null && version == null) return null;
  if (typeof productId !== "string" || !productId.trim() ||
      (altId != null && altId !== productId) ||
      (typeof version !== "number" && typeof version !== "string") ||
      String(version).trim() === "" || !Number.isSafeInteger(Number(version)) || Number(version) < 1) {
    throw new Error("OFFER_VERSION_IDENTITY_INCOMPLETE");
  }
  return { institutionProductId: productId, versionNumber: Number(version) };
}
export function assertFrozenOfferLineage(targetProposal: unknown, creditSnapshot: unknown): FrozenOfferLineage | null {
  const target = readFrozenOfferLineage(targetProposal);
  const credit = readFrozenOfferLineage(creditSnapshot);
  if ((target === null) !== (credit === null) ||
      (target && credit && (target.institutionProductId !== credit.institutionProductId ||
        target.versionNumber !== credit.versionNumber))) {
    throw new Error("OFFER_VERSION_IDENTITY_MISMATCH");
  }
  return target;
}
