/** Empty target placeholders are not received institution proposals. */
export function hasReceivedInstitutionProposal(target: { proposalReceivedAt?: unknown; institutionProposal?: unknown } | null | undefined): boolean {
  const proposal = target?.institutionProposal;
  if (!target?.proposalReceivedAt || !proposal || typeof proposal !== "object" || Array.isArray(proposal)) return false;
  const amount = Number((proposal as Record<string,unknown>).approvedAmount);
  return Number.isFinite(amount) && amount > 0;
}
