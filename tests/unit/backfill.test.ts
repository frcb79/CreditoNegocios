import { MemStorage } from "../../server/storage";
import { executeBackfill, validatePostBackfill } from "../../server/backfillService";

describe("Organization Backfill Base Layer (Bloque 2)", () => {
  let storage: MemStorage;
  let superAdmin: any;
  let admin: any;
  let masterAlfa: any;
  let brokerAfiliado: any;
  let brokerDirecto: any;
  let brokerHuerfano: any;

  beforeAll(async () => {
    storage = new MemStorage();
    (storage as any).users.clear();
    (storage as any).tenants.clear();
    (storage as any).tenantMembers.clear();

    superAdmin = await storage.createUser({
      email: "sa@test.com",
      role: "super_admin",
      firstName: "Super",
      lastName: "Admin",
    });

    admin = await storage.createUser({
      email: "ad@test.com",
      role: "admin",
      firstName: "Admin",
      lastName: "User",
    });

    masterAlfa = await storage.createUser({
      email: "master@test.com",
      role: "master_broker",
      firstName: "Master",
      lastName: "Alfa",
      brandName: "Red Master Alfa",
      isWhiteLabel: true,
      primaryColor: "#112233",
    });

    brokerAfiliado = await storage.createUser({
      email: "afiliado@test.com",
      role: "broker",
      firstName: "Broker",
      lastName: "Afiliado",
      masterBrokerId: masterAlfa.id,
    });

    brokerDirecto = await storage.createUser({
      email: "directo@test.com",
      role: "broker",
      firstName: "Broker",
      lastName: "Directo",
    });

    brokerHuerfano = await storage.createUser({
      email: "huerfano@test.com",
      role: "broker",
      firstName: "Broker",
      lastName: "Huerfano",
      masterBrokerId: "invalid-id-xyz",
    });
  });

  it("should perform DRY RUN without creating any records in storage", async () => {
    const dryRun = await executeBackfill({ storage, dryRun: true });
    expect(dryRun.dryRun).toBe(true);
    expect(dryRun.summary.totalUsers).toBe(6);
    expect(dryRun.summary.masterTenantsToCreate).toBe(1);
    expect(dryRun.summary.brokerTenantsToCreate).toBe(3);
    expect(dryRun.summary.membershipsToCreate).toBe(6);

    const tenants = await storage.getTenants();
    expect(tenants.length).toBe(0);
  });

  it("should execute APPLY and map hierarchy and memberships correctly", async () => {
    const apply = await executeBackfill({ storage, dryRun: false });
    expect(apply.dryRun).toBe(false);

    const allTenants = await storage.getTenants();
    const allMembers = await storage.getTenantMembers();

    // 1. Platform tenant
    const platform = allTenants.find((t) => t.type === "platform");
    expect(platform).toBeDefined();
    expect(platform?.name).toBe("Crédito Negocios");

    // 2. Super admin -> platform / owner
    const saMember = allMembers.find(
      (m) => m.tenantId === platform?.id && m.userId === superAdmin.id
    );
    expect(saMember?.role).toBe("owner");

    // 3. Admin -> platform / admin
    const adMember = allMembers.find(
      (m) => m.tenantId === platform?.id && m.userId === admin.id
    );
    expect(adMember?.role).toBe("admin");

    // 4. Master -> master tenant / owner with parent platform
    const mbTenant = allTenants.find(
      (t) => (t.settings as any)?.legacyOwnerUserId === masterAlfa.id
    );
    expect(mbTenant?.type).toBe("master_broker");
    expect(mbTenant?.parentTenantId).toBe(platform?.id);
    expect(mbTenant?.name).toBe("Red Master Alfa");

    const mbMember = allMembers.find(
      (m) => m.tenantId === mbTenant?.id && m.userId === masterAlfa.id
    );
    expect(mbMember?.role).toBe("owner");

    // 5. Broker Afiliado -> parent is Master tenant
    const bAfiliadoTenant = allTenants.find(
      (t) => (t.settings as any)?.legacyOwnerUserId === brokerAfiliado.id
    );
    expect(bAfiliadoTenant?.parentTenantId).toBe(mbTenant?.id);

    // 6. Broker Directo & Huerfano -> parent is Platform tenant
    const bDirectoTenant = allTenants.find(
      (t) => (t.settings as any)?.legacyOwnerUserId === brokerDirecto.id
    );
    expect(bDirectoTenant?.parentTenantId).toBe(platform?.id);

    const bHuerfanoTenant = allTenants.find(
      (t) => (t.settings as any)?.legacyOwnerUserId === brokerHuerfano.id
    );
    expect(bHuerfanoTenant?.parentTenantId).toBe(platform?.id);

    // 7. Post-backfill validations pass
    const validation = await validatePostBackfill(storage);
    expect(validation.valid).toBe(true);
    expect(validation.errors.length).toBe(0);
  });

  it("should be idempotent on second run with zero new creations", async () => {
    const secondApply = await executeBackfill({ storage, dryRun: false });
    expect(secondApply.summary.masterTenantsToCreate).toBe(0);
    expect(secondApply.summary.brokerTenantsToCreate).toBe(0);
    expect(secondApply.summary.membershipsToCreate).toBe(0);
    expect(secondApply.createdTenantIds.length).toBe(0);
    expect(secondApply.createdMemberIds.length).toBe(0);

    const tenants = await storage.getTenants();
    expect(tenants.length).toBe(5); // 1 platform + 1 master + 3 brokers
  });
});
