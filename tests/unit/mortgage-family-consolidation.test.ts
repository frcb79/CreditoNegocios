import { selectHousingMortgageTemplate } from "../../server/mortgageHousingTemplate";

describe("Consolidated mortgage family — vivienda compatibility", () => {
  const generic = {
    id: "canonical", name: "Hipotecario", category: "hipotecario", isActive: true,
    baseConfiguration: { catalog_family: "hipotecario", variants: ["vivienda", "empresarial"] },
  };

  it("reuses the approved six-family hipotecario template for vivienda", () => {
    expect(selectHousingMortgageTemplate([generic])?.id).toBe("canonical");
  });

  it("does not misclassify a legacy Hipotecario Empresarial as housing", () => {
    expect(selectHousingMortgageTemplate([
      { id: "business", name: "Hipotecario Empresarial", category: "hipotecario", isActive: true },
    ])).toBeUndefined();
  });

  it("does not infer vivienda from a bare generic hipotecario category or unconfigured variants", () => {
    expect(selectHousingMortgageTemplate([
      { ...generic, baseConfiguration: {} },
      { ...generic, id: "enterprise-only", baseConfiguration: { catalog_family: "hipotecario", variants: ["empresarial"] } },
    ])).toBeUndefined();
  });

  it("rejects an archived family and prefers an explicitly active legacy housing template", () => {
    const legacy = { id: "housing", name: "Hipotecario Vivienda", category: "hipotecario", isActive: true };
    expect(selectHousingMortgageTemplate([{ ...generic, isActive: false }, legacy])?.id).toBe("housing");
    expect(selectHousingMortgageTemplate([{ ...generic, isActive: false }])).toBeUndefined();
  });
});
