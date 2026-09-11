import {
  getEffectivePermissions,
  requireModule,
  requireAction,
  requireModuleAndAction,
  requireAnyModule,
  requireRole
} from "../../server/middleware/rbacMiddleware";

describe("RBAC Permissions and Middleware Tests", () => {
  describe("getEffectivePermissions", () => {
    it("should grant all modules and actions to super_admin", () => {
      const user = { role: "super_admin", permissions: {} };
      const perms = getEffectivePermissions(user);
      expect(perms.modules).toContain("dashboard");
      expect(perms.modules).toContain("usuarios");
      expect(perms.modules).toContain("aprobaciones");
      expect(perms.actions).toContain("manage_users");
      expect(perms.actions).toContain("approve_disperse");
      expect(perms.scope).toBe("global");
    });

    it("should grant default broker modules to a standard broker without custom permissions", () => {
      const user = { role: "broker", permissions: {} };
      const perms = getEffectivePermissions(user);
      expect(perms.modules).toContain("clientes");
      expect(perms.modules).toContain("creditos");
      expect(perms.modules).not.toContain("usuarios");
      expect(perms.modules).not.toContain("aprobaciones");
      expect(perms.actions).toContain("view");
      expect(perms.actions).toContain("edit");
      expect(perms.actions).not.toContain("manage_users");
    });

    it("should prioritize custom permissions when assigned to a user", () => {
      const user = {
        role: "broker",
        customRoleTitle: "Mesa de Control",
        permissions: {
          modules: ["dashboard", "clientes", "creditos", "aprobaciones"],
          actions: ["view", "edit", "submit_proposals"],
          scope: "global",
        },
      };
      const perms = getEffectivePermissions(user);
      expect(perms.modules).toEqual(["dashboard", "clientes", "creditos", "aprobaciones"]);
      expect(perms.modules).toContain("aprobaciones");
      expect(perms.actions).toContain("submit_proposals");
      expect(perms.actions).not.toContain("manage_users");
    });
  });

  describe("requireModule middleware", () => {
    it("should allow super_admin through regardless of permissions", async () => {
      const req = { dbUser: { role: "super_admin" } } as any;
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;
      const next = jest.fn();

      const middleware = requireModule("usuarios");
      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it("should block a broker from admin-only modules", async () => {
      const req = { dbUser: { role: "broker", permissions: {} } } as any;
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;
      const next = jest.fn();

      const middleware = requireModule("usuarios");
      await middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          requiredModule: "usuarios",
        })
      );
    });

    it("should allow a broker with custom permissions for creditos", async () => {
      const req = {
        dbUser: {
          role: "broker",
          permissions: { modules: ["creditos", "clientes"], actions: ["view"] },
        },
      } as any;
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;
      const next = jest.fn();

      const middleware = requireModule("creditos");
      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe("requireAction middleware", () => {
    it("should block user if action is not permitted", async () => {
      const req = {
        dbUser: {
          role: "broker",
          permissions: { modules: ["clientes"], actions: ["view"] },
        },
      } as any;
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;
      const next = jest.fn();

      const middleware = requireAction("manage_users");
      await middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe("requireModuleAndAction middleware", () => {
    it("should allow user when they have both module and action", async () => {
      const req = {
        dbUser: {
          role: "master_broker",
          permissions: {},
        },
      } as any;
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;
      const next = jest.fn();

      const middleware = requireModuleAndAction("usuarios", "manage_users");
      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it("should block user who has the module but lacks the action", async () => {
      const req = {
        dbUser: {
          role: "broker",
          permissions: { modules: ["clientes"], actions: ["view"] },
        },
      } as any;
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;
      const next = jest.fn();

      const middleware = requireModuleAndAction("clientes", "edit");
      await middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe("requireRole middleware", () => {
    it("should allow specified roles", async () => {
      const req = { dbUser: { role: "admin" } } as any;
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;
      const next = jest.fn();

      const middleware = requireRole("admin", "super_admin");
      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it("should block non-matching roles", async () => {
      const req = { dbUser: { role: "broker" } } as any;
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;
      const next = jest.fn();

      const middleware = requireRole("admin", "super_admin");
      await middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });
});
