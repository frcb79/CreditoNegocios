import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { NotificationProvider } from "@/contexts/NotificationContext";
import { useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { getAppBaseUrl } from "@/lib/runtimeConfig";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/Landing";
import BrokersLanding from "@/pages/BrokersLanding";
import ResetPassword from "@/pages/ResetPassword";
import Dashboard from "@/pages/Dashboard";
import Clients from "@/pages/Clients";
import ClientDetailPage from "@/pages/ClientDetailPage";
import Credits from "@/pages/Credits";
import ReGestion from "@/pages/ReGestion";
import BrokerNetwork from "@/pages/BrokerNetwork";
import Commissions from "@/pages/Commissions";
import Financieras from "@/pages/Financieras";
import FinancieraDetail from "@/pages/FinancieraDetail";
import Documents from "@/pages/Documents";
import Reports from "@/pages/Reports";
import Settings from "@/pages/Settings";
import ProductSystem from "@/pages/ProductSystem";
import PendingRequests from "@/pages/PendingRequests";
import MySubmissions from "@/pages/MySubmissions";
import ProposalComparison from "@/pages/ProposalComparison";
import UserManagement from "@/pages/UserManagement";
import DesignPreview from "@/pages/DesignPreview";
import BulkImport from "@/pages/BulkImport";
import Notifications from "@/pages/Notifications";
import { ProtectedRoute } from "@/components/ProtectedRoute";

function Router() {
  const { isAuthenticated, isLoading } = useAuth();
  const { toast } = useToast();

  // Handle unauthorized errors globally - but don't redirect automatically
  useEffect(() => {
    // Only redirect if we're on a protected route and definitely not authenticated
    if (!isLoading && !isAuthenticated) {
      const currentPath = window.location.pathname;
      const protectedRoutes = ['/clientes', '/creditos', '/re-gestion', '/red-brokers', '/comisiones', '/financieras', '/documentos', '/reportes', '/configuracion', '/sistema-productos', '/solicitudes-pendientes', '/mis-solicitudes', '/admin/usuarios', '/importacion-masiva', '/notificaciones'];
      
      // Check if current path starts with any protected route
      const isProtected = protectedRoutes.some(route => currentPath.startsWith(route));
      
      if (isProtected) {
        toast({
          title: "Sesión expirada",
          description: "Tu sesión ha expirado. Redirigiendo al inicio...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = `${getAppBaseUrl()}/`;
        }, 500);
      }
    }
  }, [isAuthenticated, isLoading, toast]);

  return (
    <Switch>
      {/* Reset password route - accessible without auth */}
      <Route path="/reset-password" component={ResetPassword} />
      {/* Design preview - accessible without auth for testing */}
      <Route path="/design-preview" component={DesignPreview} />
      {/* Broker acquisition page - accessible without auth */}
      <Route path="/brokers" component={BrokersLanding} />
      
      {isLoading || !isAuthenticated ? (
        <Route path="/" component={Landing} />
      ) : (
        <>
          <ProtectedRoute path="/" component={Dashboard} requiredModule="dashboard" />
          <ProtectedRoute path="/clientes" component={Clients} requiredModule="clientes" />
          <ProtectedRoute path="/clientes/:clientId" component={ClientDetailPage} requiredModule="clientes" />
          <ProtectedRoute path="/creditos" component={Credits} requiredModule="creditos" />
          <ProtectedRoute path="/re-gestion" component={ReGestion} requiredModule="creditos" />
          <ProtectedRoute path="/red-brokers" component={BrokerNetwork} allowedRoles={['admin', 'super_admin', 'master_broker']} requiredModule="red_brokers" />
          <ProtectedRoute path="/comisiones" component={Commissions} requiredModule="comisiones" />
          <ProtectedRoute path="/financieras/:id" component={FinancieraDetail} requiredModule="financieras" />
          <ProtectedRoute path="/financieras" component={Financieras} requiredModule="financieras" />
          <ProtectedRoute path="/documentos" component={Documents} requiredModule="documentos" />
          <ProtectedRoute path="/reportes" component={Reports} allowedRoles={['admin', 'super_admin', 'master_broker']} requiredModule="reportes" />
          <ProtectedRoute path="/configuracion" component={Settings} />
          <ProtectedRoute path="/sistema-productos" component={ProductSystem} requiredModule="sistema_productos" />
          <ProtectedRoute path="/solicitudes-pendientes" component={PendingRequests} allowedRoles={['admin', 'super_admin']} requiredModule="aprobaciones" />
          <ProtectedRoute path="/mis-solicitudes" component={MySubmissions} requiredModule="creditos" />
          <ProtectedRoute path="/comparar-propuestas/:requestId" component={ProposalComparison} requiredModule="creditos" />
          <ProtectedRoute path="/admin/usuarios" component={UserManagement} allowedRoles={['admin', 'super_admin', 'master_broker']} requiredModule="usuarios" />
          <ProtectedRoute path="/notificaciones" component={Notifications} />
          <ProtectedRoute path="/importacion-masiva" component={BulkImport} allowedRoles={['admin', 'super_admin']} requiredModule="importacion" />
        </>
      )}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <NotificationProvider>
          <Toaster />
          <Router />
        </NotificationProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
