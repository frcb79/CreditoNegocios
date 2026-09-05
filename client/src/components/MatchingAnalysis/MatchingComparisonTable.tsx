import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle, XCircle, AlertCircle, Info, HelpCircle } from "lucide-react";
import {
  evaluateBuroScore,
  evaluateGovSales,
} from "./matchingRules";

interface Client {
  [key: string]: any;
}

interface FinancialInstitution {
  id: string;
  name: string;
  requirements?: any;
  acceptedProfiles?: string[];
}

interface ComparisonField {
  fieldName: string;
  label: string;
  requirementValue: string;
  clientValue: string;
  status: 'pass' | 'warning' | 'fail' | 'info';
  notes?: string;
}

interface MatchingComparisonTableProps {
  client: Client;
  institution: FinancialInstitution;
  productTemplate?: {
    id: string;
    name: string;
  };
  requestedAmount?: number;
}

export default function MatchingComparisonTable({
  client,
  institution,
  productTemplate,
  requestedAmount
}: MatchingComparisonTableProps) {
  const [activeFilter, setActiveFilter] = useState<'all' | 'pass' | 'warning' | 'info'>('all');

  const requirements = institution.requirements?.[client.type] || {};
  const ranges = requirements.ranges || {};
  const fields: ComparisonField[] = [];

  // Helper function to format values
  const formatValue = (value: any): string => {
    if (value === null || value === undefined || value === '') return 'No especificado';
    if (value === 'N/A') return 'N/A';
    if (typeof value === 'number') return value.toLocaleString('es-MX');
    return String(value);
  };

  // Helper to get label for field keys
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
  const acceptedProfiles = institution.acceptedProfiles || [];
  if (acceptedProfiles.length > 0) {
    const profileAccepted = acceptedProfiles.includes(client.type);
    const profileLabels: Record<string, string> = {
      'persona_moral': 'Persona Moral',
      'fisica_empresarial': 'PFAE',
      'fisica': 'Persona Física',
      'sin_sat': 'Sin SAT'
    };
    fields.push({
      fieldName: 'profileType',
      label: 'Tipo de Perfil Aceptado',
      requirementValue: acceptedProfiles.map(p => profileLabels[p] || p).join(', '),
      clientValue: profileLabels[client.type] || client.type,
      status: profileAccepted ? 'pass' : 'fail',
      notes: profileAccepted ? 'Perfil admitido por la institución' : 'La institución no acepta este perfil de cliente',
    });
  }

  // 2. Amount Range
  if (requestedAmount && (ranges.monto?.min || ranges.monto?.max)) {
    const min = ranges.monto.min || 0;
    const max = ranges.monto.max || Infinity;
    const inRange = requestedAmount >= min && requestedAmount <= max;
    
    let reqValue = '';
    if (min && max < Infinity) reqValue = `$${min.toLocaleString('es-MX')} - $${max.toLocaleString('es-MX')}`;
    else if (min) reqValue = `Mínimo $${min.toLocaleString('es-MX')}`;
    else if (max < Infinity) reqValue = `Máximo $${max.toLocaleString('es-MX')}`;
    
    fields.push({
      fieldName: 'monto',
      label: 'Monto Solicitado',
      requirementValue: reqValue,
      clientValue: requestedAmount.toLocaleString('es-MX', { 
        style: 'currency', 
        currency: 'MXN', 
        minimumFractionDigits: 0, 
        maximumFractionDigits: 0 
      }),
      status: inRange ? 'pass' : 'fail',
      notes: inRange ? 'Monto dentro del rango permitido' : 'Monto fuera del rango aceptado por la financiera',
    });
  }

  // 3. Bureau Scores (Persona Física, Accionista Principal, Empresa)
  const bureauFields = ['buroPersonaFisica', 'buroAccionistaPrincipal', 'buroEmpresa'];
  bureauFields.forEach(fieldKey => {
    if (ranges[fieldKey]?.min !== undefined) {
      const minReq = Number(ranges[fieldKey].min);
      const clientValue = client[fieldKey];
      const evalResult = evaluateBuroScore(fieldKey, clientValue, minReq);
      
      fields.push({
        fieldName: fieldKey,
        label: getFieldLabel(fieldKey),
        requirementValue: evalResult.requirementDisplay || `Mínimo ${minReq} puntos`,
        clientValue: evalResult.clientDisplay,
        status: evalResult.status,
        notes: evalResult.notes,
      });
    }
  });

  // 3b. Buró Persona Física Sin SAT (boolean: si/no)
  if (ranges.buroPersonaFisicaSinSat !== undefined) {
    const reqValue = ranges.buroPersonaFisicaSinSat;
    const clientValue = client.buroPersonaFisicaSinSat;
    const reqStr = typeof reqValue === 'object' ? reqValue.required : reqValue;
    let status: 'pass' | 'warning' | 'fail' | 'info' = 'info';
    let clientDisplay = formatValue(clientValue);
    const reqDisplay = reqStr === 'si' ? 'Requiere historial de buró' : 'Sin buró requerido';

    if (!clientValue || clientValue === '' || clientValue === 'N/A') {
      status = 'warning';
      clientDisplay = 'No proporcionado';
    } else {
      status = clientValue === reqStr ? 'pass' : 'fail';
      clientDisplay = clientValue === 'si' ? 'Sí tiene buró' : 'No tiene buró';
    }

    fields.push({
      fieldName: 'buroPersonaFisicaSinSat',
      label: getFieldLabel('buroPersonaFisicaSinSat'),
      requirementValue: reqDisplay,
      clientValue: clientDisplay,
      status,
    });
  }

  // 4. Income and Expense Fields
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
    const fieldRange = ranges[fieldKey];
    if (fieldRange?.min !== undefined || fieldRange?.max !== undefined) {
      const minReq = fieldRange.min !== undefined ? Number(fieldRange.min) : undefined;
      const maxReq = fieldRange.max !== undefined ? Number(fieldRange.max) : undefined;
      const clientValue = client[fieldKey];
      
      let reqValue = '';
      if (minReq !== undefined && maxReq !== undefined) {
        reqValue = `$${minReq.toLocaleString('es-MX')} - $${maxReq.toLocaleString('es-MX')}`;
      } else if (minReq !== undefined) {
        reqValue = `Mínimo $${minReq.toLocaleString('es-MX')}`;
      } else if (maxReq !== undefined) {
        reqValue = `Máximo $${maxReq.toLocaleString('es-MX')}`;
      }

      let status: 'pass' | 'warning' | 'fail' | 'info' = 'info';
      let clientDisplay = formatValue(clientValue);
      
      if (clientValue === 'N/A' || clientValue === null || clientValue === undefined || clientValue === '') {
        status = 'warning';
        clientDisplay = 'No proporcionado';
      } else {
        const numValue = parseFloat(String(clientValue).replace(/[^0-9.-]/g, ''));
        if (isNaN(numValue)) {
          status = 'warning';
        } else {
          const meetsMin = minReq === undefined || numValue >= minReq;
          const meetsMax = maxReq === undefined || numValue <= maxReq;
          status = meetsMin && meetsMax ? 'pass' : 'fail';
          clientDisplay = `$${numValue.toLocaleString('es-MX')}`;
        }
      }
      
      fields.push({
        fieldName: fieldKey,
        label: getFieldLabel(fieldKey),
        requirementValue: reqValue,
        clientValue: clientDisplay,
        status,
      });
    }
  });

  // 5. Tenure Fields (Laboral / Actividad)
  const tenureFields = ['antiguedadLaboral', 'tiempoActividad'];
  tenureFields.forEach(fieldKey => {
    if (ranges[fieldKey]?.min || ranges[fieldKey]?.max) {
      const min = ranges[fieldKey]?.min !== undefined ? Number(ranges[fieldKey].min) : undefined;
      const max = ranges[fieldKey]?.max !== undefined ? Number(ranges[fieldKey].max) : undefined;
      const clientValue = client[fieldKey];
      
      let reqValue = '';
      if (min !== undefined && max !== undefined) {
        reqValue = `${min} - ${max} meses`;
      } else if (min !== undefined) {
        reqValue = `Mínimo ${min} meses`;
      } else if (max !== undefined) {
        reqValue = `Máximo ${max} meses`;
      }
      
      let status: 'pass' | 'warning' | 'fail' | 'info' = 'info';
      let clientDisplay = formatValue(clientValue);
      
      if (clientValue === 'N/A' || clientValue === null || clientValue === undefined || clientValue === '') {
        status = 'warning';
        clientDisplay = 'No proporcionado';
      } else {
        const strVal = String(clientValue).toLowerCase().trim();
        const tenureMap: Record<string, { minMonths: number; maxMonths: number; label: string }> = {
          'menos-1': { minMonths: 0, maxMonths: 11, label: '< 1 año' },
          '1-2': { minMonths: 12, maxMonths: 24, label: '1 a 2 años' },
          '2-5': { minMonths: 24, maxMonths: 60, label: '2 a 5 años' },
          '5-10': { minMonths: 60, maxMonths: 120, label: '5 a 10 años' },
          'mas-10': { minMonths: 120, maxMonths: 9999, label: '> 10 años' },
        };

        if (tenureMap[strVal]) {
          const mapping = tenureMap[strVal];
          const meetsMin = min === undefined || mapping.maxMonths >= min;
          const meetsMax = max === undefined || mapping.minMonths <= max;
          status = meetsMin && meetsMax ? 'pass' : 'fail';
          clientDisplay = mapping.label;
        } else {
          const numValue = parseInt(strVal.replace(/[^0-9]/g, ''), 10);
          if (!isNaN(numValue)) {
            const meetsMin = min === undefined || numValue >= min;
            const meetsMax = max === undefined || numValue <= max;
            status = meetsMin && meetsMax ? 'pass' : 'fail';
            clientDisplay = `${numValue} meses`;
          } else {
            status = 'warning';
          }
        }
      }
      
      fields.push({
        fieldName: fieldKey,
        label: getFieldLabel(fieldKey),
        requirementValue: reqValue,
        clientValue: clientDisplay,
        status,
      });
    }
  });

  // 6. Age
  if (ranges.edadCliente?.min || ranges.edadCliente?.max) {
    const min = ranges.edadCliente.min !== undefined ? Number(ranges.edadCliente.min) : undefined;
    const max = ranges.edadCliente.max !== undefined ? Number(ranges.edadCliente.max) : undefined;
    const clientValue = client.edadCliente;
    
    let reqValue = '';
    if (min !== undefined && max !== undefined) reqValue = `${min} - ${max} años`;
    else if (min !== undefined) reqValue = `Mínimo ${min} años`;
    else if (max !== undefined) reqValue = `Máximo ${max} años`;
    
    let status: 'pass' | 'warning' | 'fail' | 'info' = 'info';
    let clientDisplay = formatValue(clientValue);
    
    if (clientValue === 'N/A' || clientValue === null || clientValue === undefined || clientValue === '') {
      status = 'warning';
      clientDisplay = 'No proporcionado';
    } else {
      const numValue = parseInt(String(clientValue), 10);
      if (!isNaN(numValue)) {
        const meetsMin = min === undefined || numValue >= min;
        const meetsMax = max === undefined || numValue <= max;
        status = meetsMin && meetsMax ? 'pass' : 'fail';
        clientDisplay = `${numValue} años`;
      } else {
        status = 'warning';
      }
    }
    
    fields.push({
      fieldName: 'edadCliente',
      label: 'Edad del Cliente',
      requirementValue: reqValue,
      clientValue: clientDisplay,
      status,
    });
  }

  // 7. Participación Ventas Gobierno
  if (ranges.participacionVentasGobierno?.maxThreshold) {
    const maxThreshold = ranges.participacionVentasGobierno.maxThreshold;
    const clientValue = client.participacionVentasGobierno;
    const evalResult = evaluateGovSales(clientValue, maxThreshold);
    
    fields.push({
      fieldName: 'participacionVentasGobierno',
      label: 'Participación Ventas Gobierno',
      requirementValue: evalResult.requirementDisplay || maxThreshold,
      clientValue: evalResult.clientDisplay,
      status: evalResult.status,
      notes: evalResult.notes,
    });
  }

  // 8. Opinión de Cumplimiento
  if (ranges.opinionCumplimiento?.acceptanceMode) {
    const acceptanceMode = ranges.opinionCumplimiento.acceptanceMode;
    const clientValue = client.opinionCumplimiento;
    
    const reqValue = acceptanceMode === 'solo-positiva' 
      ? 'Solo positiva' 
      : 'Positiva o negativa';
    
    let status: 'pass' | 'warning' | 'fail' | 'info' = 'info';
    let clientDisplay = formatValue(clientValue);
    
    if (clientValue === 'N/A' || clientValue === null || clientValue === undefined || clientValue === '') {
      status = 'warning';
      clientDisplay = 'No proporcionado';
    } else {
      const valLower = String(clientValue).toLowerCase().trim();
      if (acceptanceMode === 'solo-positiva') {
        status = valLower === 'positiva' ? 'pass' : 'fail';
      } else {
        status = 'pass';
      }
      clientDisplay = valLower === 'positiva' ? 'Positiva' : 'Negativa';
    }
    
    fields.push({
      fieldName: 'opinionCumplimiento',
      label: 'Opinión de Cumplimiento',
      requirementValue: reqValue,
      clientValue: clientDisplay,
      status,
    });
  }

  // 9. Guarantee Multipliers
  const guaranteeFields = ['garantia', 'cuentaConGarantiaFisica', 'cuentaConGarantiaSinSat'];
  guaranteeFields.forEach(fieldKey => {
    if (ranges[fieldKey]?.guaranteeMultipliers) {
      const guaranteeMultipliers = ranges[fieldKey].guaranteeMultipliers;
      const clientGuaranteeType = client[fieldKey];
      
      const acceptedTypes = Object.keys(guaranteeMultipliers)
        .filter(key => guaranteeMultipliers[key])
        .map(key => `${key.replace(/-/g, ' ')} (${guaranteeMultipliers[key]})`)
        .join(', ');
      
      let status: 'pass' | 'warning' | 'fail' | 'info' = 'info';
      let clientDisplay = formatValue(clientGuaranteeType);
      
      if (clientGuaranteeType === 'N/A' || clientGuaranteeType === null || clientGuaranteeType === undefined || clientGuaranteeType === '') {
        status = 'warning';
        clientDisplay = 'No proporcionado';
      } else {
        const strVal = String(clientGuaranteeType).toLowerCase().trim();
        const multiplier = guaranteeMultipliers[strVal];
        status = multiplier ? 'pass' : 'fail';
        clientDisplay = `${strVal.replace(/-/g, ' ')}${multiplier ? ` (${multiplier})` : ''}`;
      }
      
      fields.push({
        fieldName: fieldKey,
        label: getFieldLabel(fieldKey),
        requirementValue: acceptedTypes || 'No configurado',
        clientValue: clientDisplay,
        status,
      });
    }
  });

  // 10. Ingreso Anual (select range)
  if (ranges.ingresoAnual?.min || ranges.ingresoAnual?.max) {
    const minOption = ranges.ingresoAnual.min;
    const maxOption = ranges.ingresoAnual.max;
    const clientValue = client.ingresoAnual;
    
    const ingresoLabels: Record<string, string> = {
      'menor-100000': 'Menor a $100,000',
      '100000-250000': '$100,000 - $250,000',
      '250000-500000': '$250,000 - $500,000',
      '500000-1000000': '$500,000 - $1,000,000',
      '1000000-2500000': '$1,000,000 - $2,500,000',
      '2500000-5000000': '$2,500,000 - $5,000,000',
      'arriba-5000000': 'Arriba de $5,000,000'
    };
    
    let reqValue = '';
    if (minOption && maxOption) {
      reqValue = `Entre ${ingresoLabels[minOption] || minOption} y ${ingresoLabels[maxOption] || maxOption}`;
    } else if (minOption) {
      reqValue = `Mínimo ${ingresoLabels[minOption] || minOption}`;
    } else if (maxOption) {
      reqValue = `Máximo ${ingresoLabels[maxOption] || maxOption}`;
    }
    
    const ingresoHierarchy: Record<string, number> = {
      'menor-100000': 0,
      '100000-250000': 1,
      '250000-500000': 2,
      '500000-1000000': 3,
      '1000000-2500000': 4,
      '2500000-5000000': 5,
      'arriba-5000000': 6
    };
    
    let status: 'pass' | 'warning' | 'fail' | 'info' = 'info';
    let clientDisplay = formatValue(clientValue);
    
    if (clientValue === 'N/A' || clientValue === null || clientValue === undefined || clientValue === '') {
      status = 'warning';
      clientDisplay = 'No proporcionado';
    } else {
      const clientLevel = ingresoHierarchy[clientValue] ?? -1;
      const minLevel = minOption ? (ingresoHierarchy[minOption] ?? -1) : -1;
      const maxLevel = maxOption ? (ingresoHierarchy[maxOption] ?? 999) : 999;
      
      status = clientLevel >= minLevel && clientLevel <= maxLevel ? 'pass' : 'fail';
      clientDisplay = ingresoLabels[clientValue] || clientValue;
    }
    
    fields.push({
      fieldName: 'ingresoAnual',
      label: 'Ingreso Anual',
      requirementValue: reqValue,
      clientValue: clientDisplay,
      status,
    });
  }

  // 11. Ventas con Terminal Bancaria
  if (ranges.ventasTerminalBancaria !== undefined) {
    const reqValue = ranges.ventasTerminalBancaria;
    const clientValue = client.ventasTerminalBancaria;

    const ventasLabels: Record<string, string> = {
      'no': 'No tiene',
      'hasta-15000': 'Hasta $15,000',
      '15000-30000': '$15,000 - $30,000',
      '30000-50000': '$30,000 - $50,000',
      'hasta-50000': 'Hasta $50,000',
      '50000-100000': '$50,000 - $100,000',
      '50000-150000': '$50,000 - $150,000',
      'mayores-100000': 'Mayores a $100,000',
      'mayores-150000': 'Mayores a $150,000',
    };

    const ventasHierarchy: Record<string, number> = {
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

    const reqMin = typeof reqValue === 'object' ? reqValue.min : reqValue;
    const reqMinLevel = ventasHierarchy[reqMin] ?? 0;

    let status: 'pass' | 'warning' | 'fail' | 'info' = 'info';
    let clientDisplay = formatValue(clientValue);

    if (!clientValue || clientValue === '' || clientValue === 'N/A') {
      status = 'warning';
      clientDisplay = 'No proporcionado';
    } else {
      const clientLevel = ventasHierarchy[clientValue] ?? 0;
      status = clientLevel >= reqMinLevel ? 'pass' : 'fail';
      clientDisplay = ventasLabels[clientValue] || clientValue;
    }

    fields.push({
      fieldName: 'ventasTerminalBancaria',
      label: getFieldLabel('ventasTerminalBancaria'),
      requirementValue: `Mínimo ${ventasLabels[reqMin] || reqMin || 'Requerido'}`,
      clientValue: clientDisplay,
      status,
    });
  }

  // 12. Atrasos/Deudas en Buró
  const atrasosFields = ['atrasosDeudas', 'atrasosDeudasBuro', 'atrasosDeudasBuroSinSat'];
  atrasosFields.forEach(fieldKey => {
    if (ranges[fieldKey] !== undefined) {
      const reqData = ranges[fieldKey];
      const clientValue = client[fieldKey];

      let status: 'pass' | 'warning' | 'fail' | 'info' = 'info';
      let clientDisplay = formatValue(clientValue);
      let reqDisplay = 'Configurado';

      const hasMaxAmount = reqData?.max !== undefined;
      if (hasMaxAmount) {
        reqDisplay = `Máximo $${Number(reqData.max).toLocaleString('es-MX')} en atrasos`;
      } else if (typeof reqData === 'string') {
        reqDisplay = reqData === 'no' ? 'Sin atrasos permitidos' : 'Con atrasos permitidos';
      } else if (typeof reqData === 'object' && reqData.required) {
        reqDisplay = reqData.required === 'no' ? 'Sin atrasos permitidos' : 'Con atrasos permitidos';
      }

      if (!clientValue || clientValue === '' || clientValue === 'N/A') {
        status = 'warning';
        clientDisplay = 'No proporcionado';
      } else if (clientValue === 'no') {
        status = 'pass';
        clientDisplay = 'Sin atrasos';
      } else if (clientValue === 'si') {
        if (hasMaxAmount) {
          status = 'warning';
          clientDisplay = `Tiene atrasos (verificar que no excedan $${Number(reqData.max).toLocaleString('es-MX')})`;
        } else {
          const reqStr = typeof reqData === 'string' ? reqData : reqData?.required;
          status = reqStr === 'no' ? 'fail' : 'pass';
          clientDisplay = 'Tiene atrasos';
        }
      } else {
        const numValue = parseFloat(String(clientValue).replace(/[^0-9.-]/g, ''));
        if (!isNaN(numValue) && hasMaxAmount) {
          status = numValue <= Number(reqData.max) ? 'pass' : 'fail';
          clientDisplay = `$${numValue.toLocaleString('es-MX')} en atrasos`;
        } else {
          clientDisplay = String(clientValue);
        }
      }

      fields.push({
        fieldName: fieldKey,
        label: getFieldLabel(fieldKey),
        requirementValue: reqDisplay,
        clientValue: clientDisplay,
        status,
      });
    }
  });

  // 13. Aval u Obligado Solidario
  const avalFields = ['avalObligadoSolidario', 'tieneAvalObligadoSolidarioFisica', 'tieneAvalObligadoSolidarioSinSat'];
  avalFields.forEach(fieldKey => {
    if (ranges[fieldKey] !== undefined) {
      const reqValue = ranges[fieldKey];
      const clientValue = client[fieldKey];
      const reqStr = typeof reqValue === 'object' ? reqValue.required : reqValue;
      const reqDisplay = reqStr === 'si' ? 'Requiere aval' : 'No requiere aval';

      let status: 'pass' | 'warning' | 'fail' | 'info' = 'info';
      let clientDisplay = formatValue(clientValue);

      if (!clientValue || clientValue === '' || clientValue === 'N/A') {
        status = 'warning';
        clientDisplay = 'No proporcionado';
      } else {
        if (reqStr === 'si') {
          status = clientValue === 'si' ? 'pass' : 'fail';
        } else {
          status = 'pass';
        }
        clientDisplay = clientValue === 'si' ? 'Sí tiene aval' : 'No tiene aval';
      }

      fields.push({
        fieldName: fieldKey,
        label: getFieldLabel(fieldKey),
        requirementValue: reqDisplay,
        clientValue: clientDisplay,
        status,
      });
    }
  });

  // 14. SAT CIEC
  if (ranges.satCiec !== undefined) {
    const reqValue = ranges.satCiec;
    const clientValue = client.satCiec;
    const reqStr = typeof reqValue === 'object' ? reqValue.required : reqValue;

    let status: 'pass' | 'warning' | 'fail' | 'info' = 'info';
    let clientDisplay = formatValue(clientValue);

    if (!clientValue || clientValue === '' || clientValue === 'N/A') {
      status = 'warning';
      clientDisplay = 'No proporcionado';
    } else {
      if (reqStr === 'si') {
        status = clientValue === 'si' ? 'pass' : 'fail';
      } else {
        status = 'pass';
      }
      clientDisplay = clientValue === 'si' ? 'Sí se conecta' : 'No se conecta';
    }

    fields.push({
      fieldName: 'satCiec',
      label: getFieldLabel('satCiec'),
      requirementValue: reqStr === 'si' ? 'Requiere conexión SAT' : 'No requiere',
      clientValue: clientDisplay,
      status,
    });
  }

  // 15. Estados Financieros
  if (ranges.estadosFinancieros !== undefined) {
    const reqValue = ranges.estadosFinancieros;
    const clientValue = client.estadosFinancieros;
    const reqStr = typeof reqValue === 'object' ? reqValue.required : reqValue;

    let status: 'pass' | 'warning' | 'fail' | 'info' = 'info';
    let clientDisplay = formatValue(clientValue);

    if (!clientValue || clientValue === '' || clientValue === 'N/A') {
      status = 'warning';
      clientDisplay = 'No proporcionado';
    } else {
      if (reqStr === 'si') {
        status = clientValue === 'si' ? 'pass' : 'fail';
      } else {
        status = 'pass';
      }
      clientDisplay = clientValue === 'si' ? 'Sí presenta' : 'No presenta';
    }

    fields.push({
      fieldName: 'estadosFinancieros',
      label: getFieldLabel('estadosFinancieros'),
      requirementValue: reqStr === 'si' ? 'Requiere estados financieros' : 'No requiere',
      clientValue: clientDisplay,
      status,
    });
  }

  // 16. Créditos Vigentes
  if (ranges.creditosVigentes !== undefined) {
    const reqValue = ranges.creditosVigentes;
    const clientValue = client.creditosVigentes;
    const reqStr = typeof reqValue === 'object' ? reqValue.required : reqValue;

    let status: 'pass' | 'warning' | 'fail' | 'info' = 'info';
    let clientDisplay = formatValue(clientValue);

    if (!clientValue || clientValue === '' || clientValue === 'N/A') {
      status = 'warning';
      clientDisplay = 'No proporcionado';
    } else {
      status = clientValue === reqStr ? 'pass' : 'fail';
      clientDisplay = clientValue === 'si' ? 'Sí tiene créditos vigentes' : 'No tiene créditos vigentes';
    }

    fields.push({
      fieldName: 'creditosVigentes',
      label: getFieldLabel('creditosVigentes'),
      requirementValue: reqStr === 'si' ? 'Requiere créditos vigentes' : 'Sin créditos vigentes requeridos',
      clientValue: clientDisplay,
      status,
    });
  }

  // 17. Notes from imported data
  const importedNotes = requirements.notes;
  if (importedNotes && importedNotes.trim()) {
    fields.push({
      fieldName: 'importedNotes',
      label: 'Notas de la Financiera',
      requirementValue: importedNotes.trim(),
      clientValue: '-',
      status: 'info',
    });
  }

  // 18. Additional Notes
  const additionalNotes = requirements.additionalNotes;
  if (additionalNotes && additionalNotes.trim()) {
    fields.push({
      fieldName: 'additionalNotes',
      label: 'Notas Adicionales',
      requirementValue: additionalNotes.trim(),
      clientValue: '-',
      status: 'info',
    });
  }

  // Group fields into the 3 canonical categories requested by user:
  // 1. Compatibles (pass)
  // 2. Advertencias / No cumple (warning or fail with provided data)
  // 3. Sin datos / Informativo (unprovided data or informative notes)
  const compatibleFields = fields.filter(f => f.status === 'pass');
  const warningFields = fields.filter(f => (f.status === 'fail' || f.status === 'warning') && f.clientValue !== 'No proporcionado');
  const infoFields = fields.filter(f => f.status === 'info' || f.clientValue === 'No proporcionado');

  const getStatusIcon = (status: string, clientVal?: string) => {
    if (clientVal === 'No proporcionado') {
      return <HelpCircle className="w-4 h-4 text-muted-foreground" />;
    }
    switch (status) {
      case 'pass':
        return <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />;
      case 'warning':
        return <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />;
      case 'fail':
        return <XCircle className="w-4 h-4 text-destructive" />;
      default:
        return <Info className="w-4 h-4 text-blue-600 dark:text-blue-400" />;
    }
  };

  const getStatusBadge = (status: string, clientVal?: string) => {
    if (clientVal === 'No proporcionado') {
      return <Badge variant="outline" className="bg-muted text-muted-foreground border-border">Sin datos</Badge>;
    }
    switch (status) {
      case 'pass':
        return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300">Cumple</Badge>;
      case 'warning':
        return <Badge className="bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300">Advertencia</Badge>;
      case 'fail':
        return <Badge className="bg-red-100 text-red-800 border-red-300 dark:bg-red-950 dark:text-red-300">No cumple</Badge>;
      default:
        return <Badge className="bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950 dark:text-blue-300">Informativo</Badge>;
    }
  };

  if (fields.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Info className="w-12 h-12 mx-auto mb-2 text-muted-foreground/40" />
        <p className="text-sm">No hay requisitos configurados para este perfil de cliente</p>
      </div>
    );
  }

  const renderFieldsTable = (items: ComparisonField[], tableId: string) => (
    <div className="border rounded-lg overflow-hidden bg-card">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="w-[30%] text-xs font-semibold uppercase tracking-wider">Campo</TableHead>
            <TableHead className="w-[32%] text-xs font-semibold uppercase tracking-wider">Requisito Financiera</TableHead>
            <TableHead className="w-[23%] text-xs font-semibold uppercase tracking-wider">Dato Cliente</TableHead>
            <TableHead className="w-[15%] text-center text-xs font-semibold uppercase tracking-wider">Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((field, index) => (
            <TableRow key={`${tableId}-${field.fieldName}-${index}`} data-testid={`matching-row-${field.fieldName}`}>
              <TableCell className="font-medium text-sm text-foreground">
                <div className="flex items-center space-x-2">
                  {getStatusIcon(field.status, field.clientValue)}
                  <span>{field.label}</span>
                </div>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground font-medium">
                {field.requirementValue}
              </TableCell>
              <TableCell className="text-sm text-foreground font-medium">
                {field.clientValue}
              </TableCell>
              <TableCell className="text-center">
                {getStatusBadge(field.status, field.clientValue)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Overview Banner */}
      <div className="bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-lg p-3">
        <div className="flex items-start justify-between">
          <div className="flex items-start space-x-2">
            <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-blue-900 dark:text-blue-300">
              <p className="font-semibold mb-0.5">Análisis de Compatibilidad</p>
              <p className="text-blue-700 dark:text-blue-400">
                Comparación detallada de los requisitos de la financiera vs. los datos del cliente.
              </p>
            </div>
          </div>
          <Badge variant="outline" className="text-xs bg-card border-border font-medium">
            {institution.name}
          </Badge>
        </div>
      </div>

      {/* Category Filter Tabs */}
      <div className="flex flex-wrap gap-1.5 p-1 bg-muted/60 rounded-lg border border-border text-xs">
        <button
          type="button"
          onClick={() => setActiveFilter('all')}
          className={`px-3 py-1.5 rounded-md font-medium transition-all ${
            activeFilter === 'all'
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Todos ({fields.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveFilter('pass')}
          className={`px-3 py-1.5 rounded-md font-medium transition-all flex items-center space-x-1.5 ${
            activeFilter === 'pass'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/50'
          }`}
        >
          <CheckCircle className="w-3.5 h-3.5" />
          <span>Compatibles ({compatibleFields.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveFilter('warning')}
          className={`px-3 py-1.5 rounded-md font-medium transition-all flex items-center space-x-1.5 ${
            activeFilter === 'warning'
              ? 'bg-amber-600 text-white shadow-sm'
              : 'text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/50'
          }`}
        >
          <AlertCircle className="w-3.5 h-3.5" />
          <span>Advertencias ({warningFields.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveFilter('info')}
          className={`px-3 py-1.5 rounded-md font-medium transition-all flex items-center space-x-1.5 ${
            activeFilter === 'info'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50'
          }`}
        >
          <HelpCircle className="w-3.5 h-3.5" />
          <span>Sin datos ({infoFields.length})</span>
        </button>
      </div>

      {/* Grouped Content Sections */}
      <div className="space-y-4">
        {/* Section 1: ✅ Compatibles */}
        {(activeFilter === 'all' || activeFilter === 'pass') && (
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center space-x-2">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <h4 className="font-semibold text-sm text-emerald-900 dark:text-emerald-300">
                  Requisitos Compatibles ({compatibleFields.length})
                </h4>
              </div>
              <span className="text-xs text-muted-foreground">El cliente cumple plenamente</span>
            </div>
            {compatibleFields.length > 0 ? (
              renderFieldsTable(compatibleFields, 'compatible')
            ) : (
              <div className="p-4 text-center rounded-lg border border-dashed border-border text-xs text-muted-foreground">
                No hay campos evaluados que cumplan actualmente
              </div>
            )}
          </div>
        )}

        {/* Section 2: ⚠️ Advertencias / No cumple */}
        {(activeFilter === 'all' || activeFilter === 'warning') && (
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center space-x-2">
                <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                <h4 className="font-semibold text-sm text-amber-900 dark:text-amber-300">
                  Advertencias y Requisitos No Cumplidos ({warningFields.length})
                </h4>
              </div>
              <span className="text-xs text-muted-foreground">Requieren revisión o ajuste</span>
            </div>
            {warningFields.length > 0 ? (
              renderFieldsTable(warningFields, 'warning')
            ) : (
              <div className="p-4 text-center rounded-lg border border-dashed border-border text-xs text-muted-foreground">
                Ninguna advertencia detectada en los datos proporcionados
              </div>
            )}
          </div>
        )}

        {/* Section 3: ℹ️ Sin datos / Informativo */}
        {(activeFilter === 'all' || activeFilter === 'info') && (
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center space-x-2">
                <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                <h4 className="font-semibold text-sm text-blue-900 dark:text-blue-300">
                  Sin Datos / Información Adicional ({infoFields.length})
                </h4>
              </div>
              <span className="text-xs text-muted-foreground">Datos no provistos o notas informativas</span>
            </div>
            {infoFields.length > 0 ? (
              renderFieldsTable(infoFields, 'info')
            ) : (
              <div className="p-4 text-center rounded-lg border border-dashed border-border text-xs text-muted-foreground">
                No hay campos sin información ni notas adicionales
              </div>
            )}
          </div>
        )}
      </div>

      {/* Summary Stats Footer */}
      <div className="flex items-center justify-between bg-muted/40 border border-border rounded-lg p-3 text-xs">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center space-x-1.5">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="text-muted-foreground">
              <strong className="text-foreground">{compatibleFields.length}</strong> Cumple
            </span>
          </div>
          <div className="flex items-center space-x-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span className="text-muted-foreground">
              <strong className="text-foreground">{warningFields.length}</strong> Advertencias
            </span>
          </div>
          <div className="flex items-center space-x-1.5">
            <HelpCircle className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">
              <strong className="text-foreground">{infoFields.length}</strong> Sin datos / Notas
            </span>
          </div>
        </div>
        <div className="text-muted-foreground font-medium">
          Total: {fields.length} campos evaluados
        </div>
      </div>
    </div>
  );
}
