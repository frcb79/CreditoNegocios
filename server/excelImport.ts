import * as XLSX from 'xlsx';
import { storage } from './storage';
import { insertFinancialInstitutionSchema, updatedInsertClientSchema } from '@shared/schema';
import { z } from 'zod';

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50);
}

function cleanEmptyString(value: any): string | undefined {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }
  return String(value).trim() || undefined;
}

interface ImportError {
  row: number;
  field: string;
  message: string;
  value: any;
}

interface ImportResult {
  success: boolean;
  imported: number;
  errors: ImportError[];
  warnings: string[];
}

interface PreviewData {
  headers: string[];
  rows: any[];
  totalRows: number;
}

const FINANCIERA_HEADERS = [
  'nombre_financiera',
  'tipo_producto',
  'perfil_cliente',
  'monto_minimo',
  'monto_maximo',
  'plazo_meses',
  'tasa_interes',
  'comision_apertura',
  'destinos_credito',
  'edad_minima',
  'edad_maxima',
  'antiguedad_meses_min',
  'ingreso_mensual_min',
  'buro_accionista_min',
  'buro_empresa_min',
  'buro_persona_fisica_min',
  'tipo_garantia',
  'opinion_cumplimiento',
  'participacion_ventas_gob_max',
  'giros_prohibidos',
  'presencia',
  'tiempo_respuesta',
  'comision_apertura_broker',
  'comision_sobretasa_broker',
  'comision_renovacion_broker',
  'comision_apertura_master',
  'comision_sobretasa_master',
  'comision_renovacion_master',
  'contacto',
  'email_contacto',
  'telefono_contacto',
  'observaciones'
];

const CLIENT_HEADERS_COMMON = [
  'tipo_cliente',
  'nombre_empresa',
  'nombre',
  'apellido',
  'rfc',
  'curp',
  'email',
  'telefono',
  'calle',
  'numero',
  'interior',
  'codigo_postal',
  'estado',
  'industria',
  'anos_en_negocio'
];

const CLIENT_HEADERS_MORAL = [
  ...CLIENT_HEADERS_COMMON,
  'ingreso_mensual_promedio',
  'egreso_mensual_promedio',
  'ingreso_anual',
  'participacion_ventas_gobierno',
  'ventas_terminal_bancaria',
  'buro_accionista_principal',
  'buro_empresa',
  'atrasos_deudas',
  'atrasos_detalles',
  'garantia',
  'aval_obligado_solidario',
  'sat_ciec',
  'estados_financieros',
  'opinion_cumplimiento',
  'creditos_vigentes',
  'notas'
];

const CLIENT_HEADERS_PFAE = [
  ...CLIENT_HEADERS_COMMON,
  'ingreso_mensual_promedio',
  'egreso_mensual_promedio',
  'ingreso_anual',
  'participacion_ventas_gobierno',
  'ventas_terminal_bancaria',
  'buro_accionista_principal',
  'buro_empresa',
  'atrasos_deudas',
  'atrasos_detalles',
  'garantia',
  'aval_obligado_solidario',
  'sat_ciec',
  'estados_financieros',
  'opinion_cumplimiento',
  'creditos_vigentes',
  'notas'
];

const CLIENT_HEADERS_FISICA = [
  ...CLIENT_HEADERS_COMMON,
  'estado_civil',
  'nivel_educativo',
  'tipo_vivienda',
  'puesto',
  'antiguedad_laboral',
  'dependientes_economicos',
  'ingreso_mensual_comprobable',
  'ingreso_mensual_no_comprobable',
  'gastos_fijos_mensuales',
  'buro_persona_fisica',
  'atrasos_deudas_buro',
  'atrasos_deudas_buro_detalles',
  'cuenta_con_garantia',
  'tiene_aval_obligado_solidario',
  'creditos_vigentes',
  'notas'
];

const CLIENT_HEADERS_SIN_SAT = [
  'tipo_cliente',
  'nombre',
  'apellido',
  'curp',
  'email',
  'telefono',
  'ocupacion',
  'nombre_comercial',
  'calle',
  'numero',
  'interior',
  'codigo_postal',
  'estado',
  'direccion_negocio_aplica',
  'es_misma_direccion_negocio',
  'calle_negocio',
  'numero_negocio',
  'interior_negocio',
  'codigo_postal_negocio',
  'estado_negocio',
  'estado_civil',
  'nivel_educativo',
  'tipo_vivienda',
  'dependientes_economicos',
  'ingreso_mensual_comprobable',
  'ingreso_mensual_no_comprobable',
  'gastos_fijos_mensuales',
  'buro_persona_fisica',
  'atrasos_deudas_buro',
  'cuenta_con_garantia',
  'tiene_aval_obligado_solidario',
  'creditos_vigentes',
  'notas'
];

export function generateFinancierasTemplate(): Buffer {
  const wb = XLSX.utils.book_new();
  
  const instructionsData = [
    ['INSTRUCCIONES PARA IMPORTACIÓN DE FINANCIERAS Y PRODUCTOS'],
    [''],
    ['ESTRUCTURA: Cada fila representa un PRODUCTO de una financiera para un PERFIL DE CLIENTE específico.'],
    ['Si una financiera tiene el mismo producto para varios perfiles, agregue una fila por perfil.'],
    ['Si una financiera tiene varios productos, agregue una fila por producto.'],
    ['El sistema detecta financieras existentes por nombre y las actualiza automáticamente.'],
    [''],
    ['CAMPOS OBLIGATORIOS (*):'],
    ['- nombre_financiera*: Nombre de la financiera (se usa para buscar si ya existe)'],
    ['- tipo_producto*: Tipo de crédito (ej: Crédito Simple, Crédito PYME, Línea de Crédito, Arrendamiento)'],
    ['- perfil_cliente*: persona_moral, fisica_empresarial, fisica, o sin_sat'],
    [''],
    ['CAMPOS DEL PRODUCTO:'],
    ['- monto_minimo: Financiamiento mínimo en pesos (solo número, ej: 200000)'],
    ['- monto_maximo: Financiamiento máximo en pesos (solo número, ej: 5000000)'],
    ['- plazo_meses: Plazo en meses (ej: 36 o rango como "12-60")'],
    ['- tasa_interes: Tasa de interés % (ej: 18 o rango como "15-24")'],
    ['- comision_apertura: Comisión por apertura % (ej: 2.5)'],
    ['- destinos_credito: Principales destinos separados por punto y coma (ej: Capital de trabajo; Adquisición de activos)'],
    [''],
    ['REQUISITOS PARA EL MATCHING (alimentan la selección inteligente):'],
    ['- edad_minima: Edad mínima del cliente (años)'],
    ['- edad_maxima: Edad máxima del cliente (años)'],
    ['- antiguedad_meses_min: Antigüedad mínima del negocio/empleo (meses)'],
    ['- ingreso_mensual_min: Ingreso mensual mínimo requerido (pesos)'],
    ['- buro_accionista_min: Score mínimo buró accionista principal (puntos)'],
    ['- buro_empresa_min: Score mínimo buró empresa (puntos)'],
    ['- buro_persona_fisica_min: Score mínimo buró persona física (puntos)'],
    ['- tipo_garantia: Tipos de garantía aceptados (ej: hipotecaria, prendaria, líquida, sin garantía)'],
    ['- opinion_cumplimiento: solo-positiva o positiva-negativa'],
    ['- participacion_ventas_gob_max: Máx. participación ventas gobierno (ej: menor-20, menor-40, menor-50, menor-60)'],
    [''],
    ['INFORMACIÓN OPERATIVA:'],
    ['- giros_prohibidos: Giros no aceptados, separados por punto y coma'],
    ['- presencia: Estados/regiones con presencia (ej: Nacional o CDMX; Jalisco; Nuevo León)'],
    ['- tiempo_respuesta: Tiempo estimado de respuesta (ej: 24-48 horas)'],
    [''],
    ['COMISIONES BROKER/MASTER (%):'],
    ['- comision_apertura_broker, comision_sobretasa_broker, comision_renovacion_broker'],
    ['- comision_apertura_master, comision_sobretasa_master, comision_renovacion_master'],
    [''],
    ['CONTACTO:'],
    ['- contacto: Nombre del contacto principal'],
    ['- email_contacto: Correo electrónico'],
    ['- telefono_contacto: Teléfono'],
    ['- observaciones: Notas adicionales'],
  ];
  
  const instructionsWs = XLSX.utils.aoa_to_sheet(instructionsData);
  instructionsWs['!cols'] = [{ wch: 120 }];
  XLSX.utils.book_append_sheet(wb, instructionsWs, 'Instrucciones');
  
  const financierasData = [
    FINANCIERA_HEADERS,
    [
      'Financiera Ejemplo',
      'Crédito Simple',
      'persona_moral',
      200000,
      5000000,
      '12-60',
      '15-24',
      2.5,
      'Capital de trabajo; Adquisición de activos fijos; Remodelación',
      25,
      75,
      24,
      135000,
      650,
      620,
      '',
      'hipotecaria; prendaria',
      'solo-positiva',
      'menor-40',
      'Casinos; Casas de empeño',
      'Nacional',
      '24-48 horas',
      '2.5',
      '1.0',
      '1.5',
      '1.0',
      '0.5',
      '0.75',
      'Juan Pérez',
      'contacto@financiera.com',
      '5555551234',
      'Ejemplo de registro completo'
    ],
    [
      'Financiera Ejemplo',
      'Crédito Simple',
      'fisica_empresarial',
      100000,
      3000000,
      '12-48',
      '18-28',
      3.0,
      'Capital de trabajo; Equipamiento',
      21,
      70,
      12,
      80000,
      630,
      '',
      '',
      'prendaria; sin garantía',
      'positiva-negativa',
      'menor-20',
      'Casinos',
      'Nacional',
      '24-48 horas',
      '2.5',
      '1.0',
      '1.5',
      '1.0',
      '0.5',
      '0.75',
      'Juan Pérez',
      'contacto@financiera.com',
      '5555551234',
      'Misma financiera, perfil PFAE'
    ],
    [
      'Otra Financiera',
      'Crédito PYME',
      'persona_moral',
      500000,
      20000000,
      '12-84',
      '12-18',
      1.5,
      'Capital de trabajo; Expansión; Adquisición de empresas',
      30,
      65,
      36,
      250000,
      680,
      650,
      '',
      'hipotecaria',
      'solo-positiva',
      'menor-50',
      '',
      'CDMX; Jalisco; Nuevo León',
      '3-5 días',
      '3.0',
      '0.5',
      '2.0',
      '1.5',
      '0.3',
      '1.0',
      'María García',
      'maria@otrafinanciera.com',
      '5555559999',
      'Financiera especializada en PYME grandes'
    ]
  ];
  
  const financierasWs = XLSX.utils.aoa_to_sheet(financierasData);
  
  const colWidths: Record<string, number> = {
    'nombre_financiera': 25,
    'tipo_producto': 20,
    'perfil_cliente': 20,
    'destinos_credito': 40,
    'giros_prohibidos': 30,
    'presencia': 25,
    'observaciones': 35,
    'tipo_garantia': 25,
  };
  financierasWs['!cols'] = FINANCIERA_HEADERS.map(h => ({ wch: colWidths[h] || 18 }));
  
  XLSX.utils.book_append_sheet(wb, financierasWs, 'Financieras');
  
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

export function generateClientsTemplate(): Buffer {
  const wb = XLSX.utils.book_new();
  
  const instructionsData = [
    ['INSTRUCCIONES PARA IMPORTACIÓN DE CLIENTES'],
    [''],
    ['1. Use la hoja correspondiente según el tipo de cliente:'],
    ['   - Persona_Moral: Para empresas formalmente constituidas'],
    ['   - PFAE: Persona Física con Actividad Empresarial'],
    ['   - Persona_Fisica: Para personas físicas asalariadas o con ingresos fijos'],
    ['   - Sin_SAT: Para personas sin registro fiscal formal'],
    [''],
    ['2. El campo "tipo_cliente" debe coincidir con la hoja utilizada:'],
    ['   persona_moral, fisica_empresarial, fisica, sin_sat'],
    [''],
    ['3. Campos obligatorios varían según tipo de cliente'],
    [''],
    ['NOTA: Puede combinar todos los tipos en una sola importación'],
    ['usando el campo tipo_cliente para diferenciarlos.']
  ];
  
  const instructionsWs = XLSX.utils.aoa_to_sheet(instructionsData);
  XLSX.utils.book_append_sheet(wb, instructionsWs, 'Instrucciones');
  
  const moralData = [
    CLIENT_HEADERS_MORAL,
    [
      'persona_moral',
      'Empresa Ejemplo SA de CV',
      'Juan',
      'Pérez García',
      'EEM123456ABC',
      '',
      'contacto@empresa.com',
      '5555551234',
      'Av. Industria',
      '500',
      'Nave 3',
      '06600',
      'Ciudad de México',
      'Manufactura',
      '10',
      '500000',
      '400000',
      '6000000',
      '20',
      '30',
      '700',
      '650',
      'no',
      '',
      'hipotecaria',
      'si',
      'si',
      'si',
      'positiva',
      'no',
      'Ejemplo de cliente Persona Moral'
    ]
  ];
  
  const moralWs = XLSX.utils.aoa_to_sheet(moralData);
  moralWs['!cols'] = CLIENT_HEADERS_MORAL.map(() => ({ wch: 22 }));
  XLSX.utils.book_append_sheet(wb, moralWs, 'Persona_Moral');
  
  const pfaeData = [
    CLIENT_HEADERS_PFAE,
    [
      'fisica_empresarial',
      'Comercializadora López',
      'María',
      'López Hernández',
      'LOHM890123ABC',
      'LOHM890123HDFRRL01',
      'maria@comercializadora.com',
      '5555559876',
      'Calle Comercio',
      '45',
      '',
      '03100',
      'Estado de México',
      'Comercio',
      '5',
      '150000',
      '100000',
      '1800000',
      '0',
      '50',
      '720',
      '700',
      'no',
      '',
      'prendaria',
      'si',
      'si',
      'si',
      'positiva',
      'no',
      'Ejemplo de cliente PFAE'
    ]
  ];
  
  const pfaeWs = XLSX.utils.aoa_to_sheet(pfaeData);
  pfaeWs['!cols'] = CLIENT_HEADERS_PFAE.map(() => ({ wch: 22 }));
  XLSX.utils.book_append_sheet(wb, pfaeWs, 'PFAE');
  
  const fisicaData = [
    CLIENT_HEADERS_FISICA,
    [
      'fisica',
      '',
      'Carlos',
      'Martínez Ruiz',
      'MARC901234XYZ',
      'MARC901234HDFRRR09',
      'carlos.martinez@email.com',
      '5555554321',
      'Calle Residencial',
      '123',
      'Depto 4B',
      '11560',
      'Ciudad de México',
      '',
      '',
      'casado',
      'licenciatura',
      'propia',
      'Gerente de Ventas',
      '3 años',
      '2',
      '45000',
      '5000',
      '20000',
      '700',
      'no',
      '',
      'no',
      'si',
      'no',
      'Ejemplo de cliente Persona Física'
    ]
  ];
  
  const fisicaWs = XLSX.utils.aoa_to_sheet(fisicaData);
  fisicaWs['!cols'] = CLIENT_HEADERS_FISICA.map(() => ({ wch: 22 }));
  XLSX.utils.book_append_sheet(wb, fisicaWs, 'Persona_Fisica');
  
  const sinSatData = [
    CLIENT_HEADERS_SIN_SAT,
    [
      'sin_sat',
      'Ana',
      'García López',
      'GALA850612MDFRPN05',
      'ana.garcia@email.com',
      '5555556789',
      'Comerciante',
      'Tienda Ana',
      'Calle Mercado',
      '15',
      '',
      '09850',
      'Ciudad de México',
      'si',
      'no',
      'Calle Tianguis',
      '200',
      'Local 5',
      '09800',
      'Ciudad de México',
      'soltera',
      'preparatoria',
      'rentada',
      '1',
      '15000',
      '10000',
      '8000',
      '650',
      'no',
      'no',
      'no',
      'no',
      'Ejemplo de cliente Sin SAT'
    ]
  ];
  
  const sinSatWs = XLSX.utils.aoa_to_sheet(sinSatData);
  sinSatWs['!cols'] = CLIENT_HEADERS_SIN_SAT.map(() => ({ wch: 22 }));
  XLSX.utils.book_append_sheet(wb, sinSatWs, 'Sin_SAT');
  
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

export function previewExcelFile(buffer: Buffer, type: 'financieras' | 'clients'): PreviewData {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  
  let sheetName = type === 'financieras' ? 'Financieras' : null;
  
  if (type === 'clients') {
    const validSheets = ['Persona_Moral', 'PFAE', 'Persona_Fisica', 'Sin_SAT'];
    sheetName = wb.SheetNames.find(name => validSheets.includes(name)) || wb.SheetNames.find(name => name !== 'Instrucciones') || wb.SheetNames[0];
  }
  
  if (!sheetName || !wb.Sheets[sheetName]) {
    const availableSheet = wb.SheetNames.find(name => name !== 'Instrucciones') || wb.SheetNames[0];
    sheetName = availableSheet;
  }
  
  const ws = wb.Sheets[sheetName];
  const jsonData = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
  
  if (jsonData.length < 2) {
    return { headers: [], rows: [], totalRows: 0 };
  }
  
  const headers = jsonData[0].map(String);
  const rows = jsonData.slice(1).filter(row => row.some(cell => cell !== undefined && cell !== '')).map(row => {
    const obj: Record<string, any> = {};
    headers.forEach((header, i) => {
      obj[header] = row[i] !== undefined ? row[i] : '';
    });
    return obj;
  });
  
  return {
    headers,
    rows,
    totalRows: rows.length
  };
}

function parseNumeric(value: any): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const num = parseFloat(String(value).replace(/[,$\s]/g, ''));
  return isNaN(num) ? undefined : num;
}

const PROFILE_ALIASES: Record<string, string> = {
  'persona moral': 'persona_moral',
  'persona_moral': 'persona_moral',
  'moral': 'persona_moral',
  'pm': 'persona_moral',
  'pfae': 'fisica_empresarial',
  'fisica_empresarial': 'fisica_empresarial',
  'física empresarial': 'fisica_empresarial',
  'persona fisica con actividad empresarial': 'fisica_empresarial',
  'persona física con actividad empresarial': 'fisica_empresarial',
  'fisica': 'fisica',
  'física': 'fisica',
  'persona fisica': 'fisica',
  'persona física': 'fisica',
  'pf': 'fisica',
  'sin sat': 'sin_sat',
  'sin_sat': 'sin_sat',
  'sinsat': 'sin_sat',
};

function normalizeProfile(value: string): string | undefined {
  const normalized = value.toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const withAccents = value.toLowerCase().trim();
  return PROFILE_ALIASES[withAccents] || PROFILE_ALIASES[normalized] || undefined;
}

export async function importFinancieras(buffer: Buffer, userId: string): Promise<ImportResult> {
  const errors: ImportError[] = [];
  const warnings: string[] = [];
  let imported = 0;
  
  const wb = XLSX.read(buffer, { type: 'buffer' });
  
  let sheetName = 'Financieras';
  if (!wb.Sheets[sheetName]) {
    sheetName = wb.SheetNames.find(name => name !== 'Instrucciones') || wb.SheetNames[0];
  }
  
  const ws = wb.Sheets[sheetName];
  const jsonData = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
  
  if (jsonData.length < 2) {
    return { success: false, imported: 0, errors: [{ row: 0, field: 'file', message: 'El archivo está vacío o no tiene datos', value: null }], warnings: [] };
  }
  
  const headers = jsonData[0].map(h => String(h).toLowerCase().trim());
  const dataRows = jsonData.slice(1).filter(row => row.some(cell => cell !== undefined && cell !== ''));
  
  const allFinancieras = await storage.getFinancialInstitutions();
  const allTemplates = await storage.getProductTemplates();
  const allInstitutionProducts = await storage.getInstitutionProducts();
  
  const financieraCache: Record<string, any> = {};
  for (const fi of allFinancieras) {
    financieraCache[fi.name.toLowerCase().trim()] = fi;
  }
  
  const templateCache: Record<string, any> = {};
  for (const tpl of allTemplates) {
    templateCache[tpl.name.toLowerCase().trim()] = tpl;
  }
  
  const existingIPKeys = new Set<string>();
  for (const ip of allInstitutionProducts) {
    const profiles = ip.targetProfiles || [];
    for (const p of profiles) {
      existingIPKeys.add(`${ip.institutionId}|${ip.templateId}|${p}`);
    }
  }
  
  const createdIPKeys = new Set<string>();
  
  const updatedRequirements: Record<string, any> = {};
  const updatedProfiles: Record<string, Set<string>> = {};
  const templateProfileUpdates: Record<string, Set<string>> = {};
  
  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const rowNum = i + 2;
    
    const getValue = (field: string): any => {
      const idx = headers.indexOf(field);
      return idx >= 0 ? row[idx] : undefined;
    };
    
    const nombreFinanciera = getValue('nombre_financiera') || getValue('nombre');
    const tipoProducto = getValue('tipo_producto');
    const perfilCliente = getValue('perfil_cliente');
    
    if (!nombreFinanciera) {
      errors.push({ row: rowNum, field: 'nombre_financiera', message: 'El nombre de la financiera es obligatorio', value: nombreFinanciera });
      continue;
    }
    
    if (!tipoProducto) {
      errors.push({ row: rowNum, field: 'tipo_producto', message: 'El tipo de producto es obligatorio', value: tipoProducto });
      continue;
    }
    
    if (!perfilCliente) {
      errors.push({ row: rowNum, field: 'perfil_cliente', message: 'El perfil de cliente es obligatorio', value: perfilCliente });
      continue;
    }
    
    const normalizedProfile = normalizeProfile(String(perfilCliente));
    if (!normalizedProfile) {
      errors.push({ row: rowNum, field: 'perfil_cliente', message: `Perfil inválido. Use: persona_moral, fisica_empresarial, fisica, sin_sat`, value: perfilCliente });
      continue;
    }
    
    try {
      const fiKey = String(nombreFinanciera).toLowerCase().trim();
      let financiera = financieraCache[fiKey];
      
      if (!financiera) {
        const commissionRates: any = {
          broker: {
            apertura: String(getValue('comision_apertura_broker') || '0'),
            sobretasa: String(getValue('comision_sobretasa_broker') || '0'),
            renovacion: String(getValue('comision_renovacion_broker') || '0'),
          },
          masterBroker: {
            apertura: String(getValue('comision_apertura_master') || '0'),
            sobretasa: String(getValue('comision_sobretasa_master') || '0'),
            renovacion: String(getValue('comision_renovacion_master') || '0'),
          }
        };
        
        const tiempoResp = cleanEmptyString(getValue('tiempo_respuesta'));
        const estimatedTimeframes = tiempoResp ? { analysis: tiempoResp, approval: '', dispersion: '' } : {};
        
        const financieraData: any = {
          name: String(nombreFinanciera),
          contactPerson: cleanEmptyString(getValue('contacto')),
          email: cleanEmptyString(getValue('email_contacto')),
          phone: cleanEmptyString(getValue('telefono_contacto')),
          commissionRates,
          acceptedProfiles: [normalizedProfile],
          estimatedTimeframes,
          notes: cleanEmptyString(getValue('observaciones')),
          createdBy: userId,
          createdByAdmin: true,
          isActive: true,
        };
        
        financiera = await storage.createFinancialInstitution(financieraData);
        financieraCache[fiKey] = financiera;
        updatedRequirements[financiera.id] = (financiera.requirements as any) || {};
        updatedProfiles[financiera.id] = new Set([normalizedProfile]);
        warnings.push(`Fila ${rowNum}: Financiera "${nombreFinanciera}" creada`);
      } else {
        if (!updatedRequirements[financiera.id]) {
          updatedRequirements[financiera.id] = JSON.parse(JSON.stringify((financiera.requirements as any) || {}));
        }
        if (!updatedProfiles[financiera.id]) {
          updatedProfiles[financiera.id] = new Set(financiera.acceptedProfiles || []);
        }
        updatedProfiles[financiera.id].add(normalizedProfile);
      }
      
      const ranges: Record<string, any> = {};
      
      const montoMin = parseNumeric(getValue('monto_minimo'));
      const montoMax = parseNumeric(getValue('monto_maximo'));
      if (montoMin !== undefined || montoMax !== undefined) {
        ranges.monto = {};
        if (montoMin !== undefined) ranges.monto.min = montoMin;
        if (montoMax !== undefined) ranges.monto.max = montoMax;
      }
      
      const edadMin = parseNumeric(getValue('edad_minima'));
      const edadMax = parseNumeric(getValue('edad_maxima'));
      if (edadMin !== undefined || edadMax !== undefined) {
        ranges.edadCliente = {};
        if (edadMin !== undefined) ranges.edadCliente.min = edadMin;
        if (edadMax !== undefined) ranges.edadCliente.max = edadMax;
      }
      
      const antiguedadMin = parseNumeric(getValue('antiguedad_meses_min'));
      if (antiguedadMin !== undefined) {
        if (normalizedProfile === 'persona_moral' || normalizedProfile === 'fisica_empresarial') {
          ranges.tiempoActividad = { min: antiguedadMin };
        } else {
          ranges.antiguedadLaboral = { min: antiguedadMin };
        }
      }
      
      const ingresoMin = parseNumeric(getValue('ingreso_mensual_min'));
      if (ingresoMin !== undefined) {
        ranges.ingresoMensualPromedio = { min: ingresoMin };
      }
      
      const buroAccionistaMin = parseNumeric(getValue('buro_accionista_min'));
      if (buroAccionistaMin !== undefined) {
        ranges.buroAccionistaPrincipal = { min: buroAccionistaMin };
      }
      
      const buroEmpresaMin = parseNumeric(getValue('buro_empresa_min'));
      if (buroEmpresaMin !== undefined) {
        ranges.buroEmpresa = { min: buroEmpresaMin };
      }
      
      const buroPersonaFisicaMin = parseNumeric(getValue('buro_persona_fisica_min'));
      if (buroPersonaFisicaMin !== undefined) {
        ranges.buroPersonaFisica = { min: buroPersonaFisicaMin };
      }
      
      const tipoGarantiaStr = cleanEmptyString(getValue('tipo_garantia'));
      if (tipoGarantiaStr) {
        const tipos = tipoGarantiaStr.split(';').map(t => t.trim().toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .replace(/\s+/g, '-'));
        const multipliers: Record<string, string> = {};
        for (const tipo of tipos) {
          if (tipo) multipliers[tipo] = '1';
        }
        const guaranteeField = normalizedProfile === 'fisica' ? 'cuentaConGarantiaFisica' :
                               normalizedProfile === 'sin_sat' ? 'cuentaConGarantiaSinSat' : 'garantia';
        ranges[guaranteeField] = { guaranteeMultipliers: multipliers };
      }
      
      const opinionCumpl = cleanEmptyString(getValue('opinion_cumplimiento'));
      if (opinionCumpl) {
        const mode = opinionCumpl.toLowerCase().includes('solo') ? 'solo-positiva' : 'positiva-negativa';
        ranges.opinionCumplimiento = { acceptanceMode: mode };
      }
      
      const participacionMax = cleanEmptyString(getValue('participacion_ventas_gob_max'));
      if (participacionMax) {
        ranges.participacionVentasGobierno = { maxThreshold: participacionMax.toLowerCase().trim() };
      }
      
      if (!updatedRequirements[financiera.id]) {
        updatedRequirements[financiera.id] = {};
      }
      
      const existingProfileReqs = updatedRequirements[financiera.id][normalizedProfile] || {};
      const existingRanges = existingProfileReqs.ranges || {};
      
      if (Object.keys(existingRanges).length > 0 && Object.keys(ranges).length > 0) {
        warnings.push(`Fila ${rowNum}: Requisitos para "${nombreFinanciera}" perfil "${perfilCliente}" fusionados con producto anterior (se usan valores más permisivos)`);
      }
      
      const mergedRanges = { ...existingRanges };
      for (const [key, newVal] of Object.entries(ranges) as [string, any][]) {
        const existing = mergedRanges[key];
        if (!existing) {
          mergedRanges[key] = newVal;
        } else if (newVal.min !== undefined || newVal.max !== undefined) {
          if (newVal.min !== undefined && existing.min !== undefined) {
            mergedRanges[key] = { ...existing, min: Math.min(existing.min, newVal.min) };
          } else if (newVal.min !== undefined) {
            mergedRanges[key] = { ...existing, min: newVal.min };
          }
          if (newVal.max !== undefined && existing.max !== undefined) {
            mergedRanges[key] = { ...mergedRanges[key], max: Math.max(existing.max, newVal.max) };
          } else if (newVal.max !== undefined) {
            mergedRanges[key] = { ...mergedRanges[key], max: newVal.max };
          }
        } else if (newVal.guaranteeMultipliers) {
          mergedRanges[key] = {
            guaranteeMultipliers: { ...(existing.guaranteeMultipliers || {}), ...newVal.guaranteeMultipliers }
          };
        } else {
          mergedRanges[key] = { ...existing, ...newVal };
        }
      }
      
      const notes: string[] = [];
      const girosProhibidos = cleanEmptyString(getValue('giros_prohibidos'));
      if (girosProhibidos) notes.push(`Giros prohibidos: ${girosProhibidos}`);
      const presencia = cleanEmptyString(getValue('presencia'));
      if (presencia) notes.push(`Presencia: ${presencia}`);
      const observaciones = cleanEmptyString(getValue('observaciones'));
      if (observaciones) notes.push(observaciones);
      
      updatedRequirements[financiera.id][normalizedProfile] = {
        ...existingProfileReqs,
        ranges: mergedRanges,
        notes: notes.length > 0 ? notes.join(' | ') : existingProfileReqs.notes,
      };
      
      const tplKey = String(tipoProducto).toLowerCase().trim();
      let template = templateCache[tplKey];
      
      if (!template) {
        const categoryMap: Record<string, string> = {
          'simple': 'business', 'pyme': 'business', 'empresarial': 'business',
          'arrendamiento': 'business', 'factoraje': 'business', 'linea': 'business',
          'personal': 'personal', 'nómina': 'personal', 'nomina': 'personal',
          'automotriz': 'automotive', 'auto': 'automotive',
          'hipotecario': 'mortgage', 'hipoteca': 'mortgage',
        };
        let category = 'business';
        for (const [keyword, cat] of Object.entries(categoryMap)) {
          if (tplKey.includes(keyword)) { category = cat; break; }
        }
        
        template = await storage.createProductTemplate({
          name: String(tipoProducto),
          description: `Producto tipo ${tipoProducto}`,
          category,
          targetProfiles: [normalizedProfile],
          isActive: true,
          createdBy: userId,
        });
        templateCache[tplKey] = template;
        warnings.push(`Fila ${rowNum}: Plantilla de producto "${tipoProducto}" creada`);
      } else {
        const existingProfiles = template.targetProfiles || [];
        if (!existingProfiles.includes(normalizedProfile)) {
          templateCache[tplKey] = { ...template, targetProfiles: [...existingProfiles, normalizedProfile] };
          if (!templateProfileUpdates[template.id]) {
            templateProfileUpdates[template.id] = new Set(existingProfiles);
          }
          templateProfileUpdates[template.id].add(normalizedProfile);
        }
      }
      
      const ipKey = `${financiera.id}|${template.id}|${normalizedProfile}`;
      if (existingIPKeys.has(ipKey) || createdIPKeys.has(ipKey)) {
        warnings.push(`Fila ${rowNum}: Producto "${tipoProducto}" para perfil "${perfilCliente}" en "${nombreFinanciera}" ya existe, se omitió duplicado`);
        imported++;
        continue;
      }
      
      const productConfig: any = {};
      const plazo = cleanEmptyString(getValue('plazo_meses'));
      if (plazo) productConfig.plazo = plazo;
      const tasaInteres = cleanEmptyString(getValue('tasa_interes'));
      if (tasaInteres) productConfig.tasaInteres = tasaInteres;
      const comisionApertura = cleanEmptyString(getValue('comision_apertura'));
      if (comisionApertura) productConfig.comisionApertura = comisionApertura;
      const destinosStr = cleanEmptyString(getValue('destinos_credito'));
      if (destinosStr) productConfig.destinos = destinosStr.split(';').map((d: string) => d.trim()).filter(Boolean);
      if (montoMin !== undefined) productConfig.montoMinimo = montoMin;
      if (montoMax !== undefined) productConfig.montoMaximo = montoMax;
      if (presencia) productConfig.presencia = presencia;
      if (girosProhibidos) productConfig.girosProhibidos = girosProhibidos;
      
      await storage.createInstitutionProduct({
        templateId: template.id,
        institutionId: financiera.id,
        customName: `${nombreFinanciera} - ${tipoProducto}`,
        configuration: productConfig,
        targetProfiles: [normalizedProfile],
        isActive: true,
        createdBy: userId,
      });
      
      createdIPKeys.add(ipKey);
      imported++;
      
    } catch (error: any) {
      errors.push({ row: rowNum, field: 'general', message: error.message || 'Error al procesar fila', value: nombreFinanciera });
    }
  }
  
  for (const [fiId, reqs] of Object.entries(updatedRequirements)) {
    try {
      const profiles = updatedProfiles[fiId] ? Array.from(updatedProfiles[fiId]) : undefined;
      const updateData: any = { requirements: reqs };
      if (profiles) updateData.acceptedProfiles = profiles;
      await storage.updateFinancialInstitution(fiId, updateData);
    } catch (error: any) {
      warnings.push(`No se pudo actualizar requirements de financiera ${fiId}: ${error.message}`);
    }
  }
  
  for (const [tplId, profiles] of Object.entries(templateProfileUpdates)) {
    try {
      await storage.updateProductTemplate(tplId, { targetProfiles: Array.from(profiles) });
    } catch (error: any) {
      warnings.push(`No se pudo actualizar perfiles de plantilla ${tplId}: ${error.message}`);
    }
  }
  
  return {
    success: imported > 0,
    imported,
    errors,
    warnings
  };
}

export async function importClients(buffer: Buffer, brokerId: string): Promise<ImportResult> {
  const errors: ImportError[] = [];
  const warnings: string[] = [];
  let imported = 0;
  
  const wb = XLSX.read(buffer, { type: 'buffer' });
  
  const validSheets = ['Persona_Moral', 'PFAE', 'Persona_Fisica', 'Sin_SAT'];
  const sheetsToProcess = wb.SheetNames.filter(name => 
    validSheets.includes(name) || (name !== 'Instrucciones' && !validSheets.includes(name))
  );
  
  for (const sheetName of sheetsToProcess) {
    const ws = wb.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
    
    if (jsonData.length < 2) continue;
    
    const headers = jsonData[0].map(h => String(h).toLowerCase().trim());
    const dataRows = jsonData.slice(1).filter(row => row.some(cell => cell !== undefined && cell !== ''));
    
    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const rowNum = i + 2;
      
      const getValue = (field: string): any => {
        const idx = headers.indexOf(field);
        return idx >= 0 && row[idx] !== undefined ? row[idx] : null;
      };
      
      let clientType = getValue('tipo_cliente');
      if (!clientType) {
        if (sheetName === 'Persona_Moral') clientType = 'persona_moral';
        else if (sheetName === 'PFAE') clientType = 'fisica_empresarial';
        else if (sheetName === 'Persona_Fisica') clientType = 'fisica';
        else if (sheetName === 'Sin_SAT') clientType = 'sin_sat';
      }
      
      if (!clientType || !['persona_moral', 'fisica_empresarial', 'fisica', 'sin_sat'].includes(clientType)) {
        errors.push({ row: rowNum, field: 'tipo_cliente', message: 'Tipo de cliente inválido', value: clientType });
        continue;
      }
      
      const nombre = getValue('nombre');
      const apellido = getValue('apellido');
      const nombreEmpresa = getValue('nombre_empresa');
      
      if (!nombre && !nombreEmpresa) {
        errors.push({ row: rowNum, field: 'nombre', message: 'El nombre o nombre de empresa es obligatorio', value: null });
        continue;
      }
      
      try {
        const emailValue = cleanEmptyString(getValue('email'));
        const clientData: any = {
          brokerId,
          type: clientType,
          businessName: cleanEmptyString(nombreEmpresa) || null,
          firstName: cleanEmptyString(nombre) || null,
          lastName: cleanEmptyString(apellido) || null,
          rfc: cleanEmptyString(getValue('rfc')) || null,
          curp: cleanEmptyString(getValue('curp')) || null,
          email: emailValue || null,
          phone: cleanEmptyString(getValue('telefono')) || null,
          street: cleanEmptyString(getValue('calle')) || null,
          number: cleanEmptyString(getValue('numero')) || null,
          interior: cleanEmptyString(getValue('interior')) || null,
          postalCode: cleanEmptyString(getValue('codigo_postal')) || null,
          state: cleanEmptyString(getValue('estado')) || null,
          industry: cleanEmptyString(getValue('industria')) || null,
          yearsInBusiness: getValue('anos_en_negocio') ? parseInt(String(getValue('anos_en_negocio'))) : null,
          notes: cleanEmptyString(getValue('notas')) || null,
          isActive: true,
        };
        
        if (clientType === 'persona_moral' || clientType === 'fisica_empresarial') {
          clientData.ingresoMensualPromedio = getValue('ingreso_mensual_promedio') ? String(getValue('ingreso_mensual_promedio')) : null;
          clientData.egresoMensualPromedio = getValue('egreso_mensual_promedio') ? String(getValue('egreso_mensual_promedio')) : null;
          clientData.ingresoAnual = getValue('ingreso_anual') ? String(getValue('ingreso_anual')) : null;
          clientData.participacionVentasGobierno = getValue('participacion_ventas_gobierno') ? String(getValue('participacion_ventas_gobierno')) : null;
          clientData.ventasTerminalBancaria = getValue('ventas_terminal_bancaria') ? String(getValue('ventas_terminal_bancaria')) : null;
          clientData.buroAccionistaPrincipal = getValue('buro_accionista_principal') ? String(getValue('buro_accionista_principal')) : null;
          clientData.buroEmpresa = getValue('buro_empresa') ? String(getValue('buro_empresa')) : null;
          clientData.atrasosDeudas = getValue('atrasos_deudas') ? String(getValue('atrasos_deudas')) : null;
          clientData.atrasosDetalles = getValue('atrasos_detalles') ? String(getValue('atrasos_detalles')) : null;
          clientData.garantia = getValue('garantia') ? String(getValue('garantia')) : null;
          clientData.avalObligadoSolidario = getValue('aval_obligado_solidario') ? String(getValue('aval_obligado_solidario')) : null;
          clientData.satCiec = getValue('sat_ciec') ? String(getValue('sat_ciec')) : null;
          clientData.estadosFinancieros = getValue('estados_financieros') ? String(getValue('estados_financieros')) : null;
          clientData.opinionCumplimiento = getValue('opinion_cumplimiento') ? String(getValue('opinion_cumplimiento')) : null;
          clientData.creditosVigentes = getValue('creditos_vigentes') ? String(getValue('creditos_vigentes')) : null;
        }
        
        if (clientType === 'fisica') {
          clientData.estadoCivil = getValue('estado_civil') ? String(getValue('estado_civil')) : null;
          clientData.nivelEducativo = getValue('nivel_educativo') ? String(getValue('nivel_educativo')) : null;
          clientData.tipoVivienda = getValue('tipo_vivienda') ? String(getValue('tipo_vivienda')) : null;
          clientData.puesto = getValue('puesto') ? String(getValue('puesto')) : null;
          clientData.antiguedadLaboral = getValue('antiguedad_laboral') ? String(getValue('antiguedad_laboral')) : null;
          clientData.dependientesEconomicos = getValue('dependientes_economicos') ? String(getValue('dependientes_economicos')) : null;
          clientData.ingresoMensualPromedioComprobables = getValue('ingreso_mensual_comprobable') ? String(getValue('ingreso_mensual_comprobable')) : null;
          clientData.ingresoMensualPromedioNoComprobables = getValue('ingreso_mensual_no_comprobable') ? String(getValue('ingreso_mensual_no_comprobable')) : null;
          clientData.gastosFijosMensualesPromedio = getValue('gastos_fijos_mensuales') ? String(getValue('gastos_fijos_mensuales')) : null;
          clientData.buroPersonaFisica = getValue('buro_persona_fisica') ? String(getValue('buro_persona_fisica')) : null;
          clientData.atrasosDeudasBuro = getValue('atrasos_deudas_buro') ? String(getValue('atrasos_deudas_buro')) : null;
          clientData.atrasosDeudasBuroDetalles = getValue('atrasos_deudas_buro_detalles') ? String(getValue('atrasos_deudas_buro_detalles')) : null;
          clientData.cuentaConGarantiaFisica = getValue('cuenta_con_garantia') ? String(getValue('cuenta_con_garantia')) : null;
          clientData.tieneAvalObligadoSolidarioFisica = getValue('tiene_aval_obligado_solidario') ? String(getValue('tiene_aval_obligado_solidario')) : null;
          clientData.creditosVigentes = getValue('creditos_vigentes') ? String(getValue('creditos_vigentes')) : null;
        }
        
        if (clientType === 'sin_sat') {
          clientData.ocupacion = getValue('ocupacion') ? String(getValue('ocupacion')) : null;
          clientData.nombreComercial = getValue('nombre_comercial') ? String(getValue('nombre_comercial')) : null;
          clientData.direccionNegocioAplica = getValue('direccion_negocio_aplica') ? String(getValue('direccion_negocio_aplica')) : null;
          clientData.esMismaDireccionNegocio = getValue('es_misma_direccion_negocio') ? String(getValue('es_misma_direccion_negocio')) : null;
          clientData.calleNegocio = getValue('calle_negocio') ? String(getValue('calle_negocio')) : null;
          clientData.numeroNegocio = getValue('numero_negocio') ? String(getValue('numero_negocio')) : null;
          clientData.interiorNegocio = getValue('interior_negocio') ? String(getValue('interior_negocio')) : null;
          clientData.codigoPostalNegocio = getValue('codigo_postal_negocio') ? String(getValue('codigo_postal_negocio')) : null;
          clientData.estadoNegocio = getValue('estado_negocio') ? String(getValue('estado_negocio')) : null;
          clientData.estadoCivil = getValue('estado_civil') ? String(getValue('estado_civil')) : null;
          clientData.nivelEducativo = getValue('nivel_educativo') ? String(getValue('nivel_educativo')) : null;
          clientData.tipoVivienda = getValue('tipo_vivienda') ? String(getValue('tipo_vivienda')) : null;
          clientData.dependientesEconomicos = getValue('dependientes_economicos') ? String(getValue('dependientes_economicos')) : null;
          clientData.ingresoMensualPromedioComprobablesSinSat = getValue('ingreso_mensual_comprobable') ? String(getValue('ingreso_mensual_comprobable')) : null;
          clientData.ingresoMensualPromedioNoComprobablesSinSat = getValue('ingreso_mensual_no_comprobable') ? String(getValue('ingreso_mensual_no_comprobable')) : null;
          clientData.gastosFijosMensualesPromedioSinSat = getValue('gastos_fijos_mensuales') ? String(getValue('gastos_fijos_mensuales')) : null;
          clientData.buroPersonaFisicaSinSat = getValue('buro_persona_fisica') ? String(getValue('buro_persona_fisica')) : null;
          clientData.atrasosDeudasBuroSinSat = getValue('atrasos_deudas_buro') ? String(getValue('atrasos_deudas_buro')) : null;
          clientData.cuentaConGarantiaSinSat = getValue('cuenta_con_garantia') ? String(getValue('cuenta_con_garantia')) : null;
          clientData.tieneAvalObligadoSolidarioSinSat = getValue('tiene_aval_obligado_solidario') ? String(getValue('tiene_aval_obligado_solidario')) : null;
          clientData.creditosVigentes = getValue('creditos_vigentes') ? String(getValue('creditos_vigentes')) : null;
        }
        
        const importClientSchema = z.object({
          brokerId: z.string().min(1, "Broker ID es requerido"),
          type: z.enum(['persona_moral', 'fisica_empresarial', 'fisica', 'sin_sat'], {
            errorMap: () => ({ message: "Tipo de cliente debe ser: persona_moral, fisica_empresarial, fisica o sin_sat" })
          }),
          businessName: z.string().nullable().optional(),
          firstName: z.string().nullable().optional(),
          lastName: z.string().nullable().optional(),
          rfc: z.string().nullable().optional(),
          curp: z.string().nullable().optional(),
          email: z.union([
            z.string().email("Formato de email inválido"),
            z.null(),
            z.undefined()
          ]).optional(),
          phone: z.string().nullable().optional(),
        }).passthrough();
        
        const basicValidation = importClientSchema.safeParse(clientData);
        
        if (!basicValidation.success) {
          const zodErrors = basicValidation.error.errors;
          for (const zodError of zodErrors) {
            errors.push({
              row: rowNum,
              field: zodError.path.join('.'),
              message: zodError.message,
              value: zodError.path.length > 0 ? (clientData as any)[zodError.path[0]] : (nombre || nombreEmpresa)
            });
          }
          continue;
        }
        
        await storage.createClient(clientData);
        imported++;
        
      } catch (error: any) {
        errors.push({ row: rowNum, field: 'general', message: error.message || 'Error al crear cliente', value: nombre || nombreEmpresa });
      }
    }
  }
  
  return {
    success: imported > 0,
    imported,
    errors,
    warnings
  };
}
