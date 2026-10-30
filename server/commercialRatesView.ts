import { storage } from "./storage";

export type PublishedCommissionOffer = {
  offerId: string;
  offerName: string;
  institutionId: string;
  institutionName: string;
  versionNumber: number;
  master: { apertura: number; renovacion: number };
  broker: { apertura: number; renovacion: number };
};

const safeRate = (value: unknown): number => {
  if (value === null || value === undefined || value === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

/**
 * Use the same storage adapter as the rest of the application so staging,
 * production and in-memory security tests exercise identical business rules.
 * Do not fall back to institution-level commissionRates.
 */
export async function loadPublishedCommissionOffers(): Promise<PublishedCommissionOffer[]> {
  const [products, institutions] = await Promise.all([
    storage.getInstitutionProducts(),
    storage.getFinancialInstitutions()
  ]);
  const institutionMap = new Map(institutions.filter(i => i.isActive !== false).map(i => [i.id, i]));
  const published = products.filter(p => p.status === "published" &&
    p.isActive !== false && institutionMap.has(p.institutionId));
  const mapped = await Promise.all(published.map(async (p): Promise<PublishedCommissionOffer | null> => {
    const versions = await storage.getInstitutionProductVersions(p.id);
    const active = versions.find(v => v.status === "published");
    if (!active) return null;
    const rates = ((active.conditions || {}) as Record<string, any>).commissionRates || {};
    return {
      offerId: p.id,
      offerName: p.customName || p.name,
      institutionId: p.institutionId,
      institutionName: institutionMap.get(p.institutionId)!.name,
      versionNumber: active.versionNumber,
      master: {
        apertura: safeRate(rates.masterBroker?.apertura),
        renovacion: safeRate(rates.masterBroker?.renovacion)
      },
      broker: {
        apertura: safeRate(rates.broker?.apertura),
        renovacion: safeRate(rates.broker?.renovacion)
      }
    };
  }));
  return mapped.filter((row): row is PublishedCommissionOffer => row !== null)
    .sort((a,b) => a.institutionName.localeCompare(b.institutionName) ||
      a.offerName.localeCompare(b.offerName));
}

/**
 * An institution-wide network allocation must be safe for EVERY published
 * offer of that institution. A zero ceiling is a real zero, never unlimited.
 * Varying offer-specific ceilings stay visible for inspection.
 */
export function masterSafeCeilings(offers: PublishedCommissionOffer[]) {
  return {
    apertura: offers.length ? Math.min(...offers.map(x => x.master.apertura)) : 0,
    renovacion: offers.length ? Math.min(...offers.map(x => x.master.renovacion)) : 0,
    brokerApertura: offers.length ? Math.min(...offers.map(x => x.broker.apertura)) : 0,
    brokerRenovacion: offers.length ? Math.min(...offers.map(x => x.broker.renovacion)) : 0,
  };
}
