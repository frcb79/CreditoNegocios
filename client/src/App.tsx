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

function Router() {
  const { isAuthenticated, isLoading } = useAuth();
  const { toast } = useToast();

  // Handle unauthorized errors globally - but don't redirect automatically
  useEffect(() => {
    // Only redirect if we're on a protected route and definitely not authenticated
    if (!isLoading && !isAuthenticated) {
      const currentPath = window.location.pathname;
      const protectedRoutes = ['/clientes', '/creditos', '/re-gestion', '/red-brokers', '/comisiones', '/financieras', '/documentos', '/reportes', '/configuracion', '/sistema-productos', '/solicitudes-pendientes', '/mis-solicitudes', '/admin/usuarios', '/importacion-masiva'];
      
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
          <Route path="/" component={Dashboard} />
          <Route path="/clientes" component={Clients} />
          <Route path="/clientes/:clientId" component={ClientDetailPage} />
          <Route path="/creditos" component={Credits} />
          <Route path="/re-gestion" component={ReGestion} />
          <Route path="/red-brokers" component={BrokerNetwork} />
          <Route path="/comisiones" component={Commissions} />
          <Route path="/financieras/:id" component={FinancieraDetail} />
          <Route path="/financieras" component={Financieras} />
          <Route path="/documentos" component={Documents} />
          <Route path="/reportes" component={Reports} />
          <Route path="/configuracion" component={Settings} />
          <Route path="/sistema-productos" component={ProductSystem} />
          <Route path="/solicitudes-pendientes" component={PendingRequests} />
          <Route path="/mis-solicitudes" component={MySubmissions} />
          <Route path="/comparar-propuestas/:requestId" component={ProposalComparison} />
          <Route path="/admin/usuarios" component={UserManagement} />
          <Route path="/importacion-masiva" component={BulkImport} />
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
