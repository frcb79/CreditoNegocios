import { projectCreditForRole } from "../../server/creditResponseProjection";

describe("SEC-P0-05: confidential credit proposal economic projection", () => {
  const record = {
    id: "credit-one",
    amount: "100000",
    finalProposal: {
      interestRate: 24,
      amount: 100000,
      commissionRates: { financiera: 3, broker: 1, masterBroker: 2 },
      sobretasa: 2,
      platformMargin: 1500,
      internalNotes: "private",
      quotes: [{ reference: "public", networkCommissionRates: { broker: 1 }, nested: { overRate: 10 } }],
      publicTerms: { term: 36, commissionBreakdown: { secret: 2 } },
    },
  };

  for (const role of ["broker", "master_broker", "admin", undefined]) {
    it(`strips internal economics recursively for ${role || "unknown"}`, () => {
      const projected = projectCreditForRole(record, role);
      expect(projected?.finalProposal).toEqual({
        interestRate: 24,
        amount: 100000,
        quotes: [{ reference: "public", nested: {} }],
        publicTerms: { term: 36 },
      });
    });
  }

  it("keeps immutable frozen data intact for authorized Super Admin", () => {
    expect(projectCreditForRole(record, "super_admin")).toBe(record);
  });

  it("never alters the stored source object through projection", () => {
    const before = JSON.stringify(record);
    const projected = projectCreditForRole(record, "broker");
    expect(JSON.stringify(record)).toBe(before);
    expect(projected).not.toBe(record);
    expect((record.finalProposal as any).commissionRates.broker).toBe(1);
  });

  it("retains required public quote attributes and handles missing proposals", () => {
    expect(projectCreditForRole({ id: "c2", finalProposal: null }, "broker")).toEqual({
      id: "c2", finalProposal: null,
    });
  });
});
