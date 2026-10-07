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
