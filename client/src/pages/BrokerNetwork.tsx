import MainLayout from "@/components/MainLayout";
import Header from "@/components/Header";
import BrokerNetworkComponent from "@/components/Brokers/BrokerNetwork";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";

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
          <div className="space-y-4">
            <div className="h-32 bg-gray-100 animate-pulse rounded-lg" />
            <div className="h-64 bg-gray-100 animate-pulse rounded-lg" />
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
          <Card>
            <CardContent className="p-12">
              <div className="text-center">
                <i className="fas fa-ban text-4xl text-muted-foreground/50 mb-4"></i>
                <h3 className="text-xl font-semibold text-foreground mb-2">
                  Acceso Restringido
                </h3>
                <p className="text-muted-foreground">
                  Esta funcionalidad está disponible solo para Master Brokers.
                </p>
              </div>
            </CardContent>
          </Card>
        </main>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <Header 
        title="Red de Brokers"
        subtitle="Gestiona y monitorea tu equipo de brokers"
      />
      
      <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
        <BrokerNetworkComponent />
      </main>
    </MainLayout>
  );
}
