import { eq, and, or, inArray, lt, desc } from "drizzle-orm";
import {
  commercialOpportunities,
  commercialActivities,
  clientCommercialRelationships,
  commercialAuditLogs,
  clients,
  COMMERCIAL_ACTIVITY_TYPES,
  type CommercialOpportunity,
  type InsertCommercialOpportunity,
  type CommercialActivity,
  type InsertCommercialActivity,
  type ClientCommercialRelationship,
  type InsertClientCommercialRelationship,
  type CommercialAuditLog,
  type InsertCommercialAuditLog,
  type Client,
  type CommercialActivityType,
  type ClientAccessScope,
} from "../shared/schema";
import {
  CommercialConfigService,
  commercialConfigService as defaultCommercialConfigService,
  type ICommercialConfigService,
} from "./commercialConfigService";
import {
  CommercialAuthorizationService,
  commercialAuthorizationService as defaultCommercialAuthService,
} from "./commercialAuthorizationService";

export interface CreateOpportunityInput {
  clientId: string;
  brokerId: string;
  masterBrokerId?: string | null;
  tenantId?: string | null;
  title: string;
  financingNeedType: string;
  requestedAmount: string | number;
  productTemplateId?: string | null;
  targetInstitutionId?: string | null;
  initialEvidenceType?: string | null;
  initialEvidenceDocUrl?: string | null;
  notes?: string | null;
  performedBy?: string;
  userRole?: string;
  tenantContext?: any;
  now?: Date;
}

export interface CreateOpportunityResult {
  success: boolean;
  opportunity?: CommercialOpportunity;
  conflict?: boolean;
  code?: string;
  message: string;
  conflictingOpportunity?: {
    id: string;
    brokerId: string;
    status: string;
    financingNeedType: string;
    holdExpiresAt?: Date | null;
    protectedUntil?: Date | null;
  };
}

export type FormalDisputeReason =
  | "client_broker_change_request" // Solicitud verificable de cambio de broker por parte del cliente
  | "mesa_control_intervention"     // Apertura expresa de controversia por Mesa de Control / Super Admin
  | "contradictory_evidence";       // Evidencia contradictoria documental formal que requiera resolución

export interface OpenFormalDisputeInput {
  opportunityId: string;
  disputeReason: FormalDisputeReason;
  justification: string;
  evidenceUrl?: string | null;
  clientElectionToken?: string | null;
  verificationMethod?: "digital_token" | "signed_letter" | "recorded_call" | "mesa_control_manual" | null;
  performedBy: string;
  userRole?: string;
  tenantContext?: any;
  now?: Date;
}

export interface OpenFormalDisputeResult {
  success: boolean;
  opportunity?: CommercialOpportunity;
  code?: string;
  message: string;
}

export interface RecordActivityInput {
  clientId: string;
  opportunityId: string;
  brokerId: string;
  activityType: string;
  title: string;
  description?: string | null;
  documentId?: string | null;
  evidenceUrl?: string | null;
  performedAt?: Date;
  performedBy?: string;
  userRole?: string;
  tenantContext?: any;
  now?: Date;
}

export interface RecordActivityResult {
  success: boolean;
  validForProtection: boolean;
  activity?: CommercialActivity;
  opportunity?: CommercialOpportunity;
  relationshipReactivated?: boolean;
  message: string;
}

export interface CheckDuplicatesEnrichedInput {
  rfc?: string | null;
  phone?: string | null;
  email?: string | null;
  financingNeedType?: string | null;
  currentUserId: string;
  currentUserRole?: string;
  userTenantId?: string | null;
  tenantContext?: any;
  now?: Date;
}

export interface EnrichedDuplicateCheckResult {
  hasDuplicate: boolean;
  clientExists: boolean;
  isSameTenant: boolean;
  canCreateOpportunity: boolean;
  duplicateReason:
    | "no_duplicate"
    | "same_tenant_client_eligible"
    | "client_has_protected_opportunity"
    | "client_has_active_relationship_same_broker"
    | "client_has_active_relationship_other_broker"
    | "client_dormant_eligible"
    | "client_historical_eligible"
    | "cross_tenant_collision";
  message: string;
  existingClient?: Partial<Client>;
  activeOpportunity?: {
    id: string;
    financingNeedType: string;
    status: string;
    brokerId: string;
    holdExpiresAt?: Date | null;
    protectedUntil?: Date | null;
  };
  commercialRelationship?: {
    status: string;
    brokerId: string;
    activeUntil?: Date | null;
  };
}

export interface ReleaseExpiredResult {
  releasedCount: number;
  releasedOpportunities: {
    id: string;
    clientId: string;
    brokerId: string;
    previousStatus: string;
    expiredAt: Date;
  }[];
}

export function isValidProtectionActivity(activityType: string): boolean {
  return COMMERCIAL_ACTIVITY_TYPES.includes(activityType as CommercialActivityType);
}

export function isOpportunityEquivalent(
  existingOpp: CommercialOpportunity,
  targetNeedType: string,
  now: Date
): boolean {
  const isProtected =
    (existingOpp.status === "registered_hold" &&
      existingOpp.holdExpiresAt &&
      new Date(existingOpp.holdExpiresAt) >= now) ||
    (existingOpp.status === "protected_active" &&
      existingOpp.protectedUntil &&
      new Date(existingOpp.protectedUntil) >= now);

  if (!isProtected) {
    return false;
  }

  const normExisting = existingOpp.financingNeedType?.trim().toLowerCase();
  const normTarget = targetNeedType?.trim().toLowerCase();

  if (!normTarget || !normExisting) return true;
  if (normExisting === normTarget) return true;
  if (normExisting === "general" || normTarget === "general") return true;
  if (normExisting === "multiproducto" || normTarget === "multiproducto") return true;

  return false;
}

export interface ICommercialOpportunityStorage {
  getClient(id: string): Promise<Client | undefined>;
  findClientByDuplicateCriteria(criteria: {
    cleanRfc?: string | null;
    cleanPhone?: string | null;
    cleanEmail?: string | null;
    userTenantId?: string | null;
  }): Promise<{ sameTenantMatch?: Client; crossTenantMatch?: Client }>;
  getCommercialRelationship(
    clientId: string,
    brokerId?: string
  ): Promise<ClientCommercialRelationship | undefined>;
  getAllClientRelationships(clientId: string): Promise<ClientCommercialRelationship[]>;
  updateCommercialRelationship(
    id: string,
    updates: Partial<ClientCommercialRelationship>
  ): Promise<ClientCommercialRelationship>;
  createCommercialRelationship(
    data: InsertClientCommercialRelationship
  ): Promise<ClientCommercialRelationship>;
  getOpportunity(id: string): Promise<CommercialOpportunity | undefined>;
  getCommercialOpportunities(
    clientId: string,
    brokerId?: string
  ): Promise<CommercialOpportunity[]>;
  createCommercialOpportunity(
    data: InsertCommercialOpportunity
  ): Promise<CommercialOpportunity>;
  updateCommercialOpportunity(
    id: string,
    updates: Partial<CommercialOpportunity>
  ): Promise<CommercialOpportunity>;
  getExpiredOpportunities(now: Date): Promise<CommercialOpportunity[]>;
  createCommercialActivity(
    data: InsertCommercialActivity
  ): Promise<CommercialActivity>;
  getCommercialActivities(opportunityId: string): Promise<CommercialActivity[]>;
  createCommercialAuditLog(
    data: InsertCommercialAuditLog
  ): Promise<CommercialAuditLog>;
  getCommercialAuditLogs(
    entityType: string,
    entityId: string
  ): Promise<CommercialAuditLog[]>;
}

export class CommercialOpportunityService {
  constructor(
    private storage: ICommercialOpportunityStorage,
    private configService: ICommercialConfigService,
    private authService: CommercialAuthorizationService
  ) {}

  /**
   * Crea una nueva oportunidad comercial protegida con hold inicial configurable.
   */
  async createOpportunity(input: CreateOpportunityInput): Promise<CreateOpportunityResult> {
    const {
      clientId,
      brokerId,
      masterBrokerId,
      tenantId,
      title,
      financingNeedType,
      requestedAmount,
      productTemplateId,
      targetInstitutionId,
      initialEvidenceType,
      initialEvidenceDocUrl,
      notes,
      performedBy = brokerId,
      userRole = "broker",
      tenantContext,
      now = new Date(),
    } = input;

    // 1. Autorización de acceso al cliente mediante CommercialAuthorizationService
    const authResult = await this.authService.authorizeClientAccess({
      userId: brokerId,
      userRole,
      clientId,
      tenantContext,
      now,
    });

    if (!authResult.authorized) {
      return {
        success: false,
        message: authResult.reason || "No tienes autorización para acceder a este cliente.",
      };
    }

    if (!authResult.capabilities.canCreateOpportunity) {
      return {
        success: false,
        message: `El nivel de acceso '${authResult.scope}' no permite registrar nuevas oportunidades comerciales.`,
      };
    }

    // 2. Liberar oportunidades expiradas del cliente para tener estado limpio
    await this.evaluateAndReleaseForClient(clientId, now);

    // 3. Verificación de equivalencia / conflicto con oportunidades protegidas existentes
    const existingOpps = await this.storage.getCommercialOpportunities(clientId);
    for (const opp of existingOpps) {
      if (isOpportunityEquivalent(opp, financingNeedType, now)) {
        if (opp.brokerId !== brokerId) {
          // Conflicto con oportunidad protegida de otro broker
          // Regla: Rechazar con 409, auditar el intento y NO modificar el estado de la oportunidad existente
          await this.storage.createCommercialAuditLog({
            entityType: "commercial_opportunity",
            entityId: opp.id,
            clientId,
            brokerId,
            performedBy,
            action: "opportunity_conflict_attempt",
            previousState: opp.status,
            newState: opp.status, // La oportunidad existente preserva exactamente su estado intacto
            metadata: {
              attemptedNeed: financingNeedType,
              existingOpportunityId: opp.id,
              existingBrokerId: opp.brokerId,
              existingStatus: opp.status,
              conflictResult: "rejected_with_409",
              statusPreserved: true,
            },
          });

          return {
            success: false,
            conflict: true,
            code: "PROTECTED_OPPORTUNITY_EXISTS",
            message:
              "Existe una oportunidad comercial protegida vigente de otro broker para esta necesidad de financiamiento. Para representarlo, el cliente debe emitir una confirmación de elección de broker.",
            conflictingOpportunity: {
              id: opp.id,
              brokerId: opp.brokerId,
              status: opp.status,
              financingNeedType: opp.financingNeedType,
              holdExpiresAt: opp.holdExpiresAt,
              protectedUntil: opp.protectedUntil,
            },
          };
        } else {
          // El mismo broker ya tiene oportunidad activa protegida
          return {
            success: false,
            conflict: true,
            code: "SAME_BROKER_OPPORTUNITY_EXISTS",
            message:
              "Ya cuentas con una oportunidad comercial protegida vigente para este cliente y necesidad de financiamiento.",
            conflictingOpportunity: {
              id: opp.id,
              brokerId: opp.brokerId,
              status: opp.status,
              financingNeedType: opp.financingNeedType,
              holdExpiresAt: opp.holdExpiresAt,
              protectedUntil: opp.protectedUntil,
            },
          };
        }
      }
    }

    // 4. Cálculo dinámico de vigencia del hold inicial (sin hardcodeo)
    const config = await this.configService.getConfig();
    const holdDays = config.initialOpportunityHoldDays;
    const holdExpiresAt = new Date(now.getTime() + holdDays * 86400000);

    // 5. Inserción de la oportunidad en estado registered_hold
    const opportunity = await this.storage.createCommercialOpportunity({
      clientId,
      brokerId,
      masterBrokerId: masterBrokerId || null,
      tenantId: tenantId || authResult.client?.tenantId || null,
      title,
      financingNeedType,
      requestedAmount: String(requestedAmount),
      productTemplateId: productTemplateId || null,
      targetInstitutionId: targetInstitutionId || null,
      status: "registered_hold",
      holdExpiresAt,
      lastValidActivityAt: now,
      initialEvidenceType: initialEvidenceType || null,
      initialEvidenceDocUrl: initialEvidenceDocUrl || null,
      notes: notes || null,
    });

    // 6. Registro en bitácora inmutable de auditoría
    await this.storage.createCommercialAuditLog({
      entityType: "commercial_opportunity",
      entityId: opportunity.id,
      clientId,
      brokerId,
      performedBy,
      action: "opportunity_created",
      newState: "registered_hold",
      metadata: {
        financingNeedType,
        requestedAmount: String(requestedAmount),
        holdExpiresAt,
        holdDays,
      },
    });

    return {
      success: true,
      opportunity,
      message: `Oportunidad registrada exitosamente en periodo de reserva (hold) por ${holdDays} días naturales. Genera actividad comercial calificada para activar la protección plena.`,
    };
  }

  /**
   * Registra una actividad comercial sobre una oportunidad.
   * Si la actividad es estructurada y calificada, valida el hold -> protected_active,
   * extiende protectedUntil y puede reactivar relaciones comerciales dormidas.
   */
  async recordActivity(input: RecordActivityInput): Promise<RecordActivityResult> {
    const {
      clientId,
      opportunityId,
      brokerId,
      activityType,
      title,
      description,
      documentId,
      evidenceUrl,
      performedAt = new Date(),
      performedBy = brokerId,
      userRole = "broker",
      tenantContext,
      now = new Date(),
    } = input;

    const opportunity = await this.storage.getOpportunity(opportunityId);
    if (!opportunity) {
      return {
        success: false,
        validForProtection: false,
        message: "Oportunidad no encontrada.",
      };
    }

    if (opportunity.clientId !== clientId) {
      return {
        success: false,
        validForProtection: false,
        message: "La oportunidad no corresponde a este cliente.",
      };
    }

    // Validación de permisos de titularidad sobre la oportunidad
    const isPlatformAdmin = Boolean(
      userRole === "super_admin" || tenantContext?.isPlatformAdmin === true
    );
    if (opportunity.brokerId !== brokerId && !isPlatformAdmin && userRole !== "admin") {
      return {
        success: false,
        validForProtection: false,
        message: "No tienes permiso para registrar actividades en una oportunidad ajena.",
      };
    }

    // Estados terminales
    if (opportunity.status === "converted_credit" || opportunity.status === "rejected") {
      return {
        success: false,
        validForProtection: false,
        message: `No se pueden registrar actividades en una oportunidad en estado terminal (${opportunity.status}).`,
      };
    }

    // Persistencia de la actividad
    const activity = await this.storage.createCommercialActivity({
      clientId,
      opportunityId,
      brokerId,
      activityType,
      title,
      description: description || null,
      documentId: documentId || null,
      evidenceUrl: evidenceUrl || null,
      performedAt,
    });

    const isProtectionValid = isValidProtectionActivity(activityType);
    if (!isProtectionValid) {
      // Actividad no estructurada (ej. nota libre o llamada sin validar)
      await this.storage.createCommercialAuditLog({
        entityType: "commercial_activity",
        entityId: activity.id,
        clientId,
        brokerId,
        performedBy,
        action: "activity_logged_unqualified",
        metadata: {
          activityType,
          title,
          extendedProtection: false,
          reason: "Tipo de actividad no califica para extensión de protección comercial",
        },
      });

      return {
        success: true,
        validForProtection: false,
        activity,
        opportunity,
        message:
          "Actividad registrada como nota CRM. No extiende la protección comercial por no ser una actividad estructurada calificada.",
      };
    }

    // Actividad calificada: cálculo dinámico de protección
    const config = await this.configService.getConfig();
    const protectionDays = config.opportunityInactivityProtectionDays;
    const newProtectedUntil = new Date(performedAt.getTime() + protectionDays * 86400000);

    let updatedOpp: CommercialOpportunity;
    if (opportunity.status === "registered_hold") {
      // Transición de hold inicial a protección activa
      updatedOpp = await this.storage.updateCommercialOpportunity(opportunityId, {
        status: "protected_active",
        protectedUntil: newProtectedUntil,
        lastValidActivityAt: performedAt,
      });

      await this.storage.createCommercialAuditLog({
        entityType: "commercial_opportunity",
        entityId: opportunityId,
        clientId,
        brokerId,
        performedBy,
        action: "opportunity_hold_validated",
        previousState: "registered_hold",
        newState: "protected_active",
        metadata: {
          activityId: activity.id,
          activityType,
          protectionDays,
          protectedUntil: newProtectedUntil,
        },
      });
    } else {
      // Oportunidad ya en protección activa o reanudada: extender vigencia
      const currentProtectedUntil = opportunity.protectedUntil
        ? new Date(opportunity.protectedUntil)
        : null;
      const finalProtectedUntil =
        !currentProtectedUntil || newProtectedUntil > currentProtectedUntil
          ? newProtectedUntil
          : currentProtectedUntil;

      updatedOpp = await this.storage.updateCommercialOpportunity(opportunityId, {
        status: "protected_active",
        protectedUntil: finalProtectedUntil,
        lastValidActivityAt: performedAt,
      });

      await this.storage.createCommercialAuditLog({
        entityType: "commercial_opportunity",
        entityId: opportunityId,
        clientId,
        brokerId,
        performedBy,
        action: "opportunity_protection_extended",
        previousState: opportunity.status,
        newState: "protected_active",
        metadata: {
          activityId: activity.id,
          activityType,
          protectionDays,
          previousProtectedUntil: currentProtectedUntil,
          newProtectedUntil: finalProtectedUntil,
        },
      });
    }

    // Actualización / Reactivación de la relación comercial de cartera
    let relationshipReactivated = false;
    const rel = await this.storage.getCommercialRelationship(clientId, brokerId);
    if (rel) {
      const activeDays = config.activeRelationshipValidityDays;
      const newActiveUntil = new Date(performedAt.getTime() + activeDays * 86400000);

      if (
        rel.status === "dormant" ||
        rel.status === "legacy_unverified" ||
        rel.status === "inactive"
      ) {
        await this.storage.updateCommercialRelationship(rel.id, {
          status: "active",
          activeUntil: newActiveUntil,
          lastValidActivityAt: performedAt,
          lastActivityType: activityType,
          lastActivitySummary: title,
        });

        relationshipReactivated = true;

        await this.storage.createCommercialAuditLog({
          entityType: "client_commercial_relationship",
          entityId: rel.id,
          clientId,
          brokerId,
          performedBy,
          action: "relationship_reactivated",
          previousState: rel.status,
          newState: "active",
          metadata: {
            activityId: activity.id,
            activeUntil: newActiveUntil,
            activeDays,
          },
        });
      } else {
        const currentActiveUntil = rel.activeUntil ? new Date(rel.activeUntil) : null;
        const finalActiveUntil =
          !currentActiveUntil || newActiveUntil > currentActiveUntil
            ? newActiveUntil
            : currentActiveUntil;

        await this.storage.updateCommercialRelationship(rel.id, {
          activeUntil: finalActiveUntil,
          lastValidActivityAt: performedAt,
          lastActivityType: activityType,
          lastActivitySummary: title,
        });
      }
    }

    return {
      success: true,
      validForProtection: true,
      activity,
      opportunity: updatedOpp,
      relationshipReactivated,
      message: `Actividad comercial válida registrada. Protección comercial extendida por ${protectionDays} días naturales.`,
    };
  }

  /**
   * Evalúa y libera oportunidades con hold o periodo de protección vencido.
   * Transiciona a expired_released sin alterar historial, créditos ni comisiones.
   */
  async evaluateAndReleaseExpiredOpportunities(now: Date = new Date()): Promise<ReleaseExpiredResult> {
    const expired = await this.storage.getExpiredOpportunities(now);
    const releasedOpportunities = [];

    for (const opp of expired) {
      await this.storage.updateCommercialOpportunity(opp.id, {
        status: "expired_released",
      });

      await this.storage.createCommercialAuditLog({
        entityType: "commercial_opportunity",
        entityId: opp.id,
        clientId: opp.clientId,
        brokerId: opp.brokerId,
        performedBy: "system_cron",
        action: "opportunity_expired_released",
        previousState: opp.status,
        newState: "expired_released",
        metadata: {
          holdExpiresAt: opp.holdExpiresAt,
          protectedUntil: opp.protectedUntil,
          evaluatedAt: now,
        },
      });

      releasedOpportunities.push({
        id: opp.id,
        clientId: opp.clientId,
        brokerId: opp.brokerId,
        previousStatus: opp.status,
        expiredAt: now,
      });
    }

    return {
      releasedCount: releasedOpportunities.length,
      releasedOpportunities,
    };
  }

  /**
   * Helper para evaluar y liberar oportunidades vencidas de un cliente específico.
   */
  async evaluateAndReleaseForClient(clientId: string, now: Date = new Date()): Promise<void> {
    const opps = await this.storage.getCommercialOpportunities(clientId);
    for (const opp of opps) {
      const isHoldExpired =
        opp.status === "registered_hold" && opp.holdExpiresAt && new Date(opp.holdExpiresAt) < now;
      const isProtectionExpired =
        opp.status === "protected_active" &&
        opp.protectedUntil &&
        new Date(opp.protectedUntil) < now;

      if (isHoldExpired || isProtectionExpired) {
        await this.storage.updateCommercialOpportunity(opp.id, {
          status: "expired_released",
        });

        await this.storage.createCommercialAuditLog({
          entityType: "commercial_opportunity",
          entityId: opp.id,
          clientId: opp.clientId,
          brokerId: opp.brokerId,
          performedBy: "system_evaluator",
          action: "opportunity_expired_released",
          previousState: opp.status,
          newState: "expired_released",
          metadata: {
            holdExpiresAt: opp.holdExpiresAt,
            protectedUntil: opp.protectedUntil,
            evaluatedAt: now,
          },
        });
      }
    }
  }

  /**
   * Chequeo de duplicados enriquecido.
   * No bloquea al cliente permanentemente, sino que distingue si es elegible
   * para una nueva oportunidad comercial según el estado de protección.
   */
  async checkDuplicatesEnriched(
    input: CheckDuplicatesEnrichedInput
  ): Promise<EnrichedDuplicateCheckResult> {
    const {
      rfc,
      phone,
      email,
      financingNeedType,
      currentUserId,
      currentUserRole = "broker",
      userTenantId,
      tenantContext,
      now = new Date(),
    } = input;

    const cleanRfc = rfc ? String(rfc).trim().toUpperCase() : null;
    const cleanPhone = phone ? String(phone).replace(/[^0-9]/g, "") : null;
    const cleanEmail = email ? String(email).trim().toLowerCase() : null;

    if (!cleanRfc && !cleanPhone && !cleanEmail) {
      return {
        hasDuplicate: false,
        clientExists: false,
        isSameTenant: false,
        canCreateOpportunity: true,
        duplicateReason: "no_duplicate",
        message: "No se proporcionaron datos de identificación para verificación de duplicados.",
      };
    }

    const { sameTenantMatch, crossTenantMatch } =
      await this.storage.findClientByDuplicateCriteria({
        cleanRfc,
        cleanPhone,
        cleanEmail,
        userTenantId,
      });

    // 1. Coincidencia en otro tenant (sin filtrar datos privados entre organizaciones)
    const isPlatformAdmin = Boolean(
      currentUserRole === "super_admin" || tenantContext?.isPlatformAdmin === true
    );

    if (crossTenantMatch && !sameTenantMatch && !isPlatformAdmin) {
      return {
        hasDuplicate: true,
        clientExists: true,
        isSameTenant: false,
        canCreateOpportunity: false,
        duplicateReason: "cross_tenant_collision",
        message:
          "Existe una coincidencia registrada en otra organización. Consulta a Mesa de Control de Plataforma.",
      };
    }

    const matchedClient = sameTenantMatch || (isPlatformAdmin ? crossTenantMatch : undefined);

    // 2. Cliente Inexistente
    if (!matchedClient) {
      return {
        hasDuplicate: false,
        clientExists: false,
        isSameTenant: true,
        canCreateOpportunity: true,
        duplicateReason: "no_duplicate",
        message: "Cliente nuevo no registrado. Elegible para creación de ficha y registro de oportunidad.",
      };
    }

    // 3. Cliente Existente: evaluar oportunidades y relaciones
    await this.evaluateAndReleaseForClient(matchedClient.id, now);

    const clientOpps = await this.storage.getCommercialOpportunities(matchedClient.id);
    const activeOpp = clientOpps.find((opp) => {
      const isHold =
        opp.status === "registered_hold" &&
        opp.holdExpiresAt &&
        new Date(opp.holdExpiresAt) >= now;
      const isProtected =
        opp.status === "protected_active" &&
        opp.protectedUntil &&
        new Date(opp.protectedUntil) >= now;
      if (!isHold && !isProtected) return false;

      if (!financingNeedType) return true;
      return isOpportunityEquivalent(opp, financingNeedType, now);
    });

    const activeOppDetails = activeOpp
      ? {
          id: activeOpp.id,
          financingNeedType: activeOpp.financingNeedType,
          status: activeOpp.status,
          brokerId: activeOpp.brokerId,
          holdExpiresAt: activeOpp.holdExpiresAt,
          protectedUntil: activeOpp.protectedUntil,
        }
      : undefined;

    // Caso A: Existe oportunidad protegida vigente para esta necesidad
    if (activeOpp) {
      if (activeOpp.brokerId !== currentUserId) {
        return {
          hasDuplicate: true,
          clientExists: true,
          isSameTenant: true,
          canCreateOpportunity: false,
          duplicateReason: "client_has_protected_opportunity",
          message:
            "El cliente ya cuenta con una oportunidad protegida vigente para esta necesidad de financiamiento con otro asesor. Para gestionarlo, se requiere una confirmación de elección de broker emitida por el cliente.",
          existingClient: {
            id: matchedClient.id,
            businessName: matchedClient.businessName,
            firstName: matchedClient.firstName,
            lastName: matchedClient.lastName,
            rfc: matchedClient.rfc,
            type: matchedClient.type,
          },
          activeOpportunity: activeOppDetails,
        };
      } else {
        return {
          hasDuplicate: true,
          clientExists: true,
          isSameTenant: true,
          canCreateOpportunity: false,
          duplicateReason: "client_has_active_relationship_same_broker",
          message: "Ya cuentas con una oportunidad comercial activa y protegida para este cliente.",
          existingClient: {
            id: matchedClient.id,
            businessName: matchedClient.businessName,
            firstName: matchedClient.firstName,
            lastName: matchedClient.lastName,
            rfc: matchedClient.rfc,
            type: matchedClient.type,
          },
          activeOpportunity: activeOppDetails,
        };
      }
    }

    // Caso B: No hay oportunidad protegida para esta necesidad.
    // Evaluar relaciones comerciales existentes en la cartera
    const relationships = await this.storage.getAllClientRelationships(matchedClient.id);
    const activeRel = relationships.find(
      (r) => r.status === "active" && (!r.activeUntil || new Date(r.activeUntil) >= now)
    );

    if (activeRel) {
      if (activeRel.brokerId !== currentUserId) {
        return {
          hasDuplicate: true,
          clientExists: true,
          isSameTenant: true,
          canCreateOpportunity: true,
          duplicateReason: "client_has_active_relationship_other_broker",
          message:
            "El cliente tiene un asesor activo para otra línea, pero no cuenta con oportunidad protegida para esta necesidad específica. Es elegible para registrar una nueva oportunidad comercial.",
          existingClient: {
            id: matchedClient.id,
            businessName: matchedClient.businessName,
            firstName: matchedClient.firstName,
            lastName: matchedClient.lastName,
            rfc: matchedClient.rfc,
            type: matchedClient.type,
          },
          commercialRelationship: {
            status: activeRel.status,
            brokerId: activeRel.brokerId,
            activeUntil: activeRel.activeUntil,
          },
        };
      } else {
        return {
          hasDuplicate: true,
          clientExists: true,
          isSameTenant: true,
          canCreateOpportunity: true,
          duplicateReason: "same_tenant_client_eligible",
          message: "Eres el asesor titular activo de este cliente. Puedes registrar una nueva oportunidad.",
          existingClient: {
            id: matchedClient.id,
            businessName: matchedClient.businessName,
            firstName: matchedClient.firstName,
            lastName: matchedClient.lastName,
            rfc: matchedClient.rfc,
            type: matchedClient.type,
          },
          commercialRelationship: {
            status: activeRel.status,
            brokerId: activeRel.brokerId,
            activeUntil: activeRel.activeUntil,
          },
        };
      }
    }

    // Caso C: Cliente con relación dormant / legacy / histórico
    const dormantRel = relationships.find(
      (r) => r.status === "dormant" || r.status === "legacy_unverified" || r.status === "inactive"
    );

    return {
      hasDuplicate: true,
      clientExists: true,
      isSameTenant: true,
      canCreateOpportunity: true,
      duplicateReason: dormantRel ? "client_dormant_eligible" : "client_historical_eligible",
      message:
        "Cliente existente sin relación comercial activa ni oportunidades vigentes. Es elegible para registrar una nueva oportunidad comercial.",
      existingClient: {
        id: matchedClient.id,
        businessName: matchedClient.businessName,
        firstName: matchedClient.firstName,
        lastName: matchedClient.lastName,
        rfc: matchedClient.rfc,
        type: matchedClient.type,
      },
      commercialRelationship: dormantRel
        ? {
            status: dormantRel.status,
            brokerId: dormantRel.brokerId,
            activeUntil: dormantRel.activeUntil,
          }
        : undefined,
    };
  }

  /**
   * Obtiene las oportunidades de un cliente filtradas por el scope de autorización.
   */
  async getClientOpportunities(params: {
    clientId: string;
    userId: string;
    userRole: string;
    tenantContext?: any;
    now?: Date;
  }): Promise<{
    authorized: boolean;
    opportunities: CommercialOpportunity[];
    scope: ClientAccessScope;
    reason?: string;
  }> {
    const { clientId, userId, userRole, tenantContext, now = new Date() } = params;

    const authResult = await this.authService.authorizeClientAccess({
      userId,
      userRole,
      clientId,
      tenantContext,
      now,
    });

    if (!authResult.authorized) {
      return {
        authorized: false,
        opportunities: [],
        scope: "none",
        reason: authResult.reason || "Acceso denegado al cliente.",
      };
    }

    // Liberar expiradas antes de consultar
    await this.evaluateAndReleaseForClient(clientId, now);

    let networkBrokerIds: string[] = [userId];
    if (authResult.scope === "master_broker_oversight") {
      const network = await (this.authService as any)['storage']?.getNetworkBrokers?.(userId);
      if (network) {
        networkBrokerIds = network.map((b: any) => b.id);
      }
    }

    const allOpps = await this.storage.getCommercialOpportunities(clientId);
    const visibleOpps = allOpps.filter((opp) =>
      this.authService.canAccessOpportunity(authResult, opp, networkBrokerIds)
    );

    return {
      authorized: true,
      opportunities: visibleOpps,
      scope: authResult.scope,
    };
  }

  /**
   * Obtiene las actividades registradas sobre una oportunidad.
   */
  async getOpportunityActivities(params: {
    opportunityId: string;
    userId: string;
    userRole: string;
    tenantContext?: any;
    now?: Date;
  }): Promise<{
    authorized: boolean;
    activities: CommercialActivity[];
    reason?: string;
  }> {
    const { opportunityId, userId, userRole, tenantContext, now = new Date() } = params;

    const opp = await this.storage.getOpportunity(opportunityId);
    if (!opp) {
      return { authorized: false, activities: [], reason: "Oportunidad no encontrada" };
    }

    const authResult = await this.authService.authorizeClientAccess({
      userId,
      userRole,
      clientId: opp.clientId,
      tenantContext,
      now,
    });

    let networkBrokerIds: string[] = [userId];
    if (authResult.scope === "master_broker_oversight") {
      const network = await (this.authService as any)['storage']?.getNetworkBrokers?.(userId);
      if (network) {
        networkBrokerIds = network.map((b: any) => b.id);
      }
    }

    if (!authResult.authorized || !this.authService.canAccessOpportunity(authResult, opp, networkBrokerIds)) {
      return { authorized: false, activities: [], reason: "Acceso denegado a la oportunidad" };
    }

    const activities = await this.storage.getCommercialActivities(opportunityId);
    return { authorized: true, activities };
  }

  /**
   * Abre formalmente una controversia comercial sobre una oportunidad existente.
   * Regla de Negocio Crítica:
   * El estado 'disputed' únicamente puede activarse ante:
   * 1. Solicitud verificable de cambio de broker por parte del cliente (carta firmada, token digital o validación de mesa de control).
   * 2. Apertura expresa de controversia por Mesa de Control / Super Admin.
   * 3. Evidencia contradictoria documental que requiera resolución.
   *
   * Notas CRM o afirmaciones unilaterales de un broker NO pueden congelar ni degradar derechos de otro broker.
   */
  async openFormalDispute(input: OpenFormalDisputeInput): Promise<OpenFormalDisputeResult> {
    const {
      opportunityId,
      disputeReason,
      justification,
      evidenceUrl,
      clientElectionToken,
      verificationMethod,
      performedBy,
      userRole = "broker",
      tenantContext,
      now = new Date(),
    } = input;

    const opportunity = await this.storage.getOpportunity(opportunityId);
    if (!opportunity) {
      return {
        success: false,
        code: "OPPORTUNITY_NOT_FOUND",
        message: "Oportunidad no encontrada.",
      };
    }

    // Estados terminales no son disputables
    if (opportunity.status === "converted_credit" || opportunity.status === "rejected") {
      return {
        success: false,
        code: "TERMINAL_STATE",
        message: `No se puede abrir disputa sobre una oportunidad en estado terminal (${opportunity.status}).`,
      };
    }

    if (opportunity.status === "disputed") {
      return {
        success: true,
        opportunity,
        code: "ALREADY_DISPUTED",
        message: "La oportunidad ya se encuentra en estado de controversia formal (disputed).",
      };
    }

    if (!justification || justification.trim().length < 5) {
      return {
        success: false,
        code: "JUSTIFICATION_REQUIRED",
        message: "Se requiere una justificación detallada para abrir una controversia formal.",
      };
    }

    const isPlatformAdmin = Boolean(
      userRole === "super_admin" || userRole === "admin" || tenantContext?.isPlatformAdmin === true
    );

    // Validación según el tipo formal de controversia:
    if (disputeReason === "mesa_control_intervention") {
      if (!isPlatformAdmin) {
        return {
          success: false,
          code: "FORBIDDEN_REASON",
          message: "Solo Mesa de Control o Administradores de Plataforma pueden abrir controversias por intervención directa.",
        };
      }
    } else if (disputeReason === "client_broker_change_request") {
      // Debe ser una acción verificable por parte del cliente, no una afirmación unilateral de un broker
      const hasVerifiableProof = Boolean(
        clientElectionToken ||
        evidenceUrl ||
        (verificationMethod && verificationMethod !== "mesa_control_manual" ? true : isPlatformAdmin)
      );

      if (!hasVerifiableProof) {
        return {
          success: false,
          code: "UNILATERAL_CLAIM_REJECTED",
          message:
            "Una nota o afirmación unilateral del broker no puede degradar derechos ni pasar a disputa una oportunidad existente. Se requiere una solicitud verificable de cambio de broker emitida formalmente por el cliente (carta firmada, token digital o validación verificable).",
        };
      }
    } else if (disputeReason === "contradictory_evidence") {
      // Debe adjuntarse evidencia contradictoria documental real
      if (!evidenceUrl || evidenceUrl.trim().length === 0) {
        return {
          success: false,
          code: "EVIDENCE_REQUIRED",
          message:
            "Para abrir una controversia por evidencia contradictoria se debe adjuntar el documento o evidencia probatoria.",
        };
      }
    } else {
      return {
        success: false,
        code: "INVALID_DISPUTE_REASON",
        message: "Motivo de controversia no reconocido. Solo se admiten controversias formales verificables.",
      };
    }

    // Actualización de estado a disputed
    const previousStatus = opportunity.status;
    const updatedOpp = await this.storage.updateCommercialOpportunity(opportunityId, {
      status: "disputed",
    });

    // Auditoría inmutable de apertura de controversia
    await this.storage.createCommercialAuditLog({
      entityType: "commercial_opportunity",
      entityId: opportunityId,
      clientId: opportunity.clientId,
      brokerId: opportunity.brokerId,
      performedBy,
      action: "opportunity_disputed",
      previousState: previousStatus,
      newState: "disputed",
      metadata: {
        disputeReason,
        justification,
        evidenceUrl: evidenceUrl || null,
        clientElectionToken: clientElectionToken || null,
        verificationMethod: verificationMethod || null,
        disputedAt: now,
      },
    });

    return {
      success: true,
      opportunity: updatedOpp,
      message: "Controversia formal registrada exitosamente. La oportunidad ha sido colocada en estado 'disputed' para resolución de Mesa de Control.",
    };
  }
}

/**
 * Storage en memoria para pruebas unitarias rápidas y herméticas
 */
export class MockCommercialOpportunityStorage implements ICommercialOpportunityStorage {
  clients: Client[] = [];
  relationships: ClientCommercialRelationship[] = [];
  opportunities: CommercialOpportunity[] = [];
  activities: CommercialActivity[] = [];
  auditLogs: CommercialAuditLog[] = [];

  async getClient(id: string): Promise<Client | undefined> {
    return this.clients.find((c) => c.id === id);
  }

  async findClientByDuplicateCriteria(criteria: {
    cleanRfc?: string | null;
    cleanPhone?: string | null;
    cleanEmail?: string | null;
    userTenantId?: string | null;
  }): Promise<{ sameTenantMatch?: Client; crossTenantMatch?: Client }> {
    const { cleanRfc, cleanPhone, cleanEmail, userTenantId } = criteria;

    let sameTenantMatch: Client | undefined;
    let crossTenantMatch: Client | undefined;

    for (const c of this.clients) {
      const matchRfc = cleanRfc && c.rfc && c.rfc.trim().toUpperCase() === cleanRfc;
      const matchPhone =
        cleanPhone && c.phone && c.phone.replace(/[^0-9]/g, "") === cleanPhone;
      const matchEmail =
        cleanEmail && c.email && c.email.trim().toLowerCase() === cleanEmail;

      if (matchRfc || matchPhone || matchEmail) {
        if (!userTenantId || c.tenantId === userTenantId) {
          sameTenantMatch = c;
          break;
        } else {
          crossTenantMatch = c;
        }
      }
    }

    return { sameTenantMatch, crossTenantMatch };
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

  async getAllClientRelationships(clientId: string): Promise<ClientCommercialRelationship[]> {
    return this.relationships.filter((r) => r.clientId === clientId);
  }

  async updateCommercialRelationship(
    id: string,
    updates: Partial<ClientCommercialRelationship>
  ): Promise<ClientCommercialRelationship> {
    const idx = this.relationships.findIndex((r) => r.id === id);
    if (idx === -1) throw new Error(`Relationship ${id} not found`);
    const updated = {
      ...this.relationships[idx],
      ...updates,
      updatedAt: new Date(),
    };
    this.relationships[idx] = updated;
    return updated;
  }

  async createCommercialRelationship(
    data: InsertClientCommercialRelationship
  ): Promise<ClientCommercialRelationship> {
    const item: ClientCommercialRelationship = {
      id: `rel-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      tenantId: data.tenantId || null,
      clientId: data.clientId,
      brokerId: data.brokerId,
      masterBrokerId: data.masterBrokerId || null,
      status: data.status || "legacy_unverified",
      lastValidActivityAt: data.lastValidActivityAt || null,
      lastActivityType: data.lastActivityType || null,
      lastActivitySummary: data.lastActivitySummary || null,
      activeUntil: data.activeUntil || null,
      dormantUntil: data.dormantUntil || null,
      inboundPriorityExpiresAt: data.inboundPriorityExpiresAt || null,
      inboundPriorityStatus: data.inboundPriorityStatus || null,
      notes: data.notes || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.relationships.push(item);
    return item;
  }

  async getOpportunity(id: string): Promise<CommercialOpportunity | undefined> {
    return this.opportunities.find((o) => o.id === id);
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

  async createCommercialOpportunity(
    data: InsertCommercialOpportunity
  ): Promise<CommercialOpportunity> {
    const opp: CommercialOpportunity = {
      id: (data as any).id || `opp-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      tenantId: data.tenantId || null,
      clientId: data.clientId,
      brokerId: data.brokerId,
      masterBrokerId: data.masterBrokerId || null,
      title: data.title,
      financingNeedType: data.financingNeedType,
      requestedAmount: String(data.requestedAmount),
      productTemplateId: data.productTemplateId || null,
      targetInstitutionId: data.targetInstitutionId || null,
      status: data.status || "registered_hold",
      holdExpiresAt: data.holdExpiresAt,
      protectedUntil: data.protectedUntil || null,
      lastValidActivityAt: data.lastValidActivityAt || new Date(),
      initialEvidenceType: data.initialEvidenceType || null,
      initialEvidenceDocUrl: data.initialEvidenceDocUrl || null,
      initialEvidenceValidatedAt: null,
      initialEvidenceValidatedBy: null,
      linkedSubmissionId: null,
      convertedCreditId: null,
      isDerivedWorkSuspicion: false,
      priorWorkBrokerId: null,
      notes: data.notes || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.opportunities.push(opp);
    return opp;
  }

  async updateCommercialOpportunity(
    id: string,
    updates: Partial<CommercialOpportunity>
  ): Promise<CommercialOpportunity> {
    const idx = this.opportunities.findIndex((o) => o.id === id);
    if (idx === -1) throw new Error(`Opportunity ${id} not found`);
    const updated = {
      ...this.opportunities[idx],
      ...updates,
      updatedAt: new Date(),
    };
    this.opportunities[idx] = updated;
    return updated;
  }

  async getExpiredOpportunities(now: Date): Promise<CommercialOpportunity[]> {
    return this.opportunities.filter((opp) => {
      const isHoldExpired =
        opp.status === "registered_hold" &&
        opp.holdExpiresAt &&
        new Date(opp.holdExpiresAt) < now;
      const isProtectionExpired =
        opp.status === "protected_active" &&
        opp.protectedUntil &&
        new Date(opp.protectedUntil) < now;
      return isHoldExpired || isProtectionExpired;
    });
  }

  async createCommercialActivity(
    data: InsertCommercialActivity
  ): Promise<CommercialActivity> {
    const act: CommercialActivity = {
      id: `act-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      clientId: data.clientId,
      opportunityId: data.opportunityId || null,
      relationshipId: data.relationshipId || null,
      brokerId: data.brokerId,
      activityType: data.activityType,
      title: data.title,
      description: data.description || null,
      documentId: data.documentId || null,
      evidenceUrl: data.evidenceUrl || null,
      verifiedBySystem: true,
      performedAt: data.performedAt || new Date(),
      createdAt: new Date(),
    };
    this.activities.push(act);
    return act;
  }

  async getCommercialActivities(opportunityId: string): Promise<CommercialActivity[]> {
    return this.activities.filter((a) => a.opportunityId === opportunityId);
  }

  async createCommercialAuditLog(
    data: InsertCommercialAuditLog
  ): Promise<CommercialAuditLog> {
    const log: CommercialAuditLog = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      entityType: data.entityType,
      entityId: data.entityId,
      clientId: data.clientId || null,
      brokerId: data.brokerId || null,
      performedBy: data.performedBy || null,
      action: data.action,
      previousState: data.previousState || null,
      newState: data.newState || null,
      metadata: data.metadata || {},
      createdAt: new Date(),
    };
    this.auditLogs.push(log);
    return log;
  }

  async getCommercialAuditLogs(
    entityType: string,
    entityId: string
  ): Promise<CommercialAuditLog[]> {
    return this.auditLogs.filter(
      (l) => l.entityType === entityType && l.entityId === entityId
    );
  }
}

/**
 * Storage conectado a PostgreSQL con Drizzle ORM
 */
export class DrizzleCommercialOpportunityStorage implements ICommercialOpportunityStorage {
  constructor(private db: any) {}

  async getClient(id: string): Promise<Client | undefined> {
    const rows = await this.db.select().from(clients).where(eq(clients.id, id)).limit(1);
    return rows[0];
  }

  async findClientByDuplicateCriteria(criteria: {
    cleanRfc?: string | null;
    cleanPhone?: string | null;
    cleanEmail?: string | null;
    userTenantId?: string | null;
  }): Promise<{ sameTenantMatch?: Client; crossTenantMatch?: Client }> {
    const { cleanRfc, cleanPhone, cleanEmail, userTenantId } = criteria;

    const allMatches = await this.db
      .select()
      .from(clients)
      .where(
        or(
          cleanRfc ? eq(clients.rfc, cleanRfc) : undefined,
          cleanPhone ? eq(clients.phone, cleanPhone) : undefined,
          cleanEmail ? eq(clients.email, cleanEmail) : undefined
        )
      );

    let sameTenantMatch: Client | undefined;
    let crossTenantMatch: Client | undefined;

    for (const c of allMatches) {
      if (!userTenantId || c.tenantId === userTenantId) {
        sameTenantMatch = c;
        break;
      } else {
        crossTenantMatch = c;
      }
    }

    return { sameTenantMatch, crossTenantMatch };
  }

  async getCommercialRelationship(
    clientId: string,
    brokerId?: string
  ): Promise<ClientCommercialRelationship | undefined> {
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
  }

  async getAllClientRelationships(clientId: string): Promise<ClientCommercialRelationship[]> {
    return await this.db
      .select()
      .from(clientCommercialRelationships)
      .where(eq(clientCommercialRelationships.clientId, clientId));
  }

  async updateCommercialRelationship(
    id: string,
    updates: Partial<ClientCommercialRelationship>
  ): Promise<ClientCommercialRelationship> {
    const rows = await this.db
      .update(clientCommercialRelationships)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(clientCommercialRelationships.id, id))
      .returning();
    return rows[0];
  }

  async createCommercialRelationship(
    data: InsertClientCommercialRelationship
  ): Promise<ClientCommercialRelationship> {
    const rows = await this.db
      .insert(clientCommercialRelationships)
      .values(data)
      .returning();
    return rows[0];
  }

  async getOpportunity(id: string): Promise<CommercialOpportunity | undefined> {
    const rows = await this.db
      .select()
      .from(commercialOpportunities)
      .where(eq(commercialOpportunities.id, id))
      .limit(1);
    return rows[0];
  }

  async getCommercialOpportunities(
    clientId: string,
    brokerId?: string
  ): Promise<CommercialOpportunity[]> {
    const conditions = [eq(commercialOpportunities.clientId, clientId)];
    if (brokerId) {
      conditions.push(eq(commercialOpportunities.brokerId, brokerId));
    }
    return await this.db
      .select()
      .from(commercialOpportunities)
      .where(and(...conditions))
      .orderBy(desc(commercialOpportunities.createdAt));
  }

  async createCommercialOpportunity(
    data: InsertCommercialOpportunity
  ): Promise<CommercialOpportunity> {
    const rows = await this.db
      .insert(commercialOpportunities)
      .values(data)
      .returning();
    return rows[0];
  }

  async updateCommercialOpportunity(
    id: string,
    updates: Partial<CommercialOpportunity>
  ): Promise<CommercialOpportunity> {
    const rows = await this.db
      .update(commercialOpportunities)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(commercialOpportunities.id, id))
      .returning();
    return rows[0];
  }

  async getExpiredOpportunities(now: Date): Promise<CommercialOpportunity[]> {
    return await this.db
      .select()
      .from(commercialOpportunities)
      .where(
        or(
          and(
            eq(commercialOpportunities.status, "registered_hold"),
            lt(commercialOpportunities.holdExpiresAt, now)
          ),
          and(
            eq(commercialOpportunities.status, "protected_active"),
            lt(commercialOpportunities.protectedUntil, now)
          )
        )
      );
  }

  async createCommercialActivity(
    data: InsertCommercialActivity
  ): Promise<CommercialActivity> {
    const rows = await this.db
      .insert(commercialActivities)
      .values(data)
      .returning();
    return rows[0];
  }

  async getCommercialActivities(opportunityId: string): Promise<CommercialActivity[]> {
    return await this.db
      .select()
      .from(commercialActivities)
      .where(eq(commercialActivities.opportunityId, opportunityId))
      .orderBy(desc(commercialActivities.performedAt));
  }

  async createCommercialAuditLog(
    data: InsertCommercialAuditLog
  ): Promise<CommercialAuditLog> {
    const rows = await this.db
      .insert(commercialAuditLogs)
      .values(data)
      .returning();
    return rows[0];
  }

  async getCommercialAuditLogs(
    entityType: string,
    entityId: string
  ): Promise<CommercialAuditLog[]> {
    return await this.db
      .select()
      .from(commercialAuditLogs)
      .where(
        and(
          eq(commercialAuditLogs.entityType, entityType),
          eq(commercialAuditLogs.entityId, entityId)
        )
      )
      .orderBy(desc(commercialAuditLogs.createdAt));
  }
}

export function createCommercialOpportunityService(
  storageOverride?: ICommercialOpportunityStorage,
  configServiceOverride?: ICommercialConfigService,
  authServiceOverride?: CommercialAuthorizationService
): CommercialOpportunityService {
  const configService = configServiceOverride || defaultCommercialConfigService;
  const authService = authServiceOverride || defaultCommercialAuthService;

  if (storageOverride) {
    return new CommercialOpportunityService(storageOverride, configService, authService);
  }

  const isMemory = process.env.USE_MEMORY_STORAGE === "true" || process.env.NODE_ENV === "test";
  if (isMemory) {
    return new CommercialOpportunityService(
      new MockCommercialOpportunityStorage(),
      configService,
      authService
    );
  }

  const { db } = require("./db");
  return new CommercialOpportunityService(
    new DrizzleCommercialOpportunityStorage(db),
    configService,
    authService
  );
}

export const commercialOpportunityService = createCommercialOpportunityService();
