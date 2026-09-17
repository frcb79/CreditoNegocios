import { storage } from "../../server/storage";
import {
  tenantContextMiddleware,
  requireTenantMembership,
  requireTenantRole,
} from "../../server/middleware/tenantContext";

describe("Tenant and Membership Base Layer (Bloque 1)", () => {
  let testTenant: any;
  let inactiveTenant: any;
  let ownerUser: any;
  let adminUser: any;
  let memberUser: any;
  let inactiveUser: any;
  let superAdminUser: any;
  let ownerMember: any;
  let adminMember: any;
  let normalMember: any;
  let inactiveMember: any;
  let activeInInactiveMember: any;

  beforeAll(async () => {
    testTenant = await storage.createTenant({
      name: "Acme Financial",
      slug: "acme-financial",
      type: "broker",
      isActive: true,
      settings: {},
    });

    inactiveTenant = await storage.createTenant({
      name: "Acme Inactive",
      slug: "acme-inactive",
      type: "broker",
      isActive: false,
      settings: {},
    });

    ownerUser = await storage.createUser({
      email: "owner@acme.test",
      role: "broker",
      firstName: "Owner",
      lastName: "Test",
    });

    adminUser = await storage.createUser({
      email: "admin@acme.test",
      role: "broker",
      firstName: "Admin",
      lastName: "Test",
    });

    memberUser = await storage.createUser({
      email: "member@acme.test",
      role: "broker",
      firstName: "Member",
      lastName: "Test",
    });

    inactiveUser = await storage.createUser({
      email: "inactive@acme.test",
      role: "broker",
      firstName: "Inactive",
      lastName: "Test",
    });

    superAdminUser = await storage.createUser({
      email: "superadmin@acme.test",
      role: "super_admin",
      firstName: "Super",
      lastName: "Admin",
    });

    ownerMember = await storage.createTenantMember({
      tenantId: testTenant.id,
      userId: ownerUser.id,
      role: "owner",
      isActive: true,
    });

    adminMember = await storage.createTenantMember({
      tenantId: testTenant.id,
      userId: adminUser.id,
      role: "admin",
      isActive: true,
    });

    normalMember = await storage.createTenantMember({
      tenantId: testTenant.id,
      userId: memberUser.id,
      role: "member",
      isActive: true,
    });

    inactiveMember = await storage.createTenantMember({
      tenantId: testTenant.id,
      userId: inactiveUser.id,
      role: "member",
      isActive: false,
    });

    activeInInactiveMember = await storage.createTenantMember({
      tenantId: inactiveTenant.id,
      userId: memberUser.id,
      role: "member",
      isActive: true,
    });
  });

  describe("Storage Validations & Constraints", () => {
    it("should prevent duplicate memberships for the same (tenantId, userId)", async () => {
      await expect(
        storage.createTenantMember({
          tenantId: testTenant.id,
          userId: ownerUser.id,
          role: "member",
          isActive: true,
        })
      ).rejects.toThrow();
    });

    it("should reject membership creation if tenant does not exist", async () => {
      await expect(
        storage.createTenantMember({
          tenantId: "non-existent-tenant",
          userId: ownerUser.id,
          role: "member",
          isActive: true,
        })
      ).rejects.toThrow(/does not exist|not found/i);
    });

    it("should reject membership creation if user does not exist", async () => {
      await expect(
        storage.createTenantMember({
          tenantId: testTenant.id,
          userId: "non-existent-user",
          role: "member",
          isActive: true,
        })
      ).rejects.toThrow(/does not exist|not found/i);
    });

    it("should update role and activate/deactivate membership", async () => {
      const updated = await storage.updateTenantMember(normalMember.id, {
        isActive: false,
      });
      expect(updated?.isActive).toBe(false);

      const reactivated = await storage.updateTenantMember(normalMember.id, {
        isActive: true,
      });
      expect(reactivated?.isActive).toBe(true);
    });
  });

  describe("Middleware Authorization Scenarios", () => {
    it("Scenario 1: Active member can access tenant", async () => {
      const req = {
        tenantContext: {
          tenant: testTenant,
          membership: normalMember,
          isPlatformAdmin: false,
        },
      } as any;
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;
      const next = jest.fn();

      await requireTenantMembership(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it("Scenario 2: Non-member gets 403", async () => {
      const req = {
        tenantContext: {
          tenant: testTenant,
          membership: null,
          isPlatformAdmin: false,
        },
      } as any;
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;
      const next = jest.fn();

      await requireTenantMembership(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("Scenario 3: Inactive member gets 403", async () => {
      const req = {
        tenantContext: {
          tenant: testTenant,
          membership: inactiveMember,
          isPlatformAdmin: false,
        },
      } as any;
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;
      const next = jest.fn();

      await requireTenantMembership(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("Scenario 4: Owner and Admin can execute restricted operations", async () => {
      const middleware = requireTenantRole(["owner", "admin"]);

      const reqOwner = {
        tenantContext: { tenant: testTenant, membership: ownerMember, isPlatformAdmin: false },
      } as any;
      const resOwner = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;
      const nextOwner = jest.fn();
      await middleware(reqOwner, resOwner, nextOwner);
      expect(nextOwner).toHaveBeenCalled();

      const reqAdmin = {
        tenantContext: { tenant: testTenant, membership: adminMember, isPlatformAdmin: false },
      } as any;
      const resAdmin = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;
      const nextAdmin = jest.fn();
      await middleware(reqAdmin, resAdmin, nextAdmin);
      expect(nextAdmin).toHaveBeenCalled();
    });

    it("Scenario 5: Member cannot execute owner/admin operations (403)", async () => {
      const middleware = requireTenantRole(["owner", "admin"]);
      const req = {
        tenantContext: {
          tenant: testTenant,
          membership: normalMember,
          isPlatformAdmin: false,
        },
      } as any;
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;
      const next = jest.fn();

      await middleware(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("Scenario 6: Super Admin has global bypass without tenant membership", async () => {
      const req = {
        user: { id: superAdminUser.id, role: "super_admin" },
        tenantContext: {
          tenant: testTenant,
          membership: null,
          isPlatformAdmin: true,
        },
      } as any;
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;
      const next = jest.fn();

      await requireTenantMembership(req, res, next);
      expect(next).toHaveBeenCalled();

      const nextRole = jest.fn();
      const roleMiddleware = requireTenantRole(["owner"]);
      await roleMiddleware(req, res, nextRole);
      expect(nextRole).toHaveBeenCalled();
    });

    describe("Bloque 1.1 Explicit Activation Combinations", () => {
      it("1. Tenant activo + miembro activo -> acceso", async () => {
        const req = {
          tenantContext: {
            tenant: testTenant, // isActive: true
            membership: normalMember, // isActive: true
            isPlatformAdmin: false,
          },
        } as any;
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;
        const next = jest.fn();

        await requireTenantMembership(req, res, next);
        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
      });

      it("2. Tenant inactivo + miembro activo -> 403", async () => {
        const req = {
          tenantContext: {
            tenant: inactiveTenant, // isActive: false
            membership: activeInInactiveMember, // isActive: true
            isPlatformAdmin: false,
          },
        } as any;
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;
        const next = jest.fn();

        await requireTenantMembership(req, res, next);
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
      });

      it("3. Tenant inactivo + super_admin -> permitido", async () => {
        const req = {
          user: { id: superAdminUser.id, role: "super_admin" },
          tenantContext: {
            tenant: inactiveTenant, // isActive: false
            membership: null,
            isPlatformAdmin: true,
          },
        } as any;
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;
        const next = jest.fn();

        await requireTenantMembership(req, res, next);
        expect(next).toHaveBeenCalled();

        const nextRole = jest.fn();
        const roleMiddleware = requireTenantRole(["owner"]);
        await roleMiddleware(req, res, nextRole);
        expect(nextRole).toHaveBeenCalled();
      });

      it("4. Tenant activo + miembro inactivo -> 403", async () => {
        const req = {
          tenantContext: {
            tenant: testTenant, // isActive: true
            membership: inactiveMember, // isActive: false
            isPlatformAdmin: false,
          },
        } as any;
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;
        const next = jest.fn();

        await requireTenantMembership(req, res, next);
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
      });
    });
  });
});
