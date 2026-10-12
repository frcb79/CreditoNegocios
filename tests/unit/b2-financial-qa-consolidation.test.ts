import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import express from "express";
// @ts-ignore
import request from "supertest";
import cron from "node-cron";
import { storage } from "../../server/storage";
import { registerRoutes } from "../../server/routes";
import { registerLegalRoutes } from "../../server/legalRoutes";
import { commercialTermsService } from "../../server/commercialTermsService";
import { auditCommissionPayout } from "../../server/commissionService";
import { pool } from "../../server/db";

describe("AG — QA FINANCIERO CONSOLIDADO | CIERRE FASE 2B", () => {
  let app: express.Express;
  let server: Server;
  let currentAuthUser: any = null;

  beforeAll(async () => {
    process.env.NODE_ENV = "test";
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

  beforeEach(() => {
    commercialTermsService.resetForTesting();
    currentAuthUser = null;
  });

  const createSuperAdmin = async () => {
    return await storage.createUser({
      email: `admin-${randomUUID()}@platform.test`,
      firstName: "Super",
      lastName: "Admin",
      role: "super_admin",
      isActive: true,
      status: "active",
      clabe: "012180009999999999",
      bankName: "BBVA",
      accountHolder: "Super Admin Platform",
    } as any);
  };

  const createMasterBroker = async (clabe = "012180001111111111") => {
    return await storage.createUser({
      email: `master-${randomUUID()}@network.test`,
      firstName: "Master",
      lastName: "Broker",
      role: "master_broker",
      isActive: true,
      status: "active",
      clabe,
      bankName: "BBVA",
      accountHolder: "Master Broker Corp SAPI",
    } as any);
  };

  const createBroker = async (masterBrokerId?: string, clabe = "014180002222222222") => {
    return await storage.createUser({
      email: `broker-${randomUUID()}@network.test`,
      firstName: "Broker",
      lastName: "Originator",
      role: "broker",
      isActive: true,
      status: "active",
      masterBrokerId,
      clabe,
      bankName: "Santander",
      accountHolder: "Broker Originador SA",
    } as any);
  };

  async function provisionApprovedDocument(
    brokerId: string,
    type: "ine" | "csf" | "estado_cuenta",
    reviewerId: string
  ) {
    return await storage.createDocument({
      brokerId,
      uploadedBy: brokerId,
      type,
      fileName: `${type}_${brokerId}.pdf`,
      filePath: `/uploads/${type}_${brokerId}.pdf`,
      fileSize: 1024,
      mimeType: "application/pdf",
      isValid: true,
      extractedData: {
        status: "approved",
        reviewedBy: reviewerId,
        reviewedAt: new Date().toISOString(),
        reviewRole: "super_admin",
      },
    } as any);
  }

  async function provisionAllApprovedDocs(userId: string, reviewerId: string) {
    await provisionApprovedDocument(userId, "ine", reviewerId);
    await provisionApprovedDocument(userId, "csf", reviewerId);
    await provisionApprovedDocument(userId, "estado_cuenta", reviewerId);
  }

  // =========================================================================
  // 1. DISPERSIONES MULTI-BENEFICIARIO Y AUDITORÍA DE PAGOS (PAG-01 a PAG-11)
  // =========================================================================
  describe("1. Dispersiones Multi-Beneficiario y Liquidación Independiente (PAG-01 a PAG-11)", () => {
    it("Calcula shares independientes para Broker y Master Broker en auditCommissionPayout sin mezclar cuentas", () => {
      const audit = auditCommissionPayout({
        id: "comm-split-1",
        amount: "50000.00",
        brokerShare: "30000.00",
        masterBrokerShare: "10000.00",
        frozenAmount: "40000.00", // suma de shares a dispersar
        originMasterBrokerId: "mb-origin-1",
      });

      expect(audit.hasDiscrepancy).toBe(false);
      expect(audit.payoutAmount).toBe(40000);
      expect(audit.beneficiaryShares).toBeDefined();
      expect(audit.beneficiaryShares?.broker?.amount).toBe(30000);
      expect(audit.beneficiaryShares?.masterBroker?.amount).toBe(10000);
    });

    it("POST /api/commissions/:id/pay dispersa a cada beneficiario a su CLABE autorizada y registra beneficiaryPayouts", async () => {
      const admin = await createSuperAdmin();
      const master = await createMasterBroker("012180001111111111");
      const broker = await createBroker(master.id, "014180002222222222");

      // Provisionar documentación aprobada para ambos beneficiarios
      await provisionAllApprovedDocs(broker.id, admin.id);
      await provisionAllApprovedDocs(master.id, admin.id);

      const client = await storage.createClient({
        firstName: "Empresa",
        lastName: "Cliente",
        email: `client-${randomUUID()}@corp.test`,
        phone: "5512345678",
        brokerId: broker.id,
      } as any);

      const credit = await storage.createCredit({
        clientId: client.id,
        brokerId: broker.id,
        originMasterBrokerId: master.id,
        amount: "500000.00",
        status: "approved",
      } as any);

      const commission = await storage.createCommission({
        creditId: credit.id,
        brokerId: broker.id,
        masterBrokerId: master.id,
        amount: "500000.00",
        totalCommission: "25000.00",
        brokerShare: "15000.00",
        masterBrokerShare: "5000.00",
        appShare: "5000.00",
        frozenAmount: "20000.00",
        status: "approved",
        approvedBy: admin.id,
        approvedAt: new Date(),
        commissionType: "apertura",
      } as any);

      currentAuthUser = admin;
      const payRes = await request(app)
        .post(`/api/commissions/${commission.id}/pay`)
        .send({
          accountNumber: master.clabe,
        });

      expect(payRes.status).toBe(200);
      expect(payRes.body.beneficiaryPayouts).toBeDefined();
      expect(payRes.body.beneficiaryPayouts.broker.amount).toBe(15000);
      expect(payRes.body.beneficiaryPayouts.broker.clabe).toBe("014180002222222222");
      expect(payRes.body.beneficiaryPayouts.masterBroker.amount).toBe(5000);
      expect(payRes.body.beneficiaryPayouts.masterBroker.clabe).toBe("012180001111111111");

      // Verificar que ambos beneficiarios recibieron notificación individual
      const brokerNotifs = await storage.getNotifications(broker.id);
      expect(brokerNotifs.some((n: any) => n.type === "commission_paid" && n.message.includes("$15,000.00"))).toBe(true);

      const masterNotifs = await storage.getNotifications(master.id);
      expect(masterNotifs.some((n: any) => n.type === "commission_paid" && n.message.includes("$5,000.00"))).toBe(true);
    });

    it("POST /api/commissions/:id/pay bloquea la dispersión si algún beneficiario no tiene CLABE válida de 18 dígitos", async () => {
      const admin = await createSuperAdmin();
      const master = await createMasterBroker("012180001111111111");
      const brokerNoClabe = await createBroker(master.id, ""); // Sin CLABE

      await provisionAllApprovedDocs(brokerNoClabe.id, admin.id);
      await provisionAllApprovedDocs(master.id, admin.id);

      const client = await storage.createClient({
        firstName: "Empresa",
        lastName: "Cliente",
        email: `client-${randomUUID()}@corp.test`,
        phone: "5512345678",
        brokerId: brokerNoClabe.id,
      } as any);

      const credit = await storage.createCredit({
        clientId: client.id,
        brokerId: brokerNoClabe.id,
        originMasterBrokerId: master.id,
        amount: "500000.00",
        status: "approved",
      } as any);

      const commission = await storage.createCommission({
        creditId: credit.id,
        brokerId: brokerNoClabe.id,
        masterBrokerId: master.id,
        amount: "500000.00",
        totalCommission: "25000.00",
        brokerShare: "15000.00",
        masterBrokerShare: "5000.00",
        appShare: "5000.00",
        frozenAmount: "20000.00",
        status: "approved",
        approvedBy: admin.id,
        approvedAt: new Date(),
      } as any);

      currentAuthUser = admin;
      const res = await request(app)
        .post(`/api/commissions/${commission.id}/pay`)
        .send({
          accountNumber: master.clabe,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain("CLABE");
    });

    it("POST /api/commissions/:id/mark-paid registra pagos manuales independientes por beneficiario y notifica por separado", async () => {
      const admin = await createSuperAdmin();
      const master = await createMasterBroker();
      const broker = await createBroker(master.id);

      // Provisionar documentación aprobada
      await provisionAllApprovedDocs(broker.id, admin.id);
      await provisionAllApprovedDocs(master.id, admin.id);

      const client = await storage.createClient({
        firstName: "Empresa",
        lastName: "Cliente",
        email: `client-${randomUUID()}@corp.test`,
        phone: "5512345678",
        brokerId: broker.id,
      } as any);

      const credit = await storage.createCredit({
        clientId: client.id,
        brokerId: broker.id,
        originMasterBrokerId: master.id,
        amount: "1000000.00",
        status: "approved",
      } as any);

      const commission = await storage.createCommission({
        creditId: credit.id,
        brokerId: broker.id,
        masterBrokerId: master.id,
        amount: "1000000.00",
        totalCommission: "50000.00",
        brokerShare: "35000.00",
        masterBrokerShare: "10000.00",
        appShare: "5000.00",
        frozenAmount: "45000.00",
        status: "approved",
        approvedBy: admin.id,
        approvedAt: new Date(),
        commissionType: "apertura",
      } as any);

      currentAuthUser = admin;
      const res = await request(app)
        .post(`/api/commissions/${commission.id}/mark-paid`)
        .send({
          notes: "Pago directo por tesorería corporativa",
          reference: "TRANSF-MANUAL-778899",
        });

      expect(res.status).toBe(200);
      expect(res.body.commission.status).toBe("paid");

      const providerResp = res.body.commission.providerResponse;
      expect(providerResp?.beneficiaryPayouts).toBeDefined();
      expect(providerResp.beneficiaryPayouts.broker.amount).toBe(35000);
      expect(providerResp.beneficiaryPayouts.masterBroker.amount).toBe(10000);

      const brokerNotifs = await storage.getNotifications(broker.id);
      expect(brokerNotifs.some((n: any) => n.type === "commission_paid" && n.message.includes("$35,000.00"))).toBe(true);

      const masterNotifs = await storage.getNotifications(master.id);
      expect(masterNotifs.some((n: any) => n.type === "commission_paid" && n.message.includes("$10,000.00"))).toBe(true);
    });
  });

  // =========================================================================
  // 2. RECUPERACIÓN TRAS REINICIO Y REGLAS DE CONDICIONES COMERCIALES (COM-25 a COM-28)
  // =========================================================================
  describe("2. Condiciones Comerciales: Persistencia, Recuperación y Aceptación (COM-25 a COM-28)", () => {
    it("Recupera versiones comerciales activas de storage tras simular reinicio de servicio", async () => {
      const admin = await createSuperAdmin();

      // Super Admin publica nueva versión incremental 1.1
      await commercialTermsService.publishGlobalCommercialTermsUpdate({
        previousConditions: { initialOpportunityHoldDays: 7 },
        newConditions: { initialOpportunityHoldDays: 14 },
        modifiedParams: ["initialOpportunityHoldDays"],
        updatedBy: admin.id,
        reason: "Ampliación de ventana de oportunidad",
        targetStorage: storage,
      });

      expect(commercialTermsService.getCurrentGlobalVersion()).toBe("1.1");

      // Simular reinicio reseteando solo las estructuras en memoria sin borrar la persistencia en storage
      (commercialTermsService as any).currentGlobalVersion = "1.0";
      (commercialTermsService as any).globalVersions.clear();
      (commercialTermsService as any).initDefaultGlobalVersion();
      expect(commercialTermsService.getCurrentGlobalVersion()).toBe("1.0");

      // Al llamar a syncFromStorage, reconstituye la versión 1.1 desde la persistencia
      await commercialTermsService.syncFromStorage(storage);
      expect(commercialTermsService.getCurrentGlobalVersion()).toBe("1.1");

      const versionData = await commercialTermsService.getGlobalVersionData("1.1", storage);
      expect(versionData).toBeDefined();
      expect(versionData?.newConditions.initialOpportunityHoldDays).toBe(14);
    });

    it("Rechaza aceptación de comisiones de red ajenas a la red del broker asignado (Cross-Network)", async () => {
      const masterA = await createMasterBroker();
      const masterB = await createMasterBroker();
      const brokerA = await createBroker(masterA.id);

      // Master B publica comisiones para su red
      await commercialTermsService.publishNetworkRatesUpdate(masterB.id, {
        previousRates: {},
        newRates: { apertura: 3.5 },
        updatedBy: masterB.id,
        targetStorage: storage,
      });

      // Broker A intenta aceptar las comisiones de Master B
      currentAuthUser = brokerA;
      const acceptRes = await request(app)
        .post("/api/commercial-terms/accept")
        .send({
          type: "network",
          masterBrokerId: masterB.id,
          version: "net-1.0",
        });

      expect(acceptRes.status).toBe(400);
      expect(acceptRes.body.message).toContain("No puedes aceptar comisiones de una red ajena");
    });
  });

  // =========================================================================
  // 3. INVALIDACIÓN DE APROBACIONES DE DOCUMENTOS (PAG-07, FIN-13/14)
  // =========================================================================
  describe("3. Invalidación Automática de Aprobaciones de Documentos (PAG-07, FIN-13/14)", () => {
    it("PUT /api/documents/:id invalida automáticamente la aprobación previa si se modifica el archivo o tipo", async () => {
      const admin = await createSuperAdmin();
      const broker = await createBroker();

      const doc = await storage.createDocument({
        fileName: "caratula_bancaria.pdf",
        filePath: "/uploads/caratula_1.pdf",
        fileSize: 1024,
        mimeType: "application/pdf",
        type: "comprobante_domicilio",
        brokerId: broker.id,
        uploadedBy: broker.id,
        isValid: true,
        extractedData: {
          status: "approved",
          reviewedBy: admin.id,
          reviewedAt: new Date().toISOString(),
        },
      } as any);

      expect(doc.isValid).toBe(true);

      // Modificar el tipo de documento invalida la aprobación
      currentAuthUser = admin;
      const updateRes = await request(app)
        .put(`/api/documents/${doc.id}`)
        .send({
          type: "estado_cuenta", // Cambio de tipo de documento
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.isValid).toBe(false);
      expect(updateRes.body.extractedData?.status).toBe("pending");
      expect(updateRes.body.extractedData?.reviewedBy).toBeNull();
      expect(updateRes.body.extractedData?.invalidatedReason).toBe("TYPE_CHANGED");
    });
  });

  // =========================================================================
  // 4. MASCARAMIENTO RBAC DE CLABE Y MARGEN DE PLATAFORMA (PAG-07, PAG-11)
  // =========================================================================
  describe("4. Enmascaramiento RBAC de CLABE y Margen Institucional (PAG-07, PAG-11)", () => {
    it("Enmascara la CLABE bancaria de terceros y oculta appShare para usuarios no Super Admin", async () => {
      const admin = await createSuperAdmin();
      const master = await createMasterBroker("012180001111111111");
      const broker = await createBroker(master.id, "014180002222222222");

      const client = await storage.createClient({
        firstName: "Empresa",
        lastName: "Cliente",
        email: `client-${randomUUID()}@corp.test`,
        phone: "5512345678",
        brokerId: broker.id,
      } as any);

      const credit = await storage.createCredit({
        clientId: client.id,
        brokerId: broker.id,
        originMasterBrokerId: master.id,
        amount: "500000.00",
        status: "approved",
      } as any);

      const commission = await storage.createCommission({
        creditId: credit.id,
        brokerId: broker.id,
        masterBrokerId: master.id,
        amount: "500000.00",
        totalCommission: "25000.00",
        brokerShare: "15000.00",
        masterBrokerShare: "5000.00",
        appShare: "5000.00",
        clabe: "012180001111111111",
        status: "approved",
      } as any);

      // Broker consulta comisiones: NO debe ver el appShare y debe ver la CLABE enmascarada del Master
      currentAuthUser = broker;
      const getRes = await request(app).get(`/api/commissions/${commission.id}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.appShare).toBeUndefined();
      expect(getRes.body.masterBroker.clabe).toBe("**************1111");

      // Super Admin consulta comisiones: SÍ ve appShare y la CLABE sin enmascarar
      currentAuthUser = admin;
      const adminRes = await request(app).get(`/api/commissions/${commission.id}`);
      expect(adminRes.status).toBe(200);
      expect(adminRes.body.appShare).toBe("5000.00");
      expect(adminRes.body.masterBroker.clabe).toBe("012180001111111111");
    });
  });

  // =========================================================================
  // 5. CANDADOS DE DESEMBOLSO EN PROPUESTAS Y CRÉDITOS (OPE-10/11/12, COM-21/22/23)
  // =========================================================================
  describe("5. Candados de Desembolso en Propuestas Ganadoras y Créditos (OPE-10/11/12, COM-21/22/23)", () => {
    it("POST /api/credit-submission-targets/:id/confirm-disbursement rechaza desembolsos en propuestas que no son ganadoras", async () => {
      const admin = await createSuperAdmin();
      const broker = await createBroker();

      const client = await storage.createClient({
        firstName: "Empresa",
        lastName: "Cliente",
        email: `client-${randomUUID()}@corp.test`,
        phone: "5512345678",
        brokerId: broker.id,
      } as any);

      const submission = await storage.createCreditSubmissionRequest({
        clientId: client.id,
        brokerId: broker.id,
        requestedAmount: "500000.00",
        purpose: "Capital de trabajo",
        status: "in_progress",
      } as any);

      const nonWinnerTarget = await storage.createCreditSubmissionTarget({
        requestId: submission.id,
        financialInstitutionId: `fin-${randomUUID()}`,
        status: "approved",
        isWinner: false, // NO es ganadora
      } as any);

      currentAuthUser = admin;
      const res = await request(app)
        .post(`/api/credit-submission-targets/${nonWinnerTarget.id}/confirm-disbursement`)
        .send({
          confirmedDisbursedAmount: 400000,
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("NOT_WINNER_TARGET");
    });

    it("POST /api/credits/:id/confirm-disbursement rechaza confirmación si el crédito está cancelado o rechazado", async () => {
      const admin = await createSuperAdmin();
      const broker = await createBroker();

      const client = await storage.createClient({
        firstName: "Empresa",
        lastName: "Cliente",
        email: `client-${randomUUID()}@corp.test`,
        phone: "5512345678",
        brokerId: broker.id,
      } as any);

      const cancelledCredit = await storage.createCredit({
        clientId: client.id,
        brokerId: broker.id,
        amount: "500000.00",
        status: "cancelled", // Inelegible
      } as any);

      currentAuthUser = admin;
      const res = await request(app)
        .post(`/api/credits/${cancelledCredit.id}/confirm-disbursement`)
        .send({
          confirmedDisbursedAmount: 500000,
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("CREDIT_STATUS_INELIGIBLE");
    });
  });
});
