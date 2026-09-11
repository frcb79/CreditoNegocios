import type { Request, Response, NextFunction, RequestHandler } from "express";
import { storage } from "../storage";

export interface EffectivePermissions {
  modules: string[];
  actions: string[];
  scope: "global" | "network" | "own";
}

// Default permissions applied when a user has no custom permissions configured
const DEFAULT_ROLE_PERMISSIONS: Record<string, EffectivePermissions> = {
  super_admin: {
    modules: [
      "dashboard", "clientes", "creditos", "aprobaciones", "comisiones",
      "financieras", "sistema_productos", "red_brokers", "documentos",
      "reportes", "importacion", "usuarios", "configuracion"
    ],
    actions: [
      "view", "edit", "submit_proposals", "approve_disperse",
      "manage_commissions", "manage_users", "export_reports"
    ],
    scope: "global",
  },
  admin: {
    modules: [
      "dashboard", "clientes", "creditos", "aprobaciones", "comisiones",
      "financieras", "sistema_productos", "red_brokers", "documentos",
      "reportes", "importacion", "usuarios", "configuracion"
    ],
    actions: [
      "view", "edit", "submit_proposals", "approve_disperse",
      "manage_commissions", "manage_users", "export_reports"
    ],
    scope: "global",
  },
  master_broker: {
    modules: [
      "dashboard", "clientes", "creditos", "comisiones",
      "red_brokers", "documentos", "reportes", "usuarios", "configuracion"
    ],
    actions: [
      "view", "edit", "submit_proposals", "manage_commissions",
      "manage_users", "export_reports"
    ],
    scope: "network",
  },
  broker: {
    modules: [
      "dashboard", "clientes", "creditos", "documentos",
      "sistema_productos", "configuracion"
    ],
    actions: ["view", "edit", "submit_proposals"],
    scope: "own",
  },
};

/**
 * Resolves the effective permissions for a user.
 * If user has custom permissions saved in DB with non-empty modules/actions, those take precedence.
 * Otherwise, falls back to the default role permissions.
 */
export function getEffectivePermissions(user: any): EffectivePermissions {
  if (!user) {
    return { modules: [], actions: [], scope: "own" };
  }

  // Super admin always has all permissions
  if (user.role === "super_admin") {
    return DEFAULT_ROLE_PERMISSIONS.super_admin;
  }

  const roleDefaults = DEFAULT_ROLE_PERMISSIONS[user.role] || DEFAULT_ROLE_PERMISSIONS.broker;
  const userPerms = (user.permissions as any) || {};

  const hasCustomModules = Array.isArray(userPerms.modules) && userPerms.modules.length > 0;
  const hasCustomActions = Array.isArray(userPerms.actions) && userPerms.actions.length > 0;

  return {
    modules: hasCustomModules ? userPerms.modules : roleDefaults.modules,
    actions: hasCustomActions ? userPerms.actions : roleDefaults.actions,
    scope: userPerms.scope || roleDefaults.scope,
  };
}

/**
 * Resolves or fetches the current user from req.
 */
async function resolveReqUser(req: any): Promise<any> {
  if (req.dbUser) {
    return req.dbUser;
  }
  const userId = req.user?.claims?.sub;
  if (!userId) return null;
  const dbUser = await storage.getUser(userId);
  if (dbUser) {
    req.dbUser = dbUser;
  }
  return dbUser;
}

/**
 * Middleware: Requires the user to have access to a specific platform module.
 * Super admin always bypasses.
 */
export function requireModule(moduleId: string): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await resolveReqUser(req);
      if (!user) {
        return res.status(401).json({ message: "No autenticado" });
      }

      if (user.role === "super_admin") {
        return next();
      }

      const effective = getEffectivePermissions(user);
      if (!effective.modules.includes(moduleId)) {
        return res.status(403).json({
          message: `Acceso denegado. No tienes permiso para acceder al módulo '${moduleId}'.`,
          requiredModule: moduleId,
        });
      }

      next();
    } catch (error) {
      console.error(`[RBAC] Error checking module ${moduleId}:`, error);
      res.status(500).json({ message: "Error al verificar permisos de acceso" });
    }
  };
}

/**
 * Middleware: Requires the user to have a specific granular action permission.
 * Super admin always bypasses.
 */
export function requireAction(actionId: string): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await resolveReqUser(req);
      if (!user) {
        return res.status(401).json({ message: "No autenticado" });
      }

      if (user.role === "super_admin") {
        return next();
      }

      const effective = getEffectivePermissions(user);
      if (!effective.actions.includes(actionId)) {
        return res.status(403).json({
          message: `Acceso denegado. No tienes permiso para la acción '${actionId}'.`,
          requiredAction: actionId,
        });
      }

      next();
    } catch (error) {
      console.error(`[RBAC] Error checking action ${actionId}:`, error);
      res.status(500).json({ message: "Error al verificar permisos de acción" });
    }
  };
}

/**
 * Middleware: Requires BOTH a specific module and a specific action.
 * Super admin always bypasses.
 */
export function requireModuleAndAction(moduleId: string, actionId: string): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await resolveReqUser(req);
      if (!user) {
        return res.status(401).json({ message: "No autenticado" });
      }

      if (user.role === "super_admin") {
        return next();
      }

      const effective = getEffectivePermissions(user);
      const hasModule = effective.modules.includes(moduleId);
      const hasAction = effective.actions.includes(actionId);

      if (!hasModule || !hasAction) {
        return res.status(403).json({
          message: `Acceso denegado. Se requiere el módulo '${moduleId}' y la acción '${actionId}'.`,
          requiredModule: moduleId,
          requiredAction: actionId,
        });
      }

      next();
    } catch (error) {
      console.error(`[RBAC] Error checking module ${moduleId} and action ${actionId}:`, error);
      res.status(500).json({ message: "Error al verificar permisos de acceso" });
    }
  };
}

/**
 * Middleware: Requires the user to have at least one of the specified roles.
 * Super admin always bypasses.
 */
export function requireRole(...allowedRoles: string[]): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await resolveReqUser(req);
      if (!user) {
        return res.status(401).json({ message: "No autenticado" });
      }

      if (user.role === "super_admin" || allowedRoles.includes(user.role)) {
        return next();
      }

      return res.status(403).json({
        message: `Acceso denegado. Se requiere uno de los siguientes roles: ${allowedRoles.join(", ")}.`,
      });
    } catch (error) {
      console.error(`[RBAC] Error checking roles:`, error);
      res.status(500).json({ message: "Error al verificar roles" });
    }
  };
}

/**
 * Middleware: Requires the user to have access to ANY of the specified modules.
 * Super admin always bypasses.
 */
export function requireAnyModule(...moduleIds: string[]): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await resolveReqUser(req);
      if (!user) {
        return res.status(401).json({ message: "No autenticado" });
      }

      if (user.role === "super_admin") {
        return next();
      }

      const effective = getEffectivePermissions(user);
      const hasAny = moduleIds.some((mod) => effective.modules.includes(mod));

      if (!hasAny) {
        return res.status(403).json({
          message: `Acceso denegado. Se requiere acceso a al menos uno de los siguientes módulos: ${moduleIds.join(", ")}.`,
          requiredModules: moduleIds,
        });
      }

      next();
    } catch (error) {
      console.error(`[RBAC] Error checking any module ${moduleIds.join(", ")}:`, error);
      res.status(500).json({ message: "Error al verificar permisos de acceso" });
    }
  };
}

/**
 * Middleware: Requires the user to have ANY of the specified actions.
 * Super admin always bypasses.
 */
export function requireAnyAction(...actionIds: string[]): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await resolveReqUser(req);
      if (!user) {
        return res.status(401).json({ message: "No autenticado" });
      }

      if (user.role === "super_admin") {
        return next();
      }

      const effective = getEffectivePermissions(user);
      const hasAny = actionIds.some((act) => effective.actions.includes(act));

      if (!hasAny) {
        return res.status(403).json({
          message: `Acceso denegado. Se requiere al menos una de las siguientes acciones: ${actionIds.join(", ")}.`,
          requiredActions: actionIds,
        });
      }

      next();
    } catch (error) {
      console.error(`[RBAC] Error checking any action ${actionIds.join(", ")}:`, error);
      res.status(500).json({ message: "Error al verificar permisos de acción" });
    }
  };
}

