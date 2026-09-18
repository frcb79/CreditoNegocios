import { storage, type IStorage } from "./storage";
import { getEffectivePermissions } from "./middleware/rbacMiddleware";
import type { TenantMemberPermissions } from "../shared/schema";

export interface ValidationParams {
  permissions: TenantMemberPermissions | any;
  tenantType: string;
  callerUser: any;
  callerRole: "owner" | "admin" | "super_admin";
  isSuperAdmin: boolean;
}

export function validateTenantMemberPermissions(params: ValidationParams): {
  valid: boolean;
  error?: string;
  permissions?: any;
} {
  const { permissions, tenantType, callerUser, isSuperAdmin } = params;
  if (!permissions) {
    return { valid: true, permissions: {} };
  }

  const requestedScope = permissions.scope;

  // 1. Scope rules by tenant type
  if (tenantType === "broker") {
    if (requestedScope === "global" || requestedScope === "network") {
      return {
        valid: false,
        error: "Los usuarios de una organización Broker no pueden recibir scope 'global' ni 'network'.",
      };
    }
  } else if (tenantType === "master_broker") {
    if (requestedScope === "global") {
      return {
        valid: false,
        error: "Los usuarios de una organización Master Broker no pueden recibir scope 'global'.",
      };
    }
  }

  if (requestedScope === "global" && !isSuperAdmin) {
    return {
      valid: false,
      error: "Solo un Super Administrador de plataforma puede conceder scope 'global'.",
    };
  }

  // 2. Privilege escalation check against caller's effective permissions
  if (!isSuperAdmin && callerUser) {
    const callerEffective = getEffectivePermissions(callerUser);

    if (Array.isArray(permissions.modules)) {
      const unauthorizedModules = permissions.modules.filter(
        (m: string) => !callerEffective.modules.includes(m)
      );
      if (unauthorizedModules.length > 0) {
        return {
          valid: false,
          error: `No puedes conceder acceso a módulos que no tienes asignados: ${unauthorizedModules.join(", ")}.`,
        };
      }
    }

    if (Array.isArray(permissions.actions)) {
      const unauthorizedActions = permissions.actions.filter(
        (a: string) => !callerEffective.actions.includes(a)
      );
      if (unauthorizedActions.length > 0) {
        return {
          valid: false,
          error: `No puedes conceder facultades que no tienes asignadas: ${unauthorizedActions.join(", ")}.`,
        };
      }
    }

    // Platform reserved capabilities check:
    const platformReservedModules = ["financieras", "sistema_productos", "importacion"];
    if (tenantType !== "platform") {
      const forbiddenPlatformModules = (permissions.modules || []).filter(
        (m: string) => platformReservedModules.includes(m)
      );
      if (forbiddenPlatformModules.length > 0) {
        return {
          valid: false,
          error: `Los módulos reservados de plataforma (${forbiddenPlatformModules.join(", ")}) solo pueden ser concedidos por Super Admin.`,
        };
      }
    }
  }

  return { valid: true, permissions };
}

export interface CommercialOriginationParams {
  callerUser: any;
  callerMembership?: {
    role: "owner" | "admin" | "member";
    canOriginate?: boolean | null;
    isActive?: boolean | null;
  } | null;
  tenantId?: string | null;
  requestedBrokerId?: string | null;
}

/**
 * Validates organizational commercial origination and commission attribution (Bloque 4)
 * Rule:
 * - tenantId = active organization
 * - brokerId = accredited broker who commercially originated and earns commission
 * - createdBy = user capturing/creating the record
 * - An admin/member with canOriginate: true can originate under their own name.
 * - An admin/member with canOriginate: false can collaborate/capture records on behalf
 *   of an accredited broker in the organization, but cannot self-adjudicate commissions.
 */
export async function validateCommercialOrigination(
  params: CommercialOriginationParams,
  targetStorage: IStorage = storage
): Promise<{
  allowed: boolean;
  message?: string;
  brokerId?: string;
}> {
  const { callerUser, callerMembership, tenantId, requestedBrokerId } = params;

  if (!callerUser) {
    return { allowed: false, message: "Usuario no autenticado" };
  }

  // 1. Super admin and platform admin can specify any brokerId or self
  if (callerUser.role === "super_admin" || callerUser.role === "admin") {
    return {
      allowed: true,
      brokerId: requestedBrokerId || callerUser.id,
    };
  }

  // 2. Legacy standalone user without membership
  if (!callerMembership) {
    return {
      allowed: true,
      brokerId: requestedBrokerId || callerUser.id,
    };
  }

  const isOwner = callerMembership.role === "owner";
  const callerCanOriginate = isOwner || callerMembership.canOriginate === true;

  // Case A: The caller wants to originate in their own name (or brokerId not specified)
  if (!requestedBrokerId || requestedBrokerId === callerUser.id) {
    if (!callerCanOriginate) {
      return {
        allowed: false,
        message:
          "Operación restringida: Para originar una operación y percibir la comisión correspondiente, la capacidad de broker originador está reservada al titular comercial (Owner) o a miembros con capacidad de broker habilitada en tu organización.",
      };
    }
    return {
      allowed: true,
      brokerId: callerUser.id,
    };
  }

  // Case B: The caller is capturing/collaborating on behalf of another accredited broker in the organization
  if (tenantId) {
    const targetMembership = await targetStorage.getUserTenantMembership(requestedBrokerId, tenantId);
    if (!targetMembership || !targetMembership.isActive) {
      return {
        allowed: false,
        message: "El broker asignado no pertenece como miembro activo a esta organización.",
      };
    }
    const targetCanOriginate = targetMembership.role === "owner" || (targetMembership as any).canOriginate === true;
    if (!targetCanOriginate) {
      return {
        allowed: false,
        message: "El usuario seleccionado no está habilitado como broker originador en esta organización.",
      };
    }
    return {
      allowed: true,
      brokerId: requestedBrokerId,
    };
  }

  return {
    allowed: true,
    brokerId: requestedBrokerId,
  };
}

/**
 * Backward compatibility wrapper for Bloque 3 checks
 */
export async function checkTransactionalCreationAllowed(
  userId: string,
  targetStorage: IStorage = storage
): Promise<{ allowed: boolean; message?: string }> {
  const user = await targetStorage.getUser(userId);
  if (!user) {
    return { allowed: false, message: "Usuario no encontrado" };
  }
  const memberships = await targetStorage.getTenantMembersByUser(userId);
  const activeMembership = memberships.find((m) => m.isActive);
  return validateCommercialOrigination(
    {
      callerUser: user,
      callerMembership: activeMembership,
      tenantId: activeMembership?.tenantId,
    },
    targetStorage
  );
}
