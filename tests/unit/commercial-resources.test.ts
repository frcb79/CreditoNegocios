import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CHANNELS, COMMERCIAL_CAMPAIGNS, campaignMessage, campaignSvg, imageSize,
  safeBrandLabel, normalizedWhatsApp, templateSvg, campaignFromTemplate
} from "../../client/src/lib/commercialResources";
import {
  COMMERCIAL_DISCLAIMER, COM_RES_EXAMPLE, commercialResourceUploadSchema,
  commercialSuggestionSchema
} from "../../shared/commercialResourceDefinition";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const brand = { displayName: "Broker Ejemplo", whatsapp: "55 1234 5678", showPhone: true };

describe("Biblioteca comercial - contratos, permisos y formatos", () => {
  it("validates strictly structured templates; only admin-defined slots exist", () => {
    expect(commercialResourceUploadSchema.safeParse(COM_RES_EXAMPLE).success).toBe(true);
    expect(commercialResourceUploadSchema.safeParse({ ...COM_RES_EXAMPLE, extra: "X" }).success).toBe(false);
    expect(commercialResourceUploadSchema.safeParse({
      ...COM_RES_EXAMPLE,
      definition: { ...COM_RES_EXAMPLE.definition, someScript: "<script>" }
    }).success).toBe(false);
    expect(commercialResourceUploadSchema.safeParse({
      ...COM_RES_EXAMPLE,
      definition: { ...COM_RES_EXAMPLE.definition, colors: { background: "url(javascript:alert(1))", accent: "#FFFFFF", foreground: "#000000" } }
    }).success).toBe(false);
    expect(commercialResourceUploadSchema.safeParse({ ...COM_RES_EXAMPLE, slug: "../admin" }).success).toBe(false);
  });

  it("rejects templates that would let a broker omit required identity placeholders", () => {
    expect(commercialResourceUploadSchema.safeParse({
      ...COM_RES_EXAMPLE,
      definition: {
        ...COM_RES_EXAMPLE.definition,
        allowedIdentityFields: { displayName: true, whatsapp: false, institutionalLogo: true }
      }
    }).success).toBe(false);
    expect(commercialResourceUploadSchema.safeParse({
      ...COM_RES_EXAMPLE,
      definition: {
        ...COM_RES_EXAMPLE.definition,
        allowedIdentityFields: { displayName: true, whatsapp: true, institutionalLogo: false }
      }
    }).success).toBe(false);
  });

  it("rejects empty, extremely long or arbitrary suggestion fields", () => {
    expect(commercialSuggestionSchema.safeParse({ suggestion: "Queremos una campaña para negocios turísticos" }).success).toBe(true);
    expect(commercialSuggestionSchema.safeParse({ suggestion: "hola" }).success).toBe(false);
    expect(commercialSuggestionSchema.safeParse({ suggestion: "a".repeat(1001) }).success).toBe(false);
    expect(commercialSuggestionSchema.safeParse({ suggestion: "Texto de sugerencia", status: "revisando" }).success).toBe(false);
  });

  it("requires full Super Admin role for writes, drafts, and the inbox", () => {
    const api = source("server/commercialResourcesRoutes.ts");
    expect(api).toContain('user?.role !== "super_admin"');
    expect(api).toContain("if (!user || !SUGGEST_ROLES.has(user.role))");
    expect(api).toContain("getTenantMembersByUser");
    expect(api).toContain("WHERE t.status='published'");
    expect(api).toContain("status='draft'");
    expect(api).toContain("status='retired'");
    expect(api).toContain("pg_advisory_xact_lock");
    expect(api).toContain("commercialResourceUploadSchema.safeParse");
    expect(api).toContain("commercialSuggestionSchema.safeParse");
    expect(api).not.toContain("UPDATE public.commercial_resource_suggestions");
  });

  it("keeps suggestions as a read-only inbox without statuses", () => {
    const sql = source("migrations/0010_commercial_resources_library.sql");
    expect(sql).toContain("commercial_resource_suggestions");
    const suggestionDefinition = sql.split("CREATE TABLE IF NOT EXISTS public.commercial_resource_suggestions (")[1].split(");")[0];
    expect(suggestionDefinition).not.toMatch(/status|reviewed_by|assigned_to|resolved_at/i);
    const page = source("client/src/pages/CommercialResources.tsx");
    expect(page).toContain('data-testid="commercial-suggestion-form"');
    expect(page).toContain('data-testid="commercial-suggestion-send"');
    expect(page).not.toContain("Editar contenido");
    const admin = source("client/src/components/Commercial/CommercialResourcesAdmin.tsx");
    expect(admin).toContain('data-testid="resource-admin-suggestions"');
    expect(admin).toContain("Solo lectura");
  });

  it("hides all drafts and shows only approved resources to broker", () => {
    const page = source("client/src/pages/CommercialResources.tsx");
    expect(page).toContain('queryKey: ["/api/commercial-resources/templates"]');
    expect(page).toContain("templates.length === 0");
    expect(page).not.toContain("COMMERCIAL_CAMPAIGNS.map");
    expect(page).toContain('data-testid="resources-published-list"');
    expect(page).toContain('data-testid="resources-empty"');
    const admin = source("client/src/components/Commercial/CommercialResourcesAdmin.tsx");
    expect(admin).toContain('data-testid="resource-admin-file"');
    expect(admin).toContain('data-testid="resource-admin-save-draft"');
    expect(admin).toContain("Guardar nueva versión como borrador");
    expect(admin).toContain('"/api/admin/commercial-resources/templates/"');
  });

  it("renders approved content unchanged while varying broker branding", () => {
    const template = { ...COM_RES_EXAMPLE, id: "test", version: 1, status: "published" as const };
    const svg = templateSvg(template, brand);
    const caption = campaignMessage(campaignFromTemplate(template), "instagram", brand);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain("WhatsApp: +525512345678");
    expect(svg).toContain(COM_RES_EXAMPLE.definition.headline.split(" ")[0]);
    expect(caption).toContain(COM_RES_EXAMPLE.definition.cta);
    expect(caption).toContain(COMMERCIAL_DISCLAIMER);
    expect(templateSvg(template, { ...brand, showPhone: false })).not.toContain("WhatsApp: +525512345678");
  });

  it("supports five products, five channels and lightweight PNG, including TikTok storyboard", () => {
    expect(COMMERCIAL_CAMPAIGNS.map(x => x.id)).toEqual(["simple", "revolvente", "factoraje", "arrendamiento", "hipotecario"]);
    expect(CHANNELS.map(x => x.id)).toEqual(["instagram", "facebook", "whatsapp", "linkedin", "tiktok"]);
    expect(imageSize("instagram")).toEqual({ width: 1080, height: 1350 });
    expect(imageSize("tiktok")).toEqual({ width: 1080, height: 1920 });
    expect(imageSize("linkedin")).toEqual({ width: 1200, height: 1200 });
    const message = campaignMessage(COMMERCIAL_CAMPAIGNS[1], "tiktok", brand);
    expect(message).toContain("NO ES UN VIDEO");
    expect(message).toContain("0–3 s");
    const page = source("client/src/pages/CommercialResources.tsx");
    expect(page).toContain('data-testid="resource-download-png"');
    expect(page).toContain('data-testid="resource-copy-caption"');
    expect(page).toContain("credito-negocios-full-logo.jpg");
  });

  it("protects branding input and uses explicit WhatsApp opt-in", () => {
    expect(safeBrandLabel("Broker <script>alert(1)</script>")).not.toContain("<");
    expect(normalizedWhatsApp("55 1234 5678")).toBe("525512345678");
    expect(normalizedWhatsApp("123")).toBe("");
    const svg = campaignSvg(COMMERCIAL_CAMPAIGNS[0], "instagram", {
      displayName: 'Marca <img src=x onerror=alert(1)>',
      whatsapp: "+52 55 1234 5678", showPhone: true
    });
    expect(svg).not.toContain("onerror");
    expect(svg).not.toContain("<img");
    const page = source("client/src/pages/CommercialResources.tsx");
    expect(page).toContain("const identityReady = Boolean(selection?.definition.graphic)");
    expect(page).toContain("safeBrandLabel(displayName).length >= 2");
    expect(page).toContain("graphicName.trim().length >= 2");
    expect(page).toContain('disabled={!identityReady || (Boolean(selection.definition.graphic)');
    expect(page).toContain('showPhone: true');
    expect(page).not.toContain("setShowPhone(");
    expect(page).not.toContain("referralCode");
    expect(page).not.toContain("localStorage");
  });

  it("centers CTA text inside approved graphic buttons", () => {
    const renderer = source("client/src/lib/commercialGraphicRenderer.ts");
    expect(renderer).toContain('align:"left"|"center"="left"');
    expect(renderer).toContain('const x=align==="center" ? field.x+field.width/2 : field.x');
    expect(renderer).toContain('fit(ctx,graphic.fields.cta.text,graphic.fields.cta,"center")');
  });

  it("limits graphic personalization to broker/master name and WhatsApp only", () => {
    const renderer = source("client/src/lib/commercialGraphicRenderer.ts");
    const page = source("client/src/pages/CommercialResources.tsx");
    expect(renderer).not.toContain("approvedLogoUrl");
    expect(renderer).not.toContain("drawLogo(");
    expect(renderer).toContain("Never draw profile logos, avatars, photos or letter tiles");
    expect(page).not.toContain("authorizedLogo");
    expect(page).toContain("no muestran foto, avatar ni logo propio del Broker/Master");
    expect(page).toContain("No se usa foto, avatar ni logo propio del Broker/Master");
  });

  it("keeps financing product guides integrated in Help", () => {
    const help = source("server/commercialHelpService.ts");
    for (const slug of [
      "guia-credito-simple", "guia-credito-revolvente",
      "guia-factoraje", "guia-arrendamiento", "guia-hipotecario-vivienda"
    ]) {
      expect(help).toContain(slug);
    }
    expect(help).toContain("productos_crediticios");
    expect(source("client/src/pages/HelpCenterPage.tsx")).toContain('data-testid="help-product-guides"');
  });
  it("blocks PNG export if the mandatory institutional logo cannot load", () => {
    const page = source("client/src/pages/CommercialResources.tsx");
    expect(page).toContain("logo.onerror = () =>");
    expect(page).toContain("No se pudo cargar el logotipo obligatorio.");
    expect(page).not.toContain("logo.onerror = finish");
  });

});
