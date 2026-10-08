import crypto from "crypto";
import type {
  FinancialInstitutionOffer,
  FinancialInstitutionOfferVersion,
  InsertFinancialInstitutionOffer,
  InsertFinancialInstitutionOfferVersion,
} from "@shared/schema";

/**
 * Genera un hash criptográfico determinista SHA-256 para una versión de oferta.
 * Garantiza inmutabilidad y trazabilidad legal de las condiciones y requisitos vigentes.
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

export function computeOfferVersionHash(params: {
  offerId: string;
  versionNumber: number;
  conditions?: unknown;
  requirements?: unknown;
  variablesConfiguration?: unknown;
}): string {
  const payload = {
    offerId: params.offerId,
    versionNumber: params.versionNumber,
    conditions: (params.conditions as Record<string, any>) || {},
    requirements: (params.requirements as Record<string, any>) || {},
    variablesConfiguration: (params.variablesConfiguration as Record<string, any>) || {},
  };

  const serialized = JSON.stringify(sortObjectKeys(payload));
  return crypto.createHash("sha256").update(serialized).digest("hex");
}

/**
 * Valida los parámetros básicos de una versión de oferta
 */
export function validateOfferVersionParameters(data: Partial<InsertFinancialInstitutionOfferVersion>): {
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
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
