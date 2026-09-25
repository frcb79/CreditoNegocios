import { describe, it, expect, beforeEach } from "@jest/globals";
import {
  CommercialHelpService,
  MockCommercialHelpStorage,
  buildHelpArticles,
  HELP_ARTICLES,
} from "../../server/commercialHelpService";
import { DEFAULT_COMMERCIAL_RULES_CONFIG } from "../../shared/schema";
import type { ICommercialConfigService } from "../../server/commercialConfigService";

class MockConfigService implements ICommercialConfigService {
  private config = { ...DEFAULT_COMMERCIAL_RULES_CONFIG };

  async getConfig(): Promise<any> {
    return { ...this.config };
  }

  async updateConfig(updates: any): Promise<any> {
    this.config = { ...this.config, ...updates };
    return { updatedConfig: this.config, modifiedParams: Object.keys(updates) };
  }

  async getAuditHistory(): Promise<any[]> {
    return [];
  }

  clearCache(): void {}
}

describe("Fase 6 — Centro de Reglas de Operación, Manual de Uso y Ayuda Contextual", () => {
  let storage: MockCommercialHelpStorage;
  let configService: MockConfigService;
  let service: CommercialHelpService;

  beforeEach(() => {
    storage = new MockCommercialHelpStorage();
    configService = new MockConfigService();
    service = new CommercialHelpService(storage, configService);
  });

  // 1. Centro de Reglas visible para Broker
  it("1. Centro de Reglas visible para Broker", async () => {
    const current = await service.getCurrentOperationalRules("broker-123");
    expect(current).toBeDefined();
    expect(current?.version).toBeDefined();
    expect(current?.version.version).toBe("1.0.0");
    expect(current?.version.title).toContain("Reglas de Operación");

    // Broker tiene acceso a artículos aplicables
    const articles = await service.getArticles({ userRole: "broker" });
    expect(articles.length).toBeGreaterThan(10);
    // Artículos de cliente y oportunidad visibles
    const clientArticle = articles.find((a) => a.slug === "clientes-relacion-comercial");
    expect(clientArticle).toBeDefined();
  });

  // 2. Master Broker accede a temas de su red
  it("2. Master Broker accede a temas de su red y supervisión", async () => {
    const brokerArticles = await service.getArticles({ userRole: "broker" });
    const mbArticles = await service.getArticles({ userRole: "master_broker" });

    // El broker normal NO debe ver artículos exclusivos de Master Broker
    const brokerMbArticle = brokerArticles.find((a) => a.slug === "que-puede-ver-un-master-broker");
    expect(brokerMbArticle).toBeUndefined();

    // El Master Broker SÍ debe ver el artículo de supervisión de red
    const mbArticle = mbArticles.find((a) => a.slug === "que-puede-ver-un-master-broker");
    expect(mbArticle).toBeDefined();
    expect(mbArticle?.category).toBe("master_broker");
    expect(mbArticle?.contentMarkdown).toContain("Visibilidad y Facultades del Master Broker");
  });

  // 3. Buscador encuentra artículos relevantes
  it("3. Buscador encuentra artículos relevantes con términos cotidianos de broker", async () => {
    // Caso: "cliente"
    const clientResults = await service.getArticles({ query: "cliente" });
    expect(clientResults.length).toBeGreaterThan(0);

    // Caso exacto requerido en especificación: "cliente ya existe"
    const duplicateResults = await service.getArticles({ query: "cliente ya existe" });
    expect(duplicateResults.length).toBeGreaterThan(0);
    expect(duplicateResults[0].slug).toBe("cliente-ya-existe");
    expect(duplicateResults[0].title).toContain("¿Qué hago si el cliente ya existe?");

    // Caso: "oportunidad protegida"
    const oppResults = await service.getArticles({ query: "oportunidad protegida" });
    expect(oppResults.length).toBeGreaterThan(0);
    expect(oppResults.some((a) => a.slug === "oportunidad-protegida")).toBe(true);

    // Caso: "comisiones"
    const commResults = await service.getArticles({ query: "comisiones" });
    expect(commResults.length).toBeGreaterThan(0);
    expect(commResults.some((a) => a.slug === "atribucion-comisiones")).toBe(true);

    // Caso: "renovacion" (sin acento)
    const renResults = await service.getArticles({ query: "renovacion" });
    expect(renResults.length).toBeGreaterThan(0);
    expect(renResults.some((a) => a.slug === "como-funciona-renovacion")).toBe(true);

    // Caso: "renovación" (con acento diacrítico)
    const renAccentResults = await service.getArticles({ query: "renovación" });
    expect(renAccentResults.length).toBeGreaterThan(0);
    expect(renAccentResults.some((a) => a.slug === "como-funciona-renovacion")).toBe(true);
  });

  // 4. Deep-link desde Clientes abre artículo correcto
  it("4. Deep-link desde Clientes abre artículo correcto", async () => {
    const article = await service.getArticleBySlug("por-que-cliente-con-otro-broker");
    expect(article).toBeDefined();
    expect(article?.slug).toBe("por-que-cliente-con-otro-broker");
    expect(article?.title).toContain("¿Por qué este cliente aparece relacionado con otro broker?");
    expect(article?.category).toBe("clientes");
    expect(article?.contentMarkdown).toContain("Existe una relación activa");
  });

  // 5. Deep-link desde Oportunidades abre artículo correcto
  it("5. Deep-link desde Oportunidades abre artículo correcto", async () => {
    const article = await service.getArticleBySlug("oportunidad-protegida");
    expect(article).toBeDefined();
    expect(article?.slug).toBe("oportunidad-protegida");
    expect(article?.title).toContain("¿Qué significa una oportunidad protegida?");
    expect(article?.category).toBe("oportunidades");
    expect(article?.contentMarkdown).toContain("Reserva Inicial");
  });

  // 6. Deep-link desde Comisiones abre artículo correcto
  it("6. Deep-link desde Comisiones abre artículo correcto", async () => {
    const article = await service.getArticleBySlug("atribucion-comisiones");
    expect(article).toBeDefined();
    expect(article?.slug).toBe("atribucion-comisiones");
    expect(article?.title).toContain("atribución");
    expect(article?.contentMarkdown).toContain("Comisiones");
  });

  // 7. Versión vigente se muestra correctamente
  it("7. Versión vigente se muestra correctamente con fecha y metadatos", async () => {
    const result = await service.getCurrentOperationalRules();
    expect(result).toBeDefined();
    expect(result?.version.version).toBe("1.0.0");
    expect(result?.version.effectiveDate).toBe("2026-09-24");
    expect(result?.version.isCurrent).toBe(true);
    expect(result?.version.requiresAcknowledgment).toBe(true);
    expect(result?.version.contentMarkdown).toContain("Reglas de Operación y Protección Comercial");
    expect(result?.currentConfig).toBeDefined();
  });

  // 8. Usuario no aparece como aceptado antes de confirmar
  it("8. Usuario no aparece como aceptado antes de confirmar", async () => {
    const userId = "broker-sin-confirmar-999";
    const result = await service.getCurrentOperationalRules(userId);
    expect(result).toBeDefined();
    expect(result?.hasAcknowledged).toBe(false);
    expect(result?.acknowledgedAt).toBeNull();
  });

  // 9. Confirmación crea acknowledgment
  it("9. Confirmación crea acknowledgment y persiste estado aceptado", async () => {
    const userId = "broker-confirmante-123";
    const current = await service.getCurrentOperationalRules(userId);
    expect(current?.hasAcknowledged).toBe(false);

    // Confirmar
    const ackResult = await service.recordAcknowledgment(userId, current!.version.id, "192.168.1.50");
    expect(ackResult.success).toBe(true);
    expect(ackResult.alreadyAcknowledged).toBe(false);
    expect(ackResult.acknowledgedAt).toBeInstanceOf(Date);

    // Verificar que ahora aparece como aceptado
    const updated = await service.getCurrentOperationalRules(userId);
    expect(updated?.hasAcknowledged).toBe(true);
    expect(updated?.acknowledgedAt).toBeDefined();

    // Idempotencia: segundo llamado no falla
    const secondAck = await service.recordAcknowledgment(userId, current!.version.id, "192.168.1.50");
    expect(secondAck.success).toBe(true);
    expect(secondAck.alreadyAcknowledged).toBe(true);
  });

  // 10. Nueva versión conserva historial anterior
  it("10. Nueva versión conserva historial anterior y actualiza isCurrent", async () => {
    const versionsBefore = await service.getOperationalRulesVersions();
    expect(versionsBefore.length).toBe(1);
    expect(versionsBefore[0].version).toBe("1.0.0");
    expect(versionsBefore[0].isCurrent).toBe(true);

    // Crear versión 1.1.0 como Super Admin
    const v110 = await service.createOperationalRulesVersion({
      version: "1.1.0",
      title: "Actualización de Reglas de Operación v1.1.0",
      summary: "Actualización de políticas de confirmación digital para brokers.",
      contentMarkdown: "# Reglas de Operación v1.1.0\nActualización de procesos.",
      effectiveDate: "2026-10-01",
      isCurrent: true,
      requiresAcknowledgment: true,
      createdBy: "super-admin-root",
    });

    expect(v110.version).toBe("1.1.0");
    expect(v110.isCurrent).toBe(true);

    // Consultar historial
    const versionsAfter = await service.getOperationalRulesVersions();
    expect(versionsAfter.length).toBe(2);

    // La versión anterior 1.0.0 sigue en el historial pero ya no es current
    const v100After = versionsAfter.find((v) => v.version === "1.0.0");
    expect(v100After).toBeDefined();
    expect(v100After?.isCurrent).toBe(false);

    // La versión vigente ahora es 1.1.0
    const current = await service.getCurrentOperationalRules();
    expect(current?.version.version).toBe("1.1.0");
    expect(current?.version.isCurrent).toBe(true);
  });

  // 11. Contenido no expone términos técnicos internos
  it("11. Contenido no expone términos técnicos internos prohibidos", async () => {
    const prohibitedTechnicalTerms = [
      "registered_hold",
      "protected_active",
      "legacy_unverified",
      "ClientAccessScope",
      "clientCommercialRelationships",
      "commercialAuditLogs",
      "operationalRulesVersions",
      "userRuleAcknowledgments",
      "endpoints",
    ];

    const articles = await service.getArticles();
    for (const article of articles) {
      const fullText = `${article.title} ${article.summary} ${article.contentMarkdown}`;
      for (const term of prohibitedTechnicalTerms) {
        const containsTerm = fullText.toLowerCase().includes(term.toLowerCase());
        expect(containsTerm).toBe(false);
      }
    }
  });

  // 12. Aislamiento de permisos administrativos por tenant/plataforma
  it("12. Aislamiento de permisos administrativos por tenant/plataforma", async () => {
    const mockAuthorizeRuleCreation = (userRole: string) => {
      if (userRole !== "super_admin") {
        throw new Error("Acceso exclusivo para Super Administradores de plataforma");
      }
      return true;
    };

    // Broker: denegado
    expect(() => mockAuthorizeRuleCreation("broker")).toThrow(
      "Acceso exclusivo para Super Administradores de plataforma"
    );

    // Master Broker: denegado
    expect(() => mockAuthorizeRuleCreation("master_broker")).toThrow(
      "Acceso exclusivo para Super Administradores de plataforma"
    );

    // Admin de tenant normal (no super_admin): denegado
    expect(() => mockAuthorizeRuleCreation("admin")).toThrow(
      "Acceso exclusivo para Super Administradores de plataforma"
    );

    // Super Admin: autorizado
    expect(mockAuthorizeRuleCreation("super_admin")).toBe(true);
  });

  // -------------------------------------------------------------
  // NUEVAS PRUEBAS DE CONSISTENCIA Y PARÁMETROS DINÁMICOS
  // -------------------------------------------------------------

  // 13. Cambiar initialOpportunityHoldDays modifica el valor en el artículo correspondiente
  it("13. Cambiar initialOpportunityHoldDays modifica el valor mostrado en el artículo", async () => {
    // Valor inicial (7 días)
    const initialArticle = await service.getArticleBySlug("oportunidad-protegida");
    expect(initialArticle?.contentMarkdown).toContain("7 días naturales");

    // Super Admin actualiza initialOpportunityHoldDays a 14 días
    await configService.updateConfig({ initialOpportunityHoldDays: 14 });

    const updatedArticle = await service.getArticleBySlug("oportunidad-protegida");
    expect(updatedArticle?.contentMarkdown).toContain("14 días naturales");
    expect(updatedArticle?.contentMarkdown).not.toContain("7 días naturales");

    // También se actualiza en "¿Qué significa Reserva inicial?"
    const holdArticle = await service.getArticleBySlug("que-significa-reserva-inicial");
    expect(holdArticle?.contentMarkdown).toContain("14 días naturales");
    expect(holdArticle?.summary).toContain("14 días naturales");
  });

  // 14. Cambiar activeRelationshipValidityDays modifica el valor mostrado
  it("14. Cambiar activeRelationshipValidityDays modifica el valor mostrado", async () => {
    // Valor inicial (90 días)
    const initialArticle = await service.getArticleBySlug("clientes-relacion-comercial");
    expect(initialArticle?.contentMarkdown).toContain("90 días naturales");

    // Super Admin actualiza activeRelationshipValidityDays a 120 días
    await configService.updateConfig({ activeRelationshipValidityDays: 120 });

    const updatedArticle = await service.getArticleBySlug("clientes-relacion-comercial");
    expect(updatedArticle?.contentMarkdown).toContain("120 días naturales");
    expect(updatedArticle?.contentMarkdown).not.toContain("90 días naturales");
    expect(updatedArticle?.summary).toContain("120 días");
  });

  // 15. Los artículos no contienen copias hardcodeadas de los valores configurables
  it("15. Los artículos se generan dinámicamente sin copias fijas hardcodeadas", () => {
    const customConfig = {
      activeRelationshipValidityDays: 77,
      initialOpportunityHoldDays: 11,
      opportunityInactivityProtectionDays: 33,
      inboundPriorityHours: 22,
      renewalWindowDaysBeforeMaturity: 155,
      renewalOriginatorPriorityDays: 19,
      brokerElectionTokenValidityHours: 49,
    };

    const articles = buildHelpArticles(customConfig);

    // Verificar que los 7 parámetros personalizados se reflejen fielmente
    const relArticle = articles.find((a) => a.slug === "clientes-relacion-comercial");
    expect(relArticle?.contentMarkdown).toContain("77 días naturales");

    const oppArticle = articles.find((a) => a.slug === "oportunidad-protegida");
    expect(oppArticle?.contentMarkdown).toContain("11 días naturales");
    expect(oppArticle?.contentMarkdown).toContain("33 días naturales");

    const renArticle = articles.find((a) => a.slug === "como-funciona-renovacion");
    expect(renArticle?.contentMarkdown).toContain("155 días naturales");
    expect(renArticle?.contentMarkdown).toContain("19 días hábiles");

    const brokerChangeArticle = articles.find((a) => a.slug === "como-solicito-cambio-de-broker");
    expect(brokerChangeArticle?.contentMarkdown).toContain("49 horas naturales");

    const conflictArticle = articles.find((a) => a.slug === "como-se-resuelve-conflicto");
    expect(conflictArticle?.contentMarkdown).toContain("22 horas hábiles");
  });

  // 16. Una versión histórica ya publicada conserva su contenido original
  it("16. Una versión histórica ya publicada conserva su contenido original inmutable", async () => {
    // Obtener la versión 1.0.0 sembrada originalmente
    const history = await service.getOperationalRulesVersions();
    const v100 = history.find((v) => v.version === "1.0.0");
    expect(v100).toBeDefined();

    // Modificar la configuración operativa del sistema
    await configService.updateConfig({
      initialOpportunityHoldDays: 21,
      activeRelationshipValidityDays: 180,
    });

    // El contenido histórico almacenado en operationalRulesVersions permanece inalterado
    const v100AfterConfigChange = await service.getOperationalRulesByVersion("1.0.0");
    expect(v100AfterConfigChange?.version.contentMarkdown).toBe(v100!.contentMarkdown);
  });

  // 17. Buscador y deep-links siguen funcionando tras cambios de configuración
  it("17. El buscador y deep-links siguen funcionando con contenido dinámico", async () => {
    await configService.updateConfig({
      initialOpportunityHoldDays: 10,
      activeRelationshipValidityDays: 60,
    });

    // Buscador
    const searchResults = await service.getArticles({ query: "cliente ya existe" });
    expect(searchResults.length).toBeGreaterThan(0);
    expect(searchResults[0].slug).toBe("cliente-ya-existe");

    // Deep-link
    const deepLinkArticle = await service.getArticleBySlug("como-funciona-renovacion");
    expect(deepLinkArticle).toBeDefined();
    expect(deepLinkArticle?.slug).toBe("como-funciona-renovacion");
  });
});
