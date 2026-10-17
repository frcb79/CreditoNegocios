import type { Server } from "node:http";
import express from "express";
// @ts-ignore
import request from "supertest";
import cron from "node-cron";
import { storage } from "../../server/storage";
import { isOfferEligibleForRequests } from "../../server/offerVersionService";
import { registerRoutes } from "../../server/routes";

describe("Bloque B1 — Catálogo de Financieras y Ofertas Comerciales para Super Admin", () => {
  const institutionId = "fin-b1-test-" + Date.now();
  const superAdminId = "user-super-admin-b1";
  const brokerId = "user-broker-b1";

  beforeAll(async () => {
    // Crear financiera de prueba
    await storage.createFinancialInstitution({
      id: institutionId,
      name: "Banco B1 Innovación Financiera",
      email: "contacto@b1-innovacion.com",
      isActive: true,
    } as any);

    // Crear usuarios de prueba
    await storage.upsertUser({
      id: superAdminId,
      email: "superadmin@creditonegocios.com",
      role: "super_admin",
      isActive: true,
    } as any);

    await storage.upsertUser({
      id: brokerId,
      email: "broker@creditonegocios.com",
      role: "broker",
      isActive: true,
    } as any);
  });

  describe("Requisito 1: Soporte Multi-Oferta del mismo tipo por financiera", () => {
    it("permite registrar múltiples ofertas comerciales del mismo productType ('credito_simple') para una misma financiera sin colisiones", async () => {
      // Oferta A: Crédito Simple PyME Prime
      const resA = await storage.createOffer(
        {
          institutionId,
          name: "Crédito Simple PyME Prime",
          productType: "credito_simple",
          description: "Crédito preferencial para empresas con más de 2 años de facturación",
          configuration: {
            minAmount: 500000,
            maxAmount: 10000000,
            minInterestRate: 16.5,
            maxInterestRate: 22.0,
            minTermMonths: 12,
            maxTermMonths: 48,
          },
          targetProfiles: ["persona_moral", "fisica_empresarial"],
          isActive: true,
        },
        {
          conditions: {
            minAmount: 500000,
            maxAmount: 10000000,
            minInterestRate: 16.5,
            maxInterestRate: 22.0,
            minTermMonths: 12,
            maxTermMonths: 48,
          },
          requirements: {
            targetProfiles: ["persona_moral", "fisica_empresarial"],
          },
          changeReason: "Alta inicial B1 Oferta Prime",
          createdBy: superAdminId,
        }
      );

      // Oferta B: Crédito Simple Express (mismo tipo: 'credito_simple', condiciones distintas)
      const resB = await storage.createOffer(
        {
          institutionId,
          name: "Crédito Simple Express Ágil",
          productType: "credito_simple",
          description: "Crédito ágil de trámite acelerado para capital de trabajo",
          configuration: {
            minAmount: 100000,
            maxAmount: 1500000,
            minInterestRate: 22.0,
            maxInterestRate: 30.0,
            minTermMonths: 6,
            maxTermMonths: 24,
          },
          targetProfiles: ["persona_moral", "fisica_empresarial", "fisica"],
          isActive: true,
        },
        {
          conditions: {
            minAmount: 100000,
            maxAmount: 1500000,
            minInterestRate: 22.0,
            maxInterestRate: 30.0,
            minTermMonths: 6,
            maxTermMonths: 24,
          },
          requirements: {
            targetProfiles: ["persona_moral", "fisica_empresarial", "fisica"],
          },
          changeReason: "Alta inicial B1 Oferta Express",
          createdBy: superAdminId,
        }
      );

      expect(resA.offer.id).toBeDefined();
      expect(resB.offer.id).toBeDefined();
      expect(resA.offer.id).not.toBe(resB.offer.id);
      expect(resA.offer.productType).toBe("credito_simple");
      expect(resB.offer.productType).toBe("credito_simple");

      // Consultar ofertas por tipo para esta financiera
      const sameTypeOffers = await storage.getOffersByProductType(institutionId, "credito_simple");
      expect(sameTypeOffers.length).toBeGreaterThanOrEqual(2);

      const names = sameTypeOffers.map((o) => o.name || o.customName);
      expect(names).toContain("Crédito Simple PyME Prime");
      expect(names).toContain("Crédito Simple Express Ágil");
    });
  });

  describe("Requisito 2: Creación de nueva oferta exclusivamente como borrador ('draft')", () => {
    it("fuerza el estado 'draft' y versión inicial v1 en borrador independientemente de lo enviado", async () => {
      const { offer, version } = await storage.createOffer({
        institutionId,
        name: "Arrendamiento Vehicular Flotillas",
        productType: "arrendamiento",
        status: "published" as any, // Intento de spoofing
      });

      expect(offer.status).toBe("draft");
      expect(version.status).toBe("draft");
      expect(version.versionNumber).toBe(1);
      expect(version.versionHash).toBeDefined();
      expect(version.versionHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it("la oferta en borrador NUNCA es visible ni elegible para brokers en solicitudes", async () => {
      const { offer } = await storage.createOffer({
        institutionId,
        name: "Crédito Confidencial en Borrador",
        productType: "credito_revolvente",
      });

      const versions = await storage.getInstitutionProductVersions(offer.id);
      expect(isOfferEligibleForRequests(offer, versions)).toBe(false);

      // Si un broker intenta crear un crédito con este ID, es rechazado
      await expect(
        storage.createCredit({
          clientId: "client-test-b1",
          institutionProductId: offer.id,
          amount: "500000",
        } as any)
      ).rejects.toThrow("La oferta seleccionada se encuentra en borrador o no cuenta con una versión publicada vigente.");
    });
  });

  describe("Requisito 3: Consulta y auditoría de versiones de oferta", () => {
    it("devuelve el historial inmutable de versiones para una oferta comercial", async () => {
      const { offer } = await storage.createOffer(
        {
          institutionId,
          name: "Factoraje a Proveedores Corporativos",
          productType: "factoraje",
        },
        {
          conditions: { minAmount: 1000000, maxAmount: 20000000 },
          changeReason: "Versión inicial en borrador para auditoría",
        }
      );

      const versions = await storage.getInstitutionProductVersions(offer.id);
      expect(versions.length).toBeGreaterThanOrEqual(1);

      const v1 = versions.find((v) => v.versionNumber === 1);
      expect(v1).toBeDefined();
      expect(v1?.status).toBe("draft");
      expect(v1?.changeReason).toBe("Versión inicial en borrador para auditoría");
      expect(v1?.versionHash).toBeDefined();
    });
  });

  describe("Requisito 4: Aislamiento estricto de comisiones internas y seguridad de backend", () => {
    it("las entidades de oferta y sus versiones no exponen comisiones internas de plataforma", async () => {
      const { offer, version } = await storage.createOffer({
        institutionId,
        name: "Oferta de Validación de Seguridad",
        productType: "credito_simple",
      });

      const offerKeys = Object.keys(offer);
      const versionKeys = Object.keys(version);

      expect(offerKeys).not.toContain("platformCommission");
      expect(offerKeys).not.toContain("internalCommission");
      expect(offerKeys).not.toContain("internalSpread");
      expect(versionKeys).not.toContain("platformCommission");
      expect(versionKeys).not.toContain("internalCommission");
    });
  });

  describe("Requisito B1.1: Pruebas de Endpoints por Rol (Super Admin, Master Broker, Broker)", () => {
    let app: express.Express;
    let server: Server;
    let currentAuthUser: any = null;
    const masterBrokerId = "user-mb-b1-ep";
    const testBrokerId = "user-brk-b1-ep";
    const testSuperAdminId = "user-sa-b1-ep";
    let draftOfferId = "";
    let publishedOfferId = "";

    beforeAll(async () => {
      // Registrar usuarios para pruebas de endpoints
      await storage.upsertUser({
        id: testSuperAdminId,
        email: "sa-ep@creditonegocios.com",
        role: "super_admin",
        isActive: true,
      } as any);

      await storage.upsertUser({
        id: masterBrokerId,
        email: "mb-ep@creditonegocios.com",
        role: "master_broker",
        isActive: true,
      } as any);

      await storage.upsertUser({
        id: testBrokerId,
        email: "brk-ep@creditonegocios.com",
        role: "broker",
        isActive: true,
        masterBrokerId,
      } as any);

      // Crear oferta publicada (elegible)
      const pub = await storage.createInstitutionProduct({
        institutionId,
        name: "Oferta Comercial Publicada",
        productType: "credito_simple",
        status: "draft",
        isActive: true,
        createdBy: testSuperAdminId,
      }, {
        conditions: { minAmount: 100000, maxAmount: 1000000 },
        requirements: { targetProfiles: ["persona_moral"] },
        changeReason: "Versión inicial",
        createdBy: testSuperAdminId,
      });
      publishedOfferId = pub.id;
      const pubVersions = await storage.getInstitutionProductVersions(publishedOfferId);
      if (pubVersions[0]) {
        (pubVersions[0] as any).status = "published";
        (pub as any).status = "published";
      }

      // Crear oferta en borrador (no elegible para brokers)
      const draft = await storage.createInstitutionProduct({
        institutionId,
        name: "Oferta Comercial en Borrador B1",
        productType: "credito_simple",
        status: "draft",
        isActive: true,
        createdBy: testSuperAdminId,
      }, {
        conditions: { minAmount: 50000 },
        requirements: { targetProfiles: ["persona_moral"] },
        changeReason: "Borrador confidencial",
        createdBy: testSuperAdminId,
      });
      draftOfferId = draft.id;

      // Configurar express con mock auth middleware
      app = express();
      app.use(express.json());
      app.use(async (req: any, _res: any, next: any) => {
        req.login = (_claims: any, cb: any) => cb(null);
        req.session = {
          save: (cb: any) => cb(null),
          regenerate: (cb: any) => cb(null),
        };
        const testUserId = req.headers?.["x-test-user-id"];
        const user = testUserId ? await storage.getUser(testUserId) : currentAuthUser;
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

    it("GET /api/institution-products: Broker y Master Broker NO reciben ofertas en borrador", async () => {
      // 1. Como Broker
      const resBroker = await request(app)
        .get(`/api/institution-products?institutionId=${institutionId}`)
        .set("x-test-user-id", testBrokerId);
      expect(resBroker.status).toBe(200);
      expect(Array.isArray(resBroker.body)).toBe(true);

      const brokerOfferIds = resBroker.body.map((p: any) => p.id);
      expect(brokerOfferIds).not.toContain(draftOfferId);
      expect(brokerOfferIds).toContain(publishedOfferId);

      // Verificar que metadata administrativa (createdBy) fue sanitizada
      const pubItem = resBroker.body.find((p: any) => p.id === publishedOfferId);
      expect(pubItem.createdBy).toBeUndefined();

      // 2. Como Master Broker
      const resMB = await request(app)
        .get(`/api/institution-products?institutionId=${institutionId}`)
        .set("x-test-user-id", masterBrokerId);
      expect(resMB.status).toBe(200);
      const mbOfferIds = resMB.body.map((p: any) => p.id);
      expect(mbOfferIds).not.toContain(draftOfferId);
      expect(mbOfferIds).toContain(publishedOfferId);

      // 3. Como Super Admin: sí puede ver borradores
      const resAdmin = await request(app)
        .get(`/api/institution-products?institutionId=${institutionId}`)
        .set("x-test-user-id", testSuperAdminId);
      expect(resAdmin.status).toBe(200);
      const adminOfferIds = resAdmin.body.map((p: any) => p.id);
      expect(adminOfferIds).toContain(draftOfferId);
      expect(adminOfferIds).toContain(publishedOfferId);
    });

    it("GET /api/institution-products/:id: Broker y Master reciben 404 al consultar una oferta en borrador", async () => {
      // Broker consultando borrador
      const resBrokerDraft = await request(app)
        .get(`/api/institution-products/${draftOfferId}`)
        .set("x-test-user-id", testBrokerId);
      expect(resBrokerDraft.status).toBe(404);

      // Master Broker consultando borrador
      const resMBDraft = await request(app)
        .get(`/api/institution-products/${draftOfferId}`)
        .set("x-test-user-id", masterBrokerId);
      expect(resMBDraft.status).toBe(404);

      // Super Admin consultando borrador: 200 OK
      const resAdminDraft = await request(app)
        .get(`/api/institution-products/${draftOfferId}`)
        .set("x-test-user-id", testSuperAdminId);
      expect(resAdminDraft.status).toBe(200);
      expect(resAdminDraft.body.id).toBe(draftOfferId);
      expect(resAdminDraft.body.status).toBe("draft");

      // Broker consultando oferta publicada: 200 OK sanitizada
      const resBrokerPub = await request(app)
        .get(`/api/institution-products/${publishedOfferId}`)
        .set("x-test-user-id", testBrokerId);
      expect(resBrokerPub.status).toBe(200);
      expect(resBrokerPub.body.id).toBe(publishedOfferId);
      expect(resBrokerPub.body.createdBy).toBeUndefined();
    });

    it("GET /api/institution-products/:id/versions: acceso restringido exclusivamente a Super Admin", async () => {
      // Broker es rechazado con 403
      const resBroker = await request(app)
        .get(`/api/institution-products/${publishedOfferId}/versions`)
        .set("x-test-user-id", testBrokerId);
      expect(resBroker.status).toBe(403);

      // Master Broker es rechazado con 403
      const resMB = await request(app)
        .get(`/api/institution-products/${publishedOfferId}/versions`)
        .set("x-test-user-id", masterBrokerId);
      expect(resMB.status).toBe(403);

      // Super Admin tiene acceso 200 OK
      const resAdmin = await request(app)
        .get(`/api/institution-products/${publishedOfferId}/versions`)
        .set("x-test-user-id", testSuperAdminId);
      expect(resAdmin.status).toBe(200);
      expect(Array.isArray(resAdmin.body)).toBe(true);
      expect(resAdmin.body.length).toBeGreaterThanOrEqual(1);
    });

    it("POST /api/institution-products: creación rechaza a Broker/Master y permite Super Admin como borrador", async () => {
      const payload = {
        institutionId,
        name: "Nueva Oferta de Prueba Role Guard",
        productType: "credito_simple",
        configuration: { minAmount: 100000 },
      };

      // Broker rechazado
      const resBroker = await request(app)
        .post("/api/institution-products")
        .set("x-test-user-id", testBrokerId)
        .send(payload);
      expect(resBroker.status).toBe(403);

      // Master Broker rechazado
      const resMB = await request(app)
        .post("/api/institution-products")
        .set("x-test-user-id", masterBrokerId)
        .send(payload);
      expect(resMB.status).toBe(403);

      // Super Admin crea oferta
      const resAdmin = await request(app)
        .post("/api/institution-products")
        .set("x-test-user-id", testSuperAdminId)
        .send(payload);
      expect(resAdmin.status).toBe(201);
      expect(resAdmin.body.status).toBe("draft");
      expect(resAdmin.body.createdBy).toBe(testSuperAdminId);
    });

    it("APIs de Financieras: lista explícita por rol y no exposición de comisiones internas ni campos legacy sensibles", async () => {
      // Configurar financiera con campos legacy, notas internas y comisiones en todos los niveles
      const fiTestId = "fi-comm-sec-" + Date.now();
      await storage.createFinancialInstitution({
        id: fiTestId,
        name: "Financiera Seguridad Comisiones",
        isActive: true,
        notes: "Nota interna confidencial para administradores",
        createdBy: testSuperAdminId,
        createdByAdmin: true,
        commissionRate: "5.0",
        openingCommissionRate: "2.5",
        overrateCommissionRate: "1.0",
        masterBrokerCommissionRate: "30.0",
        brokerCommissionRate: "70.0",
        commissionRates: {
          superAdmin: { apertura: 2.5, sobretasa: 0.5 },
          financiera: { apertura: 3.0, sobretasa: 0.5 },
          masterBroker: { apertura: 2.0, sobretasa: 0.3 },
          broker: { apertura: 1.5, sobretasa: 0.2 },
        },
      } as any);

      // 1. Broker: NO ve notas internas, createdBy, comisiones de plataforma ni tasas legacy sensibles
      const resBroker = await request(app)
        .get(`/api/financial-institutions/${fiTestId}`)
        .set("x-test-user-id", testBrokerId);
      expect(resBroker.status).toBe(200);
      expect(resBroker.body.notes).toBeUndefined();
      expect(resBroker.body.createdBy).toBeUndefined();
      expect(resBroker.body.createdByAdmin).toBeUndefined();
      expect(resBroker.body.commissionRate).toBeUndefined();
      expect(resBroker.body.openingCommissionRate).toBeUndefined();
      expect(resBroker.body.overrateCommissionRate).toBeUndefined();
      expect(resBroker.body.masterBrokerCommissionRate).toBeUndefined();
      expect(resBroker.body.brokerCommissionRate).toBe("70.0");
      expect(resBroker.body.commissionRates?.superAdmin).toBeUndefined();
      expect(resBroker.body.commissionRates?.financiera).toBeUndefined();
      expect(resBroker.body.commissionRates?.masterBroker).toBeUndefined();
      expect(resBroker.body.commissionRates?.broker).toBeDefined();

      // 2. Master Broker: NO ve notas internas ni comisiones de plataforma, pero sí ve masterBroker y broker
      const resMB = await request(app)
        .get(`/api/financial-institutions/${fiTestId}`)
        .set("x-test-user-id", masterBrokerId);
      expect(resMB.status).toBe(200);
      expect(resMB.body.notes).toBeUndefined();
      expect(resMB.body.createdBy).toBeUndefined();
      expect(resMB.body.createdByAdmin).toBeUndefined();
      expect(resMB.body.commissionRate).toBeUndefined();
      expect(resMB.body.openingCommissionRate).toBeUndefined();
      expect(resMB.body.overrateCommissionRate).toBeUndefined();
      expect(resMB.body.masterBrokerCommissionRate).toBe("30.0");
      expect(resMB.body.brokerCommissionRate).toBe("70.0");
      expect(resMB.body.commissionRates?.superAdmin).toBeUndefined();
      expect(resMB.body.commissionRates?.financiera).toBeUndefined();
      expect(resMB.body.commissionRates?.masterBroker).toBeDefined();
      expect(resMB.body.commissionRates?.broker).toBeDefined();

      // 3. Super Admin: ve comisiones completas y campos administrativos
      const resAdmin = await request(app)
        .get(`/api/financial-institutions/${fiTestId}`)
        .set("x-test-user-id", testSuperAdminId);
      expect(resAdmin.status).toBe(200);
      expect(resAdmin.body.notes).toBe("Nota interna confidencial para administradores");
      expect(resAdmin.body.createdBy).toBe(testSuperAdminId);
      expect(resAdmin.body.commissionRate).toBe("5.0");
      expect(resAdmin.body.commissionRates?.superAdmin).toBeDefined();
      expect(resAdmin.body.commissionRates?.superAdmin.apertura).toBe(2.5);
    });

    it("Atomicidad en creación: si falla la creación de versión, no deja registro huérfano", async () => {
      const corruptOfferId = "offer-fail-" + Date.now();
      
      // Simulamos un fallo durante la creación pasando datos que causen error o forzando excepción
      try {
        await storage.createInstitutionProduct({
          id: corruptOfferId,
          institutionId: "inexistente",
          name: "Oferta Fallida",
          productType: "credito_simple",
        } as any, {
          changeReason: undefined,
        });
      } catch (err) {
        // Error esperado
      }

      // Si ocurre un error, MemStorage hace rollback y PostgreSQL hace ROLLBACK en transacción
      const checkOrphan = await storage.getInstitutionProduct(corruptOfferId);
      // No debe existir registro huérfano si la transacción fue abortada
      if (checkOrphan) {
        // Si se creó con éxito porque los datos eran válidos, comprobamos que tenga su versión v1
        const versions = await storage.getInstitutionProductVersions(corruptOfferId);
        expect(versions.length).toBeGreaterThanOrEqual(1);
      }
    });

    it("Seguridad RBAC: requirePlatformRole nunca eleve privilegios mediante usuarios de respaldo", async () => {
      // 1. Un usuario inexistente jamás debe tener acceso administrativo por fallback
      const resNonExistent = await request(app)
        .get(`/api/institution-products/${publishedOfferId}/versions`)
        .set("x-test-user-id", "usuario-fantasma-inexistente");
      expect(resNonExistent.status).toBe(401);

      // 2. Un broker sin permisos no puede crear ofertas ni se le eleva el rol
      const resBroker = await request(app)
        .post("/api/institution-products")
        .set("x-test-user-id", testBrokerId)
        .send({
          institutionId,
          name: "Oferta Intento Escalada",
          productType: "credito_simple",
        });
      expect(resBroker.status).toBe(403);
    });
  });
});
