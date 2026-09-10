import * as XLSX from 'xlsx';
import { storage } from './storage';
import fs from 'fs';
import path from 'path';

export interface SocProductParsed {
  sheetName: string;
  category: string; // "simple" | "revolvente" | "arrendamiento" | "factoraje" | "hipotecario" | "anticipo_ventas"
  institutionName: string;
  productType: string;
  destinos: string;
  montoMinimo: number | null;
  montoMaximo: number | null;
  girosMayorAprobacion: string;
  plazo: string;
  plazoMesesMax: number | null;
  comisionApertura: string;
  tasaInteres: string;
  presencia: string;
  girosProhibidos: string;
  garantia: string;
  tiempoRespuesta: string;
  edadMinima: number | null;
  edadMaxima: number | null;
  antiguedadEmpresa: string;
  antiguedadMesesMin: number | null;
  ingresos: string;
  ingresoMensualMin: number | null;
  buro: string;
  buroMin: number | null;
  observaciones: string;
}

export interface SocInstitutionParsed {
  name: string;
  products: SocProductParsed[];
  presencia: string;
  tiempoRespuesta: string;
  girosProhibidos: string;
  openingCommissionRate: string;
  description: string;
  acceptedProfiles: string[];
  requirements: Record<string, any>;
}

function cleanText(v: any): string {
  if (v === null || v === undefined) return '';
  return String(v).replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

function parseAmount(v: any, isMax = false): number | null {
  if (v === null || v === undefined) return null;
  const raw = cleanText(v);
  if (!raw || /sin monto m[aá]ximo/i.test(raw)) return null;

  // Normalize common notations and strip diacritics
  const normalized = raw
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[$]/g, '')
    .replace(/150,00\s*mxn/i, '150000')
    .replace(/,/g, '')
    .replace(/\.00\b/g, '');

  const regex = /(\d+(?:\.\d+)?)\s*(mdp|millon(?:es)?|mil)?/gi;
  const amounts: number[] = [];
  let m: RegExpExecArray | null;

  while ((m = regex.exec(normalized)) !== null) {
    let num = parseFloat(m[1]);
    if (!Number.isFinite(num)) continue;

    const unit = (m[2] || '').toLowerCase();
    if (unit.includes('mdp') || unit.includes('millon')) {
      num *= 1000000;
    } else if (unit.includes('mil')) {
      num *= 1000;
    }

    if (num >= 10000) {
      amounts.push(Math.round(num));
    }
  }

  if (!amounts.length) return null;
  return isMax ? Math.max(...amounts) : Math.min(...amounts);
}

function parseMonths(v: any): number | null {
  const text = cleanText(v).toLowerCase();
  const nums = (text.match(/\d+(?:\.\d+)?/g) || []).map(Number).filter(Number.isFinite);
  if (!nums.length) return null;
  return Math.round(Math.max(...nums));
}

function parseYearsToMonths(v: any): number | null {
  const text = cleanText(v).toLowerCase();
  const nums = (text.match(/\d+(?:\.\d+)?/g) || []).map(Number).filter(Number.isFinite);
  if (!nums.length) return null;
  let min = Math.min(...nums);
  if (text.includes('año')) min *= 12;
  return Math.round(min);
}

function parseAges(v: any): { min: number | null; max: number | null } {
  const text = cleanText(v);
  const nums = (text.match(/\d+/g) || []).map(Number).filter(n => n >= 18 && n <= 100);
  if (!nums.length) return { min: null, max: null };
  return {
    min: Math.min(...nums),
    max: nums.length > 1 ? Math.max(...nums) : null
  };
}

function parseBuroScore(v: any): number | null {
  const text = cleanText(v);
  const match = text.match(/(?:score|buro|mínimo|minimo)?\s*(\d{3})/i);
  if (match) {
    const score = parseInt(match[1], 10);
    if (score >= 300 && score <= 850) return score;
  }
  return null;
}

function getCategoryFromSheet(sheetName: string): string {
  const s = sheetName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (s.includes('revolvente')) return 'revolvente';
  if (s.includes('arrendamiento')) return 'arrendamiento';
  if (s.includes('factoraje')) return 'factoraje';
  if (s.includes('hipotecario')) return 'hipotecario';
  if (s.includes('anticipo') || s.includes('ventas')) return 'anticipo_ventas';
  return 'simple';
}

function normalizeInstitutionName(raw: string): string {
  let name = cleanText(raw);
  // Clean trailing punctuation and spaces
  name = name.replace(/^[-\s]+|[-\s]+$/g, '');
  if (/^banorte/i.test(name)) return 'Banorte';
  if (/^afirme/i.test(name)) return 'AFIRME';
  if (/^konf[ií]o/i.test(name)) return 'Konfío';
  if (/^fondeadora/i.test(name)) return 'Fondeadora';
  if (/^pdn/i.test(name)) return 'PDN';
  if (/^covalto/i.test(name)) return 'Covalto';
  if (/^hey/i.test(name)) return 'Hey Banco';
  if (/^finsus/i.test(name)) return 'Finsus';
  if (/^finbe/i.test(name)) return 'FinBe ABC';
  if (/^anticipa/i.test(name)) return 'Anticipa (Finsus)';
  if (/^axionex/i.test(name)) return 'Axionex';
  if (/^finkargo/i.test(name)) return 'FinKargo';
  if (/^engen/i.test(name)) return 'Engen Capital';
  if (/^bx\+/i.test(name)) return 'Ve por Más (Bx+)';
  if (/^imagina/i.test(name)) return 'Imagina Leasing';
  if (/^unifin/i.test(name)) return 'Unifin';
  if (/^xepelin/i.test(name)) return 'Xepelin';
  if (/^hay\s*cash/i.test(name)) return 'Hay Cash';
  return name;
}

/**
 * Parses all 6 sheets of the official SOC technical fichas Excel workbook.
 */
export function parseSocExcel(filePathOrBuffer: string | Buffer): SocInstitutionParsed[] {
  const buffer = typeof filePathOrBuffer === 'string'
    ? fs.readFileSync(filePathOrBuffer)
    : filePathOrBuffer;
  const wb = XLSX.read(buffer, { type: 'buffer' });

  const allProducts: SocProductParsed[] = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;

    // Convert sheet to row-column matrix
    const matrix: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (!matrix || matrix.length < 3) continue;

    // Create a list by row parameter label (Row 0 / Col 0)
    const labelRows: Array<{ label: string; row: any[] }> = [];
    for (let r = 0; r < matrix.length; r++) {
      const row = matrix[r];
      if (!row || !row[0]) continue;
      const label = cleanText(row[0]).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      labelRows.push({ label, row });
    }

    const rowInstituciones = matrix[1] || []; // Row 2 (0-indexed 1)
    const rowTipoCredito = matrix[2] || [];   // Row 3 (0-indexed 2)

    const getParamValue = (labelKeyword: string, colIdx: number): string => {
      for (let i = 0; i < labelRows.length; i++) {
        if (labelRows[i].label.includes(labelKeyword)) {
          return cleanText(labelRows[i].row[colIdx]);
        }
      }
      return '';
    };

    const category = getCategoryFromSheet(sheetName);

    // Columns with financial institutions start at col index 1 (B)
    for (let col = 1; col < rowInstituciones.length; col++) {
      const rawInst = cleanText(rowInstituciones[col]);
      if (!rawInst || rawInst.length < 2) continue;

      const instName = normalizeInstitutionName(rawInst);
      const productType = cleanText(rowTipoCredito[col]) || `Crédito ${sheetName}`;

      const destinos = getParamValue('destino', col);
      const montoMin = parseAmount(getParamValue('minimo', col), false);
      const montoMax = parseAmount(getParamValue('maximo', col), true);
      const girosMayorAprobacion = getParamValue('mayor aprobacion', col);
      const plazo = getParamValue('plazo', col);
      const plazoMeses = parseMonths(plazo);
      const comisionApertura = getParamValue('comision', col);
      const tasaInteres = getParamValue('tasa', col);
      const presencia = getParamValue('presencia', col);
      const girosProhibidos = getParamValue('giros prohibidos', col);
      const garantia = getParamValue('garantia', col);
      const tiempoRespuesta = getParamValue('tiempo de respuesta', col);
      const ages = parseAges(getParamValue('edad', col));
      const antiguedad = getParamValue('antiguedad', col);
      const antiguedadMeses = parseYearsToMonths(antiguedad);
      const ingresos = getParamValue('ingreso', col);
      const ingresoMin = parseAmount(ingresos);
      const buro = getParamValue('buro', col);
      const buroMin = parseBuroScore(buro);
      const observaciones = getParamValue('observacion', col);

      allProducts.push({
        sheetName,
        category,
        institutionName: instName,
        productType,
        destinos,
        montoMinimo: montoMin,
        montoMaximo: montoMax,
        girosMayorAprobacion,
        plazo,
        plazoMesesMax: plazoMeses,
        comisionApertura,
        tasaInteres,
        presencia,
        girosProhibidos,
        garantia,
        tiempoRespuesta,
        edadMinima: ages.min,
        edadMaxima: ages.max,
        antiguedadEmpresa: antiguedad,
        antiguedadMesesMin: antiguedadMeses,
        ingresos,
        ingresoMensualMin: ingresoMin,
        buro,
        buroMin,
        observaciones,
      });
    }
  }

  // Group by unique institution name
  const instMap = new Map<string, SocInstitutionParsed>();

  for (const prod of allProducts) {
    if (!instMap.has(prod.institutionName)) {
      instMap.set(prod.institutionName, {
        name: prod.institutionName,
        products: [],
        presencia: prod.presencia || 'Nacional',
        tiempoRespuesta: prod.tiempoRespuesta || '2 a 5 días',
        girosProhibidos: prod.girosProhibidos || '',
        openingCommissionRate: prod.comisionApertura || '2.0',
        description: prod.observaciones || `Institución financiera aliada con oferta en ${prod.sheetName}`,
        acceptedProfiles: ['persona_moral', 'fisica_empresarial'],
        requirements: {
          buro_min: prod.buroMin || 600,
          antiguedad_meses_min: prod.antiguedadMesesMin || 24,
          ingreso_mensual_min: prod.ingresoMensualMin || 100000,
          edad_minima: prod.edadMinima || 25,
          edad_maxima: prod.edadMaxima || 65,
          garantia: prod.garantia || 'Sin garantía requerida según producto',
          giros_prohibidos: prod.girosProhibidos || '',
        }
      });
    }

    const inst = instMap.get(prod.institutionName)!;
    inst.products.push(prod);
    if (prod.presencia && !inst.presencia) inst.presencia = prod.presencia;
    if (prod.girosProhibidos && !inst.girosProhibidos) inst.girosProhibidos = prod.girosProhibidos;
  }

  return Array.from(instMap.values());
}

/**
 * Creates a safety backup of existing financial institutions to a JSON file.
 */
export async function backupExistingFinancieras(): Promise<string> {
  const existing = await storage.getFinancialInstitutions();
  const backupDir = path.resolve(process.cwd(), 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `backup_financieras_${timestamp}.json`);

  fs.writeFileSync(backupPath, JSON.stringify(existing, null, 2), 'utf-8');
  console.log(`[Backup] Respaldo de ${existing.length} financieras guardado en: ${backupPath}`);
  return backupPath;
}

export const UNIFIED_PRODUCT_TEMPLATES = [
  {
    category: 'simple',
    name: 'Crédito Simple',
    description: 'Financiamiento a plazo fijo con amortizaciones mensuales de capital e intereses para capital de trabajo o activo fijo.',
    targetProfiles: ['persona_moral', 'fisica_empresarial', 'fisica'],
  },
  {
    category: 'revolvente',
    name: 'Crédito Revolvente',
    description: 'Línea de crédito flexible y revolvente para cubrir requerimientos temporales de tesorería y liquidez inmediata.',
    targetProfiles: ['persona_moral', 'fisica_empresarial'],
  },
  {
    category: 'arrendamiento',
    name: 'Arrendamiento Puro / Financiero',
    description: 'Arrendamiento de maquinaria, flotillas, equipo pesado y tecnología con deducibilidad fiscal.',
    targetProfiles: ['persona_moral', 'fisica_empresarial'],
  },
  {
    category: 'factoraje',
    name: 'Factoraje Financiero',
    description: 'Anticipo inmediato de cuentas por cobrar a clientes mediante la cesión y descuento de facturas.',
    targetProfiles: ['persona_moral', 'fisica_empresarial'],
  },
  {
    category: 'hipotecario',
    name: 'Hipotecario Empresarial',
    description: 'Crédito para adquisición, construcción o remodelación de bodegas, oficinas y naves industriales con garantía inmobiliaria.',
    targetProfiles: ['persona_moral', 'fisica_empresarial'],
  },
  {
    category: 'anticipo_ventas',
    name: 'Anticipo de Ventas (Terminal TPV)',
    description: 'Financiamiento ágil con base en el flujo promedio de facturación procesado mediante terminales punto de venta.',
    targetProfiles: ['persona_moral', 'fisica_empresarial', 'sin_sat'],
  },
];

/**
 * Imports the parsed SOC institutions and their products into the database.
 */
export async function syncSocFinancierasToDatabase(
  parsedInstitutions: SocInstitutionParsed[],
  options: { purgeOldMockData?: boolean } = {}
): Promise<{
  createdCount: number;
  updatedCount: number;
  totalProductsCount: number;
  backupPath: string;
}> {
  // 1. Always create backup first
  const backupPath = await backupExistingFinancieras();

  let createdCount = 0;
  let updatedCount = 0;
  let totalProductsCount = 0;

  // 2. Ensure the 6 Unified Product Templates exist in product_templates
  const existingTemplates = await storage.getProductTemplates();
  const templateMap = new Map<string, string>(); // category -> templateId

  for (const unified of UNIFIED_PRODUCT_TEMPLATES) {
    let t = existingTemplates.find(
      x => x.category === unified.category || 
           x.name.toLowerCase().includes(unified.name.toLowerCase())
    );
    if (!t) {
      t = await storage.createProductTemplate({
        name: unified.name,
        description: unified.description,
        category: unified.category,
        targetProfiles: unified.targetProfiles,
        isActive: true,
        createdBy: "user-super-admin",
      });
      console.log(`[Product Templates] Plantilla unificada creada: ${unified.name}`);
    }
    templateMap.set(unified.category, t.id);
  }

  const existingInstitutions = await storage.getFinancialInstitutions();
  const existingMap = new Map(existingInstitutions.map(i => [i.name.toLowerCase().trim(), i]));

  // If purging mock data, deactivate institutions not in the official SOC file
  if (options.purgeOldMockData) {
    const officialNames = new Set(parsedInstitutions.map(p => p.name.toLowerCase().trim()));
    for (const oldFi of existingInstitutions) {
      if (!officialNames.has(oldFi.name.toLowerCase().trim()) && oldFi.isActive) {
        await storage.updateFinancialInstitution(oldFi.id, {
          isActive: false,
          notes: `[Desactivada por migración SOC] Data no oficial reemplazada el ${new Date().toLocaleDateString('es-MX')}`
        });
      }
    }
  }

  for (const parsed of parsedInstitutions) {
    const existing = existingMap.get(parsed.name.toLowerCase().trim());
    totalProductsCount += parsed.products.length;

    // Build standard products list structure for JSONB
    const formattedProducts = parsed.products.map((p, idx) => ({
      id: `${parsed.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_p${idx + 1}`,
      name: `${p.productType} (${p.sheetName})`,
      category: p.category,
      minAmount: p.montoMinimo,
      maxAmount: p.montoMaximo,
      minTerm: 6,
      maxTerm: p.plazoMesesMax || 60,
      interestRate: p.tasaInteres,
      openingCommission: p.comisionApertura,
      destinos: p.destinos,
      observaciones: p.observaciones,
      garantia: p.garantia,
    }));

    // Build default commission rates structure
    // Financiera pays 4.0% default (or openingCommissionRate), Master Broker 3.0%, Direct Broker 2.0%
    const defaultFinTotal = parseFloat(parsed.openingCommissionRate) > 0 ? parsed.openingCommissionRate : "4.0";
    const defaultCommissionRates = existing?.commissionRates && Object.keys(existing.commissionRates).length > 0
      ? existing.commissionRates
      : {
          financiera: { total: defaultFinTotal, apertura: parsed.openingCommissionRate || "2.5", sobretasa: "1.0", renovacion: "1.0" },
          masterBroker: { total: "3.0", apertura: "2.5", sobretasa: "0.5", renovacion: "0.5" },
          broker: { total: "2.0", apertura: "2.0", sobretasa: "0.0", renovacion: "0.5" },
        };

    let instId: string;

    if (existing) {
      // Update existing with verified real SOC data
      await storage.updateFinancialInstitution(existing.id, {
        name: parsed.name,
        description: parsed.description,
        openingCommissionRate: parsed.openingCommissionRate,
        commissionRates: defaultCommissionRates,
        products: formattedProducts,
        requirements: parsed.requirements,
        acceptedProfiles: parsed.acceptedProfiles,
        isActive: true,
      });
      instId = existing.id;
      updatedCount++;
    } else {
      // Insert new verified institution
      const newInst = await storage.createFinancialInstitution({
        name: parsed.name,
        description: parsed.description,
        openingCommissionRate: parsed.openingCommissionRate,
        brokerCommissionRate: "2.0",
        masterBrokerCommissionRate: "3.0",
        commissionRates: defaultCommissionRates,
        products: formattedProducts,
        requirements: parsed.requirements,
        acceptedProfiles: parsed.acceptedProfiles,
        isActive: true,
      });
      instId = newInst.id;
      createdCount++;
    }

    // Link each product to institution_products via the unified template
    for (const p of parsed.products) {
      const templateId = templateMap.get(p.category);
      if (templateId) {
        try {
          const existingInstProds = await storage.getInstitutionProducts(instId);
          const alreadyLinked = existingInstProds?.some(ip => ip.templateId === templateId);
          if (!alreadyLinked) {
            await storage.createInstitutionProduct({
              institutionId: instId,
              templateId,
              customName: `${parsed.name} - ${p.productType}`,
              isActive: true,
              targetProfiles: parsed.acceptedProfiles || ['persona_moral', 'fisica_empresarial'],
              configuration: {
                minAmount: p.montoMinimo,
                maxAmount: p.montoMaximo,
                minTerm: 6,
                maxTerm: p.plazoMesesMax || 60,
                interestRate: p.tasaInteres,
                openingCommission: p.comisionApertura,
              },
              createdBy: "user-super-admin",
            });
          }
        } catch (err) {
          // Continue if already mapped
        }
      }
    }
  }

  return {
    createdCount,
    updatedCount,
    totalProductsCount,
    backupPath,
  };
}
