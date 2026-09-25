#!/usr/bin/env node
import {
  CommercialBackfillService,
  DrizzleCommercialBackfillStorage,
  type CommercialBackfillSummary,
} from "../server/commercialBackfillService";

console.log("======================================================================");
console.log("  GOBERNANZA COMERCIAL: BACKFILL CONSERVADOR E IDEMPOTENTE (FASE 2)");
console.log("======================================================================\n");

const args = process.argv.slice(2);
const isApply = args.includes("--apply");
const modeText = isApply
  ? "APPLY (EJECUCIÓN REAL CON ESCRITURA EN BASE DE DATOS)"
  : "DRY RUN (SIMULACIÓN DE LECTURA - SIN ESCRITURA)";

// Verificación de conexión a base de datos
const targetUrl = process.env.STAGING_DATABASE_URL || process.env.DATABASE_URL;

if (!targetUrl) {
  console.error("❌ ERROR: DATABASE_URL o STAGING_DATABASE_URL no configurada.");
  process.exit(1);
}

// Bloqueo estricto de producción sin flag explícito
const lowerUrl = targetUrl.toLowerCase();
if (lowerUrl.includes("prod") && !args.includes("--force-production")) {
  console.error("⛔ ERROR DE SEGURIDAD:");
  console.error("   La URL de base de datos indica un entorno de PRODUCCIÓN.");
  console.error("   Se requiere validación previa en staging.");
  process.exit(1);
}

(async () => {
  const { db } = await import("../server/db");
  const {
    CommercialConfigService,
    DrizzleCommercialConfigStorage,
  } = await import("../server/commercialConfigService");

  const configStorage = new DrizzleCommercialConfigStorage(db);
  const configService = new CommercialConfigService(configStorage);
  const commercialConfig = await configService.getConfig();

  console.log(`[CONFIGURACIÓN]`);
  console.log(`  • Modo: ${modeText}`);
  console.log(`  • Ventana de actividad válida: ${commercialConfig.activeRelationshipValidityDays} días naturales (configurada dinámicamente)`);
  console.log(`  • Reserva inicial de oportunidad: ${commercialConfig.initialOpportunityHoldDays} días`);
  console.log(`  • Criterio: Conservador (solo evidencia comprobable = active; lo demás = legacy_unverified)\n`);

  const storage = new DrizzleCommercialBackfillStorage(db);
  const service = new CommercialBackfillService(storage, configService);

  if (!isApply) {
    console.log("🔍 Ejecutando análisis previo (DRY RUN)...");
    const [allClients, existing] = await Promise.all([
      storage.getClients(),
      storage.getExistingRelationships(),
    ]);

    console.log(`  • Total de clientes en base de datos: ${allClients.length}`);
    console.log(`  • Relaciones comerciales ya existentes: ${existing.length}`);
    console.log(`  • Clientes pendientes de backfill: ${allClients.length - existing.length}`);
    console.log("\n💡 Para aplicar los cambios reales, ejecuta el comando con el flag --apply");
    process.exit(0);
  }


  console.log("🚀 Aplicando backfill en base de datos...");
  try {
    const summary: CommercialBackfillSummary = await service.runBackfill();

    console.log("\n======================================================================");
    console.log("  RESUMEN DE EJECUCIÓN DEL BACKFILL");
    console.log("======================================================================");
    console.log(`  • Total de clientes evaluados:        ${summary.totalClients}`);
    console.log(`  • Nuevas relaciones creadas:          ${summary.newRelationshipsCreated}`);
    console.log(`  • Clientes previamente migrados:      ${summary.alreadyExistingSkipped}`);
    console.log(`  • Asignados a 'active':               ${summary.assignedActive}`);
    console.log(`  • Asignados a 'legacy_unverified':    ${summary.assignedLegacyUnverified}`);
    console.log(`  • Reglas v1.0.0 sembradas:            ${summary.rulesVersionSeeded ? "SÍ (Creada versión 1.0.0)" : summary.rulesVersionAlreadyExisted ? "Ya existía (Omitida)" : "No"}`);
    console.log("======================================================================\n");

    console.log("✨ Backfill completado exitosamente con idempotencia garantizada.");
    process.exit(0);
  } catch (err: any) {
    console.error("❌ Error ejecutando backfill:", err);
    process.exit(1);
  }
})();
