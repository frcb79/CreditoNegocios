import { randomUUID } from "node:crypto";
import { commercialTermsService } from "../../server/commercialTermsService";
import { storage } from "../../server/storage";

describe("COM-25/26 commercial acceptance: current version and durable publication", () => {
  beforeEach(() => commercialTermsService.resetForTesting());

  const user = async (role: "broker" | "master_broker", masterBrokerId?: string) =>
    storage.createUser({
      email: `commercial-${randomUUID()}@example.test`,
      firstName: "QA", lastName: "Commercial",
      role, masterBrokerId, status: "active", isActive: true,
    });

  const publishGlobal = (days: number) => commercialTermsService.publishGlobalCommercialTermsUpdate({
    previousConditions: { activeRelationshipValidityDays: 90 },
    newConditions: { activeRelationshipValidityDays: days },
    modifiedParams: ["activeRelationshipValidityDays"],
    updatedBy: "qa",
  });

  it("rejects replay of a historical global version after a newer version is published", async () => {
    const broker = await user("broker");
    await publishGlobal(100);
    await commercialTermsService.acceptCommercialTerms({userId: broker.id, version: "1.1"});
    await publishGlobal(110);
    await expect(commercialTermsService.acceptCommercialTerms({
      userId: broker.id, version: "1.1"
    })).rejects.toThrow(/ya no está vigente/);
    const pending = await commercialTermsService.getPendingCommercialTermsForUser(broker.id);
    expect(pending.hasPending).toBe(true);
  });

  it("rejects replay of a previous network rate version after a new one is issued", async () => {
    const master = await user("master_broker");
    const broker = await user("broker",master.id);
    await commercialTermsService.publishNetworkRatesUpdate(master.id, {
      previousRates: {}, newRates: { apertura: 2.0 },
    });
    await commercialTermsService.acceptCommercialTerms({
      userId: broker.id, type: "network", version: "net-1.0", masterBrokerId: master.id,
    });
    await commercialTermsService.publishNetworkRatesUpdate(master.id, {
      previousRates: { apertura: 2.0 }, newRates: { apertura: 2.5 },
    });
    await expect(commercialTermsService.acceptCommercialTerms({
      userId: broker.id, type: "network", version: "net-1.0", masterBrokerId: master.id,
    })).rejects.toThrow(/no corresponde a la versión vigente/);
  });

  it("does not activate a version if persistence failed", async () => {
    const failStorage = Object.create(storage);
    failStorage.createLegalDocumentVersion = async () => { throw new Error("injected write failure"); };
    await expect(commercialTermsService.publishGlobalCommercialTermsUpdate({
      previousConditions: {}, newConditions: { activeRelationshipValidityDays: 101 },
      modifiedParams: ["activeRelationshipValidityDays"],
      targetStorage: failStorage,
    })).rejects.toThrow(/injected write failure/);
    expect(commercialTermsService.getCurrentGlobalVersion()).toBe("1.0");
  });

  it("rejects an alternate PostgreSQL winner for the same global version", async () => {
    const simulatedConcurrentStorage = Object.create(storage);
    simulatedConcurrentStorage.createLegalDocumentVersion = async (value: any) =>
      ({ ...value, contentSha256: "other-instance-hash" });
    await expect(commercialTermsService.publishGlobalCommercialTermsUpdate({
      previousConditions: {},
      newConditions: { activeRelationshipValidityDays: 103 },
      modifiedParams: ["activeRelationshipValidityDays"],
      targetStorage: simulatedConcurrentStorage,
    })).rejects.toThrow("COMMERCIAL_TERMS_VERSION_CONFLICT");
    expect(commercialTermsService.getCurrentGlobalVersion()).toBe("1.0");
  });

  it("rejects a conflicting persisted network document", async () => {
    const master = await user("master_broker");
    const simulatedConcurrentStorage = Object.create(storage);
    simulatedConcurrentStorage.createLegalDocumentVersion = async (value: any) =>
      ({ ...value, contentSha256: "other-instance-hash" });
    await expect(commercialTermsService.publishNetworkRatesUpdate(master.id, {
      previousRates: {}, newRates: { apertura: 2 },
      targetStorage: simulatedConcurrentStorage,
    })).rejects.toThrow("COMMERCIAL_NETWORK_VERSION_CONFLICT");
  });

  it("fails closed if version ledger cannot be read", async () => {
    const failStorage = Object.create(storage);
    failStorage.getLegalDocumentVersions = async () => { throw new Error("PG unavailable"); };
    const broker = await user("broker");
    await expect(commercialTermsService.acceptCommercialTerms({
      userId: broker.id,version: "1.0"
    }, failStorage)).rejects.toThrow("COMMERCIAL_TERMS_STORAGE_UNAVAILABLE");
  });
});
