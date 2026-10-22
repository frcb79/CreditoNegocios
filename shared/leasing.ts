import { z } from "zod";

/** Arrendamiento is one product family; these are commercial asset subtypes, not product templates. */
export const LEASING_ASSET_TYPES = [
  { value: "vehiculo", label: "Automóviles y camionetas" },
  { value: "transporte_pesado", label: "Transporte pesado (tractos, autobuses, remolques)" },
  { value: "maquinaria", label: "Maquinaria industrial o de construcción" },
  { value: "agro", label: "Maquinaria y equipo agrícola" },
  { value: "equipo", label: "Equipo productivo y tecnología" },
  { value: "otro", label: "Otro activo" },
] as const;

export const leaseLeadSchema = z.object({
  clientId: z.string().trim().min(1).optional(),
  clientType: z.enum(["persona_moral", "fisica_empresarial", "fisica"]).optional(),
  businessName: z.string().trim().max(180).optional(),
  firstName: z.string().trim().max(120).optional(),
  lastName: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(32).optional(),
  email: z.string().trim().email().max(254).optional(),
  rfc: z.string().trim().max(13).optional(),
  assetType: z.enum(["vehiculo", "transporte_pesado", "maquinaria", "agro", "equipo", "otro"]),
  assetDescription: z.string().trim().max(350).optional(),
  brand: z.string().trim().max(100).optional(),
  model: z.string().trim().max(100).optional(),
  version: z.string().trim().max(100).optional(),
  year: z.coerce.number().int().min(1980).max(2100).optional(),
  unitValue: z.coerce.number().finite().positive().max(10000000000),
  quantity: z.coerce.number().int().positive().max(10000).default(1),
  leaseModality: z.enum(["puro", "financiero", "por_definir"]).default("por_definir"),
  preferredTermMonths: z.coerce.number().int().min(6).max(120).optional(),
  initialContribution: z.coerce.number().finite().min(0).optional(),
  state: z.string().trim().max(100).optional(),
  monthlyRevenue: z.coerce.number().finite().min(0).optional(),
  yearsInBusiness: z.coerce.number().int().min(0).max(300).optional(),
  brokerNotes: z.string().trim().max(2000).optional(),
}).superRefine((data, ctx) => {
  if (!data.clientId) {
    if (!data.clientType) ctx.addIssue({ code: "custom", path: ["clientType"], message: "Selecciona el tipo de prospecto" });
    if (data.clientType === "persona_moral" && !data.businessName) ctx.addIssue({ code: "custom", path: ["businessName"], message: "Indica la razón social" });
    if (data.clientType !== "persona_moral" && !data.firstName) ctx.addIssue({ code: "custom", path: ["firstName"], message: "Indica el nombre" });
    if (!data.phone) ctx.addIssue({ code: "custom", path: ["phone"], message: "Indica el teléfono de contacto" });
    if (!data.email) ctx.addIssue({ code: "custom", path: ["email"], message: "Indica el correo de contacto" });
  }
  if (data.assetType === "vehiculo") {
    if (!data.brand) ctx.addIssue({ code: "custom", path: ["brand"], message: "Indica la marca del vehículo" });
    if (!data.model) ctx.addIssue({ code: "custom", path: ["model"], message: "Indica el modelo del vehículo" });
    if (!data.year) ctx.addIssue({ code: "custom", path: ["year"], message: "Indica el año del vehículo" });
  } else if (!data.assetDescription || data.assetDescription.length < 4) {
    ctx.addIssue({ code: "custom", path: ["assetDescription"], message: "Describe el tipo específico de maquinaria o activo" });
  }
  if (data.unitValue * data.quantity > 100000000000) {
    ctx.addIssue({ code: "custom", path: ["unitValue"], message: "Valor total fuera de rango" });
  }
});
export type LeaseLeadInput = z.infer<typeof leaseLeadSchema>;

const aliases: Record<string, string[]> = {
  vehiculo: ["vehiculo", "vehículos", "vehiculos", "automovil", "automoviles", "automóvil", "camioneta", "flotilla", "vehicular"],
  transporte_pesado: ["transporte_pesado", "transporte pesado", "tracto", "tractocamion", "tractocamión", "autobus", "autobús", "remolque"],
  maquinaria: ["maquinaria", "maquinaria industrial", "construccion", "construcción", "maquinaria pesada"],
  agro: ["agro", "agricola", "agrícola", "agropecuario", "tractor agricola", "tractor agrícola"],
  equipo: ["equipo", "tecnologia", "tecnología", "equipo productivo"],
  otro: ["otro"],
};
export function normalizeLeasingAssetType(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return Object.entries(aliases).find(([, values]) => values.includes(normalized))?.[0] || null;
}
/** Only explicit institution offer configuration can qualify an asset type; never infer it from lender name. */
export function declaredLeasingAssets(product: any, version?: any): string[] {
  const values = [
    version?.variablesConfiguration?.tipo_activo_arrendado,
    version?.conditions?.tipo_activo_arrendado,
    version?.requirements?.tipo_activo_arrendado,
    product?.configuration?.tipo_activo_arrendado,
  ];
  for (const raw of values) {
    const allowed = Array.isArray(raw) ? raw
      : typeof raw === "string" ? [raw]
      : raw && typeof raw === "object" ? (raw.allowedValues || raw.values || raw.options || raw.acceptedValues) : null;
    if (!Array.isArray(allowed) || allowed.length === 0) continue;
    return Array.from(new Set(allowed.map(normalizeLeasingAssetType).filter((v): v is string => Boolean(v))));
  }
  return [];
}
export function isDeclaredLeasingOffer(product: any): boolean {
  return product?.productType === "arrendamiento" ||
    product?.template?.category === "arrendamiento" ||
    product?.template?.baseConfiguration?.catalog_family === "arrendamiento";
}
export function leasingFilterGroup(assetType: string): string {
  return assetType === "vehiculo" ? "vehiculo" :
    assetType === "transporte_pesado" ? "transporte_pesado" :
    assetType === "agro" ? "agro" : "maquinaria_equipo";
}
