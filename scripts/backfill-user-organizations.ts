#!/usr/bin/env node
import {
  executeBackfill,
  validatePostBackfill,
  checkRequiredTablesExist,
  PostgreSqlTransactionStorage,
  type BackfillResult,
} from "../server/backfillService";

console.log("======================================================================");
console.log("  BLOQUE 2.1: BACKFILL DE ORGANIZACIONES Y MEMBRESÍAS (READ-ONLY / ACID)");
console.log("======================================================================\n");

// Parse CLI flags
const args = process.argv.slice(2);
const isApply = args.includes("--apply");
const isJson = args.includes("--json");
const modeText = isApply ? "APPLY (EJECUCIÓN REAL CON ESCRITURA ATÓMICA)" : "DRY RUN (ESTRICTAMENTE READ-ONLY)";

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

// 2. Extraer Host y Database Name sin exponer credenciales (Requirement 5)
let hostDisplay = "desconocido";
let dbNameDisplay = "desconocido";
try {
  const parsed = new URL(targetUrl);
  hostDisplay = parsed.host;
  dbNameDisplay = parsed.pathname.replace(/^\//, "") || "default";
} catch {
  // En caso de que la cadena use sintaxis no estándar
  hostDisplay = "configurado";
  dbNameDisplay = "configurado";
}

console.log("[CONFIGURACIÓN DE CONEXIÓN SEGURA]");
console.log(`  • Host:              ${hostDisplay}`);
console.log(`  • Base de datos:     ${dbNameDisplay}`);
console.log(`  • Modo:              ${modeText}`);
console.log(`  • Credenciales:      [PROTEGIDAS - NO SE EXPONEN]\n`);

// Configurar URL en entorno para inicializar Pool
process.env.DATABASE_URL = targetUrl;
delete process.env.USE_MEMORY_STORAGE;

(async () => {
  const { pool, db } = await import("../server/db");
  const { DbStorage } = await import("../server/dbStorage");

  try {
    // 3. Comprobación estrictamente READ-ONLY de que las tablas requeridas existen (Requirement 1)
    console.log("[1/3] Comprobando existencia de tablas requeridas (verificación 100% read-only)...");
    const tableCheck = await checkRequiredTablesExist(pool);
    if (!tableCheck.allExist) {
      console.error("\n❌ ERROR DE PRERREQUISITO DE ESQUEMA:");
      console.error(`   Faltan las siguientes tablas requeridas en la base de datos: ${tableCheck.missingTables.join(", ")}`);
      console.error("   El modo DRY RUN no repara ni modifica el esquema silenciosamente.");
      console.error("   Ejecute previamente la preparación del esquema (ej: migración DDL correspondiente).\n");
      process.exit(1);
    }
    console.log("  ✓ Tablas 'users', 'tenants' y 'tenant_members' verificadas sin escrituras ni DDL.\n");

    let result: BackfillResult;

    if (!isApply) {
      // ----------------------------------------------------
      // MODO DRY RUN: 100% solo lectura, cero escrituras
      // ----------------------------------------------------
      console.log("[2/3] Ejecutando análisis de usuarios y proyección organizacional (DRY RUN)...");
      const readOnlyStorage = new DbStorage();
      result = await executeBackfill({
        storage: readOnlyStorage,
        dryRun: true,
        onLog: (msg) => console.log(`  ${msg}`),
      });
    } else {
      // ----------------------------------------------------
      // MODO APPLY: Transacción PostgreSQL / Drizzle real y atómica (Requirement 2)
      // ----------------------------------------------------
      console.log("[2/3] Ejecutando APPLY dentro de una transacción PostgreSQL real (ACID)...");
      await db.transaction(async (tx) => {
        console.log("  [TX BEGIN] Transacción iniciada en PostgreSQL...");
        const txStorage = new PostgreSqlTransactionStorage(tx);

        result = await executeBackfill({
          storage: txStorage,
          dryRun: false,
          onLog: (msg) => console.log(`  ${msg}`),
        });

        console.log("  [TX VALIDATION] Ejecutando validaciones post-backfill dentro de la transacción...");
        const validation = await validatePostBackfill(txStorage);
        if (!validation.valid) {
          throw new Error(
            `Fallo en la validación post-backfill dentro de la transacción: ${validation.errors.join("; ")}`
          );
        }

        console.log("  [TX COMMIT] Validaciones superadas al 100%. Confirmando transacción en PostgreSQL...");
      });
      console.log("  ✓ Transacción completada y confirmada exitosamente.\n");
    }

    const s = result!.summary;

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
      console.log("[3/3] Validando estado final de la base de datos...");
      const finalCheckStorage = new DbStorage();
      const finalValidation = await validatePostBackfill(finalCheckStorage);
      if (!finalValidation.valid) {
        console.error("❌ ERRORES DE INTEGRIDAD POST-BACKFILL:");
        for (const err of finalValidation.errors) {
          console.error(`  - ${err}`);
        }
        process.exitCode = 1;
      } else {
        console.log("  ✓ Verificación post-commit completada con 100% de éxito.");
      }
    } else {
      console.log("[3/3] Modo DRY RUN finalizado. Base de datos no modificada (0 escrituras / 0 DDL).");
      if (s.anomalies.some((a) => a.type === "invalid_master_broker")) {
        console.log("ℹ️  Revisar advertencias de masterBrokerId antes de ejecutar --apply si se desea afiliar a otro Master.");
      }
      console.log("      Para aplicar estos cambios atómicamente en staging, ejecute con --apply.\n");
    }

    if (isJson) {
      console.log("\n--- JSON OUTPUT ---");
      console.log(JSON.stringify(result!, null, 2));
    }
  } catch (error: any) {
    if (error?.code === "ECONNREFUSED" || error?.errors?.[0]?.code === "ECONNREFUSED") {
      console.error(`\n❌ ERROR DE CONEXIÓN: No se pudo conectar al host '${hostDisplay}'.`);
      console.error("   Verifique que la URL de base de datos de Staging sea correcta y que la red permita la conexión.");
    } else {
      console.error("\n❌ ERROR DURANTE EL BACKFILL:", error);
    }
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
