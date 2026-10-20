import { ANNUAL_INCOME_OPTIONS, getAnnualIncomeRange } from "../../shared/annualIncome";
import { extractMonthlyRevenue } from "../../server/matching/fieldMapping";
import { evaluateIngresoAnual } from "../../client/src/components/MatchingAnalysis/matchingRules";
import { getStatusLabel, getCreditStatusLabel } from "../../client/src/lib/statusConfig";
import { getMatchingScoreTone } from "../../shared/matchingPresentation";

describe("rangos anuales y matching conservador", () => {
  test("autorización comercial no se confunde con aprobación bancaria", () => {
    expect(getStatusLabel("approved")).toBe("Visto Bueno");
    expect(getCreditStatusLabel("approved")).toBe("Propuesta seleccionada");
    expect(getStatusLabel("in_progress")).toBe("Gestión Comercial Iniciada");
    expect(getStatusLabel("contact_initiated")).toBe("Gestión Comercial Iniciada");
    expect(getStatusLabel("institution_approved")).toBe("Propuesta recibida");
  });
  test("83% de Finsus debe verse verde aun si falla una regla excluyente", () => {
    expect(getMatchingScoreTone(83, "not_compatible")).toBe("green");
    expect(getMatchingScoreTone(80, "compatible")).toBe("green");
    expect(getMatchingScoreTone(79, "compatible")).toBe("yellow");
    expect(getMatchingScoreTone(50, "compatible")).toBe("yellow");
    expect(getMatchingScoreTone(49, "not_compatible")).toBe("red");
    expect(getMatchingScoreTone(83, "insufficient_data")).toBe("neutral");
  });
  test("perfiles y rango máximo PFAE", () => {
    expect(ANNUAL_INCOME_OPTIONS.fisica_empresarial.some(x => x.value === "arriba-30000000")).toBe(true);
    expect(ANNUAL_INCOME_OPTIONS.persona_moral.some(x => x.value === "arriba-100000000")).toBe(true);
    for (const ranges of Object.values(ANNUAL_INCOME_OPTIONS)) {
      expect(ranges.some(x => x.value === "no-disponible")).toBe(true);
    }
  });
  test("no convierte códigos de rango a ingreso mensual exacto", () => {
    expect(getAnnualIncomeRange("1000000-2000000")).toMatchObject({min:1000000,max:2000000});
    expect(extractMonthlyRevenue({ingresoAnual:"1000000-2000000"})).toBeNull();
    expect(extractMonthlyRevenue({ingresoAnual:"1000000-2500000"})).toBeNull();
    expect(extractMonthlyRevenue({ingresoAnual:"no-disponible"})).toBeNull();
    expect(extractMonthlyRevenue({ingresoAnual:"1200000"})).toBe(100000);
  });
  test("intervalos completos cumplen; solapes no implican cumplimiento", () => {
    expect(evaluateIngresoAnual("1000000-2000000",{min:"5000000-15000000"}).status).toBe("fail");
    expect(evaluateIngresoAnual("2000000-5000000",{min:"3000000-5000000"}).status).toBe("warning");
    expect(evaluateIngresoAnual("5000000-15000000",{min:"2000000-5000000"}).status).toBe("pass");
    expect(evaluateIngresoAnual("no-disponible",{min:"2000000-5000000"}).status).toBe("warning");
    expect(evaluateIngresoAnual("1000000-2500000",{min:"3000000-5000000"}).status).toBe("fail");
  });
});
