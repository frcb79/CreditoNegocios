import { randomUUID } from "node:crypto";
import { asc, desc, eq, isNull, sql } from "drizzle-orm";
import type { IStorage } from "./storage";
import {
  users,
  tenants,
  tenantMembers,
  clients,
  credits,
  documents,
  creditSubmissionRequests,
} from "../shared/schema";

export interface OwnershipBackfillStats {
  clients: {
    total: number;
    withTenantId: number;
    pendingBackfill: number;
    missingCreatedBy: number;
  };
  credits: {
    total: number;
    withTenantId: number;
    pendingBackfill: number;
    missingCreatedBy: number;
  };
  documents: {
    total: number;
    withTenantId: number;
    pendingBackfill: number;
    missingUploadedBy: number;
  };
  creditSubmissions: {
    total: number;
    withTenantId: number;
    pendingBackfill: number;
    missingCreatedBy: number;
  };
}

export interface OwnershipBackfillPlan {
  clientsToUpdate: Array<{ id: string; targetTenantId: string; createdBy: string }>;
  creditsToUpdate: Array<{ id: string; targetTenantId: string; createdBy: string }>;
  documentsToUpdate: Array<{ id: string; targetTenantId: string; uploadedBy: string }>;
  submissionsToUpdate: Array<{ id: string; targetTenantId: string; createdBy: string }>;
  unmappedBrokerIds: string[];
  platformFallbackCount: number;
  brokerTenantCount: number;
}

export interface OwnershipBackfillResult {
  mode: "dry-run" | "apply";
  success: boolean;
  stats: OwnershipBackfillStats;
  plan: OwnershipBackfillPlan;
  appliedCounts?: {
    clientsUpdated: number;
    creditsUpdated: number;
    documentsUpdated: number;
    submissionsUpdated: number;
  };
  error?: string;
}

/**
 * Storage adapter for transactional operations
 */
export interface IOwnershipStorage {
  getClients(): Promise<any[]>;
  getCredits(): Promise<any[]>;
  getDocuments(): Promise<any[]>;
  getCreditSubmissionRequests(): Promise<any[]>;
  getTenants(): Promise<any[]>;
  getTenantMembers(): Promise<any[]>;
  getAllUsers(): Promise<any[]>;
  updateClientTenant?(id: string, tenantId: string, createdBy: string): Promise<void>;
  updateCreditTenant?(id: string, tenantId: string, createdBy: string): Promise<void>;
  updateDocumentTenant?(id: string, tenantId: string, uploadedBy: string): Promise<void>;
  updateSubmissionTenant?(id: string, tenantId: string, createdBy: string): Promise<void>;
}

export class DrizzleOwnershipStorage implements IOwnershipStorage {
  constructor(private txOrDb: any) {}

  async getClients(): Promise<any[]> {
    return await this.txOrDb.select().from(clients);
  }

  async getCredits(): Promise<any[]> {
    return await this.txOrDb.select().from(credits);
  }

  async getDocuments(): Promise<any[]> {
    return await this.txOrDb.select().from(documents);
  }

  async getCreditSubmissionRequests(): Promise<any[]> {
    return await this.txOrDb.select().from(creditSubmissionRequests);
  }

  async getTenants(): Promise<any[]> {
    return await this.txOrDb.select().from(tenants);
  }

  async getTenantMembers(): Promise<any[]> {
    return await this.txOrDb.select().from(tenantMembers);
  }

  async getAllUsers(): Promise<any[]> {
    return await this.txOrDb.select().from(users);
  }

  async updateClientTenant(id: string, tenantId: string, createdBy: string): Promise<void> {
    await this.txOrDb
      .update(clients)
      .set({ tenantId, createdBy: sql`COALESCE(${clients.createdBy}, ${createdBy})` })
      .where(eq(clients.id, id));
  }

  async updateCreditTenant(id: string, tenantId: string, createdBy: string): Promise<void> {
    await this.txOrDb
      .update(credits)
      .set({ tenantId, createdBy: sql`COALESCE(${credits.createdBy}, ${createdBy})` })
      .where(eq(credits.id, id));
  }

  async updateDocumentTenant(id: string, tenantId: string, uploadedBy: string): Promise<void> {
    await this.txOrDb
      .update(documents)
      .set({ tenantId, uploadedBy: sql`COALESCE(${documents.uploadedBy}, ${uploadedBy})` })
      .where(eq(documents.id, id));
  }

  async updateSubmissionTenant(id: string, tenantId: string, createdBy: string): Promise<void> {
    await this.txOrDb
      .update(creditSubmissionRequests)
      .set({ tenantId, createdBy: sql`COALESCE(${creditSubmissionRequests.createdBy}, ${createdBy})` })
      .where(eq(creditSubmissionRequests.id, id));
  }
}

/**
 * Checks that required tables and columns exist in PostgreSQL
 */
export async function checkOwnershipTablesExist(pool: any): Promise<{
  allExist: boolean;
  missing: string[];
}> {
  const checkQueries = [
    { table: "clients", column: "tenant_id" },
    { table: "clients", column: "created_by" },
    { table: "credits", column: "tenant_id" },
    { table: "credits", column: "created_by" },
    { table: "documents", column: "tenant_id" },
    { table: "documents", column: "uploaded_by" },
    { table: "credit_submission_requests", column: "tenant_id" },
    { table: "credit_submission_requests", column: "created_by" },
    { table: "tenant_members", column: "can_originate" },
  ];

  const missing: string[] = [];
  for (const item of checkQueries) {
    const res = await pool.query(
      `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = $1 
        AND column_name = $2
    `,
      [item.table, item.column]
    );
    if (res.rows.length === 0) {
      missing.push(`${item.table}.${item.column}`);
    }
  }

  return {
    allExist: missing.length === 0,
    missing,
  };
}

/**
 * Executes or simulates ownership backfill
 */
export async function executeOwnershipBackfill(
  storage: IOwnershipStorage,
  options: { apply?: boolean } = {}
): Promise<OwnershipBackfillResult> {
  const isApply = Boolean(options.apply);

  // 1. Fetch metadata
  const [allTenants, allMembers, allUsers, allClients, allCredits, allDocs, allSubs] = await Promise.all([
    storage.getTenants(),
    storage.getTenantMembers(),
    storage.getAllUsers(),
    storage.getClients(),
    storage.getCredits(),
    storage.getDocuments(),
    storage.getCreditSubmissionRequests(),
  ]);

  // Find platform tenant
  const platformTenant = allTenants.find((t) => t.slug === "platform" || t.type === "platform") || allTenants[0];
  if (!platformTenant) {
    throw new Error("No platform tenant found. Ensure Bloque 2 backfill was executed first.");
  }

  // Find default fallback user (super_admin or first user)
  const defaultAdminUser = allUsers.find((u) => u.role === "super_admin" || u.role === "admin") || allUsers[0];
  const defaultAdminId = defaultAdminUser?.id || "user-platform-admin";

  // Build broker -> tenant mapping:
  // Priority 1: Tenant where user is 'owner'
  // Priority 2: Tenant where user is active member
  // Priority 3: Fallback to platform tenant
  const brokerToTenantMap = new Map<string, string>();
  for (const member of allMembers) {
    if (member.isActive && member.role === "owner") {
      brokerToTenantMap.set(member.userId, member.tenantId);
    }
  }
  for (const member of allMembers) {
    if (member.isActive && !brokerToTenantMap.has(member.userId)) {
      brokerToTenantMap.set(member.userId, member.tenantId);
    }
  }

  const unmappedBrokerIds = new Set<string>();
  let platformFallbackCount = 0;
  let brokerTenantCount = 0;

  function resolveTenantAndCreator(brokerId?: string | null, existingCreator?: string | null) {
    const creator = existingCreator || brokerId || defaultAdminId;
    if (brokerId && brokerToTenantMap.has(brokerId)) {
      brokerTenantCount++;
      return {
        tenantId: brokerToTenantMap.get(brokerId)!,
        creator,
      };
    }

    if (brokerId) {
      unmappedBrokerIds.add(brokerId);
    }
    platformFallbackCount++;
    return {
      tenantId: platformTenant.id,
      creator,
    };
  }

  // Plan updates
  const clientsToUpdate: Array<{ id: string; targetTenantId: string; createdBy: string }> = [];
  for (const client of allClients) {
    if (!client.tenantId || !client.createdBy) {
      const { tenantId, creator } = resolveTenantAndCreator(client.brokerId, client.createdBy);
      clientsToUpdate.push({
        id: client.id,
        targetTenantId: client.tenantId || tenantId,
        createdBy: creator,
      });
    }
  }

  const creditsToUpdate: Array<{ id: string; targetTenantId: string; createdBy: string }> = [];
  for (const credit of allCredits) {
    if (!credit.tenantId || !credit.createdBy) {
      const { tenantId, creator } = resolveTenantAndCreator(credit.brokerId, credit.createdBy);
      creditsToUpdate.push({
        id: credit.id,
        targetTenantId: credit.tenantId || tenantId,
        createdBy: creator,
      });
    }
  }

  const documentsToUpdate: Array<{ id: string; targetTenantId: string; uploadedBy: string }> = [];
  for (const doc of allDocs) {
    if (!doc.tenantId || !doc.uploadedBy) {
      const { tenantId, creator } = resolveTenantAndCreator(doc.brokerId, doc.uploadedBy);
      documentsToUpdate.push({
        id: doc.id,
        targetTenantId: doc.tenantId || tenantId,
        uploadedBy: creator,
      });
    }
  }

  const submissionsToUpdate: Array<{ id: string; targetTenantId: string; createdBy: string }> = [];
  for (const sub of allSubs) {
    if (!sub.tenantId || !sub.createdBy) {
      const { tenantId, creator } = resolveTenantAndCreator(sub.brokerId, sub.createdBy);
      submissionsToUpdate.push({
        id: sub.id,
        targetTenantId: sub.tenantId || tenantId,
        createdBy: creator,
      });
    }
  }

  const stats: OwnershipBackfillStats = {
    clients: {
      total: allClients.length,
      withTenantId: allClients.filter((c) => c.tenantId).length,
      pendingBackfill: clientsToUpdate.length,
      missingCreatedBy: allClients.filter((c) => !c.createdBy).length,
    },
    credits: {
      total: allCredits.length,
      withTenantId: allCredits.filter((c) => c.tenantId).length,
      pendingBackfill: creditsToUpdate.length,
      missingCreatedBy: allCredits.filter((c) => !c.createdBy).length,
    },
    documents: {
      total: allDocs.length,
      withTenantId: allDocs.filter((d) => d.tenantId).length,
      pendingBackfill: documentsToUpdate.length,
      missingUploadedBy: allDocs.filter((d) => !d.uploadedBy).length,
    },
    creditSubmissions: {
      total: allSubs.length,
      withTenantId: allSubs.filter((s) => s.tenantId).length,
      pendingBackfill: submissionsToUpdate.length,
      missingCreatedBy: allSubs.filter((s) => !s.createdBy).length,
    },
  };

  const plan: OwnershipBackfillPlan = {
    clientsToUpdate,
    creditsToUpdate,
    documentsToUpdate,
    submissionsToUpdate,
    unmappedBrokerIds: Array.from(unmappedBrokerIds),
    platformFallbackCount,
    brokerTenantCount,
  };

  // If DRY-RUN, stop here and return report without writing
  if (!isApply) {
    return {
      mode: "dry-run",
      success: true,
      stats,
      plan,
    };
  }

  // APPLY MODE
  if (
    !storage.updateClientTenant ||
    !storage.updateCreditTenant ||
    !storage.updateDocumentTenant ||
    !storage.updateSubmissionTenant
  ) {
    throw new Error("Storage adapter does not support write updates for ownership backfill");
  }

  for (const item of clientsToUpdate) {
    await storage.updateClientTenant(item.id, item.targetTenantId, item.createdBy);
  }

  for (const item of creditsToUpdate) {
    await storage.updateCreditTenant(item.id, item.targetTenantId, item.createdBy);
  }

  for (const item of documentsToUpdate) {
    await storage.updateDocumentTenant(item.id, item.targetTenantId, item.uploadedBy);
  }

  for (const item of submissionsToUpdate) {
    await storage.updateSubmissionTenant(item.id, item.targetTenantId, item.createdBy);
  }

  return {
    mode: "apply",
    success: true,
    stats,
    plan,
    appliedCounts: {
      clientsUpdated: clientsToUpdate.length,
      creditsUpdated: creditsToUpdate.length,
      documentsUpdated: documentsToUpdate.length,
      submissionsUpdated: submissionsToUpdate.length,
    },
  };
}
