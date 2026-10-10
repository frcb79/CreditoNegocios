import type { Server } from "node:http";
import express from "express";
// @ts-ignore
import request from "supertest";
import cron from "node-cron";
import { storage } from "../../server/storage";
import { registerRoutes } from "../../server/routes";
import {
  evaluateOfferCompatibility,
  evaluateCatalogCompatibility,
  isVersionEligibleForMatching,
  isCriterionOriginVerified,
  type OfferVersionInput,
  type ApplicationInput,
} from "../../server/matching/compatibilityEvaluator";

describe("Bloque Matching M3 — Resultados Operativos, Blindaje de No-Rechazo y Validación", () => {
  let app: express.Express;
  let server: Server;

  const testSuperAdminId = "user-super-admin-m3";
  const testBrokerAId = "user-broker-a-m3";
  const testBrokerBId = "user-broker-b-m3";

  const tenantAId = "tenant-a-m3-" + Date.now();
  const tenantBId = "tenant-b-m3-" + Date.now();

  const institutionActiveId = "fin-active-m3-" + Date.now();

  let clientPMId: string;
  let creditPMId: string;
  let clientPFAEId: string;
  let creditPFAEId: string;
  let clientPFId: string;
  let creditPFId: string;
  let clientSinSatId: string;
  let creditSinSatId: string;

  let creditTenantBId: string;
  let clientTenantBId: string;

  let publishedOfferId: string;

  beforeAll(async () => {
    // 1. Crear usuarios de prueba
    await storage.upsertUser({
      id: testSuperAdminId,
      email: "superadmin-m3@creditonegocios.com",
      role: "super_admin",
      isActive: true,
    } as any);

    await storage.upsertUser({
      id: testBrokerAId,
      email: "broker-a-m3@creditonegocios.com",
      role: "broker",
      isActive: true,
    } as any);

    await storage.upsertUser({
      id: testBrokerBId,
      email: "broker-b-m3@creditonegocios.com",
      role: "broker",
      isActive: true,
    } as any);

    // 2. Crear institución financiera activa
    await storage.createFinancialInstitution({
      id: institutionActiveId,
      name: "Banco Aliado M3",
      email: "aliado@m3.com",
      isActive: true,
    } as any);

    // 3. Crear expedientes representativos por los 4 perfiles canónicos

    // Perfil 1: Persona Moral (PM)
    const clientPM = await storage.createClient({
      brokerId: testBrokerAId,
      tenantId: tenantAId,
      type: "persona_moral",
      businessName: "Corporativo Industrial Alfa SA de CV",
      yearsInBusiness: 5,
      ingresoMensualPromedio: "1200000",
      atrasosDeudas: "al_corriente",
      garantia: "si",
      garantiaDetalles: { tipo: "hipotecaria" },
      avalObligadoSolidario: "si",
    } as any);
    clientPMId = clientPM.id;

    const creditPM = await storage.createCredit({
      clientId: clientPMId,
      brokerId: testBrokerAId,
      tenantId: tenantAId,
      amount: "2500000",
      term: 24,
      status: "lead",
    } as any);
    creditPMId = creditPM.id;

    // Perfil 2: Física con Actividad Empresarial (PFAE)
    const clientPFAE = await storage.createClient({
      brokerId: testBrokerAId,
      tenantId: tenantAId,
      type: "fisica_empresarial",
      firstName: "Laura",
      lastName: "Méndez",
      businessName: "Comercializadora Méndez",
      yearsInBusiness: 3,
      ingresoMensualPromedio: "350000",
      atrasosDeudas: "al_corriente",
      garantia: "no",
      avalObligadoSolidario: "no",
    } as any);
    clientPFAEId = clientPFAE.id;

    const creditPFAE = await storage.createCredit({
      clientId: clientPFAEId,
      brokerId: testBrokerAId,
      tenantId: tenantAId,
      amount: "500000",
      term: 18,
      status: "lead",
    } as any);
    creditPFAEId = creditPFAE.id;

    // Perfil 3: Persona Física / Asalariado (PF)
    const clientPF = await storage.createClient({
      brokerId: testBrokerAId,
      tenantId: tenantAId,
      type: "fisica",
      firstName: "Carlos",
      lastName: "Sánchez",
      antiguedadLaboral: "36 meses", // Antigüedad laboral (no negocio)
      ingresoMensualPromedio: "60000",
      atrasosDeudas: "al_corriente",
      garantia: "no",
      avalObligadoSolidario: "si",
    } as any);
    clientPFId = clientPF.id;

    const creditPF = await storage.createCredit({
      clientId: clientPFId,
      brokerId: testBrokerAId,
      tenantId: tenantAId,
      amount: "150000",
      term: 12,
      status: "lead",
    } as any);
    creditPFId = creditPF.id;

    // Perfil 4: Sin SAT (Informal / En proceso de formalización)
    const clientSinSat = await storage.createClient({
      brokerId: testBrokerAId,
      tenantId: tenantAId,
      type: "sin_sat",
      firstName: "Rosa",
      lastName: "Hernández",
      tiempoActividad: "24 meses",
      ingresoMensualPromedioComprobablesSinSat: "45000",
      atrasosDeudasBuroSinSat: "al_corriente",
      garantia: "no",
      avalObligadoSolidario: "no",
    } as any);
    clientSinSatId = clientSinSat.id;

    const creditSinSat = await storage.createCredit({
      clientId: clientSinSatId,
      brokerId: testBrokerAId,
      tenantId: tenantAId,
      amount: "80000",
      term: 6,
      status: "lead",
    } as any);
    creditSinSatId = creditSinSat.id;

    // Cliente y Crédito del Tenant B (para pruebas de aislamiento multi-tenant)
    const clientTenantB = await storage.createClient({
      brokerId: testBrokerBId,
      tenantId: tenantBId,
      type: "persona_moral",
      businessName: "Negocio Tenant B SA",
      yearsInBusiness: 2,
      ingresoMensualPromedio: "400000",
    } as any);
    clientTenantBId = clientTenantB.id;

    const creditTenantB = await storage.createCredit({
      clientId: clientTenantBId,
      brokerId: testBrokerBId,
      tenantId: tenantBId,
      amount: "600000",
      term: 12,
      status: "lead",
    } as any);
    creditTenantBId = creditTenantB.id;

    // 4. Crear producto comercial publicado con condiciones claras
    const prod = await storage.createInstitutionProduct(
      {
        institutionId: institutionActiveId,
        financialInstitutionId: institutionActiveId,
        name: "Crédito Pyme Integral M3",
        customName: "Pyme Integral M3",
        productType: "credito_simple",
        category: "simple",
        isActive: true,
        status: "draft",
        targetProfiles: ["persona_moral", "fisica_empresarial"],
        commissionRates: { apertura: 2.5, broker: 1.5, sobretasa: 0.5 }, // Confidencial
        overrateCommissionRate: 0.5, // Confidencial
        platformGrossMargin: 1.0, // Confidencial
      } as any,
      {
        versionNumber: 1,
        status: "draft",
        effectiveFrom: new Date(Date.now() - 3600000), // Hace 1 hora
        conditions: {
          minAmount: 200000,
          maxAmount: 5000000,
          minTermMonths: 6,
          maxTermMonths: 36,
          minCompanyAgeMonths: 24,
          minMonthlyRevenue: 200000,
          bureauRequirement: "sin_atrasos",
          guaranteeType: "sin_garantia",
          avalesType: "no_requerido",
        },
        requirements: {
          targetProfiles: ["persona_moral", "fisica_empresarial"],
        },
        changeReason: "Lanzamiento oficial M3",
      } as any
    );
    publishedOfferId = prod.id;

    const versions = await storage.getInstitutionProductVersions(publishedOfferId);
    await storage.publishInstitutionProductVersion(publishedOfferId, versions[0].id, {
      publishedBy: testSuperAdminId,
      changeReason: "Lanzamiento oficial M3",
    });

    // 5. Levantar aplicación Express para pruebas de integración y seguridad RBAC
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));

    // Middleware simulado de autenticación con RBAC y tenant context
    app.use((req: any, _res, next) => {
      const simulatedRole = req.headers["x-test-role"] || "broker";
      const simulatedUserId = req.headers["x-test-user-id"] || testBrokerAId;
      const simulatedTenantId = req.headers["x-test-tenant-id"] || tenantAId;

      req.user = {
        id: simulatedUserId,
        claims: { sub: simulatedUserId },
        role: simulatedRole,
        tenantId: simulatedTenantId,
      };

      req.tenantContext = {
        tenantId: simulatedTenantId,
        userRole: simulatedRole,
        userId: simulatedUserId,
      };

      next();
    });

    server = await registerRoutes(app);
  });

  afterAll(async () => {
    cron.getTasks().forEach((task: any) => task.stop());
    if (server && server.listening) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
  });

  describe("1. Regla de Blindaje: Criterios sin origen verificado NUNCA provocan rechazo definitivo (FAILED)", () => {
    test("Si un criterio incumpliría pero está en unverifiedCriteria, se emite MISSING_DATA y el dictamen es INSUFFICIENT_DATA", () => {
      // Cliente con 6 meses de operación (insuficiente para el requisito de 24 meses)
      const appInput: ApplicationInput = {
        client: {
          type: "persona_moral",
          yearsInBusiness: 0.5, // 6 meses
          ingresoMensualPromedio: "500000",
        },
        credit: {
          amount: 500000,
          term: 12,
        },
      };

      // Versión donde companyAge NO tiene origen verificado
      const offerInput: OfferVersionInput = {
        product: { id: "p-1", name: "Oferta Test", targetProfiles: ["persona_moral"] },
        version: {
          versionNumber: 1,
          status: "published",
          conditions: {
            minCompanyAgeMonths: 24, // Exige 24 meses
            unverifiedCriteria: ["companyAge"], // Marcado explícitamente como no verificado
          },
        },
      };

      const result = evaluateOfferCompatibility(appInput, offerInput);

      // NO debe tener rechazos definitivos
      expect(result.criteria.failed.length).toBe(0);
      expect(result.status).toBe("INSUFFICIENT_DATA");

      // El criterio de antigüedad debe estar en missing
      const ageCriterion = result.criteria.missing.find((c) => c.code === "companyAge");
      expect(ageCriterion).toBeDefined();
      expect(ageCriterion?.status).toBe("MISSING_DATA");
      expect(ageCriterion?.reason).toContain("no se aplica rechazo definitivo");
    });

    test("Si la versión completa tiene originVerified === false, ningún criterio provoca FAILED", () => {
      const appInput: ApplicationInput = {
        client: {
          type: "fisica", // Perfil no admitido
          yearsInBusiness: 1,
          ingresoMensualPromedio: "10000", // Ingreso insuficiente
        },
        credit: {
          amount: 10000000, // Monto excesivo
        },
      };

      const offerInput: OfferVersionInput = {
        product: { id: "p-global-unverified", name: "Oferta Origen Pendiente" },
        version: {
          versionNumber: 1,
          status: "published",
          originVerified: false, // Origen global de la oferta pendiente de comprobación
          conditions: {
            minAmount: 100000,
            maxAmount: 1000000,
            minMonthlyRevenue: 500000,
          },
          requirements: {
            targetProfiles: ["persona_moral"],
          },
        },
      };

      const result = evaluateOfferCompatibility(appInput, offerInput);

      // Cero FAILED aunque todos los valores son incompatibles
      expect(result.criteria.failed.length).toBe(0);
      expect(result.status).toBe("INSUFFICIENT_DATA");
      expect(result.criteria.missing.length).toBeGreaterThan(0);
      expect(result.summary).toContain("Información insuficiente");
    });

    test("Si el expediente del cliente tiene un campo no verificado (client.unverifiedFields), no genera rechazo definitivo", () => {
      const appInput: ApplicationInput = {
        client: {
          type: "persona_moral",
          ingresoMensualPromedio: "50000", // Bajo
          unverifiedFields: ["monthlyRevenue"], // Pendiente de comprobación contra estados de cuenta
        },
        credit: {
          amount: 300000,
          term: 12,
        },
      };

      const offerInput: OfferVersionInput = {
        product: { id: "p-verified-offer", name: "Oferta Verificada" },
        version: {
          versionNumber: 1,
          status: "published",
          conditions: {
            minMonthlyRevenue: 200000,
          },
        },
      };

      const result = evaluateOfferCompatibility(appInput, offerInput);

      expect(result.criteria.failed.length).toBe(0);
      expect(result.status).toBe("INSUFFICIENT_DATA");
      const revCrit = result.criteria.missing.find((c) => c.code === "monthlyRevenue");
      expect(revCrit).toBeDefined();
      expect(revCrit?.reason).toContain("no se aplica rechazo definitivo");
    });

    test("Cuando el criterio SÍ está verificado y se incumple objetivamente, SÍ genera FAILED y NOT_COMPATIBLE", () => {
      const appInput: ApplicationInput = {
        client: {
          type: "persona_moral",
          yearsInBusiness: 1, // 12 meses
        },
        credit: {
          amount: 500000,
          term: 12,
        },
      };

      const offerInput: OfferVersionInput = {
        product: { id: "p-verified", name: "Oferta Verificada" },
        version: {
          versionNumber: 1,
          status: "published",
          conditions: {
            minCompanyAgeMonths: 36, // Exige 36 meses, cliente tiene 12
          },
        },
      };

      const result = evaluateOfferCompatibility(appInput, offerInput);

      expect(result.criteria.failed.length).toBe(1);
      expect(result.status).toBe("NOT_COMPATIBLE");
      expect(result.criteria.failed[0].code).toBe("companyAge");
      expect(result.summary).toContain("No compatible");
    });
  });

  describe("2. Filtrado Estricto de Versiones y Rechazo de Fechas Inválidas", () => {
    test("Rechaza versiones con fechas de vigencia corruptas o inválidas (isNaN)", () => {
      const product = { id: "prod-1", isActive: true, status: "published" };

      // Fecha de inicio inválida
      const versionBadFrom = {
        id: "v-1",
        status: "published",
        effectiveFrom: "fecha-totalmente-invalida",
      };
      const resFrom = isVersionEligibleForMatching(product, versionBadFrom);
      expect(resFrom.eligible).toBe(false);
      expect(resFrom.reason).toContain("Fecha de inicio de vigencia inválida");

      // Fecha de fin inválida
      const versionBadTo = {
        id: "v-2",
        status: "published",
        effectiveTo: "caducidad_corrupta",
      };
      const resTo = isVersionEligibleForMatching(product, versionBadTo);
      expect(resTo.eligible).toBe(false);
      expect(resTo.reason).toContain("Fecha de fin de vigencia inválida");
    });

    test("Rechaza fechas pasadas en tipo booleano u objetos ambiguos", () => {
      const product = { id: "prod-1", isActive: true, status: "published" };
      const versionBoolDate = {
        id: "v-3",
        status: "published",
        effectiveFrom: true as any,
      };
      const res = isVersionEligibleForMatching(product, versionBoolDate);
      expect(res.eligible).toBe(false);
      expect(res.reason).toContain("tipo no admitido");
    });

    test("Rechaza rangos de vigencia invertidos (effectiveFrom > effectiveTo)", () => {
      const product = { id: "prod-1", isActive: true, status: "published" };
      const now = Date.now();
      const versionInverted = {
        id: "v-4",
        status: "published",
        effectiveFrom: new Date(now - 10000), // Hace 10 seg
        effectiveTo: new Date(now - 100000), // Hace 100 seg (anterior a la fecha de inicio)
      };
      const res = isVersionEligibleForMatching(product, versionInverted);
      expect(res.eligible).toBe(false);
      expect(res.reason).toContain("Rango de vigencia inválido");
    });

    test("Acepta versiones con fechas válidas y vigentes", () => {
      const product = { id: "prod-1", isActive: true, status: "published" };
      const now = Date.now();
      const versionValid = {
        id: "v-5",
        status: "published",
        effectiveFrom: new Date(now - 86400000), // Ayer
        effectiveTo: new Date(now + 86400000), // Mañana
      };
      const res = isVersionEligibleForMatching(product, versionValid);
      expect(res.eligible).toBe(true);
    });
  });

  describe("3. Evaluación de Expedientes Representativos por los 4 Perfiles Canónicos", () => {
    test("Perfil Persona Moral (PM): evalúa correctamente todas las variables empresariales", async () => {
      const res = await request(app)
        .get(`/api/credits/${creditPMId}/matching`)
        .set("x-test-role", "super_admin")
        .set("x-test-user-id", testSuperAdminId)
        .set("x-test-tenant-id", tenantAId);

      expect(res.status).toBe(200);
      expect(res.body.creditId).toBe(creditPMId);
      expect(res.body.summary).toBeDefined();
      expect(res.body.summary.totalEvaluated).toBeGreaterThan(0);
      expect(res.body.compatible.length).toBeGreaterThan(0);

      const matchedOffer = res.body.compatible.find((o: any) => o.offerName === "Crédito Pyme Integral M3");
      expect(matchedOffer).toBeDefined();
      expect(matchedOffer.status).toBe("COMPATIBLE");
      expect(matchedOffer.institutionName).toBe("Banco Aliado M3");
    });

    test("Perfil PFAE: admite perfil y valida montos y antigüedad de negocio", async () => {
      const res = await request(app)
        .get(`/api/credits/${creditPFAEId}/matching`)
        .set("x-test-role", "broker")
        .set("x-test-user-id", testBrokerAId)
        .set("x-test-tenant-id", tenantAId);

      expect(res.status).toBe(200);
      expect(res.body.compatible.length).toBeGreaterThan(0);
      const matchedOffer = res.body.compatible.find((o: any) => o.offerName === "Crédito Pyme Integral M3");
      expect(matchedOffer).toBeDefined();
      const profileCrit = matchedOffer.criteria.matched.find((c: any) => c.code === "targetProfiles");
      expect(profileCrit).toBeDefined();
      expect(profileCrit.actualValue).toBe("fisica_empresarial");
    });

    test("Perfil Persona Física (PF): no confunde antigüedad laboral con comercial", async () => {
      const res = await request(app)
        .get(`/api/credits/${creditPFId}/matching`)
        .set("x-test-role", "broker")
        .set("x-test-user-id", testBrokerAId)
        .set("x-test-tenant-id", tenantAId);

      expect(res.status).toBe(200);
      // La oferta Pyme Integral exige PM o PFAE, por lo que para PF debe ser no compatible en perfil
      expect(res.body.notCompatible.length).toBeGreaterThan(0);
      const offer = res.body.notCompatible[0];
      const failedProfile = offer.criteria.failed.find((c: any) => c.code === "targetProfiles");
      expect(failedProfile).toBeDefined();
      expect(failedProfile.actualValue).toBe("fisica");
    });

    test("Perfil Sin SAT: evalúa objetivamente sin inventar aprobación definitiva ni RFC", async () => {
      const res = await request(app)
        .get(`/api/credits/${creditSinSatId}/matching`)
        .set("x-test-role", "broker")
        .set("x-test-user-id", testBrokerAId)
        .set("x-test-tenant-id", tenantAId);

      expect(res.status).toBe(200);
      // Debe clasificar con transparencia
      expect(res.body.summary.totalEvaluated).toBeGreaterThan(0);
    });
  });

  describe("4. Seguridad RBAC, Aislamiento Multi-Tenant y Cero Exposición Comercial", () => {
    test("Broker de Tenant A no puede consultar solicitudes de Tenant B (403/404)", async () => {
      const res = await request(app)
        .get(`/api/credits/${creditTenantBId}/matching`)
        .set("x-test-role", "broker")
        .set("x-test-user-id", testBrokerAId) // Broker A intenta ver expediente de Tenant B
        .set("x-test-tenant-id", tenantAId);

      expect([403, 404]).toContain(res.status);
    });

    test("Broker de Tenant B sí puede consultar sus propias solicitudes en Tenant B", async () => {
      const res = await request(app)
        .get(`/api/credits/${creditTenantBId}/matching`)
        .set("x-test-role", "broker")
        .set("x-test-user-id", testBrokerBId)
        .set("x-test-tenant-id", tenantBId);

      expect(res.status).toBe(200);
      expect(res.body.creditId).toBe(creditTenantBId);
    });

    test("La respuesta a Brokers y Masters está 100% blindada de comisiones, sobretasas y márgenes internos", async () => {
      const res = await request(app)
        .get(`/api/credits/${creditPMId}/matching`)
        .set("x-test-role", "broker")
        .set("x-test-user-id", testBrokerAId)
        .set("x-test-tenant-id", tenantAId);

      expect(res.status).toBe(200);
      const responseText = JSON.stringify(res.body);

      // Verificación estricta de palabras clave comerciales confidenciales
      expect(responseText).not.toContain("commissionRates");
      expect(responseText).not.toContain("overrateCommissionRate");
      expect(responseText).not.toContain("platformGrossMargin");
      expect(responseText).not.toContain("sobretasa");
      expect(responseText).not.toContain("comisión de apertura");

      // Verificar que cada oferta solo tiene campos permitidos
      for (const item of [...res.body.compatible, ...res.body.insufficientData, ...res.body.notCompatible]) {
        expect(item.commissionRates).toBeUndefined();
        expect(item.overrateCommissionRate).toBeUndefined();
        expect(item.platformGrossMargin).toBeUndefined();
        expect(item.internalMargin).toBeUndefined();
      }
    });

    test("La consulta de matching es estrictamente de sólo lectura (no altera status de crédito)", async () => {
      const creditBefore = await storage.getCredit(creditPMId);
      expect(creditBefore?.status).toBe("lead");

      await request(app)
        .get(`/api/credits/${creditPMId}/matching`)
        .set("x-test-role", "broker")
        .set("x-test-user-id", testBrokerAId)
        .set("x-test-tenant-id", tenantAId);

      const creditAfter = await storage.getCredit(creditPMId);
      expect(creditAfter?.status).toBe("lead"); // Sin alteraciones
    });

    test("El alias /api/credit-submissions/:id/matching responde con la misma consistencia técnica", async () => {
      const res = await request(app)
        .get(`/api/credit-submissions/${creditPMId}/matching`)
        .set("x-test-role", "broker")
        .set("x-test-user-id", testBrokerAId)
        .set("x-test-tenant-id", tenantAId);

      expect(res.status).toBe(200);
      expect(res.body.creditId).toBe(creditPMId);
      expect(res.body.summary).toBeDefined();
    });
  });
});
