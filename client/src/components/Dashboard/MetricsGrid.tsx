import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface TrendData {
  current?: number;
  previous?: number;
  deltaPct: number;
  isPositive?: boolean;
  isNeutral?: boolean;
  label?: string;
}

interface DashboardMetrics {
  role: string;
  broker?: {
    pipelineRequests: number;
    disbursedCredits: number;
    disbursedVolume: number;
    commissionsPaid: number;
    commissionsPending: number;
    commissionsPendingCount?: number;
    commissionsTotal: number;
    avgTicket?: number;
    conversionRate?: number;
  };
  masterBroker?: {
    activeBrokers: number;
    networkPipeline: number;
    networkDisbursedVolume: number;
    networkDisbursedCredits?: number;
  };
  admin?: {
    totalPipeline: number;
    totalDisbursed: number;
    totalDisbursedVolume?: number;
    activeBrokers: number;
    totalClients: number;
    avgTicket?: number;
    commissionsPendingTotal?: number;
    commissionsPendingCount?: number;
  };
  trend?: {
    pipeline: TrendData;
    disbursedVolume: TrendData;
    commissionsPaid: TrendData;
  };
}

export default function MetricsGrid() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
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

  const renderTrendIndicator = (trend?: TrendData) => {
    if (!trend) return null;
    
    if (trend.label) {
      if (trend.isNeutral) {
        return <span className="text-xs text-muted-foreground">{trend.label}</span>;
      }
      return (
        <span className={`text-xs font-medium flex items-center ${trend.isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
          <i className={`fas fa-arrow-${trend.isPositive ? 'up' : 'down'} text-[10px] mr-1`}></i>
          {trend.label}
        </span>
      );
    }

    const isPositive = trend.deltaPct > 0;
    const isNeutral = trend.deltaPct === 0;
    
    if (isNeutral) {
      return <span className="text-xs text-muted-foreground">Activo en periodo</span>;
    }
    
    return (
      <span className={`text-xs font-medium flex items-center ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
        <i className={`fas fa-arrow-${isPositive ? 'up' : 'down'} text-[10px] mr-1`}></i>
        {Math.abs(trend.deltaPct).toFixed(1)}% vs mes anterior
      </span>
    );
  };

  // Broker metrics
  // Broker metrics
  const brokerCards = metrics.broker ? [
    {
      title: "Solicitudes en Pipeline",
      value: metrics.broker.pipelineRequests,
      trend: metrics.trend?.pipeline,
      icon: "fas fa-funnel-dollar",
      color: "blue",
      testId: "metric-pipeline",
    },
    {
      title: "Créditos Dispersados",
      value: `${metrics.broker.disbursedCredits} (${formatCurrency(metrics.broker.disbursedVolume)})`,
      trend: metrics.trend?.disbursedVolume,
      icon: "fas fa-check-circle",
      color: "green",
      testId: "metric-dispersed",
    },
    {
      title: "Comisiones Pendientes",
      value: formatCurrency(metrics.broker.commissionsPending),
      subtitle: `${metrics.broker.commissionsPendingCount || 0} por cobrar | Total: ${formatCurrency(metrics.broker.commissionsTotal)}`,
      icon: "fas fa-clock",
      color: "orange",
      testId: "metric-pending-commissions",
      onClick: () => setLocation('/comisiones?filter=pending'),
    },
    {
      title: "Ticket Promedio",
      value: formatCurrency(metrics.broker.avgTicket || 0),
      subtitle: `Tasa de éxito: ${metrics.broker.conversionRate || 0}%`,
      icon: "fas fa-bullseye",
      color: "emerald",
      testId: "metric-ticket-promedio",
    },
  ] : [];

  // Master Broker additional card
  const masterBrokerCard = metrics.masterBroker ? {
    title: "Mi Red de Brokers",
    value: `${metrics.masterBroker.activeBrokers} Brokers`,
    subtitle: `Vol: ${formatCurrency(metrics.masterBroker.networkDisbursedVolume)} | Pipeline: ${metrics.masterBroker.networkPipeline}`,
    icon: "fas fa-network-wired",
    color: "indigo",
    testId: "metric-network",
  } : null;

  // Admin metrics (Includes Comisiones por Pagar / Adeudos)
  const adminCards = metrics.admin ? [
    {
      title: "Pipeline Global",
      value: `${metrics.admin.totalPipeline} solicitudes`,
      trend: metrics.trend?.pipeline,
      icon: "fas fa-chart-line",
      color: "blue",
      testId: "metric-total-pipeline",
    },
    {
      title: "Créditos Dispersados",
      value: `${metrics.admin.totalDisbursed} (${formatCurrency(metrics.admin.totalDisbursedVolume || 0)})`,
      trend: metrics.trend?.disbursedVolume,
      icon: "fas fa-coins",
      color: "green",
      testId: "metric-total-dispersed",
    },
    {
      title: "Comisiones por Pagar",
      value: formatCurrency(metrics.admin.commissionsPendingTotal || 0),
      subtitle: `${metrics.admin.commissionsPendingCount || 0} pagos pendientes de liquidar`,
      icon: "fas fa-file-invoice-dollar",
      color: "orange",
      testId: "metric-admin-commissions-pending",
      onClick: () => setLocation('/comisiones?filter=pending'),
    },
    {
      title: "Brokers Registrados",
      value: `${metrics.admin.activeBrokers} activos`,
      subtitle: `${metrics.admin.totalClients} clientes en plataforma`,
      icon: "fas fa-users",
      color: "purple",
      testId: "metric-active-brokers",
    },
    {
      title: "Ticket Promedio Global",
      value: formatCurrency(metrics.admin.avgTicket || 0),
      subtitle: "Promedio por colocación",
      icon: "fas fa-bullseye",
      color: "emerald",
      testId: "metric-avg-ticket",
    },
  ] : [];

  // Select appropriate cards based on role
  let displayCards: any[] = [];
  if (isAdmin) {
    displayCards = adminCards;
  } else if (isMasterBroker && masterBrokerCard) {
    displayCards = [brokerCards[0], brokerCards[1], masterBrokerCard, brokerCards[2]];
  } else {
    displayCards = brokerCards;
  }

  const colorStyles: Record<string, { bg: string; text: string }> = {
    blue: { bg: "bg-primary/10", text: "text-primary" },
    green: { bg: "bg-success/10", text: "text-success" },
    purple: { bg: "bg-accent/10", text: "text-accent" },
    orange: { bg: "bg-warning/10", text: "text-warning" },
    indigo: { bg: "bg-secondary/10", text: "text-secondary" },
    emerald: { bg: "bg-emerald-50", text: "text-emerald-700" },
  };

  return (
    <div className={`grid grid-cols-1 md:grid-cols-2 ${isAdmin ? 'lg:grid-cols-5' : 'lg:grid-cols-4'} gap-4 mb-8`} data-testid="metrics-grid">
      {displayCards.map((card, index) => {
        const style = colorStyles[card.color] || colorStyles.blue;
        const isClickable = !!card.onClick;
        return (
          <Card 
            key={index} 
            className={`border border-border ${isClickable ? 'cursor-pointer hover:border-warning/60 hover:shadow-md transition-all' : ''}`}
            onClick={card.onClick}
          >
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0 pr-2">
                  <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wider truncate" data-testid={`${card.testId}-title`}>
                    {card.title}
                  </p>
                  <p className="text-xl font-bold text-foreground mt-1 truncate" data-testid={`${card.testId}-value`}>
                    {card.value}
                  </p>
                  <div className="mt-1">
                    {'trend' in card && card.trend ? (
                      renderTrendIndicator(card.trend)
                    ) : 'subtitle' in card && card.subtitle ? (
                      <p className="text-[11px] text-muted-foreground truncate">{card.subtitle}</p>
                    ) : null}
                  </div>
                </div>
                <div className={`w-11 h-11 ${style.bg} rounded-lg flex items-center justify-center flex-shrink-0`}>
                  <i className={`${card.icon} ${style.text} text-base`}></i>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
