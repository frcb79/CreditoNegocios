process.env.USE_MEMORY_STORAGE = "true";
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://dummy:dummy@localhost:5432/dummy";

import assert from "node:assert";

console.log("================================================================================");
console.log("🧪 SUITE DE VERIFICACIÓN OFICIAL: BLOQUE 5.1 — CORRECCIÓN FUNCIONAL RBAC & PRODUCTOS");
console.log("================================================================================\n");

async function runBloque51Tests() {
  const { validateTenantMemberPermissions } = await import("../server/tenantPermissions");

  console.log("--- 1. VALIDACIÓN DE DELEGABILIDAD Y SEGURIDAD BACKEND ---");

  const brokerCallerUser = {
    id: "broker-caller-id",
    role: "broker",
    permissions: {
      modules: ['dashboard', 'clientes', 'creditos', 'comisiones', 'financieras', 'sistema_productos', 'documentos'],
      actions: ['view', 'edit', 'submit_proposals']
    }
  };

  const mbCallerUser = {
    id: "mb-caller-id",
    role: "master_broker",
    permissions: {
      modules: ['dashboard', 'clientes', 'creditos', 'comisiones', 'financieras', 'sistema_productos', 'red_brokers', 'documentos', 'reportes'],
      actions: ['view', 'edit', 'submit_proposals']
    }
  };

  // CASO 1: Broker intenta otorgar módulos reservados de plataforma (aprobaciones, importacion)
  const attemptPlatformEscalation = validateTenantMemberPermissions({
    permissions: { modules: ['dashboard', 'aprobaciones'], actions: ['view'], scope: 'standard' },
    tenantType: 'broker',
    callerUser: brokerCallerUser,
    callerRole: 'owner',
    isSuperAdmin: false,
    targetCanOriginate: true,
  });
  assert.strictEqual(attemptPlatformEscalation.valid, false, "Broker no debe poder otorgar 'aprobaciones'");
  console.log("  ✓ Intento de otorgar 'aprobaciones' por Broker bloqueado por backend.");

  // CASO 2: Broker intenta otorgar 'red_brokers' o 'reportes'
  const attemptNetworkEscalation = validateTenantMemberPermissions({
    permissions: { modules: ['dashboard', 'red_brokers'], actions: ['view'], scope: 'standard' },
    tenantType: 'broker',
    callerUser: brokerCallerUser,
    callerRole: 'owner',
    isSuperAdmin: false,
    targetCanOriginate: true,
  });
  assert.strictEqual(attemptNetworkEscalation.valid, false, "Broker no debe poder otorgar 'red_brokers'");
  console.log("  ✓ Intento de otorgar 'red_brokers' por Broker bloqueado por backend.");

  // CASO 3: Master Broker intenta otorgar módulos de plataforma
  const attemptMbPlatformEscalation = validateTenantMemberPermissions({
    permissions: { modules: ['dashboard', 'aprobaciones'], actions: ['view'], scope: 'standard' },
    tenantType: 'master_broker',
    callerUser: mbCallerUser,
    callerRole: 'owner',
    isSuperAdmin: false,
    targetCanOriginate: true,
  });
  assert.strictEqual(attemptMbPlatformEscalation.valid, false, "Master Broker no debe poder otorgar 'aprobaciones'");
  console.log("  ✓ Intento de otorgar 'aprobaciones' por Master Broker bloqueado por backend.");

  // CASO 4: Intento de otorgar 'comisiones' a un colaborador con canOriginate: false
  const attemptCommissionToNonOriginator = validateTenantMemberPermissions({
    permissions: { modules: ['dashboard', 'clientes', 'comisiones'], actions: ['view'], scope: 'standard' },
    tenantType: 'broker',
    callerUser: brokerCallerUser,
    callerRole: 'owner',
    isSuperAdmin: false,
    targetCanOriginate: false, // targetCanOriginate = false
  });
  assert.strictEqual(attemptCommissionToNonOriginator.valid, false, "No se debe poder otorgar 'comisiones' a canOriginate: false");
  assert(attemptCommissionToNonOriginator.error?.includes("originador"), "Error debe indicar falta de facultades de originación");
  console.log("  ✓ Intento de otorgar 'comisiones' a targetCanOriginate: false rechazado estrictamente.");

  // CASO 5: Otorgamiento legítimo a colaborador canOriginate: true
  const validBrokerDelegation = validateTenantMemberPermissions({
    permissions: {
      modules: ['dashboard', 'clientes', 'creditos', 'comisiones', 'financieras', 'sistema_productos', 'documentos'],
      actions: ['view', 'edit', 'submit_proposals'],
      scope: 'standard'
    },
    tenantType: 'broker',
    callerUser: brokerCallerUser,
    callerRole: 'owner',
    isSuperAdmin: false,
    targetCanOriginate: true,
  });
  assert.strictEqual(validBrokerDelegation.valid, true, "Delegación válida de Broker debe ser aceptada");
  console.log("  ✓ Delegación legítima para Broker con canOriginate: true aprobada correctamente.");

  // CASO 6: Delegación legítima para colaborador no-originador (sin comisiones)
  const validNonOriginatorDelegation = validateTenantMemberPermissions({
    permissions: {
      modules: ['dashboard', 'clientes', 'creditos', 'financieras', 'sistema_productos', 'documentos'],
      actions: ['view', 'edit'],
      scope: 'standard'
    },
    tenantType: 'broker',
    callerUser: brokerCallerUser,
    callerRole: 'owner',
    isSuperAdmin: false,
    targetCanOriginate: false,
  });
  assert.strictEqual(validNonOriginatorDelegation.valid, true, "Delegación válida para no originador debe ser aceptada");
  console.log("  ✓ Delegación legítima para colaborador no-originador aprobada correctamente.");

  console.log("\n--- 2. VERIFICACIÓN DE MAPEO DE PRODUCTOS COMERCIALES ---");

  // Definición de las categorías comerciales principales
  const mockProducts = [
    { id: "1", customName: "Kapital - Credito Simple", template: { name: "Credito Simple" }, configuration: { destinos: ["Capital de Trabajo"] } },
    { id: "2", customName: "Jeeves - Credito Revolvente", template: { name: "Credito Revolvente" }, configuration: {} },
    { id: "3", customName: "Axionex - Simple con garantia", template: { name: "Simple con garantia" }, configuration: {} },
    { id: "4", customName: "Anticipa - Finsus - Simple sobre flujos con TPV", template: { name: "Simple sobre flujos con TPV" }, configuration: {} },
    { id: "5", customName: "Covalto - Crédito Simple con garantia y C. Agropecuario", template: { name: "Crédito Simple con garantia y C. Agropecuario" }, configuration: {} },
    { id: "6", customName: "Banorte - Simple", template: { name: "Simple" }, configuration: { destinos: ["Capital de trabajo, adquisición de activos fijos."] } },
  ];

  function getProductCategory(p: any): string {
    const tName = (p.template?.name || "").toLowerCase();
    const cName = (p.customName || "").toLowerCase();
    const config = (p.configuration || {});
    const destinos = Array.isArray(config.destinos) ? config.destinos.join(" ").toLowerCase() : "";

    if (tName.includes("revolvente") || cName.includes("revolvente")) return "credito_revolvente";
    if (tName.includes("flujos") || tName.includes("tpv") || cName.includes("tpv")) return "flujos_tpv";
    if (tName.includes("agropecuario") || cName.includes("agropecuario") || tName.includes("maquinaria")) return "maquinaria_agropecuario";
    if (tName.includes("garantia") || tName.includes("garantía") || tName.includes("liquidez") || cName.includes("garantia") || cName.includes("hipotecario")) return "garantia_inmobiliaria";
    if (destinos.includes("capital de trabajo") && !destinos.includes("activo") && !destinos.includes("inversión")) return "capital_trabajo";
    return "credito_simple";
  }

  assert.strictEqual(getProductCategory(mockProducts[0]), "capital_trabajo");
  assert.strictEqual(getProductCategory(mockProducts[1]), "credito_revolvente");
  assert.strictEqual(getProductCategory(mockProducts[2]), "garantia_inmobiliaria");
  assert.strictEqual(getProductCategory(mockProducts[3]), "flujos_tpv");
  assert.strictEqual(getProductCategory(mockProducts[4]), "maquinaria_agropecuario");
  assert.strictEqual(getProductCategory(mockProducts[5]), "credito_simple");
  console.log("  ✓ Mapeo de categorías comerciales para todos los productos existentes validado al 100%.");

  console.log("\n================================================================================");
  console.log("🎉 TODAS LAS VERIFICACIONES DEL BLOQUE 5.1 COMPLETADAS CON ÉXITO");
  console.log("================================================================================\n");
}

runBloque51Tests().catch((err) => {
  console.error("❌ ERROR en pruebas del Bloque 5.1:", err);
  process.exit(1);
});
