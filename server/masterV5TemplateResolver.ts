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
