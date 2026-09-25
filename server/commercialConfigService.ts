import { eq, desc } from "drizzle-orm";
import {
  commercialConfigurations,
  commercialConfigAuditLogs,
  DEFAULT_COMMERCIAL_RULES_CONFIG,
  type CommercialConfiguration,
  type InsertCommercialConfiguration,
  type CommercialConfigAuditLog,
  type InsertCommercialConfigAuditLog,
  type CommercialRulesConfig,
} from "../shared/schema";

export interface ICommercialConfigStorage {
  getConfig(): Promise<CommercialConfiguration | undefined>;
  saveConfig(
    config: Partial<CommercialRulesConfig>,
    updatedBy?: string | null
  ): Promise<CommercialConfiguration>;
  createAuditLog(log: InsertCommercialConfigAuditLog): Promise<CommercialConfigAuditLog>;
  getAuditLogs(limit?: number): Promise<CommercialConfigAuditLog[]>;
}

export interface ICommercialConfigService {
  getConfig(forceRefresh?: boolean): Promise<CommercialRulesConfig>;
  updateConfig(
    updates: Partial<CommercialRulesConfig>,
    changedByUserId?: string | null,
    reason?: string
  ): Promise<{ updatedConfig: CommercialRulesConfig; modifiedParams: string[] }>;
  getAuditHistory(limit?: number): Promise<CommercialConfigAuditLog[]>;
  clearCache(): void;
}

export class CommercialConfigService implements ICommercialConfigService {
  private cachedConfig: CommercialRulesConfig | null = null;
  private cacheExpiresAt: number = 0;
  private cacheTtlMs: number = 60 * 1000; // 60 segundos de caché en memoria

  constructor(private storage: ICommercialConfigStorage) {}

  /**
   * Obtiene la configuración vigente de parámetros comerciales.
   * Si no existe configuración previa o hay un error de conexión,
   * retorna los valores por defecto normativos sin interrumpir la operación.
   */
  async getConfig(forceRefresh = false): Promise<CommercialRulesConfig> {
    const now = Date.now();
    if (!forceRefresh && this.cachedConfig && now < this.cacheExpiresAt) {
      return { ...this.cachedConfig };
    }

    try {
      const stored = await this.storage.getConfig();
      if (!stored) {
        this.cachedConfig = { ...DEFAULT_COMMERCIAL_RULES_CONFIG };
      } else {
        this.cachedConfig = {
          activeRelationshipValidityDays:
            stored.activeRelationshipValidityDays ??
            DEFAULT_COMMERCIAL_RULES_CONFIG.activeRelationshipValidityDays,
          initialOpportunityHoldDays:
            stored.initialOpportunityHoldDays ??
            DEFAULT_COMMERCIAL_RULES_CONFIG.initialOpportunityHoldDays,
          opportunityInactivityProtectionDays:
            stored.opportunityInactivityProtectionDays ??
            DEFAULT_COMMERCIAL_RULES_CONFIG.opportunityInactivityProtectionDays,
          inboundPriorityHours:
            stored.inboundPriorityHours ??
            DEFAULT_COMMERCIAL_RULES_CONFIG.inboundPriorityHours,
          renewalWindowDaysBeforeMaturity:
            stored.renewalWindowDaysBeforeMaturity ??
            DEFAULT_COMMERCIAL_RULES_CONFIG.renewalWindowDaysBeforeMaturity,
          renewalOriginatorPriorityDays:
            stored.renewalOriginatorPriorityDays ??
            DEFAULT_COMMERCIAL_RULES_CONFIG.renewalOriginatorPriorityDays,
          brokerElectionTokenValidityHours:
            stored.brokerElectionTokenValidityHours ??
            DEFAULT_COMMERCIAL_RULES_CONFIG.brokerElectionTokenValidityHours,
        };
      }
    } catch (err) {
      // Fallback seguro a los defaults normativos
      this.cachedConfig = { ...DEFAULT_COMMERCIAL_RULES_CONFIG };
    }

    this.cacheExpiresAt = now + this.cacheTtlMs;
    return { ...this.cachedConfig };
  }

  /**
   * Actualiza parámetros comerciales de forma prospectiva, generando una entrada
   * de auditoría inmutable por cada parámetro efectivamente modificado.
   */
  async updateConfig(
    updates: Partial<CommercialRulesConfig>,
    changedByUserId?: string | null,
    reason?: string
  ): Promise<{ updatedConfig: CommercialRulesConfig; modifiedParams: string[] }> {
    const current = await this.getConfig(true);
    const modifiedParams: string[] = [];

    const keys: (keyof CommercialRulesConfig)[] = [
      "activeRelationshipValidityDays",
      "initialOpportunityHoldDays",
      "opportunityInactivityProtectionDays",
      "inboundPriorityHours",
      "renewalWindowDaysBeforeMaturity",
      "renewalOriginatorPriorityDays",
      "brokerElectionTokenValidityHours",
    ];

    for (const key of keys) {
      const newVal = updates[key];
      if (newVal !== undefined && newVal !== current[key]) {
        const prevVal = String(current[key]);
        await this.storage.createAuditLog({
          parameterKey: key,
          previousValue: prevVal,
          newValue: String(newVal),
          changedBy: changedByUserId ?? null,
          changeReason: reason ?? `Ajuste administrativo de parámetro comercial ${key}`,
        });
        modifiedParams.push(key);
      }
    }

    if (modifiedParams.length > 0) {
      await this.storage.saveConfig(updates, changedByUserId);
      // Invalidar caché inmediatamente para reflejar los cambios
      this.clearCache();
    }

    const updatedConfig = await this.getConfig(true);
    return { updatedConfig, modifiedParams };
  }

  /**
   * Obtiene la bitácora histórica de cambios a los parámetros comerciales.
   */
  async getAuditHistory(limit = 100): Promise<CommercialConfigAuditLog[]> {
    return await this.storage.getAuditLogs(limit);
  }

  clearCache(): void {
    this.cachedConfig = null;
    this.cacheExpiresAt = 0;
  }
}

/**
 * Storage en memoria para pruebas unitarias deterministas
 */
export class MockCommercialConfigStorage implements ICommercialConfigStorage {
  private config?: CommercialConfiguration;
  private auditLogs: CommercialConfigAuditLog[] = [];

  async getConfig(): Promise<CommercialConfiguration | undefined> {
    return this.config ? { ...this.config } : undefined;
  }

  async saveConfig(
    updates: Partial<CommercialRulesConfig>,
    updatedBy?: string | null
  ): Promise<CommercialConfiguration> {
    const current = this.config || {
      id: "default",
      ...DEFAULT_COMMERCIAL_RULES_CONFIG,
      updatedBy: null,
      updatedAt: new Date(),
    };

    this.config = {
      ...current,
      ...updates,
      updatedBy: updatedBy ?? null,
      updatedAt: new Date(),
    };

    return { ...this.config };
  }

  async createAuditLog(data: InsertCommercialConfigAuditLog): Promise<CommercialConfigAuditLog> {
    const record: CommercialConfigAuditLog = {
      id: `cfg-audit-${this.auditLogs.length + 1}`,
      parameterKey: data.parameterKey,
      previousValue: data.previousValue,
      newValue: data.newValue,
      changedBy: data.changedBy ?? null,
      changeReason: data.changeReason ?? null,
      createdAt: new Date(),
    };
    this.auditLogs.unshift(record);
    return record;
  }

  async getAuditLogs(limit = 100): Promise<CommercialConfigAuditLog[]> {
    return this.auditLogs.slice(0, limit);
  }
}

/**
 * Storage conectado a PostgreSQL vía Drizzle ORM
 */
export class DrizzleCommercialConfigStorage implements ICommercialConfigStorage {
  constructor(private db: any) {}

  async getConfig(): Promise<CommercialConfiguration | undefined> {
    const rows = await this.db
      .select()
      .from(commercialConfigurations)
      .where(eq(commercialConfigurations.id, "default"))
      .limit(1);
    return rows[0];
  }

  async saveConfig(
    updates: Partial<CommercialRulesConfig>,
    updatedBy?: string | null
  ): Promise<CommercialConfiguration> {
    const existing = await this.getConfig();
    if (!existing) {
      const toInsert: InsertCommercialConfiguration = {
        id: "default",
        activeRelationshipValidityDays:
          updates.activeRelationshipValidityDays ??
          DEFAULT_COMMERCIAL_RULES_CONFIG.activeRelationshipValidityDays,
        initialOpportunityHoldDays:
          updates.initialOpportunityHoldDays ??
          DEFAULT_COMMERCIAL_RULES_CONFIG.initialOpportunityHoldDays,
        opportunityInactivityProtectionDays:
          updates.opportunityInactivityProtectionDays ??
          DEFAULT_COMMERCIAL_RULES_CONFIG.opportunityInactivityProtectionDays,
        inboundPriorityHours:
          updates.inboundPriorityHours ??
          DEFAULT_COMMERCIAL_RULES_CONFIG.inboundPriorityHours,
        renewalWindowDaysBeforeMaturity:
          updates.renewalWindowDaysBeforeMaturity ??
          DEFAULT_COMMERCIAL_RULES_CONFIG.renewalWindowDaysBeforeMaturity,
        renewalOriginatorPriorityDays:
          updates.renewalOriginatorPriorityDays ??
          DEFAULT_COMMERCIAL_RULES_CONFIG.renewalOriginatorPriorityDays,
        brokerElectionTokenValidityHours:
          updates.brokerElectionTokenValidityHours ??
          DEFAULT_COMMERCIAL_RULES_CONFIG.brokerElectionTokenValidityHours,
        updatedBy: updatedBy ?? null,
      };

      const rows = await this.db.insert(commercialConfigurations).values(toInsert).returning();
      return rows[0];
    } else {
      const rows = await this.db
        .update(commercialConfigurations)
        .set({
          ...updates,
          updatedBy: updatedBy ?? null,
          updatedAt: new Date(),
        })
        .where(eq(commercialConfigurations.id, "default"))
        .returning();
      return rows[0];
    }
  }

  async createAuditLog(data: InsertCommercialConfigAuditLog): Promise<CommercialConfigAuditLog> {
    const rows = await this.db
      .insert(commercialConfigAuditLogs)
      .values({
        parameterKey: data.parameterKey,
        previousValue: data.previousValue,
        newValue: data.newValue,
        changedBy: data.changedBy ?? null,
        changeReason: data.changeReason ?? null,
      })
      .returning();
    return rows[0];
  }

  async getAuditLogs(limit = 100): Promise<CommercialConfigAuditLog[]> {
    return await this.db
      .select()
      .from(commercialConfigAuditLogs)
      .orderBy(desc(commercialConfigAuditLogs.createdAt))
      .limit(limit);
  }
}

/**
 * Fabrica para instanciar el servicio con el almacenamiento adecuado según el entorno
 */
export function createCommercialConfigService(
  storageOverride?: ICommercialConfigStorage
): CommercialConfigService {
  if (storageOverride) {
    return new CommercialConfigService(storageOverride);
  }
  const isMemory = process.env.USE_MEMORY_STORAGE === "true" || process.env.NODE_ENV === "test";
  if (isMemory) {
    return new CommercialConfigService(new MockCommercialConfigStorage());
  }
  // Lazy import db if needed to prevent circular dependencies
  const { db } = require("./db");
  return new CommercialConfigService(new DrizzleCommercialConfigStorage(db));
}

export const commercialConfigService = createCommercialConfigService();

