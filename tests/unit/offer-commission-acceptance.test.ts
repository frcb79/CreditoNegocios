import { randomUUID } from "node:crypto";
import { computeInstitutionProductVersionHash } from "../../server/offerVersionService";
import {
  buildOfferCommissionDocument,
  getOfferCommissionStatus,
  acceptOfferCommission,
  isQuoteHistoricallyFrozen,
} from "../../server/offerCommissionAcceptance";
import type { IStorage } from "../../server/storage";

const offerId = "offer-com28";
const rates = (broker: number, master: number) => ({
  type: "porcentaje",
  broker: { apertura: broker },
  masterBroker: { apertura: master },
  financiera: { apertura: 5 },
  platformNet: { direct: 5 - broker, master: 5 - master },
});
function version(versionNumber: number, broker: number, master: number, status: string) {
  const conditions = { commissionRates: rates(broker, master) };
  const base = {
    institutionProductId: offerId,
    versionNumber,
    status,
    conditions,
    requirements: { targetProfiles: ["persona_moral"] },
    requiredDocuments: [],
    variablesConfiguration: {},
  };
  return {
    ...base,
    versionHash: computeInstitutionProductVersionHash(base),
  } as any;
}
function user(role: string, masterBrokerId: string | null = null) {
  return {
    id: randomUUID(),
    email: randomUUID() + "@network.test",
    firstName: "Prueba", lastName: "Com28",
    role, masterBrokerId,
  } as any;
}
function setup(opts?: { missingDocument?: boolean }) {
  const previous = version(1, 2, 3, "superseded");
  const published = version(2, 2.5, 3.25, "published");
  const doc = buildOfferCommissionDocument(previous, published)!;
  const documentMap = new Map([[doc.id, { ...doc, effectiveAt: new Date() }]]);
  const acceptances: any[] = [];
  if (opts?.missingDocument) documentMap.clear();
  const storage = {
    getInstitutionProductVersions: async () => [previous, published],
    getUser: async (id: string) =>
      id === "master-123" ? ({ id, role: "master_broker" } as any) :
      id === "admin-123" ? ({ id, role: "admin" } as any) : undefined,
    getLegalDocumentVersion: async (id: string) => documentMap.get(id),
    getLegalAcceptancesByUser: async (userId: string) => acceptances.filter(a => a.userId === userId),
    getLegalAcceptanceById: async (id: string) => acceptances.find(a => a.id === id),
    createLegalAcceptance: async (acceptance: any) => {
      if (acceptances.some(a => a.id === acceptance.id)) throw Object.assign(new Error("duplicate"), { code: "23505" });
      acceptances.push(acceptance);
      return acceptance;
    },
  } as unknown as IStorage;
  return { storage, previous, published, doc, acceptances };
}

describe("COM-28 - Aceptación económica por beneficiario y versión", () => {
  it("vincula oferta, versión y hash antes de activar un beneficiario", async () => {
    const { storage, doc, acceptances } = setup();
    const broker = user("broker");
    const before = await getOfferCommissionStatus(storage, broker, offerId, 2);
    expect(before.pending).toBe(true);
    expect(before.contentSha256).toBe(doc.contentSha256);
    expect(JSON.stringify(before.newRates)).not.toContain("masterBroker");
    expect(JSON.stringify(before.newRates)).not.toContain("plataforma");
    const result = await acceptOfferCommission(storage, broker, offerId, 2, "127.0.0.1", "Browser COM28");
    expect(result.status.accepted).toBe(true);
    expect(result.status.pending).toBe(false);
    expect(acceptances).toHaveLength(1);
    expect(acceptances[0].personalizedSnapshot.offerId).toBe(offerId);
    expect(acceptances[0].personalizedSnapshot.versionNumber).toBe(2);
    expect(acceptances[0].personalizedSnapshot.ipAddress).toBe("127.0.0.1");
    expect(acceptances[0].personalizedSnapshot.userAgent).toBe("Browser COM28");
  });

  it("no permite a Broker de red consultar ni aceptar la cuota mayorista del Master", async () => {
    const { storage, acceptances } = setup();
    const networkBroker = user("broker", "master-123");
    const status = await getOfferCommissionStatus(storage, networkBroker, offerId, 2);
    expect(status.pending).toBe(false);
    expect(status.newRates).toBeNull();
    expect(status.contentSha256).toBeNull();
    await expect(acceptOfferCommission(storage, networkBroker, offerId, 2, null, "test"))
      .rejects.toThrow("OFFER_COMMISSIONS_NOT_PENDING");
    expect(acceptances).toHaveLength(0);
  });

  it("Broker bajo Admin de plataforma conserva comisión directa y exige aceptación", async () => {
    const { storage, doc } = setup();
    const directPlatformBroker = user("broker", "admin-123");
    const status = await getOfferCommissionStatus(storage, directPlatformBroker, offerId, 2);
    expect(status.applicableRole).toBe("broker_directo");
    expect(status.pending).toBe(true);
    expect(status.contentSha256).toBe(doc.contentSha256);
    expect(JSON.stringify(status.newRates)).not.toContain("masterBroker");
  });

  it("afiliación huérfana no puede convertirse silenciosamente en canal directo", async () => {
    const { storage } = setup();
    await expect(getOfferCommissionStatus(storage, user("broker", "missing-parent"), offerId, 2))
      .rejects.toThrow("OFFER_MASTER_AFFILIATION_UNVERIFIED");
  });

  it("Master acepta sólo su cuota y la aceptación no sirve para otro usuario", async () => {
    const { storage } = setup();
    const master = user("master_broker");
    const unrelated = user("master_broker");
    const status = await getOfferCommissionStatus(storage, master, offerId, 2);
    expect(status.pending).toBe(true);
    expect(JSON.stringify(status.newRates)).not.toContain("\"broker\":");
    await acceptOfferCommission(storage, master, offerId, 2, null, "test");
    expect((await getOfferCommissionStatus(storage, master, offerId, 2)).pending).toBe(false);
    expect((await getOfferCommissionStatus(storage, unrelated, offerId, 2)).pending).toBe(true);
  });

  it("la repetición no duplica evidencia", async () => {
    const { storage, acceptances } = setup();
    const broker = user("broker");
    await acceptOfferCommission(storage, broker, offerId, 2, null, "test");
    const repeat = await acceptOfferCommission(storage, broker, offerId, 2, null, "test");
    expect(repeat.alreadyAccepted).toBe(true);
    expect(acceptances).toHaveLength(1);
  });

  it("sin documento económico verificado bloquea en vez de asumir aceptación", async () => {
    const { storage } = setup({ missingDocument: true });
    const broker = user("broker");
    const status = await getOfferCommissionStatus(storage, broker, offerId, 2);
    expect(status.pending).toBe(true);
    expect(status.reason).toBe("OFFER_COMMISSION_DOCUMENT_UNAVAILABLE");
    await expect(acceptOfferCommission(storage, broker, offerId, 2, null, "test"))
      .rejects.toThrow("OFFER_COMMISSION_DOCUMENT_UNAVAILABLE");
  });

  it("una versión económica previa archivada no permite omitir la aceptación pendiente", async () => {
    const { storage, previous } = setup();
    previous.status = "archived";
    const broker = user("broker");
    const status = await getOfferCommissionStatus(storage, broker, offerId, 2);
    expect(status.pending).toBe(true);
    expect(status.requiresAcceptance).toBe(true);
  });

  it("no acepta una versión antigua o distinta de la publicada", async () => {
    const { storage } = setup();
    await expect(getOfferCommissionStatus(storage, user("broker"), offerId, 1))
      .rejects.toThrow("OFFER_VERSION_NOT_CURRENT");
    await expect(getOfferCommissionStatus(storage, user("broker"), "other-offer", 2))
      .rejects.toThrow("OFFER_VERSION_NOT_CURRENT");
  });

  it("recalcular un hash diferente invalida el documento y exige revisión", () => {
    const previous = version(1, 2, 3, "superseded");
    const published = version(2, 2.5, 3.2, "published");
    published.versionHash = "forged";
    expect(() => buildOfferCommissionDocument(previous, published))
      .toThrow("OFFER_VERSION_HASH_MISMATCH");
  });

  it("no usa una versión sustituida como nueva oferta sin fecha histórica anterior", () => {
    const superseded = {
      status: "superseded",
      effectiveTo: new Date("2026-10-14T15:00:00.000Z"),
    };
    expect(isQuoteHistoricallyFrozen(superseded, null)).toBe(false);
    expect(isQuoteHistoricallyFrozen(superseded, "2026-10-14T15:00:00.000Z")).toBe(false);
    expect(isQuoteHistoricallyFrozen(superseded, "2026-10-14T15:01:00.000Z")).toBe(false);
    expect(isQuoteHistoricallyFrozen(superseded, "invalid-date")).toBe(false);
    expect(isQuoteHistoricallyFrozen(superseded, "2026-10-14T14:59:00.000Z")).toBe(true);
    expect(isQuoteHistoricallyFrozen({ ...superseded, status: "published" },
      "2026-10-14T14:59:00.000Z")).toBe(false);
  });

  it("documento de primera publicación no obliga reaceptaciones", () => {
    expect(buildOfferCommissionDocument(null, version(1, 2, 3, "published"))).toBeNull();
  });
});
