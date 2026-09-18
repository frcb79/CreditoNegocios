#!/usr/bin/env node
import {
  executeOwnershipBackfill,
  checkOwnershipTablesExist,
  DrizzleOwnershipStorage,
  type OwnershipBackfillResult,
} from "../server/ownershipBackfillService";

console.log("======================================================================");
console.log("  BLOQUE 4: BACKFILL DE OWNERSHIP ORGANIZACIONAL (READ-ONLY / ACID)");
console.log("======================================================================\n");

const args = process.argv.slice(2);
const isApply = args.includes("--apply");
const isJson = args.includes("--json");
const modeText = isApply ? "APPLY (EJECUCIÓN REAL CON ESCRITURA ATÓMICA)" : "DRY RUN (ESTRICTAMENTE READ-ONLY)";

// 1. Verificación estricta de seguridad de entorno
const targetUrl = process.env.STAGING_DATABASE_URL || process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

if (!targetUrl) {
  console.error("❌ ERROR DE SEGURIDAD:");
  console.error("   Este script está restringido a entornos de Staging o Test.");
  console.error("   Debes definir explícitamente STAGING_DATABASE_URL o TEST_DATABASE_URL.\n");
  process.exit(1);
}

// Bloqueo estricto de producción
const lowerUrl = targetUrl.toLowerCase();
if (lowerUrl.includes("prod") || process.env.NODE_ENV === "production") {
  console.error("⛔ ERROR DE SEGURIDAD CRÍTICO:");
  console.error("   La URL de base de datos o NODE_ENV indica un entorno de PRODUCCIÓN.");
  console.error("   En el Bloque 4 está terminantemente prohibido ejecutar contra producción.");
  console.error("   La migración debe validarse primero en staging.");
  process.exit(1);
}

// 2. Extraer Host y Database Name sin exponer credenciales
let hostDisplay = "desconocido";
let dbNameDisplay = "desconocido";
try {
  const parsed = new URL(targetUrl);
  hostDisplay = parsed.host;
  dbNameDisplay = parsed.pathname.replace(/^\//, "") || "default";
} catch {
  hostDisplay = "configurado";
  dbNameDisplay = "configurado";
}

console.log("[CONFIGURACIÓN DE CONEXIÓN SEGURA]");
console.log(`  • Host:              ${hostDisplay}`);
console.log(`  • Base de datos:     ${dbNameDisplay}`);
console.log(`  • Modo:              ${modeText}`);
console.log(`  • Credenciales:      [PROTEGIDAS - NO SE EXPONEN]\n`);

process.env.DATABASE_URL = targetUrl;
delete process.env.USE_MEMORY_STORAGE;

(async () => {
  const { pool, db } = await import("../server/db");

  try {
    // 3. Verificación previa de tablas y columnas (estrictamente read-only)
    console.log("[1/3] Verificando presencia de esquema y columnas requeridas...");
    const check = await checkOwnershipTablesExist(pool);

    if (!check.allExist) {
      console.log("   Detectadas columnas faltantes. Ejecutando autoMigrate de forma segura e idempotente...");
      const { runAutoMigration } = await import("../server/autoMigrate");
      await runAutoMigration();

      const recheck = await checkOwnershipTablesExist(pool);
      if (!recheck.allExist) {
        console.error("\n❌ PREREQUISITO DE ESQUEMA NO CUMPLIDO TRAS AUTOMIGRATE:");
        console.error("   Faltan las siguientes tablas o columnas en la base de datos:");
        for (const col of recheck.missing) {
          console.error(`     - ${col}`);
        }
        console.error("\n   Revisa los permisos de DDL o la conectividad a la base de datos.\n");
        process.exit(1);
      }
      console.log("      ✓ Columnas creadas exitosamente mediante autoMigrate.");
    }
    console.log("      ✓ Todas las columnas de ownership requeridas existen en PostgreSQL.\n");

    if (!isApply) {
      // 4. MODO DRY RUN
      console.log("[2/3] Ejecutando análisis en modo DRY RUN (solo lectura)...");
      const readStorage = new DrizzleOwnershipStorage(db);
      const result = await executeOwnershipBackfill(readStorage, { apply: false });

      console.log("\n[3/3] REPORTE DE ANÁLISIS DRY RUN:");
      console.log("--------------------------------------------------");
      console.log(`  CLIENTES:`);
      console.log(`    • Total:                  ${result.stats.clients.total}`);
      console.log(`    • Con tenantId asignado:  ${result.stats.clients.withTenantId}`);
      console.log(`    • Pendientes de asignar:  ${result.stats.clients.pendingBackfill}`);
      console.log(`    • Sin createdBy:          ${result.stats.clients.missingCreatedBy}`);
      console.log(`\n  CRÉDITOS:`);
      console.log(`    • Total:                  ${result.stats.credits.total}`);
      console.log(`    • Con tenantId asignado:  ${result.stats.credits.withTenantId}`);
      console.log(`    • Pendientes de asignar:  ${result.stats.credits.pendingBackfill}`);
      console.log(`    • Sin createdBy:          ${result.stats.credits.missingCreatedBy}`);
      console.log(`\n  DOCUMENTOS:`);
      console.log(`    • Total:                  ${result.stats.documents.total}`);
      console.log(`    • Con tenantId asignado:  ${result.stats.documents.withTenantId}`);
      console.log(`    • Pendientes de asignar:  ${result.stats.documents.pendingBackfill}`);
      console.log(`    • Sin uploadedBy:         ${result.stats.documents.missingUploadedBy}`);
      console.log(`\n  SOLICITUDES DE ENVÍO:`);
      console.log(`    • Total:                  ${result.stats.creditSubmissions.total}`);
      console.log(`    • Con tenantId asignado:  ${result.stats.creditSubmissions.withTenantId}`);
      console.log(`    • Pendientes de asignar:  ${result.stats.creditSubmissions.pendingBackfill}`);
      console.log(`    • Sin createdBy:          ${result.stats.creditSubmissions.missingCreatedBy}`);
      console.log("--------------------------------------------------");
      console.log(`  RESOLUCIÓN DE OWNERSHIP:`);
      console.log(`    • Asignaciones a Tenant Broker:    ${result.plan.brokerTenantCount}`);
      console.log(`    • Asignaciones a Tenant Platform:  ${result.plan.platformFallbackCount}`);
      if (result.plan.unmappedBrokerIds.length > 0) {
        console.log(`    ⚠️ Brokers sin organización propia (asociados a Platform): ${result.plan.unmappedBrokerIds.join(", ")}`);
      }
      console.log("--------------------------------------------------\n");

      console.log("ℹ️  Para aplicar estos cambios de forma atómica en la base de datos:");
      console.log("   npx tsx scripts/backfill-tenant-ownership.ts --apply\n");
    } else {
      // 5. MODO APPLY CON TRANSACCIÓN ATÓMICA
      console.log("[2/3] Iniciando transacción PostgreSQL atómica...");
      let appliedResult: OwnershipBackfillResult | undefined;

      await db.transaction(async (tx: any) => {
        const txStorage = new DrizzleOwnershipStorage(tx);
        appliedResult = await executeOwnershipBackfill(txStorage, { apply: true });
      });

      console.log("      ✓ Transacción confirmada (COMMIT) exitosamente.\n");

      console.log("[3/3] RESULTADO DE LA EJECUCIÓN (APPLY):");
      console.log("--------------------------------------------------");
      console.log(`  • Clientes actualizados:          ${appliedResult?.appliedCounts?.clientsUpdated ?? 0}`);
      console.log(`  • Créditos actualizados:          ${appliedResult?.appliedCounts?.creditsUpdated ?? 0}`);
      console.log(`  • Documentos actualizados:        ${appliedResult?.appliedCounts?.documentsUpdated ?? 0}`);
      console.log(`  • Solicitudes actualizadas:       ${appliedResult?.appliedCounts?.submissionsUpdated ?? 0}`);
      console.log("--------------------------------------------------");
      console.log("✅ Backfill de ownership organizacional completado con éxito.\n");
    }

    await pool.end();
    process.exit(0);
  } catch (error: any) {
    console.error("\n❌ ERROR EN LA OPERACIÓN:");
    console.error(error);
    await pool.end();
    process.exit(1);
  }
})();
