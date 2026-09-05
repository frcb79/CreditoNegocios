import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

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
  }>;
}

const statusConfig: Record<string, { label: string; color: string }> = {
  under_review: { label: "En Revisión", color: "bg-primary/10 text-primary border-primary/20" },
  en_revision: { label: "En Revisión", color: "bg-primary/10 text-primary border-primary/20" },
  submitted: { label: "En Validación", color: "bg-warning/10 text-warning border-warning/20" },
  validacion_juridica: { label: "En Validación", color: "bg-warning/10 text-warning border-warning/20" },
  en_mesa_control: { label: "En Validación", color: "bg-warning/10 text-warning border-warning/20" },
  approved: { label: "Aprobado", color: "bg-secondary/10 text-secondary border-secondary/20" },
  aprobado: { label: "Aprobado", color: "bg-secondary/10 text-secondary border-secondary/20" },
  por_firmar: { label: "Por Firmar", color: "bg-accent/10 text-accent border-accent/20" },
  disbursed: { label: "Dispersado", color: "bg-success/10 text-success border-success/20" },
  dispersed: { label: "Dispersado", color: "bg-success/10 text-success border-success/20" },
  dispersado: { label: "Dispersado", color: "bg-success/10 text-success border-success/20" },
  rejected: { label: "Rechazado", color: "bg-danger/10 text-danger border-danger/20" },
  rechazado: { label: "Rechazado", color: "bg-danger/10 text-danger border-danger/20" },
};

export default function CreditPipeline() {
  const { data, isLoading } = useQuery<PipelineData>({
    queryKey: ["/api/dashboard/pipeline"],
  });

  if (isLoading) {
    return (
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Pipeline de Créditos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-5 gap-4 mb-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="text-center">
                <Skeleton className="w-12 h-12 rounded-full mx-auto mb-2" />
                <Skeleton className="h-3 w-16 mx-auto" />
              </div>
            ))}
          </div>
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card className="lg:col-span-2">
        <CardContent className="p-6">
          <p className="text-center text-muted-foreground">Error cargando pipeline</p>
        </CardContent>
      </Card>
    );
  }

  const pipelineStages = [
    { label: "En Revisión", count: data.pipeline.en_revision, color: "bg-primary/10 text-primary" },
    { label: "Validación", count: data.pipeline.validacion, color: "bg-warning/10 text-warning" },
    { label: "Aprobación", count: data.pipeline.aprobacion, color: "bg-secondary/10 text-secondary" },
    { label: "Por Firmar", count: data.pipeline.por_firmar, color: "bg-accent/10 text-accent" },
    { label: "Dispersión", count: data.pipeline.dispersion, color: "bg-success/10 text-success" },
  ];

  return (
    <Card className="lg:col-span-2 border border-border">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-foreground">Pipeline de Créditos</CardTitle>
          <button 
            className="text-primary hover:text-primary-dark text-sm font-medium transition-colors"
            data-testid="button-view-all-pipeline"
          >
            Ver todos
          </button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Pipeline Stages */}
        <div className="grid grid-cols-5 gap-4 mb-6">
          {pipelineStages.map((stage, index) => (
            <div key={index} className="text-center">
              <div className={`w-12 h-12 ${stage.color} rounded-full flex items-center justify-center mx-auto mb-2 font-semibold shadow-xs`}>
                <span data-testid={`pipeline-count-${index}`}>
                  {stage.count}
                </span>
              </div>
              <p className="text-xs text-muted-foreground font-medium" data-testid={`pipeline-label-${index}`}>
                {stage.label}
              </p>
            </div>
          ))}
        </div>

        {/* Recent Cases */}
        <div className="space-y-3">
          {data.recentCases.length === 0 ? (
            <div className="text-center py-8">
              <i className="fas fa-credit-card text-4xl text-muted-foreground/30 mb-4"></i>
              <p className="text-muted-foreground">No hay casos recientes</p>
            </div>
          ) : (
            data.recentCases.map((creditCase) => (
              <div 
                key={creditCase.id} 
                className="flex items-center justify-between p-3 bg-muted/40 rounded-lg hover:bg-muted/70 transition-colors cursor-pointer border border-border/50"
                data-testid={`case-${creditCase.id}`}
              >
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-primary text-primary-foreground rounded-full flex items-center justify-center flex-shrink-0 font-semibold text-sm shadow-xs">
                    {(creditCase.clientName || 'Cliente').trim().split(/\s+/).filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium text-foreground text-sm" data-testid={`case-client-${creditCase.id}`}>
                      {creditCase.clientName}
                    </p>
                    <p className="text-xs text-muted-foreground" data-testid={`case-amount-${creditCase.id}`}>
                      Crédito - ${parseFloat(creditCase.amount).toLocaleString('es-MX')} MXN
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <Badge 
                    className={statusConfig[creditCase.status as keyof typeof statusConfig]?.color || "bg-muted text-muted-foreground"}
                    data-testid={`case-status-${creditCase.id}`}
                  >
                    {statusConfig[creditCase.status as keyof typeof statusConfig]?.label || creditCase.status}
                  </Badge>
                  <p className="text-xs text-muted-foreground mt-1" data-testid={`case-time-${creditCase.id}`}>
                    {formatDistanceToNow(new Date(creditCase.updatedAt), { 
                      addSuffix: true, 
                      locale: es 
                    })}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
