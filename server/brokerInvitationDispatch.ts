import { randomBytes } from "node:crypto";
import { storage } from "./storage";
import { createBrokerWithOrganization } from "./brokerNetworkTransitionService";
import { sendAccountInvitationEmail } from "./emailService";

export type BrokerInviteInput = {
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  message?: string;
  role: "broker" | "master_broker";
  masterBrokerId?: string | null;
};

export class BrokerInvitationError extends Error {
  constructor(public statusCode: number, message: string) { super(message); this.name = "BrokerInvitationError"; }
}

export function validateInvitationTransport(): void {
  const baseUrl = process.env.FRONTEND_BASE_URL;
  if (!baseUrl || !/^https:\/\/[^\s]+$/i.test(baseUrl)) {
    throw new BrokerInvitationError(503, "La URL segura de invitaciones no está configurada.");
  }
  if (!process.env.RESEND_API_KEY && process.env.NODE_ENV !== "test") {
    throw new BrokerInvitationError(503, "Servicio de correo no configurado para enviar invitaciones.");
  }
}

/**
 * Canonical invitation for BOTH the single modal and the bulk Excel importer.
 * Never auto-transfer an existing broker into a different network.
 */
export async function dispatchBrokerInvitation(
  userId: string,
  inviter: { id: string; role: string },
  data: BrokerInviteInput,
): Promise<{ status: number; body: {
  invitationSent: boolean; invitationKind: "created" | "resent"; message: string;
  broker: { id: string; email: string; role: string };
} }> {
  validateInvitationTransport();
  const normalizedEmail = data.email.toLowerCase().trim();
  const role = data.role;
  if (role === "master_broker" && inviter.role !== "super_admin") {
    throw new BrokerInvitationError(403, "Sólo Super Admin puede invitar nuevos Master Brokers.");
  }
  if (inviter.role === "admin" && data.masterBrokerId) {
    throw new BrokerInvitationError(403, "Sólo Super Admin puede afiliar Brokers a un Master.");
  }
  const targetMasterBrokerId = role === "master_broker" ? null :
    inviter.role === "master_broker" ? inviter.id : (data.masterBrokerId || null);

  if (targetMasterBrokerId) {
    const master = await storage.getUser(targetMasterBrokerId);
    if (!master || master.role !== "master_broker" || master.isActive === false ||
        master.status === "suspended" || master.status === "inactive") {
      throw new BrokerInvitationError(422, "El Master Broker de afiliación no existe o no está activo.");
    }
  }

  const previous = await storage.getUserByEmail(normalizedEmail);
  const resetToken = randomBytes(32).toString("hex");
  const resetTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
  let targetBroker: any;
  let invitationKind: "created" | "resent" = "created";

  if (previous) {
    const tenants = await storage.getTenants();
    const owned = tenants.filter(t =>
      t.type === role && (t.settings as any)?.legacyOwnerUserId === previous.id
    );
    const memberships = owned.length === 1 ? await storage.getTenantMembers(owned[0].id) : [];
    const ownsCorrectTenant = memberships.some(m =>
      m.userId === previous.id && m.role === "owner" && m.isActive !== false
    );
    if (previous.role !== role || previous.password ||
        (previous.masterBrokerId || null) !== targetMasterBrokerId ||
        !ownsCorrectTenant) {
      throw new BrokerInvitationError(409,
        "La cuenta ya existe o pertenece a otra red. Revisa su asignación antes de reenviar.");
    }
    await storage.setPasswordResetToken(previous.id, resetToken, resetTokenExpiry);
    targetBroker = previous;
    invitationKind = "resent";
  } else {
    const newBroker = await createBrokerWithOrganization({
      email: normalizedEmail,
      firstName: data.firstName || null,
      lastName: data.lastName || null,
      password: null, authMethod: "local",
      role, masterBrokerId: targetMasterBrokerId,
      resetToken, resetTokenExpiry,
      profileData: {
        phone: data.phone || "",
        invitedBy: userId,
        invitationMessage: data.message || "",
      },
      isActive: true,
    });
    targetBroker = newBroker.user;
  }

  const name = [targetBroker.firstName, targetBroker.lastName].filter(Boolean).join(" ") || undefined;
  const delivered = await sendAccountInvitationEmail(normalizedEmail, resetToken, role, name, data.message);
  if (delivered.success) {
    await storage.createNotification({
      userId, type: "broker_invitation_sent", title: "Invitación de acceso enviada",
      message: `Invitación enviada a ${normalizedEmail}`,
      data: { email: normalizedEmail, brokerId: targetBroker.id }, priority: "medium",
    }).catch(error => console.warn("[Invitation] Sender notification pending", error));
  } else {
    console.error("[Invitation] Email delivery failed; invitation pending:", delivered.error);
  }

  return {
    status: !delivered.success ? 202 : invitationKind === "created" ? 201 : 200,
    body: {
      invitationSent: delivered.success,
      invitationKind,
      message: delivered.success ? "Invitación enviada por correo correctamente." :
        "Cuenta registrada, pero no se entregó el correo. Reintenta la invitación.",
      broker: { id: targetBroker.id, email: targetBroker.email, role: targetBroker.role },
    },
  };
}
