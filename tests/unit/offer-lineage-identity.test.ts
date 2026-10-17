import { readFrozenOfferLineage, assertFrozenOfferLineage } from "../../server/offerLineageService";

describe("FIN-P0 frozen offer/version identity", () => {
  it("retains explicit product id and version, including legacy offerId aliases", () => {
    expect(readFrozenOfferLineage({ institutionProductId: "offer-A", versionNumber: 2 }))
      .toEqual({ institutionProductId: "offer-A", versionNumber: 2 });
    expect(readFrozenOfferLineage({ offerId: "offer-B", versionNumber: "3" }))
      .toEqual({ institutionProductId: "offer-B", versionNumber: 3 });
  });
  it("does not infer an offer from a financial institution", () => {
    expect(readFrozenOfferLineage({ financialInstitutionId: "fin-A" })).toBeNull();
    expect(assertFrozenOfferLineage({}, { financialInstitutionId: "fin-A" })).toBeNull();
  });
  it.each([
    { institutionProductId: "offer-A" },
    { versionNumber: 2 },
    { institutionProductId: "offer-A", versionNumber: 0 },
    { institutionProductId: "offer-A", versionNumber: 1.2 },
    { institutionProductId: "offer-A", versionNumber: "invalid" },
    { institutionProductId: "offer-A", offerId: "offer-B", versionNumber: 1 },
  ])("fails closed for partial/malformed identities", value => {
    expect(() => readFrozenOfferLineage(value)).toThrow("OFFER_VERSION_IDENTITY_INCOMPLETE");
  });
  it("blocks different product IDs even within the same institution", () => {
    expect(() => assertFrozenOfferLineage(
      { institutionProductId: "product-A", versionNumber: 1 },
      { institutionProductId: "product-B", versionNumber: 1 }
    )).toThrow("OFFER_VERSION_IDENTITY_MISMATCH");
  });
  it("blocks stale and missing versions; allows exact historical snapshots", () => {
    expect(() => assertFrozenOfferLineage(
      { institutionProductId: "product-A", versionNumber: 2 },
      { institutionProductId: "product-A", versionNumber: 3 }
    )).toThrow("OFFER_VERSION_IDENTITY_MISMATCH");
    expect(() => assertFrozenOfferLineage(
      { institutionProductId: "product-A", versionNumber: 2 }, {}
    )).toThrow("OFFER_VERSION_IDENTITY_MISMATCH");
    expect(assertFrozenOfferLineage(
      { institutionProductId: "product-A", versionNumber: 2 },
      { offerId: "product-A", versionNumber: 2 }
    )).toEqual({ institutionProductId: "product-A", versionNumber: 2 });
  });
});
