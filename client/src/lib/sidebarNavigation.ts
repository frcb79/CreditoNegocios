/**
 * Resolve active navigation using both route and query tab.
 * "Usuarios" and "Beneficios y promociones" deliberately share
 * /admin/usuarios, so path-only matching would highlight both.
 */
export function isSidebarItemActive(
  path: string,
  search: string,
  href: string
): boolean {
  const [targetPath, targetQuery] = href.split("?", 2);
  if (path !== targetPath) return false;

  if (targetPath === "/admin/usuarios") {
    const currentTab = new URLSearchParams(search).get("tab") || "organization";
    const targetTab = new URLSearchParams(targetQuery || "").get("tab");
    return targetTab ? currentTab === targetTab : currentTab !== "promos";
  }

  if (!targetQuery) return true;
  const expected = new URLSearchParams(targetQuery);
  const current = new URLSearchParams(search);
  return Array.from(expected.entries()).every(([key, value]) => current.get(key) === value);
}
