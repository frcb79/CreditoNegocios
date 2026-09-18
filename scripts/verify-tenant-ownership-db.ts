#!/usr/bin/env node
import { Pool } from "pg";

console.log("======================================================================");
console.log("  VERIFICACIÓN EN POSTGRESQL (STAGING): BLOQUE 4 OWNERSHIP");
console.log("======================================================================\n");

const targetUrl = process.env.STAGING_DATABASE_URL || process.env.DATABASE_URL;

if (!targetUrl) {
  console.error("❌ ERROR: Debes definir STAGING_DATABASE_URL o DATABASE_URL.");
  process.exit(1);
}

// Bloqueo estricto de producción
const lowerUrl = targetUrl.toLowerCase();
if (lowerUrl.includes("prod") || process.env.NODE_ENV === "production") {
  console.error("⛔ ERROR DE SEGURIDAD CRÍTICO: Detectado entorno de producción.");
  process.exit(1);
}

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

console.log("[CONFIGURACIÓN]");
console.log(`  • Host:          ${hostDisplay}`);
console.log(`  • Base de datos: ${dbNameDisplay}`);
console.log(`  • Credenciales:  [PROTEGIDAS]\n`);

process.env.DATABASE_URL = targetUrl;
delete process.env.USE_MEMORY_STORAGE;

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`  ❌ [FAIL] ${message}`);
    process.exit(1);
  }
  console.log(`  ✓ [PASS] ${message}`);
}

async function run() {
  const { pool, db } = await import("../server/db");
  const { DbStorage } = await import("../server/dbStorage");
  const storage = new DbStorage();

  try {
    console.log("--- 1. Verificación de Integridad de Columnas e Índices en BD ---");
    const colRes = await pool.query(`
      SELECT table_name, column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND (
          (table_name = 'clients' AND column_name IN ('tenant_id', 'created_by')) OR
          (table_name = 'credits' AND column_name IN ('tenant_id', 'created_by')) OR
          (table_name = 'documents' AND column_name IN ('tenant_id', 'uploaded_by')) OR
          (table_name = 'credit_submission_requests' AND column_name IN ('tenant_id', 'created_by')) OR
          (table_name = 'tenant_members' AND column_name = 'can_originate')
        );
    `);
    assert(colRes.rows.length === 9, `Se verificaron las 9 columnas de ownership requeridas en PostgreSQL (encontradas: ${colRes.rows.length}/9)`);

    console.log("\n--- 2. Verificación de Registros Migrados (0 Pendientes de Backfill) ---");
    const pendingClients = await pool.query("SELECT COUNT(*) as count FROM public.clients WHERE tenant_id IS NULL");
    assert(parseInt(pendingClients.rows[0].count, 10) === 0, "0 clientes con tenant_id nulo en PostgreSQL");

    const pendingCredits = await pool.query("SELECT COUNT(*) as count FROM public.credits WHERE tenant_id IS NULL");
    assert(parseInt(pendingCredits.rows[0].count, 10) === 0, "0 créditos con tenant_id nulo en PostgreSQL");

    const pendingDocs = await pool.query("SELECT COUNT(*) as count FROM public.documents WHERE tenant_id IS NULL");
    assert(parseInt(pendingDocs.rows[0].count, 10) === 0, "0 documentos con tenant_id nulo en PostgreSQL");

    const pendingSubmissions = await pool.query("SELECT COUNT(*) as count FROM public.credit_submission_requests WHERE tenant_id IS NULL");
    assert(parseInt(pendingSubmissions.rows[0].count, 10) === 0, "0 solicitudes de envío con tenant_id nulo en PostgreSQL");

    console.log("\n--- 3. Verificación de DbStorage Filtering por Tenant ---");
    // Get distinct tenantIds with clients
    const tenantsWithClients = await pool.query("SELECT DISTINCT tenant_id FROM public.clients WHERE tenant_id IS NOT NULL LIMIT 2");
    if (tenantsWithClients.rows.length > 0) {
      const targetTenantId = tenantsWithClients.rows[0].tenant_id;
      const clientsForTenant = await storage.getClients({ tenantId: targetTenantId });
      assert(clientsForTenant.length > 0, `DbStorage.getClients retorna ${clientsForTenant.length} cliente(s) para tenant ${targetTenantId}`);
      assert(clientsForTenant.every(c => c.tenantId === targetTenantId), "Todos los clientes devueltos pertenecen estrictamente al tenantId consultado");

      // Consultar con un tenantId inexistente debe retornar 0
      const emptyClients = await storage.getClients({ tenantId: "tenant-inexistente-xyz" });
      assert(emptyClients.length === 0, "DbStorage.getClients retorna 0 clientes para un tenantId inexistente (aislamiento garantizado)");
    }

    // Get distinct tenantIds with credits
    const tenantsWithCredits = await pool.query("SELECT DISTINCT tenant_id FROM public.credits WHERE tenant_id IS NOT NULL LIMIT 2");
    if (tenantsWithCredits.rows.length > 0) {
      const targetTenantId = tenantsWithCredits.rows[0].tenant_id;
      const creditsForTenant = await storage.getCredits({ tenantId: targetTenantId });
      assert(creditsForTenant.length > 0, `DbStorage.getCredits retorna ${creditsForTenant.length} crédito(s) para tenant ${targetTenantId}`);
      assert(creditsForTenant.every(c => c.tenantId === targetTenantId), "Todos los créditos devueltos pertenecen estrictamente al tenantId consultado");

      const emptyCredits = await storage.getCredits({ tenantId: "tenant-inexistente-xyz" });
      assert(emptyCredits.length === 0, "DbStorage.getCredits retorna 0 créditos para un tenantId inexistente (aislamiento garantizado)");
    }

    console.log("\n--- 4. Verificación de Atribución Tripartita (tenantId + brokerId + createdBy) ---");
    const sampleCreditRes = await pool.query("SELECT id, tenant_id, broker_id, created_by FROM public.credits WHERE tenant_id IS NOT NULL LIMIT 1");
    if (sampleCreditRes.rows.length > 0) {
      const row = sampleCreditRes.rows[0];
      assert(Boolean(row.tenant_id), "Crédito cuenta con tenantId");
      assert(Boolean(row.broker_id), "Crédito cuenta con brokerId para comisión");
      assert(Boolean(row.created_by), "Crédito cuenta con createdBy para auditoría de captura");
    }

    console.log("\n======================================================================");
    console.log("  TODAS LAS PRUEBAS EN BASE DE DATOS POSTGRESQL PASARON CON ÉXITO");
    console.log("======================================================================\n");
  } finally {
    await pool.end();
  }
}

run().catch((err) => {
  console.error("❌ Error en verificación de base de datos:", err);
  process.exit(1);
});
