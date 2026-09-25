import {
  CommercialBackfillService,
  ICommercialBackfillStorage,
  INITIAL_OPERATIONAL_RULES_V1,
} from "../../server/commercialBackfillService";
import type {
  Client,
  Credit,
  Document,
  CreditSubmissionRequest,
  ClientCommercialRelationship,
  OperationalRulesVersion,
  InsertClientCommercialRelationship,
  InsertOperationalRulesVersion,
} from "../../shared/schema";

/**
 * Storage en memoria mockeado para pruebas unitarias deterministas
 */
class MockCommercialBackfillStorage implements ICommercialBackfillStorage {
  clients: Client[] = [];
  credits: Credit[] = [];
  documents: Document[] = [];
  submissions: CreditSubmissionRequest[] = [];
  relationships: ClientCommercialRelationship[] = [];
  rulesVersions: OperationalRulesVersion[] = [];
  auditLogs: any[] = [];

  async getClients(): Promise<Client[]> {
    return [...this.clients];
  }

  async getCredits(): Promise<Credit[]> {
    return [...this.credits];
  }

  async getDocuments(): Promise<Document[]> {
    return [...this.documents];
  }

  async getCreditSubmissionRequests(): Promise<CreditSubmissionRequest[]> {
    return [...this.submissions];
  }

  async getExistingRelationships(): Promise<ClientCommercialRelationship[]> {
    return [...this.relationships];
  }

  async createCommercialRelationship(
    data: InsertClientCommercialRelationship
  ): Promise<ClientCommercialRelationship> {
    const record: ClientCommercialRelationship = {
      id: `rel-${this.relationships.length + 1}`,
      tenantId: data.tenantId ?? null,
      clientId: data.clientId,
      brokerId: data.brokerId,
      masterBrokerId: data.masterBrokerId ?? null,
      status: data.status ?? "legacy_unverified",
      lastValidActivityAt: data.lastValidActivityAt ? new Date(data.lastValidActivityAt) : null,
      lastActivityType: data.lastActivityType ?? null,
      lastActivitySummary: data.lastActivitySummary ?? null,
      activeUntil: data.activeUntil ? new Date(data.activeUntil) : null,
      dormantUntil: data.dormantUntil ? new Date(data.dormantUntil) : null,
      inboundPriorityExpiresAt: data.inboundPriorityExpiresAt
        ? new Date(data.inboundPriorityExpiresAt)
        : null,
      inboundPriorityStatus: data.inboundPriorityStatus ?? null,
      notes: data.notes ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.relationships.push(record);
    return record;
  }

  async getOperationalRulesVersion(version: string): Promise<OperationalRulesVersion | undefined> {
    return this.rulesVersions.find((r) => r.version === version);
  }

  async createOperationalRulesVersion(
    data: InsertOperationalRulesVersion
  ): Promise<OperationalRulesVersion> {
    const record: OperationalRulesVersion = {
      id: `rule-${this.rulesVersions.length + 1}`,
      version: data.version,
      title: data.title,
      summary: data.summary,
      contentMarkdown: data.contentMarkdown,
      effectiveDate: data.effectiveDate,
      isCurrent: data.isCurrent ?? false,
      requiresAcknowledgment: data.requiresAcknowledgment ?? false,
      createdBy: data.createdBy ?? null,
      createdAt: new Date(),
    };
    this.rulesVersions.push(record);
    return record;
  }
}

describe("Fase 2: Backfill Seguro e Idempotente de Gobernanza Comercial", () => {
  const referenceDate = new Date("2026-09-24T12:00:00Z");
  let mockStorage: MockCommercialBackfillStorage;
  let service: CommercialBackfillService;

  beforeEach(() => {
    mockStorage = new MockCommercialBackfillStorage();
    service = new CommercialBackfillService(mockStorage);
  });

  describe("Criterio Conservador: Clientes con Actividad Válida (<= 90 días)", () => {
    it("asigna 'active' a un cliente con solicitud de crédito reciente (30 días atrás)", async () => {
      const client: Client = {
        id: "client-sub-recent",
        brokerId: "broker-1",
        businessName: "Transportes del Norte SA",
        createdAt: new Date("2025-01-15T00:00:00Z"), // Antiguo
      } as any;

      const submission: CreditSubmissionRequest = {
        id: "sub-1",
        clientId: client.id,
        brokerId: "broker-1",
        requestedAmount: "2500000.00",
        status: "pending_admin",
        createdAt: new Date("2026-08-25T00:00:00Z"), // 30 días atrás
        updatedAt: new Date("2026-08-25T00:00:00Z"),
      } as any;

      mockStorage.clients.push(client);
      mockStorage.submissions.push(submission);

      const result = await service.runBackfill({ referenceDate });

      expect(result.totalClients).toBe(1);
      expect(result.assignedActive).toBe(1);
      expect(result.assignedLegacyUnverified).toBe(0);

      const rel = mockStorage.relationships[0];
      expect(rel.clientId).toBe(client.id);
      expect(rel.brokerId).toBe(client.brokerId);
      expect(rel.status).toBe("active");
      expect(rel.lastActivitySummary).toContain("Solicitud de crédito reciente");
      expect(rel.activeUntil).toBeDefined();
    });

    it("asigna 'active' a un cliente con documento financiero subido recientemente (15 días atrás)", async () => {
      const client: Client = {
        id: "client-doc-recent",
        brokerId: "broker-2",
        businessName: "Comercializadora Beta",
        createdAt: new Date("2024-06-01T00:00:00Z"), // Antiguo
      } as any;

      const doc: Document = {
        id: "doc-1",
        clientId: client.id,
        brokerId: "broker-2",
        type: "income_statement",
        fileName: "balance_q2_2026.pdf",
        uploadedAt: new Date("2026-09-09T00:00:00Z"), // 15 días atrás
      } as any;

      mockStorage.clients.push(client);
      mockStorage.documents.push(doc);

      const result = await service.runBackfill({ referenceDate });

      expect(result.assignedActive).toBe(1);
      const rel = mockStorage.relationships[0];
      expect(rel.status).toBe("active");
      expect(rel.lastActivitySummary).toContain("Documento comercial reciente");
    });

    it("asigna 'active' a un cliente registrado recientemente (hace 20 días)", async () => {
      const client: Client = {
        id: "client-brand-new",
        brokerId: "broker-3",
        businessName: "Startup Innovadora SA",
        createdAt: new Date("2026-09-04T00:00:00Z"), // 20 días atrás
      } as any;

      mockStorage.clients.push(client);

      const result = await service.runBackfill({ referenceDate });

      expect(result.assignedActive).toBe(1);
      const rel = mockStorage.relationships[0];
      expect(rel.status).toBe("active");
      expect(rel.lastActivitySummary).toContain("Cliente creado recientemente");
    });
  });

  describe("Criterio Conservador: Clientes sin Actividad (legacy_unverified)", () => {
    it("asigna 'legacy_unverified' a cliente antiguo sin ninguna interacción reciente", async () => {
      const client: Client = {
        id: "client-inactive",
        brokerId: "broker-1",
        businessName: "Mueblería Antigua SA",
        createdAt: new Date("2025-01-01T00:00:00Z"), // > 1 año atrás
      } as any;

      mockStorage.clients.push(client);

      const result = await service.runBackfill({ referenceDate });

      expect(result.assignedActive).toBe(0);
      expect(result.assignedLegacyUnverified).toBe(1);

      const rel = mockStorage.relationships[0];
      expect(rel.status).toBe("legacy_unverified");
      expect(rel.activeUntil).toBeNull();
    });

    it("NO otorga 'active' por simple actualización genérica de client.updatedAt", async () => {
      const client: Client = {
        id: "client-updated-recently",
        brokerId: "broker-1",
        businessName: "Ferretería Central",
        createdAt: new Date("2024-01-01T00:00:00Z"), // Antiguo
        updatedAt: new Date("2026-09-23T00:00:00Z"), // Ayer (cambio administrativo o de sistema)
      } as any;

      mockStorage.clients.push(client);

      const result = await service.runBackfill({ referenceDate });

      // No debe ser engañado por updatedAt
      expect(result.assignedActive).toBe(0);
      expect(result.assignedLegacyUnverified).toBe(1);
      expect(mockStorage.relationships[0].status).toBe("legacy_unverified");
    });
  });

  describe("Principio Central: Crédito Activo NO Implica Relación Comercial Activa", () => {
    it("asigna 'legacy_unverified' a un cliente con crédito de 48 meses colocado hace 1 año sin seguimiento reciente", async () => {
      const client: Client = {
        id: "client-with-old-active-credit",
        brokerId: "broker-originador",
        businessName: "Manufacturas del Centro SA",
        createdAt: new Date("2025-01-10T00:00:00Z"),
      } as any;

      const credit: Credit = {
        id: "credit-48m",
        clientId: client.id,
        brokerId: "broker-originador",
        amount: "5000000.00",
        term: 48,
        status: "active", // Crédito vivo amortizándose
        startDate: "2025-02-01",
        createdAt: new Date("2025-02-01T00:00:00Z"), // Colocado hace >1.5 años
      } as any;

      mockStorage.clients.push(client);
      mockStorage.credits.push(credit);

      const result = await service.runBackfill({ referenceDate });

      // REGLA CRÍTICA: No otorgar derechos activos por un crédito antiguo vivo
      expect(result.assignedActive).toBe(0);
      expect(result.assignedLegacyUnverified).toBe(1);

      const rel = mockStorage.relationships[0];
      expect(rel.status).toBe("legacy_unverified");
      expect(rel.lastActivitySummary).toContain("Posee crédito activo pero originado hace más de 90 días");
    });
  });

  describe("Idempotencia Estricta", () => {
    it("no duplica registros ni modifica relaciones preexistentes en ejecuciones repetidas", async () => {
      const clientA: Client = {
        id: "client-a",
        brokerId: "broker-1",
        businessName: "Empresa Alfa",
        createdAt: new Date("2026-09-01T00:00:00Z"), // Reciente
      } as any;

      const clientB: Client = {
        id: "client-b",
        brokerId: "broker-2",
        businessName: "Empresa Beta",
        createdAt: new Date("2024-01-01T00:00:00Z"), // Antiguo
      } as any;

      mockStorage.clients.push(clientA, clientB);

      // Primera ejecución
      const firstRun = await service.runBackfill({ referenceDate });
      expect(firstRun.newRelationshipsCreated).toBe(2);
      expect(firstRun.alreadyExistingSkipped).toBe(0);
      expect(mockStorage.relationships.length).toBe(2);

      // Segunda ejecución sobre el mismo storage (debe ser 100% idempotente)
      const secondRun = await service.runBackfill({ referenceDate });
      expect(secondRun.totalClients).toBe(2);
      expect(secondRun.newRelationshipsCreated).toBe(0);
      expect(secondRun.alreadyExistingSkipped).toBe(2);
      expect(secondRun.assignedActive).toBe(0);
      expect(secondRun.assignedLegacyUnverified).toBe(0);
      expect(mockStorage.relationships.length).toBe(2); // Sin duplicados
    });
  });

  describe("Siembra de Reglas de Operación (v1.0.0)", () => {
    it("siembra la versión v1.0.0 como vigente sin marcar usuarios como leídos", async () => {
      expect(mockStorage.rulesVersions.length).toBe(0);

      const result = await service.runBackfill({ referenceDate });

      expect(result.rulesVersionSeeded).toBe(true);
      expect(result.rulesVersionAlreadyExisted).toBe(false);
      expect(mockStorage.rulesVersions.length).toBe(1);

      const rule = mockStorage.rulesVersions[0];
      expect(rule.version).toBe("1.0.0");
      expect(rule.isCurrent).toBe(true);
      expect(rule.title).toBe("Reglas de Operación y Gobernanza Comercial v1.0");

      // Segunda ejecución: no vuelve a sembrar
      const secondRun = await service.runBackfill({ referenceDate });
      expect(secondRun.rulesVersionSeeded).toBe(false);
      expect(secondRun.rulesVersionAlreadyExisted).toBe(true);
      expect(mockStorage.rulesVersions.length).toBe(1);
    });
  });

  describe("Preservación de Datos Preexistentes", () => {
    it("verifica que clients.brokerId permanece exactamente igual tras el backfill", async () => {
      const client: Client = {
        id: "client-check-broker",
        brokerId: "original-broker-uuid-1234",
        businessName: "Auditoría de Datos",
        createdAt: new Date("2024-05-01T00:00:00Z"),
      } as any;

      mockStorage.clients.push(client);

      await service.runBackfill({ referenceDate });

      expect(client.brokerId).toBe("original-broker-uuid-1234");
      const rel = mockStorage.relationships[0];
      expect(rel.brokerId).toBe("original-broker-uuid-1234");
    });
  });
});
