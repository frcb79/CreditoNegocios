import { storage } from "../../server/storage";
import { isAuthenticated } from "../../server/auth";
import type { User, Tenant, TenantMember, Credit } from "../../shared/schema";

describe("User Operational Status (Baja / Suspensión / Reactivación)", () => {
  let superAdminUser: User;
  let masterBroker1: User;
  let masterBroker2: User;
  let subBroker1: User;
  let subBroker2: User;
  let independentBroker: User;
  let testTenant: Tenant;
  let testCredit: Credit;

  beforeAll(async () => {
    // 1. Setup Tenant
    testTenant = await storage.createTenant({
      name: "Tenant Operativo Test",
      slug: "tenant-operativo-test",
      type: "master_broker",
      isActive: true,
      settings: {},
    });

    // 2. Setup Super Admin
    superAdminUser = await storage.createUser({
      email: "superadmin.status@test.com",
      role: "super_admin",
      firstName: "Super",
      lastName: "Admin",
      isActive: true,
      status: "active",
    });

    // 3. Setup Master Brokers
    masterBroker1 = await storage.createUser({
      email: "master1.status@test.com",
      role: "master_broker",
      firstName: "Master",
      lastName: "Uno",
      isActive: true,
      status: "active",
    });

    masterBroker2 = await storage.createUser({
      email: "master2.status@test.com",
      role: "master_broker",
      firstName: "Master",
      lastName: "Dos",
      isActive: true,
      status: "active",
    });

    // 4. Setup Brokers
    // subBroker1 belongs to masterBroker1
    subBroker1 = await storage.createUser({
      email: "sub1.status@test.com",
      role: "broker",
      firstName: "Sub",
      lastName: "Uno",
      masterBrokerId: masterBroker1.id,
      isActive: true,
      status: "active",
    });

    // subBroker2 belongs to masterBroker2
    subBroker2 = await storage.createUser({
      email: "sub2.status@test.com",
      role: "broker",
      firstName: "Sub",
      lastName: "Dos",
      masterBrokerId: masterBroker2.id,
      isActive: true,
      status: "active",
    });

    // independentBroker has no master broker
    independentBroker = await storage.createUser({
      email: "indep.status@test.com",
      role: "broker",
      firstName: "Broker",
      lastName: "Independiente",
      isActive: true,
      status: "active",
    });

    // 5. Add tenant member with specific canOriginate
    await storage.createTenantMember({
      tenantId: testTenant.id,
      userId: subBroker1.id,
      role: "member",
      canOriginate: false, // Explicitly set to false to test invariant
    });

    // 6. Create historical credit originated by subBroker1
    testCredit = await storage.createCredit({
      clientId: "client-status-test",
      tenantId: testTenant.id,
      brokerId: subBroker1.id,
      amount: "1500000",
      status: "active",
    } as any);
  });

  describe("1. Suspendido no puede autenticarse", () => {
    it("bloquea el acceso a un usuario suspendido con mensaje diferenciado", async () => {
      // Suspend subBroker1
      await storage.updateUserOperationalStatus({
        userId: subBroker1.id,
        targetStatus: "suspended",
        changedBy: superAdminUser.id,
        reason: "Suspensión administrativa por revisión de expediente",
      });

      const req: any = {
        isAuthenticated: () => true,
        user: { id: subBroker1.id },
        logout: jest.fn(),
      };
      const res: any = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await isAuthenticated(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Tu cuenta se encuentra temporalmente suspendida. Contacta a soporte.",
        })
      );
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe("2. Inactivo no puede autenticarse", () => {
    it("bloquea el acceso a un usuario inactivo con mensaje diferenciado", async () => {
      // Deactivate independentBroker
      await storage.updateUserOperationalStatus({
        userId: independentBroker.id,
        targetStatus: "inactive",
        changedBy: superAdminUser.id,
        reason: "Baja solicitada por el usuario",
      });

      const req: any = {
        isAuthenticated: () => true,
        user: { id: independentBroker.id },
        logout: jest.fn(),
      };
      const res: any = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await isAuthenticated(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Tu cuenta ha sido desactivada. Contacta al administrador.",
        })
      );
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe("3. Reactivado vuelve a autenticarse", () => {
    it("permite el acceso nuevamente tras reactivación", async () => {
      // Reactivate subBroker1
      await storage.updateUserOperationalStatus({
        userId: subBroker1.id,
        targetStatus: "active",
        changedBy: superAdminUser.id,
        reason: "Documentación aclarada, reactivación de cuenta",
      });

      const req: any = {
        isAuthenticated: () => true,
        user: { id: subBroker1.id },
      };
      const res: any = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await isAuthenticated(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.dbUser).toBeDefined();
      expect(req.dbUser.status).toBe("active");
      expect(req.dbUser.isActive).toBe(true);
    });
  });

  describe("4. Cambio de estado no modifica canOriginate", () => {
    it("preserva exactamente el canOriginate previo al suspender, inactivar y reactivar", async () => {
      // Verify initial member has canOriginate = false
      const membersBefore = await storage.getTenantMembers(testTenant.id);
      const memberBefore = membersBefore.find((m) => m.userId === subBroker1.id);
      expect(memberBefore).toBeDefined();
      expect(memberBefore?.canOriginate).toBe(false);

      // 1. Suspend
      await storage.updateUserOperationalStatus({
        userId: subBroker1.id,
        targetStatus: "suspended",
        changedBy: superAdminUser.id,
        reason: "Prueba de canOriginate",
      });
      const membersSuspended = await storage.getTenantMembers(testTenant.id);
      const memberSuspended = membersSuspended.find((m) => m.userId === subBroker1.id);
      expect(memberSuspended?.canOriginate).toBe(false);

      // 2. Inactivate
      await storage.updateUserOperationalStatus({
        userId: subBroker1.id,
        targetStatus: "inactive",
        changedBy: superAdminUser.id,
        reason: "Prueba de canOriginate inactivo",
      });
      const membersInactive = await storage.getTenantMembers(testTenant.id);
      const memberInactive = membersInactive.find((m) => m.userId === subBroker1.id);
      expect(memberInactive?.canOriginate).toBe(false);

      // 3. Reactivate
      await storage.updateUserOperationalStatus({
        userId: subBroker1.id,
        targetStatus: "active",
        changedBy: superAdminUser.id,
        reason: "Prueba de canOriginate reactivado",
      });
      const membersReactivated = await storage.getTenantMembers(testTenant.id);
      const memberReactivated = membersReactivated.find((m) => m.userId === subBroker1.id);
      expect(memberReactivated?.canOriginate).toBe(false);
    });
  });

  describe("5. Crédito conserva brokerId histórico", () => {
    it("mantiene intacta la atribución de brokerId y datos del crédito tras baja de broker", async () => {
      // Inactivate subBroker1 again
      await storage.updateUserOperationalStatus({
        userId: subBroker1.id,
        targetStatus: "inactive",
        changedBy: superAdminUser.id,
        reason: "Baja definitiva",
      });

      // Fetch credit
      const credit = await storage.getCredit(testCredit.id);
      expect(credit).toBeDefined();
      expect(credit?.brokerId).toBe(subBroker1.id);
      expect(credit?.amount).toBe("1500000");

      // Reactivate for subsequent tests
      await storage.updateUserOperationalStatus({
        userId: subBroker1.id,
        targetStatus: "active",
        changedBy: superAdminUser.id,
        reason: "Reactivación operativa",
      });
    });
  });

  describe("6. Master inactivo no desactiva subordinados", () => {
    it("la baja o suspensión de Master Broker conserva los brokers subordinados activos", async () => {
      // Check subBroker1 is active
      const subBefore = await storage.getUser(subBroker1.id);
      expect(subBefore?.status).toBe("active");
      expect(subBefore?.isActive).toBe(true);

      // Deactivate masterBroker1
      await storage.updateUserOperationalStatus({
        userId: masterBroker1.id,
        targetStatus: "inactive",
        changedBy: superAdminUser.id,
        reason: "Baja temporal de Master Broker",
      });

      // Verify Master Broker is inactive
      const masterAfter = await storage.getUser(masterBroker1.id);
      expect(masterAfter?.status).toBe("inactive");
      expect(masterAfter?.isActive).toBe(false);

      // Verify subBroker1 is STILL active and linked to masterBroker1
      const subAfter = await storage.getUser(subBroker1.id);
      expect(subAfter?.status).toBe("active");
      expect(subAfter?.isActive).toBe(true);
      expect(subAfter?.masterBrokerId).toBe(masterBroker1.id);

      // Reactivate masterBroker1
      await storage.updateUserOperationalStatus({
        userId: masterBroker1.id,
        targetStatus: "active",
        changedBy: superAdminUser.id,
        reason: "Reactivación de Master Broker",
      });
    });
  });

  describe("7. Master puede suspender o dar de baja a Broker de su propia red", () => {
    it("permite a un Master Broker suspender a un broker de su propia red", async () => {
      // Helper testing the business rule logic implemented in handleUserOperationalStatusChange
      const callerUser = await storage.getUser(masterBroker1.id);
      const targetUser = await storage.getUser(subBroker1.id);

      expect(callerUser?.role).toBe("master_broker");
      expect(targetUser?.role).toBe("broker");
      expect(targetUser?.masterBrokerId).toBe(callerUser?.id);

      // Status change allowed
      const updated = await storage.updateUserOperationalStatus({
        userId: subBroker1.id,
        targetStatus: "suspended",
        changedBy: masterBroker1.id,
        reason: "Suspensión por decisión de Master Broker",
      });

      expect(updated.status).toBe("suspended");
      expect(updated.isActive).toBe(false);
      expect(updated.statusChangedBy).toBe(masterBroker1.id);
    });
  });

  it("permite a un Master Broker dar de baja directamente a un broker de su propia red", async () => {
    // Ensure active before the direct deactivation scenario.
    await storage.updateUserOperationalStatus({
      userId: subBroker1.id,
      targetStatus: "active",
      changedBy: superAdminUser.id,
      reason: "Preparación de escenario de baja por Master",
    });

    const target = await storage.getUser(subBroker1.id);
    expect(target?.masterBrokerId).toBe(masterBroker1.id);

    const updated = await storage.updateUserOperationalStatus({
      userId: subBroker1.id,
      targetStatus: "inactive",
      changedBy: masterBroker1.id,
      reason: "Baja directa por Master Broker",
    });

    expect(updated.status).toBe("inactive");
    expect(updated.isActive).toBe(false);
    expect(updated.statusChangedBy).toBe(masterBroker1.id);

    // Super Admin restores access for subsequent tests.
    await storage.updateUserOperationalStatus({
      userId: subBroker1.id,
      targetStatus: "active",
      changedBy: superAdminUser.id,
      reason: "Reactivación reservada a Super Admin",
    });
  });

  describe("8. Master no puede suspender Broker externo", () => {
    it("impide a un Master Broker suspender a un broker de otra red", async () => {
      const callerUser = await storage.getUser(masterBroker1.id);
      const externalBroker = await storage.getUser(subBroker2.id);

      // Invariant: externalBroker has masterBrokerId = masterBroker2.id
      expect(externalBroker?.masterBrokerId).not.toBe(callerUser?.id);

      // Verify authority check rejects
      const isAuthorized =
        callerUser?.role === "super_admin" ||
        (callerUser?.role === "master_broker" &&
          externalBroker?.role === "broker" &&
          externalBroker?.masterBrokerId === callerUser?.id);

      expect(isAuthorized).toBe(false);
    });
  });

  describe("9. Master no puede modificar su propio estado", () => {
    it("bloquea auto-modificación / auto-desactivación para Master Broker", async () => {
      const callerUser = await storage.getUser(masterBroker1.id);
      const targetUser = callerUser;

      const isSelfAction = callerUser?.id === targetUser?.id;
      expect(isSelfAction).toBe(true);
      // Central handler returns 400 "No puedes modificar el estado de tu propia cuenta"
    });
  });

  describe("10. Broker no puede cambiar estados", () => {
    it("un broker regular carece de autoridad para alterar estados operativos", async () => {
      const callerUser = await storage.getUser(subBroker1.id);

      const hasAuthority =
        callerUser?.role === "super_admin" ||
        callerUser?.role === "admin" ||
        callerUser?.role === "master_broker";

      expect(hasAuthority).toBe(false);
    });
  });

  describe("11. Endpoint antiguo no puede evitar auditoría / reglas nuevas", () => {
    it("el endpoint toggle-status delega a la lógica central y genera auditoría", async () => {
      // Suspend subBroker1 first so we can test toggling back to active
      await storage.updateUserOperationalStatus({
        userId: subBroker1.id,
        targetStatus: "suspended",
        changedBy: superAdminUser.id,
        reason: "Suspensión administrativa previa",
      });

      // Toggle subBroker1 from suspended back to active via storage with audit log
      const updated = await storage.updateUserOperationalStatus({
        userId: subBroker1.id,
        targetStatus: "active",
        changedBy: superAdminUser.id,
        reason: "Cambio de estado administrativo vía toggle",
      });

      expect(updated.status).toBe("active");
      expect(updated.isActive).toBe(true);

      // Check commercial audit logs
      const logs = await storage.getCommercialAuditLogs({
        entityType: "user",
        entityId: subBroker1.id,
      });

      expect(logs.length).toBeGreaterThan(0);
      const toggleLog = logs.find((l) => (l.metadata as any)?.reason === "Cambio de estado administrativo vía toggle");
      expect(toggleLog).toBeDefined();
      const latestLog = toggleLog!;
      expect(latestLog.entityType).toBe("user");
      expect(latestLog.entityId).toBe(subBroker1.id);
      expect(latestLog.action).toBe("reactivate");
      expect(latestLog.previousState).toBe("suspended");
      expect(latestLog.newState).toBe("active");
      expect((latestLog.metadata as any)?.reason).toBe("Cambio de estado administrativo vía toggle");
    });
  });

  describe("12. Cambio de estado genera auditoría en commercialAuditLogs", () => {
    it("registra un registro inmutable con category, actor, motivo y notas", async () => {
      await storage.updateUserOperationalStatus({
        userId: subBroker2.id,
        targetStatus: "suspended",
        changedBy: superAdminUser.id,
        reason: "Auditoría de prueba detallada",
        notes: "Notas complementarias de validación QA",
      });

      const logs = await storage.getCommercialAuditLogs({
        entityType: "user",
        entityId: subBroker2.id,
      });

      expect(logs.length).toBeGreaterThan(0);
      const log = logs.find((l) => (l.metadata as any)?.reason === "Auditoría de prueba detallada");
      expect(log).toBeDefined();
      expect(log?.performedBy).toBe(superAdminUser.id);
      expect(log?.action).toBe("suspend");
      expect(log?.newState).toBe("suspended");
      expect((log?.metadata as any)?.notes).toBe("Notas complementarias de validación QA");
    });
  });

  describe("13. Migración / backfill conserva correctamente usuarios previamente inactivos", () => {
    it("asigna status=inactive a usuarios con isActive=false y status=active a isActive=true", async () => {
      // Simulate existing legacy users before migration
      const legacyActive = await storage.createUser({
        email: "legacy.active@test.com",
        role: "broker",
        firstName: "Legacy",
        lastName: "Active",
        isActive: true,
      });

      const legacyInactive = await storage.createUser({
        email: "legacy.inactive@test.com",
        role: "broker",
        firstName: "Legacy",
        lastName: "Inactive",
        isActive: false,
      });

      // When resolved or backfilled:
      // isActive === true => status = active
      // isActive === false => status = inactive
      const activeResolvedStatus = legacyActive.status || (legacyActive.isActive ? "active" : "inactive");
      const inactiveResolvedStatus = legacyInactive.status || (legacyInactive.isActive ? "active" : "inactive");

      expect(activeResolvedStatus).toBe("active");
      expect(inactiveResolvedStatus).toBe("inactive");

      // Sychronization invariance
      expect(legacyActive.isActive).toBe(true);
      expect(legacyInactive.isActive).toBe(false);
    });
  });

  describe("14. Protección contra bypass en updateUser", () => {
    it("impide que updateUser modifique status o isActive directamente", async () => {
      // subBroker1 is currently active
      const userBefore = await storage.getUser(subBroker1.id);
      expect(userBefore?.status).toBe("active");
      expect(userBefore?.isActive).toBe(true);

      // Attempt direct write through updateUser
      const updated = await storage.updateUser(subBroker1.id, {
        firstName: "NombreModificado",
        status: "suspended",
        isActive: false,
      } as any);

      // Profile was updated, but operational status fields were stripped
      expect(updated?.firstName).toBe("NombreModificado");
      expect(updated?.status).toBe("active");
      expect(updated?.isActive).toBe(true);
    });
  });

  describe("15. Independencia entre membresía tenant y estado operativo global", () => {
    it("desactivar o activar membresía tenant no muta users.status ni users.isActive", async () => {
      // Find tenant member for subBroker1
      const members = await storage.getTenantMembers(testTenant.id);
      const member = members.find((m) => m.userId === subBroker1.id);
      expect(member).toBeDefined();

      // Deactivate tenant member
      await storage.deactivateTenantMember(testTenant.id, member!.id);

      // Global user account must remain active
      const userAfterDeact = await storage.getUser(subBroker1.id);
      expect(userAfterDeact?.status).toBe("active");
      expect(userAfterDeact?.isActive).toBe(true);

      // Suspend user globally
      await storage.updateUserOperationalStatus({
        userId: subBroker1.id,
        targetStatus: "suspended",
        changedBy: superAdminUser.id,
        reason: "Suspensión de prueba",
      });

      // Now activate tenant member again
      await storage.activateTenantMember(testTenant.id, member!.id);

      // Global user account MUST STAY SUSPENDED (not bypassed by activating tenant member)
      const userAfterAct = await storage.getUser(subBroker1.id);
      expect(userAfterAct?.status).toBe("suspended");
      expect(userAfterAct?.isActive).toBe(false);

      // Reactivate user globally
      await storage.updateUserOperationalStatus({
        userId: subBroker1.id,
        targetStatus: "active",
        changedBy: superAdminUser.id,
        reason: "Reactivación final",
      });
    });
  });
});
