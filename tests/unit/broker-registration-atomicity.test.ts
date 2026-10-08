import { describe, it, expect, beforeEach } from "@jest/globals";
import { MemStorage } from "../../server/storage";
import { getApprovedLegalDocument } from "../../server/legalDocuments";

describe("P0 - Broker Registration Atomicity & Network Affiliation", () => {
  let storage: MemStorage;
  const termsDoc = getApprovedLegalDocument("terminos", "1.0")!;
  const privacyDoc = getApprovedLegalDocument("aviso", "1.0")!;

  beforeEach(async () => {
    storage = new MemStorage();
  });

  it("atomically provisions broker identity, legal acceptances, own tenant and owner membership with canOriginate=true (Direct registration / Casa Matriz)", async () => {
    // Platform tenant already initialized in storage
    const platformTenant = (await storage.getTenants?.())?.find((t) => t.type === "platform")!;

    const result = await storage.registerUserWithLegalEvidence({
      userData: {
        email: "direct.broker@example.com",
        password: "hashed_password_123",
        firstName: "Carlos",
        lastName: "Directo",
        authMethod: "local",
        role: "broker",
      },
      evidence: {
        ipAddress: "203.0.113.10",
        userAgent: "Mozilla/5.0 TestBrowser",
        termsDoc,
        privacyDoc,
      },
    });

    // 1. User created
    expect(result.user).toBeDefined();
    expect(result.user.id).toBeDefined();
    expect(result.user.email).toBe("direct.broker@example.com");
    expect(result.user.role).toBe("broker");

    // 2. Legal acceptances created
    expect(result.acceptances).toHaveLength(2);
    expect(result.acceptances[0].acceptanceType).toBe("accept_terms");
    expect(result.acceptances[1].acceptanceType).toBe("acknowledge_privacy");

    // 3. Own tenant created
    expect(result.tenant).toBeDefined();
    expect(result.tenant.type).toBe("broker");
    expect((result.tenant.settings as any)?.legacyOwnerUserId).toBe(result.user.id);
    expect((result.tenant.settings as any)?.createdFrom).toBe("canonical_broker_creation");
    expect(result.tenant.parentTenantId).toBe(platformTenant.id);

    // 4. Owner membership with canOriginate=true created
    expect(result.member).toBeDefined();
    expect(result.member.tenantId).toBe(result.tenant.id);
    expect(result.member.userId).toBe(result.user.id);
    expect(result.member.role).toBe("owner");
    expect(result.member.canOriginate).toBe(true);

    // Verify stored state in storage
    const storedUser = await storage.getUser(result.user.id);
    const storedAcceptances = await storage.getLegalAcceptancesByUser(result.user.id);
    const storedTenant = await storage.getTenant(result.tenant.id);
    const storedMembers = await storage.getTenantMembers(result.tenant.id);

    expect(storedUser).toBeDefined();
    expect(storedAcceptances).toHaveLength(2);
    expect(storedTenant).toBeDefined();
    expect(storedMembers).toHaveLength(1);
    expect(storedMembers[0].canOriginate).toBe(true);
    expect(storedMembers[0].role).toBe("owner");
  });

  it("atomically provisions broker affiliated under Master Broker tenant when masterBrokerId is supplied", async () => {
    // Setup Master Broker user & tenant
    const mbUser = await storage.createUser({
      email: "master.leader@example.com",
      password: "password",
      firstName: "Raul",
      lastName: "Master",
      role: "master_broker",
      authMethod: "local",
    });

    const mbTenant = await storage.createTenant({
      name: "Organizacion Master Raul",
      slug: "org-master-raul",
      type: "master_broker",
      settings: {
        legacyOwnerUserId: mbUser.id,
      },
      isActive: true,
    });

    const result = await storage.registerUserWithLegalEvidence({
      userData: {
        email: "network.broker@example.com",
        password: "hashed_password_456",
        firstName: "Ana",
        lastName: "Subordinada",
        authMethod: "local",
        role: "broker",
        masterBrokerId: mbUser.id,
      },
      evidence: {
        ipAddress: "203.0.113.25",
        userAgent: "Mozilla/5.0 TestBrowser",
        termsDoc,
        privacyDoc,
      },
    });

    // Verified affiliation to Master's tenant
    expect(result.user.masterBrokerId).toBe(mbUser.id);
    expect(result.tenant.parentTenantId).toBe(mbTenant.id);
    expect(result.member.canOriginate).toBe(true);
    expect(result.member.role).toBe("owner");
  });

  it("rejects duplicate email and prevents partial record creation", async () => {
    await storage.registerUserWithLegalEvidence({
      userData: {
        email: "duplicate.check@example.com",
        password: "pass",
        firstName: "Original",
        lastName: "User",
        authMethod: "local",
        role: "broker",
      },
      evidence: {
        ipAddress: "203.0.113.1",
        userAgent: "Agent",
        termsDoc,
        privacyDoc,
      },
    });

    const initialTenantsCount = (await storage.getTenants?.())?.length || 0;
    const initialAcceptancesCount = (await storage.getAllLegalAcceptances?.())?.length || 0;

    await expect(
      storage.registerUserWithLegalEvidence({
        userData: {
          email: "duplicate.check@example.com",
          password: "other_pass",
          firstName: "Duplicate",
          lastName: "Attempt",
          authMethod: "local",
          role: "broker",
        },
        evidence: {
          ipAddress: "203.0.113.2",
          userAgent: "Agent",
          termsDoc,
          privacyDoc,
        },
      })
    ).rejects.toThrow("Este email ya está registrado");

    // Ensure no additional tenants or acceptances were created
    const afterTenantsCount = (await storage.getTenants?.())?.length || 0;
    const afterAcceptancesCount = (await storage.getAllLegalAcceptances?.())?.length || 0;
    expect(afterTenantsCount).toBe(initialTenantsCount);
    expect(afterAcceptancesCount).toBe(initialAcceptancesCount);
  });

  it("rolls back and creates nothing if legal evidence verification fails (corrupted hash or unapproved version)", async () => {
    const corruptedTerms = {
      ...termsDoc,
      contentSha256: "0000000000000000000000000000000000000000000000000000000000000000",
    };

    const initialUsersCount = Array.from((storage as any).users.values()).length;
    const initialTenantsCount = Array.from((storage as any).tenants.values()).length;

    await expect(
      storage.registerUserWithLegalEvidence({
        userData: {
          email: "tampered.hash@example.com",
          password: "pass",
          firstName: "Tamper",
          lastName: "Attempt",
          authMethod: "local",
          role: "broker",
        },
        evidence: {
          ipAddress: "203.0.113.5",
          userAgent: "Agent",
          termsDoc: corruptedTerms,
          privacyDoc,
        },
      })
    ).rejects.toThrow("Discrepancia en el hash de los Términos y Condiciones.");

    // Zero records created
    expect(Array.from((storage as any).users.values()).length).toBe(initialUsersCount);
    expect(Array.from((storage as any).tenants.values()).length).toBe(initialTenantsCount);
    expect(await storage.getUserByEmail("tampered.hash@example.com")).toBeUndefined();
  });
});
