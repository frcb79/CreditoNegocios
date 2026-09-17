#!/usr/bin/env node
import { executeBackfill, validatePostBackfill } from "../server/backfillService";

console.log("======================================================================");
console.log("  BLOQUE 2: BACKFILL DE ORGANIZACIONES Y MEMBRESÍAS DE USUARIOS");
console.log("======================================================================\n");

// Parse CLI flags
const args = process.argv.slice(2);
const isApply = args.includes("--apply");
const isJson = args.includes("--json");

// 1. Verificación estricta de seguridad de entorno
const targetUrl = process.env.STAGING_DATABASE_URL || process.env.TEST_DATABASE_URL;

if (!targetUrl) {
  console.error("❌ ERROR DE SEGURIDAD:");
  console.error("   Este script está restringido a entornos de Staging o Test.");
  console.error("   Debes definir explícitamente STAGING_DATABASE_URL o TEST_DATABASE_URL.\n");
  console.error("   PowerShell:");
  console.error('   $env:STAGING_DATABASE_URL = "postgresql://user:pass@host:5432/dbname"');
  console.error("   npx tsx scripts/backfill-user-organizations.ts [--apply]\n");
  process.exit(1);
}

// Bloqueo estricto de producción (sin override permitido en Bloque 2)
const lowerUrl = targetUrl.toLowerCase();
if (lowerUrl.includes("prod") || process.env.NODE_ENV === "production") {
  console.error("⛔ ERROR DE SEGURIDAD CRÍTICO:");
  console.error("   La URL de base de datos o NODE_ENV indica un entorno de PRODUCCIÓN.");
  console.error("   En el Bloque 2 está terminantemente prohibido ejecutar contra producción.");
  console.error("   La migración debe validarse primero en staging.");
  process.exit(1);
}

// Configurar URL en entorno para que DbStorage conecte a este destino
process.env.DATABASE_URL = targetUrl;
delete process.env.USE_MEMORY_STORAGE;

(async () => {
  const { pool } = await import("../server/db");
  const { DbStorage } = await import("../server/dbStorage");
  const { runAutoMigration } = await import("../server/autoMigrate");

  const modeText = isApply ? "APPLY (EJECUCIÓN REAL CON ESCRITURA)" : "DRY RUN (SOLO LECTURA - SIMULACIÓN)";
  console.log(`[MODO] ${modeText}\n`);

  try {
    console.log("[1/4] Verificando tablas DDL mediante auto-migración...");
    await runAutoMigration();
    console.log("  ✓ Tablas y estructura verificadas.\n");

    const storage = new DbStorage();

    console.log("[2/4] Ejecutando análisis de usuarios y organizaciones...");
    const result = await executeBackfill({
      storage,
      dryRun: !isApply,
      onLog: (msg) => console.log(`  ${msg}`),
    });

    const s = result.summary;

    console.log("\n======================== REPORTE DE AUDITORÍA ========================");
    console.log(`Total Usuarios analizados:               ${s.totalUsers}`);
    console.log(`  - Super Administradores:               ${s.superAdmins}`);
    console.log(`  - Administradores:                     ${s.admins}`);
    console.log(`  - Master Brokers:                      ${s.masterBrokers}`);
    console.log(`  - Brokers:                             ${s.brokers}`);
    if (s.otherUsers > 0) {
      console.log(`  - Otros roles (anomalías):             ${s.otherUsers}`);
    }
    console.log("----------------------------------------------------------------------");
    console.log(`Tenant Platform ('Crédito Negocios'):   ${s.platformTenantAction.toUpperCase()}`);
    console.log(`Tenants Master Broker:`);
    console.log(`  - Existentes (reutilizados):           ${s.masterTenantsExisting}`);
    console.log(`  - A crear:                             ${s.masterTenantsToCreate}`);
    console.log(`Tenants Broker:`);
    console.log(`  - Existentes (reutilizados):           ${s.brokerTenantsExisting}`);
    console.log(`  - A crear:                             ${s.brokerTenantsToCreate}`);
    console.log("----------------------------------------------------------------------");
    console.log(`Membresías:`);
    console.log(`  - Existentes (reutilizadas):           ${s.membershipsExisting}`);
    console.log(`  - A crear:                             ${s.membershipsToCreate}`);
    console.log("----------------------------------------------------------------------");
    console.log(`Jerarquía de Red (Brokers):`);
    console.log(`  - Broker → Master Broker:              ${s.brokerToMasterCount}`);
    console.log(`  - Broker → Platform (directos):        ${s.brokerToPlatformDirectCount}`);
    console.log(`  - masterBrokerId inválido/anómalo:     ${s.invalidMasterBrokerIdCount}`);
    console.log("======================================================================\n");

    if (s.anomalies.length > 0) {
      console.log("⚠️  ANOMALÍAS / CASOS ESPECIALES DETECTADOS:");
      for (const a of s.anomalies) {
        console.log(`  • [${a.type}] Usuario ${a.userId}: ${a.description}`);
      }
      console.log("");
    }

    if (isApply) {
      console.log("[3/4] Validando integridad post-migración...");
      const validation = await validatePostBackfill(storage);
      if (!validation.valid) {
        console.error("❌ ERRORES DE INTEGRIDAD POST-BACKFILL:");
        for (const err of validation.errors) {
          console.error(`  - ${err}`);
        }
        process.exitCode = 1;
      } else {
        console.log("  ✓ Todas las 10 validaciones de integridad pasaron al 100%.");
      }

      console.log("\n[4/4] Proceso APPLY finalizado exitosamente.");
    } else {
      console.log("[3/4] Modo DRY RUN completado. No se realizaron cambios en la base de datos.");
      console.log("      Para aplicar estos cambios en la base de staging, ejecute con --apply.\n");
    }

    if (isJson) {
      console.log("\n--- JSON OUTPUT ---");
      console.log(JSON.stringify(result, null, 2));
    }
  } catch (error) {
    console.error("\n❌ ERROR DURANTE EL BACKFILL:", error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
