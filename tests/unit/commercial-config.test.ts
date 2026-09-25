import {
  DEFAULT_COMMERCIAL_RULES_CONFIG,
  updateCommercialRulesConfigSchema,
  insertCommercialConfigurationSchema,
  insertCommercialConfigAuditLogSchema,
  type Client,
  type CreditSubmissionRequest,
  type CommercialRulesConfig,
} from "../../shared/schema";
import {
  CommercialConfigService,
  MockCommercialConfigStorage,
} from "../../server/commercialConfigService";
import {
  CommercialBackfillService,
  ICommercialBackfillStorage,
} from "../../server/commercialBackfillService";

/**
 * Mock storage para pruebas unitarias deterministas del backfill
 */
class MockBackfillStorageForConfigTest implements ICommercialBackfillStorage {
  clients: Client[] = [];
  submissions: CreditSubmissionRequest[] = [];
  relationships: any[] = [];
  rulesVersions: any[] = [];

  async getClients(): Promise<Client[]> {
    return [...this.clients];
  }
  async getCredits(): Promise<any[]> {
    return [];
  }
  async getDocuments(): Promise<any[]> {
    return [];
  }
  async getCreditSubmissionRequests(): Promise<CreditSubmissionRequest[]> {
    return [...this.submissions];
  }
  async getExistingRelationships(): Promise<any[]> {
    return [...this.relationships];
  }
  async createCommercialRelationship(data: any): Promise<any> {
    const record = { id: `rel-${this.relationships.length + 1}`, ...data };
    this.relationships.push(record);
    return record;
  }
  async getOperationalRulesVersion(version: string): Promise<any> {
    return this.rulesVersions.find((r) => r.version === version);
  }
  async createOperationalRulesVersion(data: any): Promise<any> {
    const record = { id: `rule-${this.rulesVersions.length + 1}`, ...data };
    this.rulesVersions.push(record);
    return record;
  }
}

describe("Configuración Centralizada de Reglas Comerciales (Super Admin)", () => {
  let mockConfigStorage: MockCommercialConfigStorage;
  let configService: CommercialConfigService;

  beforeEach(() => {
    mockConfigStorage = new MockCommercialConfigStorage();
    configService = new CommercialConfigService(mockConfigStorage);
  });

  describe("Valores por Defecto y Consulta Inicial", () => {
    it("retorna los 7 parámetros default exactos cuando no existe configuración persistida", async () => {
      const config = await configService.getConfig();

      expect(config).toEqual({
        activeRelationshipValidityDays: 90,
        initialOpportunityHoldDays: 7,
        opportunityInactivityProtectionDays: 45,
        inboundPriorityHours: 48,
        renewalWindowDaysBeforeMaturity: 180,
        renewalOriginatorPriorityDays: 15,
        brokerElectionTokenValidityHours: 72,
      });
      expect(config).toEqual(DEFAULT_COMMERCIAL_RULES_CONFIG);
    });
  });

  describe("Actualización Dinámica con Auditoría Inmutable", () => {
    it("registra un log de auditoría inmutable con valor anterior y nuevo por cada parámetro modificado", async () => {
      const userId = "super-admin-uuid-1";
      const reason = "Ajuste de política de gobernanza comercial para acelerar rotación";

      const { updatedConfig, modifiedParams } = await configService.updateConfig(
        {
          activeRelationshipValidityDays: 60,
          initialOpportunityHoldDays: 10,
        },
        userId,
        reason
      );

      expect(modifiedParams).toEqual([
        "activeRelationshipValidityDays",
        "initialOpportunityHoldDays",
      ]);
      expect(updatedConfig.activeRelationshipValidityDays).toBe(60);
      expect(updatedConfig.initialOpportunityHoldDays).toBe(10);
      // Los no modificados preservan sus defaults
      expect(updatedConfig.opportunityInactivityProtectionDays).toBe(45);
      expect(updatedConfig.brokerElectionTokenValidityHours).toBe(72);

      // Verificar bitácora de auditoría
      const auditLogs = await configService.getAuditHistory();
      expect(auditLogs).toHaveLength(2);

      const auditDays = auditLogs.find((l) => l.parameterKey === "activeRelationshipValidityDays");
      expect(auditDays).toBeDefined();
      expect(auditDays?.previousValue).toBe("90");
      expect(auditDays?.newValue).toBe("60");
      expect(auditDays?.changedBy).toBe(userId);
      expect(auditDays?.changeReason).toBe(reason);

      const auditHold = auditLogs.find((l) => l.parameterKey === "initialOpportunityHoldDays");
      expect(auditHold).toBeDefined();
      expect(auditHold?.previousValue).toBe("7");
      expect(auditHold?.newValue).toBe("10");
      expect(auditHold?.changedBy).toBe(userId);
    });

    it("no genera logs de auditoría si el valor enviado es idéntico al actual", async () => {
      await configService.updateConfig({ activeRelationshipValidityDays: 90 }, "admin-1");
      const auditLogs = await configService.getAuditHistory();
      expect(auditLogs).toHaveLength(0);
    });
  });

  describe("Validación de Esquema Zod para Parámetros", () => {
    it("valida exitosamente un payload de actualización parcial", () => {
      const validPayload = {
        activeRelationshipValidityDays: 120,
        inboundPriorityHours: 72,
        reason: "Ampliación de margen comercial para puente festivo",
      };
      const result = updateCommercialRulesConfigSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
    });

    it("rechaza valores fuera de rango o tipos incorrectos", () => {
      const invalidPayload = {
        activeRelationshipValidityDays: -5, // No puede ser negativo
      };
      const result = updateCommercialRulesConfigSchema.safeParse(invalidPayload);
      expect(result.success).toBe(false);
    });
  });

  describe("Comportamiento Dinámico del Backfill sin Modificar Código", () => {
    it("cambiar activeRelationshipValidityDays modifica el estado asignado de un cliente entre active y legacy_unverified", async () => {
      const referenceDate = new Date("2026-09-24T12:00:00Z");
      // Cliente con actividad comercial hace exactamente 75 días
      const activityDate75DaysAgo = new Date(
        referenceDate.getTime() - 75 * 24 * 60 * 60 * 1000
      );

      const client: Client = {
        id: "client-test-75d",
        brokerId: "broker-1",
        businessName: "Comercializadora Dinámica SA",
        createdAt: new Date("2024-01-01T00:00:00Z"),
      } as any;

      const submission: CreditSubmissionRequest = {
        id: "sub-75d",
        clientId: client.id,
        status: "in_review",
        createdAt: activityDate75DaysAgo,
        updatedAt: activityDate75DaysAgo,
      } as any;

      // ESCENARIO 1: Configuración con default (90 días)
      // Como 75 días <= 90 días, debe calificar como 'active'
      const backfillStorage1 = new MockBackfillStorageForConfigTest();
      backfillStorage1.clients = [client];
      backfillStorage1.submissions = [submission];

      const backfillService1 = new CommercialBackfillService(backfillStorage1, configService);
      const summary1 = await backfillService1.runBackfill({ referenceDate });

      expect(summary1.assignedActive).toBe(1);
      expect(summary1.assignedLegacyUnverified).toBe(0);
      expect(backfillStorage1.relationships[0].status).toBe("active");
      expect(backfillStorage1.relationships[0].activeUntil).toEqual(
        new Date(activityDate75DaysAgo.getTime() + 90 * 24 * 60 * 60 * 1000)
      );

      // ESCENARIO 2: Super Admin ajusta la regla a 60 días
      await configService.updateConfig(
        { activeRelationshipValidityDays: 60 },
        "super-admin-1",
        "Reducción de vigencia comercial de cartera"
      );

      // Ahora el cliente (con 75 días de inactividad) supera los 60 días permitidos.
      // Debe clasificar como 'legacy_unverified' SIN alterar código
      const backfillStorage2 = new MockBackfillStorageForConfigTest();
      backfillStorage2.clients = [client];
      backfillStorage2.submissions = [submission];

      const backfillService2 = new CommercialBackfillService(backfillStorage2, configService);
      const summary2 = await backfillService2.runBackfill({ referenceDate });

      expect(summary2.assignedActive).toBe(0);
      expect(summary2.assignedLegacyUnverified).toBe(1);
      expect(backfillStorage2.relationships[0].status).toBe("legacy_unverified");
      expect(backfillStorage2.relationships[0].activeUntil).toBeNull();
      expect(backfillStorage2.relationships[0].lastActivitySummary).toContain(
        "Cliente previo a la ventana de 60 días sin interacción comercial comprobable"
      );
    });


    it("aplica de forma prospectiva: cambiar la configuración NO muta retroactivamente relaciones ya existentes", async () => {
      const referenceDate = new Date("2026-09-24T12:00:00Z");
      const client: Client = {
        id: "client-established",
        brokerId: "broker-1",
        businessName: "Empresa Establecida SA",
        createdAt: new Date("2024-01-01T00:00:00Z"),
      } as any;

      const submission: CreditSubmissionRequest = {
        id: "sub-recent",
        clientId: client.id,
        status: "approved",
        createdAt: new Date(referenceDate.getTime() - 80 * 24 * 60 * 60 * 1000), // 80 días atrás
      } as any;

      const storage = new MockBackfillStorageForConfigTest();
      storage.clients = [client];
      storage.submissions = [submission];

      // 1. Ejecutar backfill con 90 días (califica como active)
      const service = new CommercialBackfillService(storage, configService);
      await service.runBackfill({ referenceDate });
      expect(storage.relationships[0].status).toBe("active");
      const establishedActiveUntil = storage.relationships[0].activeUntil;

      // 2. Super Admin reduce la regla a 30 días
      await configService.updateConfig({ activeRelationshipValidityDays: 30 }, "admin-1");

      // 3. Re-ejecutar el backfill con la nueva regla
      const secondRunSummary = await service.runBackfill({ referenceDate });

      // Idempotencia y preservación de derechos consolidados:
      // El cliente ya existía, por lo que fue omitido y sus datos permanecen intactos
      expect(secondRunSummary.alreadyExistingSkipped).toBe(1);
      expect(secondRunSummary.newRelationshipsCreated).toBe(0);
      expect(storage.relationships[0].status).toBe("active");
      expect(storage.relationships[0].activeUntil).toEqual(establishedActiveUntil);
    });
  });
});
