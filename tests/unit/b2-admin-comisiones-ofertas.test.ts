import type { Server } from "node:http";
import express from "express";
// @ts-ignore
import request from "supertest";
import cron from "node-cron";
import { storage } from "../../server/storage";
import { registerRoutes } from "../../server/routes";

describe("Bloque B2.2 — Comisiones Individuales por Oferta Comercial (Super Admin)", () => {
  let app: express.Express;
  let server: Server;

  const testSuperAdminId = "user-super-admin-b22";
  const testMasterBrokerId = "user-master-broker-b22";
  const testBrokerId = "user-broker-b22";
  const institutionId = "fin-b22-test-" + Date.now();

  let draftProductId1: string;
  let draftProductId2: string;
  let publishedProductId: string;

  beforeAll(async () => {
    // 1. Crear institución financiera con comisiones base globales
    await storage.createFinancialInstitution({
      id: institutionId,
      name: "Financiera B2.2 Capital",
      email: "capital@b22-test.com",
      isActive: true,
      commissionRates: {
        financiera: { apertura: 5.0 },
        masterBroker: { apertura: 3.5 },
        broker: { apertura: 2.0 },
      },
    } as any);

    // 2. Crear usuarios de prueba con distintos roles RBAC
    await storage.upsertUser({
      id: testSuperAdminId,
      email: "superadmin-b22@creditonegocios.com",
      role: "super_admin",
      isActive: true,
    } as any);

    await storage.upsertUser({
      id: testMasterBrokerId,
      email: "masterbroker-b22@creditonegocios.com",
      role: "master_broker",
      isActive: true,
    } as any);

    await storage.upsertUser({
      id: testBrokerId,
      email: "broker-b22@creditonegocios.com",
      role: "broker",
      isActive: true,
    } as any);

    // 3. Crear Oferta 1 en borrador
    const draftRes1 = await storage.createOffer(
      {
        institutionId,
        name: "Oferta A — Crédito PyME Flexible",
        productType: "credito_simple",
        description: "Oferta con esquema de comisión particular A",
        targetProfiles: ["persona_moral"],
        configuration: {
          minAmount: 100000,
          maxAmount: 1000000,
        },
        status: "draft",
        isActive: true,
      },
      {
        versionNumber: 1,
        status: "draft",
        conditions: { minAmount: 100000, maxAmount: 1000000 },
        requirements: { targetProfiles: ["persona_moral"] },
        changeReason: "Borrador inicial Oferta A",
        createdBy: testSuperAdminId,
      }
    );
    draftProductId1 = draftRes1.offer.id;

    // 4. Crear Oferta 2 en borrador (para verificar independencia)
    const draftRes2 = await storage.createOffer(
      {
        institutionId,
        name: "Oferta B — Crédito Maquinaria",
        productType: "arrendamiento",
        description: "Oferta con esquema de comisión particular B",
        targetProfiles: ["fisica_empresarial"],
        configuration: {
          minAmount: 500000,
          maxAmount: 3000000,
        },
        status: "draft",
        isActive: true,
      },
      {
        versionNumber: 1,
        status: "draft",
        conditions: { minAmount: 500000, maxAmount: 3000000 },
        requirements: { targetProfiles: ["fisica_empresarial"] },
        changeReason: "Borrador inicial Oferta B",
        createdBy: testSuperAdminId,
      }
    );
    draftProductId2 = draftRes2.offer.id;

    // 5. Crear Oferta Publicada (Inmutable)
    const pubRes = await storage.createOffer(
      {
        institutionId,
        name: "Oferta Publicada Inmutable C",
        productType: "credito_simple",
        description: "Oferta con contrato legal publicado",
        targetProfiles: ["persona_moral"],
        configuration: {
          minAmount: 1000000,
          maxAmount: 5000000,
          minInterestRate: 15.0,
          maxInterestRate: 20.0,
          minTermMonths: 12,
          maxTermMonths: 36,
          commissionRates: {
            financiera: { apertura: 5.0 },
            masterBroker: { apertura: 3.5 },
            broker: { apertura: 2.0 },
            platformNet: { apertura: 1.5 },
            notes: "Condición confidencial de plataforma",
          },
        },
        status: "draft",
        isActive: true,
      },
      {
        versionNumber: 1,
        status: "draft",
        conditions: {
          minAmount: 1000000,
          maxAmount: 5000000,
          minInterestRate: 15.0,
          maxInterestRate: 20.0,
          minTermMonths: 12,
          maxTermMonths: 36,
          commissionRates: {
            financiera: { apertura: 5.0 },
            masterBroker: { apertura: 3.5 },
            broker: { apertura: 2.0 },
            platformNet: { apertura: 1.5 },
            notes: "Condición confidencial de plataforma",
          },
        },
        requirements: { targetProfiles: ["persona_moral"] },
        requiredDocuments: ["RFC", "CSF"],
        changeReason: "Versión base para publicación",
        createdBy: testSuperAdminId,
      }
    );
    publishedProductId = pubRes.offer.id;
    await storage.publishInstitutionProductVersion(publishedProductId, pubRes.version.id, {
      publishedBy: testSuperAdminId,
      changeReason: "Publicación formal auditada",
    });

    // 6. Configurar Express con mock auth
    app = express();
    app.use(express.json());
    app.use(async (req: any, _res: any, next: any) => {
      req.login = (_claims: any, cb: any) => cb(null);
      req.session = {
        save: (cb: any) => cb(null),
        regenerate: (cb: any) => cb(null),
      };
      const testUserId = req.headers?.["x-test-user-id"];
      const user = testUserId ? await storage.getUser(testUserId) : null;
      if (user) {
        req.isAuthenticated = () => true;
        req.user = user;
        req.user.claims = { sub: user.id };
        req.dbUser = user;
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
  });

  describe("Requisito 1 & 4: Comisiones individuales por oferta y guardado atómico", () => {
    it("PUT /api/institution-products/:id/draft: Guarda comisiones individuales y actualiza versión y producto padre atómicamente", async () => {
      const payload = {
        name: "Oferta A — PyME Prime con Comisiones Individuales",
        commissionRates: {
          financiera: { apertura: 4.5 },
          masterBroker: { apertura: 3.0 },
          broker: { apertura: 2.0 },
          notes: "Acuerdo de comisiones exclusivo para Oferta A",
        },
        changeReason: "Definición de comisiones individuales por oferta",
      };

      const res = await request(app)
        .put(`/api/institution-products/${draftProductId1}/draft`)
        .set("x-test-user-id", testSuperAdminId)
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.version).toBeDefined();
      expect(res.body.product).toBeDefined();

      // Verificar condiciones en la versión borrador
      const conditions = res.body.version.conditions;
      expect(conditions.commissionRates).toBeDefined();
      expect(conditions.commissionRates.financiera.apertura).toBe(4.5);
      expect(conditions.commissionRates.masterBroker.apertura).toBe(3.0);
      expect(conditions.commissionRates.broker.apertura).toBe(2.0);
      // Márgenes brutos de plataforma por canal independiente (sin fórmula de max)
      expect(conditions.commissionRates.platformGrossMarginDirect).toBe(2.5); // 4.5 - 2.0 = 2.5
      expect(conditions.commissionRates.platformGrossMarginMaster).toBe(1.5); // 4.5 - 3.0 = 1.5
      expect(conditions.commissionRates.channels.directBroker.platformGrossMargin).toBe(2.5);
      expect(conditions.commissionRates.channels.masterBroker.platformGrossMargin).toBe(1.5);
      expect(conditions.commissionRates.platformNet.direct).toBe(2.5);
      expect(conditions.commissionRates.platformNet.master).toBe(1.5);
      expect(conditions.commissionRates.notes).toBe("Acuerdo de comisiones exclusivo para Oferta A");

      // Verificar sincronización atómica en el producto padre
      expect(res.body.product.name).toBe("Oferta A — PyME Prime con Comisiones Individuales");
      expect(res.body.product.configuration.commissionRates).toBeDefined();
      expect(res.body.product.configuration.commissionRates.financiera.apertura).toBe(4.5);
      expect(res.body.product.configuration.commissionRates.broker.apertura).toBe(2.0);

      // Hash de versión recalculado
      expect(res.body.version.versionHash).toBeDefined();
      expect(res.body.version.changeReason).toBe("Definición de comisiones individuales por oferta");
    });

    it("Independencia: Oferta B no hereda las comisiones de Oferta A ni sobreescribe las suyas", async () => {
      // Oferta B se guarda con su propio esquema distinto
      const payloadB = {
        name: "Oferta B — Maquinaria Pesada",
        commissionRates: {
          financiera: { apertura: 3.0 },
          masterBroker: { apertura: 2.0 },
          broker: { apertura: 1.5 },
          notes: "Comisiones reducidas para maquinaria",
        },
        changeReason: "Comisiones de Oferta B",
      };

      const resB = await request(app)
        .put(`/api/institution-products/${draftProductId2}/draft`)
        .set("x-test-user-id", testSuperAdminId)
        .send(payloadB);

      expect(resB.status).toBe(200);
      expect(resB.body.version.conditions.commissionRates.financiera.apertura).toBe(3.0);
      expect(resB.body.version.conditions.commissionRates.masterBroker.apertura).toBe(2.0);
      expect(resB.body.version.conditions.commissionRates.broker.apertura).toBe(1.5);
      expect(resB.body.version.conditions.commissionRates.platformGrossMarginDirect).toBe(1.5); // 3.0 - 1.5 = 1.5
      expect(resB.body.version.conditions.commissionRates.platformGrossMarginMaster).toBe(1.0); // 3.0 - 2.0 = 1.0

      // Verificar que Oferta A sigue intacta con sus comisiones (4.5 / 3.0 / 2.0)
      const resA = await request(app)
        .get(`/api/institution-products/${draftProductId1}/draft`)
        .set("x-test-user-id", testSuperAdminId);

      expect(resA.status).toBe(200);
      expect(resA.body.draftVersion.conditions.commissionRates.financiera.apertura).toBe(4.5);
      expect(resA.body.draftVersion.conditions.commissionRates.broker.apertura).toBe(2.0);
    });
  });

  describe("Requisito 2: Inmutabilidad estricta y control de versiones", () => {
    it("Rechaza modificar comisiones en ofertas publicadas o históricas (Inmutabilidad A1)", async () => {
      const res = await request(app)
        .put(`/api/institution-products/${publishedProductId}/draft`)
        .set("x-test-user-id", testSuperAdminId)
        .send({
          commissionRates: {
            financiera: { apertura: 6.0 },
          },
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain("No se encontró una versión en borrador editable");
    });
  });

  describe("Requisito 1 & 4: Validación de Coherencia Económica y Borradores Incompletos", () => {
    it("Rechaza tasas de comisión negativas", async () => {
      const res = await request(app)
        .put(`/api/institution-products/${draftProductId1}/draft`)
        .set("x-test-user-id", testSuperAdminId)
        .send({
          commissionRates: {
            financiera: { apertura: -1 },
          },
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain("Inconsistencia en los datos capturados");
      expect(res.body.errors.some((e: string) => e.includes("mayor o igual a 0"))).toBe(true);
    });

    it("Rechaza si la tasa para Master Broker supera la comisión pagada por la financiera", async () => {
      const res = await request(app)
        .put(`/api/institution-products/${draftProductId1}/draft`)
        .set("x-test-user-id", testSuperAdminId)
        .send({
          commissionRates: {
            financiera: { apertura: 3.0 },
            masterBroker: { apertura: 4.0 },
          },
        });

      expect(res.status).toBe(400);
      expect(res.body.errors.some((e: string) => e.includes("no puede ser superior a la comisión que paga la financiera"))).toBe(true);
    });

    it("Permite que la tasa para Broker Directo sea distinta o superior a la del Master Broker si ambas respetan la comisión de la financiera", async () => {
      const res = await request(app)
        .put(`/api/institution-products/${draftProductId1}/draft`)
        .set("x-test-user-id", testSuperAdminId)
        .send({
          commissionRates: {
            financiera: { apertura: 4.0 },
            masterBroker: { apertura: 2.5 },
            broker: { apertura: 3.0 },
          },
        });

      expect(res.status).toBe(200);
      const rates = res.body.version.conditions.commissionRates;
      expect(rates.broker.apertura).toBe(3.0);
      expect(rates.masterBroker.apertura).toBe(2.5);
      expect(rates.platformGrossMarginDirect).toBe(1.0); // 4.0 - 3.0 = 1.0
      expect(rates.platformGrossMarginMaster).toBe(1.5); // 4.0 - 2.5 = 1.5
    });

    it("Rechaza si la tasa para Broker Directo supera la comisión pagada por la financiera", async () => {
      const res = await request(app)
        .put(`/api/institution-products/${draftProductId1}/draft`)
        .set("x-test-user-id", testSuperAdminId)
        .send({
          commissionRates: {
            financiera: { apertura: 4.0 },
            broker: { apertura: 4.5 },
          },
        });

      expect(res.status).toBe(400);
      expect(res.body.errors.some((e: string) => e.includes("no puede ser superior a la comisión que paga la financiera"))).toBe(true);
    });

    it("Permite guardar borradores incompletos sin comisiones definidas", async () => {
      const res = await request(app)
        .put(`/api/institution-products/${draftProductId1}/draft`)
        .set("x-test-user-id", testSuperAdminId)
        .send({
          minAmount: 200000,
          maxAmount: 800000,
          changeReason: "Actualización sin alterar comisiones",
        });

      expect(res.status).toBe(200);
      expect(res.body.version.conditions.minAmount).toBe(200000);
    });
  });

  describe("Requisito 3: Preservación de RBAC en Comisiones por Oferta", () => {
    it("Bloquea a Brokers para editar el borrador (403 Forbidden)", async () => {
      const res = await request(app)
        .put(`/api/institution-products/${draftProductId1}/draft`)
        .set("x-test-user-id", testBrokerId)
        .send({
          name: "Intento no autorizado de edición por broker",
        });

      expect(res.status).toBe(403);
    });

    it("Bloquea a usuarios anónimos (401 Unauthorized)", async () => {
      const res = await request(app)
        .put(`/api/institution-products/${draftProductId1}/draft`)
        .send({
          name: "Intento anónimo",
        });

      expect(res.status).toBe(401);
    });

    it("Super Admin ve las comisiones internas completas al consultar la oferta", async () => {
      const res = await request(app)
        .get(`/api/institution-products/${draftProductId1}`)
        .set("x-test-user-id", testSuperAdminId);

      expect(res.status).toBe(200);
      const rates = res.body.configuration?.commissionRates;
      expect(rates).toBeDefined();
      expect(rates.financiera).toBeDefined();
      expect(rates.masterBroker).toBeDefined();
      expect(rates.broker).toBeDefined();
    });

    it("Sanitización RBAC: Si una oferta publicada tiene comisiones, Master Broker solo ve tiers MB y Broker (nunca financiera ni plataforma)", async () => {
      // Master Broker consulta la oferta publicada
      const resMB = await request(app)
        .get(`/api/institution-products/${publishedProductId}`)
        .set("x-test-user-id", testMasterBrokerId);

      expect(resMB.status).toBe(200);
      const mbRates = resMB.body.configuration?.commissionRates;
      expect(mbRates).toBeDefined();
      expect(mbRates.masterBroker).toBeDefined();
      expect(mbRates.broker).toBeDefined();
      expect(mbRates.financiera).toBeUndefined(); // CONFIDENCIAL: Nunca expuesta a Master Broker
      expect(mbRates.platformNet).toBeUndefined(); // CONFIDENCIAL: Nunca expuesta a Master Broker
      expect(mbRates.notes).toBeUndefined(); // CONFIDENCIAL: Notas internas ocultas
    });

    it("Sanitización RBAC: Broker directo solo ve el tier broker autorizado", async () => {
      const resBroker = await request(app)
        .get(`/api/institution-products/${publishedProductId}`)
        .set("x-test-user-id", testBrokerId);

      expect(resBroker.status).toBe(200);
      const brkRates = resBroker.body.configuration?.commissionRates;
      expect(brkRates).toBeDefined();
      expect(brkRates.broker).toBeDefined();
      expect(brkRates.broker.apertura).toBe(2.0);
      expect(brkRates.masterBroker).toBeUndefined(); // CONFIDENCIAL: Oculto para broker directo
      expect(brkRates.financiera).toBeUndefined(); // CONFIDENCIAL: Oculto para broker directo
      expect(brkRates.platformNet).toBeUndefined(); // CONFIDENCIAL: Oculto para broker directo
    });
  });

  describe("Requisito 5: Variables de elegibilidad respaldadas y nunca activas en Matching", () => {
    it("Las variables de elegibilidad se guardan marcadas con matchingActive: false y respaldadas en expediente", async () => {
      const payload = {
        minCompanyAgeMonths: 24,
        minMonthlyRevenue: 300000,
        bureauRequirement: "al_corriente",
        guaranteeType: "hipotecaria",
        avalesType: "un_aval",
        changeReason: "Definición de variables de elegibilidad respaldadas",
      };

      const res = await request(app)
        .put(`/api/institution-products/${draftProductId1}/draft`)
        .set("x-test-user-id", testSuperAdminId)
        .send(payload);

      expect(res.status).toBe(200);
      const cond = res.body.version.conditions;
      expect(cond.minCompanyAgeMonths).toBe(24);
      expect(cond.minMonthlyRevenue).toBe(300000);
      expect(cond.bureauRequirement).toBe("al_corriente");
      expect(cond.guaranteeType).toBe("hipotecaria");
      expect(cond.avalesType).toBe("un_aval");

      // Garantía de Integridad: Matching inactivo preventivo y sin afirmar cotejo previo
      expect(cond.eligibilityEvaluation).toBeDefined();
      expect(cond.eligibilityEvaluation.matchingActive).toBe(false);
      expect(cond.eligibilityEvaluation.status).toBe("pending_verification");
      expect(cond.eligibilityEvaluation.verified).toBe(false);
      expect(cond.eligibilityEvaluation.originFieldsChecked).toBe(false);
    });
  });
});
