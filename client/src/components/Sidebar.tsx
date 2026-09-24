import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useNotifications } from "@/contexts/NotificationContext";
import { buildApiUrl } from "@/lib/runtimeConfig";
import {
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  PieChart,
  Users,
  CreditCard,
  Coins,
  Repeat,
  Network,
  Clock,
  DollarSign,
  Building2,
  Layers,
  FileText,
  BarChart3,
  FileSpreadsheet,
  Users2,
  Settings,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";

interface NavItemDef {
  name: string;
  href: string;
  icon: LucideIcon;
  section: "operacion" | "catalogos" | "supervision" | "admin";
  adminOnly?: boolean;
  platformAdminOnly?: boolean;
  brokerOnly?: boolean;
}

const navigation: NavItemDef[] = [
  // Operación
  { name: 'Dashboard', href: '/', icon: PieChart, section: "operacion" },
  { name: 'Clientes', href: '/clientes', icon: Users, section: "operacion" },
  { name: 'Gestión de Créditos', href: '/creditos', icon: CreditCard, section: "operacion" },
  { name: 'Mis Créditos', href: '/mis-solicitudes', icon: Coins, brokerOnly: true, section: "operacion" },
  { name: 'Renovaciones', href: '/re-gestion', icon: Repeat, section: "operacion" },
  // Catálogos y Productos
  { name: 'Financieras', href: '/financieras', icon: Building2, section: "catalogos" },
  { name: 'Productos', href: '/sistema-productos', icon: Layers, section: "catalogos" },
  { name: 'Comisiones', href: '/comisiones', icon: DollarSign, section: "catalogos" },
  { name: 'Documentos', href: '/documentos', icon: FileText, section: "catalogos" },
  // Supervisión y Red
  { name: 'Aprobaciones', href: '/solicitudes-pendientes', icon: Clock, platformAdminOnly: true, section: "supervision" },
  { name: 'Red de Brokers', href: '/red-brokers', icon: Network, adminOnly: true, section: "supervision" },
  { name: 'Reportes', href: '/reportes', icon: BarChart3, adminOnly: true, section: "supervision" },
];

const adminNavigation: NavItemDef[] = [
  { name: 'Importación', href: '/importacion-masiva', icon: FileSpreadsheet, adminOnly: true, section: "admin" },
  { name: 'Usuarios', href: '/admin/usuarios', icon: Users2, adminOnly: true, section: "admin" },
];

const bottomNavigation = [
  { name: 'Configuración', href: '/configuracion', icon: Settings },
];

const sectionLabels: Record<string, string> = {
  operacion: "Operación",
  catalogos: "Catálogos",
  supervision: "Supervisión",
  admin: "Administración",
};

export default function Sidebar() {
  const [location] = useLocation();
  const { user } = useAuth();
  const { unreadCount } = useNotifications();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'master_broker';
  const isFullAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  
  const { data: allTargets } = useQuery<any[]>({
    queryKey: ["/api/credit-submission-targets"],
    enabled: isFullAdmin,
  });

  const winnersPendingDispersal = allTargets?.filter(
    (t: any) => (t.status === 'selected_winner' || t.isWinner) && t.status !== 'dispersed'
  ).length || 0;

  const totalPendingAdmin = allTargets?.filter(
    (t: any) => t.status === 'pending_admin'
  ).length || 0;

  const { data: userTenants } = useQuery<any[]>({
    queryKey: ["/api/tenants"],
    enabled: !!user,
  });
  const hasTenantOrg = Boolean(userTenants && userTenants.length > 0);

  const filteredNavigation = navigation.filter(item => {
    if (item.platformAdminOnly && !isFullAdmin) return false;
    if (item.adminOnly && !isAdmin) return false;
    if (item.brokerOnly && isFullAdmin) return false;
    return true;
  });
  
  const adminItems: NavItemDef[] = isFullAdmin 
    ? adminNavigation 
    : (hasTenantOrg 
        ? [{ name: 'Mi Organización', href: '/admin/usuarios', icon: Users2, section: "admin" }] 
        : []);

  const baseItems = [...filteredNavigation, ...adminItems];

  // Granular module filtering based on user.permissions.modules
  const userPermissions = (user?.permissions as any) || {};
  const allowedModules: string[] | undefined = Array.isArray(userPermissions.modules) ? userPermissions.modules : undefined;

  const hrefToModule: Record<string, string> = {
    '/': 'dashboard',
    '/clientes': 'clientes',
    '/creditos': 'creditos',
    '/mis-solicitudes': 'creditos',
    '/re-gestion': 'creditos',
    '/red-brokers': 'red_brokers',
    '/solicitudes-pendientes': 'aprobaciones',
    '/comisiones': 'comisiones',
    '/financieras': 'financieras',
    '/sistema-productos': 'sistema_productos',
    '/documentos': 'documentos',
    '/reportes': 'reportes',
    '/importacion-masiva': 'importacion',
    '/admin/usuarios': 'usuarios',
    '/configuracion': 'configuracion',
  };

  // Non-originator check: Collaborators with canOriginate: false do not see Comisiones
  const userMemberships = (user as any)?.memberships || [];
  const isNonOriginatorOnly = userMemberships.length > 0 &&
    userMemberships.every((m: any) => m.role === 'member' && m.canOriginate === false) &&
    !isFullAdmin && user?.role !== 'master_broker';

  const allNavigationItems = (user?.role === 'super_admin' || !allowedModules || allowedModules.length === 0)
    ? baseItems.filter(item => !(item.href === '/comisiones' && isNonOriginatorOnly))
    : baseItems.filter(item => {
        if (item.href === '/comisiones' && isNonOriginatorOnly) return false;
        if (item.href === '/admin/usuarios' && hasTenantOrg) return true;
        const modKey = hrefToModule[item.href];
        return !modKey || allowedModules.includes(modKey);
      });

  // Group items by section preserving order
  const sectionsOrder: Array<"operacion" | "catalogos" | "supervision" | "admin"> = [
    "operacion",
    "catalogos",
    "supervision",
    "admin",
  ];

  const groupedItems = sectionsOrder.map((sec) => ({
    section: sec,
    label: sectionLabels[sec],
    items: allNavigationItems.filter((item) => item.section === sec),
  })).filter((grp) => grp.items.length > 0);

  useEffect(() => {
    setIsMobileOpen(false);
  }, [location]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setIsMobileOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleLogout = async () => {
    const logoutCandidates = [
      { method: 'GET', url: buildApiUrl('/api/logout') },
      { method: 'POST', url: buildApiUrl('/api/logout') },
      { method: 'POST', url: buildApiUrl('/api/auth/logout') },
    ];

    for (const candidate of logoutCandidates) {
      try {
        const response = await fetch(candidate.url, {
          method: candidate.method,
          credentials: 'include',
        });

        if (response.ok || response.status === 401 || response.redirected) {
          break;
        }
      } catch {
        // Try next candidate and always finish with local redirect.
      }
    }

    window.location.assign('/');
  };

  const SidebarContent = ({ collapsed = false, testIdSuffix = '' }: { collapsed?: boolean; testIdSuffix?: string }) => (
    <div className="flex flex-col h-full">
      {/* Brand Header: Only logo/brand */}
      <div className={cn("border-b border-sidebar-border/70 flex items-center justify-center flex-shrink-0", collapsed ? "p-2 h-16" : "px-4 py-3 h-16")}>
        {collapsed ? (
          <div className="w-9 h-9 bg-gradient-to-r from-primary to-secondary rounded-lg flex items-center justify-center shadow-xs">
            <span className="text-white font-bold text-sm font-mono">CN</span>
          </div>
        ) : (
          <div className="h-11 w-full flex items-center justify-center overflow-hidden px-1">
            <img 
              src="/credito-negocios-full-logo.jpg" 
              alt="Credito Negocios" 
              className="h-11 max-h-11 w-auto max-w-[215px] object-contain object-center" 
            />
          </div>
        )}
      </div>

      {/* Grouped Navigation */}
      <nav className={cn(
        "flex-1 py-3 space-y-2.5 overflow-y-auto scrollbar-hide",
        collapsed ? "px-2" : "px-3"
      )}>
        {groupedItems.map((grp, grpIdx) => (
          <div key={grp.section} className="space-y-1">
            {!collapsed ? (
              <div className="px-2.5 pt-1.5 pb-1 flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-sidebar-foreground/60">
                  {grp.label}
                </span>
                {grpIdx > 0 && <span className="h-px flex-1 ml-2.5 bg-sidebar-border/50" />}
              </div>
            ) : grpIdx > 0 ? (
              <div className="my-2 border-t border-sidebar-border/60 mx-1" />
            ) : null}

            {grp.items.map((item) => {
              const isActive = location === item.href;
              const IconComp = item.icon;
              
              return (
                <Link key={item.name} href={item.href} onClick={() => setIsMobileOpen(false)}>
                  <div
                    className={cn(
                      "flex items-center rounded-lg font-medium transition-colors cursor-pointer relative",
                      collapsed ? "justify-center p-2.5" : "justify-between px-3 py-2 text-sm",
                      isActive
                        ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-xs font-semibold"
                        : "text-sidebar-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground"
                    )}
                    data-testid={`nav-${item.name.toLowerCase().replace(/\s+/g, '-')}${testIdSuffix}`}
                    title={collapsed ? item.name : undefined}
                  >
                    <div className={cn("flex items-center min-w-0", collapsed ? "" : "gap-3")}>
                      <IconComp className={cn(
                        "flex-shrink-0",
                        collapsed ? "h-5 w-5" : "h-[18px] w-[18px]",
                        isActive ? "text-sidebar-primary-foreground" : "text-sidebar-foreground/80"
                      )} />
                      {!collapsed && (
                        <span className="truncate text-sm font-medium tracking-tight">
                          {item.name}
                        </span>
                      )}
                    </div>
                    {!collapsed && item.href === '/solicitudes-pendientes' && winnersPendingDispersal > 0 && (
                      <span className="ml-auto inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-white animate-pulse shadow-xs" title={`${winnersPendingDispersal} propuesta(s) ganadora(s) por dispersar`}>
                        🏆 {winnersPendingDispersal}
                      </span>
                    )}
                    {!collapsed && item.href === '/solicitudes-pendientes' && winnersPendingDispersal === 0 && totalPendingAdmin > 0 && (
                      <span className="ml-auto inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-800 dark:text-amber-300 font-mono">
                        {totalPendingAdmin}
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer: User Identity + Settings + Logout */}
      <div className={cn(
        "border-t border-sidebar-border/70 mt-auto flex-shrink-0 bg-sidebar-background/80 space-y-2",
        collapsed ? "p-2" : "p-3"
      )}>
        {/* User Identity Mini-Card */}
        <div className={cn(
          "rounded-lg border border-sidebar-border/60 bg-sidebar-accent/40 shadow-2xs",
          collapsed ? "p-1.5 flex justify-center" : "p-2.5"
        )}>
          <div className={cn("flex items-center", collapsed ? "justify-center" : "gap-2.5")}>
            <div className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 overflow-hidden bg-sidebar-accent border border-sidebar-border/70">
              {user?.profileImageUrl || (user as any)?.customLogo ? (
                <img
                  src={user?.profileImageUrl || (user as any)?.customLogo}
                  alt="Foto"
                  className="w-full h-full object-cover"
                  onError={(event) => {
                    event.currentTarget.style.display = "none";
                  }}
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                  <span className="text-white font-semibold text-xs">
                    {user?.firstName?.[0]}{user?.lastName?.[0]}
                  </span>
                </div>
              )}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1 leading-tight">
                <p className="font-semibold text-xs text-sidebar-foreground truncate" title={`${user?.firstName} ${user?.lastName}`}>
                  {user?.firstName} {user?.lastName}
                </p>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="text-[10px] font-medium tracking-wide text-sidebar-primary bg-sidebar-accent/80 px-1.5 py-0.5 rounded capitalize inline-block border border-sidebar-border/50 truncate max-w-[140px]">
                    {user?.role?.replace('_', ' ')}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions: Settings & Logout */}
        <div className="space-y-1">
          {bottomNavigation.map((item) => {
            const isActive = location === item.href;
            const BottomIcon = item.icon;
            
            return (
              <Link key={item.name} href={item.href} onClick={() => setIsMobileOpen(false)}>
                <div
                  className={cn(
                    "flex items-center rounded-lg font-medium transition-colors cursor-pointer",
                    collapsed ? "justify-center p-2.5" : "gap-3 px-3 py-2 text-sm",
                    isActive
                      ? "bg-sidebar-primary text-sidebar-primary-foreground font-semibold shadow-xs"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground"
                  )}
                  data-testid={`nav-${item.name.toLowerCase()}${testIdSuffix}`}
                  title={collapsed ? item.name : undefined}
                >
                  <BottomIcon className={cn("flex-shrink-0", collapsed ? "h-5 w-5" : "h-[18px] w-[18px]")} />
                  {!collapsed && <span className="text-sm font-medium tracking-tight">{item.name}</span>}
                </div>
              </Link>
            );
          })}
          <button
            onClick={handleLogout}
            className={cn(
              "flex items-center rounded-lg text-sidebar-foreground hover:bg-destructive/10 hover:text-destructive transition-colors w-full",
              collapsed ? "justify-center p-2.5" : "gap-3 px-3 py-2 text-sm"
            )}
            data-testid={`nav-logout${testIdSuffix}`}
            title={collapsed ? "Cerrar Sesión" : undefined}
          >
            <LogOut className={cn("flex-shrink-0", collapsed ? "h-5 w-5" : "h-[18px] w-[18px]")} />
            {!collapsed && <span className="text-sm font-medium tracking-tight">Cerrar Sesión</span>}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <button
        onClick={() => setIsMobileOpen(true)}
        className="fixed top-4 left-4 z-40 lg:hidden bg-card shadow-lg rounded-lg p-2 border border-border"
        aria-label="Abrir menú de navegación"
        data-testid="button-open-sidebar"
      >
        <Menu className="h-6 w-6 text-foreground" />
      </button>

      {isMobileOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Mobile sidebar */}
      <div 
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 shadow-lg flex flex-col transform transition-transform duration-300 ease-in-out lg:hidden",
          isMobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
        style={{ 
          backgroundColor: 'var(--sidebar-background)', 
          borderRight: '1px solid var(--sidebar-border)' 
        }}
      >
        <button
          onClick={() => setIsMobileOpen(false)}
          className="absolute top-4 right-4 p-1 rounded-lg hover:bg-sidebar-accent"
          aria-label="Cerrar menú de navegación"
          data-testid="button-close-sidebar"
        >
          <X className="h-5 w-5 text-sidebar-foreground" />
        </button>
        
        <SidebarContent collapsed={false} testIdSuffix="-mobile" />
      </div>

      {/* Desktop sidebar */}
      <div className={cn(
        "hidden lg:flex flex-col bg-sidebar-background shadow-lg border-r border-sidebar-border transition-all duration-300 ease-in-out relative h-screen sticky top-0",
        isCollapsed ? "w-16" : "w-64"
      )}>
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="absolute -right-3 top-20 z-10 bg-card border border-sidebar-border rounded-full p-1 shadow-md hover:bg-sidebar-accent transition-colors"
          aria-label={isCollapsed ? "Expandir sidebar" : "Colapsar sidebar"}
          data-testid="button-toggle-sidebar"
        >
          {isCollapsed ? (
            <ChevronRight className="h-4 w-4 text-sidebar-foreground" />
          ) : (
            <ChevronLeft className="h-4 w-4 text-sidebar-foreground" />
          )}
        </button>
        
        <SidebarContent collapsed={isCollapsed} />
      </div>
    </>
  );
}
