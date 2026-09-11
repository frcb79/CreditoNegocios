import React from "react";
import { Route, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Lock, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import MainLayout from "@/components/MainLayout";
import Header from "@/components/Header";

interface ProtectedRouteProps {
  path: string;
  component: React.ComponentType<any>;
  allowedRoles?: string[];
  requiredModule?: string;
}

const DEFAULT_ROLE_MODULES: Record<string, string[]> = {
  super_admin: [
    "dashboard", "clientes", "creditos", "aprobaciones", "comisiones",
    "financieras", "sistema_productos", "red_brokers", "documentos",
    "reportes", "importacion", "usuarios", "configuracion"
  ],
  admin: [
    "dashboard", "clientes", "creditos", "aprobaciones", "comisiones",
    "financieras", "sistema_productos", "red_brokers", "documentos",
    "reportes", "importacion", "usuarios", "configuracion"
  ],
  master_broker: [
    "dashboard", "clientes", "creditos", "comisiones",
    "red_brokers", "documentos", "reportes", "usuarios", "configuracion"
  ],
  broker: [
    "dashboard", "clientes", "creditos", "documentos",
    "sistema_productos", "configuracion"
  ],
};

function GuardedContent({
  component: Component,
  allowedRoles,
  requiredModule,
  params,
}: {
  component: React.ComponentType<any>;
  allowedRoles?: string[];
  requiredModule?: string;
  params: any;
}) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  if (isLoading) {
    return null;
  }

  if (!isAuthenticated || !user) {
    return null;
  }

  // Super admin always has unrestricted access
  if (user.role === "super_admin") {
    return <Component params={params} />;
  }

  let isAuthorized = true;
  let denialReason = "";

  // 1. Check allowed roles
  if (allowedRoles && allowedRoles.length > 0) {
    if (!allowedRoles.includes(user.role)) {
      isAuthorized = false;
      denialReason = `Este módulo requiere privilegios de: ${allowedRoles.join(", ")}.`;
    }
  }

  // 2. Check granular module permission
  if (isAuthorized && requiredModule) {
    const permissions = (user.permissions as any) || {};
    const hasCustomModules = Array.isArray(permissions.modules) && permissions.modules.length > 0;
    const allowedModules = hasCustomModules
      ? permissions.modules
      : (DEFAULT_ROLE_MODULES[user.role] || DEFAULT_ROLE_MODULES.broker);

    if (!allowedModules.includes(requiredModule)) {
      isAuthorized = false;
      denialReason = `Tu cuenta no tiene habilitado el módulo '${requiredModule}'. Contacta al administrador para solicitar acceso.`;
    }
  }

  if (!isAuthorized) {
    return (
      <MainLayout>
        <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
          <Header
            title="Acceso Restringido"
            subtitle="Control de Acceso Basado en Roles (RBAC)"
          />

          <div className="flex flex-col items-center justify-center min-h-[50vh] p-6 text-center">
            <div className="w-16 h-16 rounded-full bg-destructive/10 border border-destructive/20 flex items-center justify-center mb-4 text-destructive shadow-sm">
              <Lock className="w-8 h-8" />
            </div>

            <h2 className="text-2xl font-bold tracking-tight text-foreground mb-2">
              No tienes permisos para ver esta sección
            </h2>

            <p className="text-muted-foreground max-w-md mb-6 text-sm">
              {denialReason || "Tu perfil actual no cuenta con las autorizaciones necesarias para ingresar a esta ruta."}
            </p>

            <div className="flex items-center gap-3">
              <Button
                variant="default"
                onClick={() => setLocation("/")}
                className="gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Volver al Dashboard
              </Button>
            </div>
          </div>
        </div>
      </MainLayout>
    );
  }

  return <Component params={params} />;
}

export function ProtectedRoute({
  path,
  component,
  allowedRoles,
  requiredModule,
}: ProtectedRouteProps) {
  return (
    <Route path={path}>
      {(params) => (
        <GuardedContent
          component={component}
          allowedRoles={allowedRoles}
          requiredModule={requiredModule}
          params={params}
        />
      )}
    </Route>
  );
}
