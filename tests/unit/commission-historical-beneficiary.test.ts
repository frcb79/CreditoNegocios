import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import express from "express";
// @ts-ignore
import request from "supertest";
import cron from "node-cron";
import { storage } from "../../server/storage";
import { registerRoutes } from "../../server/routes";
import { pool } from "../../server/db";

describe("Validación Crítica: Atribución Bancaria Histórica de Comisiones y Prevención de Spoofing CLABE", () => {
  let app: express.Express;
  let server: Server;
  let currentAuthUser: any = null;

  beforeAll(async () => {
    app = express();
    app.use(express.json());

    // Mock authentication middleware before registering routes
    app.use((req: any, _res: any, next: any) => {
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

  it("obtiene el beneficiario bancario del Master histórico guardado en la operación, NO del Master actual del broker", async () => {
    const adminUser = await storage.createUser({
      email: `admin-${randomUUID()}@network.test`,
      firstName: "Super",
      lastName: "Admin",
      role: "super_admin",
      isActive: true,
      status: "active",
    } as any);

    // Master A (Origination Master)
    const masterA = await storage.createUser({
      email: `master-a-${randomUUID()}@network.test`,
      firstName: "Master",
      lastName: "Alfa",
      role: "master_broker",
      bankName: "BBVA",
      clabe: "012180001111111111",
      accountHolder: "Master Alfa SAPI",
      isActive: true,
      status: "active",
    } as any);

    // Master B (New Master after transfer)
    const masterB = await storage.createUser({
      email: `master-b-${randomUUID()}@network.test`,
      firstName: "Master",
      lastName: "Beta",
      role: "master_broker",
      bankName: "Banorte",
      clabe: "072180002222222222",
      accountHolder: "Master Beta SAPI",
      isActive: true,
      status: "active",
    } as any);

    // Broker originally belongs to Master A
    const broker = await storage.createUser({
      email: `broker-${randomUUID()}@network.test`,
      firstName: "Broker",
      lastName: "Transferred",
      role: "broker",
      masterBrokerId: masterA.id,
      bankName: "Santander",
      clabe: "014180003333333333",
      accountHolder: "Broker Transferred",
      isActive: true,
      status: "active",
    } as any);

    const client = await storage.createClient({
      firstName: "Cliente",
      lastName: "Empresarial",
      email: `client-${randomUUID()}@test.com`,
      brokerId: broker.id,
      status: "active",
    } as any);

    // Credit originated under Master A
    const credit = await storage.createCredit({
      clientId: client.id,
      brokerId: broker.id,
      amount: "1000000.00",
      status: "approved",
    } as any);

    expect(credit.originMasterBrokerId).toBe(masterA.id);

    // Now broker is transferred to Master B!
    await storage.updateUser(broker.id, { masterBrokerId: masterB.id } as any);
    const updatedBroker = await storage.getUser(broker.id);
    expect(updatedBroker?.masterBrokerId).toBe(masterB.id);

    // Commission created for the credit originated under Master A
    const commission = await storage.createCommission({
      creditId: credit.id,
      brokerId: broker.id,
      masterBrokerId: credit.originMasterBrokerId,
      amount: "50000.00",
      brokerShare: "30000.00",
      masterBrokerShare: "20000.00",
      appShare: "0.00",
      status: "approved",
      commissionType: "apertura",
    } as any);

    // Authenticate as Super Admin to inspect GET /api/commissions
    currentAuthUser = adminUser;
    const res = await request(app).get("/api/commissions");
    expect(res.status).toBe(200);

    const found = res.body.find((c: any) => c.id === commission.id);
    expect(found).toBeDefined();

    // CRITICAL VALIDATION:
    // Effective beneficiary MUST be Master A (historical), NOT Master B (current broker master)!
    expect(found.effectiveBeneficiary).toBeDefined();
    expect(found.effectiveBeneficiary.id).toBe(masterA.id);
    expect(found.effectiveBeneficiary.name).toBe("Master Alfa SAPI");
    expect(found.effectiveBeneficiary.clabe).toBe("012180001111111111");

    // Bank account must belong to Master A
    expect(found.effectiveBankAccount).toBeDefined();
    expect(found.effectiveBankAccount.beneficiaryType).toBe("master_broker");
    expect(found.effectiveBankAccount.beneficiaryId).toBe(masterA.id);
    expect(found.effectiveBankAccount.clabe).toBe("012180001111111111");
    expect(found.effectiveBankAccount.bankName).toBe("BBVA");
  });

  it("rechaza el intento del frontend de alterar silenciosamente la CLABE del beneficiario histórico", async () => {
    const adminUser = await storage.createUser({
      email: `admin-spoof-${randomUUID()}@network.test`,
      firstName: "Super",
      lastName: "Admin",
      role: "super_admin",
      isActive: true,
      status: "active",
    } as any);

    const masterA = await storage.createUser({
      email: `master-a-spoof-${randomUUID()}@network.test`,
      firstName: "Master",
      lastName: "Alfa",
      role: "master_broker",
      bankName: "BBVA",
      clabe: "012180001111111111",
      accountHolder: "Master Alfa SAPI",
      isActive: true,
      status: "active",
    } as any);

    const broker = await storage.createUser({
      email: `broker-spoof-${randomUUID()}@network.test`,
      firstName: "Broker",
      lastName: "Test",
      role: "broker",
      masterBrokerId: masterA.id,
      bankName: "Santander",
      clabe: "014180003333333333",
      accountHolder: "Broker Test",
      isActive: true,
      status: "active",
    } as any);

    const client = await storage.createClient({
      firstName: "Cliente",
      lastName: "SpoofTest",
      email: `client-spoof-${randomUUID()}@test.com`,
      brokerId: broker.id,
      status: "active",
    } as any);

    const credit = await storage.createCredit({
      clientId: client.id,
      brokerId: broker.id,
      amount: "800000.00",
      status: "approved",
    } as any);

    const commission = await storage.createCommission({
      creditId: credit.id,
      brokerId: broker.id,
      masterBrokerId: masterA.id,
      amount: "40000.00",
      brokerShare: "25000.00",
      masterBrokerShare: "15000.00",
      appShare: "0.00",
      status: "approved",
      approvedBy: adminUser.id,
      approvedAt: new Date(),
      frozenAmount: "40000.00",
      commissionType: "apertura",
    } as any);

    currentAuthUser = adminUser;

    // Attacker / modified frontend sends a spoofed CLABE to divert funds
    const spoofedClabe = "999999999999999999";
    const payRes = await request(app)
      .post(`/api/commissions/${commission.id}/pay`)
      .send({ accountNumber: spoofedClabe });

    expect(payRes.status).toBe(400);
    expect(payRes.body.message).toMatch(/Discrepancia de seguridad/i);

    // Verify commission was NOT paid or altered
    const unchangedComm = await storage.getCommission(commission.id);
    expect(unchangedComm?.status).toBe("approved");
    expect(unchangedComm?.clabe).toBeFalsy();
  });

  it("bloquea el pago si el beneficiario histórico no cuenta con CLABE oficial registrada de 18 dígitos", async () => {
    const adminUser = await storage.createUser({
      email: `admin-noclabe-${randomUUID()}@network.test`,
      firstName: "Super",
      lastName: "Admin",
      role: "super_admin",
      isActive: true,
      status: "active",
    } as any);

    // Master without registered CLABE
    const masterWithoutClabe = await storage.createUser({
      email: `master-noclabe-${randomUUID()}@network.test`,
      firstName: "Master",
      lastName: "SinClabe",
      role: "master_broker",
      bankName: "BBVA",
      clabe: null,
      accountHolder: "Master Sin CLABE",
      isActive: true,
      status: "active",
    } as any);

    const broker = await storage.createUser({
      email: `broker-noclabe-${randomUUID()}@network.test`,
      firstName: "Broker",
      lastName: "Test",
      role: "broker",
      masterBrokerId: masterWithoutClabe.id,
      isActive: true,
      status: "active",
    } as any);

    const client = await storage.createClient({
      firstName: "Cliente",
      lastName: "SinClabe",
      email: `client-noclabe-${randomUUID()}@test.com`,
      brokerId: broker.id,
      status: "active",
    } as any);

    const credit = await storage.createCredit({
      clientId: client.id,
      brokerId: broker.id,
      amount: "600000.00",
      status: "approved",
    } as any);

    const commission = await storage.createCommission({
      creditId: credit.id,
      brokerId: broker.id,
      masterBrokerId: masterWithoutClabe.id,
      amount: "30000.00",
      brokerShare: "20000.00",
      masterBrokerShare: "10000.00",
      appShare: "0.00",
      status: "approved",
      approvedBy: adminUser.id,
      approvedAt: new Date(),
      frozenAmount: "30000.00",
      commissionType: "apertura",
    } as any);

    currentAuthUser = adminUser;
    const payRes = await request(app)
      .post(`/api/commissions/${commission.id}/pay`)
      .send({});

    expect(payRes.status).toBe(400);
    expect(payRes.body.message).toMatch(/no cuenta con una CLABE interbancaria válida/i);

    const unchangedComm = await storage.getCommission(commission.id);
    expect(unchangedComm?.status).toBe("approved");
  });
});
