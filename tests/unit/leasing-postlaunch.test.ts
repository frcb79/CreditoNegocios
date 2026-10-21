import { leaseLeadSchema, declaredLeasingAssets, isDeclaredLeasingOffer, leasingFilterGroup } from "../../shared/leasing";
import { evaluateOfferCompatibility } from "../../server/matching/compatibilityEvaluator";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const baseline = {
  clientType: "persona_moral", businessName: "Comercial SA", phone: "5512345678", email: "contacto@ejemplo.mx",
  assetType: "vehiculo", brand: "Toyota", model: "Corolla", year: 2026,
  unitValue: 450000, quantity: 2,
};
const evaluate = (asset: string, allowed: unknown, productType = "arrendamiento") => {
  const product = { id: "oferta", institutionId: "fi", productType, template: { category: productType }, targetProfiles: [] };
  const version = { versionNumber: 1, status: "published", conditions: {}, requirements: {},
    variablesConfiguration: allowed ? { tipo_activo_arrendado: allowed } : {} };
  return evaluateOfferCompatibility({
    credit: { requestedAmount: "900000", mortgageData: { operationType: "arrendamiento", lease: { tipo_activo_arrendado: asset } } },
    client: { type: "persona_moral" },
  }, { product, version });
};

describe("Arrendamiento ágil y especialidades declaradas", () => {
  it("requiere automóvil identificable, año y valor para cotizar", () => {
    expect(leaseLeadSchema.safeParse(baseline).success).toBe(true);
    expect(leaseLeadSchema.safeParse({ ...baseline, brand: "" }).success).toBe(false);
    expect(leaseLeadSchema.safeParse({ ...baseline, model: "" }).success).toBe(false);
    expect(leaseLeadSchema.safeParse({ ...baseline, unitValue: 0 }).success).toBe(false);
  });

  it("maquinaria, agro y transporte requieren descripción específica; datos financieros adicionales son opcionales", () => {
    expect(leaseLeadSchema.safeParse({ ...baseline, assetType: "maquinaria", assetDescription: "Excavadora hidráulica 20 t", brand: "" }).success).toBe(true);
    expect(leaseLeadSchema.safeParse({ ...baseline, assetType: "transporte_pesado", assetDescription: "" }).success).toBe(false);
    expect(leaseLeadSchema.safeParse({ ...baseline, assetType: "agro", assetDescription: "Tractor agrícola 110HP", monthlyRevenue: 240000 }).success).toBe(true);
  });

  it("permite nueva oportunidad de cliente existente sin solicitar datos de contacto nuevamente", () => {
    const { clientType, businessName, email, phone, ...operation } = baseline;
    expect(leaseLeadSchema.safeParse({ ...operation, clientId: "cliente-id" }).success).toBe(true);
    expect(leaseLeadSchema.safeParse({ ...operation }).success).toBe(false);
  });

  it("solo clasifica arrendadoras por activos declarados en la oferta", () => {
    const offer = { productType: "arrendamiento", configuration: { tipo_activo_arrendado: ["vehiculo", "agricola"] } };
    expect(isDeclaredLeasingOffer(offer)).toBe(true);
    expect(declaredLeasingAssets(offer)).toEqual(["vehiculo", "agro"]);
    expect(declaredLeasingAssets({ productType: "arrendamiento", customName: "Arrendamiento de maquinaria" })).toEqual([]);
    expect(leasingFilterGroup("vehiculo")).toBe("vehiculo");
    expect(leasingFilterGroup("maquinaria")).toBe("maquinaria_equipo");
  });

  it("matching: oferta de autos excluye maquinaria, sin activos declarados queda información insuficiente", () => {
    const offered = { allowedValues: ["vehiculo"] };
    expect(evaluate("vehiculo", offered).status).toBe("COMPATIBLE");
    expect(evaluate("maquinaria", offered).status).toBe("NOT_COMPATIBLE");
    expect(evaluate("vehiculo", undefined).status).toBe("INSUFFICIENT_DATA");
    expect(evaluate("vehiculo", offered, "credito_simple").status).toBe("NOT_COMPATIBLE");
  });

  it("alta conserva permisos de origen, comprobación de duplicados y transacción existente", () => {
    const route = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
    const start = route.indexOf("app.post('/api/leasing-leads'");
    const end = route.indexOf("// POST /api/credit-submissions/:id/targets", start);
    expect(start).toBeGreaterThan(0);
    const block = route.slice(start, end);
    for (const requirement of [
      "requireModuleAndAction('creditos', 'submit_proposals')",
      "validateCommercialOriginationAndFormalization",
      "validateClientOriginationAccess",
      "checkDuplicatesEnriched",
      "createMortgageLeadTransactional",
      "financialInstitutionIds: []",
      "operationType: 'arrendamiento'",
    ]) expect(block).toContain(requirement);
    const ui = readFileSync(resolve(process.cwd(), "client/src/components/Modals/LeasingLeadModal.tsx"), "utf8");
    expect(ui).toContain('field("unitValue", "Valor aproximado por unidad (MXN)"');
    expect(ui).toContain('data-testid="select-lease-existing-client"');
  });
});
