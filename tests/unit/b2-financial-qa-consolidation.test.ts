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
  // 1. DISPERSIONES Y LIQUIDACIÓN SEGÚN CANAL COMERCIAL (COM-03/06, PAG-08/12/13/14)
  // =========================================================================
  describe("1. Dispersiones y Liquidación según Canal Comercial (COM-03/06, PAG-08/12/13/14)", () => {
    it("Calcula shares independientes para Broker y Master Broker en auditCommissionPayout y registra networkObligation", () => {
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
      expect(audit.networkObligation).toBeDefined();
      expect(audit.networkObligation?.status).toBe("pending_master_payout");
      expect(audit.networkObligation?.brokerShare).toBe(30000);
    });

    it("POST /api/commissions/:id/pay bloquea desembolso real (PAG-12/13: STP es simulador y pagos reales deshabilitados)", async () => {
      const admin = await createSuperAdmin();
      const master = await createMasterBroker("012180001111111111");
      const broker = await createBroker(master.id, "014180002222222222");

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

      // 1. Llamada a /pay sin simulate: true debe ser bloqueada (PAG-12/13)
      const payRealRes = await request(app)
        .post(`/api/commissions/${commission.id}/pay`)
        .send();

      expect(payRealRes.status).toBe(400);
      expect(payRealRes.body.code).toBe("SIMULATED_STP_CANNOT_DISBURSE");

      // 2. Llamada a /pay con simulate: true ejecuta prueba hacia el Master sin marcar pagado
      const paySimRes = await request(app)
        .post(`/api/commissions/${commission.id}/pay`)
        .send({ simulate: true });

      expect(paySimRes.status).toBe(200);
      expect(paySimRes.body.simulated).toBe(true);
      expect(paySimRes.body.paid).toBe(false);
      expect(paySimRes.body.payoutAmount).toBe(20000);
      expect(paySimRes.body.payoutBeneficiary.userId).toBe(master.id);

      // Estado permanece 'approved' (no se marca paid)
      const commCheck = await storage.getCommission(commission.id);
      expect(commCheck?.status).toBe("approved");
    });

    it("POST /api/commissions/:id/pay bloquea si el beneficiario legítimo que recibe de CN no tiene CLABE válida de 18 dígitos", async () => {
      const admin = await createSuperAdmin();
      const masterNoClabe = await createMasterBroker(""); // Master sin CLABE
      const broker = await createBroker(masterNoClabe.id, "014180002222222222");

      await provisionAllApprovedDocs(masterNoClabe.id, admin.id);

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
        originMasterBrokerId: masterNoClabe.id,
        amount: "500000.00",
        status: "approved",
      } as any);

      const commission = await storage.createCommission({
        creditId: credit.id,
        brokerId: broker.id,
        masterBrokerId: masterNoClabe.id,
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
        .send({ simulate: true });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain("CLABE");
    });

    it("POST /api/commissions/:id/mark-paid liquida exclusivamente al Master por operaciones de red y registra obligación Master->Broker (COM-03/06, PAG-08/13/14)", async () => {
      const admin = await createSuperAdmin();
      const master = await createMasterBroker("012180001111111111");
      const broker = await createBroker(master.id, "014180002222222222");

      // Provisionar documentación aprobada del Master únicamente (el Broker subordinado no la requiere para liquidar al Master)
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
          notes: "Liquidación consolidada al Master Broker por transferencia SPEI",
          reference: "SPEI-BBVA-20261012-778899",
        });

      expect(res.status).toBe(200);
      expect(res.body.commission.status).toBe("paid");

      const providerResp = res.body.commission.providerResponse;
      expect(providerResp?.payoutBeneficiary).toBeDefined();
      expect(providerResp.payoutBeneficiary.userId).toBe(master.id);
      expect(providerResp.payoutBeneficiary.role).toBe("master_broker");
      expect(providerResp.payoutBeneficiary.amount).toBe(45000);
      expect(providerResp.payoutBeneficiary.clabe).toBe(master.clabe);
      expect(providerResp.payoutBeneficiary.reference).toBe("SPEI-BBVA-20261012-778899");

      // Registro de obligación Master -> Broker sin marcarla pagada por CN
      expect(providerResp?.networkObligation).toBeDefined();
      expect(providerResp.networkObligation.brokerId).toBe(broker.id);
      expect(providerResp.networkObligation.brokerShare).toBe(35000);
      expect(providerResp.networkObligation.masterBrokerId).toBe(master.id);
      expect(providerResp.networkObligation.status).toBe("pending_master_payout");

      // Notificación al Master exclusivamente
      const masterNotifs = await storage.getNotifications(master.id);
      expect(masterNotifs.some((n: any) => n.type === "commission_paid" && n.message.includes("$45,000.00"))).toBe(true);

      // Broker NO recibe notificación de pago directo de CN
      const brokerNotifs = await storage.getNotifications(broker.id);
      expect(brokerNotifs.length).toBe(0);
    });

    it("PAG-15: un Master histórico con margen propio cero sigue siendo el beneficiario único de CN", async () => {
      const admin = await createSuperAdmin();
      const master = await createMasterBroker("012180001111111111");
      const broker = await createBroker(master.id, "014180002222222222");
      await provisionAllApprovedDocs(master.id, admin.id); // Broker subordinado sin documentos para liquidación CN

      const client = await storage.createClient({
        firstName: "Cliente", lastName: "Red", email: `client-${randomUUID()}@corp.test`,
        phone: "5512345678", brokerId: broker.id,
      } as any);
      const credit = await storage.createCredit({
        clientId: client.id, brokerId: broker.id, originMasterBrokerId: master.id,
        amount: "100000.00", status: "approved",
      } as any);
      const commission = await storage.createCommission({
        creditId: credit.id, brokerId: broker.id, masterBrokerId: master.id,
        amount: "100000.00", totalCommission: "3000.00",
        brokerShare: "2000.00", masterBrokerShare: "0.00", appShare: "1000.00",
        frozenAmount: "2000.00", status: "approved",
        approvedBy: admin.id, approvedAt: new Date(), commissionType: "apertura",
      } as any);

      const audit = auditCommissionPayout(commission);
      expect(audit.payoutAmount).toBe(2000);
      expect(audit.networkObligation?.masterBrokerId).toBe(master.id);
      currentAuthUser = admin;
      const res = await request(app).post(`/api/commissions/${commission.id}/mark-paid`).send({
        notes: "Transferencia manual confirmada a Master", reference: "SPEI-RED-CERO-20261012",
      });
      expect(res.status).toBe(200);
      expect(res.body.commission.providerResponse.payoutBeneficiary.userId).toBe(master.id);
      expect(res.body.commission.providerResponse.networkObligation.brokerShare).toBe(2000);
      expect(res.body.commission.providerResponse.networkObligation.status).toBe("pending_master_payout");
    });

    it("POST /api/commissions/:id/mark-paid liquida directamente al Broker en canal Broker Directo (sin Master)", async () => {
      const admin = await createSuperAdmin();
      const brokerDirecto = await createBroker(undefined, "014180003333333333");

      await provisionAllApprovedDocs(brokerDirecto.id, admin.id);

      const client = await storage.createClient({
        firstName: "Empresa",
        lastName: "Directa",
        email: `client-dir-${randomUUID()}@corp.test`,
        phone: "5512345678",
        brokerId: brokerDirecto.id,
      } as any);

      const credit = await storage.createCredit({
        clientId: client.id,
        brokerId: brokerDirecto.id,
        amount: "500000.00",
        status: "approved",
      } as any);

      const commission = await storage.createCommission({
        creditId: credit.id,
        brokerId: brokerDirecto.id,
        amount: "500000.00",
        totalCommission: "25000.00",
        brokerShare: "20000.00",
        masterBrokerShare: "0.00",
        appShare: "5000.00",
        frozenAmount: "20000.00",
        status: "approved",
        approvedBy: admin.id,
        approvedAt: new Date(),
        commissionType: "apertura",
      } as any);

      currentAuthUser = admin;
      const res = await request(app)
        .post(`/api/commissions/${commission.id}/mark-paid`)
        .send({
          notes: "Pago directo a Broker independiente",
          reference: "SPEI-SANTANDER-DIRECTO-001",
        });

      expect(res.status).toBe(200);
      expect(res.body.commission.status).toBe("paid");

      const providerResp = res.body.commission.providerResponse;
      expect(providerResp?.payoutBeneficiary).toBeDefined();
      expect(providerResp.payoutBeneficiary.userId).toBe(brokerDirecto.id);
      expect(providerResp.payoutBeneficiary.role).toBe("broker");
      expect(providerResp.payoutBeneficiary.amount).toBe(20000);
      expect(providerResp.payoutBeneficiary.clabe).toBe(brokerDirecto.clabe);
      expect(providerResp?.networkObligation).toBeUndefined();

      const brokerNotifs = await storage.getNotifications(brokerDirecto.id);
      expect(brokerNotifs.some((n: any) => n.type === "commission_paid" && n.message.includes("$20,000.00"))).toBe(true);
    });

    it("POST /api/commissions/:id/mark-paid liquida directamente al Master en canal Master Directo", async () => {
      const admin = await createSuperAdmin();
      const masterDirecto = await createMasterBroker("012180004444444444");

      await provisionAllApprovedDocs(masterDirecto.id, admin.id);

      const client = await storage.createClient({
        firstName: "Empresa",
        lastName: "MasterDirect",
        email: `client-md-${randomUUID()}@corp.test`,
        phone: "5512345678",
        brokerId: masterDirecto.id,
      } as any);

      const credit = await storage.createCredit({
        clientId: client.id,
        brokerId: masterDirecto.id,
        originMasterBrokerId: masterDirecto.id,
        amount: "600000.00",
        status: "approved",
      } as any);

      const commission = await storage.createCommission({
        creditId: credit.id,
        brokerId: masterDirecto.id,
        masterBrokerId: masterDirecto.id,
        amount: "600000.00",
        totalCommission: "30000.00",
        brokerShare: "0.00",
        masterBrokerShare: "25000.00",
        appShare: "5000.00",
        frozenAmount: "25000.00",
        status: "approved",
        approvedBy: admin.id,
        approvedAt: new Date(),
        commissionType: "apertura",
      } as any);

      currentAuthUser = admin;
      const res = await request(app)
        .post(`/api/commissions/${commission.id}/mark-paid`)
        .send({
          notes: "Pago directo a Master por originación propia",
          reference: "SPEI-BBVA-MD-002",
        });

      expect(res.status).toBe(200);
      expect(res.body.commission.status).toBe("paid");

      const providerResp = res.body.commission.providerResponse;
      expect(providerResp?.payoutBeneficiary).toBeDefined();
      expect(providerResp.payoutBeneficiary.userId).toBe(masterDirecto.id);
      expect(providerResp.payoutBeneficiary.amount).toBe(25000);
      expect(providerResp?.networkObligation).toBeUndefined();

      const masterNotifs = await storage.getNotifications(masterDirecto.id);
      expect(masterNotifs.some((n: any) => n.type === "commission_paid" && n.message.includes("$25,000.00"))).toBe(true);
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

  describe("PAG-16: privacidad de validación y auditoría de comisiones", () => {
    it("un Broker de red ve el estado de validación, nunca los datos bancarios del Master", async () => {
      const admin = await createSuperAdmin();
      const master = await createMasterBroker("012180001111111111");
      const broker = await createBroker(master.id);
      await provisionAllApprovedDocs(master.id, admin.id);
      const client = await storage.createClient({
        firstName: "Cliente", lastName: "Privacidad",
        email: `client-${randomUUID()}@corp.test`, phone: "5512345678", brokerId: broker.id,
      } as any);
      const credit = await storage.createCredit({
        clientId: client.id, brokerId: broker.id, originMasterBrokerId: master.id,
        amount: "200000.00", status: "approved",
      } as any);
      const commission = await storage.createCommission({
        creditId: credit.id, brokerId: broker.id, masterBrokerId: master.id,
        amount: "200000.00", brokerShare: "3000.00", masterBrokerShare: "0.00",
        frozenAmount: "3000.00", status: "approved",
      } as any);

      currentAuthUser = broker;
      const payoutResponse = await request(app).get(`/api/commissions/${commission.id}/payout-validation`);
      expect(payoutResponse.status).toBe(200);
      expect(payoutResponse.body).toHaveProperty("canPayout");
      expect(JSON.stringify(payoutResponse.body)).not.toContain(master.clabe);
      expect(payoutResponse.body.beneficiaries).toBeUndefined();

      const logsResponse = await request(app).get(`/api/commissions/${commission.id}/audit-logs`);
      expect(logsResponse.status).toBe(200);
      expect(JSON.stringify(logsResponse.body)).not.toContain(master.clabe);

      const outsider = await createBroker();
      currentAuthUser = outsider;
      expect((await request(app).get(`/api/commissions/${commission.id}/audit-logs`)).status).toBe(403);
      expect((await request(app).get(`/api/commissions/${commission.id}/payout-validation`)).status).toBe(403);
    });
  });

  describe("MAT-14/15: Matching en credits y credit_submission_requests", () => {
    it("permite consultar una solicitud independiente sin crédito y no aprueba automáticamente", async () => {
      const broker = await createBroker();
      const client = await storage.createClient({
        firstName: "Cliente", lastName: "Matching",
        email: `matching-${randomUUID()}@test.local`, phone: "5512345678", brokerId: broker.id,
      } as any);
      const submission = await storage.createCreditSubmissionRequest({
        clientId: client.id, brokerId: broker.id, requestedAmount: "150000.00",
        status: "pending_admin", purpose: "Capital de trabajo",
      } as any);
      currentAuthUser = broker;
      const result = await request(app).get(`/api/credit-submissions/${submission.id}/matching`);
      expect(result.status).toBe(200);
      expect(result.body.requestType).toBe("credit_submission_request");
      expect(result.body.summary).toHaveProperty("totalEvaluated");
      expect(result.body).not.toHaveProperty("commissions");
      expect((await storage.getCreditSubmissionRequest(submission.id))?.status).toBe("pending_admin");
    });

    it("deniega por ID el matching de solicitud a otro Broker", async () => {
      const owner = await createBroker();
      const outsider = await createBroker();
      const client = await storage.createClient({
        firstName: "Cliente", lastName: "Ajeno",
        email: `matching-${randomUUID()}@test.local`, phone: "5512345678", brokerId: owner.id,
      } as any);
      const submission = await storage.createCreditSubmissionRequest({
        clientId: client.id, brokerId: owner.id, requestedAmount: "250000.00",
        status: "pending_admin",
      } as any);
      currentAuthUser = outsider;
      const forbidden = await request(app).get(`/api/credit-submissions/${submission.id}/matching`);
      expect(forbidden.status).toBe(403);
    });
  });

  it("FIN-13.1: Broker ve ficha publicada sin comisiones internas", async () => {
    const broker = await createBroker();
    const institution = await storage.createFinancialInstitution({
      name: "Financiera Broker Publicada", isActive: true, createdByAdmin: true,
      commissionRate: "8", overrateCommissionRate: "2",
      commissionRates: { financiera: { apertura: 8, sobretasa: 2 }, broker: { apertura: 2 } }
    } as any);
    const offer = await storage.createInstitutionProduct({
      institutionId: institution.id, name: "Crédito Simple Visible",
      customName: "Crédito Simple Visible", productType: "credito_simple",
      targetProfiles: ["persona_moral"], isActive: true,
    } as any, {
      conditions: {
        minAmount: 100000, maxAmount: 2000000, maxTermMonths: 36,
        rateSource: "TIIE + diferencial",
        commissionRates: {
          financiera: { apertura: 8 }, masterBroker: { apertura: 4 }, broker: { apertura: 2 }
        }
      },
      requirements: { targetProfiles: ["persona_moral"] },
      requiredDocuments: ["Identificación"],
      changeReason: "Oferta de prueba publicada"
    });
    const versions = await storage.getInstitutionProductVersions(offer.id);
    await storage.publishInstitutionProductVersion(offer.id, versions[0].id, {
      changeReason: "Publicación de prueba Broker",
    });
    currentAuthUser = broker;
    const visible = await request(app).get("/api/financial-institutions/" + institution.id);
    expect(visible.status).toBe(200);
    expect(visible.body.name).toBe("Financiera Broker Publicada");
    expect(visible.body.commissionRate).toBeUndefined();
    expect(visible.body.overrateCommissionRate).toBeUndefined();
    expect(visible.body.commissionRates?.financiera).toBeUndefined();
  });

  describe("FIN-13: catálogo financiero administrativo por ID", () => {
    it("deniega a Broker el acceso directo por ID y mantiene Super Admin autorizado", async () => {
      const broker = await createBroker();
      currentAuthUser = broker;
      const forbidden = await request(app).get("/api/financial-institutions/id-que-no-existe");
      expect(forbidden.status).toBe(403);

      currentAuthUser = await createSuperAdmin();
      const missing = await request(app).get("/api/financial-institutions/id-que-no-existe");
      expect(missing.status).toBe(404);
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
