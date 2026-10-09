import type { Server } from "node:http";
import express from "express";
// @ts-ignore
import request from "supertest";
import cron from "node-cron";
import { storage } from "../../server/storage";
import { registerRoutes } from "../../server/routes";
import {
  extractCompanyAgeMonths,
  extractEmploymentAgeMonths,
  extractRequestedAmount,
  extractBureauStatus,
  extractHasGuarantee,
} from "../../server/matching/fieldMapping";
import {
  evaluateOfferCompatibility,
  evaluateCatalogCompatibility,
  isVersionEligibleForMatching,
  type OfferVersionInput,
} from "../../server/matching/compatibilityEvaluator";

describe("Bloque Matching M2 — Integración Segura con Solicitudes y Expedientes Reales", () => {
  let app: express.Express;
  let server: Server;

  const testSuperAdminId = "user-super-admin-m2";
  const testBrokerAId = "user-broker-a-m2";
  const testBrokerBId = "user-broker-b-m2";

  const tenantAId = "tenant-a-m2-" + Date.now();
  const tenantBId = "tenant-b-m2-" + Date.now();

  const institutionActiveId = "fin-active-m2-" + Date.now();
  const institutionInactiveId = "fin-inactive-m2-" + Date.now();

  let clientAId: string;
  let creditAId: string; // Crédito del Tenant A
  let clientBId: string;
  let creditBId: string; // Crédito del Tenant B

  let publishedOfferId: string;
  let draftOfferId: string;

  beforeAll(async () => {
    // 1. Crear usuarios de prueba
    await storage.upsertUser({
      id: testSuperAdminId,
      email: "superadmin-m2@creditonegocios.com",
      role: "super_admin",
      isActive: true,
    } as any);

    await storage.upsertUser({
      id: testBrokerAId,
      email: "broker-a-m2@creditonegocios.com",
      role: "broker",
      isActive: true,
    } as any);

    await storage.upsertUser({
      id: testBrokerBId,
      email: "broker-b-m2@creditonegocios.com",
      role: "broker",
      isActive: true,
    } as any);

    // 2. Crear instituciones financieras (una activa, una inactiva)
    await storage.createFinancialInstitution({
      id: institutionActiveId,
      name: "Financiera Activa M2",
      email: "activa@m2.com",
      isActive: true,
    } as any);

    await storage.createFinancialInstitution({
      id: institutionInactiveId,
      name: "Financiera Inactiva M2",
      email: "inactiva@m2.com",
      isActive: false, // Inactiva
    } as any);

    // 3. Crear Clientes y Créditos reales
    const clientA = await storage.createClient({
      brokerId: testBrokerAId,
      tenantId: tenantAId,
      type: "persona_moral",
      businessName: "Empresa Alfa SA de CV",
      yearsInBusiness: 4,
      ingresoMensualPromedio: "850000",
      atrasosDeudas: "al_corriente",
      garantia: "si",
      garantiaDetalles: { tipo: "hipotecaria" },
      avalObligadoSolidario: "si",
    } as any);
    clientAId = clientA.id;

    const creditA = await storage.createCredit({
      clientId: clientAId,
      brokerId: testBrokerAId,
      tenantId: tenantAId,
      amount: "2500000",
      term: 36,
      status: "under_review",
    } as any);
    creditAId = creditA.id;

    const clientB = await storage.createClient({
      brokerId: testBrokerBId,
      tenantId: tenantBId,
      type: "persona_moral",
      businessName: "Empresa Beta SA de CV",
      yearsInBusiness: 2,
      ingresoMensualPromedio: "400000",
      atrasosDeudas: "al_corriente",
    } as any);
    clientBId = clientB.id;

    const creditB = await storage.createCredit({
      clientId: clientBId,
      brokerId: testBrokerBId,
      tenantId: tenantBId,
      amount: "1000000",
      term: 24,
      status: "submitted",
    } as any);
    creditBId = creditB.id;

    // 4. Crear Oferta Canónica 1 (Publicada y vigente)
    const offer1 = await storage.createInstitutionProduct(
      {
        financialInstitutionId: institutionActiveId,
        name: "Oferta Pyme Empresarial Vigente",
        productType: "credito_simple",
        status: "draft",
        isActive: true,
      } as any,
      {
        versionNumber: 1,
        status: "draft",
        conditions: {
          minAmount: 500000,
          maxAmount: 5000000,
          minTermMonths: 12,
          maxTermMonths: 48,
          minCompanyAgeMonths: 24,
          minMonthlyRevenue: 300000,
          bureauRequirement: "sin_atrasos",
          guaranteeType: "hipotecaria",
        },
        requirements: { targetProfiles: ["persona_moral"] },
        changeReason: "Versión inicial",
      } as any
    );
    publishedOfferId = offer1.id;
    const versions1 = await storage.getInstitutionProductVersions(publishedOfferId);
    await storage.publishInstitutionProductVersion(publishedOfferId, versions1[0].id, {
      publishedBy: testSuperAdminId,
      changeReason: "Lanzamiento oficial",
    });

    // 5. Crear Oferta Canónica 2 (Solo en borrador, jamás publicada)
    const offer2 = await storage.createInstitutionProduct(
      {
        financialInstitutionId: institutionActiveId,
        name: "Oferta Futura en Borrador",
        productType: "credito_revolvente",
        status: "draft",
        isActive: true,
      } as any,
      {
        versionNumber: 1,
        status: "draft",
        conditions: { minAmount: 100000, maxAmount: 1000000 },
        requirements: { targetProfiles: ["persona_moral"] },
        changeReason: "Borrador de prueba",
      } as any
    );
    draftOfferId = offer2.id;

    // 6. Setup Express App con middleware de autenticación simulada
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
        // Tenant context
        if (user.id === testBrokerAId) {
          req.tenantContext = { tenant: { id: tenantAId }, membership: { role: "broker" } };
        } else if (user.id === testBrokerBId) {
          req.tenantContext = { tenant: { id: tenantBId }, membership: { role: "broker" } };
        }
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

  describe("1. Normalización Estricta y Verificación de Campos (Sin Datos Inventados)", () => {
    test("nunca confunde antigüedad laboral (empleo asalariado) con antigüedad empresarial de negocio", () => {
      // Cliente con antigüedad laboral en empleo pero sin negocio registrado
      const salariedClient = {
        type: "persona_moral",
        antiguedadLaboral: "6 años",
        antiguedadEmpleo: "4 años",
      };

      // extractCompanyAgeMonths debe retornar null para empresas, jamás adoptar la antigüedad de empleo
      expect(extractCompanyAgeMonths(salariedClient)).toBeNull();

      // extractEmploymentAgeMonths sí la extrae para créditos personales / nómina
      expect(extractEmploymentAgeMonths(salariedClient)).toBe(72);
    });

    test("rechaza aproximaciones ambiguas y exige datos temporales comprobables", () => {
      expect(extractCompanyAgeMonths({ businessAge: "mas_de_2_anios" })).toBeNull();
      expect(extractCompanyAgeMonths({ tiempoActividad: "aproximadamente 3 años" })).toBeNull();
      expect(extractCompanyAgeMonths({ tiempoActividad: "menos_de_1_anio" })).toBeNull();

      // Formatos precisos y verificables
      expect(extractCompanyAgeMonths({ yearsInBusiness: 3 })).toBe(36);
      expect(extractCompanyAgeMonths({ tiempoActividad: "2 años" })).toBe(24);
      expect(extractCompanyAgeMonths({ tiempoActividad: "18 meses" })).toBe(18);
    });
  });

  describe("2. Origen Verificado de Condiciones y Prevención de Compatibilidades Falsas", () => {
    test("si la oferta tiene verificación de origen pendiente, clasifica como INSUFFICIENT_DATA y NUNCA como COMPATIBLE", () => {
      const appInput = {
        credit: { amount: 1000000, term: 24 },
        client: {
          type: "persona_moral",
          yearsInBusiness: 4,
          ingresoMensualPromedio: 500000,
          atrasosDeudas: "al_corriente",
        },
      };

      // Oferta con eligibilityEvaluation pendiente de verificación
      const offerWithPendingVerification: OfferVersionInput = {
        product: { id: "off-unverified", name: "Oferta con Variables No Verificadas" },
        version: {
          id: "v-unverified",
          versionNumber: 1,
          status: "published",
          conditions: {
            minAmount: 500000,
            maxAmount: 2000000,
            minCompanyAgeMonths: 24,
            eligibilityEvaluation: {
              matchingActive: false,
              status: "pending_verification",
              verified: false,
              originFieldsChecked: false,
            },
          },
          requirements: { targetProfiles: ["persona_moral"] },
        },
      };

      const result = evaluateOfferCompatibility(appInput, offerWithPendingVerification);

      // No debe ser COMPATIBLE
      expect(result.status).toBe("INSUFFICIENT_DATA");
      expect(result.criteria.missing).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "eligibilityVerification",
            reason: expect.stringContaining("pendientes de verificación de origen"),
          }),
        ])
      );
    });
  });

  describe("3. Evaluación de Garantías Específicas", () => {
    const hipotecariaOffer: OfferVersionInput = {
      product: { id: "off-hipo", name: "Crédito con Garantía Hipotecaria" },
      version: {
        id: "v-hipo",
        versionNumber: 1,
        status: "published",
        conditions: {
          minAmount: 1000000,
          maxAmount: 5000000,
          guaranteeType: "hipotecaria", // Exige garantía hipotecaria
        },
      },
    };

    test("aprueba garantía compatible cuando el cliente cuenta con inmueble o hipoteca", () => {
      const app = {
        credit: { amount: 2000000 },
        client: { garantia: "si", garantiaDetalles: { tipo: "inmueble comercial" } },
      };

      const result = evaluateOfferCompatibility(app, hipotecariaOffer);
      const guarCrit = result.criteria.matched.find((c) => c.code === "guaranteeType");
      expect(guarCrit).toBeDefined();
      expect(guarCrit?.status).toBe("PASSED");
    });

    test("rechaza explícitamente cuando el cliente presenta un tipo de garantía incompatible", () => {
      const app = {
        credit: { amount: 2000000 },
        client: { garantia: "si", garantiaDetalles: { tipo: "liquida" } }, // Líquida no es hipotecaria
      };

      const result = evaluateOfferCompatibility(app, hipotecariaOffer);
      expect(result.status).toBe("NOT_COMPATIBLE");
      const guarCrit = result.criteria.failed.find((c) => c.code === "guaranteeType");
      expect(guarCrit).toBeDefined();
      expect(guarCrit?.reason).toContain("no cumple con la garantía específica exigida");
    });

    test("clasifica como MISSING_DATA si tiene garantía pero el tipo no está detallado", () => {
      const app = {
        credit: { amount: 2000000 },
        client: { garantia: "si" }, // Sin detalle de tipo
      };

      const result = evaluateOfferCompatibility(app, hipotecariaOffer);
      expect(result.status).toBe("INSUFFICIENT_DATA");
      const guarCrit = result.criteria.missing.find((c) => c.code === "guaranteeType");
      expect(guarCrit).toBeDefined();
    });
  });

  describe("4. Filtrado Estricto de Versiones y Ofertas Vigentes", () => {
    test("isVersionEligibleForMatching filtra borradores, archivadas, superseded y fechas expiradas", () => {
      const activeInst = { id: "inst-1", isActive: true };
      const inactiveInst = { id: "inst-2", isActive: false };
      const activeProd = { id: "prod-1", status: "published", isActive: true };

      // 1. Borrador -> no elegible
      expect(isVersionEligibleForMatching(activeProd, { status: "draft" }, activeInst).eligible).toBe(false);

      // 2. Superada -> no elegible
      expect(isVersionEligibleForMatching(activeProd, { status: "superseded" }, activeInst).eligible).toBe(false);

      // 3. Archivada -> no elegible
      expect(isVersionEligibleForMatching(activeProd, { status: "archived" }, activeInst).eligible).toBe(false);

      // 4. Institución inactiva -> no elegible
      expect(isVersionEligibleForMatching(activeProd, { status: "published" }, inactiveInst).eligible).toBe(false);

      // 5. Expirada (effectiveTo en el pasado) -> no elegible
      const pastDate = new Date(Date.now() - 86400000);
      expect(
        isVersionEligibleForMatching(activeProd, { status: "published", effectiveTo: pastDate }, activeInst).eligible
      ).toBe(false);

      // 6. Futura (effectiveFrom en el futuro) -> no elegible
      const futureDate = new Date(Date.now() + 86400000);
      expect(
        isVersionEligibleForMatching(activeProd, { status: "published", effectiveFrom: futureDate }, activeInst).eligible
      ).toBe(false);

      // 7. Publicada y vigente hoy -> elegible
      expect(
        isVersionEligibleForMatching(activeProd, { status: "published", effectiveTo: null }, activeInst).eligible
      ).toBe(true);
    });
  });

  describe("5. Endpoint API de Consulta GET /api/credits/:id/matching", () => {
    test("seguridad multi-tenant: Broker B no puede consultar solicitud de Broker A (403)", async () => {
      const res = await request(app)
        .get(`/api/credits/${creditAId}/matching`)
        .set("x-test-user-id", testBrokerBId);

      expect([403, 404]).toContain(res.status);
    });

    test("broker propietario consulta su solicitud exitosamente con resultados estructurados", async () => {
      const res = await request(app)
        .get(`/api/credits/${creditAId}/matching`)
        .set("x-test-user-id", testBrokerAId);

      expect(res.status).toBe(200);
      expect(res.body.creditId).toBe(creditAId);
      expect(res.body.clientId).toBe(clientAId);
      expect(res.body.summary).toBeDefined();
      expect(res.body.summary.totalEvaluated).toBeGreaterThanOrEqual(1);

      // Contiene desglose tripartito
      expect(Array.isArray(res.body.compatible)).toBe(true);
      expect(Array.isArray(res.body.insufficientData)).toBe(true);
      expect(Array.isArray(res.body.notCompatible)).toBe(true);

      // Solo evaluó la versión publicada y vigente, no el borrador
      const evaluatedOfferIds = [
        ...res.body.compatible.map((o: any) => o.offerId),
        ...res.body.insufficientData.map((o: any) => o.offerId),
        ...res.body.notCompatible.map((o: any) => o.offerId),
      ];
      expect(evaluatedOfferIds).toContain(publishedOfferId);
      expect(evaluatedOfferIds).not.toContain(draftOfferId);
    });

    test("super admin puede consultar matching de cualquier solicitud", async () => {
      const res = await request(app)
        .get(`/api/credits/${creditBId}/matching`)
        .set("x-test-user-id", testSuperAdminId);

      expect(res.status).toBe(200);
      expect(res.body.creditId).toBe(creditBId);
      expect(res.body.summary).toBeDefined();
    });

    test("la consulta no muta el crédito ni emite decisiones automáticas", async () => {
      const creditBefore = await storage.getCredit(creditAId);
      expect(creditBefore?.status).toBe("under_review");

      await request(app)
        .get(`/api/credits/${creditAId}/matching`)
        .set("x-test-user-id", testBrokerAId);

      const creditAfter = await storage.getCredit(creditAId);
      // Estatus inalterado
      expect(creditAfter?.status).toBe("under_review");
    });
  });

  describe("6. Imparcialidad Comercial — Cero Sesgo y Sin Rankings Favorecedores", () => {
    test("las ofertas no se reordenan para favorecer a financieras con mayores comisiones", () => {
      const app = {
        credit: { amount: 2000000, term: 24 },
        client: { type: "persona_moral", yearsInBusiness: 3 },
      };

      const offerLow = {
        product: { id: "off-a", name: "Financiera Baja Comisión" },
        version: {
          id: "v-a",
          versionNumber: 1,
          status: "published",
          conditions: { minAmount: 1000000, maxAmount: 3000000, commissionRates: { financiera: { total: 1 } } },
          requirements: { targetProfiles: ["persona_moral"] },
        },
      };

      const offerHigh = {
        product: { id: "off-b", name: "Financiera Alta Comisión" },
        version: {
          id: "v-b",
          versionNumber: 1,
          status: "published",
          conditions: { minAmount: 1000000, maxAmount: 3000000, commissionRates: { financiera: { total: 12 } } },
          requirements: { targetProfiles: ["persona_moral"] },
        },
      };

      const results = evaluateCatalogCompatibility(app, [offerLow, offerHigh]);
      expect(results.compatible).toHaveLength(2);
      // Mantiene el orden objetivo de entrada sin promover artificialmente a la de mayor comisión
      expect(results.compatible[0].offerId).toBe("off-a");
      expect(results.compatible[1].offerId).toBe("off-b");
    });
  });
});
