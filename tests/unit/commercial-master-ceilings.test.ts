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

describe("Intermediary rate view security contract", () => {
  it("does not reveal lender gross economics to Broker/Master", () => {
    const { readFileSync } = require("node:fs");
    const routes = readFileSync("server/routes.ts", "utf8") as string;
    const section = routes.split('app.get("/api/commissions/my-offer-rates"')[1]
      .split("// Commissions and STP payments")[0];
    expect(section).toContain('actor.role === "broker"');
    expect(section).toContain("master.networkCommissionRates");
    expect(section).toContain("offer.broker");
    expect(section).not.toContain("offer.financiera");
    const view = readFileSync("client/src/pages/Commissions.tsx", "utf8") as string;
    expect(view).toContain("button-view-my-commission-rates");
    expect(view).toContain("MyCommissionRatesModal");
  });
});
