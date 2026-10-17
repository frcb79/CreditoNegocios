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
