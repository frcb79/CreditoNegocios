import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import express from "express";
// @ts-ignore
import request from "supertest";
import cron from "node-cron";
import { storage } from "../../server/storage";
import { registerLegalRoutes } from "../../server/legalRoutes";
import { registerRoutes } from "../../server/routes";
import { _testEmailStore } from "../../server/emailService";
import { pool } from "../../server/db";

describe("Cierre P0: Formalización Obligatoria y Cierre de Bypasses en Originación", () => {
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
    delete _testEmailStore.simulateFailure;
    delete _testEmailStore.lastFormalizationOtp;
  });

  const createTestUser = async (
    role = "broker",
    name = "Test User",
    status: "active" | "inactive" | "suspended" = "active"
  ) => {
    const parts = name.split(" ");
    return await storage.createUser({
      email: `user-${randomUUID()}@example.com`,
      firstName: parts[0] || "Test",
      lastName: parts.slice(1).join(" ") || "User",
      role,
      isActive: status === "active",
      status,
    });
  };

  const formalizeUserViaOtp = async (
    user: any,
    docs = [
      { document: "convenio", version: "1.0" },
      { document: "reglas-red", version: "1.0" },
    ]
  ) => {
    currentAuthUser = user;
    const reqRes = await request(app)
      .post("/api/legal/formalization/request-otp")
      .send({ confirmedDocuments: docs });

    if (reqRes.status !== 200) {
      throw new Error(`Failed to request OTP: ${JSON.stringify(reqRes.body)}`);
    }

    const code = _testEmailStore.lastFormalizationOtp?.code;
    if (!code) {
      throw new Error("No OTP code found in email store");
    }

    const verifyRes = await request(app)
      .post("/api/legal/formalization/verify-otp")
      .send({ code, confirmedDocuments: docs });

    if (verifyRes.status !== 200) {
      throw new Error(`Failed to verify OTP: ${JSON.stringify(verifyRes.body)}`);
    }

    return verifyRes.body.acceptances;
  };

  describe("1. Broker sin formalizar: bloqueo 403 en todas las rutas de originación", () => {
    it("POST /api/clients responde 403 FORMALIZATION_REQUIRED", async () => {
      const broker = await createTestUser("broker", "Broker SinConvenio");
      currentAuthUser = broker;

      const res = await request(app)
        .post("/api/clients")
        .send({
          firstName: "Prospecto",
          lastName: "Uno",
          email: `client-${randomUUID()}@corp.com`,
          phone: "5511223344",
          type: "persona_moral",
          businessName: "Empresa Bloqueada SA",
        });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe("FORMALIZATION_REQUIRED");
      expect(res.body.message).toContain("formalizar tu Convenio de Colaboración");
    });

    it("POST /api/credits responde 403 FORMALIZATION_REQUIRED", async () => {
      const broker = await createTestUser("broker", "Broker CreditoBloqueado");
      currentAuthUser = broker;

      // Create a dummy client directly in storage
      const client = await storage.createClient({
        firstName: "Cliente",
        lastName: "Existente",
        email: `client-${randomUUID()}@corp.com`,
        phone: "5511223344",
        type: "persona_moral",
        businessName: "Cliente Directo SA",
        brokerId: broker.id,
      });

      const res = await request(app)
        .post("/api/credits")
        .send({
          clientId: client.id,
          amount: "1500000",
          purpose: "Capital de trabajo",
        });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe("FORMALIZATION_REQUIRED");
    });

    it("POST /api/credit-submissions responde 403 FORMALIZATION_REQUIRED", async () => {
      const broker = await createTestUser("broker", "Broker SubBloqueado");
      currentAuthUser = broker;

      const client = await storage.createClient({
        firstName: "Cliente",
        lastName: "Sub",
        email: `client-${randomUUID()}@corp.com`,
        phone: "5511223344",
        type: "persona_moral",
        businessName: "Cliente Sub SA",
        brokerId: broker.id,
      });

      const res = await request(app)
        .post("/api/credit-submissions")
        .send({
          clientId: client.id,
          requestedAmount: "2000000",
          purpose: "adquisicion",
          financialInstitutionIds: [],
        });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe("FORMALIZATION_REQUIRED");
    });

    it("POST /api/mortgage-leads responde 403 FORMALIZATION_REQUIRED", async () => {
      const broker = await createTestUser("broker", "Broker HipoBloqueado");
      currentAuthUser = broker;

      const res = await request(app)
        .post("/api/mortgage-leads")
        .send({
          firstName: "Cliente",
          lastName: "Hipo",
          phone: "5588776655",
          email: `hipo-${randomUUID()}@corp.com`,
          propertyValue: "4000000",
          requestedAmount: "3000000",
          downPayment: "1000000",
          propertyLocation: "CDMX",
          requestedTermMonths: 240,
          monthlyIncome: "100000",
          incomeType: "asalariado",
        });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe("FORMALIZATION_REQUIRED");
    });

    it("POST /api/clients/:id/opportunities responde 403 FORMALIZATION_REQUIRED", async () => {
      const broker = await createTestUser("broker", "Broker OppBloqueado");
      currentAuthUser = broker;

      const client = await storage.createClient({
        firstName: "Cliente",
        lastName: "Opp",
        email: `client-${randomUUID()}@corp.com`,
        phone: "5511223344",
        type: "persona_moral",
        businessName: "Cliente Opp SA",
        brokerId: broker.id,
      });

      const res = await request(app)
        .post(`/api/clients/${client.id}/opportunities`)
        .send({
          title: "Expansión Operativa",
          financingNeedType: "credito_simple",
          requestedAmount: 500000,
        });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe("FORMALIZATION_REQUIRED");
    });
  });

  describe("2. Broker formalizado: operación permitida", () => {
    it("Broker formalizado puede dar de alta cliente, crédito y prospecto hipotecario", async () => {
      const broker = await createTestUser("broker", "Broker Formalizado OK");
      await formalizeUserViaOtp(broker);
      currentAuthUser = broker;

      // 1. Alta de cliente
      const clientRes = await request(app)
        .post("/api/clients")
        .send({
          firstName: "Cliente",
          lastName: "Aprobado",
          email: `client-ok-${randomUUID()}@corp.com`,
          phone: "5599887766",
          type: "persona_moral",
          businessName: "Negocio Aprobado SA",
        });
      expect(clientRes.status).toBe(201);
      const clientId = clientRes.body.id;

      // 2. Alta de crédito
      const creditRes = await request(app)
        .post("/api/credits")
        .send({
          clientId,
          amount: "1200000",
          purpose: "Liquidez",
        });
      expect(creditRes.status).toBe(201);

      // 3. Alta de prospecto hipotecario
      const leadRes = await request(app)
        .post("/api/mortgage-leads")
        .send({
          firstName: "Lead",
          lastName: "Hipotecario",
          phone: "5588771122",
          email: `lead-${randomUUID()}@corp.com`,
          propertyValue: "5000000",
          requestedAmount: "3500000",
          downPayment: "1500000",
          propertyLocation: "CDMX",
          requestedTermMonths: 240,
          monthlyIncome: "120000",
          incomeType: "asalariado",
        });
      expect(leadRes.status).toBe(201);
    });
  });

  describe("3. Master Broker sin Reglas Master: bloqueo hasta completar formalización", () => {
    it("Master Broker que solo aceptó Convenio y Reglas de Red es bloqueado (403)", async () => {
      // 1. User starts as broker and formalizes broker documents (convenio + reglas-red)
      const user = await createTestUser("broker", "Broker Ascendido");
      await formalizeUserViaOtp(user, [
        { document: "convenio", version: "1.0" },
        { document: "reglas-red", version: "1.0" },
      ]);

      // 2. User is promoted to master_broker (lacking reglas-master)
      const master = await storage.updateUser(user.id, { role: "master_broker" });
      currentAuthUser = master;

      const res = await request(app)
        .post("/api/clients")
        .send({
          firstName: "Cliente",
          lastName: "MasterFail",
          email: `client-mf-${randomUUID()}@corp.com`,
          phone: "5577665544",
          type: "persona_moral",
          businessName: "Master Incompleto SA",
        });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe("FORMALIZATION_REQUIRED");

      // 3. Master Broker who formalizes all required documents (convenio, reglas-red, reglas-master) succeeds
      const fullMaster = await createTestUser("master_broker", "Master Completo");
      await formalizeUserViaOtp(fullMaster, [
        { document: "convenio", version: "1.0" },
        { document: "reglas-red", version: "1.0" },
        { document: "reglas-master", version: "1.0" },
      ]);
      currentAuthUser = fullMaster;

      const resAfter = await request(app)
        .post("/api/clients")
        .send({
          firstName: "Cliente",
          lastName: "MasterOK",
          email: `client-mok-${randomUUID()}@corp.com`,
          phone: "5577665544",
          type: "persona_moral",
          businessName: "Master Completo SA",
        });

      expect(resAfter.status).toBe(201);
    });
  });

  describe("4. Originación delegada: sin bypass", () => {
    it("Colaborador en tenant actuando para broker no formalizado es bloqueado (403)", async () => {
      // 1. Unformalized broker owner of tenant
      const unformalizedBroker = await createTestUser("broker", "Broker Titular NoFormalizado");
      const tenant = await storage.createTenant({
        name: "Organizacion Broker Test",
        slug: `org-${randomUUID()}`,
        type: "broker",
      });
      await storage.createTenantMember({
        tenantId: tenant.id,
        userId: unformalizedBroker.id,
        role: "owner",
        canOriginate: true,
        isActive: true,
      });

      // 2. Collaborator in the same tenant
      const collaborator = await createTestUser("broker", "Colaborador Asistente");
      await storage.createTenantMember({
        tenantId: tenant.id,
        userId: collaborator.id,
        role: "member",
        canOriginate: false,
        isActive: true,
      });

      // 3. Collaborator attempts to create a client assigning it to the unformalized broker
      currentAuthUser = collaborator;
      const res = await request(app)
        .post("/api/clients")
        .send({
          firstName: "Cliente",
          lastName: "Delegado",
          email: `delegado-${randomUUID()}@corp.com`,
          phone: "5544332211",
          type: "persona_moral",
          businessName: "Empresa Delegada SA",
          brokerId: unformalizedBroker.id,
        });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe("FORMALIZATION_REQUIRED");
      expect(res.body.message).toContain("debe formalizar sus convenios y reglas vigentes");
    });
  });

  describe("5. Admin actuando en nombre de broker no formalizado: bloqueo 403", () => {
    it("Admin no puede crear clientes en nombre de broker sin formalizar", async () => {
      const admin = await createTestUser("admin", "Admin Gestor");
      const unformalizedBroker = await createTestUser("broker", "Broker SinDocs");
      currentAuthUser = admin;

      const res = await request(app)
        .post("/api/clients")
        .send({
          firstName: "Cliente",
          lastName: "AdminParaBroker",
          email: `admin-broker-${randomUUID()}@corp.com`,
          phone: "5533221100",
          type: "persona_moral",
          businessName: "Empresa Para Broker SA",
          brokerId: unformalizedBroker.id,
        });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe("FORMALIZATION_REQUIRED");
      expect(res.body.message).toContain("debe formalizar sus convenios y reglas vigentes");
    });

    it("Admin sí puede crear clientes en nombre de broker debidamente formalizado", async () => {
      const admin = await createTestUser("admin", "Admin Gestor Dos");
      const formalizedBroker = await createTestUser("broker", "Broker ConDocs");
      await formalizeUserViaOtp(formalizedBroker);

      currentAuthUser = admin;
      const res = await request(app)
        .post("/api/clients")
        .send({
          firstName: "Cliente",
          lastName: "AdminParaBrokerOK",
          email: `admin-broker-ok-${randomUUID()}@corp.com`,
          phone: "5533221100",
          type: "persona_moral",
          businessName: "Empresa Para Broker OK SA",
          brokerId: formalizedBroker.id,
        });

      expect(res.status).toBe(201);
      expect(res.body.brokerId).toBe(formalizedBroker.id);
    });
  });

  describe("6. Admin originando operación propia: comportamiento actual preservado", () => {
    it("Admin puede originar clientes propios sin requerir formalización", async () => {
      const admin = await createTestUser("admin", "Admin Propio");
      currentAuthUser = admin;

      const res = await request(app)
        .post("/api/clients")
        .send({
          firstName: "Cliente",
          lastName: "PropioAdmin",
          email: `admin-propio-${randomUUID()}@corp.com`,
          phone: "5522110099",
          type: "persona_moral",
          businessName: "Empresa Directa Admin SA",
        });

      expect(res.status).toBe(201);
      expect(res.body.brokerId).toBe(admin.id);
    });
  });

  describe("7. Canalización adicional de solicitud existente: validación correcta", () => {
    it("Canalización rechazada (403) si el broker de la solicitud no está formalizado", async () => {
      const unformalizedBroker = await createTestUser("broker", "Broker SubSinFormalizar");
      const client = await storage.createClient({
        firstName: "Cliente",
        lastName: "Canalizacion",
        email: `cliente-can-${randomUUID()}@corp.com`,
        phone: "5512344321",
        type: "persona_moral",
        businessName: "Canalizacion SA",
        brokerId: unformalizedBroker.id,
      });

      // Existing submission in storage for this unformalized broker
      const submission = await storage.createCreditSubmissionRequest({
        clientId: client.id,
        brokerId: unformalizedBroker.id,
        requestedAmount: "1000000",
        purpose: "adquisicion",
      });

      currentAuthUser = unformalizedBroker;
      const res = await request(app)
        .post(`/api/credit-submissions/${submission.id}/targets`)
        .send({
          financialInstitutionIds: [randomUUID()],
        });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe("FORMALIZATION_REQUIRED");
    });

    it("Canalización permitida (201) si el broker de la solicitud está debidamente formalizado", async () => {
      const formalizedBroker = await createTestUser("broker", "Broker SubFormalizado");
      await formalizeUserViaOtp(formalizedBroker);

      const client = await storage.createClient({
        firstName: "Cliente",
        lastName: "CanalizacionOK",
        email: `cliente-can-ok-${randomUUID()}@corp.com`,
        phone: "5512344321",
        type: "persona_moral",
        businessName: "Canalizacion OK SA",
        brokerId: formalizedBroker.id,
      });

      const submission = await storage.createCreditSubmissionRequest({
        clientId: client.id,
        brokerId: formalizedBroker.id,
        requestedAmount: "1000000",
        purpose: "adquisicion",
      });

      currentAuthUser = formalizedBroker;
      const dummyInstId = randomUUID();
      const res = await request(app)
        .post(`/api/credit-submissions/${submission.id}/targets`)
        .send({
          financialInstitutionIds: [dummyInstId],
        });

      expect(res.status).toBe(201);
      expect(res.body.targets).toBeDefined();
    });
  });

  describe("8. Registro, navegación y acceso al perfil antes de formalizar: funcionan normalmente", () => {
    it("Broker se registra y puede consultar su perfil y documentos legales sin bloqueo", async () => {
      // 1. Register new broker
      const regRes = await request(app)
        .post("/api/auth/register")
        .send({
          firstName: "Broker",
          lastName: "Nuevo",
          email: `broker-nuevo-${randomUUID()}@test.com`,
          password: "Password123!",
          acceptTerms: true,
          termsVersion: "1.0",
          acknowledgePrivacy: true,
          privacyVersion: "1.0",
        });

      expect(regRes.status).toBe(201);
      const newBroker = regRes.body.user;

      currentAuthUser = newBroker;

      // 2. Can consult formalization status (isFormalized = false)
      const statusRes = await request(app).get("/api/legal/formalization/status");
      expect(statusRes.status).toBe(200);
      expect(statusRes.body.isFormalized).toBe(false);
      expect(statusRes.body.requiresFormalization).toBe(true);

      // 3. Can consult formalization required documents
      const docsRes = await request(app).get("/api/legal/formalization/documents");
      expect(docsRes.status).toBe(200);
      expect(docsRes.body.documents.length).toBeGreaterThanOrEqual(2);

      // 4. Can consult public legal documents
      const termsRes = await request(app).get("/api/legal/terminos");
      expect(termsRes.status).toBe(200);

      const privacyRes = await request(app).get("/api/legal/aviso");
      expect(privacyRes.status).toBe(200);
    });
  });
});
