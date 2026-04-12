import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { differenceInDays } from "date-fns";

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

export default function ReGestion() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterUrgency, setFilterUrgency] = useState<string>("all");

  const { data: opportunities, isLoading } = useQuery<ReGestionOpportunity[]>({
    queryKey: ["/api/re-gestion"],
  });

  const getUrgencyLevel = (endDate: string) => {
    const daysToExpire = differenceInDays(new Date(endDate), new Date());
    if (daysToExpire <= 7) return 'urgent';
    if (daysToExpire <= 30) return 'high';
    if (daysToExpire <= 60) return 'medium';
    return 'low';
  };

  const getUrgencyConfig = (level: string) => {
    switch (level) {
      case 'urgent':
        return { label: 'Urgente', color: 'bg-danger text-white', badgeColor: 'bg-danger/10 text-danger' };
      case 'high':
        return { label: 'Alta', color: 'bg-warning text-white', badgeColor: 'bg-warning/10 text-warning' };
      case 'medium':
        return { label: 'Media', color: 'bg-primary text-white', badgeColor: 'bg-primary/10 text-primary' };
      case 'low':
        return { label: 'Baja', color: 'bg-success text-white', badgeColor: 'bg-success/10 text-success' };
      default:
        return { label: 'Normal', color: 'bg-gray-500 text-white', badgeColor: 'bg-gray-100 text-gray-800' };
    }
  };

  const filteredOpportunities = opportunities?.filter(opportunity => {
    const matchesSearch = opportunity.clientId.toLowerCase().includes(searchTerm.toLowerCase());
    const urgencyLevel = getUrgencyLevel(opportunity.endDate);
    const matchesUrgency = filterUrgency === "all" || urgencyLevel === filterUrgency;
    
    return matchesSearch && matchesUrgency;
  }) || [];

  if (isLoading) {
    return (
      <div className="min-h-screen flex bg-gray-50">
        <Sidebar />
        <div className="flex-1 flex flex-col">
          <Header 
            title="Renovaciones de Créditos"
            subtitle="Identifica oportunidades de renovación y mejora"
          />
          
          <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-64 w-full" />
              ))}
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header 
          title="Renovaciones de Créditos"
          subtitle="Identifica oportunidades de renovación y mejora"
        />
        
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <Card className="border border-gray-200">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-neutral text-sm font-medium">Total Oportunidades</p>
                    <p className="text-2xl font-bold text-gray-900">{opportunities?.length || 0}</p>
                  </div>
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                    <i className="fas fa-recycle text-primary text-lg"></i>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-gray-200">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-neutral text-sm font-medium">Urgentes (7 días)</p>
                    <p className="text-2xl font-bold text-danger">
                      {opportunities?.filter(o => getUrgencyLevel(o.endDate) === 'urgent').length || 0}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-danger/10 rounded-lg flex items-center justify-center">
                    <i className="fas fa-exclamation-triangle text-danger text-lg"></i>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-gray-200">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-neutral text-sm font-medium">Alta Prioridad</p>
                    <p className="text-2xl font-bold text-warning">
                      {opportunities?.filter(o => getUrgencyLevel(o.endDate) === 'high').length || 0}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-warning/10 rounded-lg flex items-center justify-center">
                    <i className="fas fa-clock text-warning text-lg"></i>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-gray-200">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-neutral text-sm font-medium">Potencial Ingresos</p>
                    <p className="text-2xl font-bold text-success">
                      ${opportunities?.reduce((sum, o) => sum + parseFloat(o.estimatedSavings), 0).toLocaleString('es-MX') || '0'}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-success/10 rounded-lg flex items-center justify-center">
                    <i className="fas fa-dollar-sign text-success text-lg"></i>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card className="mb-8">
            <CardContent className="p-6">
              <div className="flex space-x-4">
                <div className="flex-1">
                  <Input
                    placeholder="Buscar por cliente..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    data-testid="input-search-opportunities"
                  />
                </div>
                <div className="flex space-x-2">
                  <Button
                    variant={filterUrgency === "all" ? "default" : "outline"}
                    onClick={() => setFilterUrgency("all")}
                    data-testid="filter-all"
                  >
                    Todos
                  </Button>
                  <Button
                    variant={filterUrgency === "urgent" ? "default" : "outline"}
                    onClick={() => setFilterUrgency("urgent")}
                    className={filterUrgency === "urgent" ? "bg-danger hover:bg-red-600" : ""}
                    data-testid="filter-urgent"
                  >
                    Urgente
                  </Button>
                  <Button
                    variant={filterUrgency === "high" ? "default" : "outline"}
                    onClick={() => setFilterUrgency("high")}
                    className={filterUrgency === "high" ? "bg-warning hover:bg-yellow-600" : ""}
                    data-testid="filter-high"
                  >
                    Alta
                  </Button>
                  <Button
                    variant={filterUrgency === "medium" ? "default" : "outline"}
                    onClick={() => setFilterUrgency("medium")}
                    className={filterUrgency === "medium" ? "bg-primary hover:bg-primary-dark" : ""}
                    data-testid="filter-medium"
                  >
                    Media
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Opportunities Grid */}
          {filteredOpportunities.length === 0 ? (
            <Card>
              <CardContent className="p-12">
                <div className="text-center">
                  <i className="fas fa-recycle text-6xl text-gray-300 mb-6"></i>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    No hay oportunidades de re-gestión
                  </h3>
                  <p className="text-neutral mb-6">
                    {opportunities?.length === 0 
                      ? "Aún no hay créditos próximos a vencer que requieran re-gestión."
                      : "No se encontraron oportunidades con los filtros aplicados."
                    }
                  </p>
                  <Button className="bg-primary text-white hover:bg-primary-dark">
                    <i className="fas fa-plus mr-2"></i>
                    Ver Cartera Activa
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {filteredOpportunities.map((opportunity) => {
                const daysToExpire = differenceInDays(new Date(opportunity.endDate), new Date());
                const urgencyLevel = getUrgencyLevel(opportunity.endDate);
                const urgencyConfig = getUrgencyConfig(urgencyLevel);
                
                return (
                  <Card 
                    key={opportunity.id}
                    className="border border-gray-200 hover:shadow-lg transition-shadow"
                    data-testid={`opportunity-${opportunity.id}`}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">
                          Cliente {opportunity.clientId.slice(-8)}
                        </CardTitle>
                        <Badge 
                          className={urgencyConfig.badgeColor}
                          data-testid={`urgency-${opportunity.id}`}
                        >
                          {daysToExpire} días • {urgencyConfig.label}
                        </Badge>
                      </div>
                    </CardHeader>
                    
                    <CardContent className="space-y-4">
                      <div className="space-y-3 text-sm">
                        <div className="flex justify-between">
                          <span className="text-neutral">Crédito actual:</span>
                          <span className="font-semibold">
                            ${parseFloat(opportunity.currentAmount).toLocaleString('es-MX')}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-neutral">Saldo restante:</span>
                          <span className="font-semibold">
                            ${parseFloat(opportunity.remainingBalance || '0').toLocaleString('es-MX')}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-neutral">Nuevo límite:</span>
                          <span className="text-primary font-semibold">
                            ${parseFloat(opportunity.suggestedAmount).toLocaleString('es-MX')}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-neutral">Ahorro estimado:</span>
                          <span className="text-success font-semibold">
                            ${parseFloat(opportunity.estimatedSavings).toLocaleString('es-MX')}/mes
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-neutral">Historial de pagos:</span>
                          <span className="text-success font-semibold">✓ Excelente</span>
                        </div>
                      </div>
                      
                      <div className="flex space-x-2 pt-4">
                        <Button 
                          className={`flex-1 ${urgencyConfig.color}`}
                          data-testid={`button-pre-approve-${opportunity.id}`}
                        >
                          Pre-aprobar
                        </Button>
                        <Button 
                          variant="outline"
                          size="sm"
                          className="px-3"
                          data-testid={`button-contact-${opportunity.id}`}
                        >
                          <i className="fas fa-phone"></i>
                        </Button>
                        <Button 
                          variant="outline"
                          size="sm"
                          className="px-3"
                          data-testid={`button-email-${opportunity.id}`}
                        >
                          <i className="fas fa-envelope"></i>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
