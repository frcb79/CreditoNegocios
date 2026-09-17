import assert from "node:assert";
import { MemStorage } from "../server/storage";
import {
  executeBackfill,
  validatePostBackfill,
  checkRequiredTablesExist,
  PostgreSqlTransactionStorage,
} from "../server/backfillService";

console.log("=== INICIANDO VERIFICACIÓN DE BACKFILL DE ORGANIZACIONES (BLOQUE 2) ===");

(async () => {
  try {
    const storage = new MemStorage();
    // Limpiar seed data para probar de forma aislada y determinista
    (storage as any).users.clear();
    (storage as any).tenants.clear();
    (storage as any).tenantMembers.clear();

    // ----------------------------------------------------
    // 1. Preparar datos de prueba con diferentes perfiles
    // ----------------------------------------------------
    console.log("\n[TEST 1] Configurando usuarios legacy para la prueba de backfill...");

    // 1. Super Admin
    const superAdmin = await storage.createUser({
      email: "superadmin@backfill.test",
      role: "super_admin",
      firstName: "Super",
      lastName: "Admin",
    });

    // 2. Admin
    const admin = await storage.createUser({
      email: "admin@backfill.test",
      role: "admin",
      firstName: "Admin",
      lastName: "User",
    });

    // 3. Master Broker Alfa
    const masterAlfa = await storage.createUser({
      email: "master.alfa@backfill.test",
      role: "master_broker",
      firstName: "Master",
      lastName: "Alfa",
      brandName: "Red Alfa Hipotecaria",
      customLogo: "https://example.com/logo-alfa.png",
      primaryColor: "#FF0000",
      isWhiteLabel: true,
    });

    // 4. Broker con Master (afiliado a Master Alfa)
    const brokerAfiliado = await storage.createUser({
      email: "broker.afiliado@backfill.test",
      role: "broker",
      firstName: "Broker",
      lastName: "Afiliado",
      masterBrokerId: masterAlfa.id,
      brandName: "Financiera Afiliada",
    });

    // 5. Broker Directo (sin masterBrokerId)
    const brokerDirecto = await storage.createUser({
      email: "broker.directo@backfill.test",
      role: "broker",
      firstName: "Broker",
      lastName: "Directo",
      masterBrokerId: null,
    });

    // 6. Broker con masterBrokerId inválido (apunta a ID inexistente o rol no-master)
    const brokerInvalido = await storage.createUser({
      email: "broker.invalido@backfill.test",
      role: "broker",
      firstName: "Broker",
      lastName: "Huerfano",
      masterBrokerId: "non-existent-master-id-12345",
    });

    // 7. Broker apuntando a un Admin (rol no-master)
    const brokerConAdmin = await storage.createUser({
      email: "broker.admin@backfill.test",
      role: "broker",
      firstName: "Broker",
      lastName: "ConAdmin",
      masterBrokerId: admin.id,
    });

    console.log("  ✓ 7 usuarios de prueba creados (SuperAdmin, Admin, Master, BrokerAfiliado, BrokerDirecto, BrokerHuerfano, BrokerConAdmin)");

    // ----------------------------------------------------
    // 2. DRY RUN: Simulación sin efectos secundarios
    // ----------------------------------------------------
    console.log("\n[TEST 2] Ejecutando DRY RUN inicial...");
    const dryRunResult = await executeBackfill({
      storage,
      dryRun: true,
    });

    assert.strictEqual(dryRunResult.dryRun, true);
    assert.strictEqual(dryRunResult.summary.totalUsers, 7);
    assert.strictEqual(dryRunResult.summary.superAdmins, 1);
    assert.strictEqual(dryRunResult.summary.admins, 1);
    assert.strictEqual(dryRunResult.summary.masterBrokers, 1);
    assert.strictEqual(dryRunResult.summary.brokers, 4);

    assert.strictEqual(dryRunResult.summary.platformTenantAction, "to_create");
    assert.strictEqual(dryRunResult.summary.masterTenantsToCreate, 1);
    assert.strictEqual(dryRunResult.summary.brokerTenantsToCreate, 4);
    assert.strictEqual(dryRunResult.summary.membershipsToCreate, 7);

    assert.strictEqual(dryRunResult.summary.brokerToMasterCount, 1);
    assert.strictEqual(dryRunResult.summary.brokerToPlatformDirectCount, 1);
    assert.strictEqual(dryRunResult.summary.invalidMasterBrokerIdCount, 2);

    // Verificar que en DRY RUN no se guardó nada en storage
    const tenantsPostDry = await storage.getTenants();
    const membersPostDry = await storage.getTenantMembers();
    assert.strictEqual(tenantsPostDry.length, 0, "DRY RUN no debe persistir tenants");
    assert.strictEqual(membersPostDry.length, 0, "DRY RUN no debe persistir memberships");
    console.log("  ✓ DRY RUN proyectó correctamente todas las creaciones sin persistir cambios");

    // ----------------------------------------------------
    // 3. APPLY: Ejecución real y creación de registros
    // ----------------------------------------------------
    console.log("\n[TEST 3] Ejecutando APPLY (creación real de organizaciones)...");
    const applyResult = await executeBackfill({
      storage,
      dryRun: false,
    });

    assert.strictEqual(applyResult.dryRun, false);
    assert.strictEqual(applyResult.summary.masterTenantsToCreate, 1);
    assert.strictEqual(applyResult.summary.brokerTenantsToCreate, 4);
    assert.strictEqual(applyResult.summary.membershipsToCreate, 7);
    console.log("  ✓ APPLY completado exitosamente");

    // ----------------------------------------------------
    // 4. Verificación de reglas específicas del negocio
    // ----------------------------------------------------
    console.log("\n[TEST 4] Verificando reglas de mapeo organizacional...");
    const allTenants = await storage.getTenants();
    const allMembers = await storage.getTenantMembers();

    // 4a. Platform Tenant
    const platformTenant = allTenants.find(t => t.type === "platform" && t.slug === "platform");
    assert.ok(platformTenant, "Debe existir el tenant platform");
    assert.strictEqual(platformTenant?.name, "Crédito Negocios");
    assert.strictEqual(platformTenant?.parentTenantId, null);
    console.log("  ✓ Tenant Platform 'Crédito Negocios' creado correctamente");

    // 4b. Super Admin → platform / owner
    const saMember = allMembers.find(m => m.tenantId === platformTenant.id && m.userId === superAdmin.id);
    assert.ok(saMember, "Super Admin debe ser miembro de platform");
    assert.strictEqual(saMember?.role, "owner", "Super Admin debe tener rol owner en platform");
    console.log("  ✓ Super Admin mapeado a platform con rol owner");

    // 4c. Admin → platform / admin
    const adminMember = allMembers.find(m => m.tenantId === platformTenant.id && m.userId === admin.id);
    assert.ok(adminMember, "Admin debe ser miembro de platform");
    assert.strictEqual(adminMember?.role, "admin", "Admin debe tener rol admin en platform");
    console.log("  ✓ Admin mapeado a platform con rol admin");

    // 4d. Master Broker → master_broker / owner + settings white-label
    const mbTenant = allTenants.find(t => t.type === "master_broker" && (t.settings as any)?.legacyOwnerUserId === masterAlfa.id);
    assert.ok(mbTenant, "Master Broker debe tener su propio tenant");
    assert.strictEqual(mbTenant?.name, "Red Alfa Hipotecaria", "Debe usar brandName prioritario");
    assert.strictEqual(mbTenant?.parentTenantId, platformTenant.id, "Master debe tener parent=platform");
    assert.strictEqual((mbTenant?.settings as any)?.isWhiteLabel, true);
    assert.strictEqual((mbTenant?.settings as any)?.primaryColor, "#FF0000");

    const mbMember = allMembers.find(m => m.tenantId === mbTenant.id && m.userId === masterAlfa.id);
    assert.ok(mbMember);
    assert.strictEqual(mbMember?.role, "owner", "Master Broker debe ser owner de su organización");
    console.log("  ✓ Master Broker Alfa mapeado con white-label y rol owner");

    // 4e. Broker con Master → tenant broker / owner + parent Master
    const bAfiliadoTenant = allTenants.find(t => t.type === "broker" && (t.settings as any)?.legacyOwnerUserId === brokerAfiliado.id);
    assert.ok(bAfiliadoTenant);
    assert.strictEqual(bAfiliadoTenant?.parentTenantId, mbTenant.id, "Broker afiliado debe tener parent=tenant Master");
    const bAfiliadoMember = allMembers.find(m => m.tenantId === bAfiliadoTenant.id && m.userId === brokerAfiliado.id);
    assert.strictEqual(bAfiliadoMember?.role, "owner");
    console.log("  ✓ Broker con Master asignado a la jerarquía del Master correspondiente");

    // 4f. Broker directo → tenant broker / owner + parent platform
    const bDirectoTenant = allTenants.find(t => t.type === "broker" && (t.settings as any)?.legacyOwnerUserId === brokerDirecto.id);
    assert.ok(bDirectoTenant);
    assert.strictEqual(bDirectoTenant?.parentTenantId, platformTenant.id, "Broker directo debe tener parent=platform");
    console.log("  ✓ Broker directo asignado a platform como parent");

    // 4g. Broker con masterBrokerId inválido → parent platform + advertencia
    const bInvalidoTenant = allTenants.find(t => t.type === "broker" && (t.settings as any)?.legacyOwnerUserId === brokerInvalido.id);
    assert.ok(bInvalidoTenant);
    assert.strictEqual(bInvalidoTenant?.parentTenantId, platformTenant.id, "Broker con master inválido no debe inventar relación");

    const bAdminTenant = allTenants.find(t => t.type === "broker" && (t.settings as any)?.legacyOwnerUserId === brokerConAdmin.id);
    assert.ok(bAdminTenant);
    assert.strictEqual(bAdminTenant?.parentTenantId, platformTenant.id, "Broker apuntando a admin no debe inventar relación");
    console.log("  ✓ Brokers con masterBrokerId inválido/no-master asignados a platform con advertencia");

    // ----------------------------------------------------
    // 5. VALIDACIÓN POST-BACKFILL (Requirement 9)
    // ----------------------------------------------------
    console.log("\n[TEST 5] Ejecutando suite de validaciones post-backfill...");
    const postValidation = await validatePostBackfill(storage);
    assert.strictEqual(postValidation.valid, true, `Errores post-backfill: ${postValidation.errors.join("; ")}`);
    console.log("  ✓ Todas las reglas de integridad post-backfill pasaron al 100%");

    // ----------------------------------------------------
    // 6. IDEMPOTENCIA: Segunda ejecución sin duplicados
    // ----------------------------------------------------
    console.log("\n[TEST 6] Verificando IDEMPOTENCIA en segunda ejecución (DRY RUN & APPLY)...");

    // Segundo Dry Run
    const secondDryRun = await executeBackfill({
      storage,
      dryRun: true,
    });
    assert.strictEqual(secondDryRun.summary.platformTenantAction, "existing");
    assert.strictEqual(secondDryRun.summary.masterTenantsToCreate, 0, "Cero Master tenants a crear en segunda ejecución");
    assert.strictEqual(secondDryRun.summary.brokerTenantsToCreate, 0, "Cero Broker tenants a crear en segunda ejecución");
    assert.strictEqual(secondDryRun.summary.membershipsToCreate, 0, "Cero membresías a crear en segunda ejecución");
    assert.strictEqual(secondDryRun.summary.masterTenantsExisting, 1);
    assert.strictEqual(secondDryRun.summary.brokerTenantsExisting, 4);
    assert.strictEqual(secondDryRun.summary.membershipsExisting, 7);

    // Segundo Apply
    const secondApply = await executeBackfill({
      storage,
      dryRun: false,
    });
    assert.strictEqual(secondApply.createdTenantIds.length, 0, "Cero tenants creados en re-ejecución");
    assert.strictEqual(secondApply.createdMemberIds.length, 0, "Cero membresías creadas en re-ejecución");

    const tenantsCountAfter = (await storage.getTenants()).length;
    const membersCountAfter = (await storage.getTenantMembers()).length;
    assert.strictEqual(tenantsCountAfter, 6, "Total tenants debe mantenerse idéntico (1 platform + 1 master + 4 brokers)");
    assert.strictEqual(membersCountAfter, 7, "Total memberships debe mantenerse idéntico");
    console.log("  ✓ Idempotencia perfecta comprobada: cero duplicados");

    // ----------------------------------------------------
    // 7. Verificación de invariantes en Usuarios y Recursos
    // ----------------------------------------------------
    console.log("\n[TEST 7] Verificando que usuarios y recursos NO fueron modificados...");
    const reloadedSuperAdmin = await storage.getUser(superAdmin.id);
    const reloadedBroker = await storage.getUser(brokerAfiliado.id);
    assert.strictEqual(reloadedSuperAdmin?.role, "super_admin");
    assert.strictEqual(reloadedBroker?.role, "broker");
    assert.strictEqual(reloadedBroker?.masterBrokerId, masterAlfa.id, "masterBrokerId legacy intacto");
    console.log("  ✓ users.role y users.masterBrokerId permanecen 100% intactos");

    // ----------------------------------------------------
    // 8. Verificación de checkRequiredTablesExist (100% read-only)
    // ----------------------------------------------------
    console.log("\n[TEST 8] Verificando comprobación read-only de tablas requeridas (checkRequiredTablesExist)...");
    const mockPoolSuccess = {
      async query(_sql: string, _params: any[]) {
        return { rows: [{ table_name: "users" }, { table_name: "tenants" }, { table_name: "tenant_members" }] };
      },
    };
    const check1 = await checkRequiredTablesExist(mockPoolSuccess);
    assert.strictEqual(check1.allExist, true);
    assert.strictEqual(check1.missingTables.length, 0);

    const mockPoolMissing = {
      async query(_sql: string, _params: any[]) {
        return { rows: [{ table_name: "users" }] };
      },
    };
    const check2 = await checkRequiredTablesExist(mockPoolMissing);
    assert.strictEqual(check2.allExist, false);
    assert.deepStrictEqual(check2.missingTables, ["tenants", "tenant_members"]);
    console.log("  ✓ checkRequiredTablesExist detecta esquemas completos e incompletos en modo read-only");

    // ----------------------------------------------------
    // 9. Verificación de PostgreSqlTransactionStorage (adaptador transaccional)
    // ----------------------------------------------------
    console.log("\n[TEST 9] Verificando PostgreSqlTransactionStorage (adaptador transaccional)...");
    const mockTxInserts: any[] = [];
    const mockTx = {
      select() {
        return {
          from(_table: any) {
            return {
              orderBy() { return []; }
            };
          }
        };
      },
      insert(_table: any) {
        return {
          values(val: any) {
            mockTxInserts.push(val);
            return {
              returning() { return [{ id: "tx-created-id", ...val }]; }
            };
          }
        };
      }
    };
    const txStorage = new PostgreSqlTransactionStorage(mockTx);
    const createdInTx = await txStorage.createTenant({
      name: "TX Tenant",
      slug: "tx-tenant",
      type: "broker",
      isActive: true,
      settings: {},
    });
    assert.strictEqual(createdInTx.name, "TX Tenant");
    assert.strictEqual(mockTxInserts.length, 1);
    console.log("  ✓ PostgreSqlTransactionStorage canaliza las escrituras dentro de la transacción");

    console.log("\n=======================================================");
    console.log("✓ TODOS LOS TESTS DE BACKFILL PASARON EXITOSAMENTE (9/9)");
    console.log("=======================================================\n");
  } catch (error) {
    console.error("\n❌ ERROR EN TEST DE BACKFILL:", error);
    process.exit(1);
  }
})();
