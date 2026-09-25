import { eq, and, inArray } from "drizzle-orm";
import {
  clientCommercialRelationships,
  commercialOpportunities,
  credits,
  clients,
  users,
  tenants,
  type Client,
  type User,
  type Credit,
  type ClientCommercialRelationship,
  type CommercialOpportunity,
  type Tenant,
} from "../shared/schema";

export type ClientAccessScope =
  | "full"
  | "commercial_dormant"
  | "master_broker_oversight"
  | "historical_scoped"
  | "none";

export interface ClientScopeCapabilities {
  canViewBasicProfile: boolean;
  canEditClient: boolean;
  canViewCredits: boolean;
  canViewCommissions: boolean;
  canViewOpportunities: boolean;
  canCreateOpportunity: boolean;
  canViewDocuments: boolean;
  canUploadDocuments: boolean;
  creditsFilter: "all" | "network_downline" | "own_originated" | "none";
  documentsFilter: "all" | "network_downline" | "own_operation_only" | "none";
  opportunitiesFilter: "all" | "network_downline" | "own_only" | "none";
}

export interface ClientAuthorizationResult {
  authorized: boolean;
  scope: ClientAccessScope;
  capabilities: ClientScopeCapabilities;
  client?: Client;
  relationship?: ClientCommercialRelationship | null;
  activeOpportunity?: CommercialOpportunity | null;
  reason?: string;
}

export function getScopeCapabilities(scope: ClientAccessScope): ClientScopeCapabilities {
  switch (scope) {
    case "full":
      return {
        canViewBasicProfile: true,
        canEditClient: true,
        canViewCredits: true,
        canViewCommissions: true,
        canViewOpportunities: true,
        canCreateOpportunity: true,
        canViewDocuments: true,
        canUploadDocuments: true,
        creditsFilter: "all",
        documentsFilter: "all",
        opportunitiesFilter: "all",
      };
    case "master_broker_oversight":
      return {
        canViewBasicProfile: true,
        canEditClient: false,
        canViewCredits: true,
        canViewCommissions: true,
        canViewOpportunities: true,
        canCreateOpportunity: false,
        canViewDocuments: true,
        canUploadDocuments: false,
        creditsFilter: "network_downline",
        documentsFilter: "network_downline",
        opportunitiesFilter: "network_downline",
      };
    case "commercial_dormant":
      return {
        canViewBasicProfile: true,
        canEditClient: false,
        canViewCredits: false,
        canViewCommissions: false,
        canViewOpportunities: true,
        canCreateOpportunity: true, // Puede registrar nueva oportunidad para reactivación
        canViewDocuments: true,
        canUploadDocuments: false,
        creditsFilter: "own_originated",
        documentsFilter: "own_operation_only",
        opportunitiesFilter: "own_only",
      };
    case "historical_scoped":
      return {
        canViewBasicProfile: true,
        canEditClient: false,
        canViewCredits: true,
        canViewCommissions: true,
        canViewOpportunities: false, // NO puede ver oportunidades nuevas de otros brokers
        canCreateOpportunity: false,
        canViewDocuments: true,
        canUploadDocuments: false,
        creditsFilter: "own_originated",
        documentsFilter: "own_operation_only",
        opportunitiesFilter: "none",
      };
    case "none":
    default:
      return {
        canViewBasicProfile: false,
        canEditClient: false,
        canViewCredits: false,
        canViewCommissions: false,
        canViewOpportunities: false,
        canCreateOpportunity: false,
        canViewDocuments: false,
        canUploadDocuments: false,
        creditsFilter: "none",
        documentsFilter: "none",
        opportunitiesFilter: "none",
      };
  }
}

export interface ICommercialAuthStorage {
  getClient(id: string): Promise<Client | undefined>;
  getUser(id: string): Promise<User | undefined>;
  getCommercialRelationship(
    clientId: string,
    brokerId?: string
  ): Promise<ClientCommercialRelationship | undefined>;
  getCommercialOpportunities(
    clientId: string,
    brokerId?: string
  ): Promise<CommercialOpportunity[]>;
  getCredits(clientId: string, brokerId?: string): Promise<Credit[]>;
  getNetworkBrokers(masterBrokerId: string): Promise<User[]>;
  getTenantsByParent?(parentId: string): Promise<any[]>;
}

export class CommercialAuthorizationService {
  constructor(private storage: ICommercialAuthStorage) {}

  /**
   * Evalúa el scope exacto de acceso de un usuario hacia un cliente concreto.
   * Modela de forma desacoplada: full, commercial_dormant, master_broker_oversight,
   * historical_scoped y none.
   */
  async authorizeClientAccess(params: {
    userId: string;
    userRole: string;
    clientId: string;
    tenantContext?: any;
    now?: Date;
  }): Promise<ClientAuthorizationResult> {
    const { userId, userRole, clientId, tenantContext, now = new Date() } = params;

    const client = await this.storage.getClient(clientId);
    if (!client) {
      return {
        authorized: false,
        scope: "none",
        capabilities: getScopeCapabilities("none"),
        reason: "Client not found",
      };
    }

    // 1. Acceso Administrativo Global (Super Admin y Administradores / Mesa de Control de Plataforma)
    const isPlatformAdmin = Boolean(
      userRole === "super_admin" ||
      tenantContext?.isPlatformAdmin === true
    );

    if (isPlatformAdmin) {
      return {
        authorized: true,
        scope: "full",
        capabilities: getScopeCapabilities("full"),
        client,
        reason: "Acceso administrativo global de plataforma",
      };
    }

    // 2. Aislamiento de Frontera de Tenant para usuarios NO de plataforma:
    const userTenantId = tenantContext?.tenant?.id;
    if (client.tenantId && userTenantId && client.tenantId !== userTenantId) {
      let isSubordinateTenant = false;
      if (this.storage.getTenantsByParent) {
        const subordinates = await this.storage.getTenantsByParent(userTenantId);
        if (subordinates.some((s: any) => s.id === client.tenantId)) {
          isSubordinateTenant = true;
        }
      }

      if (!isSubordinateTenant) {
        return {
          authorized: false,
          scope: "none",
          capabilities: getScopeCapabilities("none"),
          client,
          reason: "Acceso denegado: el cliente pertenece a otra organización / tenant",
        };
      }
    }

    // 3. Acceso Administrativo a nivel Tenant (Admin / Mesa de Control acotados a su tenant)
    const isTenantAdminOrMesa = Boolean(
      userRole === "admin" ||
      userRole === "mesa_control" ||
      tenantContext?.membership?.role === "owner" ||
      tenantContext?.membership?.role === "admin"
    );

    if (isTenantAdminOrMesa) {
      if (client.tenantId) {
        return {
          authorized: true,
          scope: "full",
          capabilities: getScopeCapabilities("full"),
          client,
          reason: "Acceso administrativo a nivel de tenant",
        };
      } else {
        if (!userTenantId) {
          return {
            authorized: true,
            scope: "full",
            capabilities: getScopeCapabilities("full"),
            client,
            reason: "Acceso administrativo sin restricción de tenant",
          };
        }
      }
    }

    // 4. Relación comercial activa vigente del broker solicitante
    const userRelationship = await this.storage.getCommercialRelationship(clientId, userId);
    if (userRelationship) {
      const isStatusActive = userRelationship.status === "active";
      const isDateValid =
        !userRelationship.activeUntil || new Date(userRelationship.activeUntil) >= now;

      if (isStatusActive && isDateValid) {
        return {
          authorized: true,
          scope: "full",
          capabilities: getScopeCapabilities("full"),
          client,
          relationship: userRelationship,
          reason: "Broker titular con relación comercial activa vigente",
        };
      }
    }

    // 5. Oportunidad comercial protegida vigente del broker solicitante
    const userOpportunities = await this.storage.getCommercialOpportunities(clientId, userId);
    const activeOpp = userOpportunities.find((opp) => {
      const isProtectedStatus =
        opp.status === "registered_hold" || opp.status === "protected_active";
      if (!isProtectedStatus) return false;

      if (opp.status === "registered_hold" && opp.holdExpiresAt) {
        return new Date(opp.holdExpiresAt) >= now;
      }
      if (opp.status === "protected_active" && opp.protectedUntil) {
        return new Date(opp.protectedUntil) >= now;
      }
      return true;
    });

    if (activeOpp) {
      return {
        authorized: true,
        scope: "full",
        capabilities: getScopeCapabilities("full"),
        client,
        relationship: userRelationship || null,
        activeOpportunity: activeOpp,
        reason: "Broker con oportunidad comercial protegida vigente",
      };
    }

    // 6. Supervisión de Master Broker sobre brokers de su red
    if (userRole === "master_broker" || tenantContext?.tenant?.type === "master_broker") {
      const networkBrokers = await this.storage.getNetworkBrokers(userId);
      const networkBrokerIds = networkBrokers.map((b) => b.id);

      // El cliente tiene relación con un broker de la red o fue creado por uno de ellos
      const hasNetworkClient = client.brokerId && networkBrokerIds.includes(client.brokerId);
      const networkCredits = await this.storage.getCredits(clientId);
      const hasNetworkCredits = networkCredits.some(
        (c) => c.brokerId && networkBrokerIds.includes(c.brokerId)
      );

      // Verificación por subordinación de tenant
      let hasTenantSubordination = false;
      if (userTenantId && client.tenantId) {
        if (userTenantId === client.tenantId) {
          hasTenantSubordination = true;
        } else if (this.storage.getTenantsByParent) {
          const subordinates = await this.storage.getTenantsByParent(userTenantId);
          if (subordinates.some((s: any) => s.id === client.tenantId)) {
            hasTenantSubordination = true;
          }
        }
      }

      if (hasNetworkClient || hasNetworkCredits || hasTenantSubordination) {
        return {
          authorized: true,
          scope: "master_broker_oversight",
          capabilities: getScopeCapabilities("master_broker_oversight"),
          client,
          relationship: userRelationship || null,
          reason: "Supervisión de cartera correspondiente a la red de Master Broker",
        };
      }
    }

    // 5. Relación comercial dormida o no verificada (dormant / legacy_unverified)
    if (userRelationship) {
      const isDormant =
        userRelationship.status === "dormant" ||
        userRelationship.status === "legacy_unverified" ||
        (userRelationship.status === "active" &&
          userRelationship.activeUntil &&
          new Date(userRelationship.activeUntil) < now);

      if (isDormant) {
        return {
          authorized: true,
          scope: "commercial_dormant",
          capabilities: getScopeCapabilities("commercial_dormant"),
          client,
          relationship: userRelationship,
          reason: "Relación comercial inactiva o neutral (acceso limitado para reactivación)",
        };
      }
    }

    // 6. Atribución histórica de créditos u origen sin relación comercial activa
    const clientCredits = await this.storage.getCredits(clientId, userId);
    const hasOriginatedCredit = clientCredits.some((c) => c.brokerId === userId);
    const isHistoricalCreator = client.brokerId === userId;

    if (hasOriginatedCredit || isHistoricalCreator) {
      return {
        authorized: true,
        scope: "historical_scoped",
        capabilities: getScopeCapabilities("historical_scoped"),
        client,
        relationship: userRelationship || null,
        reason:
          "Atribución histórica sobre créditos colocados u origen previo (sin relación comercial activa)",
      };
    }

    // 7. Broker ajeno sin vínculo legítimo: Acceso denegado (none)
    return {
      authorized: false,
      scope: "none",
      capabilities: getScopeCapabilities("none"),
      client,
      reason: "Acceso denegado: no existe relación comercial, oportunidad activa ni atribución histórica con este cliente.",
    };
  }

  /**
   * Determina si el broker solicitante puede visualizar una oportunidad comercial específica.
   * Regla crítica: Un broker con scope historical_scoped o commercial_dormant NO puede ver
   * oportunidades creadas por otros brokers.
   */
  canAccessOpportunity(
    authResult: ClientAuthorizationResult,
    opportunity: CommercialOpportunity,
    networkBrokerIds: string[] = []
  ): boolean {
    if (!authResult.authorized) return false;

    // Platform admin tiene acceso completo
    if (authResult.scope === "full" && !opportunity.brokerId) return true;

    // Broker activo titular puede ver oportunidades del cliente o la propia
    if (authResult.scope === "full") {
      return true;
    }

    // Master Broker solo ve oportunidades de brokers de su red
    if (authResult.scope === "master_broker_oversight") {
      return networkBrokerIds.includes(opportunity.brokerId);
    }

    // Broker dormant solo ve SUS PROPIAS oportunidades
    if (authResult.scope === "commercial_dormant") {
      return opportunity.brokerId === authResult.relationship?.brokerId;
    }

    // Broker histórico NUNCA puede ver oportunidades de otros brokers
    if (authResult.scope === "historical_scoped") {
      return false;
    }

    return false;
  }

  /**
   * Determina si el broker solicitante puede visualizar un documento específico del cliente.
   * Regla crítica: Un broker histórico solo ve documentos vinculados a SUS operaciones/créditos.
   */
  canAccessDocument(
    authResult: ClientAuthorizationResult,
    document: { brokerId?: string | null; creditId?: string | null; clientId?: string | null },
    userId: string,
    userOriginatedCreditIds: string[] = []
  ): boolean {
    if (!authResult.authorized) return false;

    if (authResult.scope === "full") return true;

    if (authResult.scope === "master_broker_oversight") return true;

    // historical_scoped: solo documentos de SU operación o SU crédito
    if (authResult.scope === "historical_scoped") {
      if (document.brokerId === userId) return true;
      if (document.creditId && userOriginatedCreditIds.includes(document.creditId)) return true;
      return false;
    }

    // commercial_dormant: documentos propios o generales del cliente
    if (authResult.scope === "commercial_dormant") {
      if (document.brokerId === userId) return true;
      if (document.creditId && userOriginatedCreditIds.includes(document.creditId)) return true;
      // No ve documentos confidenciales de créditos posteriores de otros brokers
      if (document.creditId && !userOriginatedCreditIds.includes(document.creditId)) return false;
      return true;
    }

    return false;
  }

  /**
   * Filtra créditos visibles según el scope del solicitante.
   */
  filterCredits(
    creditsList: Credit[],
    userId: string,
    scope: ClientAccessScope,
    networkBrokerIds: string[] = []
  ): Credit[] {
    switch (scope) {
      case "full":
        return creditsList;
      case "master_broker_oversight":
        return creditsList.filter(
          (c) => c.brokerId === userId || (c.brokerId && networkBrokerIds.includes(c.brokerId))
        );
      case "historical_scoped":
      case "commercial_dormant":
        return creditsList.filter((c) => c.brokerId === userId);
      case "none":
      default:
        return [];
    }
  }

  /**
   * Filtra comisiones visibles según el scope del solicitante.
   */
  filterCommissions(
    commissionsList: any[],
    userId: string,
    scope: ClientAccessScope,
    networkBrokerIds: string[] = []
  ): any[] {
    switch (scope) {
      case "full":
        return commissionsList;
      case "master_broker_oversight":
        return commissionsList.filter(
          (c) =>
            c.brokerId === userId ||
            c.masterBrokerId === userId ||
            (c.brokerId && networkBrokerIds.includes(c.brokerId))
        );
      case "historical_scoped":
      case "commercial_dormant":
        return commissionsList.filter((c) => c.brokerId === userId);
      case "none":
      default:
        return [];
    }
  }
}

/**
 * Storage en memoria para pruebas unitarias deterministas
 */
export class MockCommercialAuthStorage implements ICommercialAuthStorage {
  clients: Client[] = [];
  users: User[] = [];
  relationships: ClientCommercialRelationship[] = [];
  opportunities: CommercialOpportunity[] = [];
  credits: Credit[] = [];

  async getClient(id: string): Promise<Client | undefined> {
    return this.clients.find((c) => c.id === id);
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.find((u) => u.id === id);
  }

  async getCommercialRelationship(
    clientId: string,
    brokerId?: string
  ): Promise<ClientCommercialRelationship | undefined> {
    return this.relationships.find((r) => {
      if (r.clientId !== clientId) return false;
      if (brokerId && r.brokerId !== brokerId) return false;
      return true;
    });
  }

  async getCommercialOpportunities(
    clientId: string,
    brokerId?: string
  ): Promise<CommercialOpportunity[]> {
    return this.opportunities.filter((o) => {
      if (o.clientId !== clientId) return false;
      if (brokerId && o.brokerId !== brokerId) return false;
      return true;
    });
  }

  async getCredits(clientId: string, brokerId?: string): Promise<Credit[]> {
    return this.credits.filter((c) => {
      if (c.clientId !== clientId) return false;
      if (brokerId && c.brokerId !== brokerId) return false;
      return true;
    });
  }

  tenants: any[] = [];

  async getNetworkBrokers(masterBrokerId: string): Promise<User[]> {
    return this.users.filter((u) => u.masterBrokerId === masterBrokerId);
  }

  async getTenantsByParent(parentId: string): Promise<any[]> {
    return this.tenants.filter((t) => t.parentTenantId === parentId);
  }
}

/**
 * Storage conectado a PostgreSQL con Drizzle ORM
 */
export class DrizzleCommercialAuthStorage implements ICommercialAuthStorage {
  constructor(private db: any) {}

  async getClient(id: string): Promise<Client | undefined> {
    const rows = await this.db.select().from(clients).where(eq(clients.id, id)).limit(1);
    return rows[0];
  }

  async getUser(id: string): Promise<User | undefined> {
    const rows = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return rows[0];
  }

  async getCommercialRelationship(
    clientId: string,
    brokerId?: string
  ): Promise<ClientCommercialRelationship | undefined> {
    try {
      const conditions = [eq(clientCommercialRelationships.clientId, clientId)];
      if (brokerId) {
        conditions.push(eq(clientCommercialRelationships.brokerId, brokerId));
      }
      const rows = await this.db
        .select()
        .from(clientCommercialRelationships)
        .where(and(...conditions))
        .limit(1);
      return rows[0];
    } catch (err: any) {
      console.warn("⚠️ [CommercialAuthStorage] Warning querying clientCommercialRelationships:", err?.message);
      return undefined;
    }
  }

  async getCommercialOpportunities(
    clientId: string,
    brokerId?: string
  ): Promise<CommercialOpportunity[]> {
    try {
      const conditions = [eq(commercialOpportunities.clientId, clientId)];
      if (brokerId) {
        conditions.push(eq(commercialOpportunities.brokerId, brokerId));
      }
      return await this.db
        .select()
        .from(commercialOpportunities)
        .where(and(...conditions));
    } catch (err: any) {
      console.warn("⚠️ [CommercialAuthStorage] Warning querying commercialOpportunities:", err?.message);
      return [];
    }
  }

  async getCredits(clientId: string, brokerId?: string): Promise<Credit[]> {
    const conditions = [eq(credits.clientId, clientId)];
    if (brokerId) {
      conditions.push(eq(credits.brokerId, brokerId));
    }
    return await this.db
      .select()
      .from(credits)
      .where(and(...conditions));
  }

  async getNetworkBrokers(masterBrokerId: string): Promise<User[]> {
    return await this.db.select().from(users).where(eq(users.masterBrokerId, masterBrokerId));
  }

  async getTenantsByParent(parentId: string): Promise<any[]> {
    return await this.db.select().from(tenants).where(eq(tenants.parentTenantId, parentId));
  }
}

export function createCommercialAuthorizationService(
  storageOverride?: ICommercialAuthStorage
): CommercialAuthorizationService {
  if (storageOverride) {
    return new CommercialAuthorizationService(storageOverride);
  }
  const isMemory = process.env.USE_MEMORY_STORAGE === "true" || process.env.NODE_ENV === "test";
  if (isMemory) {
    return new CommercialAuthorizationService(new MockCommercialAuthStorage());
  }
  const { db } = require("./db");
  return new CommercialAuthorizationService(new DrizzleCommercialAuthStorage(db));
}

export const commercialAuthorizationService = createCommercialAuthorizationService();
