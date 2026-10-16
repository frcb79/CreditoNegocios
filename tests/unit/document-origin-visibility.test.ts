import { canReadDocumentByOrigin } from "../../server/documentVisibility";

describe("SEC-P0-03: historic credit and document confidentiality", () => {
  const doc = { creditId: "credit-1", clientId: "client-1", brokerId: "broker-A" };
  const credit = { id: "credit-1", clientId: "client-1",
    brokerId: "broker-A", originMasterBrokerId: "master-old" };

  it("historic Master can see files from its original credited operations", () => {
    expect(canReadDocumentByOrigin({ id: "master-old", role: "master_broker" }, doc, credit)).toBe(true);
  });

  it("new Master cannot inherit prior operation documents", () => {
    expect(canReadDocumentByOrigin({ id: "master-new", role: "master_broker" }, doc, credit)).toBe(false);
  });

  it("own Broker can see; unrelated brokers cannot", () => {
    expect(canReadDocumentByOrigin({ id: "broker-A", role: "broker" }, doc, credit)).toBe(true);
    expect(canReadDocumentByOrigin({ id: "broker-B", role: "broker" }, doc, credit)).toBe(false);
  });

  it("forbids missing credits and cross-client credit/document mismatch", () => {
    const broker = { id: "broker-A", role: "broker" };
    expect(canReadDocumentByOrigin(broker, doc)).toBe(false);
    expect(canReadDocumentByOrigin(broker, doc, { ...credit, clientId: "client-OTHER" })).toBe(false);
    expect(canReadDocumentByOrigin(broker, doc, { ...credit, id: "credit-OTHER" })).toBe(false);
  });

  it("unlinked files cannot be claimed through current Master network", () => {
    const generic = { clientId: "client-1", brokerId: "broker-A" };
    expect(canReadDocumentByOrigin({ id: "master-new", role: "master_broker" }, generic)).toBe(false);
    expect(canReadDocumentByOrigin({ id: "master-old", role: "master_broker" }, generic)).toBe(false);
    expect(canReadDocumentByOrigin({ id: "broker-A", role: "broker" }, generic)).toBe(true);
    expect(canReadDocumentByOrigin({ id: "upload-owner", role: "broker" },
      { clientId: "client-1", uploadedBy: "upload-owner" })).toBe(true);
  });

  it("platform admins retain existing access; anonymous principals are denied", () => {
    expect(canReadDocumentByOrigin({ id: "admin", role: "admin" }, doc, credit)).toBe(true);
    expect(canReadDocumentByOrigin({ id: "super", role: "super_admin" }, doc, credit)).toBe(true);
    expect(canReadDocumentByOrigin(null, doc, credit)).toBe(false);
  });
});
