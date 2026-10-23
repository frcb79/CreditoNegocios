import { z } from "zod";

/**
 * Exchange format for administrative campaign templates (COM-RES-001).
 * Only Super Admin imports it. Brokers select approved items and provide
 * their own permitted identity fields; these strings are never writable by brokers.
 */
export const resourceProductSchema = z.enum(["simple", "revolvente", "factoraje", "arrendamiento", "hipotecario"]);
export const resourceChannelSchema = z.enum(["instagram", "facebook", "whatsapp", "linkedin", "tiktok"]);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color hexadecimal #RRGGBB");

export const commercialResourceDefinitionSchema = z.object({
  layout: z.enum(["editorial", "minimal", "split"]),
  hero: z.enum(["geometric", "rings", "none"]),
  colors: z.object({ background: color, accent: color, foreground: color }).strict(),
  headline: z.string().trim().min(5).max(85),
  supportingLine: z.string().trim().min(8).max(110),
  description: z.string().trim().min(8).max(180),
  hook: z.string().trim().min(8).max(150),
  cta: z.string().trim().min(5).max(95),
  highlights: z.array(z.string().trim().min(3).max(85)).max(3).default([]),
  allowedIdentityFields: z.object({
    displayName: z.literal(true),
    whatsapp: z.boolean(),
    institutionalLogo: z.boolean(),
  }).strict(),
}).strict();

export const commercialResourceUploadSchema = z.object({
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80),
  name: z.string().trim().min(5).max(100),
  product: resourceProductSchema,
  channel: resourceChannelSchema,
  definition: commercialResourceDefinitionSchema
}).strict();

export const commercialSuggestionSchema = z.object({
  product: resourceProductSchema.optional(),
  channel: resourceChannelSchema.optional(),
  suggestion: z.string().trim().min(10, "Describe tu sugerencia en al menos 10 caracteres").max(1000)
}).strict();

export type CommercialResourceUpload = z.infer<typeof commercialResourceUploadSchema>;
export type CommercialResourceDefinition = z.infer<typeof commercialResourceDefinitionSchema>;
export type CommercialSuggestionInput = z.infer<typeof commercialSuggestionSchema>;
export const COMMERCIAL_DISCLAIMER = "Sujeto a evaluación y condiciones de cada institución financiera.";

export const COM_RES_EXAMPLE: CommercialResourceUpload = {
  slug: "simple-campana-institucional",
  name: "Crédito Simple — Plantilla institucional",
  product: "simple",
  channel: "instagram",
  definition: {
    layout: "editorial",
    hero: "geometric",
    colors: { background: "#0B2F4B", accent: "#A8E4E8", foreground: "#FFFFFF" },
    headline: "FINANCIAMIENTO PARA TUS PROYECTOS",
    supportingLine: "Explora opciones de Crédito Simple.",
    description: "Para necesidades de financiamiento empresarial.",
    hook: "¿Tu negocio tiene un proyecto por financiar?",
    cta: "Conoce opciones para tu negocio.",
    highlights: ["Distintas alternativas", "Evaluación por financiera"],
    allowedIdentityFields: { displayName: true, whatsapp: true, institutionalLogo: true }
  }
};
