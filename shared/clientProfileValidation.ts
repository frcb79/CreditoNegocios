import { z } from "zod";
import { updatedInsertClientSchema } from "./schema";
export const clientProfileBaseSchema = updatedInsertClientSchema.extend({
  brokerId: updatedInsertClientSchema.shape.brokerId.optional(),
  rfc: updatedInsertClientSchema.shape.rfc.optional(), // RFC opcional para SIN SAT
});

export const validateClientProfile = (data: any, ctx: z.RefinementCtx) => {
  // Validaciones SOLO condicionales - permitir crear clientes con datos parciales

  // Validación condicional: si seleccionas "si" en atrasos, debes dar detalles
  if (data.atrasosDeudas === "si" && !data.atrasosDetalles) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Detalles de atrasos son requeridos cuando se selecciona 'SI'",
      path: ["atrasosDetalles"],
    });
  }

  // Validación condicional: si seleccionas "no" en SAT CIEC, debes indicar si tienes estados financieros
  if (data.satCiec === "no" && !data.estadosFinancieros) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Información sobre estados financieros es requerida cuando no acepta SAT CIEC",
      path: ["estadosFinancieros"],
    });
  }

  // Validación condicional: si seleccionas "negativa" en opinión, debes dar detalles
  if (data.opinionCumplimiento === "negativa" && !data.opinionDetalles) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Detalles de opinión negativa son requeridos",
      path: ["opinionDetalles"],
    });
  }

  // Validación condicional: si tienes créditos vigentes, debes dar detalles y cada crédito debe tener todos sus campos completos
  if (data.creditosVigentes === "si") {
    if (!data.creditosVigentesDetalles || !Array.isArray(data.creditosVigentesDetalles) || data.creditosVigentesDetalles.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Debes agregar al menos un crédito vigente con todos sus datos completos",
        path: ["creditosVigentesDetalles"],
      });
    } else {
      data.creditosVigentesDetalles.forEach((credit: any, index: number) => {
        if (!credit.tipo || !credit.tipo.trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "El tipo de crédito es requerido",
            path: ["creditosVigentesDetalles", index, "tipo"],
          });
        }
        if (!credit.institucion || !credit.institucion.trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "La institución financiera es requerida",
            path: ["creditosVigentesDetalles", index, "institucion"],
          });
        }
        if (!credit.saldoOriginal || String(credit.saldoOriginal).trim() === '') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "El saldo original es requerido",
            path: ["creditosVigentesDetalles", index, "saldoOriginal"],
          });
        }
        if (!credit.saldo || String(credit.saldo).trim() === '') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "El saldo actual es requerido",
            path: ["creditosVigentesDetalles", index, "saldo"],
          });
        }
        if (!credit.fechaInicio || !credit.fechaInicio.trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "La fecha de inicio es requerida",
            path: ["creditosVigentesDetalles", index, "fechaInicio"],
          });
        }
        if (!credit.fechaTermino || !credit.fechaTermino.trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "La fecha de término es requerida",
            path: ["creditosVigentesDetalles", index, "fechaTermino"],
          });
        }
      });
    }
  }


  // Perfilamiento incremental: solo exigir detalles cuando se declara una condición.
  // No bloquear la actualización por datos demográficos o financieros aún desconocidos.
  if (data.type === "fisica") {
    if (data.atrasosDeudasBuro === "si" && !data.atrasosDeudasBuroDetalles) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["atrasosDeudasBuroDetalles"], message: "Describe los atrasos señalados" });
    }
    if ((data.cuentaConGarantiaFisica === "prendaria" || data.cuentaConGarantiaFisica === "hipotecaria") &&
        (!data.garantiaFisicaDetalles || Object.keys(data.garantiaFisicaDetalles).length === 0)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["garantiaFisicaDetalles"], message: "Describe la garantía seleccionada" });
    }
  }
};

export const clientProfileFormSchema = clientProfileBaseSchema.superRefine(validateClientProfile);
export const publicClientProfileSchema = clientProfileBaseSchema.omit({
  brokerId: true, tenantId: true, createdBy: true, isActive: true, originOpportunity: true,
}).extend({ type: z.enum(["persona_moral", "fisica_empresarial", "fisica", "sin_sat"]) })
.strict().superRefine(validateClientProfile).superRefine((data, ctx) => {
  if (JSON.stringify(data).length > 60000) ctx.addIssue({ code: "custom", message: "El perfil excede el tamaño permitido" });
  if (data.type === "persona_moral" && !data.businessName?.trim()) ctx.addIssue({ code: "custom", path: ["businessName"], message: "Indica la razón social" });
  if (data.type !== "persona_moral" && !data.firstName?.trim()) ctx.addIssue({ code: "custom", path: ["firstName"], message: "Indica tu nombre" });
  const digits = data.phone?.replace(/\D/g, "") || "";
  if (digits.length < 10 || digits.length > 15) ctx.addIssue({ code: "custom", path: ["phone"], message: "Indica un teléfono de 10 a 15 dígitos" });
  if (data.email && !z.string().email().safeParse(data.email).success) ctx.addIssue({ code: "custom", path: ["email"], message: "Indica un correo válido" });
});
export type PublicClientProfile = z.infer<typeof publicClientProfileSchema>;
export function profileForPublicSubmission(data: Record<string, unknown>) {
  const { brokerId, tenantId, createdBy, isActive, originOpportunity, id, createdAt, updatedAt, ...profile } = data;
  return profile;
}
