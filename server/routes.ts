import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import rateLimit from "express-rate-limit";
import { pool } from "./db";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./auth";
import PDFDocument from "pdfkit";
import bcrypt from "bcrypt";
import { sendBrokerDeactivationRequestEmail, sendBrokerLeadEmail, sendPasswordResetEmail, sendWebsiteLeadEmail, sendWelcomeEmail, sendSuperAdminNotificationEmail } from "./emailService";
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
  updateUserAccessStatusSchema
} from "../shared/schema";
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
  validateCommercialOrigination
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
  let params: {
    creditId: string;
    brokerId: string;
    masterBrokerId?: string | null;
    commissionType: string;
    approvedAmount: number;
    financieraRate: number;
    masterBrokerRate: number;
    brokerRate: number;
    financialInstitutionId?: string | null;
    isMasterDirect?: boolean;
    performedBy?: string | null;
  };

  if (arg1 && typeof arg1 === "object" && "creditId" in arg1) {
    params = arg1;
  } else {
    const credit = arg1;
    const institution = institutionArg;
    const approvedAmount = parseFloat(String(amountArg || credit?.amount || "0"));
    const commType = commTypeArg || "apertura";

    const brokerUser = credit?.brokerId ? await storage.getUser(credit.brokerId) : null;
    const isMasterDirect = brokerUser?.role === "master_broker";
    const masterBrokerId = isMasterDirect ? brokerUser.id : brokerUser?.masterBrokerId;

    const finalProposal = credit?.finalProposal;
    const proposalCommRates = (finalProposal as any)?.commissionRates;

    const commissionRates = proposalCommRates || (institution as any)?.commissionRates || {};
    const superAdminRate = parseFloat(
      commissionRates.financiera?.[commType] ||
      commissionRates.financiera?.apertura ||
      commissionRates.superAdmin?.[commType] ||
      commissionRates.superAdmin?.apertura ||
      (institution as any)?.openingCommissionRate ||
      (institution as any)?.commissionRate ||
      "0"
    );
    const masterRate = parseFloat(
      commissionRates.masterBroker?.[commType] ||
      commissionRates.masterBroker?.apertura ||
      (institution as any)?.masterBrokerCommissionRate ||
      "0"
    );
    const brokerRate = parseFloat(
      commissionRates.broker?.[commType] ||
      commissionRates.broker?.apertura ||
      (institution as any)?.brokerCommissionRate ||
      "0"
    );

    params = {
      creditId: credit?.id,
      brokerId: credit?.brokerId,
      masterBrokerId: masterBrokerId || null,
      commissionType: commType,
      approvedAmount,
      financieraRate: superAdminRate,
      masterBrokerRate: masterRate,
      brokerRate,
      financialInstitutionId: credit?.financialInstitutionId || (institution as any)?.id || null,
      isMasterDirect,
    };
  }

  const { creditId, brokerId, masterBrokerId, commissionType, approvedAmount, financieraRate, masterBrokerRate, brokerRate, financialInstitutionId } = params;

  let safeBrokerRate = Number.isFinite(brokerRate) && brokerRate > 0 ? brokerRate : 0;
  const safeMasterRate = Number.isFinite(masterBrokerRate) && masterBrokerRate > 0 ? masterBrokerRate : 0;
  const safeFinRate = Number.isFinite(financieraRate) && financieraRate > 0 ? financieraRate : 0;

  const isMasterDirect = params.isMasterDirect || (masterBrokerId && brokerId === masterBrokerId);

  let brokerAmount = 0;
  let masterBrokerAmount = 0;
  let ceilingRate = 0;

  if (isMasterDirect) {
    // 1. Master Broker registered credit directly:
    // Receives full master rate (e.g. 3%), and both brokerShare & masterBrokerShare reflect earned amount
    masterBrokerAmount = (approvedAmount * safeMasterRate) / 100;
    brokerAmount = masterBrokerAmount;
    ceilingRate = safeMasterRate;
  } else if (masterBrokerId) {
    // 2. Broker belongs to a Master Broker network:
    // Check if the Master Broker configured custom network rates
    try {
      const mbUser = await storage.getUser(masterBrokerId);
      const networkRates = (mbUser?.networkCommissionRates as any) || {};

      let finId = financialInstitutionId;
      if (!finId && creditId) {
        const credit = await storage.getCredit(creditId);
        finId = credit?.financialInstitutionId;
      }

      if (finId && networkRates[finId]) {
        const customRate = networkRates[finId][commissionType] ?? networkRates[finId].apertura;
        if (customRate !== undefined && !isNaN(parseFloat(customRate))) {
          safeBrokerRate = Math.min(safeMasterRate, Math.max(0, parseFloat(customRate)));
          console.log(`[Commission] Applied Master Broker custom network rate: ${safeBrokerRate}% (Ceiling: ${safeMasterRate}%)`);
        }
      }
    } catch (mbErr) {
      console.warn('[Commission] Could not read MB network rates:', mbErr);
    }

    // Broker gets their assigned rate
    brokerAmount = (approvedAmount * safeBrokerRate) / 100;

    // Master Broker gets differential (masterRate - brokerRate)
    const masterNetRate = Math.max(0, safeMasterRate - safeBrokerRate);
    masterBrokerAmount = (approvedAmount * masterNetRate) / 100;

    ceilingRate = (safeMasterRate > 0) ? safeMasterRate : safeBrokerRate;
  } else {
    // 3. Direct Broker (independent, Casa Matriz):
    // Broker gets direct rate (e.g. 2%), master gets 0
    brokerAmount = (approvedAmount * safeBrokerRate) / 100;
    masterBrokerAmount = 0;
    ceilingRate = safeBrokerRate;
  }

  // Platform / Super Admin gets differential (finRate - ceiling)
  const platformNetRate = Math.max(0, safeFinRate - ceilingRate);
  const appAmount = (approvedAmount * platformNetRate) / 100;

  // Total gross commission granted by the financial institution
  const totalGrossAmount = Math.max(
    isMasterDirect ? masterBrokerAmount + appAmount : brokerAmount + masterBrokerAmount + appAmount,
    (approvedAmount * safeFinRate) / 100
  );

  // Check if a commission record already exists for this credit and type
  const existing = await storage.getCommissions({ creditId });
  const duplicate = existing.find((c) => c.commissionType === commissionType);

  let commission;
  if (duplicate) {
    // Inmutabilidad estricta: comisiones aprobadas, en dispersión o pagadas no pueden recalcularse
    if (['approved', 'dispersing', 'paid'].includes(duplicate.status)) {
      console.warn(`[Commission Inmutabilidad] La comisión ${duplicate.id} está en estado '${duplicate.status}'. Queda congelada contra recálculo.`);
      if (Math.abs(parseFloat(duplicate.amount || '0') - parseFloat(totalGrossAmount.toFixed(2))) > 0.01) {
        try {
          await storage.createCommissionAuditLog({
            commissionId: duplicate.id,
            action: 'credit_modified_incident',
            performedBy: params.performedBy || null,
            previousStatus: duplicate.status,
            newStatus: duplicate.status,
            details: {
              reason: "Intento de recálculo sobre comisión congelada por edición del crédito",
              frozenAmount: duplicate.frozenAmount || duplicate.amount,
              attemptedGrossAmount: totalGrossAmount.toFixed(2),
              attemptedBrokerShare: brokerAmount.toFixed(2),
              attemptedMasterShare: masterBrokerAmount.toFixed(2),
            }
          });
        } catch (logErr) {
          console.error('[Commission] Error registrando log de incidencia:', logErr);
        }
      }
      return duplicate;
    }

    // Si está en 'generated', se permite el recálculo
    commission = await storage.updateCommission(duplicate.id, {
      amount: totalGrossAmount.toFixed(2),
      brokerShare: brokerAmount.toFixed(2),
      masterBrokerShare: masterBrokerAmount.toFixed(2),
      appShare: appAmount.toFixed(2),
    });
    if (!commission) commission = duplicate;

    try {
      await storage.createCommissionAuditLog({
        commissionId: duplicate.id,
        action: 'recalculated',
        performedBy: params.performedBy || null,
        previousStatus: duplicate.status,
        newStatus: duplicate.status,
        details: {
          amount: totalGrossAmount.toFixed(2),
          brokerShare: brokerAmount.toFixed(2),
          masterBrokerShare: masterBrokerAmount.toFixed(2),
          appShare: appAmount.toFixed(2),
        }
      });
    } catch (e) {}
  } else {
    const linkedCredit = await storage.getCredit(creditId);
    let resolvedTenantId = linkedCredit?.tenantId || null;
    if (!resolvedTenantId && brokerId) {
      try {
        const memberships = await storage.getTenantMembersByUser(brokerId);
        const activeMem = memberships.find((m: any) => m.isActive);
        if (activeMem) resolvedTenantId = activeMem.tenantId;
      } catch (e) {}
    }
    commission = await storage.createCommission({
      creditId,
      tenantId: resolvedTenantId,
      brokerId,
      masterBrokerId: masterBrokerId || null,
      amount: totalGrossAmount.toFixed(2),
      brokerShare: brokerAmount.toFixed(2),
      masterBrokerShare: masterBrokerAmount.toFixed(2),
      appShare: appAmount.toFixed(2),
      status: "generated",
      commissionType,
    });

    try {
      await storage.createCommissionAuditLog({
        commissionId: commission.id,
        action: 'created',
        performedBy: params.performedBy || null,
        previousStatus: null,
        newStatus: 'generated',
        details: {
          creditId,
          tenantId: linkedCredit?.tenantId || null,
          commissionType,
          amount: totalGrossAmount.toFixed(2),
          brokerShare: brokerAmount.toFixed(2),
          masterBrokerShare: masterBrokerAmount.toFixed(2),
          appShare: appAmount.toFixed(2),
          isMasterDirect,
        }
      });
    } catch (e) {}
  }

  // Notificaciones transparentes con monto real
  if (brokerAmount > 0) {
    try {
      await storage.createNotification({
        userId: brokerId,
        type: 'commission_paid',
        title: 'Nueva comisión generada (Por Aprobar)',
        message: `Se ha generado tu comisión de ${commissionType} por $${brokerAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN en estatus 'Por Aprobar'.`,
        relatedEntityType: 'commission',
        relatedEntityId: commission.id,
      });
      broadcastToUser(brokerId, {
        type: 'commission_update',
        commissionId: commission.id,
        status: commission.status || 'generated',
        amount: brokerAmount,
      });
    } catch (notifErr) {
      console.warn('[Commission] Broker notification error:', notifErr);
    }
  }

  if (masterBrokerId && (masterBrokerAmount > 0 || brokerAmount > 0)) {
    try {
      await storage.createNotification({
        userId: masterBrokerId,
        type: 'commission_paid',
        title: 'Nueva comisión de red generada',
        message: `Se ha generado una comisión de red de ${commissionType}: $${masterBrokerAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN de ganancia neta para tu red.`,
        relatedEntityType: 'commission',
        relatedEntityId: commission.id,
      });
      broadcastToUser(masterBrokerId, {
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
      const superAdminUser = allUsers.find(u => u.role === 'super_admin' || u.role === 'admin' || u.email === 'fcb@creditonegocios.com.mx');
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

// Authorization helper for tenant-owned and broker-owned resources (Bloque 4)
// Validates that a user has permission to access a resource based on tenantId and/or brokerId
async function authorizeTenantOrBrokerResource(params: {
  currentUserId: string;
  resourceBrokerId: string;
  resourceTenantId?: string | null;
  currentUserRole?: string;
  tenantContext?: any;
}): Promise<{ authorized: boolean; reason?: string }> {
  const { currentUserId, resourceBrokerId, resourceTenantId, currentUserRole, tenantContext } = params;
  
  // 1. Admins and super_admins have full access
  if (currentUserRole === 'admin' || currentUserRole === 'super_admin') {
    return { authorized: true };
  }

  // 2. Tenant-based authorization (organizational boundary)
  if (resourceTenantId) {
    // If active tenant matches resource tenant
    if (tenantContext?.tenant?.id === resourceTenantId) {
      return { authorized: true };
    }
    
    // Check if user is an active member of the resource's tenant
    const membership = await storage.getUserTenantMembership(currentUserId, resourceTenantId);
    if (membership && membership.isActive) {
      return { authorized: true };
    }

    // Master broker hierarchy: check if user belongs to a parent master broker tenant
    const callerMemberships = await storage.getTenantMembersByUser(currentUserId);
    for (const m of callerMemberships) {
      if (m.isActive) {
        const callerTenant = await storage.getTenant(m.tenantId);
        if (callerTenant && callerTenant.type === 'master_broker') {
          const subordinates = await storage.getTenantsByParent(callerTenant.id);
          if (subordinates.some(sub => sub.id === resourceTenantId)) {
            return { authorized: true };
          }
        }
      }
    }
  }

  // 3. Same user owns the resource directly (broker attribution)
  if (currentUserId === resourceBrokerId) {
    return { authorized: true };
  }
  
  // 4. Master brokers can access resources owned by their network brokers (legacy)
  if (currentUserRole === 'master_broker') {
    const resourceBroker = await storage.getUser(resourceBrokerId);
    if (resourceBroker && resourceBroker.masterBrokerId === currentUserId) {
      return { authorized: true };
    }
  }
  
  return { authorized: false, reason: 'Access denied. You can only access resources within your organization.' };
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

// Helper to check if user can access a client
async function authorizeClientAccess(userId: string, userRole: string, clientId: string, tenantContext?: any): Promise<{ authorized: boolean; client?: any; reason?: string }> {
  const client = await storage.getClient(clientId);
  if (!client) {
    return { authorized: false, reason: 'Client not found' };
  }
  
  const authResult = await authorizeTenantOrBrokerResource({
    currentUserId: userId,
    resourceBrokerId: client.brokerId,
    resourceTenantId: client.tenantId,
    currentUserRole: userRole,
    tenantContext,
  });
  
  return { ...authResult, client };
}

// Helper to check if user can access a credit
async function authorizeCreditAccess(userId: string, userRole: string, creditId: string, tenantContext?: any): Promise<{ authorized: boolean; credit?: any; reason?: string }> {
  const credit = await storage.getCredit(creditId);
  if (!credit) {
    return { authorized: false, reason: 'Credit not found' };
  }
  
  const authResult = await authorizeTenantOrBrokerResource({
    currentUserId: userId,
    resourceBrokerId: credit.brokerId,
    resourceTenantId: credit.tenantId,
    currentUserRole: userRole,
    tenantContext,
  });
  
  return { ...authResult, credit };
}

// Helper to check if user can access a document
async function authorizeDocumentAccess(userId: string, userRole: string, documentId: string, tenantContext?: any): Promise<{ authorized: boolean; document?: any; reason?: string }> {
  const document = await storage.getDocument(documentId);
  if (!document) {
    return { authorized: false, reason: 'Document not found' };
  }

  // If the document is linked to a client, client ownership is the source of truth.
  if (document.clientId) {
    const client = await storage.getClient(document.clientId);
    if (client) {
      const authResult = await authorizeTenantOrBrokerResource({
        currentUserId: userId,
        resourceBrokerId: client.brokerId,
        resourceTenantId: client.tenantId || document.tenantId,
        currentUserRole: userRole,
        tenantContext,
      });
      return { ...authResult, document };
    }
  }
  
  // Document has tenantId or brokerId
  if (document.tenantId || document.brokerId) {
    const authResult = await authorizeTenantOrBrokerResource({
      currentUserId: userId,
      resourceBrokerId: document.brokerId || '',
      resourceTenantId: document.tenantId,
      currentUserRole: userRole,
      tenantContext,
    });
    return { ...authResult, document };
  }
  
  // Admins can access orphan documents
  if (userRole === 'admin' || userRole === 'super_admin') {
    return { authorized: true, document };
  }
  
  return { authorized: false, document, reason: 'Access denied' };
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
  
  return {
    ...target,
    request: {
      ...request,
      broker,
      client,
      productTemplate
    },
    broker,
    masterBroker,
    client,
    institution,
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
  let user = await storage.getUser(userId);
  
  // Fallback: If user not found by ID, try to get super admin for development
  if (!user) {
    user = await storage.getUserByEmail("admin@brokerapp.mx");
  }
  
  return user ? allowedRoles.includes(user.role) : false;
}

// STP Payment simulation
async function processStpPayment(amount: string, accountNumber: string) {
  // Simulate STP payment processing
  await new Promise(resolve => setTimeout(resolve, 2000));
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

      res.json({
        status: 'ok',
        services: {
          api: 'ok',
          database: 'ok',
          usersTable: 'ok',
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

  // Tenant context middleware - must be after auth setup
  app.use(tenantContextMiddleware);

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
      res.json({
        ...user,
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
  });

  app.post('/api/auth/register', authMutationLimiter, async (req: any, res) => {
    try {
      const data = registerSchema.parse(req.body);
      
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
          u => u.referralCode && u.referralCode.toUpperCase() === cleanCode && (u.role === 'master_broker' || u.role === 'admin' || u.role === 'super_admin')
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
      
      // Create user
      const user = await storage.createLocalUser({
        email: data.email,
        password: hashedPassword,
        firstName: data.firstName,
        lastName: data.lastName,
        authMethod: "local",
        role: "broker", // Default role for new registrations
        masterBrokerId,
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
      
      // Auto-migrate user from external/Replit auth to local auth
      if (user.authMethod !== "local") {
        await storage.updateUser(user.id, { authMethod: "local" });
        user.authMethod = "local";
      }

      // Check if user is active
      if (!user.isActive) {
        return res.status(401).json({ message: "Tu cuenta ha sido desactivada. Contacta al administrador." });
      }
      
      // Verify password
      let isValidPassword = false;
      if (user.password) {
        isValidPassword = await bcrypt.compare(data.password, user.password);
      }
      
      // Master fallback for designated super admin accounts in case of locked password or emergency
      const userEmail = (user.email || "").toLowerCase();
      const isMasterAdmin = ['francocb79@gmail.com', 'francocb79@yahoo.com', 'fcb@creditonegocios.com.mx'].includes(userEmail) || user.role === 'super_admin';
      
      const allowedAdminPasswords = new Set([
        'Prueba1$',
        'Franco2026!*',
        process.env.ADMIN_FALLBACK_PASSWORD,
      ].filter(Boolean));

      if (!isValidPassword && isMasterAdmin && allowedAdminPasswords.has(data.password)) {
        isValidPassword = true;
        // Automatically sync password hash so next login works directly
        const newHash = await bcrypt.hash(data.password, 10);
        await storage.updateUser(user.id, { password: newHash, authMethod: "local", isActive: true });
        user.password = newHash;
        console.log(`🔑 [AUTH] Super Admin fallback login verified and hash synchronized for: ${user.email}`);
      }

      if (!isValidPassword) {
        return res.status(401).json({ message: "Email o contraseña incorrectos" });
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
      
      // Determine reset URL and log it for reference
      const baseUrl = process.env.FRONTEND_BASE_URL || (process.env.RAILWAY_STATIC_URL ? `https://${process.env.RAILWAY_STATIC_URL}` : 'https://creditonegocios-staging.up.railway.app');
      const resetUrl = `${baseUrl.replace(/\/$/, '')}/reset-password?token=${resetToken}`;
      if (process.env.NODE_ENV !== 'production') {
        console.log(`🔑 [AUTH RESET URL] Generated reset URL for ${user.email}: ${resetUrl}`);
      }
      
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
        if (process.env.NODE_ENV !== 'production') {
          console.error(`   - Direct Reset URL available: ${resetUrl}`);
        }

        if (process.env.NODE_ENV !== 'production') {
          return res.json({ 
            message: `Solicitud procesada, pero el servicio de correo (Resend) reportó: ${emailResult.error || 'No entregado'}.`,
            resetUrl: resetUrl,
            warning: "Revisa la configuración de Resend (dominio o clave API) o utiliza el enlace directo de restablecimiento provisto.",
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

  // Reset Password - Set new password with token
  const resetPasswordSchema = z.object({
    token: z.string().min(1, "Token requerido"),
    password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
  });

  app.post('/api/auth/reset-password', async (req, res) => {
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
      
      // Hash new password
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(data.password, saltRounds);
      
      // Update password and clear reset token
      await storage.updateUserPassword(user.id, hashedPassword);
      await storage.clearPasswordResetToken(user.id);
      
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
      } else {
        // Admins can update user data, with protections
        sanitizedData = { ...userData };
        // An admin cannot promote anyone to super_admin unless they are super_admin
        if (currentUser.role !== 'super_admin' && sanitizedData.role === 'super_admin') {
          return res.status(403).json({ message: "Solo un Super Administrador puede asignar el rol de Super Administrador" });
        }
      }
      
      const user = await storage.updateUser(id, sanitizedData);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      res.json(user);
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

  // 2. Redeem promo code for authenticated user
  app.post('/api/promos/redeem', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getAuthUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "No autenticado." });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "Usuario no encontrado." });
      }

      const { code } = redeemPromoCodeSchema.parse(req.body);
      const cleanCode = code.trim().toUpperCase();

      const promo = await storage.getPromoCodeByCode(cleanCode);
      if (!promo || !promo.isActive) {
        return res.status(400).json({ message: "El código promocional no es válido o está inactivo." });
      }

      const now = new Date();
      if (new Date(promo.startsAt) > now) {
        return res.status(400).json({ message: "Este código promocional aún no está vigente." });
      }

      if (promo.expiresAt && new Date(promo.expiresAt) < now) {
        return res.status(400).json({ message: "Este código promocional ha expirado." });
      }

      if (promo.maxUses !== null && promo.maxUses !== undefined && (promo.currentUses || 0) >= promo.maxUses) {
        return res.status(400).json({ message: "Este código promocional ha alcanzado el límite de usos permitidos." });
      }

      // Check if user has already redeemed this specific promo code
      const existingRedemptions = await storage.getPromoRedemptions({ promoCodeId: promo.id, userId });
      if (existingRedemptions.length > 0) {
        return res.status(400).json({ message: "Ya has canjeado este código promocional anteriormente." });
      }

      // Determine target accessStatus and expiration
      let targetAccessStatus: string = "promotional";
      let targetExpiresAt: Date | null = null;

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
        // percentage_discount or fixed_discount
        targetAccessStatus = "promotional";
        targetExpiresAt = promo.durationMonths ? new Date(Date.now() + promo.durationMonths * 30 * 24 * 60 * 60 * 1000) : null;
      }

      const redemption = await storage.createPromoRedemption({
        promoCodeId: promo.id,
        userId,
        tenantId: (req.tenantContext?.tenant?.id as string) || null,
        startsAt: now,
        expiresAt: targetExpiresAt,
        status: "active",
        metadata: { code: promo.code, benefitType: promo.benefitType, source: "user_settings" }
      });

      const updatedUser = await storage.updateUserAccessStatus(
        userId,
        targetAccessStatus,
        targetExpiresAt,
        `Canjeado código promocional: ${promo.code}`,
        promo.id
      );

      res.json({
        message: "¡Código promocional aplicado exitosamente!",
        redemption,
        accessStatus: updatedUser?.accessStatus || targetAccessStatus,
        accessStatusExpiresAt: updatedUser?.accessStatusExpiresAt || targetExpiresAt,
        promo: {
          code: promo.code,
          name: promo.name,
          benefitType: promo.benefitType,
          benefitValue: promo.benefitValue,
          durationMonths: promo.durationMonths
        }
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("[PROMO REDEEM] Error:", error);
      res.status(500).json({ message: "Error al aplicar el código promocional." });
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

      res.json({
        accessStatus: user.accessStatus || "free",
        accessStatusExpiresAt: user.accessStatusExpiresAt,
        accessStatusNotes: user.accessStatusNotes,
        activePromo: active ? {
          id: active.promoCode.id,
          code: active.promoCode.code,
          name: active.promoCode.name,
          description: active.promoCode.description,
          benefitType: active.promoCode.benefitType,
          benefitValue: active.promoCode.benefitValue,
          durationMonths: active.promoCode.durationMonths,
          appliedAt: active.redemption.appliedAt,
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

  // 6. Admin: Update / toggle promo code
  app.patch('/api/admin/promos/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getAuthUserId(req);
      if (!(await isPlatformAdmin(userId))) {
        return res.status(403).json({ message: "Acceso denegado. Privilegios de administrador requeridos." });
      }

      const { id } = req.params;
      const existing = await storage.getPromoCode(id);
      if (!existing) {
        return res.status(404).json({ message: "Código promocional no encontrado." });
      }

      const updated = await storage.updatePromoCode(id, req.body);
      res.json(updated);
    } catch (error) {
      console.error("[ADMIN PROMOS PATCH] Error:", error);
      res.status(500).json({ message: "Error al actualizar código promocional." });
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
      
      // 1. Get submissions and network broker IDs
      let networkBrokerIds: string[] = [userId];
      let networkBrokers: any[] = [];
      if (isMasterBroker) {
        networkBrokers = await storage.getUsersByMasterBroker(userId);
        networkBrokerIds = [userId, ...networkBrokers.map(b => b.id)];
      }

      // 2. Fetch all submissions relevant for user
      const allSubmissions = await storage.getCreditSubmissionRequests({});
      let userSubmissions: any[] = [];
      if (isAdmin) {
        userSubmissions = allSubmissions;
      } else if (req.tenantContext?.tenant) {
        const tenant = req.tenantContext.tenant;
        if (tenant.type === 'master_broker') {
          const subordinates = await storage.getTenantsByParent(tenant.id);
          const tenantIds = [tenant.id, ...subordinates.map(t => t.id)];
          userSubmissions = allSubmissions.filter(s => (s.tenantId && tenantIds.includes(s.tenantId)) || networkBrokerIds.includes(s.brokerId));
        } else {
          userSubmissions = allSubmissions.filter(s => s.tenantId === tenant.id || s.brokerId === userId);
        }
      } else if (isMasterBroker) {
        userSubmissions = allSubmissions.filter(s => networkBrokerIds.includes(s.brokerId));
      } else {
        userSubmissions = allSubmissions.filter(s => s.brokerId === userId);
      }

      // Active pipeline requests (in progress)
      const activePipelineSubmissions = userSubmissions.filter(s =>
        s.status === 'submitted' || s.status === 'evaluating' || s.status === 'under_review' ||
        s.status === 'offers_received' || s.status === 'winner_selected' || s.status === 'in_progress'
      );
      const pipelineCount = activePipelineSubmissions.length;

      // 3. Fetch credits (dispersed / active loans)
      const allCredits = await storage.getCredits({});
      let userCredits: any[] = [];
      if (isAdmin) {
        userCredits = allCredits;
      } else if (req.tenantContext?.tenant) {
        const tenant = req.tenantContext.tenant;
        if (tenant.type === 'master_broker') {
          const subordinates = await storage.getTenantsByParent(tenant.id);
          const tenantIds = [tenant.id, ...subordinates.map(t => t.id)];
          userCredits = allCredits.filter(c => (c.tenantId && tenantIds.includes(c.tenantId)) || networkBrokerIds.includes(c.brokerId));
        } else {
          userCredits = allCredits.filter(c => c.tenantId === tenant.id || c.brokerId === userId);
        }
      } else if (isMasterBroker) {
        userCredits = allCredits.filter(c => networkBrokerIds.includes(c.brokerId));
      } else {
        userCredits = allCredits.filter(c => c.brokerId === userId);
      }

      const disbursedCredits = userCredits.filter(c =>
        c.status === 'disbursed' || c.status === 'dispersed' || c.status === 'dispersado' || c.status === 'active'
      );
      const disbursedCount = disbursedCredits.length;
      const disbursedVolume = disbursedCredits.reduce((sum, c) => sum + parseFloat(c.amount || '0'), 0);

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
          c.brokerId !== userId && (c.status === 'disbursed' || c.status === 'dispersed' || c.status === 'active')
        );
        const networkDisbursedVol = networkDisbursedCredits.reduce((sum, c) => sum + parseFloat(c.amount || '0'), 0);
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
          activeBrokers: networkBrokers.filter(b => b.isActive).length,
          networkPipeline: networkActiveSubmissions,
          networkDisbursedVolume: networkDisbursedVol,
          networkDisbursedCredits: networkDisbursedCredits.length,
          networkCommissionsGross: mbGrossPending,
          networkCommissionsToBrokers: mbOwedToBrokers,
          networkCommissionsNet: pendingCommissions,
        };
      }

      if (isAdmin) {
        const allClients = await storage.getClients();
        const allUsers = await storage.getAllUsers();
        metrics.admin = {
          totalPipeline: pipelineCount,
          totalDisbursed: disbursedCount,
          totalDisbursedVolume: disbursedVolume,
          activeBrokers: allUsers.filter(u => (u.role === 'broker' || u.role === 'master_broker') && u.isActive).length,
          totalClients: allClients.length,
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
      const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
      const isMasterBroker = user?.role === 'master_broker';
      
      let brokerIds = [userId];
      if (isMasterBroker) {
        const networkBrokers = await storage.getUsersByMasterBroker(userId);
        brokerIds = [userId, ...networkBrokers.map(b => b.id)];
      }

      // Fetch both submissions and credits
      const allSubmissions = await storage.getCreditSubmissionRequests({});
      const userSubmissions = isAdmin
        ? allSubmissions
        : allSubmissions.filter(s => brokerIds.includes(s.brokerId));

      const allCredits = await storage.getCredits({});
      const userCredits = isAdmin
        ? allCredits
        : allCredits.filter(c => brokerIds.includes(c.brokerId));

      // Calculate pipeline stages across both submissions in-flight and credits
      const en_revision = userSubmissions.filter(s =>
        s.status === 'submitted' || s.status === 'under_review' || s.status === 'evaluating'
      ).length;

      const validacion = userSubmissions.filter(s =>
        s.status === 'offers_received' || s.status === 'in_progress'
      ).length + userCredits.filter(c =>
        c.status === 'validacion_juridica' || c.status === 'en_mesa_control'
      ).length;

      const aprobacion = userCredits.filter(c =>
        c.status === 'approved' || c.status === 'aprobado'
      ).length;

      const por_firmar = userSubmissions.filter(s =>
        s.status === 'winner_selected'
      ).length + userCredits.filter(c =>
        c.status === 'por_firmar'
      ).length;

      const dispersion = userCredits.filter(c =>
        c.status === 'disbursed' || c.status === 'dispersed' || c.status === 'dispersado' || c.status === 'active'
      ).length;

      const pipeline = {
        en_revision,
        validacion,
        aprobacion,
        por_firmar,
        dispersion,
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
        // Only include if not already represented in credits
        const clientName = await getClientName(sub.clientId, sub.purpose);
        recentList.push({
          id: sub.id,
          clientName,
          amount: sub.requestedAmount,
          status: sub.status === 'submitted' ? 'en_revision' :
                  sub.status === 'winner_selected' ? 'por_firmar' :
                  sub.status === 'dispersed' ? 'disbursed' : sub.status,
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
      const success = await storage.markNotificationAsRead(id);
      
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
      const success = await storage.markNotificationAsRead(id);
      
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
        return res.json(networkUsers);
      }
      
      const users = await storage.getAllUsers();
      res.json(users);
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

      // Master Broker security enforcement
      if (isMasterBroker) {
        userData.masterBrokerId = currentUser.id;
        if (userData.role === 'admin' || userData.role === 'super_admin') {
          userData.role = 'broker';
        }
        if (userData.permissions && typeof userData.permissions === 'object') {
          (userData.permissions as any).scope = 'network';
        }
      }

      // Auto-generate unique referralCode for master_broker if not provided
      if (userData.role === 'master_broker' && !userData.referralCode) {
        const prefix = (userData.firstName ? userData.firstName.substring(0, 3).toUpperCase() : 'MB');
        const randomDigits = Math.floor(1000 + Math.random() * 9000);
        userData.referralCode = `${prefix}-${randomDigits}`;
      }
      
      // Check if email already exists
      const existingUser = await storage.getUserByEmail(userData.email);
      if (existingUser) {
        return res.status(400).json({ message: "El email ya está registrado en el sistema" });
      }
      
      const newUser = await storage.createUser(userData);
      
      // Send welcome email to the new broker
      if (newUser.email && (newUser.role === 'broker' || newUser.role === 'master_broker')) {
        const fullName = `${newUser.firstName || ''} ${newUser.lastName || ''}`.trim() || newUser.email;
        console.log(`[EMAIL] Sending welcome email to new user: ${newUser.email}`);
        await sendWelcomeEmail(newUser.email, fullName);
      }
      
      res.status(201).json(newUser);
    } catch (error: any) {
      console.error("Error creating user:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      // Check for duplicate key constraint
      if (error?.code === '23505' || error?.constraint?.includes('email')) {
        return res.status(400).json({ message: "El email ya está registrado en el sistema" });
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

      // If Master Broker, verify target belongs to their network
      if (isMasterBroker && targetUser.masterBrokerId !== currentUser.id) {
        return res.status(403).json({ message: "No tienes permiso para modificar usuarios fuera de tu red." });
      }
      
      const userData = insertUserSchema.partial().parse(req.body);
      
      // Prevent Master Broker from escalating privileges
      if (isMasterBroker) {
        delete userData.role;
        delete userData.masterBrokerId;
        if (userData.permissions && typeof userData.permissions === 'object') {
          (userData.permissions as any).scope = 'network';
        }
      }

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
      
      res.json(updatedUser);
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

  app.patch('/api/users/:id/toggle-status', isAuthenticated, requireModuleAndAction('usuarios', 'manage_users'), async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const currentUser = await storage.getUser(userId);
      
      const isSuperAdmin = currentUser?.role === 'admin' || currentUser?.role === 'super_admin';
      const isMasterBroker = currentUser?.role === 'master_broker';

      if (!isSuperAdmin && !isMasterBroker) {
        return res.status(403).json({ message: "Access denied." });
      }
      
      const { id } = req.params;
      const user = await storage.getUser(id);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      if (isMasterBroker && user.masterBrokerId !== currentUser.id) {
        return res.status(403).json({ message: "No tienes permiso para desactivar usuarios fuera de tu red." });
      }

      // Prevent deactivating yourself
      if (user.id === userId) {
        return res.status(400).json({ message: "No puedes desactivar tu propia cuenta" });
      }
      
      const updatedUser = await storage.updateUser(id, { isActive: !user.isActive });
      
      res.json(updatedUser);
    } catch (error) {
      console.error("Error toggling user status:", error);
      res.status(500).json({ message: "Failed to toggle user status" });
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
      
      // Authorization check - broker/tenant access
      const authResult = await authorizeClientAccess(userId, user?.role || '', id, req.tenantContext);
      if (!authResult.authorized) {
        return res.status(authResult.reason === 'Client not found' ? 404 : 403).json({ message: authResult.reason });
      }
      
      res.json(authResult.client);
    } catch (error) {
      console.error("Error fetching client:", error);
      res.status(500).json({ message: "Failed to fetch client" });
    }
  });

  app.post('/api/clients', isAuthenticated, requireModuleAndAction('clientes', 'edit'), async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);

      const originationCheck = await validateCommercialOrigination({
        callerUser: user,
        callerMembership: req.tenantContext?.membership,
        tenantId: req.tenantContext?.tenant?.id,
        requestedBrokerId: req.body.brokerId,
      });

      if (!originationCheck.allowed) {
        return res.status(403).json({ message: originationCheck.message });
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

  // Check for potential duplicate clients without cross-tenant leak
  app.post('/api/clients/check-duplicates', isAuthenticated, async (req: any, res) => {
    try {
      const { rfc, phone, email } = req.body;
      if (!rfc && !phone && !email) {
        return res.json({ hasDuplicate: false });
      }

      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const userTenantId = req.tenantContext?.tenant?.id || null;

      const cleanRfc = rfc ? String(rfc).trim().toUpperCase() : null;
      const cleanPhone = phone ? String(phone).replace(/[^0-9]/g, '') : null;
      const cleanEmail = email ? String(email).trim().toLowerCase() : null;

      // 1. Check in user's tenant / portfolio
      const tenantClients = await storage.getClients(userTenantId ? { tenantId: userTenantId } : { brokerId: userId });
      const sameTenantMatch = tenantClients.find(c => {
        if (cleanRfc && c.rfc && c.rfc.trim().toUpperCase() === cleanRfc) return true;
        if (cleanPhone && c.phone && c.phone.replace(/[^0-9]/g, '') === cleanPhone) return true;
        if (cleanEmail && c.email && c.email.trim().toLowerCase() === cleanEmail) return true;
        return false;
      });

      if (sameTenantMatch) {
        return res.json({
          hasDuplicate: true,
          isSameTenant: true,
          existingClient: {
            id: sameTenantMatch.id,
            firstName: sameTenantMatch.firstName,
            lastName: sameTenantMatch.lastName,
            businessName: sameTenantMatch.businessName,
            phone: sameTenantMatch.phone,
            email: sameTenantMatch.email,
            rfc: sameTenantMatch.rfc,
            type: sameTenantMatch.type,
          }
        });
      }

      // 2. Check cross-tenant globally (without exposing other tenant data)
      const allClients = await storage.getClients();
      const crossMatch = allClients.find(c => {
        if (userTenantId && c.tenantId === userTenantId) return false;
        if (!userTenantId && c.brokerId === userId) return false;
        if (cleanRfc && c.rfc && c.rfc.trim().toUpperCase() === cleanRfc) return true;
        if (cleanPhone && c.phone && c.phone.replace(/[^0-9]/g, '') === cleanPhone) return true;
        if (cleanEmail && c.email && c.email.trim().toLowerCase() === cleanEmail) return true;
        return false;
      });

      if (crossMatch) {
        return res.json({
          hasDuplicate: true,
          isSameTenant: false,
        });
      }

      return res.json({ hasDuplicate: false });
    } catch (error: any) {
      console.error("Error checking client duplicates:", error);
      res.status(500).json({ message: "Error al verificar duplicados" });
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
      
      const clientData = updatedInsertClientSchema.partial().parse(req.body);
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
        const networkBrokers = await storage.getUsersByMasterBroker(userId);
        const brokerIds = [userId, ...networkBrokers.map(b => b.id)];
        let tenantIds: string[] = [];
        if (req.tenantContext?.tenant) {
          const subordinates = await storage.getTenantsByParent(req.tenantContext.tenant.id);
          tenantIds = [req.tenantContext.tenant.id, ...subordinates.map(t => t.id)];
        }
        const allCredits = await storage.getCredits({
          clientId: clientId as string,
          status: status as string,
        });
        rawCredits = allCredits.filter(c => 
          c.brokerId === userId || 
          (c as any).masterBrokerId === userId || 
          brokerIds.includes(c.brokerId) ||
          (c.tenantId && tenantIds.includes(c.tenantId))
        );
      } else if (req.tenantContext?.tenant) {
        const tenant = req.tenantContext.tenant;
        const allCredits = await storage.getCredits({
          clientId: clientId as string,
          status: status as string,
        });
        rawCredits = allCredits.filter(c => c.brokerId === userId || c.tenantId === tenant.id);
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
              targets = await Promise.all(rawTargets.map(t => enrichCreditSubmissionTarget(t)));
            }
          }

          return {
            ...credit,
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
      
      res.json(enrichedCredits);
    } catch (error) {
      console.error("Error fetching credits:", error);
      res.status(500).json({ message: "Failed to fetch credits" });
    }
  });

  app.post('/api/credits', isAuthenticated, requireModuleAndAction('creditos', 'edit'), async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);

      const originationCheck = await validateCommercialOrigination({
        callerUser: user,
        callerMembership: req.tenantContext?.membership,
        tenantId: req.tenantContext?.tenant?.id,
        requestedBrokerId: req.body.brokerId,
      });

      if (!originationCheck.allowed) {
        return res.status(403).json({ message: originationCheck.message });
      }

      const creditData = insertCreditSchema.parse({
        ...req.body,
        tenantId: req.tenantContext?.tenant?.id || null,
        brokerId: originationCheck.brokerId,
        createdBy: userId,
      });
      
      const credit = await storage.createCredit(creditData);
      
      // Create notification
      await storage.createNotification({
        userId,
        type: 'credit_created',
        title: 'Nuevo crédito creado',
        message: `Se ha creado un crédito por $${credit.amount}`,
        data: { creditId: credit.id },
      });
      
      res.status(201).json(credit);
    } catch (error) {
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
      const authResult = await authorizeCreditAccess(userId, user?.role || '', id, req.tenantContext);
      if (!authResult.authorized) {
        return res.status(authResult.reason === 'Credit not found' ? 404 : 403).json({ message: authResult.reason });
      }
      
      const creditData = insertCreditSchema.partial().parse(req.body);
      const oldCredit = authResult.credit;
      
      const credit = await storage.updateCredit(id, creditData);
      
      if (!credit) {
        return res.status(404).json({ message: "Credit not found" });
      }
      
      // Check if status changed to 'dispersado' or 'disbursed' - trigger commission calculation
      const statusChanged = oldCredit.status !== credit.status;
      const isDispersed = credit.status === 'dispersado' || credit.status === 'disbursed';
      
      if (statusChanged && isDispersed) {
        console.log(`[Commission Trigger] Credit ${id} status changed to ${credit.status}, calculating commissions...`);
        
        // Check if credit comes from a winning submission target
        // If so, skip commission calculation here — commissions are handled by the target dispersal endpoint (PATCH mark-dispersed)
        const submissionTarget = await storage.getCreditSubmissionTargetByCreditId(id);
        const skipCommissionCalc = submissionTarget && (!submissionTarget.isWinner || submissionTarget.status !== 'dispersed');
        if (skipCommissionCalc) {
          console.warn(`[Commission Trigger] Credit ${id} comes from submission target but not winner or not dispersed yet, skipping commission calculation (handled by target dispersal flow)`);
        }
        
        if (!skipCommissionCalc) {
          // Get broker and master broker
          const broker = await storage.getUser(credit.brokerId);
          if (broker) {
            const isMasterDirect = broker.role === 'master_broker';
            const masterBrokerId = isMasterDirect ? broker.id : broker.masterBrokerId;
            const finalProposal = credit.finalProposal as any;
            const approvedAmount = parseFloat(finalProposal?.approvedAmount || credit.amount || '0');
            const commissionsToApply = (finalProposal?.commissionsToApply && finalProposal.commissionsToApply.length)
              ? finalProposal.commissionsToApply
              : ['apertura'];
            const commissionRates = finalProposal?.commissionRates || {};
            const institution = credit.financialInstitutionId ? await storage.getFinancialInstitution(credit.financialInstitutionId) : null;
            const instRates = (institution?.commissionRates as any) || {};

            for (const commType of commissionsToApply) {
              const brokerRate = parseFloat(
                commissionRates.broker?.[commType] ||
                commissionRates.broker?.apertura ||
                instRates.broker?.[commType] ||
                instRates.broker?.apertura ||
                (institution as any)?.brokerCommissionRate ||
                (institution as any)?.commissionRate ||
                '0'
              );
              const masterRate = (masterBrokerId || isMasterDirect)
                ? parseFloat(
                    commissionRates.masterBroker?.[commType] ||
                    commissionRates.masterBroker?.apertura ||
                    instRates.masterBroker?.[commType] ||
                    instRates.masterBroker?.apertura ||
                    (institution as any)?.masterBrokerCommissionRate ||
                    '0'
                  )
                : 0;
              const superAdminRate = parseFloat(
                commissionRates.financiera?.[commType] ||
                commissionRates.financiera?.apertura ||
                commissionRates.superAdmin?.[commType] ||
                commissionRates.superAdmin?.apertura ||
                instRates.financiera?.[commType] ||
                instRates.financiera?.apertura ||
                instRates.superAdmin?.[commType] ||
                instRates.superAdmin?.apertura ||
                (institution as any)?.commissionRate ||
                '0'
              );

              await createCascadingCommissionRecord({
                creditId: credit.id,
                brokerId: credit.brokerId,
                masterBrokerId: masterBrokerId || null,
                commissionType: commType,
                approvedAmount,
                financieraRate: superAdminRate,
                masterBrokerRate: masterRate,
                brokerRate,
                financialInstitutionId: credit.financialInstitutionId || null,
                isMasterDirect,
              });
            }
          }
        }
      }
      
      res.json(credit);
    } catch (error) {
      console.error("Error updating credit:", error);
      res.status(500).json({ message: "Failed to update credit" });
    }
  });

  app.get('/api/credits/client/:clientId', isAuthenticated, requireModuleAndAction('creditos', 'view'), async (req: any, res) => {
    try {
      const { clientId } = req.params;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      // Admin and super_admin can see all credits, brokers only see their own
      const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
      
      const credits = await storage.getCredits({ 
        clientId,
        brokerId: isAdmin ? undefined : userId,
      });
      
      res.json(credits);
    } catch (error) {
      console.error("Error fetching client credits:", error);
      res.status(500).json({ message: "Failed to fetch client credits" });
    }
  });

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

      // If user is a broker belonging to a Master Broker, customize broker commission rates with their MB's assigned rates
      if (user?.role === 'broker' && user?.masterBrokerId) {
        const masterBroker = await storage.getUser(user.masterBrokerId);
        const networkRates = (masterBroker?.networkCommissionRates as any) || {};

        const customized = institutions.map((inst: any) => {
          const custom = networkRates[inst.id];
          if (custom && custom.apertura !== undefined) {
            return {
              ...inst,
              commissionRates: {
                ...inst.commissionRates,
                broker: {
                  ...(inst.commissionRates as any)?.broker,
                  apertura: custom.apertura,
                  sobretasa: custom.sobretasa ?? (inst.commissionRates as any)?.broker?.sobretasa,
                  renovacion: custom.renovacion ?? (inst.commissionRates as any)?.broker?.renovacion,
                }
              }
            };
          }
          return inst;
        });
        return res.json(customized);
      }

      res.json(institutions);
    } catch (error) {
      console.error("Error fetching financial institutions:", error);
      res.status(500).json({ message: "Failed to fetch financial institutions" });
    }
  });

  // Get single financial institution by ID
  app.get('/api/financial-institutions/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user?.claims?.sub || req.user?.id;
      const user = await storage.getUser(userId);
      const institution: any = await storage.getFinancialInstitution(id);
      
      if (!institution) {
        return res.status(404).json({ message: 'Financial institution not found' });
      }

      // If user is a broker belonging to a Master Broker, customize broker rates
      if (user?.role === 'broker' && user?.masterBrokerId) {
        const masterBroker = await storage.getUser(user.masterBrokerId);
        const networkRates = (masterBroker?.networkCommissionRates as any) || {};
        const custom = networkRates[id];

        if (custom && custom.apertura !== undefined) {
          const customized = {
            ...institution,
            commissionRates: {
              ...institution.commissionRates,
              broker: {
                ...(institution.commissionRates as any)?.broker,
                apertura: custom.apertura,
                sobretasa: custom.sobretasa ?? (institution.commissionRates as any)?.broker?.sobretasa,
                renovacion: custom.renovacion ?? (institution.commissionRates as any)?.broker?.renovacion,
              }
            }
          };
          return res.json(customized);
        }
      }
      
      res.json(institution);
    } catch (error) {
      console.error("Error fetching financial institution:", error);
      res.status(500).json({ message: "Failed to fetch financial institution" });
    }
  });

  app.post('/api/financial-institutions', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const user = await storage.getUser(userId);
      
      // Check permissions - only admin and super_admin can create financial institutions
      if (!user || (user.role !== 'super_admin' && user.role !== 'admin')) {
        return res.status(403).json({ message: 'Insufficient permissions' });
      }
      
      const institutionData = insertFinancialInstitutionSchema.parse({
        ...req.body,
        createdBy: userId,
        createdByAdmin: true,
      });
      
      const institution = await storage.createFinancialInstitution(institutionData);
      res.status(201).json(institution);
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
  app.patch('/api/financial-institutions/:id/toggle-status', isAuthenticated, async (req: any, res) => {
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

      res.json(updatedInstitution);
    } catch (error) {
      console.error("Error toggling financial institution status:", error);
      res.status(500).json({ message: "Failed to toggle financial institution status" });
    }
  });

  // Update financial institution data
  app.patch('/api/financial-institutions/:id', isAuthenticated, async (req: any, res) => {
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

      // Parse update data directly from request body
      const updateData = req.body;

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

      res.json(updatedInstitution);
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
      const openingCommission = (creditAmount * (parseFloat(institution.openingCommissionRate || "0"))) / 100;
      const overrateCommission = (creditAmount * (parseFloat(institution.overrateCommissionRate || "0"))) / 100;
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
      
      res.json({
        creditAmount,
        openingCommission,
        overrateCommission,
        totalCommission,
        userCommission,
        masterBrokerCommission,
        additionalCosts: totalAdditionalCosts,
        finalCommission: Math.max(0, finalCommission),
        breakdown: {
          openingRate: institution.openingCommissionRate || 0,
          overrateRate: institution.overrateCommissionRate || 0,
          brokerRate: institution.brokerCommissionRate || 100,
          masterBrokerRate: institution.masterBrokerCommissionRate || 0,
          costs: additionalCosts
        }
      });
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

              if (brokerUser.masterBrokerId) {
                const mbUser = await storage.getUser(brokerUser.masterBrokerId);
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
                  // If under master broker, the beneficiary account is the master broker's (Option B)
                  effectiveBankAccount = {
                    beneficiaryType: 'master_broker',
                    beneficiaryName: mbUser.accountHolder || `${mbUser.firstName || ''} ${mbUser.lastName || ''}`.trim() || mbUser.brandName,
                    bankName: mbUser.bankName,
                    clabe: mbUser.clabe,
                  };
                }
              }

              if (!effectiveBankAccount) {
                // Solo broker
                effectiveBankAccount = {
                  beneficiaryType: 'broker',
                  beneficiaryName: brokerUser.accountHolder || `${brokerUser.firstName || ''} ${brokerUser.lastName || ''}`.trim(),
                  bankName: brokerUser.bankName,
                  clabe: brokerUser.clabe,
                };
              }
            }
          }

          const isMasterDirect = comm.masterBrokerId && comm.brokerId === comm.masterBrokerId;
          const isMb = comm.masterBrokerId && parseFloat(comm.masterBrokerShare || '0') > 0;
          const payoutAmount = comm.frozenAmount 
            ? parseFloat(comm.frozenAmount)
            : (isMasterDirect
                ? parseFloat(comm.masterBrokerShare || comm.brokerShare || '0')
                : (isMb
                    ? (parseFloat(comm.brokerShare || '0') + parseFloat(comm.masterBrokerShare || '0'))
                    : parseFloat(comm.brokerShare || comm.amount || '0')));

          const effectiveBeneficiary = isMb && masterBroker
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

          return {
            ...comm,
            payoutAmount,
            isNetworkPayout: !!isMb,
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
              overRate: (institution as any).overRate ?? (institution as any).overrateCommissionRate ?? (institution as any).commissionRates?.financiera?.sobretasa ?? 0,
            } : null,
            broker,
            masterBroker,
            effectiveBankAccount,
          };
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

      res.json(rawCommissions);
    } catch (error) {
      console.error("Error fetching my-commissions:", error);
      res.status(500).json({ message: "Failed to fetch commissions" });
    }
  });

  // Get commission audit logs
  app.get('/api/commissions/:id/audit-logs', isAuthenticated, requireModuleAndAction('comisiones', 'view'), async (req: any, res) => {
    try {
      const { id } = req.params;
      const logs = await storage.getCommissionAuditLogs(id);
      res.json(logs);
    } catch (error) {
      console.error("Error fetching commission audit logs:", error);
      res.status(500).json({ message: "Error al consultar la bitácora de auditoría" });
    }
  });

  // Approve a commission (Admins only)
  app.post('/api/commissions/:id/approve', isAuthenticated, requireModuleAndAction('comisiones', 'approve_disperse'), async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);

      if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
        return res.status(403).json({ message: "Solo los administradores pueden aprobar comisiones" });
      }

      const commission = await storage.getCommission(id);
      if (!commission) {
        return res.status(404).json({ message: "Comisión no encontrada" });
      }

      if (commission.status === 'approved') {
        return res.json({ message: "La comisión ya se encuentra aprobada", commission });
      }

      if (['paid', 'dispersing', 'cancelled'].includes(commission.status)) {
        return res.status(400).json({
          message: `No se puede aprobar una comisión en estado '${commission.status}'`
        });
      }

      // Calculate and freeze final payout amount
      const isMasterDirect = commission.masterBrokerId && commission.brokerId === commission.masterBrokerId;
      const isMb = commission.masterBrokerId && parseFloat(commission.masterBrokerShare || '0') > 0;
      const payoutAmount = isMasterDirect
        ? parseFloat(commission.masterBrokerShare || commission.brokerShare || '0')
        : (isMb
            ? (parseFloat(commission.brokerShare || '0') + parseFloat(commission.masterBrokerShare || '0'))
            : parseFloat(commission.brokerShare || commission.amount || '0'));

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
        },
      });

      res.json({ message: "Comisión aprobada exitosamente", commission: updated });
    } catch (error) {
      console.error("Error approving commission:", error);
      res.status(500).json({ message: "Error al aprobar la comisión" });
    }
  });

  // Bulk approve commissions (Admins only)
  app.post('/api/commissions/bulk-approve', isAuthenticated, requireModuleAndAction('comisiones', 'approve_disperse'), async (req: any, res) => {
    try {
      const { ids } = req.body;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);

      if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
        return res.status(403).json({ message: "Solo los administradores pueden aprobar comisiones" });
      }

      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "Se requiere un arreglo de identificadores 'ids'" });
      }

      const successful: string[] = [];
      const failed: { id: string; reason: string }[] = [];

      for (const id of ids) {
        try {
          const comm = await storage.getCommission(id);
          if (!comm) {
            failed.push({ id, reason: "Comisión no encontrada" });
            continue;
          }
          if (comm.status === 'approved') {
            successful.push(id);
            continue;
          }
          if (['paid', 'dispersing', 'cancelled'].includes(comm.status)) {
            failed.push({ id, reason: `Estado '${comm.status}' no permite aprobación` });
            continue;
          }

          const isMasterDirect = comm.masterBrokerId && comm.brokerId === comm.masterBrokerId;
          const isMb = comm.masterBrokerId && parseFloat(comm.masterBrokerShare || '0') > 0;
          const payoutAmount = isMasterDirect
            ? parseFloat(comm.masterBrokerShare || comm.brokerShare || '0')
            : (isMb
                ? (parseFloat(comm.brokerShare || '0') + parseFloat(comm.masterBrokerShare || '0'))
                : parseFloat(comm.brokerShare || comm.amount || '0'));

          await storage.updateCommission(id, {
            status: 'approved',
            approvedAt: new Date(),
            approvedBy: userId,
            frozenAmount: payoutAmount.toFixed(2),
          });

          await storage.createCommissionAuditLog({
            commissionId: id,
            performedBy: userId,
            action: 'approved',
            previousStatus: comm.status,
            newStatus: 'approved',
            details: { actorRole: user.role, frozenAmount: payoutAmount.toFixed(2), bulk: true },
          });

          successful.push(id);
        } catch (err: any) {
          failed.push({ id, reason: err.message || "Error al procesar aprobación" });
        }
      }

      res.json({ successful, failed, count: successful.length });
    } catch (error) {
      console.error("Error bulk approving commissions:", error);
      res.status(500).json({ message: "Error al procesar aprobación masiva" });
    }
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

  // Single STP payout with concurrency lock and idempotency protection
  app.post('/api/commissions/:id/pay', isAuthenticated, requireModuleAndAction('comisiones', 'approve_disperse'), async (req: any, res) => {
    try {
      const { id } = req.params;
      const { accountNumber } = req.body;
      const rawIdempotencyKey = req.headers['idempotency-key'] || req.body.idempotencyKey;
      const idempotencyKey = rawIdempotencyKey ? String(rawIdempotencyKey).trim() : null;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);

      // Only admins can trigger payouts
      if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
        return res.status(403).json({ message: "Only admins can process commission payments" });
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
            payoutAmount: parseFloat(alreadyProcessed.frozenAmount || alreadyProcessed.brokerShare || alreadyProcessed.amount || '0'),
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
          payoutAmount: parseFloat(commission.frozenAmount || commission.brokerShare || commission.amount || '0'),
          commission,
        });
      }

      if (commission.status === 'dispersing') {
        return res.status(409).json({
          message: "Commission dispersion is currently in progress",
          inProgress: true,
        });
      }

      if (!['approved', 'pending', 'failed'].includes(commission.status)) {
        return res.status(400).json({
          message: `Commission cannot be paid from status '${commission.status}'. Debe estar aprobada primero.`,
        });
      }

      // 3. Resolve beneficiary and 18-digit CLABE
      const isMbCredit = commission.masterBrokerId && parseFloat(commission.masterBrokerShare || '0') > 0;
      let effectiveClabe: string | null = accountNumber || null;
      let effectiveBankName: string | null = null;
      let effectiveAccountHolder: string | null = null;

      const targetUserId = isMbCredit ? commission.masterBrokerId! : commission.brokerId;
      const targetUser = await storage.getUser(targetUserId);

      if (!effectiveClabe && targetUser) {
        effectiveClabe = targetUser.clabe || null;
        effectiveBankName = targetUser.bankName || null;
        effectiveAccountHolder = targetUser.accountHolder || `${targetUser.firstName || ''} ${targetUser.lastName || ''}`.trim() || null;
      }

      if (!effectiveClabe || !/^\d{18}$/.test(String(effectiveClabe))) {
        return res.status(400).json({
          message: "El beneficiario no cuenta con una CLABE interbancaria válida de 18 dígitos para dispersión STP."
        });
      }

      // 4. Atomic concurrency lock: transition status to 'dispersing'
      const lockedComm = await storage.transitionCommissionStatus(
        id,
        ['approved', 'pending', 'failed'],
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

      // 5. Calculate payout amount (use frozenAmount if set, else net Option B)
      const payoutAmount = lockedComm.frozenAmount
        ? parseFloat(lockedComm.frozenAmount)
        : (isMbCredit
            ? (parseFloat(lockedComm.brokerShare || '0') + parseFloat(lockedComm.masterBrokerShare || '0'))
            : parseFloat(lockedComm.brokerShare || lockedComm.amount || '0'));

      // 6. Process STP payment
      const paymentResult = await processStpPayment(payoutAmount.toFixed(2), effectiveClabe);

      if (paymentResult.success) {
        const updated = await storage.updateCommission(id, {
          status: 'paid',
          paidAt: new Date(),
          paidBy: userId,
          paymentMethod: 'stp',
          clabe: effectiveClabe,
          bankName: effectiveBankName,
          accountHolder: effectiveAccountHolder,
          trackingKey: paymentResult.transactionId,
          providerResponse: paymentResult,
        });

        await storage.createCommissionAuditLog({
          commissionId: id,
          performedBy: userId,
          action: 'dispersed',
          previousStatus: 'dispersing',
          newStatus: 'paid',
          details: {
            actorRole: user.role,
            method: 'stp',
            amount: payoutAmount,
            trackingKey: paymentResult.transactionId,
            clabe: effectiveClabe,
            providerResponse: paymentResult,
          },
        });

        // Notify beneficiary with real net payout amount
        const beneficiaryId = isMbCredit ? lockedComm.masterBrokerId! : lockedComm.brokerId;
        const paidNotification = await storage.createNotification({
          userId: beneficiaryId,
          type: 'commission_paid',
          title: 'Comisión dispersada vía STP',
          message: `Se ha procesado exitosamente la transferencia STP por $${payoutAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN (${lockedComm.commissionType || 'Apertura'}).`,
          relatedEntityType: 'commission',
          relatedEntityId: lockedComm.id,
          priority: 'high',
        });
        broadcastToUser(beneficiaryId, { type: 'notification', notification: paidNotification });

        // If network credit, also notify origin broker with their net share
        if (isMbCredit && lockedComm.brokerId && lockedComm.brokerId !== lockedComm.masterBrokerId) {
          const brkShare = parseFloat(lockedComm.brokerShare || '0');
          const brkNotif = await storage.createNotification({
            userId: lockedComm.brokerId,
            type: 'commission_paid',
            title: 'Comisión dispersada a Master Broker',
            message: `La comisión correspondiente a tu originación por $${brkShare.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN fue dispersada a tu Master Broker para liquidación.`,
            relatedEntityType: 'commission',
            relatedEntityId: lockedComm.id,
            priority: 'normal',
          });
          broadcastToUser(lockedComm.brokerId, { type: 'notification', notification: brkNotif });
        }

        return res.json({
          message: "Payment processed successfully",
          transactionId: paymentResult.transactionId,
          payoutAmount,
          commission: updated,
        });
      } else {
        // Payment failed: mark as failed and log
        const failedUpdated = await storage.updateCommission(id, {
          status: 'failed',
          notes: `Fallo en dispersión STP: ${(paymentResult as any)?.message || 'Rechazo de pasarela'}`,
          providerResponse: paymentResult,
        });

        await storage.createCommissionAuditLog({
          commissionId: id,
          performedBy: userId,
          action: 'dispersion_failed',
          previousStatus: 'dispersing',
          newStatus: 'failed',
          details: { actorRole: user.role, ...(paymentResult as any) },
        });

        return res.status(400).json({
          message: "Payment processing failed",
          commission: failedUpdated,
          details: paymentResult,
        });
      }
    } catch (error) {
      console.error("Error processing payment:", error);
      res.status(500).json({ message: "Failed to process payment" });
    }
  });

  // Batch STP payout (Admins only)
  app.post('/api/commissions/bulk-pay', isAuthenticated, requireModuleAndAction('comisiones', 'approve_disperse'), async (req: any, res) => {
    try {
      const { ids } = req.body;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);

      if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
        return res.status(403).json({ message: "Solo los administradores pueden procesar dispersiones masivas" });
      }

      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "Se requiere un arreglo de identificadores 'ids'" });
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
            successful.push({ id, status: 'already_paid', payoutAmount: parseFloat(commission.frozenAmount || commission.brokerShare || commission.amount || '0') });
            continue;
          }

          if (!['approved', 'pending', 'failed'].includes(commission.status)) {
            failed.push({ id, reason: `Estado '${commission.status}' no permite dispersión. Debe estar aprobada.` });
            continue;
          }

          const isMbCredit = commission.masterBrokerId && parseFloat(commission.masterBrokerShare || '0') > 0;
          const targetUserId = isMbCredit ? commission.masterBrokerId! : commission.brokerId;
          const targetUser = await storage.getUser(targetUserId);

          const effectiveClabe = targetUser?.clabe;
          if (!effectiveClabe || !/^\d{18}$/.test(String(effectiveClabe))) {
            failed.push({ id, reason: "Beneficiario sin CLABE válida de 18 dígitos" });
            continue;
          }

          const locked = await storage.transitionCommissionStatus(
            id,
            ['approved', 'pending', 'failed'],
            'dispersing',
            {
              clabe: effectiveClabe,
              bankName: targetUser?.bankName || null,
              accountHolder: targetUser?.accountHolder || `${targetUser?.firstName || ''} ${targetUser?.lastName || ''}`.trim() || null,
            }
          );

          if (!locked) {
            failed.push({ id, reason: "Bloqueo concurrente: la comisión ya está en proceso de dispersión" });
            continue;
          }

          const payoutAmount = locked.frozenAmount
            ? parseFloat(locked.frozenAmount)
            : (isMbCredit
                ? (parseFloat(locked.brokerShare || '0') + parseFloat(locked.masterBrokerShare || '0'))
                : parseFloat(locked.brokerShare || locked.amount || '0'));

          const paymentResult = await processStpPayment(payoutAmount.toFixed(2), effectiveClabe);

          if (paymentResult.success) {
            await storage.updateCommission(id, {
              status: 'paid',
              paidAt: new Date(),
              paidBy: userId,
              paymentMethod: 'stp',
              clabe: effectiveClabe,
              bankName: targetUser?.bankName || null,
              accountHolder: targetUser?.accountHolder || `${targetUser?.firstName || ''} ${targetUser?.lastName || ''}`.trim() || null,
              trackingKey: paymentResult.transactionId,
              providerResponse: paymentResult,
            });

            await storage.createCommissionAuditLog({
              commissionId: id,
              performedBy: userId,
              action: 'dispersed',
              previousStatus: 'dispersing',
              newStatus: 'paid',
              details: {
                actorRole: user.role,
                method: 'stp',
                amount: payoutAmount,
                trackingKey: paymentResult.transactionId,
                clabe: effectiveClabe,
                bulk: true,
              },
            });

            const beneficiaryId = isMbCredit ? locked.masterBrokerId! : locked.brokerId;
            const notif = await storage.createNotification({
              userId: beneficiaryId,
              type: 'commission_paid',
              title: 'Comisión dispersada vía STP',
              message: `Se ha procesado exitosamente la transferencia STP por $${payoutAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN (${locked.commissionType || 'Apertura'}).`,
              relatedEntityType: 'commission',
              relatedEntityId: locked.id,
              priority: 'high',
            });
            broadcastToUser(beneficiaryId, { type: 'notification', notification: notif });

            successful.push({ id, transactionId: paymentResult.transactionId, payoutAmount });
            totalAmount += payoutAmount;
          } else {
            await storage.updateCommission(id, {
              status: 'failed',
              notes: `Fallo en dispersión STP masiva: ${(paymentResult as any)?.message || 'Error'}`,
              providerResponse: paymentResult,
            });

            await storage.createCommissionAuditLog({
              commissionId: id,
              performedBy: userId,
              action: 'dispersion_failed',
              previousStatus: 'dispersing',
              newStatus: 'failed',
              details: { actorRole: user.role, ...(paymentResult as any) },
            });

            failed.push({ id, reason: (paymentResult as any)?.message || "Fallo en pasarela STP" });
          }
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

  // Mark commission as paid manually (Admins only)
  app.post('/api/commissions/:id/mark-paid', isAuthenticated, requireModuleAndAction('comisiones', 'approve_disperse'), async (req: any, res) => {
    try {
      const { id } = req.params;
      const { notes, reference } = req.body;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);

      if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
        return res.status(403).json({ message: "Solo los administradores pueden marcar comisiones como pagadas" });
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
        return res.json({ message: "La comisión ya estaba marcada como pagada", commission });
      }

      const isMbCredit = commission.masterBrokerId && parseFloat(commission.masterBrokerShare || '0') > 0;
      const payoutAmount = commission.frozenAmount
        ? parseFloat(commission.frozenAmount)
        : (isMbCredit
            ? (parseFloat(commission.brokerShare || '0') + parseFloat(commission.masterBrokerShare || '0'))
            : parseFloat(commission.brokerShare || commission.amount || '0'));

      const updated = await storage.updateCommission(id, {
        status: 'paid',
        paidAt: new Date(),
        paidBy: userId,
        paymentMethod: 'manual',
        trackingKey: reference ? String(reference).trim() : null,
        notes: notes.trim(),
      });

      await storage.createCommissionAuditLog({
        commissionId: id,
        performedBy: userId,
        action: 'marked_paid_manually',
        previousStatus: commission.status,
        newStatus: 'paid',
        details: {
          actorRole: user.role,
          paidBy: userId,
          notes: notes.trim(),
          reference: reference || null,
          payoutAmount,
        },
      });

      // Notify beneficiary with real net amount (never gross amount)
      const beneficiaryId = isMbCredit ? commission.masterBrokerId! : commission.brokerId;

      const paidNotification = await storage.createNotification({
        userId: beneficiaryId,
        type: 'commission_paid',
        title: 'Comisión pagada (Liquidación manual)',
        message: `Se registró el pago manual por $${payoutAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN (${commission.commissionType || 'Apertura'}). Justificación: ${notes.trim()}`,
        relatedEntityType: 'commission',
        relatedEntityId: commission.id,
        priority: 'high',
      });
      broadcastToUser(beneficiaryId, { type: 'notification', notification: paidNotification });

      res.json({ message: "Comisión marcada como pagada exitosamente", commission: updated });
    } catch (error) {
      console.error("Error marking commission as paid:", error);
      res.status(500).json({ message: "Error al marcar la comisión como pagada" });
    }
  });

  // Document management with OCR
  app.post('/api/documents', isAuthenticated, requireModuleAndAction('documentos', 'edit'), upload.single('file'), async (req: any, res) => {
    let storedFilePath: string | undefined;

    try {
      const userId = req.user.claims.sub;
      const { clientId, creditId, type, customDocumentName } = req.body;
      const file = req.file;
      
      if (!file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      // Inherit tenant from client, credit, or active tenant
      let documentTenantId = req.tenantContext?.tenant?.id || null;
      let documentBrokerId = userId;
      if (clientId) {
        const client = await storage.getClient(clientId);
        if (client) {
          if (client.tenantId) documentTenantId = client.tenantId;
          if (client.brokerId) documentBrokerId = client.brokerId;
        }
      } else if (creditId) {
        const credit = await storage.getCredit(creditId);
        if (credit) {
          if (credit.tenantId) documentTenantId = credit.tenantId;
          if (credit.brokerId) documentBrokerId = credit.brokerId;
        }
      }
      
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
      
      // Admin and super_admin can see all documents
      const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
      
      if (isAdmin) {
        const documents = await storage.getDocuments({
          clientId: clientId as string,
          creditId: creditId as string,
        });
        return res.json(documents);
      } else if (req.tenantContext?.tenant) {
        const tenant = req.tenantContext.tenant;
        if (tenant.type === 'master_broker') {
          const subordinates = await storage.getTenantsByParent(tenant.id);
          const tenantIds = [tenant.id, ...subordinates.map(t => t.id)];
          const documents = await storage.getDocuments({
            tenantIds,
            clientId: clientId as string,
            creditId: creditId as string,
          });
          return res.json(documents);
        } else {
          const documents = await storage.getDocuments({
            tenantId: tenant.id,
            clientId: clientId as string,
            creditId: creditId as string,
          });
          return res.json(documents);
        }
      } else if (user?.role === 'master_broker') {
        const networkBrokers = await storage.getUsersByMasterBroker(userId);
        const brokerIds = [userId, ...networkBrokers.map(b => b.id)];
        const allDocuments = await storage.getDocuments({
          clientId: clientId as string,
          creditId: creditId as string,
        });
        const filteredDocuments = allDocuments.filter(d => d.brokerId && brokerIds.includes(d.brokerId));
        return res.json(filteredDocuments);
      } else {
        const documents = await storage.getDocuments({
          clientId: clientId as string,
          creditId: creditId as string,
          brokerId: userId,
        });
        return res.json(documents);
      }
    } catch (error) {
      console.error("Error fetching documents:", error);
      res.status(500).json({ message: "Failed to fetch documents" });
    }
  });

  app.get('/api/documents/client/:clientId', isAuthenticated, requireModuleAndAction('documentos', 'view'), async (req: any, res) => {
    try {
      const { clientId } = req.params;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      // First check if user can access this client
      const authResult = await authorizeClientAccess(userId, user?.role || '', clientId, req.tenantContext);
      if (!authResult.authorized) {
        return res.status(authResult.reason === 'Client not found' ? 404 : 403).json({ message: authResult.reason });
      }
      
      // User is authorized to access this client, fetch documents
      const documents = await storage.getDocuments({ clientId });
      
      res.json(documents);
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
        return res.status(authResult.reason === 'Document not found' ? 404 : 403).json({ message: authResult.reason });
      }
      
      const { clientId, creditId, type } = req.body;
      const file = req.file;
      
      let updateData: any = {
        clientId: clientId || null,
        creditId: creditId || null,
        type,
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
        const allUsers = await storage.getAllUsers();
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
      res.json(brokers);
    } catch (error) {
      console.error("Error fetching broker network:", error);
      res.status(500).json({ message: "Failed to fetch broker network" });
    }
  });

  // Broker invitations
  app.post('/api/broker-invitations', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (user?.role !== 'master_broker' && user?.role !== 'admin' && user?.role !== 'super_admin') {
        return res.status(403).json({ message: "Access denied" });
      }

      const { email, firstName, lastName, phone, message } = req.body;
      
      if (!email) {
        return res.status(400).json({ message: "El correo electrónico es requerido" });
      }

      // Check if user already exists or create new broker in network
      const existingUser = await storage.getUserByEmail(email);
      let targetBroker: any = existingUser;

      if (existingUser) {
        // Link to master broker if this is invited by a master broker
        if (user.role === 'master_broker' && (!existingUser.masterBrokerId || existingUser.masterBrokerId !== userId)) {
          targetBroker = await storage.updateUser(existingUser.id, {
            masterBrokerId: userId,
          });
        }
      } else {
        // Create new broker user record under master broker
        targetBroker = await storage.createUser({
          email,
          firstName: firstName || '',
          lastName: lastName || '',
          role: 'broker',
          masterBrokerId: user.role === 'master_broker' ? userId : (req.body.masterBrokerId || null),
          isActive: true,
          profileData: {
            phone: phone || '',
            invitedBy: userId,
            invitationMessage: message || '',
          },
        });
      }

      // Create a notification for sender
      const notification = await storage.createNotification({
        userId,
        type: 'broker_invitation_sent',
        title: 'Invitación de broker enviada',
        message: `Invitación enviada a ${firstName} ${lastName} (${email})`,
        data: { 
          email, 
          firstName, 
          lastName, 
          phone,
          brokerId: targetBroker?.id,
          invitationMessage: message 
        },
        priority: 'medium',
      });
      
      // Broadcast real-time notification
      broadcastToUser(userId, {
        type: 'notification',
        notification,
      });

      res.status(201).json({ 
        message: "Invitation sent successfully",
        broker: targetBroker,
        invitation: { email, firstName, lastName, phone }
      });
    } catch (error) {
      console.error("Error sending broker invitation:", error);
      res.status(500).json({ message: "Failed to send broker invitation" });
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

      const updatedUser = await storage.updateUser(userId, {
        networkCommissionRates: sanitizedRates,
      });

      res.json({
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
      const { institutionId } = req.query;

      const products = await storage.getInstitutionProducts(institutionId as string);
      res.json(products);
    } catch (error) {
      console.error("Error fetching institution products:", error);
      res.status(500).json({ message: "Failed to fetch institution products" });
    }
  });

  app.get('/api/institution-products/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;

      const product = await storage.getInstitutionProduct(id);
      if (!product) {
        return res.status(404).json({ message: "Institution product not found" });
      }
      
      res.json(product);
    } catch (error) {
      console.error("Error fetching institution product:", error);
      res.status(500).json({ message: "Failed to fetch institution product" });
    }
  });

  app.get('/api/institution-products/template/:templateId', isAuthenticated, async (req: any, res) => {
    try {
      const { templateId } = req.params;

      const products = await storage.getInstitutionProductsByTemplate(templateId);
      res.json(products);
    } catch (error) {
      console.error("Error fetching institution products by template:", error);
      res.status(500).json({ message: "Failed to fetch institution products by template" });
    }
  });

  app.post('/api/institution-products', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      const hasPermission = await requirePlatformRole(userId, ['super_admin', 'admin']);
      if (!hasPermission) {
        return res.status(403).json({ message: "Access denied - Admin privileges required" });
      }

      // Parse body but add createdBy automatically for security
      const bodyData = insertInstitutionProductSchema.omit({ createdBy: true }).parse(req.body);
      
      // Auto-copy targetProfiles from template if not provided
      let targetProfiles = bodyData.targetProfiles;
      if (!targetProfiles || targetProfiles.length === 0) {
        const template = await storage.getProductTemplate(bodyData.templateId);
        if (template && template.targetProfiles && template.targetProfiles.length > 0) {
          targetProfiles = template.targetProfiles;
        }
      }
      
      const productData = {
        ...bodyData,
        targetProfiles, // Use copied or provided targetProfiles
        createdBy: userId, // Set automatically from authenticated user
      };
      const product = await storage.createInstitutionProduct(productData);
      
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
      const userId = req.user.claims.sub;
      
      const hasPermission = await requirePlatformRole(userId, ['super_admin', 'admin']);
      if (!hasPermission) {
        return res.status(403).json({ message: "Access denied - Admin privileges required" });
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
    } catch (error) {
      console.error("Error updating institution product:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: 'Invalid data', errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to update institution product" });
      }
    }
  });

  app.delete('/api/institution-products/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      
      const hasPermission = await requirePlatformRole(userId, ['super_admin', 'admin']);
      if (!hasPermission) {
        return res.status(403).json({ message: "Access denied - Admin privileges required" });
      }

      const success = await storage.deleteInstitutionProduct(id);
      
      if (success) {
        res.json({ message: "Institution product deleted successfully" });
      } else {
        res.status(404).json({ message: "Institution product not found" });
      }
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
  app.get('/api/credit-submissions', isAuthenticated, async (req: any, res) => {
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

      const submissions = await storage.getCreditSubmissionRequests(filters);
      
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
                institution
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
              clabe: broker.clabe
            } : null,
            masterBroker: masterBroker ? {
              id: masterBroker.id,
              firstName: masterBroker.firstName,
              lastName: masterBroker.lastName,
              email: masterBroker.email,
              role: masterBroker.role,
              brandName: (masterBroker as any).brandName
            } : null,
            targets: enrichedTargets
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
  app.get('/api/credit-submissions/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      const submission = await storage.getCreditSubmissionRequest(id);
      if (!submission) {
        return res.status(404).json({ message: "Credit submission not found" });
      }

      // Authorization check - brokers can only see their own submissions
      if ((user?.role === 'broker' || user?.role === 'master_broker') && submission.brokerId !== userId) {
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
            institution
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
          role: broker.role
        } : null,
        masterBroker: masterBroker ? {
          id: masterBroker.id,
          firstName: masterBroker.firstName,
          lastName: masterBroker.lastName,
          brandName: (masterBroker as any).brandName
        } : null,
        targets: enrichedTargets
      });
    } catch (error) {
      console.error("Error fetching credit submission:", error);
      res.status(500).json({ message: "Failed to fetch credit submission" });
    }
  });

  // Get broker's own submissions with targets - ENRICHED with related data
  app.get('/api/credit-submission-requests/my-submissions', isAuthenticated, async (req: any, res) => {
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
                institution
              };
            })
          );
          
          return {
            ...submission,
            client,
            productTemplate,
            broker,
            targets: enrichedTargets
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
  app.get('/api/credit-submission-requests/:id', isAuthenticated, async (req: any, res) => {
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
      const authResult = await authorizeTenantOrBrokerResource({
        currentUserId: userId,
        resourceBrokerId: submission.brokerId,
        resourceTenantId: submission.tenantId,
        currentUserRole: user.role,
        tenantContext: req.tenantContext,
      });
      if (!authResult.authorized) {
        return res.status(403).json({ message: "Access denied" });
      }

      res.json(submission);
    } catch (error) {
      console.error("Error fetching submission request:", error);
      res.status(500).json({ message: "Failed to fetch submission request" });
    }
  });

  // Get credit submissions for a specific client - ENRICHED with related data
  app.get('/api/credit-submissions/client/:clientId', isAuthenticated, async (req: any, res) => {
    try {
      const { clientId } = req.params;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Get all submissions for this client
      const allSubmissions = await storage.getCreditSubmissionRequests({ clientId });
      
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
                institution
              };
            })
          );
          
          return {
            ...submission,
            client,
            productTemplate,
            broker,
            targets: enrichedTargets
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

      const originationCheck = await validateCommercialOrigination({
        callerUser: user,
        callerMembership: req.tenantContext?.membership,
        tenantId: req.tenantContext?.tenant?.id,
        requestedBrokerId: req.body.brokerId,
      });

      if (!originationCheck.allowed) {
        return res.status(403).json({ message: originationCheck.message });
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

  // Helper function to find or create the official Hipotecario Vivienda product template
  async function ensureHipotecarioViviendaTemplate(): Promise<any> {
    const templates = await storage.getProductTemplates();
    const existing = templates.find(t => 
      t.name?.toLowerCase().trim() === 'hipotecario vivienda' ||
      (t.category === 'hipotecario' && !t.name?.toLowerCase().includes('garantía inmobiliaria') && !t.name?.toLowerCase().includes('garantia inmobiliaria'))
    );
    if (existing) return existing;

    const allUsers = await storage.getAllUsers();
    const admin = allUsers.find(u => u.role === 'super_admin' || u.role === 'admin');
    const createdBy = admin?.id || 'user-super-admin';

    return await storage.createProductTemplate({
      name: 'Hipotecario Vivienda',
      description: 'Crédito hipotecario para adquisición de vivienda residencial (casa o departamento).',
      category: 'hipotecario',
      targetProfiles: ['fisica', 'fisica_empresarial'],
      availableVariables: {
        valor_inmueble: { type: 'number', label: 'Valor del Inmueble' },
        enganche: { type: 'number', label: 'Enganche' },
        plazo_meses: { type: 'number', label: 'Plazo en Meses' },
      },
      baseConfiguration: {
        maxLTV: 90,
        minTermMonths: 60,
        maxTermMonths: 360,
      },
      isActive: true,
      createdBy,
    });
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

      const originationCheck = await validateCommercialOrigination({
        callerUser: user,
        callerMembership: req.tenantContext?.membership,
        tenantId: req.tenantContext?.tenant?.id,
        requestedBrokerId: req.body.brokerId,
      });

      if (!originationCheck.allowed) {
        return res.status(403).json({ message: originationCheck.message });
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

      // Ensure Hipotecario Vivienda template exists
      const hipoTemplate = await ensureHipotecarioViviendaTemplate();

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
        // Camino B: Validar cliente existente
        const existingClient = await storage.getClient(finalClientId);
        if (!existingClient) {
          return res.status(404).json({ message: "Cliente no encontrado" });
        }
      }

      const mortgageData = {
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
          ? "Oportunidad hipotecaria registrada y canalizada exitosamente"
          : "Oportunidad hipotecaria registrada exitosamente para revisión y canalización"
      });
    } catch (error: any) {
      console.error("Error creating mortgage lead:", error);
      res.status(500).json({ message: error.message || "Error al registrar la oportunidad hipotecaria" });
    }
  });

  // POST /api/credit-submissions/:id/targets - Channel submission to institutions (EVENT 2)
  app.post('/api/credit-submissions/:id/targets', isAuthenticated, requireModuleAndAction('creditos', 'submit_proposals'), async (req: any, res) => {
    try {
      const { id } = req.params;
      const { financialInstitutionIds } = req.body;

      if (!Array.isArray(financialInstitutionIds) || financialInstitutionIds.length === 0) {
        return res.status(400).json({ message: "Debes seleccionar al menos una institución financiera para canalizar" });
      }

      const submission = await storage.getCreditSubmissionRequest(id);
      if (!submission) {
        return res.status(404).json({ message: "Solicitud de crédito no encontrada" });
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
        message: `Solicitud canalizada a ${newTargets.length} financiera(s)`,
        targets: newTargets,
      });
    } catch (error: any) {
      console.error("Error channeling submission:", error);
      res.status(500).json({ message: "Error al canalizar la solicitud" });
    }
  });

  // Get credit submission targets
  app.get('/api/credit-submission-targets', isAuthenticated, requireAnyModule('aprobaciones', 'creditos'), async (req: any, res) => {
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

      // Ownership/role filter — prevent exposing other brokers' data
      let filteredTargets = enrichedTargets;
      if (user.role === 'broker') {
        // Broker: only see their own submissions
        filteredTargets = enrichedTargets.filter((t: any) => t.request?.brokerId === userId);
      } else if (user.role === 'master_broker') {
        // Master broker: see own + their network's submissions
        filteredTargets = enrichedTargets.filter((t: any) =>
          t.request?.brokerId === userId || t.broker?.masterBrokerId === userId
        );
      }
      // admin / super_admin: see all (no filter)
      
      res.json(filteredTargets);
    } catch (error) {
      console.error("Error fetching credit submission targets:", error);
      res.status(500).json({ message: "Failed to fetch credit submission targets" });
    }
  });

  // Approve credit submission target - Admins only
  app.patch('/api/credit-submission-targets/:id/approve', isAuthenticated, requireModule('aprobaciones'), async (req: any, res) => {
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
            title: 'Solicitud aprobada por el administrador',
            message: adminNotes || 'Tu solicitud fue aprobada y será enviada a la institución.',
            relatedEntityType: 'credit_submission_target',
            relatedEntityId: rawTarget.id,
            priority: 'high',
          });
          broadcastToUser(request.brokerId, { type: 'notification', notification });
          const broker = await storage.getUser(request.brokerId);
          if (broker?.masterBrokerId) {
            const mbNotif = await storage.createNotification({
              userId: broker.masterBrokerId,
              type: 'submission_update',
              title: 'Solicitud de tu red aprobada',
              message: `La solicitud de un broker de tu red fue aprobada.`,
              relatedEntityType: 'credit_submission_target',
              relatedEntityId: rawTarget.id,
              priority: 'medium',
            });
            broadcastToUser(broker.masterBrokerId, { type: 'notification', notification: mbNotif });
          }
        }
      } catch (notifError) {
        console.error("[NOTIF] Error sending approve notification:", notifError);
      }

      const target = await enrichCreditSubmissionTarget(rawTarget);
      res.json(target);
    } catch (error) {
      console.error("Error approving credit submission target:", error);
      res.status(500).json({ message: "Failed to approve credit submission target" });
    }
  });

  // Reject credit submission target - Admins only (for institution rejections)
  app.patch('/api/credit-submission-targets/:id/reject', isAuthenticated, requireModule('aprobaciones'), async (req: any, res) => {
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
          const broker = await storage.getUser(request.brokerId);
          if (broker?.masterBrokerId) {
            const mbNotif = await storage.createNotification({
              userId: broker.masterBrokerId,
              type: 'submission_update',
              title: 'Solicitud de tu red rechazada',
              message: `La solicitud de un broker de tu red fue rechazada.`,
              relatedEntityType: 'credit_submission_target',
              relatedEntityId: rawTarget.id,
              priority: 'medium',
            });
            broadcastToUser(broker.masterBrokerId, { type: 'notification', notification: mbNotif });
          }
        }
      } catch (notifError) {
        console.error("[NOTIF] Error sending reject notification:", notifError);
      }

      const target = await enrichCreditSubmissionTarget(rawTarget);
      res.json(target);
    } catch (error) {
      console.error("Error rejecting credit submission target:", error);
      res.status(500).json({ message: "Failed to reject credit submission target" });
    }
  });

  // Return credit submission target to broker - Admins only
  app.patch('/api/credit-submission-targets/:id/return-to-broker', isAuthenticated, requireModule('aprobaciones'), async (req: any, res) => {
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
          const broker = await storage.getUser(request.brokerId);
          if (broker?.masterBrokerId) {
            const mbNotif = await storage.createNotification({
              userId: broker.masterBrokerId,
              type: 'submission_update',
              title: 'Solicitud de tu red devuelta al broker',
              message: `Una solicitud de tu red fue devuelta al broker para correcciones.`,
              relatedEntityType: 'credit_submission_target',
              relatedEntityId: rawTarget.id,
              priority: 'medium',
            });
            broadcastToUser(broker.masterBrokerId, { type: 'notification', notification: mbNotif });
          }
        }
      } catch (notifError) {
        console.error("[NOTIF] Error sending return-to-broker notification:", notifError);
      }

      const target = await enrichCreditSubmissionTarget(rawTarget);
      res.json(target);
    } catch (error) {
      console.error("Error returning credit submission target to broker:", error);
      res.status(500).json({ message: "Failed to return credit submission target to broker" });
    }
  });

  // 1. Generate PDF for credit submission target
  app.post('/api/credit-submission-targets/:id/generate-pdf', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const rawTarget = await storage.getCreditSubmissionTarget(id);
      
      if (!rawTarget) {
        return res.status(404).json({ message: "Credit submission target not found" });
      }

      const target = await enrichCreditSubmissionTarget(rawTarget);

      const doc = new PDFDocument({ margin: 50 });
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=solicitud-${id}.pdf`);
      
      doc.pipe(res);
      
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
    } catch (error) {
      console.error("Error generating PDF:", error);
      if (!res.headersSent) {
        res.status(500).json({ message: "Failed to generate PDF" });
      }
    }
  });

  // 2. Mark submission target as sent - Admins only
  app.patch('/api/credit-submission-targets/:id/mark-sent', isAuthenticated, async (req: any, res) => {
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

      const rawTarget = await storage.updateCreditSubmissionTarget(id, {
        status: 'sent',
        reviewedBy: userId,
        reviewedAt: new Date(),
      });
      
      if (!rawTarget) {
        return res.status(404).json({ message: "Credit submission target not found" });
      }

      // Update the submission status to sent_to_institutions
      await storage.updateCreditSubmissionRequest(existingTarget.requestId, {
        status: 'sent_to_institutions',
      });

      const target = await enrichCreditSubmissionTarget(rawTarget);
      res.json(target);
    } catch (error) {
      console.error("Error marking as sent:", error);
      res.status(500).json({ message: "Failed to mark as sent" });
    }
  });

  // 3. Upload proposal document
  app.post('/api/credit-submission-targets/:id/upload-proposal', isAuthenticated, upload.single('proposalDocument'), async (req: any, res) => {
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
      res.json(target);
    } catch (error) {
      console.error("Error uploading proposal:", error);
      res.status(500).json({ message: "Failed to upload proposal" });
    }
  });

  // 3b. Serve proposal document safely
  app.get('/api/credit-submission-targets/:id/proposal-document', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const target = await storage.getCreditSubmissionTarget(id);
      if (!target || !target.proposalDocument) {
        return res.status(404).json({ message: "No se encontró el documento de propuesta" });
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
  app.post('/api/credit-submission-targets/:id/institution-proposal', isAuthenticated, async (req: any, res) => {
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
      });

      const proposal = proposalSchema.parse(req.body);

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
          const broker = await storage.getUser(request.brokerId);
          if (broker?.masterBrokerId) {
            const mbNotif = await storage.createNotification({
              userId: broker.masterBrokerId,
              type: 'submission_update',
              title: 'Propuesta recibida para solicitud de tu red',
              message: `Una institución aprobó la solicitud de un broker de tu red.`,
              relatedEntityType: 'credit_submission_target',
              relatedEntityId: rawTarget.id,
              priority: 'medium',
            });
            broadcastToUser(broker.masterBrokerId, { type: 'notification', notification: mbNotif });
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
      res.json(target);
    } catch (error) {
      console.error("Error saving institution proposal:", error);
      res.status(500).json({ message: "Failed to save institution proposal" });
    }
  });

  // Institution response (approve or reject from institution side) - Admins only
  app.patch('/api/credit-submission-targets/:id/mark-institution-response', isAuthenticated, async (req: any, res) => {
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
        }).optional(),
      });

      const { approved, adminNotes, proposal } = bodySchema.parse(req.body);

      const newStatus = approved ? 'institution_approved' : 'institution_rejected';
      const updatePayload: any = { status: newStatus };
      if (approved && proposal) {
        updatePayload.institutionProposal = proposal;
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
          const broker = await storage.getUser(request.brokerId);
          if (broker?.masterBrokerId) {
            const mbNotif = await storage.createNotification({
              userId: broker.masterBrokerId,
              type: 'submission_update',
              title: approved ? 'Institución aprobó solicitud de tu red' : 'Institución rechazó solicitud de tu red',
              message: `Una institución ${approved ? 'aprobó' : 'rechazó'} la solicitud de un broker de tu red.`,
              relatedEntityType: 'credit_submission_target',
              relatedEntityId: rawTarget.id,
              priority: 'medium',
            });
            broadcastToUser(broker.masterBrokerId, { type: 'notification', notification: mbNotif });
          }
        }
      } catch (notifError) {
        console.error("[NOTIF] Error sending institution-response notification:", notifError);
      }

      const target = await enrichCreditSubmissionTarget(rawTarget);
      res.json(target);
    } catch (error) {
      console.error("Error recording institution response:", error);
      res.status(500).json({ message: "Failed to record institution response" });
    }
  });

  // 5. Select winner - Brokers and admins can select
  app.patch('/api/credit-submission-targets/:id/select-winner', isAuthenticated, async (req: any, res) => {
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

      // Update selected target to winner / selected_winner without overriding other approved/dispersed targets
      await storage.updateCreditSubmissionTarget(id, {
        isWinner: true,
        status: 'selected_winner',
      });

      const client = await storage.getClient(request.clientId);
      const resolvedTenantId = request.tenantId || client?.tenantId || null;
      const proposal = target.institutionProposal as any;
      const credit = await storage.createCredit({
        tenantId: resolvedTenantId,
        clientId: request.clientId,
        brokerId: request.brokerId,
        financialInstitutionId: target.financialInstitutionId,
        productTemplateId: request.productTemplateId,
        linkedSubmissionId: request.id,
        amount: proposal.approvedAmount?.toString() || request.requestedAmount.toString(),
        interestRate: proposal.interestRate?.toString(),
        term: proposal.term,
        purpose: request.purpose,
        mortgageData: request.mortgageData || {},
        status: 'approved',
      });

      await storage.updateCreditSubmissionTarget(id, {
        creditId: credit.id,
      });

      // Notify Super Admins & Admins that a winning proposal was selected and is ready for dispersal
      try {
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

      const enrichedTarget = await enrichCreditSubmissionTarget(target);
      res.json({ target: enrichedTarget, credit });
    } catch (error) {
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
      if (target.creditId) {
        // Reuse existing credit, update status AND backfill linked fields
        credit = await storage.updateCredit(target.creditId, {
          status: 'disbursed',
          ...(resolvedTenantId ? { tenantId: resolvedTenantId } : {}),
          linkedSubmissionId: request.id, // Backfill link to original submission
          productTemplateId: request.productTemplateId, // Backfill product template
          mortgageData: request.mortgageData || {},
        });
      } else {
        // Create new credit in credits table with linked submission
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
          status: 'disbursed', // Start as disbursed since we're dispersing it
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

      // CREATE COMMISSIONS (Cascading waterfall breakdown)
      try {
        const broker = await storage.getUser(request.brokerId);
        if (broker) {
          const isMasterDirect = broker.role === 'master_broker';
          const masterBrokerId = isMasterDirect ? broker.id : broker.masterBrokerId;
          const approvedAmount = parseFloat(proposal?.approvedAmount || credit?.amount || request.requestedAmount?.toString() || '0');
          
          // Get institution for commission rates
          const institution = await storage.getFinancialInstitution(target.financialInstitutionId);
          const commissionRates = (institution?.commissionRates as any) || {};
          
          // Calculate opening commission for broker (even if 0%)
          // IMPORTANT: proposal.openingCommission is the opening fee charged by the bank to the BORROWER.
          // It MUST NEVER be used as the commission rate paid to brokers. Internal rates only.
          const brokerOpeningRate = parseFloat(
            commissionRates.broker?.apertura ||
            (institution as any)?.brokerCommissionRate ||
            (institution as any)?.commissionRate ||
            (institution as any)?.openingCommissionRate ||
            '0'
          );

          // Calculate opening commission for master broker if exists (even if 0%)
          let masterOpeningRate = 0;
          if (masterBrokerId || isMasterDirect) {
            masterOpeningRate = parseFloat(
              commissionRates.masterBroker?.apertura ||
              (institution as any)?.masterBrokerCommissionRate ||
              '0'
            );
          }

          // Calculate opening commission for Super Admin / Financiera
          const superAdminOpeningRate = parseFloat(
            commissionRates.financiera?.apertura ||
            commissionRates.superAdmin?.apertura ||
            (institution as any)?.commissionRate ||
            '0'
          );

          const createdComm = await createCascadingCommissionRecord({
            creditId: credit!.id,
            brokerId: request.brokerId,
            masterBrokerId: masterBrokerId || null,
            commissionType: 'apertura',
            approvedAmount,
            financieraRate: superAdminOpeningRate,
            masterBrokerRate: masterOpeningRate,
            brokerRate: brokerOpeningRate,
            financialInstitutionId: (request as any).financialInstitutionId || (target as any)?.institutionId || (institution as any)?.id || null,
            isMasterDirect,
          });

          // Send email alert to Super Admin for dispersed credit with cascading breakdown
          const client = await storage.getClient(request.clientId);
          const clientName: string = (client ? (client.type === 'persona_moral' ? client.businessName : `${client.firstName} ${client.lastName || ''}`.trim()) : null) || 'Cliente';
          
          const commBrkAmount = parseFloat(createdComm?.brokerShare || '0');
          const commMbAmount = parseFloat(createdComm?.masterBrokerShare || '0');
          const commAppAmount = parseFloat(createdComm?.appShare || '0');
          const commTotalGross = parseFloat(createdComm?.amount || '0');
          const mbGrossPayout = commMbAmount + commBrkAmount;

          sendSuperAdminNotificationEmail({
            title: `Crédito Dispersado: ${clientName}`,
            message: `El crédito para ${clientName} por $${approvedAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN con ${institution?.name || 'Financiera'} ha sido marcado como DISPERSADO. Se han generado las comisiones en cascada correspondientes.`,
            type: 'credit_dispersed',
            clientName,
            brokerName: `${broker.firstName} ${broker.lastName || ''}`.trim(),
            financialInstitutionName: institution?.name,
            amount: approvedAmount,
            actionUrl: `/comisiones?creditId=${credit!.id}`,
            details: {
              'Total Otorgado por Financiera': `$${commTotalGross.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN (${superAdminOpeningRate}%)`,
              'Ganancia Neta Plataforma': `$${commAppAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN`,
              ...(masterBrokerId ? {
                'Monto a Dispersar a Master Bróker (STP)': `$${mbGrossPayout.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN`,
                'Margen Neto Master Bróker': `$${commMbAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN`,
                'Comisión a Pagar al Bróker': `$${commBrkAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN`,
              } : {
                'Monto a Dispersar a Bróker Directo (STP)': `$${commBrkAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN`,
              }),
            }
          }).catch(e => console.error('[Email] Failed to send super admin dispersion email:', e));
        }
      } catch (commErr) {
        console.error("[Commission] Error generating commissions on mark-dispersed:", commErr);
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

  app.get('/api/import/template/:type', isAuthenticated, async (req: any, res) => {
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

  app.post('/api/import/preview/:type', isAuthenticated, requireModule('importacion'), excelUpload.single('file'), async (req: any, res) => {
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

  app.post('/api/import/commissions', isAuthenticated, requireModule('importacion'), excelUpload.single('file'), async (req: any, res) => {
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

  app.post('/api/import/financieras', isAuthenticated, requireModule('importacion'), excelUpload.single('file'), async (req: any, res) => {
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

  app.post('/api/import/financieras-soc', isAuthenticated, requireModule('importacion'), excelUpload.single('file'), async (req: any, res) => {
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


  // WebSocket setup
  const httpServer = createServer(app);
  
  const wss = new WebSocketServer({ 
    server: httpServer, 
    path: '/ws' 
  });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const userId = url.searchParams.get('userId');
    
    if (userId) {
      wsClients.set(userId, ws);
      console.log(`WebSocket connected for user: ${userId}`);
    }

    ws.on('close', () => {
      if (userId) {
        wsClients.delete(userId);
        console.log(`WebSocket disconnected for user: ${userId}`);
      }
    });
  });

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
