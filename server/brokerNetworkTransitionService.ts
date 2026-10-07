import { randomBytes, randomUUID } from "node:crypto";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { db } from "./db";
import {
  commercialAuditLogs,
  notifications,
  tenantMembers,
  tenants,
  userStatusRequests,
  users,
} from "../shared/schema";

export type BrokerNetworkTransitionAction =
  | "assign_master"
  | "assign_platform"
  | "promote_master";

export interface BrokerNetworkTransitionInput {
  actorUserId: string;
  brokerId: string;
  action: BrokerNetworkTransitionAction;
  targetMasterBrokerId?: string | null;
  reason: string;
  reactivate?: boolean;
}

export class BrokerNetworkTransitionError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 400,
    public readonly code: string = "BROKER_NETWORK_TRANSITION_ERROR",
  ) {
    super(message);
    this.name = "BrokerNetworkTransitionError";
  }
}

export interface CreateBrokerWithOrganizationInput {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  password?: string | null;
  authMethod?: string;
  masterBrokerId?: string | null;
  profileData?: unknown;
  isActive?: boolean;
}

function brokerTenantName(input: { id: string; firstName?: string | null; lastName?: string | null }) {
  const fullName = `${input.firstName || ""} ${input.lastName || ""}`.trim();
  return fullName || `Broker ${input.id.slice(0, 8)}`;
}

function slugBase(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 38);
}

/**
 * Canonical creation path for a Broker identity.
 *
 * The user, its own Broker tenant and owner membership are created in the same
 * DB transaction. This prevents new brokers from becoming "orphan users"
 * without an organization, which would make later network transitions unsafe.
 */
export async function createBrokerWithOrganization(input: CreateBrokerWithOrganizationInput) {
  const normalizedEmail = input.email.trim().toLowerCase();
  if (!normalizedEmail) {
    throw new BrokerNetworkTransitionError("El email del broker es obligatorio.", 400, "EMAIL_REQUIRED");
  }

  return await db.transaction(async (tx: any) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`broker_create_${normalizedEmail}`}))`,
    );

    const [existing] = await tx
      .select({ id: users.id })
      .from(users)
      .where(sql`LOWER(TRIM(${users.email})) = ${normalizedEmail}`)
      .limit(1);

    if (existing) {
      throw new BrokerNetworkTransitionError(
        "El email ya está registrado en el sistema.",
        409,
        "EMAIL_ALREADY_EXISTS",
      );
    }

    const platformTenant = await getPlatformTenant(tx);
    let parentTenantId = platformTenant.id;
    let masterBrokerId: string | null = null;

    if (input.masterBrokerId) {
      const [master] = await tx
        .select()
        .from(users)
        .where(eq(users.id, input.masterBrokerId))
        .limit(1);

      const masterStatus = master?.status || (master?.isActive ? "active" : "inactive");
      if (!master || master.role !== "master_broker" || master.isActive === false || masterStatus !== ACTIVE_STATUS) {
        throw new BrokerNetworkTransitionError(
          "El Master Broker de alta no es válido o no está activo.",
          409,
          "MASTER_FOR_CREATION_INVALID",
        );
      }

      const masterTenant = await getOwnedTenant(tx, master.id, "master_broker");
      masterBrokerId = master.id;
      parentTenantId = masterTenant.id;
    }

    const now = new Date();
    const userId = randomUUID();
    const [user] = await tx
      .insert(users)
      .values({
        id: userId,
        email: normalizedEmail,
        firstName: input.firstName?.trim() || null,
        lastName: input.lastName?.trim() || null,
        password: input.password || null,
        authMethod: input.authMethod || "local",
        role: "broker",
        masterBrokerId,
        profileData: input.profileData || {},
        isActive: input.isActive !== false,
        status: input.isActive === false ? "inactive" : "active",
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    const name = brokerTenantName(user);
    const base = slugBase(name) || "broker";
    // User UUID suffix makes collision practically impossible and keeps email out of URLs.
    const slug = `${base}-${user.id.slice(0, 8).toLowerCase()}`;

    const [tenant] = await tx
      .insert(tenants)
      .values({
        id: randomUUID(),
        type: "broker",
        name,
        slug,
        parentTenantId,
        settings: {
          legacyOwnerUserId: user.id,
          createdFrom: "canonical_broker_creation",
        },
        isActive: input.isActive !== false,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    const [member] = await tx
      .insert(tenantMembers)
      .values({
        id: randomUUID(),
        tenantId: tenant.id,
        userId: user.id,
        role: "owner",
        canOriginate: true,
        isActive: input.isActive !== false,
        joinedAt: now,
        updatedAt: now,
      })
      .returning();

    return { user, tenant, member };
  });
}

const ACTIVE_STATUS = "active";

function ownerUserIdPredicate(userId: string) {
  return sql`${tenants.settings}->>'legacyOwnerUserId' = ${userId}`;
}

async function getPlatformTenant(tx: any) {
  const matches = await tx
    .select()
    .from(tenants)
    .where(or(eq(tenants.type, "platform"), eq(tenants.slug, "platform")));

  const unique = Array.from(new Map(matches.map((t: any) => [t.id, t])).values());
  if (unique.length !== 1) {
    throw new BrokerNetworkTransitionError(
      `La topología requiere exactamente una organización plataforma. Encontradas: ${unique.length}.`,
      409,
      "PLATFORM_TOPOLOGY_INVALID",
    );
  }
  return unique[0];
}

async function getOwnedTenant(tx: any, userId: string, expectedType?: "broker" | "master_broker") {
  const conditions: any[] = [ownerUserIdPredicate(userId)];
  if (expectedType) conditions.push(eq(tenants.type, expectedType));

  const rows = await tx
    .select()
    .from(tenants)
    .where(and(...conditions));

  if (rows.length !== 1) {
    throw new BrokerNetworkTransitionError(
      `No se pudo resolver de forma unívoca la organización propia del usuario. Encontradas: ${rows.length}.`,
      409,
      "OWN_TENANT_TOPOLOGY_INVALID",
    );
  }
  return rows[0];
}

async function ensureUniqueMasterReferralCode(tx: any): Promise<string> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const candidate = `MB-${randomBytes(5).toString("hex").toUpperCase()}`;
    const [existing] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.referralCode, candidate))
      .limit(1);

    if (!existing) return candidate;
  }

  throw new BrokerNetworkTransitionError(
    "No se pudo generar una clave de red única. Intenta nuevamente.",
    500,
    "REFERRAL_CODE_GENERATION_FAILED",
  );
}

function affiliationState(role: string, masterBrokerId: string | null | undefined) {
  if (role === "master_broker") return "master_broker";
  return masterBrokerId ? `master:${masterBrokerId}` : "platform";
}

function transitionActionLabel(action: BrokerNetworkTransitionAction) {
  switch (action) {
    case "assign_master":
      return "broker_assigned_to_master";
    case "assign_platform":
      return "broker_assigned_to_platform";
    case "promote_master":
      return "broker_promoted_to_master";
  }
}

export async function executeBrokerNetworkTransition(input: BrokerNetworkTransitionInput) {
  const reason = input.reason?.trim();
  if (!reason || reason.length < 3) {
    throw new BrokerNetworkTransitionError(
      "El motivo del cambio es obligatorio (mínimo 3 caracteres).",
      400,
      "REASON_REQUIRED",
    );
  }

  return await db.transaction(async (tx: any) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`broker_transition_${input.brokerId}`}))`,
    );

    const [actor] = await tx.select().from(users).where(eq(users.id, input.actorUserId)).limit(1);
    if (!actor) {
      throw new BrokerNetworkTransitionError("Usuario no autenticado.", 401, "ACTOR_NOT_FOUND");
    }
    if (actor.role !== "super_admin") {
      throw new BrokerNetworkTransitionError(
        "Esta operación es exclusiva de Super Admin.",
        403,
        "SUPER_ADMIN_REQUIRED",
      );
    }

    const [broker] = await tx.select().from(users).where(eq(users.id, input.brokerId)).limit(1);
    if (!broker) {
      throw new BrokerNetworkTransitionError("Broker no encontrado.", 404, "BROKER_NOT_FOUND");
    }
    if (broker.role !== "broker") {
      throw new BrokerNetworkTransitionError(
        "Sólo un usuario con rol Broker puede moverse de red o convertirse en Master Broker.",
        409,
        "TARGET_NOT_BROKER",
      );
    }

    const platformTenant = await getPlatformTenant(tx);
    const brokerTenant = await getOwnedTenant(tx, broker.id, "broker");
    const previousParentTenantId = brokerTenant.parentTenantId || null;
    const previousMasterBrokerId = broker.masterBrokerId || null;
    const previousStatus = broker.status || (broker.isActive ? "active" : "inactive");

    let nextRole = "broker";
    let nextMasterBrokerId: string | null = null;
    let nextParentTenantId = platformTenant.id;
    let nextTenantType: "broker" | "master_broker" = "broker";
    let targetMaster: any = null;
    let targetMasterTenant: any = null;
    let referralCode = broker.referralCode || null;
    const reactivate = input.action === "promote_master" ? true : input.reactivate !== false;

    if (input.action === "assign_master") {
      if (!input.targetMasterBrokerId) {
        throw new BrokerNetworkTransitionError(
          "Debes seleccionar el Master Broker destino.",
          400,
          "TARGET_MASTER_REQUIRED",
        );
      }
      if (input.targetMasterBrokerId === broker.id) {
        throw new BrokerNetworkTransitionError(
          "Un broker no puede asignarse a sí mismo como Master Broker.",
          400,
          "SELF_MASTER_NOT_ALLOWED",
        );
      }

      [targetMaster] = await tx
        .select()
        .from(users)
        .where(eq(users.id, input.targetMasterBrokerId))
        .limit(1);

      if (!targetMaster || targetMaster.role !== "master_broker") {
        throw new BrokerNetworkTransitionError(
          "El usuario destino no es un Master Broker válido.",
          409,
          "TARGET_MASTER_INVALID",
        );
      }
      const targetStatus = targetMaster.status || (targetMaster.isActive ? "active" : "inactive");
      if (targetMaster.isActive === false || targetStatus !== ACTIVE_STATUS) {
        throw new BrokerNetworkTransitionError(
          "No se puede asignar un broker a un Master Broker inactivo o suspendido.",
          409,
          "TARGET_MASTER_INACTIVE",
        );
      }

      targetMasterTenant = await getOwnedTenant(tx, targetMaster.id, "master_broker");
      nextMasterBrokerId = targetMaster.id;
      nextParentTenantId = targetMasterTenant.id;

      const alreadyThere =
        previousMasterBrokerId === nextMasterBrokerId &&
        previousParentTenantId === nextParentTenantId &&
        previousStatus === ACTIVE_STATUS &&
        broker.isActive !== false;
      if (alreadyThere) {
        throw new BrokerNetworkTransitionError(
          "El broker ya está activo dentro de esa red.",
          409,
          "NO_TRANSITION_REQUIRED",
        );
      }
    } else if (input.action === "assign_platform") {
      nextMasterBrokerId = null;
      nextParentTenantId = platformTenant.id;

      const alreadyDirect =
        !previousMasterBrokerId &&
        previousParentTenantId === platformTenant.id &&
        previousStatus === ACTIVE_STATUS &&
        broker.isActive !== false;
      if (alreadyDirect) {
        throw new BrokerNetworkTransitionError(
          "El broker ya pertenece directamente a Crédito Negocios y está activo.",
          409,
          "NO_TRANSITION_REQUIRED",
        );
      }
    } else if (input.action === "promote_master") {
      nextRole = "master_broker";
      nextMasterBrokerId = null;
      nextParentTenantId = platformTenant.id;
      nextTenantType = "master_broker";
      referralCode = referralCode || (await ensureUniqueMasterReferralCode(tx));
    }

    const now = new Date();
    const userUpdates: any = {
      role: nextRole,
      masterBrokerId: nextMasterBrokerId,
      updatedAt: now,
    };

    if (input.action === "promote_master") {
      userUpdates.referralCode = referralCode;
      // Empty custom permissions force the canonical Master Broker RBAC defaults.
      userUpdates.permissions = {};
    }

    if (reactivate) {
      userUpdates.status = ACTIVE_STATUS;
      userUpdates.isActive = true;
      userUpdates.statusChangedAt = now;
      userUpdates.statusChangedBy = actor.id;
      userUpdates.statusChangeReason = reason;
      userUpdates.statusChangeNotes =
        input.action === "promote_master"
          ? "Reactivación/activación asociada a promoción a Master Broker."
          : "Reactivación/activación asociada a reasignación de red por Super Admin.";
    }

    const [updatedUser] = await tx
      .update(users)
      .set(userUpdates)
      .where(eq(users.id, broker.id))
      .returning();

    const existingSettings = (brokerTenant.settings as Record<string, unknown> | null) || {};
    const nextSettings =
      input.action === "promote_master"
        ? {
            ...existingSettings,
            previousTenantType: brokerTenant.type,
            previousParentTenantId,
            promotedAt: now.toISOString(),
            promotedBy: actor.id,
          }
        : existingSettings;

    const [updatedTenant] = await tx
      .update(tenants)
      .set({
        type: nextTenantType,
        parentTenantId: nextParentTenantId,
        settings: nextSettings,
        isActive: reactivate ? true : brokerTenant.isActive,
        updatedAt: now,
      })
      .where(eq(tenants.id, brokerTenant.id))
      .returning();

    const [existingOwnerMembership] = await tx
      .select()
      .from(tenantMembers)
      .where(and(eq(tenantMembers.tenantId, brokerTenant.id), eq(tenantMembers.userId, broker.id)))
      .limit(1);

    if (existingOwnerMembership) {
      await tx
        .update(tenantMembers)
        .set({
          role: "owner",
          canOriginate: true,
          isActive: reactivate ? true : existingOwnerMembership.isActive,
          updatedAt: now,
        })
        .where(eq(tenantMembers.id, existingOwnerMembership.id));
    } else {
      await tx.insert(tenantMembers).values({
        tenantId: brokerTenant.id,
        userId: broker.id,
        role: "owner",
        canOriginate: true,
        isActive: reactivate ? true : broker.isActive !== false,
        joinedAt: now,
        updatedAt: now,
      });
    }

    const pendingRequests = await tx
      .select({ id: userStatusRequests.id, requesterId: userStatusRequests.requesterId })
      .from(userStatusRequests)
      .where(
        and(
          eq(userStatusRequests.targetUserId, broker.id),
          eq(userStatusRequests.status, "pending"),
        ),
      );

    if (pendingRequests.length > 0) {
      await tx
        .update(userStatusRequests)
        .set({
          status: "rejected",
          reviewedBy: actor.id,
          reviewedAt: now,
          reviewNotes:
            "Solicitud invalidada automáticamente por un cambio de afiliación o rol ejecutado por Super Admin.",
          updatedAt: now,
        })
        .where(
          and(
            eq(userStatusRequests.targetUserId, broker.id),
            eq(userStatusRequests.status, "pending"),
          ),
        );
    }

    const auditAction = transitionActionLabel(input.action);
    const previousState = affiliationState(broker.role, previousMasterBrokerId);
    const newState = affiliationState(nextRole, nextMasterBrokerId);

    const [audit] = await tx
      .insert(commercialAuditLogs)
      .values({
        entityType: "broker_network_assignment",
        entityId: broker.id,
        brokerId: broker.id,
        performedBy: actor.id,
        action: auditAction,
        previousState,
        newState,
        metadata: {
          reason,
          previousRole: broker.role,
          newRole: nextRole,
          previousMasterBrokerId,
          newMasterBrokerId: nextMasterBrokerId,
          brokerTenantId: brokerTenant.id,
          previousTenantType: brokerTenant.type,
          newTenantType: nextTenantType,
          previousParentTenantId,
          newParentTenantId: nextParentTenantId,
          previousStatus,
          newStatus: reactivate ? ACTIVE_STATUS : previousStatus,
          reactivated: reactivate && (previousStatus !== ACTIVE_STATUS || broker.isActive === false),
          referralCode: input.action === "promote_master" ? referralCode : undefined,
          rejectedPendingStatusRequests: pendingRequests.length,
          effectiveAt: now.toISOString(),
          historicalAttributionPreserved: true,
        },
        createdAt: now,
      })
      .returning();

    const targetLabel =
      input.action === "promote_master"
        ? "Master Broker"
        : input.action === "assign_platform"
          ? "Crédito Negocios (red directa)"
          : targetMaster?.brandName ||
            `${targetMaster?.firstName || ""} ${targetMaster?.lastName || ""}`.trim() ||
            targetMaster?.email ||
            "Master Broker";

    await tx.insert(notifications).values({
      userId: broker.id,
      type: "broker_network_transition",
      title: input.action === "promote_master" ? "Perfil actualizado a Master Broker" : "Asignación de red actualizada",
      message:
        input.action === "promote_master"
          ? "Super Admin actualizó tu perfil a Master Broker. Tus operaciones históricas conservan su atribución original."
          : `Super Admin actualizó tu afiliación a ${targetLabel}. El cambio aplica a negocio nuevo; el historial previo conserva su atribución original.`,
      data: {
        action: input.action,
        targetMasterBrokerId: nextMasterBrokerId,
        targetTenantId: updatedTenant.id,
        effectiveAt: now.toISOString(),
      },
      priority: "high",
      createdAt: now,
    });

    const masterNotificationIds = new Set<string>();
    if (previousMasterBrokerId && previousMasterBrokerId !== nextMasterBrokerId) {
      const [previousMaster] = await tx
        .select({ id: users.id, role: users.role })
        .from(users)
        .where(eq(users.id, previousMasterBrokerId))
        .limit(1);
      if (previousMaster?.role === "master_broker") masterNotificationIds.add(previousMaster.id);
    }
    if (nextMasterBrokerId) masterNotificationIds.add(nextMasterBrokerId);

    for (const masterId of masterNotificationIds) {
      await tx.insert(notifications).values({
        userId: masterId,
        type: "broker_network_transition",
        title: "Cambio en red de brokers",
        message:
          masterId === nextMasterBrokerId
            ? `${broker.firstName || broker.email || "Un broker"} fue asignado a tu red por Super Admin.`
            : `${broker.firstName || broker.email || "Un broker"} dejó de pertenecer a tu red por decisión de Super Admin.`,
        data: {
          brokerId: broker.id,
          action: input.action,
          effectiveAt: now.toISOString(),
        },
        priority: "medium",
        createdAt: now,
      });
    }

    return {
      user: updatedUser,
      tenant: updatedTenant,
      audit,
      transition: {
        action: input.action,
        previousRole: broker.role,
        newRole: nextRole,
        previousMasterBrokerId,
        newMasterBrokerId: nextMasterBrokerId,
        previousParentTenantId,
        newParentTenantId: nextParentTenantId,
        reactivated: reactivate && (previousStatus !== ACTIVE_STATUS || broker.isActive === false),
        rejectedPendingStatusRequests: pendingRequests.length,
        effectiveAt: now.toISOString(),
        historicalAttributionPreserved: true,
      },
    };
  });
}

async function assertSuperAdmin(actorUserId: string) {
  const [actor] = await db.select().from(users).where(eq(users.id, actorUserId)).limit(1);
  if (!actor) {
    throw new BrokerNetworkTransitionError("Usuario no autenticado.", 401, "ACTOR_NOT_FOUND");
  }
  if (actor.role !== "super_admin") {
    throw new BrokerNetworkTransitionError(
      "Esta operación es exclusiva de Super Admin.",
      403,
      "SUPER_ADMIN_REQUIRED",
    );
  }
}

export async function getBrokerNetworkTransitionHistory(actorUserId: string, brokerId: string) {
  await assertSuperAdmin(actorUserId);
  return await db
    .select()
    .from(commercialAuditLogs)
    .where(
      and(
        eq(commercialAuditLogs.entityType, "broker_network_assignment"),
        eq(commercialAuditLogs.entityId, brokerId),
      ),
    )
    .orderBy(desc(commercialAuditLogs.createdAt))
    .limit(50);
}

export async function getBrokerNetworkTransitionContext(actorUserId: string, brokerId: string) {
  await assertSuperAdmin(actorUserId);

  const [broker] = await db.select().from(users).where(eq(users.id, brokerId)).limit(1);
  if (!broker) {
    throw new BrokerNetworkTransitionError("Broker no encontrado.", 404, "BROKER_NOT_FOUND");
  }
  if (broker.role !== "broker") {
    throw new BrokerNetworkTransitionError(
      "El usuario seleccionado ya no tiene rol Broker.",
      409,
      "TARGET_NOT_BROKER",
    );
  }

  const platformRows = await db
    .select()
    .from(tenants)
    .where(or(eq(tenants.type, "platform"), eq(tenants.slug, "platform")));
  const platformTenant = Array.from(new Map(platformRows.map((t) => [t.id, t])).values())[0] || null;

  const brokerTenants = await db
    .select()
    .from(tenants)
    .where(and(eq(tenants.type, "broker"), ownerUserIdPredicate(broker.id)));
  const brokerTenant = brokerTenants.length === 1 ? brokerTenants[0] : null;

  const masterUsers = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      brandName: users.brandName,
      isActive: users.isActive,
      status: users.status,
      referralCode: users.referralCode,
    })
    .from(users)
    .where(eq(users.role, "master_broker"));

  const masterTenants = await db
    .select({
      id: tenants.id,
      name: tenants.name,
      ownerUserId: sql<string | null>`${tenants.settings}->>'legacyOwnerUserId'`,
      isActive: tenants.isActive,
    })
    .from(tenants)
    .where(eq(tenants.type, "master_broker"));

  const tenantByOwner = new Map(masterTenants.map((t) => [t.ownerUserId, t]));
  const masters = masterUsers
    .map((master) => ({
      ...master,
      tenant: tenantByOwner.get(master.id) || null,
    }))
    .filter(
      (master) =>
        master.isActive !== false &&
        (master.status || "active") === "active" &&
        Boolean(master.tenant?.id),
    );

  const currentMaster =
    broker.masterBrokerId ? masters.find((master) => master.id === broker.masterBrokerId) || null : null;

  const history = await getBrokerNetworkTransitionHistory(actorUserId, broker.id);

  return {
    broker: {
      id: broker.id,
      email: broker.email,
      firstName: broker.firstName,
      lastName: broker.lastName,
      role: broker.role,
      masterBrokerId: broker.masterBrokerId,
      status: broker.status || (broker.isActive ? "active" : "inactive"),
      isActive: broker.isActive,
    },
    brokerTenant,
    platformTenant,
    currentMaster,
    masters,
    history,
  };
}
