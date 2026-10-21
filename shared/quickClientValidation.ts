import { z } from "zod";

export const quickClientSchema = z.object({
  type: z.enum(["persona_moral", "fisica_empresarial", "fisica", "sin_sat"]),
  businessName: z.string().trim().max(180).optional(),
  firstName: z.string().trim().max(120).optional(),
  lastName: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(32).optional(),
  email: z.union([z.literal(""), z.string().trim().email("Ingresa un correo válido")]).optional(),
  rfc: z.string().trim().max(13).optional(),
  state: z.string().trim().max(100).optional(),
  industry: z.string().trim().max(180).optional(),
  yearsInBusiness: z.union([z.literal(""), z.coerce.number().int().min(0).max(200)]).optional(),
  notes: z.string().trim().max(2000).optional(),
}).superRefine((v, ctx) => {
  if (v.type === "persona_moral" && !v.businessName) {
    ctx.addIssue({ code: "custom", path: ["businessName"], message: "Indica la razón social" });
  }
  if (v.type !== "persona_moral" && !v.firstName) {
    ctx.addIssue({ code: "custom", path: ["firstName"], message: "Indica el nombre del prospecto" });
  }
  if (!v.phone && !v.email) {
    ctx.addIssue({ code: "custom", path: ["phone"], message: "Necesitamos al menos un teléfono o correo para contactar al prospecto" });
  }
  if (v.phone && v.phone.replace(/\D/g, "").length < 10) {
    ctx.addIssue({ code: "custom", path: ["phone"], message: "Revisa el teléfono (mínimo 10 dígitos)" });
  }
});

