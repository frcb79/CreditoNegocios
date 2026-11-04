import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { selectReminderDay } from "../../server/brokerInvitationReminders";
import { buildBrokerInvitationReminderEmail } from "../../server/emailService";

describe("Broker invitation follow-up cadence", () => {
  const now = new Date("2026-10-28T15:00:00.000Z");
  const daysAgo = (days: number) => new Date(now.getTime() - days * 86400000);
  it("does not send a reminder early", () => {
    expect(selectReminderDay(daysAgo(2), now)).toBeNull();
  });
  it("sends exactly one cadence stage on days 3, 7, 12 and 15", () => {
    expect(selectReminderDay(daysAgo(3), now)).toBe(3);
    expect(selectReminderDay(daysAgo(6), now)).toBe(3);
    expect(selectReminderDay(daysAgo(7), now)).toBe(7);
    expect(selectReminderDay(daysAgo(11), now)).toBe(7);
    expect(selectReminderDay(daysAgo(12), now)).toBe(12);
    expect(selectReminderDay(daysAgo(14), now)).toBe(12);
    expect(selectReminderDay(daysAgo(15), now)).toBe(15);
    expect(selectReminderDay(daysAgo(26), now)).toBe(15);
  });
  it("generates a distinct message for each reminder day with a fresh activation link", () => {
    const cases = [3,7,12,15] as const;
    const seen = new Set<string>();
    for (const day of cases) {
      const output = buildBrokerInvitationReminderEmail(
        "test@example.com", "new-secure-token", day,
        "María O'Hara", "https://app.creditonegocios.com.mx");
      expect(output.subject.length).toBeGreaterThan(20);
      expect(output.html).toContain("reset-password?token=new-secure-token");
      expect(output.html).toContain("24 horas");
      expect(output.html).toContain("María O&#39;Hara");
      expect(output.text).toContain("new-secure-token");
      expect(output.subject).not.toContain("test@example.com");
      seen.add(output.subject);
    }
    expect(seen.size).toBe(4);
  });
  it("uses illustrative commissions tied to business credit and leasing only on day 15", () => {
    const final = buildBrokerInvitationReminderEmail(
      "broker@example.test", "fresh-token", 15, "Director", "https://app.creditonegocios.com.mx"
    );
    for (const amount of ["$1,000,000", "$15,000", "$20,000"]) {
      expect(final.html).toContain(amount);
      expect(final.text).toContain(amount);
    }
    expect(final.html).toContain("Crédito para un negocio");
    expect(final.html).toContain("Arrendamiento empresarial");
    expect(final.html).toContain("exclusivamente ilustrativos");
    expect(final.text).toContain("no garantizan ingresos");
    expect(final.html).not.toContain("sobretasa");
    const previous = buildBrokerInvitationReminderEmail(
      "broker@example.test", "fresh-token", 12, "Director", "https://app.creditonegocios.com.mx"
    );
    expect(previous.subject).not.toContain("Último recordatorio");
    expect(previous.text).not.toContain("No recibirás más recordatorios automáticos");
    expect(previous.html).not.toContain("$20,000");
  });
  it("rejects invalid configured frontend base URL", () => {
    expect(() => buildBrokerInvitationReminderEmail(
      "test@example.com", "abc", 3, "Test", "http://unsafe.example"
    )).toThrow(/URL segura/);
  });
});

describe("Broker reminder SQL regression", () => {
  it("stores sent/failed results without parameter type conflicts and blocks ambiguous retries", () => {
    const output = execFileSync(process.execPath, [
      "--import", "tsx", "--test", "--test-reporter=tap", "scripts/test-broker-reminder-sql.ts"
    ], {
      cwd: resolve(process.cwd()),
      timeout: 40000,
      encoding: "utf8",
      env: { ...process.env, NODE_ENV: "test", USE_MEMORY_STORAGE: "true" },
    });
    expect(output).toMatch(/# fail 0/);
    expect(output).toMatch(/# tests 1/);
  }, 45000);
});
