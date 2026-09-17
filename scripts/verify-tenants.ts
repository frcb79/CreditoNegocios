import assert from "node:assert";
import { storage } from "../server/storage";
import {
  tenantContextMiddleware,
  requireTenantContext,
  requireTenantMembership,
  requireTenantRole,
} from "../server/middleware/tenantContext";

console.log("=== INICIANDO VERIFICACIÓN DE TENANTS Y MEMBRESÍAS (BLOQUE 1) ===");

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
  try {
    // ----------------------------------------------------
    // 1. STORAGE: Crear tenants y usuarios de prueba
    // ----------------------------------------------------
    console.log("\n[TEST 1] Verificando creación y recuperación de Tenants...");
    const tenant1 = await storage.createTenant({
      name: "Brokerage Alfa",
      slug: "brokerage-alfa",
      type: "brokerage",
      isActive: true,
      settings: { theme: "dark" },
    });
    assert.ok(tenant1.id, "Tenant 1 debe tener un ID asignado");
    assert.strictEqual(tenant1.slug, "brokerage-alfa");
    assert.strictEqual(tenant1.isActive, true);

    const fetchedTenant = await storage.getTenant(tenant1.id);
    assert.strictEqual(fetchedTenant?.id, tenant1.id);
    assert.strictEqual(fetchedTenant?.name, "Brokerage Alfa");

    const fetchedBySlug = await storage.getTenantBySlug("brokerage-alfa");
    assert.strictEqual(fetchedBySlug?.id, tenant1.id);

    const allTenants = await storage.getTenants();
    assert.ok(allTenants.some(t => t.id === tenant1.id), "Tenant 1 debe estar en la lista global");
    console.log("  ✓ Tenant creado y recuperado por ID y Slug correctamente");

    // Crear usuarios de prueba
    console.log("\n[TEST 2] Creando usuarios para pruebas de membresías...");
    const userOwner = await storage.createUser({
      email: "owner@alfa.com",
      role: "broker",
      firstName: "Carlos",
      lastName: "Owner",
    });

    const userAdmin = await storage.createUser({
      email: "admin@alfa.com",
      role: "broker",
      firstName: "Ana",
      lastName: "Admin",
    });

    const userMember = await storage.createUser({
      email: "member@alfa.com",
      role: "broker",
      firstName: "Mario",
      lastName: "Member",
    });

    const userInactive = await storage.createUser({
      email: "inactive@alfa.com",
      role: "broker",
      firstName: "Ines",
      lastName: "Inactive",
    });

    const userOutsider = await storage.createUser({
      email: "outsider@other.com",
      role: "broker",
      firstName: "Oscar",
      lastName: "Outsider",
    });

    const userSuperAdmin = await storage.createUser({
      email: "superadmin@platform.com",
      role: "super_admin",
      firstName: "Sam",
      lastName: "SuperAdmin",
    });
    console.log("  ✓ Usuarios de prueba creados exitosamente");

    // ----------------------------------------------------
    // 2. STORAGE: Validación de restricciones y FKs
    // ----------------------------------------------------
    console.log("\n[TEST 3] Verificando validaciones de existencia (Tenant / User)...");
    await assert.rejects(
      async () => {
        await storage.createTenantMember({
          tenantId: "non-existent-tenant-id",
          userId: userOwner.id,
          role: "owner",
          isActive: true,
        });
      },
      /does not exist|not found/i,
      "Debe rechazar creación de miembro si el tenant no existe"
    );
    console.log("  ✓ Rechaza creación con tenant inexistente");

    await assert.rejects(
      async () => {
        await storage.createTenantMember({
          tenantId: tenant1.id,
          userId: "non-existent-user-id",
          role: "owner",
          isActive: true,
        });
      },
      /does not exist|not found/i,
      "Debe rechazar creación de miembro si el usuario no existe"
    );
    console.log("  ✓ Rechaza creación con usuario inexistente");

    // ----------------------------------------------------
    // 3. STORAGE: Creación de membresías y unicidad
    // ----------------------------------------------------
    console.log("\n[TEST 4] Creando membresías y verificando unicidad (tenantId, userId)...");
    const mOwner = await storage.createTenantMember({
      tenantId: tenant1.id,
      userId: userOwner.id,
      role: "owner",
      isActive: true,
    });
    assert.ok(mOwner.id);
    assert.strictEqual(mOwner.role, "owner");
    assert.strictEqual(mOwner.isActive, true);

    const mAdmin = await storage.createTenantMember({
      tenantId: tenant1.id,
      userId: userAdmin.id,
      role: "admin",
      isActive: true,
    });
    assert.ok(mAdmin.id);

    const mMember = await storage.createTenantMember({
      tenantId: tenant1.id,
      userId: userMember.id,
      role: "member",
      isActive: true,
    });
    assert.ok(mMember.id);

    const mInactive = await storage.createTenantMember({
      tenantId: tenant1.id,
      userId: userInactive.id,
      role: "member",
      isActive: false,
    });
    assert.ok(mInactive.id);
    assert.strictEqual(mInactive.isActive, false);

    // Intentar membresía duplicada
    await assert.rejects(
      async () => {
        await storage.createTenantMember({
          tenantId: tenant1.id,
          userId: userOwner.id,
          role: "member",
          isActive: true,
        });
      },
      /already a member|already exists|duplicate/i,
      "Debe rechazar membresía duplicada para la misma combinación (tenantId, userId)"
    );
    console.log("  ✓ Membresías creadas y restricción de unicidad verificada");

    // Verificar consultas de miembros
    const members = await storage.getTenantMembers(tenant1.id);
    assert.strictEqual(members.length, 4, "Debe haber 4 miembros en el tenant");

    const ownerMembership = await storage.getUserTenantMembership(userOwner.id, tenant1.id);
    assert.strictEqual(ownerMembership?.id, mOwner.id);
    assert.strictEqual(ownerMembership?.role, "owner");

    const userMemberships = await storage.getTenantMembersByUser(userOwner.id);
    assert.strictEqual(userMemberships.length, 1);
    console.log("  ✓ Consultas de membresías por tenant y por usuario funcionan correctamente");

    // ----------------------------------------------------
    // 4. ESCENARIOS DE MIDDLEWARE:
    // ----------------------------------------------------
    console.log("\n[TEST 5] Escenario 1: Miembro ACTIVO accede a su tenant (requireTenantMembership)...");
    const resActiveMember = await testMiddleware(
      requireTenantMembership,
      {
        tenantContext: {
          tenant: tenant1,
          membership: mMember,
          isPlatformAdmin: false,
        },
      }
    );
    assert.strictEqual(resActiveMember.nextCalled, true, "Miembro activo debe pasar requireTenantMembership");
    console.log("  ✓ Escenario 1 APROBADO: Miembro activo tiene acceso");

    console.log("\n[TEST 6] Escenario 2: Usuario ajeno (NO miembro) es bloqueado (403)...");
    const resNonMember = await testMiddleware(
      requireTenantMembership,
      {
        tenantContext: {
          tenant: tenant1,
          membership: null,
          isPlatformAdmin: false,
        },
      }
    );
    assert.strictEqual(resNonMember.nextCalled, false, "No-miembro NO debe pasar");
    assert.strictEqual(resNonMember.status, 403, "Debe retornar 403");
    console.log("  ✓ Escenario 2 APROBADO: No-miembro recibe 403");

    console.log("\n[TEST 7] Escenario 3: Miembro INACTIVO es bloqueado (403)...");
    const resInactiveMember = await testMiddleware(
      requireTenantMembership,
      {
        tenantContext: {
          tenant: tenant1,
          membership: mInactive,
          isPlatformAdmin: false,
        },
      }
    );
    assert.strictEqual(resInactiveMember.nextCalled, false, "Miembro inactivo NO debe pasar");
    assert.strictEqual(resInactiveMember.status, 403, "Debe retornar 403");
    console.log("  ✓ Escenario 3 APROBADO: Miembro inactivo recibe 403");

    console.log("\n[TEST 8] Escenario 4: Roles owner y admin acceden a operaciones restringidas...");
    const resOwnerRole = await testMiddleware(
      requireTenantRole(["owner", "admin"]),
      {
        tenantContext: {
          tenant: tenant1,
          membership: mOwner,
          isPlatformAdmin: false,
        },
      }
    );
    assert.strictEqual(resOwnerRole.nextCalled, true, "Owner debe pasar requireTenantRole(['owner', 'admin'])");

    const resAdminRole = await testMiddleware(
      requireTenantRole(["owner", "admin"]),
      {
        tenantContext: {
          tenant: tenant1,
          membership: mAdmin,
          isPlatformAdmin: false,
        },
      }
    );
    assert.strictEqual(resAdminRole.nextCalled, true, "Admin debe pasar requireTenantRole(['owner', 'admin'])");
    console.log("  ✓ Escenario 4 APROBADO: Owner y Admin autorizados para operaciones restringidas");

    console.log("\n[TEST 9] Escenario 5: Rol member NO puede ejecutar operaciones de owner/admin (403)...");
    const resMemberBlocked = await testMiddleware(
      requireTenantRole(["owner", "admin"]),
      {
        tenantContext: {
          tenant: tenant1,
          membership: mMember,
          isPlatformAdmin: false,
        },
      }
    );
    assert.strictEqual(resMemberBlocked.nextCalled, false, "Member estándar NO debe pasar filtro owner/admin");
    assert.strictEqual(resMemberBlocked.status, 403, "Debe retornar 403");
    console.log("  ✓ Escenario 5 APROBADO: Rol member bloqueado con 403 en endpoints administrativos");

    console.log("\n[TEST 10] Escenario 6: Super Admin tiene bypass global en cualquier tenant...");
    const resSuperAdmin = await testMiddleware(
      requireTenantMembership,
      {
        user: { id: userSuperAdmin.id, role: "super_admin" },
        tenantContext: {
          tenant: tenant1,
          membership: null, // Sin membresía explícita
          isPlatformAdmin: true,
        },
      }
    );
    assert.strictEqual(resSuperAdmin.nextCalled, true, "Super Admin debe pasar requireTenantMembership sin membresía");

    const resSuperAdminRole = await testMiddleware(
      requireTenantRole(["owner"]),
      {
        user: { id: userSuperAdmin.id, role: "super_admin" },
        tenantContext: {
          tenant: tenant1,
          membership: null,
          isPlatformAdmin: true,
        },
      }
    );
    assert.strictEqual(resSuperAdminRole.nextCalled, true, "Super Admin debe pasar requireTenantRole sin membresía");
    console.log("  ✓ Escenario 6 APROBADO: Super Admin tiene bypass global sin membresía");

    // ----------------------------------------------------
    // 5. Verificación de resolución de tenantContextMiddleware
    // ----------------------------------------------------
    console.log("\n[TEST 11] Verificando resolución de contexto con tenantContextMiddleware...");
    // Simular request con header X-Tenant-Slug y claims.sub
    const reqWithHeader: any = {
      user: { claims: { sub: userOwner.id } },
      headers: { "x-tenant-slug": "brokerage-alfa" },
      query: {},
      params: {},
    };
    await testMiddleware(tenantContextMiddleware, reqWithHeader);
    assert.ok(reqWithHeader.tenantContext, "tenantContext debe ser creado");
    assert.strictEqual(reqWithHeader.tenantContext.tenant?.id, tenant1.id);
    assert.strictEqual(reqWithHeader.tenantContext.membership?.id, mOwner.id);
    assert.strictEqual(reqWithHeader.tenantContext.isPlatformAdmin, false);
    console.log("  ✓ tenantContextMiddleware resuelve tenant y membership vía header + claims.sub");

    // Simular request con query slug y user.id directo
    const reqWithQuery: any = {
      user: { id: userMember.id },
      headers: {},
      query: { slug: "brokerage-alfa" },
      params: {},
    };
    await testMiddleware(tenantContextMiddleware, reqWithQuery);
    assert.strictEqual(reqWithQuery.tenantContext.tenant?.id, tenant1.id);
    assert.strictEqual(reqWithQuery.tenantContext.membership?.id, mMember.id);
    console.log("  ✓ tenantContextMiddleware resuelve tenant y membership vía query.slug + req.user.id");

    // ----------------------------------------------------
    // 6. STORAGE: Actualización y borrado de membresías
    // ----------------------------------------------------
    console.log("\n[TEST 12] Verificando actualización de rol y activación/desactivación...");
    const updatedMember = await storage.updateTenantMember(mMember.id, {
      role: "admin",
      isActive: false,
    });
    assert.strictEqual(updatedMember?.role, "admin");
    assert.strictEqual(updatedMember?.isActive, false);

    // Reactivar
    const reactivatedMember = await storage.updateTenantMember(mMember.id, {
      isActive: true,
    });
    assert.strictEqual(reactivatedMember?.isActive, true);
    console.log("  ✓ Actualización de rol y reactivación de membresía confirmadas");

    console.log("\n=======================================================");
    console.log("✓ TODOS LOS TESTS DE TENANTS Y MEMBRESÍAS PASARON EXITOSAMENTE (12/12)");
    console.log("=======================================================\n");
  } catch (error) {
    console.error("\n❌ ERROR EN TEST DE TENANTS:", error);
    process.exit(1);
  }
})();
