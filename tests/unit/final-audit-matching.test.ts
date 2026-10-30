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
    ["PM 3 años/PFAE 5 años", 36, 60, 48],
    ["PM 2 / PFAE 3 años", 24, 36, 30],
    ["PM 12 / PFAE 24 meses", 12, 24, 18],
  ])("uses explicit per-profile source without changing the original: %s", (source, pmMonths, pfaeMonths, below) => {
    const data = offer({ businessAgeSource: source, minMonthsInBusiness: pmMonths });
    const age = getOfferAgePolicy(data.version.conditions, data.version.requirements);
    expect(age.needsReview).toBe(false);
    expect(age.rows.map(row => row.effectiveMonths)).toEqual([pmMonths, pfaeMonths]);
    expect(evaluate(data, { companyAgeMonths: below }).status).toBe("NOT_COMPATIBLE");
    expect(evaluate(data, { companyAgeMonths: pfaeMonths }).status).toBe("COMPATIBLE");
    expect(evaluate(data, { type: "persona_moral", companyAgeMonths: pmMonths }).status).toBe("COMPATIBLE");
    expect(validateMinimumPublishConditions({ ...data.version, changeReason: "Review" }).isValid).toBe(true);
    expect(data.version.requirements.businessAgeSource).toBe(source);
  });
  it("blocks an edited numeric minimum that conflicts with all exact source profile limits", () => {
    const data = offer({ businessAgeSource: "PM 3 años/PFAE 5 años", minMonthsInBusiness: 36 }, { minCompanyAgeMonths: 48 });
    expect(getOfferAgePolicy(data.version.conditions, data.version.requirements).needsReview).toBe(true);
    expect(evaluate(data, { companyAgeMonths: 60 }).status).toBe("INSUFFICIENT_DATA");
    expect(validateMinimumPublishConditions({ ...data.version, changeReason: "Review" }).isValid).toBe(false);
  });
  it("keeps Revolvente Afirme's ambiguous 2-3 year text pending until the approved PM 24-month decision is recorded", () => {
    const data = offer({ businessAgeSource: "2-3 años", minMonthsInBusiness: 36, targetProfiles: ["persona_moral"] });
    const r: any = data.version.requirements;
    expect(evaluate(data, { type: "persona_moral", companyAgeMonths: 24 }).status).toBe("INSUFFICIENT_DATA");
    expect(validateMinimumPublishConditions({ ...data.version, changeReason: "Review" }).isValid).toBe(false);
    r.businessAgeResolution = { basis: getOfferAgePolicy(data.version.conditions, r).basis,
      monthsByProfile: { persona_moral: 24 }, reason: "Aprobacion comercial: Revolvente Afirme 24 meses PM",
      reviewedBy: "test-admin", reviewedAt: "2026-10-29T12:00:00Z" };
    expect(evaluate(data, { type: "persona_moral", companyAgeMonths: 23 }).status).toBe("NOT_COMPATIBLE");
    expect(evaluate(data, { type: "persona_moral", companyAgeMonths: 24 }).status).toBe("COMPATIBLE");
    expect(validateMinimumPublishConditions({ ...data.version, changeReason: "Review" }).isValid).toBe(true);
    r.businessAgeSource = "3-4 años";
    expect(evaluate(data, { type: "persona_moral", companyAgeMonths: 24 }).status).toBe("INSUFFICIENT_DATA");
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
      const result = evaluate(offer({ allowsArrears: false, targetProfiles: ["persona_moral", "fisica_empresarial", "sin_sat"] }), client);
      expect(criterion(result, "arrearsPolicy")[0].status).toBe("MISSING_DATA");
      expect(result.status).toBe("INSUFFICIENT_DATA");
    }
    expect(evaluate(offer({ allowsArrears: false }), { atrasosDeudas: false }).status).toBe("COMPATIBLE");
    expect(evaluate(offer({ allowsArrears: false }), { atrasosDeudas: true }).status).toBe("NOT_COMPATIBLE");
  });
  it("retains explicit origin restrictions after a reconciliation", () => {
    expect(evaluate(offer({ minMonthsInBusiness: 24 }, { originVerified: false }), { companyAgeMonths: 12 }).status).toBe("INSUFFICIENT_DATA");
  });
});
