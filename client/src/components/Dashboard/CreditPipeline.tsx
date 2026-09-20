import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { getStatusLabel, getStatusBadgeClass } from "@/lib/statusConfig";

interface PipelineData {
  pipeline: {
    en_revision: number;
    validacion: number;
    aprobacion: number;
    por_firmar: number;
    dispersion: number;
  };
  recentCases: Array<{
    id: string;
    clientName: string;
    amount: string;
    status: string;
    updatedAt: string;
    sourceType?: string;
  }>;
}

export default function CreditPipeline() {
  const [, setLocation] = useLocation();
  const { data, isLoading } = useQuery<PipelineData>({
    queryKey: ["/api/dashboard/pipeline"],
  });

  if (isLoading) {
    return (
      <Card className="border border-border/70 bg-card shadow-2xs">
        <CardHeader className="p-4 pb-2 border-b border-border/40">
          <CardTitle className="text-sm font-semibold">Pipeline de Créditos</CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          <div className="grid grid-cols-5 gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-md" />
            ))}
          </div>
          <div className="space-y-2 pt-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-md" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card className="border border-border/70 bg-card p-4">
        <CardContent className="p-4 text-center">
          <p className="text-sm text-muted-foreground">No fue posible cargar la información del pipeline</p>
        </CardContent>
      </Card>
    );
  }

  const pipelineStages = [
    { label: "En Revisión", count: data.pipeline.en_revision, statusKey: "en_revision" },
    { label: "Validación", count: data.pipeline.validacion, statusKey: "validacion" },
    { label: "Aprobación", count: data.pipeline.aprobacion, statusKey: "aprobacion" },
    { label: "Por Firmar", count: data.pipeline.por_firmar, statusKey: "por_firmar" },
    { label: "Dispersión", count: data.pipeline.dispersion, statusKey: "dispersion" },
  ];

  return (
    <Card className="border border-border/70 bg-card shadow-2xs" data-testid="credit-pipeline-card">
      <CardHeader className="p-4 pb-3 border-b border-border/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CardTitle className="text-sm font-semibold text-foreground tracking-tight">
              Pipeline de Créditos
            </CardTitle>
            <span className="text-[11px] font-normal text-muted-foreground">
              (Flujo de expedientes en curso)
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-7 px-2.5 text-primary hover:text-primary-dark font-medium"
            onClick={() => setLocation('/creditos')}
            data-testid="button-view-all-pipeline"
          >
            Ver todos los expedientes →
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-4 space-y-5">
        {/* Pipeline Stages: Sobrio, Horizontal, Bancario */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2" data-testid="pipeline-stages-grid">
          {pipelineStages.map((stage, index) => {
            const hasItems = stage.count > 0;
            return (
              <div
                key={index}
                onClick={() => setLocation('/creditos')}
                className={`p-2.5 rounded-md border text-center transition-colors cursor-pointer ${
                  hasItems
                    ? 'border-primary/30 bg-primary/5 hover:bg-primary/10'
                    : 'border-border/50 bg-muted/20 hover:bg-muted/40'
                }`}
              >
                <div
                  className={`text-lg font-bold font-mono tabular-nums leading-tight ${
                    hasItems ? 'text-primary' : 'text-muted-foreground'
                  }`}
                  data-testid={`pipeline-count-${index}`}
                >
                  {stage.count}
                </div>
                <div
                  className="text-[11px] font-medium text-muted-foreground mt-0.5 truncate"
                  data-testid={`pipeline-label-${index}`}
                >
                  {stage.label}
                </div>
              </div>
            );
          })}
        </div>

        {/* Casos Recientes en Pipeline */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Casos Recientes
            </p>
            <span className="text-[11px] text-muted-foreground">
              Últimas actualizaciones
            </span>
          </div>

          <div className="space-y-2">
            {data.recentCases.length === 0 ? (
              <div className="text-center py-6 border border-dashed border-border/60 rounded-md">
                <i className="fas fa-folder-open text-2xl text-muted-foreground/40 mb-1"></i>
                <p className="text-xs text-muted-foreground">No hay expedientes activos registrados recientemente</p>
              </div>
            ) : (
              data.recentCases.map((creditCase) => {
                const initials = (creditCase.clientName || 'Cliente')
                  .trim()
                  .split(/\s+/)
                  .filter(Boolean)
                  .map(n => n[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase();

                const parsedAmount = parseFloat(creditCase.amount || '0');

                return (
                  <div
                    key={creditCase.id}
                    onClick={() => setLocation('/creditos')}
                    className="flex items-center justify-between p-2.5 rounded-md border border-border/60 bg-muted/20 hover:bg-muted/50 transition-colors cursor-pointer"
                    data-testid={`case-${creditCase.id}`}
                  >
                    <div className="flex items-center space-x-3 min-w-0 pr-2">
                      <div className="w-8 h-8 rounded-md bg-secondary/15 text-secondary border border-secondary/30 flex items-center justify-center flex-shrink-0 font-semibold text-xs">
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <p
                          className="font-medium text-foreground text-xs truncate max-w-[200px] sm:max-w-[320px]"
                          data-testid={`case-client-${creditCase.id}`}
                        >
                          {creditCase.clientName}
                        </p>
                        <p
                          className="text-[11px] text-muted-foreground font-mono tabular-nums"
                          data-testid={`case-amount-${creditCase.id}`}
                        >
                          ${parsedAmount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN
                        </p>
                      </div>
                    </div>

                    <div className="text-right flex-shrink-0">
                      <Badge
                        className={`text-[10px] px-2 py-0.5 font-medium border shadow-none ${getStatusBadgeClass(creditCase.status)}`}
                        data-testid={`case-status-${creditCase.id}`}
                      >
                        {getStatusLabel(creditCase.status)}
                      </Badge>
                      <p
                        className="text-[10px] text-muted-foreground mt-0.5 font-mono"
                        data-testid={`case-time-${creditCase.id}`}
                      >
                        {formatDistanceToNow(new Date(creditCase.updatedAt), {
                          addSuffix: true,
                          locale: es,
                        })}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
