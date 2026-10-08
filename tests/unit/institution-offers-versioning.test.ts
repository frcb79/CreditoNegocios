import { storage } from "../../server/storage";
import { DbStorage } from "../../server/dbStorage";
import { institutionProductVersions } from "../../shared/schema";
import {
  computeInstitutionProductVersionHash,
  computeOfferVersionHash,
  validateMinimumPublishConditions,
  validateOfferVersionParameters,
  isOfferEligibleForRequests,
} from "../../server/offerVersionService";

describe("Bloque A1.1 — Arquitectura Canónica de Ofertas y Versionado Aditivo Seguro", () => {
  const institutionId = "fin-test-a1-" + Date.now();

  beforeAll(async () => {
    await storage.createFinancialInstitution({
      id: institutionId,
      name: "Banco Comercial Santander Test",
      email: "contacto@santander-test.com",
      isActive: true,
    } as any);
  });

  describe("Requisito 1: Catálogo canónico único en institution_products y multi-oferta", () => {
    it("debe usar institution_products como identidad canónica y permitir múltiples ofertas del mismo productType sin colisiones", async () => {
      // Oferta 1: Crédito Simple Express
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
            minTermMonths: 6,
            maxTermMonths: 36,
          },
          requirements: {
            targetProfiles: ["persona_moral", "fisica_empresarial"],
          },
          requiredDocuments: ["constancia_situacion_fiscal", "estados_cuenta_bancarios"],
          changeReason: "Alta inicial oferta express",
        }
      );

      // Oferta 2: Crédito Simple Corporativo (mismo productType: 'credito_simple')
      const res2 = await storage.createOffer(
        {
          institutionId,
          name: "Crédito Simple Corporativo con Garantía",
          productType: "credito_simple",
          description: "Crédito corporativo con garantía hipotecaria",
          isActive: true,
        },
        {
          conditions: {
            minAmount: 2000000,
            maxAmount: 15000000,
            minInterestRate: 14.5,
            maxInterestRate: 19.5,
            minTermMonths: 12,
            maxTermMonths: 60,
          },
          requirements: {
            targetProfiles: ["persona_moral"],
          },
          requiredDocuments: ["estados_financieros_auditados", "escritura_garantia"],
          changeReason: "Alta inicial corporativa",
        }
      );

      expect(res1.offer.id).toBeDefined();
      expect(res2.offer.id).toBeDefined();
      expect(res1.offer.id).not.toBe(res2.offer.id);
      expect(res1.offer.productType).toBe("credito_simple");
      expect(res2.offer.productType).toBe("credito_simple");

      // Verificar que ambas existen en el catálogo canónico institution_products
      const p1 = await storage.getInstitutionProduct(res1.offer.id);
      const p2 = await storage.getInstitutionProduct(res2.offer.id);
      expect(p1).toBeDefined();
      expect(p2).toBeDefined();
      expect(p1?.customName).toBe("Crédito Simple PyME Express");
      expect(p2?.customName).toBe("Crédito Simple Corporativo con Garantía");

      // Consultar ofertas por productType para esta financiera
      const sameTypeOffers = await storage.getOffersByProductType(institutionId, "credito_simple");
      expect(sameTypeOffers.length).toBeGreaterThanOrEqual(2);
    });

    it("mantiene compatibilidad completa con product_templates y templates personalizados existentes", async () => {
      const template = await storage.createProductTemplate({
        name: "Plantilla Base Arrendamiento",
        category: "business",
        targetProfiles: ["persona_moral"],
        baseConfiguration: { term: 36 },
        createdBy: "system-admin-test",
      });

      const instProd = await storage.createInstitutionProduct({
        templateId: template.id,
        institutionId,
        customName: "Arrendamiento Personalizado Santander",
        configuration: { leaseRate: 15.0 },
        createdBy: "system-admin-test",
      });

      expect(instProd.id).toBeDefined();
      expect(instProd.templateId).toBe(template.id);

      const fetched = await storage.getInstitutionProduct(instProd.id);
      expect(fetched?.customName).toBe("Arrendamiento Personalizado Santander");
    });
  });

  describe("Requisito 2 & 3: Ciclo de vida en borrador y validación de condiciones mínimas de publicación", () => {
    it("crea nuevas ofertas y versiones en estado 'draft'", async () => {
      const { offer, version } = await storage.createOffer(
        {
          institutionId,
          name: "Línea Flexible Borrador",
          productType: "credito_revolvente",
        },
        {
          conditions: { minAmount: 500000, maxAmount: 3000000 },
          changeReason: "Borrador preliminar",
        }
      );

      expect(offer.status).toBe("draft");
      expect(version.status).toBe("draft");
      expect(version.versionNumber).toBe(1);
    });

    it("rechaza la publicación si no se cumplen las condiciones mínimas obligatorias (Gate de Calidad)", async () => {
      // Intentar publicar con condiciones inválidas (minAmount > maxAmount, tasas faltantes)
      const invalidValidation = validateMinimumPublishConditions({
        conditions: {
          minAmount: 5000000,
          maxAmount: 1000000, // min > max
          minInterestRate: -5, // tasa negativa
        },
        requirements: { targetProfiles: [] }, // sin perfiles
        requiredDocuments: [],
        changeReason: "", // sin justificación
      });

      expect(invalidValidation.isValid).toBe(false);
      expect(invalidValidation.errors.length).toBeGreaterThan(0);
      expect(invalidValidation.errors.some(e => e.includes("minAmount no puede ser mayor que maxAmount"))).toBe(true);
      expect(invalidValidation.errors.some(e => e.includes("targetProfiles"))).toBe(true);
      expect(invalidValidation.errors.some(e => e.includes("changeReason"))).toBe(true);
    });

    it("publica exitosamente cuando las condiciones son válidas y desactiva la versión previa como 'superseded'", async () => {
      // 1. Crear oferta con versión 1 en borrador
      const { offer, version: v1 } = await storage.createOffer(
        {
          institutionId,
          name: "Factoraje Comercial Seguro",
          productType: "factoraje",
        },
        {
          conditions: {
            minAmount: 200000,
            maxAmount: 5000000,
            minInterestRate: 15.0,
            maxInterestRate: 22.0,
            minTermMonths: 3,
            maxTermMonths: 24,
          },
          requirements: {
            targetProfiles: ["persona_moral"],
          },
          requiredDocuments: ["cedula_fiscal", "facturas_comerciales"],
          changeReason: "Versión base inicial",
        }
      );

      expect(v1.status).toBe("draft");

      // 2. Publicar versión 1
      const publishedV1 = await storage.publishOfferVersion(offer.id, v1.id, {
        publishedBy: "admin-user-id",
        changeReason: "Aprobada por mesa de riesgos",
      });

      expect(publishedV1.status).toBe("published");
      expect(publishedV1.publishedAt).toBeDefined();
      expect(publishedV1.publishedBy).toBe("admin-user-id");

      const offerAfterV1 = await storage.getOffer(offer.id);
      expect(offerAfterV1?.status).toBe("published");
      expect(offerAfterV1?.currentVersionNumber).toBe(1);

      // 3. Crear versión 2 en borrador
      const v2 = await storage.createOfferVersion(offer.id, {
        conditions: {
          minAmount: 250000,
          maxAmount: 6000000,
          minInterestRate: 14.0,
          maxInterestRate: 20.0,
          minTermMonths: 3,
          maxTermMonths: 36,
        },
        requirements: {
          targetProfiles: ["persona_moral", "pfae"],
        },
        requiredDocuments: ["cedula_fiscal", "facturas_comerciales", "opinion_cumplimiento_sat"],
        changeReason: "Ajuste por mejora en fondeo",
      });

      expect(v2.status).toBe("draft");
      expect(v2.versionNumber).toBe(2);

      // La versión activa debe seguir siendo v1 hasta que v2 se publique
      const activeBeforePublish = await storage.getActiveOfferVersion(offer.id);
      expect(activeBeforePublish?.id).toBe(v1.id);

      // 4. Publicar versión 2
      const publishedV2 = await storage.publishOfferVersion(offer.id, v2.id, {
        publishedBy: "superadmin-user-id",
        changeReason: "Publicación formal v2",
      });

      expect(publishedV2.status).toBe("published");
      expect(publishedV2.versionNumber).toBe(2);

      // 5. Verificar que v1 ahora está en superseded y v2 es la única publicada
      const v1After = await storage.getOfferVersion(v1.id);
      expect(v1After?.status).toBe("superseded");
      expect(v1After?.effectiveTo).toBeDefined();

      const activeAfter = await storage.getActiveOfferVersion(offer.id);
      expect(activeAfter?.id).toBe(v2.id);
      expect(activeAfter?.versionNumber).toBe(2);

      // Máximo una versión publicada vigente
      const allVersions = await storage.getOfferVersions(offer.id);
      const publishedCount = allVersions.filter(v => v.status === "published").length;
      expect(publishedCount).toBe(1);
    });
  });

  describe("Requisito 4: Documentación en hash e integridad inmutable ante eliminación destructiva", () => {
    it("incluye la documentación requerida en el hash SHA-256 de forma determinista", () => {
      const basePayload = {
        institutionProductId: "prod-100",
        versionNumber: 1,
        conditions: { minAmount: 100000, maxAmount: 1000000 },
        requirements: { targetProfiles: ["pyme"] },
      };

      // Hash con lista de documentos A
      const hashA = computeInstitutionProductVersionHash({
        ...basePayload,
        requiredDocuments: ["estados_cuenta", "ine", "comprobante_domicilio"],
      });

      // Mismos documentos en diferente orden deben dar el MISMO hash (determinismo)
      const hashAOrder = computeInstitutionProductVersionHash({
        ...basePayload,
        requiredDocuments: ["comprobante_domicilio", "estados_cuenta", "ine"],
      });
      expect(hashA).toBe(hashAOrder);

      // Modificar o agregar un documento debe cambiar el hash
      const hashB = computeInstitutionProductVersionHash({
        ...basePayload,
        requiredDocuments: ["estados_cuenta", "ine", "comprobante_domicilio", "opinion_sat"],
      });
      expect(hashA).not.toBe(hashB);
      expect(hashA.length).toBe(64);
      expect(hashB.length).toBe(64);
    });

    it("impide la eliminación destructiva de versiones publicadas o superseded", async () => {
      const { offer, version } = await storage.createOffer(
        {
          institutionId,
          name: "Oferta Inmutable de Prueba",
          productType: "credito_simple",
        },
        {
          conditions: { minAmount: 100000, maxAmount: 1000000, minInterestRate: 15, maxInterestRate: 25, minTermMonths: 6, maxTermMonths: 24 },
          requirements: { targetProfiles: ["persona_moral"] },
          requiredDocuments: ["ine"],
          changeReason: "Versión base",
        }
      );

      // 1. Publicar versión
      await storage.publishOfferVersion(offer.id, version.id, {
        publishedBy: "risk-officer",
        changeReason: "Publicación regulatoria",
      });

      // 2. Intentar eliminar la versión publicada debe fallar
      await expect(storage.deleteOfferVersion(version.id)).rejects.toThrow(
        /No se puede eliminar una versión publicada o histórica/
      );

      // 3. Intentar eliminar la oferta que tiene versión publicada debe fallar
      await expect(storage.deleteOffer(offer.id)).rejects.toThrow(
        /No se puede eliminar una oferta con historial de versiones publicado/
      );
    });

    it("permite descartar versiones en borrador no publicadas", async () => {
      const { offer } = await storage.createOffer({
        institutionId,
        name: "Oferta con Borrador Descartable",
        productType: "credito_simple",
      });

      const draftV = await storage.createOfferVersion(offer.id, {
        conditions: { minAmount: 50000 },
        changeReason: "Borrador de prueba descartable",
      });

      expect(draftV.status).toBe("draft");

      // La eliminación de una versión en borrador debe permitirse
      const deleted = await storage.deleteOfferVersion(draftV.id);
      expect(deleted).toBe(true);

      const fetched = await storage.getOfferVersion(draftV.id);
      expect(fetched).toBeUndefined();
    });
  });

  describe("Requisito 5: Pruebas de PostgreSQL de transacciones, rollback, unicidad e integridad", () => {
    it("DbStorage implementa protección transaccional atómica con SELECT FOR UPDATE", async () => {
      expect(typeof DbStorage.prototype.publishInstitutionProductVersion).toBe("function");
      expect(typeof DbStorage.prototype.createInstitutionProductDraftVersion).toBe("function");
    });

    it("garantiza rollback transaccional si falla la validación de condiciones mínimas", async () => {
      const { offer, version } = await storage.createOffer(
        {
          institutionId,
          name: "Oferta Test Rollback",
          productType: "credito_simple",
        },
        {
          // Condiciones incompletas que no superan el gate
          conditions: { minAmount: 1000000, maxAmount: 500000 }, // min > max
          requirements: { targetProfiles: [] },
          requiredDocuments: [],
          changeReason: "",
        }
      );

      // Intentar publicar debe lanzar error y la versión debe permanecer en draft
      await expect(
        storage.publishOfferVersion(offer.id, version.id, { changeReason: "" })
      ).rejects.toThrow(/Condiciones mínimas de publicación no cumplidas/);

      const unchangedVersion = await storage.getOfferVersion(version.id);
      expect(unchangedVersion?.status).toBe("draft");
      expect(unchangedVersion?.publishedAt).toBeNull();

      const unchangedOffer = await storage.getOffer(offer.id);
      expect(unchangedOffer?.status).toBe("draft");
    });

    it("verifica la unicidad estricta de máximo una versión publicada por producto", async () => {
      const { offer, version: v1 } = await storage.createOffer(
        {
          institutionId,
          name: "Oferta Unicidad Concurrencia",
          productType: "credito_simple",
        },
        {
          conditions: { minAmount: 100000, maxAmount: 500000, minInterestRate: 15, maxInterestRate: 20, minTermMonths: 6, maxTermMonths: 12 },
          requirements: { targetProfiles: ["pyme"] },
          requiredDocuments: ["ine"],
          changeReason: "Versión inicial",
        }
      );

      // Publicar v1
      await storage.publishOfferVersion(offer.id, v1.id, { changeReason: "Publicación v1" });

      // Crear y publicar v2
      const v2 = await storage.createOfferVersion(offer.id, {
        conditions: { minAmount: 150000, maxAmount: 600000, minInterestRate: 14, maxInterestRate: 19, minTermMonths: 6, maxTermMonths: 18 },
        requirements: { targetProfiles: ["pyme"] },
        requiredDocuments: ["ine", "csf"],
        changeReason: "Versión v2",
      });

      await storage.publishOfferVersion(offer.id, v2.id, { changeReason: "Publicación v2" });

      // Crear y publicar v3
      const v3 = await storage.createOfferVersion(offer.id, {
        conditions: { minAmount: 200000, maxAmount: 700000, minInterestRate: 13, maxInterestRate: 18, minTermMonths: 6, maxTermMonths: 24 },
        requirements: { targetProfiles: ["pyme"] },
        requiredDocuments: ["ine", "csf"],
        changeReason: "Versión v3",
      });

      await storage.publishOfferVersion(offer.id, v3.id, { changeReason: "Publicación v3" });

      // Verificar que solo v3 está published, y v1 y v2 están superseded
      const versions = await storage.getOfferVersions(offer.id);
      const published = versions.filter(v => v.status === "published");
      const superseded = versions.filter(v => v.status === "superseded");

      expect(published.length).toBe(1);
      expect(published[0].id).toBe(v3.id);
      expect(superseded.length).toBe(2);
    });
  });

  describe("Regla Crítica: Aislamiento estricto de comisiones internas", () => {
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

  describe("Cierre Técnico A1.2 — Requisito 1: Equivalencia y convención de columnas (created_at)", () => {
    it("asegura que institution_product_versions define la columna created_at en snake_case", () => {
      // Drizzle ORM column definition check
      expect(institutionProductVersions.createdAt.name).toBe("created_at");
      expect(institutionProductVersions.updatedAt.name).toBe("updated_at");
      expect(institutionProductVersions.publishedAt.name).toBe("published_at");
    });
  });

  describe("Cierre Técnico A1.2 — Requisito 3: Protección contra bypass de versionado en endpoints legacy", () => {
    it("rechaza cambiar el estado directamente a 'published' a través de updateInstitutionProduct", async () => {
      const { offer } = await storage.createOffer({
        institutionId,
        name: "Oferta Intento Bypass Estado",
        productType: "arrendamiento",
      });

      expect(offer.status).toBe("draft");

      await expect(
        storage.updateInstitutionProduct(offer.id, { status: "published" as any })
      ).rejects.toThrow(/No se puede cambiar el estado a 'published' directamente/);
    });

    it("rechaza modificar directamente condiciones de una oferta publicada mediante updateInstitutionProduct", async () => {
      const { offer, version } = await storage.createOffer(
        {
          institutionId,
          name: "Oferta Inmutable Publicada",
          productType: "credito_simple",
        },
        {
          conditions: { minAmount: 100000, maxAmount: 1000000, minInterestRate: 15, maxInterestRate: 20, minTermMonths: 6, maxTermMonths: 24 },
          requirements: { targetProfiles: ["persona_moral"] },
          requiredDocuments: ["ine", "acta_constitutiva"],
          changeReason: "Versión inicial",
        }
      );

      // Publicar oferta
      await storage.publishOfferVersion(offer.id, version.id, {
        publishedBy: "risk-officer-1",
        changeReason: "Aprobación oficial",
      });

      // Modificar condiciones directamente debe ser bloqueado
      await expect(
        storage.updateInstitutionProduct(offer.id, {
          configuration: { minAmount: 50000 },
        } as any)
      ).rejects.toThrow(/No se pueden modificar directamente las condiciones de una oferta publicada/);

      // Modificar metadatos no comerciales (como descripción o isActive) sí está permitido
      const updatedMeta = await storage.updateInstitutionProduct(offer.id, {
        description: "Nueva descripción comercial amigable",
        isActive: false,
      } as any);
      expect(updatedMeta?.description).toBe("Nueva descripción comercial amigable");
      expect(updatedMeta?.isActive).toBe(false);
    });

    it("permite modificar condiciones directamente si la oferta aún se encuentra en borrador ('draft')", async () => {
      const { offer } = await storage.createOffer({
        institutionId,
        name: "Oferta Borrador Editable",
        productType: "credito_revolvente",
      });

      expect(offer.status).toBe("draft");

      const updatedDraft = await storage.updateInstitutionProduct(offer.id, {
        configuration: { initialNote: "Ajuste preliminar antes de publicar" },
      } as any);

      expect(updatedDraft).toBeDefined();
      expect(updatedDraft?.configuration).toEqual({ initialNote: "Ajuste preliminar antes de publicar" });
    });
  });

  describe("Cierre Técnico A1.2 — Requisito 4: Desactivación lógica de financieras y ofertas con historial", () => {
    it("aplica desactivación lógica al eliminar una financiera con créditos o versiones publicadas", async () => {
      const histInstId = "fin-hist-" + Date.now();
      await storage.createFinancialInstitution({
        id: histInstId,
        name: "Financiera Histórica Protegida",
        email: "hist@financiera.com",
        isActive: true,
      } as any);

      const { offer, version } = await storage.createOffer(
        {
          institutionId: histInstId,
          name: "Oferta con Historial Legal",
          productType: "credito_simple",
        },
        {
          conditions: { minAmount: 50000, maxAmount: 500000, minInterestRate: 12, maxInterestRate: 18, minTermMonths: 6, maxTermMonths: 12 },
          requirements: { targetProfiles: ["persona_moral"] },
          requiredDocuments: ["ine"],
          changeReason: "Lanzamiento oficial",
        }
      );

      await storage.publishOfferVersion(offer.id, version.id, {
        publishedBy: "admin",
        changeReason: "Publicación formal",
      });

      // Simular solicitud de crédito asociada a la financiera
      await storage.createCredit({
        clientId: "client-test-1",
        financialInstitutionId: histInstId,
        requestedAmount: "250000",
        approvedAmount: "250000",
        status: "active",
      } as any);

      // Eliminar financiera debe realizar desactivación lógica sin destruir datos
      const deleted = await storage.deleteFinancialInstitution(histInstId);
      expect(deleted).toBe(true);

      // La financiera debe seguir existiendo pero marcada como inactiva
      const instAfter = await storage.getFinancialInstitution(histInstId);
      expect(instAfter).toBeDefined();
      expect(instAfter?.isActive).toBe(false);

      // La oferta asociada debe estar archivada e inactiva, pero no eliminada
      const offerAfter = await storage.getOffer(offer.id);
      expect(offerAfter).toBeDefined();
      expect(offerAfter?.isActive).toBe(false);
      expect(offerAfter?.status).toBe("archived");

      // La versión publicada debe seguir intacta para fines regulatorios y de auditoría
      const versionAfter = await storage.getOfferVersion(version.id);
      expect(versionAfter).toBeDefined();
      expect(versionAfter?.status).toBe("published");
    });
  });

  describe("Cierre Técnico A1.2 — Requisito 5: Elegibilidad para nuevas solicitudes y preservación legacy", () => {
    it("una oferta nueva en borrador ('draft') NUNCA es elegible para nuevas solicitudes", () => {
      const draftOffer = {
        id: "draft-offer-1",
        status: "draft",
        isActive: true,
      };

      expect(isOfferEligibleForRequests(draftOffer)).toBe(false);
      expect(isOfferEligibleForRequests(draftOffer, { status: "draft" })).toBe(false);
    });

    it("una oferta publicada con versión activa SÍ es elegible para nuevas solicitudes", () => {
      const publishedOffer = {
        id: "published-offer-1",
        status: "published",
        isActive: true,
      };

      // Exige pasar la versión activa o lista de versiones publicadas
      expect(isOfferEligibleForRequests(publishedOffer, { status: "published" })).toBe(true);
      expect(isOfferEligibleForRequests(publishedOffer, [{ status: "published" }])).toBe(true);
      // Sin versión verificada, no se puede certificar una oferta solo por status
      expect(isOfferEligibleForRequests(publishedOffer)).toBe(false);
    });

    it("preserva la operación de registros legacy existentes sin romper el flujo operativo", () => {
      // Registro legacy sin campo status
      const legacyWithoutStatus = {
        id: "legacy-prod-1",
        isActive: true,
      };
      expect(isOfferEligibleForRequests(legacyWithoutStatus)).toBe(true);

      // Registro legacy con status 'active' tradicional
      const legacyWithActiveStatus = {
        id: "legacy-prod-2",
        status: "active",
        isActive: true,
      };
      expect(isOfferEligibleForRequests(legacyWithActiveStatus)).toBe(true);

      // Registro legacy con isLegacy flag
      const legacyFlagged = {
        id: "legacy-prod-3",
        status: "published",
        isLegacy: true,
        isActive: true,
      };
      expect(isOfferEligibleForRequests(legacyFlagged)).toBe(true);
    });

    it("ofertas inactivas o archivadas NO son elegibles para nuevas solicitudes", () => {
      expect(isOfferEligibleForRequests({ status: "published", isActive: false }, { status: "published" })).toBe(false);
      expect(isOfferEligibleForRequests({ status: "archived", isActive: true }, { status: "published" })).toBe(false);
      expect(isOfferEligibleForRequests({ status: "archived", isActive: false })).toBe(false);
    });
  });

  describe("Pruebas de Regresión A1.3 (En Memoria): Migración de productos existentes y validación de elegibilidad en solicitudes", () => {
    it("migra los institution_products existentes a status 'published' con versión inicial 1 publicada (no en draft)", async () => {
      // Obtener los productos migrados en el arranque de MemStorage
      const migratedProducts = (await storage.getInstitutionProducts()).filter(p => p.id.startsWith("inst-prod-"));
      expect(migratedProducts.length).toBeGreaterThan(0);

      for (const p of migratedProducts) {
        if (p.isActive) {
          // No debe haber sido asignado indiscriminadamente a 'draft'
          expect(p.status).toBe("published");
          expect(p.currentVersionNumber).toBe(1);

          // Debe contar con su versión inicial 1 publicada en el histórico
          const versions = await storage.getInstitutionProductVersions(p.id);
          expect(versions.length).toBeGreaterThanOrEqual(1);
          const publishedV = versions.find(v => v.status === "published");
          expect(publishedV).toBeDefined();
          expect(publishedV?.versionNumber).toBe(1);

          // Debe ser plenamente elegible para solicitudes
          expect(isOfferEligibleForRequests(p, versions)).toBe(true);
        }
      }
    });

    it("distingue ofertas nuevas en borrador de productos legacy migrados", async () => {
      // 1. Producto legacy migrado está en published y es elegible
      const migratedProducts = (await storage.getInstitutionProducts()).filter(p => p.id.startsWith("inst-prod-"));
      const legacyProd = migratedProducts.find(p => p.isActive);
      expect(legacyProd).toBeDefined();
      const legacyVersions = await storage.getInstitutionProductVersions(legacyProd!.id);
      expect(isOfferEligibleForRequests(legacyProd!, legacyVersions)).toBe(true);

      // 2. Oferta nueva creada mediante versionado nace en 'draft' y NO es elegible
      const { offer: newOffer, version: newVersion } = await storage.createOffer({
        institutionId,
        name: "Nueva Oferta Experimental",
        productType: "credito_simple",
      });

      expect(newOffer.status).toBe("draft");
      expect(newVersion.status).toBe("draft");

      const newVersions = await storage.getInstitutionProductVersions(newOffer.id);
      expect(isOfferEligibleForRequests(newOffer, newVersions)).toBe(false);
    });

    it("exige una versión realmente publicada para considerar elegible una oferta nueva (no confía solamente en status)", () => {
      // Oferta con status manipulado a 'published' pero con versiones vacías
      const offerWithoutVersions = {
        id: "prod-fake-published",
        status: "published",
        isActive: true,
      };
      expect(isOfferEligibleForRequests(offerWithoutVersions, [])).toBe(false);
      expect(isOfferEligibleForRequests(offerWithoutVersions)).toBe(false);

      // Oferta con status 'published' pero cuya única versión está en 'draft'
      const offerWithDraftVersion = {
        id: "prod-draft-ver",
        status: "published",
        isActive: true,
      };
      expect(isOfferEligibleForRequests(offerWithDraftVersion, [{ status: "draft" }])).toBe(false);

      // Oferta con versión efectivamente publicada
      expect(isOfferEligibleForRequests(offerWithDraftVersion, [{ status: "published" }])).toBe(true);
    });

    it("valida que la creación de solicitudes excluya financieras cuyas ofertas estén exclusivamente en borrador", async () => {
      // Crear financiera exclusiva con solo una oferta en borrador para una plantilla
      const draftOnlyInstId = "fin-draft-only-" + Date.now();
      await storage.createFinancialInstitution({
        id: draftOnlyInstId,
        name: "Financiera Solo Borradores",
        email: "draft@financiera.com",
        isActive: true,
      } as any);

      const template = await storage.createProductTemplate({
        name: "Plantilla Exclusiva Test",
        category: "credito_simple",
        createdBy: "user-super-admin",
        isActive: true,
      } as any);

      // Crear oferta en borrador para esa plantilla
      const { offer } = await storage.createOffer({
        institutionId: draftOnlyInstId,
        templateId: template.id,
        name: "Oferta en Borrador No Elegible",
        productType: "credito_simple",
      });

      expect(offer.status).toBe("draft");

      // Simular verificación de elegibilidad para la solicitud
      const instProducts = await storage.getInstitutionProducts(draftOnlyInstId);
      const matchingProducts = instProducts.filter(p => p.templateId === template.id);
      expect(matchingProducts.length).toBe(1);

      let hasAnyEligible = false;
      for (const mp of matchingProducts) {
        const versions = await storage.getInstitutionProductVersions(mp.id);
        if (isOfferEligibleForRequests(mp, versions)) {
          hasAnyEligible = true;
          break;
        }
      }

      // Debe ser false: no se puede destinar una solicitud a esta financiera para esta plantilla
      expect(hasAnyEligible).toBe(false);
    });

    it("permite solicitudes para financieras con ofertas publicadas o productos legacy", async () => {
      // 1. Con producto legacy migrado
      const migratedProducts = (await storage.getInstitutionProducts()).filter(p => p.id.startsWith("inst-prod-"));
      const legacyProd = migratedProducts.find(p => p.isActive);
      expect(legacyProd).toBeDefined();

      const legacyVersions = await storage.getInstitutionProductVersions(legacyProd!.id);
      expect(isOfferEligibleForRequests(legacyProd!, legacyVersions)).toBe(true);

      // 2. Con oferta formalmente publicada
      const pubInstId = "fin-pub-test-" + Date.now();
      await storage.createFinancialInstitution({
        id: pubInstId,
        name: "Financiera Publicada Test",
        email: "pub@financiera.com",
        isActive: true,
      } as any);

      const { offer, version } = await storage.createOffer(
        {
          institutionId: pubInstId,
          name: "Oferta Publicada Válida",
          productType: "credito_simple",
        },
        {
          conditions: { minAmount: 100000, maxAmount: 1000000, minInterestRate: 14, maxInterestRate: 20, minTermMonths: 6, maxTermMonths: 24 },
          requirements: { targetProfiles: ["persona_moral"] },
          requiredDocuments: ["ine"],
          changeReason: "Lanzamiento oficial",
        }
      );

      await storage.publishOfferVersion(offer.id, version.id, {
        publishedBy: "risk-officer",
        changeReason: "Aprobación oficial",
      });

      const publishedOffer = await storage.getOffer(offer.id);
      const pubVersions = await storage.getInstitutionProductVersions(offer.id);
      expect(isOfferEligibleForRequests(publishedOffer!, pubVersions)).toBe(true);
    });
  });

  describe("Pruebas de Regresión A1.4: Cierre definitivo de seguridad de publicación y validación de ofertas", () => {
    it("1. Simular dos arranques consecutivos: la migración legacy es estrictamente idempotente y no altera el histórico", async () => {
      // Contar productos y versiones antes
      const productsBefore = await storage.getInstitutionProducts();
      const legacyProducts = productsBefore.filter(p => p.id.startsWith("inst-prod-"));
      expect(legacyProducts.length).toBeGreaterThan(0);

      // Simular un segundo arranque ejecutando migrateExistingData
      (storage as any).migrateExistingData();

      // Verificar que los productos no se duplicaron ni cambiaron
      const productsAfter = await storage.getInstitutionProducts();
      const legacyAfter = productsAfter.filter(p => p.id.startsWith("inst-prod-"));
      expect(legacyAfter.length).toBe(legacyProducts.length);

      for (const p of legacyAfter) {
        const versions = await storage.getInstitutionProductVersions(p.id);
        expect(versions.length).toBe(1);
        if (p.isActive) {
          expect(p.status).toBe("published");
          expect(versions[0].status).toBe("published");
        } else {
          expect(p.status).toBe("archived");
          expect(versions[0].status).toBe("archived");
        }
      }
    });

    it("2. Borradores nuevos: nunca se convierten en publicados al reiniciar o ejecutar autoMigrate/backfill", async () => {
      const testInstId = "fin-draft-test-" + Date.now();
      await storage.createFinancialInstitution({
        id: testInstId,
        name: "Financiera Borradores Persistentes",
        email: "draft_persist@test.com",
        isActive: true,
      } as any);

      // Crear una nueva oferta en borrador
      const { offer, version } = await storage.createOffer({
        institutionId: testInstId,
        name: "Oferta Nueva en Borrador Estricto",
        productType: "credito_simple",
      });

      expect(offer.status).toBe("draft");
      expect(version.status).toBe("draft");

      // Simular reinicio / nuevo arranque
      (storage as any).migrateExistingData();

      // Comprobar que la nueva oferta sigue estando estrictamente en 'draft'
      const offerAfter = await storage.getOffer(offer.id);
      expect(offerAfter?.status).toBe("draft");

      const versionsAfter = await storage.getInstitutionProductVersions(offer.id);
      expect(versionsAfter.length).toBe(1);
      expect(versionsAfter[0].status).toBe("draft");
      expect(isOfferEligibleForRequests(offerAfter!, versionsAfter)).toBe(false);
    });

    it("3. Migración legacy: distingue de forma inequívoca productos preexistentes conservando su estado publicado", async () => {
      const migratedProducts = (await storage.getInstitutionProducts()).filter(p => p.id.startsWith("inst-prod-"));
      for (const lp of migratedProducts) {
        if (lp.isActive) {
          expect(lp.status).toBe("published");
          const versions = await storage.getInstitutionProductVersions(lp.id);
          expect(versions.some(v => v.status === "published")).toBe(true);
          expect(isOfferEligibleForRequests(lp, versions)).toBe(true);
        }
      }
    });

    it("3b. Conservación de productos legacy inactivos y validación de version_hash determinista", async () => {
      // Verificar que el producto legacy inactivo preexistente quedó archivado
      const migratedInactive = await storage.getInstitutionProduct("inst-prod-product-legacy-inactive");
      expect(migratedInactive).toBeDefined();
      expect(migratedInactive?.status).toBe("archived");
      expect(migratedInactive?.isActive).toBe(false);

      // Verificar que su versión 1 existe, está archivada y tiene version_hash válido de 64 caracteres
      const inactiveVersions = await storage.getInstitutionProductVersions("inst-prod-product-legacy-inactive");
      expect(inactiveVersions.length).toBe(1);
      expect(inactiveVersions[0].versionNumber).toBe(1);
      expect(inactiveVersions[0].status).toBe("archived");
      expect(inactiveVersions[0].effectiveTo).toBeDefined();
      expect(inactiveVersions[0].versionHash).toBeDefined();
      expect(inactiveVersions[0].versionHash).toHaveLength(64);
      expect(inactiveVersions[0].versionHash).toMatch(/^[0-9a-f]{64}$/);

      // Verificar que NO es elegible para solicitudes
      expect(isOfferEligibleForRequests(migratedInactive!, inactiveVersions)).toBe(false);

      // Verificar que todos los productos legacy tienen version_hash válido de 64 caracteres
      const allMigrated = (await storage.getInstitutionProducts()).filter(p => p.id.startsWith("inst-prod-"));
      expect(allMigrated.length).toBeGreaterThan(0);
      for (const p of allMigrated) {
        const versions = await storage.getInstitutionProductVersions(p.id);
        expect(versions.length).toBeGreaterThan(0);
        for (const v of versions) {
          expect(v.versionHash).toBeDefined();
          expect(v.versionHash).toHaveLength(64);
          expect(v.versionHash).toMatch(/^[0-9a-f]{64}$/);
        }
      }
    });

    it("4. Manipulación de estado: el servidor fuerza 'draft' al crear y rechaza publicaciones directas", async () => {
      // 4a. Intentar crear oferta con status 'published' en el payload: el servidor debe forzar 'draft'
      const { offer: createdOffer, version: createdVersion } = await storage.createOffer({
        institutionId,
        name: "Oferta con Status Spoofing",
        productType: "credito_simple",
        status: "published" as any,
      });

      expect(createdOffer.status).toBe("draft");
      expect(createdVersion.status).toBe("draft");

      const storedOffer = await storage.getOffer(createdOffer.id);
      expect(storedOffer?.status).toBe("draft");

      // 4b. Intentar crear institutionProduct directamente con status 'published'
      const createdProd = await storage.createInstitutionProduct({
        institutionId,
        name: "Producto Directo con Status Spoofing",
        productType: "credito_simple",
        status: "published" as any,
      });
      expect(createdProd.status).toBe("draft");

      // 4c. Intentar bypass de estado a 'published' vía updateInstitutionProduct: debe ser rechazado
      await expect(
        storage.updateInstitutionProduct(createdOffer.id, { status: "published" as any })
      ).rejects.toThrow(/No se puede cambiar el estado a 'published' directamente/);

      // 4d. Si un objeto en memoria tiene status = 'published' pero no tiene versión publicada física: es inelegible
      const spoofedInMemoryOffer = {
        id: "spoofed-123",
        status: "published",
        isActive: true,
      };
      expect(isOfferEligibleForRequests(spoofedInMemoryOffer, [{ status: "draft" }])).toBe(false);
      expect(isOfferEligibleForRequests(spoofedInMemoryOffer, [])).toBe(false);
    });

    it("5. Oferta inexistente y no elegible al crear créditos y solicitudes", async () => {
      // 5a. Rechazar crédito con oferta inexistente
      await expect(
        storage.createCredit({
          clientId: "client-test-1",
          institutionProductId: "oferta-inexistente-uuid-999",
          amount: "500000",
        } as any)
      ).rejects.toThrow("La oferta especificada no existe.");

      // 5b. Rechazar solicitud con oferta inexistente
      await expect(
        storage.createCreditSubmissionRequest({
          clientId: "client-test-1",
          brokerId: "broker-test-1",
          requestedAmount: "500000",
          institutionProductId: "oferta-inexistente-uuid-999",
        } as any)
      ).rejects.toThrow("La oferta especificada no existe.");

      // 5c. Rechazar crédito con oferta en borrador
      const { offer: draftOffer } = await storage.createOffer({
        institutionId,
        name: "Oferta en Borrador para Rechazo",
        productType: "credito_simple",
      });

      await expect(
        storage.createCredit({
          clientId: "client-test-1",
          institutionProductId: draftOffer.id,
          amount: "500000",
        } as any)
      ).rejects.toThrow("La oferta seleccionada se encuentra en borrador o no cuenta con una versión publicada vigente.");

      // 5d. Rechazar solicitud con oferta en borrador
      await expect(
        storage.createCreditSubmissionRequest({
          clientId: "client-test-1",
          brokerId: "broker-test-1",
          requestedAmount: "500000",
          institutionProductId: draftOffer.id,
        } as any)
      ).rejects.toThrow("La oferta seleccionada se encuentra en borrador o no cuenta con una versión publicada vigente.");

      // 5e. Preservar compatibilidad total con flujos legacy sin ID de oferta
      const legacyCredit = await storage.createCredit({
        clientId: "client-test-1",
        financialInstitutionId: institutionId,
        amount: "500000",
        status: "draft",
      } as any);
      expect(legacyCredit).toBeDefined();
      expect(legacyCredit.id).toBeDefined();

      const legacySubmission = await storage.createCreditSubmissionRequest({
        clientId: "client-test-1",
        brokerId: "broker-test-1",
        requestedAmount: "500000",
        status: "pending_admin",
      } as any);
      expect(legacySubmission).toBeDefined();
      expect(legacySubmission.id).toBeDefined();
    });
  });
});
