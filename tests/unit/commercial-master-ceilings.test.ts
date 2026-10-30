import { masterSafeCeilings, type PublishedCommissionOffer } from "../../server/commercialRatesView";

const offer = (id: string, masterOpen: number, masterRenew: number): PublishedCommissionOffer => ({
  offerId: id,
  offerName: id,
  institutionId: "fin-test",
  institutionName: "Test",
  versionNumber: 1,
  master: { apertura: masterOpen, renovacion: masterRenew },
  broker: { apertura: Math.max(0, masterOpen - 1), renovacion: Math.max(0, masterRenew - 1) },
});

describe("Master network ceilings come from published offer versions", () => {
  it("uses the most restrictive offer, not a stale global institution rate", () => {
    expect(masterSafeCeilings([offer("simple", 3, 1), offer("revolvente", 2, 0)])).toEqual({
      apertura: 2,
      renovacion: 0,
      brokerApertura: 1,
      brokerRenovacion: 0,
    });
  });
  it("a zero approved ceiling is never an unlimited allowance", () => {
    const ceiling = masterSafeCeilings([offer("base", 0, 0)]);
    expect(ceiling.apertura).toBe(0);
    expect(ceiling.renovacion).toBe(0);
  });
  it("empty institutions cannot allocate commissions", () => {
    expect(masterSafeCeilings([]).apertura).toBe(0);
  });
});
