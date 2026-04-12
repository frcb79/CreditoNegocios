import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow, differenceInDays } from "date-fns";
import { es } from "date-fns/locale";
import { Link } from "wouter";

interface ReGestionOpportunity {
  id: string;
  clientId: string;
  currentAmount: string;
  remainingBalance: string;
  endDate: string;
  paymentHistory: any[];
  suggestedAmount: string;
  estimatedSavings: string;
}

export default function ReGestionSection() {
  const { data: opportunities, isLoading } = useQuery<ReGestionOpportunity[]>({
    queryKey: ["/api/re-gestion"],
  });

  if (isLoading) {
    return (
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Renovaciones de Créditos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-48 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const opportunitiesCount = opportunities?.length || 0;
  const displayOpportunities = opportunities?.slice(0, 3) || [];

  return (
    <Card className="mb-8 border border-gray-200">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <CardTitle className="text-lg font-semibold text-gray-900">Renovaciones de Créditos</CardTitle>
            <Badge 
              className="bg-warning text-white"
              data-testid="re-gestion-count"
            >
              {opportunitiesCount} Oportunidades
            </Badge>
          </div>
          <Link href="/re-gestion">
            <Button 
              className="bg-secondary text-white hover:bg-green-700"
              data-testid="button-view-all-re-gestion"
            >
              Ver Todas
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {displayOpportunities.length === 0 ? (
          <div className="text-center py-8">
            <i className="fas fa-recycle text-4xl text-gray-300 mb-4"></i>
            <p className="text-neutral">No hay oportunidades de renovación en este momento</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {displayOpportunities.map((opportunity) => {
              const daysToExpire = differenceInDays(new Date(opportunity.endDate), new Date());
              const urgencyLevel = daysToExpire <= 7 ? 'danger' : daysToExpire <= 30 ? 'warning' : 'success';
              
              return (
                <div 
                  key={opportunity.id}
                  className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                  data-testid={`re-gestion-${opportunity.id}`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-semibold text-gray-900">
                      Cliente {opportunity.clientId.slice(-8)}
                    </h4>
                    <Badge 
                      className={
                        urgencyLevel === 'danger' ? 'bg-danger/10 text-danger' :
                        urgencyLevel === 'warning' ? 'bg-warning/10 text-warning' :
                        'bg-success/10 text-success'
                      }
                      data-testid={`urgency-${opportunity.id}`}
                    >
                      {daysToExpire} días
                    </Badge>
                  </div>
                  
                  <div className="space-y-2 text-sm text-gray-600">
                    <div className="flex justify-between">
                      <span>Crédito actual:</span>
                      <span className="font-semibold">
                        ${parseFloat(opportunity.currentAmount).toLocaleString('es-MX')}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Pagos al día:</span>
                      <span className="text-success font-semibold">✓ Excelente</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Nuevo límite:</span>
                      <span className="text-primary font-semibold">
                        ${parseFloat(opportunity.suggestedAmount).toLocaleString('es-MX')}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Ahorro mensual:</span>
                      <span className="text-secondary font-semibold">
                        ${parseFloat(opportunity.estimatedSavings).toLocaleString('es-MX')}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex space-x-2 mt-4">
                    <Button 
                      className="flex-1 bg-primary text-white hover:bg-primary-dark text-sm"
                      data-testid={`button-pre-approve-${opportunity.id}`}
                    >
                      Pre-aprobar
                    </Button>
                    <Button 
                      variant="outline"
                      size="sm"
                      className="px-3"
                      data-testid={`button-call-${opportunity.id}`}
                    >
                      <i className="fas fa-phone"></i>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
