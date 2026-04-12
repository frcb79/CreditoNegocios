import MainLayout from "@/components/MainLayout";
import Header from "@/components/Header";
import MetricsGrid from "@/components/Dashboard/MetricsGrid";
import CreditPipeline from "@/components/Dashboard/CreditPipeline";
import NotificationsPanel from "@/components/Dashboard/NotificationsPanel";
import ReGestionSection from "@/components/Dashboard/ReGestionSection";
import QuickActionsGrid from "@/components/Dashboard/QuickActionsGrid";

export default function Dashboard() {
  return (
    <MainLayout>
      <Header 
          title="Dashboard Principal"
          subtitle="Bienvenido, aquí tienes un resumen de tu actividad"
          action={{
            label: "Nuevo Cliente",
            href: "/clientes"
          }}
        />
        
        <main className="flex-1 p-4 sm:p-6 lg:p-4 sm:p-6 lg:p-8 overflow-y-auto">
          {/* Metrics Cards */}
          <MetricsGrid />

          {/* Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
            {/* Credit Pipeline */}
            <CreditPipeline />
            
            {/* Notifications & Alerts */}
            <NotificationsPanel />
          </div>

          {/* Re-gestión Section */}
          <ReGestionSection />

          {/* Quick Actions & Tools */}
          <QuickActionsGrid />
        </main>
    </MainLayout>
  );
}
