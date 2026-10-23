import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PILOT_BACKGROUND_SHA256, parsePilotGraphicMap, pilotDisplayName, pilotWhatsApp, pilotIdentityFromProfile } from "../../client/src/lib/commercialPilotV1";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const MAP = {
  schemaVersion: "cn-commercial-template-map/pilot-v1",
  slug: "credito-simple-impactante-piloto-01",
  status: "TECHNICAL_TEST_ONLY_NOT_APPROVED",
  roles: ["broker", "master_broker"],
  canvas: { width: 1080, height: 1350, unit: "px" },
  assets: { masterBackground: { locked: true }, cnLogo: { locked: true } },
  locked: { headline: "Tu negocio tiene GRANDES planes.", legalFooter: "Sujeto a evaluación y condiciones de cada institución financiera.", cnLogo: true },
  fields: {
    BROKER_NAME: { x: 109, y: 105, width: 390, height: 51, font: "Inter Bold", fontSize: 29, minFontSize: 21, maxLines: 1, align: "left", color: "#16394C", required: true, source: "authorized_profile.displayName" },
    BROKER_WHATSAPP: { x: 67, y: 1225, width: 610, height: 38, font: "Inter SemiBold", fontSize: 28, minFontSize: 22, maxLines: 1, color: "#FFFFFF", required: true, source: "authorized_profile.whatsapp" },
    BROKER_LOGO: { x: 520, y: 70, width: 145, height: 75, required: false, source: "approved_profile_logo" },
    CTA: { x: 89, y: 1092, width: 510, height: 44, font: "Inter SemiBold", fontSize: 27, minFontSize: 22, maxLines: 1, color: "#08283E", required: true, source: "super_admin_approved_cta", defaultApprovedText: "Explora tus alternativas" },
    CN_LOGO: { x: 777, y: 1194, width: 250, height: 63, required: true, source: "assets.cnLogo" },
    TRACKING_LINK: { source: "backend_campaign_opaque_link", placement: "caption_only", onImage: false, qr: false }
  },
  rules: { qrAllowed: false, draftOnly: true, brokerCannotModifyCopy: true }
};

describe("COM-PILOT-01 — isolated approved-artwork map adaptation", () => {
  it("accepts 1080x1350 fixed artwork and BOM JSON without publishing", () => {
    const map = parsePilotGraphicMap("\uFEFF" + JSON.stringify(MAP));
    expect(map.roles).toEqual(["broker", "master_broker"]);
    expect(map.fields.CTA.defaultApprovedText).toBe("Explora tus alternativas");
    expect(map.fields.TRACKING_LINK.onImage).toBe(false);
    expect(map.fields.TRACKING_LINK.qr).toBe(false);
    expect(PILOT_BACKGROUND_SHA256).toHaveLength(64);
  });
  it("rejects publishing, QR, moving institutional logo and tampering with CTA", () => {
    for (const modified of [
      { ...MAP, status: "published" },
      { ...MAP, rules: { ...MAP.rules, draftOnly: false } },
      { ...MAP, rules: { ...MAP.rules, qrAllowed: true } },
      { ...MAP, locked: { ...MAP.locked, cnLogo: false } },
      { ...MAP, fields: { ...MAP.fields, CTA: { ...MAP.fields.CTA, defaultApprovedText: "Crédito aprobado" } } },
      { ...MAP, fields: { ...MAP.fields, TRACKING_LINK: { ...MAP.fields.TRACKING_LINK, onImage: true } } }
    ]) expect(() => parsePilotGraphicMap(JSON.stringify(modified))).toThrow();
  });
  it("rejects unsupported dimensions and coordinates outside canvas", () => {
    expect(() => parsePilotGraphicMap(JSON.stringify({ ...MAP, canvas: { width: 1200, height: 1350, unit: "px" } }))).toThrow();
    expect(() => parsePilotGraphicMap(JSON.stringify({ ...MAP, fields: { ...MAP.fields, BROKER_NAME: { ...MAP.fields.BROKER_NAME, x: 900 } } }))).toThrow();
  });
  it("normalizes valid WhatsApp and rejects missing numbers", () => {
    expect(pilotWhatsApp("55 1234 5678")).toContain("+52 55");
    expect(() => pilotWhatsApp("")).toThrow(/WhatsApp/);
    expect(() => pilotWhatsApp("123")).toThrow(/WhatsApp/);
    expect(pilotDisplayName(" Grupo  Horizonte  Capital ")).toBe("Grupo Horizonte Capital");
  });
  it("uses immutable authenticated-profile-like identity for both roles and rejects unapproved logos", () => {
    const broker = pilotIdentityFromProfile({
      role: "broker", firstName: "María Fernanda", lastName: "López",
      profileData: { business: { businessPhone: "55 1234 5678" } }
    });
    expect(broker).toMatchObject({ role: "broker", displayName: "María Fernanda López", whatsapp: "55 1234 5678" });
    expect(broker.logo).toBeUndefined();
    const image = {} as HTMLImageElement;
    const master = {
      role: "master_broker" as const, brandName: "Grupo Financiero Horizonte Capital",
      profileData: { business: { businessPhone: "55 9876 4321" } }
    };
    expect(pilotIdentityFromProfile(master, { image, approved: false }).logo).toBeUndefined();
    expect(pilotIdentityFromProfile(master, { image, approved: true }).logo).toEqual({ image, approved: true });
    expect(pilotIdentityFromProfile(master).displayName).toBe("Grupo Financiero Horizonte Capital");
  });
  it("mounts pilot in Super Admin ONLY, does not publish nor alter legacy SVG render", () => {
    const admin = read("client/src/components/Commercial/CommercialResourcesAdmin.tsx");
    const pilot = read("client/src/components/Commercial/CommercialPilotPreview.tsx");
    const adapt = read("client/src/lib/commercialPilotV1.ts");
    expect(admin).toContain("<CommercialPilotPreview />");
    expect(pilot).not.toContain("/api/admin/commercial-resources/templates");
    expect(pilot).toContain("checkPilotBackground(file)");
    expect(pilot).toContain("simulateLogoApproval");
    expect(adapt).toContain("ctx.drawImage(background, 0, 0)");
    expect(adapt).toContain("if (identity.logo?.approved)");
    expect(adapt).not.toContain("window.location");
    expect(adapt).not.toContain("QRCode");
    expect(read("client/src/lib/commercialResources.ts")).toContain("export function templateSvg");
  });
});
