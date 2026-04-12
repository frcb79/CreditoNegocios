import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle, XCircle, AlertCircle, Info } from "lucide-react";

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
    fields.push({
      fieldName: 'profileType',
      label: 'Tipo de Perfil Aceptado',
      requirementValue: acceptedProfiles.map(p => {
        const labels: Record<string, string> = {
          'persona_moral': 'Persona Moral',
          'fisica_empresarial': 'PFAE',
          'fisica': 'Persona Física',
          'sin_sat': 'Sin SAT'
        };
        return labels[p] || p;
      }).join(', '),
      clientValue: (() => {
        const labels: Record<string, string> = {
          'persona_moral': 'Persona Moral',
          'fisica_empresarial': 'PFAE',
          'fisica': 'Persona Física',
          'sin_sat': 'Sin SAT'
        };
        return labels[client.type] || client.type;
      })(),
      status: profileAccepted ? 'pass' : 'fail',
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
      label: 'Monto',
      requirementValue: reqValue,
      clientValue: requestedAmount.toLocaleString('es-MX', { 
        style: 'currency', 
        currency: 'MXN', 
        minimumFractionDigits: 0, 
        maximumFractionDigits: 0 
      }),
      status: inRange ? 'pass' : 'warning',
    });
  }

  // 3. Bureau Score (multiple fields)
  const bureauFields = ['buroPersonaFisica', 'buroAccionistaPrincipal', 'buroEmpresa'];
  bureauFields.forEach(fieldKey => {
    if (ranges[fieldKey]?.min !== undefined) {
      const minReq = ranges[fieldKey].min;
      const clientValue = client[fieldKey];
      
      let status: 'pass' | 'warning' | 'fail' | 'info' = 'info';
      let clientDisplay = formatValue(clientValue);
      
      if (clientValue === 'N/A' || !clientValue || clientValue === '') {
        status = 'warning';
        clientDisplay = 'No proporcionado';
      } else {
        const numValue = parseInt(clientValue);
        status = numValue >= minReq ? 'pass' : 'warning';
      }
      
      fields.push({
        fieldName: fieldKey,
        label: getFieldLabel(fieldKey),
        requirementValue: `Mínimo ${minReq} puntos`,
        clientValue: clientDisplay,
        status,
      });
    }
  });

  // 3b. Buró Persona Física Sin SAT (boolean-type: si/no)
  if (ranges.buroPersonaFisicaSinSat !== undefined) {
    const reqValue = ranges.buroPersonaFisicaSinSat;
    const clientValue = client.buroPersonaFisicaSinSat;
    const reqStr = typeof reqValue === 'object' ? reqValue.required : reqValue;
    let status: 'pass' | 'warning' | 'fail' | 'info' = 'info';
    let clientDisplay = formatValue(clientValue);
    const reqDisplay = reqStr === 'si' ? 'Sí tiene buró' : 'No tiene buró';
    if (!clientValue || clientValue === '' || clientValue === 'N/A') {
      status = 'warning';
      clientDisplay = 'No proporcionado';
    } else {
      status = clientValue === reqStr ? 'pass' : 'warning';
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

  // 4. Income/Expense Fields (all possible income/expense fields across profiles)
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
    if (ranges[fieldKey]?.min !== undefined) {
      const minReq = ranges[fieldKey].min;
      const clientValue = client[fieldKey];
      
      let status: 'pass' | 'warning' | 'fail' | 'info' = 'info';
      let clientDisplay = formatValue(clientValue);
      
      if (clientValue === 'N/A' || !clientValue || clientValue === '') {
        status = 'warning';
        clientDisplay = 'No proporcionado';
      } else {
        const numValue = parseFloat(clientValue);
        status = numValue >= minReq ? 'pass' : 'warning';
      }
      
      fields.push({
        fieldName: fieldKey,
        label: getFieldLabel(fieldKey),
        requirementValue: `Mínimo $${minReq.toLocaleString('es-MX')}`,
        clientValue: clientDisplay,
        status,
      });
    }
  });

  // 5. Tenure Fields
  const tenureFields = ['antiguedadLaboral', 'tiempoActividad'];
  tenureFields.forEach(fieldKey => {
    if (ranges[fieldKey]?.min || ranges[fieldKey]?.max) {
      const min = ranges[fieldKey]?.min;
      const max = ranges[fieldKey]?.max;
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
      
      if (clientValue === 'N/A' || !clientValue || clientValue === '') {
        status = 'warning';
        clientDisplay = 'No proporcionado';
      } else {
        const numValue = parseInt(clientValue);
        const meetsMin = min === undefined || numValue >= min;
        const meetsMax = max === undefined || numValue <= max;
        status = meetsMin && meetsMax ? 'pass' : 'warning';
        clientDisplay = `${numValue} meses`;
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
    const min = ranges.edadCliente.min;
    const max = ranges.edadCliente.max;
    const clientValue = client.edadCliente;
    
    let reqValue = '';
    if (min && max) reqValue = `${min} - ${max} años`;
    else if (min) reqValue = `Mínimo ${min} años`;
    else if (max) reqValue = `Máximo ${max} años`;
    
    let status: 'pass' | 'warning' | 'fail' | 'info' = 'info';
    let clientDisplay = formatValue(clientValue);
    
    if (clientValue === 'N/A' || !clientValue || clientValue === '') {
      status = 'warning';
      clientDisplay = 'No proporcionado';
    } else {
      const numValue = parseInt(clientValue);
      const meetsMin = !min || numValue >= min;
      const meetsMax = !max || numValue <= max;
      status = meetsMin && meetsMax ? 'pass' : 'warning';
      clientDisplay = `${numValue} años`;
    }
    
    fields.push({
      fieldName: 'edadCliente',
      label: 'Edad',
      requirementValue: reqValue,
      clientValue: clientDisplay,
      status,
    });
  }

  // 7. Participación Ventas Gobierno
  if (ranges.participacionVentasGobierno?.maxThreshold) {
    const maxThreshold = ranges.participacionVentasGobierno.maxThreshold;
    const clientValue = client.participacionVentasGobierno;
    
    const thresholdLabels: Record<string, string> = {
      '0': '0%',
      'menor-20': 'Menor a 20%',
      'menor-40': 'Menor a 40%',
      'menor-50': 'Menor a 50%',
      'menor-60': 'Menor a 60%'
    };
    
    const thresholdHierarchy: Record<string, number> = {
      '0': 0,
      'menor-10': 1,
      '0-10': 1,
      '11-20': 2,
      'menor-20': 2,
      '21-40': 3,
      'menor-40': 3,
      'menor-50': 4,
      'menor-60': 5,
      'arriba-40': 6
    };
    
    let status: 'pass' | 'warning' | 'fail' | 'info' = 'info';
    let clientDisplay = formatValue(clientValue);
    
    if (clientValue === 'N/A' || !clientValue || clientValue === '') {
      status = 'warning';
      clientDisplay = 'No proporcionado';
    } else {
      const maxAllowedLevel = thresholdHierarchy[maxThreshold] || 999;
      const clientLevel = thresholdHierarchy[clientValue] || 999;
      status = clientLevel <= maxAllowedLevel ? 'pass' : 'warning';
    }
    
    fields.push({
      fieldName: 'participacionVentasGobierno',
      label: 'Participación Ventas Gobierno',
      requirementValue: `Máximo ${thresholdLabels[maxThreshold] || maxThreshold}`,
      clientValue: clientDisplay,
      status,
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
    
    if (clientValue === 'N/A' || !clientValue || clientValue === '') {
      status = 'warning';
      clientDisplay = 'No proporcionado';
    } else {
      if (acceptanceMode === 'solo-positiva') {
        status = clientValue === 'positiva' ? 'pass' : 'warning';
      } else {
        status = 'pass';
      }
      clientDisplay = clientValue === 'positiva' ? 'Positiva' : 'Negativa';
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
      
      if (clientGuaranteeType === 'N/A' || !clientGuaranteeType || clientGuaranteeType === '') {
        status = 'warning';
        clientDisplay = 'No proporcionado';
      } else {
        const multiplier = guaranteeMultipliers[clientGuaranteeType];
        status = multiplier ? 'pass' : 'warning';
        clientDisplay = `${clientGuaranteeType.replace(/-/g, ' ')}${multiplier ? ` (${multiplier})` : ''}`;
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
      reqValue = `Entre ${ingresoLabels[minOption]} y ${ingresoLabels[maxOption]}`;
    } else if (minOption) {
      reqValue = `Mínimo ${ingresoLabels[minOption]}`;
    } else if (maxOption) {
      reqValue = `Máximo ${ingresoLabels[maxOption]}`;
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
    
    if (clientValue === 'N/A' || !clientValue || clientValue === '') {
      status = 'warning';
      clientDisplay = 'No proporcionado';
    } else {
      const clientLevel = ingresoHierarchy[clientValue] ?? -1;
      const minLevel = minOption ? (ingresoHierarchy[minOption] ?? -1) : -1;
      const maxLevel = maxOption ? (ingresoHierarchy[maxOption] ?? 999) : 999;
      
      status = clientLevel >= minLevel && clientLevel <= maxLevel ? 'pass' : 'warning';
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
      status = clientLevel >= reqMinLevel ? 'pass' : 'warning';
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

  // 12. Atrasos/Deudas en Buró (all profile variants)
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
          status = reqStr === 'no' ? 'warning' : 'pass';
          clientDisplay = 'Tiene atrasos';
        }
      } else {
        const numValue = parseFloat(clientValue);
        if (!isNaN(numValue) && hasMaxAmount) {
          status = numValue <= Number(reqData.max) ? 'pass' : 'warning';
          clientDisplay = `$${numValue.toLocaleString('es-MX')} en atrasos`;
        } else {
          clientDisplay = clientValue;
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

  // 13. Aval u Obligado Solidario (all profile variants)
  const avalFields = ['avalObligadoSolidario', 'tieneAvalObligadoSolidarioFisica', 'tieneAvalObligadoSolidarioSinSat'];
  avalFields.forEach(fieldKey => {
    if (ranges[fieldKey] !== undefined) {
      const reqValue = ranges[fieldKey];
      const clientValue = client[fieldKey];

      let status: 'pass' | 'warning' | 'fail' | 'info' = 'info';
      let clientDisplay = formatValue(clientValue);
      const reqStr = typeof reqValue === 'object' ? reqValue.required : reqValue;
      const reqDisplay = reqStr === 'si' ? 'Requiere aval' : 'No requiere aval';

      if (!clientValue || clientValue === '' || clientValue === 'N/A') {
        status = 'warning';
        clientDisplay = 'No proporcionado';
      } else {
        if (reqStr === 'si') {
          status = clientValue === 'si' ? 'pass' : 'warning';
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

  // 14. SAT CIEC Connection
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
        status = clientValue === 'si' ? 'pass' : 'warning';
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
        status = clientValue === 'si' ? 'pass' : 'warning';
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
      status = clientValue === reqStr ? 'pass' : 'warning';
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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pass':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'warning':
        return <AlertCircle className="w-4 h-4 text-yellow-600" />;
      case 'fail':
        return <XCircle className="w-4 h-4 text-red-600" />;
      default:
        return <Info className="w-4 h-4 text-blue-600" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pass':
        return <Badge className="bg-green-100 text-green-800 border-green-300">Cumple</Badge>;
      case 'warning':
        return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300">Advertencia</Badge>;
      case 'fail':
        return <Badge className="bg-red-100 text-red-800 border-red-300">No cumple</Badge>;
      default:
        return <Badge className="bg-blue-100 text-blue-800 border-blue-300">Info</Badge>;
    }
  };

  if (fields.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <Info className="w-12 h-12 mx-auto mb-2 text-gray-300" />
        <p className="text-sm">No hay requisitos configurados para este perfil de cliente</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <div className="flex items-start space-x-2">
          <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-blue-800">
            <p className="font-medium mb-1">Análisis de Matching</p>
            <p>Comparación detallada de los requisitos de la financiera vs. los datos del cliente</p>
          </div>
        </div>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead className="w-[30%]">Campo</TableHead>
              <TableHead className="w-[30%]">Requisito Financiera</TableHead>
              <TableHead className="w-[25%]">Dato Cliente</TableHead>
              <TableHead className="w-[15%] text-center">Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {fields.map((field, index) => (
              <TableRow key={`${field.fieldName}-${index}`} data-testid={`matching-row-${field.fieldName}`}>
                <TableCell className="font-medium text-sm">
                  <div className="flex items-center space-x-2">
                    {getStatusIcon(field.status)}
                    <span>{field.label}</span>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-gray-700">
                  {field.requirementValue}
                </TableCell>
                <TableCell className="text-sm text-gray-900 font-medium">
                  {field.clientValue}
                </TableCell>
                <TableCell className="text-center">
                  {getStatusBadge(field.status)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between bg-gray-50 rounded-lg p-3 text-xs">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-1">
            <CheckCircle className="w-3 h-3 text-green-600" />
            <span className="text-gray-600">
              {fields.filter(f => f.status === 'pass').length} Cumple
            </span>
          </div>
          <div className="flex items-center space-x-1">
            <AlertCircle className="w-3 h-3 text-yellow-600" />
            <span className="text-gray-600">
              {fields.filter(f => f.status === 'warning').length} Advertencias
            </span>
          </div>
          <div className="flex items-center space-x-1">
            <XCircle className="w-3 h-3 text-red-600" />
            <span className="text-gray-600">
              {fields.filter(f => f.status === 'fail').length} No cumple
            </span>
          </div>
        </div>
        <div className="text-gray-600">
          Total: {fields.length} campos evaluados
        </div>
      </div>
    </div>
  );
}
