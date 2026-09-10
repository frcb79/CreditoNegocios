import path from 'path';
import fs from 'fs';
import { parseSocExcel, syncSocFinancierasToDatabase } from '../server/socFinancierasParser';

async function main() {
  const filePath = path.resolve(process.cwd(), 'attached_assets', 'Fichas técnicas fiancieras SOC.xlsx');

  if (!fs.existsSync(filePath)) {
    console.error(`[Error] No se encontró el archivo en: ${filePath}`);
    process.exit(1);
  }

  console.log(`[SOC Import] Leyendo fichas técnicas desde: ${filePath}...`);
  const parsed = parseSocExcel(filePath);

  console.log(`[SOC Import] Se detectaron ${parsed.length} instituciones financieras con un total de ${parsed.reduce((s, i) => s + i.products.length, 0)} productos crediticios en 6 modalidades.`);

  console.log('\n--- DETALLE DE INSTITUCIONES Y PRODUCTOS DETECTADOS ---');
  for (const inst of parsed) {
    console.log(`\n🏢 ${inst.name} (${inst.products.length} productos):`);
    for (const p of inst.products) {
      console.log(`   - [${p.sheetName}] ${p.productType} | Monto: $${p.montoMinimo?.toLocaleString() ?? '?'} - $${p.montoMaximo?.toLocaleString() ?? '?'} | Plazo: ${p.plazo || 'N/A'}`);
    }
  }

  console.log('\n[SOC Import] Sincronizando con la base de datos (con respaldo preventivo)...');
  const result = await syncSocFinancierasToDatabase(parsed, { purgeOldMockData: true });

  console.log('\n========================================');
  console.log('✅ SINCRONIZACIÓN EXITOSA DE FINANCIERAS SOC');
  console.log('========================================');
  console.log(`Instituciones Creadas: ${result.createdCount}`);
  console.log(`Instituciones Actualizadas: ${result.updatedCount}`);
  console.log(`Total Productos Vinculados: ${result.totalProductsCount}`);
  console.log(`Respaldo de Seguridad: ${result.backupPath}`);
  console.log('========================================\n');
}

main().catch(err => {
  console.error('[Error fatal en importación SOC]:', err);
  process.exit(1);
});
