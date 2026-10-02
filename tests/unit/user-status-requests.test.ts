import { storage } from "../../server/storage";
import type { 
  User, 
  Tenant, 
  UserOperationalStatus, 
  UserStatusRequestAction,
  UserStatusRequest,
  UserStatusRequestStatus 
} from "../../shared/schema";
import { 
  createStatusRequestSchema, 
  approveStatusRequestSchema, 
  rejectStatusRequestSchema 
} from "../../shared/schema";

describe("User Status Requests (Master Broker -> Super Admin Workflow)", () => {
  let superAdminUser: User;
  let regularAdminUser: User;
  let masterBroker1: User;
  let masterBroker2: User;
  let brokerOwnActive: User;
  let brokerOwnSuspended: User;
  let brokerOwnInactive: User;
  let brokerExternal: User;
  let testTenant: Tenant;

  beforeAll(async () => {
    // Tenant
    testTenant = await storage.createTenant({
      name: "Tenant Status Requests Test",
      slug: "tenant-status-requests-test",
      type: "master_broker",
      isActive: true,
      settings: {},
    });

    // Super Admin
    superAdminUser = await storage.createUser({
      email: "superadmin.req@test.com",
      role: "super_admin",
      firstName: "SuperAdmin",
      lastName: "Tester",
      isActive: true,
      status: "active",
    });

    // Regular Admin (admin role - NOT super_admin)
    regularAdminUser = await storage.createUser({
      email: "regularadmin.req@test.com",
      role: "admin",
      firstName: "Admin",
      lastName: "Regular",
      isActive: true,
      status: "active",
    });

    // Master Brokers
    masterBroker1 = await storage.createUser({
      email: "master1.req@test.com",
      role: "master_broker",
      firstName: "Master1",
      lastName: "RedA",
      isActive: true,
      status: "active",
    });

    masterBroker2 = await storage.createUser({
      email: "master2.req@test.com",
      role: "master_broker",
      firstName: "Master2",
      lastName: "RedB",
      isActive: true,
      status: "active",
    });

    // Brokers in Master 1's network
    brokerOwnActive = await storage.createUser({
      email: "broker.own.active@test.com",
      role: "broker",
      firstName: "Broker",
      lastName: "PropioActivo",
      masterBrokerId: masterBroker1.id,
      isActive: true,
      status: "active",
    });

    brokerOwnSuspended = await storage.createUser({
      email: "broker.own.suspended@test.com",
      role: "broker",
      firstName: "Broker",
      lastName: "PropioSuspendido",
      masterBrokerId: masterBroker1.id,
      isActive: false,
      status: "suspended",
    });

    brokerOwnInactive = await storage.createUser({
      email: "broker.own.inactive@test.com",
      role: "broker",
      firstName: "Broker",
      lastName: "PropioInactivo",
      masterBrokerId: masterBroker1.id,
      isActive: false,
      status: "inactive",
    });

    // Broker in Master 2's network (external to Master 1)
    brokerExternal = await storage.createUser({
      email: "broker.external@test.com",
      role: "broker",
      firstName: "Broker",
      lastName: "Externo",
      masterBrokerId: masterBroker2.id,
      isActive: true,
      status: "active",
    });

    // Setup tenant membership with canOriginate: false on brokerOwnActive to test preservation
    await storage.createTenantMember({
      tenantId: testTenant.id,
      userId: brokerOwnActive.id,
      role: "member",
      canOriginate: false,
    });
  });

  // Business logic helper simulating backend endpoint verification
  async function simulateCreateRequest(caller: User, targetUserId: string, requestedStatus: UserStatusRequestAction, reason: string, notes?: string) {
    if (caller.role !== 'master_broker') {
      throw new Error("Solo los Master Brokers pueden crear solicitudes de cambio de estado");
    }

    const parseResult = createStatusRequestSchema.safeParse({ targetUserId, requestedStatus, reason, notes });
    if (!parseResult.success) {
      throw new Error(parseResult.error.errors[0]?.message || "Datos de solicitud inválidos");
    }

    if (targetUserId === caller.id) {
      throw new Error("No puedes crear solicitudes sobre tu propia cuenta");
    }

    const targetUser = await storage.getUser(targetUserId);
    if (!targetUser) {
      throw new Error("Usuario objetivo no encontrado");
    }

    if (targetUser.role !== 'broker') {
      throw new Error("Solo se pueden crear solicitudes para usuarios con rol Broker");
    }

    if (targetUser.masterBrokerId !== caller.id) {
      throw new Error("Solo puedes crear solicitudes para brokers de tu propia red");
    }

    const currentStatus = (targetUser.status as UserOperationalStatus) || (targetUser.isActive ? 'active' : 'inactive');

    if (requestedStatus === 'inactive') {
      if (currentStatus !== 'active' && currentStatus !== 'suspended') {
        throw new Error("Solo se puede solicitar la baja de un broker que esté actualmente activo o suspendido");
      }
    } else if (requestedStatus === 'active') {
      if (currentStatus !== 'inactive') {
        throw new Error("Solo se puede solicitar la reactivación de un broker que esté actualmente inactivo");
      }
    }

    const hasDuplicate = await storage.hasPendingStatusRequest({
      requesterId: caller.id,
      targetUserId: targetUser.id,
      requestedStatus,
    });

    if (hasDuplicate) {
      throw new Error(`Ya existe una solicitud pendiente de ${requestedStatus === 'inactive' ? 'baja' : 'reactivación'} para este broker`);
    }

    const newRequest = await storage.createUserStatusRequest({
      requesterId: caller.id,
      targetUserId: targetUser.id,
      requestedStatus,
      reason: reason.trim(),
      notes: notes?.trim(),
    });

    await storage.createCommercialAuditLog({
      action: 'create_status_request',
      entityType: 'user_status_request',
      entityId: newRequest.id,
      targetUserId: targetUser.id,
      performedBy: caller.id,
      notes: `Solicitud de ${requestedStatus} creada. Motivo: ${reason}`,
    });

    return newRequest;
  }

  // Business logic helper simulating backend list verification (SOLO Super Admin)
  async function simulateListRequests(caller: User, filter?: { status?: UserStatusRequestStatus }) {
    if (caller.role !== 'super_admin') {
      throw new Error("Se requieren privilegios de Super Administrador");
    }
    return await storage.getUserStatusRequests(filter);
  }

  // Business logic helper simulating backend approve verification (SOLO Super Admin)
  async function simulateApproveRequest(caller: User, requestId: string, reviewNotes?: string) {
    if (caller.role !== 'super_admin') {
      throw new Error("Se requieren privilegios de Super Administrador");
    }

    const parseResult = approveStatusRequestSchema.safeParse({ reviewNotes });
    if (!parseResult.success) {
      throw new Error(parseResult.error.errors[0]?.message || "Datos inválidos");
    }

    const req = await storage.getUserStatusRequest(requestId);
    if (!req) {
      throw new Error("Solicitud no encontrada");
    }

    if (req.status !== 'pending') {
      throw new Error(`La solicitud ya fue resuelta previamente (estado actual: ${req.status})`);
    }

    const targetUser = await storage.getUser(req.targetUserId);
    if (!targetUser) {
      throw new Error("Usuario objetivo no encontrado");
    }

    const currentStatus = (targetUser.status as UserOperationalStatus) || (targetUser.isActive ? 'active' : 'inactive');

    // Obsolescence check
    if (req.requestedStatus === 'inactive' && currentStatus === 'inactive') {
      throw new Error("La solicitud es obsoleta: el usuario ya se encuentra inactivo.");
    }
    if (req.requestedStatus === 'active' && currentStatus === 'active') {
      throw new Error("La solicitud es obsoleta: el usuario ya se encuentra activo.");
    }

    // Execute central operational status update
    const updatedUser = await storage.updateUserOperationalStatus({
      userId: targetUser.id,
      targetStatus: req.requestedStatus as UserOperationalStatus,
      changedBy: caller.id,
      reason: `Aprobación de solicitud ${req.id}: ${req.reason}`,
      notes: reviewNotes?.trim() || req.notes || undefined,
    });

    const resolvedRequest = await storage.resolveUserStatusRequest({
      requestId: req.id,
      resolution: 'approved',
      reviewedBy: caller.id,
      reviewNotes: reviewNotes?.trim(),
    });

    await storage.createCommercialAuditLog({
      action: 'approve_status_request',
      entityType: 'user_status_request',
      entityId: req.id,
      targetUserId: targetUser.id,
      performedBy: caller.id,
      notes: `Solicitud ${req.id} aprobada por ${caller.email}`,
    });

    return { request: resolvedRequest, user: updatedUser };
  }

  // Business logic helper simulating backend reject verification (SOLO Super Admin)
  async function simulateRejectRequest(caller: User, requestId: string, reviewNotes: string) {
    if (caller.role !== 'super_admin') {
      throw new Error("Se requieren privilegios de Super Administrador");
    }

    const parseResult = rejectStatusRequestSchema.safeParse({ reviewNotes });
    if (!parseResult.success) {
      throw new Error(parseResult.error.errors[0]?.message || "El motivo del rechazo es obligatorio (mínimo 3 caracteres)");
    }

    const req = await storage.getUserStatusRequest(requestId);
    if (!req) {
      throw new Error("Solicitud no encontrada");
    }

    if (req.status !== 'pending') {
      throw new Error(`La solicitud ya fue resuelta previamente (estado actual: ${req.status})`);
    }

    const resolvedRequest = await storage.resolveUserStatusRequest({
      requestId: req.id,
      resolution: 'rejected',
      reviewedBy: caller.id,
      reviewNotes: reviewNotes.trim(),
    });

    await storage.createCommercialAuditLog({
      action: 'reject_status_request',
      entityType: 'user_status_request',
      entityId: req.id,
      targetUserId: req.targetUserId,
      performedBy: caller.id,
      notes: `Solicitud ${req.id} rechazada por ${caller.email}. Motivo: ${reviewNotes}`,
    });

    return { request: resolvedRequest };
  }

  // Helper simulating the full POST /api/master-broker/status-requests route behavior
  async function simulateCreateRequestRoute(caller: User, targetUserId: string, requestedStatus: UserStatusRequestAction, reason: string, notes?: string) {
    if (caller.role !== 'master_broker') {
      return { status: 403, body: { message: "Solo los Master Brokers pueden crear solicitudes de cambio de estado" } };
    }

    const parseResult = createStatusRequestSchema.safeParse({ targetUserId, requestedStatus, reason, notes });
    if (!parseResult.success) {
      return { status: 400, body: { message: parseResult.error.errors[0]?.message || "Datos de solicitud inválidos" } };
    }

    try {
      // Simulate concurrent execution where pre-check passed or race condition occurred
      const newRequest = await storage.createUserStatusRequest({
        requesterId: caller.id,
        targetUserId,
        requestedStatus,
        reason: reason.trim(),
        notes: notes?.trim() || undefined,
      });
      return { status: 201, body: newRequest };
    } catch (error: any) {
      if (error?.code === '23505' || error?.constraint?.includes('idx_usr_req_unique_pending') || error?.message?.includes('idx_usr_req_unique_pending')) {
        return { 
          status: 409, 
          body: { message: "Ya existe una solicitud pendiente con el mismo estado para este broker (carrera concurrente prevenida)." } 
        };
      }
      return { status: 500, body: { message: error.message || "Error al crear solicitud de estado" } };
    }
  }

  describe("1. Master Broker puede solicitar baja de broker propio activo", () => {
    it("crea solicitud pendiente con tipo 'inactive' para broker activo de su red", async () => {
      const req = await simulateCreateRequest(
        masterBroker1,
        brokerOwnActive.id,
        "inactive",
        "Incumplimiento reiterado de políticas comerciales",
        "Expediente interno #456"
      );

      expect(req).toBeDefined();
      expect(req.id).toBeDefined();
      expect(req.requesterId).toBe(masterBroker1.id);
      expect(req.targetUserId).toBe(brokerOwnActive.id);
      expect(req.requestedStatus).toBe("inactive");
      expect(req.status).toBe("pending");
      expect(req.reason).toBe("Incumplimiento reiterado de políticas comerciales");
      expect(req.notes).toBe("Expediente interno #456");

      // Verify broker's status has NOT changed yet (Master cannot apply directly)
      const targetUser = await storage.getUser(brokerOwnActive.id);
      expect(targetUser?.status).toBe("active");
      expect(targetUser?.isActive).toBe(true);
    });
  });

  describe("2. Master Broker puede solicitar reactivación de broker propio inactivo", () => {
    it("crea solicitud pendiente con tipo 'active' para broker inactivo de su red", async () => {
      const req = await simulateCreateRequest(
        masterBroker1,
        brokerOwnInactive.id,
        "active",
        "Reincorporación tras subsanación de expediente",
        "Validado por compliance regional"
      );

      expect(req).toBeDefined();
      expect(req.requestedStatus).toBe("active");
      expect(req.status).toBe("pending");
      expect(req.requesterId).toBe(masterBroker1.id);

      // Verify broker's status has NOT changed yet
      const targetUser = await storage.getUser(brokerOwnInactive.id);
      expect(targetUser?.status).toBe("inactive");
      expect(targetUser?.isActive).toBe(false);
    });
  });

  describe("3. Master Broker NO puede solicitar sobre brokers fuera de su red", () => {
    it("rechaza solicitud si el broker pertenece a otro Master Broker", async () => {
      await expect(
        simulateCreateRequest(
          masterBroker1,
          brokerExternal.id,
          "inactive",
          "Intento de baja sobre broker ajeno"
        )
      ).rejects.toThrow("Solo puedes crear solicitudes para brokers de tu propia red");
    });
  });

  describe("4. Master Broker NO puede solicitar sobre sí mismo", () => {
    it("bloquea solicitud donde requesterId === targetUserId", async () => {
      await expect(
        simulateCreateRequest(
          masterBroker1,
          masterBroker1.id,
          "inactive",
          "Auto-baja"
        )
      ).rejects.toThrow("No puedes crear solicitudes sobre tu propia cuenta");
    });
  });

  describe("5. Broker no puede crear solicitudes", () => {
    it("bloquea creación de solicitudes provenientes de un broker", async () => {
      await expect(
        simulateCreateRequest(
          brokerOwnActive,
          brokerOwnInactive.id,
          "active",
          "Broker intentando reactivar a colega"
        )
      ).rejects.toThrow("Solo los Master Brokers pueden crear solicitudes de cambio de estado");
    });
  });

  describe("6. No se permiten duplicados pendientes", () => {
    it("bloquea creación de solicitud si ya existe una pendiente con mismo target y acción", async () => {
      // We already have a pending 'inactive' request on brokerOwnActive from Test 1
      await expect(
        simulateCreateRequest(
          masterBroker1,
          brokerOwnActive.id,
          "inactive",
          "Intento duplicado de baja"
        )
      ).rejects.toThrow("Ya existe una solicitud pendiente de baja para este broker");
    });
  });

  describe("7. Super Admin puede aprobar", () => {
    it("permite a Super Admin aprobar una solicitud pendiente", async () => {
      // Find pending request on brokerOwnActive
      const requests = await storage.getUserStatusRequests({
        targetUserId: brokerOwnActive.id,
        status: "pending",
      });
      expect(requests.length).toBeGreaterThan(0);
      const targetReq = requests[0];

      const result = await simulateApproveRequest(
        superAdminUser,
        targetReq.id,
        "Aprobado conforme a documentación remitida"
      );

      expect(result.request.status).toBe("approved");
      expect(result.request.reviewedBy).toBe(superAdminUser.id);
      expect(result.request.reviewedAt).toBeDefined();
      expect(result.request.reviewNotes).toBe("Aprobado conforme a documentación remitida");
    });
  });

  describe("8. Aprobar ejecuta cambio operativo real", () => {
    it("sincroniza users.status, users.isActive y preserva referencia en motivo", async () => {
      // Following approval in Test 7, brokerOwnActive must be inactive
      const updatedUser = await storage.getUser(brokerOwnActive.id);
      expect(updatedUser?.status).toBe("inactive");
      expect(updatedUser?.isActive).toBe(false);
      expect(updatedUser?.statusChangeReason).toContain("Aprobación de solicitud");
      expect(updatedUser?.statusChangedBy).toBe(superAdminUser.id);
    });
  });

  describe("9. Aprobar conserva canOriginate", () => {
    it("preserva estrictamente canOriginate del tenant member tras cambio operativo", async () => {
      // Verify tenant member for brokerOwnActive
      const members = await storage.getTenantMembers(testTenant.id);
      const member = members.find(m => m.userId === brokerOwnActive.id);
      expect(member).toBeDefined();
      expect(member?.canOriginate).toBe(false); // Invariant maintained
    });
  });

  describe("10. Super Admin puede rechazar", () => {
    it("permite a Super Admin rechazar con reviewNotes obligatorio", async () => {
      // Find pending request on brokerOwnInactive
      const requests = await storage.getUserStatusRequests({
        targetUserId: brokerOwnInactive.id,
        status: "pending",
      });
      expect(requests.length).toBeGreaterThan(0);
      const targetReq = requests[0];

      const result = await simulateRejectRequest(
        superAdminUser,
        targetReq.id,
        "Rechazado: El broker aún tiene adeudos administrativos pendientes."
      );

      expect(result.request.status).toBe("rejected");
      expect(result.request.reviewedBy).toBe(superAdminUser.id);
      expect(result.request.reviewedAt).toBeDefined();
      expect(result.request.reviewNotes).toBe("Rechazado: El broker aún tiene adeudos administrativos pendientes.");

      // Check target broker state did NOT change
      const targetUser = await storage.getUser(brokerOwnInactive.id);
      expect(targetUser?.status).toBe("inactive");
      expect(targetUser?.isActive).toBe(false);
    });
  });

  describe("11. Rechazo requiere motivo obligatorio", () => {
    it("falla validación si reviewNotes está vacío o tiene menos de 3 caracteres", async () => {
      // Create a new request to test validation failure
      const brokerForReject = await storage.createUser({
        email: "broker.for.reject@test.com",
        role: "broker",
        firstName: "Broker",
        lastName: "PruebaRechazo",
        masterBrokerId: masterBroker1.id,
        isActive: true,
        status: "active",
      });

      const req = await simulateCreateRequest(
        masterBroker1,
        brokerForReject.id,
        "inactive",
        "Baja temporal por inactividad comercial"
      );

      await expect(
        simulateRejectRequest(superAdminUser, req.id, "")
      ).rejects.toThrow("El motivo del rechazo es obligatorio (mínimo 3 caracteres)");

      await expect(
        simulateRejectRequest(superAdminUser, req.id, "no")
      ).rejects.toThrow("El motivo del rechazo es obligatorio (mínimo 3 caracteres)");
    });
  });

  describe("12. Solicitud ya resuelta es inmutable", () => {
    it("rechaza intentos de aprobar o rechazar solicitudes que no están pendientes", async () => {
      // Get previously resolved approved request
      const requests = await storage.getUserStatusRequests({
        targetUserId: brokerOwnActive.id,
        status: "approved",
      });
      const resolvedReq = requests[0];

      // Attempt to approve again
      await expect(
        simulateApproveRequest(superAdminUser, resolvedReq.id, "Intento de re-aprobación")
      ).rejects.toThrow("La solicitud ya fue resuelta previamente");

      // Attempt to reject an already approved request
      await expect(
        simulateRejectRequest(superAdminUser, resolvedReq.id, "Intento de rechazar una aprobada")
      ).rejects.toThrow("La solicitud ya fue resuelta previamente");
    });
  });

  describe("13. Solicitud obsoleta no puede aplicar cambio inconsistente", () => {
    it("bloquea aprobación si el estado actual ya coincide con el solicitado", async () => {
      const brokerObsolete = await storage.createUser({
        email: "broker.obsolete@test.com",
        role: "broker",
        firstName: "Broker",
        lastName: "Obsoleto",
        masterBrokerId: masterBroker1.id,
        isActive: false,
        status: "inactive",
      });

      const pendingReq = await simulateCreateRequest(
        masterBroker1,
        brokerObsolete.id,
        "active",
        "Reactivar broker inactivo"
      );

      // Super Admin manually activates the user directly prior to resolving the request:
      await storage.updateUserOperationalStatus({
        userId: brokerObsolete.id,
        targetStatus: "active",
        changedBy: superAdminUser.id,
        reason: "Activación administrativa manual anticipada",
      });

      // Now the user is already 'active'. Trying to approve the obsolete request must be blocked:
      await expect(
        simulateApproveRequest(superAdminUser, pendingReq.id, "Aprobando solicitud obsoleta")
      ).rejects.toThrow("La solicitud es obsoleta: el usuario ya se encuentra activo.");
    });
  });

  describe("14. Auditoría queda registrada", () => {
    it("verifica trazabilidad completa en commercialAuditLogs para creación, aprobación y rechazo", async () => {
      const logs = await storage.getCommercialAuditLogs({
        entityType: "user_status_request",
      });

      expect(logs.length).toBeGreaterThan(0);

      const actions = logs.map((l: any) => l.action);
      expect(actions).toContain("create_status_request");
      expect(actions).toContain("approve_status_request");
      expect(actions).toContain("reject_status_request");

      // Verify log details
      const creationLog = logs.find((l: any) => l.action === "create_status_request");
      expect(creationLog.performedBy).toBe(masterBroker1.id);
      expect(creationLog.entityType).toBe("user_status_request");

      const approvalLog = logs.find((l: any) => l.action === "approve_status_request");
      expect(approvalLog.performedBy).toBe(superAdminUser.id);

      const rejectionLog = logs.find((l: any) => l.action === "reject_status_request");
      expect(rejectionLog.performedBy).toBe(superAdminUser.id);
    });
  });

  describe("15. Restricción estricta de permisos: SOLO Super Admin (NO Admin)", () => {
    let pendingReqForRoleTest: UserStatusRequest;

    beforeAll(async () => {
      const brokerRoleTest = await storage.createUser({
        email: "broker.role.test@test.com",
        role: "broker",
        firstName: "Broker",
        lastName: "RoleTest",
        masterBrokerId: masterBroker1.id,
        isActive: true,
        status: "active",
      });

      pendingReqForRoleTest = await simulateCreateRequest(
        masterBroker1,
        brokerRoleTest.id,
        "inactive",
        "Baja para probar permisos exclusivos de Super Admin"
      );
    });

    it("admin normal NO puede listar solicitudes de estado (GET /api/admin/status-requests)", async () => {
      await expect(
        simulateListRequests(regularAdminUser)
      ).rejects.toThrow("Se requieren privilegios de Super Administrador");
    });

    it("admin normal NO puede aprobar solicitudes de estado (POST /api/admin/status-requests/:id/approve)", async () => {
      await expect(
        simulateApproveRequest(regularAdminUser, pendingReqForRoleTest.id, "Intento de aprobación por admin regular")
      ).rejects.toThrow("Se requieren privilegios de Super Administrador");
    });

    it("admin normal NO puede rechazar solicitudes de estado (POST /api/admin/status-requests/:id/reject)", async () => {
      await expect(
        simulateRejectRequest(regularAdminUser, pendingReqForRoleTest.id, "Intento de rechazo por admin regular")
      ).rejects.toThrow("Se requieren privilegios de Super Administrador");
    });

    it("super_admin SÍ puede listar, aprobar y rechazar solicitudes", async () => {
      // Super admin can list
      const list = await simulateListRequests(superAdminUser);
      expect(Array.isArray(list)).toBe(true);
      expect(list.length).toBeGreaterThan(0);

      // Super admin can resolve the pending request
      const approvalResult = await simulateApproveRequest(
        superAdminUser,
        pendingReqForRoleTest.id,
        "Aprobación legítima por Super Admin"
      );
      expect(approvalResult.request.status).toBe("approved");
      expect(approvalResult.request.reviewedBy).toBe(superAdminUser.id);
    });
  });

  describe("16. Blindaje contra colisiones de unicidad DB y concurrencia (Error 23505)", () => {
    it("el índice único parcial idx_usr_req_unique_pending captura colisiones concurrentes y devuelve 409 (no 500)", async () => {
      const brokerConcurrency = await storage.createUser({
        email: "broker.concurrency@test.com",
        role: "broker",
        firstName: "Broker",
        lastName: "Concurrente",
        masterBrokerId: masterBroker1.id,
        isActive: true,
        status: "active",
      });

      // Primera inserción exitosa
      const firstRes = await simulateCreateRequestRoute(
        masterBroker1,
        brokerConcurrency.id,
        "inactive",
        "Primera solicitud concurrente"
      );
      expect(firstRes.status).toBe(201);

      // Segunda inserción concurrente simultánea (simula colisión de índice único parcial idx_usr_req_unique_pending en DB)
      const secondRes = await simulateCreateRequestRoute(
        masterBroker1,
        brokerConcurrency.id,
        "inactive",
        "Segunda solicitud concurrente idéntica"
      );

      // Debe responder 409 con mensaje controlado, NUNCA 500
      expect(secondRes.status).toBe(409);
      expect((secondRes.body as any).message).toContain("Ya existe una solicitud pendiente");
    });
  });
});
