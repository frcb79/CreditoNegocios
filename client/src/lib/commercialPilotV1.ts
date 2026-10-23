/**
 * COM-PILOT-01. Temporary Super Admin-only graphic compatibility test.
 * This adapter does not persist, import or publish a commercial template.
 * Approved templates and the existing SVG renderer remain unchanged.
 */
export const PILOT_BACKGROUND_SHA256 = "da2f2ac734a40513842d7e8fd66878498d3f4afdf78b98db0ec682111cb69a58";
export const PILOT_SLUG = "credito-simple-impactante-piloto-01";

type TextField = {
  x: number; y: number; width: number; height: number;
  font: string; fontSize: number; minFontSize: number; maxLines: number;
  color: string; required: boolean; source: string;
  defaultApprovedText?: string;
};
type LogoField = { x: number; y: number; width: number; height: number; fit?: string; required: boolean; source: string };
export type PilotGraphicMap = {
  schemaVersion: string; status: string; slug: string;
  roles: string[]; canvas: { width: number; height: number; unit: string };
  assets: { masterBackground: { locked: boolean }; cnLogo: { locked: boolean } };
  locked: { headline: string; legalFooter: string; cnLogo: boolean };
  fields: {
    BROKER_NAME: TextField; BROKER_WHATSAPP: TextField; BROKER_LOGO: LogoField;
    CTA: TextField; CN_LOGO: LogoField;
    TRACKING_LINK: { placement: string; onImage: boolean; qr: boolean };
  };
  rules: { qrAllowed: boolean; draftOnly: boolean; brokerCannotModifyCopy: boolean };
};

const isObject = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v);
const isBox = (v: unknown): v is LogoField =>
  isObject(v) && ["x", "y", "width", "height"].every(k => Number.isInteger(v[k]) && v[k] >= 0);
const textField = (v: unknown): v is TextField =>
  isBox(v) && typeof (v as TextField).color === "string" &&
  /^#[0-9a-f]{6}$/i.test((v as TextField).color) &&
  Number.isInteger((v as TextField).fontSize) && Number.isInteger((v as TextField).minFontSize) &&
  (v as TextField).fontSize >= (v as TextField).minFontSize &&
  (v as TextField).minFontSize >= 12 && (v as TextField).maxLines === 1;

export function parsePilotGraphicMap(source: string): PilotGraphicMap {
  const raw: unknown = JSON.parse(source.replace(/^\uFEFF/, ""));
  if (!isObject(raw) || raw.schemaVersion !== "cn-commercial-template-map/pilot-v1" ||
      raw.slug !== PILOT_SLUG || raw.status !== "TECHNICAL_TEST_ONLY_NOT_APPROVED" ||
      !Array.isArray(raw.roles) || !raw.roles.includes("broker") || !raw.roles.includes("master_broker") ||
      raw.canvas?.width !== 1080 || raw.canvas?.height !== 1350 || raw.canvas?.unit !== "px" ||
      raw.rules?.qrAllowed !== false || raw.rules?.draftOnly !== true ||
      raw.rules?.brokerCannotModifyCopy !== true ||
      raw.fields?.TRACKING_LINK?.placement !== "caption_only" ||
      raw.fields?.TRACKING_LINK?.onImage !== false || raw.fields?.TRACKING_LINK?.qr !== false ||
      raw.assets?.masterBackground?.locked !== true || raw.assets?.cnLogo?.locked !== true ||
      raw.locked?.cnLogo !== true ||
      !textField(raw.fields?.BROKER_NAME) ||
      !textField(raw.fields?.BROKER_WHATSAPP) ||
      !textField(raw.fields?.CTA) ||
      !isBox(raw.fields?.BROKER_LOGO) || !isBox(raw.fields?.CN_LOGO) ||
      raw.fields.BROKER_NAME.required !== true ||
      raw.fields.BROKER_WHATSAPP.required !== true ||
      raw.fields.CTA.source !== "super_admin_approved_cta" ||
      raw.fields.CTA.defaultApprovedText !== "Explora tus alternativas" ||
      raw.fields.BROKER_LOGO.required !== false ||
      raw.fields.BROKER_LOGO.source !== "approved_profile_logo" ||
      raw.fields.CN_LOGO.source !== "assets.cnLogo") {
    throw new Error("Mapa piloto no compatible, modificado o no autorizado para esta prueba.");
  }
  const map = raw as PilotGraphicMap;
  for (const field of Object.values(map.fields)) {
    if ("x" in field && (field.x + field.width > 1080 || field.y + field.height > 1350)) {
      throw new Error("Campo piloto fuera del canvas.");
    }
  }
  return map;
}

export function pilotDisplayName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}
export function pilotWhatsApp(value: string): string {
  let digits = value.replace(/\D/g, "");
  if (digits.length === 10) digits = "52" + digits;
  if (!/^\d{11,15}$/.test(digits)) throw new Error("WhatsApp válido obligatorio (10 a 15 dígitos).");
  return "+" + digits.slice(0, 2) + " " + digits.slice(2).replace(/(\d{2})(?=\d)/g, "$1 ").trim();
}
export type PilotIdentity = {
  role: "broker" | "master_broker"; displayName: string; whatsapp: string;
  logo?: { image: HTMLImageElement; approved: boolean };
};

function drawFittedText(ctx: CanvasRenderingContext2D, value: string, field: TextField, weight: number): number {
  if (!value.trim()) throw new Error("Falta un campo obligatorio del piloto.");
  let size = field.fontSize;
  for (; size >= field.minFontSize; size--) {
    ctx.font = `${weight} ${size}px Inter, Arial, sans-serif`;
    if (ctx.measureText(value).width <= field.width) break;
  }
  if (size < field.minFontSize) throw new Error("Nombre/texto demasiado largo para la zona aprobada; no se exportó.");
  const measure = ctx.measureText(value);
  ctx.fillStyle = field.color;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const baseline = field.y + (field.height + measure.actualBoundingBoxAscent - measure.actualBoundingBoxDescent) / 2;
  ctx.fillText(value, field.x, baseline);
  return size;
}

function drawContainedLogo(ctx: CanvasRenderingContext2D, image: HTMLImageElement, box: LogoField) {
  if (!image.complete || !image.naturalWidth || !image.naturalHeight) throw new Error("Logotipo no disponible.");
  const ratio = Math.min(box.width / image.naturalWidth, box.height / image.naturalHeight);
  const width = image.naturalWidth * ratio, height = image.naturalHeight * ratio;
  ctx.drawImage(image, box.x + (box.width - width) / 2, box.y + (box.height - height) / 2, width, height);
}

export async function loadPilotImage(file: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally {
    // Image bitmap remains decoded after release of the object URL.
    URL.revokeObjectURL(url);
  }
}
export async function checkPilotBackground(file: File): Promise<void> {
  if (file.type !== "image/png" || file.size > 5_000_000) throw new Error("El fondo debe ser PNG original (máximo 5 MB).");
  const sha = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer())))
    .map(byte => byte.toString(16).padStart(2, "0")).join("");
  if (sha !== PILOT_BACKGROUND_SHA256) throw new Error("El fondo no coincide con el archivo original de Drive. Se bloqueó la exportación.");
}

/**
 * Draw the exact original background first. Its HERO, headlines, legal footer
 * and CN logo (bottom right) are already baked in: never draw a second CN logo.
 */
export async function renderPilotGraphic(map: PilotGraphicMap, background: HTMLImageElement, identity: PilotIdentity): Promise<HTMLCanvasElement> {
  if (!map.roles.includes(identity.role)) throw new Error("Rol no admitido en el piloto.");
  if (background.naturalWidth !== map.canvas.width || background.naturalHeight !== map.canvas.height) {
    throw new Error("Dimensiones del fondo distintas de 1080 × 1350.");
  }
  const name = pilotDisplayName(identity.displayName);
  if (name.length < 2 || name.length > 120) throw new Error("Nombre válido obligatorio.");
  const phone = pilotWhatsApp(identity.whatsapp);
  // Never silently replace Inter with a different font on final export.
  await Promise.all([document.fonts.load('700 29px "Inter"'), document.fonts.load('600 28px "Inter"')]);
  if (!document.fonts.check('700 29px "Inter"') || !document.fonts.check('600 28px "Inter"')) {
    throw new Error("No se pudo cargar Inter. Se bloqueó la exportación.");
  }
  const canvas = document.createElement("canvas");
  canvas.width = map.canvas.width; canvas.height = map.canvas.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas no disponible.");
  ctx.drawImage(background, 0, 0);
  drawFittedText(ctx, name, map.fields.BROKER_NAME, 700);
  drawFittedText(ctx, phone, map.fields.BROKER_WHATSAPP, 600);
  drawFittedText(ctx, map.fields.CTA.defaultApprovedText || "", map.fields.CTA, 600);
  if (identity.logo?.approved) drawContainedLogo(ctx, identity.logo.image, map.fields.BROKER_LOGO);
  // Never draw user-supplied QR, captions, or institutional logo overlays.
  return canvas;
}
