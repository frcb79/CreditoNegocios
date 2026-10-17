import { MemStorage } from "../../server/storage";

describe("credit origination network snapshot", () => {
  it("keeps the original Master Broker after a broker moves to another network", async () => {
    const storage = new MemStorage();

    const masterA = await storage.createUser({
      email: "master-a@network.test",
      firstName: "Master",
      lastName: "A",
      role: "master_broker",
      isActive: true,
    } as any);

    const masterB = await storage.createUser({
      email: "master-b@network.test",
      firstName: "Master",
      lastName: "B",
      role: "master_broker",
      isActive: true,
    } as any);

    const broker = await storage.createUser({
      email: "broker@network.test",
      firstName: "Broker",
      lastName: "Network",
      role: "broker",
      masterBrokerId: masterA.id,
      isActive: true,
    } as any);

    const originalCredit = await storage.createCredit({
      clientId: "client-origin-a",
      brokerId: broker.id,
      amount: "1000000",
      status: "draft",
    } as any);

    expect(originalCredit.originMasterBrokerId).toBe(masterA.id);

    await storage.updateUser(broker.id, { masterBrokerId: masterB.id } as any);

    const preservedCredit = await storage.getCredit(originalCredit.id);
    expect(preservedCredit?.originMasterBrokerId).toBe(masterA.id);

    const newCredit = await storage.createCredit({
      clientId: "client-origin-b",
      brokerId: broker.id,
      amount: "500000",
      status: "draft",
    } as any);

    expect(newCredit.originMasterBrokerId).toBe(masterB.id);
  });

  it("keeps submission and derived credit with the Master that owned the opportunity before a broker move", async () => {
    const storage = new MemStorage();

    const masterA = await storage.createUser({
      email: "submission-master-a@network.test",
      firstName: "Submission",
      lastName: "Master A",
      role: "master_broker",
      isActive: true,
      status: "active",
    } as any);

    const masterB = await storage.createUser({
      email: "submission-master-b@network.test",
      firstName: "Submission",
      lastName: "Master B",
      role: "master_broker",
      isActive: true,
      status: "active",
    } as any);

    const broker = await storage.createUser({
      email: "submission-broker@network.test",
      firstName: "Submission",
      lastName: "Broker",
      role: "broker",
      masterBrokerId: masterA.id,
      isActive: true,
      status: "active",
    } as any);

    const submission = await storage.createCreditSubmissionRequest({
      clientId: "client-submission-a",
      brokerId: broker.id,
      requestedAmount: "900000",
      status: "pending_admin",
    } as any);

    expect(submission.originMasterBrokerId).toBe(masterA.id);

    // Broker changes network while the request is still in flight.
    await storage.updateUser(broker.id, { masterBrokerId: masterB.id } as any);

    const derivedCredit = await storage.createCredit({
      clientId: submission.clientId,
      brokerId: broker.id,
      linkedSubmissionId: submission.id,
      amount: submission.requestedAmount,
      status: "approved",
    } as any);

    // The operation remains economically/historically under Master A.
    expect(derivedCredit.originMasterBrokerId).toBe(masterA.id);

    // New business after the movement belongs to Master B.
    const newSubmission = await storage.createCreditSubmissionRequest({
      clientId: "client-submission-b",
      brokerId: broker.id,
      requestedAmount: "400000",
      status: "pending_admin",
    } as any);
    expect(newSubmission.originMasterBrokerId).toBe(masterB.id);

    const newCredit = await storage.createCredit({
      clientId: newSubmission.clientId,
      brokerId: broker.id,
      linkedSubmissionId: newSubmission.id,
      amount: newSubmission.requestedAmount,
      status: "approved",
    } as any);
    expect(newCredit.originMasterBrokerId).toBe(masterB.id);
  });

  it("preserves direct-platform submission lineage when the broker joins a Master before credit creation", async () => {
    const storage = new MemStorage();

    const master = await storage.createUser({
      email: "later-master@network.test",
      firstName: "Later",
      lastName: "Master",
      role: "master_broker",
      isActive: true,
      status: "active",
    } as any);

    const broker = await storage.createUser({
      email: "direct-before-submission@network.test",
      firstName: "Direct",
      lastName: "Before Move",
      role: "broker",
      masterBrokerId: null,
      isActive: true,
      status: "active",
    } as any);

    const directSubmission = await storage.createCreditSubmissionRequest({
      clientId: "client-direct-submission",
      brokerId: broker.id,
      requestedAmount: "600000",
      status: "pending_admin",
    } as any);
    expect(directSubmission.originMasterBrokerId).toBeNull();

    await storage.updateUser(broker.id, { masterBrokerId: master.id } as any);

    const derivedCredit = await storage.createCredit({
      clientId: directSubmission.clientId,
      brokerId: broker.id,
      linkedSubmissionId: directSubmission.id,
      amount: directSubmission.requestedAmount,
      status: "approved",
    } as any);

    expect(derivedCredit.originMasterBrokerId).toBeNull();
  });

  it("ignores attempts to rewrite immutable credit and submission lineage", async () => {
    const storage = new MemStorage();

    const masterA = await storage.createUser({
      email: "immutable-a@network.test",
      role: "master_broker",
      isActive: true,
    } as any);
    const masterB = await storage.createUser({
      email: "immutable-b@network.test",
      role: "master_broker",
      isActive: true,
    } as any);
    const broker = await storage.createUser({
      email: "immutable-broker@network.test",
      role: "broker",
      masterBrokerId: masterA.id,
      isActive: true,
    } as any);

    const submission = await storage.createCreditSubmissionRequest({
      clientId: "client-immutable",
      brokerId: broker.id,
      requestedAmount: "800000",
      status: "pending_admin",
    } as any);
    expect(submission.originMasterBrokerId).toBe(masterA.id);

    const submissionAfterUpdate = await storage.updateCreditSubmissionRequest(
      submission.id,
      { originMasterBrokerId: masterB.id, status: "in_progress" } as any,
    );
    expect(submissionAfterUpdate?.originMasterBrokerId).toBe(masterA.id);
    expect(submissionAfterUpdate?.status).toBe("in_progress");

    const credit = await storage.createCredit({
      clientId: submission.clientId,
      brokerId: broker.id,
      linkedSubmissionId: submission.id,
      amount: submission.requestedAmount,
      status: "approved",
    } as any);
    expect(credit.originMasterBrokerId).toBe(masterA.id);

    const creditAfterUpdate = await storage.updateCredit(
      credit.id,
      { originMasterBrokerId: masterB.id, status: "active" } as any,
    );
    expect(creditAfterUpdate?.originMasterBrokerId).toBe(masterA.id);
    expect(creditAfterUpdate?.status).toBe("active");
  });

  it("treats legacy Casa Matriz admin links as direct platform business", async () => {
    const storage = new MemStorage();

    const platformAdmin = await storage.createUser({
      email: "platform-admin@network.test",
      firstName: "Platform",
      lastName: "Admin",
      role: "super_admin",
      isActive: true,
    } as any);

    const broker = await storage.createUser({
      email: "legacy-casa-matriz@network.test",
      firstName: "Legacy",
      lastName: "Direct",
      role: "broker",
      masterBrokerId: platformAdmin.id,
      isActive: true,
    } as any);

    const credit = await storage.createCredit({
      clientId: "client-legacy-direct",
      brokerId: broker.id,
      amount: "300000",
      status: "draft",
    } as any);

    expect(credit.originMasterBrokerId).toBeNull();
  });

  it("snapshots direct brokers as null and direct Master originations as self", async () => {
    const storage = new MemStorage();

    const directBroker = await storage.createUser({
      email: "direct@network.test",
      firstName: "Direct",
      lastName: "Broker",
      role: "broker",
      masterBrokerId: null,
      isActive: true,
    } as any);

    const directCredit = await storage.createCredit({
      clientId: "client-direct",
      brokerId: directBroker.id,
      amount: "250000",
      status: "draft",
    } as any);

    expect(directCredit.originMasterBrokerId).toBeNull();

    await storage.updateUser(directBroker.id, {
      role: "master_broker",
      masterBrokerId: null,
    } as any);

    const masterCredit = await storage.createCredit({
      clientId: "client-master-direct",
      brokerId: directBroker.id,
      amount: "750000",
      status: "draft",
    } as any);

    expect(masterCredit.originMasterBrokerId).toBe(directBroker.id);
    expect(directCredit.originMasterBrokerId).toBeNull();
  });
});
