import { canViewCreditByOrigin } from "./dashboardVisibility";

type Principal = { id?: string | null; role?: string | null } | null | undefined;
type DocumentOrigin = {
  brokerId?: string | null;
  uploadedBy?: string | null;
  clientId?: string | null;
  creditId?: string | null;
} | null | undefined;
type CreditOrigin = {
  brokerId?: string | null;
  originMasterBrokerId?: string | null;
  clientId?: string | null;
  id?: string | null;
} | null | undefined;

/**
 * SEC-P0-03. Credit-linked files require authorized access to the immutable
 * credit origin, not the Broker's present parent Master or tenant.
 * Files without creditId are visible only to their own uploader/originator.
 */
export function canReadDocumentByOrigin(
  user: Principal,
  document: DocumentOrigin,
  credit?: CreditOrigin
): boolean {
  if (!user?.id || !document) return false;
  if (user.role === "admin" || user.role === "super_admin") return true;
  if (user.role !== "broker" && user.role !== "master_broker") return false;

  if (document.creditId) {
    if (!credit || document.creditId !== credit.id) return false;
    if (document.clientId && credit.clientId !== document.clientId) return false;
    return canViewCreditByOrigin(user, credit);
  }

  return document.brokerId === user.id || document.uploadedBy === user.id;
}
