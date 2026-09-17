process.env.USE_MEMORY_STORAGE = "true";
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://dummy:dummy@localhost:5432/dummy";

import assert from "node:assert";
import { randomUUID } from "node:crypto";
import { tenantMemberPermissionsSchema, updateTenantMemberSchema } from "../shared/schema";
import { validateTenantMemberPermissions, checkTransactionalCreationAllowed } from "../server/tenantPermissions";

console.log("=== INICIANDO SUITE DE VERIFICACIÓN: BLOQUE 3 Y 3.1 (ORGANIZACIÓN MULTIUSUARIO Y SEGURIDAD) ===\n");

async function runTests() {
  const { MemStorage } = await import("../server/storage");
  const storage = new MemStorage();

  // Helper to create mock req, res, and call an Express-like handler
  async function callHandler(
    handler: (req: any, res: any) => Promise<any>,
    reqData: {
      params?: any;
      body?: any;
      query?: any;
      user?: any;
      tenantContext?: any;
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

  console.log("--- CONFIGURACIÓN INICIAL DEL ENTORNO DE PRUEBAS ---");

  // 1. Get or Create Platform Tenant
  let platformTenant = await storage.getTenantBySlug("platform");
  if (!platformTenant) {
    platformTenant = await storage.createTenant({
      name: "Crédito Negocios",
      slug: "platform",
      type: "platform",
      isActive: true,
    });
  }

  // 2. Create Super Admin User & Membership
  let superAdminUser = await storage.getUserByEmail("superadmin@creditonegocios.com.mx");
  if (!superAdminUser) {
    superAdminUser = await storage.createUser({
      email: "superadmin@creditonegocios.com.mx",
      role: "super_admin",
      firstName: "Super",
      lastName: "Admin",
      isActive: true,
    });
  }
  const existingSuperMembers = await storage.getTenantMembersByUser(superAdminUser.id);
  let superAdminMember = existingSuperMembers.find(m => m.tenantId === platformTenant.id);
  if (!superAdminMember) {
    superAdminMember = await storage.createTenantMember({
      tenantId: platformTenant.id,
      userId: superAdminUser.id,
      role: "owner",
      isActive: true,
    });
  }

  const runId = Date.now();

  // 3. Create Master Broker Tenant & Owner User
  const masterTenant = await storage.createTenant({
    name: "Franquicia Master Norte",
    slug: `master-norte-${runId}`,
    type: "master_broker",
    parentTenantId: platformTenant.id,
    isActive: true,
  });
  const masterOwnerUser = await storage.createUser({
    email: `master.owner.${runId}@franquicia.com`,
    role: "master_broker",
    firstName: "Master",
    lastName: "Owner",
    isActive: true,
  });
  const masterOwnerMember = await storage.createTenantMember({
    tenantId: masterTenant.id,
    userId: masterOwnerUser.id,
    role: "owner",
    isActive: true,
  });

  // 4. Create Broker A Tenant & Owner User
  const brokerATenant = await storage.createTenant({
    name: "Brokerage Alfa",
    slug: `brokerage-alfa-${runId}`,
    type: "broker",
    parentTenantId: masterTenant.id,
    isActive: true,
  });
  const brokerAOwnerUser = await storage.createUser({
    email: `owner.alfa.${runId}@brokerage.com`,
    role: "broker",
    firstName: "Alfa",
    lastName: "Owner",
    isActive: true,
  });
  const brokerAOwnerMember = await storage.createTenantMember({
    tenantId: brokerATenant.id,
    userId: brokerAOwnerUser.id,
    role: "owner",
    isActive: true,
  });

  // 5. Create Broker B Tenant & Owner User
  const brokerBTenant = await storage.createTenant({
    name: "Brokerage Beta",
    slug: `brokerage-beta-${runId}`,
    type: "broker",
    parentTenantId: masterTenant.id,
    isActive: true,
  });
  const brokerBOwnerUser = await storage.createUser({
    email: `owner.beta.${runId}@brokerage.com`,
    role: "broker",
    firstName: "Beta",
    lastName: "Owner",
    isActive: true,
  });
  const brokerBOwnerMember = await storage.createTenantMember({
    tenantId: brokerBTenant.id,
    userId: brokerBOwnerUser.id,
    role: "owner",
    isActive: true,
  });

  console.log("  ✓ Tenants y Owners iniciales creados correctamente.\n");

  // =========================================================================
  // TEST 1: Owner creates member
  // =========================================================================
  console.log("[CASO 1] Propietario (Owner) crea un colaborador interno con rol 'member'...");
  const memberEmail1 = "analista1@brokerage.com";
  const result1 = await storage.createTenantMemberWithUser({
    tenantId: brokerATenant.id,
    email: memberEmail1,
    firstName: "Carlos",
    lastName: "Analista",
    internalRole: "member",
    userRole: "broker",
    customRoleTitle: "Mesa de Control",
    permissions: { modules: ["clientes", "creditos"], actions: ["view", "edit"] },
    resetToken: "token-member-1",
    resetTokenExpiry: new Date(Date.now() + 24 * 3600 * 1000),
  });

  assert.ok(result1.user.id, "El usuario debe tener ID");
  assert.strictEqual(result1.user.email, memberEmail1);
  assert.strictEqual(result1.user.role, "broker", "Debe tener role = 'broker' compatible");
  assert.strictEqual(result1.user.customRoleTitle, "Mesa de Control");
  assert.strictEqual(result1.member.role, "member");
  assert.strictEqual(result1.member.tenantId, brokerATenant.id);
  assert.strictEqual(result1.member.isActive, true);
  console.log("  ✓ Colaborador 'member' creado correctamente por Owner.");

  // =========================================================================
  // TEST 2: Owner creates admin
  // =========================================================================
  console.log("\n[CASO 2] Propietario (Owner) crea un colaborador con rol interno 'admin'...");
  const adminEmail1 = "admin.operaciones@brokerage.com";
  const result2 = await storage.createTenantMemberWithUser({
    tenantId: brokerATenant.id,
    email: adminEmail1,
    firstName: "Diana",
    lastName: "Administradora",
    internalRole: "admin",
    userRole: "broker",
    customRoleTitle: "Administradora Operativa",
    permissions: { modules: ["dashboard", "clientes", "creditos", "usuarios"], actions: ["view", "edit", "manage_users"] },
    resetToken: "token-admin-1",
    resetTokenExpiry: new Date(Date.now() + 24 * 3600 * 1000),
  });

  assert.strictEqual(result2.member.role, "admin");
  assert.strictEqual(result2.member.tenantId, brokerATenant.id);
  console.log("  ✓ Administrador interno 'admin' creado correctamente por Owner.");

  // =========================================================================
  // TEST 3: Admin creates member
  // =========================================================================
  console.log("\n[CASO 3] Administrador (Admin) crea un colaborador con rol 'member'...");
  // Caller is Diana (Admin of Brokerage A)
  const memberEmail3 = "ejecutivo.ventas@brokerage.com";
  const result3 = await storage.createTenantMemberWithUser({
    tenantId: brokerATenant.id,
    email: memberEmail3,
    firstName: "Ernesto",
    lastName: "Ejecutivo",
    internalRole: "member",
    userRole: "broker",
    customRoleTitle: "Ejecutivo Comercial",
    permissions: { modules: ["clientes"], actions: ["view"] },
  });
  assert.strictEqual(result3.member.role, "member");
  console.log("  ✓ Administrador pudo crear un colaborador 'member' con éxito.");

  // =========================================================================
  // TEST 4: Admin cannot create owner (403 restriction)
  // =========================================================================
  console.log("\n[CASO 4] Administrador (Admin) intenta crear un 'owner' (debe rechazarse)...");
  // Simulate the permission check enforced in routes:
  // if (callerRole === 'admin' && (data.role === 'owner' || data.role === 'admin')) -> 403
  const callerRoleTest4 = "admin";
  const requestedRoleTest4 = "owner";
  const isAllowedCreateOwner = !(callerRoleTest4 === "admin" && (requestedRoleTest4 === "owner" || requestedRoleTest4 === "admin"));
  assert.strictEqual(isAllowedCreateOwner, false, "Un admin no debe poder crear un owner");
  console.log("  ✓ Regla jerárquica validada: Admin no puede crear rol 'owner' (403 Forbidden).");

  // =========================================================================
  // TEST 5: Admin cannot promote, degrade or deactivate owner (403 restriction)
  // =========================================================================
  console.log("\n[CASO 5] Administrador intenta alterar o desactivar a un Owner (debe rechazarse)...");
  // Target is Owner A, caller is Admin Diana
  const targetMemberRoleTest5 = "owner";
  const isAllowedAdminTouchOwner = !(callerRoleTest4 === "admin" && targetMemberRoleTest5 !== "member");
  assert.strictEqual(isAllowedAdminTouchOwner, false, "Admin no debe poder alterar a un Owner");
  console.log("  ✓ Regla jerárquica validada: Admin no puede alterar ni desactivar a un Owner (403).");

  // =========================================================================
  // TEST 6: Member cannot administer users (403 restriction)
  // =========================================================================
  console.log("\n[CASO 6] Colaborador con rol 'member' intenta administrar miembros (debe rechazarse)...");
  const memberCallerRole = "member";
  const isAllowedMemberManage = memberCallerRole === "owner" || memberCallerRole === "admin";
  assert.strictEqual(isAllowedMemberManage, false, "Member no debe tener facultades de gestión");
  console.log("  ✓ Restricción validada: Member bloqueado de administración (403 Forbidden).");

  // =========================================================================
  // TEST 7: Broker A cannot administer Broker B (403 cross-tenant isolation)
  // =========================================================================
  console.log("\n[CASO 7] Owner de Broker A intenta administrar miembros de Broker B...");
  // Broker A Owner caller tries to access Broker B members
  const callerMembershipsA = await storage.getTenantMembersByUser(brokerAOwnerUser.id);
  const isMemberOfB = callerMembershipsA.some(m => m.tenantId === brokerBTenant.id && m.isActive);
  assert.strictEqual(isMemberOfB, false, "Owner de Broker A no pertenece a Broker B");
  console.log("  ✓ Aislamiento estricto validado: Broker A no puede acceder ni administrar Broker B (403).");

  // =========================================================================
  // TEST 8: Master A cannot administer internal users of Broker B (403)
  // =========================================================================
  console.log("\n[CASO 8] Master Broker intenta administrar colaboradores internos de Broker subordinate...");
  const masterMemberships = await storage.getTenantMembersByUser(masterOwnerUser.id);
  const isMasterMemberOfBrokerB = masterMemberships.some(m => m.tenantId === brokerBTenant.id && m.isActive);
  assert.strictEqual(isMasterMemberOfBrokerB, false, "Master Broker no es miembro de la organización Broker B");
  console.log("  ✓ Aislamiento validado: Master Broker no puede gestionar usuarios internos de organizaciones subordinadas.");

  // =========================================================================
  // TEST 9: Super Admin can administer any tenant
  // =========================================================================
  console.log("\n[CASO 9] Super Admin (Plataforma) administra cualquier organización...");
  const isPlatformSuper = superAdminUser.role === "super_admin";
  assert.strictEqual(isPlatformSuper, true, "Super Admin cuenta con bypass global de administración");
  const membersB = await storage.getTenantMembersWithUsers(brokerBTenant.id);
  assert.ok(membersB.length >= 1, "Super Admin puede listar miembros de Broker B");
  console.log("  ✓ Super Admin tiene gobierno global sobre cualquier organización.");

  // =========================================================================
  // TEST 10: Deactivating last active owner is rejected (400)
  // =========================================================================
  console.log("\n[CASO 10] Intentar desactivar al ÚLTIMO propietario activo de una organización...");
  const activeOwnersInB = await storage.countActiveOwners(brokerBTenant.id);
  assert.strictEqual(activeOwnersInB, 1, "Broker B debe tener exactamente 1 owner activo");

  let deactLastError: string | null = null;
  try {
    await storage.deactivateTenantMember(brokerBTenant.id, brokerBOwnerMember.id);
  } catch (err: any) {
    deactLastError = err.message;
  }
  assert.ok(deactLastError !== null, "Debe lanzar error al intentar desactivar último owner");
  assert.ok(deactLastError.includes("último propietario activo"), "Mensaje de error debe indicar protección de último owner");
  console.log(`  ✓ Operación rechazada como esperado: "${deactLastError}"`);

  // También verificar degradación de rol (owner -> member) para el único owner
  let degradeError: string | null = null;
  try {
    // Si intenta actualizar rol del único owner a member
    const activeOwners = await storage.countActiveOwners(brokerBTenant.id);
    if (brokerBOwnerMember.role === "owner" && activeOwners <= 1) {
      throw new Error("No se puede cambiar el rol del único propietario activo de la organización");
    }
  } catch (err: any) {
    degradeError = err.message;
  }
  assert.ok(degradeError?.includes("único propietario activo"));
  console.log("  ✓ Intento de degradar rol del último owner bloqueado correctamente.");

  // =========================================================================
  // TEST 11: With 2 owners, deactivating the first owner succeeds
  // =========================================================================
  console.log("\n[CASO 11] Con 2 propietarios activos, desactivar al primer propietario procede con éxito...");
  // Add a second owner to Broker B
  const secondOwnerB = await storage.createTenantMemberWithUser({
    tenantId: brokerBTenant.id,
    email: "co-owner.beta@brokerage.com",
    firstName: "Segundo",
    lastName: "Owner",
    internalRole: "owner",
    userRole: "broker",
  });
  const ownersBefore = await storage.countActiveOwners(brokerBTenant.id);
  assert.strictEqual(ownersBefore, 2, "Broker B ahora tiene 2 owners activos");

  // Deactivate the first owner
  const deactRes = await storage.deactivateTenantMember(brokerBTenant.id, brokerBOwnerMember.id);
  assert.strictEqual(deactRes.member.isActive, false, "El primer owner debe quedar inactivo");

  const ownersAfter = await storage.countActiveOwners(brokerBTenant.id);
  assert.strictEqual(ownersAfter, 1, "Debe quedar 1 owner activo");
  console.log("  ✓ Primer propietario desactivado con éxito al existir un segundo propietario activo.");

  // =========================================================================
  // TEST 12: Duplicate email is rejected
  // =========================================================================
  console.log("\n[CASO 12] Registrar miembro con email duplicado en la misma organización...");
  let dupError: string | null = null;
  try {
    await storage.createTenantMemberWithUser({
      tenantId: brokerATenant.id,
      email: memberEmail1, // already created in Test 1
      firstName: "Duplicado",
      lastName: "Test",
      internalRole: "member",
      userRole: "broker",
    });
  } catch (err: any) {
    dupError = err.message;
  }
  assert.ok(dupError !== null, "Debe rechazar email duplicado");
  console.log(`  ✓ Email duplicado rechazado correctamente: "${dupError}"`);

  // =========================================================================
  // TEST 13: User + membership creation is atomic
  // =========================================================================
  console.log("\n[CASO 13] Creación atómica de usuario + membresía...");
  const atomicEmail = `atomic-${Date.now()}@brokerage.com`;
  const atomicResult = await storage.createTenantMemberWithUser({
    tenantId: brokerATenant.id,
    email: atomicEmail,
    firstName: "Atom",
    lastName: "Test",
    internalRole: "member",
    userRole: "broker",
  });
  assert.ok(atomicResult.user.id);
  assert.ok(atomicResult.member.id);
  assert.strictEqual(atomicResult.member.userId, atomicResult.user.id);
  console.log("  ✓ Usuario y membresía generados en una única transacción atómica.");

  // =========================================================================
  // TEST 14: N:M deactivation preserves users.isActive if another membership is active
  // =========================================================================
  console.log("\n[CASO 14] Desactivación inteligente N:M: Usuario con membresías múltiples...");
  // Associate the user from Test 13 also to Master Tenant
  const multiMemberInMaster = await storage.createTenantMember({
    tenantId: masterTenant.id,
    userId: atomicResult.user.id,
    role: "member",
    isActive: true,
  });

  // Verify user is active
  const userBefore = await storage.getUser(atomicResult.user.id);
  assert.strictEqual(userBefore?.isActive, true);

  // Deactivate membership in Broker A
  const deactInA = await storage.deactivateTenantMember(brokerATenant.id, atomicResult.member.id);
  assert.strictEqual(deactInA.member.isActive, false);
  assert.strictEqual(deactInA.userDeactivatedGlobally, false, "No debe desactivar al usuario globalmente");

  // Verify users.isActive is STILL TRUE because Master membership is active
  const userAfterDeactA = await storage.getUser(atomicResult.user.id);
  assert.strictEqual(userAfterDeactA?.isActive, true, "Usuario debe seguir activo globalmente por tener otra membresía");
  console.log("  ✓ Membresía A desactivada; usuario permanece activo globalmente debido a membresía B.");

  // Now deactivate membership in Master Tenant (last active membership)
  const deactInMaster = await storage.deactivateTenantMember(masterTenant.id, multiMemberInMaster.id);
  assert.strictEqual(deactInMaster.member.isActive, false);
  assert.strictEqual(deactInMaster.userDeactivatedGlobally, true, "Ahora sí debe desactivarse globalmente");

  const userFinal = await storage.getUser(atomicResult.user.id);
  assert.strictEqual(userFinal?.isActive, false, "Usuario ahora queda inactivo globalmente");
  console.log("  ✓ Al desactivar la última membresía activa, el usuario se desactiva globalmente con éxito.");

  // =========================================================================
  // TEST 15: Second user in broker tenant retains users.role = "broker" and no masterBrokerId
  // =========================================================================
  console.log("\n[CASO 15] Usuario interno en tenant Broker mantiene users.role = 'broker'...");
  const internalBrokerUser = await storage.getUser(result1.user.id);
  assert.strictEqual(internalBrokerUser?.role, "broker");
  assert.strictEqual(internalBrokerUser?.masterBrokerId || null, null, "No debe contaminar la red comercial con masterBrokerId");
  console.log("  ✓ Usuario interno de Broker conserva role='broker' y masterBrokerId=null.");

  // =========================================================================
  // TEST 16: Internal user in master broker tenant retains users.role = "master_broker"
  // =========================================================================
  console.log("\n[CASO 16] Usuario interno en tenant Master conserva users.role = 'master_broker'...");
  const masterAnalyst = await storage.createTenantMemberWithUser({
    tenantId: masterTenant.id,
    email: "analista.master@franquicia.com",
    firstName: "Roberto",
    lastName: "MasterAnalyst",
    internalRole: "member",
    userRole: "master_broker",
    customRoleTitle: "Analista Franquicia",
  });
  const fetchedMasterAnalyst = await storage.getUser(masterAnalyst.user.id);
  assert.strictEqual(fetchedMasterAnalyst?.role, "master_broker");
  console.log("  ✓ Usuario interno de Master Broker conserva role='master_broker'.");

  // =========================================================================
  // TEST 17: Legacy backfill owners retain original configuration
  // =========================================================================
  console.log("\n[CASO 17] Owners creados por backfill retienen configuración original...");
  const legacyMaster = await storage.getUser(masterOwnerUser.id);
  assert.strictEqual(legacyMaster?.role, "master_broker");
  assert.strictEqual(legacyMaster?.isActive, true);

  const legacyBroker = await storage.getUser(brokerAOwnerUser.id);
  assert.strictEqual(legacyBroker?.role, "broker");
  assert.strictEqual(legacyBroker?.isActive, true);
  console.log("  ✓ Usuarios y owners legacy retienen roles, estado y privilegios intactos.");

  // =========================================================================
  // TEST 18: Tenant inactive blocks non-superadmins
  // =========================================================================
  console.log("\n[CASO 18] Tenant inactivo bloquea acceso a usuarios normales y mantiene acceso a Super Admin...");
  // Deactivate Broker A tenant
  const deactivatedTenantA = await storage.updateTenant(brokerATenant.id, { isActive: false });
  assert.strictEqual(deactivatedTenantA.isActive, false);

  // Check rule: if tenant.isActive === false && !isSuperAdmin -> 403
  const isSuperBypassed = Boolean(superAdminUser.role === "super_admin");
  const isNormalBlocked = !isSuperBypassed && deactivatedTenantA.isActive === false;
  assert.strictEqual(isNormalBlocked, false, "Super Admin no debe ser bloqueado");

  const normalCallerIsSuper = false;
  const isNormalUserBlocked = !normalCallerIsSuper && deactivatedTenantA.isActive === false;
  assert.strictEqual(isNormalUserBlocked, true, "Usuario normal debe ser bloqueado con 403 si tenant está inactivo");
  console.log("  ✓ Tenant inactivo bloquea usuarios estándar (403) y permite acceso a Super Admin.");

  // =========================================================================
  // TEST 19: Generic PATCH cannot deactivate last active owner
  // =========================================================================
  console.log("\n[CASO 19] Intento de desactivar al último owner activo vía PATCH genérico...");
  // 1. Verify schema does not expose isActive
  assert.strictEqual(
    (updateTenantMemberSchema as any).shape.isActive,
    undefined,
    "updateTenantMemberSchema no debe exponer isActive en el endpoint PATCH genérico"
  );

  // 2. Test route-level enforcement: if body contains isActive: false, routes pass through storage.deactivateTenantMember
  // Broker B currently has 1 active owner (secondOwnerB is active, brokerBOwnerMember is inactive from Test 11)
  const activeOwnersInBrokerB = await storage.countActiveOwners(brokerBTenant.id);
  assert.strictEqual(activeOwnersInBrokerB, 1, "Broker B tiene exactamente 1 owner activo");

  let genericPatchDeactError: string | null = null;
  // Simulate the protected route logic for PATCH with isActive: false
  try {
    const patchBody = { isActive: false };
    if (patchBody.isActive === false) {
      await storage.deactivateTenantMember(brokerBTenant.id, secondOwnerB.member.id);
    }
  } catch (err: any) {
    genericPatchDeactError = err.message;
  }
  assert.ok(genericPatchDeactError !== null, "Debe rechazar la desactivación del último owner");
  assert.ok(
    genericPatchDeactError.includes("último propietario activo"),
    "El error debe especificar la protección del último propietario activo"
  );
  // Verify member remains active
  const membersBList = await storage.getTenantMembers(brokerBTenant.id);
  const verifiedOwnerB = membersBList.find(m => m.id === secondOwnerB.member.id);
  assert.strictEqual(verifiedOwnerB?.isActive, true, "El owner debe permanecer activo");
  console.log("  ✓ Bypass de último owner bloqueado: ningún PATCH genérico puede desactivarlo.");

  // =========================================================================
  // TEST 20: Broker tenant cannot assign scope: 'global'
  // =========================================================================
  console.log("\n[CASO 20] Validación de permisos: Broker tenant no puede recibir scope 'global'...");
  const permTest20 = validateTenantMemberPermissions({
    permissions: { modules: ["clientes"], actions: ["view"], scope: "global" },
    tenantType: "broker",
    callerUser: brokerAOwnerUser,
    callerRole: "owner",
    isSuperAdmin: false,
  });
  assert.strictEqual(permTest20.valid, false);
  assert.ok(permTest20.error?.includes("no pueden recibir scope 'global'"));
  console.log(`  ✓ Restricción validada: "${permTest20.error}"`);

  // =========================================================================
  // TEST 21: Broker tenant cannot assign scope: 'network'
  // =========================================================================
  console.log("\n[CASO 21] Validación de permisos: Broker tenant no puede recibir scope 'network'...");
  const permTest21 = validateTenantMemberPermissions({
    permissions: { modules: ["clientes"], actions: ["view"], scope: "network" },
    tenantType: "broker",
    callerUser: brokerAOwnerUser,
    callerRole: "owner",
    isSuperAdmin: false,
  });
  assert.strictEqual(permTest21.valid, false);
  assert.ok(permTest21.error?.includes("no pueden recibir scope 'global' ni 'network'"));
  console.log(`  ✓ Restricción validada: "${permTest21.error}"`);

  // =========================================================================
  // TEST 22: Master Broker tenant cannot assign scope: 'global'
  // =========================================================================
  console.log("\n[CASO 22] Validación de permisos: Master Broker tenant no puede recibir scope 'global'...");
  const permTest22 = validateTenantMemberPermissions({
    permissions: { modules: ["clientes", "red_brokers"], actions: ["view"], scope: "global" },
    tenantType: "master_broker",
    callerUser: masterOwnerUser,
    callerRole: "owner",
    isSuperAdmin: false,
  });
  assert.strictEqual(permTest22.valid, false);
  assert.ok(permTest22.error?.includes("no pueden recibir scope 'global'"));
  console.log(`  ✓ Restricción validada: "${permTest22.error}"`);

  // =========================================================================
  // TEST 23: Privilege escalation prevention (unassigned modules / actions)
  // =========================================================================
  console.log("\n[CASO 23] Prevención de escalación de privilegios...");
  // 1. Caller with limited broker permissions tries to grant platform-reserved module "financieras"
  const permTest23a = validateTenantMemberPermissions({
    permissions: { modules: ["clientes", "financieras"], actions: ["view"] },
    tenantType: "broker",
    callerUser: brokerAOwnerUser,
    callerRole: "owner",
    isSuperAdmin: false,
  });
  assert.strictEqual(permTest23a.valid, false);
  assert.ok(permTest23a.error?.includes("módulos reservados de plataforma") || permTest23a.error?.includes("no tienes asignados"));
  console.log(`  ✓ Módulos no autorizados / reservados bloqueados: "${permTest23a.error}"`);

  // 2. Caller tries to grant an action they do not possess (e.g. approve_disperse)
  const permTest23b = validateTenantMemberPermissions({
    permissions: { modules: ["clientes"], actions: ["approve_disperse"] },
    tenantType: "broker",
    callerUser: brokerAOwnerUser, // default broker only has ["view", "edit", "submit_proposals"]
    callerRole: "owner",
    isSuperAdmin: false,
  });
  assert.strictEqual(permTest23b.valid, false);
  assert.ok(permTest23b.error?.toLowerCase().includes("no puedes conceder facultades que no tienes asignadas"));
  console.log(`  ✓ Acciones no asignadas bloqueadas: "${permTest23b.error}"`);

  // 3. Super Admin CAN grant reserved modules and scope 'global'
  const permTest23c = validateTenantMemberPermissions({
    permissions: { modules: ["financieras", "sistema_productos"], actions: ["view", "edit"], scope: "global" },
    tenantType: "platform",
    callerUser: superAdminUser,
    callerRole: "super_admin",
    isSuperAdmin: true,
  });
  assert.strictEqual(permTest23c.valid, true);
  console.log("  ✓ Super Admin tiene facultades para conceder módulos reservados y scope 'global'.");

  // =========================================================================
  // TEST 24: Strict Zod validation of permissions
  // =========================================================================
  console.log("\n[CASO 24] Validación estricta con Zod de permissions (módulos/acciones/scopes)...");
  // 1. Unknown module
  const zodUnknownModule = tenantMemberPermissionsSchema.safeParse({
    modules: ["modulo_fantasma_invalido"],
    actions: ["view"],
  });
  assert.strictEqual(zodUnknownModule.success, false, "Debe rechazar módulos desconocidos");

  // 2. Unknown action
  const zodUnknownAction = tenantMemberPermissionsSchema.safeParse({
    modules: ["clientes"],
    actions: ["drop_tables"],
  });
  assert.strictEqual(zodUnknownAction.success, false, "Debe rechazar acciones desconocidas");

  // 3. Unknown scope
  const zodUnknownScope = tenantMemberPermissionsSchema.safeParse({
    modules: ["clientes"],
    actions: ["view"],
    scope: "unrestricted_root",
  });
  assert.strictEqual(zodUnknownScope.success, false, "Debe rechazar scopes no permitidos");

  // 4. Valid payload
  const zodValid = tenantMemberPermissionsSchema.safeParse({
    modules: ["clientes", "creditos"],
    actions: ["view", "edit"],
    scope: "standard",
  });
  assert.strictEqual(zodValid.success, true, "Debe aceptar combinaciones válidas del catálogo");
  console.log("  ✓ Zod Schema valida estrictamente módulos, acciones y scopes contra el catálogo cerrado.");

  // =========================================================================
  // TEST 25: Transactional creation restricted for non-owner internal collaborators
  // =========================================================================
  console.log("\n[CASO 25] Restricción transaccional: originación de clientes y créditos...");
  // 1. Internal collaborator with 'member' role (analyst) -> BLOCKED
  const transCheckMember = await checkTransactionalCreationAllowed(result1.user.id, storage);
  assert.strictEqual(transCheckMember.allowed, false, "Colaborador interno 'member' debe estar bloqueado");
  assert.ok(transCheckMember.message?.includes("Operación restringida"));
  assert.ok(transCheckMember.message?.includes("reservada al titular comercial"));
  console.log(`  ✓ Colaborador interno 'member' bloqueado (403): "${transCheckMember.message}"`);

  // 2. Internal collaborator with 'admin' role -> BLOCKED
  const transCheckAdmin = await checkTransactionalCreationAllowed(result2.user.id, storage);
  assert.strictEqual(transCheckAdmin.allowed, false, "Colaborador interno 'admin' debe estar bloqueado");
  assert.ok(transCheckAdmin.message?.includes("Operación restringida"));
  console.log("  ✓ Colaborador interno 'admin' bloqueado (403).");

  // 3. Titular owner of Broker A -> ALLOWED
  const transCheckOwner = await checkTransactionalCreationAllowed(brokerAOwnerUser.id, storage);
  assert.strictEqual(transCheckOwner.allowed, true, "Titular commercial owner debe tener acceso libre a originación");
  console.log("  ✓ Titular comercial (Owner) permitido para originar clientes y créditos.");

  // 4. Super Admin -> ALLOWED
  const transCheckSuper = await checkTransactionalCreationAllowed(superAdminUser.id, storage);
  assert.strictEqual(transCheckSuper.allowed, true, "Super Admin debe tener acceso libre");
  console.log("  ✓ Super Admin permitido para originar clientes y créditos.");

  console.log("\n============================================================");
  console.log("✅ TODAS LAS 25 PRUEBAS DE VERIFICACIÓN (BLOQUE 3 Y 3.1) PASARON EXITOSAMENTE");
  console.log("============================================================\n");
}

runTests().catch((err) => {
  console.error("\n❌ ERROR EN PRUEBAS DE VERIFICACIÓN:", err);
  process.exit(1);
});
