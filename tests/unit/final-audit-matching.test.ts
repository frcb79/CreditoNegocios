import { evaluateOfferCompatibility } from "../../server/matching/compatibilityEvaluator";
import { getOfferAgePolicy } from "../../shared/offerAgePolicy";
import { validateMinimumPublishConditions } from "../../server/offerVersionService";

const offer = (requirements: any = {}, conditions: any = {}) => ({
  product: { id: "isolated", institutionId: "test", status: "published" },
  version: { id: "v1", versionNumber: 1, status: "published", conditions: { minAmount: 100, maxAmount: 1000000, ...conditions },
    requirements: { targetProfiles: ["persona_moral", "fisica_empresarial"], ...requirements }, requiredDocuments: ["CSF"] },
});
const evaluate = (source: any, client: any) => evaluateOfferCompatibility({ client: { type: "fisica_empresarial", ...client }, credit: { amount: 100000 } }, source);
const criterion = (result: any, code: string) => [...result.criteria.matched, ...result.criteria.failed, ...result.criteria.missing].filter(c => c.code === code);

describe("Final audit adversarial regressions", () => {
  it.each([
    ["PM 3 años/PFAE 5 años", 36, 48], ["PM 2 / PFAE 3 años", 24, 30], ["PM 12 / PFAE 24 meses", 12, 18],
    ["2-3 años", 36, 48],
  ])("leaves contradictory/ambiguous age pending and blocks publication: %s", (source, minimum, actual) => {
    const data = offer({ businessAgeSource: source, minMonthsInBusiness: minimum });
    const result = evaluate(data, { companyAgeMonths: actual });
    expect(result.status).toBe("INSUFFICIENT_DATA");
    expect(criterion(result, "companyAge")).toHaveLength(1);
    expect(criterion(result, "companyAge")[0].status).toBe("MISSING_DATA");
    const gate = validateMinimumPublishConditions({ ...data.version, changeReason: "Review" });
    expect(gate.isValid).toBe(false);
    expect(gate.errors.join(" ")).toContain("Antigüedad");
  });
  it("evaluates an explicitly reconciled minimum per profile and invalidates stale approval", () => {
    const data = offer({ businessAgeSource: "PM 3 años/PFAE 5 años", minMonthsInBusiness: 36 });
    const r: any = data.version.requirements;
    r.businessAgeResolution = { basis: getOfferAgePolicy(data.version.conditions, r).basis,
      monthsByProfile: { persona_moral: 36, fisica_empresarial: 60 }, reason: "Confirmed with institution",
      reviewedBy: "test-admin", reviewedAt: "2026-10-29T12:00:00Z" };
    expect(evaluate(data, { companyAgeMonths: 48 }).status).toBe("NOT_COMPATIBLE");
    expect(evaluate(data, { companyAgeMonths: 60 }).status).toBe("COMPATIBLE");
    expect(evaluate(data, { type: "persona_moral", companyAgeMonths: 36 }).status).toBe("COMPATIBLE");
    expect(validateMinimumPublishConditions({ ...data.version, changeReason: "Review" }).isValid).toBe(true);
    r.businessAgeSource = "PM 3 años/PFAE 6 años";
    expect(evaluate(data, { companyAgeMonths: 60 }).status).toBe("INSUFFICIENT_DATA");
    expect(validateMinimumPublishConditions({ ...data.version, changeReason: "Review" }).isValid).toBe(false);
  });
  it.each(["bueno-592-693", "excelente", "malo-456-489"])("never infers arrears from a personal score %s", score => {
    const result = evaluate(offer({ allowsArrears: false }), { buroPersonaFisica: score });
    expect(result.status).toBe("INSUFFICIENT_DATA");
    expect(criterion(result, "arrearsPolicy")[0].status).toBe("MISSING_DATA");
  });
  it("ignores unrelated scores/declarations and leaves conflicting declarations pending", () => {
    for (const client of [{ buroEmpresa: "bueno-250-309" }, { atrasosDeudasBuroSinSat: "no" },
      { type: "persona_moral", atrasosDeudasBuro: "no" }, { type: "sin_sat", atrasosDeudasBuro: "no" },
      { atrasosDeudas: "no", atrasosDeudasBuro: "si" }, { atrasosDeudas: "no sé si tiene atrasos" }]) {
      expect(evaluate(offer({ allowsArrears: false }), client).status).toBe("INSUFFICIENT_DATA");
    }
    expect(evaluate(offer({ allowsArrears: false }), { atrasosDeudas: false }).status).toBe("COMPATIBLE");
    expect(evaluate(offer({ allowsArrears: false }), { atrasosDeudas: true }).status).toBe("NOT_COMPATIBLE");
  });
  it("retains explicit origin restrictions after a reconciliation", () => {
    expect(evaluate(offer({ minMonthsInBusiness: 24 }, { originVerified: false }), { companyAgeMonths: 12 }).status).toBe("INSUFFICIENT_DATA");
  });
});
