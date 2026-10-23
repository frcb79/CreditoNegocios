import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CHANNELS, COMMERCIAL_CAMPAIGNS, campaignMessage, campaignSvg,
  imageSize, safeBrandLabel, normalizedWhatsApp
} from "../../client/src/lib/commercialResources";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const brand = { displayName: "Broker Ejemplo", whatsapp: "55 1234 5678", showPhone: true };

describe("Biblioteca comercial V0 — contenido seguro, ligero y personalizable", () => {
  it("presenta los cinco productos principales sin promesas comerciales", () => {
    expect(COMMERCIAL_CAMPAIGNS.map(x => x.id)).toEqual(["simple", "revolvente", "factoraje", "arrendamiento", "hipotecario"]);
    expect(CHANNELS.map(x => x.id)).toEqual(["instagram", "facebook", "whatsapp", "linkedin", "tiktok"]);
    for (const campaign of COMMERCIAL_CAMPAIGNS) {
      expect(campaign.headline.length).toBeGreaterThan(8);
      expect(campaign.description).not.toMatch(/garantiz|aprobaci[oó]n asegurad|sin bur[oó]|% anual|al instante/i);
    }
  });

  it("regresa tamaños coherentes sin almacenar archivos en servidor", () => {
    expect(imageSize("instagram")).toEqual({ width: 1080, height: 1350 });
    expect(imageSize("facebook")).toEqual({ width: 1080, height: 1080 });
    expect(imageSize("whatsapp")).toEqual({ width: 1080, height: 1920 });
    expect(imageSize("linkedin")).toEqual({ width: 1200, height: 1200 });
    expect(imageSize("tiktok")).toEqual({ width: 1080, height: 1920 });
    const page = source("client/src/pages/CommercialResources.tsx");
    expect(page).toContain('data-testid="marketing-preview"');
    expect(page).toContain('data-testid="resource-download-png"');
    expect(page).toContain('data-testid="resource-copy-caption"');
    expect(page).toContain('data-testid="commercial-drafts-warning"');
    expect(page).not.toContain('apiRequest("POST"');
    expect(page).not.toContain('fetch("https://');
  });

  it("normaliza el contacto y permite omitirlo en la campaña", () => {
    expect(normalizedWhatsApp("55 1234 5678")).toBe("525512345678");
    expect(normalizedWhatsApp("+52 55 1234 5678")).toBe("525512345678");
    expect(normalizedWhatsApp("123")).toBe("");
    expect(normalizedWhatsApp("")).toBe("");
    const msg = campaignMessage(COMMERCIAL_CAMPAIGNS[0], "whatsapp", { ...brand, showPhone: false });
    expect(msg).not.toContain("525512345678");
    expect(msg).toContain("Sujeto a evaluación");
  });

  it("escapa los datos del broker en el SVG y no los guarda en servicios externos", () => {
    expect(safeBrandLabel("Broker <script>alert(1)</script>")).not.toContain("<");
    const svg = campaignSvg(COMMERCIAL_CAMPAIGNS[0], "instagram", {
      displayName: 'Marca <img src=x onerror=alert(1)>',
      whatsapp: "+52 55 1234 5678",
      showPhone: true
    });
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain("WhatsApp: +525512345678");
    expect(svg).not.toContain("<script>");
    expect(svg).not.toContain("<img");
    expect(svg).not.toContain("onerror");
    expect(svg).not.toContain("http://wa.me");
  });

  it("TikTok recibe un guion de 15 segundos y una portada, no un video ficticio", () => {
    const text = campaignMessage(COMMERCIAL_CAMPAIGNS[1], "tiktok", brand);
    expect(text).toContain("NO ES UN VIDEO");
    expect(text).toContain("0–3 s");
    expect(text).toContain("10–15 s");
    const svg = campaignSvg(COMMERCIAL_CAMPAIGNS[1], "tiktok", brand);
    expect(svg).toContain('height="1920"');
  });

  it("restringe la pantalla a roles autenticados y no altera comisiones ni códigos de referidos", () => {
    const app = source("client/src/App.tsx");
    const sidebar = source("client/src/components/Sidebar.tsx");
    const page = source("client/src/pages/CommercialResources.tsx");
    expect(app).toContain('path="/recursos-comerciales" component={CommercialResources}');
    expect(sidebar).toContain("Recursos comerciales");
    expect(page).toContain('user?.role === "broker"');
    expect(page).not.toContain("referralCode");
    expect(page).not.toContain("commission");
    expect(page).not.toContain("localStorage");
  });
});
