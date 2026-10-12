import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import express from "express";
// @ts-ignore
import request from "supertest";
import cron from "node-cron";
import { storage } from "../../server/storage";
import { registerRoutes } from "../../server/routes";
import { pool } from "../../server/db";

describe("FASE 2B.2C: Validación Documental Obligatoria para Pago de Comisiones (PAG-01 a PAG-06)", () => {
  let app: express.Express;
  let server: Server;
  let currentAuthUser: any = null;

  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    app = express();
    app.use(express.json());

    // Mock authentication middleware
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

  // Helper para crear documentos aprobados
  async function provisionApprovedDocument(
    brokerId: string,
    type: "ine" | "csf" | "estado_cuenta",
    reviewerId: string,
    options?: { status?: "approved" | "rejected" | "pending"; expiresAt?: string; notes?: string }
  ) {
    const status = options?.status || "approved";
    return await storage.createDocument({
      brokerId,
      uploadedBy: brokerId,
      type,
      fileName: `${type}_${brokerId}.pdf`,
      filePath: `/uploads/${type}_${brokerId}.pdf`,
      isValid: status === "approved",
      expiresAt: options?.expiresAt || null,
      extractedData: {
        status,
        reviewedBy: reviewerId,
        reviewedAt: new Date().toISOString(),
        reviewRole: "super_admin",
        reviewNotes: options?.notes || null,
        rejectionReason: status === "rejected" ? (options?.notes || "Documento rechazado") : null,
      },
    } as any);
  }

  // =========================================================================
  // 1. REGLA 2: VALIDACIÓN ADMINISTRATIVA Y RBAC
  // =========================================================================
  describe("1. Validación Administrativa de Documentos por Super Admin", () => {
    let superAdmin: any;
    let regularBroker: any;
    let masterBroker: any;
    let sampleDoc: any;

    beforeEach(async () => {
      superAdmin = await storage.createUser({
        email: `admin-doc-${randomUUID()}@network.test`,
        firstName: "Super",
        lastName: "Admin",
        role: "super_admin",
        isActive: true,
        status: "active",
      } as any);

      regularBroker = await storage.createUser({
        email: `broker-doc-${randomUUID()}@network.test`,
        firstName: "Broker",
        lastName: "Docs",
        role: "broker",
        isActive: true,
        status: "active",
      } as any);

      masterBroker = await storage.createUser({
        email: `master-doc-${randomUUID()}@network.test`,
        firstName: "Master",
        lastName: "Docs",
        role: "master_broker",
        isActive: true,
        status: "active",
      } as any);

      sampleDoc = await storage.createDocument({
        brokerId: regularBroker.id,
        uploadedBy: regularBroker.id,
        type: "ine",
        fileName: "ine_broker.pdf",
        filePath: "/uploads/ine_broker.pdf",
        isValid: false,
        extractedData: { status: "pending" },
      } as any);
    });

    it("Rechaza dictamen si es invocado por un Broker o Master Broker (RBAC 403)", async () => {
      currentAuthUser = regularBroker;
      const res = await request(app)
        .post(`/api/documents/${sampleDoc.id}/review`)
        .send({ status: "approved" });

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/Solo Super Admin/i);
    });

    it("Impide que un usuario auto-apruebe sus propios documentos (Conflicto de interés 403)", async () => {
      // Super admin sube un documento personal para cobrar comisiones
      const adminDoc = await storage.createDocument({
        brokerId: superAdmin.id,
        uploadedBy: superAdmin.id,
        type: "csf",
        fileName: "csf_admin.pdf",
        filePath: "/uploads/csf_admin.pdf",
        isValid: false,
        extractedData: { status: "pending" },
      } as any);

      currentAuthUser = superAdmin;
      const res = await request(app)
        .post(`/api/documents/${adminDoc.id}/review`)
        .send({ status: "approved" });

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/Conflicto de interés.*auto-aprobar/i);
    });

    it("Super Admin aprueba exitosamente un documento registrando auditoría", async () => {
      currentAuthUser = superAdmin;
      const res = await request(app)
        .post(`/api/documents/${sampleDoc.id}/review`)
        .send({
          status: "approved",
          notes: "Identificación oficial legible y vigente",
          expiresAt: "2030-12-31",
        });

      expect(res.status).toBe(200);
      expect(res.body.document.isValid).toBe(true);
      expect(res.body.document.extractedData.status).toBe("approved");
      expect(res.body.document.extractedData.reviewedBy).toBe(superAdmin.id);
      expect(res.body.document.extractedData.reviewRole).toBe("super_admin");
    });

    it("Super Admin rechaza un documento con justificación obligatoria", async () => {
      currentAuthUser = superAdmin;
      // Intento de rechazar sin motivo -> 400
      const resSinMotivo = await request(app)
        .post(`/api/documents/${sampleDoc.id}/review`)
        .send({ status: "rejected" });

      expect(resSinMotivo.status).toBe(400);

      // Con justificación -> 200
      const resConMotivo = await request(app)
        .post(`/api/documents/${sampleDoc.id}/review`)
        .send({ status: "rejected", notes: "Documento borroso, no se aprecian datos de vigencia" });

      expect(resConMotivo.status).toBe(200);
      expect(resConMotivo.body.document.isValid).toBe(false);
      expect(resConMotivo.body.document.extractedData.status).toBe("rejected");
      expect(resConMotivo.body.document.extractedData.rejectionReason).toMatch(/borroso/i);
    });
  });

  // =========================================================================
  // 2. REGLAS 1, 3 Y 4: CASOS BROKER DIRECTO
  // =========================================================================
  describe("2. Liquidación a Broker Directo (Positivo y Negativos)", () => {
    let superAdmin: any;
    let brokerUser: any;
    let credit: any;
    let commission: any;

    beforeEach(async () => {
      superAdmin = await storage.createUser({
        email: `sa-brk-${randomUUID()}@network.test`,
        firstName: "Super",
        lastName: "Admin",
        role: "super_admin",
        isActive: true,
        status: "active",
      } as any);

      brokerUser = await storage.createUser({
        email: `broker-dir-${randomUUID()}@network.test`,
        firstName: "Directo",
        lastName: "Broker",
        role: "broker",
        masterBrokerId: null,
        bankName: "BBVA México",
        clabe: "012180009999999999",
        accountHolder: "Directo Broker SA",
        isActive: true,
        status: "active",
      } as any);

      const client = await storage.createClient({
        firstName: "Cliente",
        lastName: "Directo",
        email: `cli-dir-${randomUUID()}@test.com`,
        brokerId: brokerUser.id,
        status: "active",
      } as any);

      credit = await storage.createCredit({
        clientId: client.id,
        brokerId: brokerUser.id,
        originMasterBrokerId: null,
        amount: "1000000.00",
        status: "approved",
      } as any);

      commission = await storage.createCommission({
        creditId: credit.id,
        brokerId: brokerUser.id,
        masterBrokerId: null,
        amount: "30000.00",
        brokerShare: "30000.00",
        masterBrokerShare: "0.00",
        status: "approved",
        approvedBy: superAdmin.id,
        approvedAt: new Date(),
        frozenAmount: "30000.00",
        commissionType: "apertura",
      } as any);
    });

    it("BLOQUEA /pay si el broker no tiene cargada la INE", async () => {
      currentAuthUser = superAdmin;

      // Solo tiene CSF y Estado de cuenta
      await provisionApprovedDocument(brokerUser.id, "csf", superAdmin.id);
      await provisionApprovedDocument(brokerUser.id, "estado_cuenta", superAdmin.id);

      const res = await request(app)
        .post(`/api/commissions/${commission.id}/pay`)
        .send();

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("DOCUMENTATION_PREREQUISITES_MISSING");
      expect(res.body.missingRequirements.some((r: string) => /INE.*no cargada/i.test(r))).toBe(true);

      // Verifica auditoría de dispersión bloqueada
      const logs = await storage.getCommissionAuditLogs(commission.id);
      const blockedLog = logs.find((l) => l.action === "dispersion_blocked");
      expect(blockedLog).toBeDefined();
      expect((blockedLog?.details as any).reason).toBe("DOCUMENTATION_PREREQUISITES_MISSING");
    });

    it("BLOQUEA /pay si la CSF fue rechazada por Super Admin", async () => {
      currentAuthUser = superAdmin;

      await provisionApprovedDocument(brokerUser.id, "ine", superAdmin.id);
      await provisionApprovedDocument(brokerUser.id, "csf", superAdmin.id, {
        status: "rejected",
        notes: "RFC no coincide con persona dada de alta",
      });
      await provisionApprovedDocument(brokerUser.id, "estado_cuenta", superAdmin.id);

      const res = await request(app)
        .post(`/api/commissions/${commission.id}/pay`)
        .send();

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("DOCUMENTATION_PREREQUISITES_MISSING");
      expect(res.body.missingRequirements.some((r: string) => /CSF.*rechazada/i.test(r))).toBe(true);
    });

    it("BLOQUEA /pay si el estado de cuenta bancario está vencido", async () => {
      currentAuthUser = superAdmin;

      await provisionApprovedDocument(brokerUser.id, "ine", superAdmin.id);
      await provisionApprovedDocument(brokerUser.id, "csf", superAdmin.id);
      await provisionApprovedDocument(brokerUser.id, "estado_cuenta", superAdmin.id, {
        expiresAt: "2020-01-01", // Fecha pasada
      });

      const res = await request(app)
        .post(`/api/commissions/${commission.id}/pay`)
        .send();

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("DOCUMENTATION_PREREQUISITES_MISSING");
      expect(res.body.missingRequirements.some((r: string) => /Estado de cuenta.*vencido/i.test(r))).toBe(true);
    });

    it("BLOQUEA liquidación manual /mark-paid si faltan documentos obligatorios", async () => {
      currentAuthUser = superAdmin;

      // Sin documentos
      const res = await request(app)
        .post(`/api/commissions/${commission.id}/mark-paid`)
        .send({ notes: "Pago en efectivo por ventanilla" });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("DOCUMENTATION_PREREQUISITES_MISSING");

      // Comisión no debe transicionar a 'paid'
      const comm = await storage.getCommission(commission.id);
      expect(comm?.status).toBe("approved");
    });

    it("AUTORIZA /pay cuando Broker Directo cuenta con INE, CSF, Estado de Cuenta y datos bancarios aprobados", async () => {
      currentAuthUser = superAdmin;

      await provisionApprovedDocument(brokerUser.id, "ine", superAdmin.id);
      await provisionApprovedDocument(brokerUser.id, "csf", superAdmin.id);
      await provisionApprovedDocument(brokerUser.id, "estado_cuenta", superAdmin.id);

      const res = await request(app)
        .post(`/api/commissions/${commission.id}/pay`)
        .send();

      expect(res.status).toBe(200);
      expect(res.body.transactionId).toBeDefined();
      expect(res.body.payoutAmount).toBe(30000);

      const comm = await storage.getCommission(commission.id);
      expect(comm?.status).toBe("paid");
    });
  });

  // =========================================================================
  // 3. REGLA 4: CASOS MASTER DIRECTO Y BROKER DE RED
  // =========================================================================
  describe("3. Liquidación a Master Directo y Broker de Red", () => {
    let superAdmin: any;
    let masterUser: any;
    let networkBrokerUser: any;

    beforeEach(async () => {
      superAdmin = await storage.createUser({
        email: `sa-net-${randomUUID()}@network.test`,
        firstName: "Super",
        lastName: "Admin",
        role: "super_admin",
        isActive: true,
        status: "active",
      } as any);

      masterUser = await storage.createUser({
        email: `master-net-${randomUUID()}@network.test`,
        firstName: "Master",
        lastName: "Red",
        role: "master_broker",
        bankName: "Santander",
        clabe: "014180008888888888",
        accountHolder: "Master Red SAPI",
        isActive: true,
        status: "active",
      } as any);

      networkBrokerUser = await storage.createUser({
        email: `broker-net-${randomUUID()}@network.test`,
        firstName: "Broker",
        lastName: "Subordinado",
        role: "broker",
        masterBrokerId: masterUser.id,
        bankName: "Banorte",
        clabe: "072180007777777777",
        accountHolder: "Broker Subordinado",
        isActive: true,
        status: "active",
      } as any);
    });

    it("Master Directo: procede cuando el Master cuenta con toda su documentación aprobada", async () => {
      currentAuthUser = superAdmin;

      const client = await storage.createClient({
        firstName: "Cliente",
        lastName: "MasterDir",
        email: `cli-md-${randomUUID()}@test.com`,
        brokerId: masterUser.id,
        status: "active",
      } as any);

      const credit = await storage.createCredit({
        clientId: client.id,
        brokerId: masterUser.id,
        originMasterBrokerId: masterUser.id,
        amount: "500000.00",
        status: "approved",
      } as any);

      const commission = await storage.createCommission({
        creditId: credit.id,
        brokerId: masterUser.id,
        masterBrokerId: masterUser.id,
        amount: "20000.00",
        brokerShare: "20000.00",
        masterBrokerShare: "20000.00",
        status: "approved",
        approvedBy: superAdmin.id,
        approvedAt: new Date(),
        frozenAmount: "20000.00",
        commissionType: "apertura",
      } as any);

      // Sin documentos -> bloquea
      const resBlock = await request(app)
        .post(`/api/commissions/${commission.id}/pay`)
        .send();
      expect(resBlock.status).toBe(400);

      // Provisionar documentación completa aprobada al Master
      await provisionApprovedDocument(masterUser.id, "ine", superAdmin.id);
      await provisionApprovedDocument(masterUser.id, "csf", superAdmin.id);
      await provisionApprovedDocument(masterUser.id, "estado_cuenta", superAdmin.id);

      const resSuccess = await request(app)
        .post(`/api/commissions/${commission.id}/pay`)
        .send();
      expect(resSuccess.status).toBe(200);
      expect(resSuccess.body.payoutAmount).toBe(20000);
    });

    it("Broker de Red: bloquea si el Master o el Broker de red tienen documentación pendiente", async () => {
      currentAuthUser = superAdmin;

      const client = await storage.createClient({
        firstName: "Cliente",
        lastName: "Red",
        email: `cli-red-${randomUUID()}@test.com`,
        brokerId: networkBrokerUser.id,
        status: "active",
      } as any);

      const credit = await storage.createCredit({
        clientId: client.id,
        brokerId: networkBrokerUser.id,
        originMasterBrokerId: masterUser.id,
        amount: "800000.00",
        status: "approved",
      } as any);

      const commission = await storage.createCommission({
        creditId: credit.id,
        brokerId: networkBrokerUser.id,
        masterBrokerId: masterUser.id,
        amount: "40000.00",
        brokerShare: "25000.00",
        masterBrokerShare: "15000.00",
        status: "approved",
        approvedBy: superAdmin.id,
        approvedAt: new Date(),
        frozenAmount: "40000.00",
        commissionType: "apertura",
      } as any);

      // Solo el Master tiene documentos aprobados; el Broker subordinado NO tiene
      await provisionApprovedDocument(masterUser.id, "ine", superAdmin.id);
      await provisionApprovedDocument(masterUser.id, "csf", superAdmin.id);
      await provisionApprovedDocument(masterUser.id, "estado_cuenta", superAdmin.id);

      const resPartial = await request(app)
        .post(`/api/commissions/${commission.id}/pay`)
        .send();

      expect(resPartial.status).toBe(400);
      expect(resPartial.body.code).toBe("DOCUMENTATION_PREREQUISITES_MISSING");
      // Reporta claramente que al Broker Subordinado le faltan requisitos
      expect(resPartial.body.missingRequirements.some((r: string) => /Bróker.*Subordinado/i.test(r))).toBe(true);

      // Ahora provisionar al Broker subordinado
      await provisionApprovedDocument(networkBrokerUser.id, "ine", superAdmin.id);
      await provisionApprovedDocument(networkBrokerUser.id, "csf", superAdmin.id);
      await provisionApprovedDocument(networkBrokerUser.id, "estado_cuenta", superAdmin.id);

      // Ahora ambos tienen documentos válidos aprobados -> éxito
      const resSuccess = await request(app)
        .post(`/api/commissions/${commission.id}/pay`)
        .send();

      expect(resSuccess.status).toBe(200);
      expect(resSuccess.body.transactionId).toBeDefined();
    });
  });

  // =========================================================================
  // 4. REGLA 3: DISPERSIÓN MASIVA (/bulk-pay)
  // =========================================================================
  describe("4. Dispersión Masiva (/bulk-pay) con Gate Documental", () => {
    let superAdmin: any;
    let brokerA: any;
    let brokerB: any;
    let commA: any;
    let commB: any;

    beforeEach(async () => {
      superAdmin = await storage.createUser({
        email: `sa-bulk-${randomUUID()}@network.test`,
        firstName: "Super",
        lastName: "Admin",
        role: "super_admin",
        isActive: true,
        status: "active",
      } as any);

      brokerA = await storage.createUser({
        email: `brk-a-${randomUUID()}@network.test`,
        firstName: "Broker",
        lastName: "Completo",
        role: "broker",
        bankName: "BBVA",
        clabe: "012180001111111111",
        accountHolder: "Broker Completo",
        isActive: true,
        status: "active",
      } as any);

      brokerB = await storage.createUser({
        email: `brk-b-${randomUUID()}@network.test`,
        firstName: "Broker",
        lastName: "Incompleto",
        role: "broker",
        bankName: "Banorte",
        clabe: "072180002222222222",
        accountHolder: "Broker Incompleto",
        isActive: true,
        status: "active",
      } as any);

      // Broker A tiene todos los documentos aprobados
      await provisionApprovedDocument(brokerA.id, "ine", superAdmin.id);
      await provisionApprovedDocument(brokerA.id, "csf", superAdmin.id);
      await provisionApprovedDocument(brokerA.id, "estado_cuenta", superAdmin.id);

      // Broker B no tiene documentos

      commA = await storage.createCommission({
        creditId: `c-bulk-a-${randomUUID()}`,
        brokerId: brokerA.id,
        amount: "10000.00",
        brokerShare: "10000.00",
        status: "approved",
        approvedBy: superAdmin.id,
        approvedAt: new Date(),
        frozenAmount: "10000.00",
        commissionType: "apertura",
      } as any);

      commB = await storage.createCommission({
        creditId: `c-bulk-b-${randomUUID()}`,
        brokerId: brokerB.id,
        amount: "15000.00",
        brokerShare: "15000.00",
        status: "approved",
        approvedBy: superAdmin.id,
        approvedAt: new Date(),
        frozenAmount: "15000.00",
        commissionType: "apertura",
      } as any);
    });

    it("Dispersión masiva procesa comisiones con expediente completo y reporta individualmente las incompletas", async () => {
      currentAuthUser = superAdmin;

      const res = await request(app)
        .post("/api/commissions/bulk-pay")
        .send({ ids: [commA.id, commB.id] });

      expect(res.status).toBe(200);

      // Comm A procesada exitosamente
      expect(res.body.successful.some((s: any) => s.id === commA.id)).toBe(true);

      // Comm B reportada en fallidas con razón de documentación
      const failedB = res.body.failed.find((f: any) => f.id === commB.id);
      expect(failedB).toBeDefined();
      expect(failedB.reason).toMatch(/Documentación incompleta o no aprobada/i);

      // Verificar estados finales
      const updatedA = await storage.getCommission(commA.id);
      const updatedB = await storage.getCommission(commB.id);
      expect(updatedA?.status).toBe("paid");
      expect(updatedB?.status).toBe("approved"); // Permanece approved, no pagada
    });
  });

  // =========================================================================
  // 5. REGLA 5: SIN FRICCIÓN COMERCIAL
  // =========================================================================
  describe("5. Sin Fricción Comercial: Documentos NO bloquean aprobación de comisión ni originación", () => {
    let superAdmin: any;
    let brokerSinDocs: any;
    let credit: any;
    let commission: any;

    beforeEach(async () => {
      superAdmin = await storage.createUser({
        email: `sa-friction-${randomUUID()}@network.test`,
        firstName: "Super",
        lastName: "Admin",
        role: "super_admin",
        isActive: true,
        status: "active",
      } as any);

      brokerSinDocs = await storage.createUser({
        email: `brk-nodocs-${randomUUID()}@network.test`,
        firstName: "Broker",
        lastName: "SinDocs",
        role: "broker",
        bankName: "BBVA México",
        clabe: "012180006666666666",
        accountHolder: "Broker SinDocs",
        isActive: true,
        status: "active",
      } as any);

      const client = await storage.createClient({
        firstName: "Cliente",
        lastName: "Frictionless",
        email: `cli-fric-${randomUUID()}@test.com`,
        brokerId: brokerSinDocs.id,
        status: "active",
      } as any);

      credit = await storage.createCredit({
        clientId: client.id,
        brokerId: brokerSinDocs.id,
        amount: "500000.00",
        status: "approved",
      } as any);

      commission = await storage.createCommission({
        creditId: credit.id,
        brokerId: brokerSinDocs.id,
        amount: "20000.00",
        brokerShare: "20000.00",
        status: "pending",
        commissionType: "apertura",
      } as any);
    });

    it("Super Admin PUEDE aprobar la comisión comercial (/approve) aun sin documentos del broker", async () => {
      currentAuthUser = superAdmin;

      // El broker no tiene INE, CSF ni Estado de cuenta
      const res = await request(app)
        .post(`/api/commissions/${commission.id}/approve`)
        .send();

      // Debe aprobarse con éxito congelando el importe
      expect(res.status).toBe(200);
      expect(res.body.commission.status).toBe("approved");
      expect(Number(res.body.commission.frozenAmount)).toBe(20000);

      // Pero no debe poder pagarse
      const payRes = await request(app)
        .post(`/api/commissions/${commission.id}/pay`)
        .send();
      expect(payRes.status).toBe(400);
      expect(payRes.body.code).toBe("DOCUMENTATION_PREREQUISITES_MISSING");
    });
  });

  // =========================================================================
  // 6. ENDPOINTS DE CONSULTA DE VALIDACIÓN
  // =========================================================================
  describe("6. Endpoints de Consulta de Validación para Perfil y Comisiones", () => {
    let superAdmin: any;
    let brokerUser: any;

    beforeEach(async () => {
      superAdmin = await storage.createUser({
        email: `sa-query-${randomUUID()}@network.test`,
        firstName: "Super",
        lastName: "Admin",
        role: "super_admin",
        isActive: true,
        status: "active",
      } as any);

      brokerUser = await storage.createUser({
        email: `brk-query-${randomUUID()}@network.test`,
        firstName: "Consulta",
        lastName: "Broker",
        role: "broker",
        bankName: "BBVA",
        clabe: "012180005555555555",
        accountHolder: "Consulta Broker",
        isActive: true,
        status: "active",
      } as any);
    });

    it("GET /api/beneficiaries/:id/payout-validation devuelve estatus de requisitos", async () => {
      currentAuthUser = brokerUser;

      const res = await request(app)
        .get(`/api/beneficiaries/${brokerUser.id}/payout-validation`);

      expect(res.status).toBe(200);
      expect(res.body.beneficiaryId).toBe(brokerUser.id);
      expect(res.body.canPayout).toBe(false);
      expect(res.body.banking.isClabeValid).toBe(true);
      expect(res.body.documents.ine.status).toBe("missing");
      expect(res.body.documents.csf.status).toBe("missing");
      expect(res.body.documents.estado_cuenta.status).toBe("missing");
    });
  });
});
