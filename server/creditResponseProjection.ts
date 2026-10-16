/**
 * SEC-P0-05: Client-facing Credit DTO must never carry platform-only
 * commission allocation, internal margins or rates. Only Super Admin may
 * inspect the raw frozen economic snapshot via its authorized APIs.
 * Do not mutate the DB snapshot: return a projected copy only.
 */
const INTERNAL_PROPOSAL_KEYS = new Set([
  "commissionRates",
  "networkCommissionRates",
  "commissionsToApply",
  "platformNet",
  "platformMargin",
  "platformGrossMargin",
  "internalNotes",
  "overRate",
  "sobretasa",
  "masterBrokerShare",
  "brokerShare",
  "netCommission",
  "totalCommission",
  "commissionBreakdown",
  "internalMargin",
  "internalSpread",
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function removeInternalEconomics(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(removeInternalEconomics);
  if (!isPlainObject(value)) return value;
  const clean: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    if (INTERNAL_PROPOSAL_KEYS.has(key)) continue;
    clean[key] = removeInternalEconomics(nested);
  }
  return clean;
}

export function projectCreditForRole<T extends { finalProposal?: unknown }>(
  credit: T | null | undefined,
  role?: string
): T | null | undefined {
  if (!credit || role === "super_admin") return credit;
  return { ...credit, finalProposal: removeInternalEconomics(credit.finalProposal) } as T;
}
