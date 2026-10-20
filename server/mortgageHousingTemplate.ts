// The mortgage-lead flow must reuse the six-family catalog, not create a seventh template.
// A generic Hipotecario family is acceptable only when explicitly configured for vivienda;
// the specific segment is persisted on each mortgage submission, not inferred from category.
export type HousingTemplateCandidate = {
  name?: string | null;
  category?: string | null;
  isActive?: boolean | null;
  baseConfiguration?: unknown;
};

export function selectHousingMortgageTemplate<T extends HousingTemplateCandidate>(
  templates: readonly T[],
): T | undefined {
  const active = templates.filter((template) => template.isActive === true);
  const normalizedName = (name?: string | null) => name?.trim().toLocaleLowerCase("es-MX");

  // Preserve support for an explicitly named legacy housing template if still active.
  const housing = active.find((template) => normalizedName(template.name) === "hipotecario vivienda");
  if (housing) return housing;

  // The approved consolidated family includes vivienda + empresarial; a bare category
  // match does NOT prove housing eligibility.
  return active.find((template) => {
    if (normalizedName(template.name) !== "hipotecario" || template.category !== "hipotecario") return false;
    const config = template.baseConfiguration;
    if (!config || typeof config !== "object" || Array.isArray(config)) return false;
    const family = config as { catalog_family?: unknown; variants?: unknown };
    return family.catalog_family === "hipotecario" &&
      Array.isArray(family.variants) && family.variants.includes("vivienda");
  });
}
