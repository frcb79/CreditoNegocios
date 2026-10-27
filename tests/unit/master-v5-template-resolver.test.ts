import { resolveMasterV5Template } from "../../server/masterV5TemplateResolver";
import { normalizeV5Family } from "../../server/masterV5Preview";

const canonical = [
  ["Crédito Simple", "credito_simple"],
  ["Crédito Revolvente", "credito_revolvente"],
  ["Arrendamiento", "arrendamiento"],
  ["Hipotecario", "hipotecario"],
  ["Factoraje", "factoraje"],
  ["Anticipo de Ventas (TPV)", "anticipo_ventas_tpv"],
].map(([name, family], i) => ({
  id: "tpl-" + i, name, isActive: true,
  baseConfiguration: { catalog_family: family },
}));

const legacy = [
  "Simple", "Crédito Revolvente", "Arrendamiento Puro / Financiero",
  "Hipotecario Empresarial", "Factoraje Financiero",
  "Anticipo de Ventas (Terminal TPV)",
].map((name, i) => ({ id: "old-" + i, name, isActive: true, baseConfiguration: {} }));

describe("Master V5 - product family template reconciliation", () => {
  const families = [
    "credito_simple", "revolvente", "arrendamiento",
    "hipotecario", "garantia_inmobiliaria_empresarial",
    "factoraje", "anticipo_ventas_tpv",
  ];
  it.each(families)("links %s to canonical catalog", family => {
    const r = resolveMasterV5Template(canonical, family);
    expect(r.error).toBeUndefined();
    expect(r.template).not.toBeNull();
    expect(r.template?.isActive).toBe(true);
  });
  it.each(families)("accepts old %s family title", family => {
    const r = resolveMasterV5Template(legacy, family);
    expect(r.error).toBeUndefined();
    expect(r.template).not.toBeNull();
  });
  it("specifically links Arrendamiento Puro FinBe ABC to old leasing template", () => {
    const r = resolveMasterV5Template(legacy, normalizeV5Family("Arrendamiento"));
    expect(r.template?.name).toBe("Arrendamiento Puro / Financiero");
    expect(r.productType).toBe("arrendamiento");
  });
  it("keeps TPV advances distinct from simple credit", () => {
    expect(normalizeV5Family("Anticipo de ventas / TPV")).toBe("anticipo_ventas_tpv");
    expect(normalizeV5Family("Crédito simple")).toBe("credito_simple");
  });
  it("uses hipotecario family with an enterprise-only segment", () => {
    const r = resolveMasterV5Template(canonical, normalizeV5Family("Crédito hipotecario empresarial"));
    expect(r.template?.name).toBe("Hipotecario");
    expect(r.productType).toBe("hipotecario");
    expect(r.segment).toBe("empresarial");
  });
  it("does not select archived legacy variants", () => {
    const r = resolveMasterV5Template([{ id: "off", name: "Arrendamiento Puro / Financiero", isActive: false }], "arrendamiento");
    expect(r.template).toBeNull();
    expect(r.error).toMatch(/No existe plantilla activa/);
  });
  it("blocks ambiguous catalog identity instead of guessing", () => {
    const t = { name: "Arrendamiento", isActive: true, baseConfiguration: { catalog_family: "arrendamiento" } };
    const r = resolveMasterV5Template([{ id: "a", ...t }, { id: "b", ...t }], "arrendamiento");
    expect(r.template).toBeNull();
    expect(r.error).toMatch(/ambiguo/);
  });
});
