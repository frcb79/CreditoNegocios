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

export async function checkTransactionalCreationAllowed(
  userId: string,
  targetStorage: IStorage = storage
): Promise<{ allowed: boolean; message?: string }> {
  const user = await targetStorage.getUser(userId);
  if (!user) {
    return { allowed: false, message: "Usuario no encontrado" };
  }
  // Super admin and platform admin are never restricted
  if (user.role === "super_admin" || user.role === "admin") {
    return { allowed: true };
  }

  // Check memberships in organizations
  const memberships = await targetStorage.getTenantMembersByUser(userId);
  if (!memberships || memberships.length === 0) {
    // Legacy standalone user without organization membership yet
    return { allowed: true };
  }

  // Titular owners of any organization are the commercial brokers
  const isTitularOwner = memberships.some((m) => m.isActive && m.role === "owner");
  if (isTitularOwner) {
    return { allowed: true };
  }

  // Internal non-owner collaborator (member or admin)
  return {
    allowed: false,
    message:
      "Operación restringida: Los colaboradores internos de la organización tienen perfil operativo/análisis. La originación de clientes y créditos está reservada al titular comercial de la organización hasta la activación del ownership organizacional (Bloque 4).",
  };
}
