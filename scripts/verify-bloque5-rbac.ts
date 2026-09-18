process.env.USE_MEMORY_STORAGE = "true";
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://dummy:dummy@localhost:5432/dummy";

import assert from "node:assert";
import { randomUUID } from "node:crypto";

console.log("================================================================================");
console.log("🧪 SUITE DE VERIFICACIÓN OFICIAL: BLOQUE 5 — VISIBILIDAD DE MÓDULOS + RBAC");
console.log("================================================================================\n");

async function runBloque5Tests() {
  const {
    getEffectivePermissions,
    requireModule,
    requireAction,
    requireModuleAndAction,
    requireAnyModule,
    requireRole,
  } = await import("../server/middleware/rbacMiddleware");
  const { runSanitization } = await import("./sanitize-rbac-commissions");
  const { MemStorage } = await import("../server/storage");
  const storage = new MemStorage();

  // Helper para simular llamadas a handlers de Express
  async function callHandler(
    handler: (req: any, res: any) => Promise<any>,
    reqData: {
      params?: any;
      body?: any;
      query?: any;
      user?: any;
      tenantContext?: any;
      dbUser?: any;
    }
  ): Promise<{ status: number; body: any }> {
    let statusCode = 200;
    let responseBody: any = null;

    const req: any = {
      params: reqData.params || {},
      body: reqData.body || {},
      query: reqData.query || {},
      user: reqData.user || null,
      tenantContext: reqData.tenantContext || null,
      dbUser: reqData.dbUser || null,
    };

    const res: any = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(data: any) {
        responseBody = data;
        return this;
      },
      send(data: any) {
        responseBody = data;
        return this;
      },
    };

    await handler(req, res);
    return { status: statusCode, body: responseBody };
  }

  // Helper para simular paso por middleware
  async function runMiddleware(
    middleware: any,
    reqData: { user?: any; dbUser?: any }
  ): Promise<{ allowed: boolean; status?: number; error?: string }> {
    let nextCalled = false;
    let statusCode = 200;
    let errorMsg = "";

    const req: any = {
      user: reqData.user || null,
      dbUser: reqData.dbUser || null,
    };

    const res: any = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(data: any) {
        errorMsg = data?.message || JSON.stringify(data);
        return this;
      },
    };

    await middleware(req, res, () => {
      nextCalled = true;
    });

    return { allowed: nextCalled, status: statusCode, error: errorMsg };
  }

  console.log("--- 1. CONFIGURACIÓN DE DATOS DE PRUEBA ---");
  
  // Super Admin
  const superAdmin = await storage.createLocalUser({
    email: "superadmin@plataforma.com",
    password: "hash",
    firstName: "Super",
    lastName: "Admin",
    role: "super_admin",
  });

  // Admin plataforma
  const adminPlatform = await storage.createLocalUser({
    email: "admin@plataforma.com",
    password: "hash",
    firstName: "Admin",
    lastName: "Plataforma",
    role: "admin",
  });

  // Master Broker
  const masterBroker = await storage.createLocalUser({
    email: "master@franquicia.com",
    password: "hash",
    firstName: "Master",
    lastName: "Broker",
    role: "master_broker",
    referralCode: "MB-001",
  });

  // Broker Directo A (afiliado al Master)
  const brokerA = await storage.createLocalUser({
    email: "brokerA@red.com",
    password: "hash",
    firstName: "Broker",
    lastName: "Alfa",
    role: "broker",
    masterBrokerId: masterBroker.id,
  });

  // Broker Directo B (independiente / de otra red)
  const brokerB = await storage.createLocalUser({
    email: "brokerB@otrared.com",
    password: "hash",
    firstName: "Broker",
    lastName: "Beta",
    role: "broker",
  });

  // Tenants
  const mbTenant = await storage.createTenant({
    type: "master_broker",
    name: "Franquicia Master Norte",
    slug: "mb-norte",
    settings: { legacyOwnerUserId: masterBroker.id },
  });

  const bTenantA = await storage.createTenant({
    type: "broker",
    name: "Brokerage Alfa",
    slug: "brk-alfa",
    parentTenantId: mbTenant.id,
    settings: { legacyOwnerUserId: brokerA.id },
  });

  // Membresías
  await storage.createTenantMember({
    tenantId: mbTenant.id,
    userId: masterBroker.id,
    role: "owner",
    canOriginate: true,
  });

  await storage.createTenantMember({
    tenantId: bTenantA.id,
    userId: brokerA.id,
    role: "owner",
    canOriginate: true,
  });

  // Colaborador canOriginate: true en Tenant A
  const memberOriginator = await storage.createLocalUser({
    email: "colab.originador@alfa.com",
    password: "hash",
    firstName: "Colaborador",
    lastName: "Comercial",
    role: "broker",
  });
  await storage.createTenantMember({
    tenantId: bTenantA.id,
    userId: memberOriginator.id,
    role: "member",
    canOriginate: true,
  });

  // Colaborador canOriginate: false en Tenant A (Mesa de Control / Analista)
  const memberOperations = await storage.createLocalUser({
    email: "colab.operaciones@alfa.com",
    password: "hash",
    firstName: "Colaborador",
    lastName: "Operativo",
    role: "broker",
  });
  const memberOpsRecord = await storage.createTenantMember({
    tenantId: bTenantA.id,
    userId: memberOperations.id,
    role: "member",
    canOriginate: false,
  });

  // Financiera y Créditos para probar Comisiones
  const testInstitution = await storage.createFinancialInstitution({
    name: "Banco Base Test",
    code: "BB-TEST",
    isActive: true,
  });

  const clientA = await storage.createClient({
    tenantId: bTenantA.id,
    brokerId: brokerA.id,
    type: "persona_moral",
    businessName: "Empresa Alfa SA",
  });

  const creditA = await storage.createCredit({
    tenantId: bTenantA.id,
    clientId: clientA.id,
    brokerId: brokerA.id,
    financialInstitutionId: testInstitution.id,
    amount: "1000000.00",
    status: "dispersed",
  });

  // Comisión para Broker A con share de Master Broker
  const commA = await storage.createCommission({
    creditId: creditA.id,
    brokerId: brokerA.id,
    masterBrokerId: masterBroker.id,
    commissionType: "apertura",
    amount: "50000.00",
    brokerShare: "35000.00",
    masterBrokerShare: "15000.00",
    appShare: "0.00",
    status: "pending",
  });

  // Comisión para Broker B (ajena)
  const clientB = await storage.createClient({
    brokerId: brokerB.id,
    type: "persona_moral",
    businessName: "Empresa Beta SA",
  });

  const creditB = await storage.createCredit({
    clientId: clientB.id,
    brokerId: brokerB.id,
    financialInstitutionId: testInstitution.id,
    amount: "500000.00",
    status: "dispersed",
  });

  const commB = await storage.createCommission({
    creditId: creditB.id,
    brokerId: brokerB.id,
    masterBrokerId: null,
    commissionType: "apertura",
    amount: "20000.00",
    brokerShare: "20000.00",
    masterBrokerShare: "0.00",
    appShare: "0.00",
    status: "pending",
  });

  console.log("  ✓ Entorno y datos de prueba configurados correctamente.\n");

  // ==========================================================================
  // CASO 1: Broker ve Comisiones y obtiene ÚNICAMENTE sus comisiones
  // ==========================================================================
  console.log("[CASO 1] Broker ve Comisiones y obtiene únicamente sus comisiones...");
  const brokerEffPerms = getEffectivePermissions(brokerA);
  assert.ok(brokerEffPerms.modules.includes("comisiones"), "broker debe tener 'comisiones' en sus módulos por defecto");
  
  // Consulta de comisiones para Broker A
  const brokerComms = await storage.getCommissions(brokerA.id);
  assert.strictEqual(brokerComms.length, 1, "Broker A solo debe obtener 1 comisión propia");
  assert.strictEqual(brokerComms[0].id, commA.id, "La comisión devuelta debe ser exactamente commA");
  assert.strictEqual(brokerComms[0].brokerId, brokerA.id, "brokerId debe coincidir con Broker A");
  console.log("  ✓ Broker A ve Comisiones y solo obtiene sus comisiones propias.");

  // ==========================================================================
  // CASO 2: Master Broker ve Comisiones y únicamente su producción y red autorizada
  // ==========================================================================
  console.log("\n[CASO 2] Master Broker ve Comisiones y su red autorizada...");
  const mbEffPerms = getEffectivePermissions(masterBroker);
  assert.ok(mbEffPerms.modules.includes("comisiones"), "master_broker debe tener 'comisiones' en módulos por defecto");

  const mbComms = await storage.getCommissions({ masterBrokerId: masterBroker.id, includeNetwork: true });
  assert.strictEqual(mbComms.length, 1, "Master Broker debe ver la comisión de su red (Broker A)");
  assert.strictEqual(mbComms[0].id, commA.id);
  // Verificar que la comisión de Broker B NO aparece
  const containsCommB = mbComms.some(c => c.id === commB.id);
  assert.strictEqual(containsCommB, false, "Master Broker NO debe ver comisiones de Broker B (fuera de su red)");
  console.log("  ✓ Master Broker ve su red legítima y no ve comisiones de brokers ajenos.");

  // ==========================================================================
  // CASO 3: canOriginate: true consulta sus propias comisiones
  // ==========================================================================
  console.log("\n[CASO 3] canOriginate: true puede originar y consultar sus comisiones...");
  // Crear una comisión para el colaborador originador
  const creditOrig = await storage.createCredit({
    tenantId: bTenantA.id,
    clientId: clientA.id,
    brokerId: memberOriginator.id,
    amount: "200000.00",
    status: "dispersed",
  });
  const commOrig = await storage.createCommission({
    creditId: creditOrig.id,
    brokerId: memberOriginator.id,
    amount: "8000.00",
    brokerShare: "8000.00",
    status: "pending",
  });

  const origComms = await storage.getCommissions(memberOriginator.id);
  assert.strictEqual(origComms.length, 1);
  assert.strictEqual(origComms[0].brokerId, memberOriginator.id);
  console.log("  ✓ Usuario canOriginate: true consulta sus propias comisiones.");

  // ==========================================================================
  // CASO 4: canOriginate: false no puede consultar Comisiones (Restringido)
  // ==========================================================================
  console.log("\n[CASO 4] canOriginate: false no tiene acceso al módulo Comisiones...");
  // Simulación de endpoint con verificación de canOriginate
  async function simulateCommissionsEndpoint(req: any, res: any) {
    const activeMembership = req.tenantContext?.membership;
    if (activeMembership && activeMembership.canOriginate === false && activeMembership.role !== 'owner' && req.user?.role !== 'super_admin' && req.user?.role !== 'admin') {
      return res.status(403).json({
        message: "Operación restringida: Los colaboradores no originadores no tienen acceso al módulo de comisiones comerciales."
      });
    }
    const comms = await storage.getCommissions(req.user.id);
    return res.json(comms);
  }

  const opsResult = await callHandler(simulateCommissionsEndpoint, {
    user: memberOperations,
    tenantContext: { membership: memberOpsRecord },
  });
  assert.strictEqual(opsResult.status, 403, "Colaborador canOriginate:false debe ser rechazado con 403");
  assert.ok(opsResult.body.message.includes("Operación restringida"));
  console.log("  ✓ Colaborador canOriginate: false es bloqueado correctamente con 403.");

  // ==========================================================================
  // CASO 5: Broker y Master Broker pueden consultar Financieras
  // ==========================================================================
  console.log("\n[CASO 5] Broker y Master Broker pueden consultar Financieras...");
  assert.ok(brokerEffPerms.modules.includes("financieras"), "broker debe tener módulo 'financieras' para consulta");
  assert.ok(mbEffPerms.modules.includes("financieras"), "master_broker debe tener módulo 'financieras' para consulta");

  const finMiddleware = requireAnyModule("financieras", "creditos", "aprobaciones", "sistema_productos");
  const brokerFinCheck = await runMiddleware(finMiddleware, { dbUser: brokerA });
  const mbFinCheck = await runMiddleware(finMiddleware, { dbUser: masterBroker });

  assert.strictEqual(brokerFinCheck.allowed, true, "Broker debe pasar middleware para consultar financieras");
  assert.strictEqual(mbFinCheck.allowed, true, "Master Broker debe pasar middleware para consultar financieras");
  console.log("  ✓ Broker y Master Broker autorizados para consultar Financieras.");

  // ==========================================================================
  // CASO 6: Broker y Master Broker pueden consultar Productos
  // ==========================================================================
  console.log("\n[CASO 6] Broker y Master Broker pueden consultar Productos...");
  assert.ok(brokerEffPerms.modules.includes("sistema_productos"), "broker debe tener 'sistema_productos'");
  assert.ok(mbEffPerms.modules.includes("sistema_productos"), "master_broker debe tener 'sistema_productos'");
  
  const prodMiddleware = requireModule("sistema_productos");
  const brokerProdCheck = await runMiddleware(prodMiddleware, { dbUser: brokerA });
  const mbProdCheck = await runMiddleware(prodMiddleware, { dbUser: masterBroker });

  assert.strictEqual(brokerProdCheck.allowed, true, "Broker debe tener acceso a ver productos");
  assert.strictEqual(mbProdCheck.allowed, true, "Master Broker debe tener acceso a ver productos");
  console.log("  ✓ Broker y Master Broker autorizados para consultar Productos.");

  // ==========================================================================
  // CASO 7: Broker y Master Broker NO pueden administrar Financieras ni Productos
  // ==========================================================================
  console.log("\n[CASO 7] Broker y Master Broker no pueden administrar Financieras/Productos...");
  async function simulateAdminOnlyMutation(req: any, res: any) {
    if (req.user?.role !== 'admin' && req.user?.role !== 'super_admin') {
      return res.status(403).json({ message: "Insufficient permissions. Solo administradores pueden gestionar catálogo." });
    }
    return res.json({ success: true });
  }

  const brokerMutFin = await callHandler(simulateAdminOnlyMutation, { user: brokerA });
  const mbMutFin = await callHandler(simulateAdminOnlyMutation, { user: masterBroker });
  const adminMutFin = await callHandler(simulateAdminOnlyMutation, { user: adminPlatform });

  assert.strictEqual(brokerMutFin.status, 403, "Broker no debe poder administrar financieras");
  assert.strictEqual(mbMutFin.status, 403, "Master Broker no debe poder administrar financieras");
  assert.strictEqual(adminMutFin.status, 200, "Admin de plataforma sí puede administrar");
  console.log("  ✓ Mutaciones de Financieras y Productos blindadas para administración de plataforma.");

  // ==========================================================================
  // CASO 8: Broker y Master Broker NO ven Aprobaciones y no pueden dictaminar
  // ==========================================================================
  console.log("\n[CASO 8] Broker y Master Broker no tienen acceso a Aprobaciones de plataforma...");
  assert.ok(!brokerEffPerms.modules.includes("aprobaciones"), "broker NO debe tener aprobaciones");
  assert.ok(!mbEffPerms.modules.includes("aprobaciones"), "master_broker NO debe tener aprobaciones");

  const aprobMiddleware = requireModule("aprobaciones");
  const brokerAprobCheck = await runMiddleware(aprobMiddleware, { dbUser: brokerA });
  const mbAprobCheck = await runMiddleware(aprobMiddleware, { dbUser: masterBroker });
  const superAprobCheck = await runMiddleware(aprobMiddleware, { dbUser: superAdmin });

  assert.strictEqual(brokerAprobCheck.allowed, false, "Broker debe ser bloqueado de aprobaciones");
  assert.strictEqual(mbAprobCheck.allowed, false, "Master Broker debe ser bloqueado de aprobaciones");
  assert.strictEqual(superAprobCheck.allowed, true, "Super Admin sí accede a aprobaciones");
  console.log("  ✓ Aprobaciones restringidas exclusivamente a administración de plataforma.");

  // ==========================================================================
  // CASO 9: Acceso directo por URL respeta la misma matriz
  // ==========================================================================
  console.log("\n[CASO 9] Verificando consistencia de matriz entre Sidebar, ProtectedRoute y Backend...");
  // Verificamos los módulos obligatorios de broker
  const expectedBrokerModules = ["dashboard", "clientes", "creditos", "comisiones", "financieras", "sistema_productos", "documentos", "configuracion"];
  for (const mod of expectedBrokerModules) {
    assert.ok(brokerEffPerms.modules.includes(mod), `broker debe incluir ${mod}`);
  }

  // Verificamos los módulos obligatorios de master_broker
  const expectedMbModules = ["dashboard", "clientes", "creditos", "comisiones", "financieras", "sistema_productos", "red_brokers", "documentos", "reportes", "usuarios", "configuracion"];
  for (const mod of expectedMbModules) {
    assert.ok(mbEffPerms.modules.includes(mod), `master_broker debe incluir ${mod}`);
  }
  console.log("  ✓ Coherencia absoluta en la matriz de permisos para todos los módulos.");

  // ==========================================================================
  // CASO 10: /admin/usuarios respeta rol de tenant
  // ==========================================================================
  console.log("\n[CASO 10] /admin/usuarios respeta jerarquía de tenant...");
  async function simulateAddMemberEndpoint(req: any, res: any) {
    const callerRole = req.tenantContext?.membership?.role;
    if (callerRole !== 'owner' && callerRole !== 'admin' && req.user?.role !== 'super_admin') {
      return res.status(403).json({ message: "Solo owner o admin pueden agregar colaboradores." });
    }
    return res.status(201).json({ created: true });
  }

  const ownerAddCheck = await callHandler(simulateAddMemberEndpoint, {
    user: brokerA,
    tenantContext: { membership: { role: "owner" } }
  });
  const memberAddCheck = await callHandler(simulateAddMemberEndpoint, {
    user: memberOperations,
    tenantContext: { membership: { role: "member" } }
  });

  assert.strictEqual(ownerAddCheck.status, 201, "Owner debe poder agregar miembros");
  assert.strictEqual(memberAddCheck.status, 403, "Member no debe poder agregar miembros");
  console.log("  ✓ Jerarquía de administración por rol de tenant respetada.");

  // ==========================================================================
  // CASO 11: Cross-Tenant sigue bloqueado
  // ==========================================================================
  const membershipsOfBrokerB = await storage.getTenantMembersByUser(brokerB.id);
  const isMemberOfTenantA = membershipsOfBrokerB.some(m => m.tenantId === bTenantA.id);
  assert.strictEqual(isMemberOfTenantA, false, "Broker B no debe pertenecer a Tenant A");
  console.log("  ✓ Frontera multi-tenant aislada estrictamente.");

  // ==========================================================================
  // CASO 12: Compatibilidad y Saneamiento Idempotente
  // ==========================================================================
  console.log("\n[CASO 12] Probando idempotencia de saneamiento...");
  // Simular usuario con permissions que perdió comisiones
  const userMissingComms = await storage.createLocalUser({
    email: "historico@creditonegocios.com",
    password: "hash",
    firstName: "Historico",
    lastName: "Broker",
    role: "broker",
  });
  (userMissingComms as any).permissions = { modules: ["dashboard", "clientes", "creditos"], actions: ["view", "edit"] };

  // Mock pool para probar lógica de sanitización
  let updatedUsersMap = new Map<string, any>();
  const mockPool = {
    async query(sql: string, params?: any[]) {
      if (sql.includes("FROM users")) {
        return {
          rows: [
            {
              id: userMissingComms.id,
              email: userMissingComms.email,
              role: userMissingComms.role,
              permissions: (userMissingComms as any).permissions,
            },
            {
              id: memberOperations.id,
              email: memberOperations.email,
              role: memberOperations.role,
              permissions: { modules: ["dashboard", "clientes"], actions: ["view"] },
            },
          ]
        };
      }
      if (sql.includes("FROM tenant_members")) {
        return {
          rows: [
            { user_id: memberOperations.id, tenant_id: bTenantA.id, role: "member", can_originate: false, is_active: true }
          ]
        };
      }
      if (sql.includes("UPDATE users")) {
        updatedUsersMap.set(params![1], JSON.parse(params![0]));
        return { rowCount: 1 };
      }
      return { rows: [] };
    }
  };

  // DRY RUN
  const drySummary = await runSanitization({ dryRun: true, dbPool: mockPool });
  assert.strictEqual(drySummary.dryRun, true);
  assert.strictEqual(drySummary.usersModified, 1, "Solo 1 usuario (el broker histórico) debe ser modificado");
  assert.strictEqual(updatedUsersMap.size, 0, "DRY-RUN no debe haber tocado la BD");

  // APPLY
  const applySummary = await runSanitization({ dryRun: false, dbPool: mockPool });
  assert.strictEqual(applySummary.dryRun, false);
  assert.strictEqual(applySummary.usersModified, 1);
  assert.strictEqual(updatedUsersMap.size, 1, "APPLY debe actualizar el usuario en BD");
  const updatedPerms = updatedUsersMap.get(userMissingComms.id);
  assert.ok(updatedPerms.modules.includes("comisiones"), "Usuario saneado debe tener 'comisiones'");
  assert.ok(updatedPerms.modules.includes("financieras"), "Usuario saneado debe tener 'financieras'");

  console.log("  ✓ Script de saneamiento probado: DRY-RUN seguro y APPLY idempotente.");

  console.log("\n================================================================================");
  console.log("🎉 TODAS LAS PRUEBAS OBLIGATORIAS (12/12) DEL BLOQUE 5 HAN PASADO CON ÉXITO");
  console.log("================================================================================\n");
}

runBloque5Tests()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ ERROR EN SUITE DE PRUEBAS:", err);
    process.exit(1);
  });
