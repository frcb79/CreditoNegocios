import crypto from "crypto";
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
    warnings.push("Tasas de interés no definidas completamente: la oferta quedará con tasa pendiente según evaluación de riesgo.");
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
    warnings.push("Plazos no definidos completamente: la oferta quedará con plazo abierto o a determinar comercialmente.");
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

  // 7. Variables de elegibilidad: fuera de Matching hasta verificar en expediente real
  warnings.push("Las variables de elegibilidad no verificadas documentalmente en expediente permanecerán inactivas para Matching.");

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
