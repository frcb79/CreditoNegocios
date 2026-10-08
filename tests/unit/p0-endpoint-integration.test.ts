import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import express from "express";
// @ts-ignore
import request from "supertest";
import cron from "node-cron";
import { storage } from "../../server/storage";
import { registerRoutes } from "../../server/routes";
import { registerLegalRoutes } from "../../server/legalRoutes";
import { pool } from "../../server/db";
import { getApprovedLegalDocument } from "../../server/legalDocuments";

describe("P0 - Real HTTP Endpoint Integration Tests (STP Mock, Registration Atomicity & Payout Integrity)", () => {
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
    registerLegalRoutes(app);
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

  // -------------------------------------------------------------------------
  // 2. POST /api/commissions/:id/pay (STP Mock, Single Count & Discrepancies)
  // -------------------------------------------------------------------------
  describe("2. POST /api/commissions/:id/pay - STP Dispersion & Single Count Integrity", () => {
    let adminUser: any;

    beforeEach(async () => {
      adminUser = await storage.createUser({
        email: `admin-${randomUUID()}@network.test`,
        firstName: "Super",
        lastName: "Admin",
        role: "super_admin",
        isActive: true,
        status: "active",
      } as any);
      currentAuthUser = adminUser;
    });

    it("Master originador directo: pays single share once via mock STP and transitions to paid", async () => {
      const masterUser = await storage.createUser({
        email: `master-direct-${randomUUID()}@network.test`,
        firstName: "Master",
        lastName: "Directo",
        role: "master_broker",
        bankName: "BBVA",
        clabe: "012180001111111111",
        accountHolder: "Master Directo SA",
        isActive: true,
        status: "active",
      } as any);

      const client = await storage.createClient({
        firstName: "Cliente",
        lastName: "Directo",
        email: `client-direct-${randomUUID()}@test.com`,
        brokerId: masterUser.id,
        status: "active",
      } as any);

      const credit = await storage.createCredit({
        clientId: client.id,
        brokerId: masterUser.id,
        originMasterBrokerId: masterUser.id,
        amount: "1000000.00",
        status: "approved",
      } as any);

      const commission = await storage.createCommission({
        creditId: credit.id,
        brokerId: masterUser.id,
        masterBrokerId: masterUser.id, // isMasterDirect
        amount: "50000.00",
        brokerShare: "30000.00",
        masterBrokerShare: "30000.00", // Both hold 30,000
        appShare: "20000.00",
        status: "approved",
        commissionType: "apertura",
      } as any);

      const payRes = await request(app)
        .post(`/api/commissions/${commission.id}/pay`)
        .send();

      expect(payRes.status).toBe(200);
      expect(payRes.body.transactionId).toBeDefined();
      expect(payRes.body.transactionId).toMatch(/^STP-/);
      // Strictly single share ($30,000, NOT $60,000!)
      expect(payRes.body.payoutAmount).toBe(30000);

      // Verify persisted state
      const updatedComm = await storage.getCommission(commission.id);
      expect(updatedComm?.status).toBe("paid");
      expect(updatedComm?.clabe).toBe("012180001111111111");
    });

    it("Broker bajo Master: pays network distribution sum (Option B) to historical Master Broker", async () => {
      const masterUser = await storage.createUser({
        email: `master-net-${randomUUID()}@network.test`,
        firstName: "Master",
        lastName: "Network",
        role: "master_broker",
        bankName: "Santander",
        clabe: "014180002222222222",
        accountHolder: "Master Network SA",
        isActive: true,
        status: "active",
      } as any);

      const subBroker = await storage.createUser({
        email: `sub-net-${randomUUID()}@network.test`,
        firstName: "Sub",
        lastName: "Broker",
        role: "broker",
        masterBrokerId: masterUser.id,
        isActive: true,
        status: "active",
      } as any);

      const client = await storage.createClient({
        firstName: "Cliente",
        lastName: "Network",
        email: `client-net-${randomUUID()}@test.com`,
        brokerId: subBroker.id,
        status: "active",
      } as any);

      const credit = await storage.createCredit({
        clientId: client.id,
        brokerId: subBroker.id,
        originMasterBrokerId: masterUser.id,
        amount: "1000000.00",
        status: "approved",
      } as any);

      const commission = await storage.createCommission({
        creditId: credit.id,
        brokerId: subBroker.id,
        masterBrokerId: masterUser.id,
        amount: "50000.00",
        brokerShare: "20000.00",
        masterBrokerShare: "10000.00",
        appShare: "20000.00",
        status: "approved",
        commissionType: "apertura",
      } as any);

      const payRes = await request(app)
        .post(`/api/commissions/${commission.id}/pay`)
        .send();

      expect(payRes.status).toBe(200);
      expect(payRes.body.payoutAmount).toBe(30000); // 20k broker + 10k master
      expect(payRes.body.commission.clabe).toBe(masterUser.clabe);
    });

    it("Historical Beneficiary across broker transfer: pays original Master A, not Master B", async () => {
      const masterA = await storage.createUser({
        email: `master-a-${randomUUID()}@network.test`,
        firstName: "Master",
        lastName: "Alpha",
        role: "master_broker",
        bankName: "BBVA",
        clabe: "012180003333333333",
        accountHolder: "Master Alpha SA",
        isActive: true,
        status: "active",
      } as any);

      const masterB = await storage.createUser({
        email: `master-b-${randomUUID()}@network.test`,
        firstName: "Master",
        lastName: "Beta",
        role: "master_broker",
        bankName: "Banorte",
        clabe: "072180004444444444",
        accountHolder: "Master Beta SA",
        isActive: true,
        status: "active",
      } as any);

      const transferringBroker = await storage.createUser({
        email: `broker-transferred-${randomUUID()}@network.test`,
        firstName: "Broker",
        lastName: "Movido",
        role: "broker",
        masterBrokerId: masterA.id, // Originated under Master A
        isActive: true,
        status: "active",
      } as any);

      const client = await storage.createClient({
        firstName: "Cliente",
        lastName: "Transfer",
        email: `client-transfer-${randomUUID()}@test.com`,
        brokerId: transferringBroker.id,
        status: "active",
      } as any);

      const credit = await storage.createCredit({
        clientId: client.id,
        brokerId: transferringBroker.id,
        originMasterBrokerId: masterA.id, // Preserved historical attribution
        amount: "500000.00",
        status: "approved",
      } as any);

      const commission = await storage.createCommission({
        creditId: credit.id,
        brokerId: transferringBroker.id,
        masterBrokerId: masterA.id, // Commission tied to Master A
        amount: "25000.00",
        brokerShare: "15000.00",
        masterBrokerShare: "10000.00",
        appShare: "0.00",
        status: "approved",
        commissionType: "apertura",
      } as any);

      // Broker is transferred to Master B later
      await storage.updateUser(transferringBroker.id, { masterBrokerId: masterB.id } as any);

      const payRes = await request(app)
        .post(`/api/commissions/${commission.id}/pay`)
        .send();

      expect(payRes.status).toBe(200);
      expect(payRes.body.commission.clabe).toBe(masterA.clabe); // Master A, NOT Master B!
    });

    it("Security: rejects client-side CLABE spoofing attempt", async () => {
      const masterUser = await storage.createUser({
        email: `master-spoof-${randomUUID()}@network.test`,
        firstName: "Master",
        lastName: "Legit",
        role: "master_broker",
        bankName: "BBVA",
        clabe: "012180005555555555",
        accountHolder: "Master Legit SA",
        isActive: true,
        status: "active",
      } as any);

      const credit = await storage.createCredit({
        brokerId: masterUser.id,
        originMasterBrokerId: masterUser.id,
        amount: "100000.00",
        status: "approved",
      } as any);

      const commission = await storage.createCommission({
        creditId: credit.id,
        brokerId: masterUser.id,
        masterBrokerId: masterUser.id,
        amount: "10000.00",
        brokerShare: "6000.00",
        masterBrokerShare: "6000.00",
        status: "approved",
      } as any);

      // Spoofed CLABE in request body
      const payRes = await request(app)
        .post(`/api/commissions/${commission.id}/pay`)
        .send({ accountNumber: "999999999999999999" });

      expect(payRes.status).toBe(400);
      expect(payRes.body.message).toMatch(/Discrepancia de seguridad/i);

      // Commission was NOT dispersed or paid
      const commCheck = await storage.getCommission(commission.id);
      expect(commCheck?.status).toBe("approved");
    });

    it("Security: rejects payout when beneficiary lacks registered 18-digit CLABE", async () => {
      const masterNoClabe = await storage.createUser({
        email: `master-noclabe-${randomUUID()}@network.test`,
        firstName: "Master",
        lastName: "SinClabe",
        role: "master_broker",
        clabe: null, // Missing CLABE!
        isActive: true,
        status: "active",
      } as any);

      const credit = await storage.createCredit({
        brokerId: masterNoClabe.id,
        originMasterBrokerId: masterNoClabe.id,
        amount: "100000.00",
        status: "approved",
      } as any);

      const commission = await storage.createCommission({
        creditId: credit.id,
        brokerId: masterNoClabe.id,
        masterBrokerId: masterNoClabe.id,
        amount: "10000.00",
        brokerShare: "6000.00",
        masterBrokerShare: "6000.00",
        status: "approved",
      } as any);

      const payRes = await request(app)
        .post(`/api/commissions/${commission.id}/pay`)
        .send();

      expect(payRes.status).toBe(400);
      expect(payRes.body.message).toMatch(/no cuenta con una CLABE interbancaria válida/i);

      const commCheck = await storage.getCommission(commission.id);
      expect(commCheck?.status).toBe("approved");
    });

    it("Integrity: blocks liquidation on historical frozen discrepancy ($60k vs $30k) and requires admin review", async () => {
      const masterUser = await storage.createUser({
        email: `master-corrupt-${randomUUID()}@network.test`,
        firstName: "Master",
        lastName: "CorruptFreeze",
        role: "master_broker",
        clabe: "012180006666666666",
        accountHolder: "Master Test",
        isActive: true,
        status: "active",
      } as any);

      const credit = await storage.createCredit({
        brokerId: masterUser.id,
        originMasterBrokerId: masterUser.id,
        amount: "1000000.00",
        status: "approved",
      } as any);

      // Historical corrupted commission where frozenAmount was doubled
      const commission = await storage.createCommission({
        creditId: credit.id,
        brokerId: masterUser.id,
        masterBrokerId: masterUser.id,
        amount: "50000.00",
        brokerShare: "30000.00",
        masterBrokerShare: "30000.00",
        frozenAmount: "60000.00", // Corrupted doubled amount!
        status: "approved",
      } as any);

      const payRes = await request(app)
        .post(`/api/commissions/${commission.id}/pay`)
        .send();

      // Blocks liquidation with 400 and FROZEN_AMOUNT_DISCREPANCY
      expect(payRes.status).toBe(400);
      expect(payRes.body.code).toBe("FROZEN_AMOUNT_DISCREPANCY");
      expect(payRes.body.requiresAdminReview).toBe(true);
      expect(payRes.body.message).toMatch(/Discrepancia en importe congelado/i);

      // Verify commission was NOT modified or paid
      const commCheck = await storage.getCommission(commission.id);
      expect(commCheck?.status).toBe("approved");
      expect(commCheck?.frozenAmount).toBe("60000.00"); // Not silently altered
    });

    it("Integrity: blocks liquidation on explicit frozenAmount = 0.00", async () => {
      const masterUser = await storage.createUser({
        email: `master-zero-${randomUUID()}@network.test`,
        firstName: "Master",
        lastName: "ZeroFreeze",
        role: "master_broker",
        clabe: "012180007777777777",
        accountHolder: "Master Test",
        isActive: true,
        status: "active",
      } as any);

      const credit = await storage.createCredit({
        brokerId: masterUser.id,
        originMasterBrokerId: masterUser.id,
        amount: "500000.00",
        status: "approved",
      } as any);

      const commission = await storage.createCommission({
        creditId: credit.id,
        brokerId: masterUser.id,
        masterBrokerId: masterUser.id,
        amount: "25000.00",
        brokerShare: "15000.00",
        masterBrokerShare: "15000.00",
        frozenAmount: "0.00", // Explicit 0
        status: "approved",
      } as any);

      const payRes = await request(app)
        .post(`/api/commissions/${commission.id}/pay`)
        .send();

      expect(payRes.status).toBe(400);
      expect(payRes.body.code).toBe("FROZEN_AMOUNT_DISCREPANCY");
      expect(payRes.body.requiresAdminReview).toBe(true);

      const commCheck = await storage.getCommission(commission.id);
      expect(commCheck?.status).toBe("approved");
    });
  });

  // -------------------------------------------------------------------------
  // 3. POST /api/commissions/bulk-pay (Batch Execution & Discrepancy Filtering)
  // -------------------------------------------------------------------------
  describe("3. POST /api/commissions/bulk-pay - Batch STP Dispersion", () => {
    it("processes valid commissions while failing discrepancy commissions with clear audit reason", async () => {
      const adminUser = await storage.createUser({
        email: `admin-bulk-${randomUUID()}@network.test`,
        firstName: "Admin",
        lastName: "Bulk",
        role: "super_admin",
        isActive: true,
        status: "active",
      } as any);
      currentAuthUser = adminUser;

      const masterUser = await storage.createUser({
        email: `master-bulk-${randomUUID()}@network.test`,
        firstName: "Master",
        lastName: "Bulk",
        role: "master_broker",
        clabe: "012180008888888888",
        accountHolder: "Master Bulk SA",
        isActive: true,
        status: "active",
      } as any);

      const credit = await storage.createCredit({
        brokerId: masterUser.id,
        originMasterBrokerId: masterUser.id,
        amount: "1000000.00",
        status: "approved",
      } as any);

      // Valid commission
      const validComm = await storage.createCommission({
        creditId: credit.id,
        brokerId: masterUser.id,
        masterBrokerId: masterUser.id,
        amount: "50000.00",
        brokerShare: "30000.00",
        masterBrokerShare: "30000.00",
        status: "approved",
      } as any);

      // Discrepancy commission (frozen $60k vs expected $30k)
      const discrepancyComm = await storage.createCommission({
        creditId: credit.id,
        brokerId: masterUser.id,
        masterBrokerId: masterUser.id,
        amount: "50000.00",
        brokerShare: "30000.00",
        masterBrokerShare: "30000.00",
        frozenAmount: "60000.00",
        status: "approved",
      } as any);

      const bulkRes = await request(app)
        .post("/api/commissions/bulk-pay")
        .send({ ids: [validComm.id, discrepancyComm.id] });

      expect(bulkRes.status).toBe(200);
      expect(bulkRes.body.successful).toHaveLength(1);
      expect(bulkRes.body.successful[0].id).toBe(validComm.id);
      expect(bulkRes.body.successful[0].payoutAmount).toBe(30000); // Single share

      expect(bulkRes.body.failed).toHaveLength(1);
      expect(bulkRes.body.failed[0].id).toBe(discrepancyComm.id);
      expect(bulkRes.body.failed[0].reason).toMatch(/Discrepancia en importe congelado/i);

      // Discrepancy commission remains approved
      const commCheck = await storage.getCommission(discrepancyComm.id);
      expect(commCheck?.status).toBe("approved");
    });
  });

  // -------------------------------------------------------------------------
  // 4. POST /api/commissions/:id/mark-paid (Manual Liquidation & Retroactive Guard)
  // -------------------------------------------------------------------------
  describe("4. POST /api/commissions/:id/mark-paid - Manual Liquidation Guard", () => {
    it("manually marks valid commission as paid with notes and audit log", async () => {
      const adminUser = await storage.createUser({
        email: `admin-manual-${randomUUID()}@network.test`,
        firstName: "Admin",
        lastName: "Manual",
        role: "super_admin",
        isActive: true,
        status: "active",
      } as any);
      currentAuthUser = adminUser;

      const brokerUser = await storage.createUser({
        email: `broker-manual-${randomUUID()}@network.test`,
        firstName: "Broker",
        lastName: "Manual",
        role: "broker",
        isActive: true,
        status: "active",
      } as any);

      const credit = await storage.createCredit({
        brokerId: brokerUser.id,
        amount: "200000.00",
        status: "approved",
      } as any);

      const commission = await storage.createCommission({
        creditId: credit.id,
        brokerId: brokerUser.id,
        masterBrokerId: null,
        amount: "10000.00",
        brokerShare: "6000.00",
        status: "approved",
      } as any);

      const res = await request(app)
        .post(`/api/commissions/${commission.id}/mark-paid`)
        .send({
          notes: "Pago en ventanilla bancaria autorizado por Finanzas",
          reference: "REF-MANUAL-12345",
        });

      expect(res.status).toBe(200);
      expect(res.body.commission.status).toBe("paid");
      expect(res.body.commission.paymentMethod).toBe("manual");
      expect(res.body.commission.notes).toBe("Pago en ventanilla bancaria autorizado por Finanzas");
    });

    it("blocks manual payment if commission has frozen discrepancy", async () => {
      const adminUser = await storage.createUser({
        email: `admin-manual-disc-${randomUUID()}@network.test`,
        firstName: "Admin",
        lastName: "Manual",
        role: "super_admin",
        isActive: true,
        status: "active",
      } as any);
      currentAuthUser = adminUser;

      const masterUser = await storage.createUser({
        email: `master-manual-disc-${randomUUID()}@network.test`,
        firstName: "Master",
        lastName: "Directo",
        role: "master_broker",
        isActive: true,
        status: "active",
      } as any);

      const credit = await storage.createCredit({
        brokerId: masterUser.id,
        originMasterBrokerId: masterUser.id,
        amount: "500000.00",
        status: "approved",
      } as any);

      const commission = await storage.createCommission({
        creditId: credit.id,
        brokerId: masterUser.id,
        masterBrokerId: masterUser.id,
        amount: "25000.00",
        brokerShare: "15000.00",
        masterBrokerShare: "15000.00",
        frozenAmount: "30000.00", // Doubled discrepancy!
        status: "approved",
      } as any);

      const res = await request(app)
        .post(`/api/commissions/${commission.id}/mark-paid`)
        .send({
          notes: "Intento de liquidación manual con importe incongruente",
          reference: "REF-FAIL-999",
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("FROZEN_AMOUNT_DISCREPANCY");
      expect(res.body.requiresAdminReview).toBe(true);

      const commCheck = await storage.getCommission(commission.id);
      expect(commCheck?.status).toBe("approved");
    });

    it("No retroactive changes: returns existing state for already paid commission without re-modifying records", async () => {
      const adminUser = await storage.createUser({
        email: `admin-paid-${randomUUID()}@network.test`,
        firstName: "Admin",
        lastName: "Paid",
        role: "super_admin",
        isActive: true,
        status: "active",
      } as any);
      currentAuthUser = adminUser;

      const brokerUser = await storage.createUser({
        email: `broker-paid-${randomUUID()}@network.test`,
        firstName: "Broker",
        lastName: "Paid",
        role: "broker",
        isActive: true,
        status: "active",
      } as any);

      const paidDate = new Date("2026-09-01T10:00:00Z");
      const commission = await storage.createCommission({
        brokerId: brokerUser.id,
        amount: "10000.00",
        brokerShare: "6000.00",
        status: "paid",
        paidAt: paidDate,
        paymentMethod: "stp",
        trackingKey: "STP-HISTORIC-9999",
      } as any);

      const res = await request(app)
        .post(`/api/commissions/${commission.id}/mark-paid`)
        .send({
          notes: "Intento redundante",
          reference: "REF-NOOP",
        });

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/ya estaba marcada como pagada/i);
      expect(res.body.commission.trackingKey).toBe("STP-HISTORIC-9999");
    });
  });
});
