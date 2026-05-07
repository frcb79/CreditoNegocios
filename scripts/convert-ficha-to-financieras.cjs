#!/usr/bin/env node
const path = require("path");
const XLSX = require("xlsx");

const INPUT = process.argv[2] || "G:/Mi unidad/CHAMBA/CREDITO NEGOCIOS/App Desarrollo/Ficha Crédito Simple.xlsx";
const OUTPUT = process.argv[3] || "scripts/financieras-from-ficha.xlsx";

const HEADERS = [
  "nombre_financiera",
  "tipo_producto",
  "perfil_cliente",
  "monto_minimo",
  "monto_maximo",
  "plazo_meses",
  "tasa_interes",
  "comision_apertura",
  "destinos_credito",
  "edad_minima",
  "edad_maxima",
  "antiguedad_meses_min",
  "ingreso_mensual_min",
  "buro_accionista_min",
  "buro_empresa_min",
  "buro_persona_fisica_min",
  "tipo_garantia",
  "opinion_cumplimiento",
  "participacion_ventas_gob_max",
  "giros_prohibidos",
  "presencia",
  "tiempo_respuesta",
  "comision_apertura_broker",
  "comision_sobretasa_broker",
  "comision_renovacion_broker",
  "comision_apertura_master",
  "comision_sobretasa_master",
  "comision_renovacion_master",
  "contacto",
  "email_contacto",
  "telefono_contacto",
  "observaciones",
];

function toText(v) {
  return String(v ?? "").replace(/\s+/g, " ").trim();
}

function pickProfile(raw) {
  const t = toText(raw).toUpperCase();
  if (!t) return "persona_moral";
  if (t.includes("PM") || t.includes("MORAL")) return "persona_moral";
  if (t.includes("PFAE") || t.includes("FISICA") || t.includes("PF")) return "fisica_empresarial";
  if (t.includes("SIN SAT")) return "sin_sat";
  return "persona_moral";
}

function firstNumber(raw) {
  const t = toText(raw)
    .replace(/\$/g, "")
    .replace(/,/g, "")
    .replace(/\s+/g, " ");
  const m = t.match(/(\d+(?:\.\d+)?)/);
  if (!m) return "";
  let n = Number(m[1]);
  const u = t.toUpperCase();
  if (u.includes("MDP") || u.includes("MILLON")) n *= 1000000;
  else if (u.includes(" MIL") || u.endsWith("MIL")) n *= 1000;
  return Number.isFinite(n) ? Math.round(n) : "";
}

function percentNumber(raw) {
  const t = toText(raw).replace(/,/g, ".");
  const m = t.match(/(\d+(?:\.\d+)?)\s*%?/);
  if (!m) return "";
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : "";
}

function maxMonth(raw) {
  const t = toText(raw).toLowerCase();
  const nums = (t.match(/\d+(?:\.\d+)?/g) || []).map(Number).filter(Number.isFinite);
  if (!nums.length) return "";
  const max = Math.max(...nums);
  return Math.round(max);
}

function minMonthsFromTenure(raw) {
  const t = toText(raw).toLowerCase();
  const nums = (t.match(/\d+(?:\.\d+)?/g) || []).map(Number).filter(Number.isFinite);
  if (!nums.length) return "";
  let n = Math.min(...nums);
  if (t.includes("año")) n *= 12;
  return Math.round(n);
}

function minMaxAges(raw) {
  const t = toText(raw).toLowerCase();
  const nums = (t.match(/\d+(?:\.\d+)?/g) || []).map(Number).filter(Number.isFinite);
  if (!nums.length) return ["", ""];
  return [Math.round(Math.min(...nums)), Math.round(Math.max(...nums))];
}

function byLabel(rows) {
  const map = new Map();
  for (const r of rows) {
    const label = toText(r[0]).toLowerCase();
    if (label) map.set(label, r);
  }
  return map;
}

const wb = XLSX.readFile(INPUT);
const ws = wb.Sheets["Crédito Simple"] || wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
const labels = byLabel(rows);

const institutionsRow = rows[1] || [];
const institutions = [];
for (let c = 1; c < institutionsRow.length; c += 1) {
  const name = toText(institutionsRow[c]);
  if (name) institutions.push({ col: c, name });
}

function v(label, col) {
  const r = labels.get(label.toLowerCase()) || [];
  return r[col] ?? "";
}

const outRows = [];
for (const inst of institutions) {
  const [edadMin, edadMax] = minMaxAges(v("Edad Mínima/Máxima", inst.col));
  const buro = firstNumber(v("Buro", inst.col));

  const row = {
    nombre_financiera: inst.name,
    tipo_producto: toText(v("Tipo de crédito", inst.col)) || "Credito Simple",
    perfil_cliente: pickProfile(v("perfiles_aceptados", inst.col)),
    monto_minimo: firstNumber(v("Financiamiento minimo", inst.col)),
    monto_maximo: firstNumber(v("Financiamiento máximo", inst.col)),
    plazo_meses: maxMonth(v("Plazo", inst.col)),
    tasa_interes: percentNumber(v("Tasa de interés", inst.col)),
    comision_apertura: percentNumber(v("Comisión por apertura", inst.col)),
    destinos_credito: toText(v("Principales destinos", inst.col)),
    edad_minima: edadMin,
    edad_maxima: edadMax,
    antiguedad_meses_min: minMonthsFromTenure(v("Antigüedad de la empresa", inst.col)),
    ingreso_mensual_min: firstNumber(v("Ingresos", inst.col)),
    buro_accionista_min: buro,
    buro_empresa_min: buro,
    buro_persona_fisica_min: buro,
    tipo_garantia: toText(v("Garantía", inst.col)),
    opinion_cumplimiento: "N/A",
    participacion_ventas_gob_max: "",
    giros_prohibidos: toText(v("Giros Prohibidos", inst.col)),
    presencia: toText(v("Presencia", inst.col)),
    tiempo_respuesta: toText(v("Tiempo de respuesta", inst.col)),
    comision_apertura_broker: 0,
    comision_sobretasa_broker: 0,
    comision_renovacion_broker: 0,
    comision_apertura_master: 0,
    comision_sobretasa_master: 0,
    comision_renovacion_master: 0,
    contacto: "",
    email_contacto: "",
    telefono_contacto: "",
    observaciones: toText(v("Observaciones", inst.col)),
  };

  if (row.nombre_financiera && row.tipo_producto && row.perfil_cliente) {
    outRows.push(row);
  }
}

const aoa = [HEADERS, ...outRows.map((r) => HEADERS.map((h) => r[h] ?? ""))];
const outWb = XLSX.utils.book_new();
const outWs = XLSX.utils.aoa_to_sheet(aoa);
XLSX.utils.book_append_sheet(outWb, outWs, "Financieras");
XLSX.writeFile(outWb, path.resolve(OUTPUT));

console.log(`Source: ${INPUT}`);
console.log(`Output: ${OUTPUT}`);
console.log(`Rows: ${outRows.length}`);
