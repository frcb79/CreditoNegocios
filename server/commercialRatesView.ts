import { pool } from "./db";

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

/** Published version is the sole source of current channel ceilings. */
export async function loadPublishedCommissionOffers(): Promise<PublishedCommissionOffer[]> {
  const { rows } = await pool.query([
    'SELECT p.id AS "offerId", p.name AS "offerName", p.institution_id AS "institutionId",',
    'fi.name AS "institutionName", v.version_number AS "versionNumber",',
    "v.conditions->'commissionRates'->'masterBroker' AS master,",
    "v.conditions->'commissionRates'->'broker' AS broker",
    'FROM public.institution_products p',
    'JOIN public.institution_product_versions v ON v.institution_product_id=p.id',
    'JOIN public.financial_institutions fi ON fi.id=p.institution_id',
    "WHERE p.status='published' AND p.is_active=true AND v.status='published'",
    'AND fi.is_active=true ORDER BY fi.name, p.name'
  ].join(' '));
  return rows.map((row: any) => ({
    offerId: row.offerId,
    offerName: row.offerName,
    institutionId: row.institutionId,
    institutionName: row.institutionName,
    versionNumber: Number(row.versionNumber),
    master: { apertura: safeRate(row.master?.apertura), renovacion: safeRate(row.master?.renovacion) },
    broker: { apertura: safeRate(row.broker?.apertura), renovacion: safeRate(row.broker?.renovacion) }
  }));
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
