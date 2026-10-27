/**
 * Approved six-family catalog from migration 0007.
 * Resolve by stable catalog_family metadata first and by canonical/legacy names second.
 * Never guess a lender-specific template, unarchive old variants, or create duplicates.
 */
export type V5Template = {
  id: string;
  name: string;
  isActive?: boolean | null;
  baseConfiguration?: unknown;
};

const normalize = (value: unknown): string => String(value ?? "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .trim().toLowerCase().replace(/\s+/g, " ");

export const V5_TEMPLATE_FAMILIES: Record<string, {
  catalog: string;
  names: string[];
  productType: string;
  segment?: "empresarial";
}> = {
  credito_simple: {
    catalog: "credito_simple", names: ["Crédito Simple", "Simple"], productType: "credito_simple",
  },
  revolvente: {
    catalog: "credito_revolvente",
    names: ["Crédito Revolvente", "Revolvente"], productType: "credito_revolvente",
  },
  arrendamiento: {
    catalog: "arrendamiento",
    names: ["Arrendamiento", "Arrendamiento Puro / Financiero"],
    productType: "arrendamiento",
  },
  hipotecario: {
    catalog: "hipotecario",
    names: ["Hipotecario", "Hipotecario Empresarial"], productType: "hipotecario",
  },
  garantia_inmobiliaria_empresarial: {
    catalog: "hipotecario",
    names: ["Hipotecario", "Hipotecario Empresarial"],
    productType: "hipotecario",
    segment: "empresarial",
  },
  factoraje: {
    catalog: "factoraje",
    names: ["Factoraje", "Factoraje Financiero"], productType: "factoraje",
  },
  anticipo_ventas_tpv: {
    catalog: "anticipo_ventas_tpv",
    names: ["Anticipo de Ventas (TPV)", "Anticipo de Ventas (Terminal TPV)"],
    productType: "anticipo_ventas_tpv",
  },
};

export function resolveMasterV5Template<T extends V5Template>(
  templates: T[], family: string,
): { template: T | null; productType: string | null; segment?: "empresarial"; error?: string } {
  const rule = V5_TEMPLATE_FAMILIES[family];
  if (!rule) return { template: null, productType: null,
    error: "Familia no reconocida: " + family };
  const active = templates.filter(t => t.isActive === true);
  const byMetadata = active.filter(t => {
    const c = t.baseConfiguration;
    return !!c && typeof c === "object" &&
      normalize((c as Record<string, unknown>).catalog_family) === rule.catalog;
  });
  // The migrated catalog contains one canonical family; if more than one
  // claims the same family, do not invent an assignment.
  if (byMetadata.length > 1) return { template: null, productType: rule.productType,
    error: "Catálogo ambiguo para " + family + ": más de una plantilla activa con catalog_family=" + rule.catalog };
  if (byMetadata.length === 1) return { template: byMetadata[0], productType: rule.productType, segment: rule.segment };
  for (const canonicalName of rule.names) {
    const matches = active.filter(t => normalize(t.name) === normalize(canonicalName));
    if (matches.length > 1) return { template: null, productType: rule.productType,
      error: "Catálogo ambiguo: nombre de plantilla duplicado " + canonicalName };
    if (matches.length === 1) return { template: matches[0], productType: rule.productType, segment: rule.segment };
  }
  return { template: null, productType: rule.productType,
    error: "No existe plantilla activa para " + family + ". Revisar catálogo de Productos; no modificar Excel." };
}


/**
 * Six approved families, not 52 new product templates. The import can
 * provision an absent active canonical family in Staging, atomically with
 * its draft offers. Existing templates (incl. published identities) remain intact.
 */
export type V5CatalogBlueprint = {
  family: string;
  name: string;
  category: string;
  profiles: string[];
  description: string;
  variables: Record<string, unknown>;
  variants: string[];
};
const approvedProfiles = ["persona_moral", "fisica_empresarial"];
export const V5_CATALOG_BLUEPRINTS: Record<string, V5CatalogBlueprint> = {
  credito_simple: {
    family: "credito_simple", name: "Crédito Simple", category: "business",
    profiles: approvedProfiles, description: "Crédito simple empresarial; garantías y flujos TPV como variables por oferta.",
    variables: { requiere_garantia: { type: "select", required: false }, tipo_garantia: { type: "select", required: false },
      destino_financiamiento: { type: "select", required: false }, usa_flujos_tpv: { type: "boolean", required: false } },
    variants: ["con_garantia", "sin_garantia", "liquidez", "agropecuario", "flujos_tpv"],
  },
  credito_revolvente: {
    family: "credito_revolvente", name: "Crédito Revolvente", category: "revolvente",
    profiles: approvedProfiles, description: "Crédito revolvente para tesorería y capital de trabajo.",
    variables: { requiere_garantia: { type: "select", required: false }, destino_financiamiento: { type: "select", required: false } },
    variants: ["con_garantia", "sin_garantia", "capital_trabajo"],
  },
  arrendamiento: {
    family: "arrendamiento", name: "Arrendamiento", category: "arrendamiento",
    profiles: approvedProfiles, description: "Arrendamiento puro o financiero de vehículos, maquinaria y equipo.",
    variables: { modalidad_arrendamiento: { type: "select", required: false }, tipo_activo_arrendado: { type: "select", required: false } },
    variants: ["puro", "financiero", "vehicular", "maquinaria", "equipo", "tecnologia"],
  },
  hipotecario: {
    family: "hipotecario", name: "Hipotecario", category: "hipotecario",
    profiles: ["persona_moral", "fisica_empresarial", "fisica"],
    description: "Hipotecario vivienda y empresarial; segmentos incompatibles salvo aceptación expresa.",
    variables: { segmento_hipotecario: { type: "select", required: false },
      destino_financiamiento: { type: "select", required: false }, requiere_garantia: { type: "select", required: false } },
    variants: ["vivienda", "empresarial"],
  },
  factoraje: {
    family: "factoraje", name: "Factoraje", category: "factoraje",
    profiles: approvedProfiles, description: "Factoraje de cuentas por cobrar y facturas.",
    variables: { destino_financiamiento: { type: "select", required: false } },
    variants: ["cuentas_por_cobrar", "facturas"],
  },
  anticipo_ventas_tpv: {
    family: "anticipo_ventas_tpv", name: "Anticipo de Ventas (TPV)", category: "anticipo_ventas",
    profiles: ["persona_moral", "fisica_empresarial", "sin_sat"],
    description: "Anticipo ligado a ventas por terminal punto de venta, distinto de un crédito simple.",
    variables: { usa_flujos_tpv: { type: "boolean", required: false } },
    variants: ["anticipo_tpv"],
  },
};

/**
 * Read-only preflight for the V5 import. An absent canonical family is a
 * planned creation, NOT a preview error. Ambiguous catalogs are fatal.
 */
export function planMasterV5Catalog<T extends V5Template>(
  templates: T[], requestedFamilies: string[],
): { create: V5CatalogBlueprint[]; errors: string[] } {
  const create: V5CatalogBlueprint[] = [];
  const errors: string[] = [];
  const families = new Set<string>();
  for (const family of requestedFamilies) {
    const rule = V5_TEMPLATE_FAMILIES[family];
    if (!rule) { errors.push("Familia no reconocida: " + family); continue; }
    if (families.has(rule.catalog)) continue;
    families.add(rule.catalog);
    const outcome = resolveMasterV5Template(templates, family);
    if (outcome.template) continue;
    if (!outcome.error?.startsWith("No existe plantilla activa")) {
      errors.push(outcome.error || "Catálogo inconsistente: " + family);
      continue;
    }
    const blueprint = V5_CATALOG_BLUEPRINTS[rule.catalog];
    if (!blueprint) { errors.push("Sin familia aprobada para " + rule.catalog); continue; }
    // An explicitly deactivated canonical family should not be silently
    // resurrected or duplicated; it requires an admin catalog decision.
    const archivedCanonical = templates.find(t => t.isActive === false &&
      (normalize(t.name) === normalize(blueprint.name) ||
        (typeof t.baseConfiguration === "object" && t.baseConfiguration !== null &&
          normalize((t.baseConfiguration as Record<string, unknown>).catalog_family) === rule.catalog)));
    if (archivedCanonical) {
      errors.push("Familia canónica " + blueprint.name + " está desactivada: requiere revisión del catálogo.");
      continue;
    }
    create.push(blueprint);
  }
  return { create, errors };
}
