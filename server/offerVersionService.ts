import crypto from "crypto";
import { getOfferAgePolicy } from "../shared/offerAgePolicy";
import type {
  InstitutionProduct,
  InstitutionProductVersion,
  InsertInstitutionProduct,
  InsertInstitutionProductVersion,
  FinancialInstitutionOffer,
  FinancialInstitutionOfferVersion,
  InsertFinancialInstitutionOffer,
  InsertFinancialInstitutionOfferVersion,
} from "@shared/schema";

/**
 * Ordena recursivamente las llaves de un objeto para serialización JSON determinista.
 */
function sortObjectKeys(obj: any): any {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(sortObjectKeys);
  return Object.keys(obj)
    .sort()
    .reduce((res: Record<string, any>, key: string) => {
      res[key] = sortObjectKeys(obj[key]);
      return res;
    }, {});
}

/**
 * Genera un hash criptográfico determinista SHA-256 para una versión de oferta.
 * Incluye condiciones comerciales, requisitos, documentación requerida y variables.
 * Garantiza inmutabilidad y trazabilidad legal de las versiones publicadas.
 */
export function computeInstitutionProductVersionHash(params: {
  institutionProductId?: string;
  offerId?: string;
  versionNumber: number;
  conditions?: unknown;
  requirements?: unknown;
  requiredDocuments?: string[];
  variablesConfiguration?: unknown;
}): string {
  const payload = {
    productId: params.institutionProductId || params.offerId || "",
    versionNumber: params.versionNumber,
    conditions: (params.conditions as Record<string, any>) || {},
    requirements: (params.requirements as Record<string, any>) || {},
    requiredDocuments: Array.isArray(params.requiredDocuments)
      ? [...params.requiredDocuments].sort()
      : [],
    variablesConfiguration: (params.variablesConfiguration as Record<string, any>) || {},
  };

  const serialized = JSON.stringify(sortObjectKeys(payload));
  return crypto.createHash("sha256").update(serialized).digest("hex");
}

/**
 * COM-28: Identifica cambios económicos visibles al intermediario entre
 * versiones de UNA misma oferta. No compara márgenes internos de la plataforma,
 * evita inventar aprobaciones, y nunca recalcula operaciones congeladas.
 *
 * IMPORTANTE: detectar el cambio NO equivale a aceptación: el registro de
 * aceptación y el bloqueo de nuevas operaciones quedan como gate de release.
 */
export function compareOfferIntermediaryCommissions(
  previous: Pick<InstitutionProductVersion, "conditions"> | null | undefined,
  next: Pick<InstitutionProductVersion, "conditions">,
): {
  isInitialPublication: boolean;
  requiresManualReview: boolean;
  directBrokerChanged: boolean;
  masterBrokerChanged: boolean;
  requiresAnyAcceptance: boolean;
} {
  const base = {
    isInitialPublication: !previous,
    requiresManualReview: false,
    directBrokerChanged: false,
    masterBrokerChanged: false,
    requiresAnyAcceptance: false,
  };
  if (!previous) return base;

  const previousRates = (previous.conditions as Record<string, unknown> | null)?.commissionRates;
  const nextRates = (next.conditions as Record<string, unknown> | null)?.commissionRates;
  if (!previousRates || !nextRates ||
      typeof previousRates !== "object" || typeof nextRates !== "object") {
    return { ...base, requiresManualReview: true };
  }

  const normalize = (value: unknown): unknown => {
    if (value === undefined || value === null || value === "") return null;
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value === "string") {
      const cleaned = value.trim();
      if (cleaned && Number.isFinite(Number(cleaned))) return Number(cleaned);
      return cleaned;
    }
    if (Array.isArray(value)) return value.map(normalize);
    if (typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, v]) => [key, normalize(v)]),
      );
    }
    return value;
  };

  const previousData = previousRates as Record<string, unknown>;
  const nextData = nextRates as Record<string, unknown>;
  // An unset actor share is not equivalent to a genuinely unchanged schedule.
  const missingActorRate = ["broker", "masterBroker"].some(key =>
    !previousData[key] || typeof previousData[key] !== "object" ||
    !nextData[key] || typeof nextData[key] !== "object");
  if (missingActorRate) return { ...base, requiresManualReview: true };

  const actorChanged = (key: "broker" | "masterBroker") =>
    JSON.stringify(normalize({
      commissionType: previousData.type,
      share: previousData[key],
    })) !== JSON.stringify(normalize({
      commissionType: nextData.type,
      share: nextData[key],
    }));
  const directBrokerChanged = actorChanged("broker");
  const masterBrokerChanged = actorChanged("masterBroker");
  return {
    ...base,
    directBrokerChanged,
    masterBrokerChanged,
    requiresAnyAcceptance: directBrokerChanged || masterBrokerChanged,
  };
}

/**
 * Validación independiente de renovación y sobretasa. El techo de apertura
 * no se reutiliza para estos conceptos económicos distintos.
 */
function validateAdditionalCommissionRates(rates: Record<string, any>): string[] {
  const errors: string[] = [];
  const percent = (value: unknown, name: string): number | null => {
    if (value === undefined || value === null || value === "") return null;
    if (typeof value !== "number" && typeof value !== "string") {
      errors.push(`${name} inválido`); return null;
    }
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      errors.push(`${name} debe estar entre 0% y 100%`); return null;
    }
    return n;
  };
  const fin = percent(rates.financiera?.renovacion, "Renovación financiera");
  const master = percent(rates.masterBroker?.renovacion, "Renovación Master");
  const broker = percent(rates.broker?.renovacion, "Renovación Broker");
  percent(rates.financiera?.sobretasa, "Sobretasa Crédito Negocios");
  if (fin !== null) {
    if (master !== null && master > fin) errors.push("Renovación Master no puede superar a financiera");
    if (broker !== null && broker > fin) errors.push("Renovación Broker no puede superar a financiera");
  }
  return errors;
}

// Alias retrocompatible
export const computeOfferVersionHash = computeInstitutionProductVersionHash;

/**
 * Valida los parámetros básicos de edición de una versión de oferta.
 */
export function validateOfferVersionParameters(data: Partial<InsertInstitutionProductVersion>): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (data.conditions) {
    const c = data.conditions as Record<string, any>;
    for (const key of ["minAmount", "maxAmount", "minInterestRate", "maxInterestRate", "minTermMonths", "maxTermMonths", "minCompanyAgeMonths", "minMonthlyRevenue"]) {
      const value = c[key];
      if (value != null && (typeof value !== "number" || !Number.isFinite(value) || value < 0)) errors.push(`${key} debe ser un número finito mayor o igual a cero`);
    }
    for (const key of ["minTermMonths", "maxTermMonths", "minCompanyAgeMonths"]) {
      if (c[key] != null && !Number.isInteger(c[key])) errors.push(`${key} debe contener meses enteros`);
    }
    if (typeof c.minAmount === "number" && typeof c.maxAmount === "number" && c.minAmount > c.maxAmount) {
      errors.push("minAmount no puede ser mayor que maxAmount");
    }
    if (typeof c.minTermMonths === "number" && typeof c.maxTermMonths === "number" && c.minTermMonths > c.maxTermMonths) {
      errors.push("minTermMonths no puede ser mayor que maxTermMonths");
    }
    if (typeof c.minInterestRate === "number" && typeof c.maxInterestRate === "number" && c.minInterestRate > c.maxInterestRate) {
      errors.push("minInterestRate no puede ser mayor que maxInterestRate");
    }

    // Validación económica de comisiones por oferta (B2.2)
    if (c.commissionRates && typeof c.commissionRates === "object") {
      const cr = c.commissionRates as Record<string, any>;
    errors.push(...validateAdditionalCommissionRates(cr));
      const finRate = cr.financiera?.apertura !== undefined && cr.financiera?.apertura !== null && cr.financiera?.apertura !== ""
        ? Number(cr.financiera.apertura)
        : undefined;
      const mbRate = cr.masterBroker?.apertura !== undefined && cr.masterBroker?.apertura !== null && cr.masterBroker?.apertura !== ""
        ? Number(cr.masterBroker.apertura)
        : undefined;
      const brkRate = cr.broker?.apertura !== undefined && cr.broker?.apertura !== null && cr.broker?.apertura !== ""
        ? Number(cr.broker.apertura)
        : undefined;

      if (finRate !== undefined && (isNaN(finRate) || finRate < 0)) {
        errors.push("La comisión pagada por la financiera debe ser un número mayor o igual a 0");
      }
      if (mbRate !== undefined && (isNaN(mbRate) || mbRate < 0)) {
        errors.push("La comisión para Master Broker debe ser un número mayor o igual a 0");
      }
      if (brkRate !== undefined && (isNaN(brkRate) || brkRate < 0)) {
        errors.push("La comisión para Broker Directo debe ser un número mayor o igual a 0");
      }

      if (finRate !== undefined && !isNaN(finRate) && finRate >= 0) {
        if (mbRate !== undefined && !isNaN(mbRate) && mbRate > finRate) {
          errors.push(`La tasa para Master Broker (${mbRate}%) no puede ser superior a la comisión que paga la financiera a Crédito Negocios (${finRate}%)`);
        }
        if (brkRate !== undefined && !isNaN(brkRate) && brkRate > finRate) {
          errors.push(`La tasa para Broker Directo (${brkRate}%) no puede ser superior a la comisión que paga la financiera a Crédito Negocios (${finRate}%)`);
        }
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

export const validateInstitutionProductVersionParameters = validateOfferVersionParameters;

/**
 * Valida que una versión cumpla con las condiciones mínimas obligatorias para ser publicada.
 * Impide publicar borradores con errores de coherencia, identifica campos desconocidos como pendientes
 * y previene inventar datos financieros (Gate de Calidad Comercial B3).
 */
export function validateMinimumPublishConditions(params: {
  conditions?: unknown;
  requirements?: unknown;
  requiredDocuments?: string[];
  changeReason?: string | null;
  productType?: string | null;
}): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  pendingFields: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  const pendingFields: string[] = [];
  const c = (params.conditions as Record<string, any>) || {};
  const r = (params.requirements as Record<string, any>) || {};

  // 1. Validar montos de referencia
  const hasMinAmt = typeof c.minAmount === "number";
  const hasMaxAmt = typeof c.maxAmount === "number";

  if (!hasMinAmt && !hasMaxAmt) {
    errors.push("Debe definirse al menos un monto de referencia (mínimo o máximo) para la oferta");
  } else {
    if (hasMinAmt && c.minAmount <= 0) {
      errors.push("minAmount debe ser un número positivo mayor a 0");
    }
    if (hasMaxAmt && c.maxAmount <= 0) {
      errors.push("maxAmount debe ser un número positivo mayor a 0");
    }
    if (hasMinAmt && hasMaxAmt && c.minAmount > c.maxAmount) {
      errors.push("minAmount no puede ser mayor que maxAmount");
    }
    if (!hasMinAmt) {
      pendingFields.push("minAmount");
      warnings.push("Monto mínimo no especificado (abierto según capacidad crediticia).");
    }
    if (!hasMaxAmt) {
      pendingFields.push("maxAmount");
      warnings.push("Monto máximo no especificado (abierto según capacidad crediticia).");
    }
  }

  // 2. Validar tasas de interés (no inventar datos: identificar pendientes si no aplican)
  const hasMinRate = typeof c.minInterestRate === "number";
  const hasMaxRate = typeof c.maxInterestRate === "number";

  if (hasMinRate && c.minInterestRate < 0) {
    errors.push("minInterestRate debe ser un número positivo mayor o igual a 0");
  }
  if (hasMaxRate && c.maxInterestRate < 0) {
    errors.push("maxInterestRate debe ser un número positivo mayor o igual a 0");
  }
  if (hasMinRate && hasMaxRate && c.minInterestRate > c.maxInterestRate) {
    errors.push("minInterestRate no puede ser mayor que maxInterestRate");
  }
  if (!hasMinRate || !hasMaxRate) {
    pendingFields.push("interestRate");
    warnings.push(
      typeof c.rateSource === "string" && c.rateSource.trim()
        ? "Existe una tasa o fórmula comercial en el archivo de origen, pero no un rango numérico completo. Revisa la fórmula antes de cotizar."
        : "No hay rango numérico completo de tasas; la tasa final debe confirmarse antes de cotizar."
    );
  }

  // 3. Validar plazos de crédito
  const hasMinTerm = typeof c.minTermMonths === "number";
  const hasMaxTerm = typeof c.maxTermMonths === "number";

  if (hasMinTerm && c.minTermMonths <= 0) {
    errors.push("minTermMonths debe ser un entero positivo mayor a 0");
  }
  if (hasMaxTerm && c.maxTermMonths <= 0) {
    errors.push("maxTermMonths debe ser un entero positivo mayor a 0");
  }
  if (hasMinTerm && hasMaxTerm && c.minTermMonths > c.maxTermMonths) {
    errors.push("minTermMonths no puede ser mayor que maxTermMonths");
  }
  if (!hasMinTerm || !hasMaxTerm) {
    pendingFields.push("termMonths");
    warnings.push(
      hasMaxTerm && !hasMinTerm
        ? `Plazo máximo registrado: ${c.maxTermMonths} meses. El plazo mínimo no está especificado; el máximo sí se respeta.`
        : hasMinTerm && !hasMaxTerm
          ? `Plazo mínimo registrado: ${c.minTermMonths} meses. El plazo máximo está pendiente de confirmar.`
          : "Plazos mínimo y máximo no especificados: confirmar con la financiera antes de cotizar."
    );
  }

  // 4. Validar perfiles de cliente (Requisito comercial indispensable)
  const targetProfiles = r.targetProfiles;
  if (!Array.isArray(targetProfiles) || targetProfiles.length === 0) {
    errors.push("requirements.targetProfiles debe contener al menos un perfil de cliente aceptado");
  }

  // 5. Validar documentación requerida
  if (!Array.isArray(params.requiredDocuments)) {
    errors.push("requiredDocuments debe ser una lista de documentos requeridos");
  } else if (params.requiredDocuments.length === 0) {
    warnings.push("Sin documentos obligatorios especificados: se requerirá el checklist estándar del expediente.");
  }

  // 6. Validar coherencia económica de comisiones individuales por oferta
  if (c.commissionRates && typeof c.commissionRates === "object") {
    const cr = c.commissionRates as Record<string, any>;
    errors.push(...validateAdditionalCommissionRates(cr));
    const finRate = cr.financiera?.apertura !== undefined && cr.financiera?.apertura !== null && cr.financiera?.apertura !== ""
      ? Number(cr.financiera.apertura)
      : undefined;
    const mbRate = cr.masterBroker?.apertura !== undefined && cr.masterBroker?.apertura !== null && cr.masterBroker?.apertura !== ""
      ? Number(cr.masterBroker.apertura)
      : undefined;
    const brkRate = cr.broker?.apertura !== undefined && cr.broker?.apertura !== null && cr.broker?.apertura !== ""
      ? Number(cr.broker.apertura)
      : undefined;

    if (finRate !== undefined && (isNaN(finRate) || finRate < 0)) {
      errors.push("La comisión pagada por la financiera debe ser un número mayor o igual a 0");
    }
    if (mbRate !== undefined && (isNaN(mbRate) || mbRate < 0)) {
      errors.push("La comisión para Master Broker debe ser un número mayor o igual a 0");
    }
    if (brkRate !== undefined && (isNaN(brkRate) || brkRate < 0)) {
      errors.push("La comisión para Broker Directo debe ser un número mayor o igual a 0");
    }

    if (finRate !== undefined && !isNaN(finRate) && finRate >= 0) {
      if (mbRate !== undefined && !isNaN(mbRate) && mbRate > finRate) {
        errors.push(`La tasa para Master Broker (${mbRate}%) no puede ser superior a la comisión que paga la financiera a Crédito Negocios (${finRate}%)`);
      }
      if (brkRate !== undefined && !isNaN(brkRate) && brkRate > finRate) {
        errors.push(`La tasa para Broker Directo (${brkRate}%) no puede ser superior a la comisión que paga la financiera a Crédito Negocios (${finRate}%)`);
      }
    }

    if (finRate === undefined || brkRate === undefined || mbRate === undefined) {
      pendingFields.push("commissions");
      warnings.push("Comisiones incompletas: los márgenes brutos de plataforma para canales faltantes quedarán pendientes (nunca asumidos al 100%).");
    }
  } else {
    pendingFields.push("commissions");
    warnings.push("Sin esquema de comisiones asignado: margen de plataforma pendiente de definición comercial.");
  }

  const agePolicy = getOfferAgePolicy(c, r);
  for (const row of agePolicy.rows.filter(row => row.pending)) {
    errors.push(`Antigüedad de ${row.label}: la fuente «${agePolicy.source}» y el mínimo configurado (${row.configuredMonths ?? "pendiente"} meses) requieren conciliación en Elegibilidad antes de publicar.`);
  }
  warnings.push("El matching compara cada requisito con los datos capturados. Datos faltantes, ambiguos o marcados como no verificados permanecen pendientes.");

  // 8. Validar justificación / motivo de cambio (Trazabilidad y auditoría obligatoria)
  if (!params.changeReason || typeof params.changeReason !== "string" || params.changeReason.trim().length < 3) {
    errors.push("changeReason es obligatorio para publicar (mínimo 3 caracteres para trazabilidad y auditoría)");
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    pendingFields,
  };
}

/**
 * Evalúa si una oferta/producto es elegible para nuevas solicitudes de crédito.
 * - Ofertas nuevas en borrador ('draft'): NUNCA son elegibles para nuevas solicitudes.
 * - Ofertas archivadas ('archived') o inactivas ('isActive: false'): NO son elegibles.
 * - Requisito 3 (A1.3): Exige una versión realmente publicada (status === 'published' o 'active').
 *   No confía solamente en offer.status === 'published'.
 * - Registros legacy preexistentes: Se preserva su operación existente (elegibles si isActive !== false y no son draft/archived).
 */
export function isOfferEligibleForRequests(
  offer: {
    id?: string;
    status?: string | null;
    isActive?: boolean | null;
    isLegacy?: boolean | null;
  },
  activeVersionOrVersions?: {
    status?: string | null;
  } | Array<{ status?: string | null }> | null
): boolean {
  // 1. Inactiva lógicamente -> No elegible
  if (offer.isActive === false) {
    return false;
  }

  // 2. En borrador -> NUNCA elegible para nuevas solicitudes
  if (offer.status === "draft") {
    return false;
  }

  // 3. Archivada -> No elegible
  if (offer.status === "archived") {
    return false;
  }

  // 4. Si se proporciona versión activa o arreglo de versiones:
  if (activeVersionOrVersions) {
    if (Array.isArray(activeVersionOrVersions)) {
      if (activeVersionOrVersions.length === 0) {
        // Sin versiones en el histórico: solo elegible si es un registro legacy comprobado
        return offer.status === "active" || !offer.status || offer.isLegacy === true;
      }
      return activeVersionOrVersions.some(
        v => v.status === "published" || v.status === "active"
      );
    }
    return activeVersionOrVersions.status === "published" || activeVersionOrVersions.status === "active";
  }

  // 5. Requisito 3: Exigir una versión realmente publicada para considerar elegible una oferta nueva;
  // NO confiar solamente en offer.status === 'published'.
  // Si no se pasaron versiones para validar:
  // - Solo se consideran elegibles los registros legacy existentes (sin status o con status 'active' o isLegacy=true).
  // - Para una oferta (status='published'), NO se puede certificar elegibilidad sin constatar su versión publicada.
  return offer.status === "active" || !offer.status || offer.isLegacy === true;
}
