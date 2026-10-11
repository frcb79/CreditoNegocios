import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import express from "express";
// @ts-ignore
import request from "supertest";
import cron from "node-cron";
import bcrypt from "bcrypt";
import { storage } from "../../server/storage";
import { registerRoutes } from "../../server/routes";
import { pool } from "../../server/db";

describe("P0 - Temporal Commission Gate & Login Security Hardening", () => {
  let app: express.Express;
  let server: Server;
  let currentAuthUser: any = null;

  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    app = express();
    app.use(express.json());

    // Mock authentication middleware before registering routes
    app.use((req: any, _res: any, next: any) => {
      req.login = (_claims: any, cb: any) => cb(null);
      req.session = { save: (cb: any) => cb(null), regenerate: (cb: any) => cb(null) };
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

  // =========================================================================
  // 1. LOGIN SECURITY: Eliminación de contraseñas hardcodeadas y bypasses
  // =========================================================================
  describe("1. Login Security Hardening (/api/auth/login)", () => {
    let superAdminUser: any;
    let normalBrokerUser: any;
    let suspendedUser: any;
    const realPassword = "SuperSecurePassword2026!";

    beforeEach(async () => {
      currentAuthUser = null;
      const hashedPassword = await bcrypt.hash(realPassword, 10);

      superAdminUser = await storage.createUser({
        email: `francocb79@gmail.com`, // Correo antes sujeto a backdoor
        password: hashedPassword,
        firstName: "Franco",
        lastName: "Admin",
        role: "super_admin",
        isActive: true,
        status: "active",
      } as any);

      normalBrokerUser = await storage.createUser({
        email: `broker-${randomUUID()}@network.test`,
        password: hashedPassword,
        firstName: "Normal",
        lastName: "Broker",
        role: "broker",
        isActive: true,
        status: "active",
      } as any);

      suspendedUser = await storage.createUser({
        email: `suspended-${randomUUID()}@network.test`,
        password: hashedPassword,
        firstName: "Suspended",
        lastName: "User",
        role: "broker",
        isActive: true,
        status: "suspended",
      } as any);
    });

    it("Rechaza contraseñas hardcodeadas ('Prueba1$', 'Franco2026!*') en cuenta de super admin", async () => {
      // Intento 1: Prueba1$
      const res1 = await request(app)
        .post("/api/auth/login")
        .send({ email: "francocb79@gmail.com", password: "Prueba1$" });
      expect(res1.status).toBe(401);
      expect(res1.body.message).toMatch(/incorrectos/i);

      // Intento 2: Franco2026!*
      const res2 = await request(app)
        .post("/api/auth/login")
        .send({ email: "francocb79@gmail.com", password: "Franco2026!*" });
      expect(res2.status).toBe(401);
      expect(res2.body.message).toMatch(/incorrectos/i);
    });

    it("Permite login normal exclusivamente con contraseña válida criptográfica", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: "francocb79@gmail.com", password: realPassword });
      expect(res.status).toBe(200);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe("francocb79@gmail.com");
    });

    it("Bloquea cuentas suspendidas aun cuando la contraseña sea correcta", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: suspendedUser.email, password: realPassword });
      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/suspendida/i);
    });
  });

  // =========================================================================
  // 2. TEMPORAL COMMISSION GATE: Aprobación y Dispersión
  // =========================================================================
  describe("2. Control Temporal de Comisiones (Gate Estricto de Super Admin)", () => {
    let superAdmin: any;
    let regularAdmin: any;
    let brokerUser: any;
    let testCredit: any;
    let commissionPending: any;
    let commissionApproved: any;

    beforeEach(async () => {
      superAdmin = await storage.createUser({
        email: `super-${randomUUID()}@network.test`,
        firstName: "Super",
        lastName: "Admin",
        role: "super_admin",
        isActive: true,
        status: "active",
      } as any);

      regularAdmin = await storage.createUser({
        email: `admin-${randomUUID()}@network.test`,
        firstName: "Regular",
        lastName: "Admin",
        role: "admin", // NO es super_admin
        isActive: true,
        status: "active",
      } as any);

      brokerUser = await storage.createUser({
        email: `broker-payout-${randomUUID()}@network.test`,
        firstName: "Beneficiary",
        lastName: "Broker",
        role: "broker",
        bankName: "STP",
        clabe: "012180001234567890",
        accountHolder: "Beneficiary Broker",
        isActive: true,
        status: "active",
      } as any);

      const client = await storage.createClient({
        firstName: "Cliente",
        lastName: "Test",
        email: `client-${randomUUID()}@test.com`,
        brokerId: brokerUser.id,
        status: "active",
      } as any);

      testCredit = await storage.createCredit({
        clientId: client.id,
        brokerId: brokerUser.id,
        originMasterBrokerId: null,
        amount: "500000.00",
        status: "approved",
      } as any);

      commissionPending = await storage.createCommission({
        creditId: testCredit.id,
        brokerId: brokerUser.id,
        masterBrokerId: null,
        amount: "25000.00",
        brokerShare: "15000.00",
        masterBrokerShare: "0.00",
        appShare: "10000.00",
        status: "pending",
        commissionType: "apertura",
      } as any);

      commissionApproved = await storage.createCommission({
        creditId: testCredit.id,
        brokerId: brokerUser.id,
        masterBrokerId: null,
        amount: "25000.00",
        brokerShare: "15000.00",
        masterBrokerShare: "0.00",
        appShare: "10000.00",
        status: "approved",
        approvedBy: superAdmin.id,
        approvedAt: new Date(),
        frozenAmount: "15000.00",
        commissionType: "apertura",
      } as any);
    });

    // 2.1 Aprobación individual y exclusividad de Super Admin
    it("Aprobación: rechaza aprobación ejecutada por un admin regular que no es Super Admin", async () => {
      currentAuthUser = regularAdmin;
      const res = await request(app)
        .post(`/api/commissions/${commissionPending.id}/approve`)
        .send();

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/Solo Super Admin/i);
    });

    it("Aprobación: Super Admin aprueba exitosamente congelando importe y registrando auditoría", async () => {
      currentAuthUser = superAdmin;
      const res = await request(app)
        .post(`/api/commissions/${commissionPending.id}/approve`)
        .send();

      expect(res.status).toBe(200);
      expect(res.body.commission.status).toBe("approved");
      expect(res.body.commission.approvedBy).toBe(superAdmin.id);
      expect(Number(res.body.commission.frozenAmount)).toBe(15000);
    });

    it("Aprobación Masiva: deshabilitada temporalmente para obligar a revisión individual", async () => {
      currentAuthUser = superAdmin;
      const res = await request(app)
        .post("/api/commissions/bulk-approve")
        .send({ ids: [commissionPending.id] });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("BULK_APPROVAL_TEMPORARILY_DISABLED");
    });

    // 2.2 Bloqueo de dispersión sin aprobación completa
    it("Dispersión individual /pay: BLOQUEADA si la comisión está en estado 'pending' o 'generated'", async () => {
      currentAuthUser = superAdmin;
      const res = await request(app)
        .post(`/api/commissions/${commissionPending.id}/pay`)
        .send();

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("APPROVAL_PREREQUISITES_MISSING");

      // Verificar que se registró auditoría de bloqueo persistente
      const auditLogs = await storage.getCommissionAuditLogs(commissionPending.id);
      const blockedLog = auditLogs.find(l => l.action === "dispersion_blocked");
      expect(blockedLog).toBeDefined();
      expect((blockedLog?.details as any).reason).toBe("APPROVAL_PREREQUISITES_MISSING");
    });

    it("Dispersión individual /pay: BLOQUEADA si status es 'approved' pero falta approvedBy o frozenAmount", async () => {
      currentAuthUser = superAdmin;
      const incompleteComm = await storage.createCommission({
        creditId: testCredit.id,
        brokerId: brokerUser.id,
        status: "approved",
        approvedBy: null, // FALTA
        approvedAt: new Date(),
        frozenAmount: null, // FALTA
        brokerShare: "10000.00",
        commissionType: "apertura",
      } as any);

      const res = await request(app)
        .post(`/api/commissions/${incompleteComm.id}/pay`)
        .send();

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("APPROVAL_PREREQUISITES_MISSING");
    });

    it("Dispersión individual /pay: RECHAZADA con 403 si la invoca alguien que no sea Super Admin", async () => {
      currentAuthUser = regularAdmin;
      const res = await request(app)
        .post(`/api/commissions/${commissionApproved.id}/pay`)
        .send();

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/Solo Super Admin/i);
    });

    it("Dispersión individual /pay: PROCEDE exitosamente si cuenta con aprobación completa de Super Admin", async () => {
      currentAuthUser = superAdmin;
      const res = await request(app)
        .post(`/api/commissions/${commissionApproved.id}/pay`)
        .send();

      expect(res.status).toBe(200);
      expect(res.body.transactionId).toBeDefined();
      expect(res.body.payoutAmount).toBe(15000);

      const updated = await storage.getCommission(commissionApproved.id);
      expect(updated?.status).toBe("paid");
    });

    // 2.3 Liquidación manual /mark-paid
    it("Liquidación manual /mark-paid: BLOQUEADA si no cuenta con aprobación completa", async () => {
      currentAuthUser = superAdmin;
      const res = await request(app)
        .post(`/api/commissions/${commissionPending.id}/mark-paid`)
        .send({ notes: "Pago manual por ventanilla bancaria" });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("APPROVAL_PREREQUISITES_MISSING");
    });

    it("Liquidación manual /mark-paid: PROCEDE cuando cuenta con aprobación y nota obligatoria", async () => {
      currentAuthUser = superAdmin;
      const res = await request(app)
        .post(`/api/commissions/${commissionApproved.id}/mark-paid`)
        .send({ notes: "Cheque certificado liquidado en sucursal", reference: "CHQ-98765" });

      expect(res.status).toBe(200);
      expect(res.body.commission.status).toBe("paid");
      expect(res.body.commission.paymentMethod).toBe("manual");
    });

    // 2.4 Dispersión masiva /bulk-pay
    it("Dispersión masiva /bulk-pay: filtra y reporta comisiones sin aprobación previa", async () => {
      currentAuthUser = superAdmin;
      const res = await request(app)
        .post("/api/commissions/bulk-pay")
        .send({ ids: [commissionPending.id] });

      expect(res.status).toBe(200);
      expect(res.body.failed.length).toBe(1);
      expect(res.body.failed[0].reason).toMatch(/requiere estado 'approved'/i);
    });
  });
});
