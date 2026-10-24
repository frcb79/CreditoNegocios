import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isSidebarItemActive } from "../../client/src/lib/sidebarNavigation";

describe("Super Admin sidebar route and tab active state", () => {
  it("highlights Promotions only when /admin/usuarios?tab=promos is visible", () => {
    expect(isSidebarItemActive("/admin/usuarios","?tab=promos","/admin/usuarios?tab=promos")).toBe(true);
    expect(isSidebarItemActive("/admin/usuarios","?tab=promos","/admin/usuarios")).toBe(false);
  });
  it("highlights Users on its other tabs, including direct links and status requests", () => {
    for (const search of ["","?tab=organization","?tab=global","?tab=status-requests"]) {
      expect(isSidebarItemActive("/admin/usuarios",search,"/admin/usuarios")).toBe(true);
      expect(isSidebarItemActive("/admin/usuarios",search,"/admin/usuarios?tab=promos")).toBe(false);
    }
  });
  it("never highlights unrelated paths or promos on non-Users views", () => {
    expect(isSidebarItemActive("/clientes","?tab=promos","/admin/usuarios?tab=promos")).toBe(false);
    expect(isSidebarItemActive("/admin/auditoria","","/admin/usuarios")).toBe(false);
    expect(isSidebarItemActive("/recursos-comerciales","","/recursos-comerciales")).toBe(true);
  });
  it("keeps sidebar, internal tab clicks and browser deep links in sync", () => {
    const sidebar=readFileSync(resolve(process.cwd(),"client/src/components/Sidebar.tsx"),"utf8");
    const page=readFileSync(resolve(process.cwd(),"client/src/pages/UserManagement.tsx"),"utf8");
    expect(sidebar).toContain("isSidebarItemActive(location, window.location.search, item.href)");
    expect(page).toContain("useSearch()");
    expect(page).toContain("setActiveTab(getUserManagementTab(search))");
    expect(page).toContain("onValueChange={changeMainTab}");
    expect(page).toContain('/admin/usuarios?tab=${encodeURIComponent(tab)}');
  });
});
