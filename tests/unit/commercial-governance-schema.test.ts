import {
  COMMERCIAL_RELATIONSHIP_STATUSES,
  COMMERCIAL_OPPORTUNITY_STATUSES,
  COMMERCIAL_ACTIVITY_TYPES,
  BROKER_ELECTION_STATUSES,
  CLIENT_ACCESS_SCOPES,
  DEFAULT_COMMERCIAL_RULES_CONFIG,
  insertClientCommercialRelationshipSchema,
  insertCommercialOpportunitySchema,
  insertCommercialActivitySchema,
  insertBrokerElectionConfirmationSchema,
  insertCommercialAuditLogSchema,
  insertOperationalRulesVersionSchema,
  insertUserRuleAcknowledgmentSchema,
  insertCommercialConfigurationSchema,
  insertCommercialConfigAuditLogSchema,
  commercialConfigurations,
  commercialConfigAuditLogs,
  clients,
} from "../../shared/schema";


describe("Fase 1: Modelo de Datos y Esquemas de Gobernanza Comercial", () => {
  describe("Constantes de Estado y Tipos", () => {
    it("debe contener todos los estados definidos para relación comercial", () => {
      expect(COMMERCIAL_RELATIONSHIP_STATUSES).toEqual([
        "active",
        "dormant",
        "inactive",
        "legacy_unverified",
        "reassigned",
      ]);
    });

    it("debe contener todos los estados definidos para oportunidades", () => {
      expect(COMMERCIAL_OPPORTUNITY_STATUSES).toEqual([
        "registered_hold",
        "protected_active",
        "expired_released",
        "converted_credit",
        "disputed",
        "rejected",
      ]);
    });

    it("debe contener todos los tipos de actividad comercial válida", () => {
      expect(COMMERCIAL_ACTIVITY_TYPES).toEqual([
        "customer_reply",
        "meeting_conducted",
        "financial_doc_uploaded",
        "proposal_sent",
        "submission_created",
        "approval_received",
      ]);
    });

    it("debe contener los estados de elección de broker", () => {
      expect(BROKER_ELECTION_STATUSES).toEqual([
        "pending",
        "confirmed",
        "expired",
        "revoked",
        "rejected",
      ]);
    });

    it("debe contener los 5 scopes de acceso al cliente", () => {
      expect(CLIENT_ACCESS_SCOPES).toEqual([
        "full",
        "commercial_dormant",
        "master_broker_oversight",
        "historical_scoped",
        "none",
      ]);
    });
  });

  describe("Validación Zod: client_commercial_relationships", () => {
    it("valida exitosamente un registro con status default legacy_unverified", () => {
      const payload = {
        clientId: "client-uuid-1",
        brokerId: "broker-uuid-1",
        status: "legacy_unverified" as const,
        notes: "Migración inicial",
      };
      const result = insertClientCommercialRelationshipSchema.safeParse(payload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe("legacy_unverified");
      }
    });

    it("falla si falta clientId o brokerId", () => {
      const invalidPayload = {
        notes: "Sin cliente",
      };
      const result = insertClientCommercialRelationshipSchema.safeParse(invalidPayload);
      expect(result.success).toBe(false);
    });
  });

  describe("Validación Zod: commercial_opportunities", () => {
    it("valida una oportunidad concreta con necesidad y monto", () => {
      const payload = {
        clientId: "client-uuid-1",
        brokerId: "broker-uuid-1",
        title: "Capital de Trabajo $3M",
        financingNeedType: "capital_trabajo",
        requestedAmount: "3000000.00",
        holdExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      };
      const result = insertCommercialOpportunitySchema.safeParse(payload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe("registered_hold");
        expect(result.data.requestedAmount).toBe("3000000.00");
      }
    });
  });

  describe("Validación Zod: commercial_activities", () => {
    it("valida el registro de un hito comercial válido", () => {
      const payload = {
        clientId: "client-uuid-1",
        brokerId: "broker-uuid-1",
        activityType: "meeting_conducted",
        title: "Reunión de balance financiero con CFO",
        description: "Revisión de estados financieros del Q2 2026",
      };
      const result = insertCommercialActivitySchema.safeParse(payload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.activityType).toBe("meeting_conducted");
      }
    });
  });

  describe("Validación Zod: broker_election_confirmations", () => {
    it("valida la creación de un token de elección digital", () => {
      const payload = {
        clientId: "client-uuid-1",
        selectedBrokerId: "broker-uuid-2",
        channel: "email_secure_link",
        recipientContact: "finanzas@cliente.com",
        recipientName: "Lic. Carlos Mendoza",
        recipientRole: "Director de Finanzas",
        tokenHash: "hash-token-72h-12345",
        tokenExpiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
      };
      const result = insertBrokerElectionConfirmationSchema.safeParse(payload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe("pending");
      }
    });
  });

  describe("Validación Zod: operational_rules_versions", () => {
    it("valida una versión del Centro de Reglas de Operación", () => {
      const payload = {
        version: "1.0.0",
        title: "Reglas de Operación y Gobernanza Comercial v1.0",
        summary: "Criterios oficiales de relación cliente-broker y protección de oportunidades",
        contentMarkdown: "# Reglas de Operación...",
        effectiveDate: "2026-09-24",
        isCurrent: true,
      };
      const result = insertOperationalRulesVersionSchema.safeParse(payload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.version).toBe("1.0.0");
        expect(result.data.isCurrent).toBe(true);
      }
    });
  });

  describe("Integridad Retrocompatible de clients.brokerId", () => {
    it("confirma que la columna brokerId en la tabla clients sigue existiendo y es requerida", () => {
      expect(clients.brokerId).toBeDefined();
      expect(clients.brokerId.name).toBe("broker_id");
      expect(clients.brokerId.notNull).toBe(true);
    });
  });

  describe("Configuración Centralizada de Reglas Comerciales", () => {
    it("valida la tabla de configuración comercial y sus defaults", () => {
      expect(commercialConfigurations.id).toBeDefined();
      expect(commercialConfigurations.activeRelationshipValidityDays).toBeDefined();
      expect(commercialConfigurations.initialOpportunityHoldDays).toBeDefined();
      expect(commercialConfigurations.opportunityInactivityProtectionDays).toBeDefined();
      expect(commercialConfigurations.inboundPriorityHours).toBeDefined();
      expect(commercialConfigurations.renewalWindowDaysBeforeMaturity).toBeDefined();
      expect(commercialConfigurations.renewalOriginatorPriorityDays).toBeDefined();
      expect(commercialConfigurations.brokerElectionTokenValidityHours).toBeDefined();

      const validPayload = {
        id: "default",
        ...DEFAULT_COMMERCIAL_RULES_CONFIG,
      };
      const result = insertCommercialConfigurationSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
    });

    it("valida la tabla de bitácora de auditoría de configuración", () => {
      expect(commercialConfigAuditLogs.parameterKey).toBeDefined();
      expect(commercialConfigAuditLogs.previousValue).toBeDefined();
      expect(commercialConfigAuditLogs.newValue).toBeDefined();

      const validLog = {
        parameterKey: "activeRelationshipValidityDays",
        previousValue: "90",
        newValue: "60",
        changedBy: "user-superadmin-1",
        changeReason: "Ajuste de política comercial",
      };
      const result = insertCommercialConfigAuditLogSchema.safeParse(validLog);
      expect(result.success).toBe(true);
    });
  });
});

