import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const file = (path: string) => readFileSync(resolve(process.cwd(),path),"utf8");

describe("COM-CTA-002: incoming prospects and reusable attribution links", () => {
  it("creates stable, opaque URLs bound to broker, and never takes an owner from request body", () => {
    const api = file("server/campaignAcquisitionRoutes.ts");
    expect(api).toContain('randomBytes(24).toString("base64url")');
    expect(api).toContain("owner_user_id");
    expect(api).toContain("user!.id");
    expect(api).toContain("ON CONFLICT DO NOTHING");
    expect(api).toContain("templateId");
    expect(api).toContain("status='published'");
    expect(api).not.toContain("req.body.ownerUserId");
    expect(api).not.toContain("req.query.brokerId");
    expect(api).not.toContain("req.query.redirect");
  });

  it("restricts inbox and link creation to originator and Super Admin analytics", () => {
    const api = file("server/campaignAcquisitionRoutes.ts");
    expect(api).toContain('app.get("/api/commercial-resources/received", isAuthenticated');
    expect(api).toContain("if (!allowedOwner(user)) return noAccess(res)");
    expect(api).toContain("WHERE m.owner_user_id=$1");
    expect(api).toContain("user!.id");
    expect(api).toContain('user.role !== "super_admin"');
    expect(api).toContain("client.brokerId !== user!.id");
    expect(api).toContain("lead.rows[0].tenant_id !== (client.tenantId ?? null)");
  });

  it("separates marketing intake from client and opportunity claims", () => {
    const sql = file("migrations/0011_commercial_campaign_links_and_leads.sql");
    const api = file("server/campaignAcquisitionRoutes.ts");
    expect(sql).toContain("commercial_marketing_leads");
    expect(sql).toContain("commercial_campaign_links");
    expect(sql).toContain("commercial_campaign_owner_template_unique");
    expect(sql).toContain("linked_client_id");
    expect(api).toContain("INSERT INTO public.commercial_marketing_leads");
    expect(api).toContain("privacyVersion");
    expect(api).toContain("acknowledgePrivacy: z.literal(true)");
    expect(api).toContain('getPublishedLegalDocument("aviso")');
    expect(api).not.toContain("INSERT INTO public.clients");
    expect(api).not.toContain("INSERT INTO public.commercial_opportunities");
    expect(api).not.toContain("req.body.tenantId");
  });

  it("makes public landing accessible without login and requires consent", () => {
    const app = file("client/src/App.tsx");
    const page = file("client/src/pages/PublicCampaignLanding.tsx");
    expect(app).toContain('path="/c/:token" component={PublicCampaignLanding}');
    expect(app.indexOf('path="/c/:token"')).toBeLessThan(app.indexOf("isLoading || !isAuthenticated ?"));
    expect(page).toContain('data-testid="landing-privacy"');
    expect(page).toContain("acknowledgePrivacy: true");
    expect(page).toContain('href="/legal/aviso"');
    expect(page).toContain('data-testid="public-campaign-success"');
  });

  it("lets a broker reuse one personal link with predefined UTM parameters", () => {
    const panel = file("client/src/components/Commercial/CampaignLinkPanel.tsx");
    expect(panel).toContain("makeLink()");
    expect(panel).toContain('url.searchParams.set("utm_source", "redes_sociales")');
    expect(panel).toContain('url.searchParams.set("utm_medium", "social")');
    expect(panel).toContain('url.searchParams.set("utm_campaign", "productos_financieros")');
    expect(panel).toContain('url.searchParams.set("utm_content", "inicio")');
    expect(panel).not.toContain("makeLink(selectedTemplateId)");
    expect(panel).toContain("window.location.origin");
    expect(panel).toContain('data-testid="copy-personal-link"');
    expect(panel).not.toContain('data-testid="copy-campaign-link"');
    expect(panel).toContain('data-testid="campaign-clicks"');
    expect(panel).toContain('data-testid="campaign-submissions"');
    const library = file("client/src/pages/CommercialResources.tsx");
    expect(library).toContain("canSuggest && campaignLink?.templateId !== selection.id");
    expect(library).toContain("El enlace de esta campaña todavía no está disponible");
  });

  it("shows received prospects in Clientes and reuses the existing duplicate-checked form", () => {
    const clients = file("client/src/pages/Clients.tsx");
    const quick = file("client/src/components/Clients/QuickClientForm.tsx");
    const list = file("client/src/components/Clients/ReceivedProspects.tsx");
    expect(clients).toContain('data-testid="tab-received-prospects"');
    expect(clients).toContain("<ReceivedProspects");
    expect(clients).toContain("initialValues={incomingLead ?");
    expect(clients).toContain("linkReviewedClient(savedClient.id)");
    expect(quick).toContain('"/api/clients/check-duplicates"');
    expect(quick).toContain("initialValues?: Partial<QuickFormFields>");
    expect(list).toContain("Todavía no son Clientes ni oportunidades protegidas.");
    expect(list).toContain("onReview(lead)");
  });
  it("rejects suspended owners, cross-tenant client linking and concurrent duplicate submissions", () => {
    const api = file("server/campaignAcquisitionRoutes.ts");
    expect(api).toContain('user.status !== "active"');
    expect(api).toContain("u.status = 'active'");
    expect(api).toContain("tm.is_active = TRUE");
    expect(api).toContain("tn.is_active IS DISTINCT FROM FALSE");
    expect(api).toContain("lead.rows[0].tenant_id !== (client.tenantId ?? null)");
    expect(api).toContain("pg_advisory_xact_lock(hashtext($1))");
    expect(api).toContain('await client.query("BEGIN")');
    expect(api).toContain('await client.query("COMMIT")');
    expect(api).toContain('await client.query("ROLLBACK")');
    expect(api).toContain("RETURNING linked_client_id");
    expect(api).toContain("updated.rowCount !== 1");
  });

});
