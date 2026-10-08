import { storage } from "../../server/storage";
import { computeOfferVersionHash, validateOfferVersionParameters } from "../../server/offerVersionService";

describe("Bloque A1 — Arquitectura de Ofertas por Financiera y Versionado Aditivo", () => {
  const institutionId = "fin-test-a1-" + Date.now();

  beforeAll(async () => {
    // Asegurar que la financiera de prueba exista en storage
    await storage.createFinancialInstitution({
      id: institutionId,
      name: "Banco Comercial Santander Test",
      email: "contacto@santander-test.com",
      isActive: true,
    } as any);
  });

  describe("Requisito 2: Múltiples ofertas del mismo tipo por financiera", () => {
    it("debe permitir crear múltiples ofertas con el mismo productType para una misma financiera sin colisiones", async () => {
      // Oferta 1: Crédito Simple Express (sin garantía)
      const res1 = await storage.createOffer(
        {
          institutionId,
          name: "Crédito Simple PyME Express",
          productType: "credito_simple",
          description: "Crédito simple ágil sin garantía hipotecaria",
          isActive: true,
        },
        {
          conditions: {
            minAmount: 100000,
            maxAmount: 2000000,
            minInterestRate: 20.5,
            maxInterestRate: 28.0,
            defaultInterestRate: 24.0,
            minTermMonths: 6,
            maxTermMonths: 36,
            guaranteeRequired: false,
          },
          requirements: {
            targetProfiles: ["persona_moral", "fisica_empresarial"],
            minYearsInOperation: 2,
          },
          changeReason: "Alta inicial oferta express",
        }
      );

      // Oferta 2: Crédito Simple Corporativo con Garantía (mismo productType: 'credito_simple')
      const res2 = await storage.createOffer(
        {
          institutionId,
          name: "Crédito Simple con Garantía Real",
          productType: "credito_simple",
          description: "Crédito simple de montos mayores con garantía hipotecaria",
          isActive: true,
        },
        {
          conditions: {
            minAmount: 2000000,
            maxAmount: 15000000,
            minInterestRate: 14.5,
            maxInterestRate: 19.5,
            defaultInterestRate: 16.0,
            minTermMonths: 12,
            maxTermMonths: 60,
            guaranteeRequired: true,
            guaranteeType: "hipotecaria",
          },
          requirements: {
            targetProfiles: ["persona_moral"],
            minYearsInOperation: 3,
          },
          changeReason: "Alta inicial oferta corporativa con garantía",
        }
      );

      expect(res1.offer.id).toBeDefined();
      expect(res2.offer.id).toBeDefined();
      expect(res1.offer.id).not.toBe(res2.offer.id);
      expect(res1.offer.productType).toBe("credito_simple");
      expect(res2.offer.productType).toBe("credito_simple");

      // Consultar ofertas por productType para esta financiera
      const sameTypeOffers = await storage.getOffersByProductType(institutionId, "credito_simple");
      expect(sameTypeOffers.length).toBeGreaterThanOrEqual(2);

      const offerNames = sameTypeOffers.map(o => o.name);
      expect(offerNames).toContain("Crédito Simple PyME Express");
      expect(offerNames).toContain("Crédito Simple con Garantía Real");
    });
  });

  describe("Requisito 1: Versionado aditivo de ofertas", () => {
    it("debe crear automáticamente la versión 1 activa al registrar una nueva oferta", async () => {
      const { offer, version } = await storage.createOffer(
        {
          institutionId,
          name: "Línea Revolvente Flexible",
          productType: "credito_revolvente",
          description: "Línea de crédito revolvente para capital de trabajo",
        },
        {
          conditions: {
            minAmount: 500000,
            maxAmount: 5000000,
            defaultInterestRate: 22.0,
            paymentFrequency: ["mensual"],
          },
          requirements: {
            minAnnualRevenue: 5000000,
          },
          changeReason: "Creación v1",
        }
      );

      expect(offer.currentVersionNumber).toBe(1);
      expect(version.offerId).toBe(offer.id);
      expect(version.versionNumber).toBe(1);
      expect(version.status).toBe("active");
      expect(version.effectiveFrom).toBeDefined();
      expect(version.effectiveTo).toBeNull();
      expect(version.versionHash).toBeDefined();
      expect(typeof version.versionHash).toBe("string");
      expect(version.versionHash?.length).toBe(64); // SHA-256 hex string

      const activeVer = await storage.getActiveOfferVersion(offer.id);
      expect(activeVer).toBeDefined();
      expect(activeVer?.id).toBe(version.id);
      expect(activeVer?.versionNumber).toBe(1);
    });

    it("debe crear la versión 2 additivamente, marcar la versión 1 como 'superseded' y actualizar la oferta", async () => {
      // 1. Crear oferta inicial
      const { offer, version: v1 } = await storage.createOffer(
        {
          institutionId,
          name: "Factoraje a Proveedores",
          productType: "factoraje",
        },
        {
          conditions: { minInterestRate: 18.0, maxInterestRate: 24.0 },
          changeReason: "Versión base",
        }
      );

      // 2. Crear nueva versión 2 con tasas actualizadas
      const v2 = await storage.createOfferVersion(offer.id, {
        conditions: { minInterestRate: 16.5, maxInterestRate: 22.0 },
        requirements: { targetProfiles: ["persona_moral"] },
        changeReason: "Ajuste trimestral por reducción de tasa de referencia TIIE",
      });

      expect(v2.offerId).toBe(offer.id);
      expect(v2.versionNumber).toBe(2);
      expect(v2.status).toBe("active");
      expect(v2.effectiveTo).toBeNull();
      expect(v2.versionHash).toBeDefined();
      expect(v2.versionHash).not.toBe(v1.versionHash);

      // 3. Verificar que la versión 1 sigue existiendo pero como superseded
      const v1Actualizada = await storage.getOfferVersion(v1.id);
      expect(v1Actualizada).toBeDefined();
      expect(v1Actualizada?.versionNumber).toBe(1);
      expect(v1Actualizada?.status).toBe("superseded");
      expect(v1Actualizada?.effectiveTo).toBeDefined();
      // Las condiciones de v1 deben mantenerse inmutables
      expect(v1Actualizada?.conditions).toEqual({ minInterestRate: 18.0, maxInterestRate: 24.0 });

      // 4. Verificar que la oferta padre refleja la versión actual 2
      const updatedOffer = await storage.getOffer(offer.id);
      expect(updatedOffer?.currentVersionNumber).toBe(2);

      // 5. Histórico completo de versiones
      const versions = await storage.getOfferVersions(offer.id);
      expect(versions.length).toBe(2);
      expect(versions[0].versionNumber).toBe(2); // Ordenado descendente
      expect(versions[1].versionNumber).toBe(1);

      // 6. La versión activa debe ser la v2
      const activeVer = await storage.getActiveOfferVersion(offer.id);
      expect(activeVer?.id).toBe(v2.id);
      expect(activeVer?.versionNumber).toBe(2);
    });

    it("calcula hash SHA-256 determinista para las versiones", () => {
      const hash1 = computeOfferVersionHash({
        offerId: "test-off-1",
        versionNumber: 1,
        conditions: { rate: 20 },
        requirements: { minRev: 1000 },
      });

      const hash2 = computeOfferVersionHash({
        offerId: "test-off-1",
        versionNumber: 1,
        conditions: { rate: 20 },
        requirements: { minRev: 1000 },
      });

      const hashDifferent = computeOfferVersionHash({
        offerId: "test-off-1",
        versionNumber: 1,
        conditions: { rate: 21 }, // diferente tasa
        requirements: { minRev: 1000 },
      });

      expect(hash1).toBe(hash2);
      expect(hash1).not.toBe(hashDifferent);
    });

    it("valida consistencia de parámetros numéricos min/max", () => {
      const valid = validateOfferVersionParameters({
        conditions: { minAmount: 100, maxAmount: 500, minInterestRate: 10, maxInterestRate: 20 },
      });
      expect(valid.isValid).toBe(true);

      const invalid = validateOfferVersionParameters({
        conditions: { minAmount: 500, maxAmount: 100 }, // min > max
      });
      expect(invalid.isValid).toBe(false);
      expect(invalid.errors).toContain("minAmount no puede ser mayor que maxAmount");
    });
  });

  describe("Requisito 3: Preservación de datos y funcionamiento existente", () => {
    it("debe conservar institution_products y product_templates operativos", async () => {
      // 1. Crear product_template tradicional
      const template = await storage.createProductTemplate({
        name: "Crédito Arrendamiento Clásico",
        category: "business",
        targetProfiles: ["persona_moral"],
        baseConfiguration: { term: 36 },
        createdBy: "system-admin-test",
      });
      expect(template.id).toBeDefined();

      // 2. Crear institution_product tradicional
      const instProd = await storage.createInstitutionProduct({
        templateId: template.id,
        institutionId,
        customName: "Arrendamiento Puro Santander",
        configuration: { leaseRate: 15.0 },
        createdBy: "system-admin-test",
      });
      expect(instProd.id).toBeDefined();

      // 3. Crear una nueva oferta vinculándola aditivamente con institution_product
      const { offer } = await storage.createOffer({
        institutionId,
        templateId: template.id,
        institutionProductId: instProd.id,
        name: "Oferta Arrendamiento Financiero Flotillas",
        productType: "arrendamiento",
      });

      expect(offer.institutionProductId).toBe(instProd.id);
      expect(offer.templateId).toBe(template.id);

      // 4. Verificar que el institution_product original sigue intacto y legible
      const fetchedInstProd = await storage.getInstitutionProduct(instProd.id);
      expect(fetchedInstProd).toBeDefined();
      expect(fetchedInstProd?.customName).toBe("Arrendamiento Puro Santander");
    });

    it("soporta filtros por institución y estado activo", async () => {
      const { offer: activeOffer } = await storage.createOffer({
        institutionId,
        name: "Oferta Activa",
        productType: "tipo_a",
        isActive: true,
      });

      const { offer: inactiveOffer } = await storage.createOffer({
        institutionId,
        name: "Oferta Inactiva",
        productType: "tipo_b",
        isActive: false,
      });

      const activeOnly = await storage.getOffersByInstitution(institutionId, { includeInactive: false });
      const activeIds = activeOnly.map(o => o.id);
      expect(activeIds).toContain(activeOffer.id);
      expect(activeIds).not.toContain(inactiveOffer.id);

      const allOffers = await storage.getOffersByInstitution(institutionId, { includeInactive: true });
      const allIds = allOffers.map(o => o.id);
      expect(allIds).toContain(activeOffer.id);
      expect(allIds).toContain(inactiveOffer.id);
    });
  });

  describe("Requisito 4 & Regla Crítica: Aislamiento estricto de comisiones internas", () => {
    it("asegura que las entidades de oferta y versión no exponen comisiones internas de plataforma", async () => {
      const { offer, version } = await storage.createOffer(
        {
          institutionId,
          name: "Oferta Auditoría Seguridad",
          productType: "credito_simple",
        },
        {
          conditions: {
            clientInterestRate: 20.0,
            clientOpeningCommission: 2.0,
          },
        }
      );

      // Ningún campo de comisión interna debe existir en la entidad de oferta
      expect((offer as any).appShare).toBeUndefined();
      expect((offer as any).internalSpread).toBeUndefined();
      expect((offer as any).masterBrokerCommissionRate).toBeUndefined();

      // Ningún campo de comisión interna en la versión
      expect((version as any).appCommission).toBeUndefined();
      expect((version as any).platformShare).toBeUndefined();
    });
  });
});
