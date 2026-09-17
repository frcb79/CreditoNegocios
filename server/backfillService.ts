import { randomUUID } from "node:crypto";
import type { IStorage } from "./storage";
import type { User, Tenant, TenantMember, InsertTenant, InsertTenantMember } from "../shared/schema";

export interface BackfillOptions {
  storage: IStorage;
  dryRun?: boolean;
  onLog?: (msg: string) => void;
}

export interface AnomalyRecord {
  userId: string;
  email?: string;
  role?: string;
  type: "invalid_master_broker" | "unknown_role" | "missing_name" | "slug_collision";
  description: string;
}

export interface BackfillSummary {
  totalUsers: number;
  superAdmins: number;
  admins: number;
  masterBrokers: number;
  brokers: number;
  otherUsers: number;

  platformTenantAction: "existing" | "created" | "to_create";
  platformTenantId: string;

  masterTenantsExisting: number;
  masterTenantsToCreate: number;

  brokerTenantsExisting: number;
  brokerTenantsToCreate: number;

  membershipsExisting: number;
  membershipsToCreate: number;

  brokerToMasterCount: number;
  brokerToPlatformDirectCount: number;
  invalidMasterBrokerIdCount: number;

  warnings: string[];
  anomalies: AnomalyRecord[];
}

export interface BackfillResult {
  dryRun: boolean;
  success: boolean;
  summary: BackfillSummary;
  createdTenantIds: string[];
  createdMemberIds: string[];
}

/**
 * Normalizes text to a URL-friendly slug without diacritics, lowercase, max 50 chars.
 * NEVER includes email addresses.
 */
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

/**
 * Resolves commercial name following priority:
 * 1. brandName
 * 2. firstName + lastName
 * 3. Fallback generic identifier with user id prefix (NEVER email)
 */
export function resolveTenantName(user: Partial<User>, role: string): string {
  if (user.brandName && user.brandName.trim()) {
    return user.brandName.trim();
  }
  const fullName = `${user.firstName || ""} ${user.lastName || ""}`.trim();
  if (fullName) {
    return fullName;
  }
  const prefix = role === "master_broker" ? "Master Broker" : "Broker";
  const idSnippet = (user.id || "").slice(0, 8) || "Org";
  return `${prefix} ${idSnippet}`;
}

/**
 * Resolves a deterministic unique slug without collisions.
 */
export function resolveUniqueSlug(
  baseSlug: string,
  existingSlugs: Set<string>,
  fallbackId: string
): string {
  let candidate = baseSlug || `org-${fallbackId.slice(0, 8)}`;
  if (!existingSlugs.has(candidate)) {
    existingSlugs.add(candidate);
    return candidate;
  }
  let counter = 1;
  while (existingSlugs.has(`${candidate}-${counter}`)) {
    counter++;
  }
  const uniqueSlug = `${candidate}-${counter}`;
  existingSlugs.add(uniqueSlug);
  return uniqueSlug;
}

/**
 * Core backfill service for Bloque 2.
 * Idempotent, non-destructive, auditable.
 */
export async function executeBackfill(options: BackfillOptions): Promise<BackfillResult> {
  const { storage, dryRun = true, onLog = () => {} } = options;

  const log = (msg: string) => onLog(msg);

  // 1. Fetch current database state
  const allUsers = await storage.getAllUsers();
  const allTenants = await storage.getTenants();
  const allMembers = await storage.getTenantMembers();

  const usersById = new Map<string, User>(allUsers.map((u) => [u.id, u]));
  const existingSlugs = new Set<string>(allTenants.map((t) => t.slug));

  // Map tenants by legacyOwnerUserId stored in settings
  const tenantsByLegacyUserId = new Map<string, Tenant>();
  for (const t of allTenants) {
    const legacyUserId = (t.settings as any)?.legacyOwnerUserId;
    if (legacyUserId) {
      tenantsByLegacyUserId.set(legacyUserId, t);
    }
  }

  // Set of existing memberships by `${tenantId}:${userId}`
  const existingMemberships = new Set<string>(
    allMembers.map((m) => `${m.tenantId}:${m.userId}`)
  );

  const warnings: string[] = [];
  const anomalies: AnomalyRecord[] = [];
  const createdTenantIds: string[] = [];
  const createdMemberIds: string[] = [];

  try {
    // Classify users
    const superAdmins = allUsers.filter((u) => u.role === "super_admin");
  const admins = allUsers.filter((u) => u.role === "admin");
  const masterBrokers = allUsers.filter((u) => u.role === "master_broker");
  const brokers = allUsers.filter((u) => u.role === "broker");
  const otherUsers = allUsers.filter(
    (u) => !["super_admin", "admin", "master_broker", "broker"].includes(u.role)
  );

  for (const u of otherUsers) {
    anomalies.push({
      userId: u.id,
      email: u.email || undefined,
      role: u.role,
      type: "unknown_role",
      description: `Usuario con rol no comercial '${u.role}' detectado. No se creó organización automática.`,
    });
  }

  // 2. Ensure / identify Platform Tenant
  let platformTenant = allTenants.find(
    (t) => t.type === "platform" || t.slug === "platform"
  );
  let platformTenantAction: "existing" | "created" | "to_create" = "existing";

  if (!platformTenant) {
    platformTenantAction = dryRun ? "to_create" : "created";
    const platformData: InsertTenant = {
      type: "platform",
      name: "Crédito Negocios",
      slug: "platform",
      parentTenantId: null,
      settings: {
        migrationSource: "platform_root_initialization",
        description: "Organización raíz del sistema Crédito Negocios",
      },
      isActive: true,
    };

    if (!dryRun) {
      platformTenant = await storage.createTenant(platformData);
      createdTenantIds.push(platformTenant.id);
      existingSlugs.add(platformTenant.slug);
    } else {
      platformTenant = {
        id: "platform-root-preview-id",
        ...platformData,
        parentTenantId: null,
        settings: platformData.settings as any,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      existingSlugs.add("platform");
    }
  }

  const platformId = platformTenant.id;

  // 3. Process Master Brokers
  let masterTenantsExisting = 0;
  let masterTenantsToCreate = 0;
  const masterTenantsByUserId = new Map<string, Tenant>();

  for (const mb of masterBrokers) {
    let mbTenant = tenantsByLegacyUserId.get(mb.id);
    if (mbTenant) {
      masterTenantsExisting++;
      masterTenantsByUserId.set(mb.id, mbTenant);
    } else {
      masterTenantsToCreate++;
      const name = resolveTenantName(mb, "master_broker");
      const baseSlug = slugify(name) || `mb-${mb.id.slice(0, 8)}`;
      const slug = resolveUniqueSlug(baseSlug, existingSlugs, mb.id);

      const tenantData: InsertTenant = {
        type: "master_broker",
        name,
        slug,
        parentTenantId: platformId,
        settings: {
          migrationSource: "legacy_user_backfill",
          legacyOwnerUserId: mb.id,
          legacyRole: mb.role,
          legacyMasterBrokerId: mb.masterBrokerId || null,
          brandName: mb.brandName || null,
          customLogo: mb.customLogo || null,
          primaryColor: mb.primaryColor || null,
          secondaryColor: mb.secondaryColor || null,
          isWhiteLabel: Boolean(mb.isWhiteLabel),
        },
        isActive: true,
      };

      if (!dryRun) {
        mbTenant = await storage.createTenant(tenantData);
        createdTenantIds.push(mbTenant.id);
        tenantsByLegacyUserId.set(mb.id, mbTenant);
        masterTenantsByUserId.set(mb.id, mbTenant);
      } else {
        const previewTenant: Tenant = {
          id: `preview-mb-${mb.id.slice(0, 8)}`,
          ...tenantData,
          parentTenantId: platformId,
          settings: tenantData.settings as any,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        masterTenantsByUserId.set(mb.id, previewTenant);
      }
    }
  }

  // 4. Process Brokers
  let brokerTenantsExisting = 0;
  let brokerTenantsToCreate = 0;
  let brokerToMasterCount = 0;
  let brokerToPlatformDirectCount = 0;
  let invalidMasterBrokerIdCount = 0;
  const brokerTenantsByUserId = new Map<string, Tenant>();

  for (const b of brokers) {
    let parentTenantId = platformId;

    if (b.masterBrokerId) {
      const targetMbUser = usersById.get(b.masterBrokerId);
      if (targetMbUser && targetMbUser.role === "master_broker") {
        const parentMasterTenant = masterTenantsByUserId.get(targetMbUser.id);
        if (parentMasterTenant) {
          parentTenantId = parentMasterTenant.id;
          brokerToMasterCount++;
        } else {
          parentTenantId = platformId;
          invalidMasterBrokerIdCount++;
          anomalies.push({
            userId: b.id,
            email: b.email || undefined,
            role: b.role,
            type: "invalid_master_broker",
            description: `Broker tiene masterBrokerId='${b.masterBrokerId}' pero la organización del Master no se pudo resolver. Asignado a Platform.`,
          });
        }
      } else {
        // masterBrokerId points to non-master_broker user (e.g. admin or missing)
        parentTenantId = platformId;
        invalidMasterBrokerIdCount++;
        const targetRole = targetMbUser ? targetMbUser.role : "inexistente";
        anomalies.push({
          userId: b.id,
          email: b.email || undefined,
          role: b.role,
          type: "invalid_master_broker",
          description: `Broker tiene masterBrokerId='${b.masterBrokerId}' que apunta a usuario con rol '${targetRole}'. Asignado a Platform como caso especial.`,
        });
        warnings.push(
          `Broker ${b.id} (${b.firstName || ""} ${b.lastName || ""}) tiene masterBrokerId inválido (${b.masterBrokerId}). Se asigna a Platform.`
        );
      }
    } else {
      parentTenantId = platformId;
      brokerToPlatformDirectCount++;
      warnings.push(
        `Broker directo ${b.id} (${b.firstName || ""} ${b.lastName || ""}) no tiene masterBrokerId. Se asigna a Platform.`
      );
    }

    let bTenant = tenantsByLegacyUserId.get(b.id);
    if (bTenant) {
      brokerTenantsExisting++;
      brokerTenantsByUserId.set(b.id, bTenant);
    } else {
      brokerTenantsToCreate++;
      const name = resolveTenantName(b, "broker");
      const baseSlug = slugify(name) || `broker-${b.id.slice(0, 8)}`;
      const slug = resolveUniqueSlug(baseSlug, existingSlugs, b.id);

      const tenantData: InsertTenant = {
        type: "broker",
        name,
        slug,
        parentTenantId,
        settings: {
          migrationSource: "legacy_user_backfill",
          legacyOwnerUserId: b.id,
          legacyRole: b.role,
          legacyMasterBrokerId: b.masterBrokerId || null,
          brandName: b.brandName || null,
          customLogo: b.customLogo || null,
          primaryColor: b.primaryColor || null,
          secondaryColor: b.secondaryColor || null,
          isWhiteLabel: Boolean(b.isWhiteLabel),
        },
        isActive: true,
      };

      if (!dryRun) {
        bTenant = await storage.createTenant(tenantData);
        createdTenantIds.push(bTenant.id);
        tenantsByLegacyUserId.set(b.id, bTenant);
        brokerTenantsByUserId.set(b.id, bTenant);
      } else {
        const previewTenant: Tenant = {
          id: `preview-b-${b.id.slice(0, 8)}`,
          ...tenantData,
          parentTenantId,
          settings: tenantData.settings as any,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        brokerTenantsByUserId.set(b.id, previewTenant);
      }
    }
  }

  // 5. Process Memberships
  let membershipsExisting = 0;
  let membershipsToCreate = 0;

  interface PlannedMembership {
    tenantId: string;
    userId: string;
    role: "owner" | "admin" | "member";
    userEmail?: string;
  }

  const plannedMemberships: PlannedMembership[] = [];

  // 5a. Super Admins -> platform / owner
  for (const sa of superAdmins) {
    plannedMemberships.push({
      tenantId: platformId,
      userId: sa.id,
      role: "owner",
      userEmail: sa.email || undefined,
    });
  }

  // 5b. Admins -> platform / admin
  for (const a of admins) {
    plannedMemberships.push({
      tenantId: platformId,
      userId: a.id,
      role: "admin",
      userEmail: a.email || undefined,
    });
  }

  // 5c. Master Brokers -> their own master tenant / owner
  for (const mb of masterBrokers) {
    const mbTenant = masterTenantsByUserId.get(mb.id);
    if (mbTenant) {
      plannedMemberships.push({
        tenantId: mbTenant.id,
        userId: mb.id,
        role: "owner",
        userEmail: mb.email || undefined,
      });
    }
  }

  // 5d. Brokers -> their own broker tenant / owner
  for (const b of brokers) {
    const bTenant = brokerTenantsByUserId.get(b.id);
    if (bTenant) {
      plannedMemberships.push({
        tenantId: bTenant.id,
        userId: b.id,
        role: "owner",
        userEmail: b.email || undefined,
      });
    }
  }

  // Check which memberships are new vs existing
  for (const pm of plannedMemberships) {
    const key = `${pm.tenantId}:${pm.userId}`;
    if (existingMemberships.has(key)) {
      membershipsExisting++;
    } else {
      membershipsToCreate++;
      if (!dryRun) {
        const createdMember = await storage.createTenantMember({
          tenantId: pm.tenantId,
          userId: pm.userId,
          role: pm.role,
          isActive: true,
        });
        createdMemberIds.push(createdMember.id);
        existingMemberships.add(key);
      }
    }
  }

  const summary: BackfillSummary = {
    totalUsers: allUsers.length,
    superAdmins: superAdmins.length,
    admins: admins.length,
    masterBrokers: masterBrokers.length,
    brokers: brokers.length,
    otherUsers: otherUsers.length,

    platformTenantAction,
    platformTenantId: platformId,

    masterTenantsExisting,
    masterTenantsToCreate,

    brokerTenantsExisting,
    brokerTenantsToCreate,

    membershipsExisting,
    membershipsToCreate,

    brokerToMasterCount,
    brokerToPlatformDirectCount,
    invalidMasterBrokerIdCount,

    warnings,
    anomalies,
  };

  return {
    dryRun,
    success: true,
    summary,
    createdTenantIds,
    createdMemberIds,
  };
  } catch (error) {
    if (!dryRun) {
      log(
        `⚠️ Error durante el backfill. Revirtiendo ${createdMemberIds.length} membresía(s) y ${createdTenantIds.length} tenant(s) creados...`
      );
      for (const mId of createdMemberIds) {
        try {
          await storage.deleteTenantMember(mId);
        } catch (_) {}
      }
      for (const tId of createdTenantIds) {
        try {
          await storage.deleteTenant(tId);
        } catch (_) {}
      }
    }
    throw error;
  }
}

/**
 * Validates post-backfill conditions (Requirement 9).
 */
export async function validatePostBackfill(storage: IStorage): Promise<{
  valid: boolean;
  errors: string[];
}> {
  const errors: string[] = [];

  const allTenants = await storage.getTenants();
  const allUsers = await storage.getAllUsers();
  const allMembers = await storage.getTenantMembers();

  // 1. Exactly one platform tenant
  const platformTenants = allTenants.filter(
    (t) => t.type === "platform" || t.slug === "platform"
  );
  if (platformTenants.length !== 1) {
    errors.push(
      `Debe existir exactamente 1 tenant platform. Encontrados: ${platformTenants.length}`
    );
  }
  const platformTenant = platformTenants[0];

  // 2. Memberships uniqueness
  const seenMemberships = new Set<string>();
  for (const m of allMembers) {
    const key = `${m.tenantId}:${m.userId}`;
    if (seenMemberships.has(key)) {
      errors.push(`Membresía duplicada detectada para (${key})`);
    }
    seenMemberships.add(key);
  }

  // 3. Unique tenant per legacyOwnerUserId
  const seenLegacyUsers = new Set<string>();
  for (const t of allTenants) {
    const legacyOwner = (t.settings as any)?.legacyOwnerUserId;
    if (legacyOwner) {
      if (seenLegacyUsers.has(legacyOwner)) {
        errors.push(`Tenant duplicado para el usuario legacyOwnerUserId='${legacyOwner}'`);
      }
      seenLegacyUsers.add(legacyOwner);
    }
  }

  if (platformTenant) {
    // 4. Super admins have active membership in platform (owner)
    for (const sa of allUsers.filter((u) => u.role === "super_admin")) {
      const membership = allMembers.find(
        (m) => m.tenantId === platformTenant.id && m.userId === sa.id && m.isActive
      );
      if (!membership) {
        errors.push(`Super Admin ${sa.id} (${sa.email}) no tiene membresía activa en platform`);
      }
    }

    // 5. Admins have active membership in platform (admin)
    for (const a of allUsers.filter((u) => u.role === "admin")) {
      const membership = allMembers.find(
        (m) => m.tenantId === platformTenant.id && m.userId === a.id && m.isActive
      );
      if (!membership) {
        errors.push(`Admin ${a.id} (${a.email}) no tiene membresía activa en platform`);
      }
    }
  }

  // 6. Master Brokers have exactly 1 master tenant with owner membership
  for (const mb of allUsers.filter((u) => u.role === "master_broker")) {
    const mbTenant = allTenants.find(
      (t) => (t.settings as any)?.legacyOwnerUserId === mb.id && t.type === "master_broker"
    );
    if (!mbTenant) {
      errors.push(`Master Broker ${mb.id} no tiene tenant master_broker asociado.`);
    } else {
      const ownerMem = allMembers.find(
        (m) => m.tenantId === mbTenant.id && m.userId === mb.id && m.role === "owner" && m.isActive
      );
      if (!ownerMem) {
        errors.push(`Master Broker ${mb.id} no es membership owner activo de su tenant.`);
      }
    }
  }

  // 7. Brokers have exactly 1 broker tenant with owner membership and valid parent
  for (const b of allUsers.filter((u) => u.role === "broker")) {
    const bTenant = allTenants.find(
      (t) => (t.settings as any)?.legacyOwnerUserId === b.id && t.type === "broker"
    );
    if (!bTenant) {
      errors.push(`Broker ${b.id} no tiene tenant broker asociado.`);
    } else {
      const ownerMem = allMembers.find(
        (m) => m.tenantId === bTenant.id && m.userId === b.id && m.role === "owner" && m.isActive
      );
      if (!ownerMem) {
        errors.push(`Broker ${b.id} no es membership owner activo de su tenant.`);
      }

      // Check hierarchy
      if (b.masterBrokerId) {
        const mbUser = allUsers.find((u) => u.id === b.masterBrokerId);
        if (mbUser && mbUser.role === "master_broker") {
          const mbTenant = allTenants.find(
            (t) => (t.settings as any)?.legacyOwnerUserId === mbUser.id
          );
          if (mbTenant && bTenant.parentTenantId !== mbTenant.id) {
            errors.push(
              `Broker ${b.id} debería tener parentTenantId=${mbTenant.id} pero tiene ${bTenant.parentTenantId}`
            );
          }
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
