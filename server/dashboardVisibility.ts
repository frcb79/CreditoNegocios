/**
 * Read authorization for financial dashboards and submission APIs.
 * Historical Master attribution is immutable; changing a Broker's current
 * Master/tenant membership never transfers access to prior operations.
 */
type Principal = { id?: string | null; role?: string | null } | null | undefined;
type OriginatedRecord = {
  brokerId?: string | null;
  originMasterBrokerId?: string | null;
} | null | undefined;

function canReadOriginatedRecord(user: Principal, record: OriginatedRecord): boolean {
  if (!user?.id || !record) return false;
  if (user.role === "super_admin" || user.role === "admin") return true;
  if (user.role === "broker") return record.brokerId === user.id;
  if (user.role === "master_broker") {
    return record.brokerId === user.id ||
      (record.originMasterBrokerId != null && record.originMasterBrokerId === user.id);
  }
  return false;
}

export const canViewSubmissionByOrigin = canReadOriginatedRecord;
export const canViewCreditByOrigin = canReadOriginatedRecord;

/**
 * Editing an existing credit is an owner action, not a network oversight
 * action. Platform administration retains its existing explicit authority.
 */
export function canEditCreditByOrigin(user: Principal, record: OriginatedRecord): boolean {
  if (!user?.id || !record) return false;
  if (user.role === "super_admin" || user.role === "admin") return true;
  if (user.role !== "broker" && user.role !== "master_broker") return false;
  return Boolean(record.brokerId) && record.brokerId === user.id;
}

/**
 * Commercial account KPIs use the same "registered" signal as /api/broker-network:
 * a local invitation without a configured password is not a registered user.
 * An invited account may be enabled for eventual activation; that is NOT activity.
 * Never return password data to the dashboard client, only aggregate counts.
 */
type CommercialAccount = {
  role?: string | null;
  password?: string | null;
  isActive?: boolean | null;
  status?: string | null;
};

export function summarizeCommercialAccountActivity(users: CommercialAccount[]) {
  const accounts = users.filter(u => u.role === "broker" || u.role === "master_broker");
  const operational = (u: CommercialAccount) =>
    u.isActive === true && u.status !== "inactive" && u.status !== "suspended";
  const registered = (u: CommercialAccount) =>
    typeof u.password === "string" && u.password.trim().length > 0;
  return {
    activeBrokers: accounts.filter(u => u.role === "broker" && operational(u) && registered(u)).length,
    activeMasterBrokers: accounts.filter(u => u.role === "master_broker" && operational(u) && registered(u)).length,
    pendingInvitations: accounts.filter(u => operational(u) && !registered(u)).length,
  };
}
