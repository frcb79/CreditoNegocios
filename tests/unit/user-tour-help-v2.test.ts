import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  USER_TOUR_QUERY_PARAM,
  USER_TOUR_QUERY_VALUE,
  USER_TOUR_VERSION,
  getLegacyUserTourStorageKey,
  getUserTourSteps,
  getUserTourStorageKey,
} from "../../client/src/lib/userTour";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const selectors = (role: string, mobile = false) =>
  getUserTourSteps(role, mobile).map(step => step.selector).filter(Boolean);

describe("Onboarding Fase A — recorrido por rol y ayuda", () => {
  it("usa referencias existentes del dashboard y sidebar, sin selectores antiguos", () => {
    const hook = read("client/src/hooks/useUserTour.ts");
    const header = read("client/src/components/Header.tsx");
    const metrics = read("client/src/components/Dashboard/MetricsGrid.tsx");
    const sidebar = read("client/src/components/Sidebar.tsx");
    expect(header).toContain('data-testid="header-title"');
    expect(metrics).toContain('data-testid="metrics-grid"');
    expect(hook).not.toContain("#dashboard-title");
    expect(hook).toContain("isVisible(step.selector)");
    for (const selector of selectors("broker")) {
      if (selector === '[data-testid="header-title"]' || selector === '[data-testid="metrics-grid"]') continue;
      const testId = selector?.match(/data-testid="([^"]+)"/)?.[1];
      expect(testId).toBeTruthy();
      expect(sidebar).toContain("data-testid={");
    }
  });

  it("separa Broker, Master y administradores sin revelar módulos privilegiados", () => {
    const broker = selectors("broker").join(" ");
    const master = selectors("master_broker").join(" ");
    const admin = selectors("admin").join(" ");
    const superAdmin = selectors("super_admin").join(" ");
    expect(broker).toContain("nav-clientes");
    expect(broker).toContain("nav-comisiones");
    expect(broker).not.toContain("nav-usuarios");
    expect(broker).not.toContain("nav-red-de-brokers");
    expect(master).toContain("nav-red-de-brokers");
    expect(master).not.toContain("nav-auditoría");
    expect(admin).toContain("nav-usuarios");
    expect(admin).not.toContain("nav-auditoría");
    expect(superAdmin).toContain("nav-auditoría-administrativa");
    for (const role of ["broker", "master_broker", "admin", "super_admin"]) {
      expect(selectors(role).join(" ")).toContain("nav-ayuda");
    }
  });

  it("mantiene un recorrido práctico de 7 a 8 pasos y no elimina mensajes ocultos", () => {
    for (const role of ["broker", "master_broker", "admin", "super_admin"]) {
      const desktop = getUserTourSteps(role, false);
      const mobile = getUserTourSteps(role, true);
      expect(desktop.length).toBeGreaterThanOrEqual(7);
      expect(desktop.length).toBeLessThanOrEqual(8);
      expect(mobile).toHaveLength(desktop.length);
    }
    const brokerText = getUserTourSteps("broker", false).map(step => step.description).join(" ");
    expect(brokerText).toContain("prospecto");
    expect(brokerText).toContain("necesidad");
    expect(brokerText).toContain("propuestas");
    expect(brokerText).toContain("Ayuda rápida");
    const hook = read("client/src/hooks/useUserTour.ts");
    expect(hook).toContain("findRenderableTarget");
    expect(hook).not.toContain(".filter((step) => !step.selector");
    expect(hook).toContain("const target = step.selector ? findRenderableTarget(step.selector) : null");
  });

  it("ofrece ayuda rápida contextual sin salir de la sección", () => {
    const quick = read("client/src/components/Help/ContextualHelpLink.tsx");
    expect(quick).toContain('variant === "quick"');
    expect(quick).toContain("setShowFullGuide(true)");
    for (const [path, slug] of [
      ["client/src/pages/Clients.tsx", "como-registro-un-cliente"],
      ["client/src/pages/Credits.tsx", "donde-reviso-mis-oportunidades"],
      ["client/src/pages/ProductSystem.tsx", "como-consulto-productos"],
      ["client/src/pages/Financieras.tsx", "como-consulto-financieras"],
      ["client/src/pages/BrokerNetwork.tsx", "que-puede-ver-un-master-broker"],
      ["client/src/pages/Commissions.tsx", "donde-consulto-mis-comisiones"],
    ]) {
      expect(read(path)).toContain('slug="' + slug + '" variant="quick"');
    }
    const brokerPanel = read("client/src/components/Dashboard/BrokerQuickStart.tsx");
    expect(brokerPanel).toContain("data-testid=\"broker-quick-start\"");
    expect(brokerPanel).toContain("data-testid=\"button-start-first-prospect\"");
    expect(read("client/src/pages/Dashboard.tsx")).toContain("<BrokerQuickStart");
  });

  it("ofrece una versión móvil centrada en el menú en lugar de elementos ocultos", () => {
    for (const role of ["broker", "master_broker", "admin", "super_admin"]) {
      const list = selectors(role, true).join(" ");
      expect(list).toContain("button-open-sidebar");
      expect(list).not.toContain("nav-usuarios");
      expect(list).not.toContain("nav-clientes");
    }
  });

  it("guarda un estado versionado por usuario y rol, separado de la marca legacy", () => {
    expect(USER_TOUR_VERSION).toBe("3");
    expect(getUserTourStorageKey("u1", "broker")).not.toEqual(getUserTourStorageKey("u1", "master_broker"));
    expect(getLegacyUserTourStorageKey("u1")).toBe("hasSeenTour_u1");
    const hook = read("client/src/hooks/useUserTour.ts");
    expect(hook).toContain('finished ? "completed" : "skipped"');
    expect(hook).toContain("localStorage.getItem(getLegacyUserTourStorageKey(user.id))");
    expect(hook).toContain("onCloseClick");
  });

  it("permite repetir desde Ayuda y consume el enlace sin recargar la página", () => {
    expect(USER_TOUR_QUERY_PARAM).toBe("recorrido");
    expect(USER_TOUR_QUERY_VALUE).toBe("inicio");
    const help = read("client/src/pages/HelpCenterPage.tsx");
    const hook = read("client/src/hooks/useUserTour.ts");
    expect(help).toContain('data-testid="button-restart-welcome-tour"');
    expect(help).toContain('setLocation("/?" + USER_TOUR_QUERY_PARAM + "=" + USER_TOUR_QUERY_VALUE)');
    expect(hook).toContain("currentUrl.searchParams.delete(USER_TOUR_QUERY_PARAM)");
    expect(hook).toContain("if (!replay && (");
  });

  it("centro de ayuda actualizado describe los tres tipos de alta con menos fricción", () => {
    const helpService = read("server/commercialHelpService.ts");
    expect(helpService).toContain("**Hipotecario Vivienda** o **Arrendamiento**");
    expect(helpService).toContain("**Guardar prospecto**");
    expect(helpService).toContain("**teléfono o correo**");
    expect(helpService).toContain("No es necesario seleccionar una financiera en este formulario");
  });
});
