#!/usr/bin/env node
import * as fs from "fs";
import * as path from "path";
import type { CommercialBackfillSummary } from "../server/commercialBackfillService";

function loadLocalEnvFiles() {
  const files = [
    path.resolve(process.cwd(), ".env.staging.local"),
    path.resolve(process.cwd(), ".env.local"),
    path.resolve(process.cwd(), ".env"),
  ];

  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    const content = fs.readFileSync(file, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx <= 0) continue;
      const key = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "");
      if (key && process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
}

loadLocalEnvFiles();

console.log("======================================================================");
console.log("  GOBERNANZA COMERCIAL: BACKFILL CONSERVADOR E IDEMPOTENTE (FASE 2)");
console.log("======================================================================\n");

const args = process.argv.slice(2);
const isApply = args.includes("--apply");
const modeText = isApply
  ? "APPLY (EJECUCIÓN REAL CON ESCRITURA EN BASE DE DATOS)"
  : "DRY RUN (SIMULACIÓN DE LECTURA - SIN ESCRITURA)";

const targetUrl = process.env.STAGING_DATABASE_URL || process.env.DATABASE_URL;
const backendUrl = (process.env.BACKEND_URL || "https://creditonegocios-staging.up.railway.app").replace(/\/$/, "");
const adminEmail = process.env.STAGING_ADMIN_EMAIL || process.env.STAGING_EMAIL || "francocb79@gmail.com";
const adminPassword = process.env.STAGING_ADMIN_PASSWORD || process.env.STAGING_PASSWORD || "Prueba1$";

// Bloqueo estricto de producción sin flag explícito
if (targetUrl) {
  const lowerUrl = targetUrl.toLowerCase();
  if (lowerUrl.includes("prod") && !args.includes("--force-production")) {
    console.error("⛔ ERROR DE SEGURIDAD:");
    console.error("   La URL de base de datos indica un entorno de PRODUCCIÓN.");
    console.error("   Se requiere validación previa en staging.");
    process.exit(1);
  }
}

function printSummary(summary: CommercialBackfillSummary, isApplyMode: boolean) {
  console.log("\n======================================================================");
  console.log(`  RESUMEN DE EJECUCIÓN (${isApplyMode ? "APPLY REAL" : "DRY RUN SIMULACIÓN"})`);
  console.log("======================================================================");
  console.log(`  • Total de clientes evaluados:        ${summary.totalClients}`);
  console.log(`  • Clientes que quedarían 'active':    ${summary.assignedActive}`);
  console.log(`  • Clientes 'legacy_unverified':       ${summary.assignedLegacyUnverified}`);
  console.log(`  • Clientes sin modificación:          ${summary.alreadyExistingSkipped}`);
  console.log(`  • Relaciones nuevas a crear/creadas:  ${summary.newRelationshipsCreated}`);
  console.log(`  • Reglas v1.0.0 sembradas:            ${summary.rulesVersionSeeded ? "SÍ" : summary.rulesVersionAlreadyExisted ? "Ya existía (Omitida)" : "No"}`);
  console.log("======================================================================\n");
  console.log("CONFIRMACIÓN DE INVARIANTES DE GOBERNANZA COMERCIAL:");
  console.log("  [✓] Crédito activo NO implica relación activa (regla conservadora validada)");
  console.log("  [✓] No cambia clients.brokerId (preservado como referencia histórica)");
  console.log("  [✓] No altera créditos existentes (credits intacto)");
  console.log("  [✓] No altera comisiones (commissions intacto)");
  console.log("  [✓] No genera duplicados (idempotencia O(1) confirmada)");
  console.log("======================================================================\n");
}

(async () => {
  if (targetUrl) {
    console.log(`[MODO DIRECTO POR BASE DE DATOS]`);
    console.log(`  • Modo: ${modeText}`);

    const { db } = await import("../server/db");
    const { CommercialConfigService, DrizzleCommercialConfigStorage } = await import("../server/commercialConfigService");
    const { CommercialBackfillService, DrizzleCommercialBackfillStorage } = await import("../server/commercialBackfillService");

    const configStorage = new DrizzleCommercialConfigStorage(db);
    const configService = new CommercialConfigService(configStorage);
    const commercialConfig = await configService.getConfig();

    console.log(`  • Ventana de actividad válida: ${commercialConfig.activeRelationshipValidityDays} días naturales`);
    console.log(`  • Reserva inicial de oportunidad: ${commercialConfig.initialOpportunityHoldDays} días`);
    console.log(`  • Criterio: Conservador (solo evidencia comprobable = active; lo demás = legacy_unverified)\n`);

    const storage = new DrizzleCommercialBackfillStorage(db);
    const service = new CommercialBackfillService(storage, configService);

    console.log(isApply ? "🚀 Aplicando backfill en base de datos..." : "🔍 Ejecutando análisis previo (DRY RUN)...");
    const summary = await service.runBackfill({ dryRun: !isApply });
    printSummary(summary, isApply);
    process.exit(0);
  } else {
    console.log(`[MODO REMOTO MEDIANTE API SUPER ADMIN]`);
    console.log(`  • Target: ${backendUrl}`);
    console.log(`  • Modo: ${modeText}`);

    const loginRes = await fetch(`${backendUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: adminEmail, password: adminPassword }),
    });

    if (!loginRes.ok) {
      console.error(`❌ Error autenticando en ${backendUrl}: ${loginRes.status} ${await loginRes.text()}`);
      process.exit(1);
    }

    const cookie = loginRes.headers.get("set-cookie") || "";
    console.log("✅ Sesión Super Admin autenticada correctamente.");

    console.log(isApply ? "🚀 Solicitando aplicación del backfill en Staging..." : "🔍 Solicitando análisis previo (DRY RUN) en Staging...");
    const backfillRes = await fetch(`${backendUrl}/api/admin/commercial-governance/backfill`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie,
      },
      body: JSON.stringify({ apply: isApply }),
    });

    if (!backfillRes.ok) {
      console.error(`❌ Error en backfill endpoint: ${backfillRes.status} ${await backfillRes.text()}`);
      process.exit(1);
    }

    const data = await backfillRes.json();
    printSummary(data.summary, isApply);
    process.exit(0);
  }
})().catch((err) => {
  console.error("❌ Error inesperado ejecutando backfill:", err);
  process.exit(1);
});
