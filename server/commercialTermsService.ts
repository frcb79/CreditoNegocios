import { createHash, randomUUID } from "node:crypto";
import { storage as defaultStorage, type IStorage } from "./storage";
import type { User, LegalAcceptance } from "@shared/schema";
import type {
  PendingCommercialTerm,
  PendingCommercialTermsStatus,
} from "../shared/legalDocuments";

export interface GlobalCommercialTermsVersionData {
  version: string;
  document: "condiciones-comerciales";
  title: string;
  summary: string;
  content: string;
  contentSha256: string;
  previousConditions: Record<string, any>;
  newConditions: Record<string, any>;
  modifiedParams: string[];
  effectiveDate: string;
  updatedBy?: string | null;
  updatedAt: string;
}

export interface NetworkRatesVersionData {
  masterBrokerId: string;
  document: "comisiones-red";
  version: string;
  title: string;
  summary: string;
  content: string;
  contentSha256: string;
  previousRates: Record<string, any>;
  newRates: Record<string, any>;
  effectiveDate: string;
  updatedAt: string;
}

export class CommercialTermsService {
  private currentGlobalVersion: string = "1.0";
  private globalVersions: Map<string, GlobalCommercialTermsVersionData> = new Map();
  private networkVersions: Map<string, NetworkRatesVersionData> = new Map();
  private networkVersionCounters: Map<string, number> = new Map();

  constructor() {
    this.initDefaultGlobalVersion();
  }

  private initDefaultGlobalVersion(): void {
    const defaultData: GlobalCommercialTermsVersionData = {
      version: "1.0",
      document: "condiciones-comerciales",
      title: "Condiciones Comerciales y Plazos Operativos V1.0",
      summary: "Condiciones comerciales y plazos base del Convenio de Colaboración (Octubre 2026).",
      content: "Condiciones Comerciales y Plazos Operativos V1.0 - Reserva 90 días, Protección 120 días, Renovaciones 12 meses.",
      contentSha256: createHash("sha256")
        .update("Condiciones Comerciales y Plazos Operativos V1.0 - Reserva 90 días, Protección 120 días, Renovaciones 12 meses.")
        .digest("hex"),
      previousConditions: {},
      newConditions: {
        activeRelationshipValidityDays: 90,
        initialOpportunityHoldDays: 7,
        opportunityInactivityProtectionDays: 45,
        inboundPriorityHours: 48,
        renewalWindowDaysBeforeMaturity: 180,
        renewalOriginatorPriorityDays: 15,
        brokerElectionTokenValidityHours: 72,
      },
      modifiedParams: [],
      effectiveDate: "2026-10-06T00:00:00.000Z",
      updatedBy: null,
      updatedAt: "2026-10-06T00:00:00.000Z",
    };
    this.globalVersions.set("1.0", defaultData);
  }

  public async syncFromStorage(targetStorage?: IStorage): Promise<void> {
    const storage = targetStorage || defaultStorage;
    try {
      const versions = await storage.getLegalDocumentVersions();
      for (const v of versions) {
        if (v.document === "condiciones-comerciales") {
          let metadata: any = null;
          if (v.content && v.content.includes("<!-- METADATA:")) {
            try {
              const metaStr = v.content.split("<!-- METADATA:")[1].split("-->")[0].trim();
              metadata = JSON.parse(metaStr)?.versionData;
            } catch {}
          }
          const versionData: GlobalCommercialTermsVersionData = metadata || {
            version: v.version,
            document: "condiciones-comerciales",
            title: v.title,
            summary: v.title,
            content: v.content,
            contentSha256: v.contentSha256,
            previousConditions: {},
            newConditions: {},
            modifiedParams: [],
            effectiveDate: (v.effectiveAt || v.createdAt || new Date()).toISOString(),
            updatedBy: null,
            updatedAt: (v.createdAt || new Date()).toISOString(),
          };
          this.globalVersions.set(v.version, versionData);
          const vNum = parseFloat(v.version) || 0;
          const currNum = parseFloat(this.currentGlobalVersion) || 0;
          if (vNum > currNum) {
            this.currentGlobalVersion = v.version;
          }
        } else if (v.document === "comisiones-red") {
          // Format id: comisiones-red:${masterBrokerId}:${version}
          const parts = v.id.split(":");
          const masterBrokerId = parts[1] || "";
          if (masterBrokerId) {
            let metadata: any = null;
            if (v.content && v.content.includes("<!-- METADATA:")) {
              try {
                const metaStr = v.content.split("<!-- METADATA:")[1].split("-->")[0].trim();
                metadata = JSON.parse(metaStr)?.versionData;
              } catch {}
            }
            const netData: NetworkRatesVersionData = metadata || {
              masterBrokerId,
              document: "comisiones-red",
              version: v.version,
              title: v.title,
              summary: v.title,
              content: v.content,
              contentSha256: v.contentSha256,
              previousRates: {},
              newRates: {},
              effectiveDate: (v.effectiveAt || v.createdAt || new Date()).toISOString(),
              updatedAt: (v.createdAt || new Date()).toISOString(),
            };
            const numMatch = v.version.match(/net-(\d+)\.0/);
            if (numMatch) {
              const count = parseInt(numMatch[1], 10);
              const prevCount = this.networkVersionCounters.get(masterBrokerId) || 0;
              if (count > prevCount) {
                // Version rows can arrive unordered: never revert to an older network rate.
                this.networkVersions.set(masterBrokerId, netData);
                this.networkVersionCounters.set(masterBrokerId, count);
              }
            }
          }
        }
      }
    } catch (err) {
      // Never silently treat an unreadable version ledger as "no pending acceptance".
      console.error("[CommercialTermsService] Version ledger unavailable:", err);
      throw new Error("COMMERCIAL_TERMS_STORAGE_UNAVAILABLE");
    }
  }

  public resetForTesting(targetStorage?: IStorage): void {
    this.currentGlobalVersion = "1.0";
    this.globalVersions.clear();
    this.networkVersions.clear();
    this.networkVersionCounters.clear();
    this.initDefaultGlobalVersion();
    const st: any = targetStorage || defaultStorage;
    if (st && st.legalDocumentVersions && typeof st.legalDocumentVersions.forEach === "function") {
      const keysToDelete: string[] = [];
      st.legalDocumentVersions.forEach((_val: any, key: string) => {
        if (key.startsWith("condiciones-comerciales:") || key.startsWith("comisiones-red:")) {
          keysToDelete.push(key);
        }
      });
      keysToDelete.forEach((k: string) => st.legalDocumentVersions.delete(k));
    }
  }

  public getCurrentGlobalVersion(): string {
    return this.currentGlobalVersion;
  }

  public async getGlobalVersionData(version: string, targetStorage?: IStorage): Promise<GlobalCommercialTermsVersionData | undefined> {
    if (!this.globalVersions.has(version)) {
      await this.syncFromStorage(targetStorage);
    }
    return this.globalVersions.get(version);
  }

  public async getNetworkVersionData(masterBrokerId: string, targetStorage?: IStorage): Promise<NetworkRatesVersionData | undefined> {
    if (!this.networkVersions.has(masterBrokerId)) {
      await this.syncFromStorage(targetStorage);
    }
    return this.networkVersions.get(masterBrokerId);
  }

  /**
   * Publica una actualización general de plazos comerciales o condiciones por Super Admin.
   * Incrementa la versión global, persiste la versión y notifica individualmente a los Brokers y Masters.
   */
  async publishGlobalCommercialTermsUpdate(params: {
    previousConditions: Record<string, any>;
    newConditions: Record<string, any>;
    modifiedParams: string[];
    updatedBy?: string | null;
    reason?: string;
    targetStorage?: IStorage;
  }): Promise<GlobalCommercialTermsVersionData> {
    const storage = params.targetStorage || defaultStorage;
    await this.syncFromStorage(storage);

    // Calcular siguiente versión incremental (ej. 1.0 -> 1.1 -> 1.2 ...)
    const currentNum = parseFloat(this.currentGlobalVersion) || 1.0;
    const nextVersion = (Math.round((currentNum + 0.1) * 10) / 10).toFixed(1);
    // Do not activate a version until its immutable document is persisted.
    const nowIso = new Date().toISOString();
    const summary = params.reason || `Actualización de parámetros comerciales y plazos: ${params.modifiedParams.join(", ")}`;
    const content = `CONDICIONES COMERCIALES Y PLAZOS OPERATIVOS V${nextVersion}\n` +
      `Fecha de vigencia: ${nowIso}\n` +
      `Motivo: ${summary}\n` +
      `Parámetros modificados:\n` +
      params.modifiedParams.map((p) => `- ${p}: anterior = ${params.previousConditions[p]}, nuevo = ${params.newConditions[p]}`).join("\n");

    const contentSha256 = createHash("sha256").update(content, "utf8").digest("hex");

    const versionData: GlobalCommercialTermsVersionData = {
      version: nextVersion,
      document: "condiciones-comerciales",
      title: `Condiciones Comerciales y Plazos Operativos V${nextVersion}`,
      summary,
      content,
      contentSha256,
      previousConditions: { ...params.previousConditions },
      newConditions: { ...params.newConditions },
      modifiedParams: [...params.modifiedParams],
      effectiveDate: nowIso,
      updatedBy: params.updatedBy || null,
      updatedAt: nowIso,
    };

    // Persistir en legal_document_versions con metadatos estructurados
    const metaEnvelope = `\n<!-- METADATA: ${JSON.stringify({ versionData })} -->`;
    const persisted = await storage.createLegalDocumentVersion({
      id: `condiciones-comerciales:${nextVersion}`,
      document: "condiciones-comerciales",
      title: versionData.title,
      version: nextVersion,
      sourceFile: "commercial_config",
      content: content + metaEnvelope,
      contentSha256,
      effectiveAt: new Date(),
    });
    if (persisted.document !== 'condiciones-comerciales' || persisted.version !== nextVersion || persisted.contentSha256 !== contentSha256) {
      throw new Error('COMMERCIAL_TERMS_VERSION_CONFLICT');
    }
    await this.announceCommittedGlobalVersion(versionData, storage);

    return versionData;
  }

  /**
   * Only call after the version row is durably committed. In-memory maps and
   * user notifications are downstream of the PostgreSQL commit, never before.
   */
  async announceCommittedGlobalVersion(
    versionData: GlobalCommercialTermsVersionData,
    targetStorage?: IStorage
  ): Promise<void> {
    const storage = targetStorage || defaultStorage;
    this.globalVersions.set(versionData.version, versionData);
    if (Number(versionData.version) > Number(this.currentGlobalVersion)) {
      this.currentGlobalVersion = versionData.version;
    }
    const nextVersion = versionData.version;
    const nowIso = versionData.effectiveDate;
    const summary = versionData.summary;
    const params = { modifiedParams: versionData.modifiedParams };
    // Notificar individualmente a todos los Brokers y Master Brokers activos (Regla 3)
    try {
      const users = await storage.getAllUsers();
      const recipients = users.filter(
        (u: User) =>
          (u.role === "broker" || u.role === "master_broker") &&
          u.isActive !== false &&
          u.status !== "inactive"
      );

      for (const recipient of recipients) {
        await storage.createNotification({
          userId: recipient.id,
          type: "commercial_conditions_changed",
          title: `Actualización de Condiciones Comerciales (v${nextVersion})`,
          message: `Se han modificado las condiciones comerciales y plazos de la plataforma. Revisa y acepta la nueva versión para continuar originando operaciones.`,
          priority: "high",
          data: {
            scope: "global",
            version: nextVersion,
            modifiedParams: params.modifiedParams,
            effectiveDate: nowIso,
            summary,
          },
        });
      }
    } catch (err) {
      console.error("[CommercialTermsService] Error enviando notificaciones globales:", err);
    }

  }

  /**
   * Publica una actualización general de comisiones de una institución financiera por Super Admin.
   */
  async publishFinancialInstitutionCommissionUpdate(params: {
    institutionId: string;
    institutionName: string;
    previousRates: Record<string, any>;
    newRates: Record<string, any>;
    updatedBy?: string | null;
    targetStorage?: IStorage;
  }): Promise<GlobalCommercialTermsVersionData> {
    return await this.publishGlobalCommercialTermsUpdate({
      previousConditions: { [params.institutionId]: params.previousRates },
      newConditions: { [params.institutionId]: params.newRates },
      modifiedParams: [`comisiones_financiera_${params.institutionName}`],
      updatedBy: params.updatedBy,
      reason: `Ajuste en comisiones institucionales para ${params.institutionName}`,
      targetStorage: params.targetStorage,
    });
  }

  /**
   * Publica una actualización de comisiones de red por parte de un Master Broker.
   * Afecta y notifica EXCLUSIVAMENTE a los Brokers de su propia red.
   */
  async publishNetworkRatesUpdate(
    masterBrokerId: string,
    params: {
      previousRates: Record<string, any>;
      newRates: Record<string, any>;
      updatedBy?: string | null;
      targetStorage?: IStorage;
    }
  ): Promise<NetworkRatesVersionData> {
    const storage = params.targetStorage || defaultStorage;
    await this.syncFromStorage(storage);

    const counter = (this.networkVersionCounters.get(masterBrokerId) || 0) + 1;
    const networkVersion = `net-${counter}.0`;

    const masterUser = await storage.getUser(masterBrokerId);
    const masterName = masterUser?.brandName || `${masterUser?.firstName || ""} ${masterUser?.lastName || ""}`.trim() || "Master Broker";

    const nowIso = new Date().toISOString();
    const summary = `Actualización de comisiones de red asignadas por ${masterName}`;
    const content = `COMISIONES DE RED - MASTER BROKER: ${masterName}\n` +
      `Versión: ${networkVersion}\n` +
      `Fecha: ${nowIso}\n` +
      `Tasas asignadas:\n${JSON.stringify(params.newRates, null, 2)}`;

    const contentSha256 = createHash("sha256").update(content, "utf8").digest("hex");

    const versionData: NetworkRatesVersionData = {
      masterBrokerId,
      document: "comisiones-red",
      version: networkVersion,
      title: `Comisiones de Red (${masterName}) v${networkVersion}`,
      summary,
      content,
      contentSha256,
      previousRates: { ...params.previousRates },
      newRates: { ...params.newRates },
      effectiveDate: nowIso,
      updatedAt: nowIso,
    };

    // Persistir en legal_document_versions con metadatos estructurados
    const metaEnvelope = `\n<!-- METADATA: ${JSON.stringify({ versionData })} -->`;
    const persistedNetwork = await storage.createLegalDocumentVersion({
      id: `comisiones-red:${masterBrokerId}:${networkVersion}`,
      document: "comisiones-red",
      title: versionData.title,
      version: networkVersion,
      sourceFile: "network_rates",
      content: content + metaEnvelope,
      contentSha256,
      effectiveAt: new Date(),
    });
    if (persistedNetwork.document !== 'comisiones-red' || persistedNetwork.version !== networkVersion || persistedNetwork.contentSha256 !== contentSha256) {
      throw new Error('COMMERCIAL_NETWORK_VERSION_CONFLICT');
    }
    this.networkVersions.set(masterBrokerId, versionData);
    this.networkVersionCounters.set(masterBrokerId, counter);

    // Notificar EXCLUSIVAMENTE a los Brokers pertenecientes a este Master Broker
    try {
      const downlineBrokers = await storage.getUsersByMasterBroker(masterBrokerId);
      const activeBrokers = downlineBrokers.filter(
        (b) => b.role === "broker" && b.isActive !== false && b.status !== "inactive" && b.masterBrokerId === masterBrokerId
      );

      for (const broker of activeBrokers) {
        await storage.createNotification({
          userId: broker.id,
          type: "network_commission_rates_changed",
          title: "Actualización de Comisiones de Red",
          message: `Tu Master Broker (${masterName}) ha actualizado las comisiones de red asignadas a tu cuenta. Revisa y acepta las nuevas condiciones para continuar originando.`,
          priority: "high",
          data: {
            scope: "network",
            masterBrokerId,
            version: networkVersion,
            effectiveDate: nowIso,
          },
        });
      }
    } catch (err) {
      console.error("[CommercialTermsService] Error notificando red del Master:", err);
    }

    return versionData;
  }

  /**
   * Consulta si el usuario tiene condiciones comerciales pendientes de aceptación expresa.
   */
  async getPendingCommercialTermsForUser(
    userId: string,
    targetStorage?: IStorage
  ): Promise<PendingCommercialTermsStatus> {
    const storage = targetStorage || defaultStorage;
    await this.syncFromStorage(storage);
    const user = await storage.getUser(userId);

    // Administradores de plataforma no requieren aceptación comercial
    if (!user || user.role === "admin" || user.role === "super_admin") {
      return {
        hasPending: false,
        currentGlobalVersion: this.currentGlobalVersion,
        pendingTerms: [],
      };
    }

    const pendingTerms: PendingCommercialTerm[] = [];
    const acceptances = await storage.getLegalAcceptancesByUser(userId);

    // 1. Verificar versión global de condiciones comerciales
    // Si la versión global ha sido actualizada más allá de 1.0 (cambio por Super Admin)
    if (this.currentGlobalVersion !== "1.0") {
      const hasAcceptedGlobal = acceptances.some(
        (a) =>
          a.document === "condiciones-comerciales" &&
          a.version === this.currentGlobalVersion
      );

      if (!hasAcceptedGlobal) {
        const globalData = this.globalVersions.get(this.currentGlobalVersion);
        if (globalData) {
          pendingTerms.push({
            type: "global",
            document: "condiciones-comerciales",
            version: this.currentGlobalVersion,
            title: globalData.title,
            description: globalData.summary,
            effectiveDate: globalData.effectiveDate,
            previousConditions: globalData.previousConditions,
            newConditions: globalData.newConditions,
            modifiedParams: globalData.modifiedParams,
          });
        }
      }
    }

    // 2. Verificar comisiones de red para Brokers afiliados a un Master Broker
    if (user.role === "broker" && user.masterBrokerId) {
      const networkData = this.networkVersions.get(user.masterBrokerId);
      if (networkData) {
        const hasAcceptedNetwork = acceptances.some((a) => {
          if (a.document !== "comisiones-red" || a.version !== networkData.version) {
            return false;
          }
          const snap = a.personalizedSnapshot as any;
          return snap?.masterBrokerId === user.masterBrokerId;
        });

        if (!hasAcceptedNetwork) {
          const masterUser = await storage.getUser(user.masterBrokerId);
          const masterName =
            masterUser?.brandName ||
            `${masterUser?.firstName || ""} ${masterUser?.lastName || ""}`.trim() ||
            "Master Broker";

          pendingTerms.push({
            type: "network",
            document: "comisiones-red",
            version: networkData.version,
            title: networkData.title,
            description: networkData.summary,
            effectiveDate: networkData.effectiveDate,
            previousConditions: networkData.previousRates,
            newConditions: networkData.newRates,
            masterBrokerId: user.masterBrokerId,
            masterBrokerName: masterName,
          });
        }
      }
    }

    return {
      hasPending: pendingTerms.length > 0,
      currentGlobalVersion: this.currentGlobalVersion,
      pendingTerms,
    };
  }

  /**
   * Helper booleano de guardia para validar rápidamente si el originador tiene términos pendientes.
   */
  async hasPendingCommercialAcceptance(
    userId: string,
    targetStorage?: IStorage
  ): Promise<boolean> {
    const status = await this.getPendingCommercialTermsForUser(userId, targetStorage);
    return status.hasPending;
  }

  /**
   * Registra la aceptación expresa e inmutable de condiciones comerciales o de red.
   * Cumple idempotencia: si ya se aceptó, retorna éxito sin duplicar registros.
   */
  async acceptCommercialTerms(
    params: {
      userId: string;
      version: string;
      type?: "global" | "network";
      masterBrokerId?: string;
      ipAddress?: string | null;
      userAgent?: string;
    },
    targetStorage?: IStorage
  ): Promise<{
    success: boolean;
    alreadyAccepted: boolean;
    acceptance: LegalAcceptance;
    message: string;
  }> {
    const storage = targetStorage || defaultStorage;
    await this.syncFromStorage(storage);
    const user = await storage.getUser(params.userId);
    if (!user) {
      throw new Error("Usuario no encontrado.");
    }

    const type = params.type || "global";
    const documentType = type === "network" ? "comisiones-red" : "condiciones-comerciales";
    const acceptanceType = type === "network" ? "accept_network_rates" : "accept_commercial_terms";

    // 1. Verificación de Red y Elegibilidad
    if (type === "network") {
      if (user.role !== "broker" || !user.masterBrokerId) {
        throw new Error("El usuario no pertenece a ninguna red de Master Broker.");
      }
      if (params.masterBrokerId && String(params.masterBrokerId).trim() !== String(user.masterBrokerId).trim()) {
        throw new Error("No puedes aceptar comisiones de una red ajena a tu Master Broker asignado.");
      }
    }

    const effectiveMasterBrokerId = type === "network" ? user.masterBrokerId : null;

    // 3. Obtener metadatos de la versión
    let title = "";
    let contentSha256 = "";
    let previousConditions: any = {};
    let newConditions: any = {};
    let effectiveDate = new Date().toISOString();
    let documentId = `${documentType}:${params.version}`;

    if (type === "network") {
      const mbId = effectiveMasterBrokerId!;
      const netData = this.networkVersions.get(mbId);
      if (!netData) {
        throw new Error(`La versión de comisiones de red '${params.version}' no existe para tu Master Broker.`);
      }
      if (netData.version !== params.version) {
        throw new Error(`La versión solicitada '${params.version}' no corresponde a la versión vigente ('${netData.version}') de tu Master Broker.`);
      }
      title = netData.title;
      contentSha256 = netData.contentSha256;
      previousConditions = netData.previousRates;
      newConditions = netData.newRates;
      effectiveDate = netData.effectiveDate;
      documentId = `comisiones-red:${mbId}:${params.version}`;
    } else {
      const globData = this.globalVersions.get(params.version);
      if (!globData) {
        throw new Error(`La versión de condiciones comerciales '${params.version}' no existe.`);
      }
      title = globData.title;
      contentSha256 = globData.contentSha256;
      previousConditions = globData.previousConditions;
      newConditions = globData.newConditions;
      effectiveDate = globData.effectiveDate;
    }

    // Fail closed: only the current version of the current affiliation may be accepted.
    if (type === "global" && params.version !== this.currentGlobalVersion) {
      throw new Error(`La versión '${params.version}' ya no está vigente; acepta la versión actual '${this.currentGlobalVersion}'.`);
    }
    if (!params.version || !contentSha256) {
      throw new Error("No es posible registrar una aceptación sin versión y huella verificable.");
    }

    // Idempotencia únicamente DESPUÉS de validar vigencia y red actual
    const existingAcceptances = await storage.getLegalAcceptancesByUser(params.userId);
    const existing = existingAcceptances.find((a) => {
      if (a.document !== documentType || a.version !== params.version) {
        return false;
      }
      if (type === "network") {
        const snap = a.personalizedSnapshot as any;
        return snap?.masterBrokerId === effectiveMasterBrokerId;
      }
      return true;
    });

    if (existing) {
      if (existing.contentSha256 !== contentSha256 || existing.templateSha256 !== contentSha256) {
        throw new Error("La evidencia previa no corresponde al hash vigente del documento.");
      }
      return {
        success: true,
        alreadyAccepted: true,
        acceptance: existing,
        message: "Condiciones comerciales ya aceptadas previamente.",
      };
    }

    const userName = `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email;
    const now = new Date();

    const snapshot = {
      id: randomUUID(),
      document: documentType,
      version: params.version,
      title,
      userId: user.id,
      userEmail: user.email,
      userName,
      userRole: user.role,
      masterBrokerId: effectiveMasterBrokerId || (user.masterBrokerId || null),
      scope: type,
      previousConditions,
      newConditions,
      effectiveDate,
      acceptedAt: now.toISOString(),
      evidence: {
        acceptedAt: now.toISOString(),
        ipAddress: params.ipAddress || null,
        userAgent: params.userAgent || "unknown",
        acceptanceType,
      },
    };

    const personalizedSha256 = createHash("sha256").update(JSON.stringify(snapshot), "utf8").digest("hex");

    // Persistir en legal_acceptances
    const created = await storage.createLegalAcceptance({
      userId: user.id,
      userEmail: user.email || "",
      userName,
      documentId,
      document: documentType,
      version: params.version,
      contentSha256,
      acceptanceType,
      ipAddress: params.ipAddress || null,
      userAgent: params.userAgent || "unknown",
      templateSha256: contentSha256,
      personalizedSha256,
      personalizedSnapshot: snapshot,
    });

    const createdWithEvidence = {
      ...created,
      evidence: snapshot.evidence,
    };

    return {
      success: true,
      alreadyAccepted: false,
      acceptance: createdWithEvidence,
      message: "Condiciones comerciales aceptadas exitosamente.",
    };
  }

  /**
   * Obtiene la lista histórica de versiones de condiciones comerciales publicadas.
   */
  getCommercialVersionsHistory(): Array<{
    version: string;
    document: string;
    title: string;
    summary: string;
    effectiveDate: string;
    previousConditions: Record<string, any>;
    newConditions: Record<string, any>;
    modifiedParams: string[];
  }> {
    return Array.from(this.globalVersions.values()).reverse();
  }

  /**
   * Obtiene el historial de aceptaciones de condiciones comerciales del usuario.
   */
  async getCommercialAcceptancesHistory(
    userId: string,
    targetStorage?: IStorage
  ): Promise<LegalAcceptance[]> {
    const storage = targetStorage || defaultStorage;
    const acceptances = await storage.getLegalAcceptancesByUser(userId);
    return acceptances.filter(
      (a) => a.document === "condiciones-comerciales" || a.document === "comisiones-red"
    );
  }
}

export const commercialTermsService = new CommercialTermsService();
