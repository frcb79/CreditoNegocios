import { getOfferAgePolicy } from "../shared/offerAgePolicy";
import { matchPublishedCatalog } from "./matching/catalog";
import { registerAdministrativeAudit } from "./administrativeAudit";
import { selectHousingMortgageTemplate } from "./mortgageHousingTemplate";
import { leaseLeadSchema } from "../shared/leasing";
import type { Express } from "express";
import { randomUUID } from "node:crypto";
import { createServer, ServerResponse, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import rateLimit from "express-rate-limit";
import { pool } from "./db";
import { runBrokerInvitationReminders } from "./brokerInvitationReminders";
import { storage, type IStorage } from "./storage";
import { canViewSubmissionByOrigin, canViewCreditByOrigin, canEditCreditByOrigin, summarizeCommercialAccountActivity } from "./dashboardVisibility";
import { projectCreditForRole } from "./creditResponseProjection";
import { allowedOrigins } from "./runtimeConfig";
import { canReadDocumentByOrigin } from "./documentVisibility";
import { resolveSubmissionDisplayStatus } from "../shared/submissionDisplayStatus";
import { readFrozenOfferLineage } from "./offerLineageService";
import { authorizeClientSensitiveDisclosure } from "./clientConsentGate";
import { setupAuth, getSession, isAuthenticated } from "./auth";
import { registerLegalRoutes } from "./legalRoutes";
import { registerClientConsentPublicRoutes } from "./clientConsentRoutes";
import { startInternalCommercialContact, CommercialContactError } from "./commercialContactService";
import { checkPrelaunchSchemaReadiness } from "./stagingSchemaRepair";
import { filterAuthorizedClientListing } from "./clientListVisibility";
import { startClientConsent, invalidateConsentRequest, hasValidClientConsent, listClientConsentEvidenceForTarget, verifyCompanySignerAuthority, markTargetSentWithClientConsent, withAuthorizedClientPdfDisclosure, ClientConsentError } from "./clientConsentService";
import { sendClientConsentLinkEmail } from "./emailService";
import { validateRegistrationAcceptance, getPublishedLegalDocument } from "./legalDocuments";
import PDFDocument from "pdfkit";
import bcrypt from "bcrypt";
import { sendBrokerDeactivationRequestEmail, sendBrokerLeadEmail, sendAccountInvitationEmail, sendPasswordResetEmail, sendWebsiteLeadEmail, sendWelcomeEmail, sendSuperAdminNotificationEmail } from "./emailService";
import { getDocumentAccessTarget, persistDocumentFile, removeStoredDocument } from "./documentStorage";
import { 
  generateFinancierasTemplate, 
  generateClientsTemplate, 
  previewExcelFile, 
  importFinancieras, 
  importClients 
} from "./excelImport";
import {
  generateCommissionsTemplate,
  previewCommissionsFile,
  importCommissionsFile
} from "./commissionImport";
import { blockLegacyEconomicExcelImport, blockLegacyEconomicExcelType } from "./prelaunchEconomicImportGuard";
import { previewMasterV5, type MasterV5Kind } from "./masterV5Preview";
import { importMasterV5FinancialDrafts, importMasterV5CommissionDrafts } from "./masterV5StagingImport";
import { planMasterV5Catalog } from "./masterV5TemplateResolver";
import {
  parseSocExcel,
  syncSocFinancierasToDatabase
} from "./socFinancierasParser";
import { 
  updatedInsertClientSchema, 
  insertCreditSchema, 
  insertFinancialInstitutionSchema,
  insertNotificationSchema,
  insertDocumentSchema,
  insertTenantSchema,
  insertTenantMemberSchema,
  insertProductVariableSchema,
  insertProductSchema,
  insertProductRequestSchema,
  insertProductTemplateSchema,
  insertInstitutionProductSchema,
  insertInstitutionProductVersionSchema,
  insertCreditSubmissionRequestSchema,
  insertCreditSubmissionTargetSchema,
  insertClientCreditHistorySchema,
  insertUserSchema,
  insertFinancialInstitutionRequestSchema,
  createTenantMemberSchema,
  updateTenantMemberSchema,
  insertPromoCodeSchema,
  insertPromoRedemptionSchema,
  redeemPromoCodeSchema,
  validatePromoCodeSchema,
  updateUserAccessStatusSchema,
  updateCommercialRulesConfigSchema,
  DEFAULT_COMMERCIAL_RULES_CONFIG,
  insertOperationalRulesVersionSchema,
  insertUserRuleAcknowledgmentSchema,
  updateOperationalStatusSchema,
  type UserOperationalStatus,
  createStatusRequestSchema,
  approveStatusRequestSchema,
  rejectStatusRequestSchema,
  type UserStatusRequestStatus,
  type UserStatusRequestAction,
} from "../shared/schema";
import {
  isOfferEligibleForRequests,
  validateMinimumPublishConditions,
  validateOfferVersionParameters,
  compareOfferIntermediaryCommissions,
} from "./offerVersionService";
import { getOfferCommissionStatus, acceptOfferCommission, isQuoteHistoricallyFrozen } from "./offerCommissionAcceptance";
import {
  evaluateCatalogCompatibility,
  isVersionEligibleForMatching,
  type OfferVersionInput,
} from "./matching/compatibilityEvaluator";
import {
  MissingCommissionRateError,
  MissingOfferVersionError,
  UnconfirmedDispersalAmountError,
  UnauthorizedDistributionError,
  CommissionFrozenDiscrepancyError,
  ImmutableCommercialSnapshotError,
  type CommissionPayoutAuditResult,
  auditCommissionPayout,
  getCommissionPayoutAmount,
  resolveOfferVersionCommissionRates,
  calculateAndPersistCascadingCommission,
  consolidateCommercialProposalSnapshot,
  type CascadingCommissionInput,
} from "./commissionService";

export {
  MissingCommissionRateError,
  MissingOfferVersionError,
  UnconfirmedDispersalAmountError,
  UnauthorizedDistributionError,
  CommissionFrozenDiscrepancyError,
  ImmutableCommercialSnapshotError,
  type CommissionPayoutAuditResult,
  auditCommissionPayout,
  getCommissionPayoutAmount,
  resolveOfferVersionCommissionRates,
  calculateAndPersistCascadingCommission,
  consolidateCommercialProposalSnapshot,
};
import {
  validateCommissionPayoutPrerequisites,
  validateBeneficiaryPayoutDocuments,
  type BeneficiaryPayoutValidationResult,
  type CommissionPayoutValidationResult,
} from "./commissionDocumentValidationService";

export {
  validateCommissionPayoutPrerequisites,
  validateBeneficiaryPayoutDocuments,
  type BeneficiaryPayoutValidationResult,
  type CommissionPayoutValidationResult,
};
import { commercialConfigService } from "./commercialConfigService";
import { commercialTermsService } from "./commercialTermsService";

import {
  commercialAuthorizationService,
  type ClientAuthorizationResult,
  type ClientAccessScope,
} from "./commercialAuthorizationService";
import { commercialOpportunityService } from "./commercialOpportunityService";
import { commercialHelpService } from "./commercialHelpService";
import { registerBrokerNetworkTransitionRoutes } from "./brokerNetworkTransitionRoutes";
import { registerCommercialResourceRoutes } from "./commercialResourcesRoutes";
import { registerCampaignAcquisitionRoutes } from "./campaignAcquisitionRoutes";
import { createBrokerWithOrganization } from "./brokerNetworkTransitionService";
import { dispatchBrokerInvitation, BrokerInvitationError, validateInvitationTransport } from "./brokerInvitationDispatch";
import { resolveOptionalInvitationPromo } from "./invitationWelcomePromo";
import { changeUserBenefit, userBenefitHistory, BenefitError } from "./promoBenefitManagement";
import { parseBrokerInvitationExcel, generateBrokerInvitationExcelTemplate } from "./brokerInvitationBulk";


import { z } from "zod";
import multer from "multer";
import path from "path";
import fs from "fs";
import cron from "node-cron";
import { 
  tenantContextMiddleware, 
  requireTenantContext, 
  requireTenantMembership, 
  requireTenantRole,
  resolveTenantFromParam,
  resolveTenantFromQuery
} from "./middleware/tenantContext";
import {
  requireModule,
  requireAction,
  requireModuleAndAction,
  requireAnyModule,
  requireAnyAction,
  requireRole,
  getEffectivePermissions
} from "./middleware/rbacMiddleware";
import {
  validateTenantMemberPermissions,
  checkTransactionalCreationAllowed,
  validateCommercialOrigination,
  validateEffectiveBrokerFormalization,
  validateCommercialOriginationAndFormalization
} from "./tenantPermissions";

// Ensure upload directory exists
if (!fs.existsSync('uploads')) {
  try {
    fs.mkdirSync('uploads', { recursive: true });
  } catch (err) {
    console.error("Error creating uploads directory:", err);
  }
}

// Multer configuration for file uploads
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf|doc|docx/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos de imagen y documentos'));
    }
  }
});

// WebSocket clients
const wsClients = new Map<string, WebSocket>();

// Broadcast notification to user
function broadcastToUser(userId: string, notification: any) {
  const client = wsClients.get(userId);
  if (client && client.readyState === WebSocket.OPEN) {
    client.send(JSON.stringify(notification));
  }
}

const SUPPORTED_COMMISSION_TYPES = ["apertura", "sobretasa", "renovacion"] as const;

function parseCommissionRate(value: unknown): number {
  const parsed = parseFloat(String(value ?? "0"));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export async function createCascadingCommissionRecord(
  arg1: any,
  institutionArg?: any,
  amountArg?: string | number,
  commTypeArg?: string
): Promise<any> {
  let commissionInput: CascadingCommissionInput;

  if (arg1 && typeof arg1 === "object" && "creditId" in arg1) {
    // REGLA 1 (COM-21): Eliminar fallbacks a approvedAmount o montos no verificados
    const rawAmount = arg1.confirmedDisbursedAmount !== undefined && arg1.confirmedDisbursedAmount !== null
      ? parseFloat(String(arg1.confirmedDisbursedAmount))
      : (arg1.dispersedAmount !== undefined && arg1.dispersedAmount !== null
          ? parseFloat(String(arg1.dispersedAmount))
          : undefined);

    if (rawAmount === undefined || isNaN(rawAmount) || rawAmount <= 0) {
      throw new UnconfirmedDispersalAmountError(
        "[COM-21] Cálculo de comisiones bloqueado: Se requiere un monto de dispersión confirmado verificable en servidor. Fallback a approvedAmount o montos no confirmados eliminado."
      );
    }

    commissionInput = {
      creditId: arg1.creditId,
      brokerId: arg1.brokerId,
      masterBrokerId: arg1.masterBrokerId,
      commissionType: arg1.commissionType || "apertura",
      dispersedAmount: rawAmount,
      confirmedDisbursedAmount: rawAmount,
      financialInstitutionId: arg1.financialInstitutionId || null,
      institutionProductId: arg1.institutionProductId || arg1.offerId || null,
      versionNumber: arg1.versionNumber || null,
      financieraRate: arg1.financieraRate,
      masterBrokerRate: arg1.masterBrokerRate,
      brokerRate: arg1.brokerRate,
      isMasterDirect: arg1.isMasterDirect,
      performedBy: arg1.performedBy,
      idempotencyKey: arg1.idempotencyKey,
      dispersalIndex: arg1.dispersalIndex,
      strictRateCheck: true,
    };
  } else {
    const credit = arg1;
    const institution = institutionArg;
    const rawAmount = amountArg !== undefined && amountArg !== null
      ? parseFloat(String(amountArg))
      : undefined;

    if (rawAmount === undefined || isNaN(rawAmount) || rawAmount <= 0) {
      throw new UnconfirmedDispersalAmountError(
        "[COM-21] Cálculo de comisiones bloqueado: Se requiere un monto de dispersión confirmado verificable en servidor."
      );
    }

    const commType = commTypeArg || "apertura";

    const masterBrokerId = credit?.originMasterBrokerId !== undefined
      ? credit.originMasterBrokerId
      : ((credit?.finalProposal as any)?.originMasterBrokerId ?? undefined);
    const isMasterDirect = Boolean(
      masterBrokerId && credit?.brokerId && String(masterBrokerId) === String(credit.brokerId)
    );

    commissionInput = {
      creditId: credit?.id,
      brokerId: credit?.brokerId,
      masterBrokerId,
      commissionType: commType,
      dispersedAmount: rawAmount,
      confirmedDisbursedAmount: rawAmount,
      financialInstitutionId: credit?.financialInstitutionId || (institution as any)?.id || null,
      institutionProductId: credit?.institutionProductId || (credit?.finalProposal as any)?.institutionProductId || (credit?.finalProposal as any)?.offerId || null,
      versionNumber: (credit?.finalProposal as any)?.versionNumber || null,
      financieraRate: undefined,
      masterBrokerRate: undefined,
      brokerRate: undefined,
      isMasterDirect,
      strictRateCheck: true,
    };
  }

  const commission = await calculateAndPersistCascadingCommission(commissionInput);

  const brokerAmount = parseFloat(commission.brokerShare || "0");
  const masterBrokerAmount = parseFloat(commission.masterBrokerShare || "0");
  const appAmount = parseFloat(commission.appShare || "0");
  const totalGrossAmount = parseFloat(commission.amount || "0");
  const commType = commission.commissionType || "apertura";

  if (brokerAmount > 0) {
    try {
      await storage.createNotification({
        userId: commission.brokerId,
        type: 'commission_paid',
        title: 'Nueva comisión generada (Por Aprobar)',
        message: `Se ha generado tu comisión de ${commType} por $${brokerAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN en estatus 'Por Aprobar'.`,
        relatedEntityType: 'commission',
        relatedEntityId: commission.id,
      });
      broadcastToUser(commission.brokerId, {
        type: 'commission_update',
        commissionId: commission.id,
        status: commission.status || 'generated',
        amount: brokerAmount,
      });
    } catch (notifErr) {
      console.warn('[Commission] Broker notification error:', notifErr);
    }
  }

  if (commission.masterBrokerId && (masterBrokerAmount > 0 || brokerAmount > 0)) {
    try {
      await storage.createNotification({
        userId: commission.masterBrokerId,
        type: 'commission_paid',
        title: 'Nueva comisión de red generada',
        message: `Se ha generado una comisión de red de ${commType}: $${masterBrokerAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN de ganancia neta para tu red.`,
        relatedEntityType: 'commission',
        relatedEntityId: commission.id,
      });
      broadcastToUser(commission.masterBrokerId, {
        type: 'commission_update',
        commissionId: commission.id,
        status: commission.status || 'generated',
        amount: masterBrokerAmount,
      });
    } catch (notifErr) {
      console.warn('[Commission] Master Broker notification error:', notifErr);
    }
  }

  if (appAmount > 0 || totalGrossAmount > 0) {
    try {
      const allUsers = await storage.getAllUsers();
      const superAdminUser = allUsers.find(u => u.role === 'super_admin');
      if (superAdminUser) {
        await storage.createNotification({
          userId: superAdminUser.id,
          type: 'commission_paid',
          title: 'Comisión de Plataforma Generada',
          message: `Se ha registrado una comisión para Crédito Negocios por $${appAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN de ganancia neta (Total financiera: $${totalGrossAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN).`,
          relatedEntityType: 'commission',
          relatedEntityId: commission.id,
        });
        broadcastToUser(superAdminUser.id, {
          type: 'commission_update',
          commissionId: commission.id,
          status: commission.status || 'generated',
          amount: appAmount,
        });
      }
    } catch (notifErr) {
      console.warn('[Commission] Super Admin notification error:', notifErr);
    }
  }

  return commission;
}

/**
 * REGLA 3 (FASE 2B.2A.1 / OPE-09 / PAG-05): Helper canónico para verificar si un crédito
 * cuenta con confirmación expresa de desembolso emitida exclusivamente por Super Admin.
 */
export function isCreditDisbursementConfirmed(credit: any): boolean {
  if (!credit) return false;
  const prop = (credit.finalProposal as any) || {};
  return (
    prop.disbursementStatus === 'confirmed' ||
    (credit as any).disbursementStatus === 'confirmed' ||
    prop.disbursementConfirmation?.status === 'confirmed'
  );
}

async function ensureCommissionRecord(params: {
  creditId: string;
  brokerId: string;
  masterBrokerId?: string | null;
  commissionType: string;
  amount: number;
  recipient: "broker" | "master_broker" | "super_admin" | "plataforma";
}): Promise<boolean> {
  const { creditId, brokerId, masterBrokerId, commissionType, amount, recipient } = params;
  const safeAmount = Number.isFinite(amount) && amount >= 0 ? amount : 0;

  const existing = await storage.getCommissions({ brokerId });
  const isDuplicate = existing.some((c) => {
    if (c.creditId !== creditId || c.commissionType !== commissionType) {
      return false;
    }

    if (recipient === "broker") {
      return c.brokerId === brokerId && c.brokerShare !== null && c.brokerShare !== undefined && parseFloat(c.brokerShare) > 0;
    }

    if (recipient === "master_broker") {
      return c.masterBrokerId === masterBrokerId && c.masterBrokerShare !== null && c.masterBrokerShare !== undefined && parseFloat(c.masterBrokerShare) > 0;
    }

    if (recipient === "super_admin" || recipient === "plataforma") {
      return c.appShare !== null && c.appShare !== undefined && parseFloat(c.appShare) > 0;
    }

    return false;
  });

  if (isDuplicate) {
    return false;
  }

  const commission = await storage.createCommission({
    creditId,
    brokerId,
    masterBrokerId: masterBrokerId || null,
    amount: safeAmount.toFixed(2),
    brokerShare: recipient === "broker" ? safeAmount.toFixed(2) : "0.00",
    masterBrokerShare: recipient === "master_broker" ? safeAmount.toFixed(2) : "0.00",
    appShare: (recipient === "super_admin" || recipient === "plataforma") ? safeAmount.toFixed(2) : "0.00",
    status: "pending",
    commissionType,
  });

  return true;
}

// SEC-P0-02: Tenant membership, tenant slug and a Broker's current Master
// are not evidence of ownership of a historical financial operation.
// This legacy helper now permits only the persisted originating Broker or
// platform administrators. Credit-level historical read access is evaluated
// separately against immutable originMasterBrokerId.
async function authorizeTenantOrBrokerResource(params: {
  currentUserId: string;
  resourceBrokerId: string;
  resourceTenantId?: string | null;
  currentUserRole?: string;
  tenantContext?: any;
}): Promise<{ authorized: boolean; reason?: string }> {
  const authorized = canEditCreditByOrigin(
    { id: params.currentUserId, role: params.currentUserRole },
    { brokerId: params.resourceBrokerId }
  );
  return authorized
    ? { authorized: true }
    : { authorized: false, reason: "Access denied: resource owner required." };
}

async function authorizeBrokerResource(params: {
  currentUserId: string;
  resourceBrokerId: string;
  resourceTenantId?: string | null;
  currentUserRole?: string;
  tenantContext?: any;
}): Promise<{ authorized: boolean; reason?: string }> {
  return authorizeTenantOrBrokerResource(params);
}

// Helper to check if user can access a client with decoupled commercial governance scopes
async function authorizeClientAccess(
  userId: string,
  userRole: string,
  clientId: string,
  tenantContext?: any
): Promise<ClientAuthorizationResult> {
  return await commercialAuthorizationService.authorizeClientAccess({
    userId,
    userRole,
    clientId,
    tenantContext,
  });
}

/**
 * PRE-P0: resolve an existing client against the caller's commercial and
 * tenant scope BEFORE creating a new credit/submission/linked mortgage lead.
 *
 * Origination and Broker formalization are necessary but not sufficient:
 * knowing another client's UUID must never be a write capability.
 * Administrative platform operations are intentionally allowed in their
 * own name; delegated origination also checks the effective Broker's link.
 */
async function validateClientOriginationAccess(params: {
  clientId: unknown;
  callerUser: any;
  effectiveBrokerId: string | null | undefined;
  tenantContext?: any;
}): Promise<{ allowed: boolean; statusCode?: number; code?: string; message?: string }> {
  const { clientId, callerUser, effectiveBrokerId, tenantContext } = params;
  if (typeof clientId !== "string" || !clientId.trim()) {
    return { allowed: false, statusCode: 400, code: "CLIENT_ID_REQUIRED", message: "Debes seleccionar un cliente válido." };
  }
  const client = await storage.getClient(clientId);
  if (!client) {
    return { allowed: false, statusCode: 404, code: "CLIENT_NOT_FOUND", message: "Cliente no encontrado." };
  }
  if (!callerUser?.id || !effectiveBrokerId) {
    return { allowed: false, statusCode: 403, code: "CLIENT_ORIGINATION_NOT_AUTHORIZED", message: "Originador no autorizado." };
  }

  const isPlatformAdmin = callerUser.role === "super_admin" || callerUser.role === "admin";
  if (!isPlatformAdmin) {
    const access = await authorizeClientAccess(callerUser.id, callerUser.role, clientId, tenantContext);
    if (!access.authorized || !access.capabilities.canViewBasicProfile) {
      return { allowed: false, statusCode: 403, code: "CLIENT_ORIGINATION_NOT_AUTHORIZED", message: "No puedes originar operaciones para este cliente." };
    }
  }

  // A delegated Broker must have its own legitimate link to the client; an
  // admin's or a Master's broad visibility alone cannot invent origination.
  if (effectiveBrokerId !== callerUser.id) {
    const effectiveBroker = await storage.getUser(effectiveBrokerId);
    if (!effectiveBroker) {
      return { allowed: false, statusCode: 403, code: "CLIENT_ORIGINATION_NOT_AUTHORIZED", message: "Originador no válido." };
    }
    if (effectiveBroker.role === "broker" || effectiveBroker.role === "master_broker") {
      const brokerAccess = await authorizeClientAccess(
        effectiveBroker.id, effectiveBroker.role, clientId
      );
      if (!brokerAccess.authorized || !brokerAccess.capabilities.canViewBasicProfile) {
        return { allowed: false, statusCode: 403, code: "CLIENT_ORIGINATION_NOT_AUTHORIZED", message: "El Broker originador no tiene vínculo comercial con este cliente." };
      }
    }
  }
  return { allowed: true };
}

/**
 * SEC-P0: validate both a document's client and credit destination before
 * storing or reassigning a file. A supplied UUID never grants write access.
 * Keep a historical originating Broker's own client upload available, while
 * Master's oversight-only and unrelated Broker access remain read-only.
 */
async function validateDocumentWriteDestination(params: {
  userId: string;
  userRole: string;
  tenantContext?: any;
  clientId?: string | null;
  creditId?: string | null;
}): Promise<{ allowed: boolean; statusCode?: number; code?: string; message?: string;
  client?: any; credit?: any }> {
  const { userId, userRole, tenantContext, clientId, creditId } = params;
  let credit: any = null;
  if (creditId) {
    const access = await authorizeCreditAccess(userId, userRole, creditId, tenantContext, "write");
    if (!access.authorized || !access.credit) {
      return { allowed: false, statusCode: access.reason === "Credit not found" ? 404 : 403,
        code: "DOCUMENT_CREDIT_NOT_AUTHORIZED", message: "No tienes acceso al crédito indicado." };
    }
    credit = access.credit;
  }
  if (clientId && credit && credit.clientId !== clientId) {
    return { allowed: false, statusCode: 409, code: "DOCUMENT_CLIENT_CREDIT_MISMATCH",
      message: "El crédito no pertenece al cliente seleccionado." };
  }
  const effectiveClientId = clientId || credit?.clientId;
  if (!effectiveClientId) return { allowed: true, credit };
  const auth = await authorizeClientAccess(userId, userRole, effectiveClientId, tenantContext);
  if (!auth.authorized || !auth.client) {
    return { allowed: false, statusCode: auth.reason === "Client not found" ? 404 : 403,
      code: "DOCUMENT_CLIENT_NOT_AUTHORIZED", message: "No tienes acceso al expediente del cliente." };
  }
  const historicalOwner = auth.scope === "historical_scoped" && auth.client.brokerId === userId;
  if (!auth.capabilities.canUploadDocuments && !historicalOwner) {
    return { allowed: false, statusCode: 403, code: "DOCUMENT_CLIENT_NOT_AUTHORIZED",
      message: "Este nivel de acceso no permite agregar documentos al expediente." };
  }
  return { allowed: true, client: auth.client, credit };
}

// Helper to check if user can access a credit
async function authorizeCreditAccess(
  userId: string,
  userRole: string,
  creditId: string,
  _tenantContext?: any,
  mode: "read" | "write" = "read"
): Promise<{ authorized: boolean; credit?: any; reason?: string }> {
  const credit = await storage.getCredit(creditId);
  if (!credit) {
    return { authorized: false, reason: "Credit not found" };
  }
  const principal = { id: userId, role: userRole };
  // Historical Master can READ records originated under that Master but
  // cannot EDIT an operation directly owned by its originating Broker.
  // A later Master never acquires old access through network membership.
  const authorized = mode === "write"
    ? canEditCreditByOrigin(principal, credit)
    : canViewCreditByOrigin(principal, credit);
  return {
    authorized,
    credit,
    ...(!authorized ? { reason: "Access denied: credit origin scope required." } : {}),
  };
}

// SEC-P0-03: A client's current network is NOT proof of document ownership.
// For credit-attached documents enforce immutable credit origin; for unlinked
// documents admit only their persisted creator/uploader. This helper protects
// both direct download/file routes and list endpoints.
async function authorizeDocumentAccess(
  userId: string,
  userRole: string,
  documentId: string,
  tenantContext?: any
): Promise<{ authorized: boolean; document?: any; reason?: string }> {
  const document = await storage.getDocument(documentId);
  if (!document) return { authorized: false, reason: "Document not found" };
  if (userRole === "admin" || userRole === "super_admin") {
    return { authorized: true, document };
  }

  const principal = { id: userId, role: userRole };
  if (document.creditId) {
    const credit = await storage.getCredit(document.creditId);
    // The immutable origin of a credit is sufficient to read its linked
    // document, even after its Broker left the historical Master's network.
    // Current client ownership must never override that provenance.
    if (!canReadDocumentByOrigin(principal, document, credit)) {
      return { authorized: false, document, reason: "Document credit origin not accessible" };
    }
    return { authorized: true, document };
  }

  if (document.clientId) {
    const clientScope = await authorizeClientAccess(userId, userRole, document.clientId, tenantContext);
    if (!clientScope.authorized) {
      return { authorized: false, document, reason: "Client not accessible" };
    }
  }

  // No reliable historical Master attribution exists for unlinked files.
  if (canReadDocumentByOrigin(principal, document)) {
    return { authorized: true, document };
  }
  return { authorized: false, document, reason: "Document owner required" };
}

// Helper function to resolve product template with cascading fallbacks (#6)
async function resolveProductTemplate(productTemplateId?: string | null, fallbackPurpose?: string | null) {
  let productTemplate = null;
  if (productTemplateId) {
    productTemplate = await storage.getProductTemplate(productTemplateId);
    if (!productTemplate) {
      const instProd = await storage.getInstitutionProduct(productTemplateId);
      if (instProd) {
        if (instProd.templateId) {
          productTemplate = await storage.getProductTemplate(instProd.templateId);
        }
        if (!productTemplate && instProd.customName) {
          productTemplate = { id: instProd.id, name: instProd.customName } as any;
        }
      }
    }
  }
  if (!productTemplate && fallbackPurpose) {
    productTemplate = { id: 'default', name: fallbackPurpose } as any;
  }
  if (!productTemplate) {
    productTemplate = { id: 'default', name: 'Crédito Empresarial' } as any;
  }
  return productTemplate;
}

/**
 * ASTRA-01: Authorization for one concrete submission, NOT a general client or
 * shared-tenant membership. Moving a Broker to another Master never gives the
 * new network access to operations historically originated for the old Master.
 */
function canReadCreditSubmission(user: any, submission: any): boolean {
  return canViewSubmissionByOrigin(user, submission);
}

/** ASTRA-02: positive projections prevent password/CLABE and internal margins escaping. */
function projectSubmissionPerson(person: any) {
  if (!person) return null;
  return {
    id: person.id,
    firstName: person.firstName,
    lastName: person.lastName,
    email: person.email,
    role: person.role,
    brandName: person.brandName || null,
    isActive: person.isActive,
  };
}

/**
 * COM-28 shared financial gate: newly created credits and winner/dispersal
 * routes must not bypass the versioned economic acceptance. Superseded
 * snapshots remain historical (no retroactive acceptance).
 */
async function checkOfferCommissionAcceptanceForNewOperation(args: {
  offerId: unknown;
  versionNumber: unknown;
  brokerId: string | null | undefined;
  originMasterBrokerId?: string | null;
  snapshotRecordedAt?: string | Date | null;
}): Promise<{ code: string; message: string; offerId?: string; versionNumber?: number; pendingFor?: string } | null> {
  if (!args.offerId && args.versionNumber == null) return null; // legacy unversioned operation
  if (typeof args.offerId !== "string" || !args.offerId.trim() ||
      !Number.isSafeInteger(Number(args.versionNumber)) || Number(args.versionNumber) <= 0) {
    return { code: "OFFER_VERSION_IDENTITY_INCOMPLETE", message: "Falta una identidad válida de oferta y versión." };
  }
  const offerId = args.offerId;
  const versionNumber = Number(args.versionNumber);
  const product = await storage.getInstitutionProduct(offerId);
  if (!product) return { code: "OFFER_NOT_FOUND", message: "La oferta económica ya no existe." };
  const versions = await storage.getInstitutionProductVersions(offerId);
  const chosen = versions.find(v => v.versionNumber === versionNumber);
  if (!chosen || !["published", "superseded"].includes(chosen.status)) {
    return { code: "OFFER_VERSION_NOT_PUBLISHED", message: "La versión económica no está publicada." };
  }
  if (chosen.status === "superseded") {
    // Only a quote/proposal evidenced BEFORE this version was superseded
    // qualifies for grandfathering. A newly submitted direct credit must not
    // pick old economics simply to bypass a new acceptance requirement.
    if (isQuoteHistoricallyFrozen(chosen, args.snapshotRecordedAt)) {
      return null;
    }
    return { code: "OFFER_VERSION_SUPERSEDED_NEW_OPERATION",
      message: "Sólo se conservan las condiciones antiguas en propuestas con registro anterior verificable." };
  }
  if (!args.brokerId) return { code: "MISSING_ORIGIN_BROKER", message: "Sin Broker originador para aceptar condiciones." };
  const primary = await storage.getUser(args.brokerId);
  if (!primary) return { code: "OFFER_ACCEPTANCE_ORIGINATOR_UNAVAILABLE", message: "Originador no disponible." };
  if (primary.role === "broker" && primary.masterBrokerId && !args.originMasterBrokerId) {
    const parent = await storage.getUser(primary.masterBrokerId);
    if (!parent) return {
      code: "OFFER_MASTER_AFFILIATION_UNVERIFIED",
      message: "La afiliación comercial no pudo verificarse.",
    };
    if (parent.role === "master_broker") {
      // A missing historical Master cannot be silently replaced by the current
      // Master or classified as a directly paid Broker.
      return { code: "MISSING_ORIGIN_MASTER_FOR_OFFER",
        message: "La operación requiere una atribución histórica de Master verificable." };
    }
  }
  // CN pays Master for network operations; the network Broker has a separate
  // contractual acceptance with that Master. Never require the Broker to
  // accept wholesale network rates or approve the same money twice.
  const ids = args.originMasterBrokerId
    ? [args.originMasterBrokerId]
    : [args.brokerId];
  for (const userId of ids) {
    const responsibleUser = userId === primary.id ? primary : await storage.getUser(userId);
    if (!responsibleUser) {
      return { code: "OFFER_ACCEPTANCE_ORIGINATOR_UNAVAILABLE", message: "Beneficiario histórico no disponible." };
    }
    const status = await getOfferCommissionStatus(storage, responsibleUser, offerId, versionNumber);
    if (status.pending) {
      return {
        code: "OFFER_COMMISSION_ACCEPTANCE_REQUIRED",
        message: "Se requiere aceptar las condiciones económicas vigentes antes de avanzar con esta operación.",
        offerId, versionNumber,
        pendingFor: responsibleUser.role === "master_broker" ? "master_broker" : "broker",
      };
    }
  }
  return null;
}

/**
 * FIN-P0: Keep the exact published product/version from the institution's
 * offer. Never guess an offer from only financialInstitutionId and never
 * accept client-supplied commission allocation as a commercial authority.
 */
async function validateTargetOfferVersion(
  target: { financialInstitutionId: string; institutionProposal: unknown },
  proposal: Record<string, any>,
): Promise<Record<string, any>> {
  const incoming = readFrozenOfferLineage(proposal);
  const previous = readFrozenOfferLineage(target.institutionProposal);
  if (previous && (!incoming ||
      previous.institutionProductId !== incoming.institutionProductId ||
      previous.versionNumber !== incoming.versionNumber)) {
    throw new Error("OFFER_VERSION_IDENTITY_MISMATCH");
  }
  if (!incoming) {
    // Historical institution-only proposals remain READABLE. A NEW proposal
    // cannot omit the exact published offer/version after the institution has
    // an active published catalog; otherwise the commission gate is bypassed.
    const catalog = await storage.getInstitutionProducts();
    const hasPublished = catalog.some(p =>
      p.institutionId === target.financialInstitutionId &&
      p.status === "published" && p.isActive !== false);
    if (hasPublished) throw new Error("OFFER_VERSION_REQUIRED_FOR_PUBLISHED_INSTITUTION");
    return proposal; // Legacy institutions with no published catalog yet.
  }
  const product = await storage.getInstitutionProduct(incoming.institutionProductId);
  if (!product || product.institutionId !== target.financialInstitutionId) {
    throw new Error("OFFER_VERSION_INSTITUTION_MISMATCH");
  }
  const versions = await storage.getInstitutionProductVersions(incoming.institutionProductId);
  const version = versions.find(v => v.versionNumber === incoming.versionNumber);
  if (!version || (version.status !== "published" &&
      !(previous && version.status === "superseded"))) {
    throw new Error("OFFER_VERSION_NOT_PUBLISHED");
  }
  const conditions = (version.conditions || {}) as Record<string, unknown>;
  return {
    ...proposal,
    institutionProductId: incoming.institutionProductId,
    versionNumber: incoming.versionNumber,
    // Server-owned, version-specific rates: never take a rate map from the request.
    ...(conditions.commissionRates && typeof conditions.commissionRates === "object"
      ? { commissionRates: conditions.commissionRates } : {}),
  };
}

function projectSubmissionInstitution(institution: any) {
  if (!institution) return null;
  // Only contextual public information; use the official admin financial
  // endpoints for privileged institutional/commercial details.
  const keys = ["id", "name", "logoUrl", "category", "description", "isActive"];
  const safe: Record<string, any> = {};
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(institution, key)) safe[key] = institution[key];
  }
  return safe;
}

function projectSubmissionTarget(target: any, userRole?: string) {
  if (!target) return target;
  const { adminNotes, details, reviewedBy, institutionProposal, institution, ...publicFields } = target;
  const cleanProposal = institutionProposal && typeof institutionProposal === "object"
    ? { ...institutionProposal } : institutionProposal;
  if (cleanProposal && typeof cleanProposal === "object" && userRole !== "super_admin") {
    for (const key of ["commissionRates", "platformNet", "platformMargin",
       "platformGrossMargin", "internalNotes", "overRate", "sobretasa"]) {
      delete cleanProposal[key];
    }
  }
  return {
    ...publicFields,
    ...(userRole === "super_admin" || userRole === "admin"
      ? { adminNotes, details, reviewedBy } : {}),
    institutionProposal: cleanProposal,
    institution: projectSubmissionInstitution(institution),
  };
}

// SEC-P0-05: One shared projection for winner credits, lists, creation and
// updates; never serialize internal rate/margin/sobretasa data to intermediaries.
function projectSubmissionCredit(credit: any, userRole?: string) {
  return projectCreditForRole(credit, userRole);
}

// Helper function to enrich credit submission target with related data
async function enrichCreditSubmissionTarget(target: any) {
  const request = await storage.getCreditSubmissionRequest(target.requestId);
  if (!request) {
    return { ...target, request: null, broker: null, masterBroker: null, client: null, institution: null, productTemplate: null };
  }
  
  const broker = await storage.getUser(request.brokerId);
  const client = await storage.getClient(request.clientId);
  const institution = await storage.getFinancialInstitution(target.financialInstitutionId);
  
  let masterBroker = null;
  if (broker && broker.masterBrokerId) {
    masterBroker = await storage.getUser(broker.masterBrokerId);
  }
  
  const productTemplate = await resolveProductTemplate(request.productTemplateId, request.purpose);

  let targetCredit = target.creditId ? await storage.getCredit(target.creditId) : null;
  const targetProp = (targetCredit?.finalProposal as any) || (target.institutionProposal as any) || {};
  const isConfirmed = targetProp.disbursementStatus === 'confirmed' ||
    (targetCredit as any)?.disbursementStatus === 'confirmed' ||
    targetProp.disbursementConfirmation?.status === 'confirmed';
  const targetDisbursementStatus = isConfirmed
    ? 'confirmed'
    : ((target.status === 'dispersed' || targetProp.disbursementStatus === 'reported') ? 'reported' : 'unconfirmed');
  const targetConfirmedDisbursedAmount = targetProp.disbursementConfirmation?.confirmedAmount ??
    (targetCredit as any)?.confirmedDisbursedAmount ?? null;

  return {
    ...target,
    disbursementStatus: targetDisbursementStatus,
    isDisbursementConfirmed: isConfirmed,
    confirmedDisbursedAmount: targetConfirmedDisbursedAmount,
    request: {
      ...request,
      broker: projectSubmissionPerson(broker),
      client,
      productTemplate
    },
    broker: projectSubmissionPerson(broker),
    masterBroker: projectSubmissionPerson(masterBroker),
    client,
    institution: projectSubmissionInstitution(institution),
    productTemplate
  };
}

// Authorization helpers for multi-tenant operations
async function authorizeTenantAccess(params: {
  userId: string;
  tenantId: string;
  requireRole?: ('owner' | 'admin' | 'member')[];
  allowSuperAdmin?: boolean;
}): Promise<{ hasAccess: boolean; userRole?: string; membership?: any }> {
  const { userId, tenantId, requireRole = ['member'], allowSuperAdmin = true } = params;
  
  const user = await storage.getUser(userId);
  
  // Platform-level access
  if (allowSuperAdmin && (user?.role === 'super_admin' || user?.role === 'admin')) {
    return { hasAccess: true, userRole: user.role };
  }
  
  // Tenant membership access
  const membership = await storage.getUserTenantMembership(userId, tenantId);
  if (!membership || !membership.isActive) {
    return { hasAccess: false };
  }
  
  const hasRequiredRole = requireRole.includes(membership.role as any);
  return { 
    hasAccess: hasRequiredRole, 
    userRole: user?.role, 
    membership 
  };
}

async function requirePlatformRole(userId: string, allowedRoles: string[]): Promise<boolean> {
  if (!userId) return false;
  const user = await storage.getUser(userId);
  return user ? allowedRoles.includes(user.role) : false;
}

function sanitizeCommercialOffer(product: any, userRole?: string) {
  if (!product) return product;
  const { createdBy, ...commercialOffer } = product;

  // Preservar RBAC: Sanitizar comisiones individuales y condiciones económicas internas (B2.2 / B3 / B3.1)
  if (commercialOffer.configuration && typeof commercialOffer.configuration === "object") {
    const config = { ...commercialOffer.configuration };
    if (config.commissionRates && typeof config.commissionRates === "object") {
      const rawRates = config.commissionRates as Record<string, any>;
      if (userRole === "super_admin") {
        // EXCLUSIVO Super Admin (B3.1): Super Admin ve las condiciones económicas completas (incluyendo sobretasas internas)
        config.commissionRates = rawRates;
      } else if (userRole === "admin") {
        // Admin: ve comisiones comerciales pero NUNCA sobretasas internas
        const sanitized: Record<string, any> = JSON.parse(JSON.stringify(rawRates));
        if (sanitized.financiera) delete sanitized.financiera.sobretasa;
        if (sanitized.masterBroker) delete sanitized.masterBroker.sobretasa;
        if (sanitized.broker) delete sanitized.broker.sobretasa;
        if (sanitized.superAdmin) delete sanitized.superAdmin.sobretasa;
        delete sanitized.platformNet;
        delete sanitized.platformMargin;
        delete sanitized.channels;
        delete sanitized.internal;
        config.commissionRates = sanitized;
      } else if (userRole === "master_broker") {
        // Master Broker solo ve tiers masterBroker y broker, NUNCA financiera, superAdmin, platformNet, notas internas NI sobretasas
        const sanitized: Record<string, any> = {};
        if (rawRates.masterBroker) {
          const { sobretasa, ...cleanMb } = rawRates.masterBroker;
          sanitized.masterBroker = cleanMb;
        }
        if (rawRates.broker) {
          const { sobretasa, ...cleanBrk } = rawRates.broker;
          sanitized.broker = cleanBrk;
        }
        if (rawRates.type) sanitized.type = rawRates.type;
        config.commissionRates = sanitized;
      } else if (userRole === "broker") {
        // Broker directo solo ve su tier broker autorizado, NUNCA masterBroker, financiera, platformNet, notas internas NI sobretasas
        const sanitized: Record<string, any> = {};
        if (rawRates.broker) {
          const { sobretasa, ...cleanBrk } = rawRates.broker;
          sanitized.broker = cleanBrk;
        }
        if (rawRates.type) sanitized.type = rawRates.type;
        config.commissionRates = sanitized;
      } else {
        // Usuarios no comerciales o públicos: no exponer comisiones
        delete config.commissionRates;
      }
    }

    // Sobretasas exclusivas de Super Admin (B3.1): limpiar cualquier residuo en configuration si no es super_admin
    if (userRole !== "super_admin") {
      delete config.overrateCommissionRate;
      delete config.overRate;
      delete config.sobretasa;
      if (config.commissionRates) {
        if (config.commissionRates.financiera) delete config.commissionRates.financiera.sobretasa;
        if (config.commissionRates.masterBroker) delete config.commissionRates.masterBroker.sobretasa;
        if (config.commissionRates.broker) delete config.commissionRates.broker.sobretasa;
        if (config.commissionRates.superAdmin) delete config.commissionRates.superAdmin.sobretasa;
      }
    }

    commercialOffer.configuration = config;
  }

  // Sobretasas exclusivas de Super Admin (B3.1): limpiar de raíz en producto comercial
  if (userRole !== "super_admin") {
    delete commercialOffer.overrateCommissionRate;
    delete commercialOffer.overRate;
    delete commercialOffer.sobretasa;
  }

  return commercialOffer;
}

const COMMERCIAL_FINANCIAL_INSTITUTION_FIELDS = [
  "id",
  "name",
  "logoUrl",
  "category",
  "contactPerson",
  "email",
  "phone",
  "street",
  "number",
  "interior",
  "city",
  "postalCode",
  "state",
  "description",
  "additionalCosts",
  "requirements",
  "products",
  "acceptedProfiles",
  "applicationProcess",
  "estimatedTimeframes",
  "approvalTips",
  "requiredDocuments",
  "isActive",
  "createdAt",
  "updatedAt",
] as const;

function projectFinancialInstitutionByRole(institution: any, userRole: string, masterBrokerRates?: any): any {
  if (!institution) return institution;
  
  // EXCLUSIVO Super Admin (B3.1): Solo Super Admin ve sobretasas internas y configuración completa
  if (userRole === 'super_admin') {
    return institution;
  }

  // Admin tiene acceso administrativo pero NUNCA a sobretasas (B3.1: exclusivas de super_admin)
  if (userRole === 'admin') {
    const adminCopy: Record<string, any> = {};
    for (const key of COMMERCIAL_FINANCIAL_INSTITUTION_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(institution, key)) {
        adminCopy[key] = institution[key];
      }
    }
    // Admin may inspect network-facing rates but never platform margins,
    // internal notes, overrides or financial institution gross commission.
    if (institution.commissionRates && typeof institution.commissionRates === "object") {
      adminCopy.commissionRates = institution.commissionRates;
    }
    if (institution.brokerCommissionRate !== undefined) {
      adminCopy.brokerCommissionRate = institution.brokerCommissionRate;
    }
    if (institution.masterBrokerCommissionRate !== undefined) {
      adminCopy.masterBrokerCommissionRate = institution.masterBrokerCommissionRate;
    }
    // El rol Admin estándar no hereda acceso a margenes internos/sobretasas.
    delete adminCopy.commissionRate;
    delete adminCopy.openingCommissionRate;
    delete adminCopy.platformMargin;
    delete adminCopy.appShare;
    delete adminCopy.platformCommissionRate;
    delete adminCopy.overrateCommissionRate;
    delete adminCopy.overRate;
    delete adminCopy.sobretasa;
    if (adminCopy.commissionRates && typeof adminCopy.commissionRates === 'object') {
      const sanitized = JSON.parse(JSON.stringify(adminCopy.commissionRates));
      if (sanitized.financiera) delete sanitized.financiera.sobretasa;
      if (sanitized.masterBroker) delete sanitized.masterBroker.sobretasa;
      if (sanitized.broker) delete sanitized.broker.sobretasa;
      if (sanitized.superAdmin) delete sanitized.superAdmin.sobretasa;
      delete sanitized.financiera;
      delete sanitized.superAdmin;
      delete sanitized.platform;
      delete sanitized.app;
      delete sanitized.internal;
      delete sanitized.platformNet;
      delete sanitized.platformMargin;
      // Channel margins belong exclusively to Super Admin.
      delete sanitized.channels;
      adminCopy.commissionRates = sanitized;
    }
    return adminCopy;
  }

  // Explicit whitelist projection for non-administrative roles (no notes, createdBy, createdByAdmin)
  const projected: Record<string, any> = {};
  for (const field of COMMERCIAL_FINANCIAL_INSTITUTION_FIELDS) {
    if (field in institution) {
      projected[field] = institution[field];
    }
  }

  const rawRates = (institution.commissionRates as any) || {};

  if (userRole === 'master_broker') {
    // Master Broker only sees masterBroker and broker tiers, never internal platform / superAdmin commissions nor sobretasas
    const sanitizedRates: Record<string, any> = {};
    if (rawRates.masterBroker) {
      const { sobretasa, ...cleanMb } = rawRates.masterBroker;
      sanitizedRates.masterBroker = cleanMb;
    }
    if (rawRates.broker) {
      const { sobretasa, ...cleanBrk } = rawRates.broker;
      sanitizedRates.broker = cleanBrk;
    }
    projected.commissionRates = sanitizedRates;

    // Legacy fields: only expose commercial broker rates, never platform commissionRate / openingCommissionRate / overrateCommissionRate
    if (institution.masterBrokerCommissionRate !== undefined) {
      projected.masterBrokerCommissionRate = institution.masterBrokerCommissionRate;
    }
    if (institution.brokerCommissionRate !== undefined) {
      projected.brokerCommissionRate = institution.brokerCommissionRate;
    }
  } else {
    // Broker & other commercial roles: only broker commission rate, customized if assigned by Master Broker (no sobretasas)
    let brokerRate = rawRates.broker ? { ...rawRates.broker } : {};
    if (masterBrokerRates && masterBrokerRates[institution.id] && masterBrokerRates[institution.id].apertura !== undefined) {
      brokerRate = {
        ...brokerRate,
        apertura: masterBrokerRates[institution.id].apertura,
        renovacion: masterBrokerRates[institution.id].renovacion ?? brokerRate.renovacion,
      };
    }
    const { sobretasa, ...cleanBrokerRate } = brokerRate;
    projected.commissionRates = { broker: cleanBrokerRate };

    // Legacy fields: only brokerCommissionRate, never masterBrokerCommissionRate or platform commissionRate
    if (institution.brokerCommissionRate !== undefined) {
      projected.brokerCommissionRate = institution.brokerCommissionRate;
    }
  }

  // Sobretasas exclusivas de Super Admin (B3.1): limpiar de raíz cualquier sobretasa residual en institución proyectada
  delete projected.overrateCommissionRate;
  delete projected.overRate;
  delete projected.sobretasa;

  return projected;
}

const sanitizeFinancialInstitutionCommissions = projectFinancialInstitutionByRole;

// STP Payment simulation
async function processStpPayment(amount: string, accountNumber: string) {
  // Simulate STP payment processing (skip delay in tests)
  if (process.env.NODE_ENV !== 'test') {
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  const failureRate = Number.parseFloat(process.env.STP_SIMULATE_FAILURE_RATE || "0");
  const normalizedFailureRate = Number.isFinite(failureRate)
    ? Math.min(Math.max(failureRate, 0), 1)
    : 0;
  
  return {
    success: Math.random() > normalizedFailureRate,
    transactionId: `STP-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    amount,
    accountNumber,
    processedAt: new Date(),
  };
}

function getDocumentExtractedData() {
  // OCR extraction is intentionally disabled for now.
  return {};
}

export async function registerRoutes(app: Express): Promise<Server> {
  app.get('/api/health', async (_req, res) => {
    const strictHealth = process.env.HEALTHCHECK_STRICT === 'true';
    const healthQueryTimeoutMs = Number(process.env.HEALTHCHECK_DB_TIMEOUT_MS ?? '2500');

    try {
      const dbCheck = await Promise.race([
        pool.query('SELECT count(*) as user_count FROM public.users;'),
        new Promise<any>((_, reject) => {
          setTimeout(() => reject(new Error('database health query timeout')), healthQueryTimeoutMs);
        }),
      ]);

      const userCount = Number(dbCheck.rows[0]?.user_count ?? 0);
      let schemaReadiness;
      try {
        schemaReadiness=await checkPrelaunchSchemaReadiness(pool);
      } catch (schemaError) {
        console.error("[HEALTH] Prelaunch schema query failed:",schemaError);
        return res.status(503).json({
          status:"degraded",
          services:{api:"ok",database:"ok",usersTable:"ok",schema:"error"},
          timestamp:new Date().toISOString(),
        });
      }
      if(!schemaReadiness.ready){
        console.error("[HEALTH] Incomplete schema: missing column count",schemaReadiness.missingCount);
        return res.status(503).json({
          status:"degraded",
          services:{api:"ok",database:"ok",usersTable:"ok",schema:"error"},
          timestamp:new Date().toISOString(),
        });
      }
      res.json({
        status: 'ok',
        services: {
          api: 'ok',
          database: 'ok',
          usersTable: 'ok',
          schema: 'ok',
        },
        userCount,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(strictHealth ? 503 : 200).json({
        status: 'degraded',
        services: {
          api: 'ok',
          database: 'error',
        },
        error: error?.message || 'Unknown database error',
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Auth middleware
  await setupAuth(app);
  registerAdministrativeAudit(app);

  // Register legal routes after session/Passport initialization
  registerLegalRoutes(app);
  registerClientConsentPublicRoutes(app);

  // Tenant context middleware - must be after auth setup
  app.use(tenantContextMiddleware);

  // Super Admin-only broker network lifecycle routes.
  registerBrokerNetworkTransitionRoutes(app);

  // Platform-owned public-facing marketing catalogue and minimal suggestion intake.
  registerCommercialResourceRoutes(app);
  registerCampaignAcquisitionRoutes(app);

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || req.user?.id || (req as any).dbUser?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const memberships = await storage.getTenantMembersByUser(userId);
      // The authenticated account must never receive password hashes or reset bearer
      // tokens in its profile JSON; the SPA has no legitimate need for these.
      const safeUser: Record<string, unknown> = { ...user };
      delete safeUser.password;
      delete safeUser.resetToken;
      delete safeUser.resetTokenExpiry;
      const accessDay = new Intl.DateTimeFormat("sv-SE", {timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit"}).format(new Date());
      if (req.session && req.session.administrativeActivityDate !== accessDay) {
        req.session.administrativeActivityDate = accessDay;
        req.administrativeActor = user;
        req.administrativeAction = "session_access";
      }
      res.json({
        ...safeUser,
        memberships,
      });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Rate limiters for auth endpoints
  const isDevOrTest = process.env.NODE_ENV === "test" || process.env.USE_MEMORY_STORAGE === "true" || process.env.NODE_ENV === "development";
  const isStagingEnv = process.env.RAILWAY_ENVIRONMENT === "staging" || process.env.RAILWAY_PUBLIC_DOMAIN?.includes("staging") || process.env.BACKEND_URL?.includes("staging");
  const authLoginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: (isDevOrTest || isStagingEnv) ? 10000 : 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Demasiados intentos. Intenta de nuevo en 15 minutos." },
  });

  const authMutationLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: isDevOrTest ? 10000 : 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Demasiados intentos. Intenta de nuevo en 15 minutos." },
  });

  // Super Admin bulk Excel: one browser request per small chunk, never one
  // long-running request for 44+ provider email calls. Separate from auth rate limit.
  const bulkBrokerInvitationLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 24,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Demasiados lotes de invitaciones. Intenta nuevamente más adelante." },
  });

  const publicLeadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Demasiados intentos. Intenta de nuevo en 15 minutos." },
  });

  const brokerLeadSchema = z.object({
    name: z.string().min(2, "Nombre requerido"),
    email: z.string().email("Email inválido"),
    phone: z.string().min(8, "Teléfono inválido"),
    company: z.string().optional(),
    brokerProfile: z.enum(["pro", "referidor"]).default("pro"),
    brokerType: z.enum(["pyme", "pfae", "hipotecario", "mixto"]),
    message: z.string().max(1200, "Mensaje demasiado largo").optional(),
  });

  const websiteLeadSchema = z.object({
    name: z.string().min(2, "Nombre requerido"),
    email: z.string().email("Email inválido"),
    phone: z.string().min(8, "Teléfono inválido"),
    company: z.string().optional(),
    solutionType: z.string().min(2, "Tipo de solución requerido"),
    amountRange: z.string().min(2, "Monto aproximado requerido"),
    message: z.string().max(1200, "Mensaje demasiado largo").optional(),
  });

  app.post('/api/public/broker-leads', publicLeadLimiter, async (req, res) => {
    try {
      const data = brokerLeadSchema.parse(req.body);

      const emailResult = await sendBrokerLeadEmail(data);
      if (!emailResult.success) {
        return res.status(500).json({ message: emailResult.error || 'No se pudo enviar el correo' });
      }

      res.status(201).json({ message: 'Lead recibido correctamente' });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }

      console.error('Error creating broker lead:', error);
      res.status(500).json({ message: 'No se pudo procesar la solicitud' });
    }
  });

  app.post('/api/public/website-leads', publicLeadLimiter, async (req, res) => {
    try {
      const data = websiteLeadSchema.parse(req.body);

      const emailResult = await sendWebsiteLeadEmail(data);
      if (!emailResult.success) {
        return res.status(500).json({ message: emailResult.error || 'No se pudo enviar el correo' });
      }

      res.status(201).json({ message: 'Solicitud recibida correctamente' });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }

      console.error('Error creating website lead:', error);
      res.status(500).json({ message: 'No se pudo procesar la solicitud' });
    }
  });

  // Local authentication - Register
  const registerSchema = z.object({
    email: z.string().email("Email inválido"),
    password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
    firstName: z.string().min(1, "Nombre requerido"),
    lastName: z.string().min(1, "Apellido requerido"),
    referralCode: z.string().optional(), // Clave de Franquicia del Master Broker
    promoCode: z.string().optional(), // Código promocional (beneficio comercial)
    acceptTerms: z.literal(true, {
      errorMap: () => ({ message: "Debes aceptar los Términos y Condiciones para continuar." }),
    }),
    termsVersion: z.string({
      required_error: "La versión de Términos y Condiciones es requerida",
      invalid_type_error: "La versión de Términos y Condiciones es requerida",
    }),
    acknowledgePrivacy: z.literal(true, {
      errorMap: () => ({ message: "Debes confirmar que has leído el Aviso de Privacidad para continuar." }),
    }),
    privacyVersion: z.string({
      required_error: "La versión del Aviso de Privacidad es requerida",
      invalid_type_error: "La versión del Aviso de Privacidad es requerida",
    }),
  });

  app.post('/api/auth/register', authMutationLimiter, async (req: any, res) => {
    // Postlaunch: public visitor leads use /brokers; actual account creation is by invitation.
    // Enforce this at the API boundary; hiding the signup tab alone is not a security control.
    // Preserve the legacy flow only for existing isolated unit tests (never for live servers).
    if (process.env.NODE_ENV !== "test") {
      return res.status(403).json({
        message: "El registro de cuentas se realiza por invitación. Solicita acceso desde la página para Brokers.",
      });
    }
    try {
      const data = registerSchema.parse(req.body);

      // Validate legal confirmations and active versions
      const legalValidation = validateRegistrationAcceptance({
        acceptTerms: data.acceptTerms,
        termsVersion: data.termsVersion,
        acknowledgePrivacy: data.acknowledgePrivacy,
        privacyVersion: data.privacyVersion,
      });

      if (!legalValidation.valid || !legalValidation.termsDoc || !legalValidation.privacyDoc) {
        return res.status(400).json({ message: legalValidation.error || "Aceptación legal inválida." });
      }
      
      // Check if email already exists
      const existingUser = await storage.getUserByEmail(data.email);
      if (existingUser) {
        return res.status(400).json({ message: "Este email ya está registrado" });
      }

      // Link to Master Broker if franchise key is provided
      let masterBrokerId: string | undefined = undefined;
      if (data.referralCode && data.referralCode.trim()) {
        const cleanCode = data.referralCode.trim().toUpperCase();
        const allUsers = await storage.getAllUsers();
        const masterBroker = allUsers.find(
          u => u.referralCode && u.referralCode.toUpperCase() === cleanCode &&
            u.role === 'master_broker' && u.isActive !== false &&
            u.status !== 'suspended' && u.status !== 'inactive'
        );
        if (masterBroker) {
          masterBrokerId = masterBroker.id;
        } else {
          return res.status(400).json({ message: "La clave de franquicia ingresada no es válida." });
        }
      }

      // Validate promotional code if provided
      let validatedPromo: any = null;
      let targetAccessStatus = "free";
      let targetExpiresAt: Date | null = null;

      if (data.promoCode && data.promoCode.trim()) {
        const cleanPromo = data.promoCode.trim().toUpperCase();
        const promo = await storage.getPromoCodeByCode(cleanPromo);
        if (!promo || !promo.isActive) {
          return res.status(400).json({ message: "El código promocional no es válido o está inactivo." });
        }
        if (new Date(promo.startsAt) > new Date()) {
          return res.status(400).json({ message: "El código promocional aún no está vigente." });
        }
        if (promo.expiresAt && new Date(promo.expiresAt) < new Date()) {
          return res.status(400).json({ message: "El código promocional ha expirado." });
        }
        if (promo.maxUses !== null && promo.maxUses !== undefined && (promo.currentUses || 0) >= promo.maxUses) {
          return res.status(400).json({ message: "El código promocional ha alcanzado el límite máximo de usos." });
        }

        validatedPromo = promo;
        if (promo.benefitType === "permanent_free") {
          targetAccessStatus = "complimentary";
          targetExpiresAt = null;
        } else if (promo.benefitType === "free_months") {
          targetAccessStatus = "promotional";
          targetExpiresAt = new Date(Date.now() + (promo.durationMonths || 1) * 30 * 24 * 60 * 60 * 1000);
        } else if (promo.benefitType === "free") {
          targetAccessStatus = "free";
          targetExpiresAt = null;
        } else {
          targetAccessStatus = "promotional";
          targetExpiresAt = promo.durationMonths ? new Date(Date.now() + promo.durationMonths * 30 * 24 * 60 * 60 * 1000) : null;
        }
      }
      
      // Hash password
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(data.password, saltRounds);

      // Client IP captured via Express req.ip (honoring the real trust proxy configuration).
      // Never trust raw headers directly; allow null if no verifiable IP source is present.
      const rawIp = req.ip || req.socket?.remoteAddress;
      const clientIp = typeof rawIp === "string" && rawIp.trim().length > 0 ? rawIp.trim() : null;
      const userAgent = (req.headers["user-agent"] as string) || "unknown";

      // Create user and legal evidence atomically
      const { user } = await storage.registerUserWithLegalEvidence({
        userData: {
          email: data.email,
          password: hashedPassword,
          firstName: data.firstName,
          lastName: data.lastName,
          authMethod: "local",
          role: "broker", // Default role for new registrations
          masterBrokerId,
        },
        evidence: {
          ipAddress: clientIp,
          userAgent,
          termsDoc: {
            id: legalValidation.termsDoc.id,
            document: legalValidation.termsDoc.document,
            version: legalValidation.termsDoc.version,
            contentSha256: legalValidation.termsDoc.contentSha256,
          },
          privacyDoc: {
            id: legalValidation.privacyDoc.id,
            document: legalValidation.privacyDoc.document,
            version: legalValidation.privacyDoc.version,
            contentSha256: legalValidation.privacyDoc.contentSha256,
          },
        },
      });

      // Apply promotional redemption if promo was supplied
      if (validatedPromo) {
        try {
          await storage.createPromoRedemption({
            promoCodeId: validatedPromo.id,
            userId: user.id,
            tenantId: (user as any).tenantId || null,
            startsAt: new Date(),
            expiresAt: targetExpiresAt,
            status: "active",
            metadata: { registeredWithPromo: true, code: validatedPromo.code }
          });

          await storage.updateUserAccessStatus(
            user.id,
            targetAccessStatus,
            targetExpiresAt,
            `Canjeado al registrarse con código: ${validatedPromo.code}`,
            validatedPromo.id
          );
        } catch (promoErr) {
          console.error(`[PROMO] Failed to apply promo ${validatedPromo.code} for user ${user.id}:`, promoErr);
        }
      }

      // Send welcome email for local self-registration without blocking signup flow.
      try {
        const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || '';
        if (user.email) {
          const emailResult = await sendWelcomeEmail(user.email, fullName);
          if (!emailResult.success) {
            console.error(`[EMAIL] Welcome email failed for local signup ${user.email}: ${emailResult.error}`);
          }
        } else {
          console.error(`[EMAIL] Welcome email skipped for local signup because user has no email`);
        }
      } catch (emailError: any) {
        console.error(`[EMAIL] Unexpected welcome email error for ${user.email}:`, emailError?.message || emailError);
      }
      
      // Create session for the new user
      req.login({ claims: { sub: user.id } }, (err: any) => {
        if (err) {
          console.error("Error creating session:", err);
          return res.status(500).json({ message: "Error al iniciar sesión" });
        }
        
        // Explicitly save session to ensure it's written to the store before responding
        req.session.save((saveErr: any) => {
          if (saveErr) {
            console.error("Error saving session:", saveErr);
            return res.status(500).json({ message: "Error al iniciar sesión" });
          }
          req.administrativeActor = user;
          req.administrativeAction = "account_registered";
          res.status(201).json({ 
            message: "Registro exitoso",
            user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role }
          });
        });
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Error in registration:", error);
      res.status(500).json({ message: "Error al registrar usuario" });
    }
  });

  // Local authentication - Login
  const loginSchema = z.object({
    email: z.string().email("Email inválido"),
    password: z.string().min(1, "Contraseña requerida"),
  });

  app.post('/api/auth/login', authLoginLimiter, async (req: any, res) => {
    try {
      const data = loginSchema.parse(req.body);
      const normalizedEmail = data.email.trim().toLowerCase();
      
      // Find user by email
      const user = await storage.getUserByEmail(normalizedEmail);
      if (!user) {
        return res.status(401).json({ message: "Email o contraseña incorrectos" });
      }
      
      // Check if user is active
      if (!user.isActive || user.status === 'suspended' || user.status === 'inactive') {
        const message = user.status === 'suspended'
          ? "Tu cuenta se encuentra temporalmente suspendida. Contacta a soporte."
          : "Tu cuenta ha sido desactivada. Contacta al administrador.";
        return res.status(401).json({ message });
      }
      
      // Verify password strictly with cryptographic hash
      let isValidPassword = false;
      if (user.password) {
        isValidPassword = await bcrypt.compare(data.password, user.password);
      }

      if (!isValidPassword) {
        return res.status(401).json({ message: "Email o contraseña incorrectos" });
      }

      // Auto-migrate user from external/Replit auth to local auth only after successful credential verification
      if (user.authMethod !== "local") {
        await storage.updateUser(user.id, { authMethod: "local" });
        user.authMethod = "local";
      }
      
      // Create session
      req.login({ claims: { sub: user.id } }, (err: any) => {
        if (err) {
          console.error("Error creating session:", err);
          return res.status(500).json({ message: "Error al iniciar sesión" });
        }
        
        // Explicitly save session to ensure it's written to the store before responding
        req.session.save((saveErr: any) => {
          if (saveErr) {
            console.error("Error saving session:", saveErr);
            return res.status(500).json({ message: "Error al iniciar sesión" });
          }
          req.administrativeActor = user;
          req.administrativeAction = "login_success";
          res.json({ 
            message: "Login exitoso",
            user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role }
          });
        });
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Error in login:", error);
      res.status(500).json({ message: "Error al iniciar sesión" });
    }
  });

  // Forgot Password - Request reset token
  const forgotPasswordSchema = z.object({
    email: z.string().email("Email inválido").trim().toLowerCase(),
  });

  app.post('/api/auth/forgot-password', authMutationLimiter, async (req, res) => {
    try {
      const data = forgotPasswordSchema.parse(req.body);
      console.log(`[AUTH] Password reset requested for: ${data.email}`);
      
      // Find user by email
      const user = await storage.getUserByEmail(data.email);
      console.log(`[AUTH] User search result for ${data.email}: ${user ? 'Found' : 'Not Found'}`);
      
      // Always return success to prevent email enumeration attacks
      if (!user) {
        return res.json({ 
          message: "Si el email existe en nuestro sistema, recibirás un enlace para restablecer tu contraseña.",
        });
      }
      
      // Auto-migrate user to local auth if necessary
      if (user.authMethod !== "local") {
        await storage.updateUser(user.id, { authMethod: "local" });
        user.authMethod = "local";
      }
      
      // Generate secure token
      const crypto = await import('crypto');
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      
      // Save token to database
      await storage.setPasswordResetToken(user.id, resetToken, resetTokenExpiry);
      
      // Never log or expose reset bearer tokens in any environment.
      // sendPasswordResetEmail constructs the reset link directly.
      
      // Send password reset email
      const userName = user.firstName || undefined;
      console.log(`[AUTH] Attempting to send reset email to ${user.email}...`);
      const emailResult = user.email
        ? await sendPasswordResetEmail(user.email, resetToken, userName)
        : { success: false, error: 'User has no email' };
      
      if (!emailResult.success) {
        console.error('⚠️ [AUTH WARNING] Failed to deliver password reset email:');
        console.error('   - Target Email:', user.email);
        console.error('   - Error:', emailResult.error);
        // Avoid revealing password-reset links to runtime logs.

        if (process.env.NODE_ENV !== 'production') {
          return res.json({ 
            message: `Solicitud procesada, pero el servicio de correo (Resend) reportó: ${emailResult.error || 'No entregado'}.`,
            warning: "Revisa la configuración de Resend; no se puede mostrar un enlace de recuperación en la respuesta.",
          });
        }
      } else {
        console.log(`✅ [AUTH] Password reset email sent successfully to ${user.email}`);
      }
      
      res.json({ 
        message: "Si el email existe en nuestro sistema, recibirás un enlace para restablecer tu contraseña.",
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Error in forgot password:", error);
      res.status(500).json({ message: "Error al procesar la solicitud" });
    }
  });

  // Invitation context: token holder sees legal versions, no account secrets.
  app.get('/api/auth/invitation-context', authMutationLimiter, async (req, res) => {
    const token = typeof req.query.token === "string" ? req.query.token : "";
    if (!token || token.length > 256) return res.status(400).json({ message: "Token inválido." });
    const user = await storage.getUserByResetToken(token);
    if (!user || !user.resetTokenExpiry || new Date(user.resetTokenExpiry) <= new Date()) {
      return res.status(400).json({ message: "Enlace inválido o expirado." });
    }
    const needsLegal = !user.password;
    const termsDoc = needsLegal ? getPublishedLegalDocument("terminos") : null;
    const privacyDoc = needsLegal ? getPublishedLegalDocument("aviso") : null;
    if (needsLegal && (!termsDoc || !privacyDoc)) {
      return res.status(503).json({ message: "Documentos legales vigentes no disponibles." });
    }
    return res.json({
      requiresLegal: needsLegal,
      role: user.role === "master_broker" ? "master_broker" : "broker",
      termsVersion: termsDoc?.version || null,
      privacyVersion: privacyDoc?.version || null,
    });
  });

  // Password reset or first-time activation: strong password and separate legal evidence.
  const resetPasswordSchema = z.object({
    token: z.string().min(1, "Token requerido"),
    password: z.string().min(12, "La contraseña debe tener al menos 12 caracteres"),
    acceptTerms: z.boolean().optional(),
    termsVersion: z.string().optional(),
    acknowledgePrivacy: z.boolean().optional(),
    privacyVersion: z.string().optional(),
  });

  app.post('/api/auth/reset-password', async (req: any, res) => {
    try {
      const data = resetPasswordSchema.parse(req.body);
      
      // Find user by reset token
      const user = await storage.getUserByResetToken(data.token);
      
      if (!user) {
        return res.status(400).json({ message: "Token inválido o expirado" });
      }
      
      // Check if token has expired
      if (!user.resetTokenExpiry || new Date() > new Date(user.resetTokenExpiry)) {
        return res.status(400).json({ message: "El token ha expirado. Por favor solicita uno nuevo." });
      }
      
      const hashedPassword = await bcrypt.hash(data.password, 12);
      const wasInvitation = !user.password;
      if (wasInvitation) {
        const legal = validateRegistrationAcceptance({
          acceptTerms: data.acceptTerms,
          termsVersion: data.termsVersion,
          acknowledgePrivacy: data.acknowledgePrivacy,
          privacyVersion: data.privacyVersion,
        });
        if (!legal.valid || !legal.termsDoc || !legal.privacyDoc) {
          return res.status(400).json({ message: legal.error || "Aceptación legal requerida." });
        }
        const rawIp = req.ip || req.socket?.remoteAddress;
        await storage.completeInvitationActivation({
          userId: user.id, token: data.token, passwordHash: hashedPassword,
          ipAddress: typeof rawIp === "string" ? rawIp : null,
          userAgent: req.headers["user-agent"] || "unknown",
          termsDoc: {
            id: legal.termsDoc.id, document: legal.termsDoc.document,
            version: legal.termsDoc.version, contentSha256: legal.termsDoc.contentSha256,
          },
          privacyDoc: {
            id: legal.privacyDoc.id, document: legal.privacyDoc.document,
            version: legal.privacyDoc.version, contentSha256: legal.privacyDoc.contentSha256,
          },
        });
      } else {
        // Existing-account password recovery remains a separate route.
        await storage.updateUserPassword(user.id, hashedPassword);
        await storage.clearPasswordResetToken(user.id);
      }
      req.administrativeActor = user;
      req.administrativeAction = wasInvitation ? "invitation_registered" : "password_recovered";
      res.json({ message: "Contraseña actualizada exitosamente. Ya puedes iniciar sesión." });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Error in reset password:", error);
      res.status(500).json({ message: "Error al restablecer la contraseña" });
    }
  });

  // User profile update
  app.put('/api/users/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      
      // Users can only update their own profile (unless admin)
      const currentUser = await storage.getUser(userId);
      
      if (!currentUser) {
        return res.status(401).json({ message: "User not found" });
      }
      
      const isAdmin = currentUser.role === 'admin' || currentUser.role === 'super_admin';
      
      if (id !== userId && !isAdmin) {
        return res.status(403).json({ message: "Unauthorized to update this profile" });
      }
      
      const userData = req.body;
      let sanitizedData: any = {};
      
      if (!isAdmin) {
        // Non-admins can ONLY update personal profile and whitelisted branding/banking fields
        // Crucially: role, permissions, masterBrokerId, isActive, customRoleTitle, networkCommissionRates are BLOCKED
        const allowedFields = [
          'firstName', 'lastName', 'phone', 'profileImageUrl',
          'brandName', 'customLogo', 'primaryColor', 'secondaryColor',
          'isWhiteLabel', 'bankName', 'clabe', 'accountHolder',
          'commercialReferences', 'profileData'
        ];
        for (const key of allowedFields) {
          if (userData[key] !== undefined) {
            sanitizedData[key] = userData[key];
          }
        }
        if (userData.profileType !== undefined) {
          if (!["persona_moral", "fisica_empresarial", "fisica", "sin_sat"].includes(userData.profileType)) {
            return res.status(400).json({ message: "Tipo de perfil inválido." });
          }
          sanitizedData.profileType = userData.profileType;
        }
      } else {
        // Existing Admin profile UI stays functional, but cannot edit passwords,
        // recovery credentials or structural network/role assignments.
        const protectedAuthFields = ["password", "resetToken", "resetTokenExpiry"];
        if (protectedAuthFields.some((field) => Object.prototype.hasOwnProperty.call(userData || {}, field))) {
          return res.status(403).json({ message: "Las credenciales se administran sólo mediante autenticación segura." });
        }
        const targetUser = await storage.getUser(id);
        if (!targetUser) return res.status(404).json({ message: "Usuario no encontrado" });
        // Admin may manage permitted profiles, but cannot edit Super Admins
        // or promote anyone through the legacy profile endpoint.
        if (currentUser.role !== "super_admin" && targetUser.role === "super_admin") {
          return res.status(403).json({ message: "Sólo Super Admin puede editar cuentas Super Admin." });
        }
        if (currentUser.role !== "super_admin" &&
            userData.role !== undefined && userData.role !== targetUser.role) {
          return res.status(403).json({ message: "Sólo Super Admin puede cambiar roles administrativos." });
        }
        if (userData.masterBrokerId !== undefined && userData.masterBrokerId !== targetUser.masterBrokerId) {
          return res.status(409).json({ message: "Reasignación de Brokers requiere la transición autorizada de Super Admin." });
        }
        if (userData.role !== undefined && userData.role !== targetUser.role &&
            (["broker", "master_broker"].includes(targetUser.role) ||
             ["broker", "master_broker"].includes(userData.role))) {
          return res.status(409).json({ message: "Las promociones y cambios de red requieren transición autorizada." });
        }
        if (currentUser.role !== "super_admin" && userData.permissions !== undefined) {
          return res.status(403).json({ message: "Sólo Super Admin puede asignar permisos." });
        }
        sanitizedData = { ...userData };
        delete sanitizedData.password;
        delete sanitizedData.resetToken;
        delete sanitizedData.resetTokenExpiry;
        delete sanitizedData.masterBrokerId;
        if (["broker", "master_broker"].includes(targetUser.role)) delete sanitizedData.role;
      }
      
      // Proteger estado operativo contra modificaciones directas fuera de la lógica central
      // Commission schedules must only change through the versioned Master flow.
      delete sanitizedData.networkCommissionRates;
      delete sanitizedData.status;
      delete sanitizedData.isActive;
      delete sanitizedData.statusChangedAt;
      delete sanitizedData.statusChangedBy;
      delete sanitizedData.statusChangeReason;
      delete sanitizedData.statusChangeNotes;

      // Different Settings tabs modify independent profileData sections.
      // Preserve existing contact, business and metric fields rather than
      // silently wiping them when the user saves another tab.
      if (sanitizedData.profileData !== undefined) {
        if (!sanitizedData.profileData || typeof sanitizedData.profileData !== "object" ||
            Array.isArray(sanitizedData.profileData)) {
          return res.status(400).json({ message: "Datos del perfil inválidos." });
        }
        const existingUser = await storage.getUser(id);
        const existingProfile = existingUser?.profileData && typeof existingUser.profileData === "object" &&
          !Array.isArray(existingUser.profileData) ? existingUser.profileData : {};
        sanitizedData.profileData = { ...existingProfile, ...sanitizedData.profileData };
      }

      const user = await storage.updateUser(id, sanitizedData);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      res.json(publicUserForManagement(user));
    } catch (error) {
      console.error("Error updating user profile:", error);
      res.status(500).json({ message: "Failed to update user profile" });
    }
  });

  // Change Password
  const changePasswordSchema = z.object({
    currentPassword: z.string().min(1, "Contraseña actual requerida"),
    newPassword: z.string().min(6, "La nueva contraseña debe tener al menos 6 caracteres"),
  });

  app.post('/api/users/:id/change-password', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      
      if (id !== userId) {
        return res.status(403).json({ message: "No autorizado" });
      }
      
      const data = changePasswordSchema.parse(req.body);
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "Usuario no encontrado" });
      }
      
      // Verify current password
      const isMatch = await bcrypt.compare(data.currentPassword, user.password || "");
      if (!isMatch) {
        return res.status(400).json({ message: "La contraseña actual es incorrecta" });
      }
      
      // Hash new password
      const hashedPassword = await bcrypt.hash(data.newPassword, 10);
      await storage.updateUserPassword(userId, hashedPassword);
      
      res.json({ message: "Contraseña actualizada exitosamente" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Error in change password:", error);
      res.status(500).json({ message: "Error al cambiar la contraseña" });
    }
  });

  // Account deactivation request
  app.post('/api/users/:id/deactivation-request', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      
      // Users can only request deactivation for their own account
      if (id !== userId) {
        return res.status(403).json({ message: "Unauthorized to request deactivation for this account" });
      }
      
      const currentUser = await storage.getUser(userId);
      if (!currentUser) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Get all admins and super_admins to notify
      const allUsers = await storage.getAllUsers();
      const admins = allUsers.filter(u => u.role === 'admin' || u.role === 'super_admin');
      
      // Create notification for each admin
      const notificationPromises = admins.map(admin => 
        storage.createNotification({
          userId: admin.id,
          type: 'account_deactivation_request',
          title: 'Solicitud de Baja de Cuenta',
          message: `${currentUser.firstName} ${currentUser.lastName} (${currentUser.email}) ha solicitado dar de baja su cuenta.`,
          relatedEntityType: 'user',
          relatedEntityId: userId,
          metadata: {
            requestedBy: userId,
            requestedByName: `${currentUser.firstName} ${currentUser.lastName}`,
            requestedByEmail: currentUser.email,
            requestedAt: new Date().toISOString(),
          },
        })
      );
      
      await Promise.all(notificationPromises);

      if (currentUser.email) {
        const deactivationEmailResult = await sendBrokerDeactivationRequestEmail({
          firstName: currentUser.firstName,
          lastName: currentUser.lastName,
          email: currentUser.email,
          userId,
        });

        if (!deactivationEmailResult.success) {
          console.error('[EMAIL] Failed to send deactivation request email:', deactivationEmailResult.error);
        }
      } else {
        console.error('[EMAIL] Deactivation request email skipped: user has no email address');
      }
      
      res.json({ 
        success: true, 
        message: "Solicitud de baja enviada correctamente. Un administrador revisará tu solicitud." 
      });
    } catch (error) {
      console.error("Error creating deactivation request:", error);
      res.status(500).json({ message: "Failed to create deactivation request" });
    }
  });

  // ==========================================
  // BLOQUE 10: PROMO CODES & ACCESS STATUS API
  // ==========================================

  // Helper to resolve authenticated user ID
  const getAuthUserId = (req: any): string | undefined => {
    return req.user?.claims?.sub || req.user?.id || (req as any).dbUser?.id;
  };

  // Helper to check platform admin privileges
  const isPlatformAdmin = async (userId?: string): Promise<boolean> => {
    if (!userId) return false;
    const user = await storage.getUser(userId);
    return Boolean(user && (user.role === 'admin' || user.role === 'super_admin'));
  };

  // 1. Validate promo code (public/semi-public endpoint)
  app.post('/api/promos/validate', async (req: any, res) => {
    try {
      const { code } = validatePromoCodeSchema.parse(req.body);
      const cleanCode = code.trim().toUpperCase();

      const promo = await storage.getPromoCodeByCode(cleanCode);
      if (!promo || !promo.isActive) {
        return res.status(404).json({ valid: false, message: "Código promocional inválido o inactivo." });
      }

      const now = new Date();
      if (new Date(promo.startsAt) > now) {
        return res.status(400).json({ valid: false, message: "Este código promocional aún no está vigente." });
      }

      if (promo.expiresAt && new Date(promo.expiresAt) < now) {
        return res.status(400).json({ valid: false, message: "Este código promocional ha expirado." });
      }

      if (promo.maxUses !== null && promo.maxUses !== undefined && (promo.currentUses || 0) >= promo.maxUses) {
        return res.status(400).json({ valid: false, message: "Este código promocional ha alcanzado el límite de usos permitidos." });
      }

      res.json({
        valid: true,
        promo: {
          id: promo.id,
          code: promo.code,
          name: promo.name,
          description: promo.description,
          benefitType: promo.benefitType,
          benefitValue: promo.benefitValue,
          durationMonths: promo.durationMonths,
          targetScope: promo.targetScope,
          expiresAt: promo.expiresAt,
        }
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ valid: false, message: error.errors[0].message });
      }
      console.error("[PROMO VALIDATE] Error:", error);
      res.status(500).json({ valid: false, message: "Error al validar el código promocional." });
    }
  });

  // 2. Self-service redemption uses the same locked, audited PostgreSQL transition.
  app.post('/api/promos/redeem', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getAuthUserId(req);
      if (!userId) return res.status(401).json({ message: 'No autenticado.' });
      const { code } = redeemPromoCodeSchema.parse(req.body);
      const result = await changeUserBenefit({ action: 'redeem', actorId: userId, userId, code });
      res.json({ message: 'Código aplicado correctamente.', ...result });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: error.errors[0].message });
      if (error instanceof BenefitError) return res.status(error.status).json({ message: error.message });
      console.error('[PROMO REDEEM] Error:', error);
      res.status(500).json({ message: 'No se pudo aplicar el beneficio.' });
    }
  });

  // 3. User's active benefits & commercial access status
  app.get('/api/promos/my-benefits', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getAuthUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "No autenticado." });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "Usuario no encontrado." });
      }

      const active = await storage.getUserActiveRedemption(userId);
      const courtesyExpired = Boolean(active?.redemption.expiresAt &&
        new Date(active.redemption.expiresAt).getTime() <= Date.now());

      res.json({
        accessStatus: courtesyExpired ? "expired" : (user.accessStatus || "free"),
        accessStatusExpiresAt: user.accessStatusExpiresAt,
        accessStatusNotes: user.accessStatusNotes,
        activePromo: active ? {
          isExpired: courtesyExpired,
          id: active.promoCode.id,
          code: active.promoCode.code,
          name: active.promoCode.name,
          description: active.promoCode.description,
          benefitType: active.promoCode.benefitType,
          benefitValue: (active.redemption.metadata as any)?.benefitValue ?? active.promoCode.benefitValue,
          durationMonths: (active.redemption.metadata as any)?.durationMonths ?? active.promoCode.durationMonths,
          appliedAt: active.redemption.appliedAt,
          startsAt: active.redemption.startsAt,
          expiresAt: active.redemption.expiresAt,
        } : null,
        nonBlocking: true,
        message: "Acceso total sin bloqueos operativos para colocación de créditos y gestión de comisiones."
      });
    } catch (error) {
      console.error("[MY BENEFITS] Error:", error);
      res.status(500).json({ message: "Error al consultar beneficios." });
    }
  });

  // 4. Admin: List all promo codes with stats
  app.get('/api/admin/promos', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getAuthUserId(req);
      if (!(await isPlatformAdmin(userId))) {
        return res.status(403).json({ message: "Acceso denegado. Privilegios de administrador requeridos." });
      }

      const promos = await storage.getPromoCodes();
      res.json(promos);
    } catch (error) {
      console.error("[ADMIN PROMOS GET] Error:", error);
      res.status(500).json({ message: "Error al obtener códigos promocionales." });
    }
  });

  // 5. Admin: Create new promo code
  app.post('/api/admin/promos', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getAuthUserId(req);
      if (!(await isPlatformAdmin(userId))) {
        return res.status(403).json({ message: "Acceso denegado. Privilegios de administrador requeridos." });
      }

      const data = insertPromoCodeSchema.parse(req.body);
      const cleanCode = data.code.trim().toUpperCase();

      const existing = await storage.getPromoCodeByCode(cleanCode);
      if (existing) {
        return res.status(400).json({ message: `El código promocional "${cleanCode}" ya existe.` });
      }

      const newPromo = await storage.createPromoCode({
        ...data,
        code: cleanCode,
        createdBy: userId,
      });

      res.status(201).json(newPromo);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("[ADMIN PROMOS POST] Error:", error);
      res.status(500).json({ message: "Error al crear el código promocional." });
    }
  });

  // 6. Allow toggling a catalog code; never retroactively rewrite financial terms.
  app.patch('/api/admin/promos/:id', isAuthenticated, async (req: any, res) => {
    try {
      if (!(await isPlatformAdmin(getAuthUserId(req)))) return res.status(403).json({ message: 'No autorizado.' });
      const { isActive } = z.object({ isActive: z.boolean() }).strict().parse(req.body);
      const existing = await storage.getPromoCode(req.params.id);
      if (!existing) return res.status(404).json({ message: 'Cupón no encontrado.' });
      const updated = await storage.updatePromoCode(existing.id, { isActive });
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: 'Solo se permite activar o desactivar el código.' });
      console.error('[ADMIN PROMOS PATCH]', error);
      res.status(500).json({ message: 'No se pudo actualizar el catálogo.' });
    }
  });

  // 7. Admin: Get redemptions for a specific promo code
  app.get('/api/admin/promos/:id/redemptions', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getAuthUserId(req);
      if (!(await isPlatformAdmin(userId))) {
        return res.status(403).json({ message: "Acceso denegado. Privilegios de administrador requeridos." });
      }

      const { id } = req.params;
      const redemptions = await storage.getPromoRedemptions({ promoCodeId: id });
      
      const allUsers = await storage.getAllUsers();
      const userMap = new Map(allUsers.map(u => [u.id, u]));

      const enriched = redemptions.map(r => {
        const u = userMap.get(r.userId);
        return {
          ...r,
          user: u ? {
            id: u.id,
            email: u.email,
            firstName: u.firstName,
            lastName: u.lastName,
            role: u.role,
            accessStatus: u.accessStatus
          } : null
        };
      });

      res.json(enriched);
    } catch (error) {
      console.error("[ADMIN PROMO REDEMPTIONS] Error:", error);
      res.status(500).json({ message: "Error al consultar canjes." });
    }
  });

  // Manual individual administration is Super Admin only; no alternative billing engine.
  app.get('/api/admin/users/:id/benefits', isAuthenticated, async (req: any, res) => {
    try {
      const actorId = getAuthUserId(req);
      const actor = actorId ? await storage.getUser(actorId) : null;
      if (actor?.role !== 'super_admin') return res.status(403).json({ message: 'Solo Super Admin.' });
      const beneficiary = await storage.getUser(req.params.id);
      if (!beneficiary || !['broker','master_broker'].includes(beneficiary.role)) {
        return res.status(404).json({ message: 'Broker/Master no encontrado.' });
      }
      res.json(await userBenefitHistory(beneficiary.id));
    } catch (error) {
      console.error('[ADMIN BENEFIT HISTORY]', error);
      res.status(500).json({ message: 'No se pudo consultar historial.' });
    }
  });
  app.post('/api/admin/users/:id/benefits', isAuthenticated, async (req: any, res) => {
    try {
      const actorId = getAuthUserId(req);
      if (!actorId) return res.status(401).json({ message: 'No autenticado.' });
      const data = z.object({
        action: z.enum(['assign','replace','extend','revoke']),
        code: z.string().optional(),
        months: z.number().int().min(1).max(60).optional(),
        reason: z.string().trim().min(5).max(500),
      }).strict().parse(req.body);
      const result = await changeUserBenefit({ ...data, actorId, userId: req.params.id });
      res.json({ message: 'Beneficio actualizado y auditado.', ...result });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: error.errors[0].message });
      if (error instanceof BenefitError) return res.status(error.status).json({ message: error.message });
      console.error('[ADMIN BENEFIT CHANGE]', error);
      res.status(500).json({ message: 'No se pudo modificar el beneficio.' });
    }
  });

  // 8. Admin: Manually update user access status
  app.patch('/api/admin/users/:id/access-status', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getAuthUserId(req);
      if (!(await isPlatformAdmin(userId))) {
        return res.status(403).json({ message: "Acceso denegado. Privilegios de administrador requeridos." });
      }

      const targetUserId = req.params.id;
      const data = updateUserAccessStatusSchema.parse(req.body);

      const targetUser = await storage.getUser(targetUserId);
      if (!targetUser) {
        return res.status(404).json({ message: "Usuario no encontrado." });
      }

      if (['broker', 'master_broker'].includes(targetUser.role) &&
          (targetUser.activePromoId || ['promotional','complimentary'].includes(data.accessStatus))) {
        return res.status(409).json({ message: 'Administra la promoción desde Beneficios; no cambies el estado de acceso por separado.' });
      }
      const updated = await storage.updateUserAccessStatus(
        targetUserId,
        data.accessStatus,
        data.expiresAt,
        data.notes || `Modificado manualmente por admin`
      );

      res.json({
        message: "Estado de acceso actualizado correctamente.",
        user: {
          id: updated?.id,
          email: updated?.email,
          accessStatus: updated?.accessStatus,
          accessStatusExpiresAt: updated?.accessStatusExpiresAt,
          accessStatusNotes: updated?.accessStatusNotes
        }
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("[ADMIN ACCESS STATUS PATCH] Error:", error);
      res.status(500).json({ message: "Error al actualizar estado de acceso del usuario." });
    }
  });

  // =========================================================================
  // GOBERNANZA COMERCIAL: CONFIGURACIÓN CENTRAL DE PARÁMETROS (SUPER ADMIN)
  // =========================================================================

  // 1. Obtener configuración comercial vigente y defaults normativos
  app.get('/api/admin/commercial-config', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getAuthUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "No autenticado." });
      }
      const user = await storage.getUser(userId);
      if (!user || user.role !== 'super_admin') {
        return res.status(403).json({ message: "Acceso exclusivo para Super Admin." });
      }

      const config = await commercialConfigService.getConfig();
      res.json({
        config,
        defaults: DEFAULT_COMMERCIAL_RULES_CONFIG,
      });
    } catch (error: any) {
      console.error("[COMMERCIAL CONFIG GET] Error:", error);
      res.status(500).json({ message: "Error al consultar configuración de reglas comerciales." });
    }
  });

  // 2. Actualizar parámetros de gobernanza comercial con auditoría inmutable
  app.put('/api/admin/commercial-config', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getAuthUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "No autenticado." });
      }
      const user = await storage.getUser(userId);
      if (!user || user.role !== 'super_admin') {
        return res.status(403).json({ message: "Acceso exclusivo para Super Admin." });
      }

      const parsed = updateCommercialRulesConfigSchema.parse(req.body);
      const { reason, ...updates } = parsed;

      const current = await commercialConfigService.getConfig();
      const result = await commercialConfigService.updateConfig(updates, userId, reason);

      if (result.publishedVersion) {
        // PostgreSQL committed the new rule values, audit and legal version as
        // one ACID unit. Announce only AFTER COMMIT; never double-publish.
        await commercialTermsService.announceCommittedGlobalVersion(result.publishedVersion, storage);
      } else if (result.modifiedParams && result.modifiedParams.length > 0) {
        // In-memory storage is used only by deterministic unit tests.
        await commercialTermsService.publishGlobalCommercialTermsUpdate({
          previousConditions: current,
          newConditions: result.updatedConfig,
          modifiedParams: result.modifiedParams,
          updatedBy: userId,
          reason,
          targetStorage: storage,
        });
      }

      res.json({
        success: true,
        message: "Configuración de gobernanza comercial actualizada correctamente.",
        ...result,
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0]?.message || "Datos inválidos" });
      }
      console.error("[COMMERCIAL CONFIG PUT] Error:", error);
      res.status(500).json({ message: "Error al actualizar configuración de reglas comerciales." });
    }
  });

  // 3. Bitácora histórica de modificaciones a parámetros comerciales
  app.get('/api/admin/commercial-config/audit', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getAuthUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "No autenticado." });
      }
      const user = await storage.getUser(userId);
      if (!user || user.role !== 'super_admin') {
        return res.status(403).json({ message: "Acceso exclusivo para Super Admin." });
      }

      const limit = Number(req.query.limit) || 100;
      const logs = await commercialConfigService.getAuditHistory(limit);
      res.json({ logs });
    } catch (error: any) {
      console.error("[COMMERCIAL CONFIG AUDIT] Error:", error);
      res.status(500).json({ message: "Error al consultar bitácora de configuración comercial." });
    }
  });

  // =========================================================================
  // FASE 2B.2B: CAMBIOS Y ACEPTACIÓN COMERCIAL (COM-07, COM-10, COM-11)
  // =========================================================================

  // Consultar estado de condiciones comerciales pendientes para el usuario autenticado
  app.get('/api/commercial-terms/status', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getAuthUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "No autenticado." });
      }
      const status = await commercialTermsService.getPendingCommercialTermsForUser(userId, storage);
      return res.json(status);
    } catch (error: any) {
      console.error("Error al consultar estado de condiciones comerciales:", error);
      return res.status(500).json({ message: "Error al consultar estado de condiciones comerciales." });
    }
  });

  // Historial de aceptaciones y versiones de condiciones comerciales
  app.get('/api/commercial-terms/history', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getAuthUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "No autenticado." });
      }
      const history = await commercialTermsService.getCommercialAcceptancesHistory(userId, storage);
      const versions = commercialTermsService.getCommercialVersionsHistory();
      return res.json({ versions, acceptances: history });
    } catch (error: any) {
      console.error("Error al consultar historial de condiciones comerciales:", error);
      return res.status(500).json({ message: "Error al consultar historial de condiciones comerciales." });
    }
  });

  // Aceptar expresamente una versión de condiciones comerciales o de red (Idempotente)
  app.post('/api/commercial-terms/accept', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getAuthUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "No autenticado." });
      }
      const { version, type, document, masterBrokerId } = req.body || {};
      if (!version || typeof version !== 'string') {
        return res.status(400).json({ message: "Se requiere especificar la versión a aceptar." });
      }

      // Only the implemented global/network instruments can be accepted here.
      // A per-financial-institution or per-offer/version acceptance must NEVER
      // be recorded as if it were a global or network acceptance.
      if ((type !== undefined && type !== 'global' && type !== 'network') ||
          (document !== undefined && document !== 'condiciones-comerciales' && document !== 'comisiones-red') ||
          (type === 'global' && document === 'comisiones-red') ||
          (type === 'network' && document === 'condiciones-comerciales')) {
        return res.status(400).json({
          message: "El tipo de aceptación solicitado no corresponde a las condiciones globales o de red admitidas.",
          code: "UNSUPPORTED_COMMERCIAL_ACCEPTANCE_TYPE",
        });
      }

      // Legal evidence: let Express validate trusted proxies (req.ip); never
      // accept an arbitrary X-Forwarded-For value as the signer IP.
      const rawClientIp = req.ip || req.socket?.remoteAddress || null;
      const clientIp = typeof rawClientIp === 'string' && rawClientIp.trim() ? rawClientIp.trim() : null;
      const userAgent = (req.headers['user-agent'] as string) || 'unknown';
      const resolvedType = type === 'network' || document === 'comisiones-red' ? 'network' : 'global';

      const result = await commercialTermsService.acceptCommercialTerms(
        {
          userId,
          version: version.trim(),
          type: resolvedType,
          masterBrokerId,
          ipAddress: clientIp,
          userAgent,
        },
        storage
      );

      return res.json(result);
    } catch (error: any) {
      console.error("Error al registrar aceptación de condiciones comerciales:", error);
      return res.status(400).json({ message: error.message || "Error al aceptar condiciones comerciales." });
    }
  });

  // 4. Backfill conservador e idempotente de gobernanza comercial (Super Admin)
  app.post('/api/admin/commercial-governance/backfill', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getAuthUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "No autenticado." });
      }
      const user = await storage.getUser(userId);
      if (!user || user.role !== 'super_admin') {
        return res.status(403).json({ message: "Acceso exclusivo para Super Admin." });
      }

      const apply = req.body?.apply === true;
      const { db } = await import("./db");
      const { CommercialBackfillService, DrizzleCommercialBackfillStorage } = await import("./commercialBackfillService");

      const backfillStorage = new DrizzleCommercialBackfillStorage(db);
      const backfillService = new CommercialBackfillService(backfillStorage, commercialConfigService);

      const summary = await backfillService.runBackfill({ dryRun: !apply });

      res.json({
        success: true,
        mode: apply ? "apply" : "dry_run",
        summary,
      });
    } catch (error: any) {
      console.error("[COMMERCIAL BACKFILL] Error:", error);
      res.status(500).json({ message: "Error al ejecutar backfill de gobernanza comercial.", error: error?.message });
    }
  });


  // Tenant Context Testing Endpoint
  app.get('/api/tenant-context', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || "user-super-admin";
      const user = await storage.getUser(userId);
      
      res.json({
        requestInfo: {
          method: req.method,
          path: req.path,
          headers: {
            'x-tenant-slug': req.headers['x-tenant-slug'],
          },
          query: req.query,
          params: req.params,
        },
        tenantContext: req.tenantContext,
        userInfo: {
          userId,
          userRole: user?.role,
          isPlatformAdmin: req.tenantContext?.isPlatformAdmin,
        },
        resolutionSources: {
          headerSlug: req.headers['x-tenant-slug'],
          querySlug: req.query.slug,
          pathParams: Object.keys(req.params).length > 0 ? req.params : null,
        },
        debug: {
          middlewareApplied: 'tenantContextMiddleware',
          timestamp: new Date().toISOString(),
        }
      });
    } catch (error) {
      console.error("Error in tenant context test endpoint:", error);
      res.status(500).json({ 
        message: "Internal server error",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Dashboard metrics with role-based data and trends
  app.get('/api/dashboard/metrics', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const isAdmin = user.role === 'admin' || user.role === 'super_admin';
      const isMasterBroker = user.role === 'master_broker';
      const isBroker = user.role === 'broker';
      
      // Date ranges for trends
      const now = new Date();
      const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      
      let metrics: any = {
        role: user.role,
      };
      
      // Una afiliación actual de red no da acceso a expedientes históricos.
      // La atribución de origen es inmutable y se comparte con el resto de rutas.
      let networkBrokers: any[] = [];
      if (isMasterBroker) {
        networkBrokers = await storage.getUsersByMasterBroker(userId);
      }

      const allSubmissions = await storage.getCreditSubmissionRequests({});
      const userSubmissions = allSubmissions.filter(submission =>
        canReadCreditSubmission(user, submission)
      );

      // Active pipeline requests (in progress)
      const activePipelineSubmissions = userSubmissions.filter(s =>
        s.status === 'submitted' || s.status === 'evaluating' || s.status === 'under_review' ||
        s.status === 'offers_received' || s.status === 'winner_selected' || s.status === 'in_progress'
      );
      const pipelineCount = activePipelineSubmissions.length;

      // Créditos vinculados a la red: se utiliza el Master de ORIGEN del
      // crédito, no la afiliación actual del Broker ni la pertenencia al tenant.
      const allCredits = await storage.getCredits({});
      const userCredits = allCredits.filter(credit => canViewCreditByOrigin(user, credit));

      // REGLA 3 (FASE 2B.2A.1): Separar desembolsos reportados de confirmados.
      // Sólo la confirmación expresa de Super Admin computa como desembolso confirmado en métricas.
      const disbursedCredits = userCredits.filter(c =>
        (c.status === 'disbursed' || c.status === 'dispersed' || c.status === 'dispersado' || c.status === 'active') &&
        isCreditDisbursementConfirmed(c)
      );
      const reportedDisbursedCredits = userCredits.filter(c =>
        (c.status === 'disbursed' || c.status === 'dispersed' || c.status === 'dispersado') &&
        !isCreditDisbursementConfirmed(c)
      );
      const disbursedCount = disbursedCredits.length;
      const disbursedVolume = disbursedCredits.reduce((sum, c) => {
        const prop = (c.finalProposal as any) || {};
        const confirmedAmt = prop.disbursementConfirmation?.confirmedAmount ?? (c as any).confirmedDisbursedAmount;
        return sum + (confirmedAmt != null ? parseFloat(String(confirmedAmt)) : parseFloat(c.amount || '0'));
      }, 0);

      // Suggested metrics: Average Ticket & Conversion Rate (#27)
      const avgTicket = disbursedCount > 0 ? disbursedVolume / disbursedCount : 0;
      const totalDecidedOrActive = pipelineCount + disbursedCount;
      const conversionRate = totalDecidedOrActive > 0 ? (disbursedCount / totalDecidedOrActive) * 100 : 0;

      // 4. Commissions calculation with role-specific net/gross breakdown
      let commissions: any[] = [];
      if (isAdmin) {
        commissions = await storage.getCommissions();
      } else if (isMasterBroker) {
        const directComms = await storage.getCommissions({ brokerId: userId });
        const netComms = await storage.getCommissions({ masterBrokerId: userId, includeNetwork: true });
        const commMap = new Map<string, any>();
        for (const c of [...directComms, ...netComms]) {
          commMap.set(c.id, c);
        }
        commissions = Array.from(commMap.values());
      } else {
        const brkComms = await storage.getCommissions({ brokerId: userId });
        commissions = brkComms.filter(c => parseFloat(c.brokerShare || (c.masterBrokerShare ? '0' : c.amount) || '0') > 0);
      }

      // Helper to extract role-appropriate commission amount:
      const getRoleCommAmount = (c: any): number => {
        if (isAdmin) {
          // For admin pending, it's what admin owes to the network (Option B: to Master if exists, else to Broker)
          const isMb = c.masterBrokerId && parseFloat(c.masterBrokerShare || '0') > 0;
          return isMb 
            ? (parseFloat(c.brokerShare || '0') + parseFloat(c.masterBrokerShare || '0')) 
            : parseFloat(c.brokerShare || c.amount || '0');
        }
        if (isMasterBroker) {
          // If Master Broker's own credit, they get full amount or brokerShare; if network, they get their net masterBrokerShare
          const isOwn = c.brokerId === userId;
          const mbShare = parseFloat(c.masterBrokerShare || '0');
          const brkShare = parseFloat(c.brokerShare || '0');
          const baseAmt = parseFloat(c.amount || '0');
          if (isOwn) {
            return mbShare > 0 ? mbShare : (brkShare > 0 ? brkShare : baseAmt);
          }
          return mbShare;
        }
        // Broker gets brokerShare
        return parseFloat(c.brokerShare || (c.masterBrokerShare ? '0' : c.amount) || '0');
      };

      const currentMonthPaid = commissions
        .filter(c => c.status === 'paid' && c.createdAt && new Date(c.createdAt) >= currentMonthStart)
        .reduce((sum, c) => sum + getRoleCommAmount(c), 0);

      const allTimePaid = commissions
        .filter(c => c.status === 'paid')
        .reduce((sum, c) => sum + getRoleCommAmount(c), 0);

      const pendingCommissions = commissions
        .filter(c => ['pending', 'generated', 'approved', 'dispersing'].includes(c.status))
        .reduce((sum, c) => sum + getRoleCommAmount(c), 0);

      const pendingCommissionsCount = commissions.filter(c => ['pending', 'generated', 'approved', 'dispersing'].includes(c.status) && getRoleCommAmount(c) > 0).length;

      // 5. Dynamic trends (solving the static "Sin cambios" bug #27)
      const lastMonthSubmissions = userSubmissions.filter(s =>
        s.createdAt && new Date(s.createdAt) >= lastMonthStart && new Date(s.createdAt) <= lastMonthEnd
      ).length;
      const currentMonthSubmissions = userSubmissions.filter(s =>
        s.createdAt && new Date(s.createdAt) >= currentMonthStart
      ).length;

      const currentMonthDisbursed = disbursedCredits.filter(c =>
        c.createdAt && new Date(c.createdAt) >= currentMonthStart
      );
      const currentMonthDisbursedVol = currentMonthDisbursed.reduce((sum, c) => sum + parseFloat(c.amount || '0'), 0);

      const lastMonthDisbursed = disbursedCredits.filter(c =>
        c.createdAt && new Date(c.createdAt) >= lastMonthStart && new Date(c.createdAt) <= lastMonthEnd
      );
      const lastMonthDisbursedVol = lastMonthDisbursed.reduce((sum, c) => sum + parseFloat(c.amount || '0'), 0);

      const lastMonthPaid = commissions
        .filter(c => c.status === 'paid' && c.createdAt &&
                new Date(c.createdAt) >= lastMonthStart && new Date(c.createdAt) <= lastMonthEnd)
        .reduce((sum, c) => sum + parseFloat(c.amount || '0'), 0);

      const formatTrend = (current: number, previous: number, labelUnit = '') => {
        if (previous === 0 && current > 0) {
          return { deltaPct: 100, isPositive: true, isNeutral: false, label: `+${current}${labelUnit} este mes (Nuevo)` };
        }
        if (previous === 0 && current === 0) {
          return { deltaPct: 0, isPositive: false, isNeutral: true, label: 'Sin actividad previa' };
        }
        const delta = ((current - previous) / previous) * 100;
        const rounded = Math.round(delta * 10) / 10;
        if (rounded === 0) {
          return { deltaPct: 0, isPositive: true, isNeutral: false, label: 'Mismo nivel que mes anterior' };
        }
        return {
          deltaPct: rounded,
          isPositive: delta > 0,
          isNeutral: false,
          label: `${delta > 0 ? '+' : ''}${rounded.toFixed(1)}% vs mes anterior`
        };
      };

      metrics.broker = {
        pipelineRequests: pipelineCount,
        disbursedCredits: disbursedCount,
        disbursedVolume: disbursedVolume,
        commissionsPaid: currentMonthPaid > 0 ? currentMonthPaid : allTimePaid,
        commissionsPending: pendingCommissions,
        commissionsPendingCount: pendingCommissionsCount,
        commissionsTotal: allTimePaid + pendingCommissions,
        avgTicket: Math.round(avgTicket),
        conversionRate: Math.round(conversionRate * 10) / 10,
      };

      metrics.trend = {
        pipeline: formatTrend(currentMonthSubmissions > 0 ? currentMonthSubmissions : pipelineCount, lastMonthSubmissions, ' casos'),
        disbursedVolume: formatTrend(currentMonthDisbursedVol > 0 ? currentMonthDisbursedVol : disbursedVolume, lastMonthDisbursedVol),
        commissionsPaid: formatTrend(currentMonthPaid, lastMonthPaid),
      };

      if (isMasterBroker) {
        const networkDisbursedCredits = userCredits.filter(c =>
          c.brokerId !== userId &&
          (c.status === 'disbursed' || c.status === 'dispersed' || c.status === 'active') &&
          isCreditDisbursementConfirmed(c)
        );
        const networkDisbursedVol = networkDisbursedCredits.reduce((sum, c) => {
          const prop = (c.finalProposal as any) || {};
          const confirmedAmt = prop.disbursementConfirmation?.confirmedAmount ?? (c as any).confirmedDisbursedAmount;
          return sum + (confirmedAmt != null ? parseFloat(String(confirmedAmt)) : parseFloat(c.amount || '0'));
        }, 0);
        const networkActiveSubmissions = userSubmissions.filter(s =>
          s.brokerId !== userId && (s.status === 'submitted' || s.status === 'evaluating' || s.status === 'under_review' || s.status === 'in_progress')
        ).length;

        const mbGrossPending = commissions.filter(c => c.status === 'pending').reduce((sum, c) => {
          return sum + (parseFloat(c.brokerShare || '0') + parseFloat(c.masterBrokerShare || '0'));
        }, 0);
        const mbOwedToBrokers = commissions.filter(c => c.status === 'pending').reduce((sum, c) => {
          return sum + parseFloat(c.brokerShare || '0');
        }, 0);

        metrics.masterBroker = {
          activeBrokers: summarizeCommercialAccountActivity(networkBrokers).activeBrokers,
          networkPipeline: networkActiveSubmissions,
          networkDisbursedVolume: networkDisbursedVol,
          networkDisbursedCredits: networkDisbursedCredits.length,
          networkCommissionsGross: mbGrossPending,
          networkCommissionsToBrokers: mbOwedToBrokers,
          networkCommissionsNet: pendingCommissions,
        };
      }

      if (isAdmin) {
        const [allClients, allUsers, commercialOffers, financialInstitutions] = await Promise.all([
          storage.getClients(),
          storage.getAllUsers(),
          storage.getInstitutionProducts(),
          storage.getFinancialInstitutions(),
        ]);
        const commercialAccounts = summarizeCommercialAccountActivity(allUsers);
        metrics.admin = {
          totalPipeline: pipelineCount,
          totalDisbursed: disbursedCount,
          totalDisbursedVolume: disbursedVolume,
          activeBrokers: commercialAccounts.activeBrokers,
          activeMasterBrokers: commercialAccounts.activeMasterBrokers,
          pendingInvitations: commercialAccounts.pendingInvitations,
          publishedOffers: commercialOffers.filter(o => o.status === 'published' && o.isActive !== false).length,
          activeFinancialInstitutions: financialInstitutions.filter(i => i.isActive !== false).length,
          totalClients: allClients.length,
          newProspectsMonth: new Set(allClients.filter(c => c.createdAt && new Date(String(c.createdAt)).getTime() >= currentMonthStart.getTime()).map(c => c.id)).size,
          avgTicket: Math.round(avgTicket),
          commissionsPendingTotal: pendingCommissions,
          commissionsPendingCount: pendingCommissionsCount,
          commissionsGrossTotal: commissions.reduce((sum, c) => sum + parseFloat(c.amount || '0'), 0),
          commissionsNetAppTotal: commissions.reduce((sum, c) => sum + parseFloat(c.appShare || '0'), 0),
        };
      }

      res.json(metrics);
    } catch (error) {
      console.error("Error fetching dashboard metrics:", error);
      res.status(500).json({ message: "Failed to fetch metrics" });
    }
  });

  // Credit pipeline (Unified submissions & credits #27)
  app.get('/api/dashboard/pipeline', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      const allSubmissions = await storage.getCreditSubmissionRequests({});
      const userSubmissions = allSubmissions.filter(sub => canReadCreditSubmission(user, sub));

      const allCredits = await storage.getCredits({});
      const userCredits = allCredits.filter(credit => canViewCreditByOrigin(user, credit));

      // Calculate pipeline stages across both submissions in-flight and credits
      const en_revision = userSubmissions.filter(s =>
        s.status === 'submitted' || s.status === 'under_review' || s.status === 'evaluating'
      ).length;

      const validacion = userSubmissions.filter(s =>
        s.status === 'offers_received' || s.status === 'in_progress'
      ).length + userCredits.filter(c =>
        c.status === 'validacion_juridica' || c.status === 'en_mesa_control'
      ).length;

      const isReportedUnconfirmed = (c: any) =>
        !isCreditDisbursementConfirmed(c) &&
        ((c.finalProposal as any)?.disbursementStatus === 'reported' ||
          ['disbursed', 'dispersed', 'dispersado'].includes(c.status));

      const aprobacion = userCredits.filter(c =>
        (c.status === 'approved' || c.status === 'aprobado') && !isReportedUnconfirmed(c)
      ).length;

      const por_firmar = userSubmissions.filter(s =>
        s.status === 'winner_selected'
      ).length + userCredits.filter(c =>
        c.status === 'por_firmar'
      ).length;

      const dispersion = userCredits.filter(c =>
        (c.status === 'disbursed' || c.status === 'dispersed' || c.status === 'dispersado' || c.status === 'active') &&
        isCreditDisbursementConfirmed(c)
      ).length;

      // A reported credit remains 'approved' until Super Admin confirmation,
      // but is shown in the reporting stage rather than counted twice as approved.
      const dispersion_reportada = userCredits.filter(isReportedUnconfirmed).length;

      const pipeline = {
        en_revision,
        validacion,
        aprobacion,
        por_firmar,
        dispersion,
        dispersion_reportada,
      };

      // Helper to resolve client display name
      const getClientName = async (clientId?: string | null, fallbackPurpose?: string | null) => {
        if (!clientId) return fallbackPurpose || 'Cliente General';
        try {
          const c = await storage.getClient(clientId);
          if (!c) return fallbackPurpose || 'Cliente General';
          if (c.type === 'persona_moral' || c.type === 'moral') {
            return c.businessName || (c as any).tradeName || (c as any).nombreComercial || 'Empresa';
          }
          return `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Cliente';
        } catch {
          return fallbackPurpose || 'Cliente General';
        }
      };

      // Build unified recent cases list
      const recentList: any[] = [];

      for (const credit of userCredits.slice(0, 10)) {
        const clientName = await getClientName(credit.clientId, credit.purpose);
        recentList.push({
          id: credit.id,
          clientName,
          amount: credit.amount,
          status: credit.status,
          updatedAt: credit.updatedAt || credit.createdAt,
          sourceType: 'credit'
        });
      }

      for (const sub of userSubmissions.slice(0, 10)) {
        // El estado padre puede estar "in_progress" aunque la financiera
        // solo tenga visto bueno. Resolver exactamente como Gestión de Créditos.
        const targets = await storage.getCreditSubmissionTargets({ requestId: sub.id });
        const primaryStatus = resolveSubmissionDisplayStatus(sub.status, targets);
        const clientName = await getClientName(sub.clientId, sub.purpose);
        recentList.push({
          id: sub.id,
          clientName,
          amount: sub.requestedAmount,
          status: primaryStatus === 'submitted' ? 'en_revision' :
                  primaryStatus === 'winner_selected' ? 'por_firmar' :
                  primaryStatus === 'dispersed' ? 'disbursed' : primaryStatus,
          updatedAt: sub.updatedAt || sub.createdAt,
          sourceType: 'submission'
        });
      }

      // Sort by updatedAt descending and take top 5
      recentList.sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
      const recentCases = recentList.slice(0, 5);

      res.json({
        pipeline,
        recentCases,
      });
    } catch (error) {
      console.error("Error fetching credit pipeline:", error);
      res.status(500).json({ message: "Failed to fetch pipeline" });
    }
  });

  // Notifications
  app.get('/api/notifications', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const notifications = await storage.getNotifications(userId);
      res.json(notifications);
    } catch (error) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({ message: "Failed to fetch notifications" });
    }
  });

  app.patch('/api/notifications/:id/read', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const success = await storage.markNotificationAsRead(id, req.user.claims.sub);
      
      if (success) {
        res.json({ message: "Notification marked as read" });
      } else {
        res.status(404).json({ message: "Notification not found" });
      }
    } catch (error) {
      console.error("Error marking notification as read:", error);
      res.status(500).json({ message: "Failed to mark notification as read" });
    }
  });

  app.put('/api/notifications/:id/read', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const success = await storage.markNotificationAsRead(id, req.user.claims.sub);
      
      if (success) {
        res.json({ message: "Notification marked as read" });
      } else {
        res.status(404).json({ message: "Notification not found" });
      }
    } catch (error) {
      console.error("Error marking notification as read:", error);
      res.status(500).json({ message: "Failed to mark notification as read" });
    }
  });

  // User-management API must not expose credential material to Admin/Master clients.
  const publicUserForManagement = (user: any) => {
    if (!user) return user;
    const safe = { ...user };
    delete safe.password;
    delete safe.resetToken;
    delete safe.resetTokenExpiry;
    return safe;
  };

  // User Management (Super Admin, Admin, and Master Broker scoped to their network)
  app.get('/api/users', isAuthenticated, requireModuleAndAction('usuarios', 'manage_users'), async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const currentUser = await storage.getUser(userId);
      
      if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'super_admin' && currentUser.role !== 'master_broker')) {
        return res.status(403).json({ message: "Access denied. Admin or Master Broker privileges required." });
      }

      // Master Broker only sees users in their own network
      if (currentUser.role === 'master_broker') {
        const networkUsers = await storage.getUsersByMasterBroker(currentUser.id);
        return res.json(networkUsers.map(u => ({ ...publicUserForManagement(u), registrationStatus: u.password ? 'registered' : 'pending' })));
      }
      
      const users = await storage.getAllUsers();
      res.json(users.map(u => ({ ...publicUserForManagement(u), registrationStatus: u.password ? 'registered' : 'pending' })));
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.post('/api/users', isAuthenticated, requireModuleAndAction('usuarios', 'manage_users'), async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const currentUser = await storage.getUser(userId);
      
      const isSuperAdmin = currentUser?.role === 'admin' || currentUser?.role === 'super_admin';
      const isMasterBroker = currentUser?.role === 'master_broker';

      if (!isSuperAdmin && !isMasterBroker) {
        return res.status(403).json({ message: "Access denied. Admin or Master Broker privileges required." });
      }
      
      const userData = insertUserSchema.parse(req.body);
      if (!userData.email) {
        return res.status(400).json({ message: "El email es requerido" });
      }

      // Admin/Master must not supply arbitrary modules/actions while creating
      // identities. Only Super Admin can grant user-level privileges.
      if (currentUser?.role !== 'super_admin' && userData.permissions !== undefined) {
        return res.status(403).json({ message: "Sólo Super Admin puede definir permisos de nuevos usuarios." });
      }

      // Master may invite only a Broker in its own network (never grant admin/Master roles).
      if (isMasterBroker) {
        userData.role = 'broker';
        userData.masterBrokerId = currentUser.id;
      }

      // A platform Admin cannot create a new Admin or Super Admin.
      if (currentUser?.role === 'admin' &&
          (userData.role === 'super_admin' || userData.role === 'admin')) {
        return res.status(403).json({ message: "Sólo Super Admin puede asignar privilegios administrativos." });
      }

      // A new Broker's initial affiliation is also structural governance:
      // Admin cannot silently place a new identity inside any Master network.
      if (currentUser?.role === "admin" && userData.role === "broker" && userData.masterBrokerId) {
        return res.status(403).json({ message: "Sólo Super Admin puede asignar nuevos Brokers a una red Master." });
      }

      // Onboarding through Administration must never bypass first-login legal evidence.
      // All Broker/Master accounts start with an activation link and no password.
      const isCommercialInvite = userData.role === "broker" || userData.role === "master_broker";
      if (userData.role === "master_broker" && currentUser?.role !== "super_admin") {
        return res.status(403).json({ message: "Sólo Super Admin puede invitar nuevos Master Brokers." });
      }

      // Auto-generate unique referralCode for master_broker if not provided
      if (userData.role === 'master_broker' && !userData.referralCode) {
        const prefix = (userData.firstName ? userData.firstName.substring(0, 3).toUpperCase() : 'MB');
        const randomDigits = Math.floor(1000 + Math.random() * 9000);
        userData.referralCode = `${prefix}-${randomDigits}`;
      }
      
      // Account passwords must never be stored as plaintext, including
      // the legacy Super Admin/Admin user-creation endpoint.
      if (!isCommercialInvite && userData.password) {
        const supplied = String(userData.password);
        if (supplied.length < 12) {
          return res.status(400).json({ message: "La contraseña inicial debe tener al menos 12 caracteres." });
        }
        userData.password = await bcrypt.hash(supplied, 12);
      }

      // Check if email already exists
      const existingUser = await storage.getUserByEmail(userData.email);
      if (existingUser) {
        return res.status(400).json({ message: "El email ya está registrado en el sistema" });
      }
      
      // Invitations without a coupon keep the standard free-access status.
      // A requested courtesy is checked before creating the account.
      const annualCourtesy = isCommercialInvite
        ? await resolveOptionalInvitationPromo(
            typeof req.body?.promoCode === "string" ? req.body.promoCode : null,
            userData.role as "broker" | "master_broker",
            req.body?.promoMode === "annual_courtesy" ? "annual_courtesy" : undefined,
          )
        : null;
      const activationSecret = isCommercialInvite
        ? (await import("node:crypto")).randomBytes(32).toString("hex")
        : null;
      const activationExpires = activationSecret ? new Date(Date.now() + 24 * 60 * 60 * 1000) : null;

      // Reuse the canonical transaction: identity + tenant + owner. Never persist
      // an administrator-supplied password for Broker/Master; collect legal
      // confirmations atomically at the token activation endpoint instead.
      const newUser = isCommercialInvite
        ? (await createBrokerWithOrganization({
            email: userData.email, firstName: userData.firstName,
            lastName: userData.lastName, password: null,
            authMethod: userData.authMethod || "local",
            role: userData.role as "broker" | "master_broker",
            masterBrokerId: userData.role === "broker" ? userData.masterBrokerId : null,
            resetToken: activationSecret,
            resetTokenExpiry: activationExpires,
            profileData: {
              ...((userData.profileData && typeof userData.profileData === "object") ? userData.profileData as object : {}),
              invitationPromoCode: annualCourtesy?.code ?? null,
            },
            isActive: userData.isActive !== false,
          })).user
        : await storage.createUser(userData);

      if (isCommercialInvite && newUser.email && activationSecret) {
        const fullName = [newUser.firstName, newUser.lastName].filter(Boolean).join(" ") || undefined;
        const delivery = await sendAccountInvitationEmail(newUser.email, activationSecret,
          userData.role as "broker" | "master_broker", fullName, undefined, annualCourtesy ?? undefined);
        return res.status(delivery.success ? 201 : 202).json({
          ...publicUserForManagement(newUser),
          invitationSent: delivery.success,
          message: delivery.success
            ? "Invitación enviada: el usuario activará su cuenta y aceptará los documentos legales."
            : "Cuenta pendiente de activación: el correo no se pudo enviar; reintenta la invitación.",
        });
      }
      res.status(201).json(publicUserForManagement(newUser));
    } catch (error: any) {
      console.error("Error creating user:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      // Check for duplicate key constraint
      if (error?.code === '23505' || error?.constraint?.includes('email')) {
        return res.status(400).json({ message: "El email ya está registrado en el sistema" });
      }
      if (error?.statusCode >= 400 && error?.statusCode < 500) {
        return res.status(error.statusCode).json({ message: error.message });
      }
      res.status(500).json({ message: "Failed to create user" });
    }
  });

  app.patch('/api/users/:id', isAuthenticated, requireModuleAndAction('usuarios', 'manage_users'), async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const currentUser = await storage.getUser(userId);
      
      const isSuperAdmin = currentUser?.role === 'admin' || currentUser?.role === 'super_admin';
      const isMasterBroker = currentUser?.role === 'master_broker';

      if (!isSuperAdmin && !isMasterBroker) {
        return res.status(403).json({ message: "Access denied." });
      }
      
      const { id } = req.params;
      const targetUser = await storage.getUser(id);
      if (!targetUser) {
        return res.status(404).json({ message: "Usuario no encontrado" });
      }

      // Admin cannot mutate Super Admin identity/privileges via user-management.
      if (currentUser.role === "admin" && targetUser.role === "super_admin") {
        return res.status(403).json({ message: "Sólo Super Admin puede editar cuentas Super Admin." });
      }
      // If Master Broker, verify target belongs to their network
      if (isMasterBroker && targetUser.masterBrokerId !== currentUser.id) {
        return res.status(403).json({ message: "No tienes permiso para modificar usuarios fuera de tu red." });
      }
      
      // Credentials and password-reset tokens may only change through the dedicated
      // authenticated password recovery / change-password flows.
      const forbiddenAuthFields = ["password", "resetToken", "resetTokenExpiry"];
      if (forbiddenAuthFields.some((field) => Object.prototype.hasOwnProperty.call(req.body || {}, field))) {
        return res.status(403).json({ message: "No se permiten cambios de credenciales por edición de usuarios." });
      }

      const userData = insertUserSchema.partial().parse(req.body);
      if (currentUser.role === "admin" &&
          userData.role !== undefined && userData.role !== targetUser.role) {
        return res.status(403).json({ message: "Sólo Super Admin puede cambiar roles administrativos." });
      }
      if (currentUser.role === "admin" && userData.permissions !== undefined) {
        return res.status(403).json({ message: "Sólo Super Admin puede asignar permisos." });
      }

      // All structural network transfers / broker promotions need the audited
      // Super Admin transition flow, not a generic user update.
      if (userData.masterBrokerId !== undefined && userData.masterBrokerId !== targetUser.masterBrokerId) {
        return res.status(409).json({ message: "Los cambios de red requieren transición autorizada por Super Admin." });
      }
      if (userData.role !== undefined && userData.role !== targetUser.role &&
          (["broker", "master_broker"].includes(targetUser.role) ||
            ["broker", "master_broker"].includes(userData.role))) {
        return res.status(409).json({ message: "La promoción o cambio de rol comercial requiere transición autorizada." });
      }
      if (isMasterBroker && userData.permissions !== undefined) {
        return res.status(403).json({ message: "El Master Broker no puede modificar permisos de acceso mediante esta ruta." });
      }

      // Prevent Master Broker from escalating privileges
      if (isMasterBroker) {
        delete userData.role;
        delete userData.masterBrokerId;
        if (userData.permissions && typeof userData.permissions === 'object') {
          (userData.permissions as any).scope = 'network';
        }
      }

      // Proteger estado operativo contra modificaciones directas fuera de la lógica central
      // Preserve immutable contractual rate publication: not a generic user field.
      delete (userData as any).networkCommissionRates;
      delete (userData as any).status;
      delete (userData as any).isActive;
      delete (userData as any).statusChangedAt;
      delete (userData as any).statusChangedBy;
      delete (userData as any).statusChangeReason;
      delete (userData as any).statusChangeNotes;

      // Check if changing email to one that already exists
      if (userData.email) {
        const existingUser = await storage.getUserByEmail(userData.email);
        if (existingUser && existingUser.id !== id) {
          return res.status(400).json({ message: "El email ya está registrado por otro usuario" });
        }
      }
      
      const updatedUser = await storage.updateUser(id, userData);
      
      if (!updatedUser) {
        return res.status(404).json({ message: "Usuario no encontrado" });
      }
      
      res.json(publicUserForManagement(updatedUser));
    } catch (error: any) {
      console.error("Error updating user:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      if (error?.code === '23505' || error?.constraint?.includes('email')) {
        return res.status(400).json({ message: "El email ya está registrado por otro usuario" });
      }
      res.status(500).json({ message: "Failed to update user" });
    }
  });

  // Helper central para cambios de estado operativo (Super Admin y Master Broker)
  async function handleUserOperationalStatusChange(req: any, res: any, targetUserId: string, requestedStatus: UserOperationalStatus, reason: string, notes?: string) {
    const callerUserId = req.user.claims?.sub || req.user.id;
    const callerUser = await storage.getUser(callerUserId);
    if (!callerUser) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const isSuperAdmin = callerUser.role === 'super_admin';
    const isMasterBroker = callerUser.role === 'master_broker';

    if (!isSuperAdmin && !isMasterBroker) {
      return res.status(403).json({ message: "No tienes permisos para modificar el estado operativo de usuarios" });
    }

    const targetUser = await storage.getUser(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    // Bloqueo estricto de auto-desactivación / auto-modificación
    if (targetUser.id === callerUserId) {
      return res.status(400).json({ message: "No puedes modificar el estado de tu propia cuenta" });
    }

    // Reglas estrictas de gobierno para Master Broker
    if (isMasterBroker) {
      if (targetUser.role !== 'broker' || targetUser.masterBrokerId !== callerUser.id) {
        return res.status(403).json({ message: "No tienes permiso para modificar usuarios fuera de tu red" });
      }
      // Master Broker can suspend or deactivate brokers in its own network,
      // but can never reactivate them. Reactivation and every network/role
      // transition remain exclusive to Super Admin.
      if (requestedStatus === 'active') {
        return res.status(403).json({
          message: "Los Master Brokers pueden suspender o dar de baja a brokers de su red, pero la reactivación requiere Super Admin."
        });
      }
    }

    if (!reason || reason.trim().length < 3) {
      return res.status(400).json({ message: "El motivo del cambio de estado es obligatorio (mínimo 3 caracteres)" });
    }

    const updatedUser = await storage.updateUserOperationalStatus({
      userId: targetUser.id,
      targetStatus: requestedStatus,
      changedBy: callerUserId,
      reason: reason.trim(),
      notes: notes?.trim() || undefined,
    });

    return res.json({
      message: `Estado operativo actualizado exitosamente a ${requestedStatus}`,
      user: publicUserForManagement(updatedUser),
    });
  }

  // Endpoint formal administrativo para cambio de estado operativo (Super Admin y Master Broker con reglas)
  app.patch('/api/admin/users/:id/operational-status', isAuthenticated, async (req: any, res) => {
    try {
      const parseResult = updateOperationalStatusSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ 
          message: parseResult.error.errors[0]?.message || "Datos de estado inválidos",
          errors: parseResult.error.errors 
        });
      }
      const { status, reason, notes } = parseResult.data;
      return await handleUserOperationalStatusChange(req, res, req.params.id, status, reason, notes);
    } catch (error: any) {
      console.error("Error updating user operational status:", error);
      return res.status(500).json({ message: error.message || "Error al actualizar estado operativo" });
    }
  });

  // Endpoint antiguo corregido: delega a la lógica central para evitar bypass de auditoría y permisos
  app.patch('/api/users/:id/toggle-status', isAuthenticated, async (req: any, res) => {
    try {
      const targetUserId = req.params.id;
      const targetUser = await storage.getUser(targetUserId);
      if (!targetUser) {
        return res.status(404).json({ message: "Usuario no encontrado" });
      }

      const callerUserId = req.user.claims?.sub || req.user.id;
      const callerUser = await storage.getUser(callerUserId);
      const isMasterBroker = callerUser?.role === 'master_broker';

      const currentStatus = (targetUser.status as UserOperationalStatus) || (targetUser.isActive ? 'active' : 'inactive');

      let targetStatus: UserOperationalStatus;
      if (currentStatus === 'active') {
        targetStatus = isMasterBroker ? 'suspended' : 'inactive';
      } else {
        targetStatus = 'active';
      }

      const reason = req.body?.reason || `Cambio de estado administrativo vía toggle (${currentStatus} -> ${targetStatus})`;
      const notes = req.body?.notes;

      return await handleUserOperationalStatusChange(req, res, targetUserId, targetStatus, reason, notes);
    } catch (error: any) {
      console.error("Error toggling user status via delegate:", error);
      return res.status(500).json({ message: error.message || "Failed to toggle user status" });
    }
  });

  // ==========================================
  // MASTER BROKER -> SUPER ADMIN STATUS REQUESTS
  // ==========================================

  // Master Broker: Crear solicitud de cambio de estado operativo (Baja o Reactivación)
  app.post('/api/master-broker/status-requests', isAuthenticated, async (req: any, res) => {
    try {
      const callerUserId = req.user.claims?.sub || req.user.id;
      const callerUser = await storage.getUser(callerUserId);
      if (!callerUser) {
        return res.status(401).json({ message: "Usuario no autenticado" });
      }

      if (callerUser.role !== 'master_broker') {
        return res.status(403).json({ message: "Solo los Master Brokers pueden crear solicitudes de cambio de estado" });
      }

      const parseResult = createStatusRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ 
          message: parseResult.error.errors[0]?.message || "Datos de solicitud inválidos",
          errors: parseResult.error.errors 
        });
      }

      const { targetUserId, requestedStatus, reason, notes } = parseResult.data;

      // Master no puede solicitar sobre sí mismo
      if (targetUserId === callerUser.id) {
        return res.status(400).json({ message: "No puedes crear solicitudes sobre tu propia cuenta" });
      }

      const targetUser = await storage.getUser(targetUserId);
      if (!targetUser) {
        return res.status(404).json({ message: "Usuario objetivo no encontrado" });
      }

      // Target debe ser Broker
      if (targetUser.role !== 'broker') {
        return res.status(403).json({ message: "Solo se pueden crear solicitudes para usuarios con rol Broker" });
      }

      // Target debe pertenecer a su red (masterBrokerId coincide)
      if (targetUser.masterBrokerId !== callerUser.id) {
        return res.status(403).json({ message: "Solo puedes crear solicitudes para brokers de tu propia red" });
      }

      // Estado actual del broker
      const currentStatus = (targetUser.status as UserOperationalStatus) || (targetUser.isActive ? 'active' : 'inactive');

      // Master Broker: solicitar únicamente reactivación a Super Admin.
      // Suspensión y baja de brokers propios son acciones directas del Master.
      if (requestedStatus !== 'active') {
        return res.status(403).json({
          message: "Los Master Brokers pueden suspender o dar de baja a brokers de su red directamente. Las solicitudes a Super Admin están reservadas para reactivaciones."
        });
      }
      if (currentStatus !== 'inactive') {
        return res.status(400).json({
          message: "Solo se puede solicitar la reactivación de un broker que esté actualmente inactivo"
        });
      }

      // No permitir solicitudes duplicadas pendientes para mismo requester, target y requestedStatus
      const hasDuplicate = await storage.hasPendingStatusRequest({
        requesterId: callerUser.id,
        targetUserId: targetUser.id,
        requestedStatus,
      });

      if (hasDuplicate) {
        return res.status(409).json({
          message: "Ya existe una solicitud pendiente de reactivación para este broker"
        });
      }

      const newRequest = await storage.createUserStatusRequest({
        requesterId: callerUser.id,
        targetUserId: targetUser.id,
        requestedStatus,
        reason: reason.trim(),
        notes: notes?.trim() || undefined,
      });

      // Trazabilidad de auditoría
      await storage.createCommercialAuditLog({
        action: 'create_status_request',
        entityType: 'user_status_request',
        entityId: newRequest.id,
        targetUserId: targetUser.id,
        performedBy: callerUser.id,
        notes: `Solicitud de reactivación creada por Master Broker ${callerUser.email} para broker ${targetUser.email}. Motivo: ${reason.trim()}`,
      });

      // Notificar únicamente a Super Admins, que son quienes pueden resolver la solicitud.
      try {
        const allUsers = await storage.getAllUsers();
        const admins = allUsers.filter(u => u.role === 'super_admin');
        const actionLabel = 'reactivación';
        await Promise.all(admins.map(admin => 
          storage.createNotification({
            userId: admin.id,
            type: 'status_request_created',
            title: `Nueva solicitud de ${actionLabel} de broker`,
            message: `El Master Broker ${callerUser.firstName || ''} ${callerUser.lastName || ''} (${callerUser.email}) solicitó la ${actionLabel} del broker ${targetUser.firstName || ''} ${targetUser.lastName || ''} (${targetUser.email}). Motivo: ${reason.trim()}`,
            relatedEntityType: 'user_status_request',
            relatedEntityId: newRequest.id,
          })
        ));
      } catch (notifErr) {
        console.warn('[StatusRequest] Error creating admin notifications:', notifErr);
      }

      return res.status(201).json(newRequest);
    } catch (error: any) {
      console.error("Error creating status request:", error);
      if (error?.code === '23505' || error?.constraint?.includes('idx_usr_req_unique_pending') || error?.message?.includes('idx_usr_req_unique_pending')) {
        return res.status(409).json({ 
          message: "Ya existe una solicitud pendiente con el mismo estado para este broker (carrera concurrente prevenida)." 
        });
      }
      return res.status(500).json({ message: error.message || "Error al crear solicitud de estado" });
    }
  });

  // Master Broker: Listar solicitudes de su autoría
  app.get('/api/master-broker/status-requests', isAuthenticated, async (req: any, res) => {
    try {
      const callerUserId = req.user.claims?.sub || req.user.id;
      const callerUser = await storage.getUser(callerUserId);
      if (!callerUser) {
        return res.status(401).json({ message: "Usuario no autenticado" });
      }

      if (callerUser.role !== 'master_broker') {
        return res.status(403).json({ message: "Acceso denegado" });
      }

      const requests = await storage.getUserStatusRequests({ requesterId: callerUser.id });
      return res.json(requests);
    } catch (error: any) {
      console.error("Error fetching master broker status requests:", error);
      return res.status(500).json({ message: error.message || "Error al consultar solicitudes" });
    }
  });

  // Super Admin / Admin: Listar solicitudes de estado
  app.get('/api/admin/status-requests', isAuthenticated, async (req: any, res) => {
    try {
      const callerUserId = req.user.claims?.sub || req.user.id;
      const callerUser = await storage.getUser(callerUserId);
      if (!callerUser) {
        return res.status(401).json({ message: "Usuario no autenticado" });
      }

      if (callerUser.role !== 'super_admin') {
        return res.status(403).json({ message: "Se requieren privilegios de Super Administrador" });
      }

      const statusFilter = req.query.status as UserStatusRequestStatus | undefined;
      const requests = await storage.getUserStatusRequests({ status: statusFilter });
      return res.json(requests);
    } catch (error: any) {
      console.error("Error fetching admin status requests:", error);
      return res.status(500).json({ message: error.message || "Error al consultar solicitudes de estado" });
    }
  });

  // Super Admin / Admin: Aprobar solicitud de estado
  app.post('/api/admin/status-requests/:id/approve', isAuthenticated, async (req: any, res) => {
    try {
      const callerUserId = req.user.claims?.sub || req.user.id;
      const callerUser = await storage.getUser(callerUserId);
      if (!callerUser) {
        return res.status(401).json({ message: "Usuario no autenticado" });
      }

      if (callerUser.role !== 'super_admin') {
        return res.status(403).json({ message: "Se requieren privilegios de Super Administrador" });
      }

      const parseResult = approveStatusRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ message: parseResult.error.errors[0]?.message || "Datos inválidos" });
      }
      const { reviewNotes } = parseResult.data;

      const statusRequest = await storage.getUserStatusRequest(req.params.id);
      if (!statusRequest) {
        return res.status(404).json({ message: "Solicitud no encontrada" });
      }

      if (statusRequest.status !== 'pending') {
        return res.status(400).json({ 
          message: `La solicitud ya fue resuelta previamente (estado actual: ${statusRequest.status})` 
        });
      }

      const targetUser = await storage.getUser(statusRequest.targetUserId);
      if (!targetUser) {
        return res.status(404).json({ message: "Usuario objetivo no encontrado" });
      }

      // Validar si la solicitud es obsoleta respecto al estado actual del broker
      const currentStatus = (targetUser.status as UserOperationalStatus) || (targetUser.isActive ? 'active' : 'inactive');

      if (statusRequest.requestedStatus === 'inactive' && currentStatus === 'inactive') {
        return res.status(400).json({ 
          message: "La solicitud es obsoleta: el usuario ya se encuentra inactivo." 
        });
      }

      if (statusRequest.requestedStatus === 'active' && currentStatus === 'active') {
        return res.status(400).json({ 
          message: "La solicitud es obsoleta: el usuario ya se encuentra activo." 
        });
      }

      // Ejecutar cambio operativo real reutilizando la lógica central (mantiene canOriginate, sincroniza isActive, etc.)
      const updatedUser = await storage.updateUserOperationalStatus({
        userId: targetUser.id,
        targetStatus: statusRequest.requestedStatus as UserOperationalStatus,
        changedBy: callerUserId,
        reason: `Aprobación de solicitud ${statusRequest.id}: ${statusRequest.reason}`,
        notes: reviewNotes?.trim() || statusRequest.notes || undefined,
      });

      // Marcar solicitud como aprobada
      const resolvedRequest = await storage.resolveUserStatusRequest({
        requestId: statusRequest.id,
        resolution: 'approved',
        reviewedBy: callerUserId,
        reviewNotes: reviewNotes?.trim() || undefined,
      });

      // Trazabilidad de aprobación
      await storage.createCommercialAuditLog({
        action: 'approve_status_request',
        entityType: 'user_status_request',
        entityId: statusRequest.id,
        targetUserId: targetUser.id,
        performedBy: callerUserId,
        notes: `Solicitud ${statusRequest.id} aprobada por ${callerUser.email}. Estado de ${targetUser.email} actualizado a ${statusRequest.requestedStatus}.`,
      });

      // Notificar al Master Broker solicitante
      try {
        const actionLabel = statusRequest.requestedStatus === 'inactive' ? 'baja' : 'reactivación';
        await storage.createNotification({
          userId: statusRequest.requesterId,
          type: 'status_request_approved',
          title: `Solicitud de ${actionLabel} aprobada`,
          message: `Tu solicitud de ${actionLabel} para el broker ${targetUser.firstName || ''} ${targetUser.lastName || ''} (${targetUser.email}) ha sido aprobada.`,
          relatedEntityType: 'user_status_request',
          relatedEntityId: statusRequest.id,
        });
      } catch (notifErr) {
        console.warn('[StatusRequest] Error notifying requester on approval:', notifErr);
      }

      return res.json({
        message: "Solicitud aprobada y estado operativo actualizado exitosamente",
        request: resolvedRequest,
        user: publicUserForManagement(updatedUser),
      });
    } catch (error: any) {
      console.error("Error approving status request:", error);
      return res.status(500).json({ message: error.message || "Error al aprobar la solicitud" });
    }
  });

  // Super Admin / Admin: Rechazar solicitud de estado
  app.post('/api/admin/status-requests/:id/reject', isAuthenticated, async (req: any, res) => {
    try {
      const callerUserId = req.user.claims?.sub || req.user.id;
      const callerUser = await storage.getUser(callerUserId);
      if (!callerUser) {
        return res.status(401).json({ message: "Usuario no autenticado" });
      }

      if (callerUser.role !== 'super_admin') {
        return res.status(403).json({ message: "Se requieren privilegios de Super Administrador" });
      }

      const parseResult = rejectStatusRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ 
          message: parseResult.error.errors[0]?.message || "El motivo del rechazo es obligatorio (mínimo 3 caracteres)",
          errors: parseResult.error.errors 
        });
      }
      const { reviewNotes } = parseResult.data;

      const statusRequest = await storage.getUserStatusRequest(req.params.id);
      if (!statusRequest) {
        return res.status(404).json({ message: "Solicitud no encontrada" });
      }

      if (statusRequest.status !== 'pending') {
        return res.status(400).json({ 
          message: `La solicitud ya fue resuelta previamente (estado actual: ${statusRequest.status})` 
        });
      }

      const targetUser = await storage.getUser(statusRequest.targetUserId);

      // Al RECHAZAR: NO cambiar el estado del usuario objetivo
      const resolvedRequest = await storage.resolveUserStatusRequest({
        requestId: statusRequest.id,
        resolution: 'rejected',
        reviewedBy: callerUserId,
        reviewNotes: reviewNotes.trim(),
      });

      // Trazabilidad de rechazo
      await storage.createCommercialAuditLog({
        action: 'reject_status_request',
        entityType: 'user_status_request',
        entityId: statusRequest.id,
        targetUserId: statusRequest.targetUserId,
        performedBy: callerUserId,
        notes: `Solicitud ${statusRequest.id} rechazada por ${callerUser.email}. Motivo: ${reviewNotes.trim()}`,
      });

      // Notificar al Master Broker solicitante
      try {
        const actionLabel = statusRequest.requestedStatus === 'inactive' ? 'baja' : 'reactivación';
        await storage.createNotification({
          userId: statusRequest.requesterId,
          type: 'status_request_rejected',
          title: `Solicitud de ${actionLabel} rechazada`,
          message: `Tu solicitud de ${actionLabel} para el broker ${targetUser ? `${targetUser.firstName || ''} ${targetUser.lastName || ''} (${targetUser.email})` : statusRequest.targetUserId} ha sido rechazada. Motivo: ${reviewNotes.trim()}`,
          relatedEntityType: 'user_status_request',
          relatedEntityId: statusRequest.id,
        });
      } catch (notifErr) {
        console.warn('[StatusRequest] Error notifying requester on rejection:', notifErr);
      }

      return res.json({
        message: "Solicitud rechazada exitosamente",
        request: resolvedRequest,
      });
    } catch (error: any) {
      console.error("Error rejecting status request:", error);
      return res.status(500).json({ message: error.message || "Error al rechazar la solicitud" });
    }
  });

  // 🔹 ADMIN: Execute RBAC and Commissions sanitization
  app.post('/api/admin/sanitize-rbac', isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user?.claims ? await storage.getUser(req.user.claims.sub) : req.dbUser;
      if (user?.role !== 'super_admin') {
        return res.status(403).json({ message: "Se requieren privilegios de Super Administrador." });
      }

      const dryRun = req.body?.dryRun !== false;
      const { runSanitization } = await import("../scripts/sanitize-rbac-commissions");
      const summary = await runSanitization({ dryRun });
      res.json(summary);
    } catch (error) {
      console.error("Error running RBAC sanitization:", error);
      res.status(500).json({ message: "Error ejecutando saneamiento de permisos" });
    }
  });

  // Clients
  app.get('/api/clients', isAuthenticated, requireModuleAndAction('clientes', 'view'), async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      // Admin and super_admin can see all clients
      const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
      let rawClients: any[] = [];
      if (isAdmin) {
        rawClients = await storage.getClients();
      } else if (req.tenantContext?.tenant) {
        const tenant = req.tenantContext.tenant;
        if (tenant.type === 'master_broker') {
          const subordinates = await storage.getTenantsByParent(tenant.id);
          const tenantIds = [tenant.id, ...subordinates.map(t => t.id)];
          rawClients = await storage.getClients({ tenantIds });
        } else {
          rawClients = await storage.getClients({ tenantId: tenant.id });
        }
      } else if (user?.role === 'master_broker') {
        const networkBrokers = await storage.getUsersByMasterBroker(userId);
        const brokerIds = [userId, ...networkBrokers.map(b => b.id)];
        const allClients = await storage.getClients();
        rawClients = allClients.filter(c => brokerIds.includes(c.brokerId));
      } else {
        rawClients = await storage.getClients(userId);
      }

      // The organization/tenant query is a candidate list, not authorization.
      // Broker and Master must pass the exact commercial scope checked on the
      // individual profile endpoint; tenant administrator membership cannot
      // give a Broker platform-wide client listing.
      if (!isAdmin) {
        rawClients = await filterAuthorizedClientListing(rawClients,async(client)=>{
          const access=await authorizeClientAccess(userId,user?.role||"",client.id,req.tenantContext);
          const broadTenantPrivilege = ["broker","master_broker"].includes(user?.role||"") &&
            String(access.reason||"").startsWith("Acceso administrativo");
          return Boolean(access.authorized && access.capabilities.canViewBasicProfile && !broadTenantPrivilege);
        });
      }

      const enrichedClients = await Promise.all(
        rawClients.map(async (client) => {
          let broker = null;
          let masterBroker = null;
          if (client.brokerId) {
            const brokerUser = await storage.getUser(client.brokerId);
            if (brokerUser) {
              broker = {
                id: brokerUser.id,
                firstName: brokerUser.firstName,
                lastName: brokerUser.lastName,
                email: brokerUser.email,
                role: brokerUser.role,
              };
              if (brokerUser.masterBrokerId) {
                const mbUser = await storage.getUser(brokerUser.masterBrokerId);
                if (mbUser) {
                  masterBroker = {
                    id: mbUser.id,
                    firstName: mbUser.firstName,
                    lastName: mbUser.lastName,
                    email: mbUser.email,
                    brandName: mbUser.brandName,
                  };
                }
              }
            }
          }
          return {
            ...client,
            broker,
            masterBroker,
          };
        })
      );

      res.json(enrichedClients);
    } catch (error) {
      console.error("Error fetching clients:", error);
      res.status(500).json({ message: "Failed to fetch clients" });
    }
  });

  app.get('/api/clients/:id', isAuthenticated, requireModuleAndAction('clientes', 'view'), async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      // Authorization check - decoupled commercial governance scope
      const authResult = await authorizeClientAccess(userId, user?.role || '', id, req.tenantContext);
      if (!authResult.authorized || !authResult.client) {
        return res.status(authResult.reason === 'Client not found' ? 404 : 403).json({ message: authResult.reason });
      }
      
      res.json({
        ...authResult.client,
        accessScope: authResult.scope,
        capabilities: authResult.capabilities,
        commercialRelationship: authResult.relationship ? {
          status: authResult.relationship.status,
          lastValidActivityAt: authResult.relationship.lastValidActivityAt,
          activeUntil: authResult.relationship.activeUntil,
          dormantUntil: authResult.relationship.dormantUntil,
        } : null,
      });

    } catch (error) {
      console.error("Error fetching client:", error);
      res.status(500).json({ message: "Failed to fetch client" });
    }
  });

  app.post('/api/clients', isAuthenticated, requireModuleAndAction('clientes', 'edit'), async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);

      const originationCheck = await validateCommercialOriginationAndFormalization({
        callerUser: user,
        callerMembership: req.tenantContext?.membership,
        tenantId: req.tenantContext?.tenant?.id,
        requestedBrokerId: req.body.brokerId,
      });

      if (!originationCheck.allowed) {
        return res.status(originationCheck.statusCode || 403).json({
          code: originationCheck.code,
          message: originationCheck.message,
        });
      }

      const clientData = updatedInsertClientSchema.parse({
        ...req.body,
        originOpportunity: req.body.originOpportunity || 'credito_empresarial',
        tenantId: req.tenantContext?.tenant?.id || null,
        brokerId: originationCheck.brokerId,
        createdBy: userId,
      });
      
      const client = await storage.createClient(clientData);
      
      // Create notification
      await storage.createNotification({
        userId,
        type: 'client_created',
        title: 'Nuevo cliente agregado',
        message: `Se ha agregado el cliente ${client.businessName || `${client.firstName} ${client.lastName}`}`,
        data: { clientId: client.id },
      });
      
      res.status(201).json(client);
    } catch (error) {
      console.error("Error creating client:", error);
      res.status(500).json({ message: "Failed to create client" });
    }
  });

  // Check for potential duplicate clients with enriched commercial eligibility
  app.post('/api/clients/check-duplicates', isAuthenticated, async (req: any, res) => {
    try {
      const { rfc, phone, email, financingNeedType } = req.body;
      if (!rfc && !phone && !email) {
        return res.json({
          hasDuplicate: false,
          clientExists: false,
          isSameTenant: false,
          canCreateOpportunity: true,
          duplicateReason: 'no_duplicate',
          message: 'No se enviaron datos de identificación para verificación.',
        });
      }

      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const userTenantId = req.tenantContext?.tenant?.id || null;

      const result = await commercialOpportunityService.checkDuplicatesEnriched({
        rfc,
        phone,
        email,
        financingNeedType,
        currentUserId: userId,
        currentUserRole: user?.role || 'broker',
        userTenantId,
        tenantContext: req.tenantContext,
      });

      res.json(result);
    } catch (error: any) {
      console.error("Error checking client duplicates:", error);
      res.status(500).json({ message: "Error al verificar duplicados" });
    }
  });

  // Consultar oportunidades comerciales de un cliente (filtradas por ClientAccessScope)
  app.get('/api/clients/:id/opportunities', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);

      const result = await commercialOpportunityService.getClientOpportunities({
        clientId: id,
        userId,
        userRole: user?.role || 'broker',
        tenantContext: req.tenantContext,
      });

      if (!result.authorized) {
        return res.status(403).json({ message: result.reason || 'Acceso denegado al expediente del cliente.' });
      }

      res.json(result.opportunities);
    } catch (error: any) {
      console.error("Error fetching client opportunities:", error);
      res.status(500).json({ message: "Error al consultar oportunidades del cliente" });
    }
  });

  // Registrar una nueva oportunidad comercial protegida
  app.post('/api/clients/:id/opportunities', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);

      const {
        title,
        financingNeedType,
        requestedAmount,
        productTemplateId,
        targetInstitutionId,
        initialEvidenceType,
        initialEvidenceDocUrl,
        notes,
        brokerId,
      } = req.body;

      if (!title || !financingNeedType || requestedAmount === undefined) {
        return res.status(400).json({
          message: "Campos requeridos: title, financingNeedType, requestedAmount",
        });
      }

      const isPlatformAdmin = Boolean(user?.role === 'super_admin' || req.tenantContext?.isPlatformAdmin);
      const targetBrokerId = (isPlatformAdmin && brokerId) ? brokerId : userId;

      const formalizationCheck = await validateEffectiveBrokerFormalization(
        {
          callerUser: user,
          effectiveBrokerId: targetBrokerId,
        },
        storage
      );

      if (!formalizationCheck.allowed) {
        return res.status(formalizationCheck.statusCode || 403).json({
          code: formalizationCheck.code,
          message: formalizationCheck.message,
        });
      }

      const result = await commercialOpportunityService.createOpportunity({
        clientId: id,
        brokerId: targetBrokerId,
        tenantId: req.tenantContext?.tenant?.id || null,
        title,
        financingNeedType,
        requestedAmount,
        productTemplateId,
        targetInstitutionId,
        initialEvidenceType,
        initialEvidenceDocUrl,
        notes,
        performedBy: userId,
        userRole: user?.role || 'broker',
        tenantContext: req.tenantContext,
      });

      if (!result.success) {
        const statusCode = result.conflict ? 409 : 403;
        return res.status(statusCode).json(result);
      }

      res.status(201).json(result);
    } catch (error: any) {
      console.error("Error creating commercial opportunity:", error);
      res.status(500).json({ message: "Error al registrar oportunidad comercial" });
    }
  });

  // Registrar actividad comercial sobre una oportunidad
  app.post('/api/opportunities/:id/activities', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);

      const {
        clientId,
        activityType,
        title,
        description,
        documentId,
        evidenceUrl,
        performedAt,
      } = req.body;

      if (!activityType || !title) {
        return res.status(400).json({
          message: "Campos requeridos: activityType, title",
        });
      }

      const opp = await commercialOpportunityService['storage'].getOpportunity(id);
      if (!opp) {
        return res.status(404).json({ message: "Oportunidad no encontrada" });
      }

      const targetClientId = clientId || opp.clientId;

      const result = await commercialOpportunityService.recordActivity({
        clientId: targetClientId,
        opportunityId: id,
        brokerId: userId,
        activityType,
        title,
        description,
        documentId,
        evidenceUrl,
        performedAt: performedAt ? new Date(performedAt) : new Date(),
        performedBy: userId,
        userRole: user?.role || 'broker',
        tenantContext: req.tenantContext,
      });

      if (!result.success) {
        return res.status(403).json(result);
      }

      res.status(201).json(result);
    } catch (error: any) {
      console.error("Error recording commercial activity:", error);
      res.status(500).json({ message: "Error al registrar actividad comercial" });
    }
  });

  // Consultar actividades de una oportunidad
  app.get('/api/opportunities/:id/activities', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);

      const result = await commercialOpportunityService.getOpportunityActivities({
        opportunityId: id,
        userId,
        userRole: user?.role || 'broker',
        tenantContext: req.tenantContext,
      });

      if (!result.authorized) {
        return res.status(403).json({ message: result.reason || 'Acceso denegado a la oportunidad' });
      }

      res.json(result.activities);
    } catch (error: any) {
      console.error("Error fetching opportunity activities:", error);
      res.status(500).json({ message: "Error al consultar actividades de la oportunidad" });
    }
  });

  // Liberación masiva de oportunidades expiradas (Super Admin / Cron)
  app.post('/api/admin/opportunities/release-expired', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const isPlatformAdmin = Boolean(user?.role === 'super_admin' || req.tenantContext?.isPlatformAdmin);

      if (!isPlatformAdmin) {
        return res.status(403).json({ message: "Solo administradores de plataforma pueden ejecutar la liberación masiva." });
      }

      const result = await commercialOpportunityService.evaluateAndReleaseExpiredOpportunities();
      res.json(result);
    } catch (error: any) {
      console.error("Error releasing expired opportunities:", error);
      res.status(500).json({ message: "Error al liberar oportunidades expiradas" });
    }
  });

  // Apertura formal de controversia comercial sobre una oportunidad
  app.post('/api/opportunities/:id/dispute', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);

      const {
        disputeReason,
        justification,
        evidenceUrl,
        clientElectionToken,
        verificationMethod,
      } = req.body;

      if (!disputeReason || !justification) {
        return res.status(400).json({
          message: "Campos requeridos: disputeReason, justification",
        });
      }

      const result = await commercialOpportunityService.openFormalDispute({
        opportunityId: id,
        disputeReason,
        justification,
        evidenceUrl,
        clientElectionToken,
        verificationMethod,
        performedBy: userId,
        userRole: user?.role || 'broker',
        tenantContext: req.tenantContext,
      });

      if (!result.success) {
        const statusCode =
          result.code === "OPPORTUNITY_NOT_FOUND"
            ? 404
            : result.code === "FORBIDDEN_REASON"
            ? 403
            : 400;
        return res.status(statusCode).json(result);
      }

      res.json(result);
    } catch (error: any) {
      console.error("Error opening formal dispute:", error);
      res.status(500).json({ message: "Error al registrar la controversia formal" });
    }
  });

  // Consultar lista de oportunidades comerciales con filtros por rol y scope
  app.get('/api/commercial/opportunities', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const { status, clientId } = req.query;

      const result = await commercialOpportunityService.listOpportunities({
        userId,
        userRole: user?.role || 'broker',
        status: status ? String(status) : undefined,
        clientId: clientId ? String(clientId) : undefined,
        tenantContext: req.tenantContext,
      });

      res.json(result.opportunities);
    } catch (error: any) {
      console.error("Error fetching commercial opportunities list:", error);
      res.status(500).json({ message: "Error al consultar oportunidades comerciales" });
    }
  });

  // Consultar bitácora inmutable de auditoría comercial (Mesa de Control / Super Admin)
  app.get('/api/commercial/audit-logs', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      // The global audit feed includes cross-tenant data: enforce the verified
      // platform ROLE, not a tenant-context flag as a substitute for RBAC.
      const isPlatformAdmin = user?.role === 'super_admin' || user?.role === 'admin';

      if (!isPlatformAdmin) {
        return res.status(403).json({ message: "Acceso exclusivo para Mesa de Control o Administradores de Plataforma." });
      }

      const { entityType, entityId, limit } = req.query;
      const result = await commercialOpportunityService.listAuditLogs({
        userId,
        userRole: user?.role || 'broker',
        entityType: entityType ? String(entityType) : undefined,
        entityId: entityId ? String(entityId) : undefined,
        limit: limit ? Number(limit) : 100,
        tenantContext: req.tenantContext,
      });

      res.json(result.logs);
    } catch (error: any) {
      console.error("Error fetching commercial audit logs:", error);
      res.status(500).json({ message: "Error al consultar bitácora de auditoría comercial" });
    }
  });

  // --- FASE 6: Centro de Reglas de Operación, Manual de Uso y Ayuda Contextual ---

  // Versión vigente de Reglas de Operación con estado de confirmación del usuario
  app.get('/api/operational-rules/current', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getAuthUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const result = await commercialHelpService.getCurrentOperationalRules(userId);
      if (!result) {
        return res.status(404).json({ message: "No hay reglas de operación vigentes configuradas" });
      }
      res.json(result);
    } catch (error: any) {
      console.error("Error fetching current operational rules:", error);
      res.status(500).json({ message: "Error al consultar reglas de operación vigentes" });
    }
  });

  // Historial de versiones de Reglas de Operación
  app.get('/api/operational-rules/history', isAuthenticated, async (req: any, res) => {
    try {
      const versions = await commercialHelpService.getOperationalRulesVersions();
      res.json(versions);
    } catch (error: any) {
      console.error("Error fetching operational rules history:", error);
      res.status(500).json({ message: "Error al consultar historial de reglas de operación" });
    }
  });

  // Detalle de una versión específica de Reglas de Operación
  app.get('/api/operational-rules/:version', isAuthenticated, async (req: any, res) => {
    try {
      const { version } = req.params;
      const userId = getAuthUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const result = await commercialHelpService.getOperationalRulesByVersion(version, userId);
      if (!result) {
        return res.status(404).json({ message: `Versión de reglas '${version}' no encontrada` });
      }
      res.json(result);
    } catch (error: any) {
      console.error("Error fetching operational rules version:", error);
      res.status(500).json({ message: "Error al consultar versión de reglas de operación" });
    }
  });

  // Registrar confirmación de lectura y aceptación de versión
  app.post('/api/operational-rules/acknowledge', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getAuthUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const { ruleVersionId, version } = req.body;
      const targetVersion = ruleVersionId || version;

      if (!targetVersion) {
        return res.status(400).json({ message: "Se requiere ruleVersionId o version" });
      }

      const clientIp = req.ip || req.socket?.remoteAddress || undefined;
      const result = await commercialHelpService.recordAcknowledgment(
        userId,
        targetVersion,
        typeof clientIp === 'string' ? clientIp : undefined
      );

      res.json(result);
    } catch (error: any) {
      console.error("Error acknowledging operational rules:", error);
      res.status(400).json({ message: error.message || "Error al registrar aceptación de reglas" });
    }
  });

  // Crear nueva versión de Reglas de Operación (Solo Super Admin de Plataforma)
  app.post('/api/admin/operational-rules', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getAuthUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const user = await storage.getUser(userId);

      // Verificación estricta de Super Admin de plataforma
      if (user?.role !== 'super_admin') {
        return res.status(403).json({ message: "Acceso exclusivo para Super Administradores de plataforma" });
      }

      const parseResult = insertOperationalRulesVersionSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          message: "Datos de versión inválidos",
          errors: parseResult.error.errors,
        });
      }

      const created = await commercialHelpService.createOperationalRulesVersion({
        ...parseResult.data,
        createdBy: userId,
      });

      res.status(201).json(created);
    } catch (error: any) {
      console.error("Error creating operational rules version:", error);
      res.status(500).json({ message: error.message || "Error al crear nueva versión de reglas" });
    }
  });

  // Artículos del Centro de Ayuda y Manual Práctico (con buscador por palabras y filtros)
  app.get('/api/help/articles', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getAuthUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const user = await storage.getUser(userId);
      const userRole = user?.role || 'broker';

      const { q, category, slug } = req.query;
      const articles = await commercialHelpService.getArticles({
        query: q ? String(q) : undefined,
        category: category ? String(category) : undefined,
        slug: slug ? String(slug) : undefined,
        userRole,
      });

      res.json(articles);
    } catch (error: any) {
      console.error("Error fetching help articles:", error);
      res.status(500).json({ message: "Error al consultar artículos de ayuda" });
    }
  });

  // Categorías disponibles para el rol del usuario
  app.get('/api/help/categories', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getAuthUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const user = await storage.getUser(userId);
      const userRole = user?.role || 'broker';

      const categories = await commercialHelpService.getCategories(userRole);
      res.json(categories);
    } catch (error: any) {
      console.error("Error fetching help categories:", error);
      res.status(500).json({ message: "Error al consultar categorías de ayuda" });
    }
  });

  app.put('/api/clients/:id', isAuthenticated, requireModuleAndAction('clientes', 'edit'), async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      // Authorization check - broker/tenant access
      const authResult = await authorizeClientAccess(userId, user?.role || '', id, req.tenantContext);
      if (!authResult.authorized) {
        return res.status(authResult.reason === 'Client not found' ? 404 : 403).json({ message: authResult.reason });
      }

      if (!authResult.capabilities.canEditClient) {
        return res.status(403).json({
          message: `Acceso denegado para edición: su nivel de acceso es '${authResult.scope}'. Se requiere relación comercial activa vigente o privilegios administrativos.`,
          scope: authResult.scope,
        });
      }
      
      // PRE-P0: generic profile editing cannot transfer a client to another
      // tenant/Broker or rewrite authorship. Network transitions have a
      // dedicated audited workflow.
      const clientIdentityFields = ["id", "brokerId", "tenantId", "createdBy"];
      const clientIdentityChanged = clientIdentityFields.some(key =>
        Object.prototype.hasOwnProperty.call(req.body || {}, key) &&
        req.body[key] !== (authResult.client as any)[key]
      );
      if (clientIdentityChanged) {
        return res.status(409).json({
          code: "CLIENT_OWNERSHIP_IMMUTABLE",
          message: "La identidad y atribución del cliente no se cambia mediante edición general.",
        });
      }
      const clientData = updatedInsertClientSchema.partial().parse(req.body);
      for (const key of clientIdentityFields) delete (clientData as any)[key];
      const client = await storage.updateClient(id, clientData);
      
      if (!client) {
        return res.status(404).json({ message: "Client not found" });
      }
      
      res.json(client);
    } catch (error) {
      console.error("Error updating client:", error);
      res.status(500).json({ message: "Failed to update client" });
    }
  });

  app.delete('/api/clients/:id', isAuthenticated, requireModuleAndAction('clientes', 'edit'), async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      // Authorization check - broker/tenant access
      const authResult = await authorizeClientAccess(userId, user?.role || '', id, req.tenantContext);
      if (!authResult.authorized) {
        return res.status(authResult.reason === 'Client not found' ? 404 : 403).json({ message: authResult.reason });
      }

      if (!authResult.capabilities.canEditClient) {
        return res.status(403).json({
          message: `Acceso denegado: su nivel de acceso es '${authResult.scope}'. No cuenta con permisos para eliminar este cliente.`,
          scope: authResult.scope,
        });
      }
      
      const success = await storage.deleteClient(id);
      
      if (success) {
        res.json({ message: "Client deleted successfully" });
      } else {
        res.status(404).json({ message: "Client not found" });
      }
    } catch (error) {
      console.error("Error deleting client:", error);
      res.status(500).json({ message: "Failed to delete client" });
    }
  });

  // Client Credit Histories
  app.get('/api/clients/:clientId/credit-histories', isAuthenticated, async (req: any, res) => {
    try {
      const { clientId } = req.params;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      // Authorization check - broker can only access own client's histories
      const authResult = await authorizeClientAccess(userId, user?.role || '', clientId);
      if (!authResult.authorized) {
        return res.status(authResult.reason === 'Client not found' ? 404 : 403).json({ message: authResult.reason });
      }
      
      const histories = await storage.getClientCreditHistories(clientId);
      res.json(histories);
    } catch (error) {
      console.error("Error fetching client credit histories:", error);
      res.status(500).json({ message: "Failed to fetch credit histories" });
    }
  });

  app.post('/api/clients/:clientId/credit-histories', isAuthenticated, async (req: any, res) => {
    try {
      const { clientId } = req.params;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      // Authorization check - broker can only add histories to own clients
      const authResult = await authorizeClientAccess(userId, user?.role || '', clientId);
      if (!authResult.authorized) {
        return res.status(authResult.reason === 'Client not found' ? 404 : 403).json({ message: authResult.reason });
      }

      if (!authResult.capabilities.canEditClient) {
        return res.status(403).json({
          message: `Acceso denegado: su nivel de acceso es '${authResult.scope}'. No cuenta con permisos para registrar historiales en este cliente.`,
          scope: authResult.scope,
        });
      }

      
      const historyData = insertClientCreditHistorySchema.parse({
        ...req.body,
        clientId,
        source: 'manual',
      });
      
      const history = await storage.createClientCreditHistory(historyData);
      res.status(201).json(history);
    } catch (error) {
      console.error("Error creating client credit history:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create credit history" });
    }
  });

  // Credits
  app.get('/api/credits', isAuthenticated, requireModuleAndAction('creditos', 'view'), async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const { clientId, status } = req.query;
      
      const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
      let rawCredits: any[] = [];
      
      if (isAdmin) {
        rawCredits = await storage.getCredits({
          clientId: clientId as string,
          status: status as string,
        });
      } else if (user?.role === 'master_broker') {
        const allCredits = await storage.getCredits({
          clientId: clientId as string,
          status: status as string,
        });
        // A Master sees its direct originations and credits historically
        // originated under its network. Current network membership alone must
        // never transfer old credits from another Master or from Casa Matriz.
        rawCredits = allCredits.filter(c => 
          c.brokerId === userId || 
          c.originMasterBrokerId === userId
        );
      } else if (req.tenantContext?.tenant) {
        const tenant = req.tenantContext.tenant;
        const allCredits = await storage.getCredits({
          clientId: clientId as string,
          status: status as string,
        });
        // Shared tenant membership does not authorize every Broker to read
        // another originator's confidential credit.
        rawCredits = allCredits.filter(c => c.brokerId === userId);
      } else {
        rawCredits = await storage.getCredits({
          brokerId: userId,
          clientId: clientId as string,
          status: status as string,
        });
      }

      // Enrich with client, institution and product template details
      const enrichedCredits = await Promise.all(
        rawCredits.map(async (credit) => {
          const client = credit.clientId ? await storage.getClient(credit.clientId) : null;
          const institution = credit.financialInstitutionId ? await storage.getFinancialInstitution(credit.financialInstitutionId) : null;
          const productTemplate = credit.productTemplateId ? await storage.getProductTemplate(credit.productTemplateId) : null;
          const broker = credit.brokerId ? await storage.getUser(credit.brokerId) : null;

          let submission = null;
          let targets: any[] = [];
          if (credit.linkedSubmissionId) {
            submission = await storage.getCreditSubmissionRequest(credit.linkedSubmissionId);
            if (submission) {
              const rawTargets = await storage.getCreditSubmissionTargetsByRequest(submission.id);
              targets = (await Promise.all(rawTargets.map(t => enrichCreditSubmissionTarget(t))))
                .filter(t => canReadCreditSubmission(user, t.request))
                .map(t => projectSubmissionTarget(t, user?.role));
            }
          }

          const prop = (credit.finalProposal as any) || {};
          const isConfirmed = isCreditDisbursementConfirmed(credit);
          const disbursementStatus = isConfirmed
            ? 'confirmed'
            : ((credit.status === 'disbursed' || credit.status === 'dispersed' || credit.status === 'dispersado' || prop.disbursementStatus === 'reported') ? 'reported' : 'unconfirmed');
          const confirmedDisbursedAmount = prop.disbursementConfirmation?.confirmedAmount ??
            (credit as any)?.confirmedDisbursedAmount ?? null;

          return {
            ...credit,
            disbursementStatus,
            isDisbursementConfirmed: isConfirmed,
            confirmedDisbursedAmount,
            client: client ? {
              id: client.id,
              firstName: client.firstName,
              lastName: client.lastName,
              businessName: client.businessName,
              type: client.type,
              rfc: client.rfc,
              email: client.email,
              phone: client.phone,
              monthlyIncome: (client as any).monthlyIncome || client.ingresoMensualPromedio,
              creditScore: (client as any).creditScore,
              yearsInBusiness: client.yearsInBusiness,
            } : null,
            financialInstitution: institution ? {
              id: institution.id,
              name: institution.name,
              logoUrl: (institution as any).logoUrl,
            } : null,
            productTemplate: productTemplate ? {
              id: productTemplate.id,
              name: productTemplate.name,
              category: productTemplate.category,
            } : null,
            broker: broker ? {
              id: broker.id,
              firstName: broker.firstName,
              lastName: broker.lastName,
              email: broker.email,
              isActive: broker.isActive,
              status: broker.status || (broker.isActive ? 'active' : 'inactive'),
            } : null,
            submission: submission ? {
              id: submission.id,
              requestedAmount: submission.requestedAmount,
              purpose: submission.purpose,
              createdAt: submission.createdAt,
              brokerNotes: submission.brokerNotes,
              matchingAnalysis: (submission as any).matchingAnalysis,
            } : null,
            targets,
          };
        })
      );
      
      res.json(enrichedCredits.map(credit => projectSubmissionCredit(credit, user?.role)));
    } catch (error) {
      console.error("Error fetching credits:", error);
      res.status(500).json({ message: "Failed to fetch credits" });
    }
  });

  app.post('/api/credits', isAuthenticated, requireModuleAndAction('creditos', 'edit'), async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);

      const originationCheck = await validateCommercialOriginationAndFormalization({
        callerUser: user,
        callerMembership: req.tenantContext?.membership,
        tenantId: req.tenantContext?.tenant?.id,
        requestedBrokerId: req.body.brokerId,
      });

      if (!originationCheck.allowed) {
        return res.status(originationCheck.statusCode || 403).json({
          code: originationCheck.code,
          message: originationCheck.message,
        });
      }

      // OPE-09: generic create cannot impersonate verified disbursement.
      const claimedProposal = req.body?.finalProposal;
      const verifiedKeys = ["disbursementStatus", "disbursementConfirmation",
        "disbursementTranches", "confirmedDisbursedAmount", "disbursementConfirmedAt",
        "disbursementConfirmedBy"];
      if (["disbursed", "dispersado", "dispersed", "active", "completed", "defaulted"].includes(req.body?.status) ||
          (claimedProposal && typeof claimedProposal === "object" &&
            verifiedKeys.some(key => Object.prototype.hasOwnProperty.call(claimedProposal, key)))) {
        return res.status(409).json({
          code: "DISBURSEMENT_CONFIRMATION_REQUIRED",
          message: "El desembolso sólo puede confirmarse mediante el flujo autorizado de Super Admin.",
        });
      }

      // A generic credit form is NOT an authority for commission splits.
      // Only a published, same-institution offer/version may define economics.
      const rawProposal = (req.body?.finalProposal && typeof req.body.finalProposal === "object" &&
        !Array.isArray(req.body.finalProposal)) ? req.body.finalProposal as Record<string, any> : {};
      // Reject inconsistent identity claims across the credit and its frozen
      // proposal before trusting either source or freezing monetary terms.
      const offeredIds = [rawProposal.institutionProductId, rawProposal.offerId,
        req.body?.institutionProductId].filter((v: unknown) => v !== undefined && v !== null && v !== "");
      const offeredVersions = [rawProposal.versionNumber, req.body?.versionNumber]
        .filter((v: unknown) => v !== undefined && v !== null);
      if ((offeredIds.length > 1 && offeredIds.some((v: unknown) => v !== offeredIds[0])) ||
          (offeredVersions.length > 1 &&
            offeredVersions.some((v: unknown) => Number(v) !== Number(offeredVersions[0])))) {
        return res.status(409).json({ code: "OFFER_VERSION_IDENTITY_MISMATCH" });
      }
      const explicitOfferId = rawProposal.institutionProductId || rawProposal.offerId ||
        req.body?.institutionProductId || null;
      const explicitVersion = rawProposal.versionNumber ?? req.body?.versionNumber ?? null;
      const hasLineage = Boolean(explicitOfferId) || explicitVersion != null;
      // A new direct credit for an institution already offering published
      // products must identify which exact economics apply. Draft exploration
      // without a selected financial institution remains possible.
      if (!hasLineage && req.body?.financialInstitutionId) {
        const catalog = await storage.getInstitutionProducts();
        if (catalog.some(p =>
          p.institutionId === req.body.financialInstitutionId &&
          p.status === "published" && p.isActive !== false)) {
          return res.status(409).json({
            code: "OFFER_VERSION_REQUIRED_FOR_PUBLISHED_INSTITUTION",
            message: "Selecciona un producto y versión publicada de la financiera.",
          });
        }
      }
      const clientEconomicKeys = ["commissionRates", "financiera", "broker", "masterBroker",
        "platformNet", "platformMargin", "platformGrossMargin", "overRate", "sobretasa",
        "networkCommissionRates", "commissionsToApply", "openingCommission",
        "masterBrokerShare", "brokerShare", "netCommission", "totalCommission"];
      if (!hasLineage && clientEconomicKeys.some(key =>
        Object.prototype.hasOwnProperty.call(rawProposal, key))) {
        return res.status(409).json({
          code: "OFFER_VERSION_REQUIRED_FOR_COMMISSION_RATES",
          message: "No se pueden declarar comisiones sin una oferta y versión comercial verificables.",
        });
      }
      let validatedProposal = { ...rawProposal };
      let canonicalFinancialInstitutionId: string | null = req.body?.financialInstitutionId || null;
      if (hasLineage) {
        if (typeof explicitOfferId !== "string" || !explicitOfferId.trim() ||
            !Number.isSafeInteger(Number(explicitVersion)) || Number(explicitVersion) <= 0) {
          return res.status(409).json({ code: "OFFER_VERSION_IDENTITY_INCOMPLETE" });
        }
        const product = await storage.getInstitutionProduct(explicitOfferId);
        if (!product || (req.body?.financialInstitutionId &&
            product.institutionId !== req.body.financialInstitutionId)) {
          return res.status(409).json({ code: "OFFER_VERSION_INSTITUTION_MISMATCH" });
        }
        const versions = await storage.getInstitutionProductVersions(explicitOfferId);
        const currentVersion = versions.find(v => v.versionNumber === Number(explicitVersion) &&
          v.status === "published");
        if (!currentVersion) {
          return res.status(409).json({ code: "OFFER_VERSION_NOT_CURRENT" });
        }
        canonicalFinancialInstitutionId = product.institutionId;
        const rates = (currentVersion.conditions as any)?.commissionRates;
        if (!rates || typeof rates !== "object") {
          return res.status(409).json({ code: "OFFER_COMMISSION_SCHEDULE_UNAVAILABLE" });
        }
        for (const key of clientEconomicKeys) delete validatedProposal[key];
        validatedProposal = {
          ...validatedProposal,
          institutionProductId: explicitOfferId,
          versionNumber: currentVersion.versionNumber,
          financialInstitutionId: product.institutionId,
          commissionRates: rates,
        };
      }

      const creditClientAccess = await validateClientOriginationAccess({
        clientId: req.body?.clientId,
        callerUser: user,
        effectiveBrokerId: originationCheck.brokerId,
        tenantContext: req.tenantContext,
      });
      if (!creditClientAccess.allowed) {
        return res.status(creditClientAccess.statusCode || 403).json({
          code: creditClientAccess.code, message: creditClientAccess.message,
        });
      }

      const creditData = insertCreditSchema.parse({
        ...req.body,
        finalProposal: validatedProposal,
        financialInstitutionId: canonicalFinancialInstitutionId,
        tenantId: req.tenantContext?.tenant?.id || null,
        brokerId: originationCheck.brokerId,
        createdBy: userId,
      });

      // Origin Master for a *new direct credit* must match the storage-side
      // attribution logic. Never rely on a client-supplied Master ID.
      // Formalization ordinarily resolves this ID; fail closed if an
      // inconsistent allowed result reaches this route.
      if (!originationCheck.brokerId) {
        return res.status(409).json({ code: "CREDIT_ORIGINATOR_NOT_VERIFIED" });
      }
      const originator = await storage.getUser(originationCheck.brokerId);
      let effectiveMasterBrokerId: string | null = null;
      if (originator?.role === "master_broker") {
        effectiveMasterBrokerId = originator.id;
      } else if (originator?.role === "broker" && originator.masterBrokerId) {
        const parent = await storage.getUser(originator.masterBrokerId);
        effectiveMasterBrokerId = parent?.role === "master_broker" ? parent.id : null;
      }

      const blocked = await checkOfferCommissionAcceptanceForNewOperation({
        offerId: explicitOfferId, versionNumber: explicitVersion,
        brokerId: creditData.brokerId,
        originMasterBrokerId: effectiveMasterBrokerId,
      });
      if (blocked) return res.status(409).json(blocked);

      const credit = await storage.createCredit(creditData);
      
      // Create notification
      await storage.createNotification({
        userId,
        type: 'credit_created',
        title: 'Nuevo crédito creado',
        message: `Se ha creado un crédito por $${credit.amount}`,
        data: { creditId: credit.id },
      });
      
      res.status(201).json(projectSubmissionCredit(credit, user?.role));
    } catch (error: any) {
      const code = String(error?.message || "");
      if (code.startsWith("OFFER_") || code === "MISSING_ORIGIN_MASTER_FOR_OFFER") {
        return res.status(409).json({ code, message: "Las condiciones de oferta o aceptación necesitan revisión." });
      }
      console.error("Error creating credit:", error);
      res.status(500).json({ message: "Failed to create credit" });
    }
  });

  app.put('/api/credits/:id', isAuthenticated, requireModuleAndAction('creditos', 'edit'), async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      // Authorization check - broker/tenant access
      const authResult = await authorizeCreditAccess(userId, user?.role || '', id, req.tenantContext, 'write');
      if (!authResult.authorized) {
        return res.status(authResult.reason === 'Credit not found' ? 404 : 403).json({ message: authResult.reason });
      }
      
      const oldCredit = authResult.credit;
      // PRE-P0: once created, a credit's client, Broker, tenant, historical
      // origin and linked opportunity are not freely reassignable. This also
      // prevents bypassing immutable economic/commission provenance.
      const creditIdentityFields = [
        "id", "clientId", "brokerId", "tenantId", "createdBy",
        "originMasterBrokerId", "linkedSubmissionId",
        "institutionProductId", "versionNumber",
      ];
      const creditIdentityChanged = creditIdentityFields.some(key =>
        Object.prototype.hasOwnProperty.call(req.body || {}, key) &&
        req.body[key] !== (oldCredit as any)[key]
      );
      if (creditIdentityChanged) {
        return res.status(409).json({
          code: "CREDIT_OWNERSHIP_IMMUTABLE",
          message: "No se puede cambiar el cliente, originador o linaje de un crédito mediante edición general.",
        });
      }
      const creditData = insertCreditSchema.partial().parse(req.body);
      for (const key of creditIdentityFields) delete (creditData as any)[key];

      // OPE-09/10: no generic client can forge official disbursement evidence.
      const incomingProposal = req.body?.finalProposal;
      const protectedFields = ["disbursementStatus", "disbursementConfirmation",
        "disbursementTranches", "confirmedDisbursedAmount", "disbursementConfirmedAt",
        "disbursementConfirmedBy"];
      if (incomingProposal && typeof incomingProposal === "object" &&
          protectedFields.some(key => Object.prototype.hasOwnProperty.call(incomingProposal, key))) {
        return res.status(409).json({
          code: "DISBURSEMENT_EVIDENCE_WRITE_FORBIDDEN",
          message: "La evidencia de confirmación no puede modificarse en la edición general del crédito.",
        });
      }
      if (creditData.status &&
          ["disbursed", "dispersado", "dispersed", "active", "completed", "defaulted"].includes(creditData.status) &&
          !isCreditDisbursementConfirmed(oldCredit)) {
        return res.status(409).json({
          code: "DISBURSEMENT_CONFIRMATION_REQUIRED",
          message: "Se requiere confirmación oficial de desembolso por Super Admin antes de avanzar el estado.",
        });
      }

      // REGLA 1 y 2 (COM-07, COM-16, COM-22): Snapshot comercial inmutable
      if (creditData.finalProposal !== undefined) {
        try {
          creditData.finalProposal = consolidateCommercialProposalSnapshot({
            credit: oldCredit,
            proposalData: creditData.finalProposal,
          });
        } catch (snapErr: any) {
          if (snapErr instanceof ImmutableCommercialSnapshotError) {
            return res.status(409).json({
              message: snapErr.message,
              code: snapErr.code,
              details: snapErr.details,
            });
          }
          throw snapErr;
        }
      } else if (oldCredit.finalProposal && (oldCredit.finalProposal as any).isCommercialSnapshot) {
        // Preservar el snapshot consolidado existente intacto
        creditData.finalProposal = oldCredit.finalProposal;
      }
      
      const credit = await storage.updateCredit(id, creditData);
      
      if (!credit) {
        return res.status(404).json({ message: "Credit not found" });
      }
      
      // Check if status changed to 'dispersado' or 'disbursed'
      const statusChanged = oldCredit.status !== credit.status;
      const isDispersed = credit.status === 'dispersado' || credit.status === 'disbursed';
      
      if (statusChanged && isDispersed) {
        console.log(`[Commission Trigger] Credit ${id} status changed to ${credit.status}`);
        
        // REGLA 1 (COM-21) y REGLA 3 (COM-23): Desembolsos verificables y eliminación de rutas no canónicas.
        // Prohibido utilizar fallbacks a approvedAmount, credit.amount o montos declarados directamente por el frontend.
        // Exigir evidencia confiable de dispersión confirmada en backend.
        // Al no existir integración con Core Bancario (FIN-13/FIN-14 pendiente), se bloquea el cálculo automático
        // y se reporta la dependencia expresamente; no se simulan confirmaciones ni se calculan comisiones arbitrarias.
        console.warn(
          `[COM-21] Cálculo de comisiones bloqueado para crédito ${id}: ` +
          `Se exige evidencia confiable de dispersión bancaria confirmada en servidor. ` +
          `Montos declarados por frontend y fallbacks a approvedAmount/credit.amount están prohibidos. ` +
          `Dependencia requerida: FIN-13 / FIN-14 (Core Bancario / Dispersión Confirmada en Servidor).`
        );
      }
      
      res.json(projectSubmissionCredit(credit, user?.role));
    } catch (error) {
      console.error("Error updating credit:", error);
      res.status(500).json({ message: "Failed to update credit" });
    }
  });

  // REGLAS 1, 2, 3 y 4 (FASE 2B.2A.1 / COM-21 / OPE-09 / PAG-05): Confirmación manual de desembolsos por Super Admin
  app.post('/api/credits/:id/confirm-disbursement', isAuthenticated, requireModuleAndAction('creditos', 'edit'), async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);

      // Exclusividad estricta para Super Admin (Regla 1)
      if (!user || user.role !== 'super_admin') {
        return res.status(403).json({
          message: "Acceso denegado: La validación y confirmación de desembolsos está reservada exclusivamente para Super Admin.",
          code: "FORBIDDEN_SUPER_ADMIN_REQUIRED",
        });
      }

      const credit = await storage.getCredit(id);
      if (!credit) {
        return res.status(404).json({ message: "Crédito no encontrado" });
      }

      // REGLA 1 (OPE-10/11/12): Elegibilidad operativa del crédito
      if (['cancelled', 'rejected'].includes(credit.status)) {
        return res.status(400).json({
          message: `Operación no elegible para confirmación de desembolso: El crédito se encuentra en estado '${credit.status}'.`,
          code: "CREDIT_STATUS_INELIGIBLE",
        });
      }

      // REGLA 4: Atribución Histórica y Elegibilidad
      if (!credit.brokerId) {
        return res.status(400).json({
          message: "Operación no elegible para confirmación de desembolso: Falta el Bróker originador.",
          code: "MISSING_ORIGIN_BROKER",
        });
      }

      const existingProposal = (credit.finalProposal as any) || {};
      const financialInstitutionId = credit.financialInstitutionId || existingProposal.financialInstitutionId;
      if (!financialInstitutionId) {
        return res.status(400).json({
          message: "Operación no elegible para confirmación de desembolso: Falta la Financiera oferente.",
          code: "MISSING_FINANCIAL_INSTITUTION",
        });
      }

      const { confirmedAmount, notes, dispersalIndex, idempotencyKey } = req.body;

      // Validación estricta del monto efectivamente desembolsado
      if (
        confirmedAmount === undefined ||
        confirmedAmount === null ||
        isNaN(Number(confirmedAmount)) ||
        Number(confirmedAmount) <= 0 ||
        !Number.isFinite(Number(confirmedAmount))
      ) {
        return res.status(400).json({
          message: "El monto efectivamente dispersado debe ser un número positivo mayor a cero.",
          code: "INVALID_CONFIRMED_AMOUNT",
        });
      }

      const validConfirmedAmount = Number(confirmedAmount);
      const validDispersalIndex = dispersalIndex != null && !isNaN(Number(dispersalIndex)) && Number(dispersalIndex) > 0
        ? Number(dispersalIndex)
        : 1;

      // Real PostgreSQL path (OPE-10/11): lock credit and persist tranche,
      // commission and two audit entries in one transaction. MemStorage keeps
      // the legacy route exclusively for in-memory tests.
      const transactionalStorage: IStorage = storage;
      if (transactionalStorage.confirmCreditDisbursementAtomic) {
        try {
          const existingProposal = (credit.finalProposal as any) || {};
          const commType = req.body?.commissionType || existingProposal.commissionsToApply?.[0] || "apertura";
          const institutionId = credit.financialInstitutionId || existingProposal.financialInstitutionId;
          const preview = await calculateAndPersistCascadingCommission({
            credit,
            creditId: credit.id,
            commissionType: commType,
            confirmedDisbursedAmount: validConfirmedAmount,
            dispersalIndex: validDispersalIndex,
            idempotencyKey: idempotencyKey ? String(idempotencyKey).trim() : undefined,
            financialInstitutionId: institutionId,
            institutionProductId: existingProposal.institutionProductId || existingProposal.offerId || null,
            versionNumber: existingProposal.versionNumber ?? null,
            performedBy: userId,
            previewOnly: true,
          });
          const result = await transactionalStorage.confirmCreditDisbursementAtomic({
            creditId: credit.id,
            expectedProposal: credit.finalProposal,
            expectedAmount: credit.amount,
            confirmedAmount: validConfirmedAmount,
            dispersalIndex: validDispersalIndex,
            commission: preview,
            performedBy: userId,
            actorEmail: user.email,
            notes: notes ? String(notes).trim() : null,
            idempotencyKey: idempotencyKey ? String(idempotencyKey).trim() : null,
          });
          // Never send notifications until PostgreSQL COMMIT has succeeded.
          if (!result.alreadyConfirmed && credit.brokerId) {
            try {
              const notif = await storage.createNotification({
                userId: credit.brokerId,
                type: "disbursement_confirmed",
                title: "Desembolso confirmado y comisión calculada",
                message: `Confirmación de desembolso por $${validConfirmedAmount.toFixed(2)} MXN.`,
                relatedEntityType: "credit",
                relatedEntityId: credit.id,
                priority: "high",
              });
              broadcastToUser(credit.brokerId, { type: "notification", notification: notif });
            } catch (notificationErr) {
              console.warn("[Disbursement] Committed but notification failed:", notificationErr);
            }
          }
          return res.json({
            message: result.alreadyConfirmed
              ? "Este tramo ya había sido confirmado."
              : "Desembolso confirmado con comisión y auditoría atómicas.",
            ...result,
          });
        } catch (error: any) {
          const code = String(error?.message || "");
          if (error instanceof MissingCommissionRateError ||
              error instanceof MissingOfferVersionError ||
              error instanceof UnauthorizedDistributionError ||
              error instanceof UnconfirmedDispersalAmountError) {
            return res.status(400).json({
              message: error.message, code: error.code || "CANONICAL_CALCULATION_ERROR",
            });
          }
          if (code.startsWith("DISBURSEMENT_") || code.startsWith("OFFER_") ||
              code === "MISSING_ORIGIN_MASTER_FOR_OFFER" ||
              code === "TOTAL_DISBURSEMENT_EXCEEDS_APPROVED_AMOUNT") {
            return res.status(409).json({
              message: "No pudo confirmarse el tramo: conflicto de estado, monto o idempotencia.",
              code,
            });
          }
          throw error;
        }
      }

      // REGLA 2: Idempotencia y Multidispersión
      const existingTranches: any[] = Array.isArray(existingProposal.disbursementTranches)
        ? existingProposal.disbursementTranches
        : (existingProposal.disbursementConfirmation ? [existingProposal.disbursementConfirmation] : []);

      // 1. Idempotency Key check
      if (idempotencyKey) {
        const existingComms = await storage.getCommissions({ idempotencyKey: String(idempotencyKey).trim() });
        if (existingComms.length > 0) {
          return res.json({
            message: "Desembolso ya confirmado previamente con esta clave de idempotencia.",
            credit,
            commission: existingComms[0],
            alreadyConfirmed: true,
          });
        }
      }

      // 2. Comprobar si el tramo específico ya fue confirmado previamente
      const existingTranche = existingTranches.find((t: any) => Number(t.dispersalIndex || 1) === validDispersalIndex);
      if (existingTranche) {
        const prevAmount = Number(existingTranche.confirmedAmount || 0);
        if (Math.abs(prevAmount - validConfirmedAmount) < 0.01) {
          const commType = req.body?.commissionType || existingProposal.commissionsToApply?.[0] || 'apertura';
          const resolvedCommType = validDispersalIndex > 1 ? `${commType}_parcial_${validDispersalIndex}` : commType;
          const existingComms = await storage.getCommissions({ creditId: credit.id });
          const matchComm = existingComms.find(c => c.commissionType === resolvedCommType || c.id === existingTranche.commissionId);
          return res.json({
            message: "Este tramo de desembolso ya se encuentra confirmado con el mismo importe.",
            credit,
            commission: matchComm || existingComms[0] || null,
            alreadyConfirmed: true,
          });
        } else {
          return res.status(400).json({
            message: `Prohibido alterar el importe de un tramo confirmado: El tramo #${validDispersalIndex} ya fue confirmado previamente por $${prevAmount.toFixed(2)} MXN y es inmutable.`,
            code: "CANNOT_ALTER_CONFIRMED_TRANCHE_AMOUNT",
            details: {
              dispersalIndex: validDispersalIndex,
              previousConfirmedAmount: prevAmount,
              attemptedAmount: validConfirmedAmount,
            },
          });
        }
      }

      // 3. Impedir sobrepasar el monto máximo autorizado del crédito
      const maxCreditAmount = Number(credit.amount || existingProposal.approvedAmount || 0);
      const otherTranchesTotal = existingTranches
        .filter((t: any) => Number(t.dispersalIndex || 1) !== validDispersalIndex)
        .reduce((sum: number, t: any) => sum + Number(t.confirmedAmount || 0), 0);

      if (maxCreditAmount > 0 && (otherTranchesTotal + validConfirmedAmount) > (maxCreditAmount + 0.01)) {
        return res.status(400).json({
          message: `El monto acumulado de desembolsos ($${(otherTranchesTotal + validConfirmedAmount).toFixed(2)}) sobrepasa el monto máximo autorizado del crédito ($${maxCreditAmount.toFixed(2)}).`,
          code: "TOTAL_DISBURSEMENT_EXCEEDS_APPROVED_AMOUNT",
          details: {
            maxCreditAmount,
            otherTranchesTotal,
            attemptedAmount: validConfirmedAmount,
            accumulatedTotal: otherTranchesTotal + validConfirmedAmount,
          },
        });
      }

      // REGLA 1: Atomicidad y Pre-validación económica antes de actualizar el estado
      const commType = req.body?.commissionType || existingProposal.commissionsToApply?.[0] || 'apertura';
      const offerId = existingProposal.institutionProductId || existingProposal.offerId || (credit as any).institutionProductId || null;
      const versionNumber = existingProposal.versionNumber ?? null;
      const proposalCommissionRates = existingProposal.commissionRates || undefined;
      const institution = financialInstitutionId ? await storage.getFinancialInstitution(financialInstitutionId) : undefined;
      const historicalMasterBrokerId = credit.originMasterBrokerId || existingProposal.originMasterBrokerId || null;

      try {
        await resolveOfferVersionCommissionRates({
          offerId,
          versionNumber,
          commissionType: commType,
          proposalCommissionRates,
          institution,
          hasMasterBroker: Boolean(historicalMasterBrokerId),
          isMasterDirect: Boolean(historicalMasterBrokerId && credit.brokerId && String(historicalMasterBrokerId) === String(credit.brokerId)),
        });
      } catch (preCheckErr: any) {
        if (
          preCheckErr instanceof MissingCommissionRateError ||
          preCheckErr instanceof MissingOfferVersionError ||
          preCheckErr instanceof UnauthorizedDistributionError
        ) {
          return res.status(400).json({
            message: preCheckErr.message,
            code: preCheckErr.code || "CANONICAL_CALCULATION_ERROR",
            details: (preCheckErr as any).details || null,
          });
        }
      }

      // Estructurar el nuevo tramo e historial
      const newTranche = {
        dispersalIndex: validDispersalIndex,
        confirmedAmount: validConfirmedAmount,
        confirmedAt: new Date().toISOString(),
        confirmedBy: userId,
        confirmedByEmail: user.email,
        notes: notes ? String(notes).trim() : null,
        idempotencyKey: idempotencyKey ? String(idempotencyKey).trim() : null,
        status: 'confirmed',
        commissionId: undefined as string | undefined,
      };

      const updatedTranches = [
        ...existingTranches.filter((t: any) => Number(t.dispersalIndex || 1) !== validDispersalIndex),
        newTranche,
      ].sort((a, b) => Number(a.dispersalIndex || 1) - Number(b.dispersalIndex || 1));

      const totalDisbursedSoFar = updatedTranches.reduce((sum, t) => sum + Number(t.confirmedAmount || 0), 0);

      const updatedProposal = {
        ...existingProposal,
        disbursementConfirmation: newTranche,
        disbursementTranches: updatedTranches,
        disbursementStatus: 'confirmed',
        confirmedDisbursedAmount: totalDisbursedSoFar,
      };

      // Respaldo de estado anterior para rollback atómico
      const previousCreditState = {
        status: credit.status,
        finalProposal: credit.finalProposal,
        notes: credit.notes,
      };

      let updatedCredit = await storage.updateCredit(credit.id, {
        status: 'disbursed',
        finalProposal: updatedProposal,
        notes: notes ? (credit.notes ? `${credit.notes} | Confirmación: ${notes}` : `Confirmación: ${notes}`) : credit.notes,
      });

      if (updatedCredit) {
        (updatedCredit as any).disbursementStatus = 'confirmed';
        (updatedCredit as any).confirmedDisbursedAmount = totalDisbursedSoFar;
        (updatedCredit as any).disbursementConfirmedAt = new Date();
        (updatedCredit as any).disbursementConfirmedBy = userId;
      }

      // Cálculo y persistencia canónica con protección de rollback
      let commission: any;
      try {
        commission = await calculateAndPersistCascadingCommission({
          credit: updatedCredit || credit,
          creditId: credit.id,
          commissionType: commType,
          confirmedDisbursedAmount: validConfirmedAmount,
          dispersalIndex: validDispersalIndex,
          idempotencyKey: idempotencyKey ? String(idempotencyKey).trim() : undefined,
          performedBy: userId,
        });

        // Enlazar id de comisión al tramo
        newTranche.commissionId = commission.id;
        await storage.updateCredit(credit.id, {
          finalProposal: {
            ...updatedProposal,
            disbursementConfirmation: newTranche,
            disbursementTranches: updatedTranches,
          },
        });

        await storage.createCommissionAuditLog({
          commissionId: commission.id,
          performedBy: userId,
          action: 'disbursement_confirmed',
          previousStatus: commission.status,
          newStatus: commission.status,
          details: {
            actorRole: user.role,
            confirmedAmount: validConfirmedAmount,
            dispersalIndex: validDispersalIndex,
            confirmedAt: newTranche.confirmedAt,
            notes: notes ? String(notes).trim() : null,
            creditId: credit.id,
          },
        });

        // Notificaciones a administradores y bróker originador
        try {
          if (credit.brokerId) {
            const notif = await storage.createNotification({
              userId: credit.brokerId,
              type: 'disbursement_confirmed',
              title: '✅ Desembolso Confirmado y Comisión Calculada',
              message: `El desembolso por $${validConfirmedAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN fue confirmado por Super Admin y la comisión fue calculada exitosamente.`,
              relatedEntityType: 'credit',
              relatedEntityId: credit.id,
              priority: 'high',
            });
            broadcastToUser(credit.brokerId, { type: 'notification', notification: notif });
          }
        } catch (notifErr) {
          console.warn("[Notification] Error notifying broker of confirmed disbursement:", notifErr);
        }

        res.json({
          message: "Desembolso confirmado exitosamente y comisión calculada mediante servicio canónico.",
          credit: updatedCredit || credit,
          commission,
        });
      } catch (calcErr: any) {
        // ROLLBACK ATÓMICO (Regla 1): Restaurar estado del crédito
        console.error("[Atomic Rollback] Error en cálculo de comisión, revirtiendo estado del crédito:", calcErr);
        try {
          await storage.updateCredit(credit.id, {
            status: previousCreditState.status,
            finalProposal: previousCreditState.finalProposal as any,
            notes: previousCreditState.notes,
          });
        } catch (rbErr) {
          console.error("[Atomic Rollback Failure] Error revirtiendo crédito:", rbErr);
        }

        if (
          calcErr instanceof MissingCommissionRateError ||
          calcErr instanceof MissingOfferVersionError ||
          calcErr instanceof UnauthorizedDistributionError ||
          calcErr instanceof UnconfirmedDispersalAmountError
        ) {
          return res.status(400).json({
            message: calcErr.message,
            code: calcErr.code || "CANONICAL_CALCULATION_ERROR",
            details: (calcErr as any).details || null,
          });
        }

        return res.status(500).json({
          message: "Fallo en la persistencia de comisión. El crédito no fue confirmado.",
          code: "COMMISSION_PERSISTENCE_FAILED",
        });
      }
    } catch (error) {
      console.error("Error confirming credit disbursement:", error);
      res.status(500).json({ message: "Error interno al confirmar el desembolso del crédito" });
    }
  });

  app.get('/api/credits/client/:clientId', isAuthenticated, requireModuleAndAction('creditos', 'view'), async (req: any, res) => {
    try {
      const { clientId } = req.params;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      // Apply the SAME immutable attribution rule used by the global list.
      // Historical Master may view its origin credits after Broker transfer;
      // current Master must not inherit them by current network membership.
      const allCredits = await storage.getCredits({ clientId });
      const principal = { id: userId, role: user?.role };
      const credits = allCredits.filter(credit => canViewCreditByOrigin(principal, credit));

      res.json(credits.map(credit => projectSubmissionCredit(credit, user?.role)));
    } catch (error) {
      console.error("Error fetching client credits:", error);
      res.status(500).json({ message: "Failed to fetch client credits" });
    }
  });

  // Preview uses the same engine and published offer versions as saved requests.
  app.get('/api/matching/preview', isAuthenticated, requireModuleAndAction('creditos', 'view'), async (req:any,res) => {
    try {
      const user = await storage.getUser(req.user?.claims?.sub || req.user?.id);
      const {clientId,productTemplateId,amount} = req.query;
      if(!user || typeof clientId !== "string" || typeof productTemplateId !== "string" || !productTemplateId ||
        typeof amount !== "string" || !/^\d+(?:\.\d+)?$/.test(amount) || !Number.isFinite(Number(amount)) || Number(amount)<=0) {
        return res.status(400).json({message:"Selecciona cliente, producto y un monto válido."});
      }
      const access = await authorizeClientAccess(user.id,user.role,clientId,req.tenantContext);
      if(!access.authorized || !access.client)return res.status(access.reason==='Client not found'?404:403).json({message:"Sin acceso al expediente solicitado."});
      const template = await storage.getProductTemplate(productTemplateId);
      if(!template || template.isActive===false)return res.status(400).json({message:"Selecciona un producto activo."});
      const result = await matchPublishedCatalog(storage,{client:access.client,credit:{amount:Number(amount)}},productTemplateId);
      return res.json(result);
    }catch(error){return res.status(500).json({message:"No fue posible evaluar las ofertas publicadas."});}
  });

  // Matching M2 — consultas read-only para créditos y solicitudes independientes.
  // Se usan exclusivamente versiones PUBLICADAS y vigentes. Sin decisiones automáticas.
  app.get(
    ['/api/credits/:id/matching', '/api/credit-submissions/:id/matching'],
    isAuthenticated, requireModuleAndAction('creditos', 'view'),
    async (req: any, res) => {
      try {
        const userId = req.user?.claims?.sub || req.user?.id;
        const user = await storage.getUser(userId);
        if (!user) return res.status(403).json({ message: 'Usuario no autorizado' });

        const isSubmission = req.path.startsWith('/api/credit-submissions/');
        let applicationRecord: any;
        if (!isSubmission) {
          const access = await authorizeCreditAccess(userId, user.role, req.params.id, req.tenantContext);
          if (!access.authorized || !access.credit) {
            return res.status(access.reason === 'Credit not found' ? 404 : 403)
              .json({ message: 'Sin acceso al crédito solicitado' });
          }
          applicationRecord = access.credit;
        } else {
          const submission = await storage.getCreditSubmissionRequest(req.params.id);
          if (!submission) return res.status(404).json({ message: 'Solicitud no encontrada' });

          // No bastan el módulo o el identificador: se necesita propiedad comercial y tenant.
          const tenantId = req.tenantContext?.tenant?.id;
          const owner = submission.brokerId === userId;
          const networkMaster = user.role === 'master_broker' &&
            submission.originMasterBrokerId === userId && tenantId &&
            submission.tenantId === tenantId;
          const scopedAdmin = user.role === 'admin' && tenantId &&
            submission.tenantId === tenantId;
          if (user.role !== 'super_admin' && !owner && !networkMaster && !scopedAdmin) {
            return res.status(403).json({ message: 'Sin acceso a esta solicitud' });
          }
          applicationRecord = {
            ...submission,
            // Las solicitudes independientes aún no tienen todos los campos de credits:
            // sólo normalizar lo capturado, nunca inventar plazo ni evaluación.
            amount: submission.requestedAmount,
            term: (submission as any).term ?? null,
          };
        }

        const client = await storage.getClient(applicationRecord.clientId);
        if (!client) return res.status(404).json({ message: 'Expediente no encontrado' });
        if (applicationRecord.tenantId && client.tenantId &&
            String(applicationRecord.tenantId) !== String(client.tenantId)) {
          return res.status(403).json({ message: 'Expediente fuera del tenant' });
        }

        const result = await matchPublishedCatalog(storage,{credit:applicationRecord,client},applicationRecord.productTemplateId || undefined);
        return res.json({requestId:req.params.id,requestType:isSubmission?'credit_submission_request':'credit',clientId:client.id,...result});
      } catch (error) {
        console.error('[Matching] Error de evaluación:', error);
        return res.status(500).json({ message: 'No fue posible evaluar las ofertas' });
      }
    }
  );

  // Re-gestion (expiring credits for renewal)
  app.get('/api/re-gestion', isAuthenticated, requireModuleAndAction('creditos', 'view'), async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const expiringCredits = await storage.getExpiringCredits(90); // Next 90 days
      
      // Admin and super_admin can see all opportunities, brokers only see their own
      const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
      const userExpiringCredits = isAdmin 
        ? expiringCredits 
        : expiringCredits.filter(c => c.brokerId === userId);
      
      const opportunities = userExpiringCredits.map(credit => ({
        id: credit.id,
        clientId: credit.clientId,
        currentAmount: credit.amount,
        remainingBalance: credit.remainingBalance,
        endDate: credit.endDate,
        paymentHistory: credit.paymentHistory,
        // Calculate potential new credit and savings
        suggestedAmount: (parseFloat(credit.amount || '0') * 1.2).toFixed(2),
        estimatedSavings: (parseFloat(credit.paymentAmount || '0') * 0.15).toFixed(2),
      }));
      
      res.json(opportunities);
    } catch (error) {
      console.error("Error fetching re-gestion opportunities:", error);
      res.status(500).json({ message: "Failed to fetch re-gestion opportunities" });
    }
  });

  // Financial Institutions
  app.get('/api/financial-institutions', isAuthenticated, requireAnyModule('financieras', 'creditos', 'aprobaciones', 'sistema_productos'), async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || req.user?.id;
      const user = await storage.getUser(userId);
      const institutions = await storage.getFinancialInstitutions(userId);

      let networkRates: any = null;
      // If user is a broker belonging to a Master Broker, fetch assigned network rates
      if (user?.role === 'broker' && user?.masterBrokerId) {
        const masterBroker = await storage.getUser(user.masterBrokerId);
        networkRates = (masterBroker?.networkCommissionRates as any) || {};
      }

      const role = user?.role || 'broker';
      const sanitized = institutions.map((inst: any) =>
        projectFinancialInstitutionByRole(inst, role, networkRates)
      );

      res.json(sanitized);
    } catch (error) {
      console.error("Error fetching financial institutions:", error);
      res.status(500).json({ message: "Failed to fetch financial institutions" });
    }
  });

  // Get single financial institution by ID
  app.get('/api/financial-institutions/:id', isAuthenticated, requireModuleAndAction('financieras', 'view'), async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user?.claims?.sub || req.user?.id;
      const user = await storage.getUser(userId);
      // Este endpoint es del catálogo administrativo; los Brokers consultan productos/ofertas autorizadas.
      if (!user || (user.role !== 'super_admin' && user.role !== 'admin')) {
        return res.status(403).json({ message: "Catálogo financiero administrativo no autorizado." });
      }
      const institution: any = await storage.getFinancialInstitution(id);
      
      if (!institution) {
        return res.status(404).json({ message: 'Financial institution not found' });
      }

      const sanitized = projectFinancialInstitutionByRole(institution, user.role);
      
      res.json(sanitized);
    } catch (error) {
      console.error("Error fetching financial institution:", error);
      res.status(500).json({ message: "Failed to fetch financial institution" });
    }
  });

  app.post('/api/financial-institutions', isAuthenticated, requireModuleAndAction('financieras', 'edit'), async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const user = await storage.getUser(userId);
      
      // Check permissions - only admin and super_admin can create financial institutions
      if (!user || (user.role !== 'super_admin' && user.role !== 'admin')) {
        return res.status(403).json({ message: 'Insufficient permissions' });
      }
      
      const adminOnlyEconomicFields = [
        "commissionRate", "commissionRates", "openingCommissionRate",
        "brokerCommissionRate", "masterBrokerCommissionRate",
        "overrateCommissionRate", "overRate", "sobretasa",
        "platformMargin", "appShare", "platformCommissionRate",
      ];
      if (user.role !== "super_admin" &&
          adminOnlyEconomicFields.some(key => Object.prototype.hasOwnProperty.call(req.body || {}, key))) {
        return res.status(403).json({
          code: "FINANCIAL_INTERNAL_RATE_SUPER_ADMIN_REQUIRED",
          message: "Sólo Super Admin puede establecer condiciones económicas internas.",
        });
      }
      const institutionData = insertFinancialInstitutionSchema.parse({
        ...req.body,
        createdBy: userId,
        createdByAdmin: true,
      });
      
      const institution = await storage.createFinancialInstitution(institutionData);
      res.status(201).json(projectFinancialInstitutionByRole(institution, user.role));
    } catch (error) {
      console.error("Error creating financial institution:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: 'Invalid data', errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to create financial institution" });
      }
    }
  });

  // Toggle financial institution active status
  app.patch('/api/financial-institutions/:id/toggle-status', isAuthenticated, requireModuleAndAction('financieras', 'edit'), async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user?.claims?.sub;
      const user = await storage.getUser(userId);

      // Check permissions
      if (!user || (user.role !== 'super_admin' && user.role !== 'admin')) {
        return res.status(403).json({ message: 'Insufficient permissions' });
      }

      const institution = await storage.getFinancialInstitution(id);
      if (!institution) {
        return res.status(404).json({ message: 'Financial institution not found' });
      }

      const updatedInstitution = await storage.updateFinancialInstitution(id, {
        isActive: !institution.isActive
      });

      // Keep product catalog coherent: if institution is deactivated, force all its products inactive.
      if (updatedInstitution && updatedInstitution.isActive === false) {
        const linkedProducts = await storage.getInstitutionProducts(id);
        for (const product of linkedProducts) {
          if (product.isActive) {
            await storage.updateInstitutionProduct(product.id, { isActive: false });
          }
        }
      }

      res.json(projectFinancialInstitutionByRole(updatedInstitution, user.role));
    } catch (error) {
      console.error("Error toggling financial institution status:", error);
      res.status(500).json({ message: "Failed to toggle financial institution status" });
    }
  });

  // Update financial institution data
  app.patch('/api/financial-institutions/:id', isAuthenticated, requireModuleAndAction('financieras', 'edit'), async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user?.claims?.sub;
      const user = await storage.getUser(userId);

      // Check permissions
      if (!user || (user.role !== 'super_admin' && user.role !== 'admin')) {
        return res.status(403).json({ message: 'Insufficient permissions' });
      }

      const institution = await storage.getFinancialInstitution(id);
      if (!institution) {
        return res.status(404).json({ message: 'Financial institution not found' });
      }

      // Protect internal rates and margins regardless of module visibility.
      const superAdminRateFields = [
        "commissionRate", "commissionRates", "openingCommissionRate",
        "masterBrokerCommissionRate", "brokerCommissionRate",
        "overrateCommissionRate", "overRate", "sobretasa",
        "platformMargin", "appShare", "platformCommissionRate",
      ];
      if (user.role !== "super_admin" &&
          superAdminRateFields.some(key => Object.prototype.hasOwnProperty.call(req.body || {}, key))) {
        return res.status(403).json({
          code: "FINANCIAL_INTERNAL_RATE_SUPER_ADMIN_REQUIRED",
          message: "Sólo Super Admin puede cambiar comisiones o márgenes internos.",
        });
      }

      // Parse update data directly from request body
      const updateData = req.body;
      const touchesLegacyRates = Object.prototype.hasOwnProperty.call(updateData, "commissionRates") ||
        Object.prototype.hasOwnProperty.call(updateData, "commissionRate");
      if (touchesLegacyRates) {
        // COM-28: all real commercial rates belong to an institution's
        // individually published OFFER VERSION, never a global institution rate.
        // Prevent modifying a legacy fallback after it could affect an existing
        // proposal, credit or network commission agreement.
        if (user.role !== "super_admin") {
          return res.status(403).json({
            code: "OFFER_COMMISSION_SUPER_ADMIN_REQUIRED",
            message: "Las comisiones financieras sólo pueden ser modificadas por Super Admin.",
          });
        }
        const offers = await storage.getInstitutionProducts(id);
        let hasPublishedOffer = false;
        for (const offer of offers) {
          const versions = await storage.getInstitutionProductVersions(offer.id);
          if (versions.some(v => ["published", "superseded"].includes(v.status))) {
            hasPublishedOffer = true;
            break;
          }
        }
        const creditsForInstitution = (await storage.getCredits({}))
          .some(c => c.financialInstitutionId === id);
        if (hasPublishedOffer || creditsForInstitution) {
          return res.status(409).json({
            code: "OFFER_SCOPED_COMMISSION_VERSION_REQUIRED",
            message: "Esta financiera ya tiene operaciones u ofertas publicadas. Las comisiones se modifican creando una nueva versión de cada oferta afectada; no editando tasas generales.",
          });
        }
      }

      // Validate rate hierarchies and bounds if commissionRates or commissionRate is provided
      if (updateData.commissionRates || updateData.commissionRate !== undefined) {
        const finRate = parseFloat(
          updateData.commissionRate ?? 
          updateData.commissionRates?.financiera?.apertura ?? 
          updateData.commissionRates?.superAdmin?.apertura ?? 
          (institution as any).commissionRates?.financiera?.apertura ?? 
          (institution as any).commissionRates?.superAdmin?.apertura ?? 
          (institution as any).commissionRate ?? 
          '0'
        );
        const mbRate = parseFloat(
          updateData.commissionRates?.masterBroker?.apertura ?? 
          (institution as any).commissionRates?.masterBroker?.apertura ?? 
          '0'
        );
        const brkRate = parseFloat(
          updateData.commissionRates?.broker?.apertura ?? 
          (institution as any).commissionRates?.broker?.apertura ?? 
          '0'
        );

        if (finRate < 0 || mbRate < 0 || brkRate < 0 || isNaN(finRate) || isNaN(mbRate) || isNaN(brkRate)) {
          return res.status(400).json({ message: 'Los porcentajes de comisión no pueden ser negativos o inválidos' });
        }

        if (finRate > 0) {
          if (mbRate > finRate) {
            return res.status(400).json({ 
              message: `La tasa para Master Broker (${mbRate}%) no puede ser superior a la comisión que paga la financiera a Crédito Negocios (${finRate}%)` 
            });
          }
          if (brkRate > finRate) {
            return res.status(400).json({ 
              message: `La tasa para Broker Directo (${brkRate}%) no puede ser superior a la comisión que paga la financiera a Crédito Negocios (${finRate}%)` 
            });
          }
        }
      }

      const updatedInstitution = await storage.updateFinancialInstitution(id, updateData);

      // A legacy institution-only draft update has no published offers or
      // credits to affect. Do NOT broadcast a false global contract change.
      // Once an offer is published, its commission changes require its own
      // versioned publication workflow (not this endpoint).

      res.json(projectFinancialInstitutionByRole(updatedInstitution, user.role));
    } catch (error) {
      console.error("Error updating financial institution:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: 'Invalid data', errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to update financial institution" });
      }
    }
  });

  // Delete financial institution (Admin / SuperAdmin only)
  app.delete('/api/financial-institutions/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user?.claims?.sub || req.user?.id;
      const user = await storage.getUser(userId);

      if (!user || (user.role !== 'super_admin' && user.role !== 'admin')) {
        return res.status(403).json({ message: 'Insufficient permissions' });
      }

      const institution = await storage.getFinancialInstitution(id);
      if (!institution) {
        return res.status(404).json({ message: 'Financial institution not found' });
      }

      const success = await storage.deleteFinancialInstitution(id);
      if (!success) {
        return res.status(500).json({ message: 'Failed to delete financial institution' });
      }

      res.json({ success: true, message: `Institución ${institution.name} eliminada exitosamente` });
    } catch (error) {
      console.error("Error deleting financial institution:", error);
      res.status(500).json({ message: "Failed to delete financial institution" });
    }
  });
  
  // Commission calculation endpoint
  app.get('/api/financial-institutions/:id/commission-calculation', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { amount } = req.query;
      
      if (!amount) {
        return res.status(400).json({ message: 'Amount is required' });
      }
      
      const userId = req.user?.claims?.sub;
      const user = await storage.getUser(userId);
      const institution = await storage.getFinancialInstitution(id);
      
      if (!institution) {
        return res.status(404).json({ message: 'Financial institution not found' });
      }
      
      const creditAmount = parseFloat(amount as string);
      
      // Calculate commissions
      const isSuperAdmin = user?.role === 'super_admin';
      const openingCommission = (creditAmount * (parseFloat(institution.openingCommissionRate || "0"))) / 100;
      const overrateCommission = isSuperAdmin
        ? (creditAmount * (parseFloat(institution.overrateCommissionRate || "0"))) / 100
        : 0;
      const totalCommission = openingCommission + overrateCommission;
      
      // Calculate distribution based on user role and institution configuration
      let userCommission = totalCommission;
      let masterBrokerCommission = 0;
      
      if (institution.createdByAdmin && user?.role === 'broker' && user?.masterBrokerId) {
        // If it's an admin-created institution and user is a broker with master broker
        const brokerRate = parseFloat(institution.brokerCommissionRate || "100");
        const masterRate = parseFloat(institution.masterBrokerCommissionRate || "0");
        
        userCommission = (totalCommission * brokerRate) / 100;
        masterBrokerCommission = (totalCommission * masterRate) / 100;
      }
      
      // Calculate additional costs
      const additionalCosts = Array.isArray(institution.additionalCosts) ? institution.additionalCosts : [];
      let totalAdditionalCosts = 0;
      
      additionalCosts.forEach((cost: any) => {
        if (cost.type === 'percentage') {
          totalAdditionalCosts += (creditAmount * cost.amount) / 100;
        } else {
          totalAdditionalCosts += cost.amount;
        }
      });
      
      const finalCommission = userCommission - totalAdditionalCosts;
      
      const calculationResult: any = {
        creditAmount,
        openingCommission,
        totalCommission,
        userCommission,
        masterBrokerCommission,
        additionalCosts: totalAdditionalCosts,
        finalCommission: Math.max(0, finalCommission),
        breakdown: {
          openingRate: institution.openingCommissionRate || 0,
          brokerRate: institution.brokerCommissionRate || 100,
          masterBrokerRate: institution.masterBrokerCommissionRate || 0,
          costs: additionalCosts
        }
      };

      if (isSuperAdmin) {
        calculationResult.overrateCommission = overrateCommission;
        calculationResult.breakdown.overrateRate = institution.overrateCommissionRate || 0;
      }

      res.json(calculationResult);
    } catch (error) {
      console.error('Error calculating commission:', error);
      res.status(500).json({ message: 'Failed to calculate commission' });
    }
  });

  // Financial Institution Requests (broker requests to add new institutions)
  app.post('/api/financial-institutions/request', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      const requestData = insertFinancialInstitutionRequestSchema.parse({
        ...req.body,
        brokerId: userId,
      });
      
      const request = await storage.createFinancialInstitutionRequest(requestData);
      
      // Create notifications for all admins
      const requestingUser = await storage.getUser(userId);
      let masterBrokerText = "";
      if (requestingUser?.masterBrokerId) {
        const masterBroker = await storage.getUser(requestingUser.masterBrokerId);
        if (masterBroker) {
          masterBrokerText = ` (Red de Master Broker: ${masterBroker.firstName || ''} ${masterBroker.lastName || ''}`.trim() + `)`;
        }
      }
      const brokerName = requestingUser ? `${requestingUser.firstName || ''} ${requestingUser.lastName || ''}`.trim() || requestingUser.email : 'Un broker';

      const allUsers = await storage.getAllUsers();
      const admins = allUsers.filter(u => u.role === 'admin' || u.role === 'super_admin');
      
      for (const admin of admins) {
        await storage.createNotification({
          userId: admin.id,
          type: 'institution_request',
          title: 'Nueva solicitud de financiera',
          message: `El broker ${brokerName}${masterBrokerText} ha solicitado agregar la financiera: ${requestData.institutionName}`,
          data: { requestId: request.id, brokerId: userId, brokerName },
        });
      }
      
      res.status(201).json(request);
    } catch (error) {
      console.error("Error creating financial institution request:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: 'Invalid data', errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to create financial institution request" });
      }
    }
  });

function maskCLABE(clabe?: string | null): string | null {
  if (!clabe) return null;
  const str = String(clabe).trim();
  if (str.length < 4) return '****';
  return '*'.repeat(Math.max(0, str.length - 4)) + str.slice(-4);
}

  // Commissions and STP payments
  app.get('/api/commissions', isAuthenticated, requireModuleAndAction('comisiones', 'view'), async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      // Commercial origination check: collaborators with canOriginate: false cannot access commissions
      const activeMembership = req.tenantContext?.membership;
      if (activeMembership && activeMembership.canOriginate === false && activeMembership.role !== 'owner' && user?.role !== 'super_admin' && user?.role !== 'admin') {
        return res.status(403).json({
          message: "Operación restringida: Los colaboradores no originadores no tienen acceso al módulo de comisiones comerciales."
        });
      }

      // Admin and super_admin can see all commissions
      const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
      let rawCommissions: any[] = [];
      
      const { 
        status, 
        institutionId, 
        financialInstitutionId, 
        masterBrokerId, 
        brokerId, 
        from, 
        to, 
        tenantId 
      } = req.query;

      if (isAdmin) {
        const filters: any = {};
        if (brokerId) filters.brokerId = String(brokerId);
        if (masterBrokerId) filters.masterBrokerId = String(masterBrokerId);
        if (tenantId) filters.tenantId = String(tenantId);
        if (status) {
          const statusStr = String(status);
          if (statusStr.includes(',')) {
            filters.statuses = statusStr.split(',').map(s => s.trim());
          } else {
            filters.status = statusStr;
          }
        }
        if (from) filters.from = new Date(String(from));
        if (to) filters.to = new Date(String(to));

        rawCommissions = await storage.getCommissions(filters);
      } else if (user?.role === 'master_broker') {
        const mbComms = await storage.getCommissions({
          masterBrokerId: userId,
          includeNetwork: true,
        });
        const directComms = await storage.getCommissions({ brokerId: userId });
        const commMap = new Map<string, any>();
        for (const c of [...mbComms, ...directComms]) {
          commMap.set(c.id, c);
        }
        rawCommissions = Array.from(commMap.values()).filter(c => {
          const mbNet = parseFloat(c.masterBrokerShare || '0');
          const brkShare = parseFloat(c.brokerShare || '0');
          if (c.brokerId === userId) return brkShare > 0 || parseFloat(c.amount || '0') > 0;
          return mbNet > 0 || brkShare > 0;
        });
      } else {
        const allBrokerComms = await storage.getCommissions(userId);
        rawCommissions = allBrokerComms.filter(c => {
          const brkShare = parseFloat(c.brokerShare || (c.masterBrokerShare ? '0' : c.amount) || '0');
          return brkShare > 0;
        });
      }

      // Enrich with credit, client and institution information
      const enrichedCommissions = await Promise.all(
        rawCommissions.map(async (comm) => {
          let credit = null;
          let client = null;
          let institution = null;

          if (comm.creditId) {
            credit = await storage.getCredit(comm.creditId);
            if (credit) {
              if (credit.clientId) {
                client = await storage.getClient(credit.clientId);
              }
              if (credit.financialInstitutionId) {
                institution = await storage.getFinancialInstitution(credit.financialInstitutionId);
              }
            }
          }

          let broker = null;
          let masterBroker = null;
          let effectiveBankAccount = null;

          const historicalMasterBrokerId = comm.masterBrokerId || (credit?.originMasterBrokerId ?? null);
          const hasHistoricalMasterPayee = Boolean(
            historicalMasterBrokerId
          );
          const isMasterDirect = Boolean(
            historicalMasterBrokerId &&
            comm.brokerId &&
            String(comm.brokerId) === String(historicalMasterBrokerId)
          );

          if (comm.brokerId) {
            const brokerUser = await storage.getUser(comm.brokerId);
            if (brokerUser) {
              broker = {
                id: brokerUser.id,
                firstName: brokerUser.firstName,
                lastName: brokerUser.lastName,
                email: brokerUser.email,
                bankName: brokerUser.bankName,
                clabe: brokerUser.clabe,
                accountHolder: brokerUser.accountHolder,
              };
            }
          }

          if (historicalMasterBrokerId) {
            const mbUser = await storage.getUser(historicalMasterBrokerId);
            if (mbUser) {
              masterBroker = {
                id: mbUser.id,
                firstName: mbUser.firstName,
                lastName: mbUser.lastName,
                email: mbUser.email,
                brandName: mbUser.brandName,
                bankName: mbUser.bankName,
                clabe: mbUser.clabe,
                accountHolder: mbUser.accountHolder,
              };

              // Si es red con margen de master o master directo, la cuenta de dispersión pertenece al Master histórico
              if (hasHistoricalMasterPayee || isMasterDirect) {
                effectiveBankAccount = {
                  beneficiaryType: 'master_broker',
                  beneficiaryId: mbUser.id,
                  beneficiaryName: mbUser.accountHolder || `${mbUser.firstName || ''} ${mbUser.lastName || ''}`.trim() || mbUser.brandName,
                  bankName: mbUser.bankName,
                  clabe: mbUser.clabe,
                };
              }
            }
          }

          if (!effectiveBankAccount && broker) {
            effectiveBankAccount = {
              beneficiaryType: 'broker',
              beneficiaryId: broker.id,
              beneficiaryName: broker.accountHolder || `${broker.firstName || ''} ${broker.lastName || ''}`.trim(),
              bankName: broker.bankName,
              clabe: broker.clabe,
            };
          }

          const isMb = Boolean(historicalMasterBrokerId && !isMasterDirect);
          const audit = auditCommissionPayout({
            ...comm,
            originMasterBrokerId: historicalMasterBrokerId,
          });
          const payoutAmount = audit.payoutAmount;

          const effectiveBeneficiary = (hasHistoricalMasterPayee || isMasterDirect) && masterBroker
            ? {
                id: masterBroker.id,
                name: masterBroker.accountHolder || `${masterBroker.firstName || ''} ${masterBroker.lastName || ''}`.trim() || masterBroker.brandName,
                email: masterBroker.email,
                role: 'master_broker',
                bankName: masterBroker.bankName,
                clabe: masterBroker.clabe,
                accountHolder: masterBroker.accountHolder,
                isMasterBroker: true,
              }
            : (broker ? {
                id: broker.id,
                name: broker.accountHolder || `${broker.firstName || ''} ${broker.lastName || ''}`.trim() || broker.email,
                email: broker.email,
                role: 'broker',
                bankName: broker.bankName,
                clabe: broker.clabe,
                accountHolder: broker.accountHolder,
                isMasterBroker: false,
              } : null);

          const baseComm: any = {
            ...comm,
            payoutAmount,
            hasFrozenDiscrepancy: audit.hasDiscrepancy,
            frozenDiscrepancyReason: audit.discrepancyReason,
            isNetworkPayout: !!(hasHistoricalMasterPayee && !isMasterDirect),
            isMasterDirect,
            effectiveBeneficiary,
            credit: credit ? {
              id: credit.id,
              amount: credit.amount,
              term: credit.term,
              interestRate: credit.interestRate,
              status: credit.status,
            } : null,
            client: client ? {
              id: client.id,
              firstName: client.firstName,
              lastName: client.lastName,
              businessName: client.businessName,
              type: client.type,
            } : null,
            financialInstitution: institution ? {
              id: institution.id,
              name: institution.name,
              overRate: user?.role === 'super_admin' ? ((institution as any).overRate ?? (institution as any).overrateCommissionRate ?? (institution as any).commissionRates?.financiera?.sobretasa ?? 0) : undefined,
            } : null,
            broker,
            masterBroker,
            effectiveBankAccount,
          };

          // RBAC: Proteger appShare (margen interno de plataforma) y CLABE de roles no autorizados (Regla 4 y 5)
          if (user?.role !== 'super_admin') {
            delete baseComm.appShare;
            delete baseComm.notes;
            if (baseComm.broker && baseComm.broker.id !== userId) {
              baseComm.broker.clabe = maskCLABE(baseComm.broker.clabe);
            }
            if (baseComm.masterBroker && baseComm.masterBroker.id !== userId) {
              baseComm.masterBroker.clabe = maskCLABE(baseComm.masterBroker.clabe);
            }
            if (baseComm.effectiveBankAccount && baseComm.effectiveBankAccount.beneficiaryId !== userId) {
              baseComm.effectiveBankAccount.clabe = maskCLABE(baseComm.effectiveBankAccount.clabe);
            }
            if (baseComm.effectiveBeneficiary && baseComm.effectiveBeneficiary.id !== userId) {
              baseComm.effectiveBeneficiary.clabe = maskCLABE(baseComm.effectiveBeneficiary.clabe);
            }
            if (baseComm.brokerId !== userId && baseComm.masterBrokerId !== userId) {
              baseComm.clabe = maskCLABE(baseComm.clabe);
            }
          }

          return baseComm;
        })
      );

      // Additional in-memory filtering for criteria like institutionId
      const targetInstId = institutionId || financialInstitutionId;
      const filtered = targetInstId
        ? enrichedCommissions.filter(c => c.financialInstitution?.id === String(targetInstId))
        : enrichedCommissions;

      res.json(filtered);
    } catch (error) {
      console.error("Error fetching commissions:", error);
      res.status(500).json({ message: "Failed to fetch commissions" });
    }
  });

  app.get('/api/commissions/my-commissions', isAuthenticated, requireModuleAndAction('comisiones', 'view'), async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);

      // Commercial origination check: collaborators with canOriginate: false cannot access commissions
      const activeMembership = req.tenantContext?.membership;
      if (activeMembership && activeMembership.canOriginate === false && activeMembership.role !== 'owner' && user?.role !== 'super_admin' && user?.role !== 'admin') {
        return res.status(403).json({
          message: "Operación restringida: Los colaboradores no originadores no tienen acceso al módulo de comisiones comerciales."
        });
      }

      let rawCommissions: any[] = [];
      if (user?.role === 'master_broker') {
        rawCommissions = await storage.getCommissions({
          masterBrokerId: userId,
          includeNetwork: true,
        });
      } else if (user?.role === 'admin' || user?.role === 'super_admin') {
        rawCommissions = await storage.getCommissions();
      } else {
        rawCommissions = await storage.getCommissions(userId);
      }

      // RBAC: Proteger appShare (margen interno de plataforma) y notas internas de roles no autorizados (Regla 5)
      const sanitized = user?.role === 'super_admin'
        ? rawCommissions
        : rawCommissions.map(comm => {
            const copy = { ...comm };
            delete copy.appShare;
            delete copy.notes;
            return copy;
          });

      res.json(sanitized);
    } catch (error) {
      console.error("Error fetching my-commissions:", error);
      res.status(500).json({ message: "Failed to fetch commissions" });
    }
  });

  // REGLA 4 (FASE 2B.2A / COM-21): Detalle de comisión con desglose financiero completo para revisión de Super Admin
  app.get('/api/commissions/:id', isAuthenticated, requireModuleAndAction('comisiones', 'view'), async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);

      const activeMembership = req.tenantContext?.membership;
      if (activeMembership && activeMembership.canOriginate === false && activeMembership.role !== 'owner' && user?.role !== 'super_admin' && user?.role !== 'admin') {
        return res.status(403).json({
          message: "Operación restringida: Los colaboradores no originadores no tienen acceso al módulo de comisiones comerciales."
        });
      }

      const commission = await storage.getCommission(id);
      if (!commission) {
        return res.status(404).json({ message: "Comisión no encontrada" });
      }

      const isSuperAdmin = user?.role === 'super_admin';
      const isAdmin = user?.role === 'admin' || isSuperAdmin;
      if (!isAdmin) {
        if (user?.role === 'broker' && commission.brokerId !== userId) {
          return res.status(403).json({ message: "No tienes permiso para ver esta comisión" });
        }
        if (user?.role === 'master_broker') {
          const isDirect = commission.brokerId === userId;
          const isNetwork = commission.masterBrokerId === userId;
          if (!isDirect && !isNetwork) {
            return res.status(403).json({ message: "No tienes permiso para ver esta comisión" });
          }
        }
      }

      let credit = null;
      let client = null;
      let institution = null;
      if (commission.creditId) {
        credit = await storage.getCredit(commission.creditId);
        if (credit) {
          if (credit.clientId) {
            client = await storage.getClient(credit.clientId);
          }
          if (credit.financialInstitutionId) {
            institution = await storage.getFinancialInstitution(credit.financialInstitutionId);
          }
        }
      }

      let broker = null;
      let masterBroker = null;
      let effectiveBankAccount = null;

      const historicalMasterBrokerId = commission.masterBrokerId || (credit?.originMasterBrokerId ?? null);
      const hasHistoricalMasterPayee = Boolean(
        historicalMasterBrokerId
      );
      const isMasterDirect = Boolean(
        historicalMasterBrokerId &&
        commission.brokerId &&
        String(commission.brokerId) === String(historicalMasterBrokerId)
      );

      if (commission.brokerId) {
        const brokerUser = await storage.getUser(commission.brokerId);
        if (brokerUser) {
          broker = {
            id: brokerUser.id,
            firstName: brokerUser.firstName,
            lastName: brokerUser.lastName,
            email: brokerUser.email,
            bankName: brokerUser.bankName,
            clabe: brokerUser.clabe,
            accountHolder: brokerUser.accountHolder,
          };
        }
      }

      if (historicalMasterBrokerId) {
        const mbUser = await storage.getUser(historicalMasterBrokerId);
        if (mbUser) {
          masterBroker = {
            id: mbUser.id,
            firstName: mbUser.firstName,
            lastName: mbUser.lastName,
            email: mbUser.email,
            brandName: mbUser.brandName,
            bankName: mbUser.bankName,
            clabe: mbUser.clabe,
            accountHolder: mbUser.accountHolder,
          };

          if (hasHistoricalMasterPayee || isMasterDirect) {
            effectiveBankAccount = {
              beneficiaryType: 'master_broker',
              beneficiaryId: mbUser.id,
              beneficiaryName: mbUser.accountHolder || `${mbUser.firstName || ''} ${mbUser.lastName || ''}`.trim() || mbUser.brandName,
              bankName: mbUser.bankName,
              clabe: mbUser.clabe,
            };
          }
        }
      }

      if (!effectiveBankAccount && broker) {
        effectiveBankAccount = {
          beneficiaryType: 'broker',
          beneficiaryId: broker.id,
          beneficiaryName: broker.accountHolder || `${broker.firstName || ''} ${broker.lastName || ''}`.trim(),
          bankName: broker.bankName,
          clabe: broker.clabe,
        };
      }

      const audit = auditCommissionPayout({
        ...commission,
        originMasterBrokerId: historicalMasterBrokerId,
      });
      const payoutAmount = audit.payoutAmount;

      const effectiveBeneficiary = (hasHistoricalMasterPayee || isMasterDirect) && masterBroker
        ? {
            id: masterBroker.id,
            name: masterBroker.accountHolder || `${masterBroker.firstName || ''} ${masterBroker.lastName || ''}`.trim() || masterBroker.brandName,
            email: masterBroker.email,
            role: 'master_broker',
            bankName: masterBroker.bankName,
            clabe: masterBroker.clabe,
            accountHolder: masterBroker.accountHolder,
            isMasterBroker: true,
          }
        : (broker ? {
            id: broker.id,
            name: broker.accountHolder || `${broker.firstName || ''} ${broker.lastName || ''}`.trim() || broker.email,
            email: broker.email,
            role: 'broker',
            bankName: broker.bankName,
            clabe: broker.clabe,
            accountHolder: broker.accountHolder,
            isMasterBroker: false,
          } : null);

      const auditLogs = await storage.getCommissionAuditLogs(id);
      const proposal = (credit?.finalProposal as any) || {};
      const disbursementConfirmation = proposal.disbursementConfirmation || null;
      const baseDisbursedAmount = disbursementConfirmation?.confirmedAmount
        ?? (credit as any)?.confirmedDisbursedAmount
        ?? null;

      const detailedComm: any = {
        ...commission,
        payoutAmount,
        baseDisbursedAmount,
        hasFrozenDiscrepancy: audit.hasDiscrepancy,
        frozenDiscrepancyReason: audit.discrepancyReason,
        isNetworkPayout: !!(hasHistoricalMasterPayee && !isMasterDirect),
        isMasterDirect,
        effectiveBeneficiary,
        effectiveBankAccount,
        credit: credit ? {
          id: credit.id,
          amount: credit.amount,
          term: credit.term,
          interestRate: credit.interestRate,
          status: credit.status,
          disbursementStatus: proposal.disbursementStatus || (credit as any).disbursementStatus || 'unconfirmed',
          disbursementConfirmation,
        } : null,
        client: client ? {
          id: client.id,
          firstName: client.firstName,
          lastName: client.lastName,
          businessName: client.businessName,
          type: client.type,
        } : null,
        financialInstitution: institution ? {
          id: institution.id,
          name: institution.name,
          overRate: isSuperAdmin ? ((institution as any).overRate ?? (institution as any).overrateCommissionRate ?? (institution as any).commissionRates?.financiera?.sobretasa ?? 0) : undefined,
        } : null,
        broker,
        masterBroker,
        rates: {
          financiera: proposal?.commissionRates?.financiera ?? null,
          broker: proposal?.commissionRates?.broker ?? null,
          masterBroker: proposal?.commissionRates?.masterBroker ?? null,
        },
        shares: {
          brokerShare: commission.brokerShare,
          masterBrokerShare: commission.masterBrokerShare,
          appShare: isSuperAdmin ? commission.appShare : undefined,
          totalAmount: commission.amount,
        },
        historicalBeneficiaries: {
          broker,
          masterBroker,
          originMasterBrokerId: historicalMasterBrokerId,
        },
        auditLogs,
      };

      if (!isSuperAdmin) {
        delete detailedComm.appShare;
        delete detailedComm.notes;
        if (detailedComm.shares) {
          delete detailedComm.shares.appShare;
        }
        if (detailedComm.broker && detailedComm.broker.id !== userId) {
          detailedComm.broker.clabe = maskCLABE(detailedComm.broker.clabe);
        }
        if (detailedComm.masterBroker && detailedComm.masterBroker.id !== userId) {
          detailedComm.masterBroker.clabe = maskCLABE(detailedComm.masterBroker.clabe);
        }
        if (detailedComm.effectiveBankAccount && detailedComm.effectiveBankAccount.beneficiaryId !== userId) {
          detailedComm.effectiveBankAccount.clabe = maskCLABE(detailedComm.effectiveBankAccount.clabe);
        }
        if (detailedComm.effectiveBeneficiary && detailedComm.effectiveBeneficiary.id !== userId) {
          detailedComm.effectiveBeneficiary.clabe = maskCLABE(detailedComm.effectiveBeneficiary.clabe);
        }
        if (detailedComm.historicalBeneficiaries?.broker && detailedComm.historicalBeneficiaries.broker.id !== userId) {
          detailedComm.historicalBeneficiaries.broker.clabe = maskCLABE(detailedComm.historicalBeneficiaries.broker.clabe);
        }
        if (detailedComm.historicalBeneficiaries?.masterBroker && detailedComm.historicalBeneficiaries.masterBroker.id !== userId) {
          detailedComm.historicalBeneficiaries.masterBroker.clabe = maskCLABE(detailedComm.historicalBeneficiaries.masterBroker.clabe);
        }
        if (detailedComm.brokerId !== userId && detailedComm.masterBrokerId !== userId) {
          detailedComm.clabe = maskCLABE(detailedComm.clabe);
        }
      }

      res.json(detailedComm);
    } catch (error) {
      console.error("Error fetching commission detail:", error);
      res.status(500).json({ message: "Error al consultar el detalle de la comisión" });
    }
  });

  // Auditoría sólo por comisión autorizada; detalles bancarios exclusivos de Super Admin.
  app.get('/api/commissions/:id/audit-logs', isAuthenticated, requireModuleAndAction('comisiones', 'view'), async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const commission = await storage.getCommission(id);
      if (!commission) return res.status(404).json({ message: "Comisión no encontrada." });

      const credit = commission.creditId ? await storage.getCredit(commission.creditId) : null;
      const historicalMasterId = commission.masterBrokerId || credit?.originMasterBrokerId || null;
      const isPlatformAdmin = user?.role === 'super_admin' || user?.role === 'admin';
      if (!isPlatformAdmin && commission.brokerId !== userId && historicalMasterId !== userId) {
        return res.status(403).json({ message: "No autorizado para consultar esta comisión." });
      }

      const logs = await storage.getCommissionAuditLogs(id);
      if (user?.role === 'super_admin') return res.json(logs);
      return res.json(logs.map((entry: any) => ({
        id: entry.id,
        commissionId: entry.commissionId,
        action: entry.action,
        previousStatus: entry.previousStatus,
        newStatus: entry.newStatus,
        createdAt: entry.createdAt,
      })));
    } catch (error) {
      console.error("Error fetching commission audit logs:", error);
      res.status(500).json({ message: "Error al consultar la bitácora de auditoría" });
    }
  });

  // Approve a commission (Super Admin only - Gate de seguridad - Regla 4)
  app.post('/api/commissions/:id/approve', isAuthenticated, requireModuleAndAction('comisiones', 'approve_disperse'), async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);

      if (!user || user.role !== 'super_admin') {
        return res.status(403).json({ message: "Solo Super Admin puede aprobar comisiones" });
      }

      const commission = await storage.getCommission(id);
      if (!commission) {
        return res.status(404).json({ message: "Comisión no encontrada" });
      }

      if (commission.status === 'approved') {
        return res.json({ message: "La comisión ya se encuentra aprobada", commission, alreadyApproved: true });
      }

      if (['paid', 'dispersing', 'cancelled'].includes(commission.status)) {
        return res.status(400).json({
          message: `No se puede aprobar una comisión en estado '${commission.status}'`
        });
      }

      const linkedCredit = commission.creditId ? await storage.getCredit(commission.creditId) : null;
      const historicalMasterBrokerId = commission.masterBrokerId || (linkedCredit?.originMasterBrokerId ?? null);

      // Anti-Reatribución y alteración (Regla 4 y 5): Prohibir modificaciones a los beneficiarios e importes históricos
      if (req.body?.brokerId && String(req.body.brokerId) !== String(commission.brokerId)) {
        return res.status(400).json({
          message: "Prohibido alterar el Bróker beneficiario: la atribución de comisiones es inmutable y no permite reatribuciones.",
          code: "COMMISSION_REATTRIBUTION_FORBIDDEN",
        });
      }

      if (req.body?.masterBrokerId && String(req.body.masterBrokerId) !== String(historicalMasterBrokerId)) {
        return res.status(400).json({
          message: "Prohibido alterar el Master Bróker beneficiario: la atribución de comisiones es inmutable y no permite reatribuciones.",
          code: "COMMISSION_REATTRIBUTION_FORBIDDEN",
        });
      }

      if (req.body?.amount && Math.abs(parseFloat(String(req.body.amount)) - parseFloat(commission.amount)) > 0.01) {
        return res.status(400).json({
          message: "Prohibido alterar el importe total de la comisión durante la aprobación.",
          code: "COMMISSION_AMOUNT_ALTERATION_FORBIDDEN",
        });
      }

      // Calculate and verify final payout amount using canonical attribution
      const audit = auditCommissionPayout({
        ...commission,
        originMasterBrokerId: historicalMasterBrokerId,
      });

      if (audit.hasDiscrepancy) {
        return res.status(400).json({
          message: `Bloqueo de seguridad: No se puede aprobar una comisión con discrepancia financiera. Motivo: ${audit.discrepancyReason || 'Discrepancia detectada'}`,
          code: "COMMISSION_FROZEN_DISCREPANCY",
          details: audit,
        });
      }

      const payoutAmount = audit.payoutAmount;

      if (req.body?.payoutAmount && Math.abs(parseFloat(String(req.body.payoutAmount)) - payoutAmount) > 0.01) {
        return res.status(400).json({
          message: "Prohibido alterar el monto neto a pagar durante la aprobación.",
          code: "COMMISSION_AMOUNT_ALTERATION_FORBIDDEN",
        });
      }

      const updated = await storage.updateCommission(id, {
        status: 'approved',
        approvedAt: new Date(),
        approvedBy: userId,
        frozenAmount: payoutAmount.toFixed(2),
      });

      await storage.createCommissionAuditLog({
        commissionId: id,
        performedBy: userId,
        action: 'approved',
        previousStatus: commission.status,
        newStatus: 'approved',
        details: {
          actorRole: user.role,
          frozenAmount: payoutAmount.toFixed(2),
          approvedBy: userId,
          notes: req.body?.notes ? String(req.body.notes).trim() : null,
        },
      });

      res.json({ message: "Comisión aprobada exitosamente", commission: updated });
    } catch (error) {
      console.error("Error approving commission:", error);
      res.status(500).json({ message: "Error al aprobar la comisión" });
    }
  });

  // Bulk approve commissions (Temporarily disabled for mandatory individual financial review)
  app.post('/api/commissions/bulk-approve', isAuthenticated, requireModuleAndAction('comisiones', 'approve_disperse'), async (req: any, res) => {
    return res.status(400).json({
      message: "La aprobación masiva se encuentra temporalmente deshabilitada para asegurar la revisión financiera individual por Super Admin.",
      code: "BULK_APPROVAL_TEMPORARILY_DISABLED",
    });
  });

  // Cancel a commission (Admins only)
  app.post('/api/commissions/:id/cancel', isAuthenticated, requireModuleAndAction('comisiones', 'approve_disperse'), async (req: any, res) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);

      if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
        return res.status(403).json({ message: "Solo los administradores pueden cancelar comisiones" });
      }

      if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
        return res.status(400).json({ message: "El motivo de cancelación es obligatorio" });
      }

      const commission = await storage.getCommission(id);
      if (!commission) {
        return res.status(404).json({ message: "Comisión no encontrada" });
      }

      if (['paid', 'dispersing'].includes(commission.status)) {
        return res.status(400).json({
          message: `No se puede cancelar una comisión en estado '${commission.status}'`
        });
      }

      const updated = await storage.updateCommission(id, {
        status: 'cancelled',
        notes: (commission.notes ? commission.notes + ' | ' : '') + `Cancelado: ${reason.trim()}`,
      });

      await storage.createCommissionAuditLog({
        commissionId: id,
        performedBy: userId,
        action: 'cancelled',
        previousStatus: commission.status,
        newStatus: 'cancelled',
        details: { actorRole: user.role, reason: reason.trim() },
      });

      res.json({ message: "Comisión cancelada exitosamente", commission: updated });
    } catch (error) {
      console.error("Error cancelling commission:", error);
      res.status(500).json({ message: "Error al cancelar la comisión" });
    }
  });

  // Single STP payout with concurrency lock, idempotency protection and P0 security hardening
  app.post('/api/commissions/:id/pay', isAuthenticated, requireModuleAndAction('comisiones', 'approve_disperse'), async (req: any, res) => {
    try {
      const { id } = req.params;
      const { accountNumber } = req.body;
      const rawIdempotencyKey = req.headers['idempotency-key'] || req.body.idempotencyKey;
      const idempotencyKey = rawIdempotencyKey ? String(rawIdempotencyKey).trim() : null;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);

      // Only Super Admin can trigger payouts
      if (!user || user.role !== 'super_admin') {
        return res.status(403).json({ message: "Solo Super Admin puede autorizar y procesar pagos o dispersiones de comisiones" });
      }

      // 1. Idempotency Key check: if an existing paid commission has this key, return it immediately
      if (idempotencyKey) {
        const existingKeyComms = await storage.getCommissions({ idempotencyKey });
        const alreadyProcessed = existingKeyComms.find(c => c.status === 'paid');
        if (alreadyProcessed) {
          return res.json({
            message: "Commission already processed with this idempotency key",
            transactionId: alreadyProcessed.trackingKey,
            alreadyPaid: true,
            paidAt: alreadyProcessed.paidAt,
            payoutAmount: getCommissionPayoutAmount(alreadyProcessed),
            commission: alreadyProcessed,
          });
        }
      }

      // 2. Fetch current commission state
      const commission = await storage.getCommission(id);
      if (!commission) {
        return res.status(404).json({ message: "Commission not found" });
      }

      if (commission.status === 'paid') {
        return res.json({
          message: "Commission already paid",
          transactionId: commission.trackingKey || null,
          alreadyPaid: true,
          paidAt: commission.paidAt,
          payoutAmount: getCommissionPayoutAmount(commission),
          commission,
        });
      }

      if (commission.status === 'dispersing') {
        return res.status(409).json({
          message: "Commission dispersion is currently in progress",
          inProgress: true,
        });
      }

      // Temporal mandatory gate: must be approved by Super Admin with approvedBy, approvedAt, and valid frozenAmount
      const hasValidApproval = (
        commission.status === 'approved' &&
        Boolean(commission.approvedBy) &&
        Boolean(commission.approvedAt) &&
        commission.frozenAmount != null &&
        commission.frozenAmount !== '' &&
        !isNaN(parseFloat(commission.frozenAmount))
      );

      if (!hasValidApproval) {
        await storage.createCommissionAuditLog({
          commissionId: id,
          performedBy: userId,
          action: 'dispersion_blocked',
          previousStatus: commission.status,
          newStatus: commission.status,
          details: {
            actorRole: user.role,
            reason: 'APPROVAL_PREREQUISITES_MISSING',
            status: commission.status,
            approvedBy: commission.approvedBy || null,
            approvedAt: commission.approvedAt || null,
            frozenAmount: commission.frozenAmount || null,
          },
        });
        return res.status(400).json({
          message: "La dispersión requiere estado 'approved', approvedBy, approvedAt e importe congelado válido registrado por Super Admin.",
          code: "APPROVAL_PREREQUISITES_MISSING",
          commissionStatus: commission.status,
        });
      }

      // 3. Resolve beneficiary and 18-digit CLABE from historical master / broker of the operation
      const linkedCredit = commission.creditId ? await storage.getCredit(commission.creditId) : null;
      const historicalMasterBrokerId = commission.masterBrokerId || (linkedCredit?.originMasterBrokerId ?? null);
      const isMbCredit = Boolean(historicalMasterBrokerId);
      const isMasterDirect = Boolean(
        historicalMasterBrokerId &&
        commission.brokerId &&
        String(commission.brokerId) === String(historicalMasterBrokerId)
      );

      const targetUserId = (isMbCredit || isMasterDirect) ? historicalMasterBrokerId! : commission.brokerId;
      const targetUser = await storage.getUser(targetUserId);

      if (!targetUser) {
        return res.status(404).json({
          message: "No se encontró el beneficiario histórico registrado para esta comisión."
        });
      }

      // Security enforcement: The registered CLABE in targetUser's profile/formalization is authoritative.
      const registeredClabe = targetUser.clabe ? String(targetUser.clabe).trim() : null;
      if (!registeredClabe || !/^\d{18}$/.test(registeredClabe)) {
        await storage.createCommissionAuditLog({
          commissionId: id,
          performedBy: userId,
          action: 'dispersion_blocked',
          previousStatus: commission.status,
          newStatus: commission.status,
          details: {
            actorRole: user.role,
            reason: 'CLABE_INVALID_OR_MISSING',
            beneficiaryId: targetUserId,
          },
        });
        return res.status(400).json({
          message: `El beneficiario histórico (${isMbCredit ? 'Master Bróker' : 'Bróker'} ${targetUser.firstName || ''} ${targetUser.lastName || ''}) no cuenta con una CLABE interbancaria válida de 18 dígitos registrada en su expediente.`
        });
      }

      // Block client-side tampering: if the frontend sent an accountNumber/clabe, verify it strictly matches the registered CLABE
      const providedClabe = accountNumber ? String(accountNumber).trim() : null;
      if (providedClabe && providedClabe !== registeredClabe) {
        await storage.createCommissionAuditLog({
          commissionId: id,
          performedBy: userId,
          action: 'dispersion_blocked',
          previousStatus: commission.status,
          newStatus: commission.status,
          details: {
            actorRole: user.role,
            reason: 'CLABE_TAMPERING_ATTEMPT',
            providedClabe,
            registeredClabe,
            beneficiaryId: targetUserId,
          },
        });
        return res.status(400).json({
          message: "Discrepancia de seguridad: La CLABE enviada no coincide con la cuenta bancaria oficial del beneficiario histórico registrado. No se permite alterar silenciosamente el beneficiario bancario."
        });
      }

      const effectiveClabe = registeredClabe;

      // 3.5. Audit payout amount and block liquidation if discrepancy exists
      const audit = auditCommissionPayout({
        ...commission,
        originMasterBrokerId: historicalMasterBrokerId,
      });

      if (audit.hasDiscrepancy) {
        await storage.createCommissionAuditLog({
          commissionId: id,
          performedBy: userId,
          action: 'dispersion_blocked',
          previousStatus: commission.status,
          newStatus: commission.status,
          details: {
            actorRole: user.role,
            reason: 'FROZEN_AMOUNT_DISCREPANCY',
            audit,
          },
        });
        return res.status(400).json({
          message: audit.discrepancyReason,
          code: "FROZEN_AMOUNT_DISCREPANCY",
          requiresAdminReview: true,
          audit,
        });
      }

      const effectiveBankName = targetUser.bankName || null;
      const effectiveAccountHolder = targetUser.accountHolder || `${targetUser.firstName || ''} ${targetUser.lastName || ''}`.trim() || null;

      // 3.6 Documentary & Banking Validation Gate (FASE 2B.2C / PAG-01 a PAG-06 / COM-03/06, PAG-08/13/14)
      // Valida exclusivamente al beneficiario que realmente recibe el pago de Crédito Negocios (Master en redes, Broker directo en directos)
      const docValidation = await validateCommissionPayoutPrerequisites(commission, storage);
      if (!docValidation.canPayout) {
        await storage.createCommissionAuditLog({
          commissionId: id,
          performedBy: userId,
          action: 'dispersion_blocked',
          previousStatus: commission.status,
          newStatus: commission.status,
          details: {
            actorRole: user.role,
            reason: 'DOCUMENTATION_PREREQUISITES_MISSING',
            missingRequirements: docValidation.missingRequirements,
            beneficiaries: docValidation.beneficiaries,
          },
        });
        return res.status(400).json({
          message: `Dispersión bloqueada: Faltan requisitos documentales o bancarios validados por Super Admin: ${docValidation.missingRequirements.join("; ")}`,
          code: "DOCUMENTATION_PREREQUISITES_MISSING",
          missingRequirements: docValidation.missingRequirements,
          beneficiaries: docValidation.beneficiaries,
        });
      }

      // 4. Atomic concurrency lock: transition status to 'dispersing'
      const lockedComm = await storage.transitionCommissionStatus(
        id,
        ['approved'],
        'dispersing',
        {
          idempotencyKey: idempotencyKey || null,
          clabe: effectiveClabe,
          bankName: effectiveBankName,
          accountHolder: effectiveAccountHolder,
        }
      );

      if (!lockedComm) {
        return res.status(409).json({
          message: "Conflicto de concurrencia: la comisión ya está en dispersión o fue pagada por otro proceso.",
          conflict: true,
        });
      }

      // 5. Calculate payout amount using canonical logic (safe against double counting)
      const payoutAmount = audit.payoutAmount;

      // REGLA 3 (PAG-12/13): processStpPayment es un simulador. Ningún resultado simulado puede
      // registrar una comisión como pagada realmente. Mantener transferencias reales deshabilitadas.
      // Permitir registro manual únicamente por Super Admin con monto, beneficiario y referencia verificable.
      const isSimulateOnly = Boolean(req.body.simulate || req.query.simulate === 'true');

      if (!isSimulateOnly) {
        // Liberar el bloqueo concurrente de vuelta a 'approved'
        await storage.transitionCommissionStatus(id, ['dispersing'], 'approved');

        await storage.createCommissionAuditLog({
          commissionId: id,
          performedBy: userId,
          action: 'dispersion_blocked',
          previousStatus: 'dispersing',
          newStatus: 'approved',
          details: {
            actorRole: user.role,
            reason: 'SIMULATOR_GATE_REAL_TRANSFERS_DISABLED',
            message: 'processStpPayment es un simulador. Conforme a PAG-12/13, ningún resultado simulado puede registrar una comisión como pagada realmente. Utilice /mark-paid para liquidación manual auditada.',
          },
        });

        return res.status(400).json({
          message: "Transferencias reales vía STP deshabilitadas: processStpPayment es un simulador. Conforme a PAG-12/13, ningún resultado simulado puede registrar una comisión como pagada financieramente. La liquidación financiera real autorizada requiere registro manual por Super Admin con referencia bancaria verificable en /api/commissions/:id/mark-paid.",
          code: "SIMULATED_STP_CANNOT_DISBURSE",
          simulated: true,
        });
      }

      // Si se solicita simulación explícita para pruebas técnicas:
      // Ejecutar una única prueba de pasarela al beneficiario legítimo que recibe de CN
      const simResult = await processStpPayment(payoutAmount.toFixed(2), effectiveClabe);

      // Liberar el estado de vuelta a 'approved' para NUNCA marcar como pagada financieramente
      await storage.transitionCommissionStatus(id, ['dispersing'], 'approved');

      await storage.createCommissionAuditLog({
        commissionId: id,
        performedBy: userId,
        action: 'stp_simulation_tested',
        previousStatus: 'dispersing',
        newStatus: 'approved',
        details: {
          actorRole: user.role,
          payoutAmount,
          targetUserId,
          simResult,
          notice: 'Simulación STP ejecutada para validación técnica. La comisión permanece en estado approved sin liquidación real.',
        },
      });

      const currentCommissionState = await storage.getCommission(id);

      return res.json({
        message: "Simulación de dispersión STP completada exitosamente. Conforme a PAG-12/13, ningún resultado simulado puede registrar la comisión como pagada realmente. La comisión permanece sin liquidar financieramente.",
        simulated: true,
        paid: false,
        transactionId: simResult.transactionId,
        payoutAmount,
        payoutBeneficiary: {
          userId: targetUserId,
          role: (isMbCredit || isMasterDirect) ? 'master_broker' : 'broker',
          amount: payoutAmount,
          clabe: effectiveClabe,
          bankName: effectiveBankName,
          accountHolder: effectiveAccountHolder,
        },
        networkObligation: audit.networkObligation || null,
        commission: currentCommissionState,
      });
    } catch (error) {
      console.error("Error processing payment:", error);
      res.status(500).json({ message: "Failed to process payment" });
    }
  });

  // Batch STP payout (Super Admin only)
  app.post('/api/commissions/bulk-pay', isAuthenticated, requireModuleAndAction('comisiones', 'approve_disperse'), async (req: any, res) => {
    try {
      const { ids } = req.body;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);

      if (!user || user.role !== 'super_admin') {
        return res.status(403).json({ message: "Solo Super Admin puede procesar dispersiones masivas" });
      }

      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "Se requiere un arreglo de identificadores 'ids'" });
      }

      // REGLA 3 (PAG-12/13): processStpPayment es un simulador. Ningún resultado simulado puede
      // registrar comisiones como pagadas realmente. Mantener transferencias reales deshabilitadas.
      const isSimulateOnly = Boolean(req.body.simulate || req.query.simulate === 'true');

      if (!isSimulateOnly) {
        return res.status(400).json({
          message: "Dispersión masiva automatizada deshabilitada: processStpPayment es un simulador (PAG-12/13). Ningún resultado simulado puede registrar comisiones como pagadas financieramente. La liquidación financiera real autorizada requiere registro manual por Super Admin con referencia bancaria verificable.",
          code: "SIMULATED_STP_CANNOT_DISBURSE",
          simulated: true,
        });
      }

      const successful: any[] = [];
      const failed: { id: string; reason: string }[] = [];
      let totalAmount = 0;

      for (const id of ids) {
        try {
          const commission = await storage.getCommission(id);
          if (!commission) {
            failed.push({ id, reason: "Comisión no encontrada" });
            continue;
          }

          if (commission.status === 'paid') {
            successful.push({ id, status: 'already_paid', payoutAmount: getCommissionPayoutAmount(commission) });
            continue;
          }

          const hasValidApproval = (
            commission.status === 'approved' &&
            Boolean(commission.approvedBy) &&
            Boolean(commission.approvedAt) &&
            commission.frozenAmount != null &&
            commission.frozenAmount !== '' &&
            !isNaN(parseFloat(commission.frozenAmount))
          );

          if (!hasValidApproval) {
            await storage.createCommissionAuditLog({
              commissionId: id,
              performedBy: userId,
              action: 'dispersion_blocked',
              previousStatus: commission.status,
              newStatus: commission.status,
              details: {
                actorRole: user.role,
                reason: 'APPROVAL_PREREQUISITES_MISSING',
                status: commission.status,
                approvedBy: commission.approvedBy || null,
                approvedAt: commission.approvedAt || null,
                frozenAmount: commission.frozenAmount || null,
                bulk: true,
              },
            });
            failed.push({ id, reason: "La dispersión masiva requiere estado 'approved', approvedBy, approvedAt e importe congelado válido registrado por Super Admin." });
            continue;
          }

          const linkedCredit = commission.creditId ? await storage.getCredit(commission.creditId) : null;
          const historicalMasterBrokerId = commission.masterBrokerId || (linkedCredit?.originMasterBrokerId ?? null);
          const isMbCredit = Boolean(historicalMasterBrokerId);
          const isMasterDirect = Boolean(
            historicalMasterBrokerId &&
            commission.brokerId &&
            String(commission.brokerId) === String(historicalMasterBrokerId)
          );

          const targetUserId = (isMbCredit || isMasterDirect) ? historicalMasterBrokerId! : commission.brokerId;
          const targetUser = await storage.getUser(targetUserId);

          if (!targetUser) {
            failed.push({ id, reason: "Beneficiario histórico no encontrado" });
            continue;
          }

          const effectiveClabe = targetUser.clabe ? String(targetUser.clabe).trim() : null;
          if (!effectiveClabe || !/^\d{18}$/.test(effectiveClabe)) {
            await storage.createCommissionAuditLog({
              commissionId: id,
              performedBy: userId,
              action: 'dispersion_blocked',
              previousStatus: commission.status,
              newStatus: commission.status,
              details: {
                actorRole: user.role,
                reason: 'CLABE_INVALID_OR_MISSING_BULK',
                beneficiaryId: targetUserId,
              },
            });
            failed.push({ id, reason: `Beneficiario histórico (${isMbCredit ? 'Master Bróker' : 'Bróker'}) sin CLABE válida de 18 dígitos registrada en su expediente` });
            continue;
          }

          const audit = auditCommissionPayout({
            ...commission,
            originMasterBrokerId: historicalMasterBrokerId,
          });

          if (audit.hasDiscrepancy) {
            await storage.createCommissionAuditLog({
              commissionId: id,
              performedBy: userId,
              action: 'dispersion_blocked',
              previousStatus: commission.status,
              newStatus: commission.status,
              details: {
                actorRole: user.role,
                reason: 'FROZEN_AMOUNT_DISCREPANCY_BULK',
                audit,
              },
            });
            failed.push({
              id,
              reason: audit.discrepancyReason || "Discrepancia en importe congelado. Requiere revisión administrativa auditada.",
            });
            continue;
          }

          // Documentary & Banking Validation Gate (FASE 2B.2C / PAG-01 a PAG-06 / COM-03/06, PAG-08/13/14)
          // Valida exclusivamente al beneficiario que realmente recibe el pago de Crédito Negocios
          const docValidation = await validateCommissionPayoutPrerequisites(commission, storage);
          if (!docValidation.canPayout) {
            await storage.createCommissionAuditLog({
              commissionId: id,
              performedBy: userId,
              action: 'dispersion_blocked',
              previousStatus: commission.status,
              newStatus: commission.status,
              details: {
                actorRole: user.role,
                reason: 'DOCUMENTATION_PREREQUISITES_MISSING',
                missingRequirements: docValidation.missingRequirements,
                bulk: true,
              },
            });
            failed.push({
              id,
              reason: `Documentación incompleta o no aprobada: ${docValidation.missingRequirements.join("; ")}`,
            });
            continue;
          }

          const payoutAmount = audit.payoutAmount;

          // Simulación STP masiva de prueba única al beneficiario legítimo
          const simResult = await processStpPayment(payoutAmount.toFixed(2), effectiveClabe);

          await storage.createCommissionAuditLog({
            commissionId: id,
            performedBy: userId,
            action: 'stp_simulation_tested',
            previousStatus: commission.status,
            newStatus: commission.status,
            details: {
              actorRole: user.role,
              payoutAmount,
              targetUserId,
              simResult,
              bulk: true,
              notice: 'Simulación STP masiva ejecutada para validación técnica. La comisión permanece en estado approved sin liquidación real.',
            },
          });

          successful.push({
            id,
            status: 'simulated_only',
            simulated: true,
            paid: false,
            transactionId: simResult.transactionId,
            payoutAmount,
            payoutBeneficiary: {
              userId: targetUserId,
              role: (isMbCredit || isMasterDirect) ? 'master_broker' : 'broker',
              amount: payoutAmount,
              clabe: effectiveClabe,
            },
            networkObligation: audit.networkObligation || null,
          });
          totalAmount += payoutAmount;
        } catch (err: any) {
          failed.push({ id, reason: err.message || "Error inesperado al dispersar" });
        }
      }

      res.json({
        successful,
        failed,
        totalProcessed: successful.length,
        totalAmount,
      });
    } catch (error) {
      console.error("Error in bulk pay commissions:", error);
      res.status(500).json({ message: "Error al procesar dispersión masiva" });
    }
  });

  // Mark commission as paid manually (Super Admin only)
  app.post('/api/commissions/:id/mark-paid', isAuthenticated, requireModuleAndAction('comisiones', 'approve_disperse'), async (req: any, res) => {
    try {
      const { id } = req.params;
      const { notes, reference } = req.body;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);

      if (!user || user.role !== 'super_admin') {
        return res.status(403).json({ message: "Solo Super Admin puede marcar comisiones como pagadas manualmente" });
      }

      if (!notes || typeof notes !== 'string' || notes.trim().length === 0) {
        return res.status(400).json({
          message: "La justificación o nota explicativa es obligatoria para marcar una comisión como pagada manualmente."
        });
      }

      const commission = await storage.getCommission(id);

      if (!commission) {
        return res.status(404).json({ message: "Comisión no encontrada" });
      }

      if (commission.status === 'paid') {
        if (typeof reference === "string" && reference.trim() && commission.trackingKey !== reference.trim()) {
          return res.status(409).json({ code: "MANUAL_PAYOUT_ALREADY_PAID_DIFFERENT_REFERENCE", message: "La comisión ya registra otro folio bancario." });
        }
        return res.json({ message: "La comisión ya estaba marcada como pagada", commission, alreadyPaid: true });
      }

      const hasValidApproval = (
        commission.status === 'approved' &&
        Boolean(commission.approvedBy) &&
        Boolean(commission.approvedAt) &&
        commission.frozenAmount != null &&
        commission.frozenAmount !== '' &&
        !isNaN(parseFloat(commission.frozenAmount))
      );

      if (!hasValidApproval) {
        await storage.createCommissionAuditLog({
          commissionId: id,
          performedBy: userId,
          action: 'dispersion_blocked',
          previousStatus: commission.status,
          newStatus: commission.status,
          details: {
            actorRole: user.role,
            reason: 'APPROVAL_PREREQUISITES_MISSING',
            status: commission.status,
            approvedBy: commission.approvedBy || null,
            approvedAt: commission.approvedAt || null,
            frozenAmount: commission.frozenAmount || null,
            manual: true,
          },
        });
        return res.status(400).json({
          message: "La liquidación manual requiere estado 'approved', approvedBy, approvedAt e importe congelado válido registrado por Super Admin.",
          code: "APPROVAL_PREREQUISITES_MISSING",
          commissionStatus: commission.status,
        });
      }

      const linkedCredit = commission.creditId ? await storage.getCredit(commission.creditId) : null;
      const historicalMasterBrokerId = commission.masterBrokerId || (linkedCredit?.originMasterBrokerId ?? null);
      const isMasterDirect = Boolean(
        historicalMasterBrokerId &&
        commission.brokerId &&
        String(commission.brokerId) === String(historicalMasterBrokerId)
      );
      const isMbCredit = Boolean(historicalMasterBrokerId);
      const audit = auditCommissionPayout({
        ...commission,
        originMasterBrokerId: historicalMasterBrokerId,
      });

      if (audit.hasDiscrepancy) {
        await storage.createCommissionAuditLog({
          commissionId: id,
          performedBy: userId,
          action: 'dispersion_blocked',
          previousStatus: commission.status,
          newStatus: commission.status,
          details: {
            actorRole: user.role,
            reason: 'FROZEN_AMOUNT_DISCREPANCY_MANUAL',
            audit,
          },
        });
        return res.status(400).json({
          message: audit.discrepancyReason,
          code: "FROZEN_AMOUNT_DISCREPANCY",
          requiresAdminReview: true,
          audit,
        });
      }

      const payoutAmount = audit.payoutAmount;

      // Validación opcional de monto si el cliente envía amount
      if (req.body.amount !== undefined && req.body.amount !== null) {
        const providedAmount = parseFloat(String(req.body.amount));
        if (isNaN(providedAmount) || Math.abs(providedAmount - payoutAmount) > 0.01) {
          return res.status(400).json({
            message: `Discrepancia en el monto liquidado: Se envió $${providedAmount.toFixed(2)} pero el importe auditado reglamentario es $${payoutAmount.toFixed(2)}.`,
            code: "PAYOUT_AMOUNT_MISMATCH",
          });
        }
      }

      // Resolver beneficiario reglamentario que recibe de Crédito Negocios (COM-03/06, PAG-08/13/14)
      const targetUserId = (isMbCredit || isMasterDirect) ? historicalMasterBrokerId! : commission.brokerId;
      const targetUser = await storage.getUser(targetUserId);

      if (!targetUser) {
        return res.status(404).json({
          message: "No se encontró el beneficiario histórico registrado para esta comisión."
        });
      }

      // Validación opcional de coincidencia de beneficiario si el cliente envía beneficiaryId
      if (req.body.beneficiaryId && String(req.body.beneficiaryId) !== String(targetUserId)) {
        return res.status(400).json({
          message: "El beneficiario indicado no coincide con el beneficiario reglamentario que recibe el pago de Crédito Negocios.",
          code: "BENEFICIARY_MISMATCH",
        });
      }

      // CLABE obligatoria del beneficiario que recibe de Crédito Negocios
      const registeredClabe = targetUser.clabe ? String(targetUser.clabe).trim() : null;
      if (!registeredClabe || !/^\d{18}$/.test(registeredClabe)) {
        return res.status(400).json({
          message: `El beneficiario histórico (${isMbCredit ? 'Master Bróker' : 'Bróker'} ${targetUser.firstName || ''} ${targetUser.lastName || ''}) no cuenta con una CLABE interbancaria válida de 18 dígitos registrada en su expediente.`
        });
      }

      // Documentary & Banking Validation Gate (FASE 2B.2C / PAG-01 a PAG-06 / COM-03/06, PAG-08/13/14)
      // Valida exclusivamente al beneficiario que recibe el pago de Crédito Negocios
      const docValidation = await validateCommissionPayoutPrerequisites(commission, storage);
      if (!docValidation.canPayout) {
        await storage.createCommissionAuditLog({
          commissionId: id,
          performedBy: userId,
          action: 'dispersion_blocked',
          previousStatus: commission.status,
          newStatus: commission.status,
          details: {
            actorRole: user.role,
            reason: 'DOCUMENTATION_PREREQUISITES_MISSING',
            missingRequirements: docValidation.missingRequirements,
            manual: true,
            beneficiaries: docValidation.beneficiaries,
          },
        });
        return res.status(400).json({
          message: `Liquidación manual bloqueada: Faltan requisitos documentales o bancarios validados por Super Admin: ${docValidation.missingRequirements.join("; ")}`,
          code: "DOCUMENTATION_PREREQUISITES_MISSING",
          missingRequirements: docValidation.missingRequirements,
          beneficiaries: docValidation.beneficiaries,
        });
      }

      // REGLA 3 (PAG-12/13): La referencia bancaria verificable es obligatoria para liquidaciones reales
      if (!reference || typeof reference !== 'string' || reference.trim().length === 0) {
        return res.status(400).json({
          message: "La referencia bancaria verificable (SPEI, folio o clave de rastreo) es obligatoria para el registro de pago real por Super Admin (PAG-12/PAG-13)."
        });
      }

      // REGLA 1 (COM-03/06, PAG-08/13/14): Crédito Negocios paga exclusivamente al Master por operaciones de su red.
      // El pago comprende la participación del Master y la de sus Brokers. El Master paga posteriormente a sus Brokers.
      // Se conserva el desglose y se registra la obligación Master->Broker como pending_master_payout SIN marcarla pagada por CN.
      const isSplitNetwork = Boolean(isMbCredit && !isMasterDirect && parseFloat(commission.brokerShare || '0') > 0);
      const brokerAmount = parseFloat(commission.brokerShare || '0');
      const masterAmount = parseFloat(commission.masterBrokerShare || '0');

      const networkObligation = isSplitNetwork ? {
        brokerId: commission.brokerId,
        brokerShare: brokerAmount,
        masterBrokerId: historicalMasterBrokerId!,
        status: 'pending_master_payout',
        registeredAt: new Date().toISOString(),
        notes: 'Crédito Negocios liquidó monto consolidado al Master Bróker. La dispersión al Bróker de red es obligación posterior del Master.',
      } : null;

      const payoutBeneficiary = {
        userId: targetUserId,
        role: (isMbCredit || isMasterDirect) ? 'master_broker' : 'broker',
        amount: payoutAmount,
        clabe: registeredClabe,
        bankName: targetUser.bankName || null,
        accountHolder: targetUser.accountHolder || `${targetUser.firstName || ''} ${targetUser.lastName || ''}`.trim() || null,
        method: 'manual',
        reference: String(reference).trim(),
        paidAt: new Date().toISOString(),
      };

      const manualPaymentUpdates = {
        status: 'paid' as const,
        paidAt: new Date(),
        paidBy: userId,
        paymentMethod: 'manual',
        clabe: registeredClabe,
        bankName: targetUser.bankName || null,
        accountHolder: targetUser.accountHolder || `${targetUser.firstName || ''} ${targetUser.lastName || ''}`.trim() || null,
        trackingKey: String(reference).trim(),
        notes: notes.trim(),
        providerResponse: {
          ...((commission.providerResponse as any) || {}),
          payoutBeneficiary,
          ...(networkObligation ? { networkObligation } : {}),
        },
      };
      const manualPaymentAudit = {
        commissionId: id,
        performedBy: userId,
        action: 'marked_paid_manually',
        previousStatus: commission.status,
        newStatus: 'paid',
        details: {
          actorRole: user.role,
          paidBy: userId,
          notes: notes.trim(),
          reference: String(reference).trim(),
          payoutAmount,
          payoutBeneficiary,
          ...(networkObligation ? { networkObligation } : {}),
        },
      };

      // Cast to the common contract: MemStorage deliberately lacks this optional PG method.
      const payoutStorage: IStorage = storage;
      const settled = payoutStorage.recordManualCommissionPayment
        ? await payoutStorage.recordManualCommissionPayment({
            commissionId: id, expected: commission,
            updates: manualPaymentUpdates, audit: manualPaymentAudit,
          })
        : { commission: (await storage.updateCommission(id, manualPaymentUpdates))!, alreadyPaid: false };

      // MemStorage remains a test implementation; live DbStorage settles audit in the transaction.
      if (!payoutStorage.recordManualCommissionPayment) {
        await storage.createCommissionAuditLog(manualPaymentAudit);
      }
      if (settled.alreadyPaid) {
        return res.json({ message: "La comisión ya estaba marcada como pagada", commission: settled.commission, alreadyPaid: true });
      }
      const updated = settled.commission;

      // A notification failure after COMMIT must not present payment as failed.
      try {
      // Notificar exclusivamente al beneficiario que efectivamente recibió el pago de Crédito Negocios
      if (isSplitNetwork) {
        const masterNotif = await storage.createNotification({
          userId: historicalMasterBrokerId!,
          type: 'commission_paid',
          title: 'Comisión de Red pagada (Liquidación consolidada al Master)',
          message: `Se registró el pago de Crédito Negocios por $${payoutAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN (incluye tu margen de $${masterAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN y la cuota de red de $${brokerAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN para dispersión a tu Bróker). Referencia: ${String(reference).trim()}. Justificación: ${notes.trim()}`,
          relatedEntityType: 'commission',
          relatedEntityId: commission.id,
          priority: 'high',
        });
        broadcastToUser(historicalMasterBrokerId!, { type: 'notification', notification: masterNotif });
      } else {
        const beneficiaryId = (isMbCredit || isMasterDirect) ? historicalMasterBrokerId! : commission.brokerId;
        const paidNotification = await storage.createNotification({
          userId: beneficiaryId,
          type: 'commission_paid',
          title: 'Comisión pagada (Liquidación manual)',
          message: `Se registró el pago manual por $${payoutAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN (${commission.commissionType || 'Apertura'}). Referencia: ${String(reference).trim()}. Justificación: ${notes.trim()}`,
          relatedEntityType: 'commission',
          relatedEntityId: commission.id,
          priority: 'high',
        });
        broadcastToUser(beneficiaryId, { type: 'notification', notification: paidNotification });
      }

      } catch (notificationError) {
        console.error("[Manual payout] Settlement committed; notification failed:", notificationError);
      }

      res.json({ message: "Comisión marcada como pagada exitosamente", commission: updated });
    } catch (error: any) {
      console.error("Error marking commission as paid:", error);
      if (typeof error?.message === "string" && error.message.startsWith("MANUAL_PAYOUT_")) {
        return res.status(409).json({
          code: error.message,
          message: "Liquidación bloqueada por datos aprobados modificados, pago previo o referencia bancaria duplicada.",
        });
      }
      res.status(500).json({ message: "Error al marcar la comisión como pagada" });
    }
  });

  // Document management with OCR

  // PAG-01/02: personal INE/CSF/bank statement for Broker and Master.
  // Never expose or mutate another beneficiary's file through this self-service API.
  const profileDocumentTypes = new Set(["ine", "csf", "bank_statement"]);
  const isOwnProfileDocument = (doc: any, id: string) =>
    doc?.brokerId === id && !doc.clientId && !doc.creditId &&
    profileDocumentTypes.has(doc.type);

  const requireProfileDocumentOwner = async (req: any, res: any, next: any) => {
    const userId = req.user?.claims?.sub || req.user?.id;
    const user = userId ? await storage.getUser(userId) : undefined;
    if (!user || !["broker", "master_broker"].includes(user.role) ||
        user.isActive === false || user.status === "inactive" || user.status === "suspended") {
      return res.status(403).json({ message: "Expediente disponible sólo para Broker o Master Broker activos." });
    }
    req.profileUserId = userId;
    next();
  };

  app.get("/api/broker/profile-documents", isAuthenticated, requireProfileDocumentOwner, async (req: any, res) => {
    try {
      const documents = (await storage.getDocuments({ brokerId: req.profileUserId }))
        .filter((doc) => isOwnProfileDocument(doc, req.profileUserId))
        .map((doc) => ({
          id: doc.id,
          type: doc.type,
          fileName: doc.fileName,
          fileSize: doc.fileSize,
          mimeType: doc.mimeType,
          uploadedAt: doc.uploadedAt,
        }));
      return res.json({ documents });
    } catch (error) {
      console.error("Error loading broker profile documents", error);
      return res.status(500).json({ message: "No fue posible consultar el expediente." });
    }
  });

  app.post("/api/broker/profile-documents", isAuthenticated, requireProfileDocumentOwner, upload.single("file"), async (req: any, res) => {
    let newPath: string | undefined;
    try {
      const userId = req.profileUserId as string;
      const type = String(req.body?.type || "").trim();
      if (!profileDocumentTypes.has(type)) {
        if (req.file?.path) await removeStoredDocument(req.file.path);
        return res.status(400).json({ message: "Tipo de documento no permitido." });
      }
      if (!req.file) return res.status(400).json({ message: "Se requiere un archivo." });
      // Avoid trusting a supplied beneficiary, tenant, client or credit ID.
      const file = req.file;
      const ownDocuments = (await storage.getDocuments({ brokerId: userId }))
        .filter(doc => isOwnProfileDocument(doc, userId));
      const previous = ownDocuments.find(doc => doc.type === type);
      const saved = await persistDocumentFile(file, { brokerId: userId, type });
      newPath = saved.filePath;

      const nextData = {
        brokerId: userId, uploadedBy: userId, type,
        fileName: file.originalname, filePath: saved.filePath,
        fileSize: file.size, mimeType: file.mimetype,
        isValid: false, expiresAt: null,
        extractedData: { status: "pending", reviewedBy: null, reviewedAt: null,
          reviewRole: null, reviewNotes: null, rejectionReason: null },
      };
      // Updating the existing document preserves its identity and invalidates its
      // previous approval. No previous file is deleted until persistence succeeds.
      const result = previous
        ? await storage.updateDocument(previous.id, nextData)
        : await storage.createDocument(insertDocumentSchema.parse({
            ...nextData, clientId: null, creditId: null,
            tenantId: req.tenantContext?.tenant?.id || null,
          }));
      if (!result) throw new Error("No fue posible persistir el documento.");
      if (previous && previous.filePath !== saved.filePath) {
        try { await removeStoredDocument(previous.filePath); }
        catch (cleanupErr) { console.warn("Previous document cleanup pending", cleanupErr); }
      }
      return res.status(previous ? 200 : 201).json({
        document: { id: result.id, type: result.type, fileName: result.fileName },
        status: "pending", requiresReview: true,
      });
    } catch (error) {
      if (newPath) {
        try { await removeStoredDocument(newPath); } catch (_) {}
      } else if (req.file?.path) {
        try { await removeStoredDocument(req.file.path); } catch (_) {}
      }
      console.error("Error uploading broker profile document", error);
      return res.status(500).json({ message: "No fue posible guardar el documento." });
    }
  });

  app.delete("/api/broker/profile-documents/:id", isAuthenticated, requireProfileDocumentOwner, async (req: any, res) => {
    try {
      const doc = await storage.getDocument(req.params.id);
      if (!doc) return res.status(404).json({ message: "Documento no encontrado." });
      if (!isOwnProfileDocument(doc, req.profileUserId)) {
        return res.status(403).json({ message: "No puedes eliminar documentos ajenos ni expedientes de clientes." });
      }
      const deleted = await storage.deleteDocument(doc.id);
      if (!deleted) return res.status(500).json({ message: "No fue posible eliminar el registro." });
      try { await removeStoredDocument(doc.filePath); }
      catch (cleanupErr) { console.warn("Profile document file cleanup pending", cleanupErr); }
      return res.json({ success: true });
    } catch (error) {
      console.error("Error deleting profile document", error);
      return res.status(500).json({ message: "No fue posible eliminar el documento." });
    }
  });

  app.get("/api/broker/profile-documents/:id/download", isAuthenticated, requireProfileDocumentOwner, async (req: any, res) => {
    try {
      const doc = await storage.getDocument(req.params.id);
      if (!doc) return res.status(404).json({ message: "Documento no encontrado." });
      if (!isOwnProfileDocument(doc, req.profileUserId)) {
        return res.status(403).json({ message: "No puedes consultar documentos ajenos." });
      }
      const target = await getDocumentAccessTarget(doc.filePath, { download: true, fileName: doc.fileName });
      res.setHeader("Cache-Control", "private, no-store");
      if (target.kind === "redirect") return res.redirect(target.url);
      return res.download(target.absolutePath, doc.fileName);
    } catch (error) {
      console.error("Error downloading profile document", error);
      return res.status(500).json({ message: "No fue posible descargar el documento." });
    }
  });

  app.post('/api/documents', isAuthenticated, requireModuleAndAction('documentos', 'edit'), upload.single('file'), async (req: any, res) => {
    let storedFilePath: string | undefined;

    try {
      const userId = req.user.claims.sub;
      const { clientId, creditId, type, customDocumentName } = req.body;
      const file = req.file;
      
      if (!file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const uploadUser = await storage.getUser(userId);
      const destination = await validateDocumentWriteDestination({
        userId, userRole: uploadUser?.role || "", tenantContext: req.tenantContext,
        clientId: clientId || null, creditId: creditId || null,
      });
      if (!destination.allowed) {
        // Multer already wrote the temporary file; reject without leaving
        // unowned sensitive bytes on disk or uploading them to Supabase.
        await removeStoredDocument(file.path);
        return res.status(destination.statusCode || 403).json({
          code: destination.code, message: destination.message,
        });
      }
      // Resolve ownership from *authorized* resources only.
      const documentTenantId = destination.client?.tenantId ||
        destination.credit?.tenantId || req.tenantContext?.tenant?.id || null;
      const documentBrokerId = destination.credit?.brokerId ||
        destination.client?.brokerId || userId;
      
      const extractedData = {
        ...getDocumentExtractedData(),
        ...(customDocumentName ? { customDocumentName: String(customDocumentName).trim() } : {}),
      };
      const storedFile = await persistDocumentFile(file, {
        brokerId: documentBrokerId,
        clientId: clientId || null,
        creditId: creditId || null,
        type,
      });
      storedFilePath = storedFile.filePath;
      
      const documentData = insertDocumentSchema.parse({
        tenantId: documentTenantId,
        clientId: clientId || null,
        creditId: creditId || null,
        brokerId: documentBrokerId,
        uploadedBy: userId,
        type,
        fileName: file.originalname,
        filePath: storedFile.filePath,
        fileSize: file.size,
        mimeType: file.mimetype,
        extractedData,
      });
      
      const document = await storage.createDocument(documentData);
      
      res.status(201).json(document);
    } catch (error) {
      if (storedFilePath) {
        try {
          await removeStoredDocument(storedFilePath);
        } catch (cleanupError) {
          console.error("Error cleaning up stored document after failed create:", cleanupError);
        }
      }
      console.error("Error uploading document:", error);
      res.status(500).json({ message: "Failed to upload document" });
    }
  });

  app.get('/api/documents/:id/file', isAuthenticated, requireModuleAndAction('documentos', 'view'), async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);

      const authResult = await authorizeDocumentAccess(userId, user?.role || '', id, req.tenantContext);
      if (!authResult.authorized || !authResult.document) {
        return res.status(authResult.reason === 'Document not found' ? 404 : 403).json({ message: authResult.reason || 'Access denied' });
      }

      const accessTarget = await getDocumentAccessTarget(authResult.document.filePath, {
        fileName: authResult.document.fileName,
      });

      if (accessTarget.kind === 'redirect') {
        return res.redirect(accessTarget.url);
      }

      if (authResult.document.mimeType) {
        res.type(authResult.document.mimeType);
      }

      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(authResult.document.fileName)}"`);
      return res.sendFile(accessTarget.absolutePath);
    } catch (error) {
      console.error('Error opening document:', error);
      res.status(500).json({ message: 'Failed to open document' });
    }
  });

  app.get('/api/documents/:id/download', isAuthenticated, requireModuleAndAction('documentos', 'view'), async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);

      const authResult = await authorizeDocumentAccess(userId, user?.role || '', id, req.tenantContext);
      if (!authResult.authorized || !authResult.document) {
        return res.status(authResult.reason === 'Document not found' ? 404 : 403).json({ message: authResult.reason || 'Access denied' });
      }

      const accessTarget = await getDocumentAccessTarget(authResult.document.filePath, {
        download: true,
        fileName: authResult.document.fileName,
      });

      if (accessTarget.kind === 'redirect') {
        return res.redirect(accessTarget.url);
      }

      return res.download(accessTarget.absolutePath, authResult.document.fileName);
    } catch (error) {
      console.error('Error downloading document:', error);
      res.status(500).json({ message: 'Failed to download document' });
    }
  });

  app.get('/api/documents', isAuthenticated, requireModuleAndAction('documentos', 'view'), async (req: any, res) => {
    try {
      const { clientId, creditId } = req.query;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      // Never prefilter by the CURRENT tenant or Master network: doing so
      // hides the historical Master's rightful files and can leak a new
      // Master's old-network files. Enforce origin per individual document.
      const documents = await storage.getDocuments({
        clientId: clientId as string,
        creditId: creditId as string,
      });
      if (user?.role === "admin" || user?.role === "super_admin") return res.json(documents);
      const visible = await filterAuthorizedClientListing(documents, async doc => {
        const auth = await authorizeDocumentAccess(userId, user?.role || "", doc.id, req.tenantContext);
        return Boolean(auth.authorized);
      });
      return res.json(visible);
    } catch (error) {
      console.error("Error fetching documents:", error);
      return res.status(500).json({ message: "Failed to fetch documents" });
    }
  });

  app.get('/api/documents/client/:clientId', isAuthenticated, requireModuleAndAction('documentos', 'view'), async (req: any, res) => {
    try {
      const { clientId } = req.params;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      const client = await storage.getClient(clientId);
      if (!client) return res.status(404).json({ message: "Client not found" });
      // Basic client scope is NOT the only source of access: a historical
      // Master retains rights to documents of its immutable-origin credits.
      const authResult = await authorizeClientAccess(userId, user?.role || "", clientId, req.tenantContext);
      const documents = await storage.getDocuments({ clientId });

      // A Master with oversight of the client must NOT inherit historic
      // documents from a Broker who moved networks. Check each file's origin.
      const filteredDocuments = await filterAuthorizedClientListing(documents, async doc => {
        const access = await authorizeDocumentAccess(userId, user?.role || "", doc.id, req.tenantContext);
        return Boolean(access.authorized);
      });

      if (!authResult.authorized && filteredDocuments.length === 0) {
        return res.status(403).json({ message: "Client documents not accessible" });
      }
      res.json(filteredDocuments);

    } catch (error) {
      console.error("Error fetching client documents:", error);
      res.status(500).json({ message: "Failed to fetch client documents" });
    }
  });

  app.put('/api/documents/:id', isAuthenticated, requireModuleAndAction('documentos', 'edit'), upload.single('file'), async (req: any, res) => {
    let newStoredFilePath: string | undefined;

    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      // Authorization check - broker/tenant access
      const authResult = await authorizeDocumentAccess(userId, user?.role || '', id, req.tenantContext);
      if (!authResult.authorized) {
        if (req.file?.path) await removeStoredDocument(req.file.path);
        return res.status(authResult.reason === 'Document not found' ? 404 : 403).json({ message: authResult.reason });
      }
      // Read/supervision permission must not become write permission over
      // another Broker's or beneficiary's document.
      const ownsDocument = authResult.document?.brokerId === userId ||
        authResult.document?.uploadedBy === userId;
      if (user?.role !== "super_admin" && user?.role !== "admin" && !ownsDocument) {
        if (req.file?.path) await removeStoredDocument(req.file.path);
        return res.status(403).json({
          code: "DOCUMENT_WRITE_OWNER_REQUIRED",
          message: "La supervisión de red no autoriza modificar documentos de otros Brokers.",
        });
      }

      const { clientId, creditId, type } = req.body;
      const file = req.file;
      const nextClientId = clientId !== undefined ? (clientId || null) : authResult.document.clientId;
      const nextCreditId = creditId !== undefined ? (creditId || null) : authResult.document.creditId;
      const destination = await validateDocumentWriteDestination({
        userId, userRole: user?.role || "", tenantContext: req.tenantContext,
        clientId: nextClientId, creditId: nextCreditId,
      });
      if (!destination.allowed) {
        if (file?.path) await removeStoredDocument(file.path);
        return res.status(destination.statusCode || 403).json({
          code: destination.code, message: destination.message,
        });
      }

      let updateData: any = {
        clientId: nextClientId,
        creditId: nextCreditId,
        type: type ?? authResult.document.type,
      };
      
      // If new file is uploaded, update file information and process OCR
      if (file) {
        const extractedData = getDocumentExtractedData();
        const storedFile = await persistDocumentFile(file, {
          brokerId: userId,
          clientId: clientId || authResult.document.clientId || null,
          creditId: creditId || authResult.document.creditId || null,
          type: type || authResult.document.type,
        });
        newStoredFilePath = storedFile.filePath;

        updateData = {
          ...updateData,
          fileName: file.originalname,
          filePath: storedFile.filePath,
          fileSize: file.size,
          mimeType: file.mimetype,
          extractedData,
        };
      }

      // REGLA 4 (PAG-07 / FIN-13/14): Invalidar aprobaciones cuando se cambie el archivo, su tipo o titular
      const isFileUpdated = Boolean(file);
      const isTypeChanged = Boolean(type && type !== authResult.document.type);
      const isClientChanged = Boolean(clientId !== undefined && clientId !== authResult.document.clientId);

      if (isFileUpdated || isTypeChanged || isClientChanged) {
        updateData.isValid = false;
        const currentExtracted = (authResult.document.extractedData as any) || {};
        updateData.extractedData = {
          ...(isFileUpdated ? updateData.extractedData : currentExtracted),
          status: 'pending',
          reviewedBy: null,
          reviewedByName: null,
          reviewedAt: null,
          reviewRole: null,
          reviewNotes: null,
          invalidatedAt: new Date().toISOString(),
          invalidatedReason: isFileUpdated ? 'FILE_REPLACED' : isTypeChanged ? 'TYPE_CHANGED' : 'HOLDER_CHANGED',
        };
      }
      
      const document = await storage.updateDocument(id, updateData);
      
      if (!document) {
        if (newStoredFilePath) {
          await removeStoredDocument(newStoredFilePath);
        }
        return res.status(404).json({ message: "Document not found" });
      }

      // Clean up previous file if replaced
      if (file && authResult.document?.filePath && authResult.document.filePath !== newStoredFilePath) {
        try {
          await removeStoredDocument(authResult.document.filePath);
        } catch (cleanupError) {
          console.error('Error deleting previous document file after update:', cleanupError);
        }
      }
      
      res.json(document);
    } catch (error) {
      if (newStoredFilePath) {
        try {
          await removeStoredDocument(newStoredFilePath);
        } catch (cleanupError) {
          console.error('Error cleaning up new stored document after failed update:', cleanupError);
        }
      }
      console.error("Error updating document:", error);
      res.status(500).json({ message: "Failed to update document" });
    }
  });

  app.delete('/api/documents/:id', isAuthenticated, requireModuleAndAction('documentos', 'edit'), async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      // Authorization check - broker/tenant access
      const authResult = await authorizeDocumentAccess(userId, user?.role || '', id, req.tenantContext);
      if (!authResult.authorized) {
        return res.status(authResult.reason === 'Document not found' ? 404 : 403).json({ message: authResult.reason });
      }
      const ownsDocument = authResult.document?.brokerId === userId ||
        authResult.document?.uploadedBy === userId;
      if (user?.role !== "super_admin" && user?.role !== "admin" && !ownsDocument) {
        return res.status(403).json({
          code: "DOCUMENT_WRITE_OWNER_REQUIRED",
          message: "La supervisión de red no autoriza eliminar documentos de otros Brokers.",
        });
      }
      const deletionScope = await validateDocumentWriteDestination({
        userId, userRole: user?.role || "", tenantContext: req.tenantContext,
        clientId: authResult.document?.clientId,
        creditId: authResult.document?.creditId,
      });
      if (!deletionScope.allowed) {
        return res.status(deletionScope.statusCode || 403).json({
          code: deletionScope.code, message: deletionScope.message,
        });
      }

      const success = await storage.deleteDocument(id);
      
      if (success) {
        try {
          await removeStoredDocument(authResult.document.filePath);
        } catch (cleanupError) {
          console.error('Error deleting stored document file after record deletion:', cleanupError);
        }
        res.json({ message: "Document deleted successfully" });
      } else {
        res.status(404).json({ message: "Document not found" });
      }
    } catch (error) {
      console.error("Error deleting document:", error);
      res.status(500).json({ message: "Failed to delete document" });
    }
  });

  // =========================================================================
  // FASE 2B.2C: VALIDACIÓN ADMINISTRATIVA DOCUMENTAL DE COMISIONES (PAG-01 A PAG-06)
  // =========================================================================

  // Dictamen / revisión administrativa de documentos por Super Admin
  async function processDocumentReview(req: any, res: any, forcedStatus?: 'approved' | 'rejected') {
    try {
      const { id } = req.params;
      const status = forcedStatus || req.body?.status;
      const notes = req.body?.notes;
      const expiresAt = req.body?.expiresAt;
      const userId = req.user?.claims?.sub || req.user?.id;
      const user = await storage.getUser(userId);

      // Regla 2: Exclusividad Super Admin
      if (!user || user.role !== 'super_admin') {
        return res.status(403).json({
          message: "Solo Super Admin puede dictaminar y validar documentos para cobro de comisiones.",
          code: "FORBIDDEN_SUPER_ADMIN_REQUIRED",
        });
      }

      if (!status || !['approved', 'rejected'].includes(status)) {
        return res.status(400).json({
          message: "El campo 'status' es obligatorio y debe ser 'approved' o 'rejected'.",
        });
      }

      if (status === 'rejected' && (!notes || !String(notes).trim())) {
        return res.status(400).json({
          message: "Es obligatorio proporcionar un motivo o justificación ('notes') al rechazar un documento.",
        });
      }

      const document = await storage.getDocument(id);
      if (!document) {
        return res.status(404).json({ message: "Documento no encontrado." });
      }

      // Regla 2: Prohibición estricta de auto-aprobación
      if (document.brokerId === userId || document.uploadedBy === userId) {
        return res.status(403).json({
          message: "Conflicto de interés: Un usuario no puede auto-aprobar o dictaminar sus propios documentos.",
          code: "SELF_REVIEW_FORBIDDEN",
        });
      }

      const updatedDoc = await storage.updateDocument(id, {
        isValid: status === 'approved',
        expiresAt: expiresAt ? (typeof expiresAt === 'string' && expiresAt.includes('T') ? expiresAt.split('T')[0] : String(expiresAt)) : (document.expiresAt || null),
        extractedData: {
          ...((document.extractedData as any) || {}),
          status,
          reviewedBy: userId,
          reviewedByName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
          reviewedAt: new Date().toISOString(),
          reviewRole: 'super_admin',
          reviewNotes: notes ? String(notes).trim() : null,
          rejectionReason: status === 'rejected' ? String(notes).trim() : null,
        },
      });

      // Notificar al beneficiario del dictamen
      const beneficiaryId = document.brokerId || document.uploadedBy;
      if (beneficiaryId) {
        try {
          const notification = await storage.createNotification({
            userId: beneficiaryId,
            type: status === 'approved' ? 'document_approved' : 'document_rejected',
            title: status === 'approved' ? 'Documento aprobado por Super Admin' : 'Documento rechazado por Super Admin',
            message: status === 'approved'
              ? `Tu documento (${document.fileName}) ha sido aprobado para cobro de comisiones.`
              : `Tu documento (${document.fileName}) fue rechazado: ${notes ? String(notes).trim() : 'Revisión no aprobada'}.`,
            relatedEntityType: 'document',
            relatedEntityId: document.id,
            priority: status === 'rejected' ? 'high' : 'normal',
          });
          broadcastToUser(beneficiaryId, { type: 'notification', notification });
        } catch (notifErr) {
          console.error("Error creating document review notification:", notifErr);
        }
      }

      return res.json({
        message: `Documento ${status === 'approved' ? 'aprobado' : 'rechazado'} exitosamente.`,
        document: updatedDoc,
      });
    } catch (error) {
      console.error("Error reviewing document:", error);
      res.status(500).json({ message: "Error al dictaminar el documento." });
    }
  }

  app.post('/api/documents/:id/review', isAuthenticated, async (req: any, res) => {
    return processDocumentReview(req, res);
  });

  // Alias para aprobación directa
  app.post('/api/documents/:id/approve', isAuthenticated, async (req: any, res) => {
    return processDocumentReview(req, res, 'approved');
  });

  // Alias para rechazo directo
  app.post('/api/documents/:id/reject', isAuthenticated, async (req: any, res) => {
    return processDocumentReview(req, res, 'rejected');
  });

  // Consulta de estatus de validación de beneficiario
  app.get('/api/beneficiaries/:id/payout-validation', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims?.sub || req.user.id;
      const user = await storage.getUser(userId);

      // Un broker/master puede ver el suyo; Super Admin y Admin pueden ver cualquiera
      const isSelf = userId === id;
      const isAdmin = user?.role === 'super_admin' || user?.role === 'admin';
      if (!isSelf && !isAdmin) {
        return res.status(403).json({ message: "No autorizado para consultar este beneficiario." });
      }

      const result = await validateBeneficiaryPayoutDocuments(id, storage);
      return res.json(result);
    } catch (error) {
      console.error("Error validating beneficiary payout documents:", error);
      res.status(500).json({ message: "Error al validar la documentación del beneficiario." });
    }
  });

  // Validación por comisión: sólo Super Admin ve detalles bancarios y documentación sensible.
  app.get('/api/commissions/:id/payout-validation', isAuthenticated, requireModuleAndAction('comisiones', 'view'), async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const commission = await storage.getCommission(id);
      if (!commission) return res.status(404).json({ message: "Comisión no encontrada." });

      const credit = commission.creditId ? await storage.getCredit(commission.creditId) : null;
      const historicalMasterId = commission.masterBrokerId || credit?.originMasterBrokerId || null;
      const isPlatformAdmin = user?.role === 'super_admin' || user?.role === 'admin';
      if (!isPlatformAdmin && commission.brokerId !== userId && historicalMasterId !== userId) {
        return res.status(403).json({ message: "No tienes permiso para consultar esta comisión." });
      }

      const result = await validateCommissionPayoutPrerequisites(commission, storage);
      if (user?.role === 'super_admin') return res.json(result);
      // No revelar CLABE, cuenta, nombre de titular ni revisión documental de terceros.
      return res.json({
        canPayout: result.canPayout,
        documentationStatus: result.canPayout ? 'ready' : 'pending',
        message: result.canPayout
          ? 'El beneficiario de Crédito Negocios cumple los requisitos de liquidación.'
          : 'La validación documental o bancaria del beneficiario está pendiente.',
      });
    } catch (error) {
      console.error("Error validating commission payout prerequisites:", error);
      res.status(500).json({ message: "Error al validar los requisitos de la comisión." });
    }
  });

  // Broker network management
  app.get('/api/broker-network', isAuthenticated, requireModule('red_brokers'), async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (user?.role !== 'master_broker' && user?.role !== 'admin' && user?.role !== 'super_admin') {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

      if (isAdmin) {
        // API never sends hashed passwords or reusable reset tokens to a
        // Super Admin / Admin browser, including nested broker networks.
        const allUsers = (await storage.getAllUsers()).map(u => ({
          ...publicUserForManagement(u),
          registrationStatus: u.password ? 'registered' : 'pending',
        }));
        const masterBrokers = allUsers.filter(u => u.role === 'master_broker');
        const allBrokers = allUsers.filter(u => u.role === 'broker');

        // Master brokers with their respective network brokers
        const masterBrokersWithNetwork = masterBrokers.map(mb => ({
          ...mb,
          networkBrokers: allBrokers.filter(b => b.masterBrokerId === mb.id),
        }));

        // Brokers directos que no tienen master broker asignado
        const independentDirectBrokers = allBrokers.filter(b => !b.masterBrokerId);

        // Brokers asignados directamente al super admin
        const adminNetworkBrokers = allBrokers.filter(b => b.masterBrokerId === userId);

        return res.json({
          masterBrokers: masterBrokersWithNetwork,
          independentBrokers: independentDirectBrokers,
          adminBrokers: adminNetworkBrokers,
          allBrokers,
        });
      }

      // If user is a Master Broker, return their own brokers
      const brokers = await storage.getUsersByMasterBroker(userId);
      res.json(brokers.map(u => ({
        ...publicUserForManagement(u),
        registrationStatus: u.password ? 'registered' : 'pending',
      })));
    } catch (error) {
      console.error("Error fetching broker network:", error);
      res.status(500).json({ message: "Failed to fetch broker network" });
    }
  });

  // Approved launch onboarding: invitation must produce real mail and canonical
  // organization ownership. Never silently reassign an existing Broker.
  app.post('/api/broker-invitations', isAuthenticated, authMutationLimiter, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || req.user?.id;
      const inviter = await storage.getUser(userId);
      if (!inviter || !["master_broker", "admin", "super_admin"].includes(inviter.role)) {
        return res.status(403).json({ message: "No autorizado para invitar Brokers." });
      }

      const input = z.object({
        email: z.string().trim().email().max(320),
        firstName: z.string().trim().max(120).optional(),
        lastName: z.string().trim().max(120).optional(),
        phone: z.string().trim().max(35).optional(),
        message: z.string().trim().max(500).optional(),
        masterBrokerId: z.string().trim().optional(),
        promoCode: z.string().trim().max(80).optional(),
        promoMode: z.enum(["none", "annual_courtesy"]).optional(),
        role: z.enum(["broker", "master_broker"]).default("broker"),
      }).safeParse(req.body);
      if (!input.success) return res.status(400).json({ message: "Datos de invitación inválidos." });
      const data = input.data;
      const normalizedEmail = data.email.toLowerCase();
      const invitedRole = data.role;
      if (invitedRole === "master_broker" && inviter.role !== "super_admin")
        return res.status(403).json({ message: "Sólo Super Admin puede invitar nuevos Master Brokers." });
      if (inviter.role === "admin" && data.masterBrokerId)
        return res.status(403).json({ message: "Sólo Super Admin puede afiliar Brokers a un Master." });

      const result = await dispatchBrokerInvitation(userId, inviter, data);
      return res.status(result.status).json(result.body);
    } catch (error: any) {
      if (error instanceof BrokerInvitationError) return res.status(error.statusCode).json({message:error.message});
      console.error("Error inviting Broker:", error);
      if (error?.code === "EMAIL_ALREADY_EXISTS" || error?.code === "23505") {
        return res.status(409).json({ message: "El usuario ya existe. Vuelve a cargar la red antes de invitar." });
      }
      if (error?.name === "ZodError") return res.status(400).json({ message: "Datos de invitación inválidos." });
      return res.status(error?.statusCode && error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 500)
        .json({ message: error?.statusCode ? error.message : "No fue posible crear la invitación." });
    }
  });


  // Super Admin bulk launch invitation: PREVIEW is read-only; SEND is explicit.
  // Never call the single HTTP endpoint recursively or trust submitted tenant IDs.
  const invitationExcelUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024, files: 1 },
    fileFilter(_req, file, callback) {
      if (!/\.xlsx$/i.test(file.originalname)) return callback(new Error("Sólo archivos .xlsx"));
      callback(null, true);
    },
  }).single("file");

  // Invitation follow-up is an operations list, not a platform contact export.
  // Only Super Admin may view names, phone numbers and invitation states.
  app.get("/api/broker-invitations/pending", isAuthenticated, async (req: any, res) => {
    try {
      const current = await storage.getUser(req.user?.claims?.sub || req.user?.id);
      if (current?.role !== "super_admin") return res.status(403).json({ message: "Sólo Super Admin." });
      const { rows } = await pool.query([
        "WITH first_invite AS (",
        "SELECT n.data->>'brokerId' AS user_id, MIN(n.created_at) AS invited_at",
        "FROM public.notifications n WHERE n.type = 'broker_invitation_sent'",
        "AND n.data->>'brokerId' IS NOT NULL GROUP BY n.data->>'brokerId'",
        "), reminder_state AS (",
        "SELECT user_id, ARRAY_AGG(reminder_day ORDER BY reminder_day)",
        "FILTER (WHERE status='sent') AS sent_days,",
        "MAX(sent_at) AS last_reminder_at,",
        "COUNT(*) FILTER (WHERE status='failed') AS failed_reminders",
        "FROM public.broker_invitation_reminder_events GROUP BY user_id",
        ") SELECT u.id, u.first_name AS \"firstName\", u.last_name AS \"lastName\",",
        "u.email, u.role, COALESCE(u.profile_data->>'phone','') AS phone,",
        "m.email AS \"masterEmail\", fi.invited_at AS \"invitedAt\",",
        "COALESCE(rs.sent_days, ARRAY[]::smallint[]) AS \"sentDays\",",
        "rs.last_reminder_at AS \"lastReminderAt\",",
        "COALESCE(rs.failed_reminders, 0) AS \"failedReminders\",",
        "COALESCE(u.profile_data->>'invitationFollowupPaused','false')='true' AS paused",
        "FROM first_invite fi JOIN public.users u ON u.id=fi.user_id",
        "LEFT JOIN public.users m ON m.id=u.master_broker_id",
        "LEFT JOIN reminder_state rs ON rs.user_id=u.id",
        "WHERE u.role IN ('broker','master_broker')",
        "AND u.password IS NULL AND u.is_active IS DISTINCT FROM FALSE",
        "ORDER BY fi.invited_at ASC LIMIT 1000",
      ].join(" "));
      return res.json({ total: rows.length, contacts: rows });
    } catch (error) {
      console.error("[Invites] Unable to list pending activations", error);
      return res.status(500).json({ message: "No se pudieron consultar los invitados pendientes" });
    }
  });

  app.post("/api/broker-invitations/pending/:id/pause", isAuthenticated, async (req: any, res) => {
    try {
      const actor = await storage.getUser(req.user?.claims?.sub || req.user?.id);
      if (actor?.role !== "super_admin") return res.status(403).json({ message: "Sólo Super Admin." });
      if (typeof req.body?.paused !== "boolean")
        return res.status(400).json({ message: "El campo paused debe ser booleano." });
      const target = await storage.getUser(req.params.id);
      if (!target || !["broker","master_broker"].includes(target.role) || target.password)
        return res.status(404).json({ message: "Invitación pendiente no encontrada." });
      const profile = target.profileData && typeof target.profileData === "object"
        ? target.profileData as Record<string, unknown> : {};
      await storage.updateUser(target.id, {
        profileData: { ...profile, invitationFollowupPaused: req.body.paused },
      } as any);
      return res.json({ ok: true, paused: req.body.paused });
    } catch (error) {
      console.error("[Invites] Unable to change reminder suppression", error);
      return res.status(500).json({ message: "No se pudo actualizar el seguimiento." });
    }
  });

  app.get("/api/broker-invitations/bulk/template", isAuthenticated, async (req:any,res) => {
    const user = await storage.getUser(req.user?.claims?.sub || req.user?.id);
    if(user?.role!=="super_admin") return res.status(403).json({message:"Sólo Super Admin."});
    const bytes=generateBrokerInvitationExcelTemplate();
    res.setHeader("Content-Type","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition",'attachment; filename="CreditoNegocios_Invitaciones.xlsx"');
    return res.send(bytes);
  });

  app.post("/api/broker-invitations/bulk/preview", isAuthenticated,
    invitationExcelUpload, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || req.user?.id;
      const user = await storage.getUser(userId);
      if (user?.role !== "super_admin") return res.status(403).json({message:"Sólo Super Admin puede invitar masivamente."});
      if (!req.file?.buffer) return res.status(400).json({message:"Adjunta la plantilla XLSX."});
      const preview = parseBrokerInvitationExcel(req.file.buffer);
      const warnings: Array<{row:number;message:string}> = [];
      const invitationState = new Map<string, "already_sent" | "activated" | "not_sent">();
      // Read-only reconciliation: tell the operator which rows were already
      // delivered before offering to resume a partially processed spreadsheet.
      if (process.env.USE_MEMORY_STORAGE !== "true") {
      const accountStates = await pool.query<{
        email: string; activated: boolean; delivered: boolean;
      }>(
        `SELECT lower(u.email) AS email, (u.password IS NOT NULL) AS activated,
                  EXISTS(SELECT 1 FROM public.notifications n
                         WHERE n.type='broker_invitation_sent'
                           AND n.data->>'brokerId'=u.id) AS delivered
             FROM public.users u
            WHERE lower(u.email) = ANY($1::text[])`,
        [preview.rows.map(row => row.email)],
      );
      for (const item of accountStates.rows) {
        invitationState.set(item.email,
          item.activated ? "activated" : item.delivered ? "already_sent" : "not_sent");
      }
      }
      const couponDemand = new Map<string, { count: number; row: number }>();
      // Master indicated in the Excel but not in this batch must exist already.
      const masterEmails = new Set(preview.rows.filter(r=>r.role==="master_broker").map(r=>r.email));
      for (const row of preview.rows) {
        // Previously accepted emails and activated accounts require NO additional
        // coupon capacity, nor coupon revalidation (the old code could reject
        // the remaining 19 invitations because 25 rows were already sent).
        const alreadyHandled = ["already_sent", "activated"].includes(invitationState.get(row.email) || "");
        if (!alreadyHandled) try {
          const courtesy = await resolveOptionalInvitationPromo(
            row.promoCode || (typeof req.body?.promoCode === "string" ? req.body.promoCode : null), row.role);
          if (courtesy) {
            const demand = couponDemand.get(courtesy.id) || { count: 0, row: row.row };
            couponDemand.set(courtesy.id, { ...demand, count: demand.count + 1 });
          }
        } catch (e: any) {
          preview.errors.push({ row: row.row, field: "codigo_promocional", message: e.message || "Cupón inválido" });
        }
        if (row.masterEmail && !masterEmails.has(row.masterEmail)) {
          const candidate = await storage.getUserByEmail(row.masterEmail);
          if (!candidate || candidate.role !== "master_broker" || candidate.isActive === false)
            preview.errors.push({row:row.row,field:"correo_master_asignado",
              message:"Master no existe o está inactivo. Inclúyelo en el archivo o invítalo primero."});
        }
        const userExists = await storage.getUserByEmail(row.email);
        if (userExists) warnings.push({row:row.row,message:"Correo ya registrado: sólo se permitirá reenviar si sigue sin activar y conserva su red."});
      }
      for (const [id, demand] of Array.from(couponDemand.entries())) {
        const coupon = await storage.getPromoCode(id);
        if (coupon?.maxUses != null && coupon.maxUses - (coupon.currentUses || 0) < demand.count) {
          preview.errors.push({row:demand.row,field:"codigo_promocional",
            message:`El cupón ${coupon.code} sólo tiene ${coupon.maxUses - (coupon.currentUses || 0)} usos disponibles para ${demand.count} invitados.`});
        }
      }
      const rowsWithStatus = preview.rows.map(row => ({
        ...row, deliveryStatus: invitationState.get(row.email) || "not_sent",
      }));
      return res.json({ ...preview, rows: rowsWithStatus, warnings,
        alreadyDelivered: rowsWithStatus.filter(row =>
          row.deliveryStatus === "already_sent" || row.deliveryStatus === "activated").length,
        remaining: rowsWithStatus.filter(row => row.deliveryStatus === "not_sent").length,
        ready: preview.errors.length===0 });
    } catch(error:any) {
      return res.status(400).json({message:error?.message||"No fue posible analizar el archivo."});
    }
  });

  app.post("/api/broker-invitations/bulk/send", isAuthenticated, bulkBrokerInvitationLimiter,
    invitationExcelUpload, async (req:any,res) => {
    try {
      const userId = req.user?.claims?.sub || req.user?.id;
      const inviter = await storage.getUser(userId);
      if (inviter?.role !== "super_admin") return res.status(403).json({message:"Sólo Super Admin puede invitar masivamente."});
      if (req.body?.confirmation !== "ENVIAR_INVITACIONES") return res.status(400).json({message:"Confirma expresamente el envío."});
      if (!req.file?.buffer) return res.status(400).json({message:"Adjunta la plantilla XLSX."});
      validateInvitationTransport();
      const parsed = parseBrokerInvitationExcel(req.file.buffer);
      const ordered = [...parsed.rows.filter(x=>x.role==="master_broker"), ...parsed.rows.filter(x=>x.role==="broker")];
      const offset = Number(req.body?.offset ?? 0);
      const limit = Number(req.body?.limit ?? 2);
      if (!Number.isSafeInteger(offset) || offset < 0 || offset >= ordered.length ||
          !Number.isSafeInteger(limit) || limit < 1 || limit > 2) {
        return res.status(400).json({ message: "Lote inválido: máximo dos invitaciones por petición." });
      }
      const selectedRows = ordered.slice(offset, offset + limit);
      const errors = [...parsed.errors];
      const couponDemand = new Map<string, { count: number; row: number }>();
      const batchMasters = new Set(parsed.rows.filter(r=>r.role==="master_broker").map(r=>r.email));
      for(const row of selectedRows) {
        const alreadyRegistered = await storage.getUserByEmail(row.email);
        const hasDelivered = alreadyRegistered ? await pool.query(
          "SELECT 1 FROM public.notifications WHERE type = 'broker_invitation_sent' AND data->>'brokerId' = $1 LIMIT 1",
          [alreadyRegistered.id]) : null;
        const noResend = Boolean(alreadyRegistered?.password || hasDelivered?.rowCount);
        if (!noResend) try {
          const coupon = await resolveOptionalInvitationPromo(
            row.promoCode || (typeof req.body?.promoCode === "string" ? req.body.promoCode : null), row.role);
          if (coupon) {
            const demand = couponDemand.get(coupon.id) || { count: 0, row: row.row };
            couponDemand.set(coupon.id, { ...demand, count: demand.count + 1 });
          }
        } catch (error: any) {
          errors.push({row:row.row,field:"codigo_promocional",message:error.message || "Cupón inválido"});
        }
        // Activated accounts are skipped, never sent again. This is essential
        // when resuming a partially processed Excel after a browser 502.
        // A mismatched unactivated account is still rejected by the canonical dispatch.
        if (row.masterEmail && !batchMasters.has(row.masterEmail)) {
          const master = await storage.getUserByEmail(row.masterEmail);
          if (!master || master.role !== "master_broker" || master.isActive === false)
            errors.push({row:row.row,field:"correo_master_asignado",message:"Master no existe o no está activo"});
        }
      }
      for (const [id, demand] of Array.from(couponDemand.entries())) {
        const coupon = await storage.getPromoCode(id);
        if (coupon?.maxUses != null && coupon.maxUses - (coupon.currentUses || 0) < demand.count) {
          errors.push({row:demand.row,field:"codigo_promocional",
            message:`El cupón ${coupon.code} no alcanza para los ${demand.count} invitados.`});
        }
      }
      // ALL row/association validation before first persistent creation/email.
      if(errors.length) return res.status(422).json({message:"Corrige la plantilla antes de enviar.",errors});

      const results: Array<{row:number;email:string;role:string;status:"sent"|"pending"|"error"|"skipped";message:string}> = [];
      const masters = new Map<string,string>();
      // Masters precede Brokers; each request is bounded to two rows to avoid proxy 502s.
      for (const row of selectedRows) {
        try {
          const existing = await storage.getUserByEmail(row.email);
          if (existing) {
            const alreadyDelivered = await pool.query(
              "SELECT 1 FROM public.notifications WHERE type = $1 AND data->>'brokerId' = $2 LIMIT 1",
              ["broker_invitation_sent", existing.id],
            );
            if (existing.password || alreadyDelivered.rowCount) {
              if (row.role === "master_broker") masters.set(row.email, existing.id);
              results.push({row: row.row, email: row.email, role: row.role,
                status: "skipped", message: existing.password
                  ? "Cuenta ya activada; no se reenvía."
                  : "Invitación enviada anteriormente; no se duplica."});
              continue;
            }
          }
          let masterBrokerId: string | null = null;
          if (row.masterEmail) {
            masterBrokerId = masters.get(row.masterEmail) || null;
            if (!masterBrokerId) {
              const external = await storage.getUserByEmail(row.masterEmail);
              if (!external || external.role !== "master_broker" || external.isActive === false)
                throw new BrokerInvitationError(422,"No se pudo validar al Master asignado.");
              masterBrokerId = external.id;
            }
          }
          const result = await dispatchBrokerInvitation(userId, inviter, {
            email:row.email,firstName:row.firstName,lastName:row.lastName,role:row.role,
            phone:row.phone,message:row.message,masterBrokerId,
            promoCode: row.promoCode || (typeof req.body?.promoCode === "string" ? req.body.promoCode : undefined),
          });
          if (row.role === "master_broker") masters.set(row.email,result.body.broker.id);
          results.push({row:row.row,email:row.email,role:row.role,
            status:result.body.invitationSent?"sent":"pending",message:result.body.message});
        } catch (error:any) {
          results.push({row:row.row,email:row.email,role:row.role,status:"error",
            message:error instanceof BrokerInvitationError?error.message:"No fue posible completar la invitación."});
        }
      }
      const sent=results.filter(r=>r.status==="sent").length;
      const pending=results.filter(r=>r.status==="pending").length;
      const failed=results.filter(r=>r.status==="error").length;
      const skipped=results.filter(r=>r.status==="skipped").length;
      return res.json({total:results.length,sourceTotal:ordered.length,sent,pending,failed,skipped,
        nextOffset:offset+selectedRows.length,hasMore:offset+selectedRows.length<ordered.length,
        results:results.sort((a,b)=>a.row-b.row)});
    } catch(error:any) {
      if(error instanceof BrokerInvitationError) return res.status(error.statusCode).json({message:error.message});
      return res.status(400).json({message:error?.message||"No fue posible importar invitaciones."});
    }
  });

  // Master Broker Network Commission Rates
  app.get('/api/master-broker/network-rates', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || req.user?.id;
      const user = await storage.getUser(userId);

      if (!user || (user.role !== 'master_broker' && user.role !== 'admin' && user.role !== 'super_admin')) {
        return res.status(403).json({ message: "Solo Master Brokers y Administradores pueden gestionar comisiones de red" });
      }

      const allInstitutions = await storage.getFinancialInstitutions();
      const activeInstitutions = allInstitutions.filter((f: any) => f.isActive !== false);
      const networkRates = (user.networkCommissionRates as any) || {};

      const items = activeInstitutions.map((inst: any) => {
        const comm = inst.commissionRates || {};
        const mb = comm.masterBroker || {};
        const brk = comm.broker || {};

        return {
          institutionId: inst.id,
          institutionName: inst.name,
          logoUrl: inst.logoUrl,
          category: inst.category,
          masterCeiling: {
            total: parseFloat(mb.total || '0'),
            apertura: parseFloat(mb.apertura || '0'),
            sobretasa: parseFloat(mb.sobretasa || '0'),
            renovacion: parseFloat(mb.renovacion || '0'),
          },
          defaultBroker: {
            total: parseFloat(brk.total || '0'),
            apertura: parseFloat(brk.apertura || '0'),
            sobretasa: parseFloat(brk.sobretasa || '0'),
            renovacion: parseFloat(brk.renovacion || '0'),
          },
          assignedRate: networkRates[inst.id] || null,
        };
      });

      res.json({
        rates: networkRates,
        items,
      });
    } catch (error) {
      console.error("Error fetching master broker network rates:", error);
      res.status(500).json({ message: "Error al consultar comisiones de red" });
    }
  });

  app.put('/api/master-broker/network-rates', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || req.user?.id;
      const user = await storage.getUser(userId);

      if (!user || user.role !== 'master_broker') {
        return res.status(403).json({ message: "Solo Master Brokers pueden guardar sus comisiones de red" });
      }

      const { rates } = req.body;
      if (!rates || typeof rates !== 'object') {
        return res.status(400).json({ message: "Formato de tasas inválido" });
      }

      const allInstitutions = await storage.getFinancialInstitutions();
      const instMap = new Map(allInstitutions.map((i: any) => [i.id, i]));
      const sanitizedRates: Record<string, any> = {};

      for (const [instId, rateObj] of Object.entries(rates)) {
        const inst: any = instMap.get(instId);
        if (!inst) continue;

        const comm = inst.commissionRates || {};
        const mb = comm.masterBroker || {};
        const mbCeilingApertura = parseFloat(mb.apertura || '0');
        const mbCeilingSobretasa = parseFloat(mb.sobretasa || '0');
        const mbCeilingRenovacion = parseFloat(mb.renovacion || '0');

        const rawApertura = typeof rateObj === 'number' ? rateObj : parseFloat((rateObj as any)?.apertura ?? (rateObj as any)?.rate ?? '0');
        const rawSobretasa = typeof rateObj === 'number' ? 0 : parseFloat((rateObj as any)?.sobretasa ?? '0');
        const rawRenovacion = typeof rateObj === 'number' ? 0 : parseFloat((rateObj as any)?.renovacion ?? '0');

        if (isNaN(rawApertura) || rawApertura < 0 || isNaN(rawSobretasa) || rawSobretasa < 0 || isNaN(rawRenovacion) || rawRenovacion < 0) {
          return res.status(400).json({ 
            message: `Las comisiones asignadas para ${inst.name} no pueden ser negativas o inválidas` 
          });
        }

        if (rawApertura > mbCeilingApertura && mbCeilingApertura > 0) {
          return res.status(400).json({ 
            message: `La comisión de apertura asignada a tu red (${rawApertura}%) para ${inst.name} no puede superar tu techo de ${mbCeilingApertura}%` 
          });
        }

        sanitizedRates[instId] = {
          apertura: rawApertura,
          sobretasa: mbCeilingSobretasa > 0 ? Math.min(rawSobretasa, mbCeilingSobretasa) : rawSobretasa,
          renovacion: mbCeilingRenovacion > 0 ? Math.min(rawRenovacion, mbCeilingRenovacion) : rawRenovacion,
          updatedAt: new Date().toISOString(),
        };
      }

      const networkStorage: IStorage = storage;
      if (networkStorage.updateNetworkRatesWithVersionAtomic) {
        // PostgreSQL: current rates and contractual terms must commit together.
        const committed = await networkStorage.updateNetworkRatesWithVersionAtomic({
          masterBrokerId: userId,
          changedBy: userId,
          newRates: sanitizedRates,
        });
        if (committed.version) {
          await commercialTermsService.announceCommittedNetworkVersion(committed.version, storage);
        }
        return res.json({
          message: committed.changed
            ? "Comisiones de red actualizadas y nueva versión publicada."
            : "Sin cambios materiales en las comisiones de red.",
          rates: committed.rates,
          version: committed.version?.version || null,
          changed: committed.changed,
        });
      }

      // MemStorage-only deterministic unit fallback; never used with PostgreSQL.
      const previousRates = (user.networkCommissionRates as any) || {};
      const updatedUser = await storage.updateUser(userId, {
        networkCommissionRates: sanitizedRates,
      });
      await commercialTermsService.publishNetworkRatesUpdate(userId, {
        previousRates, newRates: sanitizedRates, updatedBy: userId, targetStorage: storage,
      });
      return res.json({
        message: "Comisiones de red actualizadas exitosamente",
        rates: updatedUser?.networkCommissionRates || sanitizedRates,
      });
    } catch (error) {
      console.error("Error updating master broker network rates:", error);
      res.status(500).json({ message: "Error al actualizar comisiones de red" });
    }
  });

  // Tenant routes
  app.get('/api/tenants', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      // Only super admins and platform admins can see all tenants
      if (user?.role === 'super_admin' || user?.role === 'admin') {
        const tenants = await storage.getTenants();
        res.json(tenants);
      } else {
        // Regular users only see tenants they're members of
        const userMemberships = await storage.getTenantMembersByUser(userId);
        const tenantIds = userMemberships.map(m => m.tenantId);
        const tenants = await storage.getTenants();
        const userTenants = tenants.filter(t => tenantIds.includes(t.id));
        res.json(userTenants);
      }
    } catch (error) {
      console.error("Error fetching tenants:", error);
      res.status(500).json({ message: "Failed to fetch tenants" });
    }
  });

  app.get('/api/tenants/:id', isAuthenticated, resolveTenantFromParam(), requireTenantMembership, async (req: any, res) => {
    try {
      // Tenant is already resolved and membership is already checked by middleware
      res.json(req.tenantContext.tenant);
    } catch (error) {
      console.error("Error fetching tenant:", error);
      res.status(500).json({ message: "Failed to fetch tenant" });
    }
  });

  app.get('/api/tenants/slug/:slug', isAuthenticated, requireTenantMembership, async (req: any, res) => {
    try {
      // Tenant context is already resolved by tenantContextMiddleware from slug parameter
      // and membership is already checked by requireTenantMembership
      res.json(req.tenantContext.tenant);
    } catch (error) {
      console.error("Error fetching tenant by slug:", error);
      res.status(500).json({ message: "Failed to fetch tenant" });
    }
  });

  app.post('/api/tenants', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || req.user?.id;
      
      // Check platform role permissions
      const hasPermission = await requirePlatformRole(userId, ['super_admin', 'admin', 'master_broker']);
      if (!hasPermission) {
        return res.status(403).json({ message: "Access denied" });
      }

      const tenantData = insertTenantSchema.parse(req.body);
      const tenant = await storage.createTenant(tenantData);
      
      // Create automatic ownership membership for creator
      await storage.createTenantMember({
        tenantId: tenant.id,
        userId: userId,
        role: 'owner',
        isActive: true,
      });
      
      res.status(201).json(tenant);
    } catch (error) {
      console.error("Error creating tenant:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: 'Invalid data', errors: error.errors });
      } else if (error instanceof Error && error.message.includes('already exists')) {
        res.status(409).json({ message: error.message });
      } else {
        res.status(500).json({ message: "Failed to create tenant" });
      }
    }
  });

  app.put('/api/tenants/:id', isAuthenticated, resolveTenantFromParam(), requireTenantRole(['owner', 'admin']), async (req: any, res) => {
    try {
      const { id } = req.params;
      
      const tenantData = insertTenantSchema.partial().parse(req.body);
      const tenant = await storage.updateTenant(id, tenantData);
      
      if (!tenant) {
        return res.status(404).json({ message: "Tenant not found" });
      }
      
      res.json(tenant);
    } catch (error) {
      console.error("Error updating tenant:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: 'Invalid data', errors: error.errors });
      } else if (error instanceof Error && error.message.includes('already exists')) {
        res.status(409).json({ message: error.message });
      } else {
        res.status(500).json({ message: "Failed to update tenant" });
      }
    }
  });

  app.delete('/api/tenants/:id', isAuthenticated, resolveTenantFromParam(), requireTenantRole(['owner']), async (req: any, res) => {
    try {
      const { id } = req.params;
      
      const success = await storage.deleteTenant(id);
      
      if (success) {
        res.json({ message: "Tenant deleted successfully" });
      } else {
        res.status(404).json({ message: "Tenant not found" });
      }
    } catch (error) {
      console.error("Error deleting tenant:", error);
      res.status(500).json({ message: "Failed to delete tenant" });
    }
  });

  // Tenant Members routes
  app.get('/api/tenant-members', isAuthenticated, resolveTenantFromQuery('tenantId'), requireTenantMembership, async (req: any, res) => {
    try {
      const { tenantId } = req.query;
      
      const tenantMembers = await storage.getTenantMembers(tenantId as string);
      res.json(tenantMembers);
    } catch (error) {
      console.error("Error fetching tenant members:", error);
      res.status(500).json({ message: "Failed to fetch tenant members" });
    }
  });

  app.get('/api/tenant-members/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user?.claims?.sub || req.user?.id;
      
      const tenantMember = await storage.getTenantMember(id);
      
      if (!tenantMember) {
        return res.status(404).json({ message: "Tenant member not found" });
      }
      
      // Check if user has access to this tenant
      const { hasAccess } = await authorizeTenantAccess({
        userId,
        tenantId: tenantMember.tenantId,
        requireRole: ['member', 'admin', 'owner'],
        allowSuperAdmin: true
      });
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      res.json(tenantMember);
    } catch (error) {
      console.error("Error fetching tenant member:", error);
      res.status(500).json({ message: "Failed to fetch tenant member" });
    }
  });

  app.post('/api/tenant-members', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || req.user?.id;
      
      const tenantMemberData = insertTenantMemberSchema.parse(req.body);
      
      // Manually resolve tenant context from the request body data
      const tenant = await storage.getTenant(tenantMemberData.tenantId);
      if (!tenant) {
        return res.status(404).json({ message: "Tenant not found" });
      }
      
      req.tenantContext.tenant = tenant;
      if (userId) {
        const membership = await storage.getUserTenantMembership(userId, tenant.id);
        if (membership) {
          req.tenantContext.membership = membership;
        }
      }
      
      // Check role requirements manually for this specific case
      const roleCheck = requireTenantRole(['admin', 'owner']);
      const roleResult = await new Promise((resolve) => {
        roleCheck(req, res, (err) => {
          if (err) {
            resolve(false);
          } else {
            resolve(true);
          }
        });
      });
      
      if (!roleResult) {
        return; // Response already sent by roleCheck
      }
      
      const tenantMember = await storage.createTenantMember(tenantMemberData);
      
      res.status(201).json(tenantMember);
    } catch (error) {
      console.error("Error creating tenant member:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: 'Invalid data', errors: error.errors });
      } else if (error instanceof Error && error.message.includes('already a member')) {
        res.status(409).json({ message: error.message });
      } else if (error instanceof Error && error.message.includes('does not exist')) {
        res.status(404).json({ message: error.message });
      } else {
        res.status(500).json({ message: "Failed to create tenant member" });
      }
    }
  });

  app.put('/api/tenant-members/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user?.claims?.sub || req.user?.id;
      
      const existingMember = await storage.getTenantMember(id);
      if (!existingMember) {
        return res.status(404).json({ message: "Tenant member not found" });
      }
      
      // Check if user has permission to update members in this tenant
      const { hasAccess } = await authorizeTenantAccess({
        userId,
        tenantId: existingMember.tenantId,
        requireRole: ['admin', 'owner'],
        allowSuperAdmin: true
      });
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const tenantMemberData = insertTenantMemberSchema.partial().parse(req.body);
      const tenantMember = await storage.updateTenantMember(id, tenantMemberData);
      
      if (!tenantMember) {
        return res.status(404).json({ message: "Tenant member not found" });
      }
      
      res.json(tenantMember);
    } catch (error) {
      console.error("Error updating tenant member:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: 'Invalid data', errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to update tenant member" });
      }
    }
  });

  app.delete('/api/tenant-members/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user?.claims?.sub || req.user?.id;
      
      const existingMember = await storage.getTenantMember(id);
      if (!existingMember) {
        return res.status(404).json({ message: "Tenant member not found" });
      }
      
      // Check if user has permission to delete members in this tenant
      const { hasAccess } = await authorizeTenantAccess({
        userId,
        tenantId: existingMember.tenantId,
        requireRole: ['admin', 'owner'],
        allowSuperAdmin: true
      });
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const success = await storage.deleteTenantMember(id);
      
      if (success) {
        res.json({ message: "Tenant member deleted successfully" });
      } else {
        res.status(404).json({ message: "Tenant member not found" });
      }
    } catch (error) {
      console.error("Error deleting tenant member:", error);
      res.status(500).json({ message: "Failed to delete tenant member" });
    }
  });

  // =====================================================================
  // ORGANIZATIONAL MULTI-USER ROUTES (BLOQUE 3 & BLOQUE 3.1)
  // /api/tenants/:tenantId/members
  // =====================================================================

  // 1. List organization members with user details
  app.get('/api/tenants/:tenantId/members', isAuthenticated, resolveTenantFromParam('tenantId'), async (req: any, res) => {
    try {
      const { tenantId } = req.params;
      const isSuperAdmin = Boolean(req.tenantContext?.isPlatformAdmin || req.user?.role === 'super_admin');

      // Tenant active check (super_admin can bypass for reactivation)
      if (!isSuperAdmin && req.tenantContext?.tenant?.isActive === false) {
        return res.status(403).json({ message: "Access denied. Tenant is inactive." });
      }

      // Check caller membership and role in this specific tenant
      if (!isSuperAdmin) {
        const callerMembership = req.tenantContext?.membership;
        if (!callerMembership || !callerMembership.isActive) {
          return res.status(403).json({ message: "Access denied. No perteneces a esta organización." });
        }
        if (callerMembership.role !== 'owner' && callerMembership.role !== 'admin') {
          return res.status(403).json({ message: "Access denied. Se requiere rol de propietario o administrador." });
        }
      }

      const members = await storage.getTenantMembersWithUsers(tenantId);
      res.json(members);
    } catch (error) {
      console.error("Error listing organization members:", error);
      res.status(500).json({ message: "Error interno del servidor al procesar la solicitud." });
    }
  });

  // 2. Get specific organization member
  app.get('/api/tenants/:tenantId/members/:memberId', isAuthenticated, resolveTenantFromParam('tenantId'), async (req: any, res) => {
    try {
      const { tenantId, memberId } = req.params;
      const isSuperAdmin = Boolean(req.tenantContext?.isPlatformAdmin || req.user?.role === 'super_admin');

      if (!isSuperAdmin && req.tenantContext?.tenant?.isActive === false) {
        return res.status(403).json({ message: "Access denied. Tenant is inactive." });
      }

      if (!isSuperAdmin) {
        const callerMembership = req.tenantContext?.membership;
        if (!callerMembership || !callerMembership.isActive) {
          return res.status(403).json({ message: "Access denied. No perteneces a esta organización." });
        }
        if (callerMembership.role !== 'owner' && callerMembership.role !== 'admin') {
          return res.status(403).json({ message: "Access denied. Se requiere rol de propietario o administrador." });
        }
      }

      const member = await storage.getTenantMemberWithUser(tenantId, memberId);
      if (!member) {
        return res.status(404).json({ message: "Miembro de la organización no encontrado" });
      }

      res.json(member);
    } catch (error) {
      console.error("Error getting organization member:", error);
      res.status(500).json({ message: "Error interno del servidor al procesar la solicitud." });
    }
  });

  // 3. Create / Invite organization member (Atomic)
  app.post('/api/tenants/:tenantId/members', isAuthenticated, resolveTenantFromParam('tenantId'), async (req: any, res) => {
    try {
      const { tenantId } = req.params;
      const isSuperAdmin = Boolean(req.tenantContext?.isPlatformAdmin || req.user?.role === 'super_admin');
      const tenant = req.tenantContext?.tenant;

      if (!tenant) {
        return res.status(404).json({ message: "Organización no encontrada" });
      }

      if (!isSuperAdmin && tenant.isActive === false) {
        return res.status(403).json({ message: "Access denied. Tenant is inactive." });
      }

      // Role check for caller
      let callerRole: 'owner' | 'admin' | 'super_admin' = 'super_admin';
      if (!isSuperAdmin) {
        const callerMembership = req.tenantContext?.membership;
        if (!callerMembership || !callerMembership.isActive) {
          return res.status(403).json({ message: "Access denied. No perteneces a esta organización." });
        }
        if (callerMembership.role !== 'owner' && callerMembership.role !== 'admin') {
          return res.status(403).json({ message: "Access denied. Se requiere rol de propietario o administrador para agregar usuarios." });
        }
        callerRole = callerMembership.role;
      }

      // Parse and validate request
      const data = createTenantMemberSchema.parse(req.body);

      // Hierarchical restriction: Admin CANNOT create owner or admin
      if (callerRole === 'admin' && (data.role === 'owner' || data.role === 'admin')) {
        return res.status(403).json({ 
          message: "Los administradores solo pueden crear colaboradores con rol 'member'." 
        });
      }

      // Validate permissions & prevent privilege escalation
      const callerUserId = req.user?.claims?.sub || req.user?.id || (req as any).dbUser?.id;
      const callerUser = await storage.getUser(callerUserId);
      const permValidation = await validateTenantMemberPermissions({
        permissions: data.permissions,
        tenantType: tenant.type,
        callerUser,
        callerRole,
        isSuperAdmin,
        targetCanOriginate: data.canOriginate,
      });

      if (!permValidation.valid) {
        return res.status(403).json({ message: permValidation.error });
      }

      // Determine legacy users.role based on tenant type
      let userRole: string;
      if (tenant.type === 'broker') {
        userRole = 'broker';
      } else if (tenant.type === 'master_broker') {
        userRole = 'master_broker';
      } else if (tenant.type === 'platform') {
        userRole = (data.role === 'owner' && isSuperAdmin) ? 'super_admin' : 'admin';
      } else {
        userRole = 'broker';
      }

      // Generate secure invitation token
      const crypto = await import('crypto');
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      // Hash password if provided
      let hashedPassword: string | null = null;
      if (data.password) {
        hashedPassword = await bcrypt.hash(data.password, 10);
      }

      // Atomic execution
      const { user, member } = await storage.createTenantMemberWithUser({
        tenantId,
        email: data.email.toLowerCase().trim(),
        firstName: data.firstName.trim(),
        lastName: data.lastName.trim(),
        internalRole: data.role,
        userRole,
        customRoleTitle: data.customRoleTitle || null,
        permissions: data.permissions || {},
        password: hashedPassword,
        authMethod: 'local',
        resetToken,
        resetTokenExpiry,
      });

      // Construct reset / invite URL
      const baseUrl = process.env.FRONTEND_BASE_URL || (process.env.RAILWAY_STATIC_URL ? `https://${process.env.RAILWAY_STATIC_URL}` : 'https://creditonegocios-staging.up.railway.app');
      const inviteUrl = `${baseUrl.replace(/\/$/, '')}/reset-password?token=${resetToken}`;

      // Dispatch invitation email if requested
      let inviteSent = false;
      if (data.sendInvite) {
        try {
          const emailResult = await sendPasswordResetEmail(user.email!, resetToken, user.firstName || undefined);
          inviteSent = emailResult.success;
        } catch (emailErr) {
          console.warn("Could not dispatch invitation email:", emailErr);
        }
      }

      // Return response without exposing secrets
      const responsePayload: any = {
        message: "Usuario creado y asociado a la organización exitosamente",
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          customRoleTitle: user.customRoleTitle,
          isActive: user.isActive,
        },
        member: {
          id: member.id,
          tenantId: member.tenantId,
          userId: member.userId,
          role: member.role,
          isActive: member.isActive,
          joinedAt: member.joinedAt,
        },
        inviteSent,
      };

      // In non-production environments (staging/dev), return inviteUrl for test execution
      if (process.env.NODE_ENV !== 'production') {
        responsePayload.inviteUrl = inviteUrl;
      }

      res.status(201).json(responsePayload);
    } catch (error: any) {
      console.error("Error creating organization member:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      if (error?.message?.includes('ya es miembro')) {
        return res.status(409).json({ message: error.message });
      }
      if (error?.message?.includes('already exists') || error?.code === '23505') {
        return res.status(409).json({ message: "El email ya está registrado en el sistema" });
      }
      res.status(500).json({ message: "Error interno del servidor al procesar la solicitud." });
    }
  });

  // 4. Update organization member (role, customRoleTitle, permissions)
  app.patch('/api/tenants/:tenantId/members/:memberId', isAuthenticated, resolveTenantFromParam('tenantId'), async (req: any, res) => {
    try {
      const { tenantId, memberId } = req.params;
      const isSuperAdmin = Boolean(req.tenantContext?.isPlatformAdmin || req.user?.role === 'super_admin');
      const tenant = req.tenantContext?.tenant;

      if (!tenant) {
        return res.status(404).json({ message: "Organización no encontrada" });
      }

      if (!isSuperAdmin && tenant.isActive === false) {
        return res.status(403).json({ message: "Access denied. Tenant is inactive." });
      }

      const targetMember = await storage.getTenantMemberWithUser(tenantId, memberId);
      if (!targetMember) {
        return res.status(404).json({ message: "Miembro no encontrado en esta organización" });
      }

      // Check caller authorization
      let callerRole: 'owner' | 'admin' | 'super_admin' = 'super_admin';
      if (!isSuperAdmin) {
        const callerMembership = req.tenantContext?.membership;
        if (!callerMembership || !callerMembership.isActive) {
          return res.status(403).json({ message: "Access denied. No perteneces a esta organización." });
        }
        if (callerMembership.role !== 'owner' && callerMembership.role !== 'admin') {
          return res.status(403).json({ message: "Access denied. Se requiere rol de propietario o administrador." });
        }
        callerRole = callerMembership.role;

        // Admin restrictions:
        if (callerRole === 'admin') {
          if (targetMember.role !== 'member') {
            return res.status(403).json({ message: "Los administradores no pueden modificar a propietarios ni a otros administradores." });
          }
          if (req.body.role && req.body.role !== 'member') {
            return res.status(403).json({ message: "Los administradores no pueden cambiar el rol a propietario o administrador." });
          }
        }
      }

      const data = updateTenantMemberSchema.parse(req.body);

      // Validate permissions & prevent privilege escalation
      if (data.permissions !== undefined) {
        const callerUserId = req.user?.claims?.sub || req.user?.id || (req as any).dbUser?.id;
        const callerUser = await storage.getUser(callerUserId);
        const effectiveCanOriginate = data.canOriginate !== undefined ? data.canOriginate : targetMember.canOriginate;
        const permValidation = await validateTenantMemberPermissions({
          permissions: data.permissions,
          tenantType: tenant.type,
          callerUser,
          callerRole,
          isSuperAdmin,
          targetCanOriginate: effectiveCanOriginate,
        });

        if (!permValidation.valid) {
          return res.status(403).json({ message: permValidation.error });
        }
      }

      // Last owner protection on degradation
      if (data.role && targetMember.role === 'owner' && data.role !== 'owner') {
        const activeOwners = await storage.countActiveOwners(tenantId);
        if (activeOwners <= 1) {
          return res.status(400).json({ message: "No se puede degradar al único propietario activo de la organización." });
        }
      }

      // Enforce status changes strictly through deactivateTenantMember / activateTenantMember
      // so the last owner rule can NEVER be bypassed
      if (req.body.isActive !== undefined) {
        if (req.body.isActive === false) {
          try {
            await storage.deactivateTenantMember(tenantId, memberId);
          } catch (err: any) {
            return res.status(400).json({ message: err.message });
          }
        } else if (req.body.isActive === true) {
          await storage.activateTenantMember(tenantId, memberId);
        }
      }

      // Update membership role if provided
      if (data.role !== undefined) {
        await storage.updateTenantMember(memberId, {
          role: data.role,
        });
      }

      // Update user details if customRoleTitle or permissions provided
      if (data.customRoleTitle !== undefined || data.permissions !== undefined) {
        const userUpdates: any = {};
        if (data.customRoleTitle !== undefined) userUpdates.customRoleTitle = data.customRoleTitle;
        if (data.permissions !== undefined) userUpdates.permissions = data.permissions;
        await storage.updateUser(targetMember.userId, userUpdates);
      }

      const updated = await storage.getTenantMemberWithUser(tenantId, memberId);
      res.json({ message: "Miembro actualizado exitosamente", member: updated });
    } catch (error: any) {
      console.error("Error updating organization member:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      if (error?.message?.includes('último propietario activo') || error?.message?.includes('único propietario activo')) {
        return res.status(400).json({ message: error.message });
      }
      res.status(500).json({ message: "Error interno del servidor al procesar la solicitud." });
    }
  });

  // 5. Toggle or set member status (Activate / Deactivate with Last Owner & N:M protection)
  app.patch('/api/tenants/:tenantId/members/:memberId/status', isAuthenticated, resolveTenantFromParam('tenantId'), async (req: any, res) => {
    try {
      const { tenantId, memberId } = req.params;
      const isSuperAdmin = Boolean(req.tenantContext?.isPlatformAdmin || req.user?.role === 'super_admin');
      const tenant = req.tenantContext?.tenant;

      if (!tenant) {
        return res.status(404).json({ message: "Organización no encontrada" });
      }

      if (!isSuperAdmin && tenant.isActive === false) {
        return res.status(403).json({ message: "Access denied. Tenant is inactive." });
      }

      const targetMember = await storage.getTenantMemberWithUser(tenantId, memberId);
      if (!targetMember) {
        return res.status(404).json({ message: "Miembro no encontrado en esta organización" });
      }

      // Check caller authorization
      if (!isSuperAdmin) {
        const callerMembership = req.tenantContext?.membership;
        if (!callerMembership || !callerMembership.isActive) {
          return res.status(403).json({ message: "Access denied. No perteneces a esta organización." });
        }
        if (callerMembership.role !== 'owner' && callerMembership.role !== 'admin') {
          return res.status(403).json({ message: "Access denied. Se requiere rol de propietario o administrador." });
        }
        if (callerMembership.role === 'admin' && targetMember.role !== 'member') {
          return res.status(403).json({ message: "Los administradores no pueden cambiar el estado de propietarios ni de otros administradores." });
        }
      }

      // Determine new status
      const newStatus = typeof req.body.isActive === 'boolean' ? req.body.isActive : !targetMember.isActive;

      if (!newStatus) {
        // Deactivation flow
        try {
          const result = await storage.deactivateTenantMember(tenantId, memberId);
          return res.json({
            message: "Membresía desactivada exitosamente",
            member: result.member,
            userDeactivatedGlobally: result.userDeactivatedGlobally,
          });
        } catch (deactError: any) {
          return res.status(400).json({ message: deactError.message });
        }
      } else {
        // Activation flow
        const result = await storage.activateTenantMember(tenantId, memberId);
        return res.json({
          message: "Membresía activada exitosamente",
          member: result.member,
        });
      }
    } catch (error: any) {
      console.error("Error updating member status:", error);
      if (error?.message?.includes('último propietario activo') || error?.message?.includes('único propietario activo')) {
        return res.status(400).json({ message: error.message });
      }
      res.status(500).json({ message: "Error interno del servidor al procesar la solicitud." });
    }
  });

  // 6. Resend invitation / password reset token for member
  app.post('/api/tenants/:tenantId/members/:memberId/resend-invite', isAuthenticated, resolveTenantFromParam('tenantId'), async (req: any, res) => {
    try {
      const { tenantId, memberId } = req.params;
      const isSuperAdmin = Boolean(req.tenantContext?.isPlatformAdmin || req.user?.role === 'super_admin');
      const tenant = req.tenantContext?.tenant;

      if (!tenant) {
        return res.status(404).json({ message: "Organización no encontrada" });
      }

      if (!isSuperAdmin && tenant.isActive === false) {
        return res.status(403).json({ message: "Access denied. Tenant is inactive." });
      }

      const targetMember = await storage.getTenantMemberWithUser(tenantId, memberId);
      if (!targetMember) {
        return res.status(404).json({ message: "Miembro no encontrado en esta organización" });
      }

      // Check caller authorization
      if (!isSuperAdmin) {
        const callerMembership = req.tenantContext?.membership;
        if (!callerMembership || !callerMembership.isActive) {
          return res.status(403).json({ message: "Access denied. No perteneces a esta organización." });
        }
        if (callerMembership.role !== 'owner' && callerMembership.role !== 'admin') {
          return res.status(403).json({ message: "Access denied. Se requiere rol de propietario o administrador." });
        }
      }

      // Generate new token
      const crypto = await import('crypto');
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      await storage.setPasswordResetToken(targetMember.userId, resetToken, resetTokenExpiry);

      const baseUrl = process.env.FRONTEND_BASE_URL || (process.env.RAILWAY_STATIC_URL ? `https://${process.env.RAILWAY_STATIC_URL}` : 'https://creditonegocios-staging.up.railway.app');
      const inviteUrl = `${baseUrl.replace(/\/$/, '')}/reset-password?token=${resetToken}`;

      let inviteSent = false;
      if (targetMember.user.email) {
        try {
          const emailResult = await sendPasswordResetEmail(targetMember.user.email, resetToken, targetMember.user.firstName || undefined);
          inviteSent = emailResult.success;
        } catch (e) {
          console.warn("Could not dispatch invitation email:", e);
        }
      }

      const responsePayload: any = {
        message: inviteSent ? "Invitación enviada por correo" : "Enlace de activación generado exitosamente",
        inviteSent,
      };
      if (process.env.NODE_ENV !== 'production') {
        responsePayload.inviteUrl = inviteUrl;
      }

      res.json(responsePayload);
    } catch (error: any) {
      console.error("Error resending invite:", error);
      res.status(500).json({ message: "Error interno del servidor al procesar la solicitud." });
    }
  });

  // =====================================================================
  // PRODUCT SYSTEM ROUTES (3-Layer Architecture)
  // =====================================================================

  // 🔹 PRODUCT VARIABLES (Level 1: Base catalog - Admin/SuperAdmin only)
  app.get('/api/product-variables', isAuthenticated, async (req: any, res) => {
    try {
      // For development: use fallback user if claims not available
      const userId = req.user?.claims?.sub || "user-super-admin";
      
      const hasPermission = await requirePlatformRole(userId, ['super_admin', 'admin']);
      if (!hasPermission) {
        return res.status(403).json({ message: "Access denied - Admin privileges required" });
      }

      const variables = await storage.getProductVariables();
      res.json(variables);
    } catch (error) {
      console.error("Error fetching product variables:", error);
      res.status(500).json({ message: "Failed to fetch product variables" });
    }
  });

  app.get('/api/product-variables/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      
      const hasPermission = await requirePlatformRole(userId, ['super_admin', 'admin']);
      if (!hasPermission) {
        return res.status(403).json({ message: "Access denied - Admin privileges required" });
      }

      const variable = await storage.getProductVariable(id);
      if (!variable) {
        return res.status(404).json({ message: "Product variable not found" });
      }
      
      res.json(variable);
    } catch (error) {
      console.error("Error fetching product variable:", error);
      res.status(500).json({ message: "Failed to fetch product variable" });
    }
  });

  app.get('/api/product-variables/name/:name', isAuthenticated, async (req: any, res) => {
    try {
      const { name } = req.params;
      const userId = req.user.claims.sub;
      
      const hasPermission = await requirePlatformRole(userId, ['super_admin', 'admin']);
      if (!hasPermission) {
        return res.status(403).json({ message: "Access denied - Admin privileges required" });
      }

      const variable = await storage.getProductVariableByName(name);
      if (!variable) {
        return res.status(404).json({ message: "Product variable not found" });
      }
      
      res.json(variable);
    } catch (error) {
      console.error("Error fetching product variable by name:", error);
      res.status(500).json({ message: "Failed to fetch product variable" });
    }
  });

  app.post('/api/product-variables', isAuthenticated, async (req: any, res) => {
    try {
      // For development: use fallback user if claims not available  
      const userId = req.user?.claims?.sub || "user-super-admin";
      
      const hasPermission = await requirePlatformRole(userId, ['super_admin', 'admin']);
      if (!hasPermission) {
        return res.status(403).json({ message: "Access denied - Admin privileges required" });
      }

      // Add createdBy from authenticated user
      const variableData = insertProductVariableSchema.parse({
        ...req.body,
        createdBy: userId
      });
      const variable = await storage.createProductVariable(variableData);
      
      res.status(201).json(variable);
    } catch (error) {
      console.error("Error creating product variable:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: 'Invalid data', errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to create product variable" });
      }
    }
  });

  app.put('/api/product-variables/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      
      const hasPermission = await requirePlatformRole(userId, ['super_admin', 'admin']);
      if (!hasPermission) {
        return res.status(403).json({ message: "Access denied - Admin privileges required" });
      }

      const variableData = insertProductVariableSchema.partial().parse(req.body);
      const variable = await storage.updateProductVariable(id, variableData);
      
      if (!variable) {
        return res.status(404).json({ message: "Product variable not found" });
      }
      
      res.json(variable);
    } catch (error) {
      console.error("Error updating product variable:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: 'Invalid data', errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to update product variable" });
      }
    }
  });

  app.delete('/api/product-variables/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      
      const hasPermission = await requirePlatformRole(userId, ['super_admin', 'admin']);
      if (!hasPermission) {
        return res.status(403).json({ message: "Access denied - Admin privileges required" });
      }

      const success = await storage.deleteProductVariable(id);
      
      if (success) {
        res.json({ message: "Product variable deleted successfully" });
      } else {
        res.status(404).json({ message: "Product variable not found" });
      }
    } catch (error) {
      console.error("Error deleting product variable:", error);
      res.status(500).json({ message: "Failed to delete product variable" });
    }
  });

  // 🔹 PRODUCT TEMPLATES (Level 2: Generic products)
  app.get('/api/product-templates', isAuthenticated, async (req: any, res) => {
    try {
      const templates = await storage.getProductTemplates();
      console.log(`📋 GET /api/product-templates - Returning ${templates.length} templates:`, templates.map(t => `${t.name} (${t.id})`).join(', '));
      res.json(templates);
    } catch (error) {
      console.error("Error fetching product templates:", error);
      res.status(500).json({ message: "Failed to fetch product templates" });
    }
  });

  app.get('/api/product-templates/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;

      const template = await storage.getProductTemplate(id);
      if (!template) {
        return res.status(404).json({ message: "Product template not found" });
      }
      
      res.json(template);
    } catch (error) {
      console.error("Error fetching product template:", error);
      res.status(500).json({ message: "Failed to fetch product template" });
    }
  });

  app.post('/api/product-templates', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      const hasPermission = await requirePlatformRole(userId, ['super_admin', 'admin']);
      if (!hasPermission) {
        return res.status(403).json({ message: "Access denied - Admin privileges required" });
      }

      // Parse body but add createdBy automatically for security
      const bodyData = insertProductTemplateSchema.omit({ createdBy: true }).parse(req.body);
      const templateData = {
        ...bodyData,
        createdBy: userId, // Set automatically from authenticated user
      };
      const template = await storage.createProductTemplate(templateData);
      console.log(`✅ Created template ${template.name} (ID: ${template.id})`);
      
      // Verify it's in storage
      const verification = await storage.getProductTemplate(template.id);
      console.log(`🔍 Verification - Template exists in storage: ${!!verification}`);
      
      res.status(201).json(template);
    } catch (error) {
      console.error("Error creating product template:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: 'Invalid data', errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to create product template" });
      }
    }
  });

  app.put('/api/product-templates/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      
      const hasPermission = await requirePlatformRole(userId, ['super_admin', 'admin']);
      if (!hasPermission) {
        return res.status(403).json({ message: "Access denied - Admin privileges required" });
      }

      // Parse body but omit createdBy for security (can't be updated)
      const templateData = insertProductTemplateSchema.omit({ createdBy: true }).partial().parse(req.body);
      console.log(`🔄 Updating template ${id} with data:`, templateData);
      
      const template = await storage.updateProductTemplate(id, templateData);
      
      if (!template) {
        console.log(`❌ Template ${id} not found for update`);
        return res.status(404).json({ message: "Product template not found" });
      }
      
      console.log(`✅ Updated template ${template.name} (ID: ${template.id}, isActive: ${template.isActive})`);
      
      // Verify it's still in storage
      const verification = await storage.getProductTemplate(template.id);
      console.log(`🔍 Verification after update - Template exists: ${!!verification}, isActive: ${verification?.isActive}`);
      
      res.json(template);
    } catch (error) {
      console.error("Error updating product template:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: 'Invalid data', errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to update product template" });
      }
    }
  });

  app.delete('/api/product-templates/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      
      const hasPermission = await requirePlatformRole(userId, ['super_admin', 'admin']);
      if (!hasPermission) {
        return res.status(403).json({ message: "Access denied - Admin privileges required" });
      }

      const success = await storage.deleteProductTemplate(id);
      
      if (success) {
        res.json({ message: "Product template deleted successfully" });
      } else {
        res.status(404).json({ message: "Product template not found" });
      }
    } catch (error) {
      console.error("Error deleting product template:", error);
      res.status(500).json({ message: "Failed to delete product template" });
    }
  });

  // 🔹 INSTITUTION PRODUCTS (Level 3A: Assigned to financieras)
  app.get('/api/institution-products', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || req.user?.id;
      const isSuperAdmin = await requirePlatformRole(userId, ['super_admin']);
      const { institutionId, status, eligibleOnly } = req.query;

      let products = await storage.getInstitutionProducts(institutionId as string);

      if (!isSuperAdmin) {
        // Brokers and Master Brokers must NEVER receive drafts, non-eligible offers, nor administrative metadata
        const user = await storage.getUser(userId);
        const userRole = user?.role || 'broker';
        const eligibleCommercialOffers = [];
        for (const p of products) {
          if (p.status === 'draft' || p.status === 'archived' || p.isActive === false) {
            continue;
          }
          const versions = await storage.getInstitutionProductVersions(p.id);
          if (isOfferEligibleForRequests(p, versions)) {
            eligibleCommercialOffers.push(sanitizeCommercialOffer(p, userRole));
          }
        }
        return res.json(eligibleCommercialOffers);
      }

      if (status) {
        products = products.filter(p => p.status === status);
      }
      if (eligibleOnly === 'true') {
        const eligible = [];
        for (const p of products) {
          const versions = await storage.getInstitutionProductVersions(p.id);
          if (isOfferEligibleForRequests(p, versions)) {
            eligible.push(p);
          }
        }
        products = eligible;
      }
      res.json(products);
    } catch (error) {
      console.error("Error fetching institution products:", error);
      res.status(500).json({ message: "Failed to fetch institution products" });
    }
  });

  // Super Admin only. Aggregate read-only financial summaries from versioned offers.
  // A legacy institution/global configuration is NOT authoritative for a versioned offer.
  app.get('/api/institution-products/financial-summaries', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || req.user?.id;
      if (!(await requirePlatformRole(userId, ['super_admin']))) {
        return res.status(403).json({ code: 'SUPER_ADMIN_REQUIRED' });
      }
      const { rows } = await pool.query(`
        SELECT DISTINCT ON (institution_product_id)
          institution_product_id AS "offerId",
          conditions ->> 'minAmount' AS "minAmount",
          conditions ->> 'maxAmount' AS "maxAmount",
          conditions ->> 'minInterestRate' AS "minInterestRate",
          conditions ->> 'maxInterestRate' AS "maxInterestRate",
          conditions ->> 'rateSource' AS "rateSource",
          conditions ->> 'minTermMonths' AS "minTermMonths",
          conditions ->> 'maxTermMonths' AS "maxTermMonths"
        FROM public.institution_product_versions
        WHERE status IN ('draft', 'published', 'active')
        ORDER BY institution_product_id,
          CASE status WHEN 'draft' THEN 0 WHEN 'published' THEN 1 ELSE 2 END,
          version_number DESC
      `);
      res.json(rows);
    } catch (error) {
      console.error('Error consulting versioned offer financial summaries:', error);
      res.status(500).json({ message: 'No se pudieron consultar las condiciones de las ofertas' });
    }
  });

  // Source of truth for lender economics is the offer VERSION, never the global institution record.
  // Restricted to Super Admin: protects channel ceilings, platform margin and overrate.
  app.get('/api/institution-products/commission-schemes', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || req.user?.id;
      if (!(await requirePlatformRole(userId, ['super_admin']))) {
        return res.status(403).json({ code: 'SUPER_ADMIN_REQUIRED', message: 'Solo Super Admin puede consultar estos esquemas económicos' });
      }
      const { rows } = await pool.query([
        'SELECT p.id AS "offerId", p.name AS "offerName", p.product_type AS "productType",',
        'p.institution_id AS "institutionId", fi.name AS "institutionName",',
        'v.version_number AS "versionNumber", v.status AS "versionStatus",',
        "v.conditions->'commissionRates' AS \"commissionRates\",",
        "v.conditions->>'overrateOwner' AS \"overrateOwner\"",
        'FROM public.institution_products p',
        'JOIN public.financial_institutions fi ON fi.id = p.institution_id',
        'JOIN LATERAL (',
        'SELECT ip.version_number, ip.status, ip.conditions',
        'FROM public.institution_product_versions ip',
        "WHERE ip.institution_product_id = p.id AND ip.status IN ('draft', 'published', 'active')",
        "ORDER BY CASE ip.status WHEN 'draft' THEN 0 WHEN 'published' THEN 1 ELSE 2 END, ip.version_number DESC",
        'LIMIT 1',
        ') v ON TRUE',
        "WHERE p.status IN ('draft', 'published')",
        'ORDER BY fi.name, p.name, p.id',
      ].join(' '));
      res.json(rows);
    } catch (error) {
      console.error('Error consulting commission schemes by offer:', error);
      res.status(500).json({ message: 'No se pudieron consultar comisiones por oferta' });
    }
  });

  app.get('/api/institution-products/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user?.claims?.sub || req.user?.id;
      const isSuperAdmin = await requirePlatformRole(userId, ['super_admin']);

      const product = await storage.getInstitutionProduct(id);
      if (!product) {
        return res.status(404).json({ message: "Institution product not found" });
      }

      if (!isSuperAdmin) {
        if (product.status === 'draft' || product.status === 'archived' || product.isActive === false) {
          return res.status(404).json({ message: "Institution product not found" });
        }
        const versions = await storage.getInstitutionProductVersions(product.id);
        if (!isOfferEligibleForRequests(product, versions)) {
          return res.status(404).json({ message: "Institution product not found" });
        }
        const user = await storage.getUser(userId);
        const userRole = user?.role || 'broker';
        return res.json(sanitizeCommercialOffer(product, userRole));
      }
      
      res.json(product);
    } catch (error) {
      console.error("Error fetching institution product:", error);
      res.status(500).json({ message: "Failed to fetch institution product" });
    }
  });

  app.get('/api/institution-products/:id/versions', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || req.user?.id;
      const hasPermission = await requirePlatformRole(userId, ['super_admin']);
      if (!hasPermission) {
        return res.status(403).json({ message: "Access denied - Super Admin privileges required" });
      }

      const { id } = req.params;
      const versions = await storage.getInstitutionProductVersions(id);
      res.json(versions);
    } catch (error) {
      console.error("Error fetching institution product versions:", error);
      res.status(500).json({ message: "Failed to fetch institution product versions" });
    }
  });

  // Obtener oferta y su versión en borrador editable (Solo Super Admin)
  app.get('/api/institution-products/:id/draft', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || req.user?.id;
      const hasPermission = await requirePlatformRole(userId, ['super_admin']);
      if (!hasPermission) {
        return res.status(403).json({ message: "Access denied - Super Admin privileges required" });
      }

      const { id } = req.params;
      const product = await storage.getInstitutionProduct(id);
      if (!product) {
        return res.status(404).json({ message: "Institution product not found" });
      }

      const versions = await storage.getInstitutionProductVersions(id);
      const draftVersion = versions.find(v => v.status === "draft") || null;

      res.json({
        product,
        draftVersion,
      });
    } catch (error) {
      console.error("Error fetching draft version:", error);
      res.status(500).json({ message: "Failed to fetch draft version" });
    }
  });

  // Editar y guardar versión en borrador existente (Solo Super Admin - Arquitectura A1)
  app.put('/api/institution-products/:id/draft', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || req.user?.id;
      const hasPermission = await requirePlatformRole(userId, ['super_admin']);
      if (!hasPermission) {
        return res.status(403).json({ message: "Access denied - Super Admin privileges required" });
      }

      const { id } = req.params;
      const product = await storage.getInstitutionProduct(id);
      if (!product) {
        return res.status(404).json({ message: "Institution product not found" });
      }

      const versions = await storage.getInstitutionProductVersions(id);
      const draftVersion = versions.find(v => v.status === "draft");
      if (!draftVersion) {
        return res.status(400).json({
          message: "No se encontró una versión en borrador editable para esta oferta. Las versiones publicadas o históricas son inmutables.",
        });
      }

      const {
        name,
        description,
        productType,
        targetProfiles,
        conditions,
        requirements,
        requiredDocuments,
        variablesConfiguration,
        changeReason,
      } = req.body;

      // 1. Extraer condiciones comerciales para la versión y configuration del producto
      const currentConditions = (draftVersion.conditions || {}) as Record<string, any>;
      const mergedConditions: Record<string, any> = {
        ...currentConditions,
        ...(conditions || {}),
      };

      if (req.body.minAmount !== undefined) mergedConditions.minAmount = req.body.minAmount !== "" && req.body.minAmount !== null ? Number(req.body.minAmount) : undefined;
      if (req.body.maxAmount !== undefined) mergedConditions.maxAmount = req.body.maxAmount !== "" && req.body.maxAmount !== null ? Number(req.body.maxAmount) : undefined;
      if (req.body.minInterestRate !== undefined) mergedConditions.minInterestRate = req.body.minInterestRate !== "" && req.body.minInterestRate !== null ? Number(req.body.minInterestRate) : undefined;
      if (req.body.maxInterestRate !== undefined) mergedConditions.maxInterestRate = req.body.maxInterestRate !== "" && req.body.maxInterestRate !== null ? Number(req.body.maxInterestRate) : undefined;
      if (req.body.minTermMonths !== undefined) mergedConditions.minTermMonths = req.body.minTermMonths !== "" && req.body.minTermMonths !== null ? Number(req.body.minTermMonths) : undefined;
      if (req.body.maxTermMonths !== undefined) mergedConditions.maxTermMonths = req.body.maxTermMonths !== "" && req.body.maxTermMonths !== null ? Number(req.body.maxTermMonths) : undefined;

      // Variables de elegibilidad (B2.1 / B2.2): asociadas a campos del expediente y pendientes en Matching
      if (req.body.minCompanyAgeMonths !== undefined) mergedConditions.minCompanyAgeMonths = req.body.minCompanyAgeMonths !== "" && req.body.minCompanyAgeMonths !== null ? Number(req.body.minCompanyAgeMonths) : undefined;
      if (req.body.minMonthlyRevenue !== undefined) mergedConditions.minMonthlyRevenue = req.body.minMonthlyRevenue !== "" && req.body.minMonthlyRevenue !== null ? Number(req.body.minMonthlyRevenue) : undefined;
      if (req.body.bureauRequirement !== undefined) mergedConditions.bureauRequirement = req.body.bureauRequirement;
      if (req.body.guaranteeType !== undefined) mergedConditions.guaranteeType = req.body.guaranteeType;
      if (req.body.avalesType !== undefined) mergedConditions.avalesType = req.body.avalesType;

      // Editing commercial terms does not change verification of a client's evidence.
      // Preserve existing explicit offer/criterion verification flags; never invent a global one.

      // Comisiones individuales por oferta (B2.2 — Canales independientes Broker Directo y Master Broker)
      let commRates = req.body.commissionRates !== undefined
        ? req.body.commissionRates
        : (conditions?.commissionRates !== undefined ? conditions.commissionRates : currentConditions.commissionRates);

      if ((req.body.commissionRates !== undefined || conditions?.commissionRates !== undefined) && commRates && typeof commRates === "object") {
        const finRate = commRates.financiera?.apertura !== undefined && commRates.financiera?.apertura !== "" && commRates.financiera?.apertura !== null
          ? Number(commRates.financiera.apertura)
          : null;
        const mbRate = commRates.masterBroker?.apertura !== undefined && commRates.masterBroker?.apertura !== "" && commRates.masterBroker?.apertura !== null
          ? Number(commRates.masterBroker.apertura)
          : null;
        const brkRate = commRates.broker?.apertura !== undefined && commRates.broker?.apertura !== "" && commRates.broker?.apertura !== null
          ? Number(commRates.broker.apertura)
          : null;

        const hasFin = finRate !== null && !isNaN(finRate);
        const hasBrk = brkRate !== null && !isNaN(brkRate);
        const hasMb = mbRate !== null && !isNaN(mbRate);

        // B3.1: Si falta la comisión de apertura de cualquier canal, su margen debe permanecer pendiente (null), tanto en guardado como en visualización
        const platformMarginDirect = (hasFin && hasBrk)
          ? Math.max(0, Number((finRate! - brkRate!).toFixed(4)))
          : null;

        const platformMarginMaster = (hasFin && hasMb)
          ? Math.max(0, Number((finRate! - mbRate!).toFixed(4)))
          : null;

        mergedConditions.commissionRates = {
          ...commRates,
          financiera: {
            ...commRates.financiera,
            apertura: hasFin ? finRate : null,
          },
          masterBroker: {
            ...commRates.masterBroker,
            apertura: hasMb ? mbRate : null,
          },
          broker: {
            ...commRates.broker,
            apertura: hasBrk ? brkRate : null,
          },
          channels: {
            directBroker: {
              brokerRate: hasBrk ? brkRate : null,
              platformGrossMargin: platformMarginDirect,
              isMarginPending: platformMarginDirect === null,
            },
            masterBroker: {
              networkCeiling: hasMb ? mbRate : null,
              platformGrossMargin: platformMarginMaster,
              isMarginPending: platformMarginMaster === null,
            },
          },
          platformGrossMarginDirect: platformMarginDirect,
          platformGrossMarginMaster: platformMarginMaster,
          isMarginDirectPending: platformMarginDirect === null,
          isMarginMasterPending: platformMarginMaster === null,
          // Compatibilidad: la plataforma registra los márgenes de ambos canales independientes
          platformNet: {
            direct: platformMarginDirect,
            master: platformMarginMaster,
            apertura: platformMarginDirect,
          },
          type: commRates.type || "porcentaje",
          notes: commRates.notes || "",
        };
      }

      Object.keys(mergedConditions).forEach(key => mergedConditions[key] === undefined && delete mergedConditions[key]);

      // 2. Validar coherencia matemática de los datos capturados y comisiones (permite incompletos)
      const validation = validateOfferVersionParameters({ conditions: mergedConditions });
      if (!validation.isValid) {
        return res.status(400).json({
          message: "Inconsistencia en los datos capturados",
          errors: validation.errors,
        });
      }

      // 3. Normalizar requisitos y documentos
      const currentReqs = (draftVersion.requirements || {}) as Record<string, any>;
      const mergedRequirements: Record<string, any> = {
        ...currentReqs,
        ...(requirements || {}),
        targetProfiles: targetProfiles !== undefined ? targetProfiles : (currentReqs.targetProfiles || product.targetProfiles || []),
      };

      for (const [conditionKey, requirementKey, rangeKey] of [
        ["minCompanyAgeMonths", "minMonthsInBusiness", "tiempoActividad"],
        ["minMonthlyRevenue", "minMonthlyIncome", "ingresoMensualPromedio"],
      ]) {
        if (!Object.prototype.hasOwnProperty.call(conditions || {}, conditionKey)) continue;
        const value = mergedConditions[conditionKey];
        const previous = currentConditions[conditionKey] ?? currentReqs[requirementKey] ?? currentReqs.ranges?.[rangeKey]?.min ?? null;
        if (value === previous) continue;
        mergedRequirements[requirementKey] = value;
        const updateRange = (ranges: any) => {
          const next = {...(ranges || {})};
          const range = {...(next[rangeKey] || {})};
          if (value == null) delete range.min; else range.min = value;
          if (Object.keys(range).length) next[rangeKey] = range; else delete next[rangeKey];
          return next;
        };
        mergedRequirements.ranges = updateRange(mergedRequirements.ranges);
        if (mergedRequirements.profileRules && typeof mergedRequirements.profileRules === "object") {
          mergedRequirements.profileRules = Object.fromEntries(Object.entries(mergedRequirements.profileRules).map(([profile, rule]: [string, any]) => [profile, {...rule, ranges: updateRange(rule?.ranges)}]));
        }
      }

      // Only this explicit Super Admin action can record a commercial reconciliation.
      // A client cannot forge attribution or retain approval after changing the source.
      mergedRequirements.businessAgeResolution = currentReqs.businessAgeResolution;
      if (req.body.businessAgeReview !== undefined) {
        const review = req.body.businessAgeReview;
        const policy = getOfferAgePolicy(mergedConditions, mergedRequirements);
        if (!review || review.confirmed !== true || typeof review.reason !== "string" || review.reason.trim().length < 3 ||
            !policy.rows.length || !policy.rows.every(row => Number.isSafeInteger(review.monthsByProfile?.[row.profile]) && review.monthsByProfile[row.profile] >= 0)) {
          return res.status(400).json({ message: "Confirma los meses de antigüedad por perfil y el motivo de conciliación." });
        }
        mergedRequirements.businessAgeResolution = {
          basis: policy.basis, monthsByProfile: Object.fromEntries(policy.rows.map(row => [row.profile, review.monthsByProfile[row.profile]])),
          reason: review.reason.trim(), reviewedBy: userId, reviewedAt: new Date().toISOString(),
        };
      }

      const docsList = requiredDocuments !== undefined
        ? (Array.isArray(requiredDocuments) ? requiredDocuments : [])
        : (draftVersion.requiredDocuments || []);

      // 4. Guardado ATÓMICO de versión borrador y producto padre (B3.1: Aislamiento total)
      // Si la oferta ya está publicada (status === 'published'), la v1 vigente permanece intacta:
      // editar la futura v2 NO altera las condiciones, comisiones ni datos visibles de la v1 vigente.
      // Solo si el producto sigue en borrador inicial (status === 'draft'), se sincronizan metadatos de borrador.
      const shouldSyncParentToDraft = product.status === "draft";
      const { product: updatedProduct, version: updatedVersion } = await storage.updateInstitutionProductDraftAndParent(
        id,
        draftVersion.id,
        {
          conditions: mergedConditions,
          requirements: mergedRequirements,
          requiredDocuments: docsList,
          variablesConfiguration: variablesConfiguration !== undefined ? variablesConfiguration : draftVersion.variablesConfiguration,
          changeReason: changeReason || "Edición de versión en borrador con comisiones individuales",
        },
        shouldSyncParentToDraft ? {
          name: name !== undefined ? name : product.name,
          customName: name !== undefined ? name : (product.customName || product.name),
          description: description !== undefined ? description : product.description,
          productType: productType !== undefined ? productType : product.productType,
          targetProfiles: targetProfiles !== undefined ? targetProfiles : product.targetProfiles,
          configuration: {
            ...((product.configuration || {}) as Record<string, any>),
            ...mergedConditions,
          },
        } : undefined
      );

      res.json({
        product: updatedProduct,
        version: updatedVersion,
      });
    } catch (error: any) {
      console.error("Error updating draft version:", error);
      res.status(400).json({ message: error.message || "Failed to update draft version" });
    }
  });

  // Revisión previa de publicación con validación, advertencias y datos completos (B3 - Solo Super Admin)
  app.get('/api/institution-products/:id/publish-preview', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || req.user?.id;
      const isSuperAdmin = await requirePlatformRole(userId, ['super_admin']);
      if (!isSuperAdmin) {
        return res.status(403).json({ message: "Access denied - Super Admin privileges required" });
      }

      const { id } = req.params;
      const product = await storage.getInstitutionProduct(id);
      if (!product) {
        return res.status(404).json({ message: "Institution product not found" });
      }

      const versions = await storage.getInstitutionProductVersions(id);
      const draftVersion = versions.find(v => v.status === "draft") || null;
      if (!draftVersion) {
        return res.status(400).json({ message: "No se encontró una versión en borrador para publicar" });
      }

      const currentVersion = versions.find(v => v.status === "published" || v.status === "active") || null;

      const cond = (draftVersion.conditions || {}) as Record<string, any>;
      const reqs = (draftVersion.requirements || {}) as Record<string, any>;
      const docs = draftVersion.requiredDocuments || [];

      const validation = validateMinimumPublishConditions({
        conditions: cond,
        requirements: reqs,
        requiredDocuments: docs,
        changeReason: draftVersion.changeReason || "Revisión previa para publicación",
        productType: product.productType,
      });

      // Comisiones y desglose económico independiente por canal
      const cr = (cond.commissionRates || {}) as Record<string, any>;
      const finRate = cr.financiera?.apertura !== undefined && cr.financiera?.apertura !== null && cr.financiera?.apertura !== ""
        ? Number(cr.financiera.apertura) : null;
      const brkRate = cr.broker?.apertura !== undefined && cr.broker?.apertura !== null && cr.broker?.apertura !== ""
        ? Number(cr.broker.apertura) : null;
      const mbRate = cr.masterBroker?.apertura !== undefined && cr.masterBroker?.apertura !== null && cr.masterBroker?.apertura !== ""
        ? Number(cr.masterBroker.apertura) : null;

      // Requisito 5: Si falta comisión, margen pendiente, nunca 100% de la bolsa
      const marginDirect = (finRate !== null && brkRate !== null) ? Number((finRate - brkRate).toFixed(4)) : null;
      const marginMaster = (finRate !== null && mbRate !== null) ? Number((finRate - mbRate).toFixed(4)) : null;

      res.json({
        product,
        draftVersion,
        currentVersion,
        validation,
        summary: {
          amounts: {
            min: cond.minAmount ?? null,
            max: cond.maxAmount ?? null,
            isPending: cond.minAmount === undefined && cond.maxAmount === undefined,
          },
          rates: {
            min: cond.minInterestRate ?? null,
            max: cond.maxInterestRate ?? null,
            isPending: cond.minInterestRate === undefined || cond.maxInterestRate === undefined,
          },
          terms: {
            min: cond.minTermMonths ?? null,
            max: cond.maxTermMonths ?? null,
            isPending: cond.minTermMonths === undefined || cond.maxTermMonths === undefined,
          },
          targetProfiles: reqs.targetProfiles || product.targetProfiles || [],
          requiredDocuments: docs,
          commissions: {
            financiera: finRate,
            brokerDirecto: brkRate,
            masterBroker: mbRate,
            platformMarginDirect: marginDirect,
            platformMarginMaster: marginMaster,
            isMarginDirectPending: marginDirect === null,
            isMarginMasterPending: marginMaster === null,
            notes: cr.notes || "",
          },
          eligibility: {
            agePolicy: getOfferAgePolicy(cond, reqs),
            minCompanyAgeMonths: cond.minCompanyAgeMonths ?? reqs.minMonthsInBusiness ?? null,
            minMonthlyRevenue: cond.minMonthlyRevenue ?? reqs.minMonthlyIncome ?? null,
            bureauRequirement: cond.bureauRequirement ?? reqs.bureauPolicySource ?? null,
            guaranteeType: cond.guaranteeType ?? reqs.guarantee ?? null,
            avalesType: cond.avalesType ?? reqs.guarantorSource ?? null,
            verification: cond.eligibilityEvaluation ?? null,
          },
        },
      });
    } catch (error: any) {
      console.error("Error in publish-preview:", error);
      res.status(500).json({ message: "Failed to generate publish preview" });
    }
  });

  // COM-28: Dedicated inbox, no master/institution financial catalog exposed.
  app.get("/api/commercial/offer-acceptances/pending", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.claims.sub);
      if (!user || !["broker", "master_broker"].includes(user.role)) {
        return res.status(403).json({ code: "OFFER_ACCEPTANCE_ROLE_FORBIDDEN" });
      }
      const products = await storage.getInstitutionProducts();
      const pending = [];
      for (const product of products) {
        if (product.status !== "published" || product.isActive === false) continue;
        const versions = await storage.getInstitutionProductVersions(product.id);
        const current = versions.find(v => v.status === "published");
        if (!current) continue;
        const status = await getOfferCommissionStatus(storage, user, product.id, current.versionNumber);
        if (status.pending) pending.push(status);
      }
      return res.json({ pending });
    } catch (error: any) {
      console.error("Error consulting pending offer commissions:", error);
      return res.status(500).json({ code: "OFFER_ACCEPTANCES_UNAVAILABLE" });
    }
  });

  // COM-28: Broker/Master checks the exact published economic instrument.
  // Never expose platform or financial-institution internal commission rates.
  app.get("/api/institution-products/:id/commission-acceptance", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.claims.sub);
      if (!user || (user.role !== "broker" && user.role !== "master_broker")) {
        return res.status(403).json({ code: "OFFER_ACCEPTANCE_ROLE_FORBIDDEN" });
      }
      const product = await storage.getInstitutionProduct(req.params.id);
      if (!product || product.status !== "published" || product.isActive === false) {
        return res.status(404).json({ code: "OFFER_NOT_PUBLISHED" });
      }
      const versionNumber = Number(req.query.versionNumber ?? product.currentVersionNumber);
      if (!Number.isSafeInteger(versionNumber) || versionNumber <= 0) {
        return res.status(400).json({ code: "INVALID_OFFER_VERSION" });
      }
      return res.json(await getOfferCommissionStatus(storage, user, product.id, versionNumber));
    } catch (error: any) {
      return res.status(error?.message === "OFFER_VERSION_NOT_CURRENT" ? 409 : 500)
        .json({ code: error?.message || "OFFER_ACCEPTANCE_STATUS_ERROR" });
    }
  });

  app.post("/api/institution-products/:id/commission-acceptance", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.claims.sub);
      if (!user || (user.role !== "broker" && user.role !== "master_broker")) {
        return res.status(403).json({ code: "OFFER_ACCEPTANCE_ROLE_FORBIDDEN" });
      }
      const product = await storage.getInstitutionProduct(req.params.id);
      if (!product || product.status !== "published" || product.isActive === false) {
        return res.status(404).json({ code: "OFFER_NOT_PUBLISHED" });
      }
      const versionNumber = Number(req.body?.versionNumber);
      const expectedHash = req.body?.contentSha256;
      if (!Number.isSafeInteger(versionNumber) || versionNumber <= 0 ||
          typeof expectedHash !== "string" || !/^[a-f0-9]{64}$/.test(expectedHash)) {
        return res.status(400).json({ code: "OFFER_ACCEPTANCE_VERSION_AND_HASH_REQUIRED" });
      }
      // A client may only accept the exact document it was shown.
      const status = await getOfferCommissionStatus(storage, user, product.id, versionNumber);
      if (!status.contentSha256 || status.contentSha256 !== expectedHash) {
        return res.status(409).json({ code: "OFFER_ACCEPTANCE_STALE_DOCUMENT" });
      }
      const ipValue = req.ip || req.socket?.remoteAddress || null;
      const result = await acceptOfferCommission(storage, user, product.id, versionNumber,
        typeof ipValue === "string" ? ipValue : null,
        String(req.headers["user-agent"] || "unknown"));
      return res.json(result);
    } catch (error: any) {
      const code = error?.message || "OFFER_ACCEPTANCE_ERROR";
      const status = code === "OFFER_VERSION_NOT_CURRENT" || code === "OFFER_COMMISSIONS_NOT_PENDING" ||
        code === "OFFER_COMMISSION_DOCUMENT_UNAVAILABLE" ? 409 : 500;
      return res.status(status).json({ code });
    }
  });

  // Publicación formal de versión borrador (B3 - Solo Super Admin, Transaccional A1)
  app.post('/api/institution-products/:id/publish', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || req.user?.id;
      const isSuperAdmin = await requirePlatformRole(userId, ['super_admin']);
      if (!isSuperAdmin) {
        return res.status(403).json({ message: "Access denied - Super Admin privileges required" });
      }

      const { id } = req.params;
      const { changeReason, confirmPublish, expectedDraftId, expectedVersionHash } = req.body;
      if (typeof expectedDraftId !== "string" || !expectedDraftId.trim() || typeof expectedVersionHash !== "string" || !/^[a-f0-9]{64}$/.test(expectedVersionHash)) {
        return res.status(428).json({ code: "OFFER_REVIEW_REQUIRED", message: "Revisa el borrador antes de publicar: su ID y huella son obligatorios." });
      }

      // Requisito 1: Confirmación explícita obligatoria
      if (confirmPublish !== true) {
        return res.status(400).json({
          message: "Debe confirmar explícitamente la publicación de la oferta comercial",
        });
      }

      // Requisito 1 & 2: Auditoría y trazabilidad con motivo de cambio
      if (!changeReason || typeof changeReason !== "string" || changeReason.trim().length < 3) {
        return res.status(400).json({
          message: "El motivo de cambio es obligatorio para publicar (mínimo 3 caracteres para trazabilidad y auditoría)",
        });
      }

      const product = await storage.getInstitutionProduct(id);
      if (!product) {
        return res.status(404).json({ message: "Institution product not found" });
      }

      const versions = await storage.getInstitutionProductVersions(id);
      const draftVersion = versions.find(v => v.status === "draft");
      if (!draftVersion) {
        return res.status(400).json({
          message: "No se encontró una versión en borrador para publicar. Es posible que ya haya sido publicada.",
        });
      }

      if (expectedDraftId && expectedDraftId !== draftVersion.id) return res.status(409).json({message: "El borrador cambió. Revisa la oferta nuevamente."});

      // Compare against the previous published economics, never a draft or
      // arbitrary institution-level schedule. This does NOT create acceptance.
      const previousPublishedVersion = versions
        .filter(v => v.status === "published" && v.versionNumber < draftVersion.versionNumber)
        .sort((a, b) => b.versionNumber - a.versionNumber)[0] || null;

      // Requisito 2: Publicación transaccional A1 mediante Storage (sustitución segura e historial inmutable)
      const publishedVersion = await storage.publishInstitutionProductVersion(id, draftVersion.id, {
        publishedBy: userId,
        changeReason: changeReason.trim(),
        expectedVersionHash,
      });
      const commercialChange = compareOfferIntermediaryCommissions(
        previousPublishedVersion,
        publishedVersion,
      );

      const updatedProduct = await storage.getInstitutionProduct(id);
      // Notify affected users after the atomic publication. Notifications carry
      // no confidential master/platform rate details; acceptance is always
      // verified against PostgreSQL evidence, never against notification state.
      let notificationsAttempted = 0;
      let notificationsFailed = 0;
      if (commercialChange.requiresAnyAcceptance) {
        try {
          const allUsers = await storage.getAllUsers();
          for (const recipient of allUsers) {
            if (recipient.isActive === false || recipient.status === "inactive") continue;
            const parent = recipient.role === "broker" && recipient.masterBrokerId
              ? allUsers.find(u => u.id === recipient.masterBrokerId) ||
                await storage.getUser(recipient.masterBrokerId) : null;
            if (recipient.role === "broker" && recipient.masterBrokerId && !parent) {
              notificationsFailed++;
              continue;
            }
            const inMasterNetwork = parent?.role === "master_broker";
            const directBroker = recipient.role === "broker" && !inMasterNetwork;
            const master = recipient.role === "master_broker";
            const affected = (directBroker && commercialChange.directBrokerChanged) ||
              (master && commercialChange.masterBrokerChanged);
            const networkInformation = recipient.role === "broker" && inMasterNetwork &&
              commercialChange.masterBrokerChanged;
            if (!affected && !networkInformation) continue;
            notificationsAttempted++;
            try {
              await storage.createNotification({
                userId: recipient.id,
                type: "offer_commission_version_changed",
                title: "Condiciones comerciales de oferta actualizadas",
                message: affected
                  ? "Se publicaron cambios en una oferta que requieren tu aceptación expresa antes de seleccionar nuevas operaciones bajo esa versión."
                  : "Se actualizaron condiciones de una oferta de tu red. Tu Master Broker revisará las condiciones correspondientes.",
                relatedEntityType: "institution_product",
                relatedEntityId: id,
                priority: "high",
                data: { versionNumber: publishedVersion.versionNumber, scope: "offer", requiresAcceptance: affected },
              });
            } catch (notificationError) {
              notificationsFailed++;
              console.error("[COM-28] Error notificando cambio económico de oferta:", notificationError);
            }
          }
        } catch (err) {
          notificationsFailed++;
          console.error("[COM-28] Error enumerando destinatarios:", err);
        }
      }

      res.json({
        message: "Oferta comercial publicada exitosamente",
        product: updatedProduct,
        publishedVersion,
        commercialChange,
        offerVersionAcceptanceEnforced: true,
        notificationsAttempted,
        notificationsFailed,
      });
    } catch (error: any) {
      console.error("Error publishing institution product version:", error);
      res.status(400).json({ message: error.message || "Failed to publish version" });
    }
  });

  app.get('/api/institution-products/template/:templateId', isAuthenticated, async (req: any, res) => {
    try {
      const { templateId } = req.params;
      const userId = req.user?.claims?.sub || req.user?.id;
      const isSuperAdmin = await requirePlatformRole(userId, ['super_admin']);
      const { eligibleOnly } = req.query;

      let products = await storage.getInstitutionProductsByTemplate(templateId);

      if (!isSuperAdmin) {
        const user = await storage.getUser(userId);
        const userRole = user?.role || 'broker';
        const eligibleCommercialOffers = [];
        for (const p of products) {
          if (p.status === 'draft' || p.status === 'archived' || p.isActive === false) {
            continue;
          }
          const versions = await storage.getInstitutionProductVersions(p.id);
          if (isOfferEligibleForRequests(p, versions)) {
            eligibleCommercialOffers.push(sanitizeCommercialOffer(p, userRole));
          }
        }
        return res.json(eligibleCommercialOffers);
      }

      if (eligibleOnly === 'true') {
        const eligible = [];
        for (const p of products) {
          const versions = await storage.getInstitutionProductVersions(p.id);
          if (isOfferEligibleForRequests(p, versions)) {
            eligible.push(p);
          }
        }
        products = eligible;
      }
      res.json(products);
    } catch (error) {
      console.error("Error fetching institution products by template:", error);
      res.status(500).json({ message: "Failed to fetch institution products by template" });
    }
  });

  app.post('/api/institution-products', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || req.user?.id;
      
      const hasPermission = await requirePlatformRole(userId, ['super_admin']);
      if (!hasPermission) {
        return res.status(403).json({ message: "Access denied - Super Admin privileges required" });
      }

      // Parse body but add createdBy automatically for security
      const bodyData = insertInstitutionProductSchema.omit({ createdBy: true }).parse(req.body);
      
      // Archived variants remain for historical traceability but must never
      // be assigned to a new financial offer. This check is server-side.
      let targetProfiles = bodyData.targetProfiles;
      if (bodyData.templateId) {
        const template = await storage.getProductTemplate(bodyData.templateId);
        if (!template || template.isActive !== true) {
          return res.status(409).json({
            code: "ACTIVE_PRODUCT_FAMILY_REQUIRED",
            message: "Selecciona una de las familias activas del catálogo de productos.",
          });
        }
        if ((!targetProfiles || targetProfiles.length === 0) &&
            template.targetProfiles && template.targetProfiles.length > 0) {
          targetProfiles = template.targetProfiles;
        }
      }
      
      const productData = {
        ...bodyData,
        status: 'draft', // Forzado a draft desde el servidor; solo el flujo validado de publicación puede establecer published
        targetProfiles, // Use copied or provided targetProfiles
        createdBy: userId, // Set automatically from authenticated user
      };
      const initialVersionData = {
        versionNumber: 1,
        status: 'draft',
        conditions: (bodyData.configuration as any) || {},
        requirements: { targetProfiles: targetProfiles || [] },
        changeReason: "Alta inicial de oferta comercial en borrador",
        createdBy: userId,
      };
      const product = await storage.createInstitutionProduct(productData, initialVersionData);
      
      res.status(201).json(product);
    } catch (error) {
      console.error("Error creating institution product:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: 'Invalid data', errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to create institution product" });
      }
    }
  });

  app.put('/api/institution-products/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user?.claims?.sub || req.user?.id;
      
      const hasPermission = await requirePlatformRole(userId, ['super_admin']);
      if (!hasPermission) {
        return res.status(403).json({ message: "Access denied - Super Admin privileges required" });
      }

      // COM-28: the generic editor may change descriptive metadata only.
      // Commercial economics, matching requirements and publication status
      // MUST pass through the draft + explicit publish/version workflow.
      const versionedOnlyFields = [
        "configuration", "activeVariables", "targetProfiles",
        "status", "currentVersionNumber", "institutionId",
        "templateId", "productType",
      ];
      const forbiddenField = versionedOnlyFields.find(field =>
        Object.prototype.hasOwnProperty.call(req.body || {}, field));
      if (forbiddenField) {
        return res.status(409).json({
          code: "OFFER_VERSIONED_EDIT_REQUIRED",
          message: "El campo " + forbiddenField + " requiere guardar un borrador y publicar una nueva versión de la oferta.",
        });
      }
      const productData = insertInstitutionProductSchema.partial().parse(req.body);

      // Prevent logical inconsistency: cannot activate a product if institution is inactive.
      if (productData.isActive === true) {
        const existingProduct = await storage.getInstitutionProduct(id);
        if (!existingProduct) {
          return res.status(404).json({ message: "Institution product not found" });
        }

        const institution = await storage.getFinancialInstitution(existingProduct.institutionId);
        if (!institution || institution.isActive === false) {
          return res.status(400).json({
            message: "No se puede activar un producto si la financiera está inactiva",
          });
        }
      }

      const product = await storage.updateInstitutionProduct(id, productData);
      
      if (!product) {
        return res.status(404).json({ message: "Institution product not found" });
      }
      
      res.json(product);
    } catch (error: any) {
      console.error("Error updating institution product:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: 'Invalid data', errors: error.errors });
      } else {
        res.status(400).json({ message: error.message || "Failed to update institution product" });
      }
    }
  });

  app.delete('/api/institution-products/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user?.claims?.sub || req.user?.id;
      
      const hasPermission = await requirePlatformRole(userId, ['super_admin']);
      if (!hasPermission) {
        return res.status(403).json({ message: "Access denied - Super Admin privileges required" });
      }

      const success = await storage.deleteInstitutionProduct(id);
      
      if (!success) {
        return res.status(404).json({ message: "Institution product not found" });
      }

      res.json({ message: "Institution product deleted successfully" });
    } catch (error) {
      console.error("Error deleting institution product:", error);
      res.status(500).json({ message: "Failed to delete institution product" });
    }
  });

  // 🔹 TENANT PRODUCTS (Level 3B: Tenant customization - Tenant members only)
  // TEMPORARILY DISABLED - NOT IMPLEMENTED IN STORAGE
  /*
  app.get('/api/tenant-products', isAuthenticated, requireTenantContext, requireTenantMembership, async (req: any, res) => {
    try {
      const tenantId = req.tenantContext?.tenant?.id;
      
      if (!tenantId) {
        return res.status(400).json({ message: "Tenant context required" });
      }

      const products = await storage.getTenantProducts(tenantId);
      res.json(products);
    } catch (error) {
      console.error("Error fetching tenant products:", error);
      res.status(500).json({ message: "Failed to fetch tenant products" });
    }
  });
  */

  /*
  app.get('/api/tenant-products/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;

      const product = await storage.getTenantProduct(id);
      if (!product) {
        return res.status(404).json({ message: "Tenant product not found" });
      }

      // Check if user has access to this tenant
      const { hasAccess } = await authorizeTenantAccess({
        userId,
        tenantId: product.tenantId,
        requireRole: ['member', 'admin', 'owner'],
        allowSuperAdmin: true
      });
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      res.json(product);
    } catch (error) {
      console.error("Error fetching tenant product:", error);
      res.status(500).json({ message: "Failed to fetch tenant product" });
    }
  });

  app.get('/api/tenant-products/institution/:institutionProductId', isAuthenticated, requireTenantContext, requireTenantMembership, async (req: any, res) => {
    try {
      const { institutionProductId } = req.params;

      const products = await storage.getTenantProductsByInstitutionProduct(institutionProductId);
      res.json(products);
    } catch (error) {
      console.error("Error fetching tenant products by institution product:", error);
      res.status(500).json({ message: "Failed to fetch tenant products by institution product" });
    }
  });

  app.post('/api/tenant-products', isAuthenticated, requireTenantContext, requireTenantMembership, async (req: any, res) => {
    try {
      const tenantId = req.tenantContext?.tenant?.id;
      
      if (!tenantId) {
        return res.status(400).json({ message: "Tenant context required" });
      }

      const productData = insertTenantProductSchema.parse({
        ...req.body,
        tenantId // Ensure tenantId matches current tenant context
      });
      
      const product = await storage.createTenantProduct(productData);
      
      res.status(201).json(product);
    } catch (error) {
      console.error("Error creating tenant product:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: 'Invalid data', errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to create tenant product" });
      }
    }
  });

  app.put('/api/tenant-products/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;

      const existingProduct = await storage.getTenantProduct(id);
      if (!existingProduct) {
        return res.status(404).json({ message: "Tenant product not found" });
      }

      // Check if user has access to modify this tenant's products
      const { hasAccess } = await authorizeTenantAccess({
        userId,
        tenantId: existingProduct.tenantId,
        requireRole: ['admin', 'owner'],
        allowSuperAdmin: true
      });
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      const productData = insertTenantProductSchema.partial().parse(req.body);
      const product = await storage.updateTenantProduct(id, productData);
      
      if (!product) {
        return res.status(404).json({ message: "Tenant product not found" });
      }
      
      res.json(product);
    } catch (error) {
      console.error("Error updating tenant product:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: 'Invalid data', errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to update tenant product" });
      }
    }
  });

  app.delete('/api/tenant-products/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;

      const existingProduct = await storage.getTenantProduct(id);
      if (!existingProduct) {
        return res.status(404).json({ message: "Tenant product not found" });
      }

      // Check if user has access to delete this tenant's products
      const { hasAccess } = await authorizeTenantAccess({
        userId,
        tenantId: existingProduct.tenantId,
        requireRole: ['admin', 'owner'],
        allowSuperAdmin: true
      });
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      const success = await storage.deleteTenantProduct(id);
      
      if (success) {
        res.json({ message: "Tenant product deleted successfully" });
      } else {
        res.status(404).json({ message: "Tenant product not found" });
      }
    } catch (error) {
      console.error("Error deleting tenant product:", error);
      res.status(500).json({ message: "Failed to delete tenant product" });
    }
  });
  */

  // ================================
  // CREDIT SUBMISSION SYSTEM ROUTES
  // ================================

  // Get credit submission requests - Admin can see all, brokers see their own
  app.get('/api/credit-submissions', isAuthenticated, requireModuleAndAction('creditos', 'view'), async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const filters: { status?: string; brokerId?: string; brokerIds?: string[] } = {};
      
      // If user is broker, only show their submissions
      // If user is master_broker, show submissions of their whole network
      if (user.role === 'broker') {
        filters.brokerId = userId;
      } else if (user.role === 'master_broker') {
        const networkBrokers = await storage.getUsersByMasterBroker(userId);
        filters.brokerIds = [userId, ...networkBrokers.map(b => b.id)];
      }
      
      // Apply query filters
      if (req.query.status) {
        filters.status = req.query.status as string;
      }

      const submissions = (await storage.getCreditSubmissionRequests(filters))
        .filter(submission => canReadCreditSubmission(user, submission));
      
      // Enrich with related data (client, broker, masterBroker, productTemplate, targets)
      const enrichedSubmissions = await Promise.all(
        submissions.map(async (submission) => {
          const client = submission.clientId ? await storage.getClient(submission.clientId) : null;
          const productTemplate = await resolveProductTemplate(submission.productTemplateId, submission.purpose);
          const broker = submission.brokerId ? await storage.getUser(submission.brokerId) : null;
          const masterBroker = broker?.masterBrokerId ? await storage.getUser(broker.masterBrokerId) : null;
          
          const targets = await storage.getCreditSubmissionTargets({ requestId: submission.id });
          const enrichedTargets = await Promise.all(
            targets.map(async (target) => {
              const institution = await storage.getFinancialInstitution(target.financialInstitutionId);
              return {
                ...target,
                institution: projectSubmissionInstitution(institution)
              };
            })
          );
          
          return {
            ...submission,
            client,
            productTemplate,
            broker: broker ? {
              id: broker.id,
              firstName: broker.firstName,
              lastName: broker.lastName,
              email: broker.email,
              role: broker.role,
              bankName: broker.bankName,
              clabe: user.role === 'super_admin' ? broker.clabe : maskCLABE(broker.clabe),
              isActive: broker.isActive,
              status: broker.status || (broker.isActive ? 'active' : 'inactive'),
            } : null,
            masterBroker: masterBroker ? {
              id: masterBroker.id,
              firstName: masterBroker.firstName,
              lastName: masterBroker.lastName,
              email: masterBroker.email,
              role: masterBroker.role,
              brandName: (masterBroker as any).brandName
            } : null,
            targets: enrichedTargets.map(t => projectSubmissionTarget(t, user.role))
          };
        })
      );

      res.json(enrichedSubmissions);
    } catch (error) {
      console.error("Error fetching credit submissions:", error);
      res.status(500).json({ message: "Failed to fetch credit submissions" });
    }
  });

  // Get specific credit submission request
  app.get('/api/credit-submissions/:id', isAuthenticated, requireModuleAndAction('creditos', 'view'), async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      const submission = await storage.getCreditSubmissionRequest(id);
      if (!submission) {
        return res.status(404).json({ message: "Credit submission not found" });
      }

      if (!canReadCreditSubmission(user, submission)) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Enrich single submission
      const client = submission.clientId ? await storage.getClient(submission.clientId) : null;
      const productTemplate = await resolveProductTemplate(submission.productTemplateId, submission.purpose);
      const broker = submission.brokerId ? await storage.getUser(submission.brokerId) : null;
      const masterBroker = broker?.masterBrokerId ? await storage.getUser(broker.masterBrokerId) : null;
      const targets = await storage.getCreditSubmissionTargets({ requestId: submission.id });
      const enrichedTargets = await Promise.all(
        targets.map(async (target) => {
          const institution = await storage.getFinancialInstitution(target.financialInstitutionId);
          return {
            ...target,
            institution: projectSubmissionInstitution(institution)
          };
        })
      );

      res.json({
        ...submission,
        client,
        productTemplate,
        broker: broker ? {
          id: broker.id,
          firstName: broker.firstName,
          lastName: broker.lastName,
          email: broker.email,
          role: broker.role,
          isActive: broker.isActive,
          status: broker.status || (broker.isActive ? 'active' : 'inactive'),
        } : null,
        masterBroker: masterBroker ? {
          id: masterBroker.id,
          firstName: masterBroker.firstName,
          lastName: masterBroker.lastName,
          brandName: (masterBroker as any).brandName
        } : null,
        targets: enrichedTargets.map(t => projectSubmissionTarget(t, user?.role))
      });
    } catch (error) {
      console.error("Error fetching credit submission:", error);
      res.status(500).json({ message: "Failed to fetch credit submission" });
    }
  });

  // Get broker's own submissions with targets - ENRICHED with related data
  app.get('/api/credit-submission-requests/my-submissions', isAuthenticated, requireModuleAndAction('creditos', 'view'), async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      let submissions: any[] = [];
      if (req.tenantContext?.tenant) {
        const tenant = req.tenantContext.tenant;
        if (tenant.type === 'master_broker') {
          const subordinates = await storage.getTenantsByParent(tenant.id);
          const tenantIds = [tenant.id, ...subordinates.map(t => t.id)];
          submissions = await storage.getCreditSubmissionRequests({ tenantIds });
        } else {
          submissions = await storage.getCreditSubmissionRequests({ tenantId: tenant.id });
        }
      } else {
        submissions = await storage.getCreditSubmissionRequests({ brokerId: userId });
      }
      
      // A tenant membership alone never confers permission to see a
      // different Broker's confidential submission within that tenant.
      submissions = submissions.filter(submission => canReadCreditSubmission(user, submission));
      const submissionsWithEnrichedData = await Promise.all(
        submissions.map(async (submission) => {
          // Get related data
          const client = submission.clientId ? await storage.getClient(submission.clientId) : null;
          const productTemplate = await resolveProductTemplate(submission.productTemplateId, submission.purpose);
          const broker = await storage.getUser(submission.brokerId);
          
          // Get targets with institution data
          const targets = await storage.getCreditSubmissionTargets({ requestId: submission.id });
          const enrichedTargets = await Promise.all(
            targets.map(async (target) => {
              const institution = await storage.getFinancialInstitution(target.financialInstitutionId);
              return {
                ...target,
                institution: projectSubmissionInstitution(institution)
              };
            })
          );
          
          return {
            ...submission,
            client,
            productTemplate,
            broker: projectSubmissionPerson(broker),
            targets: enrichedTargets.map(t => projectSubmissionTarget(t, user.role))
          };
        })
      );

      res.json(submissionsWithEnrichedData);
    } catch (error) {
      console.error("Error fetching my submissions:", error);
      res.status(500).json({ message: "Failed to fetch my submissions" });
    }
  });

  // Get specific submission request
  app.get('/api/credit-submission-requests/:id', isAuthenticated, requireModuleAndAction('creditos', 'view'), async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const submission = await storage.getCreditSubmissionRequest(id);
      
      if (!submission) {
        return res.status(404).json({ message: "Submission request not found" });
      }

      // Authorization check - tenant/broker access
      if (!canReadCreditSubmission(user, submission)) {
        return res.status(403).json({ message: "Access denied" });
      }

      res.json(submission);
    } catch (error) {
      console.error("Error fetching submission request:", error);
      res.status(500).json({ message: "Failed to fetch submission request" });
    }
  });

  // Get credit submissions for a specific client - ENRICHED with related data
  app.get('/api/credit-submissions/client/:clientId', isAuthenticated, requireModuleAndAction('creditos', 'view'), async (req: any, res) => {
    try {
      const { clientId } = req.params;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // The client is a real ownership boundary; do not grant visibility
      // to every historical opportunity just because the client is shared.
      const client = await storage.getClient(clientId);
      if (!client) return res.status(404).json({ message: "Client not found" });
      const auth = await authorizeClientAccess(userId, user.role, clientId, req.tenantContext);
      const allSubmissions = (await storage.getCreditSubmissionRequests({ clientId }))
        .filter(submission => canReadCreditSubmission(user, submission));
      // Historical Master can still consult a submission from its former
      // network after a Broker transfer, but not submissions of other originators.
      const isHistoricMaster = user.role === "master_broker" &&
        allSubmissions.some(sub => sub.originMasterBrokerId === user.id);
      // A Broker may consult their OWN submitted opportunity even when the
      // separate relationship-reservation lease has expired or is absent.
      const hasOwnedSubmission = user.role === "broker" &&
        allSubmissions.some(sub => sub.brokerId === user.id);
      const hasNoCrossTenantConflict = !client.tenantId ||
        auth.authorized || isHistoricMaster;
      if ((!auth.authorized && !isHistoricMaster && !hasOwnedSubmission) ||
          !hasNoCrossTenantConflict) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      // Enrich with related data
      const submissionsWithEnrichedData = await Promise.all(
        allSubmissions.map(async (submission) => {
          // Get related data
          const client = submission.clientId ? await storage.getClient(submission.clientId) : null;
          const productTemplate = await resolveProductTemplate(submission.productTemplateId, submission.purpose);
          const broker = await storage.getUser(submission.brokerId);
          
          // Get targets with institution data
          const targets = await storage.getCreditSubmissionTargets({ requestId: submission.id });
          const enrichedTargets = await Promise.all(
            targets.map(async (target) => {
              const institution = await storage.getFinancialInstitution(target.financialInstitutionId);
              return {
                ...target,
                institution: projectSubmissionInstitution(institution)
              };
            })
          );
          
          return {
            ...submission,
            client,
            productTemplate,
            broker: projectSubmissionPerson(broker),
            targets: enrichedTargets.map(t => projectSubmissionTarget(t, user.role))
          };
        })
      );

      res.json(submissionsWithEnrichedData);
    } catch (error) {
      console.error("Error fetching client credit submissions:", error);
      res.status(500).json({ message: "Failed to fetch client credit submissions" });
    }
  });

  // Create new credit submission request - Brokers and Admins
  app.post('/api/credit-submissions', isAuthenticated, requireModuleAndAction('creditos', 'submit_proposals'), async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      // Brokers, master brokers, admins and super_admins can create submissions
      const allowedRoles = ['broker', 'master_broker', 'admin', 'super_admin'];
      if (!user || !allowedRoles.includes(user.role)) {
        return res.status(403).json({ message: "You don't have permission to create credit submissions" });
      }

      const originationCheck = await validateCommercialOriginationAndFormalization({
        callerUser: user,
        callerMembership: req.tenantContext?.membership,
        tenantId: req.tenantContext?.tenant?.id,
        requestedBrokerId: req.body.brokerId,
      });

      if (!originationCheck.allowed) {
        return res.status(originationCheck.statusCode || 403).json({
          code: originationCheck.code,
          message: originationCheck.message,
        });
      }

      const submissionClientAccess = await validateClientOriginationAccess({
        clientId: req.body?.clientId,
        callerUser: user,
        effectiveBrokerId: originationCheck.brokerId,
        tenantContext: req.tenantContext,
      });
      if (!submissionClientAccess.allowed) {
        return res.status(submissionClientAccess.statusCode || 403).json({
          code: submissionClientAccess.code, message: submissionClientAccess.message,
        });
      }

      const submissionData = insertCreditSubmissionRequestSchema.parse({
        ...req.body,
        tenantId: req.tenantContext?.tenant?.id || null,
        brokerId: originationCheck.brokerId,
        createdBy: userId,
        status: 'pending_admin'
      });

      const submission = await storage.createCreditSubmissionRequest(submissionData);
      
      // Create targets for each selected financial institution
      const targets = [];
      if (req.body.financialInstitutionIds && Array.isArray(req.body.financialInstitutionIds)) {
        for (const institutionId of req.body.financialInstitutionIds) {
          const targetData = {
            requestId: submission.id,
            financialInstitutionId: institutionId,
            status: 'pending_admin'
          };
          const target = await storage.createCreditSubmissionTarget(targetData);
          targets.push(target);
        }
      }

      // Notify Admin / Super Admin, Master Broker (if applicable), and Broker
      try {
        const client = await storage.getClient(submission.clientId);
        const clientName: string = (client ? (client.type === 'persona_moral' ? client.businessName : `${client.firstName} ${client.lastName}`.trim()) : null) || 'Cliente';
        const formattedAmount = `$${parseFloat(submission.requestedAmount.toString()).toLocaleString('es-MX')} MXN`;

        const allUsers = await storage.getAllUsers();
        const admins = allUsers.filter(u => u.role === 'admin' || u.role === 'super_admin');

        // 1. Notify Admins and Super Admins
        for (const admin of admins) {
          const adminNotif = await storage.createNotification({
            userId: admin.id,
            type: 'credit_submission_created',
            title: 'Nueva solicitud de crédito recibida',
            message: `Nueva solicitud para ${clientName} por ${formattedAmount}. Pendiente de revisión y visto bueno.`,
            relatedEntityType: 'credit_submission',
            relatedEntityId: submission.id,
            priority: 'high',
          });
          broadcastToUser(admin.id, { type: 'notification', notification: adminNotif });
          broadcastToUser(admin.id, { type: 'submission_created', submissionId: submission.id });
        }

        // Send email alert to Super Admin
        sendSuperAdminNotificationEmail({
          title: `Nueva Solicitud de Crédito: ${clientName}`,
          message: `Se ha recibido una nueva solicitud de crédito para ${clientName} por ${formattedAmount}. Registrada por el broker ${user.firstName} ${user.lastName || ''}. Requiere revisión administrativa y visto bueno para enviarse a financieras.`,
          type: 'credit_submission_created',
          clientName,
          brokerName: `${user.firstName} ${user.lastName || ''}`.trim(),
          amount: formattedAmount,
          actionUrl: '/solicitudes-pendientes',
          details: {
            'ID de Solicitud': submission.id,
            'Propósito': submission.purpose || 'Crédito Empresarial',
            'Financieras Seleccionadas': Array.isArray(req.body.financialInstitutionIds) ? req.body.financialInstitutionIds.length : '1 o más',
          }
        }).catch(e => console.error('[Email] Error sending super admin notification on submission created:', e));

        // 2. Notify Master Broker if applicable
        if (user.masterBrokerId) {
          const mbNotif = await storage.createNotification({
            userId: user.masterBrokerId,
            type: 'credit_submission_created',
            title: 'Nueva solicitud en tu red de brokers',
            message: `${user.firstName} ${user.lastName || ''} registró una solicitud para ${clientName} por ${formattedAmount}.`,
            relatedEntityType: 'credit_submission',
            relatedEntityId: submission.id,
            priority: 'normal',
          });
          broadcastToUser(user.masterBrokerId, { type: 'notification', notification: mbNotif });
          broadcastToUser(user.masterBrokerId, { type: 'submission_created', submissionId: submission.id });
        }

        // 3. Notify the submitting Broker
        const brokerNotif = await storage.createNotification({
          userId: user.id,
          type: 'credit_submission_created',
          title: 'Solicitud enviada a revisión',
          message: `Tu solicitud para ${clientName} por ${formattedAmount} fue registrada exitosamente y está en revisión administrativa.`,
          relatedEntityType: 'credit_submission',
          relatedEntityId: submission.id,
          priority: 'normal',
        });
        broadcastToUser(user.id, { type: 'notification', notification: brokerNotif });
      } catch (notifErr) {
        console.error("Error creating notifications on submission creation:", notifErr);
      }

      res.status(201).json({ submission, targets });
    } catch (error) {
      console.error("Error creating credit submission:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid submission data", errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to create credit submission" });
      }
    }
  });

  // Reuse the approved active catalog; never create a seventh mortgage template during lead submission.
  async function ensureHipotecarioViviendaTemplate(): Promise<any> {
    const templates = await storage.getProductTemplates();
    const template = selectHousingMortgageTemplate(templates);
    if (!template) {
      throw new Error('No existe una plantilla hipotecaria activa configurada para vivienda');
    }
    return template;
  }

  // POST /api/mortgage-leads - Atomic registration of Hipotecario Vivienda opportunity
  // Camino A (New prospect): Creates Client + Oportunidad vinculada in 1 atomic operation
  // Camino B (Existing client): Reuses Client and creates Oportunidad vinculada without duplicate client
  // EVENT 1: Registers opportunity. Targets are NOT created unless explicitly selected/channeled.
  app.post('/api/mortgage-leads', isAuthenticated, requireModuleAndAction('creditos', 'submit_proposals'), async (req: any, res) => {
    let createdClientId: string | null = null;
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);

      const allowedRoles = ['broker', 'master_broker', 'admin', 'super_admin'];
      if (!user || !allowedRoles.includes(user.role)) {
        return res.status(403).json({ message: "No tienes permiso para registrar operaciones hipotecarias" });
      }

      const originationCheck = await validateCommercialOriginationAndFormalization({
        callerUser: user,
        callerMembership: req.tenantContext?.membership,
        tenantId: req.tenantContext?.tenant?.id,
        requestedBrokerId: req.body.brokerId,
      });

      if (!originationCheck.allowed) {
        return res.status(originationCheck.statusCode || 403).json({
          code: originationCheck.code,
          message: originationCheck.message,
        });
      }

      const tenantId = req.tenantContext?.tenant?.id || null;
      const brokerId = originationCheck.brokerId;

      const {
        clientId, // Camino B if present
        firstName,
        lastName,
        phone,
        email,
        rfc,
        propertyValue,
        requestedAmount,
        downPayment,
        financedPercentage,
        propertyLocation,
        requestedTermMonths,
        monthlyIncome,
        incomeType,
        hasCoBorrower,
        coBorrowerIncome,
        brokerNotes,
        financialInstitutionIds, // Optional: if provided, targets are created (Event 2)
      } = req.body;

      if (!requestedAmount || parseFloat(requestedAmount.toString()) <= 0) {
        return res.status(400).json({ message: "El monto solicitado es requerido y debe ser mayor a cero" });
      }

      let finalClientId = clientId;
      let clientData: any = undefined;

      // Camino A: Nuevo cliente
      if (!finalClientId) {
        if (!firstName || !phone || !email) {
          return res.status(400).json({ message: "Nombre, teléfono y correo electrónico son requeridos para dar de alta al prospecto" });
        }

        const clientType = incomeType === 'empresario' ? 'fisica_empresarial' : 'fisica';
        clientData = updatedInsertClientSchema.parse({
          tenantId,
          brokerId,
          createdBy: userId,
          type: clientType,
          firstName: String(firstName).trim(),
          lastName: lastName ? String(lastName).trim() : '',
          phone: String(phone).trim(),
          email: String(email).trim(),
          rfc: rfc ? String(rfc).trim().toUpperCase() : null,
          originOpportunity: 'hipotecario_vivienda',
          ingresoMensualPromedio: monthlyIncome ? monthlyIncome.toString() : null,
          montoSolicitado: requestedAmount.toString(),
          address: propertyLocation || null,
          street: propertyLocation || null,
        });
      } else {
        // Camino B: an existing client must belong to this originating
        // commercial scope; never link a mortgage lead by guessing an ID.
        const mortgageClientAccess = await validateClientOriginationAccess({
          clientId: finalClientId,
          callerUser: user,
          effectiveBrokerId: brokerId,
          tenantContext: req.tenantContext,
        });
        if (!mortgageClientAccess.allowed) {
          return res.status(mortgageClientAccess.statusCode || 403).json({
            code: mortgageClientAccess.code, message: mortgageClientAccess.message,
          });
        }
      }

      // Only mutate reference catalogs after validating the selected client.
      // A forged existing-client ID must not even create a template.
      const hipoTemplate = await ensureHipotecarioViviendaTemplate();

      const mortgageData = {
        segmento_hipotecario: 'vivienda', // Independent housing segment within the consolidated Hipotecario family
        propertyValue: propertyValue || null,
        requestedAmount: requestedAmount || null,
        downPayment: downPayment || null,
        financedPercentage: financedPercentage || null,
        propertyLocation: propertyLocation || null,
        requestedTermMonths: requestedTermMonths || null,
        monthlyIncome: monthlyIncome || null,
        incomeType: incomeType || 'asalariado',
        hasCoBorrower: !!hasCoBorrower,
        coBorrowerIncome: hasCoBorrower ? (coBorrowerIncome || null) : null,
      };

      const purpose = "Adquisición de Vivienda / Crédito Hipotecario";

      const submissionData = insertCreditSubmissionRequestSchema.omit({ clientId: true }).parse({
        tenantId,
        brokerId,
        createdBy: userId,
        productTemplateId: hipoTemplate.id,
        requestedAmount: requestedAmount.toString(),
        purpose,
        brokerNotes: brokerNotes || `Solicitud Hipotecario Vivienda. Ubicación: ${propertyLocation || 'No especificada'}`,
        mortgageData,
        status: 'pending_admin',
      });

      // Execute atomic DB transaction: BEGIN -> create client (if Camino A) -> create submission -> create targets -> COMMIT
      // Any failure automatically triggers ROLLBACK with zero orphaned records
      const { client, submission, targets } = await storage.createMortgageLeadTransactional({
        clientData: !finalClientId ? clientData : undefined,
        clientId: finalClientId ? finalClientId : undefined,
        submissionData,
        financialInstitutionIds: Array.isArray(financialInstitutionIds) ? financialInstitutionIds : [],
      });

      // Notifications
      try {
        const clientName = `${client.firstName || ''} ${client.lastName || ''}`.trim() || 'Prospecto Hipotecario';
        const formattedAmount = `$${parseFloat(requestedAmount.toString()).toLocaleString('es-MX')} MXN`;

        const allUsers = await storage.getAllUsers();
        const admins = allUsers.filter(u => u.role === 'admin' || u.role === 'super_admin');

        for (const admin of admins) {
          const adminNotif = await storage.createNotification({
            userId: admin.id,
            type: 'credit_submission_created',
            title: 'Nueva oportunidad Hipotecario Vivienda',
            message: `Oportunidad hipotecaria para ${clientName} por ${formattedAmount}. Registrada por ${user.firstName} ${user.lastName || ''}.`,
            relatedEntityType: 'credit_submission',
            relatedEntityId: submission.id,
            priority: 'high',
          });
          broadcastToUser(admin.id, { type: 'notification', notification: adminNotif });
          broadcastToUser(admin.id, { type: 'submission_created', submissionId: submission.id });
        }

        if (user.masterBrokerId) {
          const mbNotif = await storage.createNotification({
            userId: user.masterBrokerId,
            type: 'credit_submission_created',
            title: 'Nueva oportunidad hipotecaria en tu red',
            message: `${user.firstName} ${user.lastName || ''} registró una oportunidad hipotecaria para ${clientName} por ${formattedAmount}.`,
            relatedEntityType: 'credit_submission',
            relatedEntityId: submission.id,
            priority: 'normal',
          });
          broadcastToUser(user.masterBrokerId, { type: 'notification', notification: mbNotif });
          broadcastToUser(user.masterBrokerId, { type: 'submission_created', submissionId: submission.id });
        }
      } catch (notifErr) {
        console.error("Error creating notifications for mortgage lead:", notifErr);
      }

      res.status(201).json({
        client,
        submission,
        targets,
        message: targets.length > 0
          ? "Oportunidad hipotecaria registrada; financieras seleccionadas pendientes de revisión interna (sin envío externo)"
          : "Oportunidad hipotecaria registrada exitosamente para revisión y canalización"
      });
    } catch (error: any) {
      console.error("Error creating mortgage lead:", error);
      res.status(500).json({ message: error.message || "Error al registrar la oportunidad hipotecaria" });
    }
  });


  // Arrendamiento ágil: nuevo cliente o cliente existente + solicitud en una transacción.
  // El JSONB histórico mortgageData se usa como contenedor técnico de datos de operación
  // (operationType identifica explícitamente Arrendamiento). No se crea familia ni tabla nueva.
  // Registro para cotizar: NUNCA transmite datos a financieras ni crea targets automáticamente.
  app.post('/api/leasing-leads', isAuthenticated, requireModuleAndAction('creditos', 'submit_proposals'), async (req: any, res) => {
    const parsed = leaseLeadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Revisa los datos de contacto y del activo", errors: parsed.error.flatten() });
    }
    try {
      const lead = parsed.data;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user || !['broker', 'master_broker', 'admin', 'super_admin'].includes(user.role)) {
        return res.status(403).json({ message: "Sin permiso para registrar arrendamientos" });
      }
      const scope = await validateCommercialOriginationAndFormalization({
        callerUser: user,
        callerMembership: req.tenantContext?.membership,
        tenantId: req.tenantContext?.tenant?.id,
        requestedBrokerId: req.body?.brokerId,
      });
      if (!scope.allowed) {
        return res.status(scope.statusCode || 403).json({ code: scope.code, message: scope.message });
      }
      const tenantId = req.tenantContext?.tenant?.id || null;
      const brokerId = scope.brokerId;
      let clientData: any;
      if (lead.clientId) {
        const access = await validateClientOriginationAccess({
          clientId: lead.clientId,
          callerUser: user,
          effectiveBrokerId: brokerId,
          tenantContext: req.tenantContext,
        });
        if (!access.allowed) {
          return res.status(access.statusCode || 403).json({ code: access.code, message: access.message });
        }
      } else {
        const duplicate = await commercialOpportunityService.checkDuplicatesEnriched({
          rfc: lead.rfc || undefined,
          phone: lead.phone,
          email: lead.email,
          financingNeedType: 'arrendamiento',
          currentUserId: userId,
          currentUserRole: user.role,
          userTenantId: tenantId,
          tenantContext: req.tenantContext,
        });
        if (duplicate.clientExists) {
          return res.status(409).json({
            code: 'EXISTING_CLIENT',
            message: "Ya existe un prospecto con estos datos. Busca el cliente existente y registra una nueva oportunidad; si pertenece a otra red, solicita revisión comercial.",
          });
        }
        clientData = updatedInsertClientSchema.parse({
          tenantId,
          brokerId,
          createdBy: userId,
          type: lead.clientType,
          businessName: lead.clientType === 'persona_moral' ? lead.businessName : null,
          firstName: lead.firstName || '',
          lastName: lead.lastName || '',
          phone: lead.phone,
          email: lead.email,
          rfc: lead.rfc ? lead.rfc.toUpperCase() : null,
          state: lead.state || null,
          originOpportunity: 'arrendamiento',
          // Información financiera voluntaria; no se requiere para solicitar cotización.
          ingresoMensualPromedio: lead.monthlyRevenue != null ? String(lead.monthlyRevenue) : null,
          yearsInBusiness: lead.yearsInBusiness ?? null,
        });
      }

      const templates = await storage.getProductTemplates();
      const template = templates.find((t: any) =>
        t.isActive !== false && (t.category === 'arrendamiento' || t.baseConfiguration?.catalog_family === 'arrendamiento'));
      if (!template) {
        return res.status(409).json({ code: 'LEASING_TEMPLATE_UNAVAILABLE', message: "La familia Arrendamiento no está disponible en el catálogo activo." });
      }

      const totalAssetValue = lead.unitValue * lead.quantity;
      const leaseData = {
        tipo_activo_arrendado: lead.assetType,
        tipo_activo_descripcion: lead.assetDescription || null,
        marca: lead.brand || null,
        modelo: lead.model || null,
        version_vehiculo: lead.version || null,
        anio: lead.year ?? null,
        cantidad: lead.quantity,
        valor_unitario_mxn: lead.unitValue,
        valor_total_estimado_mxn: totalAssetValue,
        modalidad_arrendamiento: lead.leaseModality === 'por_definir' ? null : lead.leaseModality,
        plazo_deseado_meses: lead.preferredTermMonths ?? null,
        aportacion_inicial_mxn: lead.initialContribution ?? null,
        estado_operacion: lead.state || null,
        ingresos_mensuales_estimados_mxn: lead.monthlyRevenue ?? null,
        antiguedad_negocio_anios: lead.yearsInBusiness ?? null,
      };
      const submissionData = insertCreditSubmissionRequestSchema.omit({ clientId: true }).parse({
        tenantId,
        brokerId,
        createdBy: userId,
        productTemplateId: template.id,
        // Required legacy numeric column is the total estimated asset value, not a loan approval.
        requestedAmount: String(totalAssetValue),
        purpose: 'Cotización de Arrendamiento: ' + (lead.assetType === 'vehiculo'
          ? [lead.brand, lead.model, lead.version, lead.year].filter(Boolean).join(' ')
          : lead.assetDescription),
        brokerNotes: lead.brokerNotes || null,
        mortgageData: { operationType: 'arrendamiento', lease: leaseData },
        status: 'pending_admin',
      });
      const { client, submission } = await storage.createMortgageLeadTransactional({
        clientData,
        clientId: lead.clientId,
        submissionData,
        financialInstitutionIds: [],
      });

      // La oportunidad no implica aprobación crediticia, cotización en firme o envío a financiera.
      try {
        const admins = (await storage.getAllUsers()).filter(u => u.role === 'admin' || u.role === 'super_admin');
        for (const admin of admins) {
          const notification = await storage.createNotification({
            userId: admin.id,
            type: 'credit_submission_created',
            title: 'Nueva solicitud de cotización de arrendamiento',
            message: 'Arrendamiento de ' + (lead.assetDescription || [lead.brand, lead.model].filter(Boolean).join(' ')) +
              ' registrado para revisión interna. Valor estimado en MXN: ' + totalAssetValue.toLocaleString('es-MX') + '.',
            relatedEntityType: 'credit_submission',
            relatedEntityId: submission.id,
            priority: 'normal',
          });
          broadcastToUser(admin.id, { type: 'notification', notification });
        }
      } catch (notifyErr) {
        console.error('Leasing lead notification error:', notifyErr);
      }
      return res.status(201).json({
        client, submission, targets: [],
        message: "Solicitud de cotización de arrendamiento registrada para revisión interna, sin envío a financieras.",
      });
    } catch (error: any) {
      console.error('Error creating leasing lead:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Datos del prospecto inválidos", errors: error.flatten() });
      }
      return res.status(500).json({ message: "No fue posible guardar la solicitud de arrendamiento." });
    }
  });

  // POST /api/credit-submissions/:id/targets - Select institution targets internally (NOT external disclosure)
  app.post('/api/credit-submissions/:id/targets', isAuthenticated, requireModuleAndAction('creditos', 'submit_proposals'), async (req: any, res) => {
    try {
      const { id } = req.params;
      const { financialInstitutionIds } = req.body;

      if (!Array.isArray(financialInstitutionIds) || financialInstitutionIds.length === 0) {
        return res.status(400).json({ message: "Debes seleccionar al menos una institución financiera para preparar la solicitud" });
      }

      const submission = await storage.getCreditSubmissionRequest(id);
      if (!submission) {
        return res.status(404).json({ message: "Solicitud de crédito no encontrada" });
      }

      const callerUser = (req as any).dbUser || (await storage.getUser(req.user?.claims?.sub || req.user?.id));
      // This modifies a specific historical opportunity, not a generic tenant
      // resource. Changing a broker's network cannot grant the new master
      // rights to channel prior submissions; non-owners are rejected BEFORE
      // querying commercial/formalization details of the originator.
      if (!canReadCreditSubmission(callerUser, submission)) {
        return res.status(403).json({
          code: "SUBMISSION_NOT_AUTHORIZED",
          message: "No tienes permiso para modificar las financieras seleccionadas en esta solicitud.",
        });
      }
      const formalizationCheck = await validateEffectiveBrokerFormalization(
        {
          callerUser,
          effectiveBrokerId: submission.brokerId,
        },
        storage
      );

      if (!formalizationCheck.allowed) {
        return res.status(formalizationCheck.statusCode || 403).json({
          code: formalizationCheck.code,
          message: formalizationCheck.message,
        });
      }

      const existingTargets = await storage.getCreditSubmissionTargets({ requestId: id });
      const existingInstIds = new Set(existingTargets.map(t => t.financialInstitutionId));

      const newTargets = [];
      for (const institutionId of financialInstitutionIds) {
        if (!existingInstIds.has(institutionId)) {
          const target = await storage.createCreditSubmissionTarget({
            requestId: id,
            financialInstitutionId: institutionId,
            status: 'pending_admin',
          });
          newTargets.push(target);
        }
      }

      res.status(201).json({
        message: `${newTargets.length} financiera(s) agregadas para revisión interna; no se compartió el expediente`,
        targets: newTargets,
      });
    } catch (error: any) {
      console.error("Error channeling submission:", error);
      res.status(500).json({ message: "Error al registrar financieras para revisión" });
    }
  });

  // Get credit submission targets
  app.get('/api/credit-submission-targets', isAuthenticated, requireAnyModule('aprobaciones', 'creditos'), requireAction('view'), async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const filters: { requestId?: string; status?: string; financialInstitutionId?: string } = {};
      
      if (req.query.requestId) filters.requestId = req.query.requestId as string;
      if (req.query.status) filters.status = req.query.status as string;
      if (req.query.financialInstitutionId) filters.financialInstitutionId = req.query.financialInstitutionId as string;

      const targets = await storage.getCreditSubmissionTargets(filters);
      
      // Enrich targets with request, broker, master broker, and client information
      const enrichedTargets = await Promise.all(targets.map(enrichCreditSubmissionTarget));

      const filteredTargets = enrichedTargets
        .filter((t: any) => canReadCreditSubmission(user, t.request))
        .map((t: any) => projectSubmissionTarget(t, user.role));
      res.json(filteredTargets);
    } catch (error) {
      console.error("Error fetching credit submission targets:", error);
      res.status(500).json({ message: "Failed to fetch credit submission targets" });
    }
  });

  // Approve credit submission target - Admins only
  app.patch('/api/credit-submission-targets/:id/approve', isAuthenticated, requireModuleAndAction('aprobaciones', 'edit'), async (req: any, res) => {
    try {
      const { id } = req.params;
      const { adminNotes, details } = req.body;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      // Only admins can approve
      if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
        return res.status(403).json({ message: "Only admins can approve submissions" });
      }

      const rawTarget = await storage.approveCreditSubmissionTarget(id, userId, adminNotes, details);
      
      if (!rawTarget) {
        return res.status(404).json({ message: "Credit submission target not found" });
      }

      // Notify broker (and master_broker if applicable)
      try {
        const request = await storage.getCreditSubmissionRequest(rawTarget.requestId);
        if (request) {
          const notification = await storage.createNotification({
            userId: request.brokerId,
            type: 'submission_update',
            title: 'Solicitud con Visto Bueno del administrador',
            message: adminNotes || 'Tu solicitud recibió visto bueno interno y está lista para gestión comercial.',
            relatedEntityType: 'credit_submission_target',
            relatedEntityId: rawTarget.id,
            priority: 'high',
          });
          broadcastToUser(request.brokerId, { type: 'notification', notification });
          if (request.originMasterBrokerId) {
            const mbNotif = await storage.createNotification({
              userId: request.originMasterBrokerId,
              type: 'submission_update',
              title: 'Solicitud de tu red con Visto Bueno',
              message: `La solicitud de un broker de tu red recibió Visto Bueno interno para continuar su gestión.`,
              relatedEntityType: 'credit_submission_target',
              relatedEntityId: rawTarget.id,
              priority: 'medium',
            });
            broadcastToUser(request.originMasterBrokerId, { type: 'notification', notification: mbNotif });
          }
        }
      } catch (notifError) {
        console.error("[NOTIF] Error sending approve notification:", notifError);
      }

      const target = await enrichCreditSubmissionTarget(rawTarget);
      res.json(projectSubmissionTarget(target, user.role));
    } catch (error) {
      if (error instanceof Error && error.message === "TARGET_ALREADY_SELECTED") {
        return res.status(409).json({
          code: "TARGET_ALREADY_SELECTED",
          message: "Esta propuesta ya fue seleccionada o tiene un crédito vinculado.",
        });
      }
      console.error("Error approving credit submission target:", error);
      res.status(500).json({ message: "Failed to approve credit submission target" });
    }
  });

  // Reject credit submission target - Admins only (for institution rejections)
  app.patch('/api/credit-submission-targets/:id/reject', isAuthenticated, requireModuleAndAction('aprobaciones', 'edit'), async (req: any, res) => {
    try {
      const { id } = req.params;
      const { adminNotes } = req.body;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      // Only admins can reject
      if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
        return res.status(403).json({ message: "Only admins can reject submissions" });
      }

      const rawTarget = await storage.rejectCreditSubmissionTarget(id, userId, adminNotes);
      
      if (!rawTarget) {
        return res.status(404).json({ message: "Credit submission target not found" });
      }

      // Notify broker (and master_broker if applicable)
      try {
        const request = await storage.getCreditSubmissionRequest(rawTarget.requestId);
        if (request) {
          const notification = await storage.createNotification({
            userId: request.brokerId,
            type: 'submission_update',
            title: 'Solicitud rechazada por el administrador',
            message: adminNotes || 'Tu solicitud fue rechazada.',
            relatedEntityType: 'credit_submission_target',
            relatedEntityId: rawTarget.id,
            priority: 'high',
          });
          broadcastToUser(request.brokerId, { type: 'notification', notification });
          if (request.originMasterBrokerId) {
            const mbNotif = await storage.createNotification({
              userId: request.originMasterBrokerId,
              type: 'submission_update',
              title: 'Solicitud de tu red rechazada',
              message: `La solicitud de un broker de tu red fue rechazada.`,
              relatedEntityType: 'credit_submission_target',
              relatedEntityId: rawTarget.id,
              priority: 'medium',
            });
            broadcastToUser(request.originMasterBrokerId, { type: 'notification', notification: mbNotif });
          }
        }
      } catch (notifError) {
        console.error("[NOTIF] Error sending reject notification:", notifError);
      }

      const target = await enrichCreditSubmissionTarget(rawTarget);
      res.json(projectSubmissionTarget(target, user.role));
    } catch (error) {
      if (error instanceof Error && error.message === "TARGET_ALREADY_SELECTED") {
        return res.status(409).json({
          code: "TARGET_ALREADY_SELECTED",
          message: "Esta propuesta ya fue seleccionada o tiene un crédito vinculado.",
        });
      }
      console.error("Error rejecting credit submission target:", error);
      res.status(500).json({ message: "Failed to reject credit submission target" });
    }
  });

  // Return credit submission target to broker - Admins only
  app.patch('/api/credit-submission-targets/:id/return-to-broker', isAuthenticated, requireModuleAndAction('aprobaciones', 'edit'), async (req: any, res) => {
    try {
      const { id } = req.params;
      const { adminNotes, details } = req.body;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      // Only admins can return to broker
      if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
        return res.status(403).json({ message: "Only admins can return submissions to broker" });
      }

      const rawTarget = await storage.returnCreditSubmissionTargetToBroker(id, userId, details, adminNotes);
      
      if (!rawTarget) {
        return res.status(404).json({ message: "Credit submission target not found" });
      }

      // Notify broker (and master_broker if applicable)
      try {
        const request = await storage.getCreditSubmissionRequest(rawTarget.requestId);
        if (request) {
          const returnMsg = details || adminNotes || 'El administrador devolvió tu solicitud para correcciones.';
          const notification = await storage.createNotification({
            userId: request.brokerId,
            type: 'submission_update',
            title: 'Solicitud devuelta para revisión',
            message: returnMsg,
            relatedEntityType: 'credit_submission_target',
            relatedEntityId: rawTarget.id,
            priority: 'high',
          });
          broadcastToUser(request.brokerId, { type: 'notification', notification });
          if (request.originMasterBrokerId) {
            const mbNotif = await storage.createNotification({
              userId: request.originMasterBrokerId,
              type: 'submission_update',
              title: 'Solicitud de tu red devuelta al broker',
              message: `Una solicitud de tu red fue devuelta al broker para correcciones.`,
              relatedEntityType: 'credit_submission_target',
              relatedEntityId: rawTarget.id,
              priority: 'medium',
            });
            broadcastToUser(request.originMasterBrokerId, { type: 'notification', notification: mbNotif });
          }
        }
      } catch (notifError) {
        console.error("[NOTIF] Error sending return-to-broker notification:", notifError);
      }

      const target = await enrichCreditSubmissionTarget(rawTarget);
      res.json(projectSubmissionTarget(target, user.role));
    } catch (error) {
      if (error instanceof Error && error.message === "TARGET_ALREADY_SELECTED") {
        return res.status(409).json({
          code: "TARGET_ALREADY_SELECTED",
          message: "Esta propuesta ya fue seleccionada o tiene un crédito vinculado.",
        });
      }
      console.error("Error returning credit submission target to broker:", error);
      res.status(500).json({ message: "Failed to return credit submission target to broker" });
    }
  });

  // LEG-10: client consent is requested only from the client's stored email,
  // never from user-supplied request body, and only for an owned exact target.
  app.post('/api/credit-submission-targets/:id/request-client-consent',
    isAuthenticated, requireModuleAndAction('creditos','view'), async (req:any,res) => {
      try {
        const currentId=req.user?.claims?.sub||req.user?.id;
        const caller=currentId?await storage.getUser(currentId):null;
        const target=await storage.getCreditSubmissionTarget(req.params.id);
        if(!caller||!target) return res.status(404).json({message:"Solicitud no encontrada."});
        const submission=await storage.getCreditSubmissionRequest(target.requestId);
        if(!canReadCreditSubmission(caller,submission))
          return res.status(403).json({message:"No tienes acceso a esta solicitud."});
        if(target.isWinner||target.creditId||
           ['sent','selected_winner','dispersed','cancelled'].includes(target.status))
          return res.status(409).json({message:"Esta propuesta ya no permite iniciar una autorización."});
        const client=submission?await storage.getClient(submission.clientId):null;
        const institution=await storage.getFinancialInstitution(target.financialInstitutionId);
        if(!client||!institution) return res.status(409).json({message:"Cliente o financiera no disponible."});
        if(!client.tenantId || (submission?.tenantId && client.tenantId!==submission.tenantId))
          return res.status(409).json({message:"La relación de cliente y organización debe validarse antes de solicitar autorización."});
        const representative=client.legalRepresentative && typeof client.legalRepresentative==='object' &&
          !Array.isArray(client.legalRepresentative)?client.legalRepresentative as any:null;
        const isCompany=client.type==='persona_moral';
        const signerName=isCompany
          ? String(representative?.name||'').trim()
          : [client.firstName,client.lastName].filter(Boolean).join(' ').trim();
        const signerEmail=isCompany
          ? String(representative?.email||'').trim()
          : String(client.email||'').trim();
        if(!signerName||!signerEmail) return res.status(409).json({
          code:"CLIENT_SIGNER_MISSING",
          message:isCompany
            ?"Registra nombre y correo del representante legal del cliente antes de solicitar su autorización."
            :"Registra nombre y correo del cliente antes de solicitar su autorización.",
        });
        if(signerEmail.toLowerCase()===String(caller.email||'').toLowerCase())
          return res.status(409).json({code:"CLIENT_SIGNER_NOT_INDEPENDENT",
            message:"La autorización debe enviarse al cliente, no al correo del usuario solicitante."});
        const challenge=await startClientConsent({
          tenantId:client.tenantId,clientId:client.id,targetId:target.id,
          institutionId:institution.id,institutionName:institution.name||"Financiera",
          clientName:isCompany?client.businessName||"Empresa":signerName,
          signerName,signerEmail,
          signerCapacity:isCompany?"legal_representative":"client",requestedBy:currentId,
        });
        const email=await sendClientConsentLinkEmail({
          to:signerEmail,signerName,institutionName:institution.name||"Financiera",token:challenge.token,
        });
        if(!email.success) {
          await invalidateConsentRequest(challenge.id);
          return res.status(502).json({code:"CLIENT_CONSENT_EMAIL_FAILED",
            message:"No se pudo enviar la solicitud de autorización al correo del cliente."});
        }
        return res.json({success:true,challengeId:challenge.id,
          message:"Solicitud enviada al correo registrado del cliente; todavía no se compartió ningún expediente."});
      } catch(e:any) {
        if(e instanceof ClientConsentError) return res.status(e.status).json({code:e.code,message:e.message});
        console.error("LEG10 request consent failed:",e?.message||e);
        return res.status(503).json({code:"CLIENT_CONSENT_UNAVAILABLE",
          message:"No se pudo preparar la autorización. El expediente no fue enviado."});
      }
    });

  app.get('/api/credit-submission-targets/:id/client-consent-status',
    isAuthenticated,requireModuleAndAction('creditos','view'),async(req:any,res)=>{
      try {
        const currentId=req.user?.claims?.sub||req.user?.id;
        const caller=currentId?await storage.getUser(currentId):null;
        const target=await storage.getCreditSubmissionTarget(req.params.id);
        const submission=target?await storage.getCreditSubmissionRequest(target.requestId):null;
        if(!caller||!target||!submission) return res.status(404).json({message:"No encontrado."});
        if(!canReadCreditSubmission(caller,submission))
          return res.status(403).json({message:"Sin acceso."});
        const client=await storage.getClient(submission.clientId);
        const authorized=await hasValidClientConsent({
          tenantId:client?.tenantId||'',clientId:submission.clientId,targetId:target.id,
          institutionId:target.financialInstitutionId,
        });
        return res.json({authorized,
          message:authorized?"Cliente autorizado para esta financiera.":"Autorización del cliente pendiente o no validada."});
      } catch { return res.status(503).json({message:"No disponible."}); }
    });

  // LEG-10: give Super Admin a way to actually review the independent client
  // signature and choose a previously uploaded client representation document.
  // Do not return secret links, codes, request IP or full sensitive snapshot.
  app.get('/api/credit-submission-targets/:id/client-consent-evidence',
    isAuthenticated, requireModuleAndAction('aprobaciones','view'), async(req:any,res)=>{
      try {
        const reviewerId=req.user?.claims?.sub||req.user?.id;
        const reviewer=reviewerId?await storage.getUser(reviewerId):null;
        if(!reviewer || reviewer.role!=='super_admin')
          return res.status(403).json({message:"Revisión reservada a Super Admin."});
        const target=await storage.getCreditSubmissionTarget(req.params.id);
        const submission=target?await storage.getCreditSubmissionRequest(target.requestId):null;
        const client=submission?await storage.getClient(submission.clientId):null;
        if(!target||!submission||!client)
          return res.status(404).json({message:"Solicitud no encontrada."});
        const evidence=await listClientConsentEvidenceForTarget({
          tenantId:client.tenantId||'',clientId:client.id,targetId:target.id,
          institutionId:target.financialInstitutionId,
        });
        const documents=(await storage.getDocuments({clientId:client.id})).filter((doc:any)=>
          !doc.tenantId || doc.tenantId===client.tenantId
        ).map((doc:any)=>({
          id:doc.id,fileName:doc.fileName,type:doc.type,isValid:doc.isValid,
          uploadedAt:doc.uploadedAt,
        }));
        return res.json({evidence,documents});
      }catch(e:any){
        if(e instanceof ClientConsentError)
          return res.status(e.status).json({code:e.code,message:e.message});
        console.error("LEG10 evidence review unavailable:",e?.message||"unknown");
        return res.status(503).json({message:"No se pudo consultar evidencia de autorización."});
      }
    });

  app.post('/api/credit-submission-targets/:id/verify-client-representative',
    isAuthenticated,requireModuleAndAction('aprobaciones','edit'),async(req:any,res)=>{
      try {
        const reviewerId=req.user?.claims?.sub||req.user?.id;
        const reviewer=reviewerId?await storage.getUser(reviewerId):null;
        if(!reviewer||reviewer.role!=='super_admin')
          return res.status(403).json({message:"La revisión de facultades corresponde a Super Admin."});
        const target=await storage.getCreditSubmissionTarget(req.params.id);
        const submission=target?await storage.getCreditSubmissionRequest(target.requestId):null;
        if(!target||!submission) return res.status(404).json({message:"Solicitud no encontrada."});
        const output=await verifyCompanySignerAuthority({
          targetId:target.id,clientId:submission.clientId,
          evidenceId:String(req.body?.evidenceId||""),
          documentId:String(req.body?.documentId||""),
          notes:String(req.body?.notes||""),reviewedBy:reviewerId,
        });
        return res.json(output);
      }catch(e:any){
        if(e instanceof ClientConsentError) return res.status(e.status).json({code:e.code,message:e.message});
        if(e?.code==='23505') return res.status(409).json({message:"Esta evidencia ya tiene una revisión registrada."});
        console.error("LEG10 review failed:",e?.message||e);
        return res.status(503).json({message:"No se pudo registrar la revisión del representante."});
      }
    });

  // 1. Generate PDF for credit submission target
  app.post('/api/credit-submission-targets/:id/generate-pdf', isAuthenticated, requireModuleAndAction('creditos', 'view'), async (req: any, res) => {
    try {
      const { id } = req.params;
      const rawTarget = await storage.getCreditSubmissionTarget(id);
      
      if (!rawTarget) {
        return res.status(404).json({ message: "Credit submission target not found" });
      }

      const userId = req.user?.claims?.sub || req.user?.id;
      const user = userId ? await storage.getUser(userId) : null;
      const submission = await storage.getCreditSubmissionRequest(rawTarget.requestId);
      if (!canReadCreditSubmission(user, submission)) {
        return res.status(403).json({ message: "Access denied" });
      }
      // LEG-10: This PDF contains client identifiers and financial purpose.
      // It is an exportable institution-target package, not merely an
      // in-app draft. Deny before piping any PDF bytes to the response.
      const pdfClient = submission ? await storage.getClient(submission.clientId) : null;
      const pdfConsent = await authorizeClientSensitiveDisclosure({
        clientId: submission?.clientId,
        tenantId: submission?.tenantId || pdfClient?.tenantId || null,
        targetId: rawTarget.id,
        recipientInstitutionId: rawTarget.financialInstitutionId,
        purpose: "financial_institution_pdf_export",
      });
      if (!pdfConsent.authorized) return res.status(409).json(pdfConsent);
      // Limit broker-facing PDFs to contextual information; never render admin-only notes.
      const target = projectSubmissionTarget(await enrichCreditSubmissionTarget(rawTarget), user?.role);

      const doc = new PDFDocument({ margin: 50 });
      
      // Build fully in memory first. A revocation may occur while a complex
      // PDF is rendering; do not stream even a header until the FINAL gate.
      const chunks: Buffer[] = [];
      const pdfReady = new Promise<Buffer>((resolve,reject)=>{
        doc.on('data',(chunk:Buffer)=>chunks.push(chunk));
        doc.once('end',()=>resolve(Buffer.concat(chunks)));
        doc.once('error',reject);
      });
      
      // Header con logo placeholder y título
      doc.fontSize(24).fillColor('#1e40af').text('SOLICITUD DE CRÉDITO', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor('#6b7280').text('Sistema de Gestión de Créditos para Brokers', { align: 'center' });
      doc.moveDown(1.5);
      
      // Línea separadora
      doc.strokeColor('#1e40af').lineWidth(2).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(1);
      
      // Información de referencia
      doc.fillColor('#000000').fontSize(10);
      const folio = target.requestId ? target.requestId.substring(0, 8).toUpperCase() : id.substring(0, 8).toUpperCase();
      doc.text(`Folio: ${folio}`, 50, doc.y);
      doc.text(`Fecha: ${new Date().toLocaleDateString('es-MX')}`, 400, doc.y - 12, { align: 'right' });
      doc.text(`Financiera: ${target.institution?.name || 'N/A'}`, 50, doc.y + 5);
      doc.moveDown(2);
      
      if (target.request) {
        const client = target.request.client || target.client;
        
        // Sección Cliente
        doc.fontSize(14).fillColor('#1e40af').text('DATOS DEL CLIENTE', { underline: true });
        doc.moveDown(0.5);
        
        if (client) {
          doc.fontSize(10).fillColor('#000000');
          const clientName = client.businessName || `${client.firstName || ''} ${client.lastName || ''}`.trim() || 'N/A';
          const clientData = [
            ['Nombre Completo / Razón Social', clientName],
            ['Tipo de Cliente', client.type === 'persona_moral' ? 'Persona Moral' : 
                             client.type === 'fisica' ? 'Persona Física' : 
                             client.type === 'fisica_empresarial' ? 'PFAE' : 
                             client.type === 'sin_sat' ? 'Sin SAT' : client.type || 'N/A'],
            ['RFC', client.rfc || 'N/A'],
            ['Email', client.email || 'N/A'],
            ['Teléfono', client.phone || 'N/A']
          ];
          
          clientData.forEach(([label, value]) => {
            doc.fillColor('#4b5563').text(label + ':', 70, doc.y);
            doc.fillColor('#000000').text(String(value || 'N/A'), 240, doc.y - 12);
            doc.moveDown(0.8);
          });
        }
        
        doc.moveDown(1);
        
        // Sección Solicitud
        doc.fontSize(14).fillColor('#1e40af').text('DETALLES DE LA SOLICITUD', { underline: true });
        doc.moveDown(0.5);
        doc.fontSize(10).fillColor('#000000');
        
        const reqAmount = target.request.requestedAmount ? parseFloat(String(target.request.requestedAmount)) : 0;
        const formattedAmount = isNaN(reqAmount) ? '$0.00 MXN' : `$${reqAmount.toLocaleString('es-MX')} MXN`;
        const productName = target.request.productTemplate?.name || target.productTemplate?.name || 'N/A';

        const requestData = [
          ['Monto Solicitado', formattedAmount],
          ['Producto', productName],
          ['Propósito', target.request.purpose || 'N/A']
        ];
        
        requestData.forEach(([label, value]) => {
          doc.fillColor('#4b5563').text(label + ':', 70, doc.y);
          doc.fillColor('#000000').text(String(value || 'N/A'), 240, doc.y - 12);
          doc.moveDown(0.8);
        });
        
        doc.moveDown(1);
        
        // Sección Broker
        const broker = target.request.broker || target.broker;
        if (broker) {
          doc.fontSize(14).fillColor('#1e40af').text('INFORMACIÓN DEL BROKER', { underline: true });
          doc.moveDown(0.5);
          doc.fontSize(10).fillColor('#000000');
          
          const brokerData = [
            ['Nombre', `${broker.firstName || ''} ${broker.lastName || ''}`.trim() || 'N/A'],
            ['Email', broker.email || 'N/A']
          ];
          
          brokerData.forEach(([label, value]) => {
            doc.fillColor('#4b5563').text(label + ':', 70, doc.y);
            doc.fillColor('#000000').text(String(value || 'N/A'), 240, doc.y - 12);
            doc.moveDown(0.8);
          });
          
          doc.moveDown(1);
        }
        
        // Notas importantes
        if (target.adminNotes) {
          doc.fontSize(14).fillColor('#1e40af').text('DETALLES IMPORTANTES', { underline: true });
          doc.moveDown(0.5);
          doc.fontSize(10).fillColor('#000000');
          doc.text(String(target.adminNotes), { align: 'justify' });
          doc.moveDown(1);
        }
        
        if (target.request.brokerNotes) {
          doc.fontSize(14).fillColor('#1e40af').text('NOTAS DEL BROKER', { underline: true });
          doc.moveDown(0.5);
          doc.fontSize(10).fillColor('#000000');
          doc.text(String(target.request.brokerNotes), { align: 'justify' });
        }
      }
      
      // Footer
      doc.fontSize(8).fillColor('#9ca3af')
        .text(`Generado el ${new Date().toLocaleString('es-MX')}`, 50, 750, { align: 'center' });
      
      doc.end();
      const pdfBytes=await pdfReady;
      await withAuthorizedClientPdfDisclosure({
        tenantId:submission?.tenantId || pdfClient?.tenantId || '',
        clientId:submission?.clientId || '',
        targetId:rawTarget.id,
        institutionId:rawTarget.financialInstitutionId,
      },async()=>{
        // Keep the target lock until the complete PDF has been handed to the
        // response stream. A disconnect rolls back and releases the lock.
        if(res.destroyed) throw new Error("PDF_CLIENT_DISCONNECTED");
        res.setHeader('Content-Type','application/pdf');
        res.setHeader('Cache-Control','private, no-store');
        res.setHeader('Content-Disposition',`attachment; filename=solicitud-${id}.pdf`);
        await new Promise<void>((resolve,reject)=>{
          const cleanup=()=>{
            res.off('finish',finished);
            res.off('close',closed);
            res.off('error',failed);
          };
          const finished=()=>{cleanup();resolve();};
          const closed=()=>{cleanup();reject(new Error("PDF_CLIENT_DISCONNECTED"));};
          const failed=(e:Error)=>{cleanup();reject(e);};
          res.once('finish',finished);
          res.once('close',closed);
          res.once('error',failed);
          try{res.end(pdfBytes);}catch(e){cleanup();reject(e);}
        });
      });
    } catch (error) {
      if(error instanceof ClientConsentError){
        if(!res.headersSent) return res.status(error.status).json({code:error.code,message:error.message});
        return;
      }
      console.error("Error generating PDF:", error);
      if (!res.headersSent) {
        res.status(500).json({ message: "Failed to generate PDF" });
      }
    }
  });

  // MVP: record outreach coordination only; do NOT release client data/files.
  app.patch('/api/credit-submission-targets/:id/start-commercial-contact',
    isAuthenticated,requireModuleAndAction('aprobaciones','edit'),async(req:any,res)=>{
      try{
        const userId=req.user?.claims?.sub||req.user?.id;
        const user=userId?await storage.getUser(userId):null;
        if(!user||!['admin','super_admin'].includes(user.role))
          return res.status(403).json({code:'CONTACT_ADMIN_ONLY',message:'Solo Administración puede iniciar esta gestión.'});
        const result=await startInternalCommercialContact({
          targetId:String(req.params.id),reviewedBy:userId,
        });
        const updated=await storage.getCreditSubmissionTarget(String(req.params.id));
        if(!updated) return res.status(503).json({message:'No se pudo recuperar el estado de la gestión.'});
        return res.json({target:projectSubmissionTarget(await enrichCreditSubmissionTarget(updated),user.role),
          alreadyStarted:result.alreadyStarted,
          message:'Gestión comercial interna iniciada. No se envió expediente ni documentación.'});
      }catch(error){
        if(error instanceof CommercialContactError)
          return res.status(error.status).json({code:error.code,message:error.message});
        console.error('[COMMERCIAL-CONTACT] Internal status update failed:',error);
        return res.status(503).json({message:'No se pudo iniciar la gestión comercial.'});
      }
    });

  // 2. Mark submission target as sent - Admins only
  app.patch('/api/credit-submission-targets/:id/mark-sent', isAuthenticated, requireModuleAndAction('aprobaciones', 'edit'), async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
        return res.status(403).json({ message: "Only admins can mark as sent" });
      }

      // Get the target to find the associated submission
      const existingTarget = await storage.getCreditSubmissionTarget(id);
      if (!existingTarget) {
        return res.status(404).json({ message: "Credit submission target not found" });
      }
      // Preserve the historical TARGET_ALREADY_SELECTED refusal before the
      // consent gate; a final/winning target cannot be reopened either way.
      if (existingTarget.isWinner || existingTarget.creditId ||
          ["selected_winner", "dispersed"].includes(existingTarget.status)) {
        return res.status(409).json({
          code: "TARGET_ALREADY_SELECTED",
          message: "Esta propuesta ya fue seleccionada o tiene un crédito vinculado.",
        });
      }
      const sendRequest = await storage.getCreditSubmissionRequest(existingTarget.requestId);
      if (!sendRequest) {
        return res.status(404).json({ message: "Credit submission request not found" });
      }
      const sendClient = await storage.getClient(sendRequest.clientId);
      const disclosureConsent = await authorizeClientSensitiveDisclosure({
        clientId: sendRequest.clientId,
        tenantId: sendRequest.tenantId || sendClient?.tenantId || null,
        targetId: existingTarget.id,
        recipientInstitutionId: existingTarget.financialInstitutionId,
        purpose: "financial_institution_submission",
      });
      if (!disclosureConsent.authorized) return res.status(409).json(disclosureConsent);

      // Consent must be rechecked and both statuses changed in one transaction,
      // serialized with revocation. The earlier check alone is not sufficient.
      await markTargetSentWithClientConsent({
        targetId:id,requestId:existingTarget.requestId,
        clientId:sendRequest.clientId,
        tenantId:sendRequest.tenantId || sendClient?.tenantId || '',
        institutionId:existingTarget.financialInstitutionId,reviewedBy:userId,
      });
      const rawTarget = await storage.getCreditSubmissionTarget(id);
      if (!rawTarget) return res.status(503).json({message:"Estado del envío temporalmente no disponible."});
      const target = await enrichCreditSubmissionTarget(rawTarget);
      res.json(projectSubmissionTarget(target, user.role));
    } catch (error) {
      if (error instanceof Error && error.message === "TARGET_ALREADY_SELECTED") {
        return res.status(409).json({
          code: "TARGET_ALREADY_SELECTED",
          message: "Esta propuesta ya fue seleccionada o tiene un crédito vinculado.",
        });
      }
      if (error instanceof ClientConsentError)
        return res.status(error.status).json({code:error.code,message:error.message});
      console.error("Error marking as sent:", error);
      res.status(500).json({ message: "Failed to mark as sent" });
    }
  });

  // 3. Upload proposal document
  app.post('/api/credit-submission-targets/:id/upload-proposal', isAuthenticated, requireModuleAndAction('aprobaciones', 'edit'), upload.single('proposalDocument'), async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
        return res.status(403).json({ message: "Only admins can upload proposals" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const rawTarget = await storage.updateCreditSubmissionTarget(id, {
        proposalDocument: req.file.path,
      });
      
      if (!rawTarget) {
        return res.status(404).json({ message: "Credit submission target not found" });
      }

      const target = await enrichCreditSubmissionTarget(rawTarget);
      res.json(projectSubmissionTarget(target, user.role));
    } catch (error) {
      console.error("Error uploading proposal:", error);
      res.status(500).json({ message: "Failed to upload proposal" });
    }
  });

  // 3b. Serve proposal document safely
  app.get('/api/credit-submission-targets/:id/proposal-document', isAuthenticated, requireModuleAndAction('creditos', 'view'), async (req: any, res) => {
    try {
      const { id } = req.params;
      const target = await storage.getCreditSubmissionTarget(id);
      if (!target || !target.proposalDocument) {
        return res.status(404).json({ message: "No se encontró el documento de propuesta" });
      }
      const userId = req.user?.claims?.sub;
      const user = userId ? await storage.getUser(userId) : null;
      const parent = await storage.getCreditSubmissionRequest(target.requestId);
      if (!canReadCreditSubmission(user, parent)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const filePath = path.resolve(target.proposalDocument);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ message: "Archivo de propuesta no encontrado en el servidor" });
      }

      const ext = path.extname(filePath).toLowerCase();
      let contentType = 'application/octet-stream';
      if (ext === '.pdf') contentType = 'application/pdf';
      else if (ext === '.png') contentType = 'image/png';
      else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
      else if (ext === '.doc') contentType = 'application/msword';
      else if (ext === '.docx') contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `inline; filename="propuesta-${id}${ext || '.pdf'}"`);
      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);
    } catch (error) {
      console.error("Error serving proposal document:", error);
      res.status(500).json({ message: "Error al cargar documento de propuesta" });
    }
  });

  // 4. Save institution proposal - Admins only
  app.post('/api/credit-submission-targets/:id/institution-proposal', isAuthenticated, requireModuleAndAction('aprobaciones', 'edit'), async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
        return res.status(403).json({ message: "Only admins can save institution proposals" });
      }

      const proposalSchema = z.object({
        approvedAmount: z.number(),
        interestRate: z.number(),
        term: z.number(),
        openingCommission: z.number().optional(),
        institutionProductId: z.string().trim().min(1).optional(),
        offerId: z.string().trim().min(1).optional(),
        versionNumber: z.number().int().positive().optional(),
      });

      const targetBefore = await storage.getCreditSubmissionTarget(id);
      if (!targetBefore) return res.status(404).json({ message: "Credit submission target not found" });
      if (targetBefore.isWinner || targetBefore.creditId ||
          ["selected_winner", "dispersed"].includes(targetBefore.status)) {
        return res.status(409).json({ code: "PROPOSAL_LOCKED", message: "La propuesta ya está seleccionada o vinculada a un crédito." });
      }
      if (!["contact_initiated", "sent", "institution_approved"].includes(targetBefore.status)) {
        return res.status(409).json({
          code: "PROPOSAL_REQUIRES_COMMERCIAL_CONTACT",
          message: "Primero debe aprobarse el destino e iniciarse la gestión comercial.",
        });
      }
      const proposal = await validateTargetOfferVersion(targetBefore, proposalSchema.parse(req.body));

      const rawTarget = await storage.updateCreditSubmissionTarget(id, {
        institutionProposal: proposal,
        status: 'institution_approved',
        proposalReceivedAt: new Date(),
      });
      
      if (!rawTarget) {
        return res.status(404).json({ message: "Credit submission target not found" });
      }

      // Notify broker (and master_broker if applicable)
      try {
        const request = await storage.getCreditSubmissionRequest(rawTarget.requestId);
        if (request) {
          const notification = await storage.createNotification({
            userId: request.brokerId,
            type: 'submission_update',
            title: 'Propuesta de institución recibida',
            message: `Monto aprobado: $${proposal.approvedAmount.toLocaleString('es-MX')} a ${proposal.interestRate}% en ${proposal.term} meses.`,
            relatedEntityType: 'credit_submission_target',
            relatedEntityId: rawTarget.id,
            priority: 'high',
          });
          broadcastToUser(request.brokerId, { type: 'notification', notification });
          if (request.originMasterBrokerId) {
            const mbNotif = await storage.createNotification({
              userId: request.originMasterBrokerId,
              type: 'submission_update',
              title: 'Propuesta recibida para solicitud de tu red',
              message: `Una institución aprobó la solicitud de un broker de tu red.`,
              relatedEntityType: 'credit_submission_target',
              relatedEntityId: rawTarget.id,
              priority: 'medium',
            });
            broadcastToUser(request.originMasterBrokerId, { type: 'notification', notification: mbNotif });
          }
        }
      } catch (notifError) {
        console.error("[NOTIF] Error sending institution proposal notification:", notifError);
      }

      // Notify Super Admin via email about received proposal
      try {
        const inst = await storage.getFinancialInstitution(rawTarget.financialInstitutionId);
        const reqItem = await storage.getCreditSubmissionRequest(rawTarget.requestId);
        const clItem = reqItem ? await storage.getClient(reqItem.clientId) : null;
        const clName: string = (clItem ? (clItem.type === 'persona_moral' ? clItem.businessName : `${clItem.firstName} ${clItem.lastName}`) : null) || 'Cliente';

        sendSuperAdminNotificationEmail({
          title: `Propuesta Aprobada de Financiera: ${inst?.name || 'Financiera'}`,
          message: `La financiera ${inst?.name || 'Financiera'} ha emitido una propuesta aprobada para ${clName} por un monto de $${proposal.approvedAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN con tasa de ${proposal.interestRate}% a un plazo de ${proposal.term} meses.`,
          type: 'proposal_received',
          clientName: clName,
          financialInstitutionName: inst?.name,
          amount: proposal.approvedAmount,
          actionUrl: '/solicitudes-pendientes',
          details: {
            'Tasa de Interés': `${proposal.interestRate}%`,
            'Plazo': `${proposal.term} meses`,
            'Comisión Apertura': `${proposal.openingCommission || 0}%`,
          }
        }).catch(e => console.error('[Email] Failed to send proposal notification email to super admin:', e));
      } catch (emailErr) {
        console.error("[Email] Error dispatching proposal email:", emailErr);
      }

      const target = await enrichCreditSubmissionTarget(rawTarget);
      res.json(projectSubmissionTarget(target, user.role));
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      if (code.startsWith("OFFER_VERSION_")) {
        return res.status(409).json({ code, message: "La oferta o versión no coincide con la propuesta." });
      }
      if (code === "PROPOSAL_REQUIRES_COMMERCIAL_CONTACT") {
        return res.status(409).json({ code, message: "Primero debe iniciarse la gestión comercial interna." });
      }
      if (error instanceof Error && error.message === "TARGET_ALREADY_SELECTED") {
        return res.status(409).json({
          code: "TARGET_ALREADY_SELECTED",
          message: "Esta propuesta ya fue seleccionada o tiene un crédito vinculado.",
        });
      }
      console.error("Error saving institution proposal:", error);
      res.status(500).json({ message: "Failed to save institution proposal" });
    }
  });

  // Institution response (approve or reject from institution side) - Admins only
  app.patch('/api/credit-submission-targets/:id/mark-institution-response', isAuthenticated, requireModuleAndAction('aprobaciones', 'edit'), async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);

      if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
        return res.status(403).json({ message: "Only admins can record institution responses" });
      }

      const bodySchema = z.object({
        approved: z.boolean(),
        adminNotes: z.string().optional(),
        proposal: z.object({
          approvedAmount: z.number(),
          interestRate: z.number(),
          term: z.number(),
          openingCommission: z.number().optional(),
          institutionProductId: z.string().trim().min(1).optional(),
          offerId: z.string().trim().min(1).optional(),
          versionNumber: z.number().int().positive().optional(),
        }).optional(),
      });

      const { approved, adminNotes, proposal } = bodySchema.parse(req.body);
      const targetBefore = await storage.getCreditSubmissionTarget(id);
      if (!targetBefore) return res.status(404).json({ message: "Credit submission target not found" });
      if (targetBefore.isWinner || targetBefore.creditId ||
          ["selected_winner", "dispersed"].includes(targetBefore.status)) {
        return res.status(409).json({ code: "PROPOSAL_LOCKED", message: "No se permite reabrir una propuesta seleccionada." });
      }

      // Cannot fabricate a financial approval with no actual proposal on
      // the target. Existing historical proposals remain readable/approvable.
      if (approved && !proposal && !targetBefore.institutionProposal) {
        return res.status(409).json({
          code: "INSTITUTION_PROPOSAL_REQUIRED",
          message: "Se requiere una propuesta financiera registrada antes de aprobar.",
        });
      }

      const newStatus = approved ? 'institution_approved' : 'institution_rejected';
      const updatePayload: any = { status: newStatus };
      if (approved && proposal) {
        updatePayload.institutionProposal = await validateTargetOfferVersion(targetBefore, proposal);
        updatePayload.proposalReceivedAt = new Date();
      }
      if (adminNotes) updatePayload.adminNotes = adminNotes;

      const rawTarget = await storage.updateCreditSubmissionTarget(id, updatePayload);

      if (!rawTarget) {
        return res.status(404).json({ message: "Credit submission target not found" });
      }

      // Notify broker (and master_broker if applicable)
      try {
        const request = await storage.getCreditSubmissionRequest(rawTarget.requestId);
        if (request) {
          const title = approved ? 'Institución aprobó tu solicitud' : 'Institución rechazó tu solicitud';
          const message = approved && proposal
            ? `Monto aprobado: $${proposal.approvedAmount.toLocaleString('es-MX')} a ${proposal.interestRate}% en ${proposal.term} meses.`
            : (adminNotes || (approved ? 'Tu solicitud fue aprobada por la institución.' : 'Tu solicitud fue rechazada por la institución.'));
          const notification = await storage.createNotification({
            userId: request.brokerId,
            type: 'submission_update',
            title,
            message,
            relatedEntityType: 'credit_submission_target',
            relatedEntityId: rawTarget.id,
            priority: 'high',
          });
          broadcastToUser(request.brokerId, { type: 'notification', notification });
          if (request.originMasterBrokerId) {
            const mbNotif = await storage.createNotification({
              userId: request.originMasterBrokerId,
              type: 'submission_update',
              title: approved ? 'Institución aprobó solicitud de tu red' : 'Institución rechazó solicitud de tu red',
              message: `Una institución ${approved ? 'aprobó' : 'rechazó'} la solicitud de un broker de tu red.`,
              relatedEntityType: 'credit_submission_target',
              relatedEntityId: rawTarget.id,
              priority: 'medium',
            });
            broadcastToUser(request.originMasterBrokerId, { type: 'notification', notification: mbNotif });
          }
        }
      } catch (notifError) {
        console.error("[NOTIF] Error sending institution-response notification:", notifError);
      }

      const target = await enrichCreditSubmissionTarget(rawTarget);
      res.json(projectSubmissionTarget(target, user.role));
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      if (code.startsWith("OFFER_VERSION_")) {
        return res.status(409).json({ code, message: "La oferta o versión no coincide con la respuesta." });
      }
      if (error instanceof Error && error.message === "TARGET_ALREADY_SELECTED") {
        return res.status(409).json({
          code: "TARGET_ALREADY_SELECTED",
          message: "Esta propuesta ya fue seleccionada o tiene un crédito vinculado.",
        });
      }
      console.error("Error recording institution response:", error);
      res.status(500).json({ message: "Failed to record institution response" });
    }
  });

  // 5. Select winner - Brokers and admins can select
  app.patch('/api/credit-submission-targets/:id/select-winner', isAuthenticated, requireModuleAndAction('creditos', 'edit'), async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const target = await storage.getCreditSubmissionTarget(id);
      
      if (!target) {
        return res.status(404).json({ message: "Credit submission target not found" });
      }

      // Get the submission request to verify ownership
      const request = await storage.getCreditSubmissionRequest(target.requestId);
      if (!request) {
        return res.status(404).json({ message: "Credit submission request not found" });
      }

      // Only the broker who created the submission or admins can select winner
      const isAdmin = user.role === 'admin' || user.role === 'super_admin';
      const isOwner = request.brokerId === userId;
      
      if (!isAdmin && !isOwner) {
        return res.status(403).json({ message: "Only the broker who created the submission or admins can select the winner" });
      }

      // The winning TARGET (not the entire request) owns its credit.
      // PostgreSQL locks this row and changes winner + credit together.

      const client = await storage.getClient(request.clientId);
      const resolvedTenantId = request.tenantId || client?.tenantId || null;
      const proposal = target.institutionProposal as any;

      // REGLA 2 (COM-22): Congelamiento comercial formal validado desde servidor
      const masterBrokerId = request.originMasterBrokerId ?? null;

      const resolvedOfferId = (proposal as any)?.institutionProductId || (proposal as any)?.offerId || (request as any)?.institutionProductId || (request as any)?.offerId || null;
      const resolvedVersionNumber = (proposal as any)?.versionNumber ?? (request as any)?.versionNumber ?? null;

      if (!target.creditId && !target.isWinner) {
        const blocked = await checkOfferCommissionAcceptanceForNewOperation({
          offerId: resolvedOfferId, versionNumber: resolvedVersionNumber,
          brokerId: request.brokerId, originMasterBrokerId: masterBrokerId,
          snapshotRecordedAt: target.proposalReceivedAt,
        });
        if (blocked) return res.status(409).json(blocked);
      }

      const commercialSnapshot = consolidateCommercialProposalSnapshot({
        proposalData: {
          approvedAmount: proposal?.approvedAmount ? parseFloat(String(proposal.approvedAmount)) : undefined,
          interestRate: proposal?.interestRate ? parseFloat(String(proposal.interestRate)) : undefined,
          term: proposal?.term ? parseInt(String(proposal.term), 10) : undefined,
          openingCommission: proposal?.openingCommission ? parseFloat(String(proposal.openingCommission)) : undefined,
          institutionProductId: resolvedOfferId,
          versionNumber: resolvedVersionNumber,
          originBrokerId: request.brokerId,
          originMasterBrokerId: masterBrokerId,
          commissionRates: proposal?.commissionRates || undefined,
          financialInstitutionId: target.financialInstitutionId,
        },
      });

      const creditData = {
        tenantId: resolvedTenantId,
        clientId: request.clientId,
        brokerId: request.brokerId,
        originMasterBrokerId: masterBrokerId,
        financialInstitutionId: target.financialInstitutionId,
        productTemplateId: request.productTemplateId,
        linkedSubmissionId: request.id,
        amount: proposal?.approvedAmount?.toString() || request.requestedAmount.toString(),
        interestRate: proposal?.interestRate?.toString(),
        term: proposal?.term,
        purpose: request.purpose,
        mortgageData: request.mortgageData || {},
        status: 'approved',
        finalProposal: commercialSnapshot,
      } as any;
      const transactionStorage: IStorage = storage;
      let credit: any;
      let selectedTarget: any = target;
      let alreadySelected = false;
      if (transactionStorage.selectWinningTargetAtomic) {
        const settled = await transactionStorage.selectWinningTargetAtomic({
          targetId: id,
          requestId: request.id,
          expectedProposal: target.institutionProposal,
          newCredit: { ...creditData, id: randomUUID() },
        });
        credit = settled.credit;
        selectedTarget = settled.target;
        alreadySelected = settled.alreadySelected;
      } else {
        // Only MemStorage fixtures use this legacy fallback. PostgreSQL always
        // uses the locked transaction to prevent orphan and duplicate credits.
        if (target.creditId) {
          const existing = await storage.getCredit(target.creditId);
          if (!existing) throw new Error("WINNER_EXISTING_CREDIT_NOT_FOUND");
          credit = existing;
          alreadySelected = true;
        } else {
          credit = await storage.createCredit(creditData);
          selectedTarget = await storage.updateCreditSubmissionTarget(id, {
            isWinner: true, status: 'selected_winner', creditId: credit.id,
          });
        }
      }

      // Notifications are best-effort only AFTER the transactional commit.
      if (!alreadySelected) try {
        const institution = target.financialInstitutionId 
          ? await storage.getFinancialInstitution(target.financialInstitutionId) 
          : null;
        const client = await storage.getClient(request.clientId);
        const clientName: string = (client ? (client.type === 'persona_moral' ? client.businessName : `${client.firstName} ${client.lastName}`) : null) || 'Cliente';
        const formattedAmount = proposal?.approvedAmount 
          ? `$${parseFloat(proposal.approvedAmount.toString()).toLocaleString('es-MX')} MXN` 
          : `$${parseFloat(request.requestedAmount.toString()).toLocaleString('es-MX')} MXN`;

        const allUsers = await storage.getAllUsers();
        const admins = allUsers.filter(u => u.role === 'admin' || u.role === 'super_admin');
        
        for (const admin of admins) {
          const notification = await storage.createNotification({
            userId: admin.id,
            type: 'submission_update',
            title: '🏆 Propuesta Ganadora Seleccionada',
            message: `Se seleccionó la oferta de ${institution?.name || 'la Financiera'} por ${formattedAmount} para el cliente ${clientName}. Lista para dispersión en Aprobaciones.`,
            relatedEntityType: 'credit_submission_target',
            relatedEntityId: target.id,
            priority: 'high',
          });
          broadcastToUser(admin.id, { type: 'notification', notification });
        }

        // Send email alert to Super Admin for winning proposal
        sendSuperAdminNotificationEmail({
          title: `🏆 Oferta Ganadora Seleccionada: ${clientName}`,
          message: `Se seleccionó la oferta de ${institution?.name || 'la Financiera'} por ${formattedAmount} para el cliente ${clientName}. La solicitud se encuentra lista para su dispersión final en el módulo de Aprobaciones.`,
          type: 'winner_selected',
          clientName,
          financialInstitutionName: institution?.name,
          amount: formattedAmount,
          actionUrl: '/solicitudes-pendientes',
          details: {
            'Tasa de Interés': `${proposal?.interestRate || 0}%`,
            'Plazo': `${proposal?.term || 12} meses`,
            'Comisión Apertura': `${proposal?.openingCommission || 0}%`,
          }
        }).catch(e => console.error('[Email] Failed to send super admin winner notification email:', e));
      } catch (notifErr) {
        console.error("Error creating notifications for admins on winner selection:", notifErr);
      }

      const enrichedTarget = await enrichCreditSubmissionTarget(selectedTarget);
      res.json({ target: projectSubmissionTarget(enrichedTarget, user.role), credit: projectSubmissionCredit(credit, user.role), alreadySelected });
    } catch (error: any) {
      const code = String(error?.message || "");
      if (code.startsWith("WINNER_") || code.startsWith("OFFER_") ||
          code === "MISSING_ORIGIN_MASTER_FOR_OFFER") {
        return res.status(409).json({ code, message: "No puede seleccionarse esta propuesta sin validación adicional." });
      }
      console.error("Error selecting winner:", error);
      res.status(500).json({ message: "Failed to select winner" });
    }
  });

  // 6. Mark as dispersed - Only for winners - CREATES CREDIT IN credits TABLE
  app.patch('/api/credit-submission-targets/:id/mark-dispersed', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
        return res.status(403).json({ message: "Only admins can mark as dispersed" });
      }

      const target = await storage.getCreditSubmissionTarget(id);
      
      if (!target) {
        return res.status(404).json({ message: "Credit submission target not found" });
      }

      if (!target.isWinner) {
        return res.status(400).json({ message: "Only winner targets can be marked as dispersed" });
      }

      // Prevent duplicate dispersal - check if already dispersed
      if (target.status === 'dispersed') {
        const enrichedTarget = await enrichCreditSubmissionTarget(target);
        return res.json(enrichedTarget);
      }

      // Get submission request
      const request = await storage.getCreditSubmissionRequest(target.requestId);
      if (!request) {
        return res.status(404).json({ message: "Credit submission request not found" });
      }

      let credit;
      const proposal = target.institutionProposal as any;
      const client = await storage.getClient(request.clientId);
      const resolvedTenantId = request.tenantId || client?.tenantId || null;
      
      // Check if credit already exists (from select-winner flow)
      const currentProposal = (target.institutionProposal as any) || {};
      if (target.creditId) {
        // Reuse existing credit, update status AND backfill linked fields
        const existingCredit = await storage.getCredit(target.creditId);
        const existingProposal = (existingCredit?.finalProposal as any) || currentProposal || {};
        credit = await storage.updateCredit(target.creditId, {
          // OPE-09: report is not Super Admin confirmation or proof of disbursement.
          status: existingCredit && isCreditDisbursementConfirmed(existingCredit)
            ? existingCredit.status : 'approved',
          ...(resolvedTenantId ? { tenantId: resolvedTenantId } : {}),
          linkedSubmissionId: request.id, // Backfill link to original submission
          productTemplateId: request.productTemplateId, // Backfill product template
          mortgageData: request.mortgageData || {},
          finalProposal: {
            ...existingProposal,
            disbursementStatus: existingProposal.disbursementStatus === 'confirmed' ? 'confirmed' : 'reported',
            disbursementReportedAt: new Date().toISOString(),
            disbursementReportedBy: userId,
          },
        });
      } else {
        // The legacy dispersed route cannot bypass acceptance if it must create
        // a new credit for a published, materially modified offer.
        const offerLineage = (proposal || {}) as any;
        const blocked = await checkOfferCommissionAcceptanceForNewOperation({
          offerId: offerLineage.institutionProductId || offerLineage.offerId ||
            (request as any).institutionProductId || (request as any).offerId || null,
          versionNumber: offerLineage.versionNumber ?? (request as any).versionNumber ?? null,
          brokerId: request.brokerId,
          originMasterBrokerId: request.originMasterBrokerId ?? null,
          snapshotRecordedAt: target.proposalReceivedAt,
        });
        if (blocked) return res.status(409).json(blocked);
        credit = await storage.createCredit({
          tenantId: resolvedTenantId,
          clientId: request.clientId,
          brokerId: request.brokerId,
          financialInstitutionId: target.financialInstitutionId,
          productTemplateId: request.productTemplateId,
          linkedSubmissionId: request.id, // Link to original submission
          amount: proposal.approvedAmount?.toString() || request.requestedAmount.toString(),
          interestRate: proposal.interestRate?.toString(),
          term: proposal.term,
          purpose: request.purpose,
          mortgageData: request.mortgageData || {},
          status: 'approved', // Reporting alone must not create a disbursed credit
          finalProposal: {
            ...(proposal || {}),
            disbursementStatus: 'reported',
            disbursementReportedAt: new Date().toISOString(),
            disbursementReportedBy: userId,
          },
        });
      }

      // Update target with dispersal info
      const updated = await storage.updateCreditSubmissionTarget(id, {
        status: 'dispersed',
        dispersedAt: new Date(),
        creditId: credit!.id,
      });

      // Update parent submission request status - if all targets processed, mark as dispersed, otherwise keep in progress
      const allSiblings = await storage.getCreditSubmissionTargetsByRequest(target.requestId);
      const anyPendingOrEvaluating = allSiblings.some(t => t.id !== id && (t.status === 'selected_winner' || t.status === 'institution_approved' || t.status === 'sent'));
      await storage.updateCreditSubmissionRequest(target.requestId, {
        status: anyPendingOrEvaluating ? 'in_progress' : 'dispersed',
      });

      // REGLA 1 (COM-21) y REGLA 3 (COM-23): Desembolsos verificables y eliminación de simulaciones.
      // Prohibido calcular comisiones sobre approvedAmount, credit.amount o montos no verificados en servidor.
      // Exigir evidencia confiable de dispersión bancaria confirmada en backend.
      // Al no existir integración bancaria activa (FIN-13 / FIN-14 pendiente), se bloquea la generación automática
      // de comisiones y se reporta la dependencia expresamente; no se simulan confirmaciones.
      console.warn(
        `[COM-21] Generación de comisiones bloqueada en mark-dispersed para target '${id}': ` +
        `No existe integración con core bancario ni evidencia de dispersión confirmada en backend (FIN-13/FIN-14 pendiente). ` +
        `Prohibido calcular comisiones sobre approvedAmount o importes simulados.`
      );

      try {
        const broker = await storage.getUser(request.brokerId);
        const institution = await storage.getFinancialInstitution(target.financialInstitutionId);
        const client = await storage.getClient(request.clientId);
        const clientName: string = (client ? (client.type === 'persona_moral' ? client.businessName : `${client.firstName} ${client.lastName || ''}`.trim()) : null) || 'Cliente';
        const formattedAmount = proposal?.approvedAmount
          ? `$${parseFloat(proposal.approvedAmount.toString()).toLocaleString('es-MX')} MXN`
          : `$${parseFloat(request.requestedAmount.toString()).toLocaleString('es-MX')} MXN`;

        sendSuperAdminNotificationEmail({
          title: `Crédito Marcado Dispersado: ${clientName}`,
          message: `El crédito para ${clientName} por ${formattedAmount} con ${institution?.name || 'Financiera'} ha sido marcado como DISPERSADO. La generación de comisiones se encuentra retenida en espera de evidencia verificable de dispersión en backend (FIN-13/FIN-14 pendiente).`,
          type: 'credit_dispersed',
          clientName,
          brokerName: broker ? `${broker.firstName} ${broker.lastName || ''}`.trim() : 'Bróker',
          financialInstitutionName: institution?.name,
          amount: formattedAmount,
          actionUrl: `/solicitudes-pendientes`,
        }).catch(e => console.error('[Email] Failed to send super admin dispersion email:', e));
      } catch (emailErr) {
        console.error("[Email] Error sending super admin notification on mark-dispersed:", emailErr);
      }

      // Auto-record in client credit history (#25)
      try {
        const prod = await resolveProductTemplate(request.productTemplateId, request.purpose);
        const institution = await storage.getFinancialInstitution(target.financialInstitutionId);
        const grantedAmount = proposal?.approvedAmount?.toString() || request.requestedAmount.toString();
        const term = proposal?.term ? String(proposal.term) : '12';
        const rate = proposal?.interestRate ? String(proposal.interestRate) : '0';

        await storage.createClientCreditHistory({
          clientId: request.clientId,
          source: 'system',
          linkedCreditId: credit!.id,
          creditType: prod?.name || 'Crédito Empresarial',
          amountGranted: grantedAmount,
          termMonths: term,
          interestRate: rate,
          financialInstitution: institution?.name || 'Financiera',
          notes: `Crédito dispersado exitosamente el ${new Date().toLocaleDateString('es-MX')}. Financiera: ${institution?.name || 'N/A'}. Folio: ${credit!.id.slice(-8)}.`,
        });
        console.log(`[CreditHistory] Auto-created credit history for client ${request.clientId}`);

        // Also update client.creditosVigentesDetalles in real time
        try {
          const currentClient = await storage.getClient(request.clientId);
          if (currentClient) {
            let vigentesList: any[] = [];
            if (Array.isArray(currentClient.creditosVigentesDetalles)) {
              vigentesList = [...currentClient.creditosVigentesDetalles];
            } else if (typeof currentClient.creditosVigentesDetalles === 'string') {
              try { vigentesList = JSON.parse(currentClient.creditosVigentesDetalles); } catch (e) { vigentesList = []; }
            }
            vigentesList.push({
              id: credit!.id,
              institucion: institution?.name || 'Financiera',
              tipo: prod?.name || 'Crédito Empresarial',
              monto: grantedAmount,
              plazo: term,
              tasa: rate,
              fechaDispersado: new Date().toISOString(),
            });
            await storage.updateClient(request.clientId, {
              creditosVigentesDetalles: vigentesList,
              creditosVigentes: vigentesList.length.toString(),
            });
            console.log(`[CreditHistory] Updated creditosVigentesDetalles for client ${request.clientId}`);
          }
        } catch (vigentesErr) {
          console.error("[CreditHistory] Error updating client creditosVigentesDetalles:", vigentesErr);
        }
      } catch (historyErr) {
        console.error("[CreditHistory] Error auto-creating credit history:", historyErr);
      }

      const enrichedTarget = await enrichCreditSubmissionTarget(updated!);
      res.json(enrichedTarget);
    } catch (error) {
      console.error("Error marking as dispersed:", error);
      res.status(500).json({ message: "Failed to mark as dispersed" });
    }
  });

  // REGLAS 1, 2, 3 y 4 (FASE 2B.2A.1 / COM-21 / OPE-09 / PAG-05): Confirmación de desembolso sobre target por Super Admin
  app.post('/api/credit-submission-targets/:id/confirm-disbursement', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);

      if (!user || user.role !== 'super_admin') {
        return res.status(403).json({
          message: "Acceso denegado: La validación y confirmación de desembolsos está reservada exclusivamente para Super Admin.",
          code: "FORBIDDEN_SUPER_ADMIN_REQUIRED",
        });
      }

      const target = await storage.getCreditSubmissionTarget(id);
      if (!target) {
        return res.status(404).json({ message: "Credit submission target not found" });
      }

      // REGLA 1 (OPE-10/11/12): Elegibilidad de propuestas ganadoras
      if (!target.isWinner) {
        return res.status(400).json({
          message: "Operación no elegible para confirmación de desembolso: Solo propuestas ganadoras pueden confirmarse.",
          code: "NOT_WINNER_TARGET",
        });
      }

      if (['cancelled', 'rejected'].includes(target.status)) {
        return res.status(400).json({
          message: `Operación no elegible para confirmación de desembolso: La propuesta se encuentra en estado '${target.status}'.`,
          code: "TARGET_STATUS_INELIGIBLE",
        });
      }

      const request = await storage.getCreditSubmissionRequest(target.requestId);
      if (!request) {
        return res.status(404).json({ message: "Credit submission request not found" });
      }

      // REGLA 4: Atribución Histórica y Elegibilidad
      if (!request.brokerId) {
        return res.status(400).json({
          message: "Operación no elegible para confirmación de desembolso: Falta el Bróker originador.",
          code: "MISSING_ORIGIN_BROKER",
        });
      }

      const financialInstitutionId = target.financialInstitutionId;
      if (!financialInstitutionId) {
        return res.status(400).json({
          message: "Operación no elegible para confirmación de desembolso: Falta la Financiera oferente.",
          code: "MISSING_FINANCIAL_INSTITUTION",
        });
      }

      // A newly created target-linked credit needs accepted current economics.
      // Previously linked credits preserve their immutable historical rates.
      if (!target.creditId) {
        const proposal = (target.institutionProposal || {}) as any;
        const blocked = await checkOfferCommissionAcceptanceForNewOperation({
          offerId: proposal.institutionProductId || proposal.offerId ||
            (request as any).institutionProductId || (request as any).offerId || null,
          versionNumber: proposal.versionNumber ?? (request as any).versionNumber ?? null,
          brokerId: request.brokerId,
          originMasterBrokerId: request.originMasterBrokerId ?? null,
          snapshotRecordedAt: target.proposalReceivedAt,
        });
        if (blocked) return res.status(409).json(blocked);
      }

      const { confirmedAmount, notes, dispersalIndex, idempotencyKey } = req.body;

      if (
        confirmedAmount === undefined ||
        confirmedAmount === null ||
        isNaN(Number(confirmedAmount)) ||
        Number(confirmedAmount) <= 0 ||
        !Number.isFinite(Number(confirmedAmount))
      ) {
        return res.status(400).json({
          message: "El monto efectivamente dispersado debe ser un número positivo mayor a cero.",
          code: "INVALID_CONFIRMED_AMOUNT",
        });
      }

      const validConfirmedAmount = Number(confirmedAmount);
      const validDispersalIndex = dispersalIndex != null && !isNaN(Number(dispersalIndex)) && Number(dispersalIndex) > 0
        ? Number(dispersalIndex)
        : 1;

      // PostgreSQL transactional path: lock the winning target, preserve the
      // immutable historical Master, and settle target + credit + commission + audit
      // in one commit. Existing MemStorage behavior remains for unit fixtures.
      const transactionalStorage: IStorage = storage;
      if (transactionalStorage.confirmTargetDisbursementAtomic) {
        try {
          const linked = target.creditId ? await storage.getCredit(target.creditId) : null;
          const proposal = (target.institutionProposal as any) || {};
          let newCredit: any = undefined;

          if (!linked) {
            const client = await storage.getClient(request.clientId);
            const originationMasterId = request.originMasterBrokerId ?? null;
            const offerId = proposal.institutionProductId || proposal.offerId ||
              (request as any).institutionProductId || (request as any).offerId || null;
            const versionNumber = proposal.versionNumber ?? (request as any).versionNumber ?? null;
            const frozenProposal = consolidateCommercialProposalSnapshot({
              proposalData: {
                approvedAmount: proposal.approvedAmount ? Number(proposal.approvedAmount) : undefined,
                interestRate: proposal.interestRate ? Number(proposal.interestRate) : undefined,
                term: proposal.term ? Number(proposal.term) : undefined,
                openingCommission: proposal.openingCommission ? Number(proposal.openingCommission) : undefined,
                institutionProductId: offerId,
                versionNumber,
                originBrokerId: request.brokerId,
                originMasterBrokerId: originationMasterId,
                commissionRates: proposal.commissionRates || undefined,
                financialInstitutionId: target.financialInstitutionId,
              },
            });
            newCredit = {
              id: randomUUID(),
              tenantId: request.tenantId || client?.tenantId || null,
              clientId: request.clientId,
              brokerId: request.brokerId,
              originMasterBrokerId: originationMasterId,
              financialInstitutionId: target.financialInstitutionId,
              productTemplateId: request.productTemplateId,
              linkedSubmissionId: request.id,
              amount: Number(proposal.approvedAmount || request.requestedAmount).toFixed(2),
              interestRate: proposal.interestRate ? String(proposal.interestRate) : null,
              term: proposal.term || null,
              purpose: request.purpose,
              mortgageData: request.mortgageData || {},
              status: "approved",
              finalProposal: frozenProposal,
            };
          }
          const previewCredit = linked || newCredit;
          if (!previewCredit) {
            throw new Error("DISBURSEMENT_TARGET_CREDIT_INVALID");
          }
          const frozen = (previewCredit.finalProposal as any) || {};
          const commType = req.body?.commissionType || frozen.commissionsToApply?.[0] || "apertura";
          const idKey = idempotencyKey ? String(idempotencyKey).trim() : null;
          const preview = await calculateAndPersistCascadingCommission({
            credit: previewCredit,
            creditId: previewCredit.id,
            commissionType: commType,
            confirmedDisbursedAmount: validConfirmedAmount,
            dispersalIndex: validDispersalIndex,
            idempotencyKey: idKey || undefined,
            financialInstitutionId: target.financialInstitutionId,
            institutionProductId: frozen.institutionProductId || frozen.offerId || null,
            versionNumber: frozen.versionNumber ?? null,
            performedBy: userId,
            previewOnly: true,
          });
          const result = await transactionalStorage.confirmTargetDisbursementAtomic({
            targetId: id,
            requestId: request.id,
            expectedTargetProposal: target.institutionProposal,
            expectedBrokerId: request.brokerId,
            expectedOriginMasterBrokerId: request.originMasterBrokerId ?? null,
            newCredit,
            expectedProposal: previewCredit.finalProposal,
            expectedAmount: previewCredit.amount,
            confirmedAmount: validConfirmedAmount,
            dispersalIndex: validDispersalIndex,
            commission: preview,
            performedBy: userId,
            actorEmail: user.email,
            notes: notes ? String(notes).trim() : null,
            idempotencyKey: idKey,
          });
          if (!result.alreadyConfirmed) {
            try {
              const notification = await storage.createNotification({
                userId: request.brokerId,
                type: "disbursement_confirmed",
                title: "Desembolso confirmado y comisión calculada",
                message: `Confirmación de desembolso por $${validConfirmedAmount.toFixed(2)} MXN.`,
                relatedEntityType: "credit",
                relatedEntityId: result.credit.id,
                priority: "high",
              });
              broadcastToUser(request.brokerId, { type: "notification", notification });
            } catch (notifyErr) {
              console.warn("[Target disbursement] Committed but notification failed:", notifyErr);
            }
          }
          return res.json({
            message: result.alreadyConfirmed
              ? "Este tramo ya había sido confirmado."
              : "Desembolso confirmado en una transacción con comisión y auditoría.",
            ...result,
          });
        } catch (error: any) {
          const code = String(error?.message || "");
          if (error instanceof MissingCommissionRateError ||
              error instanceof MissingOfferVersionError ||
              error instanceof UnauthorizedDistributionError ||
              error instanceof UnconfirmedDispersalAmountError) {
            return res.status(400).json({
              message: error.message, code: error.code || "CANONICAL_CALCULATION_ERROR",
            });
          }
          if (code.startsWith("DISBURSEMENT_") || code.startsWith("OFFER_") ||
              code === "MISSING_ORIGIN_MASTER_FOR_OFFER" ||
              code === "TOTAL_DISBURSEMENT_EXCEEDS_APPROVED_AMOUNT") {
            return res.status(409).json({
              message: "No se pudo confirmar: revisar propuesta, afiliación histórica, monto o idempotencia.",
              code,
            });
          }
          throw error;
        }
      }

      // REGLA 4: Si el crédito no existe, crearlo con estricta preservación de atribución histórica
      let credit = target.creditId ? await storage.getCredit(target.creditId) : null;
      if (!credit) {
        const client = await storage.getClient(request.clientId);
        const resolvedTenantId = request.tenantId || client?.tenantId || null;
        const proposal = (target.institutionProposal as any) || {};

        const brokerUser = await storage.getUser(request.brokerId);
        const masterBrokerId = (request as any).originMasterBrokerId !== undefined
          ? (request as any).originMasterBrokerId
          : (brokerUser?.role === 'master_broker' ? brokerUser.id : brokerUser?.masterBrokerId || null);

        const resolvedOfferId = proposal?.institutionProductId || proposal?.offerId || (request as any)?.institutionProductId || (request as any)?.offerId || null;
        const resolvedVersionNumber = proposal?.versionNumber ?? (request as any)?.versionNumber ?? null;

        const commercialSnapshot = consolidateCommercialProposalSnapshot({
          proposalData: {
            approvedAmount: proposal?.approvedAmount ? parseFloat(String(proposal.approvedAmount)) : undefined,
            interestRate: proposal?.interestRate ? parseFloat(String(proposal.interestRate)) : undefined,
            term: proposal?.term ? parseInt(String(proposal.term), 10) : undefined,
            openingCommission: proposal?.openingCommission ? parseFloat(String(proposal.openingCommission)) : undefined,
            institutionProductId: resolvedOfferId,
            versionNumber: resolvedVersionNumber,
            originBrokerId: request.brokerId,
            originMasterBrokerId: masterBrokerId,
            commissionRates: proposal?.commissionRates || undefined,
            financialInstitutionId: target.financialInstitutionId,
          },
        });

        credit = await storage.createCredit({
          tenantId: resolvedTenantId,
          clientId: request.clientId,
          brokerId: request.brokerId,
          originMasterBrokerId: masterBrokerId,
          financialInstitutionId: target.financialInstitutionId,
          productTemplateId: request.productTemplateId,
          linkedSubmissionId: request.id,
          amount: proposal?.approvedAmount?.toString() || request.requestedAmount.toString(),
          interestRate: proposal?.interestRate?.toString(),
          term: proposal?.term,
          purpose: request.purpose,
          mortgageData: request.mortgageData || {},
          status: 'disbursed',
          finalProposal: commercialSnapshot,
        });
        await storage.updateCreditSubmissionTarget(id, { creditId: credit.id });
      }

      // REGLA 2: Idempotencia y Multidispersión
      const existingProposal = (credit.finalProposal as any) || {};
      const existingTranches: any[] = Array.isArray(existingProposal.disbursementTranches)
        ? existingProposal.disbursementTranches
        : (existingProposal.disbursementConfirmation ? [existingProposal.disbursementConfirmation] : []);

      if (idempotencyKey) {
        const existingComms = await storage.getCommissions({ idempotencyKey: String(idempotencyKey).trim() });
        if (existingComms.length > 0) {
          const enrichedTarget = await enrichCreditSubmissionTarget(target);
          return res.json({
            message: "Desembolso ya confirmado previamente con esta clave de idempotencia.",
            target: enrichedTarget,
            credit,
            commission: existingComms[0],
            alreadyConfirmed: true,
          });
        }
      }

      const existingTranche = existingTranches.find((t: any) => Number(t.dispersalIndex || 1) === validDispersalIndex);
      if (existingTranche) {
        const prevAmount = Number(existingTranche.confirmedAmount || 0);
        if (Math.abs(prevAmount - validConfirmedAmount) < 0.01) {
          const commType = req.body?.commissionType || existingProposal.commissionsToApply?.[0] || 'apertura';
          const resolvedCommType = validDispersalIndex > 1 ? `${commType}_parcial_${validDispersalIndex}` : commType;
          const existingComms = await storage.getCommissions({ creditId: credit.id });
          const matchComm = existingComms.find(c => c.commissionType === resolvedCommType || c.id === existingTranche.commissionId);
          const enrichedTarget = await enrichCreditSubmissionTarget(target);
          return res.json({
            message: "Este tramo de desembolso ya se encuentra confirmado con el mismo importe.",
            target: enrichedTarget,
            credit,
            commission: matchComm || existingComms[0] || null,
            alreadyConfirmed: true,
          });
        } else {
          return res.status(400).json({
            message: `Prohibido alterar el importe de un tramo confirmado: El tramo #${validDispersalIndex} ya fue confirmado previamente por $${prevAmount.toFixed(2)} MXN y es inmutable.`,
            code: "CANNOT_ALTER_CONFIRMED_TRANCHE_AMOUNT",
            details: {
              dispersalIndex: validDispersalIndex,
              previousConfirmedAmount: prevAmount,
              attemptedAmount: validConfirmedAmount,
            },
          });
        }
      }

      // Impedir sobrepasar el monto máximo autorizado del crédito
      const maxCreditAmount = Number(credit.amount || existingProposal.approvedAmount || 0);
      const otherTranchesTotal = existingTranches
        .filter((t: any) => Number(t.dispersalIndex || 1) !== validDispersalIndex)
        .reduce((sum: number, t: any) => sum + Number(t.confirmedAmount || 0), 0);

      if (maxCreditAmount > 0 && (otherTranchesTotal + validConfirmedAmount) > (maxCreditAmount + 0.01)) {
        return res.status(400).json({
          message: `El monto acumulado de desembolsos ($${(otherTranchesTotal + validConfirmedAmount).toFixed(2)}) sobrepasa el monto máximo autorizado del crédito ($${maxCreditAmount.toFixed(2)}).`,
          code: "TOTAL_DISBURSEMENT_EXCEEDS_APPROVED_AMOUNT",
          details: {
            maxCreditAmount,
            otherTranchesTotal,
            attemptedAmount: validConfirmedAmount,
            accumulatedTotal: otherTranchesTotal + validConfirmedAmount,
          },
        });
      }

      // REGLA 1: Atomicidad y Pre-validación económica antes de actualizar el estado
      const commType = req.body?.commissionType || existingProposal.commissionsToApply?.[0] || 'apertura';
      const offerId = existingProposal.institutionProductId || existingProposal.offerId || (credit as any).institutionProductId || null;
      const versionNumber = existingProposal.versionNumber ?? null;
      const proposalCommissionRates = existingProposal.commissionRates || undefined;
      const institution = target.financialInstitutionId ? await storage.getFinancialInstitution(target.financialInstitutionId) : undefined;
      const historicalMasterBrokerId = credit.originMasterBrokerId || existingProposal.originMasterBrokerId || null;

      try {
        await resolveOfferVersionCommissionRates({
          offerId,
          versionNumber,
          commissionType: commType,
          proposalCommissionRates,
          institution,
          hasMasterBroker: Boolean(historicalMasterBrokerId),
          isMasterDirect: Boolean(historicalMasterBrokerId && credit.brokerId && String(historicalMasterBrokerId) === String(credit.brokerId)),
        });
      } catch (preCheckErr: any) {
        if (
          preCheckErr instanceof MissingCommissionRateError ||
          preCheckErr instanceof MissingOfferVersionError ||
          preCheckErr instanceof UnauthorizedDistributionError
        ) {
          return res.status(400).json({
            message: preCheckErr.message,
            code: preCheckErr.code || "CANONICAL_CALCULATION_ERROR",
            details: (preCheckErr as any).details || null,
          });
        }
      }

      const newTranche = {
        dispersalIndex: validDispersalIndex,
        confirmedAmount: validConfirmedAmount,
        confirmedAt: new Date().toISOString(),
        confirmedBy: userId,
        confirmedByEmail: user.email,
        notes: notes ? String(notes).trim() : null,
        idempotencyKey: idempotencyKey ? String(idempotencyKey).trim() : null,
        status: 'confirmed',
        commissionId: undefined as string | undefined,
      };

      const updatedTranches = [
        ...existingTranches.filter((t: any) => Number(t.dispersalIndex || 1) !== validDispersalIndex),
        newTranche,
      ].sort((a, b) => Number(a.dispersalIndex || 1) - Number(b.dispersalIndex || 1));

      const totalDisbursedSoFar = updatedTranches.reduce((sum, t) => sum + Number(t.confirmedAmount || 0), 0);

      const updatedProposal = {
        ...existingProposal,
        disbursementConfirmation: newTranche,
        disbursementTranches: updatedTranches,
        disbursementStatus: 'confirmed',
        confirmedDisbursedAmount: totalDisbursedSoFar,
      };

      const previousCreditState = {
        status: credit.status,
        finalProposal: credit.finalProposal,
        notes: credit.notes,
      };

      const updatedCredit = await storage.updateCredit(credit.id, {
        status: 'disbursed',
        finalProposal: updatedProposal,
        notes: notes ? (credit.notes ? `${credit.notes} | Confirmación: ${notes}` : `Confirmación: ${notes}`) : credit.notes,
      });

      if (updatedCredit) {
        (updatedCredit as any).disbursementStatus = 'confirmed';
        (updatedCredit as any).confirmedDisbursedAmount = totalDisbursedSoFar;
        (updatedCredit as any).disbursementConfirmedAt = new Date();
        (updatedCredit as any).disbursementConfirmedBy = userId;
      }

      await storage.updateCreditSubmissionTarget(id, {
        status: 'dispersed',
        dispersedAt: target.dispersedAt || new Date(),
        creditId: credit.id,
      });

      let commission: any;
      try {
        commission = await calculateAndPersistCascadingCommission({
          credit: updatedCredit || credit,
          creditId: credit.id,
          commissionType: commType,
          confirmedDisbursedAmount: validConfirmedAmount,
          dispersalIndex: validDispersalIndex,
          idempotencyKey: idempotencyKey ? String(idempotencyKey).trim() : undefined,
          performedBy: userId,
        });

        newTranche.commissionId = commission.id;
        await storage.updateCredit(credit.id, {
          finalProposal: {
            ...updatedProposal,
            disbursementConfirmation: newTranche,
            disbursementTranches: updatedTranches,
          },
        });

        await storage.createCommissionAuditLog({
          commissionId: commission.id,
          performedBy: userId,
          action: 'disbursement_confirmed',
          previousStatus: commission.status,
          newStatus: commission.status,
          details: {
            actorRole: user.role,
            confirmedAmount: validConfirmedAmount,
            dispersalIndex: validDispersalIndex,
            confirmedAt: newTranche.confirmedAt,
            notes: notes ? String(notes).trim() : null,
            creditId: credit.id,
            targetId: id,
          },
        });

        try {
          if (credit.brokerId) {
            const notif = await storage.createNotification({
              userId: credit.brokerId,
              type: 'disbursement_confirmed',
              title: '✅ Desembolso Confirmado y Comisión Calculada',
              message: `El desembolso por $${validConfirmedAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN fue confirmado por Super Admin y la comisión fue calculada exitosamente.`,
              relatedEntityType: 'credit',
              relatedEntityId: credit.id,
              priority: 'high',
            });
            broadcastToUser(credit.brokerId, { type: 'notification', notification: notif });
          }
        } catch (notifErr) {
          console.warn("[Notification] Error notifying broker of confirmed target disbursement:", notifErr);
        }

        const enrichedTarget = await enrichCreditSubmissionTarget(target);
        res.json({
          message: "Desembolso confirmado exitosamente y comisión calculada mediante servicio canónico.",
          target: enrichedTarget,
          credit: updatedCredit || credit,
          commission,
        });
      } catch (calcErr: any) {
        console.error("[Atomic Rollback] Error en cálculo de comisión sobre target, revirtiendo crédito:", calcErr);
        try {
          await storage.updateCredit(credit.id, {
            status: previousCreditState.status,
            finalProposal: previousCreditState.finalProposal as any,
            notes: previousCreditState.notes,
          });
        } catch (rbErr) {
          console.error("[Atomic Rollback Failure] Error revirtiendo crédito sobre target:", rbErr);
        }

        if (
          calcErr instanceof MissingCommissionRateError ||
          calcErr instanceof MissingOfferVersionError ||
          calcErr instanceof UnauthorizedDistributionError ||
          calcErr instanceof UnconfirmedDispersalAmountError
        ) {
          return res.status(400).json({
            message: calcErr.message,
            code: calcErr.code || "CANONICAL_CALCULATION_ERROR",
            details: (calcErr as any).details || null,
          });
        }

        return res.status(500).json({
          message: "Fallo en la persistencia de comisión. El crédito no fue confirmado.",
          code: "COMMISSION_PERSISTENCE_FAILED",
        });
      }
    } catch (error) {
      console.error("Error confirming target disbursement:", error);
      res.status(500).json({ message: "Error interno al confirmar el desembolso del target" });
    }
  });

  // ============================================
  // EXCEL IMPORT ROUTES
  // ============================================
  
  const excelUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const ext = file.originalname.toLowerCase();
      if (ext.endsWith('.xlsx') || ext.endsWith('.xls')) {
        cb(null, true);
      } else {
        cb(new Error('Solo se permiten archivos Excel (.xlsx, .xls)'));
      }
    }
  });

  // CN-V5: read-only master preview. Does not bypass the P1 economic import guard.
  // Requires Super Admin because the workbook contains confidential commission data.
  app.post('/api/import/v5/preview/:kind', isAuthenticated, requireModule('importacion'), excelUpload.single('file'), async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || req.user?.id;
      if (!(await requirePlatformRole(userId, ['super_admin']))) {
        return res.status(403).json({ code: 'SUPER_ADMIN_REQUIRED', message: 'Solo Super Admin puede previsualizar el maestro V5' });
      }
      const kind = String(req.params.kind || '');
      if (kind !== 'financieras' && kind !== 'comisiones') {
        return res.status(400).json({ message: 'Tipo de carga inválido' });
      }
      if (!req.file?.buffer) {
        return res.status(400).json({ message: 'Adjunta el archivo Excel' });
      }
      const preview = previewMasterV5(req.file.buffer, kind as MasterV5Kind);
      const norm = (v: unknown) => String(v ?? '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ');
      const institutions = await storage.getFinancialInstitutions();
      const offers = await storage.getInstitutionProducts();
      const matches = preview.rows.map(row => {
        const institution = institutions.find(inst => norm(inst.name) === norm(row.financiera));
        const matchingOffers = institution ? offers.filter(offer =>
          offer.institutionId === institution.id && norm(offer.name || offer.customName) === norm(row.nombreOferta)) : [];
        return {
          row: row.row,
          institutionId: institution?.id || null,
          existingOfferIds: matchingOffers.map(offer => offer.id),
          action: matchingOffers.length > 1 ? 'collision' : matchingOffers.length ? 'existing_offer' :
            institution ? 'new_offer' : 'new_institution_and_offer',
        };
      });
      // Vista previa: informar qué familias CANÓNICAS se darán de alta al confirmar,
      // sin escribir nada todavía ni generar errores por familias faltantes.
      const templateErrors: { row: number; field: string; level: 'error'; message: string }[] = [];
      const catalogPlan = kind === 'financieras'
        ? planMasterV5Catalog(await storage.getProductTemplates(), preview.rows.map(row => row.familia))
        : { create: [], errors: [] };
      for (const error of catalogPlan.errors) {
        templateErrors.push({ row: 0, field: 'Catálogo de productos', level: 'error', message: error });
      }
      for (const match of matches) {
        if (match.action === 'collision') templateErrors.push({
          row: match.row, field: 'Oferta', level: 'error',
          message: 'Existen varias ofertas con el mismo nombre en la financiera. Resolver antes de importar.',
        });
      }
      const allErrors = [...preview.errors, ...templateErrors];
      const missingCommissionOffers = kind === 'comisiones'
        ? matches.filter(match => match.action !== 'existing_offer').length
        : 0;
      res.json({ ...preview, errors: allErrors, matches,
        plannedCanonicalFamilies: catalogPlan.create.map(x => x.name),
        prerequisite: kind === 'comisiones' && missingCommissionOffers > 0
          ? 'Antes debes importar Financieras y Productos. Faltan ' + missingCommissionOffers +
            ' ofertas en el catálogo; no puedes aplicar comisiones todavía.'
          : null,
        writable: ['staging', 'production'].includes(process.env.RAILWAY_ENVIRONMENT_NAME || '') &&
          allErrors.length === 0 && missingCommissionOffers === 0,
        targetEnvironment: process.env.RAILWAY_ENVIRONMENT_NAME === 'production' ? 'production' : 'staging',
        message: allErrors.length
          ? 'Corrige las observaciones críticas del catálogo antes de confirmar la carga. Sin escrituras.'
          : 'Vista previa sin escrituras. Al confirmar, se crean familias canónicas faltantes y ofertas exclusivamente en borrador.' });
    } catch (error: any) {
      res.status(400).json({ message: error?.message || 'No se pudo analizar el maestro V5' });
    }
  });

  // CN-V5: Protected STAGING-ONLY import into versioned drafts, never published or institution-global rates.
  // Keep the legacy SEC-P1 import guard in place for /api/import/financieras, /commissions and /financieras-soc.
  app.post('/api/import/v5/apply/:kind', isAuthenticated, requireModule('importacion'), excelUpload.single('file'), async (req: any, res) => {
    try {
      // Explicit approved rollout: both named Railway environments, never local/unknown.
      // Separate databases; Super Admin only; drafts only; published versions unchanged.
      const railwayEnvironment = process.env.RAILWAY_ENVIRONMENT_NAME || '';
      if (!['staging', 'production'].includes(railwayEnvironment)) {
        return res.status(409).json({ code: 'V5_ENV_NOT_ALLOWED', message: 'Entorno no autorizado para importar V5' });
      }
      const userId = req.user?.claims?.sub || req.user?.id;
      if (!(await requirePlatformRole(userId, ['super_admin']))) {
        return res.status(403).json({ code: 'SUPER_ADMIN_REQUIRED', message: 'Solo Super Admin puede importar el maestro V5' });
      }
      const kind = String(req.params.kind || '');
      if (kind !== 'financieras' && kind !== 'comisiones') {
        return res.status(400).json({ message: 'Tipo de carga inválido' });
      }
      if (!req.file?.buffer) return res.status(400).json({ message: 'Adjunta el archivo Excel' });
      const preview = previewMasterV5(req.file.buffer, kind as MasterV5Kind);
      if (preview.errors.length > 0) return res.status(422).json({
        code: 'V5_VALIDATION_FAILED',
        message: 'Hay errores de validación. No se modificó ninguna oferta.',
        errors: preview.errors,
      });
      const result = kind === 'financieras'
        ? await importMasterV5FinancialDrafts(preview, userId)
        : await importMasterV5CommissionDrafts(preview);
      return res.json({ success: true, result, warnings: preview.warnings,
        message: 'Importación transaccional en ' + railwayEnvironment + ': solo borradores; ninguna publicación automática' });
    } catch (error: any) {
      console.error('V5 staging import failed:', error?.message || error);
      return res.status(409).json({ code: 'V5_IMPORT_REJECTED', message: error?.message || 'No se pudo importar V5' });
    }
  });

  app.get('/api/import/template/:type', isAuthenticated, blockLegacyEconomicExcelType, async (req: any, res) => {
    try {
      const { type } = req.params;
      const userId = req.user?.claims?.sub || req.user?.id;
      
      if (!userId) {
        return res.status(401).json({ message: 'No autorizado' });
      }
      
      const hasPermission = await requirePlatformRole(userId, ['super_admin', 'admin']);
      if (!hasPermission) {
        return res.status(403).json({ message: 'Solo administradores pueden descargar templates' });
      }
      
      let buffer: Buffer;
      let filename: string;
      
      if (type === 'financieras') {
        buffer = generateFinancierasTemplate();
        filename = 'template_financieras_productos.xlsx';
      } else if (type === 'clients') {
        buffer = generateClientsTemplate();
        filename = 'template_clientes.xlsx';
      } else if (type === 'commissions' || type === 'comisiones') {
        buffer = await generateCommissionsTemplate();
        filename = 'Plantilla_Comisiones_Financieras.xlsx';
      } else {
        return res.status(400).json({ message: 'Tipo de template inválido' });
      }
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (error: any) {
      console.error('Error generating template:', error);
      res.status(500).json({ message: error.message || 'Error al generar template' });
    }
  });

  app.post('/api/import/preview/:type', isAuthenticated, blockLegacyEconomicExcelType, requireModule('importacion'), excelUpload.single('file'), async (req: any, res) => {
    try {
      const { type } = req.params;
      const userId = req.user?.claims?.sub || req.user?.id;
      
      if (!userId) {
        return res.status(401).json({ message: 'No autorizado' });
      }
      
      const hasPermission = await requirePlatformRole(userId, ['super_admin', 'admin']);
      if (!hasPermission) {
        return res.status(403).json({ message: 'Solo administradores pueden importar datos' });
      }
      
      if (!req.file) {
        return res.status(400).json({ message: 'No se recibió ningún archivo' });
      }
      
      if (type === 'commissions' || type === 'comisiones') {
        const preview = await previewCommissionsFile(req.file.buffer);
        return res.json(preview);
      }

      if (type !== 'financieras' && type !== 'clients') {
        return res.status(400).json({ message: 'Tipo de importación inválido' });
      }
      
      const preview = previewExcelFile(req.file.buffer, type);
      res.json(preview);
    } catch (error: any) {
      console.error('Error previewing file:', error);
      res.status(500).json({ message: error.message || 'Error al previsualizar archivo' });
    }
  });

  app.post('/api/import/commissions', isAuthenticated, blockLegacyEconomicExcelImport, requireModule('importacion'), excelUpload.single('file'), async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || req.user?.id;
      
      if (!userId) {
        return res.status(401).json({ message: 'No autorizado' });
      }
      
      const hasPermission = await requirePlatformRole(userId, ['super_admin', 'admin']);
      if (!hasPermission) {
        return res.status(403).json({ message: 'Solo administradores pueden importar comisiones' });
      }
      
      if (!req.file) {
        return res.status(400).json({ message: 'No se recibió ningún archivo' });
      }
      
      const result = await importCommissionsFile(req.file.buffer);
      res.json(result);
    } catch (error: any) {
      console.error('Error importing commissions:', error);
      res.status(500).json({ message: error.message || 'Error al importar comisiones' });
    }
  });

  app.post('/api/import/financieras', isAuthenticated, blockLegacyEconomicExcelImport, requireModule('importacion'), excelUpload.single('file'), async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || req.user?.id;
      
      if (!userId) {
        return res.status(401).json({ message: 'No autorizado' });
      }
      
      const hasPermission = await requirePlatformRole(userId, ['super_admin', 'admin']);
      if (!hasPermission) {
        return res.status(403).json({ message: 'Solo administradores pueden importar financieras' });
      }
      
      if (!req.file) {
        return res.status(400).json({ message: 'No se recibió ningún archivo' });
      }
      
      const result = await importFinancieras(req.file.buffer, userId);
      res.json(result);
    } catch (error: any) {
      console.error('Error importing financieras:', error);
      res.status(500).json({ message: error.message || 'Error al importar financieras' });
    }
  });

  app.post('/api/import/financieras-soc', isAuthenticated, blockLegacyEconomicExcelImport, requireModule('importacion'), excelUpload.single('file'), async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: 'No autorizado' });
      }
      
      const hasPermission = await requirePlatformRole(userId, ['super_admin', 'admin']);
      if (!hasPermission) {
        return res.status(403).json({ message: 'Solo administradores pueden importar fichas técnicas SOC' });
      }
      
      let buffer: Buffer;
      if (req.file) {
        buffer = req.file.buffer;
      } else {
        const defaultPath = path.resolve(process.cwd(), 'attached_assets', 'Fichas técnicas fiancieras SOC.xlsx');
        if (!fs.existsSync(defaultPath)) {
          return res.status(400).json({ message: 'No se envió archivo y no se encontró el archivo SOC predeterminado' });
        }
        buffer = fs.readFileSync(defaultPath);
      }
      
      const parsed = parseSocExcel(buffer);
      const purgeOld = req.query.purge !== 'false';
      const result = await syncSocFinancierasToDatabase(parsed, { 
        purgeOldMockData: purgeOld,
        adminUserId: userId
      });
      
      res.json({
        success: true,
        ...result,
        institutions: parsed.map(i => ({ name: i.name, productsCount: i.products.length }))
      });
    } catch (error: any) {
      console.error('Error importing SOC financieras:', error);
      res.status(500).json({ message: error.message || 'Error al importar fichas SOC' });
    }
  });

  app.post('/api/import/clients', isAuthenticated, requireModule('importacion'), excelUpload.single('file'), async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || req.user?.id;
      
      if (!userId) {
        return res.status(401).json({ message: 'No autorizado' });
      }
      
      const hasPermission = await requirePlatformRole(userId, ['super_admin', 'admin']);
      if (!hasPermission) {
        return res.status(403).json({ message: 'Solo administradores pueden importar clientes' });
      }
      
      if (!req.file) {
        return res.status(400).json({ message: 'No se recibió ningún archivo' });
      }
      
      const result = await importClients(req.file.buffer, userId);
      res.json(result);
    } catch (error: any) {
      console.error('Error importing clients:', error);
      res.status(500).json({ message: error.message || 'Error al importar clientes' });
    }
  });


  // SEC-P0-04: WebSocket users MUST be resolved from the authenticated
  // server-side session cookie. A query parameter is never an identity proof.
  const httpServer = createServer(app);
  const wss = new WebSocketServer({ noServer: true });
  const parseSessionForWebSocket = getSession();

  httpServer.on("upgrade", (req, socket, head) => {
    let pathname: string;
    try {
      pathname = new URL(req.url || "", "http://localhost").pathname;
    } catch {
      socket.destroy();
      return;
    }
    if (pathname !== "/ws") return;

    const rejectUpgrade = () => {
      if (!socket.destroyed) {
        socket.end("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      }
    };

    // A valid session cookie alone must not permit browser cross-origin
    // WebSocket hijacking. Accept only explicit frontends or the same host.
    let allowedWsOrigin = false;
    try {
      const origin = new URL(String(req.headers.origin || ""));
      allowedWsOrigin = (origin.protocol === "https:" || origin.protocol === "http:") &&
        (allowedOrigins.has(origin.origin) || origin.host === req.headers.host);
    } catch {
      allowedWsOrigin = false;
    }
    if (!allowedWsOrigin) return rejectUpgrade();

    // Node's ServerResponse supplies headers/session-cookie methods expected
    // by express-session for a read-only HTTP upgrade request.
    const response = new ServerResponse(req);
    try {
      parseSessionForWebSocket(req as any, response as any, async (err?: any) => {
        if (err) return rejectUpgrade();
        const sessionUser = (req as any).session?.passport?.user;
        const sessionUserId = sessionUser?.claims?.sub || sessionUser?.id;
        if (typeof sessionUserId !== "string" || !sessionUserId) return rejectUpgrade();

        try {
          const activeUser = await storage.getUser(sessionUserId);
          if (!activeUser || activeUser.id !== sessionUserId ||
              activeUser.isActive === false ||
              activeUser.status === "suspended" || activeUser.status === "inactive") {
            return rejectUpgrade();
          }
          (req as any).authenticatedWsUserId = sessionUserId;
          wss.handleUpgrade(req, socket, head, ws => wss.emit("connection", ws, req));
        } catch (error) {
          console.error("WebSocket session verification failed:", error);
          rejectUpgrade();
        }
      });
    } catch (error) {
      console.error("WebSocket session parsing failed:", error);
      rejectUpgrade();
    }
  });

  wss.on("connection", (ws, req) => {
    const userId = (req as any).authenticatedWsUserId;
    if (typeof userId !== "string" || !userId) {
      ws.close(1008, "Unauthorized");
      return;
    }
    // One active socket per user; an obsolete socket must not remove a newer
    // connection's registration when it eventually closes.
    const previous = wsClients.get(userId);
    if (previous && previous !== ws) previous.close(1000, "Reconnected");
    wsClients.set(userId, ws);
    ws.on("close", () => {
      if (wsClients.get(userId) === ws) wsClients.delete(userId);
    });
  });

  // Idempotent automatic reminders on day 3, 7 and 12 after a successful invitation.
  // No extra payment, no account activation, no emails to activated/paused users.
  cron.schedule("0 9 * * *", async () => {
    try {
      const stats = await runBrokerInvitationReminders();
      console.log("[Invites] Daily reminder summary", stats);
    } catch (error) {
      console.error("[Invites] Daily reminder task failed:", error);
    }
  }, { timezone: "America/Mexico_City" });

  // Cron job for credit expiration alerts
  cron.schedule('0 9 * * *', async () => { // Daily at 9 AM
    console.log('Running daily credit expiration check...');
    
    const expiringCredits = await storage.getExpiringCredits(30);
    
    for (const credit of expiringCredits) {
      const notification = await storage.createNotification({
        userId: credit.brokerId,
        type: 'credit_expiring',
        title: 'Crédito próximo a vencer',
        message: `El crédito ${credit.id} vence en los próximos 30 días`,
        data: { creditId: credit.id },
        priority: 'high',
      });
      
      // Broadcast real-time notification
      broadcastToUser(credit.brokerId, {
        type: 'notification',
        notification,
      });
    }
  });

  return httpServer;
}
