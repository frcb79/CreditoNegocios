import MainLayout from "@/components/MainLayout";
import Header from "@/components/Header";
import MetricsGrid from "@/components/Dashboard/MetricsGrid";
import CreditPipeline from "@/components/Dashboard/CreditPipeline";
import NotificationsPanel from "@/components/Dashboard/NotificationsPanel";
import ReGestionSection from "@/components/Dashboard/ReGestionSection";
import QuickActionsGrid from "@/components/Dashboard/QuickActionsGrid";
import { useUserTour } from "@/hooks/useUserTour";
import { useAuth } from "@/hooks/useAuth";

export default function Dashboard() {
  useUserTour();
  const { user } = useAuth();

  const role = user?.role || 'broker';
  const isAdmin = role === 'admin' || role === 'super_admin';
  const isMasterBroker = role === 'master_broker';

  // Configuración de Header por rol operativo (mantiene "Dashboard Principal" para consistencia con suite existente)
  const getHeaderConfig = () => {
    if (isAdmin) {
      return {
        title: "Dashboard Principal",
        subtitle: "Supervisión institucional de expedientes, colocación global y estado de la red",
        action: {
          label: "Ver Operaciones",
          href: "/creditos",
        },
      };
    }
    if (isMasterBroker) {
      return {
        title: "Dashboard Principal",
        subtitle: "Monitoreo de expedientes, colocación y actividad comercial de tu red de brokers",
        action: {
          label: "Gestionar Red",
          href: "/red-brokers",
        },
      };
    }
    return {
      title: "Dashboard Principal",
      subtitle: "Gestión operativa de tus solicitudes de crédito, expedientes y cartera",
      action: {
        label: "Ver Créditos",
        href: "/creditos",
      },
    };
  };

  const headerConfig = getHeaderConfig();

  return (
    <MainLayout>
      <Header
        title={headerConfig.title}
        subtitle={headerConfig.subtitle}
        action={headerConfig.action}
      />

      <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto space-y-6">
        {/* 1. ¿Cómo va mi operación y qué resultados genero? (Métricas y KPIs por rol) */}
        <section aria-label="Métricas de Operación">
          <MetricsGrid />
        </section>

        {/* 2. ¿Qué tengo que atender? y flujo activo (Pipeline + Requieren atención) */}
        <section aria-label="Operación en Curso y Pendientes" className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <CreditPipeline />
          </div>
          <div className="lg:col-span-1">
            <NotificationsPanel />
          </div>
        </section>

        {/* 3. Re-gestión comercial: Exclusivo para Broker y Master Broker (nunca Admin) */}
        {!isAdmin && (
          <section aria-label="Renovaciones y Re-gestión Comercial">
            <ReGestionSection />
          </section>
        )}

        {/* 4. Lo que viene en Crédito Negocios (Roadmap secundario sin alert() ni enlaces falsos) */}
        <section aria-label="Roadmap de Producto">
          <QuickActionsGrid />
        </section>
      </main>
    </MainLayout>
  );
}
