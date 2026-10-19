import { buildAccountInvitationEmail } from "../../server/emailService";

describe("SEC-INVITES: approved commercial invitation template", () => {
  const url = "https://creditonegocios-staging.up.railway.app";
  const send = (role: "broker" | "master_broker", message?: string) =>
    buildAccountInvitationEmail("broker@example.test", "test-token", role, "Ana Prueba", message, url);

  it("uses approved high-conversion copy and a one-time staging activation link", () => {
    const invitation = send("broker");
    expect(invitation.subject).toBe("Más oportunidades para tus clientes. Más negocios para ti. 🚀");
    expect(invitation.html).toContain("Tus relaciones tienen valor.");
    expect(invitation.html).toContain("Nosotros queremos ayudarte a convertirlas en negocios.");
    expect(invitation.html).toContain("decenas de financieras");
    for (const product of ["Crédito Simple", "Crédito Revolvente", "Factoraje", "Arrendamiento", "Crédito Hipotecario", "Anticipo de Ventas"]) {
      expect(invitation.text).toContain(product);
    }
    expect(invitation.html).toContain("Todo tu negocio organizado en un solo lugar");
    expect(invitation.html).toContain("Convierte oportunidades en comisiones");
    expect(invitation.html).toContain("Amplía tu red. Multiplica tus oportunidades.");
    expect(invitation.html).toContain("Invita a más personas");
    expect(invitation.text).toContain("https://creditonegocios-staging.up.railway.app/reset-password?token=test-token");
    expect(invitation.html).toContain("24 horas");
    expect(invitation.html).toContain("ACTIVAR MI CUENTA");
    expect(invitation.html).not.toContain("Crédito Negocios conecta Brokers");
    expect(invitation.html).not.toContain("UN MENSAJE PERSONAL PARA TI");
  });

  it("positions safely escaped personalized message immediately after greeting", () => {
    const invitation = send("broker", "Te invito, Ana. <script>alert('x')</script>\nNos vemos pronto.");
    const greeting = invitation.html.indexOf("Hola, <strong>Ana Prueba</strong>");
    const personal = invitation.html.indexOf("UN MENSAJE PERSONAL PARA TI");
    const introduction = invitation.html.indexOf("Las mejores oportunidades");
    expect(greeting).toBeGreaterThan(-1);
    expect(personal).toBeGreaterThan(greeting);
    expect(personal).toBeLessThan(introduction);
    expect(invitation.html).toContain("&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;");
    expect(invitation.html).not.toContain("<script>");
    expect(invitation.text).toContain("Te invito, Ana. <script>");
  });

  it("sends identical commercial narrative to Broker and Master without role labels", () => {
    const broker = send("broker");
    const master = send("master_broker");
    expect(broker).toEqual(master);
    expect(master.html).not.toContain("Si eres Master Broker");
  });

  it("includes the complete 12-month courtesy and a safely escaped code without auto-billing", () => {
    const rendered = buildAccountInvitationEmail("broker@example.test", "test-token", "broker",
      "Ana", undefined, url, { code: "PROMO12", name: "<Regalo>", durationMonths: 12 });
    expect(rendered.html).toContain("12 meses sin costo");
    expect(rendered.html).toContain("PROMO12");
    expect(rendered.html).toContain("&lt;Regalo&gt;");
    expect(rendered.html).not.toContain("<Regalo>");
    expect(rendered.text).toContain("TU CORTESÍA DE LANZAMIENTO");
    expect(rendered.text).toContain("No se hará ningún cobro automático");
  });

  it("rejects insecure links and keeps the token URL encoded", () => {
    expect(() => buildAccountInvitationEmail("a@example.test", "secret", "broker", "A B", "", "http://example.test")).toThrow(/URL segura/);
    const rendered = buildAccountInvitationEmail("a@example.test", "abc&def", "broker", "A B", "", url);
    expect(rendered.text).toContain("?token=abc%26def");
    expect(rendered.html).toContain("?token=abc%26def");
  });
});
