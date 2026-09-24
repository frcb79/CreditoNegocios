import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import MainLayout from "@/components/MainLayout";
import Header from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { 
  Clock, 
  DollarSign, 
  Package, 
  Building2, 
  Calendar, 
  Percent, 
  User, 
  Info,
  Users,
  Filter,
  CreditCard,
  ChevronRight,
  TrendingUp
} from "lucide-react";
import { getStatusLabel, getStatusBadgeClass } from "@/lib/statusConfig";

interface Credit {
  id: string;
  clientId: string;
  brokerId: string;
  amount: string;
  term: number | null;
  interestRate: string | null;
  purpose?: string | null;
  status: string;
  createdAt: Date | string;
  client?: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    businessName: string | null;
    type: string;
    rfc?: string | null;
    email?: string | null;
    phone?: string | null;
    monthlyIncome?: string | number | null;
    creditScore?: number | null;
    yearsInBusiness?: number | null;
  };
  financialInstitution?: {
    id: string;
    name: string;
    logoUrl?: string | null;
  };
  productTemplate?: {
    id: string;
    name: string;
    category?: string | null;
  };
  submission?: {
    id: string;
    requestedAmount?: string;
    purpose?: string;
    createdAt: string;
    brokerNotes?: string;
    matchingAnalysis?: any;
  } | null;
  targets?: any[];
}

interface Commission {
  id: string;
  creditId: string;
  brokerId: string;
  amount: string;
  brokerShare: string | null;
  commissionType: string | null;
  status: string;
  paidAt: Date | null;
}

export default function MySubmissions() {
  const { user } = useAuth();
  const [selectedCredit, setSelectedCredit] = useState<Credit | null>(null);

  // Get broker's credits
  const { data: allCredits, isLoading: creditsLoading } = useQuery<Credit[]>({
    queryKey: ['/api/credits'],
  });

  // Get commissions for the broker
  const { data: commissions, isLoading: commissionsLoading } = useQuery<Commission[]>({
    queryKey: ['/api/commissions'],
  });

  const isLoading = creditsLoading || commissionsLoading;

  const isMasterBroker = user?.role === 'master_broker';
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const [activeTab, setActiveTab] = useState<'direct' | 'network'>('direct');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const directCredits = allCredits?.filter(credit => {
    if (isAdmin) return true;
    return credit.brokerId === user?.id;
  }) || [];

  const networkCredits = allCredits?.filter(credit => {
    return credit.brokerId !== user?.id;
  }) || [];

  const currentList = (isMasterBroker && activeTab === 'network') ? networkCredits : directCredits;

  const filteredCredits = currentList.filter(credit => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'dispersed') return credit.status === 'dispersed' || credit.status === 'disbursed';
    if (statusFilter === 'approved') return credit.status === 'approved';
    if (statusFilter === 'in_progress') return credit.status !== 'dispersed' && credit.status !== 'disbursed' && credit.status !== 'approved';
    return credit.status === statusFilter;
  });

  const getCommissionForCredit = (creditId: string) => {
    return commissions?.find(c => c.creditId === creditId);
  };

  if (isLoading) {
    return (
      <MainLayout>
        <Header 
          title="Mis Créditos"
          subtitle="Revisa tus créditos y comisiones"
        />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          <div className="max-w-7xl mx-auto space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-white border border-slate-200/80 rounded-xl p-5 shadow-xs animate-pulse space-y-3">
                <div className="flex items-center justify-between">
                  <div className="h-5 bg-slate-200 rounded w-1/4"></div>
                  <div className="h-5 bg-slate-100 rounded w-20"></div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                  <div className="h-10 bg-slate-100 rounded"></div>
                  <div className="h-10 bg-slate-100 rounded"></div>
                  <div className="h-10 bg-slate-100 rounded"></div>
                  <div className="h-10 bg-slate-100 rounded"></div>
                </div>
              </div>
            ))}
          </div>
        </main>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <Header 
        title="Mis Créditos"
        subtitle={`${filteredCredits.length} crédito${filteredCredits.length !== 1 ? 's' : ''} registrado${filteredCredits.length !== 1 ? 's' : ''}`}
      />

      {isMasterBroker && (
        <div className="border-b border-slate-200/80 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex gap-6">
            <button
              onClick={() => setActiveTab('direct')}
              className={`py-3 text-xs sm:text-sm font-semibold border-b-2 flex items-center gap-2 transition-colors ${
                activeTab === 'direct'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <Package className="w-4 h-4" />
              Mis Créditos Directos ({directCredits.length})
            </button>
            <button
              onClick={() => setActiveTab('network')}
              className={`py-3 text-xs sm:text-sm font-semibold border-b-2 flex items-center gap-2 transition-colors ${
                activeTab === 'network'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <Users className="w-4 h-4" />
              Créditos de mi Red ({networkCredits.length})
            </button>
          </div>
        </div>
      )}
      
      <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
        <div className="max-w-7xl mx-auto space-y-5">
          {/* Filtros de estado */}
          <div className="flex items-center justify-between gap-3 flex-wrap bg-white border border-slate-200/80 rounded-xl p-3 shadow-2xs">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs text-slate-500 font-medium mr-1 flex items-center gap-1">
                <Filter className="w-3.5 h-3.5 text-slate-400" /> Estado:
              </span>
              {[
                { id: 'all', label: `Todos (${currentList.length})` },
                { id: 'dispersed', label: `Dispersados (${currentList.filter(c => c.status === 'dispersed' || c.status === 'disbursed').length})` },
                { id: 'approved', label: `Aprobados (${currentList.filter(c => c.status === 'approved').length})` },
                { id: 'in_progress', label: `En Trámite (${currentList.filter(c => c.status !== 'dispersed' && c.status !== 'disbursed' && c.status !== 'approved').length})` },
              ].map((f) => {
                const isActive = statusFilter === f.id;
                return (
                  <button
                    key={f.id}
                    onClick={() => setStatusFilter(f.id)}
                    className={`text-xs font-medium h-7 px-3 rounded-full transition-all border ${
                      isActive 
                        ? 'bg-slate-900 text-white border-slate-900 shadow-2xs' 
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
            
            <div className="text-xs text-slate-500 font-medium">
              Mostrando <span className="font-semibold text-slate-900">{filteredCredits.length}</span> registros
            </div>
          </div>

          {filteredCredits.length === 0 ? (
            <div className="bg-white border border-slate-200/80 rounded-xl p-12 text-center shadow-xs">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400">
                <Package className="w-6 h-6" />
              </div>
              <h3 className="text-sm sm:text-base font-bold text-slate-800 mb-1">
                No se encontraron créditos
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                {isMasterBroker && activeTab === 'direct'
                  ? "Aún no has originado créditos directos. Los créditos que tramites directamente aparecerán aquí."
                  : "No hay créditos registrados que coincidan con los filtros seleccionados."}
              </p>
            </div>
          ) : (
            <div className="space-y-3.5">
              {filteredCredits.map((credit) => {
                const commission = getCommissionForCredit(credit.id);
                const clientName = credit.client?.type === 'persona_moral' 
                  ? credit.client?.businessName || 'Sin razón social'
                  : `${credit.client?.firstName || ''} ${credit.client?.lastName || ''}`.trim() || 'Cliente';
                
                const isMortgage = Boolean(
                  ((credit as any).mortgageData && Object.keys((credit as any).mortgageData).length > 0) || 
                  credit.productTemplate?.name?.toLowerCase().includes("hipotecario")
                );

                return (
                  <div 
                    key={credit.id} 
                    className="bg-white border border-slate-200/80 rounded-xl shadow-xs hover:border-slate-300 hover:shadow-sm transition-all cursor-pointer overflow-hidden group"
                    onClick={() => setSelectedCredit(credit)}
                    data-testid={`credit-card-${credit.id}`}
                  >
                    <div className="p-4 sm:p-5 space-y-3.5">
                      {/* Header de la tarjeta */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-slate-100">
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center shrink-0 border border-slate-200/60">
                            <CreditCard className="w-4 h-4 text-primary" />
                          </div>
                          <h3 className="text-sm sm:text-base font-bold text-slate-900 group-hover:text-primary transition-colors truncate" data-testid={`text-client-${credit.id}`}>
                            {clientName}
                          </h3>
                          {credit.financialInstitution && (
                            <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200 text-xs font-medium">
                              <Building2 className="w-3 h-3 mr-1 text-slate-500" />
                              {credit.financialInstitution.name}
                            </Badge>
                          )}
                          {isMortgage && (
                            <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-300 text-xs font-semibold" data-testid={`badge-mortgage-${credit.id}`}>
                              🏠 Hipotecario Vivienda
                            </Badge>
                          )}
                          {isMasterBroker && activeTab === 'network' && (
                            <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 text-xs font-medium">
                              <User className="w-3 h-3 mr-1" />
                              Red
                            </Badge>
                          )}
                        </div>

                        <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                          <Badge className={`text-xs px-2.5 py-0.5 font-semibold ${getStatusBadgeClass(credit.status)}`}>
                            {getStatusLabel(credit.status)}
                          </Badge>
                          {commission?.status === 'paid' && (
                            <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold text-xs">
                              <DollarSign className="w-3 h-3 mr-0.5 text-emerald-600" />
                              Comisión Pagada
                            </Badge>
                          )}
                          <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-colors hidden sm:block" />
                        </div>
                      </div>

                      {/* Grid de Datos Financieros */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                        <div className="p-2.5 bg-slate-50/70 rounded-lg border border-slate-100">
                          <span className="text-[11px] text-slate-500 font-medium block mb-0.5">Monto del Crédito</span>
                          <p className="font-bold text-sm sm:text-base text-emerald-700 tracking-tight" data-testid={`text-amount-${credit.id}`}>
                            ${Number(credit.amount).toLocaleString('es-MX')} MXN
                          </p>
                        </div>
                        
                        <div className="p-2.5 bg-slate-50/70 rounded-lg border border-slate-100">
                          <span className="text-[11px] text-slate-500 font-medium block mb-0.5">Plazo</span>
                          <p className="font-semibold text-xs sm:text-sm text-slate-800">
                            {credit.term ? `${credit.term} meses` : 'Por definir'}
                          </p>
                        </div>
                        
                        <div className="p-2.5 bg-slate-50/70 rounded-lg border border-slate-100">
                          <span className="text-[11px] text-slate-500 font-medium block mb-0.5">Tasa de Interés</span>
                          <p className="font-semibold text-xs sm:text-sm text-slate-800">
                            {credit.interestRate ? `${credit.interestRate}%` : 'Por definir'}
                          </p>
                        </div>
                        
                        <div className="p-2.5 bg-slate-50/70 rounded-lg border border-slate-100">
                          <span className="text-[11px] text-slate-500 font-medium block mb-0.5">Producto</span>
                          <p className="font-semibold text-xs sm:text-sm text-slate-800 truncate" data-testid={`text-product-${credit.id}`}>
                            {credit.productTemplate?.name || 'Crédito Estándar'}
                          </p>
                        </div>
                      </div>

                      {/* Footer de la tarjeta con fecha y tip */}
                      <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          Registrado el {new Date(credit.createdAt).toLocaleDateString('es-MX')}
                        </span>
                        <span className="text-primary font-medium flex items-center group-hover:underline">
                          <Info className="w-3 h-3 mr-1" /> Ver detalle completo
                        </span>
                      </div>
                    </div>
                    
                    {/* Snippet de Comisión si existe */}
                    {commission && (
                      <div className="bg-slate-50/80 px-4 sm:px-5 py-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-2">
                          <span className="text-slate-500 font-medium">Comisión Asociada:</span>
                          <span className="font-bold text-slate-900">
                            ${Number(commission.amount).toLocaleString('es-MX')} MXN
                          </span>
                          {commission.brokerShare && (
                            <span className="text-slate-500 text-[11px]">
                              (Tu parte: <strong className="text-emerald-700">${Number(commission.brokerShare).toLocaleString('es-MX')}</strong>)
                            </span>
                          )}
                        </div>
                        <div>
                          {commission.paidAt ? (
                            <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-semibold">
                              Pagada el {new Date(commission.paidAt).toLocaleDateString('es-MX')}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-300 text-[10px] font-medium">
                              <Clock className="w-2.5 h-2.5 mr-1 text-amber-600" />
                              Liquidación Pendiente
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

        {/* Modal de Detalle Completo del Crédito */}
        <Dialog open={!!selectedCredit} onOpenChange={(open) => !open && setSelectedCredit(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold flex items-center gap-2">
                <Package className="w-5 h-5 text-primary" />
                Detalle Integral del Crédito #{selectedCredit?.id?.slice(-8)}
              </DialogTitle>
            </DialogHeader>

            {selectedCredit && (
              <div className="space-y-4 pt-1">
                {/* Header Resumen */}
                <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <p className="text-xs text-emerald-800 font-semibold uppercase tracking-wider">Monto Dispersado</p>
                    <p className="text-2xl font-bold text-emerald-900">
                      ${parseFloat(selectedCredit.amount || '0').toLocaleString('es-MX')} MXN
                    </p>
                    <p className="text-xs text-emerald-700 mt-0.5">
                      Financiera: <span className="font-semibold">{selectedCredit.financialInstitution?.name || 'Financiera'}</span>
                    </p>
                  </div>
                  <div className="text-right">
                    <Badge className="bg-emerald-600 text-white text-xs">
                      <Package className="w-3 h-3 mr-1" /> Dispersado
                    </Badge>
                    <p className="text-[11px] text-emerald-700 mt-1">
                      {new Date(selectedCredit.createdAt).toLocaleDateString('es-MX')}
                    </p>
                  </div>
                </div>

                {/* Info Cliente y Perfil Financiero */}
                <div className="p-4 bg-gray-50 rounded-xl border border-gray-200/80 space-y-3">
                  <h4 className="text-xs font-bold text-gray-700 uppercase flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-primary" />
                    Información del Cliente & Perfil Evaluado
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <span className="text-gray-500">Nombre / Razón Social:</span>
                      <p className="font-semibold text-gray-900 truncate">
                        {selectedCredit.client?.businessName || `${selectedCredit.client?.firstName || ''} ${selectedCredit.client?.lastName || ''}`.trim() || 'No disponible'}
                      </p>
                    </div>
                    {selectedCredit.client?.rfc && (
                      <div>
                        <span className="text-gray-500">RFC:</span>
                        <p className="font-semibold text-gray-800">{selectedCredit.client.rfc}</p>
                      </div>
                    )}
                    <div>
                      <span className="text-gray-500">Tipo de Persona:</span>
                      <p className="font-medium capitalize">{selectedCredit.client?.type?.replace('_', ' ') || 'Persona Física'}</p>
                    </div>
                    {selectedCredit.client?.monthlyIncome && (
                      <div>
                        <span className="text-gray-500">Ingreso Mensual:</span>
                        <p className="font-semibold text-green-700">
                          ${parseFloat(String(selectedCredit.client.monthlyIncome)).toLocaleString('es-MX')} MXN
                        </p>
                      </div>
                    )}
                    {selectedCredit.client?.creditScore && (
                      <div>
                        <span className="text-gray-500">Score de Buró:</span>
                        <p className="font-semibold text-gray-800">{selectedCredit.client.creditScore} pts</p>
                      </div>
                    )}
                    {selectedCredit.client?.yearsInBusiness && (
                      <div>
                        <span className="text-gray-500">Años de Antigüedad:</span>
                        <p className="font-semibold text-gray-800">{selectedCredit.client.yearsInBusiness} años</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Condiciones del Crédito Dispersado */}
                <div className="p-4 bg-gray-50 rounded-xl border border-gray-200/80 space-y-3">
                  <h4 className="text-xs font-bold text-gray-700 uppercase flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-primary" />
                    Condiciones Aprobadas y Dispersadas
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <span className="text-gray-500">Producto:</span>
                      <p className="font-semibold text-gray-900">{selectedCredit.productTemplate?.name || 'Crédito Simple'}</p>
                    </div>
                    {selectedCredit.term && (
                      <div>
                        <span className="text-gray-500">Plazo Aprobado:</span>
                        <p className="font-semibold text-gray-800">{selectedCredit.term} meses</p>
                      </div>
                    )}
                    {selectedCredit.interestRate && (
                      <div>
                        <span className="text-gray-500">Tasa de Interés:</span>
                        <p className="font-semibold text-purple-700">{selectedCredit.interestRate}%</p>
                      </div>
                    )}
                    {selectedCredit.purpose && (
                      <div className="col-span-2 sm:col-span-3">
                        <span className="text-gray-500">Propósito / Destino:</span>
                        <p className="font-medium text-gray-800">{selectedCredit.purpose}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Datos de la Operación Hipotecaria si aplica */}
                {(selectedCredit as any).mortgageData && Object.keys((selectedCredit as any).mortgageData).length > 0 && (
                  <div className="p-4 bg-amber-50/60 rounded-xl border border-amber-200/80 space-y-3" data-testid="mortgage-data-details">
                    <h4 className="text-xs font-bold text-amber-900 uppercase flex items-center gap-1.5">
                      <span>🏠</span> Datos de la Operación Hipotecaria
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                      {(selectedCredit as any).mortgageData.propertyValue && (
                        <div>
                          <span className="text-gray-500">Valor Inmueble:</span>
                          <p className="font-semibold text-gray-900">${parseFloat((selectedCredit as any).mortgageData.propertyValue).toLocaleString('es-MX')} MXN</p>
                        </div>
                      )}
                      {(selectedCredit as any).mortgageData.financedPercentage && (
                        <div>
                          <span className="text-gray-500">Aforo / Financiado:</span>
                          <p className="font-semibold text-amber-800">{(selectedCredit as any).mortgageData.financedPercentage}%</p>
                        </div>
                      )}
                      {(selectedCredit as any).mortgageData.propertyLocation && (
                        <div className="col-span-2">
                          <span className="text-gray-500">Ubicación Inmueble:</span>
                          <p className="font-medium text-gray-800">{(selectedCredit as any).mortgageData.propertyLocation}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Financieras y Propuestas de la Solicitud */}
                {selectedCredit.targets && selectedCredit.targets.length > 0 && (
                  <div className="p-4 bg-gray-50 rounded-xl border border-gray-200/80 space-y-3">
                    <h4 className="text-xs font-bold text-gray-700 uppercase flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-primary" />
                        Financieras Evaluadas en la Solicitud ({selectedCredit.targets.length})
                      </span>
                    </h4>
                    <div className="space-y-2">
                      {selectedCredit.targets.map((target: any) => {
                        const isDispersedTarget = target.status === 'dispersed';
                        const prop = target.institutionProposal;
                        return (
                          <div 
                            key={target.id}
                            className={`p-3 rounded-lg border text-xs flex items-center justify-between gap-2 ${
                              isDispersedTarget 
                                ? 'bg-green-50/80 border-green-300' 
                                : target.status === 'returned_to_broker'
                                  ? 'bg-orange-50/80 border-orange-200'
                                  : 'bg-white border-gray-200'
                            }`}
                          >
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-gray-900">{target.institution?.name || 'Financiera'}</span>
                                {isDispersedTarget ? (
                                  <Badge className="bg-green-600 text-[10px] py-0 px-1.5">Dispersada</Badge>
                                ) : target.status === 'returned_to_broker' ? (
                                  <Badge className="bg-orange-100 text-orange-800 border-orange-300 text-[10px] py-0 px-1.5">Devuelta</Badge>
                                ) : target.status === 'institution_rejected' ? (
                                  <Badge className="bg-red-100 text-red-800 border-red-300 text-[10px] py-0 px-1.5">Rechazada</Badge>
                                ) : prop ? (
                                  <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px] py-0 px-1.5">Propuesta Recibida</Badge>
                                ) : (
                                  <Badge variant="outline" className="text-[10px] py-0 px-1.5">En Proceso</Badge>
                                )}
                              </div>
                              {prop && (
                                <p className="text-gray-600 mt-1">
                                  Oferta: <span className="font-semibold text-green-800">${parseFloat(prop.approvedAmount || '0').toLocaleString('es-MX')}</span> • Tasa: <span className="font-semibold">{prop.interestRate}%</span> • Plazo: {prop.term}m
                                </p>
                              )}
                              {target.status === 'returned_to_broker' && target.adminNotes && (
                                <p className="text-orange-800 mt-1 italic">
                                  Motivo: {target.adminNotes}
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Comisiones del Broker Asociadas */}
                {(() => {
                  const comm = getCommissionForCredit(selectedCredit.id);
                  if (!comm) return null;
                  return (
                    <div className="p-4 bg-blue-50/70 border border-blue-200 rounded-xl space-y-2">
                      <h4 className="text-xs font-bold text-blue-900 uppercase flex items-center gap-1.5">
                        <DollarSign className="w-3.5 h-3.5 text-blue-700" />
                        Comisión Generada
                      </h4>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <span className="text-blue-700">Comisión Total:</span>
                          <p className="font-bold text-blue-900">${parseFloat(comm.amount || '0').toLocaleString('es-MX')} MXN</p>
                        </div>
                        <div>
                          <span className="text-blue-700">Tu Comisión:</span>
                          <p className="font-bold text-blue-900">${parseFloat(comm.brokerShare || comm.amount || '0').toLocaleString('es-MX')} MXN</p>
                        </div>
                        <div>
                          <span className="text-blue-700">Estatus:</span>
                          <div>
                            {comm.paidAt ? (
                              <Badge className="bg-green-600 text-white text-[10px]">Pagada el {new Date(comm.paidAt).toLocaleDateString('es-MX')}</Badge>
                            ) : (
                              <Badge variant="outline" className="bg-yellow-50 text-yellow-800 border-yellow-300 text-[10px]">Pendiente</Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                <DialogFooter className="pt-3 border-t border-border/60">
                  <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setSelectedCredit(null)}>
                    Cerrar
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </MainLayout>
    );
  }
