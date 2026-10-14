import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import express from "express";
// @ts-ignore
import request from "supertest";
import cron from "node-cron";
import { storage } from "../../server/storage";
import { registerRoutes } from "../../server/routes";
import { pool } from "../../server/db";
import { getApprovedLegalDocument } from "../../server/legalDocuments";

describe("P0 - HTTP Registration, Legal Acceptance & Network Affiliation", () => {
  let app: express.Express;
  let server: Server;
  let currentAuthUser: any = null;

  const termsDoc = getApprovedLegalDocument("terminos", "1.0")!;
  const privacyDoc = getApprovedLegalDocument("aviso", "1.0")!;

  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    app = express();
    app.use(express.json());

    // Mock authentication middleware before registering routes
    app.use((req: any, _res: any, next: any) => {
      req.login = (_claims: any, cb: any) => cb(null);
      req.session = { save: (cb: any) => cb(null) };
      if (currentAuthUser) {
        req.isAuthenticated = () => true;
        req.user = currentAuthUser;
        req.user.claims = { sub: currentAuthUser.id };
        req.dbUser = currentAuthUser;
      } else {
        req.isAuthenticated = () => false;
        req.user = null;
        req.dbUser = null;
      }
      next();
    });

    // Register legal routes & core routes
    server = await registerRoutes(app);
  });

  afterAll(async () => {
    cron.getTasks().forEach((task: any) => task.stop());
    if (server && (server as any).listening) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    try {
      await pool.end();
    } catch {
      // Ignore pool closing in test
    }
  });

  // -------------------------------------------------------------------------
  // 1. POST /api/auth/register (Registration Atomicity, Affiliation & Rollback)
  // -------------------------------------------------------------------------
  describe("1. POST /api/auth/register - Atomicity & Network Affiliation", () => {
    it("Direct Broker Registration: atomically creates broker, terms evidence, platform parent tenant, and owner member with canOriginate=true", async () => {
      currentAuthUser = null;
      const testEmail = `broker-direct-${randomUUID()}@network.test`;

      const res = await request(app)
        .post("/api/auth/register")
        .send({
          email: testEmail,
          password: "SecurePassword123!",
          firstName: "Carlos",
          lastName: "Directo",
          role: "broker",
          acceptTerms: true,
          termsVersion: termsDoc.version,
          acknowledgePrivacy: true,
          privacyVersion: privacyDoc.version,
        });

      expect(res.status).toBe(201);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe(testEmail);
      expect(res.body.user.role).toBe("broker");

      // Verify persisted user in storage
      const user = await storage.getUser(res.body.user.id);
      expect(user).toBeDefined();

      // Verify broker's own tenant and owner membership with canOriginate=true
      const allTenants = (await storage.getTenants?.()) || [];
      const platformTenant = allTenants.find((t: any) => t.type === "platform");
      expect(platformTenant).toBeDefined();

      const brokerTenant = allTenants.find((t: any) => (t.settings as any)?.legacyOwnerUserId === user?.id);
      expect(brokerTenant).toBeDefined();
      expect(brokerTenant?.type).toBe("broker");
      expect(brokerTenant?.parentTenantId).toBe(platformTenant?.id);

      const membership = await storage.getUserTenantMembership(user!.id, brokerTenant!.id);
      expect(membership).toBeDefined();
      expect(membership?.role).toBe("owner");
      expect(membership?.canOriginate).toBe(true);

      // Verify legal acceptances recorded
      const acceptances = await storage.getLegalAcceptancesByUser(user!.id);
      expect(acceptances).toHaveLength(2);
    });

    it("Broker Registration under Master: atomically associates broker to Master tenant", async () => {
      currentAuthUser = null;
      const refCode = `MB-${randomUUID().slice(0, 6).toUpperCase()}`;

      // Pre-provision Master Broker user and tenant
      const masterUser = await storage.createUser({
        email: `master-leader-${randomUUID()}@network.test`,
        firstName: "Master",
        lastName: "Lider",
        role: "master_broker",
        referralCode: refCode,
        isActive: true,
        status: "active",
      } as any);

      const masterTenant = await storage.createTenant({
        name: "Organizacion Master Lider",
        slug: `master-org-${randomUUID().slice(0, 8)}`,
        type: "master_broker",
        isActive: true,
        settings: { legacyOwnerUserId: masterUser.id },
      } as any);

      await storage.createTenantMember({
        tenantId: masterTenant.id,
        userId: masterUser.id,
        role: "owner",
        canOriginate: true,
        isActive: true,
      } as any);

      const subBrokerEmail = `sub-broker-${randomUUID()}@network.test`;
      const res = await request(app)
        .post("/api/auth/register")
        .send({
          email: subBrokerEmail,
          password: "SecurePassword123!",
          firstName: "Ana",
          lastName: "Subordinada",
          role: "broker",
          referralCode: refCode,
          acceptTerms: true,
          termsVersion: termsDoc.version,
          acknowledgePrivacy: true,
          privacyVersion: privacyDoc.version,
        });

      expect(res.status).toBe(201);
      const subUser = await storage.getUser(res.body.user.id);
      expect(subUser?.masterBrokerId).toBe(masterUser.id);

      // Check tenant affiliation
      const allTenants = (await storage.getTenants?.()) || [];
      const subTenant = allTenants.find((t: any) => (t.settings as any)?.legacyOwnerUserId === subUser?.id);
      expect(subTenant).toBeDefined();
      expect(subTenant?.parentTenantId).toBe(masterTenant.id);

      const membership = await storage.getUserTenantMembership(subUser!.id, subTenant!.id);
      expect(membership?.canOriginate).toBe(true);
      expect(membership?.role).toBe("owner");
    });

    it("Provisioning Failure & Rollback: rejects non-existent referralCode / Master and rolls back without orphan records", async () => {
      currentAuthUser = null;
      const invalidEmail = `failed-sub-${randomUUID()}@network.test`;

      const res = await request(app)
        .post("/api/auth/register")
        .send({
          email: invalidEmail,
          password: "SecurePassword123!",
          firstName: "Failed",
          lastName: "Subordinate",
          role: "broker",
          referralCode: "NON-EXISTENT-CODE",
          acceptTerms: true,
          termsVersion: termsDoc.version,
          acknowledgePrivacy: true,
          privacyVersion: privacyDoc.version,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/clave de franquicia/i);

      // Verify full rollback: user was NOT persisted
      const user = await storage.getUserByEmail(invalidEmail);
      expect(user).toBeUndefined();
    });

    it("Provisioning Failure & Rollback: rejects unapproved legal version and rolls back", async () => {
      currentAuthUser = null;
      const tamperEmail = `tamper-${randomUUID()}@network.test`;

      const res = await request(app)
        .post("/api/auth/register")
        .send({
          email: tamperEmail,
          password: "SecurePassword123!",
          firstName: "Tamper",
          lastName: "Test",
          role: "broker",
          acceptTerms: true,
          termsVersion: "99.0", // Unapproved version!
          acknowledgePrivacy: true,
          privacyVersion: privacyDoc.version,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/Aceptación legal inválida|desactualizada|no está vigente/i);

      // Verify full rollback
      const user = await storage.getUserByEmail(tamperEmail);
      expect(user).toBeUndefined();
    });

    it("Provisioning Failure & Rollback: rejects duplicate email and rolls back", async () => {
      currentAuthUser = null;
      const duplicateEmail = `dup-${randomUUID()}@network.test`;

      // Pre-register user
      await request(app)
        .post("/api/auth/register")
        .send({
          email: duplicateEmail,
          password: "SecurePassword123!",
          firstName: "First",
          lastName: "User",
          role: "broker",
          acceptTerms: true,
          termsVersion: termsDoc.version,
          acknowledgePrivacy: true,
          privacyVersion: privacyDoc.version,
        });

      const initialTenantsCount = ((await storage.getTenants?.()) || []).length;

      // Duplicate attempt
      const res = await request(app)
        .post("/api/auth/register")
        .send({
          email: duplicateEmail,
          password: "SecurePassword123!",
          firstName: "Second",
          lastName: "User",
          role: "broker",
          acceptTerms: true,
          termsVersion: termsDoc.version,
          acknowledgePrivacy: true,
          privacyVersion: privacyDoc.version,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/Este email ya está registrado/i);

      const afterTenantsCount = ((await storage.getTenants?.()) || []).length;
      expect(afterTenantsCount).toBe(initialTenantsCount);
    });
  });


});
