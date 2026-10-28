export const INVITATION_FOLLOWUP_DAYS = 15;
export type InvitationFollowupFilter = "all" | "overdue" | "paused";

export type InvitationFollowupContact = {
  firstName: string | null;
  lastName: string | null;
  email: string;
  phone: string;
  masterEmail: string | null;
  invitedAt: string;
  paused: boolean;
};

export function invitationAgeDays(value: string, now = Date.now()): number {
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, Math.floor((now - date) / 86400000)) : 0;
}

export function matchesInvitationFollowup(
  contact: InvitationFollowupContact,
  filter: InvitationFollowupFilter,
  search = "",
  now = Date.now(),
): boolean {
  const normalize = (value: string) => value.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es-MX");
  const query = normalize(search).trim();
  const matchesSearch = !query || [contact.firstName, contact.lastName,
    contact.email, contact.phone, contact.masterEmail]
    .some(value => normalize(value || "").includes(query));
  // Paused contacts remain visible in all/overdue so follow-up never loses them.
  // Their suppression state is separate from the age of their invitation.
  return matchesSearch && (filter === "all" ||
    (filter === "overdue" && invitationAgeDays(contact.invitedAt, now) >= INVITATION_FOLLOWUP_DAYS) ||
    (filter === "paused" && contact.paused));
}
