import { publicClientProfileSchema, clientProfileFormSchema, profileForPublicSubmission } from "../../shared/clientProfileValidation";
import { profileBlankUpdates } from "../../server/prospectProfilePersistence";

describe("Public prospect profile uses the existing form and preserves recorded data", () => {
  const base = { type: "fisica", firstName: "Cliente", phone: "5512345678" };
  it("accepts incremental profiles and validates client identity/contact", () => {
    for (const type of ["fisica", "fisica_empresarial", "sin_sat", "persona_moral"]) expect(publicClientProfileSchema.safeParse({ ...base, type, businessName: "Negocio" }).success).toBe(true);
    expect(publicClientProfileSchema.safeParse({ ...base, phone: "123" }).success).toBe(false);
    expect(publicClientProfileSchema.safeParse({ ...base, email: "incorrecto" }).success).toBe(false);
    expect(publicClientProfileSchema.safeParse({ ...base, type: "persona_moral" }).success).toBe(false);
  });
  it("enforces the same conditional financial validation on server and existing form", () => {
    const partial = { ...base, atrasosDeudasBuro: "si" };
    expect(publicClientProfileSchema.safeParse(partial).success).toBe(false);
    expect(clientProfileFormSchema.safeParse(partial).success).toBe(false);
    expect(publicClientProfileSchema.safeParse({ ...partial, atrasosDeudasBuroDetalles: "Atraso aclarado" }).success).toBe(true);
  });
  it("rejects ownership, status, role and arbitrary field injection", () => {
    for (const key of ["brokerId", "tenantId", "createdBy", "isActive", "originOpportunity", "id", "role", "password"]) expect(publicClientProfileSchema.safeParse({ ...base, [key]: "attacker" }).success).toBe(false);
    expect(publicClientProfileSchema.safeParse(profileForPublicSubmission({ ...base, brokerId: "owner", isActive: true })).success).toBe(true);
  });
  it("fills blanks only and never changes recorded identity or known financial values", () => {
    const profile = publicClientProfileSchema.parse({ ...base, phone: "5599999999", ingresoAnual: "1000000-2000000", rfc: "AAAA000000AAA" });
    const updated = profileBlankUpdates({ type: "fisica", phone: "5511111111", ingresoAnual: "hasta-250000", rfc: null }, profile);
    expect(updated.rfc).toBe("AAAA000000AAA");
    expect(updated).not.toHaveProperty("phone");
    expect(updated).not.toHaveProperty("ingresoAnual");
    expect(updated).not.toHaveProperty("type");
    expect(profileBlankUpdates({ingresoAnual:"no-disponible"},profile).ingresoAnual).toBe("1000000-2000000");
  });
});
