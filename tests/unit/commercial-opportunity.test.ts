import {
  CommercialOpportunityService,
  MockCommercialOpportunityStorage,
  isValidProtectionActivity,
  isOpportunityEquivalent,
} from "../../server/commercialOpportunityService";
import {
  CommercialConfigService,
  MockCommercialConfigStorage,
} from "../../server/commercialConfigService";
import {
  CommercialAuthorizationService,
  MockCommercialAuthStorage,
} from "../../server/commercialAuthorizationService";
import type {
  Client,
  CommercialOpportunity,
  ClientCommercialRelationship,
  Credit,
} from "../../shared/schema";

describe("Fase 4: Ciclo de Vida de Oportunidades, Actividad Comercial y Check-Duplicates Enriquecido", () => {
  let oppStorage: MockCommercialOpportunityStorage;
  let authStorage: MockCommercialAuthStorage;
  let configStorage: MockCommercialConfigStorage;
  let configService: CommercialConfigService;
  let authService: CommercialAuthorizationService;
  let oppService: CommercialOpportunityService;

  const now = new Date("2026-09-25T12:00:00Z");

  const sampleClient: Client = {
    id: "client-fase4-1",
    brokerId: "broker-originador-historico",
    businessName: "Tecnología y Soluciones Industriales SA de CV",
    rfc: "TSI200101XYZ",
    phone: "5512345678",
    email: "contacto@tsi.com.mx",
    tenantId: "tenant-fase4-1",
    type: "persona_moral",
    createdAt: new Date("2024-01-15T00:00:00Z"),
  } as any;

  beforeEach(() => {
    oppStorage = new MockCommercialOpportunityStorage();
    authStorage = new MockCommercialAuthStorage();
    configStorage = new MockCommercialConfigStorage();

    configService = new CommercialConfigService(configStorage);
    authService = new CommercialAuthorizationService(authStorage);
    oppService = new CommercialOpportunityService(oppStorage, configService, authService);

    oppStorage.clients = [sampleClient];
    authStorage.clients = [sampleClient];
  });

  // ==========================================================================
  // 1 & 2: Creación de Oportunidad y Cálculo Dinámico de Hold
  // ==========================================================================
  describe("1 & 2. Registro Inicial y Hold Dinámico", () => {
    it("crea una oportunidad en estado 'registered_hold' con holdExpiresAt calculado dinámicamente", async () => {
      // Config por defecto: initialOpportunityHoldDays = 7
      // Simular broker con relación activa o acceso full
      const activeRel: ClientCommercialRelationship = {
        id: "rel-1",
        clientId: sampleClient.id,
        brokerId: "broker-activo-1",
        status: "active",
        activeUntil: new Date("2026-12-31T00:00:00Z"),
      } as any;
      authStorage.relationships = [activeRel];
      oppStorage.relationships = [activeRel];

      const result = await oppService.createOpportunity({
        clientId: sampleClient.id,
        brokerId: "broker-activo-1",
        title: "Crédito simple para maquinaria",
        financingNeedType: "credito_empresarial",
        requestedAmount: "2500000.00",
        userRole: "broker",
        tenantContext: {
          tenant: { id: "tenant-fase4-1" },
          isPlatformAdmin: false,
        },
        now,
      });

      expect(result.success).toBe(true);
      expect(result.opportunity).toBeDefined();
      expect(result.opportunity?.status).toBe("registered_hold");

      // Verificación de cálculo dinámico: now + 7 días = 2026-10-02T12:00:00Z
      const expectedHold = new Date(now.getTime() + 7 * 86400000);
      expect(result.opportunity?.holdExpiresAt).toEqual(expectedHold);

      // Verificación de auditoría inmutable
      const logs = await oppStorage.getCommercialAuditLogs(
        "commercial_opportunity",
        result.opportunity!.id
      );
      expect(logs.length).toBeGreaterThanOrEqual(1);
      expect(logs[0].action).toBe("opportunity_created");
      expect(logs[0].newState).toBe("registered_hold");
    });

    it("14. modifica la duración del hold dinámicamente según configuración central sin tocar código", async () => {
      // Modificar configuración dinámica a 14 días de hold
      await configService.updateConfig({ initialOpportunityHoldDays: 14 });

      const activeRel: ClientCommercialRelationship = {
        id: "rel-1",
        clientId: sampleClient.id,
        brokerId: "broker-activo-1",
        status: "active",
        activeUntil: new Date("2026-12-31T00:00:00Z"),
      } as any;
      authStorage.relationships = [activeRel];
      oppStorage.relationships = [activeRel];

      const result = await oppService.createOpportunity({
        clientId: sampleClient.id,
        brokerId: "broker-activo-1",
        title: "Línea de factoraje",
        financingNeedType: "factoraje",
        requestedAmount: "1000000.00",
        tenantContext: {
          tenant: { id: "tenant-fase4-1" },
          isPlatformAdmin: false,
        },
        now,
      });

      expect(result.success).toBe(true);
      const expectedHold14 = new Date(now.getTime() + 14 * 86400000);
      expect(result.opportunity?.holdExpiresAt).toEqual(expectedHold14);
    });
  });

  // ==========================================================================
  // 3 & 4 & 5: Actividad Comercial Válida vs Nota CRM y Extensión de Protección
  // ==========================================================================
  describe("3, 4 & 5. Actividad Comercial Válida vs Nota Simple", () => {
    let testOpportunity: CommercialOpportunity;

    beforeEach(async () => {
      testOpportunity = await oppStorage.createCommercialOpportunity({
        clientId: sampleClient.id,
        brokerId: "broker-1",
        title: "Arrendamiento puro de flota vehicular",
        financingNeedType: "arrendamiento",
        requestedAmount: "3000000.00",
        status: "registered_hold",
        holdExpiresAt: new Date(now.getTime() + 7 * 86400000),
        lastValidActivityAt: now,
      } as any);

      authStorage.opportunities = [testOpportunity];
    });

    it("3. actividad estructurada calificada pasa la oportunidad a 'protected_active' y calcula protectedUntil", async () => {
      // Registrar actividad calificada: reunión con cliente y minuta
      const performedAt = new Date("2026-09-26T10:00:00Z");
      const result = await oppService.recordActivity({
        clientId: sampleClient.id,
        opportunityId: testOpportunity.id,
        brokerId: "broker-1",
        activityType: "meeting_conducted",
        title: "Reunión de perfilamiento con Director General",
        description: "Se validaron necesidades y estados financieros 2025",
        performedAt,
        now,
      });

      expect(result.success).toBe(true);
      expect(result.validForProtection).toBe(true);
      expect(result.opportunity?.status).toBe("protected_active");

      // Por defecto: 45 días de inactividad permitidos
      const expectedProtectedUntil = new Date(performedAt.getTime() + 45 * 86400000);
      expect(result.opportunity?.protectedUntil).toEqual(expectedProtectedUntil);

      // Verificación de auditoría
      const logs = await oppStorage.getCommercialAuditLogs(
        "commercial_opportunity",
        testOpportunity.id
      );
      const holdValidatedLog = logs.find((l) => l.action === "opportunity_hold_validated");
      expect(holdValidatedLog).toBeDefined();
      expect(holdValidatedLog?.previousState).toBe("registered_hold");
      expect(holdValidatedLog?.newState).toBe("protected_active");
    });

    it("4. nota libre o no estructurada NO extiende protección ni valida hold", async () => {
      const result = await oppService.recordActivity({
        clientId: sampleClient.id,
        opportunityId: testOpportunity.id,
        brokerId: "broker-1",
        activityType: "crm_note", // No está en COMMERCIAL_ACTIVITY_TYPES
        title: "Nota CRM: Recordar llamar el próximo martes",
        description: "Solo seguimiento personal",
        performedAt: now,
        now,
      });

      expect(result.success).toBe(true);
      expect(result.validForProtection).toBe(false);
      expect(result.opportunity?.status).toBe("registered_hold"); // Sigue en hold
      expect(result.opportunity?.protectedUntil).toBeNull(); // No calculó protección

      // Oportunidad en almacenamiento sigue en hold
      const oppInDb = await oppStorage.getOpportunity(testOpportunity.id);
      expect(oppInDb?.status).toBe("registered_hold");
      expect(oppInDb?.protectedUntil).toBeNull();
    });

    it("5. cada nueva actividad comercial estructurada extiende 'protectedUntil'", async () => {
      // 1ra actividad: reunión (hold -> protected_active con 45 días)
      const date1 = new Date("2026-09-26T10:00:00Z");
      await oppService.recordActivity({
        clientId: sampleClient.id,
        opportunityId: testOpportunity.id,
        brokerId: "broker-1",
        activityType: "meeting_conducted",
        title: "Reunión inicial",
        performedAt: date1,
      });

      // 2da actividad 20 días después: carga de estados financieros y SAT
      const date2 = new Date("2026-10-16T15:00:00Z");
      const result2 = await oppService.recordActivity({
        clientId: sampleClient.id,
        opportunityId: testOpportunity.id,
        brokerId: "broker-1",
        activityType: "financial_doc_uploaded",
        title: "Carga de CIEC y balanza 2026",
        performedAt: date2,
      });

      expect(result2.success).toBe(true);
      expect(result2.validForProtection).toBe(true);

      // Nueva protección extendida: date2 + 45 días
      const expectedExtended = new Date(date2.getTime() + 45 * 86400000);
      expect(result2.opportunity?.protectedUntil).toEqual(expectedExtended);

      const logs = await oppStorage.getCommercialAuditLogs(
        "commercial_opportunity",
        testOpportunity.id
      );
      const extendLog = logs.find((l) => l.action === "opportunity_protection_extended");
      expect(extendLog).toBeDefined();
    });
  });

  // ==========================================================================
  // 6 & 7: Expiración y Liberación (Hold e Inactividad)
  // ==========================================================================
  describe("6 & 7. Expiración de Hold y de Protección por Inactividad", () => {
    it("6. libera oportunidad en 'registered_hold' que superó la vigencia sin actividad válida", async () => {
      // Hold creado con vencimiento en el pasado
      const pastHoldOpp = await oppStorage.createCommercialOpportunity({
        clientId: sampleClient.id,
        brokerId: "broker-vencido",
        title: "Hold vencido sin actividad",
        financingNeedType: "credito_simple",
        requestedAmount: "500000.00",
        status: "registered_hold",
        holdExpiresAt: new Date("2026-09-20T00:00:00Z"), // Venció hace 5 días
        lastValidActivityAt: new Date("2026-09-13T00:00:00Z"),
      } as any);

      const releaseResult = await oppService.evaluateAndReleaseExpiredOpportunities(now);

      expect(releaseResult.releasedCount).toBe(1);
      expect(releaseResult.releasedOpportunities[0].id).toBe(pastHoldOpp.id);
      expect(releaseResult.releasedOpportunities[0].previousStatus).toBe("registered_hold");

      const oppUpdated = await oppStorage.getOpportunity(pastHoldOpp.id);
      expect(oppUpdated?.status).toBe("expired_released");

      // 15. Auditoría e historial permanecen intactos
      const logs = await oppStorage.getCommercialAuditLogs(
        "commercial_opportunity",
        pastHoldOpp.id
      );
      const releaseLog = logs.find((l) => l.action === "opportunity_expired_released");
      expect(releaseLog).toBeDefined();
      expect(releaseLog?.newState).toBe("expired_released");
    });

    it("7. libera oportunidad en 'protected_active' que superó el periodo de inactividad sin nuevas actividades", async () => {
      // Oportunidad que estuvo protegida pero cuya última protección venció
      const inactiveOpp = await oppStorage.createCommercialOpportunity({
        clientId: sampleClient.id,
        brokerId: "broker-inactivo",
        title: "Oportunidad inactiva",
        financingNeedType: "arrendamiento",
        requestedAmount: "1200000.00",
        status: "protected_active",
        holdExpiresAt: new Date("2026-07-01T00:00:00Z"),
        protectedUntil: new Date("2026-09-15T00:00:00Z"), // Venció hace 10 días
        lastValidActivityAt: new Date("2026-08-01T00:00:00Z"),
      } as any);

      const releaseResult = await oppService.evaluateAndReleaseExpiredOpportunities(now);

      expect(releaseResult.releasedCount).toBe(1);
      expect(releaseResult.releasedOpportunities[0].id).toBe(inactiveOpp.id);

      const oppUpdated = await oppStorage.getOpportunity(inactiveOpp.id);
      expect(oppUpdated?.status).toBe("expired_released");
    });
  });

  // ==========================================================================
  // 8, 9, 10: Check-Duplicates Enriquecido y Equivalencia de Oportunidades
  // ==========================================================================
  describe("8, 9 & 10. Check-Duplicates Enriquecido y Equivalencia", () => {
    it("8. cliente existente sin oportunidad equivalente permite crear oportunidad ('canCreateOpportunity: true')", async () => {
      // Cliente existe en el tenant pero no tiene oportunidades
      const check = await oppService.checkDuplicatesEnriched({
        rfc: sampleClient.rfc,
        phone: sampleClient.phone,
        financingNeedType: "credito_empresarial",
        currentUserId: "broker-nuevo",
        userTenantId: "tenant-fase4-1",
        now,
      });

      expect(check.hasDuplicate).toBe(true);
      expect(check.clientExists).toBe(true);
      expect(check.isSameTenant).toBe(true);
      expect(check.canCreateOpportunity).toBe(true);
      expect(check.duplicateReason).toBe("client_historical_eligible");
      expect(check.message.toLowerCase()).toContain("elegible para registrar una nueva oportunidad comercial");
    });

    it("9. oportunidad equivalente protegida de otro broker bloquea creación con motivo claro", async () => {
      // Broker A tiene una oportunidad activa protegida para credito_empresarial
      await oppStorage.createCommercialOpportunity({
        id: "opp-broker-a",
        clientId: sampleClient.id,
        brokerId: "broker-a",
        title: "Crédito simple en trámite",
        financingNeedType: "credito_empresarial",
        requestedAmount: "2000000.00",
        status: "protected_active",
        holdExpiresAt: new Date("2026-09-20T00:00:00Z"),
        protectedUntil: new Date("2026-10-30T00:00:00Z"), // Vigente
        lastValidActivityAt: now,
      } as any);

      // Broker B consulta el cliente para la misma necesidad
      const check = await oppService.checkDuplicatesEnriched({
        rfc: sampleClient.rfc,
        financingNeedType: "credito_empresarial",
        currentUserId: "broker-b",
        userTenantId: "tenant-fase4-1",
        now,
      });

      expect(check.hasDuplicate).toBe(true);
      expect(check.canCreateOpportunity).toBe(false);
      expect(check.duplicateReason).toBe("client_has_protected_opportunity");
      expect(check.message).toContain("oportunidad protegida vigente");
      expect(check.activeOpportunity?.id).toBe("opp-broker-a");

      // Intento de creación por Broker B debe ser rechazado con conflicto
      authStorage.relationships = [
        {
          id: "rel-b",
          clientId: sampleClient.id,
          brokerId: "broker-b",
          status: "active",
          activeUntil: new Date("2026-12-31T00:00:00Z"),
        } as any,
      ];

      const createResult = await oppService.createOpportunity({
        clientId: sampleClient.id,
        brokerId: "broker-b",
        title: "Intento duplicado de crédito",
        financingNeedType: "credito_empresarial",
        requestedAmount: "2000000.00",
        userRole: "broker",
        tenantContext: { tenant: { id: "tenant-fase4-1" } },
        now,
      });

      // 1. Intento de creación por Broker B debe ser rechazado con 409 conflicto
      expect(createResult.success).toBe(false);
      expect(createResult.conflict).toBe(true);
      expect(createResult.code).toBe("PROTECTED_OPPORTUNITY_EXISTS");
      expect(createResult.conflictingOpportunity?.brokerId).toBe("broker-a");

      // 2. Regla Crítica: La oportunidad existente conserva exactamente su estado protegido (NO se degrada ni pasa a disputed)
      const oppInStorage = await oppStorage.getOpportunity("opp-broker-a");
      expect(oppInStorage?.status).toBe("protected_active");
      expect(oppInStorage?.status).not.toBe("disputed");

      // 3. Auditoría registró el intento de conflicto con estado inalterado
      const conflictLogs = await oppStorage.getCommercialAuditLogs(
        "commercial_opportunity",
        "opp-broker-a"
      );
      const attemptLog = conflictLogs.find((l) => l.action === "opportunity_conflict_attempt");
      expect(attemptLog).toBeDefined();
      expect(attemptLog?.previousState).toBe("protected_active");
      expect(attemptLog?.newState).toBe("protected_active");
      expect((attemptLog?.metadata as any).conflictResult).toBe("rejected_with_409");
      expect((attemptLog?.metadata as any).statusPreserved).toBe(true);
    });

    it("10. cliente con crédito histórico u oportunidad en otra línea NO bloquea nueva oportunidad distinta", async () => {
      // Broker A tiene arrendamiento protegido
      await oppStorage.createCommercialOpportunity({
        id: "opp-leasing",
        clientId: sampleClient.id,
        brokerId: "broker-a",
        title: "Arrendamiento de equipo",
        financingNeedType: "arrendamiento",
        requestedAmount: "1000000.00",
        status: "protected_active",
        holdExpiresAt: new Date("2026-09-20T00:00:00Z"),
        protectedUntil: new Date("2026-10-30T00:00:00Z"),
        lastValidActivityAt: now,
      } as any);

      // Broker B consulta para factoraje (necesidad financiera completamente distinta)
      const check = await oppService.checkDuplicatesEnriched({
        rfc: sampleClient.rfc,
        financingNeedType: "factoraje",
        currentUserId: "broker-b",
        userTenantId: "tenant-fase4-1",
        now,
      });

      expect(check.canCreateOpportunity).toBe(true);
      expect(check.duplicateReason).not.toBe("client_has_protected_opportunity");
    });
  });

  // ==========================================================================
  // 11 & 12: Permisos de ClientAccessScope en Oportunidades
  // ==========================================================================
  describe("11 & 12. Permisos Scoped: commercial_dormant y historical_scoped", () => {
    it("11. broker 'commercial_dormant' puede registrar una nueva oportunidad para iniciar reactivación", async () => {
      // Broker con relación dormant
      const dormantRel: ClientCommercialRelationship = {
        id: "rel-dormant",
        clientId: sampleClient.id,
        brokerId: "broker-dormant",
        status: "dormant",
        activeUntil: new Date("2026-05-01T00:00:00Z"),
      } as any;
      authStorage.relationships = [dormantRel];
      oppStorage.relationships = [dormantRel];

      const result = await oppService.createOpportunity({
        clientId: sampleClient.id,
        brokerId: "broker-dormant",
        title: "Oportunidad de reactivación",
        financingNeedType: "credito_empresarial",
        requestedAmount: "1500000.00",
        userRole: "broker",
        tenantContext: { tenant: { id: "tenant-fase4-1" } },
        now,
      });

      expect(result.success).toBe(true);
      expect(result.opportunity?.status).toBe("registered_hold");

      // Luego, al registrar actividad estructurada válida, se reactiva la relación
      const actResult = await oppService.recordActivity({
        clientId: sampleClient.id,
        opportunityId: result.opportunity!.id,
        brokerId: "broker-dormant",
        activityType: "meeting_conducted",
        title: "Reunión de reactivación",
        performedAt: now,
        now,
      });

      expect(actResult.success).toBe(true);
      expect(actResult.relationshipReactivated).toBe(true);

      const relUpdated = await oppStorage.getCommercialRelationship(
        sampleClient.id,
        "broker-dormant"
      );
      expect(relUpdated?.status).toBe("active");
    });

    it("12. broker 'historical_scoped' NO puede ver oportunidades nuevas creadas por otros brokers", async () => {
      // Broker histórico originó un crédito en 2023, pero no tiene relación activa ni oportunidad
      authStorage.credits = [
        {
          id: "cred-hist-1",
          clientId: sampleClient.id,
          brokerId: "broker-originador-historico",
          amount: "1000000.00",
        } as any,
      ];

      // Oportunidad nueva creada por Broker Actual
      const oppActual = await oppStorage.createCommercialOpportunity({
        id: "opp-actual-1",
        clientId: sampleClient.id,
        brokerId: "broker-actual",
        title: "Nueva expansión 2026",
        financingNeedType: "credito_empresarial",
        requestedAmount: "5000000.00",
        status: "protected_active",
        holdExpiresAt: new Date("2026-09-20T00:00:00Z"),
        protectedUntil: new Date("2026-11-01T00:00:00Z"),
        lastValidActivityAt: now,
      } as any);

      const listResult = await oppService.getClientOpportunities({
        clientId: sampleClient.id,
        userId: "broker-originador-historico",
        userRole: "broker",
        tenantContext: { tenant: { id: "tenant-fase4-1" } },
        now,
      });

      expect(listResult.authorized).toBe(true);
      expect(listResult.scope).toBe("historical_scoped");
      // Regla Crítica: NO puede ver la oportunidad del broker actual
      expect(listResult.opportunities.some((o) => o.id === oppActual.id)).toBe(false);
      expect(listResult.opportunities.length).toBe(0);
    });
  });

  // ==========================================================================
  // 13: Aislamiento Multi-Tenant
  // ==========================================================================
  describe("13. Aislamiento Multi-Tenant en Check-Duplicates y Oportunidades", () => {
    it("bloquea acceso a cliente de otra organización en check-duplicates sin filtrar datos sensibles", async () => {
      const clientTenantAlien: Client = {
        id: "client-alien-1",
        brokerId: "broker-alien",
        businessName: "Corporativo Foráneo SA",
        rfc: "FOR990909ABC",
        phone: "5599887766",
        email: "foraneo@empresa.com",
        tenantId: "tenant-alien-99",
      } as any;
      oppStorage.clients.push(clientTenantAlien);

      const check = await oppService.checkDuplicatesEnriched({
        rfc: "FOR990909ABC",
        currentUserId: "broker-local",
        userTenantId: "tenant-local-1",
        now,
      });

      expect(check.hasDuplicate).toBe(true);
      expect(check.clientExists).toBe(true);
      expect(check.isSameTenant).toBe(false);
      expect(check.canCreateOpportunity).toBe(false);
      expect(check.duplicateReason).toBe("cross_tenant_collision");
      expect(check.existingClient).toBeUndefined(); // Privacidad estricta entre tenants
      expect(check.message).toContain("otra organización");
    });
  });

  // ==========================================================================
  // 15: Integridad Histórica y Auditoría
  // ==========================================================================
  describe("15. Integridad Histórica y Auditoría Inmutable", () => {
    it("conserva bitácora inmutable en cada paso del ciclo de vida", async () => {
      const activeRel: ClientCommercialRelationship = {
        id: "rel-audit-1",
        clientId: sampleClient.id,
        brokerId: "broker-audit",
        status: "active",
        activeUntil: new Date("2026-12-31T00:00:00Z"),
      } as any;
      authStorage.relationships = [activeRel];
      oppStorage.relationships = [activeRel];

      // 1. Crear
      const createRes = await oppService.createOpportunity({
        clientId: sampleClient.id,
        brokerId: "broker-audit",
        title: "Prueba Auditoría",
        financingNeedType: "credito_simple",
        requestedAmount: "800000.00",
        tenantContext: { tenant: { id: "tenant-fase4-1" } },
        now,
      });

      // 2. Registrar actividad válida
      await oppService.recordActivity({
        clientId: sampleClient.id,
        opportunityId: createRes.opportunity!.id,
        brokerId: "broker-audit",
        activityType: "proposal_sent",
        title: "Envío de cotización formal",
        performedAt: now,
      });

      // 3. Consultar auditoría acumulada
      const logs = await oppStorage.getCommercialAuditLogs(
        "commercial_opportunity",
        createRes.opportunity!.id
      );

      expect(logs.length).toBe(2);
      expect(logs[0].action).toBe("opportunity_created");
      expect(logs[1].action).toBe("opportunity_hold_validated");
    });
  });

  // ==========================================================================
  // Controversias Formales y Reglas de Disputed
  // ==========================================================================
  describe("Controversias Formales y Reglas de Disputed", () => {
    let protectedOpp: CommercialOpportunity;

    beforeEach(async () => {
      protectedOpp = await oppStorage.createCommercialOpportunity({
        id: "opp-to-dispute-1",
        clientId: sampleClient.id,
        brokerId: "broker-titular",
        title: "Crédito simple en curso",
        financingNeedType: "credito_empresarial",
        requestedAmount: "3000000.00",
        status: "protected_active",
        holdExpiresAt: new Date("2026-09-20T00:00:00Z"),
        protectedUntil: new Date("2026-11-15T00:00:00Z"),
        lastValidActivityAt: now,
      } as any);
    });

    it("rechaza intento de broker de pasar a 'disputed' con una simple afirmación o nota unilateral sin evidencia", async () => {
      // Un broker competidor afirma verbalmente o por nota que el cliente quiere cambiar
      const disputeRes = await oppService.openFormalDispute({
        opportunityId: protectedOpp.id,
        disputeReason: "client_broker_change_request",
        justification: "El cliente me llamó por teléfono y me dijo que quiere trabajar conmigo",
        evidenceUrl: null, // Sin evidencia documental
        clientElectionToken: null, // Sin token de confirmación digital
        verificationMethod: null,
        performedBy: "broker-competidor",
        userRole: "broker",
        now,
      });

      expect(disputeRes.success).toBe(false);
      expect(disputeRes.code).toBe("UNILATERAL_CLAIM_REJECTED");
      expect(disputeRes.message).toContain("Una nota o afirmación unilateral del broker no puede degradar derechos");

      // La oportunidad existente permanece intacta en protected_active
      const oppInDb = await oppStorage.getOpportunity(protectedOpp.id);
      expect(oppInDb?.status).toBe("protected_active");
      expect(oppInDb?.status).not.toBe("disputed");
    });

    it("rechaza controversia por evidencia contradictoria si no se proporciona URL de evidencia", async () => {
      const disputeRes = await oppService.openFormalDispute({
        opportunityId: protectedOpp.id,
        disputeReason: "contradictory_evidence",
        justification: "Hay solicitudes contradictorias ingresadas en otra financiera",
        evidenceUrl: "", // Vacía
        performedBy: "broker-competidor",
        userRole: "broker",
        now,
      });

      expect(disputeRes.success).toBe(false);
      expect(disputeRes.code).toBe("EVIDENCE_REQUIRED");

      const oppInDb = await oppStorage.getOpportunity(protectedOpp.id);
      expect(oppInDb?.status).toBe("protected_active");
    });

    it("rechaza apertura por 'mesa_control_intervention' si el solicitante no es Mesa de Control / Admin", async () => {
      const disputeRes = await oppService.openFormalDispute({
        opportunityId: protectedOpp.id,
        disputeReason: "mesa_control_intervention",
        justification: "Intento de usurpación de causal administrativa",
        performedBy: "broker-competidor",
        userRole: "broker", // Rol broker regular
        now,
      });

      expect(disputeRes.success).toBe(false);
      expect(disputeRes.code).toBe("FORBIDDEN_REASON");

      const oppInDb = await oppStorage.getOpportunity(protectedOpp.id);
      expect(oppInDb?.status).toBe("protected_active");
    });

    it("permite a Mesa de Control abrir formalmente controversia y transicionar a 'disputed' con auditoría", async () => {
      const disputeRes = await oppService.openFormalDispute({
        opportunityId: protectedOpp.id,
        disputeReason: "mesa_control_intervention",
        justification: "Apertura formal de controversia por duplicidad de expedientes ingresados a fondeador",
        performedBy: "admin-mesa-control",
        userRole: "admin",
        now,
      });

      expect(disputeRes.success).toBe(true);
      expect(disputeRes.opportunity?.status).toBe("disputed");

      const oppInDb = await oppStorage.getOpportunity(protectedOpp.id);
      expect(oppInDb?.status).toBe("disputed");

      // Verificación de auditoría inmutable
      const logs = await oppStorage.getCommercialAuditLogs("commercial_opportunity", protectedOpp.id);
      const disputeLog = logs.find((l) => l.action === "opportunity_disputed");
      expect(disputeLog).toBeDefined();
      expect(disputeLog?.previousState).toBe("protected_active");
      expect(disputeLog?.newState).toBe("disputed");
      expect((disputeLog?.metadata as any).disputeReason).toBe("mesa_control_intervention");
    });

    it("permite abrir controversia cuando existe solicitud verificable de cambio de broker por el cliente (carta firmada)", async () => {
      const disputeRes = await oppService.openFormalDispute({
        opportunityId: protectedOpp.id,
        disputeReason: "client_broker_change_request",
        justification: "Cliente remitió carta formal membretada y firmada solicitando sustitución de broker",
        evidenceUrl: "https://storage.creditonegocios.com/docs/carta_cambio_broker_firmada.pdf",
        verificationMethod: "signed_letter",
        performedBy: "broker-nuevo",
        userRole: "broker",
        now,
      });

      expect(disputeRes.success).toBe(true);
      expect(disputeRes.opportunity?.status).toBe("disputed");

      const oppInDb = await oppStorage.getOpportunity(protectedOpp.id);
      expect(oppInDb?.status).toBe("disputed");

      const logs = await oppStorage.getCommercialAuditLogs("commercial_opportunity", protectedOpp.id);
      const disputeLog = logs.find((l) => l.action === "opportunity_disputed");
      expect(disputeLog).toBeDefined();
      expect((disputeLog?.metadata as any).verificationMethod).toBe("signed_letter");
      expect((disputeLog?.metadata as any).evidenceUrl).toContain("carta_cambio_broker_firmada.pdf");
    });

    it("no permite abrir controversia en oportunidades con estado terminal ('converted_credit' o 'rejected')", async () => {
      const convertedOpp = await oppStorage.createCommercialOpportunity({
        id: "opp-converted-1",
        clientId: sampleClient.id,
        brokerId: "broker-titular",
        title: "Crédito liquidado/convertido",
        financingNeedType: "credito_empresarial",
        requestedAmount: "1000000.00",
        status: "converted_credit",
        holdExpiresAt: now,
      } as any);

      const disputeRes = await oppService.openFormalDispute({
        opportunityId: convertedOpp.id,
        disputeReason: "mesa_control_intervention",
        justification: "Intento sobre crédito ya cerrado",
        performedBy: "admin-1",
        userRole: "admin",
        now,
      });

      expect(disputeRes.success).toBe(false);
      expect(disputeRes.code).toBe("TERMINAL_STATE");
    });
  });
});
