import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const settings = readFileSync(resolve(process.cwd(), "client/src/pages/Settings.tsx"), "utf8");
const audit = readFileSync(resolve(process.cwd(), "client/src/pages/SuperAdminAudit.tsx"), "utf8");
const sidebar = readFileSync(resolve(process.cwd(), "client/src/components/Sidebar.tsx"), "utf8");

describe("UX — Configuration and Super Admin audit preserve role functionality", () => {
  it("retains exactly one commercial tab with BOTH independently saved forms and all contractual fields", () => {
    expect(settings.match(/<TabsContent value="business"/g)).toHaveLength(1);
    const business = settings.slice(settings.indexOf('<TabsContent value="business"'));
    const beforeSecurity = business.slice(0, business.indexOf("{/* Security Settings */}"));
    expect(beforeSecurity).toContain("businessForm.handleSubmit(onBusinessSubmit)");
    expect(beforeSecurity).toContain("profilingForm.handleSubmit(onProfilingSubmit)");
    for (const name of [
      "businessName", "legalRepresentativeName", "legalRepresentativePosition",
      "taxId", "businessPhone", "businessAddress", "website", "specialization",
      "profileType", "yearsInBusiness", "clientPortfolioSize", "annualGoal",
      "productsHandled", "averageTicket", "bankName", "clabe", "accountHolder",
    ]) {
      expect(settings).toContain('name="' + name + '"');
    }
    expect(settings).toContain("commercialReferences");
    expect(settings).toContain("Guardar Información");
    expect(settings).toContain("Guardar Perfilamiento");
  });
  it("does not duplicate contractual documents inside the personal profile", () => {
    const profile = settings.slice(settings.indexOf('<TabsContent value="profile"'),
      settings.indexOf('{/* Documentos contractuales'));
    expect(profile).not.toContain("<LegalProfileDocuments");
    expect(settings.match(/<LegalProfileDocuments/g)).toHaveLength(2);
    expect(settings).toContain("showLegalHistory && <LegalProfileDocuments");
    expect(settings).toContain('value="documents"');
    expect(settings).toContain("isBrokerOrMaster && (");
  });
  it("keeps legacy tab links working and prevents admin/SA from seeing broker-only tabs", () => {
    expect(settings).toContain('if (tabParam === "profiling") return "business"');
    expect(settings).toContain('tabParam === "documentos" ? "documents"');
    expect(settings).toContain('["business", "documents", "benefits"].includes(activeTab)');
    for (const tab of ["Mi cuenta", "Mi negocio", "Documentos y convenios",
      "Beneficios y acceso", "Seguridad", "Notificaciones"]) {
      expect(settings).toContain(tab);
    }
    expect(settings).not.toContain('<TabsTrigger value="profiling"');
    expect(settings).not.toContain('<TabsTrigger value="commercial_rules"');
    expect(settings).toContain('<CommercialRulesSettings />');
    expect(sidebar).toContain("name: 'Reglas comerciales'");
    expect(sidebar).toContain("user?.role === 'super_admin'");
  });
  it("retains own-account security settings and notification channels", () => {
    expect(settings).toContain("Cambiar Contraseña");
    expect(settings).toContain("Solicitar Baja de Cuenta");
    for (const name of ["emailNotifications", "whatsappNotifications",
      "pushNotifications", "creditExpiringAlerts", "commissionAlerts",
      "documentAlerts", "marketingEmails"]) expect(settings).toContain(name);
    expect(settings).toContain("myBenefits?.activePromo");
    expect(settings).toContain("/api/promos/validate");
  });
  it("presents audit actions and identities human-readably, with no raw UUIDs in the list", () => {
    expect(audit).toContain('create_status_request: "Solicitó "');
    expect(audit).toContain("new Map((users.data || []).map");
    expect(audit).toContain("new Map((requests.data || []).map");
    expect(audit).toContain("displayName(request.targetUser)");
    expect(audit).toContain("Usuario");
    expect(audit).not.toContain("{entry.entityId}");
    expect(audit).not.toContain("{entry.performedBy}");
    for (const id of ["audit-filter-search", "audit-filter-from", "audit-filter-to",
      "audit-filter-role", "audit-filter-result", "audit-filter-reset"]) {
      expect(audit).toContain(id);
    }
    expect(audit).toContain("hasta 100 eventos recientes");
  });
});
