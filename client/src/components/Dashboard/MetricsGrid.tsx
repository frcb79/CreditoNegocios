import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
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
  };
  masterBroker?: {
    activeBrokers: number;
    networkPipeline: number;
    networkDisbursedVolume: number;
    networkDisbursedCredits?: number;
    networkCommissionsGross?: number;
    networkCommissionsToBrokers?: number;
    networkCommissionsNet?: number;
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
  const [, setLocation] = useLocation();
  const { data: metrics, isLoading } = useQuery<DashboardMetrics>({
    queryKey: ["/api/dashboard/metrics"],
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="border border-border/70 bg-card shadow-xs">
            <CardContent className="p-4">
              <Skeleton className="h-3.5 w-24 mb-2" />
              <Skeleton className="h-7 w-28 mb-1.5" />
              <Skeleton className="h-3 w-36" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card className="border border-border/70 bg-card p-4">
          <CardContent className="p-2">
            <p className="text-center text-sm text-muted-foreground">Error al cargar métricas operativas</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isMasterBroker = metrics.role === 'master_broker';
  const isAdmin = metrics.role === 'admin' || metrics.role === 'super_admin';

  const formatCurrency = (amount: number) =>
    `$${amount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const renderTrendIndicator = (trend?: TrendData) => {
    if (!trend) return null;

    if (trend.label) {
      if (trend.isNeutral) {
        return <span className="text-[11px] text-muted-foreground">{trend.label}</span>;
      }
      return (
        <span className={`text-[11px] font-medium flex items-center ${trend.isPositive ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>
          <i className={`fas fa-arrow-${trend.isPositive ? 'up' : 'down'} text-[9px] mr-1`}></i>
          {trend.label}
        </span>
      );
    }

    const isPositive = trend.deltaPct > 0;
    const isNeutral = trend.deltaPct === 0;

    if (isNeutral) {
      return <span className="text-[11px] text-muted-foreground">Activo en periodo</span>;
    }

    return (
      <span className={`text-[11px] font-medium flex items-center ${isPositive ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>
        <i className={`fas fa-arrow-${isPositive ? 'up' : 'down'} text-[9px] mr-1`}></i>
        {Math.abs(trend.deltaPct).toFixed(1)}% vs mes anterior
      </span>
    );
  };

  // Broker metrics
  const brokerCards = metrics.broker ? [
    {
      title: "Solicitudes en Pipeline",
      value: metrics.broker.pipelineRequests,
      trend: metrics.trend?.pipeline,
      icon: "fas fa-layer-group",
      color: "blue",
      testId: "metric-pipeline",
      onClick: () => setLocation('/creditos'),
    },
    {
      title: "Créditos Dispersados",
      value: `${metrics.broker.disbursedCredits}`,
      subtitle: `Volumen: ${formatCurrency(metrics.broker.disbursedVolume)}`,
      trend: metrics.trend?.disbursedVolume,
      icon: "fas fa-check-circle",
      color: "green",
      testId: "metric-dispersed",
      onClick: () => setLocation('/creditos'),
    },
    {
      title: "Comisiones por Cobrar",
      value: formatCurrency(metrics.broker.commissionsPending),
      subtitle: `${metrics.broker.commissionsPendingCount || 0} pendientes de cobro`,
      icon: "fas fa-clock",
      color: "orange",
      testId: "metric-pending-commissions",
      onClick: () => setLocation('/comisiones?filter=pending'),
    },
    {
      title: "Ticket Promedio",
      value: formatCurrency(metrics.broker.avgTicket || 0),
      subtitle: "Por colocación dispersada",
      icon: "fas fa-calculator",
      color: "slate",
      testId: "metric-ticket-promedio",
    },
  ] : [];

  // Master Broker metrics (enfocados en la red autorizada sin mezclar dinero propio con el de brokers)
  const masterBrokerCards = metrics.masterBroker && metrics.broker ? [
    {
      title: "Pipeline de mi Red",
      value: `${metrics.masterBroker.networkPipeline} solicitudes`,
      subtitle: `Mi pipeline directo: ${metrics.broker.pipelineRequests}`,
      icon: "fas fa-network-wired",
      color: "blue",
      testId: "metric-network-pipeline",
      onClick: () => setLocation('/creditos'),
    },
    {
      title: "Volumen Colocado Red",
      value: formatCurrency(metrics.masterBroker.networkDisbursedVolume),
      subtitle: `${metrics.masterBroker.networkDisbursedCredits || 0} créditos dispersados por red`,
      icon: "fas fa-coins",
      color: "green",
      testId: "metric-network-volume",
      onClick: () => setLocation('/creditos'),
    },
    {
      title: "Comisiones Propias Pendientes",
      value: formatCurrency(metrics.broker.commissionsPending),
      subtitle: `${metrics.broker.commissionsPendingCount || 0} liquidaciones pendientes a tu cuenta`,
      icon: "fas fa-hand-holding-usd",
      color: "orange",
      testId: "metric-pending-commissions",
      onClick: () => setLocation('/comisiones?filter=pending'),
    },
    {
      title: "Brokers en mi Red",
      value: `${metrics.masterBroker.activeBrokers} activos`,
      subtitle: "Asignados a tu organización",
      icon: "fas fa-users",
      color: "indigo",
      testId: "metric-network",
      onClick: () => setLocation('/red-brokers'),
    },
  ] : brokerCards;

  // Admin metrics (Operación global)
  const adminCards = metrics.admin ? [
    {
      title: "Pipeline Global",
      value: `${metrics.admin.totalPipeline} solicitudes`,
      trend: metrics.trend?.pipeline,
      icon: "fas fa-layer-group",
      color: "blue",
      testId: "metric-total-pipeline",
      onClick: () => setLocation('/creditos'),
    },
    {
      title: "Colocación Global",
      value: `${metrics.admin.totalDisbursed} créditos`,
      subtitle: `Volumen: ${formatCurrency(metrics.admin.totalDisbursedVolume || 0)}`,
      trend: metrics.trend?.disbursedVolume,
      icon: "fas fa-coins",
      color: "green",
      testId: "metric-total-dispersed",
      onClick: () => setLocation('/creditos'),
    },
    {
      title: "Comisiones por Pagar",
      value: formatCurrency(metrics.admin.commissionsPendingTotal || 0),
      subtitle: `${metrics.admin.commissionsPendingCount || 0} pagos a brokers pendientes`,
      icon: "fas fa-file-invoice-dollar",
      color: "orange",
      testId: "metric-admin-commissions-pending",
      onClick: () => setLocation('/comisiones?filter=pending'),
    },
    {
      title: "Brokers Activos",
      value: `${metrics.admin.activeBrokers}`,
      subtitle: `${metrics.admin.totalClients} clientes registrados`,
      icon: "fas fa-users",
      color: "indigo",
      testId: "metric-active-brokers",
      onClick: () => setLocation('/admin/usuarios'),
    },
    {
      title: "Ticket Promedio Global",
      value: formatCurrency(metrics.admin.avgTicket || 0),
      subtitle: "Promedio por colocación",
      icon: "fas fa-calculator",
      color: "slate",
      testId: "metric-avg-ticket",
    },
  ] : [];

  let displayCards: any[] = [];
  if (isAdmin) {
    displayCards = adminCards;
  } else if (isMasterBroker) {
    displayCards = masterBrokerCards;
  } else {
    displayCards = brokerCards;
  }

  const iconStyles: Record<string, { bg: string; text: string }> = {
    blue: { bg: "bg-primary/10 text-primary", text: "text-primary" },
    green: { bg: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400", text: "text-emerald-700 dark:text-emerald-400" },
    orange: { bg: "bg-amber-500/10 text-amber-700 dark:text-amber-400", text: "text-amber-700 dark:text-amber-400" },
    indigo: { bg: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400", text: "text-indigo-700 dark:text-indigo-400" },
    slate: { bg: "bg-slate-500/10 text-slate-700 dark:text-slate-300", text: "text-slate-700 dark:text-slate-300" },
  };

  return (
    <div
      className={`grid grid-cols-1 sm:grid-cols-2 ${isAdmin ? 'lg:grid-cols-5' : 'lg:grid-cols-4'} gap-4 mb-6`}
      data-testid="metrics-grid"
    >
      {displayCards.map((card, index) => {
        const style = iconStyles[card.color] || iconStyles.blue;
        const isClickable = !!card.onClick;
        return (
          <Card
            key={index}
            className={`border border-border/70 bg-card shadow-2xs transition-all duration-150 ${
              isClickable ? 'cursor-pointer hover:border-primary/40 hover:shadow-xs' : ''
            }`}
            onClick={card.onClick}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p
                    className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider truncate"
                    data-testid={`${card.testId}-title`}
                  >
                    {card.title}
                  </p>
                  <p
                    className="text-xl font-bold text-foreground mt-1 tracking-tight font-mono tabular-nums truncate"
                    data-testid={`${card.testId}-value`}
                  >
                    {card.value}
                  </p>
                  <div className="mt-1 min-h-[16px]">
                    {'trend' in card && card.trend ? (
                      renderTrendIndicator(card.trend)
                    ) : 'subtitle' in card && card.subtitle ? (
                      <p className="text-[11px] text-muted-foreground truncate">{card.subtitle}</p>
                    ) : null}
                  </div>
                </div>
                <div className={`w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0 ${style.bg}`}>
                  <i className={`${card.icon} text-sm`}></i>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
