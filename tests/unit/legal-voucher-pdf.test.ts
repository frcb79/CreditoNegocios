import { renderLegalVoucherPdf } from "../../server/legalVoucherPdf";

describe("LEG-14: comprobante histórico descargable en PDF", () => {
  it("convierte una evidencia con versión y SHA-256 en un PDF real", async () => {
    const text = [
      "COMPROBANTE OFICIAL DE FORMALIZACIÓN Y ACEPTACIÓN LEGAL ELECTRÓNICA",
      "Versión Oficial: v1.0",
      "Huella Contenido Exacto (SHA-256): " + "a".repeat(64),
      "[CONTENIDO ÍNTEGRO DEL DOCUMENTO PERSONALIZADO]",
      "Esta es la versión histórica aceptada; no usa el perfil actual.",
    ].join("\n");
    const result = await renderLegalVoucherPdf(text);
    expect(result.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(result.length).toBeGreaterThan(1000);
    expect(result.toString("latin1")).toContain("/Type /Page");
  });
  it("genera varias páginas para un contrato largo sin cortar el contenido", async () => {
    const result = await renderLegalVoucherPdf(
      Array.from({ length: 260 }, (_, i) => `Cláusula histórica ${i + 1}: contenido legal archivado.`).join("\n"),
    );
    expect((result.toString("latin1").match(/\/Type \/Page\b/g) || []).length).toBeGreaterThan(1);
  });
});
