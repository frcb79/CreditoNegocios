import { storage } from "../../server/storage";
import { isOfferEligibleForRequests } from "../../server/offerVersionService";

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
});
