import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { differenceInDays } from "date-fns";
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
      <Card className="mb-6 border border-border/70 bg-card shadow-2xs">
        <CardHeader className="p-4 pb-2 border-b border-border/40">
          <CardTitle className="text-sm font-semibold">Oportunidades de Renovación</CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-32 w-full rounded-md" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const opportunitiesCount = opportunities?.length || 0;
  const displayOpportunities = opportunities?.slice(0, 3) || [];

  return (
    <Card className="mb-6 border border-border/70 bg-card shadow-2xs" data-testid="re-gestion-card">
      <CardHeader className="p-4 pb-3 border-b border-border/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CardTitle className="text-sm font-semibold text-foreground tracking-tight">
              Renovaciones y Re-gestión Comercial
            </CardTitle>
            <Badge
              className="bg-primary/10 text-primary border border-primary/20 text-[10px] px-2 py-0 font-medium"
              data-testid="re-gestion-count"
            >
              {opportunitiesCount} {opportunitiesCount === 1 ? 'Oportunidad' : 'Oportunidades'}
            </Badge>
          </div>
          <Link href="/re-gestion">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7 px-2 text-primary hover:text-primary-dark font-medium"
              data-testid="button-view-all-re-gestion"
            >
              Ver todas las oportunidades →
            </Button>
          </Link>
        </div>
      </CardHeader>

      <CardContent className="p-4">
        {displayOpportunities.length === 0 ? (
          <div className="text-center py-6 border border-dashed border-border/60 rounded-md">
            <i className="fas fa-history text-2xl text-muted-foreground/30 mb-1"></i>
            <p className="text-xs text-muted-foreground">No hay créditos próximos a vencer en tu cartera actual</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {displayOpportunities.map((opportunity) => {
              const daysToExpire = differenceInDays(new Date(opportunity.endDate), new Date());
              const isUrgent = daysToExpire <= 15;

              return (
                <div
                  key={opportunity.id}
                  className="border border-border/60 rounded-md p-3.5 bg-muted/20 hover:bg-muted/40 transition-colors"
                  data-testid={`re-gestion-${opportunity.id}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-foreground">
                      Cliente #{opportunity.clientId.slice(-6).toUpperCase()}
                    </span>
                    <Badge
                      className={`text-[10px] px-1.5 py-0 font-medium border ${
                        isUrgent
                          ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30'
                          : 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-emerald-500/20'
                      }`}
                      data-testid={`urgency-${opportunity.id}`}
                    >
                      {daysToExpire > 0 ? `${daysToExpire} días restantes` : 'Vencido'}
                    </Badge>
                  </div>

                  <div className="space-y-1.5 text-xs text-muted-foreground mb-3 font-mono tabular-nums">
                    <div className="flex justify-between">
                      <span>Monto actual:</span>
                      <span className="font-semibold text-foreground">
                        ${parseFloat(opportunity.currentAmount || '0').toLocaleString('es-MX')} MXN
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Nuevo límite sugerido:</span>
                      <span className="font-semibold text-primary">
                        ${parseFloat(opportunity.suggestedAmount || '0').toLocaleString('es-MX')} MXN
                      </span>
                    </div>
                  </div>

                  <Link href="/re-gestion">
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full text-xs h-7 border-border/70 text-foreground hover:bg-card"
                      data-testid={`button-pre-approve-${opportunity.id}`}
                    >
                      Gestionar renovación →
                    </Button>
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
