import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { 
  Clock, 
  DollarSign,
  Package,
  Building2,
  Calendar,
  Percent,
  User,
  Info
} from "lucide-react";

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

  // Filter only broker's dispersed/disbursed credits (or all if admin)
  const myCredits = allCredits?.filter(credit => {
    const isDispersed = credit.status === 'dispersed' || credit.status === 'disbursed';
    if (user?.role === 'admin' || user?.role === 'super_admin') {
      return isDispersed;
    }
    return credit.brokerId === user?.id && isDispersed;
  }) || [];

  const getCommissionForCredit = (creditId: string) => {
    return commissions?.find(c => c.creditId === creditId);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex bg-gray-50">
        <Sidebar />
        <div className="flex-1 flex flex-col">
          <Header 
            title="Mis Créditos"
            subtitle="Revisa tus créditos dispersados y comisiones"
          />
          <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
            <div className="space-y-6">
              {Array.from({ length: 3 }).map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="p-6">
                    <div className="h-4 bg-gray-200 rounded mb-2"></div>
                    <div className="h-3 bg-gray-200 rounded w-3/4 mb-4"></div>
                    <div className="h-8 bg-gray-200 rounded"></div>
                  </CardContent>
                </Card>
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
          title="Mis Créditos"
          subtitle={`${myCredits.length} crédito${myCredits.length !== 1 ? 's' : ''} dispersado${myCredits.length !== 1 ? 's' : ''}`}
        />
        
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          <div className="space-y-6">
            {myCredits.length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    No tienes créditos dispersados
                  </h3>
                  <p className="text-gray-600">
                    Cuando se dispersen créditos de tus solicitudes, aparecerán aquí con toda la información y seguimiento de comisiones.
                  </p>
                </CardContent>
              </Card>
            ) : (
              myCredits.map((credit) => {
                const commission = getCommissionForCredit(credit.id);
                const clientName = credit.client?.type === 'persona_moral' 
                  ? credit.client?.businessName || 'Sin razón social'
                  : `${credit.client?.firstName || ''} ${credit.client?.lastName || ''}`.trim() || 'Cliente';
                
                return (
                  <Card 
                    key={credit.id} 
                    className="hover:shadow-md transition-shadow cursor-pointer border border-gray-200"
                    onClick={() => setSelectedCredit(credit)}
                    data-testid={`credit-card-${credit.id}`}
                  >
                    <CardHeader className="pb-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-2 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <CardTitle className="text-lg text-gray-900" data-testid={`text-client-${credit.id}`}>
                              {clientName}
                            </CardTitle>
                            {credit.financialInstitution && (
                              <Badge variant="outline" className="bg-blue-50 text-blue-800 border-blue-200 font-medium">
                                <Building2 className="w-3 h-3 mr-1" />
                                {credit.financialInstitution.name}
                              </Badge>
                            )}
                            <Badge className="bg-emerald-600">
                              <Package className="w-3 h-3 mr-1" />
                              Dispersado
                            </Badge>
                          </div>
                          
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm mt-2">
                            <div>
                              <span className="text-gray-500 text-xs">Monto Dispersado:</span>
                              <p className="font-semibold text-base text-green-700" data-testid={`text-amount-${credit.id}`}>
                                ${Number(credit.amount).toLocaleString('es-MX')} MXN
                              </p>
                            </div>
                            
                            {credit.term && (
                              <div>
                                <span className="text-gray-500 text-xs">Plazo:</span>
                                <p className="font-medium text-gray-800">{credit.term} meses</p>
                              </div>
                            )}
                            
                            {credit.interestRate && (
                              <div>
                                <span className="text-gray-500 text-xs">Tasa de Interés:</span>
                                <p className="font-medium text-gray-800">{credit.interestRate}%</p>
                              </div>
                            )}
                            
                            {credit.productTemplate && (
                              <div>
                                <span className="text-gray-500 text-xs">Producto:</span>
                                <p className="font-medium text-gray-800 truncate" data-testid={`text-product-${credit.id}`}>
                                  {credit.productTemplate.name}
                                </p>
                              </div>
                            )}
                          </div>

                          <div className="text-xs text-gray-400 flex items-center gap-2">
                            <span>Dispersado el {new Date(credit.createdAt).toLocaleDateString('es-MX')}</span>
                            <span>•</span>
                            <span className="text-primary font-medium flex items-center">
                              <Info className="w-3 h-3 mr-1" /> Clic para ver detalles completos
                            </span>
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    
                    {commission && (
                      <CardContent className="pt-0" onClick={(e) => e.stopPropagation()}>
                        <div className="bg-blue-50/70 p-3.5 rounded-lg border border-blue-200/80">
                          <h4 className="font-semibold text-xs text-blue-900 mb-2 flex items-center">
                            <DollarSign className="w-3.5 h-3.5 mr-1" />
                            Comisión Asociada
                          </h4>
                          <div className="grid grid-cols-3 gap-3 text-xs">
                            <div>
                              <span className="text-blue-700">Comisión Total:</span>
                              <p className="font-bold text-blue-900 text-sm">
                                ${Number(commission.amount).toLocaleString('es-MX')}
                              </p>
                            </div>
                            {commission.brokerShare && (
                              <div>
                                <span className="text-blue-700">Tu Participación:</span>
                                <p className="font-bold text-blue-900 text-sm">
                                  ${Number(commission.brokerShare).toLocaleString('es-MX')}
                                </p>
                              </div>
                            )}
                            <div>
                              <span className="text-blue-700">Estatus:</span>
                              <div className="mt-0.5">
                                {commission.paidAt ? (
                                  <Badge className="bg-green-600 text-white text-[10px]">Pagada</Badge>
                                ) : (
                                  <Badge variant="outline" className="bg-yellow-50 text-yellow-800 border-yellow-300 text-[10px]">
                                    <Clock className="w-2.5 h-2.5 mr-1" />
                                    Pendiente
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    )}
                  </Card>
                );
              })
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

                <div className="flex justify-end pt-2">
                  <Button variant="outline" onClick={() => setSelectedCredit(null)}>
                    Cerrar
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
