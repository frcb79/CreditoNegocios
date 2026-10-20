import { resolveSubmissionDisplayStatus } from "../../shared/submissionDisplayStatus";
import { getMatchingScoreTone } from "../../shared/matchingPresentation";

describe("Dashboard y Gestión de Créditos: estados canónicos", () => {
  test("Visto Bueno administrativo prevalece sobre in_progress del padre", () => {
    expect(resolveSubmissionDisplayStatus("in_progress", [{ status: "approved" }])).toBe("approved");
  });
  test("solamente contact_initiated significa Gestión Comercial Iniciada", () => {
    expect(resolveSubmissionDisplayStatus("in_progress", [{ status: "contact_initiated" }])).toBe("contact_initiated");
    expect(resolveSubmissionDisplayStatus("in_progress", [{ status: "pending_admin" }])).toBe("pending_admin");
  });
  test("se respeta la prioridad de targets en solicitudes con varias financieras", () => {
    expect(resolveSubmissionDisplayStatus("in_progress", [
      { status: "pending_admin" }, { status: "approved" }
    ])).toBe("approved");
    expect(resolveSubmissionDisplayStatus("in_progress", [
      { status: "approved" }, { status: "contact_initiated" }
    ])).toBe("contact_initiated");
  });
  test("sin targets no se inventa un estado", () => {
    expect(resolveSubmissionDisplayStatus("in_progress", [])).toBe("in_progress");
  });
  test("el score de 83% va verde incluso ante un criterio excluyente", () => {
    expect(getMatchingScoreTone(83, "not_compatible")).toBe("green");
    expect(getMatchingScoreTone(25, "not_compatible")).toBe("red");
    expect(getMatchingScoreTone(83, "insufficient_data")).toBe("neutral");
  });
});
