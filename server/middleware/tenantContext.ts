import { RequestHandler } from "express";
import { storage } from "../storage";

export interface TenantContext {
  tenant: {
    id: string;
    type: string;
    name: string;
    slug: string;
    parentTenantId: string | null;
    settings: unknown;
    isActive: boolean;
  } | null;
  membership: {
    id: string;
    role: "owner" | "admin" | "member";
    isActive: boolean;
  } | null;
  isPlatformAdmin: boolean;
}

declare global {
  namespace Express {
    interface Request {
      tenantContext: TenantContext;
    }
  }
}

/**
 * Middleware to resolve tenant context for multi-tenant requests
 * Supports tenant resolution via:
 * 1. X-Tenant-Slug header
 * 2. slug query parameter 
 * 3. Path parameters (tenantSlug, slug, tenant, organizationSlug)
 * 4. URL path pattern extraction (e.g., /api/tenants/slug/:slug)
 */
export const tenantContextMiddleware: RequestHandler = async (req: any, res, next) => {
  try {
    const userId = req.user?.claims?.sub;
    
    // Initialize context with defaults
    req.tenantContext = {
      tenant: null,
      membership: null,
      isPlatformAdmin: false
    };

    // If no authenticated user, continue with empty context
    if (!userId) {
      return next();
    }

    // Check if user is platform admin
    const user = await storage.getUser(userId);
    req.tenantContext.isPlatformAdmin = user?.role === "super_admin" || user?.role === "admin";

    // Try to resolve tenant from various sources
    let tenantSlug: string | undefined;
    
    // 1. Check X-Tenant-Slug header
    tenantSlug = req.headers['x-tenant-slug'] as string;
    
    // 2. Check slug query parameter
    if (!tenantSlug && req.query.slug) {
      tenantSlug = req.query.slug as string;
    }
    
    // 3. Check various path parameter patterns
    if (!tenantSlug) {
      // Try common tenant slug parameter names
      const possibleParams = ['tenantSlug', 'slug', 'tenant', 'organizationSlug'];
      for (const param of possibleParams) {
        if (req.params[param]) {
          tenantSlug = req.params[param];
          break;
        }
      }
    }
    
    // 4. Extract slug from URL path patterns (e.g., /api/tenants/slug/:slug)
    if (!tenantSlug && req.path) {
      const slugMatch = req.path.match(/\/api\/tenants\/slug\/([^\/]+)/);
      if (slugMatch) {
        tenantSlug = slugMatch[1];
      }
    }

    // If no tenant slug provided, use platform tenant for platform admins
    if (!tenantSlug && req.tenantContext.isPlatformAdmin) {
      tenantSlug = "platform";
    }

    // Resolve tenant if slug is available
    if (tenantSlug) {
      const tenant = await storage.getTenantBySlug(tenantSlug);
      
      if (tenant) {
        req.tenantContext.tenant = tenant;
        
        // Get user's membership in this tenant
        const membership = await storage.getUserTenantMembership(userId, tenant.id);
        if (membership) {
          req.tenantContext.membership = membership;
        }
      }
    }

    next();
  } catch (error) {
    console.error("Error in tenant context middleware:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * Middleware to require tenant context
 * Use after tenantContextMiddleware when tenant is mandatory
 */
export const requireTenantContext: RequestHandler = (req: any, res, next) => {
  if (!req.tenantContext?.tenant) {
    return res.status(400).json({ 
      message: "Tenant context required. Provide X-Tenant-Slug header or slug parameter." 
    });
  }
  next();
};

/**
 * Middleware to require tenant membership
 * Use after tenantContextMiddleware when user must be a member of the tenant
 */
export const requireTenantMembership: RequestHandler = (req: any, res, next) => {
  const { tenant, membership, isPlatformAdmin } = req.tenantContext;
  
  if (!tenant) {
    return res.status(400).json({ 
      message: "Tenant context required" 
    });
  }
  
  // Platform admins can access any tenant
  if (isPlatformAdmin) {
    return next();
  }
  
  // Regular users need active membership
  if (!membership || !membership.isActive) {
    return res.status(403).json({ 
      message: "Access denied. You are not a member of this tenant." 
    });
  }
  
  next();
};

/**
 * Middleware to require specific tenant roles
 * @param allowedRoles - Array of roles that can access this resource
 */
export const requireTenantRole = (allowedRoles: ("owner" | "admin" | "member")[]): RequestHandler => {
  return (req: any, res, next) => {
    const { membership, isPlatformAdmin } = req.tenantContext;
    
    // Platform admins can access any resource
    if (isPlatformAdmin) {
      return next();
    }
    
    // Check if user has required role
    if (!membership || !allowedRoles.includes(membership.role)) {
      return res.status(403).json({ 
        message: `Access denied. Required roles: ${allowedRoles.join(", ")}` 
      });
    }
    
    next();
  };
};

/**
 * Middleware to resolve tenant context from tenant ID parameter
 * Use for routes like /api/tenants/:id where the tenant ID is in the URL
 * @param paramName - The name of the parameter containing the tenant ID (defaults to 'id')
 */
export const resolveTenantFromParam = (paramName: string = 'id'): RequestHandler => {
  return async (req: any, res, next) => {
    try {
      const tenantId = req.params[paramName];
      const userId = req.user?.claims?.sub;
      
      if (!tenantId) {
        return res.status(400).json({ message: `Missing ${paramName} parameter` });
      }
      
      // Get tenant by ID
      const tenant = await storage.getTenant(tenantId);
      if (!tenant) {
        return res.status(404).json({ message: "Tenant not found" });
      }
      
      // Set tenant context
      req.tenantContext.tenant = tenant;
      
      // Get user's membership if authenticated
      if (userId) {
        const membership = await storage.getUserTenantMembership(userId, tenant.id);
        if (membership) {
          req.tenantContext.membership = membership;
        }
      }
      
      next();
    } catch (error) {
      console.error("Error resolving tenant from parameter:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  };
};

/**
 * Middleware to resolve tenant context from query parameter
 * Use for routes that receive tenant ID in query params
 * @param queryParam - The name of the query parameter containing the tenant ID
 */
export const resolveTenantFromQuery = (queryParam: string = 'tenantId'): RequestHandler => {
  return async (req: any, res, next) => {
    try {
      const tenantId = req.query[queryParam];
      const userId = req.user?.claims?.sub;
      
      if (!tenantId) {
        return res.status(400).json({ message: `Missing ${queryParam} query parameter` });
      }
      
      // Get tenant by ID
      const tenant = await storage.getTenant(tenantId as string);
      if (!tenant) {
        return res.status(404).json({ message: "Tenant not found" });
      }
      
      // Set tenant context
      req.tenantContext.tenant = tenant;
      
      // Get user's membership if authenticated
      if (userId) {
        const membership = await storage.getUserTenantMembership(userId, tenant.id);
        if (membership) {
          req.tenantContext.membership = membership;
        }
      }
      
      next();
    } catch (error) {
      console.error("Error resolving tenant from query:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  };
};