/**
 * Freeze the Master Broker's *allocated broker* rate at proposal receipt.
 * The Master keeps the remainder of its approved offer-level ceiling.
 *
 * Do not look up these mutable rates at payout time. The resulting map is
 * stored in the institutionProposal and later frozen credit snapshot.
 */
export function buildNetworkCommissionSnapshot(
  sourceRates: Record<string, any>,
  allocation: Record<string, any> | null | undefined,
): Record<string, any> {
  const copy: Record<string, any> = JSON.parse(JSON.stringify(sourceRates));
  if (!allocation) return copy;
  const read = (value: unknown, field: string): number => {
    if (value === null || value === undefined || value === "" ||
        (typeof value !== "number" && typeof value !== "string")) {
      throw new Error(`NETWORK_COMMISSION_INVALID_${field}`);
    }
    const result = Number(value);
    if (!Number.isFinite(result) || result < 0 || result > 100) {
      throw new Error(`NETWORK_COMMISSION_INVALID_${field}`);
    }
    return result;
  };
  const ceilOpen = read(copy.masterBroker?.apertura, "MASTER_APERTURA");
  // Renewal is optional in published V5 offers. Missing means no renewal share.
  const ceilRenew = read(copy.masterBroker?.renovacion ?? 0, "MASTER_RENOVACION");
  const brokerOpen = read(allocation.apertura, "BROKER_APERTURA");
  const brokerRenew = read(allocation.renovacion ?? 0, "BROKER_RENOVACION");
  if (brokerOpen > ceilOpen || brokerRenew > ceilRenew) {
    throw new Error("NETWORK_COMMISSION_EXCEEDS_OFFER_CEILING");
  }
  copy.broker = {
    ...(copy.broker || {}),
    apertura: brokerOpen,
    renovacion: brokerRenew,
    sobretasa: 0,
  };
  copy.masterBroker = {
    ...(copy.masterBroker || {}),
    apertura: Number((ceilOpen - brokerOpen).toFixed(4)),
    renovacion: Number((ceilRenew - brokerRenew).toFixed(4)),
    sobretasa: 0,
  };
  // Do not alter lender gross, CN overrate, or other internal economics.
  return copy;
}
