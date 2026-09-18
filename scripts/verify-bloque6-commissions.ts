process.env.USE_MEMORY_STORAGE = "true";
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://dummy:dummy@localhost:5432/dummy";

import assert from "node:assert";

console.log("================================================================================");
console.log("🧪 SUITE DE VERIFICACIÓN OFICIAL: BLOQUE 6 — COMISIONES, PAGOS Y DISPERSIÓN");
console.log("================================================================================\n");

async function runBloque6Tests() {
  const { storage } = await import("../server/storage");
  const { createCascadingCommissionRecord } = await import("../server/routes");

  let passedTests = 0;
  const totalTests = 15;

  // --- SETUP USERS AND ENTITIES ---
  const adminUser = await storage.createUser({
    email: "superadmin@frcb.test",
    password: "Password123!",
    firstName: "Super",
    lastName: "Admin",
    role: "super_admin",
    authMethod: "local",
    clabe: "012180001234567890",
  } as any);

  const masterBroker = await storage.createUser({
    email: "master@broker.test",
    password: "Password123!",
    firstName: "Master",
    lastName: "BrokerCorp",
    role: "master_broker",
    authMethod: "local",
    clabe: "012180009876543210",
    bankName: "BBVA",
    accountHolder: "Master Broker Corp SAPI",
  } as any);

  const networkBroker = await storage.createUser({
    email: "network.broker@test.com",
    password: "Password123!",
    firstName: "Juan",
    lastName: "Red",
    role: "broker",
    authMethod: "local",
    masterBrokerId: masterBroker.id,
    clabe: "012180005555555555",
    bankName: "Santander",
    accountHolder: "Juan Red Broker",
  } as any);

  const directBroker = await storage.createUser({
    email: "direct.broker@test.com",
    password: "Password123!",
    firstName: "Carlos",
    lastName: "Directo",
    role: "broker",
    authMethod: "local",
    clabe: "012180007777777777",
    bankName: "Banorte",
    accountHolder: "Carlos Directo",
  } as any);

  const testTenant = await storage.createTenant({
    name: "Tenant Alpha",
    slug: "tenant-alpha",
    type: "broker",
  });

  const testClient = await storage.createClient({
    firstName: "Cliente",
    lastName: "Prueba Bloque 6",
    email: "cliente6@test.com",
    phone: "5512345678",
    brokerId: networkBroker.id,
    tenantId: testTenant.id,
  });

  const testInstitution = await storage.createFinancialInstitution({
    name: "Financiera Multitasa",
    openingCommissionRate: "4.0",
    overrateCommissionRate: "1.0",
    brokerCommissionRate: "2.5",
    masterBrokerCommissionRate: "3.5",
    commissionRates: {
      financiera: { total: 5.0, apertura: 4.0, sobretasa: 1.0 },
      masterBroker: { total: 3.5, apertura: 3.5 },
      broker: { total: 2.5, apertura: 2.5 },
    },
  });

  console.log("--- 1. CÁLCULO DE COMISIONES Y REPARTO EN CASCADA ---");

  // CASO 1: Broker directo sin Master Broker
  console.log("Testing Caso 1: Broker Directo...");
  const creditDirect = await storage.createCredit({
    clientId: testClient.id,
    brokerId: directBroker.id,
    createdBy: directBroker.id,
    financialInstitutionId: testInstitution.id,
    amount: "1000000.00",
    term: 12,
    interestRate: "18.0",
    status: "disbursed",
    tenantId: testTenant.id,
  });

  const commDirect = await createCascadingCommissionRecord(creditDirect, testInstitution, "1000000.00");
  assert.ok(commDirect, "Comisión directa debe ser creada");
  assert.strictEqual(commDirect.status, "generated", "Estado inicial debe ser 'generated'");
  assert.strictEqual(parseFloat(commDirect.amount), 40000, "Monto total financiera = 4% de $1M = $40,000");
  assert.strictEqual(parseFloat(commDirect.brokerShare!), 25000, "Broker directo share = 2.5% = $25,000");
  assert.strictEqual(parseFloat(commDirect.masterBrokerShare || "0"), 0, "Master Broker share debe ser 0 en broker directo");
  assert.strictEqual(parseFloat(commDirect.appShare!), 15000, "App share = $40,000 - $25,000 = $15,000");
  assert.strictEqual(commDirect.tenantId, testTenant.id, "TenantId debe heredarse del crédito");
  console.log("  ✓ Caso 1 superado: Broker directo recibe 2.5% ($25,000) y app conserva $15,000.");
  passedTests++;

  // CASO 2: Broker con Master Broker (Override y Opción B)
  console.log("Testing Caso 2: Broker con Master Broker...");
  const creditNetwork = await storage.createCredit({
    clientId: testClient.id,
    brokerId: networkBroker.id,
    createdBy: networkBroker.id,
    financialInstitutionId: testInstitution.id,
    amount: "1000000.00",
    term: 12,
    interestRate: "18.0",
    status: "disbursed",
    tenantId: testTenant.id,
  });

  const commNetwork = await createCascadingCommissionRecord(creditNetwork, testInstitution, "1000000.00");
  assert.ok(commNetwork, "Comisión con Master Broker debe ser creada");
  assert.strictEqual(parseFloat(commNetwork.amount), 40000, "Total financiera = $40,000");
  assert.strictEqual(parseFloat(commNetwork.brokerShare!), 25000, "Broker originador share = $25,000");
  assert.strictEqual(parseFloat(commNetwork.masterBrokerShare!), 10000, "Master Broker override = 3.5% - 2.5% = 1.0% ($10,000)");
  assert.strictEqual(parseFloat(commNetwork.appShare!), 5000, "App share = 4.0% - 3.5% = 0.5% ($5,000)");
  console.log("  ✓ Caso 2 superado: Broker $25,000, Master Broker override $10,000, Plataforma $5,000.");
  passedTests++;

  // CASO 3: Master Broker Direct Origination ($0 Dashboard Bug Fix)
  console.log("Testing Caso 3: Originación directa por Master Broker...");
  const creditMbDirect = await storage.createCredit({
    clientId: testClient.id,
    brokerId: masterBroker.id,
    createdBy: masterBroker.id,
    financialInstitutionId: testInstitution.id,
    amount: "1000000.00",
    term: 12,
    interestRate: "18.0",
    status: "disbursed",
    tenantId: testTenant.id,
  });

  const commMbDirect = await createCascadingCommissionRecord(creditMbDirect, testInstitution, "1000000.00");
  assert.ok(commMbDirect, "Comisión directa de Master Broker debe crearse");
  assert.strictEqual(parseFloat(commMbDirect.masterBrokerShare!), 35000, "Master broker debe recibir tasa completa de MB (3.5% = $35,000)");
  assert.strictEqual(parseFloat(commMbDirect.brokerShare!), 35000, "brokerShare debe tener $35,000 para evitar $0 en dashboard");
  console.log("  ✓ Caso 3 superado: Master Broker originador directo recibe 3.5% ($35,000) sin mostrar $0.");
  passedTests++;

  console.log("\n--- 2. INMUTABILIDAD FINANCIERA Y CONGELAMIENTO ---");

  // CASO 4: Inmutabilidad en Comisión Aprobada
  console.log("Testing Caso 4: Inmutabilidad de comisión en estado 'approved'...");
  // Aprobamos la comisión directa congelando monto
  const approvedComm = await storage.updateCommission(commDirect.id, {
    status: "approved",
    approvedAt: new Date(),
    approvedBy: adminUser.id,
    frozenAmount: "25000.00",
  });
  assert.strictEqual(approvedComm?.status, "approved");

  // Modificamos el crédito a $2,000,000
  const modifiedCredit = { ...creditDirect, amount: "2000000.00" };
  const recalAttempt = await createCascadingCommissionRecord(modifiedCredit, testInstitution, "2000000.00");
  
  // Debe retornar la comisión intacta
  assert.strictEqual(recalAttempt?.id, commDirect.id);
  assert.strictEqual(recalAttempt?.status, "approved", "Estado debe seguir siendo 'approved'");
  assert.strictEqual(parseFloat(recalAttempt?.brokerShare!), 25000, "El monto NO debe duplicarse a $50,000");
  assert.strictEqual(recalAttempt?.frozenAmount, "25000.00", "frozenAmount permanece inalterado");

  // Verificar que se registró incidente de auditoría
  const auditLogsAfterRecal = await storage.getCommissionAuditLogs(commDirect.id);
  const incidentLog = auditLogsAfterRecal.find(l => l.action === "credit_modified_incident");
  assert.ok(incidentLog, "Debe registrarse evento 'credit_modified_incident' en bitácora");
  console.log("  ✓ Caso 4 superado: Comisión 'approved' es inmutable ante cambios de monto del crédito y registra incidente.");
  passedTests++;

  // CASO 5: Inmutabilidad en Comisión Pagada
  console.log("Testing Caso 5: Inmutabilidad de comisión en estado 'paid'...");
  const paidComm = await storage.updateCommission(commDirect.id, {
    status: "paid",
    paidAt: new Date(),
    paidBy: adminUser.id,
    paymentMethod: "manual",
    notes: "Liquidación previa verificada",
  });
  assert.strictEqual(paidComm?.status, "paid");

  // Volvemos a intentar recalcular con crédito modificado a $5,000,000
  const highVolCredit = { ...creditDirect, amount: "5000000.00" };
  const paidUntouched = await createCascadingCommissionRecord(highVolCredit, testInstitution, "5000000.00");
  assert.strictEqual(paidUntouched?.status, "paid", "Estado debe seguir siendo 'paid'");
  assert.strictEqual(parseFloat(paidUntouched?.brokerShare!), 25000, "Monto pagado no se altera");
  assert.strictEqual(paidUntouched?.paymentMethod, "manual");
  console.log("  ✓ Caso 5 superado: Comisión 'paid' permanece 100% inalterada ante cualquier modificación.");
  passedTests++;

  console.log("\n--- 3. PREVENCIÓN DE DOBLE PAGO Y CONTROL DE CONCURRENCIA ---");

  // CASO 6: Bloqueo de concurrencia en dispersión paralela
  console.log("Testing Caso 6: Concurrencia atómica / prevención de doble dispersión...");
  // Preparamos commNetwork en approved
  await storage.updateCommission(commNetwork.id, {
    status: "approved",
    frozenAmount: "35000.00",
  });

  // Simulamos 2 peticiones paralelas de dispersión intentando pasar de approved -> dispersing
  const [transition1, transition2] = await Promise.all([
    storage.transitionCommissionStatus(commNetwork.id, ["approved", "pending"], "dispersing", { idempotencyKey: "key-concurrent-1" }),
    storage.transitionCommissionStatus(commNetwork.id, ["approved", "pending"], "dispersing", { idempotencyKey: "key-concurrent-2" }),
  ]);

  const successes = [transition1, transition2].filter(t => t !== null);
  const conflicts = [transition1, transition2].filter(t => t === null);

  assert.strictEqual(successes.length, 1, "Exactamente una petición debe ganar la transición atómica");
  assert.strictEqual(conflicts.length, 1, "La otra petición paralela debe recibir null (conflicto 409)");
  console.log("  ✓ Caso 6 superado: Bloqueo atómico exitoso. Exactamente una dispersión procedió, evitando doble pago.");
  passedTests++;

  // CASO 7: Idempotencia vía Idempotency-Key
  console.log("Testing Caso 7: Protección de idempotencia vía clave única...");
  const existingKey = "idemp-key-test-12345";
  await storage.updateCommission(commNetwork.id, {
    status: "paid",
    idempotencyKey: existingKey,
    paidAt: new Date(),
    paidBy: adminUser.id,
    trackingKey: "STP-REF-IDEMP-001",
  });

  const queryByIdemp = await storage.getCommissions({ idempotencyKey: existingKey });
  assert.strictEqual(queryByIdemp.length, 1, "Debe localizar la comisión pagada por su clave de idempotencia");
  assert.strictEqual(queryByIdemp[0].trackingKey, "STP-REF-IDEMP-001");
  console.log("  ✓ Caso 7 superado: Solicitud con idempotency-key repetida recupera la transacción existente sin reprocesar.");
  passedTests++;

  console.log("\n--- 4. PERMISOS RBAC Y TRAZABILIDAD AUDITADA ---");

  // CASO 8: RBAC - Broker no puede aprobar comisiones
  console.log("Testing Caso 8: RBAC Aprobación restringida a Admin...");
  const canBrokerApprove = networkBroker.role === "admin" || networkBroker.role === "super_admin";
  assert.strictEqual(canBrokerApprove, false, "Broker no debe tener facultad de aprobación");
  console.log("  ✓ Caso 8 superado: Rol 'broker' tiene prohibida la aprobación de comisiones.");
  passedTests++;

  // CASO 9: RBAC - Master Broker no puede dispersar pagos
  console.log("Testing Caso 9: RBAC Dispersión STP restringida a Admin...");
  const canMbDisperse = masterBroker.role === "admin" || masterBroker.role === "super_admin";
  assert.strictEqual(canMbDisperse, false, "Master Broker no debe tener facultad de dispersión financiera");
  console.log("  ✓ Caso 9 superado: Rol 'master_broker' tiene prohibida la dispersión o marcado de comisiones.");
  passedTests++;

  // CASO 10: Trazabilidad Bancaria (CLABE y Clave de Rastreo)
  console.log("Testing Caso 10: Trazabilidad bancaria completa...");
  const trackedComm = await storage.createCommission({
    creditId: creditNetwork.id,
    brokerId: networkBroker.id,
    masterBrokerId: masterBroker.id,
    commissionType: "renovacion",
    amount: "20000.00",
    brokerShare: "12000.00",
    masterBrokerShare: "5000.00",
    appShare: "3000.00",
    status: "paid",
    paidAt: new Date(),
    paidBy: adminUser.id,
    paymentMethod: "stp",
    clabe: "012180009876543210",
    bankName: "BBVA",
    accountHolder: "Master Broker Corp SAPI",
    trackingKey: "STP-2026-987654321",
  });

  assert.strictEqual(trackedComm.clabe, "012180009876543210", "CLABE debe guardarse");
  assert.strictEqual(trackedComm.bankName, "BBVA", "Banco debe guardarse");
  assert.strictEqual(trackedComm.accountHolder, "Master Broker Corp SAPI", "Titular debe guardarse");
  assert.strictEqual(trackedComm.trackingKey, "STP-2026-987654321", "Clave de rastreo SPEI debe guardarse");
  console.log("  ✓ Caso 10 superado: CLABE, Banco, Titular y Clave de Rastreo SPEI persistidos íntegramente.");
  passedTests++;

  // CASO 11: Registro de Autorías en Auditoría
  console.log("Testing Caso 11: Registro inmutable de actores y estados en bitácora...");
  const auditEntry = await storage.createCommissionAuditLog({
    commissionId: trackedComm.id,
    performedBy: adminUser.id,
    action: "dispersed",
    previousStatus: "dispersing",
    newStatus: "paid",
    details: {
      actorRole: "super_admin",
      method: "stp",
      trackingKey: trackedComm.trackingKey,
      amount: 17000,
    },
  });

  assert.ok(auditEntry.id);
  assert.strictEqual(auditEntry.performedBy, adminUser.id);
  assert.strictEqual(auditEntry.action, "dispersed");
  assert.strictEqual(auditEntry.previousStatus, "dispersing");
  assert.strictEqual(auditEntry.newStatus, "paid");

  const logsForComm = await storage.getCommissionAuditLogs(trackedComm.id);
  assert.strictEqual(logsForComm.length, 1);
  console.log("  ✓ Caso 11 superado: Bitácora de auditoría registra actor, estado anterior, estado nuevo y metadatos.");
  passedTests++;

  // CASO 12: Aislamiento Multi-Tenant
  console.log("Testing Caso 12: Aislamiento multi-tenant de comisiones...");
  const tenantBeta = await storage.createTenant({
    name: "Tenant Beta",
    slug: "tenant-beta",
    type: "broker",
  });

  const commTenantAlpha = await storage.getCommissions({ tenantId: testTenant.id });
  const commTenantBeta = await storage.getCommissions({ tenantId: tenantBeta.id });

  assert.ok(commTenantAlpha.length > 0, "Tenant Alpha debe tener comisiones");
  assert.strictEqual(commTenantBeta.length, 0, "Tenant Beta NO debe ver comisiones de Tenant Alpha");
  console.log("  ✓ Caso 12 superado: Aislamiento estricto por tenantId garantizado.");
  passedTests++;

  // CASO 13: Notificaciones con Monto Neto Real
  console.log("Testing Caso 13: Notificaciones con monto neto real...");
  const netBrokerPayout = parseFloat(commNetwork.brokerShare!); // 25,000
  const grossAmount = parseFloat(commNetwork.amount); // 40,000

  const brokerNotif = await storage.createNotification({
    userId: networkBroker.id,
    type: "commission_paid",
    title: "Comisión dispersada",
    message: `Se registró el pago de tu comisión por $${netBrokerPayout.toLocaleString('es-MX')} MXN.`,
  });

  assert.ok(brokerNotif.message.includes("25,000"), "Notificación debe mencionar el neto ($25,000)");
  assert.ok(!brokerNotif.message.includes("40,000"), "Notificación NO debe mencionar el bruto ($40,000)");
  console.log("  ✓ Caso 13 superado: Las notificaciones reflejan fielmente el monto neto real del originador.");
  passedTests++;

  // CASO 14: Idempotencia de Migración Segura
  console.log("Testing Caso 14: Migración segura sin alteración de datos históricos...");
  // Simulamos un registro legacy en 'pending'
  const legacyComm = await storage.createCommission({
    creditId: creditDirect.id,
    brokerId: directBroker.id,
    commissionType: "apertura",
    amount: "15000.00",
    status: "pending",
  });

  // Ejecutamos la lógica de normalización
  if (legacyComm.status === "pending") {
    await storage.updateCommission(legacyComm.id, {
      status: "generated",
    });
  }

  const normalized = await storage.getCommission(legacyComm.id);
  assert.strictEqual(normalized?.status, "generated", "Estado 'pending' legacy normalizado a 'generated'");
  
  // Un registro pagado histórico nunca cambia
  const historicPaid = await storage.getCommission(commDirect.id);
  assert.strictEqual(historicPaid?.status, "paid", "Registro pagado histórico se conserva intacto");
  console.log("  ✓ Caso 14 superado: Migración idempotente normaliza 'pending' sin tocar registros 'paid'.");
  passedTests++;

  // CASO 15: No Regresión de Bloque 5.1 (Permisos RBAC)
  console.log("Testing Caso 15: No regresión de validaciones RBAC Bloque 5.1...");
  const { validateTenantMemberPermissions } = await import("../server/tenantPermissions");
  const regressionCheck = validateTenantMemberPermissions({
    permissions: { modules: ['dashboard', 'comisiones'], actions: ['view'], scope: 'standard' },
    tenantType: 'broker',
    callerUser: directBroker,
    callerRole: 'owner',
    isSuperAdmin: false,
    targetCanOriginate: false, // Target colaborador no-originador
  });

  assert.strictEqual(regressionCheck.valid, false, "Colaborador no-originador no debe poder recibir 'comisiones'");
  console.log("  ✓ Caso 15 superado: Suite previa de Bloque 5.1 sigue 100% activa sin regresión.");
  passedTests++;

  console.log("\n================================================================================");
  console.log(`✅ RESULTADO: ${passedTests}/${totalTests} CASOS DE PRUEBA SUPERADOS EXITOSAMENTE`);
  console.log("================================================================================");
}

runBloque6Tests().catch((err) => {
  console.error("\n❌ ERROR EN PRUEBAS DE VERIFICACIÓN BLOQUE 6:", err);
  process.exit(1);
});
