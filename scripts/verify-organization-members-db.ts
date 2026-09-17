import assert from "node:assert";
import { randomUUID } from "node:crypto";

console.log("=== PRUEBA DE INTEGRACIÓN REAL BLOQUE 3: PostgreSQL + DbStorage (Multiusuario) ===\n");

const targetUrl = process.env.TEST_DATABASE_URL || process.env.STAGING_DATABASE_URL || process.env.DATABASE_URL;

if (!targetUrl) {
  console.log("ℹ️ AVISO: No se detectó STAGING_DATABASE_URL ni TEST_DATABASE_URL.");
  console.log("   Para ejecutar esta prueba contra PostgreSQL real:");
  console.log('   $env:STAGING_DATABASE_URL = "postgresql://..."; npx tsx scripts/verify-organization-members-db.ts');
  process.exit(0);
}

// Safety check
const lowerUrl = targetUrl.toLowerCase();
if (
  (lowerUrl.includes("prod") || process.env.NODE_ENV === "production") &&
  process.env.ALLOW_PROD_DB_TEST !== "true"
) {
  console.error("⛔ SEGURIDAD: La URL parece pertenecer a un entorno de PRODUCCIÓN o NODE_ENV=production.");
  console.error("   Esta prueba está restringida a bases de datos de Staging o Test.");
  process.exit(1);
}

process.env.DATABASE_URL = targetUrl;
process.env.USE_MEMORY_STORAGE = "false";
delete process.env.USE_MEMORY_STORAGE;

(async () => {
  const { db, pool } = await import("../server/db");
  const { DbStorage } = await import("../server/dbStorage");
  const { users, tenants, tenantMembers } = await import("../shared/schema");
  const { inArray } = await import("drizzle-orm");

  const storage = new DbStorage();

  const createdTenantIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdMemberIds: string[] = [];

  try {
    const runSuffix = `${Date.now()}-${randomUUID().slice(0, 6)}`;

    // 1. Create a test tenant
    console.log("[1/7] Creando organización de prueba en PostgreSQL...");
    const testTenant = await storage.createTenant({
      name: `Organización Test Bloque 3 ${runSuffix}`,
      slug: `test-org-${runSuffix}`,
      type: "broker",
      isActive: true,
      settings: { testSuite: "bloque-3" },
    });
    createdTenantIds.push(testTenant.id);
    console.log(`  ✓ Tenant creado (id: ${testTenant.id}, slug: ${testTenant.slug})`);

    // 2. Create Owner 1 atomically with createTenantMemberWithUser
    console.log("\n[2/7] Creando Usuario + Membresía Owner 1 con transacción ACID (createTenantMemberWithUser)...");
    const ownerEmail1 = `owner1-${runSuffix}@test-staging.local`;
    const ownerResult1 = await storage.createTenantMemberWithUser({
      tenantId: testTenant.id,
      email: ownerEmail1,
      firstName: "Owner1",
      lastName: "RealPostgres",
      internalRole: "owner",
      userRole: "broker",
      customRoleTitle: "Socio Fundador",
      permissions: { modules: ["clientes", "creditos", "usuarios"], actions: ["view", "edit", "manage_users"] },
    });
    createdUserIds.push(ownerResult1.user.id);
    createdMemberIds.push(ownerResult1.member.id);

    assert.ok(ownerResult1.user.id);
    assert.strictEqual(ownerResult1.user.email, ownerEmail1);
    assert.strictEqual(ownerResult1.user.customRoleTitle, "Socio Fundador");
    assert.strictEqual(ownerResult1.member.role, "owner");
    assert.strictEqual(ownerResult1.member.tenantId, testTenant.id);
    assert.strictEqual(ownerResult1.member.isActive, true);
    console.log("  ✓ Owner 1 y membresía confirmados en PostgreSQL.");

    // 3. Create Member 2 atomically
    console.log("\n[3/7] Creando Usuario + Membresía Colaborador 'member' con puesto personalizado...");
    const memberEmail2 = `analista-${runSuffix}@test-staging.local`;
    const memberResult2 = await storage.createTenantMemberWithUser({
      tenantId: testTenant.id,
      email: memberEmail2,
      firstName: "Analista",
      lastName: "MesaControl",
      internalRole: "member",
      userRole: "broker",
      customRoleTitle: "Mesa de Control Sr.",
      permissions: { modules: ["creditos", "documentos"], actions: ["view", "edit"] },
    });
    createdUserIds.push(memberResult2.user.id);
    createdMemberIds.push(memberResult2.member.id);

    assert.strictEqual(memberResult2.member.role, "member");
    assert.strictEqual(memberResult2.user.customRoleTitle, "Mesa de Control Sr.");
    console.log("  ✓ Colaborador 'member' confirmado en PostgreSQL.");

    // 4. Test joined query getTenantMembersWithUsers
    console.log("\n[4/7] Consultando getTenantMembersWithUsers (JOIN tenant_members + users)...");
    const membersWithUsers = await storage.getTenantMembersWithUsers(testTenant.id);
    assert.strictEqual(membersWithUsers.length, 2, "Deben existir exactamente 2 miembros en este tenant");
    
    const foundOwner = membersWithUsers.find(m => m.id === ownerResult1.member.id);
    assert.ok(foundOwner);
    assert.strictEqual(foundOwner.user.email, ownerEmail1);
    assert.strictEqual(foundOwner.user.customRoleTitle, "Socio Fundador");

    const foundMember = membersWithUsers.find(m => m.id === memberResult2.member.id);
    assert.ok(foundMember);
    assert.strictEqual(foundMember.user.email, memberEmail2);
    assert.strictEqual(foundMember.user.customRoleTitle, "Mesa de Control Sr.");
    console.log("  ✓ Consulta INNER JOIN getTenantMembersWithUsers verificada con éxito.");

    // 5. Test countActiveOwners & Last Owner Protection
    console.log("\n[5/7] Verificando protección del último propietario activo en PostgreSQL...");
    const activeOwnersCount = await storage.countActiveOwners(testTenant.id);
    assert.strictEqual(activeOwnersCount, 1, "Debe haber exactamente 1 propietario activo");

    let lastOwnerError: string | null = null;
    try {
      await storage.deactivateTenantMember(testTenant.id, ownerResult1.member.id);
    } catch (err: any) {
      lastOwnerError = err.message;
    }
    assert.ok(lastOwnerError !== null, "Debe abortar la desactivación del único owner");
    assert.ok(lastOwnerError.includes("último propietario activo"));
    console.log(`  ✓ Protección confirmada: "${lastOwnerError}"`);

    // 6. Add Second Owner & Deactivate First Owner
    console.log("\n[6/7] Creando Owner 2 y desactivando Owner 1 (debe tener éxito)...");
    const ownerEmail2 = `owner2-${runSuffix}@test-staging.local`;
    const ownerResult2 = await storage.createTenantMemberWithUser({
      tenantId: testTenant.id,
      email: ownerEmail2,
      firstName: "Owner2",
      lastName: "CoDirector",
      internalRole: "owner",
      userRole: "broker",
    });
    createdUserIds.push(ownerResult2.user.id);
    createdMemberIds.push(ownerResult2.member.id);

    const ownersCountNow = await storage.countActiveOwners(testTenant.id);
    assert.strictEqual(ownersCountNow, 2);

    // Deactivate Owner 1
    const deactRes = await storage.deactivateTenantMember(testTenant.id, ownerResult1.member.id);
    assert.strictEqual(deactRes.member.isActive, false);

    const ownersCountAfter = await storage.countActiveOwners(testTenant.id);
    assert.strictEqual(ownersCountAfter, 1);
    console.log("  ✓ Primer propietario desactivado con éxito al haber un segundo propietario activo.");

    // 7. Test N:M Smart Deactivation
    console.log("\n[7/7] Verificando lógica inteligente N:M al desactivar última membresía...");
    // Member 2 is deactivated (only has this membership) -> user.isActive should become false
    const deactMemberRes = await storage.deactivateTenantMember(testTenant.id, memberResult2.member.id);
    assert.strictEqual(deactMemberRes.member.isActive, false);
    assert.strictEqual(deactMemberRes.userDeactivatedGlobally, true);

    const user2InDb = await storage.getUser(memberResult2.user.id);
    assert.strictEqual(user2InDb?.isActive, false, "Usuario sin más membresías activas queda inactivo");
    console.log("  ✓ Usuario desactivado globalmente de forma inteligente en PostgreSQL.");

    console.log("\n==================================================================");
    console.log("✅ TODAS LAS PRUEBAS EN POSTGRESQL REAL PASARON EXITOSAMENTE (7/7)");
    console.log("==================================================================");
  } catch (error) {
    console.error("\n❌ ERROR EN PRUEBA DE INTEGRACIÓN POSTGRESQL:", error);
    process.exitCode = 1;
  } finally {
    console.log("\n[LIMPIEZA] Eliminando exclusivamente datos temporales generados...");
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
      console.error("⚠️ Error en limpieza de datos temporales:", cleanupError);
    } finally {
      await pool.end();
      console.log("  ✓ Conexión a PostgreSQL cerrada limpiamente.\n");
    }
  }
})();
