import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { quickClientSchema } from "../../shared/quickClientValidation";
import { CLIENT_TYPE_PRESENTATION } from "../../client/src/lib/clientTypePresentation";
import { getProfileEnrichmentSuggestions } from "../../client/src/lib/clientProfileGuidance";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const minimal = { type: "persona_moral", businessName: "Empresa Ejemplo SA de CV", phone: "5512345678", email: "" };

describe("Alta de clientes postlanzamiento — UX incremental", () => {
  it("permite registrar una empresa con contacto sin datos crediticios o SAT completos", () => {
    expect(quickClientSchema.safeParse(minimal).success).toBe(true);
    expect(quickClientSchema.safeParse({ ...minimal, businessName: "" }).success).toBe(false);
    expect(quickClientSchema.safeParse({ ...minimal, phone: "", email: "" }).success).toBe(false);
    expect(quickClientSchema.safeParse({ ...minimal, phone: "", email: "contacto@ejemplo.mx" }).success).toBe(true);
  });

  it("valida los perfiles PF, PFAE y Sin SAT sin exigir datos sensibles", () => {
    for (const type of ["fisica", "fisica_empresarial", "sin_sat"]) {
      expect(quickClientSchema.safeParse({ type, firstName: "Laura", phone: "5512345678" }).success).toBe(true);
    }
    expect(quickClientSchema.safeParse({ type: "fisica", firstName: "", email: "valido@example.com" }).success).toBe(false);
    expect(quickClientSchema.safeParse({ type: "sin_sat", firstName: "Laura", phone: "5512" }).success).toBe(false);
  });

  it("consistencia de color y etiquetas en los cuatro perfiles", () => {
    expect(CLIENT_TYPE_PRESENTATION.persona_moral.dotClass).toContain("blue");
    expect(CLIENT_TYPE_PRESENTATION.fisica_empresarial.dotClass).toContain("violet");
    expect(CLIENT_TYPE_PRESENTATION.fisica.dotClass).toContain("emerald");
    expect(CLIENT_TYPE_PRESENTATION.sin_sat.dotClass).toContain("slate");
    const listing = source("client/src/components/Clients/ClientList.tsx");
    const detail = source("client/src/pages/ClientDetailPage.tsx");
    expect(listing).toContain("CLIENT_TYPE_PRESENTATION[client.type]");
    expect(detail).toContain("CLIENT_TYPE_PRESENTATION[type]");
  });

  it("alta rápida comprueba duplicados antes de la creación y no expone otro tenant", () => {
    const ui = source("client/src/components/Clients/QuickClientForm.tsx");
    const duplicateCheck = ui.indexOf('const result = await checkDuplicate(fields);', ui.indexOf("const handleSave"));
    const create = ui.indexOf('apiRequest("POST", "/api/clients", payload)');
    expect(duplicateCheck).toBeGreaterThan(-1);
    expect(create).toBeGreaterThan(duplicateCheck);
    expect(ui).toContain("if (result?.clientExists)");
    expect(ui).toContain("duplicate?.isSameTenant ? duplicate.existingClient?.id : null");
    expect(ui).not.toContain('tenantId:');
    expect(ui).not.toContain('brokerId:');
    expect(ui).not.toContain('createdBy:');
  });

  it("mantiene edición avanzada con acordeones y validación condicional por riesgo", () => {
    const advanced = source("client/src/components/Clients/ClientForm.tsx");
    expect(advanced).toContain('value="datos-basicos"');
    expect(advanced).toContain('value="perfilamiento"');
    expect(advanced).toContain('Accordion type="multiple"');
    expect(advanced).toContain('data-testid="client-advanced-profile-form"');
    expect(advanced).not.toContain("Estado civil es requerido para Persona Física");
    expect(advanced).toContain('data.atrasosDeudasBuro === "si"');
    expect(advanced).toContain('data.cuentaConGarantiaFisica === "hipotecaria"');
  });

  it("las sugerencias no inventan requisitos del catálogo ni scoring", () => {
    const client: any = { type: "persona_moral", phone: "5512345678", email: "ejemplo@dominio.com", rfc: null,
      industry: "", yearsInBusiness: null, ingresoMensualPromedio: null, buroEmpresa: null, creditosVigentes: null };
    const missing = getProfileEnrichmentSuggestions(client);
    expect(missing).toContain("Giro o actividad");
    expect(missing).toContain("Ingreso o facturación aproximada");
    expect(missing).not.toContain("Teléfono de contacto");
    const guidance = source("client/src/components/Clients/ClientProfileGuidance.tsx");
    expect(guidance).toContain("No calculamos porcentajes de elegibilidad");
  });

  it("registro nuevo abre detalle y no rompe edición existente de cliente", () => {
    const clients = source("client/src/pages/Clients.tsx");
    expect(clients).toContain("editingClient ? (");
    expect(clients).toContain("<QuickClientForm");
    expect(clients).toContain('setLocation(`/clientes/${savedClient.id}`)');
    expect(clients).toContain('setLocation(`/clientes/${existingClientId}`)');
  });
});
