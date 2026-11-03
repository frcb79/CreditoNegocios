import { initialClientRelationship } from "../../server/initialClientRelationship";

describe("commercial scope after direct client intake", () => {
  const now = new Date("2026-11-03T18:00:00Z");
  const client = { id: "client-1", tenantId: "tenant-1", brokerId: "broker-1", createdBy: "broker-1" };

  it("records the self-originated leasing request as a time-bound active relationship", () => {
    const relationship = initialClientRelationship(client, 90, "leasing_quote_requested", now);
    expect(relationship).toMatchObject({
      clientId: "client-1", brokerId: "broker-1", status: "active",
      lastActivityType: "leasing_quote_requested", lastValidActivityAt: now,
      activeUntil: new Date("2027-02-01T18:00:00Z"),
    });
  });

  it("does not grant a relationship for a delegated intake or invalid validity window", () => {
    expect(initialClientRelationship({ ...client, createdBy: "admin-1" }, 90, "client_registered", now)).toBeNull();
    expect(initialClientRelationship(client, undefined, "client_registered", now)).toBeNull();
    expect(initialClientRelationship(client, 731, "client_registered", now)).toBeNull();
  });
});
