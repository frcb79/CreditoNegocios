import { invitationAgeDays, matchesInvitationFollowup } from "../../shared/brokerInvitationFollowup";

describe("Pending invitation follow-up", () => {
  const now = Date.parse("2026-11-12T15:00:00Z");
  const contact = {
    firstName: "María", lastName: "López", email: "maria@example.test",
    phone: "55 1234 5678", masterEmail: "master@example.test",
    invitedAt: "2026-10-28T15:00:00Z", paused: false,
  };
  it("moves to the 15-day group at exactly 15 elapsed days", () => {
    expect(matchesInvitationFollowup(contact, "overdue", "", now - 1)).toBe(false);
    expect(matchesInvitationFollowup(contact, "overdue", "", now)).toBe(true);
    expect(matchesInvitationFollowup(contact, "overdue", "", now + 86400000)).toBe(true);
  });
  it("keeps paused contacts visible without losing their suppression state", () => {
    const paused = { ...contact, paused: true };
    expect(matchesInvitationFollowup(paused, "all", "", now)).toBe(true);
    expect(matchesInvitationFollowup(paused, "overdue", "", now)).toBe(true);
    expect(matchesInvitationFollowup(paused, "paused", "", now)).toBe(true);
    expect(matchesInvitationFollowup(contact, "paused", "", now)).toBe(false);
  });
  it("searches name, email, phone and assigned Master within the selected group", () => {
    for (const query of ["maria", "LÓPEZ", "maria@example", "1234", "master@example"]) {
      expect(matchesInvitationFollowup(contact, "all", query, now)).toBe(true);
    }
    expect(matchesInvitationFollowup(contact, "overdue", "otra persona", now)).toBe(false);
    expect(matchesInvitationFollowup(contact, "overdue", "maria", now - 1)).toBe(false);
  });
  it("does not classify missing or future invitation dates as overdue", () => {
    expect(invitationAgeDays("invalid", now)).toBe(0);
    expect(invitationAgeDays("2027-01-01", now)).toBe(0);
    expect(matchesInvitationFollowup({ ...contact, invitedAt: "" }, "overdue", "", now)).toBe(false);
  });
});
