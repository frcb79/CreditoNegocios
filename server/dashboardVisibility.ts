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
