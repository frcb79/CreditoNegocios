/**
 * Crédito Negocios — Matching M1: Auditoría y Mapa de Campos Verificados
 * 
 * Mapeo oficial y canónico de variables capturadas en el sistema para evaluación
 * de compatibilidad crediticia entre solicitudes/clientes y ofertas comerciales publicadas.
 * 
 * Reglas de auditoría:
 * - Cero preguntas o campos inventados.
 * - Tipado estricto, unidades normalizadas y manejo seguro de valores ausentes/incompletos.
 * - Disponibilidad clasificada por perfil fiscal (persona_moral, fisica_empresarial, fisica, sin_sat).
 */

export type ClientProfileType = "persona_moral" | "fisica_empresarial" | "fisica" | "sin_sat";

export interface FieldDefinition {
  variableCode: string;
  name: string;
  sourceTable: "clients" | "credits";
  sourceFields: string[];
  dataType: "number" | "integer" | "string" | "boolean" | "array";
  unit: "MXN" | "meses" | "años" | "categoría" | "booleano" | "lista";
  applicableProfiles: ClientProfileType[];
  description: string;
}

/**
 * Catálogo canónico de campos verificados auditados en la base de datos
 */
export const VERIFIED_FIELDS_AUDIT_MAP: Record<string, FieldDefinition> = {
  // 1. Monto solicitado
  creditAmount: {
    variableCode: "creditAmount",
    name: "Monto de Crédito Solicitado",
    sourceTable: "credits",
    sourceFields: ["amount", "monto_solicitado"],
    dataType: "number",
    unit: "MXN",
    applicableProfiles: ["persona_moral", "fisica_empresarial", "fisica", "sin_sat"],
    description: "Monto del crédito solicitado por el cliente en moneda nacional.",
  },

  // 2. Plazo solicitado
  creditTermMonths: {
    variableCode: "creditTermMonths",
    name: "Plazo de Crédito Solicitado",
    sourceTable: "credits",
    sourceFields: ["term", "plazo_deseado"],
    dataType: "integer",
    unit: "meses",
    applicableProfiles: ["persona_moral", "fisica_empresarial", "fisica", "sin_sat"],
    description: "Plazo de amortización deseado expresado en meses.",
  },

  // 3. Perfil de solicitante
  clientProfileType: {
    variableCode: "clientProfileType",
    name: "Perfil Jurídico / Fiscal del Solicitante",
    sourceTable: "clients",
    sourceFields: ["type"],
    dataType: "string",
    unit: "categoría",
    applicableProfiles: ["persona_moral", "fisica_empresarial", "fisica", "sin_sat"],
    description: "Régimen fiscal del cliente: persona_moral, fisica_empresarial, fisica, sin_sat.",
  },

  // 4. Antigüedad del negocio / actividad
  companyAgeMonths: {
    variableCode: "companyAgeMonths",
    name: "Antigüedad Comercial / Laboral",
    sourceTable: "clients",
    sourceFields: ["yearsInBusiness", "tiempoActividad", "antiguedadLaboral", "antiguedadEmpleo"],
    dataType: "integer",
    unit: "meses",
    applicableProfiles: ["persona_moral", "fisica_empresarial", "fisica", "sin_sat"],
    description: "Tiempo comprobable de operaciones o empleo en meses.",
  },

  // 5. Facturación / Ingresos mensuales promedio
  monthlyRevenue: {
    variableCode: "monthlyRevenue",
    name: "Ingreso / Facturación Mensual Promedio",
    sourceTable: "clients",
    sourceFields: [
      "ingresoMensualPromedio",
      "ingresoAnual",
      "ingresoMensualPromedioComprobables",
      "ingresoMensualPromedioComprobablesSinSat",
    ],
    dataType: "number",
    unit: "MXN",
    applicableProfiles: ["persona_moral", "fisica_empresarial", "fisica", "sin_sat"],
    description: "Ingresos o ventas mensuales promedio en pesos mexicanos.",
  },

  // 6. Buró de crédito / Atrasos
  bureauStatus: {
    variableCode: "bureauStatus",
    name: "Estatus de Buró / Historial Crediticio",
    sourceTable: "clients",
    sourceFields: [
      "buroEmpresa",
      "buroAccionistaPrincipal",
      "buroPersonaFisica",
      "buroPersonaFisicaSinSat",
      "atrasosDeudas",
      "atrasosDeudasBuro",
      "atrasosDeudasBuroSinSat",
    ],
    dataType: "string",
    unit: "categoría",
    applicableProfiles: ["persona_moral", "fisica_empresarial", "fisica", "sin_sat"],
    description: "Comportamiento crediticio reportado (sin atrasos, con atrasos, calificación).",
  },

  // 7. Garantías reales disponibles
  hasGuarantee: {
    variableCode: "hasGuarantee",
    name: "Disponibilidad de Garantía Real",
    sourceTable: "clients",
    sourceFields: [
      "garantia",
      "cuentaConGarantiaFisica",
      "cuentaConGarantiaSinSat",
      "garantiaDetalles",
      "garantias",
      "guarantees",
    ],
    dataType: "boolean",
    unit: "booleano",
    applicableProfiles: ["persona_moral", "fisica_empresarial", "fisica", "sin_sat"],
    description: "Indica si el solicitante cuenta con garantía hipotecaria, prendaria o líquida.",
  },

  // 8. Aval u obligado solidario
  hasGuarantor: {
    variableCode: "hasGuarantor",
    name: "Disponibilidad de Aval / Obligado Solidario",
    sourceTable: "clients",
    sourceFields: [
      "avalObligadoSolidario",
      "tieneAvalObligadoSolidarioFisica",
      "tieneAvalObligadoSolidarioSinSat",
      "guarantors",
    ],
    dataType: "boolean",
    unit: "booleano",
    applicableProfiles: ["persona_moral", "fisica_empresarial", "fisica", "sin_sat"],
    description: "Indica si el solicitante cuenta con un aval u obligado solidario disponible.",
  },
};

/**
 * Funciones de extracción segura y tipada a partir de objetos reales de base de datos
 */

export function extractRequestedAmount(credit: any, client?: any): number | null {
  const c = client || {};
  const cr = credit || {};

  const candidateAmounts = [
    cr.amount,
    cr.requestedAmount,
    cr.monto,
    cr.monto_solicitado,
    cr.montoSolicitado,
    c.amount,
    c.requestedAmount,
    c.monto,
    c.monto_solicitado,
    c.montoSolicitado,
  ].filter((v) => v !== undefined && v !== null && v !== "");

  for (const item of candidateAmounts) {
    if (typeof item === "number" && !isNaN(item) && item > 0) {
      return item;
    }
    const cleaned = String(item).replace(/[^0-9.]/g, "");
    const val = parseFloat(cleaned);
    if (!isNaN(val) && val > 0) return val;
  }

  return null;
}

export function extractRequestedTermMonths(credit: any, client?: any): number | null {
  if (credit?.term !== undefined && credit?.term !== null && credit?.term !== "") {
    const val = typeof credit.term === "number" ? credit.term : parseInt(String(credit.term), 10);
    if (!isNaN(val) && val > 0) return val;
  }
  if (client?.plazoDeseado !== undefined && client?.plazoDeseado !== null && client?.plazoDeseado !== "") {
    const cleaned = String(client.plazoDeseado).replace(/[^0-9]/g, "");
    const val = parseInt(cleaned, 10);
    if (!isNaN(val) && val > 0) return val;
  }
  return null;
}

export function extractClientProfileType(client: any, credit?: any): ClientProfileType | null {
  const c = client || {};
  const cr = credit || {};
  const raw = c.type || cr.type || c.clientType || cr.clientType;
  if (!raw) return null;
  const t = String(raw).trim().toLowerCase();
  if (t === "persona_moral" || t === "pm") {
    return "persona_moral";
  }
  if (t === "fisica_empresarial" || t === "pfae" || t === "persona_fisica_con_actividad_empresarial") {
    return "fisica_empresarial";
  }
  if (t === "fisica" || t === "persona_fisica" || t === "asalariado") {
    return "fisica";
  }
  if (t === "sin_sat") {
    return "sin_sat";
  }
  return null;
}

export function extractCompanyAgeMonths(client: any, credit?: any): number | null {
  const c = client || {};
  const cr = credit || {};

  // 1. Campo explícito en años (Persona Moral / PFA)
  const yearsVal = c.yearsInBusiness ?? cr.yearsInBusiness ?? c.antiguedadAnios ?? cr.antiguedadAnios;
  if (yearsVal !== undefined && yearsVal !== null && yearsVal !== "") {
    const years = typeof yearsVal === "number" ? yearsVal : parseFloat(String(yearsVal));
    if (!isNaN(years) && years >= 0) {
      return Math.round(years * 12);
    }
  }

  // 1.1 Campo explícito en meses
  const monthsVal = c.companyAgeMonths ?? cr.companyAgeMonths ?? c.antiguedadMeses ?? cr.antiguedadMeses;
  if (monthsVal !== undefined && monthsVal !== null && monthsVal !== "") {
    const m = typeof monthsVal === "number" ? monthsVal : parseInt(String(monthsVal), 10);
    if (!isNaN(m) && m >= 0) return m;
  }

  // 2. Campos de texto con número (tiempoActividad, antiguedadLaboral, antiguedadEmpleo, businessAge)
  const candidateTexts = [
    c.tiempoActividad,
    cr.tiempoActividad,
    c.antiguedadLaboral,
    cr.antiguedadLaboral,
    c.antiguedadEmpleo,
    cr.antiguedadEmpleo,
    c.businessAge,
    cr.businessAge,
  ].filter(Boolean);

  for (const text of candidateTexts) {
    const s = String(text).toLowerCase();
    if (s.includes("mas_de_2_anios") || s.includes("mas_de_2_años")) {
      return 24;
    }
    if (s.includes("mas_de_1_anio") || s.includes("mas_de_1_año")) {
      return 12;
    }
    if (s.includes("menos_de_1_anio") || s.includes("menos_de_1_año")) {
      return 6;
    }
    // Ejemplo: "2 años", "3 años y 6 meses", "18 meses"
    if (s.includes("mes")) {
      const match = s.match(/(\d+)\s*mes/);
      if (match) return parseInt(match[1], 10);
    }
    if (s.includes("año") || s.includes("anio")) {
      const match = s.match(/(\d+(\.\d+)?)\s*(?:año|anio)/);
      if (match) return Math.round(parseFloat(match[1]) * 12);
    }
    // Si solo hay un número entero puro
    const num = parseFloat(s.replace(/[^0-9.]/g, ""));
    if (!isNaN(num) && num > 0) {
      // Si el número es pequeño (<= 10), suele ser años
      return num <= 10 ? Math.round(num * 12) : Math.round(num);
    }
  }

  return null;
}

export function extractMonthlyRevenue(client: any, credit?: any): number | null {
  const c = client || {};
  const cr = credit || {};

  // 1. Ingreso mensual promedio general / facturación mensual
  const directFields = [
    c.ingresoMensualPromedio,
    cr.ingresoMensualPromedio,
    c.monthlyRevenue,
    cr.monthlyRevenue,
    c.facturacionMensual,
    cr.facturacionMensual,
    c.ingresoMensual,
    cr.ingresoMensual,
  ].filter((v) => v !== undefined && v !== null && v !== "");

  for (const field of directFields) {
    const cleaned = String(field).replace(/[^0-9.]/g, "");
    const val = parseFloat(cleaned);
    if (!isNaN(val) && val > 0) return val;
  }

  // 2. Ingresos específicos por perfil
  const specificFields = [
    c.ingresoMensualPromedioComprobables,
    cr.ingresoMensualPromedioComprobables,
    c.ingresoMensualPromedioComprobablesSinSat,
    cr.ingresoMensualPromedioComprobablesSinSat,
  ].filter(Boolean);

  for (const field of specificFields) {
    const cleaned = String(field).replace(/[^0-9.]/g, "");
    const val = parseFloat(cleaned);
    if (!isNaN(val) && val > 0) return val;
  }

  // 3. Ingreso anual (dividir entre 12)
  const annualFields = [c.ingresoAnual, cr.ingresoAnual].filter(
    (v) => v !== undefined && v !== null && v !== ""
  );
  for (const field of annualFields) {
    const cleaned = String(field).replace(/[^0-9.]/g, "");
    const annualVal = parseFloat(cleaned);
    if (!isNaN(annualVal) && annualVal > 0) {
      return Number((annualVal / 12).toFixed(2));
    }
  }

  return null;
}

export function extractBureauStatus(client: any, credit?: any): {
  hasDelinquencies: boolean | null;
  rawStatus: string | null;
} {
  const c = client || {};
  const cr = credit || {};

  const delinquencyFields = [
    c.atrasosDeudas,
    cr.atrasosDeudas,
    c.atrasosDeudasBuro,
    cr.atrasosDeudasBuro,
    c.atrasosDeudasBuroSinSat,
    cr.atrasosDeudasBuroSinSat,
    c.buroStatus,
    cr.buroStatus,
  ].filter(Boolean);

  for (const val of delinquencyFields) {
    const s = String(val).trim().toUpperCase();
    if (
      s === "NO" ||
      s === "FALSE" ||
      s.includes("SIN ATRASO") ||
      s.includes("AL CORRIENTE") ||
      s.includes("AL_CORRIENTE")
    ) {
      return { hasDelinquencies: false, rawStatus: s };
    }
    if (
      s === "SI" ||
      s === "SÍ" ||
      s === "TRUE" ||
      s === "CON ATRASOS" ||
      s.includes("ATRASO") ||
      s.includes("QUEBRANTO")
    ) {
      return { hasDelinquencies: true, rawStatus: s };
    }
  }

  const statusFields = [
    c.buroEmpresa,
    cr.buroEmpresa,
    c.buroAccionistaPrincipal,
    cr.buroAccionistaPrincipal,
    c.buroPersonaFisica,
    cr.buroPersonaFisica,
    c.buroPersonaFisicaSinSat,
    cr.buroPersonaFisicaSinSat,
  ].filter(Boolean);

  for (const val of statusFields) {
    const s = String(val).trim().toLowerCase();
    if (s.includes("sin atraso") || s.includes("bueno") || s.includes("excelente") || s.includes("al corriente")) {
      return { hasDelinquencies: false, rawStatus: val };
    }
    if (s.includes("malo") || s.includes("atraso") || s.includes("quiebra") || s.includes("quebranto")) {
      return { hasDelinquencies: true, rawStatus: val };
    }
  }

  return { hasDelinquencies: null, rawStatus: null };
}

export function extractHasGuarantee(client: any, credit?: any): {
  hasGuarantee: boolean | null;
  guaranteeType: string | null;
} {
  const c = client || {};
  const cr = credit || {};

  const boolFields = [
    c.garantia,
    cr.garantia,
    c.cuentaConGarantiaFisica,
    cr.cuentaConGarantiaFisica,
    c.cuentaConGarantiaSinSat,
    cr.cuentaConGarantiaSinSat,
    c.garantias,
    cr.garantias,
    c.tieneGarantia,
    cr.tieneGarantia,
  ].filter((v) => v !== undefined && v !== null && v !== "");

  for (const f of boolFields) {
    if (typeof f === "boolean") {
      return { hasGuarantee: f, guaranteeType: f ? "general" : "sin_garantia" };
    }
    const s = String(f).trim().toUpperCase();
    if (
      s === "SI" ||
      s === "SÍ" ||
      s === "TRUE" ||
      (!["NO", "FALSE", "NINGUNA", "SIN GARANTÍA", "SIN GARANTIA"].includes(s) && s.length > 2)
    ) {
      if (["NO", "FALSE", "NINGUNA", "SIN GARANTÍA", "SIN GARANTIA"].includes(s)) {
        return { hasGuarantee: false, guaranteeType: "sin_garantia" };
      }
      const type = c.garantiaDetalles?.tipo || cr.garantiaDetalles?.tipo || "general";
      return { hasGuarantee: true, guaranteeType: type };
    }
    if (s === "NO" || s === "FALSE" || s === "NINGUNA" || s === "SIN GARANTÍA" || s === "SIN GARANTIA") {
      return { hasGuarantee: false, guaranteeType: "sin_garantia" };
    }
  }

  if (Array.isArray(c.guarantees) && c.guarantees.length > 0) {
    return { hasGuarantee: true, guaranteeType: c.guarantees[0]?.tipo || "general" };
  }
  if (Array.isArray(cr.guarantees) && cr.guarantees.length > 0) {
    return { hasGuarantee: true, guaranteeType: cr.guarantees[0]?.tipo || "general" };
  }

  return { hasGuarantee: null, guaranteeType: null };
}

export function extractHasGuarantor(client: any, credit?: any): boolean | null {
  const c = client || {};
  const cr = credit || {};

  const boolFields = [
    c.avalObligadoSolidario,
    cr.avalObligadoSolidario,
    c.tieneAvalObligadoSolidarioFisica,
    cr.tieneAvalObligadoSolidarioFisica,
    c.tieneAvalObligadoSolidarioSinSat,
    cr.tieneAvalObligadoSolidarioSinSat,
    c.obligadoSolidario,
    cr.obligadoSolidario,
  ].filter((v) => v !== undefined && v !== null && v !== "");

  for (const f of boolFields) {
    if (typeof f === "boolean") return f;
    const s = String(f).trim().toUpperCase();
    if (s === "SI" || s === "SÍ" || s === "TRUE" || s === "AVAL" || s === "OBLIGADO SOLIDARIO") {
      return true;
    }
    if (s === "NO" || s === "FALSE" || s === "NO TIENE" || s === "NO APLICA") {
      return false;
    }
  }

  if (Array.isArray(c.guarantors) && c.guarantors.length > 0) {
    return true;
  }
  if (Array.isArray(cr.guarantors) && cr.guarantors.length > 0) {
    return true;
  }

  return null;
}

export function extractApplicationVariables(credit: any, client: any) {
  return {
    requestedAmount: extractRequestedAmount(credit, client),
    requestedTermMonths: extractRequestedTermMonths(credit, client),
    clientProfileType: extractClientProfileType(client, credit),
    companyAgeMonths: extractCompanyAgeMonths(client, credit),
    monthlyRevenue: extractMonthlyRevenue(client, credit),
    bureauStatus: extractBureauStatus(client, credit),
    hasGuarantee: extractHasGuarantee(client, credit),
    hasGuarantor: extractHasGuarantor(client, credit),
  };
}
