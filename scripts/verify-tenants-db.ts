import assert from "node:assert";
import { randomUUID } from "node:crypto";

console.log("=== PRUEBA DE INTEGRACIÓN REAL: PostgreSQL + DbStorage (BLOQUE 1.1) ===\n");

// 1. Detección y validación de URL de base de datos
const targetUrl = process.env.TEST_DATABASE_URL || process.env.STAGING_DATABASE_URL || process.env.DATABASE_URL;

if (!targetUrl) {
  console.error("❌ ERROR: No se encontró URL de base de datos para pruebas.");
  console.error("   Debes definir TEST_DATABASE_URL o STAGING_DATABASE_URL.");
  console.error("   Ejemplo (PowerShell):");
  console.error('   $env:TEST_DATABASE_URL = "postgresql://postgres:password@localhost:5432/test_db"');
  console.error("   npx tsx scripts/verify-tenants-db.ts\n");
  process.exit(1);
}

// Validación de seguridad: Evitar ejecución accidental sobre base de producción
const lowerUrl = targetUrl.toLowerCase();
if (
  (lowerUrl.includes("prod") || process.env.NODE_ENV === "production") &&
  process.env.ALLOW_PROD_DB_TEST !== "true"
) {
  console.error("⛔ SEGURIDAD: La URL parece pertenecer a un entorno de PRODUCCIÓN o NODE_ENV=production.");
  console.error("   Esta prueba está restringida a bases de datos de Staging o Test.");
  console.error("   Para forzar si es seguro, defina ALLOW_PROD_DB_TEST=true.");
  process.exit(1);
}

// Configurar entorno para DbStorage antes de importar módulos
process.env.DATABASE_URL = targetUrl;
process.env.USE_MEMORY_STORAGE = "false";
delete process.env.USE_MEMORY_STORAGE;

(async () => {
  // Importaciones dinámicas para respetar la configuración previa de process.env.DATABASE_URL
  const { db, pool } = await import("../server/db");
  const { DbStorage } = await import("../server/dbStorage");
  const { runAutoMigration } = await import("../server/autoMigrate");
  const { users, tenants, tenantMembers } = await import("../shared/schema");
  const { eq, inArray } = await import("drizzle-orm");

  const storage = new DbStorage();

  // IDs creados en esta ejecución para limpieza exclusiva
  const createdTenantIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdMemberIds: string[] = [];

  try {
    console.log("[1/8] Verificando conexión y auto-migración DDL en la base de datos...");
    await runAutoMigration();
    console.log("  ✓ Conexión y tablas verificadas exitosamente.");

    // Crear un usuario temporal para asociar la membresía
    console.log("\n[2/8] Creando usuario de prueba temporal en PostgreSQL...");
    const testEmail = `test-member-${Date.now()}-${randomUUID().slice(0, 8)}@test-staging.local`;
    const testUser = await storage.createUser({
      email: testEmail,
      role: "broker",
      firstName: "TestStaging",
      lastName: "User",
    });
    assert.ok(testUser.id, "El usuario debe tener un ID asignado");
    createdUserIds.push(testUser.id);
    console.log(`  ✓ Usuario creado en PostgreSQL (id: ${testUser.id}, email: ${testEmail})`);

    // Paso 1: Crear tenant
    console.log("\n[3/8] Creando tenant en PostgreSQL (DbStorage.createTenant)...");
    const testSlug = `test-tenant-${Date.now()}-${randomUUID().slice(0, 6)}`;
    const newTenant = await storage.createTenant({
      name: "Organización Test Staging",
      slug: testSlug,
      type: "broker",
      isActive: true,
      settings: { environment: "staging", testRun: true },
    });
    assert.ok(newTenant.id, "El tenant debe tener un ID asignado");
    assert.strictEqual(newTenant.slug, testSlug);
    assert.strictEqual(newTenant.type, "broker");
    assert.strictEqual(newTenant.isActive, true);
    createdTenantIds.push(newTenant.id);
    console.log(`  ✓ Tenant creado en PostgreSQL (id: ${newTenant.id}, slug: ${testSlug})`);

    // Paso 2: Obtener tenant por ID y Slug
    console.log("\n[4/8] Consultando tenant por ID y por Slug...");
    const fetchedById = await storage.getTenant(newTenant.id);
    assert.ok(fetchedById, "Debe existir el tenant consultado por ID");
    assert.strictEqual(fetchedById?.id, newTenant.id);
    assert.strictEqual(fetchedById?.name, "Organización Test Staging");

    const fetchedBySlug = await storage.getTenantBySlug(testSlug);
    assert.ok(fetchedBySlug, "Debe existir el tenant consultado por Slug");
    assert.strictEqual(fetchedBySlug?.id, newTenant.id);
    console.log("  ✓ Consultas getTenant y getTenantBySlug funcionan correctamente en PostgreSQL");

    // Paso 3: Crear membership
    console.log("\n[5/8] Creando membresía en PostgreSQL (DbStorage.createTenantMember)...");
    const newMembership = await storage.createTenantMember({
      tenantId: newTenant.id,
      userId: testUser.id,
      role: "owner",
      isActive: true,
    });
    assert.ok(newMembership.id, "La membresía debe tener un ID asignado");
    assert.strictEqual(newMembership.tenantId, newTenant.id);
    assert.strictEqual(newMembership.userId, testUser.id);
    assert.strictEqual(newMembership.role, "owner");
    assert.strictEqual(newMembership.isActive, true);
    createdMemberIds.push(newMembership.id);
    console.log(`  ✓ Membresía creada en PostgreSQL (id: ${newMembership.id}, role: ${newMembership.role})`);

    // Paso 4: Consultar membership
    console.log("\n[6/8] Consultando membresía por (userId, tenantId) y lista de miembros...");
    const fetchedMembership = await storage.getUserTenantMembership(testUser.id, newTenant.id);
    assert.ok(fetchedMembership, "Debe retornar la membresía");
    assert.strictEqual(fetchedMembership?.id, newMembership.id);

    const tenantMembersList = await storage.getTenantMembers(newTenant.id);
    assert.ok(tenantMembersList.some(m => m.id === newMembership.id), "La membresía debe figurar en la lista del tenant");
    console.log("  ✓ Consultas getUserTenantMembership y getTenantMembers verificadas");

    // Paso 5: Rechazar duplicado
    console.log("\n[7/8] Verificando rechazo de membresía duplicada en PostgreSQL...");
    await assert.rejects(
      async () => {
        await storage.createTenantMember({
          tenantId: newTenant.id,
          userId: testUser.id,
          role: "member",
          isActive: true,
        });
      },
      /already a member|already exists|duplicate|unique/i,
      "PostgreSQL debe rechazar membresía duplicada para la misma combinación (tenantId, userId)"
    );
    console.log("  ✓ Restricción de duplicado validada exitosamente en PostgreSQL");

    // Paso 6: Actualizar rol / isActive
    console.log("\n[8/8] Actualizando rol e isActive de la membresía...");
    const updatedMembership = await storage.updateTenantMember(newMembership.id, {
      role: "admin",
      isActive: false,
    });
    assert.ok(updatedMembership);
    assert.strictEqual(updatedMembership?.role, "admin");
    assert.strictEqual(updatedMembership?.isActive, false);

    // Reactivar
    const reactivated = await storage.updateTenantMember(newMembership.id, {
      isActive: true,
    });
    assert.strictEqual(reactivated?.isActive, true);
    console.log("  ✓ Actualización de rol y toggle de estado isActive verificados en PostgreSQL");

    console.log("\n==================================================================");
    console.log("✅ TODAS LAS OPERACIONES REALES CONTRA POSTGRESQL PASARON CON ÉXITO");
    console.log("==================================================================");
  } catch (error) {
    console.error("\n❌ ERROR EN PRUEBA DE INTEGRACIÓN POSTGRESQL:", error);
    process.exitCode = 1;
  } finally {
    // Paso 7: Limpieza EXCLUSIVA de los registros temporales creados por esta prueba
    console.log("\n[LIMPIEZA] Eliminando exclusivamente datos temporales generados en esta ejecución...");
    try {
      if (createdMemberIds.length > 0) {
        await db.delete(tenantMembers).where(inArray(tenantMembers.id, createdMemberIds));
        console.log(`  ✓ ${createdMemberIds.length} membresía(s) temporal(es) eliminada(s).`);
      }
      if (createdTenantIds.length > 0) {
        await db.delete(tenants).where(inArray(tenants.id, createdTenantIds));
        console.log(`  ✓ ${createdTenantIds.length} tenant(s) temporal(es) eliminado(s).`);
      }
      if (createdUserIds.length > 0) {
        await db.delete(users).where(inArray(users.id, createdUserIds));
        console.log(`  ✓ ${createdUserIds.length} usuario(s) temporal(es) eliminado(s).`);
      }
    } catch (cleanupError) {
      console.error("⚠️ Advertencia al limpiar datos temporales:", cleanupError);
    } finally {
      await pool.end();
      console.log("  ✓ Pool de conexiones PostgreSQL cerrado correctamente.\n");
    }
  }
})();
