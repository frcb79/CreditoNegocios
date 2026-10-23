/**
 * Borradores comerciales para revisión y aprobación.
 * No se incluyen tasas, plazos ni afirmaciones de aprobación.
 */
export type SocialChannel = "instagram" | "facebook" | "whatsapp" | "linkedin" | "tiktok";
export type BrokerBranding = { displayName: string; whatsapp: string; showPhone: boolean };
export type Campaign = {
  id: string; product: string; headline: string;
  supportingLine: string; description: string; hook: string; cta: string;
};

export const COMMERCIAL_CAMPAIGNS: Campaign[] = [
  { id: "simple", product: "Crédito Simple", headline: "FINANCIAMIENTO PARA TUS PROYECTOS", supportingLine: "Explora opciones de Crédito Simple.", description: "Para necesidades de financiamiento empresarial.", hook: "¿Tu negocio tiene un proyecto por financiar?", cta: "Conoce opciones para tu negocio." },
  { id: "revolvente", product: "Crédito Revolvente", headline: "CAPITAL PARA SEGUIR OPERANDO", supportingLine: "Conoce el Crédito Revolvente.", description: "Consulta alternativas de liquidez para tu operación.", hook: "¿Tu empresa necesita flexibilidad financiera?", cta: "Revisemos las alternativas disponibles." },
  { id: "factoraje", product: "Factoraje", headline: "TUS FACTURAS, UNA OPORTUNIDAD", supportingLine: "Explora soluciones de Factoraje.", description: "Conoce alternativas relacionadas con cuentas por cobrar.", hook: "¿Tu empresa factura y necesita liquidez?", cta: "Conversemos sobre opciones de factoraje." },
  { id: "arrendamiento", product: "Arrendamiento", headline: "EQUIPA TU PRÓXIMO PROYECTO", supportingLine: "Explora opciones de Arrendamiento.", description: "Para empresas que buscan activos productivos.", hook: "¿Necesitas renovar vehículos o equipo?", cta: "Consulta alternativas de arrendamiento." },
  { id: "hipotecario", product: "Hipotecario Vivienda", headline: "EXPLORA TU PRÓXIMA VIVIENDA", supportingLine: "Conoce opciones de crédito hipotecario.", description: "Alternativas de financiamiento de vivienda.", hook: "¿Estás explorando opciones para comprar vivienda?", cta: "Te ayudo a conocer el proceso." }
];

export const CHANNELS: { id: SocialChannel; label: string; size: string; format: string }[] = [
  { id: "instagram", label: "Instagram", size: "1080 × 1350", format: "Publicación vertical" },
  { id: "facebook", label: "Facebook", size: "1080 × 1080", format: "Publicación cuadrada" },
  { id: "whatsapp", label: "WhatsApp", size: "1080 × 1920", format: "Estado o historia" },
  { id: "linkedin", label: "LinkedIn", size: "1200 × 1200", format: "Publicación cuadrada" },
  { id: "tiktok", label: "TikTok", size: "1080 × 1920", format: "Portada y guion (video pendiente)" }
];

export function imageSize(channel: SocialChannel): { width: number; height: number } {
  if (channel === "instagram") return { width: 1080, height: 1350 };
  if (channel === "linkedin") return { width: 1200, height: 1200 };
  if (channel === "facebook") return { width: 1080, height: 1080 };
  return { width: 1080, height: 1920 };
}

export function safeBrandLabel(input: string | null | undefined): string {
  return (input || "").replace(/[^\p{L}\p{N}\s.&'-]/gu, "").replace(/\s+/g, " ").trim().slice(0, 32);
}

export function normalizedWhatsApp(value: string): string {
  let digits = value.replace(/\D/g, "");
  if (digits.length === 10) digits = "52" + digits;
  return digits.length >= 11 && digits.length <= 15 ? digits : "";
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function wrap(text: string, max: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (line && (line + " " + word).length > max) { lines.push(line); line = word; }
    else line = line ? line + " " + word : word;
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

export function campaignMessage(campaign: Campaign, channel: SocialChannel, branding: BrokerBranding): string {
  const identity = safeBrandLabel(branding.displayName) || "Asesor de financiamiento";
  const footer = ["Contacto: " + identity];
  const phone = normalizedWhatsApp(branding.whatsapp);
  if (branding.showPhone && phone) footer.push("WhatsApp: +" + phone);
  footer.push("Sujeto a evaluación y condiciones de cada institución financiera.");
  if (channel === "tiktok") return [
    "GUION PARA VIDEO VERTICAL (BORRADOR: NO ES UN VIDEO)",
    "0–3 s · " + campaign.hook,
    "3–10 s · " + campaign.description,
    "10–15 s · " + campaign.cta,
    "",
    ...footer
  ].join("\n");
  return [campaign.hook, campaign.description, campaign.cta, "", ...footer].join("\n");
}

export function campaignSvg(campaign: Campaign, channel: SocialChannel, branding: BrokerBranding): string {
  const size = imageSize(channel), width = size.width, height = size.height;
  const tall = height > width * 1.35;
  const lines = wrap(campaign.headline, tall ? 17 : 22);
  const top = tall ? 620 : 365, fontSize = tall ? 72 : 60;
  const safeName = escapeXml(safeBrandLabel(branding.displayName) || "Asesor de financiamiento");
  const phone = branding.showPhone ? normalizedWhatsApp(branding.whatsapp) : "";
  const label = escapeXml(campaign.product.toUpperCase());
  const suffix = escapeXml(campaign.supportingLine);
  const bottom = height - (tall ? 395 : 315);
  const initials = escapeXml((safeBrandLabel(branding.displayName).charAt(0) || "C").toUpperCase());
  const headings = lines.map((line, i) => '<text x="85" y="' + (top + i * (fontSize + 21)) + '" font-family="Arial, sans-serif" font-size="' + fontSize + '" font-weight="800" fill="#fff">' + escapeXml(line) + '</text>').join("");
  const text = function (x: number, y: number, size: number, value: string, color: string, weight = 400) {
    return '<text x="' + x + '" y="' + y + '" font-family="Arial, sans-serif" font-size="' + size + '" font-weight="' + weight + '" fill="' + color + '">' + value + '</text>';
  };
  const pieces = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '">',
    '<defs><linearGradient id="blue" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#092a44"/><stop offset=".65" stop-color="#195d81"/><stop offset="1" stop-color="#063354"/></linearGradient></defs>',
    '<rect width="' + width + '" height="' + height + '" fill="url(#blue)"/>',
    '<circle cx="' + width + '" cy="290" r="460" fill="#eefaff" opacity=".055"/>',
    '<circle cx="' + (width - 90) + '" cy="360" r="260" stroke="#e8f7ff" fill="none" opacity=".17"/>',
    text(85, 118, 39, 'CRÉDITO NEGOCIOS', '#ffffff', 800),
    '<rect x="85" y="' + (tall ? 303 : 194) + '" rx="16" width="' + (width - 170) + '" height="74" fill="#bce8ea"/>',
    text(115, tall ? 354 : 245, 32, label, '#123d54', 800),
    headings,
    text(85, top + lines.length * (fontSize + 21) + 24, tall ? 42 : 33, suffix, '#e5faff', 400),
    '<rect x="0" y="' + bottom + '" width="' + width + '" height="' + (height-bottom) + '" fill="#0b2e4a" opacity=".96"/>',
    '<rect x="85" y="' + (bottom + 48) + '" width="94" height="94" rx="23" fill="#bce8ea"/>',
    text(115, bottom + 111, 55, initials, '#0c3c5a', 800),
    text(205, bottom + 89, 38, safeName, '#ffffff', 700),
    text(205, bottom + 131, 27, 'Asesor de financiamiento', '#d0e8f1'),
    text(85, height - 106, 33, phone ? 'WhatsApp: +' + phone : 'Consulta tus alternativas', '#effaff', 700),
    text(85, height - 47, 20, 'Sujeto a evaluación y condiciones de cada institución financiera.', '#aec6d8'),
    '</svg>'
  ];
  return pieces.join("");
}
