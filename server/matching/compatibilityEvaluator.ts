/**
 * Crédito Negocios — Matching M1: Motor Evaluador Independiente de Compatibilidad
 * 
 * Evalúa objetivamente la viabilidad técnica y crediticia entre una solicitud
 * (cliente + crédito) y una versión publicada de una oferta comercial.
 * 
 * Principios inviolables:
 * 1. Clasificación tripartita exacta: COMPATIBLE, NOT_COMPATIBLE o INSUFFICIENT_DATA.
 * 2. Datos ausentes NUNCA generan rechazos automáticos ni aprobaciones falsas.
 * 3. Cero uso de comisiones, sobretasas, márgenes o rankings para favorecer financieras.
 * 4. Explicabilidad total: razones claras de cumplimiento, rechazo o datos faltantes.
 */

import {
  extractRequestedAmount,
  extractRequestedTermMonths,
  extractClientProfileType,
  extractCompanyAgeMonths,
  extractMonthlyRevenue,
  extractBureauStatus,
  extractHasGuarantee,
  extractHasGuarantor,
  type ClientProfileType,
} from "./fieldMapping";

export type CompatibilityStatus = "COMPATIBLE" | "NOT_COMPATIBLE" | "INSUFFICIENT_DATA";

export interface CriterionEvaluation {
  code: string;
  name: string;
  status: "PASSED" | "FAILED" | "MISSING_DATA";
  requiredValue: any;
  actualValue: any;
  reason: string;
}

export interface CompatibilityResult {
  offerId: string;
  offerName: string;
  institutionId: string;
  versionNumber: number;
  status: CompatibilityStatus;
  criteria: {
    matched: CriterionEvaluation[];
    failed: CriterionEvaluation[];
    missing: CriterionEvaluation[];
  };
  reasons: string[];
  summary: string;
}

export interface ApplicationInput {
  credit?: any;
  client?: any;
}

export interface OfferVersionInput {
  product: any;
  version: any;
}

/**
 * Evalúa la compatibilidad entre una solicitud y la versión publicada de una oferta
 */
export function evaluateOfferCompatibility(
  application: ApplicationInput,
  offerInput: OfferVersionInput
): CompatibilityResult {
  const { credit, client } = application;
  const { product, version } = offerInput;

  const offerId = product?.id || version?.institutionProductId || version?.offerId || "unknown";
  const offerName = product?.name || product?.customName || "Oferta Comercial";
  const institutionId = product?.institutionId || "unknown";
  const versionNumber = version?.versionNumber || product?.currentVersionNumber || 1;

  const cond = (version?.conditions || product?.configuration || {}) as Record<string, any>;
  const req = (version?.requirements || {}) as Record<string, any>;

  const evaluations: CriterionEvaluation[] = [];

  // =========================================================================
  // 1. EVALUACIÓN DE PERFIL DEL SOLICITANTE
  // =========================================================================
  const targetProfiles = (req.targetProfiles || product?.targetProfiles || []) as string[];
  if (Array.isArray(targetProfiles) && targetProfiles.length > 0) {
    const clientType = extractClientProfileType(client);
    if (!clientType) {
      evaluations.push({
        code: "targetProfiles",
        name: "Perfil de Cliente Aceptado",
        status: "MISSING_DATA",
        requiredValue: targetProfiles,
        actualValue: null,
        reason: "El perfil fiscal del cliente no está definido o es desconocido en el expediente.",
      });
    } else if (!targetProfiles.includes(clientType)) {
      evaluations.push({
        code: "targetProfiles",
        name: "Perfil de Cliente Aceptado",
        status: "FAILED",
        requiredValue: targetProfiles,
        actualValue: clientType,
        reason: `El perfil del cliente (${clientType}) no está admitido por esta oferta (Aceptados: ${targetProfiles.join(", ")}).`,
      });
    } else {
      evaluations.push({
        code: "targetProfiles",
        name: "Perfil de Cliente Aceptado",
        status: "PASSED",
        requiredValue: targetProfiles,
        actualValue: clientType,
        reason: `Perfil ${clientType} admitido dentro de los perfiles autorizados de la oferta.`,
      });
    }
  }

  // =========================================================================
  // 2. EVALUACIÓN DE MONTO SOLICITADO
  // =========================================================================
  const minAmt = typeof cond.minAmount === "number" ? cond.minAmount : null;
  const maxAmt = typeof cond.maxAmount === "number" ? cond.maxAmount : null;
  if (minAmt !== null || maxAmt !== null) {
    const requestedAmount = extractRequestedAmount(credit, client);
    if (requestedAmount === null) {
      evaluations.push({
        code: "creditAmount",
        name: "Rango de Monto Solicitado",
        status: "MISSING_DATA",
        requiredValue: { min: minAmt, max: maxAmt },
        actualValue: null,
        reason: "No se ha capturado el monto del crédito en la solicitud ni en el expediente.",
      });
    } else if (minAmt !== null && requestedAmount < minAmt) {
      evaluations.push({
        code: "creditAmount",
        name: "Rango de Monto Solicitado",
        status: "FAILED",
        requiredValue: { min: minAmt, max: maxAmt },
        actualValue: requestedAmount,
        reason: `Monto solicitado ($${requestedAmount.toLocaleString("es-MX")}) es inferior al mínimo permitido ($${minAmt.toLocaleString("es-MX")}).`,
      });
    } else if (maxAmt !== null && requestedAmount > maxAmt) {
      evaluations.push({
        code: "creditAmount",
        name: "Rango de Monto Solicitado",
        status: "FAILED",
        requiredValue: { min: minAmt, max: maxAmt },
        actualValue: requestedAmount,
        reason: `Monto solicitado ($${requestedAmount.toLocaleString("es-MX")}) es superior al máximo permitido ($${maxAmt.toLocaleString("es-MX")}).`,
      });
    } else {
      evaluations.push({
        code: "creditAmount",
        name: "Rango de Monto Solicitado",
        status: "PASSED",
        requiredValue: { min: minAmt, max: maxAmt },
        actualValue: requestedAmount,
        reason: `Monto solicitado ($${requestedAmount.toLocaleString("es-MX")}) se ubica dentro del rango permitido.`,
      });
    }
  }

  // =========================================================================
  // 3. EVALUACIÓN DE PLAZO SOLICITADO
  // =========================================================================
  const minTerm = typeof cond.minTermMonths === "number" ? cond.minTermMonths : null;
  const maxTerm = typeof cond.maxTermMonths === "number" ? cond.maxTermMonths : null;
  if (minTerm !== null || maxTerm !== null) {
    const requestedTerm = extractRequestedTermMonths(credit, client);
    if (requestedTerm === null) {
      evaluations.push({
        code: "creditTerm",
        name: "Rango de Plazo Solicitado",
        status: "MISSING_DATA",
        requiredValue: { min: minTerm, max: maxTerm },
        actualValue: null,
        reason: "No se ha capturado el plazo deseado en la solicitud ni en el expediente.",
      });
    } else if (minTerm !== null && requestedTerm < minTerm) {
      evaluations.push({
        code: "creditTerm",
        name: "Rango de Plazo Solicitado",
        status: "FAILED",
        requiredValue: { min: minTerm, max: maxTerm },
        actualValue: requestedTerm,
        reason: `Plazo solicitado (${requestedTerm} meses) es menor al mínimo de la oferta (${minTerm} meses).`,
      });
    } else if (maxTerm !== null && requestedTerm > maxTerm) {
      evaluations.push({
        code: "creditTerm",
        name: "Rango de Plazo Solicitado",
        status: "FAILED",
        requiredValue: { min: minTerm, max: maxTerm },
        actualValue: requestedTerm,
        reason: `Plazo solicitado (${requestedTerm} meses) excede el máximo de la oferta (${maxTerm} meses).`,
      });
    } else {
      evaluations.push({
        code: "creditTerm",
        name: "Rango de Plazo Solicitado",
        status: "PASSED",
        requiredValue: { min: minTerm, max: maxTerm },
        actualValue: requestedTerm,
        reason: `Plazo solicitado (${requestedTerm} meses) se encuentra dentro de los límites de la oferta.`,
      });
    }
  }

  // =========================================================================
  // 4. EVALUACIÓN DE ANTIGÜEDAD DE LA EMPRESA / NEGOCIO
  // =========================================================================
  const minAge = typeof cond.minCompanyAgeMonths === "number" ? cond.minCompanyAgeMonths : null;
  if (minAge !== null && minAge > 0) {
    const ageMonths = extractCompanyAgeMonths(client);
    if (ageMonths === null) {
      evaluations.push({
        code: "companyAge",
        name: "Antigüedad Mínima de Operación",
        status: "MISSING_DATA",
        requiredValue: minAge,
        actualValue: null,
        reason: "No se cuenta con registro de antigüedad comercial o tiempo de actividad en el expediente del cliente.",
      });
    } else if (ageMonths < minAge) {
      evaluations.push({
        code: "companyAge",
        name: "Antigüedad Mínima de Operación",
        status: "FAILED",
        requiredValue: minAge,
        actualValue: ageMonths,
        reason: `Antigüedad registrada (${ageMonths} meses) no cumple el mínimo requerido (${minAge} meses).`,
      });
    } else {
      evaluations.push({
        code: "companyAge",
        name: "Antigüedad Mínima de Operación",
        status: "PASSED",
        requiredValue: minAge,
        actualValue: ageMonths,
        reason: `Antigüedad registrada (${ageMonths} meses) cumple con el requisito de ${minAge} meses.`,
      });
    }
  }

  // =========================================================================
  // 5. EVALUACIÓN DE INGRESOS / FACTURACIÓN MENSUAL
  // =========================================================================
  const minRev = typeof cond.minMonthlyRevenue === "number" ? cond.minMonthlyRevenue : null;
  if (minRev !== null && minRev > 0) {
    const revenue = extractMonthlyRevenue(client);
    if (revenue === null) {
      evaluations.push({
        code: "monthlyRevenue",
        name: "Ingreso / Facturación Mensual Mínima",
        status: "MISSING_DATA",
        requiredValue: minRev,
        actualValue: null,
        reason: "No se cuenta con datos de facturación o ingresos mensuales comprobables en el expediente del cliente.",
      });
    } else if (revenue < minRev) {
      evaluations.push({
        code: "monthlyRevenue",
        name: "Ingreso / Facturación Mensual Mínima",
        status: "FAILED",
        requiredValue: minRev,
        actualValue: revenue,
        reason: `Ingresos mensuales registrados ($${revenue.toLocaleString("es-MX")}) no alcanzan el mínimo requerido ($${minRev.toLocaleString("es-MX")}).`,
      });
    } else {
      evaluations.push({
        code: "monthlyRevenue",
        name: "Ingreso / Facturación Mensual Mínima",
        status: "PASSED",
        requiredValue: minRev,
        actualValue: revenue,
        reason: `Ingresos mensuales registrados ($${revenue.toLocaleString("es-MX")}) cumplen con el mínimo requerido ($${minRev.toLocaleString("es-MX")}).`,
      });
    }
  }

  // =========================================================================
  // 6. EVALUACIÓN DE BURÓ DE CRÉDITO
  // =========================================================================
  const bureauReq = cond.bureauRequirement || "sin_requisito";
  if (bureauReq !== "sin_requisito") {
    const { hasDelinquencies, rawStatus } = extractBureauStatus(client);
    if (hasDelinquencies === null) {
      evaluations.push({
        code: "bureauRequirement",
        name: "Historial de Buró de Crédito",
        status: "MISSING_DATA",
        requiredValue: bureauReq,
        actualValue: null,
        reason: "No se ha documentado ni consultado el estatus de buró o historial de atrasos para el cliente.",
      });
    } else if (bureauReq === "sin_atrasos" && hasDelinquencies === true) {
      evaluations.push({
        code: "bureauRequirement",
        name: "Historial de Buró de Crédito",
        status: "FAILED",
        requiredValue: "sin_atrasos",
        actualValue: rawStatus || "con_atrasos",
        reason: "La oferta exige historial sin atrasos y el cliente presenta incidencias o atrasos registrados.",
      });
    } else {
      evaluations.push({
        code: "bureauRequirement",
        name: "Historial de Buró de Crédito",
        status: "PASSED",
        requiredValue: bureauReq,
        actualValue: rawStatus || "al_corriente",
        reason: "El historial de buró del cliente es compatible con los requerimientos de la oferta.",
      });
    }
  }

  // =========================================================================
  // 7. EVALUACIÓN DE GARANTÍA REAL
  // =========================================================================
  const guarType = cond.guaranteeType || "sin_garantia";
  if (guarType !== "sin_garantia") {
    const { hasGuarantee, guaranteeType: actualType } = extractHasGuarantee(client);
    if (hasGuarantee === null) {
      evaluations.push({
        code: "guaranteeType",
        name: "Requisito de Garantía Real",
        status: "MISSING_DATA",
        requiredValue: guarType,
        actualValue: null,
        reason: `La oferta requiere garantía (${guarType}), pero no se ha capturado información de garantías en el expediente.`,
      });
    } else if (hasGuarantee === false) {
      evaluations.push({
        code: "guaranteeType",
        name: "Requisito de Garantía Real",
        status: "FAILED",
        requiredValue: guarType,
        actualValue: "sin_garantia",
        reason: `La oferta requiere garantía real de tipo '${guarType}' y el cliente declaró no contar con garantía.`,
      });
    } else {
      evaluations.push({
        code: "guaranteeType",
        name: "Requisito de Garantía Real",
        status: "PASSED",
        requiredValue: guarType,
        actualValue: actualType || "garantia_disponible",
        reason: "El cliente cuenta con garantía compatible registrada en el expediente.",
      });
    }
  }

  // =========================================================================
  // 8. EVALUACIÓN DE AVAL U OBLIGADO SOLIDARIO
  // =========================================================================
  const avalReq = cond.avalesType || "no_requerido";
  if (avalReq !== "no_requerido") {
    const hasGuarantor = extractHasGuarantor(client);
    if (hasGuarantor === null) {
      evaluations.push({
        code: "avalesType",
        name: "Requisito de Aval / Obligado Solidario",
        status: "MISSING_DATA",
        requiredValue: avalReq,
        actualValue: null,
        reason: `La oferta requiere aval u obligado solidario (${avalReq}), pero no se ha indicado disponibilidad de aval en el expediente.`,
      });
    } else if (hasGuarantor === false) {
      evaluations.push({
        code: "avalesType",
        name: "Requisito de Aval / Obligado Solidario",
        status: "FAILED",
        requiredValue: avalReq,
        actualValue: "sin_aval",
        reason: `La oferta requiere aval/obligado solidario y el expediente indica que el cliente no cuenta con uno.`,
      });
    } else {
      evaluations.push({
        code: "avalesType",
        name: "Requisito de Aval / Obligado Solidario",
        status: "PASSED",
        requiredValue: avalReq,
        actualValue: "aval_disponible",
        reason: "El expediente cuenta con aval u obligado solidario disponible.",
      });
    }
  }

  // =========================================================================
  // CLASIFICACIÓN FINAL DE COMPATIBILIDAD
  // =========================================================================
  const matched = evaluations.filter((e) => e.status === "PASSED");
  const failed = evaluations.filter((e) => e.status === "FAILED");
  const missing = evaluations.filter((e) => e.status === "MISSING_DATA");

  let status: CompatibilityStatus;
  let summary: string;

  if (failed.length > 0) {
    status = "NOT_COMPATIBLE";
    summary = `No compatible: incumple ${failed.length} condición(es) obligatoria(s).`;
  } else if (missing.length > 0) {
    status = "INSUFFICIENT_DATA";
    summary = `Información insuficiente: cumple ${matched.length} condición(es), pero faltan ${missing.length} dato(s) por verificar.`;
  } else if (matched.length > 0) {
    status = "COMPATIBLE";
    summary = `Compatible: cumple con éxito las ${matched.length} condiciones configuradas de la oferta.`;
  } else {
    // Si la oferta no tenía ninguna condición restrictiva configurada
    status = "COMPATIBLE";
    summary = "Compatible: la oferta no define condiciones mínimas excluyentes.";
  }

  const reasons = [
    ...failed.map((f) => `[Rechazo] ${f.name}: ${f.reason}`),
    ...missing.map((m) => `[Dato Pendiente] ${m.name}: ${m.reason}`),
    ...matched.map((p) => `[Cumplido] ${p.name}: ${p.reason}`),
  ];

  return {
    offerId,
    offerName,
    institutionId,
    versionNumber,
    status,
    criteria: {
      matched,
      failed,
      missing,
    },
    reasons,
    summary,
  };
}

/**
 * Evalúa una solicitud contra un catálogo de ofertas publicadas.
 * - Cero sesgo por comisiones o márgenes.
 * - Clasifica en grupos objetivos por compatibilidad.
 */
export function evaluateCatalogCompatibility(
  application: ApplicationInput,
  offers: OfferVersionInput[]
): {
  compatible: CompatibilityResult[];
  insufficientData: CompatibilityResult[];
  notCompatible: CompatibilityResult[];
  all: CompatibilityResult[];
} {
  const all = offers.map((offer) => evaluateOfferCompatibility(application, offer));

  const compatible = all.filter((r) => r.status === "COMPATIBLE");
  const insufficientData = all.filter((r) => r.status === "INSUFFICIENT_DATA");
  const notCompatible = all.filter((r) => r.status === "NOT_COMPATIBLE");

  return {
    compatible,
    insufficientData,
    notCompatible,
    all,
  };
}
