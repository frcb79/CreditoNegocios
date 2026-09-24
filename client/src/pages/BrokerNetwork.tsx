import MainLayout from "@/components/MainLayout";
import Header from "@/components/Header";
import BrokerNetworkComponent from "@/components/Brokers/BrokerNetwork";
import { useAuth } from "@/hooks/useAuth";
import { ShieldAlert, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

export default function BrokerNetwork() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <MainLayout>
        <Header 
          title="Red de Brokers"
          subtitle="Gestiona y monitorea tu equipo de brokers"
        />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          <div className="max-w-7xl mx-auto space-y-6">
            <div className="h-32 bg-card border border-border rounded-xl p-5 shadow-xs animate-pulse" />
            <div className="h-64 bg-card border border-border rounded-xl p-5 shadow-xs animate-pulse" />
          </div>
        </main>
      </MainLayout>
    );
  }

  if (user?.role !== 'master_broker' && user?.role !== 'admin' && user?.role !== 'super_admin') {
    return (
      <MainLayout>
        <Header 
          title="Red de Brokers"
          subtitle="Gestiona tu red de brokers"
        />
        
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          <div className="max-w-md mx-auto mt-12 bg-card border border-border rounded-xl p-8 text-center shadow-xs">
            <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-600 flex items-center justify-center mx-auto mb-3">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-foreground mb-1">
              Acceso Restringido
            </h3>
            <p className="text-xs text-muted-foreground mb-5 leading-relaxed">
              Esta funcionalidad y la gestión autónoma de comisiones de equipo están disponibles únicamente para perfiles con rango Master Broker y Administradores.
            </p>
            <Link href="/">
              <Button size="sm" className="h-8 text-xs bg-primary hover:bg-primary/90 text-white shadow-xs">
                Volver al Panel Principal
              </Button>
            </Link>
          </div>
        </main>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <Header 
        title="Red de Brokers"
        subtitle="Gestiona y monitorea tu equipo de brokers y comisiones"
      />
      
      <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
        <div className="max-w-7xl mx-auto">
          <BrokerNetworkComponent />
        </div>
      </main>
    </MainLayout>
  );
}
