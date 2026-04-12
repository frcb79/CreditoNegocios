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

const statusConfig = {
  under_review: { label: "En Revisión", color: "bg-blue-100 text-primary" },
  submitted: { label: "En Validación", color: "bg-yellow-100 text-warning" },
  approved: { label: "Por Firmar", color: "bg-green-100 text-success" },
  disbursed: { label: "Dispersión", color: "bg-green-200 text-green-800" },
  rejected: { label: "Rechazado", color: "bg-red-100 text-danger" },
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
          <p className="text-center text-neutral">Error cargando pipeline</p>
        </CardContent>
      </Card>
    );
  }

  const pipelineStages = [
    { label: "En Revisión", count: data.pipeline.en_revision, color: "bg-blue-100 text-primary" },
    { label: "Validación", count: data.pipeline.validacion, color: "bg-yellow-100 text-warning" },
    { label: "Aprobación", count: data.pipeline.aprobacion, color: "bg-orange-100 text-orange-600" },
    { label: "Por Firmar", count: data.pipeline.por_firmar, color: "bg-green-100 text-success" },
    { label: "Dispersión", count: data.pipeline.dispersion, color: "bg-green-200 text-green-800" },
  ];

  return (
    <Card className="lg:col-span-2 border border-gray-200">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-gray-900">Pipeline de Créditos</CardTitle>
          <button 
            className="text-primary hover:text-primary-dark text-sm font-medium"
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
              <div className={`w-12 h-12 ${stage.color} rounded-full flex items-center justify-center mx-auto mb-2`}>
                <span className="font-semibold" data-testid={`pipeline-count-${index}`}>
                  {stage.count}
                </span>
              </div>
              <p className="text-xs text-neutral" data-testid={`pipeline-label-${index}`}>
                {stage.label}
              </p>
            </div>
          ))}
        </div>

        {/* Recent Cases */}
        <div className="space-y-3">
          {data.recentCases.length === 0 ? (
            <div className="text-center py-8">
              <i className="fas fa-credit-card text-4xl text-gray-300 mb-4"></i>
              <p className="text-neutral">No hay casos recientes</p>
            </div>
          ) : (
            data.recentCases.map((creditCase) => (
              <div 
                key={creditCase.id} 
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
                data-testid={`case-${creditCase.id}`}
              >
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center">
                    <span className="text-white font-semibold text-sm">
                      {creditCase.clientName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </span>
                  </div>
                  <div>
                    <p className="font-medium text-gray-900" data-testid={`case-client-${creditCase.id}`}>
                      {creditCase.clientName}
                    </p>
                    <p className="text-sm text-neutral" data-testid={`case-amount-${creditCase.id}`}>
                      Crédito - ${parseFloat(creditCase.amount).toLocaleString('es-MX')} MXN
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <Badge 
                    className={statusConfig[creditCase.status as keyof typeof statusConfig]?.color || "bg-gray-100 text-gray-800"}
                    data-testid={`case-status-${creditCase.id}`}
                  >
                    {statusConfig[creditCase.status as keyof typeof statusConfig]?.label || creditCase.status}
                  </Badge>
                  <p className="text-xs text-neutral mt-1" data-testid={`case-time-${creditCase.id}`}>
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
