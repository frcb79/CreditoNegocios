import * as XLSX from "xlsx";

/**
 * CN V5 read-only preview. Deliberately independent of the legacy economic
 * Excel importers: NEVER writes commissionRates/institution economic fields.
 * Source document: "Copia de MAESTRO_LUIS", headers on row 6.
 */
export type MasterV5Kind = "financieras" | "comisiones";
export type MasterV5Issue = { row: number; field: string; level: "error" | "warning"; message: string };
export type MasterV5Row = {
  row: number;
  financiera: string;
  nombreOferta: string;
  familia: string;
  perfiles: string[];
  montoMinimo: number | null;
  montoMaximo: number | null;
  montoMaximoVariable: string | null;
  plazoMaximoMeses: number | null;
  tasaFuente: string;
  aperturaClienteFuente: string;
  matching: Record<string, unknown>;
  condiciones: Record<string, unknown>;
  comisiones: Record<string, number>;
  issues: MasterV5Issue[];
};
export type MasterV5Preview = {
  kind: MasterV5Kind;
  sheet: string;
  headerRow: number;
  totalRows: number;
  institutionCount: number;
  errors: MasterV5Issue[];
  warnings: MasterV5Issue[];
  rows: MasterV5Row[];
};

const C = {
  financiera: "Financiera",
  producto: "Tipo general (fuente)",
  oferta: "Nombre oferta validado",
  ficha: "Nombre producto en ficha",
  perfil: "Perfil elegible (validar)",
  min: "Monto mínimo",
  max: "Monto máximo",
  plazo: "Plazo máximo (meses)",
  tasa: "Tasa / factor (fuente)",
  aperturaCliente: "Apertura AL CLIENTE (fuente)",
  destinos: "Destinos (fuente)",
  garantia: "Garantía (fuente)",
  antiguedadEmpresa: "Antigüedad empresa (fuente)",
  buroFuente: "Buró (fuente)",
  antiguedad: "Antigüedad (meses)",
  ingresoMensual: "Ingreso mensual mínimo",
  ingresoAnual: "Ingreso anual mínimo",
  buroAccionista: "Buró accionistas mínimo",
  buroEmpresa: "Buró empresa mínimo",
  buroPF: "Buró PF mínimo",
  atrasos: "Permite atrasos",
  atrasosMax: "Atrasos máximo (fuente)",
  aval: "Aval",
  ciec: "Requiere CIEC",
  estados: "Estados financieros",
  sat: "Opinión SAT",
  gobierno: "Ventas gobierno máximo",
  presencia: "Presencia",
  tiempo: "Tiempo respuesta",
  notas: "Observaciones fuente",
  documentos: "Documentación requerida",
  giros: "Restricciones de giro",
  finTotal: "Financiera total %",
  finApertura: "Financiera apertura %",
  finSobretasa: "Financiera sobretasa %",
  finRenovacion: "Financiera renovación %",
  masterTotal: "Master total %",
  masterApertura: "Master apertura %",
  masterSobretasa: "Master sobretasa %",
  masterRenovacion: "Master renovación %",
  brokerTotal: "Broker directo total %",
  brokerApertura: "Broker apertura %",
  brokerSobretasa: "Broker sobretasa %",
  brokerRenovacion: "Broker renovación %",
} as const;

const norm = (value: unknown): string => String(value ?? "").normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
const asText = (value: unknown): string => value === null || value === undefined ? "" : String(value).trim();
const numberOrNull = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = asText(value).replace(/[$,\s]/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
};
const ratePct = (value: unknown): number | null => {
  if (value === "" || value === null || value === undefined) return 0;
  // V5 stores percentage-point amounts as Excel decimal fractions, e.g. .0175 = 1.75%.
  const n = numberOrNull(value);
  if (n === null || n < 0 || n > 1) return null;
  return Math.round(n * 1000000) / 10000;
};
const bool = (value: unknown): boolean | null => {
  const x = norm(value);
  if (["si", "sí", "true", "1"].includes(x)) return true;
  if (["no", "false", "0"].includes(x)) return false;
  return null;
};

export function normalizeV5Profiles(raw: unknown): string[] {
  const value = norm(raw);
  const out = new Set<string>();
  for (const token of value.split(/[,;/]+/g).map(v => v.trim()).filter(Boolean)) {
    if (["pm", "persona moral"].includes(token)) out.add("persona_moral");
    else if (["pfae", "pf ae", "persona fisica actividad empresarial", "resico", "resico pf", "resico persona fisica"].includes(token))
      out.add("fisica_empresarial");
    else if (["pf", "persona fisica"].includes(token)) out.add("fisica");
    else if (["sin sat"].includes(token)) out.add("sin_sat");
  }
  return Array.from(out);
}

export function normalizeV5Family(value: unknown): string {
  const v = norm(value);
  if (/factoraje/.test(v)) return "factoraje";
  if (/anticipo de ventas|anticipo tpv/.test(v)) return "anticipo_ventas_tpv";
  if (/hipotecario empresarial/.test(v)) return "garantia_inmobiliaria_empresarial";
  if (/arrendamiento|leasing/.test(v)) return "arrendamiento";
  if (/revolvente|linea de credito/.test(v)) return "revolvente";
  if (/hipotecario|hipoteca vivienda/.test(v)) return "hipotecario";
  if (/garantia inmobiliaria/.test(v)) return "garantia_inmobiliaria_empresarial";
  if (/simple|siple|credito pyme|credito empresarial|pdn express/.test(v)) return "credito_simple";
  return "por_clasificar";
}

export function previewMasterV5(buffer: Buffer, kind: MasterV5Kind): MasterV5Preview {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const candidates = wb.SheetNames.map(name => ({
    name,
    table: XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, defval: "" }) as unknown[][],
  }));
  const source = candidates.find(c => c.table.slice(0, 20).some(r =>
    Array.isArray(r) && r.some(v => norm(v) === norm(C.financiera)) &&
    r.some(v => norm(v) === norm(C.oferta))));
  if (!source) throw new Error("No se reconoció el maestro V5: faltan los encabezados Financiera y Nombre oferta validado");
  const headerIndex = source.table.findIndex(r => r.some(v => norm(v) === norm(C.financiera)) &&
    r.some(v => norm(v) === norm(C.oferta)));
  const header = source.table[headerIndex].map(norm);
  // Archive all 32 original non-economic columns so every technical descriptor
  // can be audited, including original RESICO wording and product name in ficha.
  // Never include the 12 confidential commission columns in this archive.
  const economicHeaders = new Set([
    C.finTotal, C.finApertura, C.finSobretasa, C.finRenovacion,
    C.masterTotal, C.masterApertura, C.masterSobretasa, C.masterRenovacion,
    C.brokerTotal, C.brokerApertura, C.brokerSobretasa, C.brokerRenovacion,
  ].map(norm));
  const originalHeaders = source.table[headerIndex].map(asText);

  const required = kind === "financieras"
    ? [C.financiera, C.oferta, C.producto, C.perfil, C.min, C.max]
    : [C.financiera, C.oferta, C.finTotal, C.finApertura, C.masterApertura, C.brokerApertura];
  const missing = required.filter(h => !header.includes(norm(h)));
  if (missing.length) throw new Error("Faltan columnas: " + missing.join(", "));
  const rows: MasterV5Row[] = [];
  const errors: MasterV5Issue[] = [], warnings: MasterV5Issue[] = [];
  const seen = new Set<string>();

  for (let i = headerIndex + 1; i < source.table.length; i++) {
    const cells = source.table[i] || [];
    const get = (key: string): unknown => { const idx = header.indexOf(norm(key)); return idx < 0 ? "" : cells[idx]; };
    if (!cells.some(x => asText(x))) continue;
    const rowNum = i + 1;
    const name = asText(get(C.financiera));
    const offer = asText(get(C.oferta)) || asText(get(C.ficha));
    const profiles = normalizeV5Profiles(get(C.perfil));
    const issues: MasterV5Issue[] = [];
    const warn = (field: string, message: string) => issues.push({ row: rowNum, field, level: "warning", message });
    const err = (field: string, message: string) => issues.push({ row: rowNum, field, level: "error", message });
    if (!name) err(C.financiera, "Financiera obligatoria");
    if (!offer) err(C.oferta, "Nombre de oferta obligatorio");
    const key = norm(name) + "|" + norm(offer);
    if (seen.has(key)) err(C.oferta, "Oferta duplicada dentro del mismo archivo");
    seen.add(key);
    const family = normalizeV5Family(get(C.producto));
    if (family === "por_clasificar") warn(C.producto, "Revisar familia de producto antes de publicar");
    if (!profiles.length) warn(C.perfil, "No se pudo determinar perfil; no se usará en matching hasta validar");
    const montoMinimo = numberOrNull(get(C.min));
    const montoMaximo = numberOrNull(get(C.max));
    const montoVariable = montoMaximo === null && asText(get(C.max)) ? asText(get(C.max)) : null;
    if (montoMinimo === null) warn(C.min, "Monto mínimo no numérico; requiere revisión");
    // El límite ligado a ventas TPV es información comercial, no un bloqueo de matching.
    if (montoMaximo !== null && montoMinimo !== null && montoMaximo < montoMinimo)
      err(C.max, "Monto máximo inferior al mínimo");
    const aperturaClienteOriginal = asText(get(C.aperturaCliente));
    const pdnRevolventeConfirmado = norm(name) === "pdn" && norm(offer).includes("revolvente") &&
      /^0[.,]04\s*\(unidad pendiente\)$/i.test(aperturaClienteOriginal);
    const aperturaCliente = pdnRevolventeConfirmado ? "4%" : aperturaClienteOriginal;
    if (!pdnRevolventeConfirmado && /unidad pendiente/i.test(aperturaClienteOriginal)) warn(C.aperturaCliente,
      "Unidad pendiente: mantener la leyenda original y validar antes de publicar");
    for (const field of [C.antiguedad, C.ingresoMensual, C.ingresoAnual, C.buroAccionista, C.buroEmpresa, C.buroPF, C.plazo]) {
      const raw = asText(get(field));
      if (raw && !["n/a", "na", "no aplica"].includes(norm(raw)) && numberOrNull(get(field)) === null)
        warn(field, "Condición variable o no numérica: conservar el texto fuente y validar antes de aplicar matching automático");
    }
    const matching: Record<string, unknown> = {
      minAmount: montoMinimo,
      maxAmount: montoMaximo,
      // No introducir máximos variables en reglas automáticas de matching.
      minMonthsInBusiness: numberOrNull(get(C.antiguedad)),
      minMonthsInBusinessSource: asText(get(C.antiguedad)),
      minMonthlyIncome: numberOrNull(get(C.ingresoMensual)),
      minMonthlyIncomeSource: asText(get(C.ingresoMensual)),
      minAnnualIncome: numberOrNull(get(C.ingresoAnual)),
      minAnnualIncomeSource: asText(get(C.ingresoAnual)),
      minShareholderBureau: numberOrNull(get(C.buroAccionista)),
      minBusinessBureau: numberOrNull(get(C.buroEmpresa)),
      minPersonalBureau: numberOrNull(get(C.buroPF)),
      minPersonalBureauSource: asText(get(C.buroPF)),
      allowsArrears: bool(get(C.atrasos)),
      arrearsPolicy: asText(get(C.atrasosMax)),
      guarantee: asText(get(C.garantia)),
      businessAgeSource: asText(get(C.antiguedadEmpresa)),
      bureauPolicySource: asText(get(C.buroFuente)),
      guarantorSource: asText(get(C.aval)),
      requiresCiec: bool(get(C.ciec)),
      requiresFinancialStatements: bool(get(C.estados)),
      satOpinion: asText(get(C.sat)),
      governmentSalesLimit: asText(get(C.gobierno)),
      excludedSectors: asText(get(C.giros)),
      presence: asText(get(C.presencia)),
      // Age deliberately excluded from matching, as previously approved.
    };
    const sourceTechnicalFields: Record<string, string> = {};
    for (let j = 0; j < originalHeaders.length; j++) {
      if (!originalHeaders[j] || economicHeaders.has(header[j])) continue;
      const original = asText(cells[j]);
      if (original) sourceTechnicalFields[originalHeaders[j]] = original;
    }
    const condiciones: Record<string, unknown> = {
      sourceTechnicalFields,
      rateSource: asText(get(C.tasa)),
      clientOpeningSource: aperturaCliente,
      ...(pdnRevolventeConfirmado ? { clientOpeningRatePct: 4 } : {}),
      ...(montoVariable ? { informationalMaximumLoan: montoVariable } : {}),
      loanPurposes: asText(get(C.destinos)),
      maxTermMonths: numberOrNull(get(C.plazo)),
      turnaround: asText(get(C.tiempo)),
      sourceNotes: asText(get(C.notas)),
      requiredDocumentationSource: asText(get(C.documentos)),
    };
    const comisiones: Record<string, number> = {};
    if (kind === "comisiones") {
      const fields = [
        C.finTotal, C.finApertura, C.finSobretasa, C.finRenovacion,
        C.masterTotal, C.masterApertura, C.masterSobretasa, C.masterRenovacion,
        C.brokerTotal, C.brokerApertura, C.brokerSobretasa, C.brokerRenovacion,
      ];
      for (const field of fields) {
        const n = ratePct(get(field));
        if (n === null) err(field, "Porcentaje no válido: se esperan fracciones de Excel (ej. 0.0175 = 1.75%)");
        else comisiones[field] = n;
      }
      if ((comisiones[C.masterSobretasa] || 0) !== 0 || (comisiones[C.brokerSobretasa] || 0) !== 0)
        err("Sobretasa", "La sobretasa corresponde 100% a Crédito Negocios; Master/Broker deben tener 0%");
      if (comisiones[C.masterApertura] > comisiones[C.finApertura] ||
          comisiones[C.brokerApertura] > comisiones[C.finApertura])
        err("Apertura", "La comisión asignada al canal supera lo recibido de la financiera");
      if (comisiones[C.masterRenovacion] > comisiones[C.finRenovacion] ||
          comisiones[C.brokerRenovacion] > comisiones[C.finRenovacion])
        err("Renovación", "La comisión de renovación del canal supera lo recibido de la financiera");
    }
    for (const issue of issues) (issue.level === "error" ? errors : warnings).push(issue);
    rows.push({
      row: rowNum, financiera: name, nombreOferta: offer, familia: family,
      perfiles: profiles, montoMinimo, montoMaximo,
      montoMaximoVariable: montoVariable, plazoMaximoMeses: numberOrNull(get(C.plazo)),
      tasaFuente: asText(get(C.tasa)), aperturaClienteFuente: aperturaCliente,
      matching, condiciones, comisiones, issues,
    });
  }
  return {
    kind, sheet: source.name, headerRow: headerIndex + 1,
    totalRows: rows.length, institutionCount: new Set(rows.map(r => norm(r.financiera))).size,
    errors, warnings, rows,
  };
}
