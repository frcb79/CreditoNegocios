// @ts-ignore
import request from "supertest";
import express from "express";
import { storage } from "../../server/storage";
import {
  calculateAndPersistCascadingCommission,
  resolveOfferVersionCommissionRates,
  MissingCommissionRateError,
  MissingOfferVersionError,
  UnconfirmedDispersalAmountError,
  UnauthorizedDistributionError,
  consolidateCommercialProposalSnapshot,
} from "../../server/commissionService";
import { registerRoutes } from "../../server/routes";
import { randomUUID } from "crypto";

describe("Fase 2B.2A — Validación Manual de Créditos y Comisiones por Super Admin", () => {
  let app: express.Express;
  let currentAuthUser: any = null;

  let superAdminUser: any;
  let regularAdminUser: any;
  let masterBrokerUser: any;
  let brokerUser: any;
  let clientUser: any;

  beforeAll(async () => {
    app = express();
    app.use(express.json());

    // Mock session auth middleware
    app.use((req: any, _res, next) => {
      if (currentAuthUser) {
        req.isAuthenticated = () => true;
        req.user = { claims: { sub: currentAuthUser.id } };
        req.tenantContext = {
          tenantId: currentAuthUser.tenantId || "default-tenant",
          membership: {
            role: currentAuthUser.role === "super_admin" || currentAuthUser.role === "admin" ? "owner" : "member",
            canOriginate: true,
          },
        };
      } else {
        req.isAuthenticated = () => false;
      }
      next();
    });

    await registerRoutes(app);

    // Setup base users
    superAdminUser = await storage.createUser({
      email: `superadmin-${randomUUID().slice(0, 6)}@test.com`,
      firstName: "Super",
      lastName: "Admin",
      role: "super_admin",
      clabe: "012180001234567890",
    } as any);

    regularAdminUser = await storage.createUser({
      email: `admin-${randomUUID().slice(0, 6)}@test.com`,
      firstName: "Admin",
      lastName: "Regular",
      role: "admin",
      clabe: "012180001234567891",
    } as any);

    masterBrokerUser = await storage.createUser({
      email: `mb-${randomUUID().slice(0, 6)}@test.com`,
      firstName: "Master",
      lastName: "Broker",
      role: "master_broker",
      brandName: "Master Red Financiera",
      clabe: "012180001234567892",
    } as any);

    brokerUser = await storage.createUser({
      email: `broker-${randomUUID().slice(0, 6)}@test.com`,
      firstName: "Broker",
      lastName: "Originador",
      role: "broker",
      parentMasterBrokerId: masterBrokerUser.id,
      clabe: "012180001234567893",
    } as any);
  });

  beforeEach(() => {
    currentAuthUser = null;
  });

  // Helper to create test client and credit with commercial snapshot
  async function createTestCreditWithSnapshot(customProposal: any = {}) {
    const client = await storage.createClient({
      firstName: "Juan",
      lastName: "Pérez",
      businessName: "Empresa Test SA de CV",
      type: "persona_moral",
      brokerId: brokerUser.id,
    } as any);

    const institution = await storage.createFinancialInstitution({
      name: `Financiera Test ${randomUUID().slice(0, 6)}`,
      commissionRate: "4.0",
      active: true,
    } as any);

    const snapshot = consolidateCommercialProposalSnapshot({
      proposalData: {
        approvedAmount: 1000000,
        interestRate: 15.5,
        term: 24,
        originBrokerId: brokerUser.id,
        originMasterBrokerId: masterBrokerUser.id,
        financialInstitutionId: institution.id,
        commissionRates: {
          financiera: { apertura: 4.0, rate: 4.0 },
          masterBroker: { apertura: 1.0, rate: 1.0 },
          broker: { apertura: 2.0, rate: 2.0 },
        },
        commissionsToApply: ["apertura"],
        ...customProposal,
      },
    });

    const credit = await storage.createCredit({
      clientId: client.id,
      brokerId: brokerUser.id,
      originMasterBrokerId: masterBrokerUser.id,
      financialInstitutionId: institution.id,
      amount: "1000000.00",
      status: "approved",
      finalProposal: snapshot,
    } as any);

    return { client, institution, credit };
  }

  // =========================================================================
  // 1. REGLA 1: EXCLUSIVIDAD DE SUPER ADMIN Y CONFIRMACIÓN EXPRESA
  // =========================================================================
  describe("1. Exclusividad de Super Admin y Confirmación Expresa (Regla 1)", () => {
    it("RBAC: Broker es rechazado con 403 al intentar confirmar desembolso", async () => {
      const { credit } = await createTestCreditWithSnapshot();
      currentAuthUser = brokerUser;

      const res = await request(app)
        .post(`/api/credits/${credit.id}/confirm-disbursement`)
        .send({ confirmedAmount: 1000000 });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe("FORBIDDEN_SUPER_ADMIN_REQUIRED");
    });

    it("RBAC: Admin regular es rechazado con 403 al intentar confirmar desembolso", async () => {
      const { credit } = await createTestCreditWithSnapshot();
      currentAuthUser = regularAdminUser;

      const res = await request(app)
        .post(`/api/credits/${credit.id}/confirm-disbursement`)
        .send({ confirmedAmount: 1000000 });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe("FORBIDDEN_SUPER_ADMIN_REQUIRED");
    });

    it("RBAC: Master Broker es rechazado con 403 al intentar confirmar desembolso", async () => {
      const { credit } = await createTestCreditWithSnapshot();
      currentAuthUser = masterBrokerUser;

      const res = await request(app)
        .post(`/api/credits/${credit.id}/confirm-disbursement`)
        .send({ confirmedAmount: 1000000 });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe("FORBIDDEN_SUPER_ADMIN_REQUIRED");
    });

    it("Positiva: Super Admin confirma expresamente monto, fecha/hora, usuario y auditoría", async () => {
      const { credit } = await createTestCreditWithSnapshot();
      currentAuthUser = superAdminUser;

      const res = await request(app)
        .post(`/api/credits/${credit.id}/confirm-disbursement`)
        .send({
          confirmedAmount: 950000,
          notes: "Desembolso verificado contra confirmación operativa",
        });

      expect(res.status).toBe(200);
      expect(res.body.credit).toBeDefined();
      expect(res.body.commission).toBeDefined();

      // Verificar actualización en el crédito
      const updatedCredit = await storage.getCredit(credit.id);
      expect(updatedCredit?.status).toBe("disbursed");
      const confirmation = (updatedCredit?.finalProposal as any)?.disbursementConfirmation;
      expect(confirmation).toBeDefined();
      expect(confirmation.status).toBe("confirmed");
      expect(confirmation.confirmedAmount).toBe(950000);
      expect(confirmation.confirmedBy).toBe(superAdminUser.id);
      expect(confirmation.confirmedAt).toBeDefined();

      // Verificar auditoría
      const auditLogs = await storage.getCommissionAuditLogs(res.body.commission.id);
      const confirmLog = auditLogs.find((l) => l.action === "disbursement_confirmed");
      expect(confirmLog).toBeDefined();
      expect(confirmLog?.performedBy).toBe(superAdminUser.id);
      expect((confirmLog?.details as any)?.confirmedAmount).toBe(950000);
    });
  });

  // =========================================================================
  // 2. REGLA 2: DISTINCIÓN ENTRE REPORTADO Y CONFIRMADO
  // =========================================================================
  describe("2. Distinción entre reportado y confirmado (Regla 2)", () => {
    it("mark-dispersed marca estado como reportado pero no confirma ni genera comisiones", async () => {
      currentAuthUser = regularAdminUser;

      const client = await storage.createClient({
        firstName: "María",
        lastName: "López",
        brokerId: brokerUser.id,
      } as any);

      const institution = await storage.createFinancialInstitution({
        name: "Financiera BCM",
        active: true,
      } as any);

      const submissionRequest = await storage.createCreditSubmissionRequest({
        clientId: client.id,
        brokerId: brokerUser.id,
        requestedAmount: 500000,
        purpose: "Capital de trabajo",
        status: "in_progress",
      } as any);

      const target = await storage.createCreditSubmissionTarget({
        requestId: submissionRequest.id,
        financialInstitutionId: institution.id,
        isWinner: true,
        status: "selected_winner",
        institutionProposal: {
          approvedAmount: 500000,
          interestRate: 14.0,
          term: 12,
        },
      } as any);

      // Admin ejecuta mark-dispersed
      const res = await request(app)
        .patch(`/api/credit-submission-targets/${target.id}/mark-dispersed`)
        .send();

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("dispersed");

      // Verificar crédito asociado
      const linkedCredit = await storage.getCredit(res.body.creditId);
      expect(linkedCredit).toBeDefined();
      expect(linkedCredit?.status).toBe("disbursed");
      // Debe registrarse como reportado, NO como confirmado
      expect((linkedCredit?.finalProposal as any)?.disbursementStatus).toBe("reported");

      // No debe existir comisión calculada sobre este crédito
      const comms = await storage.getCommissions({ creditId: linkedCredit!.id });
      expect(comms.length).toBe(0);
    });

    it("Montos inválidos: rechaza montos negativos, cero o no numéricos", async () => {
      const { credit } = await createTestCreditWithSnapshot();
      currentAuthUser = superAdminUser;

      // Monto negativo
      const resNeg = await request(app)
        .post(`/api/credits/${credit.id}/confirm-disbursement`)
        .send({ confirmedAmount: -10000 });
      expect(resNeg.status).toBe(400);
      expect(resNeg.body.code).toBe("INVALID_CONFIRMED_AMOUNT");

      // Monto cero
      const resZero = await request(app)
        .post(`/api/credits/${credit.id}/confirm-disbursement`)
        .send({ confirmedAmount: 0 });
      expect(resZero.status).toBe(400);
      expect(resZero.body.code).toBe("INVALID_CONFIRMED_AMOUNT");

      // Monto no numérico
      const resNaN = await request(app)
        .post(`/api/credits/${credit.id}/confirm-disbursement`)
        .send({ confirmedAmount: "invalido" });
      expect(resNaN.status).toBe(400);
      expect(resNaN.body.code).toBe("INVALID_CONFIRMED_AMOUNT");
    });
  });

  // =========================================================================
  // 3. REGLA 3: CÁLCULO CANÓNICO, MULTIDISPERSIÓN E IDEMPOTENCIA
  // =========================================================================
  describe("3. Cálculo canónico post-confirmación (Regla 3)", () => {
    it("Cálculo exacto: calcula comisiones sobre monto confirmado con tasas congeladas", async () => {
      const { credit } = await createTestCreditWithSnapshot();
      currentAuthUser = superAdminUser;

      // Confirmar $800,000 dispersados (financiera 4%, broker 2%, master 1%, app 1%)
      const res = await request(app)
        .post(`/api/credits/${credit.id}/confirm-disbursement`)
        .send({ confirmedAmount: 800000 });

      expect(res.status).toBe(200);
      const comm = res.body.commission;
      expect(parseFloat(comm.amount)).toBe(32000); // 4% de 800k = 32,000 total bruto
      expect(parseFloat(comm.brokerShare)).toBe(16000); // 2% de 800k = 16,000
      expect(parseFloat(comm.masterBrokerShare)).toBe(8000); // 1% de 800k = 8,000
      expect(parseFloat(comm.appShare)).toBe(8000); // Margen CN = 8,000
      expect(comm.brokerId).toBe(brokerUser.id);
      expect(comm.masterBrokerId).toBe(masterBrokerUser.id);
    });

    it("Cambio de Master: si el broker cambia de Master, preserva el originMasterBrokerId original", async () => {
      const { credit } = await createTestCreditWithSnapshot();

      // Crear un nuevo Master Broker posterior
      const nuevoMaster = await storage.createUser({
        email: `nuevo-mb-${randomUUID().slice(0, 6)}@test.com`,
        role: "master_broker",
        firstName: "Nuevo",
        lastName: "Master",
      } as any);

      // Simular reasignación del broker al nuevo master en su perfil de usuario
      await storage.updateUser(brokerUser.id, {
        parentMasterBrokerId: nuevoMaster.id,
      } as any);

      currentAuthUser = superAdminUser;
      const res = await request(app)
        .post(`/api/credits/${credit.id}/confirm-disbursement`)
        .send({ confirmedAmount: 1000000 });

      expect(res.status).toBe(200);
      // La comisión DEBE asignarse al Master Broker original del crédito, NO al nuevo
      expect(res.body.commission.masterBrokerId).toBe(masterBrokerUser.id);
      expect(res.body.commission.masterBrokerId).not.toBe(nuevoMaster.id);
    });

    it("Multidispersión: soporta tramos parciales con dispersalIndex sin colisión", async () => {
      const { credit } = await createTestCreditWithSnapshot();
      currentAuthUser = superAdminUser;

      // Tramo 1: $600,000
      const res1 = await request(app)
        .post(`/api/credits/${credit.id}/confirm-disbursement`)
        .send({ confirmedAmount: 600000, dispersalIndex: 1 });

      expect(res1.status).toBe(200);
      expect(res1.body.commission.commissionType).toBe("apertura_parcial_1");
      expect(parseFloat(res1.body.commission.brokerShare)).toBe(12000); // 2% de 600k

      // Tramo 2: $400,000
      const res2 = await request(app)
        .post(`/api/credits/${credit.id}/confirm-disbursement`)
        .send({ confirmedAmount: 400000, dispersalIndex: 2 });

      expect(res2.status).toBe(200);
      expect(res2.body.commission.commissionType).toBe("apertura_parcial_2");
      expect(parseFloat(res2.body.commission.brokerShare)).toBe(8000); // 2% de 400k

      // Ambos tramos coexisten registrados
      const comms = await storage.getCommissions({ creditId: credit.id });
      expect(comms.length).toBe(2);
    });

    it("Idempotencia: doble confirmación con misma clave retorna comisión existente", async () => {
      const { credit } = await createTestCreditWithSnapshot();
      currentAuthUser = superAdminUser;
      const testKey = `idemp-${randomUUID()}`;

      const res1 = await request(app)
        .post(`/api/credits/${credit.id}/confirm-disbursement`)
        .send({ confirmedAmount: 500000, idempotencyKey: testKey });

      expect(res1.status).toBe(200);
      const commId1 = res1.body.commission.id;

      // Segunda llamada con misma clave
      const res2 = await request(app)
        .post(`/api/credits/${credit.id}/confirm-disbursement`)
        .send({ confirmedAmount: 500000, idempotencyKey: testKey });

      expect(res2.status).toBe(200);
      expect(res2.body.commission.id).toBe(commId1);
      expect(res2.body.alreadyConfirmed).toBe(true);
    });

    it("Tasas faltantes: bloquea cálculo y retorna 400 si faltan tasas obligatorias", async () => {
      // Crear crédito sin tasas en propuesta
      const client = await storage.createClient({
        firstName: "Pedro",
        lastName: "Gómez",
        brokerId: brokerUser.id,
      } as any);

      const institution = await storage.createFinancialInstitution({
        name: `Financiera Sin Tasas ${randomUUID().slice(0, 6)}`,
        commissionRate: "0",
        active: true,
      } as any);

      const credit = await storage.createCredit({
        clientId: client.id,
        brokerId: brokerUser.id,
        originMasterBrokerId: masterBrokerUser.id,
        financialInstitutionId: institution.id,
        amount: "500000.00",
        status: "approved",
        finalProposal: {
          approvedAmount: 500000,
          commissionRates: {
            broker: { apertura: 1.0 },
            // Faltan tasas de financiera y masterBroker
          },
        },
      } as any);

      currentAuthUser = superAdminUser;
      const res = await request(app)
        .post(`/api/credits/${credit.id}/confirm-disbursement`)
        .send({ confirmedAmount: 500000 });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("MISSING_COMMISSION_RATE");
    });
  });

  // =========================================================================
  // 4. REGLA 4: REVISIÓN Y APROBACIÓN DE COMISIONES
  // =========================================================================
  describe("4. Revisión y Aprobación de Comisiones por Super Admin (Regla 4)", () => {
    it("Detalle financiero: Super Admin revisa monto base, desglose y beneficiarios vía GET /api/commissions/:id", async () => {
      const { credit } = await createTestCreditWithSnapshot();
      currentAuthUser = superAdminUser;

      const confirmRes = await request(app)
        .post(`/api/credits/${credit.id}/confirm-disbursement`)
        .send({ confirmedAmount: 1200000 });

      const commId = confirmRes.body.commission.id;

      const detailRes = await request(app).get(`/api/commissions/${commId}`);
      expect(detailRes.status).toBe(200);
      expect(detailRes.body.baseDisbursedAmount).toBe(1200000);
      expect(detailRes.body.broker.id).toBe(brokerUser.id);
      expect(detailRes.body.masterBroker.id).toBe(masterBrokerUser.id);
      expect(detailRes.body.appShare).toBeDefined(); // Super Admin ve margen interno
      expect(detailRes.body.credit.disbursementStatus).toBe("confirmed");
    });

    it("RBAC Detalle: Broker no puede inspeccionar comisiones ajenas", async () => {
      const { credit } = await createTestCreditWithSnapshot();
      currentAuthUser = superAdminUser;

      const confirmRes = await request(app)
        .post(`/api/credits/${credit.id}/confirm-disbursement`)
        .send({ confirmedAmount: 500000 });

      const commId = confirmRes.body.commission.id;

      // Otro broker intenta ver el detalle
      const otroBroker = await storage.createUser({
        email: `otro-${randomUUID().slice(0, 6)}@test.com`,
        role: "broker",
      } as any);

      currentAuthUser = otroBroker;
      const detailRes = await request(app).get(`/api/commissions/${commId}`);
      expect(detailRes.status).toBe(403);
    });

    it("Anti-Reatribución: POST /api/commissions/:id/approve prohíbe reatribuir broker o master", async () => {
      const { credit } = await createTestCreditWithSnapshot();
      currentAuthUser = superAdminUser;

      const confirmRes = await request(app)
        .post(`/api/credits/${credit.id}/confirm-disbursement`)
        .send({ confirmedAmount: 1000000 });

      const commId = confirmRes.body.commission.id;

      // Intento de reatribución de broker
      const resReatribBroker = await request(app)
        .post(`/api/commissions/${commId}/approve`)
        .send({ brokerId: "otro-broker-id" });

      expect(resReatribBroker.status).toBe(400);
      expect(resReatribBroker.body.code).toBe("COMMISSION_REATTRIBUTION_FORBIDDEN");

      // Intento de reatribución de master broker
      const resReatribMaster = await request(app)
        .post(`/api/commissions/${commId}/approve`)
        .send({ masterBrokerId: "otro-master-id" });

      expect(resReatribMaster.status).toBe(400);
      expect(resReatribMaster.body.code).toBe("COMMISSION_REATTRIBUTION_FORBIDDEN");
    });

    it("Aprobación exitosa: congela frozenAmount y registra auditoría de Super Admin", async () => {
      const { credit } = await createTestCreditWithSnapshot();
      currentAuthUser = superAdminUser;

      const confirmRes = await request(app)
        .post(`/api/credits/${credit.id}/confirm-disbursement`)
        .send({ confirmedAmount: 1000000 });

      const commId = confirmRes.body.commission.id;

      const approveRes = await request(app)
        .post(`/api/commissions/${commId}/approve`)
        .send({ notes: "Comisión revisada y autorizada" });

      expect(approveRes.status).toBe(200);
      expect(approveRes.body.commission.status).toBe("approved");
      expect(approveRes.body.commission.approvedBy).toBe(superAdminUser.id);
      expect(approveRes.body.commission.frozenAmount).toBeDefined();

      // Doble aprobación es idempotente
      const doubleApproveRes = await request(app)
        .post(`/api/commissions/${commId}/approve`)
        .send();
      expect(doubleApproveRes.status).toBe(200);
      expect(doubleApproveRes.body.alreadyApproved).toBe(true);
    });
  });

  // =========================================================================
  // 5. REGLA 5: KYC DOCUMENTS EXEMPTION AT CONFIRMATION TIME
  // =========================================================================
  describe("5. Exención de documentos KYC al confirmar créditos y aprobar comisiones (Regla 5)", () => {
    it("Super Admin confirma desembolso sin exigir INE, CSF ni estado de cuenta bancario", async () => {
      // Broker y cliente sin ningún documento cargado en storage
      const { credit } = await createTestCreditWithSnapshot();
      currentAuthUser = superAdminUser;

      // La confirmación procede exitosamente sin bloquear por KYC de liquidación
      const res = await request(app)
        .post(`/api/credits/${credit.id}/confirm-disbursement`)
        .send({ confirmedAmount: 750000 });

      expect(res.status).toBe(200);
      expect(res.body.credit.status).toBe("disbursed");
      expect(res.body.commission.status).toBe("generated");
    });

    it("Super Admin aprueba comisión sin exigir documentos de liquidación posteriores", async () => {
      const { credit } = await createTestCreditWithSnapshot();
      currentAuthUser = superAdminUser;

      const confirmRes = await request(app)
        .post(`/api/credits/${credit.id}/confirm-disbursement`)
        .send({ confirmedAmount: 500000 });

      const commId = confirmRes.body.commission.id;

      const approveRes = await request(app)
        .post(`/api/commissions/${commId}/approve`)
        .send();

      expect(approveRes.status).toBe(200);
      expect(approveRes.body.commission.status).toBe("approved");
    });
  });
});
