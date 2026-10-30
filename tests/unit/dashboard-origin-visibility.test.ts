import { canViewSubmissionByOrigin, canViewCreditByOrigin, canEditCreditByOrigin, summarizeCommercialAccountActivity } from "../../server/dashboardVisibility";

describe("Dashboard: ownership survives Broker transfer", () => {
  const former = { id: "master-original", role: "master_broker" };
  const current = { id: "master-new", role: "master_broker" };
  const broker = { id: "broker-one", role: "broker" };
  const historic = { brokerId: "broker-one", originMasterBrokerId: "master-original" };

  it("original Master can see historically originated submissions and credits", () => {
    expect(canViewSubmissionByOrigin(former, historic)).toBe(true);
    expect(canViewCreditByOrigin(former, historic)).toBe(true);
  });
  it("new Master cannot see old cases just because the Broker moved networks", () => {
    expect(canViewSubmissionByOrigin(current, historic)).toBe(false);
    expect(canViewCreditByOrigin(current, historic)).toBe(false);
  });
  it("Broker can still see own cases; foreign Broker and anonymous user cannot", () => {
    expect(canViewSubmissionByOrigin(broker, historic)).toBe(true);
    expect(canViewCreditByOrigin({ id: "other", role: "broker" }, historic)).toBe(false);
    expect(canViewCreditByOrigin(null, historic)).toBe(false);
  });
  it("missing historic Master attribution fails closed for network access", () => {
    const legacy = { brokerId: "broker-one", originMasterBrokerId: null };
    expect(canViewSubmissionByOrigin(former, legacy)).toBe(false);
    expect(canViewCreditByOrigin(current, legacy)).toBe(false);
  });
  it("Super Admin / Admin retain global dashboard access", () => {
    expect(canViewCreditByOrigin({ id: "admin", role: "admin" }, historic)).toBe(true);
    expect(canViewSubmissionByOrigin({ id: "super", role: "super_admin" }, historic)).toBe(true);
  });
  it("Master own originated operation remains visible", () => {
    expect(canViewCreditByOrigin(former, { brokerId: "master-original", originMasterBrokerId: null })).toBe(true);
  });
});

describe("SEC-P0-02: Credit read and write are separate capabilities", () => {
  const record = { brokerId: "broker-one", originMasterBrokerId: "master-original" };

  it("origin Master can read but cannot edit a Broker-originated credit", () => {
    expect(canViewCreditByOrigin({ id: "master-original", role: "master_broker" }, record)).toBe(true);
    expect(canEditCreditByOrigin({ id: "master-original", role: "master_broker" }, record)).toBe(false);
  });

  it("new Master inherits neither credit read nor edit after transfer", () => {
    expect(canViewCreditByOrigin({ id: "master-new", role: "master_broker" }, record)).toBe(false);
    expect(canEditCreditByOrigin({ id: "master-new", role: "master_broker" }, record)).toBe(false);
  });

  it("originating Broker keeps read and edit; unrelated Brokers are denied", () => {
    expect(canEditCreditByOrigin({ id: "broker-one", role: "broker" }, record)).toBe(true);
    expect(canEditCreditByOrigin({ id: "broker-other", role: "broker" }, record)).toBe(false);
  });

  it("Master may edit only its own direct operation", () => {
    expect(canEditCreditByOrigin({ id: "master-original", role: "master_broker" },
      { brokerId: "master-original", originMasterBrokerId: null })).toBe(true);
  });

  it("shared tenants and missing historical attribution never grant edits", () => {
    const legacy = { brokerId: "broker-one", originMasterBrokerId: null };
    expect(canEditCreditByOrigin({ id: "master-original", role: "master_broker" }, legacy)).toBe(false);
    expect(canViewCreditByOrigin({ id: "master-original", role: "master_broker" }, legacy)).toBe(false);
    expect(canEditCreditByOrigin(null, record)).toBe(false);
  });

  it("platform admins retain their existing read and edit permissions", () => {
    for (const role of ["admin", "super_admin"]) {
      expect(canViewCreditByOrigin({ id: role, role }, record)).toBe(true);
      expect(canEditCreditByOrigin({ id: role, role }, record)).toBe(true);
    }
  });
});


describe("Dashboard Super Admin: registered and pending commercial accounts", () => {
  const accounts = [
    { role: "broker", password: "$2b$12$registered", isActive: true, status: "active" },
    { role: "master_broker", password: "$2b$12$registered", isActive: true, status: "active" },
    { role: "broker", password: null, isActive: true, status: "active" },
    { role: "master_broker", password: null, isActive: true, status: "active" },
    { role: "broker", password: "$2b$12$suspended", isActive: true, status: "suspended" },
    { role: "broker", password: "$2b$12$inactive", isActive: false, status: "inactive" },
    { role: "admin", password: "$2b$12$admin", isActive: true, status: "active" },
    { role: "system", password: "n/a", isActive: false, status: "inactive" },
  ];

  it("counts only registered, enabled Brokers and Master Brokers as active", () => {
    expect(summarizeCommercialAccountActivity(accounts)).toEqual({
      activeBrokers: 1,
      activeMasterBrokers: 1,
      pendingInvitations: 2,
    });
  });

  it("does not treat invited accounts as brokers with access, including in Master networks", () => {
    expect(summarizeCommercialAccountActivity(accounts.filter(u => u.role === "broker"))).toEqual({
      activeBrokers: 1,
      activeMasterBrokers: 0,
      pendingInvitations: 1,
    });
  });

  it("never counts suspended, disabled or administrative accounts in commercial totals", () => {
    const onlyInactive = accounts.filter(u => u.status !== "active");
    expect(summarizeCommercialAccountActivity(onlyInactive)).toEqual({
      activeBrokers: 0,
      activeMasterBrokers: 0,
      pendingInvitations: 0,
    });
  });

  it("handles the production distribution without inflating active Brokers", () => {
    const prodLike = [
      ...Array.from({length: 40}, () => ({role:"broker", password:null, isActive:true, status:"active"})),
      ...Array.from({length: 3}, () => ({role:"master_broker", password:null, isActive:true, status:"active"})),
      {role:"broker", password:"hashed", isActive:true, status:"active"},
      {role:"broker", password:"hashed", isActive:false, status:"inactive"},
      {role:"master_broker", password:"hashed", isActive:true, status:"active"},
    ];
    expect(summarizeCommercialAccountActivity(prodLike)).toEqual({
      activeBrokers: 1,
      activeMasterBrokers: 1,
      pendingInvitations: 43,
    });
  });
});
