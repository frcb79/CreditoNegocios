import type { Server } from "node:http";
import express from "express";
// @ts-ignore
import request from "supertest";
import cron from "node-cron";
import { storage } from "../../server/storage";
import { registerRoutes } from "../../server/routes";

describe("Bloque B2.1 — Editor de Ofertas Comerciales en Borrador (Super Admin)", () => {
  let app: express.Express;
  let server: Server;

  const testSuperAdminId = "user-super-admin-b2";
  const testBrokerId = "user-broker-b2";
  const institutionId = "fin-b2-test-" + Date.now();

  let draftProductId: string;
  let publishedProductId: string;

  beforeAll(async () => {
    // 1. Crear institución de prueba
    await storage.createFinancialInstitution({
      id: institutionId,
      name: "Banco B2 Crédito Empresarial",
      email: "contacto@b2-empresarial.com",
      isActive: true,
    } as any);

    // 2. Crear usuarios de prueba
    await storage.upsertUser({
      id: testSuperAdminId,
      email: "superadmin-b2@creditonegocios.com",
      role: "super_admin",
      isActive: true,
    } as any);

    await storage.upsertUser({
      id: testBrokerId,
      email: "broker-b2@creditonegocios.com",
      role: "broker",
      isActive: true,
    } as any);

    // 3. Crear oferta en borrador (v1)
    const draftRes = await storage.createOffer(
      {
        institutionId,
        name: "Oferta Inicial en Borrador B2",
        productType: "credito_simple",
        description: "Descripción preliminar",
        targetProfiles: ["persona_moral"],
        configuration: {
          minAmount: 500000,
          maxAmount: 2000000,
        },
        status: "draft",
        isActive: true,
      },
      {
        versionNumber: 1,
        status: "draft",
        conditions: { minAmount: 500000, maxAmount: 2000000 },
        requirements: { targetProfiles: ["persona_moral"] },
        changeReason: "Borrador v1 de partida",
        createdBy: testSuperAdminId,
      }
    );
    draftProductId = draftRes.offer.id;

    // 4. Crear oferta con versión publicada (inmutable)
    const pubRes = await storage.createOffer(
      {
        institutionId,
        name: "Oferta Publicada Inmutable B2",
        productType: "credito_simple",
        description: "Oferta con contrato legal publicado",
        targetProfiles: ["persona_moral", "fisica_empresarial"],
        configuration: {
          minAmount: 1000000,
          maxAmount: 5000000,
          minInterestRate: 18.0,
          maxInterestRate: 25.0,
          minTermMonths: 12,
          maxTermMonths: 36,
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
          minInterestRate: 18.0,
          maxInterestRate: 25.0,
          minTermMonths: 12,
          maxTermMonths: 36,
        },
        requirements: { targetProfiles: ["persona_moral", "fisica_empresarial"] },
        requiredDocuments: ["Constancia de Situación Fiscal"],
        changeReason: "Versión base para publicación",
        createdBy: testSuperAdminId,
      }
    );
    publishedProductId = pubRes.offer.id;
    // Publicar la versión 1 de esta segunda oferta
    await storage.publishInstitutionProductVersion(publishedProductId, pubRes.version.id, {
      publishedBy: testSuperAdminId,
      changeReason: "Publicación formal auditada",
    });

    // 5. Configurar Express con mock auth
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

  describe("Requisito 1 & 2: Editor Modular y Persistencia en Arquitectura A1", () => {
    it("GET /api/institution-products/:id/draft: Super Admin obtiene la oferta y su versión borrador", async () => {
      const res = await request(app)
        .get(`/api/institution-products/${draftProductId}/draft`)
        .set("x-test-user-id", testSuperAdminId);

      expect(res.status).toBe(200);
      expect(res.body.product).toBeDefined();
      expect(res.body.product.id).toBe(draftProductId);
      expect(res.body.draftVersion).toBeDefined();
      expect(res.body.draftVersion.status).toBe("draft");
      expect(res.body.draftVersion.versionNumber).toBe(1);
    });

    it("PUT /api/institution-products/:id/draft: Guarda montos, tasas, plazos, perfiles, elegibilidad y documentos en la versión borrador", async () => {
      const payload = {
        name: "Crédito PyME Prime Actualizado B2",
        description: "Condiciones actualizadas por Super Admin",
        productType: "credito_simple",
        targetProfiles: ["persona_moral", "fisica_empresarial"],
        minAmount: 300000,
        maxAmount: 15000000,
        minInterestRate: 15.5,
        maxInterestRate: 23.0,
        minTermMonths: 6,
        maxTermMonths: 48,
        conditions: {
          minCompanyAgeMonths: 24,
          minMonthlyRevenue: 250000,
          bureauRequirement: "al_corriente",
          guaranteeType: "sin_garantia",
          avalesType: "un_aval",
        },
        requiredDocuments: [
          "Constancia de Situación Fiscal (CSF actualizada)",
          "Estados de Cuenta Bancarios (últimos 3 meses)",
          "Identificación Oficial del Solicitante / Representante Legal",
        ],
        changeReason: "Actualización de condiciones de pre-calificación B2.1",
      };

      const res = await request(app)
        .put(`/api/institution-products/${draftProductId}/draft`)
        .set("x-test-user-id", testSuperAdminId)
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.version).toBeDefined();
      expect(res.body.version.status).toBe("draft");

      // Validar condiciones guardadas en la versión
      const cond = res.body.version.conditions;
      expect(cond.minAmount).toBe(300000);
      expect(cond.maxAmount).toBe(15000000);
      expect(cond.minInterestRate).toBe(15.5);
      expect(cond.maxInterestRate).toBe(23.0);
      expect(cond.minTermMonths).toBe(6);
      expect(cond.maxTermMonths).toBe(48);
      expect(cond.minCompanyAgeMonths).toBe(24);
      expect(cond.minMonthlyRevenue).toBe(250000);

      // Validar perfiles y documentos
      expect(res.body.version.requirements.targetProfiles).toEqual(
        expect.arrayContaining(["persona_moral", "fisica_empresarial"])
      );
      expect(res.body.version.requiredDocuments).toHaveLength(3);

      // Validar inmutabilidad: el hash de la versión fue recalculado
      expect(res.body.version.versionHash).toBeDefined();
      expect(typeof res.body.version.versionHash).toBe("string");

      // Validar sincronización con el producto padre
      expect(res.body.product.name).toBe("Crédito PyME Prime Actualizado B2");
      expect(res.body.product.configuration.minAmount).toBe(300000);
    });

    it("Arquitectura A1: NUNCA permite alterar ofertas o versiones publicadas", async () => {
      // Intentar editar la oferta que tiene versión publicada
      const res = await request(app)
        .put(`/api/institution-products/${publishedProductId}/draft`)
        .set("x-test-user-id", testSuperAdminId)
        .send({
          name: "Intento de Modificación Ilegal",
          minAmount: 10000,
        });

      // Debe rechazar con 400 (no hay borrador editable para una versión publicada)
      expect(res.status).toBe(400);
      expect(res.body.message).toContain("No se encontró una versión en borrador editable");
    });
  });

  describe("Requisito 3 & 4: Borradores Incompletos y Validación de Coherencia", () => {
    it("Permite guardar borradores incompletos sin obligar a capturar todos los campos", async () => {
      const payloadIncompleto = {
        name: "Oferta Incompleta Permitida",
        // Solo captura monto mínimo, sin monto máximo ni tasas ni plazos
        minAmount: 500000,
        targetProfiles: [], // Sin perfiles seleccionados
        requiredDocuments: [], // Sin documentos seleccionados
        changeReason: "Borrador preliminar incompleto",
      };

      const res = await request(app)
        .put(`/api/institution-products/${draftProductId}/draft`)
        .set("x-test-user-id", testSuperAdminId)
        .send(payloadIncompleto);

      expect(res.status).toBe(200);
      expect(res.body.version.conditions.minAmount).toBe(500000);
      expect(res.body.version.requirements.targetProfiles).toEqual([]);
      expect(res.body.version.requiredDocuments).toEqual([]);
    });

    it("Rechaza inconsistencias matemáticas cuando se capturan ambos valores (min > max)", async () => {
      // Monto mínimo mayor que monto máximo
      const resMonto = await request(app)
        .put(`/api/institution-products/${draftProductId}/draft`)
        .set("x-test-user-id", testSuperAdminId)
        .send({
          minAmount: 5000000,
          maxAmount: 1000000, // Menor que minAmount
        });

      expect(resMonto.status).toBe(400);
      expect(resMonto.body.message).toContain("Inconsistencia en los datos capturados");

      // Plazo mínimo mayor que plazo máximo
      const resPlazo = await request(app)
        .put(`/api/institution-products/${draftProductId}/draft`)
        .set("x-test-user-id", testSuperAdminId)
        .send({
          minTermMonths: 48,
          maxTermMonths: 12,
        });

      expect(resPlazo.status).toBe(400);
      expect(resPlazo.body.message).toContain("Inconsistencia en los datos capturados");

      // Tasa mínima mayor que tasa máxima
      const resTasa = await request(app)
        .put(`/api/institution-products/${draftProductId}/draft`)
        .set("x-test-user-id", testSuperAdminId)
        .send({
          minInterestRate: 35.0,
          maxInterestRate: 15.0,
        });

      expect(resTasa.status).toBe(400);
      expect(resTasa.body.message).toContain("Inconsistencia en los datos capturados");
    });
  });

  describe("Seguridad RBAC: Exclusivo Super Admin", () => {
    it("Rechaza a Broker con 403 al intentar acceder o editar borradores", async () => {
      // 1. GET draft como Broker -> 403
      const resGetBroker = await request(app)
        .get(`/api/institution-products/${draftProductId}/draft`)
        .set("x-test-user-id", testBrokerId);
      expect(resGetBroker.status).toBe(403);

      // 2. PUT draft como Broker -> 403
      const resPutBroker = await request(app)
        .put(`/api/institution-products/${draftProductId}/draft`)
        .set("x-test-user-id", testBrokerId)
        .send({ minAmount: 100000 });
      expect(resPutBroker.status).toBe(403);
    });
  });
});
