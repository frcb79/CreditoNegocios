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
      // passport.initialize() installs its own req.logIn handler; mock a real
      // express-session contract including regenerate() to exercise that handler.
      req.session = {
        regenerate: (cb: any) => cb(null),
        save: (cb: any) => cb(null),
        destroy: (cb: any) => cb(null),
      };
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

  describe("P0 - Usuario y Credenciales (respuestas administrativas)", () => {
    let superAdmin: any;
    let broker: any;
    beforeAll(async () => {
      superAdmin = await storage.createUser({
        email: "api-sec-admin-" + randomUUID() + "@network.test",
        role: "super_admin", firstName: "Admin", lastName: "Seguro",
        permissions: { modules: ["*"], actions: ["*"] },
        isActive: true, status: "active",
      } as any);
      broker = await storage.createUser({
        email: "api-sec-broker-" + randomUUID() + "@network.test",
        role: "broker", firstName: "Broker", lastName: "Prueba",
        password: "$2b$hash-that-must-never-be-public",
        isActive: true, status: "active",
      } as any);
      await storage.setPasswordResetToken(broker.id, "PRIVATE_RESET_TOKEN_NEVER_RETURN", new Date(Date.now() + 3600000));
    });

    it("GET /api/users oculta hash y token de restablecimiento", async () => {
      currentAuthUser = superAdmin;
      const res = await request(app).get("/api/users");
      expect(res.status).toBe(200);
      const target = res.body.find((u: any) => u.id === broker.id);
      expect(target).toBeDefined();
      expect(target.email).toBe(broker.email);
      expect(target).not.toHaveProperty("password");
      expect(target).not.toHaveProperty("resetToken");
      expect(target).not.toHaveProperty("resetTokenExpiry");
    });

    it("GET /api/broker-network nunca devuelve tokens en la red administrativa", async () => {
      currentAuthUser = superAdmin;
      const res = await request(app).get("/api/broker-network");
      expect(res.status).toBe(200);
      const target = res.body.allBrokers.find((u: any) => u.id === broker.id);
      expect(target).toBeDefined();
      expect(target).not.toHaveProperty("password");
      expect(target).not.toHaveProperty("resetToken");
      expect(target).not.toHaveProperty("resetTokenExpiry");
    });

    it("GET /api/auth/user no devuelve secretos de recuperación al propio usuario", async () => {
      currentAuthUser = broker;
      const res = await request(app).get("/api/auth/user");
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(broker.id);
      expect(res.body).not.toHaveProperty("password");
      expect(res.body).not.toHaveProperty("resetToken");
      expect(res.body).not.toHaveProperty("resetTokenExpiry");
    });

    it("PATCH /api/users rechaza mutación de tokens, passwords o traslados", async () => {
      currentAuthUser = superAdmin;
      for (const update of [
        { resetToken: "ATTACKER_SESSION" },
        { password: "NewPasswordAttacker123!" },
        { resetTokenExpiry: new Date(Date.now() + 86400000).toISOString() },
      ]) {
        const response = await request(app).patch("/api/users/" + broker.id).send(update);
        expect(response.status).toBe(403);
      }
      const transfer = await request(app).patch("/api/users/" + broker.id)
        .send({ masterBrokerId: "forged-master-id" });
      expect(transfer.status).toBe(409);
      const alternateRoute = await request(app).put("/api/users/" + broker.id)
        .send({ resetToken: "HIJACK" });
      expect(alternateRoute.status).toBe(403);
      const alternateMove = await request(app).put("/api/users/" + broker.id)
        .send({ masterBrokerId: "evil-master" });
      expect(alternateMove.status).toBe(409);
      expect((await storage.getUser(broker.id))?.resetToken).toBe("PRIVATE_RESET_TOKEN_NEVER_RETURN");
    });
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



  describe("P0 - Notificaciones con aislamiento estricto de propietario", () => {
    it("niega PATCH/PUT cruzados sin mutar estado y permite al destinatario", async () => {
      const owner = await storage.createUser({
        email: "notification-owner-" + randomUUID() + "@network.test",
        firstName: "Owner", lastName: "Notifications", role: "broker",
        isActive: true, status: "active",
      } as any);
      const outsider = await storage.createUser({
        email: "notification-outsider-" + randomUUID() + "@network.test",
        firstName: "Other", lastName: "Notifications", role: "admin",
        isActive: true, status: "active",
      } as any);
      const notification = await storage.createNotification({
        userId: owner.id, type: "security_test",
        title: "Privada", message: "Solo destinatario",
      } as any);
      currentAuthUser = outsider;
      for (const method of ["patch", "put"] as const) {
        const response = await request(app)[method]("/api/notifications/" + notification.id + "/read");
        expect(response.status).toBe(404);
        expect((await storage.getNotifications(owner.id)).find(n => n.id === notification.id)?.isRead).toBe(false);
      }
      expect((await storage.getNotifications(outsider.id)).some(n => n.id === notification.id)).toBe(false);
      currentAuthUser = owner;
      const ownResponse = await request(app).patch("/api/notifications/" + notification.id + "/read");
      expect(ownResponse.status).toBe(200);
      expect((await storage.getNotifications(owner.id)).find(n => n.id === notification.id)?.isRead).toBe(true);
      const ownPut = await request(app).put("/api/notifications/" + notification.id + "/read");
      expect(ownPut.status).toBe(200);
    });
  });

});
