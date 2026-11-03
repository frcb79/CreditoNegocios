import type { Client } from "../shared/schema";

// A self-originated, saved intake is verifiable commercial activity. Delegated
// or imported records must not grant a Broker a relationship automatically.
export function initialClientRelationship(
  client: Pick<Client, "id" | "tenantId" | "brokerId" | "createdBy">,
  validityDays: number | undefined,
  activityType: "client_registered" | "leasing_quote_requested",
  now = new Date(),
) {
  if (!client.brokerId || client.createdBy !== client.brokerId ||
      !Number.isInteger(validityDays) || validityDays! < 1 || validityDays! > 730) {
    return null;
  }
  return {
    clientId: client.id,
    brokerId: client.brokerId,
    tenantId: client.tenantId,
    status: "active",
    lastValidActivityAt: now,
    lastActivityType: activityType,
    lastActivitySummary: activityType === "leasing_quote_requested"
      ? "Solicitud de cotización de arrendamiento registrada"
      : "Cliente registrado directamente por su asesor",
    activeUntil: new Date(now.getTime() + validityDays! * 86400000),
    createdAt: now,
    updatedAt: now,
  };
}
