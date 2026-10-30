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
import { commercialTermsService } from "../../server/commercialTermsService";
import { pool } from "../../server/db";

describe("AG — FASE 2B.2B: Cambios y Aceptación Comercial", () => {
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
    commercialTermsService.resetForTesting();
    delete _testEmailStore.simulateFailure;
    delete _testEmailStore.lastFormalizationOtp;
    currentAuthUser = null;
  });

  const createTestUser = async (
    role = "broker",
    name = "Test User",
    status: "active" | "inactive" | "suspended" = "active",
    masterBrokerId?: string
  ) => {
    const parts = name.split(" ");
    return await storage.createUser({
      email: `user-${randomUUID()}@example.com`,
      firstName: parts[0] || "Test",
      lastName: parts.slice(1).join(" ") || "User",
      role,
      isActive: status === "active",
      status,
      masterBrokerId,
    });
  };

  const createTestInstitution = async (name = "Financiera Test") => {
    const inst = await storage.createFinancialInstitution({name, isActive: true} as any);
    // COM launch: assignments require a real, versioned, published offer;
    // historical lender-wide defaults are no longer a valid ceiling.
    const product = await storage.createInstitutionProduct({
      institutionId: inst.id, name: name + " Simple",
      customName: name + " Simple", productType: "credito_simple",
      targetProfiles: ["persona_moral"], isActive: true,
    } as any, {
      conditions: {
        minAmount: 100000, maxAmount: 1000000, maxTermMonths: 36,
        rateSource: "Tasa indicativa",
        commissionRates: {
          financiera: { apertura: 6, renovacion: 3 },
          masterBroker: { apertura: 5, renovacion: 2 },
          broker: { apertura: 3, renovacion: 1 },
        },
      },
      requirements: { targetProfiles: ["persona_moral"] },
      requiredDocuments: ["Identificación"],
      changeReason: "Publicación de oferta para prueba contractual",
    });
    const versions = await storage.getInstitutionProductVersions(product.id);
    await storage.publishInstitutionProductVersion(product.id, versions[0].id, {
      changeReason: "Publicación para prueba de comisiones",
    });
    return inst;
  };

  const formalizeUserViaOtp = async (user: any) => {
    currentAuthUser = user;
    const docs = [
      { document: "convenio", version: "1.0" },
      { document: "reglas-red", version: "1.0" },
    ];
    const reqRes = await request(app)
      .post("/api/legal/formalization/request-otp")
      .send({ confirmedDocuments: docs });

    if (reqRes.status !== 200) {
      throw new Error(`Failed to request OTP: ${JSON.stringify(reqRes.body)}`);
    }

    const code = _testEmailStore.lastFormalizationOtp?.code;
    const verifyRes = await request(app)
      .post("/api/legal/formalization/verify-otp")
      .send({
        code,
        confirmedDocuments: docs,
      });

    if (verifyRes.status !== 200) {
      throw new Error(`Failed to verify OTP: ${JSON.stringify(verifyRes.body)}`);
    }
  };

  describe("1. Versionamiento y Notificación Individual de Cambios (Reglas 1, 2, 3)", () => {
    it("Super Admin modifica plazos comerciales: incrementa versión e inserta notificaciones a Brokers y Masters", async () => {
      const superAdmin = await createTestUser("super_admin", "Admin Chief");
      const master = await createTestUser("master_broker", "Master Alpha");
      const broker = await createTestUser("broker", "Broker Beta", "active", master.id);

      currentAuthUser = superAdmin;

      // Super Admin modifica plazos comerciales con parámetros válidos
      const updateRes = await request(app)
        .put("/api/admin/commercial-config")
        .send({
          initialOpportunityHoldDays: 45,
          activeRelationshipValidityDays: 120,
        });

      expect(updateRes.status).toBe(200);

      // Verificar que la versión actual incrementó
      const status = await commercialTermsService.getPendingCommercialTermsForUser(broker.id);
      expect(status.hasPending).toBe(true);
      expect(status.pendingTerms.length).toBeGreaterThan(0);

      const globalTerm = status.pendingTerms.find((t: any) => t.type === "global");
      expect(globalTerm).toBeDefined();
      expect(globalTerm?.document).toBe("condiciones-comerciales");
      expect(globalTerm?.version).toBe("1.1");
      expect(globalTerm?.modifiedParams).toContain("initialOpportunityHoldDays");

      // Verificar que se despacharon notificaciones individuales
      const brokerNotifications = await storage.getNotifications(broker.id);
      expect(brokerNotifications.length).toBeGreaterThan(0);
      expect(brokerNotifications[0].title).toContain("Actualización de Condiciones Comerciales");

      const masterNotifications = await storage.getNotifications(master.id);
      expect(masterNotifications.length).toBeGreaterThan(0);
    });

    it("Distingue cambios globales de plazos vs cambios de comisiones de red de Master Broker", async () => {
      const superAdmin = await createTestUser("super_admin", "Admin Chief");
      const master = await createTestUser("master_broker", "Master Alpha");
      const brokerUnderMaster = await createTestUser("broker", "Broker Under", "active", master.id);
      const independentBroker = await createTestUser("broker", "Broker Independent");
      const inst = await createTestInstitution("Financiera Red");

      currentAuthUser = master;

      // Master Broker actualiza comisiones de su red
      const ratesRes = await request(app)
        .put("/api/master-broker/network-rates")
        .send({
          rates: {
            [inst.id]: { apertura: 2.5 },
          },
        });

      expect(ratesRes.status).toBe(200);

      // El broker de su red DEBE tener pendiente la aceptación de comisiones de red
      const underStatus = await commercialTermsService.getPendingCommercialTermsForUser(brokerUnderMaster.id);
      expect(underStatus.hasPending).toBe(true);
      const netTerm = underStatus.pendingTerms.find((t: any) => t.type === "network");
      expect(netTerm).toBeDefined();
      expect(netTerm?.document).toBe("comisiones-red");
      expect(netTerm?.masterBrokerId).toBe(master.id);

      // El broker independiente NO debe tener pendiente comisiones de este master
      const indepStatus = await commercialTermsService.getPendingCommercialTermsForUser(independentBroker.id);
      const indepNet = indepStatus.pendingTerms.find((t: any) => t.type === "network");
      expect(indepNet).toBeUndefined();
    });
  });

  describe("2. Aceptación Expresa e Idempotencia (Regla 4)", () => {
    it("Broker y Master consultan estado y aceptan individualmente con registro de IP y User-Agent", async () => {
      const superAdmin = await createTestUser("super_admin", "Admin Chief");
      const broker = await createTestUser("broker", "Broker Express");
      await formalizeUserViaOtp(broker);

      // Super Admin publica cambio
      currentAuthUser = superAdmin;
      await request(app)
        .put("/api/admin/commercial-config")
        .send({ initialOpportunityHoldDays: 60 });

      // Broker consulta estado de condiciones pendientes
      currentAuthUser = broker;
      const statusRes = await request(app)
        .get("/api/commercial-terms/status");

      expect(statusRes.status).toBe(200);
      expect(statusRes.body.hasPending).toBe(true);
      expect(statusRes.body.pendingTerms.length).toBe(1);
      const pending = statusRes.body.pendingTerms[0];

      // Broker acepta formalmente la nueva versión
      const acceptRes = await request(app)
        .post("/api/commercial-terms/accept")
        .set("User-Agent", "Mozilla/5.0 TestBrowser/1.0")
        .set("X-Forwarded-For", "203.0.113.222")
        .send({
          document: pending.document,
          version: pending.version,
        });

      expect(acceptRes.status).toBe(200);
      expect(acceptRes.body.success).toBe(true);
      expect(acceptRes.body.acceptance.version).toBe(pending.version);
      expect(acceptRes.body.acceptance.document).toBe(pending.document);
      expect(acceptRes.body.acceptance.evidence.userAgent).toBe("Mozilla/5.0 TestBrowser/1.0");
      // X-Forwarded-For from an untrusted caller must not falsify evidence.
      expect(acceptRes.body.acceptance.evidence.ipAddress).not.toBe("203.0.113.222");

      // Consultar de nuevo: ya no tiene pendientes
      const afterRes = await request(app).get("/api/commercial-terms/status");
      expect(afterRes.body.hasPending).toBe(false);
      expect(afterRes.body.pendingTerms.length).toBe(0);

      // Idempotencia: enviar nuevamente la aceptación no duplica ni causa error
      const repeatRes = await request(app)
        .post("/api/commercial-terms/accept")
        .send({
          document: pending.document,
          version: pending.version,
        });

      expect(repeatRes.status).toBe(200);
      expect(repeatRes.body.success).toBe(true);
    });

    it("Historial auditable conserva versiones históricas y evidencias", async () => {
      const superAdmin = await createTestUser("super_admin", "Admin Chief");
      currentAuthUser = superAdmin;

      // Publicar dos cambios distintos
      await request(app).put("/api/admin/commercial-config").send({ initialOpportunityHoldDays: 35 });
      await request(app).put("/api/admin/commercial-config").send({ initialOpportunityHoldDays: 45 });

      const historyRes = await request(app).get("/api/commercial-terms/history");
      expect(historyRes.status).toBe(200);
      expect(historyRes.body.versions.length).toBeGreaterThanOrEqual(2);
      expect(historyRes.body.versions[0].previousConditions).toBeDefined();
      expect(historyRes.body.versions[0].newConditions).toBeDefined();
    });
  });

  describe("3. No Retroactividad y Puerta de Originación (Regla 5)", () => {
    it("Bloquea creación de nuevas operaciones comerciales si hay condiciones pendientes de aceptación", async () => {
      const superAdmin = await createTestUser("super_admin", "Admin Chief");
      const broker = await createTestUser("broker", "Broker Active");
      await formalizeUserViaOtp(broker);

      // Super Admin modifica plazos
      currentAuthUser = superAdmin;
      await request(app)
        .put("/api/admin/commercial-config")
        .send({ initialOpportunityHoldDays: 50 });

      // Broker intenta originar nuevo cliente sin haber aceptado los nuevos términos
      currentAuthUser = broker;
      const clientRes = await request(app)
        .post("/api/clients")
        .send({
          firstName: "Prospecto",
          lastName: "Comercial",
          email: `client-${randomUUID()}@corp.com`,
          phone: "5511223344",
          type: "persona_moral",
          businessName: "Empresa Bloqueada SA",
        });

      expect(clientRes.status).toBe(403);
      expect(clientRes.body.code).toBe("PENDING_COMMERCIAL_TERMS_ACCEPTANCE");
      expect(clientRes.body.message).toContain("condiciones comerciales vigentes");

      // Broker acepta las condiciones pendientes
      const statusRes = await request(app).get("/api/commercial-terms/status");
      const pending = statusRes.body.pendingTerms[0];

      await request(app)
        .post("/api/commercial-terms/accept")
        .send({ document: pending.document, version: pending.version });

      // Ahora la creación de cliente procede normalmente (pasa el gate de formalización y condiciones)
      const allowedRes = await request(app)
        .post("/api/clients")
        .send({
          firstName: "Prospecto",
          lastName: "Comercial",
          email: `client-${randomUUID()}@corp.com`,
          phone: "5511223344",
          type: "persona_moral",
          businessName: "Empresa Bloqueada SA",
        });

      expect(allowedRes.status).toBe(201);
    });

    it("Consultas, créditos históricos y derechos devengados NUNCA se bloquean", async () => {
      const superAdmin = await createTestUser("super_admin", "Admin Chief");
      const broker = await createTestUser("broker", "Broker Consultor");
      await formalizeUserViaOtp(broker);

      // Super Admin modifica plazos (términos pendientes)
      currentAuthUser = superAdmin;
      await request(app)
        .put("/api/admin/commercial-config")
        .send({ initialOpportunityHoldDays: 55 });

      // Broker consulta créditos y comisiones: NO se bloquea
      currentAuthUser = broker;

      const creditsRes = await request(app).get("/api/credits");
      expect(creditsRes.status).toBe(200);

      const commissionsRes = await request(app).get("/api/commissions");
      expect(commissionsRes.status).toBe(200);

      const oppsRes = await request(app).get("/api/commercial/opportunities");
      expect(oppsRes.status).toBe(200);
    });
  });

  describe("4. Transferencia de Broker entre Masters (Regla 6)", () => {
    it("Broker transferido a nuevo Master debe aceptar el esquema de comisiones de dicho Master", async () => {
      const superAdmin = await createTestUser("super_admin", "Admin Chief");
      const master1 = await createTestUser("master_broker", "Master 1");
      const master2 = await createTestUser("master_broker", "Master 2");
      const broker = await createTestUser("broker", "Broker Switcher", "active", master1.id);
      const inst = await createTestInstitution("Financiera Transfer");
      await formalizeUserViaOtp(broker);

      // Master 1 publica sus comisiones y Broker las acepta
      currentAuthUser = master1;
      await request(app).put("/api/master-broker/network-rates").send({
        rates: {
          [inst.id]: { apertura: 2.0 },
        },
      });

      currentAuthUser = broker;
      const status1 = await commercialTermsService.getPendingCommercialTermsForUser(broker.id);
      const netTerm1 = status1.pendingTerms.find((t: any) => t.type === "network")!;
      await request(app).post("/api/commercial-terms/accept").send({
        document: netTerm1.document,
        version: netTerm1.version,
      });

      // Ahora Master 2 configura comisiones distintas para su red
      currentAuthUser = master2;
      await request(app).put("/api/master-broker/network-rates").send({
        rates: {
          [inst.id]: { apertura: 3.0 },
        },
      });

      // Super Admin transfiere al broker a Master 2
      await storage.updateUser(broker.id, {
        masterBrokerId: master2.id,
      });

      const updatedBroker = (await storage.getUser(broker.id))!;

      // El broker transferido ahora tiene pendiente la aceptación de comisiones de Master 2
      const statusTransferred = await commercialTermsService.getPendingCommercialTermsForUser(updatedBroker.id);
      expect(statusTransferred.hasPending).toBe(true);
      const netTerm2 = statusTransferred.pendingTerms.find((t: any) => t.type === "network");
      expect(netTerm2).toBeDefined();
      expect(netTerm2?.masterBrokerId).toBe(master2.id);

      // Si intenta registrar cliente bajo el nuevo Master antes de aceptar, queda bloqueado
      currentAuthUser = updatedBroker;
      const blockedRes = await request(app).post("/api/clients").send({
        firstName: "Cliente",
        lastName: "Transferido",
        email: `transf-${randomUUID()}@corp.com`,
        phone: "5599887766",
        type: "persona_moral",
        businessName: "Cliente Post Transfer SA",
      });

      expect(blockedRes.status).toBe(403);
      expect(blockedRes.body.code).toBe("PENDING_COMMERCIAL_TERMS_ACCEPTANCE");

      // Una vez aceptadas las condiciones del nuevo Master, queda habilitado
      await request(app).post("/api/commercial-terms/accept").send({
        document: netTerm2!.document,
        version: netTerm2!.version,
      });

      const unblockedRes = await request(app).post("/api/clients").send({
        firstName: "Cliente",
        lastName: "Transferido",
        email: `transf-${randomUUID()}@corp.com`,
        phone: "5599887766",
        type: "persona_moral",
        businessName: "Cliente Post Transfer SA",
      });

      expect(unblockedRes.status).toBe(201);
    });
  });

  describe("Asignación por oferta de Master Broker", () => {
    it("sugiere broker directo por oferta y valida el techo de ese producto", async () => {
      const master = await createTestUser("master_broker", "Master Por Oferta");
      const inst = await createTestInstitution("Financiera Dos Productos");
      const first = (await storage.getInstitutionProducts(inst.id))[0];
      const second = await storage.createInstitutionProduct({
        institutionId: inst.id, name: "Revolvente", customName: "Revolvente",
        productType: "credito_revolvente", targetProfiles: ["persona_moral"], isActive: true,
      } as any, {
        conditions: {
          minAmount: 200000, maxAmount: 2000000, maxTermMonths: 12,
          rateSource: "Tasa indicativa",
          commissionRates: {
            financiera: { apertura: 4, renovacion: 2 },
            masterBroker: { apertura: 2, renovacion: 1 },
            broker: { apertura: 1.5, renovacion: 0.5 },
          },
        },
        requirements: { targetProfiles: ["persona_moral"] },
        requiredDocuments: ["Identificación"],
        changeReason: "Segunda oferta de prueba",
      });
      const versions = await storage.getInstitutionProductVersions(second.id);
      await storage.publishInstitutionProductVersion(second.id, versions[0].id, {
        changeReason: "Segunda oferta publicada",
      });

      currentAuthUser = master;
      const queried = await request(app).get("/api/master-broker/network-rates");
      expect(queried.status).toBe(200);
      const ownOffers = queried.body.offerItems.filter((item: any) => item.institutionId === inst.id);
      expect(ownOffers).toHaveLength(2);
      expect(ownOffers.find((x: any) => x.offerId === first.id).suggestedBroker.apertura).toBe(3);
      expect(ownOffers.find((x: any) => x.offerId === second.id).masterCeiling.apertura).toBe(2);

      const rejected = await request(app).put("/api/master-broker/network-rates").send({
        rates: { [second.id]: { apertura: 3, renovacion: 0.5 } },
      });
      expect(rejected.status).toBe(400);

      const accepted = await request(app).put("/api/master-broker/network-rates").send({
        rates: {
          [first.id]: { apertura: 3, renovacion: 1 },
          [second.id]: { apertura: 1.5, renovacion: 0.5 },
        },
      });
      expect(accepted.status).toBe(200);
      const after = await request(app).get("/api/master-broker/network-rates");
      expect(after.body.rates[first.id].apertura).toBe(3);
      expect(after.body.rates[second.id].apertura).toBe(1.5);
      expect(after.body.rates[second.id].sobretasa).toBe(0);
      // Updating only one product must not erase the other product's assignment.
      const partial = await request(app).put("/api/master-broker/network-rates").send({
        rates: { [second.id]: { apertura: 1, renovacion: 0.25 } },
      });
      expect(partial.status).toBe(200);
      const preserved = await request(app).get("/api/master-broker/network-rates");
      expect(preserved.body.rates[first.id].apertura).toBe(3);
      expect(preserved.body.rates[second.id].apertura).toBe(1);
      expect(preserved.body.rates[second.id].renovacion).toBe(0.25);
    });
  });

  describe("5. RBAC y Seguridad (Regla 6)", () => {
    it("Master Broker no puede modificar configuración comercial global (403)", async () => {
      const master = await createTestUser("master_broker", "Master Unauthorized");
      currentAuthUser = master;

      const res = await request(app)
        .put("/api/admin/commercial-config")
        .send({ initialOpportunityHoldDays: 45 });

      expect(res.status).toBe(403);
    });

    it("Broker estándar no puede modificar comisiones de red de Master Broker (403)", async () => {
      const broker = await createTestUser("broker", "Broker Unauthorized");
      currentAuthUser = broker;

      const res = await request(app)
        .put("/api/master-broker/network-rates")
        .send({ rates: { "fin-1": { apertura: 1.0 } } });

      expect(res.status).toBe(403);
    });
  });
});
