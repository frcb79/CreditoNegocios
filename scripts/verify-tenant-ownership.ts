#!/usr/bin/env node
process.env.USE_MEMORY_STORAGE = "true";
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://dummy:dummy@localhost:5432/dummy";

console.log("======================================================================");
console.log("  VERIFICACIÓN INTEGRAL: BLOQUE 4 (OWNERSHIP ORGANIZACIONAL)");
console.log("======================================================================\n");

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ [FAIL] ${testName}`);
    if (detail) console.error(`     Detalle: ${detail}`);
    failed++;
  }
}

async function runTests() {
  const { MemStorage } = await import("../server/storage");
  const { validateCommercialOrigination } = await import("../server/tenantPermissions");
  const { executeOwnershipBackfill } = await import("../server/ownershipBackfillService");
  type IOwnershipStorage = import("../server/ownershipBackfillService").IOwnershipStorage;

  const storage = new MemStorage();

  console.log("--- 1. Preparación de Organizaciones y Usuarios de Prueba ---");
  // 1. Setup Platform Tenant & Super Admin
  const platformTenant =
    (await storage.getTenantBySlug("platform")) ||
    (await storage.createTenant({
      type: "platform",
      name: "Crédito Negocios Platform",
      slug: "platform",
      parentTenantId: null,
      settings: {},
      isActive: true,
    }));

  const superAdmin = await storage.createUser({
    email: "superadmin@platform.com",
    role: "super_admin",
    firstName: "Super",
    lastName: "Admin",
    isActive: true,
  });

  // 2. Setup Master Broker Tenant & Owner
  const masterTenant = await storage.createTenant({
    type: "master_broker",
    name: "Master Broker Corp",
    slug: "master-corp",
    parentTenantId: platformTenant.id,
    settings: {},
    isActive: true,
  });

  const masterOwner = await storage.createUser({
    email: "owner@mastercorp.com",
    role: "master_broker",
    firstName: "Master",
    lastName: "Owner",
    isActive: true,
  });

  await storage.createTenantMember({
    tenantId: masterTenant.id,
    userId: masterOwner.id,
    role: "owner",
    canOriginate: true,
    isActive: true,
  });

  // 3. Setup Broker Tenant A (Subordinate to Master)
  const brokerTenantA = await storage.createTenant({
    type: "broker",
    name: "Broker Norte SC",
    slug: "broker-norte",
    parentTenantId: masterTenant.id,
    settings: {},
    isActive: true,
  });

  const brokerOwnerA = await storage.createUser({
    email: "owner@brokernorte.com",
    role: "broker",
    firstName: "Carlos",
    lastName: "Titular",
    isActive: true,
  });

  await storage.createTenantMember({
    tenantId: brokerTenantA.id,
    userId: brokerOwnerA.id,
    role: "owner",
    canOriginate: true,
    isActive: true,
  });

  // Member 1: Collaborator / Analyst (canOriginate = false)
  const collaboratorAnalyst = await storage.createUser({
    email: "analista@brokernorte.com",
    role: "broker",
    firstName: "Laura",
    lastName: "MesaControl",
    isActive: true,
  });

  const collaboratorAnalystMember = await storage.createTenantMember({
    tenantId: brokerTenantA.id,
    userId: collaboratorAnalyst.id,
    role: "member",
    canOriginate: false,
    isActive: true,
  });

  // Member 2: Commercial Broker Member (canOriginate = true)
  const accreditedBrokerMember = await storage.createUser({
    email: "comercial@brokernorte.com",
    role: "broker",
    firstName: "Pedro",
    lastName: "Vendedor",
    isActive: true,
  });

  const accreditedBrokerMemberRecord = await storage.createTenantMember({
    tenantId: brokerTenantA.id,
    userId: accreditedBrokerMember.id,
    role: "member",
    canOriginate: true,
    isActive: true,
  });

  // 4. Setup Independent Broker Tenant B
  const brokerTenantB = await storage.createTenant({
    type: "broker",
    name: "Broker Sur SA",
    slug: "broker-sur",
    parentTenantId: platformTenant.id,
    settings: {},
    isActive: true,
  });

  const brokerOwnerB = await storage.createUser({
    email: "owner@brokersur.com",
    role: "broker",
    firstName: "Roberto",
    lastName: "Sur",
    isActive: true,
  });

  await storage.createTenantMember({
    tenantId: brokerTenantB.id,
    userId: brokerOwnerB.id,
    role: "owner",
    canOriginate: true,
    isActive: true,
  });

  console.log("      ✓ Estructura de organizaciones y miembros inicializada.\n");

  console.log("--- 2. Regla de Negocio: Originación Comercial por canOriginate ---");

  // TEST 2.1: Analyst without canOriginate tries to self-originate -> MUST FAIL
  const attemptAnalystSelf = await validateCommercialOrigination(
    {
      callerUser: collaboratorAnalyst,
      callerMembership: collaboratorAnalystMember,
      tenantId: brokerTenantA.id,
      requestedBrokerId: collaboratorAnalyst.id,
    },
    storage
  );
  assert(
    !attemptAnalystSelf.allowed && attemptAnalystSelf.message?.includes("capacidad de broker"),
    "Analista/Colaborador sin canOriginate intentando auto-adjudicarse originación/comisión es bloqueado con 403"
  );

  // TEST 2.2: Analyst capturing on behalf of accredited titular owner -> MUST SUCCEED
  const attemptAnalystCaptureForOwner = await validateCommercialOrigination(
    {
      callerUser: collaboratorAnalyst,
      callerMembership: collaboratorAnalystMember,
      tenantId: brokerTenantA.id,
      requestedBrokerId: brokerOwnerA.id,
    },
    storage
  );
  assert(
    attemptAnalystCaptureForOwner.allowed && attemptAnalystCaptureForOwner.brokerId === brokerOwnerA.id,
    "Analista/Colaborador capturando a nombre del titular de su organización es autorizado correctamente"
  );

  // TEST 2.3: Analyst capturing on behalf of accredited member broker -> MUST SUCCEED
  const attemptAnalystCaptureForMemberBroker = await validateCommercialOrigination(
    {
      callerUser: collaboratorAnalyst,
      callerMembership: collaboratorAnalystMember,
      tenantId: brokerTenantA.id,
      requestedBrokerId: accreditedBrokerMember.id,
    },
    storage
  );
  assert(
    attemptAnalystCaptureForMemberBroker.allowed && attemptAnalystCaptureForMemberBroker.brokerId === accreditedBrokerMember.id,
    "Analista capturando a nombre de un miembro habilitado como broker originador es autorizado"
  );

  // TEST 2.4: Member with canOriginate = true originating for self -> MUST SUCCEED
  const attemptAccreditedMemberSelf = await validateCommercialOrigination(
    {
      callerUser: accreditedBrokerMember,
      callerMembership: accreditedBrokerMemberRecord,
      tenantId: brokerTenantA.id,
      requestedBrokerId: accreditedBrokerMember.id,
    },
    storage
  );
  assert(
    attemptAccreditedMemberSelf.allowed && attemptAccreditedMemberSelf.brokerId === accreditedBrokerMember.id,
    "Miembro con canOriginate: true puede originar a su propio nombre y percibir su comisión"
  );

  // TEST 2.5: Titular owner originating for self -> MUST SUCCEED
  const attemptOwnerSelf = await validateCommercialOrigination(
    {
      callerUser: brokerOwnerA,
      callerMembership: { role: "owner", canOriginate: true, isActive: true },
      tenantId: brokerTenantA.id,
      requestedBrokerId: brokerOwnerA.id,
    },
    storage
  );
  assert(
    attemptOwnerSelf.allowed && attemptOwnerSelf.brokerId === brokerOwnerA.id,
    "Owner titular puede originar directamente a su propio nombre"
  );

  // TEST 2.6: Member attempting to assign a broker from an unrelated tenant -> MUST FAIL
  const attemptAssignForeignBroker = await validateCommercialOrigination(
    {
      callerUser: collaboratorAnalyst,
      callerMembership: collaboratorAnalystMember,
      tenantId: brokerTenantA.id,
      requestedBrokerId: brokerOwnerB.id,
    },
    storage
  );
  assert(
    !attemptAssignForeignBroker.allowed && attemptAssignForeignBroker.message?.includes("no pertenece"),
    "Intento de asignar un broker de otra organización diferente es rechazado"
  );

  console.log("\n--- 3. Creación y Consulta de Clientes y Créditos Multi-Usuario ---");

  // Create client in Tenant A by Analyst for Owner
  const clientA1 = await storage.createClient({
    tenantId: brokerTenantA.id,
    brokerId: brokerOwnerA.id,
    createdBy: collaboratorAnalyst.id,
    type: "persona_moral",
    businessName: "Empresa Norte SA de CV",
    email: "contacto@empresanorte.com",
  });
  assert(
    clientA1.tenantId === brokerTenantA.id && clientA1.brokerId === brokerOwnerA.id && clientA1.createdBy === collaboratorAnalyst.id,
    "Cliente creado con tripla organizational: tenantId + brokerId + createdBy"
  );

  // Create credit in Tenant A by Accredited Member
  const creditA1 = await storage.createCredit({
    tenantId: brokerTenantA.id,
    clientId: clientA1.id,
    brokerId: accreditedBrokerMember.id,
    createdBy: accreditedBrokerMember.id,
    amount: "1500000.00",
    status: "active",
  });
  assert(
    creditA1.tenantId === brokerTenantA.id && creditA1.brokerId === accreditedBrokerMember.id,
    "Crédito creado con tenantId y brokerId correspondiente al broker miembro acreditado"
  );

  // Create client in Tenant B by Owner B
  const clientB1 = await storage.createClient({
    tenantId: brokerTenantB.id,
    brokerId: brokerOwnerB.id,
    createdBy: brokerOwnerB.id,
    type: "fisica_empresarial",
    firstName: "Roberto",
    lastName: "Sur",
    email: "roberto@sur.com",
  });

  // Query clients by Tenant A: should return clientA1 and NOT clientB1
  const tenantAClients = await storage.getClients({ tenantId: brokerTenantA.id });
  assert(
    tenantAClients.some((c) => c.id === clientA1.id) && !tenantAClients.some((c) => c.id === clientB1.id),
    "Aislamiento de clientes: Broker Tenant A solo ve clientes de su organización"
  );

  // Query credits by Tenant A: should return creditA1
  const tenantACredits = await storage.getCredits({ tenantId: brokerTenantA.id });
  assert(
    tenantACredits.some((c) => c.id === creditA1.id),
    "Aislamiento de créditos: Broker Tenant A ve los créditos de todos los miembros de su organización"
  );

  console.log("\n--- 4. Jerarquía Master Broker ---");

  // Master Broker querying subordinates: [masterTenant.id, brokerTenantA.id]
  const masterSubordinates = await storage.getTenantsByParent(masterTenant.id);
  const masterAccessibleTenantIds = [masterTenant.id, ...masterSubordinates.map((t) => t.id)];

  const masterViewClients = await storage.getClients({ tenantIds: masterAccessibleTenantIds });
  assert(
    masterViewClients.some((c) => c.id === clientA1.id) && !masterViewClients.some((c) => c.id === clientB1.id),
    "Master Broker ve operaciones de su propio tenant + brokers subordinados (Tenant A), pero no de terceros (Tenant B)"
  );

  console.log("\n--- 5. Simulación de Backfill de Ownership (In-Memory) ---");

  // Create legacy unassigned client and credit
  const legacyClient = await storage.createClient({
    brokerId: brokerOwnerA.id,
    type: "persona_moral",
    businessName: "Cliente Histórico Sin Tenant",
  });

  const legacyCredit = await storage.createCredit({
    clientId: legacyClient.id,
    brokerId: brokerOwnerA.id,
    amount: "500000.00",
  });

  const memoryOwnershipAdapter: IOwnershipStorage = {
    async getClients() {
      return await storage.getClients();
    },
    async getCredits() {
      return await storage.getCredits();
    },
    async getDocuments() {
      return await storage.getDocuments();
    },
    async getCreditSubmissionRequests() {
      return await storage.getCreditSubmissionRequests();
    },
    async getTenants() {
      return await storage.getTenants();
    },
    async getTenantMembers() {
      return await storage.getTenantMembers();
    },
    async getAllUsers() {
      return await storage.getAllUsers();
    },
    async updateClientTenant(id, tenantId, createdBy) {
      await storage.updateClient(id, { tenantId, createdBy });
    },
    async updateCreditTenant(id, tenantId, createdBy) {
      await storage.updateCredit(id, { tenantId, createdBy });
    },
    async updateDocumentTenant(id, tenantId, uploadedBy) {
      await storage.updateDocument(id, { tenantId, uploadedBy });
    },
    async updateSubmissionTenant(id, tenantId, createdBy) {
      await storage.updateCreditSubmissionRequest(id, { tenantId, createdBy });
    },
  };

  // Dry run
  const dryRunReport = await executeOwnershipBackfill(memoryOwnershipAdapter, { apply: false });
  assert(
    dryRunReport.mode === "dry-run" && dryRunReport.plan.clientsToUpdate.length >= 1,
    "DRY-RUN detecta registros legacy pendientes sin alterar estado"
  );

  // Apply
  const applyReport = await executeOwnershipBackfill(memoryOwnershipAdapter, { apply: true });
  assert(
    applyReport.mode === "apply" && (applyReport.appliedCounts?.clientsUpdated ?? 0) >= 1,
    "APPLY migra los registros asignando tenantId del broker titular y createdBy"
  );

  // Verify post-condition
  const migratedClient = await storage.getClient(legacyClient.id);
  assert(
    migratedClient?.tenantId === brokerTenantA.id && migratedClient?.createdBy === brokerOwnerA.id,
    "Registro legacy migrado exitosamente con tenantId de la organización y createdBy preservado"
  );

  console.log("\n======================================================================");
  console.log(`  RESUMEN DE PRUEBAS BLOQUE 4:`);
  console.log(`  • Pasadas: ${passed}`);
  console.log(`  • Fallidas: ${failed}`);
  console.log("======================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Error fatal durante las pruebas:", err);
  process.exit(1);
});
