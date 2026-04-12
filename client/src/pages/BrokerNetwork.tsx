import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import BrokerNetworkComponent from "@/components/Brokers/BrokerNetwork";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";

export default function BrokerNetwork() {
  const { user } = useAuth();

  if (user?.role !== 'master_broker' && user?.role !== 'admin') {
    return (
      <div className="min-h-screen flex bg-gray-50">
        <Sidebar />
        <div className="flex-1 flex flex-col">
          <Header 
            title="Red de Brokers"
            subtitle="Gestiona tu red de brokers"
          />
          
          <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
            <Card>
              <CardContent className="p-12">
                <div className="text-center">
                  <i className="fas fa-ban text-4xl text-gray-300 mb-4"></i>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    Acceso Restringido
                  </h3>
                  <p className="text-neutral">
                    Esta funcionalidad está disponible solo para Master Brokers.
                  </p>
                </div>
              </CardContent>
            </Card>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header 
          title="Red de Brokers"
          subtitle="Gestiona y monitorea tu equipo de brokers"
        />
        
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          <BrokerNetworkComponent />
        </main>
      </div>
    </div>
  );
}
