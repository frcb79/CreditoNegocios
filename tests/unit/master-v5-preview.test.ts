import * as XLSX from "xlsx";
import { normalizeV5Profiles, previewMasterV5 } from "../../server/masterV5Preview";

const headers = [
  "Financiera", "Tipo general (fuente)", "Nombre producto en ficha",
  "Nombre oferta validado", "Perfil elegible (validar)", "Monto mínimo",
  "Monto máximo", "Plazo máximo (meses)", "Tasa / factor (fuente)",
  "Apertura AL CLIENTE (fuente)", "Financiera total %", "Financiera apertura %",
  "Financiera sobretasa %", "Financiera renovación %", "Master total %",
  "Master apertura %", "Master sobretasa %", "Master renovación %",
  "Broker directo total %", "Broker apertura %", "Broker sobretasa %", "Broker renovación %",
  "Antigüedad empresa (fuente)", "Buró (fuente)", "Aval",
];

function book(data: any[][]): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([["MAESTRO LUIS V5"], [], [], [], [], headers, ...data]);
  XLSX.utils.book_append_sheet(wb, ws, "Copia de MAESTRO_LUIS");
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

describe("CN V5 — parser de previsualización sin escrituras", () => {
  const base = ["Pretmex", "Crédito simple", "Simple Pretmex", "Simple Pretmex",
    "PM, PFAE, RESICO", 300000, 15000000, 48, "26%", "3%",
    .015, .015, 0, 0, .01, .01, 0, 0, .0075, .0075, 0, 0, "PM 3 años/PFAE 5 años", "Buen historial últimos 24 meses", "RL / Aval"];

  it("reconoce encabezados en fila 6 y conserva Pretmex", () => {
    const result = previewMasterV5(book([base]), "financieras");
    expect(result.headerRow).toBe(6);
    expect(result.totalRows).toBe(1);
    expect(result.rows[0].financiera).toBe("Pretmex");
    expect(result.rows[0].perfiles).toEqual(["persona_moral", "fisica_empresarial"]);
  });

  it("conserva antigüedad, buró narrativo y aval como información de oferta", () => {
    const preview = previewMasterV5(book([base]), "financieras");
    const req = preview.rows[0].matching;
    expect(req.businessAgeSource).toBe("PM 3 años/PFAE 5 años");
    expect(req.bureauPolicySource).toBe("Buen historial últimos 24 meses");
    expect(req.guarantorSource).toBe("RL / Aval");
  });

  it("monto máximo por TPV no se inventa como pesos", () => {
    const row = [...base];
    row[0] = "Anticipa - Finsus"; row[3] = "Anticipa Finsus";
    row[6] = "1.5 a 2.5 meses ventas TPV";
    const result = previewMasterV5(book([row]), "financieras");
    expect(result.rows[0].montoMaximo).toBeNull();
    expect(result.rows[0].montoMaximoVariable).toContain("TPV");
    expect(result.warnings.some(w => w.field === "Monto máximo")).toBe(false);
    expect(result.rows[0].matching).not.toHaveProperty("amountFormula");
    expect(result.rows[0].condiciones.informationalMaximumLoan).toContain("TPV");
  });

  it("normaliza 4% confirmado de apertura cliente para PDN Revolvente", () => {
    const row = [...base];
    row[0] = "PDN"; row[3] = "PDN Revolvente";
    row[9] = "0.04 (unidad pendiente)";
    const result = previewMasterV5(book([row]), "financieras");
    expect(result.warnings.some(w => w.field === "Apertura AL CLIENTE (fuente)")).toBe(false);
    expect(result.rows[0].aperturaClienteFuente).toBe("4%");
    expect(result.rows[0].condiciones.clientOpeningRatePct).toBe(4);
  });

  it("interpreta porcentajes V5 sin perder orden de magnitud", () => {
    const result = previewMasterV5(book([base]), "comisiones");
    expect(result.rows[0].comisiones["Financiera apertura %"]).toBe(1.5);
    expect(result.rows[0].comisiones["Master apertura %"]).toBe(1);
    expect(result.rows[0].comisiones["Broker apertura %"]).toBe(.75);
    expect(result.errors).toHaveLength(0);
  });

  it("rechaza reparto de sobretasa a Broker o Master", () => {
    const row = [...base];
    row[16] = .005;
    const result = previewMasterV5(book([row]), "comisiones");
    expect(result.errors.some(e => e.field === "Sobretasa")).toBe(true);
  });

  it("normaliza RESICO PF a PFAE sin crear categoría nueva", () => {
    expect(normalizeV5Profiles("PM, PFAE, RESICO")).toEqual(["persona_moral", "fisica_empresarial"]);
    expect(normalizeV5Profiles("RESICO PF")).toEqual(["fisica_empresarial"]);
  });
});
