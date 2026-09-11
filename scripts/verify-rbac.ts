import assert from "node:assert";
import {
  getEffectivePermissions,
  requireModule,
  requireAction,
  requireModuleAndAction,
  requireAnyModule,
  requireRole,
} from "../server/middleware/rbacMiddleware";

console.log("=== INICIANDO VERIFICACIÓN DEL SISTEMA RBAC ===");

// 1. Test getEffectivePermissions
console.log("\n[TEST 1] Verificando getEffectivePermissions...");

// Super Admin
const superAdminPerms = getEffectivePermissions({ role: "super_admin", permissions: {} });
assert.strictEqual(superAdminPerms.scope, "global");
assert.ok(superAdminPerms.modules.includes("usuarios"), "super_admin debe tener módulo usuarios");
assert.ok(superAdminPerms.modules.includes("comisiones"), "super_admin debe tener módulo comisiones");
assert.ok(superAdminPerms.actions.includes("manage_users"), "super_admin debe tener acción manage_users");
assert.ok(superAdminPerms.actions.includes("approve_disperse"), "super_admin debe tener acción approve_disperse");
console.log("  ✓ super_admin tiene acceso global total");

// Master Broker por defecto
const mbPerms = getEffectivePermissions({ role: "master_broker", permissions: {} });
assert.strictEqual(mbPerms.scope, "network");
assert.ok(mbPerms.modules.includes("red_brokers"), "master_broker debe tener red_brokers");
assert.ok(mbPerms.modules.includes("usuarios"), "master_broker debe tener usuarios");
assert.ok(!mbPerms.modules.includes("aprobaciones"), "master_broker NO debe tener aprobaciones por defecto");
console.log("  ✓ master_broker tiene scope network y módulos correctos");

// Broker estándar por defecto
const brokerPerms = getEffectivePermissions({ role: "broker", permissions: {} });
assert.strictEqual(brokerPerms.scope, "own");
assert.ok(brokerPerms.modules.includes("clientes"), "broker debe tener clientes");
assert.ok(brokerPerms.modules.includes("creditos"), "broker debe tener creditos");
assert.ok(!brokerPerms.modules.includes("usuarios"), "broker NO debe tener usuarios");
assert.ok(!brokerPerms.modules.includes("red_brokers"), "broker NO debe tener red_brokers");
assert.ok(brokerPerms.actions.includes("view"), "broker debe tener view");
assert.ok(!brokerPerms.actions.includes("manage_users"), "broker NO debe tener manage_users");
console.log("  ✓ broker estándar tiene scope own y módulos restringidos");

// Broker con Permisos Granulares Personalizados (ej: Mesa de Control)
const mesaControlPerms = getEffectivePermissions({
  role: "broker",
  permissions: {
    modules: ["dashboard", "clientes", "creditos", "aprobaciones"],
    actions: ["view", "edit", "submit_proposals"],
    scope: "global",
  },
});
assert.strictEqual(mesaControlPerms.scope, "global");
assert.ok(mesaControlPerms.modules.includes("aprobaciones"), "Mesa de Control debe tener aprobaciones");
assert.ok(!mesaControlPerms.modules.includes("comisiones"), "Mesa de Control NO debe tener comisiones");
console.log("  ✓ Permisos granulares personalizados prevalecen sobre el rol base");


// 2. Test Middlewares
console.log("\n[TEST 2] Verificando middleware requireModule...");

async function testMiddleware(middleware: any, req: any): Promise<{ status?: number; jsonBody?: any; nextCalled: boolean }> {
  let status: number | undefined;
  let jsonBody: any;
  let nextCalled = false;

  const res: any = {
    status(s: number) {
      status = s;
      return this;
    },
    json(b: any) {
      jsonBody = b;
      return this;
    },
  };

  await middleware(req, res, () => {
    nextCalled = true;
  });

  return { status, jsonBody, nextCalled };
}

(async () => {
  // Super admin bypasses requireModule
  const res1 = await testMiddleware(
    requireModule("usuarios"),
    { dbUser: { role: "super_admin" } }
  );
  assert.ok(res1.nextCalled, "super_admin debe pasar libremente");
  console.log("  ✓ super_admin bypasses requireModule('usuarios')");

  // Broker blocked from admin module
  const res2 = await testMiddleware(
    requireModule("usuarios"),
    { dbUser: { role: "broker", permissions: {} } }
  );
  assert.strictEqual(res2.nextCalled, false, "broker no debe pasar a usuarios");
  assert.strictEqual(res2.status, 403, "status debe ser 403");
  console.log("  ✓ broker es bloqueado correctamente con 403 de requireModule('usuarios')");

  // Broker allowed in client module
  const res3 = await testMiddleware(
    requireModule("clientes"),
    { dbUser: { role: "broker", permissions: {} } }
  );
  assert.ok(res3.nextCalled, "broker debe pasar a clientes");
  console.log("  ✓ broker pasa a requireModule('clientes')");

  // 3. Test requireAction
  console.log("\n[TEST 3] Verificando middleware requireAction...");
  const res4 = await testMiddleware(
    requireAction("manage_users"),
    { dbUser: { role: "broker", permissions: {} } }
  );
  assert.strictEqual(res4.nextCalled, false);
  assert.strictEqual(res4.status, 403);
  console.log("  ✓ broker es bloqueado de acción manage_users");

  const res5 = await testMiddleware(
    requireAction("view"),
    { dbUser: { role: "broker", permissions: {} } }
  );
  assert.ok(res5.nextCalled);
  console.log("  ✓ broker puede ejecutar acción view");

  // 4. Test requireModuleAndAction
  console.log("\n[TEST 4] Verificando requireModuleAndAction...");
  const res6 = await testMiddleware(
    requireModuleAndAction("creditos", "edit"),
    { dbUser: { role: "broker", permissions: {} } }
  );
  assert.ok(res6.nextCalled);
  console.log("  ✓ broker con creditos:edit pasa requireModuleAndAction('creditos', 'edit')");

  const res7 = await testMiddleware(
    requireModuleAndAction("usuarios", "manage_users"),
    { dbUser: { role: "broker", permissions: {} } }
  );
  assert.strictEqual(res7.nextCalled, false);
  assert.strictEqual(res7.status, 403);
  console.log("  ✓ broker sin usuarios:manage_users es bloqueado correctamente");

  // 5. Test requireRole
  console.log("\n[TEST 5] Verificando requireRole...");
  const res8 = await testMiddleware(
    requireRole("admin", "master_broker"),
    { dbUser: { role: "broker" } }
  );
  assert.strictEqual(res8.nextCalled, false);
  assert.strictEqual(res8.status, 403);
  console.log("  ✓ broker bloqueado de requireRole('admin', 'master_broker')");

  const res9 = await testMiddleware(
    requireRole("admin", "master_broker"),
    { dbUser: { role: "master_broker" } }
  );
  assert.ok(res9.nextCalled);
  console.log("  ✓ master_broker pasa requireRole('admin', 'master_broker')");

  // 6. Test requireAnyModule
  console.log("\n[TEST 6] Verificando requireAnyModule...");
  const res10 = await testMiddleware(
    requireAnyModule("aprobaciones", "creditos"),
    { dbUser: { role: "broker", permissions: {} } }
  );
  assert.ok(res10.nextCalled, "broker con creditos debe pasar requireAnyModule('aprobaciones', 'creditos')");
  console.log("  ✓ requireAnyModule permite acceso si cumple al menos uno de los módulos");

  console.log("\n=============================================");
  console.log("✅ TODAS LAS PRUEBAS RBAC PASARON EXITOSAMENTE");
  console.log("=============================================\n");
  process.exit(0);
})();
