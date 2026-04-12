import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface TrendData {
  current: number;
  previous: number;
  deltaPct: number;
}

interface DashboardMetrics {
  role: string;
  broker?: {
    pipelineRequests: number;
    disbursedCredits: number;
    disbursedVolume: number;
    commissionsPaid: number;
    commissionsPending: number;
    commissionsTotal: number;
  };
  masterBroker?: {
    activeBrokers: number;
    networkPipeline: number;
    networkDisbursedVolume: number;
  };
  admin?: {
    totalPipeline: number;
    totalDisbursed: number;
    activeBrokers: number;
    totalClients: number;
  };
  trend?: {
    pipeline: TrendData;
    disbursedVolume: TrendData;
    commissionsPaid: TrendData;
  };
}

export default function MetricsGrid() {
  const { user } = useAuth();
  const { data: metrics, isLoading } = useQuery<DashboardMetrics>({
    queryKey: ["/api/dashboard/metrics"],
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-8 w-16 mb-2" />
              <Skeleton className="h-4 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardContent className="p-6">
            <p className="text-center text-neutral">Error cargando métricas</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isBroker = metrics.role === 'broker';
  const isMasterBroker = metrics.role === 'master_broker';
  const isAdmin = metrics.role === 'admin' || metrics.role === 'super_admin';

  const formatCurrency = (amount: number) => `$${amount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const renderTrendIndicator = (deltaPct: number) => {
    const isPositive = deltaPct > 0;
    const isNeutral = deltaPct === 0;
    
    if (isNeutral) {
      return <span className="text-sm text-gray-600">Sin cambios</span>;
    }
    
    return (
      <span className={`text-sm flex items-center ${isPositive ? 'text-success' : 'text-red-600'}`}>
        <i className={`fas fa-arrow-${isPositive ? 'up' : 'down'} text-xs mr-1`}></i>
        {Math.abs(deltaPct).toFixed(1)}% vs mes anterior
      </span>
    );
  };

  // Broker metrics
  const brokerCards = metrics.broker ? [
    {
      title: "Solicitudes en Pipeline",
      value: metrics.broker.pipelineRequests,
      trend: metrics.trend?.pipeline.deltaPct,
      icon: "fas fa-funnel-dollar",
      color: "blue",
      testId: "metric-pipeline",
    },
    {
      title: "Créditos Dispersados",
      value: `${metrics.broker.disbursedCredits} (${formatCurrency(metrics.broker.disbursedVolume)})`,
      trend: metrics.trend?.disbursedVolume.deltaPct,
      icon: "fas fa-check-circle",
      color: "green",
      testId: "metric-dispersed",
    },
    {
      title: "Comisiones Este Mes",
      value: formatCurrency(metrics.broker.commissionsPaid),
      trend: metrics.trend?.commissionsPaid.deltaPct,
      icon: "fas fa-dollar-sign",
      color: "purple",
      testId: "metric-commissions",
    },
    {
      title: "Comisiones Pendientes",
      value: formatCurrency(metrics.broker.commissionsPending),
      subtitle: `Total: ${formatCurrency(metrics.broker.commissionsTotal)}`,
      icon: "fas fa-clock",
      color: "orange",
      testId: "metric-pending-commissions",
    },
  ] : [];

  // Master Broker additional card
  const masterBrokerCard = metrics.masterBroker ? {
    title: "Mi Red de Brokers",
    value: metrics.masterBroker.activeBrokers,
    subtitle: `Pipeline Red: ${metrics.masterBroker.networkPipeline} | Vol: ${formatCurrency(metrics.masterBroker.networkDisbursedVolume)}`,
    icon: "fas fa-network-wired",
    color: "indigo",
    testId: "metric-network",
  } : null;

  // Admin metrics
  const adminCards = metrics.admin ? [
    {
      title: "Pipeline Total",
      value: metrics.admin.totalPipeline,
      icon: "fas fa-chart-line",
      color: "blue",
      testId: "metric-total-pipeline",
    },
    {
      title: "Créditos Dispersados",
      value: metrics.admin.totalDisbursed,
      icon: "fas fa-coins",
      color: "green",
      testId: "metric-total-dispersed",
    },
    {
      title: "Brokers Activos",
      value: metrics.admin.activeBrokers,
      icon: "fas fa-users",
      color: "purple",
      testId: "metric-active-brokers",
    },
    {
      title: "Clientes Totales",
      value: metrics.admin.totalClients,
      icon: "fas fa-user-tie",
      color: "orange",
      testId: "metric-total-clients",
    },
  ] : [];

  // Select appropriate cards based on role
  let displayCards = [];
  if (isAdmin) {
    displayCards = adminCards;
  } else if (isMasterBroker && masterBrokerCard) {
    displayCards = [...brokerCards.slice(0, 3), masterBrokerCard];
  } else {
    displayCards = brokerCards;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      {displayCards.map((card, index) => (
        <Card key={index} className="border border-gray-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-neutral text-sm font-medium" data-testid={`${card.testId}-title`}>
                  {card.title}
                </p>
                <p className="text-2xl font-bold text-gray-900 mt-1" data-testid={`${card.testId}-value`}>
                  {card.value}
                </p>
                <div className="mt-1">
                  {'trend' in card && card.trend !== undefined ? (
                    renderTrendIndicator(card.trend)
                  ) : 'subtitle' in card && card.subtitle ? (
                    <p className="text-xs text-gray-600">{card.subtitle}</p>
                  ) : null}
                </div>
              </div>
              <div className={`w-12 h-12 bg-${card.color}-100 rounded-lg flex items-center justify-center flex-shrink-0`}>
                <i className={`${card.icon} text-${card.color}-600 text-lg`}></i>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
