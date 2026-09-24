import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import MainLayout from "@/components/MainLayout";
import Header from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { differenceInDays } from "date-fns";
import { Link } from "wouter";
import { 
  RotateCcw, 
  AlertTriangle, 
  Clock, 
  DollarSign, 
  Search, 
  Phone, 
  Mail, 
  CheckCircle2, 
  Briefcase, 
  ArrowUpRight,
  TrendingUp,
  UserCheck
} from "lucide-react";

interface ReGestionOpportunity {
  id: string;
  creditId: string;
  clientId: string;
  currentAmount: string;
  suggestedAmount: string;
  currentRate: string;
  suggestedRate: string;
  endDate: string;
  paymentHistory: string;
  status: string;
  estimatedSavings: string;
  remainingBalance?: string;
}

export default function ReGestion() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterUrgency, setFilterUrgency] = useState("all");

  const { data: opportunities, isLoading } = useQuery<ReGestionOpportunity[]>({
    queryKey: ["/api/regestion-opportunities"],
  });

  const getUrgencyLevel = (endDate: string) => {
    const days = differenceInDays(new Date(endDate), new Date());
    if (days <= 7) return "urgent";
    if (days <= 30) return "high";
    if (days <= 60) return "medium";
    return "low";
  };

  const getUrgencyConfig = (urgency: string) => {
    switch (urgency) {
      case 'urgent':
        return { 
          label: 'Urgente', 
          color: 'bg-red-600 hover:bg-red-700 text-white shadow-xs', 
          badgeColor: 'bg-red-50 text-red-700 border-red-200/80',
          borderAccent: 'border-red-200/80'
        };
      case 'high':
        return { 
          label: 'Alta', 
          color: 'bg-amber-600 hover:bg-amber-700 text-white shadow-xs', 
          badgeColor: 'bg-amber-50 text-amber-800 border-amber-200/80',
          borderAccent: 'border-amber-200/70'
        };
      case 'medium':
        return { 
          label: 'Media', 
          color: 'bg-primary hover:bg-primary/90 text-white shadow-xs', 
          badgeColor: 'bg-blue-50 text-blue-700 border-blue-200/80',
          borderAccent: 'border-blue-200/70'
        };
      default:
        return { 
          label: 'Baja', 
          color: 'bg-slate-800 hover:bg-slate-900 text-white shadow-xs', 
          badgeColor: 'bg-slate-50 text-slate-700 border-slate-200',
          borderAccent: 'border-slate-200/80'
        };
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
      <MainLayout>
        <Header 
          title="Renovaciones de Créditos"
          subtitle="Identifica oportunidades de renovación y mejora"
        />
        
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          <div className="max-w-7xl mx-auto space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-24 bg-white border border-slate-200/80 rounded-xl p-4 animate-pulse space-y-2">
                  <div className="h-4 bg-slate-100 rounded w-1/2"></div>
                  <div className="h-7 bg-slate-200 rounded w-1/3"></div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-64 bg-white border border-slate-200/80 rounded-xl p-5 animate-pulse space-y-3">
                  <div className="h-5 bg-slate-200 rounded w-1/3"></div>
                  <div className="h-4 bg-slate-100 rounded w-full"></div>
                  <div className="h-4 bg-slate-100 rounded w-2/3"></div>
                  <div className="h-10 bg-slate-100 rounded w-full mt-4"></div>
                </div>
              ))}
            </div>
          </div>
        </main>
      </MainLayout>
    );
  }

  const urgentCount = opportunities?.filter(o => getUrgencyLevel(o.endDate) === 'urgent').length || 0;
  const highCount = opportunities?.filter(o => getUrgencyLevel(o.endDate) === 'high').length || 0;
  const totalSavings = opportunities?.reduce((sum, o) => sum + parseFloat(o.estimatedSavings || '0'), 0) || 0;

  return (
    <MainLayout>
      <Header 
        title="Renovaciones de Créditos"
        subtitle="Identifica oportunidades de renovación y mejora comercial"
      />
      
      <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Summary KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200/80 rounded-xl p-4 sm:p-5 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-slate-500 text-xs font-medium">Total Oportunidades</p>
                <p className="text-xl sm:text-2xl font-bold text-slate-900 mt-0.5">{opportunities?.length || 0}</p>
                <span className="text-[11px] text-slate-400 mt-0.5 block">Cartera en ventana de renovación</span>
              </div>
              <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0 border border-slate-200/60">
                <RotateCcw className="w-5 h-5 text-primary" />
              </div>
            </div>

            <div className="bg-white border border-slate-200/80 rounded-xl p-4 sm:p-5 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-slate-500 text-xs font-medium">Urgentes (≤ 7 días)</p>
                <p className="text-xl sm:text-2xl font-bold text-red-600 mt-0.5">{urgentCount}</p>
                <span className="text-[11px] text-red-500 font-medium mt-0.5 block">Vencimiento inmediato</span>
              </div>
              <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center shrink-0 border border-red-200/60">
                <AlertTriangle className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white border border-slate-200/80 rounded-xl p-4 sm:p-5 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-slate-500 text-xs font-medium">Alta Prioridad (≤ 30 días)</p>
                <p className="text-xl sm:text-2xl font-bold text-amber-700 mt-0.5">{highCount}</p>
                <span className="text-[11px] text-amber-600 font-medium mt-0.5 block">Gestión proactiva</span>
              </div>
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0 border border-amber-200/60">
                <Clock className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white border border-slate-200/80 rounded-xl p-4 sm:p-5 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-slate-500 text-xs font-medium">Ahorro Mensual Estimado</p>
                <p className="text-xl sm:text-2xl font-bold text-emerald-700 mt-0.5">
                  ${totalSavings.toLocaleString('es-MX')}
                </p>
                <span className="text-[11px] text-emerald-600 font-medium mt-0.5 block">Para el cliente acumulado</span>
              </div>
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0 border border-emerald-200/60">
                <DollarSign className="w-5 h-5" />
              </div>
            </div>
          </div>

          {/* Filters and Search */}
          <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-xs">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  placeholder="Buscar por ID de cliente..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 h-9 text-xs border-slate-200 focus-visible:ring-primary/20"
                  data-testid="input-search-opportunities"
                />
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs text-slate-400 font-medium mr-1 hidden md:inline">Urgencia:</span>
                <button
                  onClick={() => setFilterUrgency("all")}
                  className={`text-xs font-medium h-8 px-3 rounded-lg transition-all border ${
                    filterUrgency === "all"
                      ? "bg-slate-900 text-white border-slate-900 shadow-2xs"
                      : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                  data-testid="filter-all"
                >
                  Todos
                </button>
                <button
                  onClick={() => setFilterUrgency("urgent")}
                  className={`text-xs font-medium h-8 px-3 rounded-lg transition-all border ${
                    filterUrgency === "urgent"
                      ? "bg-red-600 text-white border-red-600 shadow-2xs"
                      : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                  data-testid="filter-urgent"
                >
                  Urgente
                </button>
                <button
                  onClick={() => setFilterUrgency("high")}
                  className={`text-xs font-medium h-8 px-3 rounded-lg transition-all border ${
                    filterUrgency === "high"
                      ? "bg-amber-600 text-white border-amber-600 shadow-2xs"
                      : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                  data-testid="filter-high"
                >
                  Alta
                </button>
                <button
                  onClick={() => setFilterUrgency("medium")}
                  className={`text-xs font-medium h-8 px-3 rounded-lg transition-all border ${
                    filterUrgency === "medium"
                      ? "bg-primary text-white border-primary shadow-2xs"
                      : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                  data-testid="filter-medium"
                >
                  Media
                </button>
              </div>
            </div>
          </div>

          {/* Opportunities Grid */}
          {filteredOpportunities.length === 0 ? (
            <div className="bg-white border border-slate-200/80 rounded-xl p-12 text-center shadow-sm">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400">
                <RotateCcw className="w-6 h-6" />
              </div>
              <h3 className="text-sm sm:text-base font-bold text-slate-800 mb-1">
                No hay oportunidades de re-gestión
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto mb-5">
                {opportunities?.length === 0 
                  ? "Aún no hay créditos próximos a vencer que requieran re-gestión o refinanciamiento."
                  : "No se encontraron oportunidades registradas con los filtros aplicados."
                }
              </p>
              <Link href="/creditos">
                <Button size="sm" className="h-8 text-xs bg-primary hover:bg-primary/90 text-white">
                  <Briefcase className="w-3.5 h-3.5 mr-1.5" />
                  Ver Cartera Activa
                </Button>
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {filteredOpportunities.map((opportunity) => {
                const daysToExpire = differenceInDays(new Date(opportunity.endDate), new Date());
                const urgencyLevel = getUrgencyLevel(opportunity.endDate);
                const urgencyConfig = getUrgencyConfig(urgencyLevel);
                
                return (
                  <div 
                    key={opportunity.id}
                    className={`bg-white border rounded-xl shadow-sm hover:border-slate-300 transition-all flex flex-col justify-between overflow-hidden ${urgencyConfig.borderAccent}`}
                    data-testid={`opportunity-${opportunity.id}`}
                  >
                    <div className="p-4 sm:p-5 pb-3 border-b border-slate-100 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center shrink-0 text-slate-600">
                            <UserCheck className="w-3.5 h-3.5" />
                          </div>
                          <h4 className="text-sm sm:text-base font-bold text-slate-900 truncate">
                            Cliente {opportunity.clientId.slice(-8)}
                          </h4>
                        </div>
                        <Badge 
                          variant="outline"
                          className={`text-xs font-semibold px-2 py-0.5 whitespace-nowrap shrink-0 ${urgencyConfig.badgeColor}`}
                          data-testid={`urgency-${opportunity.id}`}
                        >
                          {daysToExpire} días • {urgencyConfig.label}
                        </Badge>
                      </div>
                    </div>
                    
                    <div className="p-4 sm:p-5 pt-3 space-y-4 flex-1 flex flex-col justify-between">
                      <div className="space-y-2.5 text-xs">
                        <div className="flex justify-between items-center p-2 rounded-lg bg-slate-50/70 border border-slate-100">
                          <span className="text-slate-500 font-medium">Crédito actual:</span>
                          <span className="font-semibold text-slate-800">
                            ${parseFloat(opportunity.currentAmount).toLocaleString('es-MX')} MXN
                          </span>
                        </div>
                        <div className="flex justify-between items-center px-1">
                          <span className="text-slate-500">Saldo restante:</span>
                          <span className="font-semibold text-slate-700">
                            ${parseFloat(opportunity.remainingBalance || '0').toLocaleString('es-MX')} MXN
                          </span>
                        </div>
                        <div className="flex justify-between items-center px-1">
                          <span className="text-slate-500">Nuevo límite sugerido:</span>
                          <span className="text-primary font-bold">
                            ${parseFloat(opportunity.suggestedAmount).toLocaleString('es-MX')} MXN
                          </span>
                        </div>
                        <div className="flex justify-between items-center p-2 rounded-lg bg-emerald-50/60 border border-emerald-100/60">
                          <span className="text-emerald-800 font-medium">Ahorro mensual est.:</span>
                          <span className="text-emerald-700 font-bold">
                            ${parseFloat(opportunity.estimatedSavings).toLocaleString('es-MX')}/mes
                          </span>
                        </div>
                        <div className="flex justify-between items-center px-1">
                          <span className="text-slate-500">Historial de pagos:</span>
                          <span className="text-emerald-700 font-semibold flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Excelente
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
                        <Button 
                          size="sm"
                          className={`flex-1 h-8 text-xs font-semibold ${urgencyConfig.color}`}
                          data-testid={`button-pre-approve-${opportunity.id}`}
                        >
                          Pre-aprobar
                        </Button>
                        <Button 
                          variant="outline"
                          size="sm"
                          className="h-8 px-2.5 border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                          data-testid={`button-contact-${opportunity.id}`}
                          title="Contactar vía telefónica"
                        >
                          <Phone className="w-3.5 h-3.5" />
                        </Button>
                        <Button 
                          variant="outline"
                          size="sm"
                          className="h-8 px-2.5 border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                          data-testid={`button-email-${opportunity.id}`}
                          title="Enviar correo"
                        >
                          <Mail className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </MainLayout>
  );
}
