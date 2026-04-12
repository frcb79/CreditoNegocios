import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useNotifications } from "@/contexts/NotificationContext";
import { Menu, X, ChevronLeft, ChevronRight } from "lucide-react";

const navigation = [
  { name: 'Dashboard', href: '/', icon: 'fas fa-chart-pie' },
  { name: 'Clientes', href: '/clientes', icon: 'fas fa-users' },
  { name: 'Gestión de Créditos', href: '/creditos', icon: 'fas fa-credit-card' },
  { name: 'Mis Créditos', href: '/mis-solicitudes', icon: 'fas fa-coins', brokerOnly: true },
  { name: 'Renovaciones', href: '/re-gestion', icon: 'fas fa-recycle' },
  { name: 'Red de Brokers', href: '/red-brokers', icon: 'fas fa-network-wired', adminOnly: true },
  { name: 'Comisiones', href: '/comisiones', icon: 'fas fa-dollar-sign' },
  { name: 'Financieras', href: '/financieras', icon: 'fas fa-building' },
  { name: 'Productos', href: '/sistema-productos', icon: 'fas fa-layer-group' },
  { name: 'Documentos', href: '/documentos', icon: 'fas fa-file-alt' },
  { name: 'Reportes', href: '/reportes', icon: 'fas fa-chart-bar', adminOnly: true },
];

const adminNavigation = [
  { name: 'Aprobaciones', href: '/solicitudes-pendientes', icon: 'fas fa-clock', adminOnly: true },
  { name: 'Importación', href: '/importacion-masiva', icon: 'fas fa-file-import', adminOnly: true },
  { name: 'Usuarios', href: '/admin/usuarios', icon: 'fas fa-users-cog', adminOnly: true },
];

const bottomNavigation = [
  { name: 'Configuración', href: '/configuracion', icon: 'fas fa-cog' },
];

export default function Sidebar() {
  const [location] = useLocation();
  const { user } = useAuth();
  const { unreadCount } = useNotifications();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'master_broker';
  const isFullAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  
  const filteredNavigation = isAdmin 
    ? navigation 
    : navigation.filter(item => !item.adminOnly);
  
  const allNavigationItems = isFullAdmin 
    ? [...filteredNavigation, ...adminNavigation] 
    : filteredNavigation;

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

  const SidebarContent = ({ collapsed = false }: { collapsed?: boolean }) => (
    <>
      <div className={cn("border-b border-sidebar-border", collapsed ? "p-2" : "p-4 lg:p-6")}>
        <div className={cn("flex flex-col items-center", collapsed ? "space-y-1" : "space-y-2 lg:space-y-3")}>
          <div className={cn(
            "rounded-lg flex items-center justify-center overflow-hidden",
            collapsed ? "w-10 h-10" : "w-24 h-12 lg:w-32 lg:h-16"
          )}>
            {collapsed ? (
              <div className="w-10 h-10 bg-gradient-to-r from-primary to-secondary rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">CN</span>
              </div>
            ) : (
              <img 
                src="/credito-negocios-full-logo.jpg" 
                alt="Credito Negocios Logo" 
                className="w-full h-full object-contain" 
              />
            )}
          </div>
          {!collapsed && (
            <div className="text-center hidden lg:block">
              <h1 className="text-lg font-bold text-sidebar-foreground">Plataforma de Gestión Financiera</h1>
            </div>
          )}
        </div>
      </div>

      <div className={cn("border-b border-sidebar-border", collapsed ? "p-2" : "p-3 lg:p-4")}>
        <div className={cn("flex items-center", collapsed ? "justify-center" : "space-x-3")}>
          <div className={cn(
            "bg-gradient-to-r from-primary to-secondary rounded-full flex items-center justify-center flex-shrink-0",
            collapsed ? "w-10 h-10" : "w-8 h-8 lg:w-10 lg:h-10"
          )}>
            <span className={cn("text-white font-semibold", collapsed ? "text-sm" : "text-xs lg:text-sm")}>
              {user?.firstName?.[0]}{user?.lastName?.[0]}
            </span>
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sidebar-foreground text-sm lg:text-base truncate">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="text-xs text-sidebar-primary bg-sidebar-accent px-2 py-0.5 lg:py-1 rounded-full capitalize inline-block">
                {user?.role?.replace('_', ' ')}
              </p>
            </div>
          )}
        </div>
      </div>

      <nav className={cn(
        "flex-1 py-4 lg:py-6 space-y-1 lg:space-y-2 overflow-y-auto",
        collapsed ? "px-2" : "px-2 lg:px-4"
      )}>
        {allNavigationItems.map((item) => {
          const isActive = location === item.href;
          const isReGestion = item.href === '/re-gestion';
          
          return (
            <Link key={item.name} href={item.href} onClick={() => setIsMobileOpen(false)}>
              <div
                className={cn(
                  "flex items-center rounded-lg font-medium transition-colors cursor-pointer relative",
                  collapsed ? "justify-center p-2" : "justify-between px-2 lg:px-3 py-2 text-sm lg:text-base",
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent"
                )}
                data-testid={`nav-${item.name.toLowerCase().replace(/\s+/g, '-')}`}
                title={collapsed ? item.name : undefined}
              >
                <div className={cn("flex items-center min-w-0", collapsed ? "" : "gap-2 lg:gap-3")}>
                  <span className={cn(
                    "inline-flex items-center justify-center flex-shrink-0",
                    collapsed ? "w-9 h-9 rounded-full bg-sidebar-accent" : "w-5"
                  )}>
                    <i className={cn(item.icon, collapsed ? "text-base" : "text-sm")} aria-hidden="true"></i>
                  </span>
                  {!collapsed && <span className="truncate">{item.name}</span>}
                </div>
                {!collapsed && isReGestion && unreadCount > 0 && (
                  <span className="bg-warning text-white text-xs px-1.5 lg:px-2 py-0.5 lg:py-1 rounded-full flex-shrink-0">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
                {collapsed && isReGestion && unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-warning text-white text-xs w-4 h-4 rounded-full flex items-center justify-center text-[10px]">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </nav>

      <div className={cn(
        "border-t border-sidebar-border space-y-1 lg:space-y-2",
        collapsed ? "p-2" : "p-2 lg:p-4"
      )}>
        {bottomNavigation.map((item) => {
          const isActive = location === item.href;
          
          return (
            <Link key={item.name} href={item.href} onClick={() => setIsMobileOpen(false)}>
              <div
                className={cn(
                  "flex items-center rounded-lg font-medium transition-colors cursor-pointer",
                  collapsed ? "justify-center p-2" : "space-x-2 lg:space-x-3 px-2 lg:px-3 py-2 text-sm lg:text-base",
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent"
                )}
                data-testid={`nav-${item.name.toLowerCase()}`}
                title={collapsed ? item.name : undefined}
              >
                <span className={cn(
                  "inline-flex items-center justify-center flex-shrink-0",
                  collapsed ? "w-9 h-9 rounded-full bg-sidebar-accent" : "w-5"
                )}>
                  <i className={cn(item.icon, collapsed ? "text-base" : "text-sm")} aria-hidden="true"></i>
                </span>
                {!collapsed && <span>{item.name}</span>}
              </div>
            </Link>
          );
        })}
        <a
          href="/api/logout"
          className={cn(
            "flex items-center rounded-lg text-sidebar-foreground hover:bg-sidebar-accent transition-colors",
            collapsed ? "justify-center p-2" : "space-x-2 lg:space-x-3 px-2 lg:px-3 py-2 text-sm lg:text-base"
          )}
          data-testid="nav-logout"
          title={collapsed ? "Cerrar Sesión" : undefined}
        >
          <span className={cn(
            "inline-flex items-center justify-center flex-shrink-0",
            collapsed ? "w-9 h-9 rounded-full bg-sidebar-accent" : "w-5"
          )}>
            <i className={cn("fas fa-sign-out-alt", collapsed ? "text-base" : "text-sm")} aria-hidden="true"></i>
          </span>
          {!collapsed && <span>Cerrar Sesión</span>}
        </a>
      </div>
    </>
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
        
        <SidebarContent collapsed={false} />
      </div>

      {/* Desktop sidebar */}
      <div className={cn(
        "hidden lg:flex flex-col bg-sidebar-background shadow-lg border-r border-sidebar-border transition-all duration-300 ease-in-out relative",
        isCollapsed ? "w-16" : "w-64"
      )}>
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="absolute -right-3 top-20 z-10 bg-white border border-sidebar-border rounded-full p-1 shadow-md hover:bg-gray-50 transition-colors"
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
