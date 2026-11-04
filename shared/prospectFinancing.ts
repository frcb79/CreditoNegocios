import { z } from "zod";
import { resourceProductSchema } from "./commercialResourceDefinition";
import { LEASING_ASSET_TYPES } from "./leasing";

/** A financing request is distinct from the client's reusable profile. No automatic lender submission. */
const assetTypes = LEASING_ASSET_TYPES.map(item => item.value) as [string, ...string[]];
export const prospectFinancingSchema = z.object({
  product: resourceProductSchema,
  amount: z.number().finite().int().min(10000).max(1000000000000),
  termMonths: z.number().int().min(1).max(360),
  purpose: z.string().trim().min(5).max(600),
  leasingAssetType: z.enum(assetTypes).optional(),
}).strict().superRefine((data, context) => {
  if (data.product === "arrendamiento" && !data.leasingAssetType)
    context.addIssue({ code: "custom", path: ["leasingAssetType"], message: "Indica el tipo de activo para el arrendamiento" });
  if (data.product !== "arrendamiento" && data.leasingAssetType)
    context.addIssue({ code: "custom", path: ["leasingAssetType"], message: "El activo únicamente aplica a arrendamiento" });
});
export type ProspectFinancing = z.infer<typeof prospectFinancingSchema>;

/** When an offer has no explicit structured family, it cannot count as a match. */
export function normalizeFinancingFamily(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.toLowerCase().trim().replace(/[\\s-]+/g, "_");
  const aliases: Record<string, string> = {
    credito_simple: "simple", simple: "simple", credito_tradicional: "simple",
    capital_trabajo: "simple", capital_de_trabajo: "simple",
    credito_revolvente: "revolvente", revolvente: "revolvente", linea_revolvente: "revolvente",
    factoraje: "factoraje", factoring: "factoraje",
    arrendamiento: "arrendamiento", arrendamiento_puro: "arrendamiento",
    hipotecario: "hipotecario", hipotecario_vivienda: "hipotecario", hipotecario_empresarial: "hipotecario",
    garantia_inmobiliaria_empresarial: "hipotecario",
    tpv_anticipo: "tpv_anticipo", tpv: "tpv_anticipo", anticipo_ventas: "tpv_anticipo",
  };
  return aliases[name] || null;
}
export function matchesFinancingFamily(product: {productType?:unknown; template?:{category?:unknown}} | null, family:string) {
  const type=normalizeFinancingFamily(product?.productType);
  const template=normalizeFinancingFamily(product?.template?.category);
  if (type && template && type !== template) return false; // conflicting published classification
  return (type || template) === normalizeFinancingFamily(family);
}
