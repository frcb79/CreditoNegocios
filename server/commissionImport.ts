import * as XLSX from 'xlsx';
import { storage } from './storage';

export interface CommissionRowData {
  clave_financiera?: string;
  nombre_financiera: string;
  comision_financiera_total?: number | string;
  comision_financiera_apertura?: number | string;
  comision_financiera_sobretasa?: number | string;
  comision_financiera_renovacion?: number | string;
  comision_master_total?: number | string;
  comision_master_apertura?: number | string;
  comision_master_sobretasa?: number | string;
  comision_master_renovacion?: number | string;
  comision_broker_directo_total?: number | string;
  comision_broker_directo_apertura?: number | string;
  comision_broker_directo_sobretasa?: number | string;
  comision_broker_directo_renovacion?: number | string;
}

export interface CommissionPreviewItem {
  id: string;
  name: string;
  currentRates: {
    financiera: { total: string; apertura: string; sobretasa: string; renovacion: string };
    masterBroker: { total: string; apertura: string; sobretasa: string; renovacion: string };
    broker: { total: string; apertura: string; sobretasa: string; renovacion: string };
  };
  newRates: {
    financiera: { total: string; apertura: string; sobretasa: string; renovacion: string };
    masterBroker: { total: string; apertura: string; sobretasa: string; renovacion: string };
    broker: { total: string; apertura: string; sobretasa: string; renovacion: string };
  };
  warnings: string[];
  isMatched: boolean;
}

function parseRateValue(val: any): string {
  if (val === null || val === undefined || val === '') return '0';
  const cleaned = String(val).replace(/%/g, '').replace(/,/g, '.').trim();
  const num = parseFloat(cleaned);
  return Number.isFinite(num) && num >= 0 ? num.toString() : '0';
}

/**
 * Generates an Excel workbook template pre-filled with all active financial institutions
 * and their current commission settings for Super Admin to edit.
 */
export async function generateCommissionsTemplate(): Promise<Buffer> {
  const institutions = await storage.getFinancialInstitutions();

  const dataRows: any[] = [];

  for (const fi of institutions) {
    const commRates = (fi.commissionRates as any) || {};
    const fin = commRates.financiera || {};
    const mb = commRates.masterBroker || {};
    const brk = commRates.broker || {};

    dataRows.push({
      'Clave_Financiera': fi.id,
      'Nombre_Financiera': fi.name,
      'Comision_Financiera_Total_%': fin.total || fi.commissionRate?.toString() || '0',
      'Comision_Financiera_Apertura_%': fin.apertura || fi.openingCommissionRate || '0',
      'Comision_Financiera_Sobretasa_%': fin.sobretasa || fi.overrateCommissionRate || '0',
      'Comision_Financiera_Renovacion_%': fin.renovacion || '0',
      'Comision_MasterBroker_Total_%': mb.total || '0',
      'Comision_MasterBroker_Apertura_%': mb.apertura || fi.masterBrokerCommissionRate || '0',
      'Comision_MasterBroker_Sobretasa_%': mb.sobretasa || '0',
      'Comision_MasterBroker_Renovacion_%': mb.renovacion || '0',
      'Comision_BrokerDirecto_Total_%': brk.total || '0',
      'Comision_BrokerDirecto_Apertura_%': brk.apertura || fi.brokerCommissionRate || '0',
      'Comision_BrokerDirecto_Sobretasa_%': brk.sobretasa || '0',
      'Comision_BrokerDirecto_Renovacion_%': brk.renovacion || '0',
    });
  }

  // Fallback if no institutions exist yet
  if (dataRows.length === 0) {
    dataRows.push({
      'Clave_Financiera': 'ejemplo-id',
      'Nombre_Financiera': 'Financiera Ejemplo',
      'Comision_Financiera_Total_%': '4.0',
      'Comision_Financiera_Apertura_%': '3.0',
      'Comision_Financiera_Sobretasa_%': '1.0',
      'Comision_Financiera_Renovacion_%': '1.0',
      'Comision_MasterBroker_Total_%': '3.0',
      'Comision_MasterBroker_Apertura_%': '3.0',
      'Comision_MasterBroker_Sobretasa_%': '0.5',
      'Comision_MasterBroker_Renovacion_%': '0.5',
      'Comision_BrokerDirecto_Total_%': '2.0',
      'Comision_BrokerDirecto_Apertura_%': '2.0',
      'Comision_BrokerDirecto_Sobretasa_%': '0.0',
      'Comision_BrokerDirecto_Renovacion_%': '0.5',
    });
  }

  const wb = XLSX.utils.book_new();

  // Instructions sheet
  const instructions = [
    { 'Instrucción': 'PLANTILLA OFICIAL DE COMISIONES POR FINANCIERA Y RED' },
    { 'Instrucción': '1. No modifiques la columna Clave_Financiera si ya existe, ya que liga directamente al registro.' },
    { 'Instrucción': '2. Ingresa los porcentajes en números (ejemplo: 2.5, 3.0, 1.0) sin incluir el símbolo %.' },
    { 'Instrucción': '3. Comision_Financiera: Lo que la entidad otorga a Crédito Negocios (Casa Matriz).' },
    { 'Instrucción': '4. Comision_MasterBroker: Techo comercial otorgado a franquicias y redes Master Broker (ej. 3.0%).' },
    { 'Instrucción': '5. Comision_BrokerDirecto: Lo que se ofrece a brokers directos independientes adscritos a Casa Matriz (ej. 2.0%).' },
    { 'Instrucción': '6. La ganancia neta de Crédito Negocios será la diferencia entre lo que paga la Financiera y lo asignado al canal.' },
  ];
  const wsInst = XLSX.utils.json_to_sheet(instructions);
  XLSX.utils.book_append_sheet(wb, wsInst, 'Instrucciones');

  const wsData = XLSX.utils.json_to_sheet(dataRows);
  XLSX.utils.book_append_sheet(wb, wsData, 'Comisiones');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

/**
 * Parses and previews changes from an uploaded commissions Excel file.
 */
export async function previewCommissionsFile(buffer: Buffer): Promise<{
  preview: CommissionPreviewItem[];
  totalRows: number;
  matchedCount: number;
  unmatchedCount: number;
  warningsCount: number;
}> {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = wb.Sheets['Comisiones'] ? 'Comisiones' : (wb.SheetNames.find(n => n !== 'Instrucciones') || wb.SheetNames[0]);
  const ws = wb.Sheets[sheetName];
  const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

  const institutions = await storage.getFinancialInstitutions();
  const instMapById = new Map(institutions.map(i => [i.id, i]));
  const instMapByName = new Map(institutions.map(i => [i.name.trim().toLowerCase(), i]));

  const preview: CommissionPreviewItem[] = [];
  let warningsCount = 0;
  let matchedCount = 0;

  for (const r of rows) {
    const rawKey = String(r['Clave_Financiera'] || r['clave_financiera'] || r['ID'] || r['id'] || '').trim();
    const rawName = String(r['Nombre_Financiera'] || r['nombre_financiera'] || r['Financiera'] || r['financiera'] || '').trim();

    if (!rawKey && !rawName) continue;

    let matchedInst = instMapById.get(rawKey);
    if (!matchedInst && rawName) {
      matchedInst = instMapByName.get(rawName.toLowerCase());
    }

    const currentComm = (matchedInst?.commissionRates as any) || {};
    const curFin = currentComm.financiera || {};
    const curMb = currentComm.masterBroker || {};
    const curBrk = currentComm.broker || {};

    const currentRates = {
      financiera: {
        total: String(curFin.total || matchedInst?.commissionRate || '0'),
        apertura: String(curFin.apertura || matchedInst?.openingCommissionRate || '0'),
        sobretasa: String(curFin.sobretasa || matchedInst?.overrateCommissionRate || '0'),
        renovacion: String(curFin.renovacion || '0'),
      },
      masterBroker: {
        total: String(curMb.total || '0'),
        apertura: String(curMb.apertura || matchedInst?.masterBrokerCommissionRate || '0'),
        sobretasa: String(curMb.sobretasa || '0'),
        renovacion: String(curMb.renovacion || '0'),
      },
      broker: {
        total: String(curBrk.total || '0'),
        apertura: String(curBrk.apertura || matchedInst?.brokerCommissionRate || '0'),
        sobretasa: String(curBrk.sobretasa || '0'),
        renovacion: String(curBrk.renovacion || '0'),
      },
    };

    const newRates = {
      financiera: {
        total: parseRateValue(r['Comision_Financiera_Total_%'] ?? r['comision_financiera_total'] ?? currentRates.financiera.total),
        apertura: parseRateValue(r['Comision_Financiera_Apertura_%'] ?? r['comision_financiera_apertura'] ?? currentRates.financiera.apertura),
        sobretasa: parseRateValue(r['Comision_Financiera_Sobretasa_%'] ?? r['comision_financiera_sobretasa'] ?? currentRates.financiera.sobretasa),
        renovacion: parseRateValue(r['Comision_Financiera_Renovacion_%'] ?? r['comision_financiera_renovacion'] ?? currentRates.financiera.renovacion),
      },
      masterBroker: {
        total: parseRateValue(r['Comision_MasterBroker_Total_%'] ?? r['comision_master_total'] ?? currentRates.masterBroker.total),
        apertura: parseRateValue(r['Comision_MasterBroker_Apertura_%'] ?? r['comision_master_apertura'] ?? currentRates.masterBroker.apertura),
        sobretasa: parseRateValue(r['Comision_MasterBroker_Sobretasa_%'] ?? r['comision_master_sobretasa'] ?? currentRates.masterBroker.sobretasa),
        renovacion: parseRateValue(r['Comision_MasterBroker_Renovacion_%'] ?? r['comision_master_renovacion'] ?? currentRates.masterBroker.renovacion),
      },
      broker: {
        total: parseRateValue(r['Comision_BrokerDirecto_Total_%'] ?? r['comision_broker_directo_total'] ?? currentRates.broker.total),
        apertura: parseRateValue(r['Comision_BrokerDirecto_Apertura_%'] ?? r['comision_broker_directo_apertura'] ?? currentRates.broker.apertura),
        sobretasa: parseRateValue(r['Comision_BrokerDirecto_Sobretasa_%'] ?? r['comision_broker_directo_sobretasa'] ?? currentRates.broker.sobretasa),
        renovacion: parseRateValue(r['Comision_BrokerDirecto_Renovacion_%'] ?? r['comision_broker_directo_renovacion'] ?? currentRates.broker.renovacion),
      },
    };

    const warnings: string[] = [];
    if (!matchedInst) {
      warnings.push(`La financiera "${rawName || rawKey}" no existe en el catálogo. Se omitirá hasta que sea dada de alta.`);
    } else {
      matchedCount++;
      const finAp = parseFloat(newRates.financiera.apertura);
      const mbAp = parseFloat(newRates.masterBroker.apertura);
      const brkAp = parseFloat(newRates.broker.apertura);

      if (mbAp > finAp) {
        warnings.push(`Comisión Master Broker (${mbAp}%) supera lo otorgado por la Financiera (${finAp}%). Margen negativo.`);
      }
      if (brkAp > finAp) {
        warnings.push(`Comisión Bróker Directo (${brkAp}%) supera lo otorgado por la Financiera (${finAp}%). Margen negativo.`);
      }
      if (brkAp > mbAp && mbAp > 0) {
        warnings.push(`Comisión Bróker Directo (${brkAp}%) es mayor que la de Master Bróker (${mbAp}%). Los Master Brokers requieren mayor margen.`);
      }
    }

    if (warnings.length > 0) warningsCount++;

    preview.push({
      id: matchedInst ? matchedInst.id : rawKey || 'no-id',
      name: matchedInst ? matchedInst.name : rawName || 'Desconocida',
      currentRates,
      newRates,
      warnings,
      isMatched: !!matchedInst,
    });
  }

  return {
    preview,
    totalRows: rows.length,
    matchedCount,
    unmatchedCount: rows.length - matchedCount,
    warningsCount,
  };
}

/**
 * Imports and applies commission updates to all matched financial institutions.
 */
export async function importCommissionsFile(buffer: Buffer): Promise<{
  success: boolean;
  updatedCount: number;
  skippedCount: number;
  errors: string[];
}> {
  const { preview } = await previewCommissionsFile(buffer);

  let updatedCount = 0;
  let skippedCount = 0;
  const errors: string[] = [];

  for (const item of preview) {
    if (!item.isMatched || !item.id) {
      skippedCount++;
      continue;
    }

    try {
      await storage.updateFinancialInstitution(item.id, {
        commissionRates: item.newRates,
        openingCommissionRate: item.newRates.financiera.apertura,
        overrateCommissionRate: item.newRates.financiera.sobretasa,
        masterBrokerCommissionRate: item.newRates.masterBroker.apertura,
        brokerCommissionRate: item.newRates.broker.apertura,
        commissionRate: item.newRates.financiera.total ? item.newRates.financiera.total : undefined,
      });
      updatedCount++;
    } catch (err: any) {
      errors.push(`Error actualizando ${item.name}: ${err?.message || 'Error desconocido'}`);
    }
  }

  return {
    success: errors.length === 0,
    updatedCount,
    skippedCount,
    errors,
  };
}
