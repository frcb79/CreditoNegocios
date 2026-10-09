import {
  extractClientProfileType,
  extractCompanyAgeMonths,
  extractMonthlyRevenue,
  extractBureauStatus,
  extractRequestedAmount,
  extractRequestedTermMonths,
  extractHasGuarantee,
  extractHasGuarantor,
  extractApplicationVariables,
  VERIFIED_FIELDS_AUDIT_MAP,
} from "../../server/matching/fieldMapping";
import {
  evaluateOfferCompatibility,
  evaluateCatalogCompatibility,
  type ApplicationInput,
  type OfferVersionInput,
} from "../../server/matching/compatibilityEvaluator";
import { storage } from "../../server/storage";

describe("Matching M1 — Motor de Compatibilidad y Datos Reales", () => {
  describe("1. Auditoría de Variables y Mapeo Verificado (Sin Campos Ficticios)", () => {
    test("el mapa de auditoría contiene exclusivamente las 8 variables verificadas del sistema", () => {
      const keys = Object.keys(VERIFIED_FIELDS_AUDIT_MAP);
      expect(keys).toEqual([
        "creditAmount",
        "creditTermMonths",
        "clientProfileType",
        "companyAgeMonths",
        "monthlyRevenue",
        "bureauStatus",
        "hasGuarantee",
        "hasGuarantor",
      ]);

      for (const key of keys) {
        const item = VERIFIED_FIELDS_AUDIT_MAP[key as keyof typeof VERIFIED_FIELDS_AUDIT_MAP];
        expect(["credits", "clients"]).toContain(item.sourceTable);
        expect(item.sourceFields.length).toBeGreaterThan(0);
        expect(item.dataType).toBeDefined();
        expect(item.unit).toBeDefined();
        expect(item.description).toBeDefined();
      }
    });

    test("extractRequestedAmount normaliza números y cadenas con formato monetario", () => {
      expect(extractRequestedAmount({ amount: 1500000 })).toBe(1500000);
      expect(extractRequestedAmount({ requestedAmount: "$2,500,000.00" })).toBe(2500000);
      expect(extractRequestedAmount({}, { montoSolicitado: "350000" })).toBe(350000);
      expect(extractRequestedAmount({ amount: null })).toBeNull();
      expect(extractRequestedAmount({})).toBeNull();
    });

    test("extractRequestedTermMonths normaliza plazos numéricos y con texto", () => {
      expect(extractRequestedTermMonths({ term: 36 })).toBe(36);
      expect(extractRequestedTermMonths({}, { plazoDeseado: "24 meses" })).toBe(24);
      expect(extractRequestedTermMonths({ term: "12" })).toBe(12);
      expect(extractRequestedTermMonths({})).toBeNull();
    });

    test("extractClientProfileType normaliza perfiles fiscales reales", () => {
      expect(extractClientProfileType({ type: "persona_moral" })).toBe("persona_moral");
      expect(extractClientProfileType({ clientType: "pm" })).toBe("persona_moral");
      expect(extractClientProfileType({ type: "persona_fisica_con_actividad_empresarial" })).toBe("fisica_empresarial");
      expect(extractClientProfileType({ clientType: "pfae" })).toBe("fisica_empresarial");
      expect(extractClientProfileType({ type: "persona_fisica" })).toBe("fisica");
      expect(extractClientProfileType({ clientType: "asalariado" })).toBe("fisica");
      expect(extractClientProfileType({ type: "" })).toBeNull();
      expect(extractClientProfileType({})).toBeNull();
    });

    test("extractCompanyAgeMonths normaliza años y meses de operación", () => {
      // Años multiplicados por 12
      expect(extractCompanyAgeMonths({ yearsInBusiness: 3 })).toBe(36);
      expect(extractCompanyAgeMonths({ antiguedadAnios: "2.5" })).toBe(30);
      // Meses directos
      expect(extractCompanyAgeMonths({ companyAgeMonths: 18 })).toBe(18);
      // Rango o texto
      expect(extractCompanyAgeMonths({ businessAge: "mas_de_2_anios" })).toBe(24);
      expect(extractCompanyAgeMonths({})).toBeNull();
    });

    test("extractMonthlyRevenue calcula facturación mensual directa o promediada", () => {
      expect(extractMonthlyRevenue({ ingresoMensualPromedio: 450000 })).toBe(450000);
      expect(extractMonthlyRevenue({ monthlyRevenue: "$120,000.50" })).toBe(120000.5);
      // Derivada de ingreso anual
      expect(extractMonthlyRevenue({ ingresoAnual: 1200000 })).toBe(100000);
      expect(extractMonthlyRevenue({ facturacionMensual: "85000" })).toBe(85000);
      expect(extractMonthlyRevenue({})).toBeNull();
    });

    test("extractBureauStatus categoriza historial crediticio sin inventar información", () => {
      expect(extractBureauStatus({ atrasosDeudas: "al_corriente" })).toEqual({
        hasDelinquencies: false,
        rawStatus: "AL_CORRIENTE",
      });
      expect(extractBureauStatus({ buroEmpresa: "sin atrasos" })).toEqual({
        hasDelinquencies: false,
        rawStatus: "sin atrasos",
      });
      expect(extractBureauStatus({ atrasosDeudas: "si" })).toEqual({
        hasDelinquencies: true,
        rawStatus: "SI",
      });
      expect(extractBureauStatus({ buroEmpresa: "malo con quebranto" })).toEqual({
        hasDelinquencies: true,
        rawStatus: "malo con quebranto",
      });
      expect(extractBureauStatus({})).toEqual({
        hasDelinquencies: null,
        rawStatus: null,
      });
    });

    test("extractHasGuarantee y extractHasGuarantor identifican garantías y avales", () => {
      expect(extractHasGuarantee({ garantia: "si", garantiaDetalles: { tipo: "inmueble" } })).toEqual({
        hasGuarantee: true,
        guaranteeType: "inmueble",
      });
      expect(extractHasGuarantee({ garantia: "no" })).toEqual({
        hasGuarantee: false,
        guaranteeType: "sin_garantia",
      });
      expect(extractHasGuarantee({})).toEqual({
        hasGuarantee: null,
        guaranteeType: null,
      });

      expect(extractHasGuarantor({ avalObligadoSolidario: "si" })).toBe(true);
      expect(extractHasGuarantor({ avalObligadoSolidario: "no" })).toBe(false);
      expect(extractHasGuarantor({})).toBeNull();
    });

    test("extractApplicationVariables genera el snapshot completo de la solicitud", () => {
      const credit = {
        amount: 2000000,
        term: 24,
      };
      const client = {
        type: "persona_moral",
        yearsInBusiness: 4,
        ingresoMensualPromedio: 600000,
        atrasosDeudas: "al_corriente",
        garantia: "si",
        avalObligadoSolidario: "si",
      };

      const extracted = extractApplicationVariables(credit, client);
      expect(extracted.requestedAmount).toBe(2000000);
      expect(extracted.requestedTermMonths).toBe(24);
      expect(extracted.clientProfileType).toBe("persona_moral");
      expect(extracted.companyAgeMonths).toBe(48);
      expect(extracted.monthlyRevenue).toBe(600000);
      expect(extracted.bureauStatus.hasDelinquencies).toBe(false);
      expect(extracted.hasGuarantee.hasGuarantee).toBe(true);
      expect(extracted.hasGuarantor).toBe(true);
    });
  });

  describe("2. Evaluador de Compatibilidad — Caso COMPATIBLE", () => {
    const candidateApp: ApplicationInput = {
      credit: {
        amount: 1500000,
        term: 24,
      },
      client: {
        type: "persona_moral",
        yearsInBusiness: 3,
        ingresoMensualPromedio: 500000,
        atrasosDeudas: "al_corriente",
        garantia: "si",
        avalObligadoSolidario: "si",
      },
    };

    const publishedOffer: OfferVersionInput = {
      product: {
        id: "off-comp-1",
        name: "Crédito Pyme Expansión",
        institutionId: "inst-1",
        targetProfiles: ["persona_moral", "fisica_empresarial"],
      },
      version: {
        id: "ver-comp-1",
        institutionProductId: "off-comp-1",
        versionNumber: 1,
        status: "published",
        conditions: {
          minAmount: 500000,
          maxAmount: 3000000,
          minTermMonths: 12,
          maxTermMonths: 36,
          minCompanyAgeMonths: 24,
          minMonthlyRevenue: 300000,
          bureauRequirement: "sin_atrasos",
          guaranteeType: "general",
          avalesType: "aval_requerido",
        },
        requirements: {
          targetProfiles: ["persona_moral", "fisica_empresarial"],
        },
      },
    };

    test("retorna COMPATIBLE cuando todos los criterios configurados se satisfacen", () => {
      const result = evaluateOfferCompatibility(candidateApp, publishedOffer);

      expect(result.status).toBe("COMPATIBLE");
      expect(result.criteria.failed).toHaveLength(0);
      expect(result.criteria.missing).toHaveLength(0);
      expect(result.criteria.matched.length).toBeGreaterThanOrEqual(7);
      expect(result.summary).toContain("Compatible: cumple con éxito");
    });
  });

  describe("3. Evaluador de Compatibilidad — Caso NOT_COMPATIBLE (Con Razones Explícitas)", () => {
    const baseOffer: OfferVersionInput = {
      product: {
        id: "off-notcomp-1",
        name: "Crédito Pyme Restrictivo",
        institutionId: "inst-1",
      },
      version: {
        id: "ver-notcomp-1",
        institutionProductId: "off-notcomp-1",
        versionNumber: 1,
        status: "published",
        conditions: {
          minAmount: 1000000,
          maxAmount: 5000000,
          minTermMonths: 12,
          maxTermMonths: 48,
          minCompanyAgeMonths: 24,
          minMonthlyRevenue: 400000,
          bureauRequirement: "sin_atrasos",
          guaranteeType: "inmueble",
        },
        requirements: {
          targetProfiles: ["persona_moral"],
        },
      },
    };

    test("rechaza explícitamente si el monto solicitado supera el límite máximo", () => {
      const app: ApplicationInput = {
        credit: { amount: 7000000, term: 24 }, // Excede 5M
        client: {
          type: "persona_moral",
          yearsInBusiness: 3,
          ingresoMensualPromedio: 600000,
          atrasosDeudas: "al_corriente",
          garantia: "si",
        },
      };

      const result = evaluateOfferCompatibility(app, baseOffer);
      expect(result.status).toBe("NOT_COMPATIBLE");
      expect(result.criteria.failed).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "creditAmount",
            reason: expect.stringContaining("superior al máximo permitido"),
          }),
        ])
      );
    });

    test("rechaza explícitamente si el perfil fiscal no es aceptado por la oferta", () => {
      const app: ApplicationInput = {
        credit: { amount: 2000000, term: 24 },
        client: {
          type: "persona_fisica", // Oferta solo acepta persona_moral
          yearsInBusiness: 3,
          ingresoMensualPromedio: 600000,
          atrasosDeudas: "al_corriente",
          garantia: "si",
        },
      };

      const result = evaluateOfferCompatibility(app, baseOffer);
      expect(result.status).toBe("NOT_COMPATIBLE");
      expect(result.criteria.failed).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "targetProfiles",
            reason: expect.stringContaining("no está admitido por esta oferta"),
          }),
        ])
      );
    });

    test("rechaza explícitamente si la antigüedad del negocio es menor a la requerida", () => {
      const app: ApplicationInput = {
        credit: { amount: 2000000, term: 24 },
        client: {
          type: "persona_moral",
          yearsInBusiness: 1, // 12 meses < 24 meses
          ingresoMensualPromedio: 600000,
          atrasosDeudas: "al_corriente",
          garantia: "si",
        },
      };

      const result = evaluateOfferCompatibility(app, baseOffer);
      expect(result.status).toBe("NOT_COMPATIBLE");
      expect(result.criteria.failed).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "companyAge",
            reason: expect.stringContaining("no cumple el mínimo requerido"),
          }),
        ])
      );
    });

    test("rechaza explícitamente si el historial en buró de crédito excede la tolerancia", () => {
      const app: ApplicationInput = {
        credit: { amount: 2000000, term: 24 },
        client: {
          type: "persona_moral",
          yearsInBusiness: 3,
          ingresoMensualPromedio: 600000,
          atrasosDeudas: "si", // Con atrasos
          garantia: "si",
        },
      };

      const result = evaluateOfferCompatibility(app, baseOffer);
      expect(result.status).toBe("NOT_COMPATIBLE");
      expect(result.criteria.failed).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "bureauRequirement",
            reason: expect.stringContaining("el cliente presenta incidencias o atrasos"),
          }),
        ])
      );
    });

    test("rechaza explícitamente si se requiere garantía y la solicitud carece de ella", () => {
      const app: ApplicationInput = {
        credit: { amount: 2000000, term: 24 },
        client: {
          type: "persona_moral",
          yearsInBusiness: 3,
          ingresoMensualPromedio: 600000,
          atrasosDeudas: "al_corriente",
          garantia: "no", // Sin garantía
        },
      };

      const result = evaluateOfferCompatibility(app, baseOffer);
      expect(result.status).toBe("NOT_COMPATIBLE");
      expect(result.criteria.failed).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "guaranteeType",
            reason: expect.stringContaining("el cliente declaró no contar con garantía"),
          }),
        ])
      );
    });
  });

  describe("4. Evaluador de Compatibilidad — Caso INSUFFICIENT_DATA (Sin Falsos Rechazos ni Aprobaciones Falsas)", () => {
    const strictOffer: OfferVersionInput = {
      product: {
        id: "off-strict-1",
        name: "Oferta con Requisitos Financieros",
        institutionId: "inst-1",
      },
      version: {
        id: "ver-strict-1",
        institutionProductId: "off-strict-1",
        versionNumber: 1,
        status: "published",
        conditions: {
          minAmount: 1000000,
          maxAmount: 5000000,
          minMonthlyRevenue: 500000, // Requiere facturación
          minCompanyAgeMonths: 24,   // Requiere antigüedad
        },
        requirements: {
          targetProfiles: ["persona_moral"],
        },
      },
    };

    test("clasifica como INSUFFICIENT_DATA cuando faltan variables requeridas sin rechazarlas como falsos negativos", () => {
      const appWithMissingData: ApplicationInput = {
        credit: { amount: 2000000 }, // Cumple
        client: {
          type: "persona_moral", // Cumple
          // DATO AUSENTE: sin facturación y sin antigüedad
        },
      };

      const result = evaluateOfferCompatibility(appWithMissingData, strictOffer);

      expect(result.status).toBe("INSUFFICIENT_DATA");
      expect(result.criteria.failed).toHaveLength(0); // CERO rechazos inventados
      expect(result.criteria.missing).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "companyAge" }),
          expect.objectContaining({ code: "monthlyRevenue" }),
        ])
      );
      expect(result.summary).toContain("Información insuficiente");
    });

    test("si hay un criterio verificable que falla, prevalece NOT_COMPATIBLE sobre INSUFFICIENT_DATA", () => {
      const appWithFailAndMissing: ApplicationInput = {
        credit: { amount: 15000000 }, // FALLA CLARAMENTE (Máx 5M)
        client: {
          type: "persona_moral",
          // monthlyRevenue ausente
        },
      };

      const result = evaluateOfferCompatibility(appWithFailAndMissing, strictOffer);

      expect(result.status).toBe("NOT_COMPATIBLE");
      expect(result.criteria.failed.length).toBeGreaterThanOrEqual(1);
      expect(result.criteria.missing.length).toBeGreaterThanOrEqual(1);
    });

    test("evaluateCatalogCompatibility agrupa ofertas objetivamente por estatus", () => {
      const app: ApplicationInput = {
        credit: { amount: 2000000, term: 24 },
        client: {
          type: "persona_moral",
          yearsInBusiness: 3,
        },
      };

      const offers: OfferVersionInput[] = [
        {
          product: { id: "off-comp", name: "Oferta Compatible" },
          version: {
            id: "v-comp",
            versionNumber: 1,
            status: "published",
            conditions: { minAmount: 1000000, maxAmount: 3000000 },
            requirements: { targetProfiles: ["persona_moral"] },
          },
        },
        {
          product: { id: "off-incom", name: "Oferta Incompatible" },
          version: {
            id: "v-incom",
            versionNumber: 1,
            status: "published",
            conditions: { minAmount: 5000000, maxAmount: 10000000 }, // Monto 2M está por debajo de min 5M
          },
        },
        {
          product: { id: "off-missing", name: "Oferta con Requisito Faltante" },
          version: {
            id: "v-missing",
            versionNumber: 1,
            status: "published",
            conditions: { minMonthlyRevenue: 500000 }, // Cliente no tiene facturación capturada
          },
        },
      ];

      const results = evaluateCatalogCompatibility(app, offers);
      expect(results.all).toHaveLength(3);
      expect(results.compatible).toHaveLength(1);
      expect(results.compatible[0].offerId).toBe("off-comp");
      expect(results.notCompatible).toHaveLength(1);
      expect(results.notCompatible[0].offerId).toBe("off-incom");
      expect(results.insufficientData).toHaveLength(1);
      expect(results.insufficientData[0].offerId).toBe("off-missing");
    });
  });

  describe("5. Imparcialidad Comercial — Cero Sesgo por Comisiones o Márgenes", () => {
    test("las comisiones y márgenes no influyen en el dictamen de compatibilidad", () => {
      const app: ApplicationInput = {
        credit: { amount: 2000000, term: 24 },
        client: {
          type: "persona_moral",
          yearsInBusiness: 3,
          ingresoMensualPromedio: 500000,
        },
      };

      // Oferta A: Comisión baja (Financiera paga 2%)
      const offerLowCommission: OfferVersionInput = {
        product: { id: "off-low-comm", name: "Financiera A - Comisión Baja", institutionId: "inst-a" },
        version: {
          id: "v-low",
          versionNumber: 1,
          status: "published",
          conditions: {
            minAmount: 1000000,
            maxAmount: 3000000,
            commissionRates: {
              financiera: { total: "2.0" },
              broker: { total: "1.0" },
              platformGrossMarginDirect: 1.0,
            },
          },
          requirements: { targetProfiles: ["persona_moral"] },
        },
      };

      // Oferta B: Comisión altísima (Financiera paga 10%)
      const offerHighCommission: OfferVersionInput = {
        product: { id: "off-high-comm", name: "Financiera B - Comisión Alta", institutionId: "inst-b" },
        version: {
          id: "v-high",
          versionNumber: 1,
          status: "published",
          conditions: {
            minAmount: 1000000,
            maxAmount: 3000000,
            commissionRates: {
              financiera: { total: "10.0" },
              broker: { total: "5.0" },
              platformGrossMarginDirect: 5.0,
            },
          },
          requirements: { targetProfiles: ["persona_moral"] },
        },
      };

      const resultLow = evaluateOfferCompatibility(app, offerLowCommission);
      const resultHigh = evaluateOfferCompatibility(app, offerHighCommission);

      // Ambas reciben exactamente el mismo dictamen objetivo sin favorecer a la de mayor comisión
      expect(resultLow.status).toBe("COMPATIBLE");
      expect(resultHigh.status).toBe("COMPATIBLE");
      expect(resultLow.criteria.failed).toEqual(resultHigh.criteria.failed);
      expect(resultLow.criteria.missing).toEqual(resultHigh.criteria.missing);
    });
  });

  describe("6. Preservación de Metadatos de Versiones Futuras y Promoción al Publicar", () => {
    let institutionId: string;
    let productId: string;
    let v1Id: string;

    beforeAll(async () => {
      institutionId = "inst-m1-meta-" + Date.now();
      await storage.createFinancialInstitution({
        id: institutionId,
        name: "Financiera Metadatos M1",
        email: "meta@m1.com",
        isActive: true,
      } as any);

      // Crear oferta canónica v1 inicial
      const createdProduct = await storage.createInstitutionProduct(
        {
          financialInstitutionId: institutionId,
          name: "Crédito Pyme v1 Original",
          description: "Descripción v1 original",
          productType: "credito_revolvente",
          targetProfiles: ["persona_moral"],
          status: "draft",
          isActive: true,
        } as any,
        {
          versionNumber: 1,
          status: "draft",
          conditions: { minAmount: 100000, maxAmount: 1000000, minTermMonths: 6, maxTermMonths: 24 },
          requirements: { targetProfiles: ["persona_moral"] },
          changeReason: "Borrador inicial",
        } as any
      );

      productId = createdProduct.id;
      const versions = await storage.getInstitutionProductVersions(productId);
      v1Id = versions[0].id;

      // Publicar v1
      await storage.publishInstitutionProductVersion(productId, v1Id, {
        publishedBy: "super-admin",
        changeReason: "Lanzamiento v1",
      });
    });

    test("crear un borrador v2 con metadatos descriptivos futuros NO contamina la v1 publicada", async () => {
      // 1. Crear borrador v2 con futureMetadata
      const v2Draft = await storage.createInstitutionProductDraftVersion(productId, {
        conditions: { minAmount: 200000, maxAmount: 2000000, minTermMonths: 12, maxTermMonths: 36 },
        requirements: { targetProfiles: ["persona_moral"] },
        changeReason: "Preparando v2",
        variablesConfiguration: {
          futureMetadata: {
            name: "Crédito Pyme v2 Renovado",
            description: "Nueva descripción v2 con mayores montos",
            productType: "simple",
          },
        },
      } as any);

      // 2. Verificar que el producto padre todavía tiene los metadatos de v1
      const parentBeforePublish = await storage.getInstitutionProduct(productId);
      expect(parentBeforePublish?.name).toBe("Crédito Pyme v1 Original");
      expect(parentBeforePublish?.description).toBe("Descripción v1 original");
      expect(parentBeforePublish?.productType).toBe("credito_revolvente");
      expect(parentBeforePublish?.currentVersionNumber).toBe(1);

      // 3. Publicar v2
      await storage.publishInstitutionProductVersion(productId, v2Draft.id, {
        publishedBy: "super-admin",
        changeReason: "Lanzamiento v2 con nueva marca",
      });

      // 4. Ahora sí, los metadatos descriptivos de v2 fueron promovidos al producto padre transaccionalmente
      const parentAfterPublish = await storage.getInstitutionProduct(productId);
      expect(parentAfterPublish?.name).toBe("Crédito Pyme v2 Renovado");
      expect(parentAfterPublish?.description).toBe("Nueva descripción v2 con mayores montos");
      expect(parentAfterPublish?.productType).toBe("simple");
      expect(parentAfterPublish?.currentVersionNumber).toBe(2);
    });
  });
});
