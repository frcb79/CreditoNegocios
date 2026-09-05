// Core Matching & Rule Evaluation Engine for CreditoNegocios
// Single source of truth for Buró score matching, government sales participation, and threshold evaluations.

export interface BuroScoreRange {
  min: number;
  max: number;
  label: string;
}

export interface EvaluationResult {
  status: 'pass' | 'warning' | 'fail' | 'info';
  clientDisplay: string;
  requirementDisplay?: string;
  notes?: string;
}

export const BURO_PF_MAP: Record<string, BuroScoreRange> = {
  'alto-694-760': { min: 694, max: 760, label: 'Alto (694 - 760 pts)' },
  'bueno-592-693': { min: 592, max: 693, label: 'Bueno (592 - 693 pts)' },
  'medio-524-591': { min: 524, max: 591, label: 'Medio (524 - 591 pts)' },
  'bajo-490-523': { min: 490, max: 523, label: 'Bajo (490 - 523 pts)' },
  'malo-456-489': { min: 456, max: 489, label: 'Malo (456 - 489 pts)' },
};

export const BURO_EMPRESA_MAP: Record<string, BuroScoreRange> = {
  'alto-310-400': { min: 310, max: 400, label: 'Alto (310 - 400 pts)' },
  'bueno-250-309': { min: 250, max: 309, label: 'Bueno (250 - 309 pts)' },
  'medio-230-249': { min: 230, max: 249, label: 'Medio (230 - 249 pts)' },
  'bajo-220-229': { min: 220, max: 229, label: 'Bajo (220 - 229 pts)' },
  'malo-100-219': { min: 100, max: 219, label: 'Malo (100 - 219 pts)' },
};

/**
 * Evaluates a client's buró score against the required minimum.
 * If client has a category range (e.g. "alto-694-760") and the required minimum falls within or below that range,
 * the result is 'pass' (Cumple).
 */
export function evaluateBuroScore(
  fieldKey: string,
  clientValue: any,
  minReq: number
): EvaluationResult {
  if (clientValue === null || clientValue === undefined || clientValue === '' || clientValue === 'N/A') {
    return {
      status: 'warning',
      clientDisplay: 'No proporcionado',
      notes: 'Dato de buró no proporcionado por el cliente'
    };
  }

  const strVal = String(clientValue).trim().toLowerCase();
  const isEmpresa = fieldKey === 'buroEmpresa';
  const map = isEmpresa ? BURO_EMPRESA_MAP : BURO_PF_MAP;

  // 1. Check exact key match in range maps
  if (map[strVal]) {
    const range = map[strVal];
    // If the client's score range upper bound satisfies the minimum requirement, it complies
    const pass = range.max >= minReq;
    return {
      status: pass ? 'pass' : 'fail',
      clientDisplay: range.label,
      requirementDisplay: `Mínimo ${minReq} puntos`,
      notes: pass
        ? `Rango del cliente (${range.min} - ${range.max}) cumple con el mínimo requerido de ${minReq} puntos`
        : `Rango del cliente (${range.min} - ${range.max}) no alcanza el mínimo requerido de ${minReq} puntos`
    };
  }

  // 2. Check if string contains custom range like "694-760" or "alto 694 a 760"
  const rangeMatch = strVal.match(/(\d+)\s*[-–a]\s*(\d+)/i);
  if (rangeMatch) {
    const low = parseInt(rangeMatch[1], 10);
    const high = parseInt(rangeMatch[2], 10);
    const pass = high >= minReq;
    return {
      status: pass ? 'pass' : 'fail',
      clientDisplay: `${strVal.charAt(0).toUpperCase() + strVal.slice(1)} (${low} - ${high} pts)`,
      requirementDisplay: `Mínimo ${minReq} puntos`,
      notes: pass
        ? `Rango (${low} - ${high}) cubre el mínimo requerido de ${minReq} puntos`
        : `Rango (${low} - ${high}) está por debajo del mínimo de ${minReq} puntos`
    };
  }

  // 3. Check pure integer score (e.g. "720" or 720)
  const numericOnly = parseInt(strVal.replace(/[^0-9]/g, ''), 10);
  if (!isNaN(numericOnly) && numericOnly > 0) {
    const pass = numericOnly >= minReq;
    return {
      status: pass ? 'pass' : 'fail',
      clientDisplay: `${numericOnly} puntos`,
      requirementDisplay: `Mínimo ${minReq} puntos`,
      notes: pass
        ? `Puntaje de ${numericOnly} cumple con el mínimo de ${minReq} puntos`
        : `Puntaje de ${numericOnly} no alcanza el mínimo de ${minReq} puntos`
    };
  }

  return {
    status: 'warning',
    clientDisplay: String(clientValue),
    requirementDisplay: `Mínimo ${minReq} puntos`,
    notes: 'Valor no reconocido para buró'
  };
}

// Government Sales Hierarchy mapping
export const GOV_SALES_HIERARCHY: Record<string, number> = {
  '0': 0,
  '0%': 0,
  '0 %': 0,
  'ninguno': 0,
  'ninguna': 0,
  'sin ventas': 0,
  '0-10': 1,
  '0% a 10%': 1,
  'menor-10': 1,
  'menor a 10%': 1,
  'hasta 10%': 1,
  '11-20': 2,
  '11% a 20%': 2,
  'menor-20': 2,
  'menor a 20%': 2,
  'hasta 20%': 2,
  '21-40': 3,
  '21% al 40%': 3,
  '21-40%': 3,
  'menor-40': 3,
  'menor a 40%': 3,
  'hasta 40%': 3,
  'menor-50': 4,
  'menor a 50%': 4,
  'hasta 50%': 4,
  'menor-60': 5,
  'menor a 60%': 5,
  'hasta 60%': 5,
  'arriba-40': 6,
  'arriba del 40%': 6,
  'mas-40': 6,
  'mas de 40%': 6,
  'arriba-60': 6,
};

export const GOV_SALES_DISPLAY: Record<string, string> = {
  '0': '0%',
  '0%': '0%',
  'menor-10': 'Menor a 10%',
  '0-10': '0% a 10%',
  '11-20': '11% a 20%',
  'menor-20': 'Menor a 20%',
  '21-40': '21% a 40%',
  'menor-40': 'Menor a 40%',
  'menor-50': 'Menor a 50%',
  'menor-60': 'Menor a 60%',
  'arriba-40': 'Arriba del 40%',
};

/**
 * Formats the government sales threshold label cleanly without redundancy.
 * E.g., for "menor-20" -> "Menor a 20%" (NOT "Máximo Menor a 20%").
 */
export function formatGovThresholdRequirement(maxThreshold: string): string {
  const clean = (maxThreshold || '').toLowerCase().trim();
  const label = GOV_SALES_DISPLAY[clean] || GOV_SALES_DISPLAY[maxThreshold] || maxThreshold;
  
  if (/^menor\s/i.test(label) || /^hasta\s/i.test(label)) {
    return label;
  }
  if (label === '0%' || label === '0') {
    return '0% (Sin ventas a gobierno)';
  }
  return `Máximo ${label}`;
}

/**
 * Evaluates client's government sales participation against financiera's max threshold.
 */
export function evaluateGovSales(
  clientValue: any,
  maxThreshold: string
): EvaluationResult {
  const reqDisplay = formatGovThresholdRequirement(maxThreshold);

  if (clientValue === null || clientValue === undefined || clientValue === '' || clientValue === 'N/A') {
    return {
      status: 'warning',
      clientDisplay: 'No proporcionado',
      requirementDisplay: reqDisplay,
      notes: 'Participación en ventas gobierno no especificada'
    };
  }

  const strVal = String(clientValue).toLowerCase().trim();
  const threshClean = (maxThreshold || '').toLowerCase().trim();

  const maxAllowedLevel = GOV_SALES_HIERARCHY[threshClean] ?? 999;
  const clientLevel = GOV_SALES_HIERARCHY[strVal] ?? 999;

  const clientDisplay = GOV_SALES_DISPLAY[strVal] || (strVal === '0' ? '0%' : String(clientValue));

  if (clientLevel === 999) {
    return {
      status: 'warning',
      clientDisplay,
      requirementDisplay: reqDisplay,
      notes: 'Valor de ventas a gobierno no estándar'
    };
  }

  const pass = clientLevel <= maxAllowedLevel;
  return {
    status: pass ? 'pass' : 'fail',
    clientDisplay,
    requirementDisplay: reqDisplay,
    notes: pass
      ? `Participación de ${clientDisplay} está dentro del límite permitido (${reqDisplay})`
      : `Participación de ${clientDisplay} excede el límite permitido (${reqDisplay})`
  };
}
