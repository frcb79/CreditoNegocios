import type { Server } from "node:http";
import express from "express";
// @ts-ignore
import request from "supertest";
import cron from "node-cron";
import { storage } from "../../server/storage";
import { registerRoutes } from "../../server/routes";

describe("Bloque B3 — Publicación y Vigencia de Ofertas Comerciales (Super Admin)", () => {
  let app: express.Express;
  let server: Server;

  const testSuperAdminId = "user-super-admin-b3";
  const testAdminId = "user-admin-b3";
  const testMasterBrokerId = "user-master-broker-b3";
  const testBrokerId = "user-broker-b3";
  const institutionId = "fin-b3-test-" + Date.now();

  let offerId1: string; // Oferta que pasará de borrador a publicada y luego a v2
  let offerId2: string; // Oferta para pruebas de concurrencia
  let offerId3: string; // Oferta con comisiones parciales para probar margen pendiente

  beforeAll(async () => {
    // 1. Crear institución financiera
    await storage.createFinancialInstitution({
      id: institutionId,
      name: "Financiera B3 Horizonte",
      email: "horizonte@b3-test.com",
      isActive: true,
      overrateCommissionRate: "1.5",
      commissionRates: {
        financiera: { total: "5.5", apertura: "4.5", sobretasa: "1.0" },
        masterBroker: { total: "4.0", apertura: "3.5", sobretasa: "0.5" },
        broker: { total: "2.5", apertura: "2.5", sobretasa: "0.0" },
      },
    } as any);

    // 2. Crear usuarios de prueba RBAC
    await storage.upsertUser({
      id: testSuperAdminId,
      email: "superadmin-b3@creditonegocios.com",
      role: "super_admin",
      isActive: true,
    } as any);

    await storage.upsertUser({
      id: testAdminId,
      email: "admin-b3@creditonegocios.com",
      role: "admin",
      isActive: true,
    } as any);

    await storage.upsertUser({
      id: testMasterBrokerId,
      email: "masterbroker-b3@creditonegocios.com",
      role: "master_broker",
      isActive: true,
    } as any);

    await storage.upsertUser({
      id: testBrokerId,
      email: "broker-b3@creditonegocios.com",
      role: "broker",
      isActive: true,
    } as any);

    // 3. Crear Oferta 1 en borrador (con datos completos)
    const resOffer1 = await storage.createOffer(
      {
        institutionId,
        name: "Oferta Horizonte PyME v1",
        productType: "credito_simple",
        description: "Oferta inicial para ciclo de publicación B3",
        targetProfiles: ["persona_moral", "fisica_empresarial"],
        configuration: {
          minAmount: 200000,
          maxAmount: 2000000,
          minInterestRate: 14.5,
          maxInterestRate: 21.0,
          minTermMonths: 12,
          maxTermMonths: 36,
          commissionRates: {
            financiera: { apertura: 4.5, sobretasa: 1.0 },
            masterBroker: { apertura: 3.0, sobretasa: 0.5 },
            broker: { apertura: 2.0, sobretasa: 0.2 },
            channels: {
              directBroker: { brokerRate: 2.0, platformGrossMargin: 2.5 },
              masterBroker: { networkCeiling: 3.0, platformGrossMargin: 1.5 },
            },
            platformGrossMarginDirect: 2.5,
            platformGrossMarginMaster: 1.5,
            platformNet: { direct: 2.5, master: 1.5, apertura: 2.5 },
          },
          eligibilityEvaluation: {
            matchingActive: false,
            status: "pending_verification",
            verified: false,
            originFieldsChecked: false,
          },
        },
        status: "draft",
        isActive: true,
      },
      {
        versionNumber: 1,
        status: "draft",
        conditions: {
          minAmount: 200000,
          maxAmount: 2000000,
          minInterestRate: 14.5,
          maxInterestRate: 21.0,
          minTermMonths: 12,
          maxTermMonths: 36,
          commissionRates: {
            financiera: { apertura: 4.5, sobretasa: 1.0 },
            masterBroker: { apertura: 3.0, sobretasa: 0.5 },
            broker: { apertura: 2.0, sobretasa: 0.2 },
            channels: {
              directBroker: { brokerRate: 2.0, platformGrossMargin: 2.5 },
              masterBroker: { networkCeiling: 3.0, platformGrossMargin: 1.5 },
            },
            platformGrossMarginDirect: 2.5,
            platformGrossMarginMaster: 1.5,
            platformNet: { direct: 2.5, master: 1.5, apertura: 2.5 },
          },
          eligibilityEvaluation: {
            matchingActive: false,
            status: "pending_verification",
            verified: false,
            originFieldsChecked: false,
          },
        },
        requirements: { targetProfiles: ["persona_moral", "fisica_empresarial"] },
        requiredDocuments: ["RFC", "CSF", "estados_cuenta"],
        changeReason: "Versión borrador inicial para pruebas de publicación",
        createdBy: testSuperAdminId,
      }
    );
    offerId1 = resOffer1.offer.id;

    // 4. Crear Oferta 2 para concurrencia
    const resOffer2 = await storage.createOffer(
      {
        institutionId,
        name: "Oferta Concurrencia B3",
        productType: "arrendamiento",
        targetProfiles: ["persona_moral"],
        status: "draft",
        isActive: true,
      },
      {
        versionNumber: 1,
        status: "draft",
        conditions: {
          minAmount: 500000,
          maxAmount: 5000000,
        },
        requirements: { targetProfiles: ["persona_moral"] },
        changeReason: "Borrador para test de concurrencia",
        createdBy: testSuperAdminId,
      }
    );
    offerId2 = resOffer2.offer.id;

    // 5. Crear Oferta 3 con comisiones incompletas (sin comisión de broker)
    const resOffer3 = await storage.createOffer(
      {
        institutionId,
        name: "Oferta Comisiones Faltantes B3",
        productType: "factoraje",
        targetProfiles: ["persona_moral"],
        status: "draft",
        isActive: true,
      },
      {
        versionNumber: 1,
        status: "draft",
        conditions: {
          minAmount: 300000,
          maxAmount: 1500000,
          commissionRates: {
            financiera: { apertura: 4.0 },
            // broker omitido deliberadamente
          },
        },
        requirements: { targetProfiles: ["persona_moral"] },
        changeReason: "Borrador con comisión broker faltante",
        createdBy: testSuperAdminId,
      }
    );
    offerId3 = resOffer3.offer.id;

    // 6. Express setup
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

  describe("Requisito 1: Revisión Previa de Publicación (publish-preview)", () => {
    it("Super Admin obtiene preview completo con resumen, validaciones y advertencias", async () => {
      const res = await request(app)
        .get(`/api/institution-products/${offerId1}/publish-preview`)
        .set("x-test-user-id", testSuperAdminId);

      expect(res.status).toBe(200);
      expect(res.body.draftVersion).toBeDefined();
      expect(res.body.draftVersion.versionNumber).toBe(1);
      expect(res.body.validation).toBeDefined();
      expect(res.body.validation.isValid).toBe(true);

      // Resumen completo
      const summary = res.body.summary;
      expect(summary.amounts.min).toBe(200000);
      expect(summary.amounts.max).toBe(2000000);
      expect(summary.rates.min).toBe(14.5);
      expect(summary.rates.max).toBe(21.0);
      expect(summary.terms.min).toBe(12);
      expect(summary.terms.max).toBe(36);
      expect(summary.targetProfiles).toContain("persona_moral");

      // Comisiones con dos canales independientes
      expect(summary.commissions.financiera).toBe(4.5);
      expect(summary.commissions.brokerDirecto).toBe(2.0);
      expect(summary.commissions.masterBroker).toBe(3.0);
      expect(summary.commissions.platformMarginDirect).toBe(2.5); // 4.5 - 2.0 = 2.5
      expect(summary.commissions.platformMarginMaster).toBe(1.5); // 4.5 - 3.0 = 1.5
      expect(summary.commissions.isMarginDirectPending).toBe(false);
      expect(summary.commissions.isMarginMasterPending).toBe(false);

      // Elegibilidad inactiva en matching
      expect(summary.eligibility.matchingActive).toBe(false);
      expect(summary.eligibility.status).toBe("pending_verification");
    });

    it("Identifica campos no definidos como pendientes sin inventar datos financieros", async () => {
      const res = await request(app)
        .get(`/api/institution-products/${offerId2}/publish-preview`)
        .set("x-test-user-id", testSuperAdminId);

      expect(res.status).toBe(200);
      expect(res.body.summary.rates.isPending).toBe(true);
      expect(res.body.summary.terms.isPending).toBe(true);
      // Advertencias presentes
      expect(res.body.validation.warnings.length).toBeGreaterThan(0);
      expect(res.body.validation.pendingFields).toContain("interestRate");
      expect(res.body.validation.pendingFields).toContain("termMonths");
      // Permite publicar porque montos y perfiles están definidos
      expect(res.body.validation.isValid).toBe(true);
    });

    it("Rechaza acceso a Brokers (403 Forbidden)", async () => {
      const res = await request(app)
        .get(`/api/institution-products/${offerId1}/publish-preview`)
        .set("x-test-user-id", testBrokerId);

      expect(res.status).toBe(403);
    });
  });

  describe("Requisito 2 & 1: Publicación Transaccional A1 e Historial Inmutable", () => {
    it("Rechaza la publicación si confirmPublish no es true", async () => {
      const res = await request(app)
        .post(`/api/institution-products/${offerId1}/publish`)
        .set("x-test-user-id", testSuperAdminId)
        .send({
          changeReason: "Aprobación de comité",
          confirmPublish: false,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain("Debe confirmar explícitamente");
    });

    it("Rechaza la publicación si changeReason está ausente o tiene menos de 3 caracteres", async () => {
      const res = await request(app)
        .post(`/api/institution-products/${offerId1}/publish`)
        .set("x-test-user-id", testSuperAdminId)
        .send({
          changeReason: "ok",
          confirmPublish: true,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain("motivo de cambio es obligatorio");
    });

    it("Publica exitosamente la versión 1 y actualiza la oferta padre a status 'published'", async () => {
      const res = await request(app)
        .post(`/api/institution-products/${offerId1}/publish`)
        .set("x-test-user-id", testSuperAdminId)
        .send({
          changeReason: "Publicación formal v1 aprobada por comité de riesgos",
          confirmPublish: true,
        });

      expect(res.status).toBe(200);
      expect(res.body.publishedVersion).toBeDefined();
      expect(res.body.publishedVersion.status).toBe("published");
      expect(res.body.publishedVersion.versionNumber).toBe(1);
      expect(res.body.publishedVersion.publishedAt).toBeDefined();
      expect(res.body.publishedVersion.publishedBy).toBe(testSuperAdminId);
      expect(res.body.publishedVersion.effectiveFrom).toBeDefined();
      expect(res.body.publishedVersion.effectiveTo).toBeNull();

      // Oferta padre sincronizada
      expect(res.body.product.status).toBe("published");
      expect(res.body.product.currentVersionNumber).toBe(1);
    });

    it("Inmutabilidad: Rechaza volver a publicar la oferta si no tiene un borrador nuevo (ya está publicada)", async () => {
      const res = await request(app)
        .post(`/api/institution-products/${offerId1}/publish`)
        .set("x-test-user-id", testSuperAdminId)
        .send({
          changeReason: "Intento de re-publicación sin borrador",
          confirmPublish: true,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain("No se encontró una versión en borrador");
    });

    it("Aislamiento total v1/v2: Editar la futura v2 en borrador NO altera las condiciones ni comisiones de la v1 vigente", async () => {
      // 1. Crear borrador v2 para oferta 1
      const draftV2 = await storage.createOfferVersion(offerId1, {
        conditions: {
          minAmount: 300000,
          maxAmount: 3000000,
          minInterestRate: 15.0,
          maxInterestRate: 22.0,
          commissionRates: {
            financiera: { apertura: 4.5, sobretasa: 1.0 },
            broker: { apertura: 2.0 },
            masterBroker: { apertura: 3.0, sobretasa: 0.5 },
          },
          eligibilityEvaluation: {
            matchingActive: false,
            status: "pending_verification",
            verified: false,
            originFieldsChecked: false,
          },
        },
        requirements: { targetProfiles: ["persona_moral"] },
        changeReason: "Borrador inicial para versión 2",
        createdBy: testSuperAdminId,
      });

      expect(draftV2.versionNumber).toBe(2);
      expect(draftV2.status).toBe("draft");

      // 2. Modificar el borrador v2 vía PUT con montos y comisiones tentativas distintas
      const editDraftRes = await request(app)
        .put(`/api/institution-products/${offerId1}/draft`)
        .set("x-test-user-id", testSuperAdminId)
        .send({
          minAmount: 888888,
          maxAmount: 8888888,
          commissionRates: {
            financiera: { apertura: 5.5, sobretasa: 1.0 },
            broker: { apertura: 2.5 },
            masterBroker: { apertura: 3.5, sobretasa: 0.5 },
          },
          changeReason: "Edición tentativa de borrador v2",
        });

      expect(editDraftRes.status).toBe(200);
      expect(editDraftRes.body.version.conditions.minAmount).toBe(888888);

      // 3. AISLAMIENTO TOTAL: La oferta comercial publicada vigente sigue mostrando intacta la v1
      const currentPublishedOfferRes = await request(app)
        .get(`/api/institution-products/${offerId1}`)
        .set("x-test-user-id", testSuperAdminId);

      expect(currentPublishedOfferRes.status).toBe(200);
      // Debe conservar las condiciones comerciales de v1 (200000 / 2000000), NUNCA los 888888 de la v2 en borrador
      expect(currentPublishedOfferRes.body.configuration.minAmount).toBe(200000);
      expect(currentPublishedOfferRes.body.configuration.maxAmount).toBe(2000000);
      expect(currentPublishedOfferRes.body.configuration.commissionRates.financiera.apertura).toBe(4.5);
      expect(currentPublishedOfferRes.body.currentVersionNumber).toBe(1);

      // 4. Publicar versión 2 formalmente: Sincronización transaccional al publicar
      const resPub2 = await request(app)
        .post(`/api/institution-products/${offerId1}/publish`)
        .set("x-test-user-id", testSuperAdminId)
        .send({
          changeReason: "Publicación formal de versión 2 tras aprobación definitiva",
          confirmPublish: true,
        });

      expect(resPub2.status).toBe(200);
      expect(resPub2.body.publishedVersion.versionNumber).toBe(2);
      expect(resPub2.body.publishedVersion.status).toBe("published");
      expect(resPub2.body.product.currentVersionNumber).toBe(2);
      // Ahora sí se sincronizó transaccionalmente al producto comercial padre
      expect(resPub2.body.product.configuration.minAmount).toBe(888888);
      expect(resPub2.body.product.configuration.commissionRates.financiera.apertura).toBe(5.5);

      // 5. Verificar que la versión 1 anterior pasó a estado 'superseded' con vigencia cerrada
      const allVersions = await storage.getInstitutionProductVersions(offerId1);
      const v1 = allVersions.find(v => v.versionNumber === 1);
      expect(v1).toBeDefined();
      expect(v1!.status).toBe("superseded");
      expect(v1!.effectiveTo).toBeDefined();
    });
  });

  describe("Requisito 4 & B3.1: Sobretasas Exclusivas de Super Admin (NO admin, Brokers ni Masters)", () => {
    it("Super Admin ve las sobretasas en la consulta de oferta publicada", async () => {
      const res = await request(app)
        .get(`/api/institution-products/${offerId1}`)
        .set("x-test-user-id", testSuperAdminId);

      expect(res.status).toBe(200);
      const config = res.body.configuration;
      expect(config.commissionRates?.financiera?.sobretasa).toBe(1.0);
      expect(config.commissionRates?.masterBroker?.sobretasa).toBe(0.5);
    });

    it("Admin regular NO ve sobretasas al consultar la oferta", async () => {
      const res = await request(app)
        .get(`/api/institution-products/${offerId1}`)
        .set("x-test-user-id", testAdminId);

      expect(res.status).toBe(200);
      const rates = res.body.configuration?.commissionRates;
      expect(rates).toBeDefined();
      // Ve apertura comercial
      expect(rates.financiera?.apertura).toBe(5.5);
      expect(rates.broker?.apertura).toBe(2.5);
      // NUNCA sobretasas
      expect(rates.financiera?.sobretasa).toBeUndefined();
      expect(rates.masterBroker?.sobretasa).toBeUndefined();
      expect(rates.broker?.sobretasa).toBeUndefined();
      expect(res.body.configuration?.overrateCommissionRate).toBeUndefined();
      expect(res.body.configuration?.sobretasa).toBeUndefined();
    });

    it("Master Broker NO ve sobretasas en ninguna estructura al consultar la oferta", async () => {
      const res = await request(app)
        .get(`/api/institution-products/${offerId1}`)
        .set("x-test-user-id", testMasterBrokerId);

      expect(res.status).toBe(200);
      const rates = res.body.configuration?.commissionRates;
      expect(rates).toBeDefined();
      // Solo ve apertura comercial
      expect(rates.masterBroker?.apertura).toBe(3.5);
      // NUNCA sobretasa
      expect(rates.masterBroker?.sobretasa).toBeUndefined();
      expect(rates.broker?.sobretasa).toBeUndefined();
      expect(res.body.configuration?.overrateCommissionRate).toBeUndefined();
    });

    it("Broker directo NO ve sobretasas al consultar la oferta", async () => {
      const res = await request(app)
        .get(`/api/institution-products/${offerId1}`)
        .set("x-test-user-id", testBrokerId);

      expect(res.status).toBe(200);
      const rates = res.body.configuration?.commissionRates;
      expect(rates).toBeDefined();
      expect(rates.broker?.apertura).toBe(2.5);
      expect(rates.broker?.sobretasa).toBeUndefined();
      expect(res.body.configuration?.sobretasa).toBeUndefined();
    });

    it("En GET /api/financial-institutions/:id, la sobretasa es visible para Super Admin y oculta para Admin y Brokers", async () => {
      // Super Admin ve sobretasa
      const resSuper = await request(app)
        .get(`/api/financial-institutions/${institutionId}`)
        .set("x-test-user-id", testSuperAdminId);
      expect(resSuper.status).toBe(200);
      expect(resSuper.body.overrateCommissionRate).toBe("1.5");
      expect(resSuper.body.commissionRates?.financiera?.sobretasa).toBe("1.0");

      // Admin regular NO ve sobretasa
      const resAdmin = await request(app)
        .get(`/api/financial-institutions/${institutionId}`)
        .set("x-test-user-id", testAdminId);
      expect(resAdmin.status).toBe(200);
      expect(resAdmin.body.overrateCommissionRate).toBeUndefined();
      expect(resAdmin.body.overRate).toBeUndefined();
      expect(resAdmin.body.commissionRates?.financiera?.sobretasa).toBeUndefined();

      // Broker NO ve sobretasa
      const resBroker = await request(app)
        .get(`/api/financial-institutions/${institutionId}`)
        .set("x-test-user-id", testBrokerId);
      expect(resBroker.status).toBe(200);
      expect(resBroker.body.overrateCommissionRate).toBeUndefined();
      expect(resBroker.body.overRate).toBeUndefined();
      expect(resBroker.body.commissionRates?.broker?.sobretasa).toBeUndefined();
    });

    it("En cálculo de comisiones, overrateCommission es exclusivo de Super Admin", async () => {
      // Super Admin
      const resSuper = await request(app)
        .get(`/api/financial-institutions/${institutionId}/commission-calculation?amount=1000000`)
        .set("x-test-user-id", testSuperAdminId);
      expect(resSuper.status).toBe(200);
      expect(resSuper.body.overrateCommission).toBeDefined();
      expect(resSuper.body.breakdown?.overrateRate).toBeDefined();

      // Admin regular NO lo ve
      const resAdmin = await request(app)
        .get(`/api/financial-institutions/${institutionId}/commission-calculation?amount=1000000`)
        .set("x-test-user-id", testAdminId);
      expect(resAdmin.status).toBe(200);
      expect(resAdmin.body.overrateCommission).toBeUndefined();
      expect(resAdmin.body.breakdown?.overrateRate).toBeUndefined();

      // Broker NO lo ve
      const resBroker = await request(app)
        .get(`/api/financial-institutions/${institutionId}/commission-calculation?amount=1000000`)
        .set("x-test-user-id", testBrokerId);
      expect(resBroker.status).toBe(200);
      expect(resBroker.body.overrateCommission).toBeUndefined();
      expect(resBroker.body.breakdown?.overrateRate).toBeUndefined();
    });
  });

  describe("Requisito 5 & B3.1: Margen pendiente cuando falta comisión (guardado y visualización)", () => {
    it("En preview y guardado, si falta comisión de broker, el margen directo queda pendiente y no como 4%", async () => {
      // 1. Guardar borrador con comisión de broker faltante
      const editRes = await request(app)
        .put(`/api/institution-products/${offerId3}/draft`)
        .set("x-test-user-id", testSuperAdminId)
        .send({
          commissionRates: {
            financiera: { apertura: 4.0 },
            // broker omitido
          },
          changeReason: "Guardado con comisión faltante para validar margen null",
        });

      expect(editRes.status).toBe(200);
      const savedComm = editRes.body.version.conditions.commissionRates;
      expect(savedComm.financiera.apertura).toBe(4.0);
      expect(savedComm.broker.apertura).toBeNull();
      // Guardado: margen debe ser null y bandera pendiente en true (NUNCA 4.0)
      expect(savedComm.platformGrossMarginDirect).toBeNull();
      expect(savedComm.isMarginDirectPending).toBe(true);

      // 2. Preview de publicación: margen null y advertencia presente
      const res = await request(app)
        .get(`/api/institution-products/${offerId3}/publish-preview`)
        .set("x-test-user-id", testSuperAdminId);

      expect(res.status).toBe(200);
      const comm = res.body.summary.commissions;
      expect(comm.financiera).toBe(4.0);
      expect(comm.brokerDirecto).toBeNull();
      // Margen pendiente, NUNCA 4.0%
      expect(comm.platformMarginDirect).toBeNull();
      expect(comm.isMarginDirectPending).toBe(true);
      expect(res.body.validation.warnings.some((w: string) => w.includes("nunca asumidos al 100%"))).toBe(true);
    });
  });

  describe("Requisito 6: Variables de elegibilidad fuera de Matching", () => {
    it("La versión publicada conserva matchingActive: false", async () => {
      const versions = await storage.getInstitutionProductVersions(offerId1);
      const published = versions.find(v => v.status === "published");
      expect(published).toBeDefined();
      const cond = published!.conditions as Record<string, any>;
      if (cond.eligibilityEvaluation) {
        expect(cond.eligibilityEvaluation.matchingActive).toBe(false);
        expect(cond.eligibilityEvaluation.status).toBe("pending_verification");
      }
    });
  });

  describe("Control de concurrencia y seguridad de publicación", () => {
    it("Dos publicaciones concurrentes sobre el mismo borrador: solo una tiene éxito", async () => {
      const req1 = request(app)
        .post(`/api/institution-products/${offerId2}/publish`)
        .set("x-test-user-id", testSuperAdminId)
        .send({ changeReason: "Publicación concurrente A", confirmPublish: true });

      const req2 = request(app)
        .post(`/api/institution-products/${offerId2}/publish`)
        .set("x-test-user-id", testSuperAdminId)
        .send({ changeReason: "Publicación concurrente B", confirmPublish: true });

      const [res1, res2] = await Promise.all([req1, req2]);

      const statuses = [res1.status, res2.status].sort();
      // Uno debe ser 200 y el otro 400
      expect(statuses).toEqual([200, 400]);
    });

    it("Bloquea a usuarios anónimos al intentar publicar (401 Unauthorized)", async () => {
      const res = await request(app)
        .post(`/api/institution-products/${offerId2}/publish`)
        .send({ changeReason: "Intento anónimo", confirmPublish: true });

      expect(res.status).toBe(401);
    });

    it("Bloquea a Brokers al intentar publicar (403 Forbidden)", async () => {
      const res = await request(app)
        .post(`/api/institution-products/${offerId2}/publish`)
        .set("x-test-user-id", testBrokerId)
        .send({ changeReason: "Intento de broker", confirmPublish: true });

      expect(res.status).toBe(403);
    });
  });
});
