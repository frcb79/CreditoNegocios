import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getRequiredFormalizationDocuments } from "../../shared/legalDocuments";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Postlaunch - convenios visibles y permisos sin confundir Reglas de la Red con módulo administrativo", () => {
  const profile = read("client/src/components/LegalProfileDocuments.tsx");
  const settings = read("client/src/pages/Settings.tsx");
  const dashboard = read("client/src/pages/Dashboard.tsx");
  const sidebar = read("client/src/components/Sidebar.tsx");
  const routes = read("client/src/App.tsx");

  it("a Broker le corresponden convenio y reglas-red, a Master también reglas-master", () => {
    expect(getRequiredFormalizationDocuments("broker")).toEqual(["convenio", "reglas-red"]);
    expect(getRequiredFormalizationDocuments("master_broker")).toEqual(["convenio", "reglas-red", "reglas-master"]);
    expect(getRequiredFormalizationDocuments("admin")).toEqual([]);
  });

  it("el tab del Broker siempre muestra Mis convenios, incluso si ya está formalizado", () => {
    expect(settings).toContain('<LegalProfileDocuments user={user} showFormalizationNotice={true} />');
    expect(profile).toContain('data-testid="card-broker-required-agreements"');
    expect(profile).toContain('Mis convenios y reglas');
    expect(profile).toContain('formalizationStatus.requiredDocuments.map');
    expect(profile).toContain('formalizationStatus.acceptedDocuments.includes(document)');
    expect(profile).toContain('!formalizationStatus.isFormalized && showFormalizationNotice');
    expect(profile).toContain('formalizationStatus.isFormalized && (');
    expect(profile).toContain('getExactDocumentUrl(acc.document, acc.version)');
    expect(profile).toContain('href={`/legal/${document}`}');
  });

  it("el acceso a Red de Brokers es exclusivo de Master/Admin, independiente del documento Reglas de la Red", () => {
    expect(sidebar).toContain("href: '/red-brokers', icon: Network, adminOnly: true");
    expect(sidebar).toContain('if (item.adminOnly && !isAdmin) return false;');
    expect(routes).toContain("allowedRoles={['admin', 'super_admin', 'master_broker']}");
    expect(profile).toContain('Reglas de la Red son un documento legal');
  });

  it("Dashboard y Configuración mantienen aviso por rol y las aceptaciones vigentes se consultan al servidor", () => {
    expect(dashboard).toContain("<FormalizationPendingBanner");
    expect(settings).toContain("<FormalizationPendingBanner");
    expect(profile).toContain('"/api/legal/formalization/status"');
  });
});
