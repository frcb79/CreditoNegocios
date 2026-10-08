import { MemStorage } from "../../server/storage";
import type {
  User,
  UserOperationalStatus,
  UserStatusRequestAction,
  UserStatusRequestStatus,
} from "../../shared/schema";
import {
  createStatusRequestSchema,
  approveStatusRequestSchema,
  rejectStatusRequestSchema,
} from "../../shared/schema";

describe("User Status Requests — Master Broker / Super Admin governance", () => {
  let storage: MemStorage;
  let superAdmin: User;
  let regularAdmin: User;
  let masterA: User;
  let masterB: User;
  let brokerActive: User;
  let brokerInactive: User;
  let brokerExternal: User;

  beforeEach(async () => {
    storage = new MemStorage();

    superAdmin = await storage.createUser({
      email: "sa-status@test.local",
      role: "super_admin",
      isActive: true,
      status: "active",
    } as any);

    regularAdmin = await storage.createUser({
      email: "admin-status@test.local",
      role: "admin",
      isActive: true,
      status: "active",
    } as any);

    masterA = await storage.createUser({
      email: "master-a-status@test.local",
      role: "master_broker",
      isActive: true,
      status: "active",
    } as any);

    masterB = await storage.createUser({
      email: "master-b-status@test.local",
      role: "master_broker",
      isActive: true,
      status: "active",
    } as any);

    brokerActive = await storage.createUser({
      email: "broker-active-status@test.local",
      role: "broker",
      masterBrokerId: masterA.id,
      isActive: true,
      status: "active",
    } as any);

    brokerInactive = await storage.createUser({
      email: "broker-inactive-status@test.local",
      role: "broker",
      masterBrokerId: masterA.id,
      isActive: false,
      status: "inactive",
    } as any);

    brokerExternal = await storage.createUser({
      email: "broker-external-status@test.local",
      role: "broker",
      masterBrokerId: masterB.id,
      isActive: true,
      status: "active",
    } as any);
  });

  async function masterDirectStatusChange(
    caller: User,
    targetUserId: string,
    targetStatus: UserOperationalStatus,
    reason: string,
  ) {
    if (caller.role !== "master_broker") {
      throw new Error("Solo Master Broker");
    }

    const target = await storage.getUser(targetUserId);
    if (!target || target.role !== "broker" || target.masterBrokerId !== caller.id) {
      throw new Error("No tienes permiso para modificar usuarios fuera de tu red");
    }

    if (targetStatus === "active") {
      throw new Error(
        "Los Master Brokers pueden suspender o dar de baja a brokers de su red, pero la reactivación requiere Super Admin.",
      );
    }

    return storage.updateUserOperationalStatus({
      userId: target.id,
      targetStatus,
      changedBy: caller.id,
      reason,
    });
  }

  async function createReactivationRequest(
    caller: User,
    targetUserId: string,
    requestedStatus: UserStatusRequestAction,
    reason: string,
    notes?: string,
  ) {
    if (caller.role !== "master_broker") {
      throw new Error("Solo los Master Brokers pueden crear solicitudes de cambio de estado");
    }

    const parsed = createStatusRequestSchema.safeParse({
      targetUserId,
      requestedStatus,
      reason,
      notes,
    });
    if (!parsed.success) {
      throw new Error(parsed.error.errors[0]?.message || "Datos de solicitud inválidos");
    }

    if (targetUserId === caller.id) {
      throw new Error("No puedes crear solicitudes sobre tu propia cuenta");
    }

    const target = await storage.getUser(targetUserId);
    if (!target) throw new Error("Usuario objetivo no encontrado");
    if (target.role !== "broker") {
      throw new Error("Solo se pueden crear solicitudes para usuarios con rol Broker");
    }
    if (target.masterBrokerId !== caller.id) {
      throw new Error("Solo puedes crear solicitudes para brokers de tu propia red");
    }

    if (requestedStatus !== "active") {
      throw new Error(
        "La baja de un broker de tu red se ejecuta directamente. Sólo la reactivación requiere solicitud a Super Admin.",
      );
    }

    const currentStatus =
      (target.status as UserOperationalStatus) || (target.isActive ? "active" : "inactive");
    if (currentStatus !== "inactive") {
      throw new Error(
        "Solo se puede solicitar la reactivación de un broker que esté actualmente inactivo",
      );
    }

    const duplicate = await storage.hasPendingStatusRequest({
      requesterId: caller.id,
      targetUserId: target.id,
      requestedStatus: "active",
    });
    if (duplicate) {
      throw new Error("Ya existe una solicitud pendiente de reactivación para este broker");
    }

    return storage.createUserStatusRequest({
      requesterId: caller.id,
      targetUserId: target.id,
      requestedStatus: "active",
      reason: reason.trim(),
      notes: notes?.trim(),
    });
  }

  async function listRequests(caller: User, status?: UserStatusRequestStatus) {
    if (caller.role !== "super_admin") {
      throw new Error("Se requieren privilegios de Super Administrador");
    }
    return storage.getUserStatusRequests(status ? { status } : undefined);
  }

  async function approveRequest(caller: User, requestId: string, reviewNotes?: string) {
    if (caller.role !== "super_admin") {
      throw new Error("Se requieren privilegios de Super Administrador");
    }

    const parsed = approveStatusRequestSchema.safeParse({ reviewNotes });
    if (!parsed.success) throw new Error(parsed.error.errors[0]?.message || "Datos inválidos");

    const request = await storage.getUserStatusRequest(requestId);
    if (!request) throw new Error("Solicitud no encontrada");
    if (request.status !== "pending") throw new Error("La solicitud ya fue resuelta previamente");

    const target = await storage.getUser(request.targetUserId);
    if (!target) throw new Error("Usuario objetivo no encontrado");

    const currentStatus =
      (target.status as UserOperationalStatus) || (target.isActive ? "active" : "inactive");
    if (request.requestedStatus !== "active" || currentStatus !== "inactive") {
      throw new Error("La solicitud ya no es aplicable al estado actual del broker");
    }

    const updated = await storage.updateUserOperationalStatus({
      userId: target.id,
      targetStatus: "active",
      changedBy: caller.id,
      reason: `Aprobación de solicitud ${request.id}: ${request.reason}`,
      notes: reviewNotes?.trim() || request.notes || undefined,
    });

    const resolved = await storage.resolveUserStatusRequest({
      requestId: request.id,
      resolution: "approved",
      reviewedBy: caller.id,
      reviewNotes: reviewNotes?.trim(),
    });

    return { request: resolved, user: updated };
  }

  async function rejectRequest(caller: User, requestId: string, reviewNotes: string) {
    if (caller.role !== "super_admin") {
      throw new Error("Se requieren privilegios de Super Administrador");
    }

    const parsed = rejectStatusRequestSchema.safeParse({ reviewNotes });
    if (!parsed.success) {
      throw new Error(
        parsed.error.errors[0]?.message ||
          "El motivo del rechazo es obligatorio (mínimo 3 caracteres)",
      );
    }

    return storage.resolveUserStatusRequest({
      requestId,
      resolution: "rejected",
      reviewedBy: caller.id,
      reviewNotes: reviewNotes.trim(),
    });
  }

  test("Master puede dar de baja directamente a un broker de su red", async () => {
    const updated = await masterDirectStatusChange(
      masterA,
      brokerActive.id,
      "inactive",
      "Baja de la red por decisión del Master",
    );

    expect(updated.status).toBe("inactive");
    expect(updated.isActive).toBe(false);
    expect(updated.statusChangedBy).toBe(masterA.id);
  });

  test("Master puede suspender directamente a un broker de su red", async () => {
    const updated = await masterDirectStatusChange(
      masterA,
      brokerActive.id,
      "suspended",
      "Revisión temporal",
    );

    expect(updated.status).toBe("suspended");
    expect(updated.isActive).toBe(false);
  });

  test("Master no puede reactivar directamente", async () => {
    await expect(
      masterDirectStatusChange(masterA, brokerInactive.id, "active", "Reactivar"),
    ).rejects.toThrow("la reactivación requiere Super Admin");
  });

  test("Master sólo puede solicitar reactivación de un broker propio inactivo", async () => {
    const request = await createReactivationRequest(
      masterA,
      brokerInactive.id,
      "active",
      "Expediente subsanado",
      "Solicito reincorporación",
    );

    expect(request.status).toBe("pending");
    expect(request.requestedStatus).toBe("active");
    expect(request.requesterId).toBe(masterA.id);
    expect(request.targetUserId).toBe(brokerInactive.id);

    const target = await storage.getUser(brokerInactive.id);
    expect(target?.status).toBe("inactive");
  });

  test("solicitar baja por el flujo de requests es rechazado porque la baja es directa", async () => {
    await expect(
      createReactivationRequest(
        masterA,
        brokerActive.id,
        "inactive",
        "Intento de baja por request",
      ),
    ).rejects.toThrow("La baja de un broker de tu red se ejecuta directamente");
  });

  test("Master no puede modificar ni solicitar sobre brokers de otra red", async () => {
    await expect(
      masterDirectStatusChange(masterA, brokerExternal.id, "inactive", "Baja externa"),
    ).rejects.toThrow("fuera de tu red");

    await expect(
      createReactivationRequest(masterA, brokerExternal.id, "active", "Reactivar externo"),
    ).rejects.toThrow("propia red");
  });

  test("no permite solicitudes de reactivación duplicadas", async () => {
    await createReactivationRequest(
      masterA,
      brokerInactive.id,
      "active",
      "Primera solicitud",
    );

    await expect(
      createReactivationRequest(
        masterA,
        brokerInactive.id,
        "active",
        "Segunda solicitud",
      ),
    ).rejects.toThrow("Ya existe una solicitud pendiente de reactivación");
  });

  test("sólo Super Admin puede listar y aprobar reactivaciones", async () => {
    const request = await createReactivationRequest(
      masterA,
      brokerInactive.id,
      "active",
      "Reincorporación autorizable",
    );

    await expect(listRequests(regularAdmin)).rejects.toThrow(
      "Se requieren privilegios de Super Administrador",
    );
    await expect(
      approveRequest(regularAdmin, request.id, "Intento de admin"),
    ).rejects.toThrow("Se requieren privilegios de Super Administrador");

    const result = await approveRequest(
      superAdmin,
      request.id,
      "Aprobado por Super Admin",
    );

    expect(result.request.status).toBe("approved");
    expect(result.request.reviewedBy).toBe(superAdmin.id);
    expect(result.user.status).toBe("active");
    expect(result.user.isActive).toBe(true);
    expect(result.user.statusChangedBy).toBe(superAdmin.id);
  });

  test("Super Admin puede rechazar la reactivación sin cambiar el estado del broker", async () => {
    const request = await createReactivationRequest(
      masterA,
      brokerInactive.id,
      "active",
      "Solicitud a revisar",
    );

    const rejected = await rejectRequest(
      superAdmin,
      request.id,
      "Aún falta documentación",
    );

    expect(rejected.status).toBe("rejected");
    const target = await storage.getUser(brokerInactive.id);
    expect(target?.status).toBe("inactive");
    expect(target?.isActive).toBe(false);
  });

  test("rechazo exige motivo y una solicitud resuelta no puede resolverse otra vez", async () => {
    const request = await createReactivationRequest(
      masterA,
      brokerInactive.id,
      "active",
      "Solicitud final",
    );

    await expect(rejectRequest(superAdmin, request.id, "")).rejects.toThrow();

    await approveRequest(superAdmin, request.id, "Aprobada");
    await expect(
      approveRequest(superAdmin, request.id, "Segundo intento"),
    ).rejects.toThrow("ya fue resuelta");
  });
});
