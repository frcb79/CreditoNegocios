/**
 * Selected/financed targets are immutable for administrative review transitions.
 * Multiple distinct targets of one request may independently finance; only the
 * individual target with a winner/credit linkage is frozen.
 */
export function assertTargetReviewMutable(target: {
  isWinner?: boolean | null;
  creditId?: string | null;
  status?: string | null;
}): void {
  if (target.isWinner || target.creditId ||
      target.status === "selected_winner" || target.status === "dispersed") {
    throw new Error("TARGET_ALREADY_SELECTED");
  }
}

/** Explicit internal review of an offer already received outside the platform.
 * Not a record of document disclosure, offer acceptance or disbursement.
 */
export interface ExternalProposalReview {
  reviewedBy: string;
  evidenceReference: string;
}
export function externalProposalReviewNote(
  target: { status?: string | null; reviewedBy?: string | null; reviewedAt?: unknown; adminNotes?: string | null; isWinner?: boolean | null; creditId?: string | null },
  parentStatus: string | undefined,
  review: ExternalProposalReview,
  now = new Date()
): string {
  assertTargetReviewMutable(target);
  if (target.status !== "approved" || !target.reviewedBy || !target.reviewedAt) {
    throw new Error("EXTERNAL_PROPOSAL_REQUIRES_APPROVAL");
  }
  if (!parentStatus || ["cancelled","completed"].includes(parentStatus)) {
    throw new Error("REQUEST_CLOSED");
  }
  const ref = review.evidenceReference.trim();
  if (!review.reviewedBy.trim() || ref.length < 3 || ref.length > 300) {
    throw new Error("EXTERNAL_PROPOSAL_EVIDENCE_REQUIRED");
  }
  const note = "[Oferta externa verificada por Super Admin " + review.reviewedBy + " · " + now.toISOString() + "] Referencia: " + ref;
  return [target.adminNotes, note].filter(Boolean).join("\n");
}
