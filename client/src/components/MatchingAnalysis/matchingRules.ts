// Core Matching & Rule Evaluation Engine for CreditoNegocios
// Single source of truth for ALL field evaluations, Buró score matching, government sales participation,
// financial thresholds, guarantees, and requirements across all 4 client profiles.

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

export interface ComparisonField {
  fieldName: string;
  label: string;
  requirementValue: string;
  clientValue: string;
  status: 'pass' | 'warning' | 'fail' | 'info';
  notes?: string;
}

export interface ComprehensiveMatchResult {
  fields: ComparisonField[];
  score: number;
  totalChecks: number;
  passedChecks: number;
  warningChecks: number;
  failedChecks: number;
  infoChecks: number;
  category: 'recommended' | 'compatible' | 'other';
  reasons: string[];
  warnings: string[];
}

// ── Buró de Crédito Maps ──────────────────────────────────────────────
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

// ── Profile Acceptance Evaluation ───────────────────────────────────
export function evaluateProfileType(
  clientType: string,
  acceptedProfiles?: string[]
): EvaluationResult {
  const profileLabels: Record<string, string> = {
    'persona_moral': 'Persona Moral',
    'fisica_empresarial': 'PFAE',
    'fisica': 'Persona Física',
    'sin_sat': 'Sin SAT'
  };

  const clientLabel = profileLabels[clientType] || clientType || 'No especificado';

  if (!acceptedProfiles || acceptedProfiles.length === 0) {
    return {
      status: 'pass',
      clientDisplay: clientLabel,
      requirementDisplay: 'Todos los perfiles admitidos',
      notes: 'La institución acepta cualquier perfil de cliente'
    };
  }

  const reqDisplay = acceptedProfiles.map(p => profileLabels[p] || p).join(', ');
  const pass = acceptedProfiles.includes(clientType);

  return {
    status: pass ? 'pass' : 'fail',
    clientDisplay: clientLabel,
    requirementDisplay: reqDisplay,
    notes: pass
      ? `Perfil '${clientLabel}' admitido por la institución`
      : `Perfil '${clientLabel}' no admitido (requiere: ${reqDisplay})`
  };
}

// ── Amount Evaluation ───────────────────────────────────────────────
export function evaluateMonto(
  requestedAmount: any,
  montoRange?: { min?: number | string; max?: number | string }
): EvaluationResult {
  const amount = typeof requestedAmount === 'string'
    ? parseFloat(requestedAmount.replace(/[^0-9.-]/g, ''))
    : Number(requestedAmount || 0);

  const min = montoRange?.min !== undefined && montoRange?.min !== '' ? Number(montoRange.min) : 0;
  const max = montoRange?.max !== undefined && montoRange?.max !== '' ? Number(montoRange.max) : Infinity;

  let reqDisplay = '';
  if (min > 0 && max < Infinity) reqDisplay = `$${min.toLocaleString('es-MX')} - $${max.toLocaleString('es-MX')}`;
  else if (min > 0) reqDisplay = `Mínimo $${min.toLocaleString('es-MX')}`;
  else if (max < Infinity) reqDisplay = `Máximo $${max.toLocaleString('es-MX')}`;
  else reqDisplay = 'Sin límite';

  if (isNaN(amount) || amount <= 0) {
    return {
      status: 'warning',
      clientDisplay: 'No especificado',
      requirementDisplay: reqDisplay,
      notes: 'Monto solicitado no especificado'
    };
  }

  const clientDisplay = `$${Math.round(amount).toLocaleString('es-MX')}`;
  const pass = amount >= min && amount <= max;

  return {
    status: pass ? 'pass' : 'fail',
    clientDisplay,
    requirementDisplay: reqDisplay,
    notes: pass
      ? `Monto solicitado (${clientDisplay}) dentro del rango permitido`
      : `Monto solicitado (${clientDisplay}) fuera del rango permitido (${reqDisplay})`
  };
}

// ── Buró Score Evaluation ───────────────────────────────────────────
export function evaluateBuroScore(
  fieldKey: string,
  clientValue: any,
  minReq: number
): EvaluationResult {
  if (clientValue === null || clientValue === undefined || clientValue === '' || clientValue === 'N/A') {
    return {
      status: 'warning',
      clientDisplay: 'No proporcionado',
      requirementDisplay: `Mínimo ${minReq} puntos`,
      notes: 'Dato de buró no proporcionado por el cliente'
    };
  }

  const strVal = String(clientValue).trim().toLowerCase();
  const isEmpresa = fieldKey === 'buroEmpresa';
  const map = isEmpresa ? BURO_EMPRESA_MAP : BURO_PF_MAP;

  // 1. Check exact key match in range maps
  if (map[strVal]) {
    const range = map[strVal];
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

// ── Buró Sin SAT Evaluation ─────────────────────────────────────────
export function evaluateBuroSinSat(
  clientValue: any,
  requirement: any
): EvaluationResult {
  const reqStr = typeof requirement === 'object' && requirement !== null
    ? (requirement.required ?? 'si')
    : (requirement ?? 'si');

  const reqIsRequired = reqStr === 'si' || reqStr === true || reqStr === 'true';
  const reqDisplay = reqIsRequired ? 'Requiere historial de buró' : 'Sin buró requerido';

  if (clientValue === null || clientValue === undefined || clientValue === '' || clientValue === 'N/A') {
    return {
      status: 'warning',
      clientDisplay: 'No proporcionado',
      requirementDisplay: reqDisplay,
      notes: 'Historial buró sin SAT no especificado'
    };
  }

  const strVal = String(clientValue).trim().toLowerCase();
  const clientHasBuro = strVal === 'si' || strVal === 'true' || strVal === '1';
  const clientDisplay = clientHasBuro ? 'Sí tiene buró' : 'No tiene buró';

  if (reqIsRequired) {
    const pass = clientHasBuro;
    return {
      status: pass ? 'pass' : 'fail',
      clientDisplay,
      requirementDisplay: reqDisplay,
      notes: pass
        ? 'Cliente cuenta con historial de buró requerido'
        : 'Cliente no cuenta con historial de buró requerido'
    };
  }

  return {
    status: 'pass',
    clientDisplay,
    requirementDisplay: reqDisplay,
    notes: 'No se requiere historial de buró obligatorio'
  };
}

// ── Income & Expense Fields Evaluation ──────────────────────────────
export function evaluateIncomeExpense(
  fieldKey: string,
  clientValue: any,
  range?: { min?: number | string; max?: number | string }
): EvaluationResult {
  const minReq = range?.min !== undefined && range?.min !== '' ? Number(range.min) : undefined;
  const maxReq = range?.max !== undefined && range?.max !== '' ? Number(range.max) : undefined;

  let reqDisplay = 'Configurado';
  if (minReq !== undefined && maxReq !== undefined) {
    reqDisplay = `$${minReq.toLocaleString('es-MX')} - $${maxReq.toLocaleString('es-MX')}`;
  } else if (minReq !== undefined) {
    reqDisplay = `Mínimo $${minReq.toLocaleString('es-MX')}`;
  } else if (maxReq !== undefined) {
    reqDisplay = `Máximo $${maxReq.toLocaleString('es-MX')}`;
  }

  if (clientValue === null || clientValue === undefined || clientValue === '' || clientValue === 'N/A') {
    return {
      status: 'warning',
      clientDisplay: 'No proporcionado',
      requirementDisplay: reqDisplay,
      notes: 'Monto financiero no especificado'
    };
  }

  const numValue = parseFloat(String(clientValue).replace(/[^0-9.-]/g, ''));
  if (isNaN(numValue)) {
    return {
      status: 'warning',
      clientDisplay: String(clientValue),
      requirementDisplay: reqDisplay,
      notes: 'Formato numérico no válido'
    };
  }

  const clientDisplay = `$${Math.round(numValue).toLocaleString('es-MX')}`;
  const meetsMin = minReq === undefined || numValue >= minReq;
  const meetsMax = maxReq === undefined || numValue <= maxReq;
  const pass = meetsMin && meetsMax;

  return {
    status: pass ? 'pass' : 'fail',
    clientDisplay,
    requirementDisplay: reqDisplay,
    notes: pass
      ? `${clientDisplay} dentro del parámetro requerido`
      : `${clientDisplay} fuera del parámetro requerido (${reqDisplay})`
  };
}

// ── Tenure Evaluation (Laboral / Actividad) ─────────────────────────
export function evaluateTenure(
  fieldKey: string,
  clientValue: any,
  range?: { min?: number | string; max?: number | string }
): EvaluationResult {
  const min = range?.min !== undefined && range?.min !== '' ? Number(range.min) : undefined;
  const max = range?.max !== undefined && range?.max !== '' ? Number(range.max) : undefined;

  let reqDisplay = '';
  if (min !== undefined && max !== undefined) reqDisplay = `${min} - ${max} meses`;
  else if (min !== undefined) reqDisplay = `Mínimo ${min} meses`;
  else if (max !== undefined) reqDisplay = `Máximo ${max} meses`;
  else reqDisplay = 'No configurado';

  if (clientValue === null || clientValue === undefined || clientValue === '' || clientValue === 'N/A') {
    return {
      status: 'warning',
      clientDisplay: 'No proporcionado',
      requirementDisplay: reqDisplay,
      notes: 'Antigüedad no especificada'
    };
  }

  const strVal = String(clientValue).toLowerCase().trim();
  const tenureYearMap: Record<string, { minMonths: number; maxMonths: number; label: string }> = {
    'menos-1': { minMonths: 0, maxMonths: 11, label: '< 1 año' },
    '1-2': { minMonths: 12, maxMonths: 24, label: '1 a 2 años' },
    '2-5': { minMonths: 24, maxMonths: 60, label: '2 a 5 años' },
    '5-10': { minMonths: 60, maxMonths: 120, label: '5 a 10 años' },
    'mas-10': { minMonths: 120, maxMonths: 9999, label: '> 10 años' },
  };

  if (tenureYearMap[strVal]) {
    const mapping = tenureYearMap[strVal];
    const meetsMin = min === undefined || mapping.maxMonths >= min;
    const meetsMax = max === undefined || mapping.minMonths <= max;
    const pass = meetsMin && meetsMax;
    return {
      status: pass ? 'pass' : 'fail',
      clientDisplay: mapping.label,
      requirementDisplay: reqDisplay,
      notes: pass
        ? `Antigüedad (${mapping.label}) cumple el requisito de ${reqDisplay}`
        : `Antigüedad (${mapping.label}) no cumple el requisito de ${reqDisplay}`
    };
  }

  // Handle explicit text with "años"
  const anioMatch = strVal.match(/(\d+(?:\.\d+)?)\s*a[ñn]o/i);
  if (anioMatch) {
    const years = parseFloat(anioMatch[1]);
    const months = Math.round(years * 12);
    const meetsMin = min === undefined || months >= min;
    const meetsMax = max === undefined || months <= max;
    const pass = meetsMin && meetsMax;
    return {
      status: pass ? 'pass' : 'fail',
      clientDisplay: `${years} años (${months} meses)`,
      requirementDisplay: reqDisplay,
      notes: pass ? 'Antigüedad cumple requisito' : 'Antigüedad fuera de rango'
    };
  }

  // Handle number directly (months)
  const numValue = parseInt(strVal.replace(/[^0-9]/g, ''), 10);
  if (!isNaN(numValue) && numValue > 0) {
    const meetsMin = min === undefined || numValue >= min;
    const meetsMax = max === undefined || numValue <= max;
    const pass = meetsMin && meetsMax;
    return {
      status: pass ? 'pass' : 'fail',
      clientDisplay: `${numValue} meses`,
      requirementDisplay: reqDisplay,
      notes: pass ? 'Antigüedad cumple requisito' : 'Antigüedad fuera de rango'
    };
  }

  return {
    status: 'warning',
    clientDisplay: String(clientValue),
    requirementDisplay: reqDisplay,
    notes: 'Formato de antigüedad no reconocido'
  };
}

// ── Age Evaluation ──────────────────────────────────────────────────
export function evaluateAge(
  clientValue: any,
  range?: { min?: number | string; max?: number | string }
): EvaluationResult {
  const min = range?.min !== undefined && range?.min !== '' ? Number(range.min) : undefined;
  const max = range?.max !== undefined && range?.max !== '' ? Number(range.max) : undefined;

  let reqDisplay = '';
  if (min !== undefined && max !== undefined) reqDisplay = `${min} - ${max} años`;
  else if (min !== undefined) reqDisplay = `Mínimo ${min} años`;
  else if (max !== undefined) reqDisplay = `Máximo ${max} años`;
  else reqDisplay = 'No configurado';

  if (clientValue === null || clientValue === undefined || clientValue === '' || clientValue === 'N/A') {
    return {
      status: 'warning',
      clientDisplay: 'No proporcionado',
      requirementDisplay: reqDisplay,
      notes: 'Edad del cliente no especificada'
    };
  }

  const numValue = parseInt(String(clientValue).replace(/[^0-9]/g, ''), 10);
  if (isNaN(numValue) || numValue <= 0) {
    return {
      status: 'warning',
      clientDisplay: String(clientValue),
      requirementDisplay: reqDisplay,
      notes: 'Valor de edad inválido'
    };
  }

  const clientDisplay = `${numValue} años`;
  const meetsMin = min === undefined || numValue >= min;
  const meetsMax = max === undefined || numValue <= max;
  const pass = meetsMin && meetsMax;

  return {
    status: pass ? 'pass' : 'fail',
    clientDisplay,
    requirementDisplay: reqDisplay,
    notes: pass
      ? `Edad (${clientDisplay}) dentro del rango permitido`
      : `Edad (${clientDisplay}) fuera del rango permitido (${reqDisplay})`
  };
}

// ── Government Sales Hierarchy & Evaluation ─────────────────────────
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
  let clientLevel = GOV_SALES_HIERARCHY[strVal] ?? 999;

  if (clientLevel === 999) {
    const pct = parseFloat(strVal.replace(/[^0-9.]/g, ''));
    if (!isNaN(pct)) {
      if (pct === 0) clientLevel = 0;
      else if (pct <= 10) clientLevel = 1;
      else if (pct <= 20) clientLevel = 2;
      else if (pct <= 40) clientLevel = 3;
      else if (pct <= 50) clientLevel = 4;
      else if (pct <= 60) clientLevel = 5;
      else clientLevel = 6;
    }
  }

  const clientDisplay = GOV_SALES_DISPLAY[strVal] || (strVal === '0' ? '0%' : (strVal.includes('%') ? strVal : `${strVal}%`));

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

// ── Opinión de Cumplimiento Evaluation ──────────────────────────────
export function evaluateOpinionCumplimiento(
  clientValue: any,
  config?: { acceptanceMode?: string } | string
): EvaluationResult {
  const mode = typeof config === 'object' && config !== null
    ? config.acceptanceMode
    : config;

  const acceptanceMode = mode || 'solo-positiva';
  const reqDisplay = acceptanceMode === 'solo-positiva' ? 'Solo positiva' : 'Positiva o negativa';

  if (clientValue === null || clientValue === undefined || clientValue === '' || clientValue === 'N/A') {
    return {
      status: 'warning',
      clientDisplay: 'No proporcionado',
      requirementDisplay: reqDisplay,
      notes: 'Opinión de cumplimiento SAT no proporcionada'
    };
  }

  const strVal = String(clientValue).toLowerCase().trim();
  const isPositiva = strVal === 'positiva' || strVal === 'positiva (32-d)';
  const clientDisplay = isPositiva ? 'Positiva' : 'Negativa';

  if (acceptanceMode === 'solo-positiva') {
    const pass = isPositiva;
    return {
      status: pass ? 'pass' : 'fail',
      clientDisplay,
      requirementDisplay: reqDisplay,
      notes: pass ? 'Opinión de cumplimiento positiva requerida' : 'La institución requiere opinión positiva'
    };
  }

  return {
    status: 'pass',
    clientDisplay,
    requirementDisplay: reqDisplay,
    notes: 'Opinión de cumplimiento aceptable'
  };
}

// ── Guarantees & Multipliers Evaluation ─────────────────────────────
export function evaluateGarantia(
  fieldKey: string,
  clientValue: any,
  range?: { guaranteeMultipliers?: Record<string, string> }
): EvaluationResult {
  const multipliers = range?.guaranteeMultipliers || {};
  const acceptedEntries = Object.entries(multipliers).filter(([_, m]) => Boolean(m));

  const reqDisplay = acceptedEntries.length > 0
    ? acceptedEntries.map(([k, m]) => `${k.replace(/-/g, ' ')} (${m})`).join(', ')
    : 'No configurado';

  if (clientValue === null || clientValue === undefined || clientValue === '' || clientValue === 'N/A') {
    return {
      status: 'warning',
      clientDisplay: 'No proporcionado',
      requirementDisplay: reqDisplay,
      notes: 'Tipo de garantía no especificado'
    };
  }

  let rawVal = clientValue;
  if (typeof clientValue === 'object' && clientValue !== null) {
    if (Array.isArray(clientValue)) {
      rawVal = clientValue.length > 0 ? (clientValue[0]?.tipo || clientValue[0]?.type || 'sin-garantia') : 'sin-garantia';
    } else {
      rawVal = clientValue.tipo || clientValue.type || clientValue.garantia || clientValue.value || '';
    }
  }

  let cleanVal = String(rawVal).toLowerCase().trim();
  if (cleanVal.startsWith('{') && cleanVal.endsWith('}')) {
    try {
      const parsed = JSON.parse(cleanVal);
      cleanVal = String(parsed.tipo || parsed.type || parsed.garantia || cleanVal).toLowerCase().trim();
    } catch {
      // keep cleanVal
    }
  }

  if (cleanVal === 'sin-garantia' || cleanVal === 'no' || cleanVal === 'ninguna') {
    // If multipliers are configured for specific guarantees, sin-garantia fails
    if (acceptedEntries.length > 0) {
      return {
        status: 'fail',
        clientDisplay: 'Sin garantía',
        requirementDisplay: reqDisplay,
        notes: 'La institución requiere garantía con respaldo'
      };
    }
    return {
      status: 'pass',
      clientDisplay: 'Sin garantía',
      requirementDisplay: reqDisplay,
      notes: 'No se requiere garantía obligatoria'
    };
  }

  const multiplier = multipliers[cleanVal];
  const clientDisplay = `${cleanVal.replace(/-/g, ' ')}${multiplier ? ` (${multiplier})` : ''}`;

  if (multiplier) {
    return {
      status: 'pass',
      clientDisplay,
      requirementDisplay: reqDisplay,
      notes: `Garantía aceptada con factor ${multiplier}`
    };
  }

  return {
    status: 'fail',
    clientDisplay,
    requirementDisplay: reqDisplay,
    notes: 'Tipo de garantía no admitido para este producto'
  };
}

// ── Ingreso Anual Evaluation ────────────────────────────────────────
export const INGRESO_ANUAL_HIERARCHY: Record<string, number> = {
  'menor-100000': 0,
  '100000-250000': 1,
  '250000-500000': 2,
  '500000-1000000': 3,
  '1000000-2500000': 4,
  '2500000-5000000': 5,
  'arriba-5000000': 6
};

export const INGRESO_ANUAL_LABELS: Record<string, string> = {
  'menor-100000': 'Menor a $100,000',
  '100000-250000': '$100,000 - $250,000',
  '250000-500000': '$250,000 - $500,000',
  '500000-1000000': '$500,000 - $1,000,000',
  '1000000-2500000': '$1,000,000 - $2,500,000',
  '2500000-5000000': '$2,500,000 - $5,000,000',
  'arriba-5000000': 'Arriba de $5,000,000'
};

export function evaluateIngresoAnual(
  clientValue: any,
  range?: { min?: string; max?: string }
): EvaluationResult {
  const minOption = range?.min;
  const maxOption = range?.max;

  let reqDisplay = '';
  if (minOption && maxOption) {
    reqDisplay = `Entre ${INGRESO_ANUAL_LABELS[minOption] || minOption} y ${INGRESO_ANUAL_LABELS[maxOption] || maxOption}`;
  } else if (minOption) {
    reqDisplay = `Mínimo ${INGRESO_ANUAL_LABELS[minOption] || minOption}`;
  } else if (maxOption) {
    reqDisplay = `Máximo ${INGRESO_ANUAL_LABELS[maxOption] || maxOption}`;
  } else {
    reqDisplay = 'Cualquiera';
  }

  if (clientValue === null || clientValue === undefined || clientValue === '' || clientValue === 'N/A') {
    return {
      status: 'warning',
      clientDisplay: 'No proporcionado',
      requirementDisplay: reqDisplay,
      notes: 'Rango de ingreso anual no especificado'
    };
  }

  const strVal = String(clientValue).toLowerCase().trim();
  let clientLevel = INGRESO_ANUAL_HIERARCHY[strVal] ?? -1;

  // Numeric fallback (e.g. 1200000 or "$1,200,000")
  if (clientLevel === -1) {
    const num = parseFloat(strVal.replace(/[^0-9.-]/g, ''));
    if (!isNaN(num) && num >= 0) {
      if (num < 100000) clientLevel = 0;
      else if (num <= 250000) clientLevel = 1;
      else if (num <= 500000) clientLevel = 2;
      else if (num <= 1000000) clientLevel = 3;
      else if (num <= 2500000) clientLevel = 4;
      else if (num <= 5000000) clientLevel = 5;
      else clientLevel = 6;
    }
  }

  const minLevel = minOption ? (INGRESO_ANUAL_HIERARCHY[minOption] ?? -1) : -1;
  const maxLevel = maxOption ? (INGRESO_ANUAL_HIERARCHY[maxOption] ?? 999) : 999;

  let clientDisplay = INGRESO_ANUAL_LABELS[strVal];
  if (!clientDisplay) {
    const num = parseFloat(strVal.replace(/[^0-9.-]/g, ''));
    if (!isNaN(num) && num >= 0) {
      clientDisplay = `$${Math.round(num).toLocaleString('es-MX')} anual`;
    } else {
      clientDisplay = clientValue;
    }
  }

  if (clientLevel === -1) {
    return {
      status: 'warning',
      clientDisplay,
      requirementDisplay: reqDisplay,
      notes: 'Valor no catalogado'
    };
  }

  const pass = clientLevel >= minLevel && clientLevel <= maxLevel;
  return {
    status: pass ? 'pass' : 'fail',
    clientDisplay,
    requirementDisplay: reqDisplay,
    notes: pass
      ? 'Ingreso anual dentro del rango aceptado'
      : `Ingreso anual (${clientDisplay}) fuera del rango aceptado (${reqDisplay})`
  };
}

// ── Ventas con Terminal Bancaria Evaluation ─────────────────────────
export const VENTAS_TERMINAL_HIERARCHY: Record<string, number> = {
  'no': 0,
  'hasta-15000': 1,
  '15000-30000': 2,
  '30000-50000': 3,
  'hasta-50000': 3,
  '50000-100000': 4,
  '50000-150000': 5,
  'mayores-100000': 5,
  'mayores-150000': 6,
};

export const VENTAS_TERMINAL_LABELS: Record<string, string> = {
  'no': 'No tiene terminal',
  'hasta-15000': 'Hasta $15,000',
  '15000-30000': '$15,000 - $30,000',
  '30000-50000': '$30,000 - $50,000',
  'hasta-50000': 'Hasta $50,000',
  '50000-100000': '$50,000 - $100,000',
  '50000-150000': '$50,000 - $150,000',
  'mayores-100000': 'Mayores a $100,000',
  'mayores-150000': 'Mayores a $150,000',
};

export function evaluateTerminalVentas(
  clientValue: any,
  requirement: any
): EvaluationResult {
  const reqMin = typeof requirement === 'object' && requirement !== null
    ? (requirement.min ?? requirement.required ?? 'no')
    : (requirement ?? 'no');

  const reqMinLevel = VENTAS_TERMINAL_HIERARCHY[String(reqMin).toLowerCase().trim()] ?? 0;
  const reqDisplay = `Mínimo ${VENTAS_TERMINAL_LABELS[reqMin] || reqMin || 'Requerido'}`;

  if (clientValue === null || clientValue === undefined || clientValue === '' || clientValue === 'N/A') {
    return {
      status: 'warning',
      clientDisplay: 'No proporcionado',
      requirementDisplay: reqDisplay,
      notes: 'Ventas con terminal no especificadas'
    };
  }

  const strVal = String(clientValue).toLowerCase().trim();
  let clientLevel = VENTAS_TERMINAL_HIERARCHY[strVal] ?? -1;

  if (clientLevel === -1) {
    const num = parseFloat(strVal.replace(/[^0-9.-]/g, ''));
    if (!isNaN(num) && num >= 0) {
      if (num === 0) clientLevel = 0;
      else if (num <= 15000) clientLevel = 1;
      else if (num <= 30000) clientLevel = 2;
      else if (num <= 50000) clientLevel = 3;
      else if (num <= 100000) clientLevel = 4;
      else if (num <= 150000) clientLevel = 5;
      else clientLevel = 6;
    } else {
      clientLevel = 0;
    }
  }

  let clientDisplay = VENTAS_TERMINAL_LABELS[strVal];
  if (!clientDisplay) {
    const num = parseFloat(strVal.replace(/[^0-9.-]/g, ''));
    if (!isNaN(num) && num > 0) {
      clientDisplay = `$${Math.round(num).toLocaleString('es-MX')} / mes`;
    } else {
      clientDisplay = clientValue;
    }
  }

  const pass = clientLevel >= reqMinLevel;

  return {
    status: pass ? 'pass' : 'fail',
    clientDisplay,
    requirementDisplay: reqDisplay,
    notes: pass
      ? `Ventas con terminal (${clientDisplay}) cumplen con el mínimo requerido`
      : `Ventas con terminal (${clientDisplay}) no alcanzan el mínimo (${reqDisplay})`
  };
}

// ── Atrasos y Deudas en Buró Evaluation ─────────────────────────────
export function evaluateAtrasos(
  fieldKey: string,
  clientValue: any,
  reqData: any
): EvaluationResult {
  const hasMaxAmount = reqData?.max !== undefined && reqData?.max !== '' && reqData?.max !== null;
  const maxAllowedAmount = hasMaxAmount ? Number(reqData.max) : undefined;

  let reqDisplay = 'Configurado';
  if (hasMaxAmount) {
    reqDisplay = `Máximo $${maxAllowedAmount?.toLocaleString('es-MX')} en atrasos`;
  } else if (typeof reqData === 'string') {
    reqDisplay = reqData === 'no' ? 'Sin atrasos permitidos' : 'Con atrasos permitidos';
  } else if (typeof reqData === 'object' && reqData?.required) {
    reqDisplay = reqData.required === 'no' ? 'Sin atrasos permitidos' : 'Con atrasos permitidos';
  }

  if (clientValue === null || clientValue === undefined || clientValue === '' || clientValue === 'N/A') {
    return {
      status: 'warning',
      clientDisplay: 'No proporcionado',
      requirementDisplay: reqDisplay,
      notes: 'Historial de atrasos no especificado'
    };
  }

  const strVal = String(clientValue).toLowerCase().trim();

  // Client says NO atrasos -> always passes!
  if (strVal === 'no' || strVal === '0' || strVal === 'false' || strVal === 'sin atrasos') {
    return {
      status: 'pass',
      clientDisplay: 'Sin atrasos',
      requirementDisplay: reqDisplay,
      notes: 'Cliente no presenta atrasos en buró'
    };
  }

  // Client says SI atrasos
  if (strVal === 'si' || strVal === 'true') {
    if (hasMaxAmount) {
      return {
        status: 'warning',
        clientDisplay: `Tiene atrasos (verificar límite de $${maxAllowedAmount?.toLocaleString('es-MX')})`,
        requirementDisplay: reqDisplay,
        notes: 'Requiere verificar que el monto no exceda el límite establecido'
      };
    }
    const noAllowed = typeof reqData === 'string'
      ? reqData === 'no'
      : reqData?.required === 'no';

    const pass = !noAllowed;
    return {
      status: pass ? 'pass' : 'fail',
      clientDisplay: 'Tiene atrasos',
      requirementDisplay: reqDisplay,
      notes: pass ? 'Atrasos permitidos por política' : 'La institución no acepta clientes con atrasos'
    };
  }

  // Numeric amount
  const numValue = parseFloat(strVal.replace(/[^0-9.-]/g, ''));
  if (!isNaN(numValue)) {
    const clientDisplay = `$${Math.round(numValue).toLocaleString('es-MX')} en atrasos`;
    if (hasMaxAmount) {
      const pass = numValue <= (maxAllowedAmount ?? 0);
      return {
        status: pass ? 'pass' : 'fail',
        clientDisplay,
        requirementDisplay: reqDisplay,
        notes: pass
          ? 'Monto de atrasos dentro del límite tolerado'
          : `Atrasos (${clientDisplay}) exceden el máximo tolerado (${reqDisplay})`
      };
    }
    const noAllowed = typeof reqData === 'string'
      ? reqData === 'no'
      : reqData?.required === 'no';
    const pass = !noAllowed || numValue === 0;
    return {
      status: pass ? 'pass' : 'fail',
      clientDisplay,
      requirementDisplay: reqDisplay,
      notes: pass ? 'Atrasos tolerados' : 'No se permiten atrasos'
    };
  }

  return {
    status: 'warning',
    clientDisplay: String(clientValue),
    requirementDisplay: reqDisplay,
    notes: 'Valor no catalogado'
  };
}

// ── Aval u Obligado Solidario Evaluation ────────────────────────────
export function evaluateAval(
  fieldKey: string,
  clientValue: any,
  requirement: any
): EvaluationResult {
  const reqStr = typeof requirement === 'object' && requirement !== null
    ? (requirement.required ?? 'si')
    : (requirement ?? 'si');

  const reqIsRequired = reqStr === 'si' || reqStr === true || reqStr === 'true';
  const reqDisplay = reqIsRequired ? 'Requiere aval u obligado' : 'No requiere aval';

  if (clientValue === null || clientValue === undefined || clientValue === '' || clientValue === 'N/A') {
    return {
      status: 'warning',
      clientDisplay: 'No proporcionado',
      requirementDisplay: reqDisplay,
      notes: 'Disponibilidad de aval no especificada'
    };
  }

  const strVal = String(clientValue).toLowerCase().trim();
  const clientHasAval = strVal === 'si' || strVal === 'true' || strVal === '1';
  const clientDisplay = clientHasAval ? 'Sí cuenta con aval' : 'No cuenta con aval';

  if (reqIsRequired) {
    const pass = clientHasAval;
    return {
      status: pass ? 'pass' : 'fail',
      clientDisplay,
      requirementDisplay: reqDisplay,
      notes: pass
        ? 'Cliente cuenta con aval u obligado solidario requerido'
        : 'La institución requiere aval u obligado solidario'
    };
  }

  return {
    status: 'pass',
    clientDisplay,
    requirementDisplay: reqDisplay,
    notes: 'No se requiere aval obligatorio'
  };
}

// ── SAT CIEC Evaluation ─────────────────────────────────────────────
export function evaluateSatCiec(
  clientValue: any,
  requirement: any
): EvaluationResult {
  const reqStr = typeof requirement === 'object' && requirement !== null
    ? (requirement.required ?? 'si')
    : (requirement ?? 'si');

  const reqIsRequired = reqStr === 'si' || reqStr === true || reqStr === 'true';
  const reqDisplay = reqIsRequired ? 'Requiere conexión SAT (CIEC)' : 'No requiere conexión SAT';

  if (clientValue === null || clientValue === undefined || clientValue === '' || clientValue === 'N/A') {
    return {
      status: 'warning',
      clientDisplay: 'No proporcionado',
      requirementDisplay: reqDisplay,
      notes: 'Disposición a conectar SAT CIEC no especificada'
    };
  }

  const strVal = String(clientValue).toLowerCase().trim();
  const clientConnects = strVal === 'si' || strVal === 'true' || strVal === '1';
  const clientDisplay = clientConnects ? 'Sí se conecta al SAT' : 'No se conecta al SAT';

  if (reqIsRequired) {
    const pass = clientConnects;
    return {
      status: pass ? 'pass' : 'fail',
      clientDisplay,
      requirementDisplay: reqDisplay,
      notes: pass
        ? 'Cliente acepta conexión con CIEC para validación'
        : 'La institución requiere conexión mediante CIEC'
    };
  }

  return {
    status: 'pass',
    clientDisplay,
    requirementDisplay: reqDisplay,
    notes: 'Conexión SAT CIEC no requerida'
  };
}

// ── Estados Financieros Evaluation ──────────────────────────────────
export function evaluateEstadosFinancieros(
  clientValue: any,
  requirement: any
): EvaluationResult {
  const reqStr = typeof requirement === 'object' && requirement !== null
    ? (requirement.required ?? 'si')
    : (requirement ?? 'si');

  const reqIsRequired = reqStr === 'si' || reqStr === true || reqStr === 'true';
  const reqDisplay = reqIsRequired ? 'Requiere estados financieros' : 'No requiere estados financieros';

  if (clientValue === null || clientValue === undefined || clientValue === '' || clientValue === 'N/A') {
    return {
      status: 'warning',
      clientDisplay: 'No proporcionado',
      requirementDisplay: reqDisplay,
      notes: 'Entrega de estados financieros no especificada'
    };
  }

  const strVal = String(clientValue).toLowerCase().trim();
  const clientPresents = strVal === 'si' || strVal === 'true' || strVal === '1';
  const clientDisplay = clientPresents ? 'Sí presenta estados financieros' : 'No presenta';

  if (reqIsRequired) {
    const pass = clientPresents;
    return {
      status: pass ? 'pass' : 'fail',
      clientDisplay,
      requirementDisplay: reqDisplay,
      notes: pass
        ? 'Cliente presenta estados financieros requeridos'
        : 'La institución requiere estados financieros firmados'
    };
  }

  return {
    status: 'pass',
    clientDisplay,
    requirementDisplay: reqDisplay,
    notes: 'Estados financieros no requeridos'
  };
}

// ── Créditos Vigentes Evaluation ────────────────────────────────────
export function evaluateCreditosVigentes(
  clientValue: any,
  requirement: any
): EvaluationResult {
  const reqStr = typeof requirement === 'object' && requirement !== null
    ? (requirement.required ?? 'si')
    : (requirement ?? 'si');

  const reqRequiresCredits = reqStr === 'si' || reqStr === true || reqStr === 'true';
  const reqDisplay = reqRequiresCredits ? 'Requiere créditos vigentes' : 'Sin créditos vigentes obligatorios';

  if (clientValue === null || clientValue === undefined || clientValue === '' || clientValue === 'N/A') {
    return {
      status: 'warning',
      clientDisplay: 'No proporcionado',
      requirementDisplay: reqDisplay,
      notes: 'Existencia de créditos vigentes no especificada'
    };
  }

  const strVal = String(clientValue).toLowerCase().trim();
  const clientHasCredits = strVal === 'si' || strVal === 'true' || strVal === '1';
  const clientDisplay = clientHasCredits ? 'Sí tiene créditos vigentes' : 'No tiene créditos vigentes';

  if (reqRequiresCredits) {
    const pass = clientHasCredits;
    return {
      status: pass ? 'pass' : 'fail',
      clientDisplay,
      requirementDisplay: reqDisplay,
      notes: pass
        ? 'Cliente cuenta con créditos vigentes para comprobar experiencia'
        : 'La institución requiere contar con historial de créditos activos'
    };
  }

  // If required: 'no', client must not have active credits
  if (reqStr === 'no' || reqStr === false || reqStr === 'false') {
    const pass = !clientHasCredits;
    return {
      status: pass ? 'pass' : 'fail',
      clientDisplay,
      requirementDisplay: 'No debe tener créditos vigentes',
      notes: pass
        ? 'Cliente libre de créditos vigentes'
        : 'La institución requiere no tener créditos activos'
    };
  }

  return {
    status: 'pass',
    clientDisplay,
    requirementDisplay: reqDisplay,
    notes: 'Condición aceptable'
  };
}

// ── Full Comprehensive Evaluator ────────────────────────────────────
// Runs all rules on a client and institution profile, returning all comparison fields and scoring stats.
export function evaluateAllFieldsForClient(
  client: Record<string, any>,
  institution: {
    id?: string;
    name?: string;
    acceptedProfiles?: string[];
    requirements?: Record<string, any>;
  },
  requestedAmount?: number | string
): ComprehensiveMatchResult {
  const clientType = client.type || 'persona_moral';
  const requirements = institution.requirements?.[clientType] || institution.requirements || {};
  const ranges = requirements.ranges || requirements || {};
  const fields: ComparisonField[] = [];

  const getClientValue = (key: string): any => {
    // 1. Direct match on client or profilingData
    let val = client[key] ?? client.profilingData?.[key];
    if (val !== undefined && val !== null && val !== '') return val;

    // 2. Intelligent cross-field fallbacks based on field category
    switch (key) {
      case 'monto':
      case 'montoSolicitado':
        return requestedAmount ?? client.montoSolicitado ?? client.requestedAmount ?? client.monto ?? client.profilingData?.montoSolicitado;

      case 'buroPersonaFisica':
        return client.buroPersonaFisica ?? client.buroAccionistaPrincipal ?? client.buroPersonaFisicaSinSat ?? client.profilingData?.buroPersonaFisica;

      case 'buroAccionistaPrincipal':
        return client.buroAccionistaPrincipal ?? client.buroPersonaFisica ?? client.profilingData?.buroAccionistaPrincipal;

      case 'buroEmpresa':
        return client.buroEmpresa ?? client.profilingData?.buroEmpresa;

      case 'buroPersonaFisicaSinSat':
        return client.buroPersonaFisicaSinSat ?? client.buroPersonaFisica ?? client.profilingData?.buroPersonaFisicaSinSat;

      case 'ingresoMensualPromedio':
        return client.ingresoMensualPromedio ?? client.ingresoMensualPromedioComprobables ?? client.ingresoMensualPromedioComprobablesSinSat ?? client.profilingData?.ingresoMensualPromedio;

      case 'ingresoMensualPromedioComprobables':
        return client.ingresoMensualPromedioComprobables ?? client.ingresoMensualPromedioComprobablesSinSat ?? client.ingresoMensualPromedio ?? client.profilingData?.ingresoMensualPromedioComprobables;

      case 'ingresoMensualPromedioNoComprobables':
        return client.ingresoMensualPromedioNoComprobables ?? client.ingresoMensualPromedioNoComprobablesSinSat ?? client.profilingData?.ingresoMensualPromedioNoComprobables;

      case 'ingresoMensualPromedioComprobablesSinSat':
        return client.ingresoMensualPromedioComprobablesSinSat ?? client.ingresoMensualPromedioComprobables ?? client.ingresoMensualPromedio ?? client.profilingData?.ingresoMensualPromedioComprobablesSinSat;

      case 'ingresoMensualPromedioNoComprobablesSinSat':
        return client.ingresoMensualPromedioNoComprobablesSinSat ?? client.ingresoMensualPromedioNoComprobables ?? client.profilingData?.ingresoMensualPromedioNoComprobablesSinSat;

      case 'egresoMensualPromedio':
      case 'gastosFijosMensualesPromedio':
      case 'gastosFijosMensualesPromedioSinSat':
        return client.gastosFijosMensualesPromedio ?? client.egresoMensualPromedio ?? client.gastosFijosMensualesPromedioSinSat ?? client.profilingData?.[key];

      case 'antiguedadLaboral':
      case 'tiempoActividad':
        return client.antiguedadLaboral ?? client.tiempoActividad ?? client.antiguedadEmpleo ?? (client.yearsInBusiness ? `${client.yearsInBusiness} años` : undefined) ?? client.profilingData?.[key];

      case 'garantia':
      case 'cuentaConGarantiaFisica':
      case 'cuentaConGarantiaSinSat':
        return client.garantia ?? client.cuentaConGarantiaFisica ?? client.cuentaConGarantiaSinSat ?? client.profilingData?.[key];

      case 'avalObligadoSolidario':
      case 'tieneAvalObligadoSolidarioFisica':
      case 'tieneAvalObligadoSolidarioSinSat':
        return client.avalObligadoSolidario ?? client.tieneAvalObligadoSolidarioFisica ?? client.tieneAvalObligadoSolidarioSinSat ?? client.profilingData?.[key];

      case 'atrasosDeudas':
      case 'atrasosDeudasBuro':
      case 'atrasosDeudasBuroSinSat':
        return client.atrasosDeudas ?? client.atrasosDeudasBuro ?? client.atrasosDeudasBuroSinSat ?? client.profilingData?.[key];

      case 'satCiec':
        return client.satCiec ?? client.profilingData?.satCiec;

      case 'estadosFinancieros':
        return client.estadosFinancieros ?? client.profilingData?.estadosFinancieros;

      case 'opinionCumplimiento':
        return client.opinionCumplimiento ?? client.profilingData?.opinionCumplimiento;

      case 'creditosVigentes':
        return client.creditosVigentes ?? client.profilingData?.creditosVigentes;

      case 'ventasTerminalBancaria':
        return client.ventasTerminalBancaria ?? client.profilingData?.ventasTerminalBancaria;

      case 'participacionVentasGobierno':
        return client.participacionVentasGobierno ?? client.profilingData?.participacionVentasGobierno;

      case 'edadCliente':
        return client.edadCliente ?? client.profilingData?.edadCliente;

      default:
        return client[key] ?? client.profilingData?.[key];
    }
  };

  // Helper label resolver
  const getFieldLabel = (key: string): string => {
    const labels: Record<string, string> = {
      monto: 'Monto Solicitado',
      buroPersonaFisica: 'Buró Persona Física',
      buroAccionistaPrincipal: 'Buró Accionista Principal',
      buroEmpresa: 'Buró Empresa',
      buroPersonaFisicaSinSat: 'Buró Persona Física (Sin SAT)',
      ingresoMensualPromedio: 'Ingreso Mensual',
      ingresoMensualPromedioComprobables: 'Ingreso Mensual Comprobable',
      ingresoMensualPromedioNoComprobables: 'Ingreso Mensual No Comprobable',
      ingresoMensualPromedioComprobablesSinSat: 'Ingreso Mensual Comprobable (Sin SAT)',
      ingresoMensualPromedioNoComprobablesSinSat: 'Ingreso Mensual No Comprobable (Sin SAT)',
      ingresoAnual: 'Ingreso Anual',
      gastosFijosMensualesPromedio: 'Gastos Fijos Mensuales',
      gastosFijosMensualesPromedioSinSat: 'Gastos Fijos Mensuales (Sin SAT)',
      egresoMensualPromedio: 'Egreso Mensual',
      antiguedadLaboral: 'Antigüedad Laboral',
      tiempoActividad: 'Tiempo de Actividad',
      edadCliente: 'Edad del Cliente',
      participacionVentasGobierno: 'Participación Ventas Gobierno',
      opinionCumplimiento: 'Opinión de Cumplimiento',
      garantia: 'Tipo de Garantía',
      cuentaConGarantiaFisica: 'Cuenta con Garantía (PF)',
      cuentaConGarantiaSinSat: 'Cuenta con Garantía (Sin SAT)',
      ventasTerminalBancaria: 'Ventas con Terminal Bancaria',
      atrasosDeudas: 'Atrasos/Deudas en Buró',
      atrasosDeudasBuro: 'Atrasos/Deudas en Buró',
      atrasosDeudasBuroSinSat: 'Atrasos/Deudas en Buró (Sin SAT)',
      avalObligadoSolidario: 'Aval u Obligado Solidario',
      tieneAvalObligadoSolidarioFisica: 'Aval u Obligado Solidario (PF)',
      tieneAvalObligadoSolidarioSinSat: 'Aval u Obligado Solidario (Sin SAT)',
      satCiec: 'Conectarse a SAT (CIEC)',
      estadosFinancieros: 'Estados Financieros',
      creditosVigentes: 'Créditos Vigentes',
    };
    return labels[key] || key;
  };

  // 1. Profile Acceptance
  if (institution.acceptedProfiles && institution.acceptedProfiles.length > 0) {
    const res = evaluateProfileType(clientType, institution.acceptedProfiles);
    fields.push({
      fieldName: 'profileType',
      label: 'Tipo de Perfil Aceptado',
      requirementValue: res.requirementDisplay || '',
      clientValue: res.clientDisplay,
      status: res.status,
      notes: res.notes,
    });
  }

  // 2. Amount Range
  const amountToTest = requestedAmount ?? getClientValue('montoSolicitado');
  if (ranges.monto && (ranges.monto.min !== undefined || ranges.monto.max !== undefined)) {
    const res = evaluateMonto(amountToTest, ranges.monto);
    fields.push({
      fieldName: 'monto',
      label: 'Monto Solicitado',
      requirementValue: res.requirementDisplay || '',
      clientValue: res.clientDisplay,
      status: res.status,
      notes: res.notes,
    });
  }

  // 3. Bureau Scores
  const bureauFields = ['buroPersonaFisica', 'buroAccionistaPrincipal', 'buroEmpresa'];
  bureauFields.forEach(fieldKey => {
    if (ranges[fieldKey]?.min !== undefined) {
      const minReq = Number(ranges[fieldKey].min);
      const clientVal = getClientValue(fieldKey);
      const res = evaluateBuroScore(fieldKey, clientVal, minReq);
      fields.push({
        fieldName: fieldKey,
        label: getFieldLabel(fieldKey),
        requirementValue: res.requirementDisplay || `Mínimo ${minReq} puntos`,
        clientValue: res.clientDisplay,
        status: res.status,
        notes: res.notes,
      });
    }
  });

  // 3b. Buró Sin SAT
  if (ranges.buroPersonaFisicaSinSat !== undefined) {
    const res = evaluateBuroSinSat(getClientValue('buroPersonaFisicaSinSat'), ranges.buroPersonaFisicaSinSat);
    fields.push({
      fieldName: 'buroPersonaFisicaSinSat',
      label: getFieldLabel('buroPersonaFisicaSinSat'),
      requirementValue: res.requirementDisplay || '',
      clientValue: res.clientDisplay,
      status: res.status,
      notes: res.notes,
    });
  }

  // 4. Income & Expense Fields
  const incomeExpenseFields = [
    'ingresoMensualPromedio',
    'ingresoMensualPromedioComprobables',
    'ingresoMensualPromedioNoComprobables',
    'ingresoMensualPromedioComprobablesSinSat',
    'ingresoMensualPromedioNoComprobablesSinSat',
    'gastosFijosMensualesPromedio',
    'gastosFijosMensualesPromedioSinSat',
    'egresoMensualPromedio'
  ];
  incomeExpenseFields.forEach(fieldKey => {
    if (ranges[fieldKey]?.min !== undefined || ranges[fieldKey]?.max !== undefined) {
      const res = evaluateIncomeExpense(fieldKey, getClientValue(fieldKey), ranges[fieldKey]);
      fields.push({
        fieldName: fieldKey,
        label: getFieldLabel(fieldKey),
        requirementValue: res.requirementDisplay || '',
        clientValue: res.clientDisplay,
        status: res.status,
        notes: res.notes,
      });
    }
  });

  // 5. Tenure Fields
  const tenureFields = ['antiguedadLaboral', 'tiempoActividad'];
  tenureFields.forEach(fieldKey => {
    if (ranges[fieldKey]?.min !== undefined || ranges[fieldKey]?.max !== undefined) {
      const res = evaluateTenure(fieldKey, getClientValue(fieldKey), ranges[fieldKey]);
      fields.push({
        fieldName: fieldKey,
        label: getFieldLabel(fieldKey),
        requirementValue: res.requirementDisplay || '',
        clientValue: res.clientDisplay,
        status: res.status,
        notes: res.notes,
      });
    }
  });

  // 6. Age
  if (ranges.edadCliente?.min !== undefined || ranges.edadCliente?.max !== undefined) {
    const res = evaluateAge(getClientValue('edadCliente'), ranges.edadCliente);
    fields.push({
      fieldName: 'edadCliente',
      label: 'Edad del Cliente',
      requirementValue: res.requirementDisplay || '',
      clientValue: res.clientDisplay,
      status: res.status,
      notes: res.notes,
    });
  }

  // 7. Participación Ventas Gobierno
  if (ranges.participacionVentasGobierno?.maxThreshold) {
    const res = evaluateGovSales(getClientValue('participacionVentasGobierno'), ranges.participacionVentasGobierno.maxThreshold);
    fields.push({
      fieldName: 'participacionVentasGobierno',
      label: 'Participación Ventas Gobierno',
      requirementValue: res.requirementDisplay || '',
      clientValue: res.clientDisplay,
      status: res.status,
      notes: res.notes,
    });
  }

  // 8. Opinión de Cumplimiento
  if (ranges.opinionCumplimiento?.acceptanceMode) {
    const res = evaluateOpinionCumplimiento(getClientValue('opinionCumplimiento'), ranges.opinionCumplimiento);
    fields.push({
      fieldName: 'opinionCumplimiento',
      label: 'Opinión de Cumplimiento',
      requirementValue: res.requirementDisplay || '',
      clientValue: res.clientDisplay,
      status: res.status,
      notes: res.notes,
    });
  }

  // 9. Guarantee Multipliers
  const guaranteeFields = ['garantia', 'cuentaConGarantiaFisica', 'cuentaConGarantiaSinSat'];
  guaranteeFields.forEach(fieldKey => {
    if (ranges[fieldKey]?.guaranteeMultipliers) {
      const res = evaluateGarantia(fieldKey, getClientValue(fieldKey), ranges[fieldKey]);
      fields.push({
        fieldName: fieldKey,
        label: getFieldLabel(fieldKey),
        requirementValue: res.requirementDisplay || '',
        clientValue: res.clientDisplay,
        status: res.status,
        notes: res.notes,
      });
    }
  });

  // 10. Ingreso Anual
  if (ranges.ingresoAnual?.min || ranges.ingresoAnual?.max) {
    const res = evaluateIngresoAnual(getClientValue('ingresoAnual'), ranges.ingresoAnual);
    fields.push({
      fieldName: 'ingresoAnual',
      label: 'Ingreso Anual',
      requirementValue: res.requirementDisplay || '',
      clientValue: res.clientDisplay,
      status: res.status,
      notes: res.notes,
    });
  }

  // 11. Ventas Terminal Bancaria
  if (ranges.ventasTerminalBancaria !== undefined) {
    const res = evaluateTerminalVentas(getClientValue('ventasTerminalBancaria'), ranges.ventasTerminalBancaria);
    fields.push({
      fieldName: 'ventasTerminalBancaria',
      label: getFieldLabel('ventasTerminalBancaria'),
      requirementValue: res.requirementDisplay || '',
      clientValue: res.clientDisplay,
      status: res.status,
      notes: res.notes,
    });
  }

  // 12. Atrasos / Deudas en Buró
  const atrasosFields = ['atrasosDeudas', 'atrasosDeudasBuro', 'atrasosDeudasBuroSinSat'];
  atrasosFields.forEach(fieldKey => {
    if (ranges[fieldKey] !== undefined) {
      const res = evaluateAtrasos(fieldKey, getClientValue(fieldKey), ranges[fieldKey]);
      fields.push({
        fieldName: fieldKey,
        label: getFieldLabel(fieldKey),
        requirementValue: res.requirementDisplay || '',
        clientValue: res.clientDisplay,
        status: res.status,
        notes: res.notes,
      });
    }
  });

  // 13. Aval u Obligado Solidario
  const avalFields = ['avalObligadoSolidario', 'tieneAvalObligadoSolidarioFisica', 'tieneAvalObligadoSolidarioSinSat'];
  avalFields.forEach(fieldKey => {
    if (ranges[fieldKey] !== undefined) {
      const res = evaluateAval(fieldKey, getClientValue(fieldKey), ranges[fieldKey]);
      fields.push({
        fieldName: fieldKey,
        label: getFieldLabel(fieldKey),
        requirementValue: res.requirementDisplay || '',
        clientValue: res.clientDisplay,
        status: res.status,
        notes: res.notes,
      });
    }
  });

  // 14. SAT CIEC
  if (ranges.satCiec !== undefined) {
    const res = evaluateSatCiec(getClientValue('satCiec'), ranges.satCiec);
    fields.push({
      fieldName: 'satCiec',
      label: getFieldLabel('satCiec'),
      requirementValue: res.requirementDisplay || '',
      clientValue: res.clientDisplay,
      status: res.status,
      notes: res.notes,
    });
  }

  // 15. Estados Financieros
  if (ranges.estadosFinancieros !== undefined) {
    const res = evaluateEstadosFinancieros(getClientValue('estadosFinancieros'), ranges.estadosFinancieros);
    fields.push({
      fieldName: 'estadosFinancieros',
      label: getFieldLabel('estadosFinancieros'),
      requirementValue: res.requirementDisplay || '',
      clientValue: res.clientDisplay,
      status: res.status,
      notes: res.notes,
    });
  }

  // 16. Créditos Vigentes
  if (ranges.creditosVigentes !== undefined) {
    const res = evaluateCreditosVigentes(getClientValue('creditosVigentes'), ranges.creditosVigentes);
    fields.push({
      fieldName: 'creditosVigentes',
      label: getFieldLabel('creditosVigentes'),
      requirementValue: res.requirementDisplay || '',
      clientValue: res.clientDisplay,
      status: res.status,
      notes: res.notes,
    });
  }

  // 17. Imported Notes
  if (requirements.notes && requirements.notes.trim()) {
    fields.push({
      fieldName: 'importedNotes',
      label: 'Notas de la Financiera',
      requirementValue: requirements.notes.trim(),
      clientValue: '-',
      status: 'info',
    });
  }

  // 18. Additional Notes
  if (requirements.additionalNotes && requirements.additionalNotes.trim()) {
    fields.push({
      fieldName: 'additionalNotes',
      label: 'Notas Adicionales',
      requirementValue: requirements.additionalNotes.trim(),
      clientValue: '-',
      status: 'info',
    });
  }

  // Stats
  const passed = fields.filter(f => f.status === 'pass').length;
  const warnings = fields.filter(f => f.status === 'warning').length;
  const fails = fields.filter(f => f.status === 'fail').length;
  const infos = fields.filter(f => f.status === 'info').length;
  const evaluable = fields.filter(f => f.status !== 'info').length;

  const reasons = fields.filter(f => f.status === 'pass').map(f => `${f.label}: ${f.clientValue}`);
  const warningList = fields
    .filter(f => f.status === 'fail' || (f.status === 'warning' && f.clientValue !== 'No proporcionado'))
    .map(f => `${f.label}: ${f.notes || f.clientValue}`);

  // Calculate score percentage
  const score = evaluable > 0 ? Math.round((passed / evaluable) * 100) : 50;

  // Categorize
  let category: 'recommended' | 'compatible' | 'other';
  if (score >= 80 && fails === 0) {
    category = 'recommended';
  } else if (score >= 50 && fails === 0) {
    category = 'compatible';
  } else {
    category = 'other';
  }

  return {
    fields,
    score,
    totalChecks: fields.length,
    passedChecks: passed,
    warningChecks: warnings,
    failedChecks: fails,
    infoChecks: infos,
    category,
    reasons,
    warnings: warningList,
  };
}
