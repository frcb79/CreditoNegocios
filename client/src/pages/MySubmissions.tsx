import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Clock, 
  DollarSign,
  Package
} from "lucide-react";

interface Credit {
  id: string;
  clientId: string;
  brokerId: string;
  amount: string;
  term: number | null;
  interestRate: string | null;
  status: string;
  createdAt: Date | string;
  client?: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    businessName: string | null;
    type: string;
  };
  productTemplate?: {
    id: string;
    name: string;
  };
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

  // Get broker's dispersed credits
  const { data: allCredits, isLoading: creditsLoading } = useQuery<Credit[]>({
    queryKey: ['/api/credits'],
  });

  // Get commissions for the broker
  const { data: commissions, isLoading: commissionsLoading } = useQuery<Commission[]>({
    queryKey: ['/api/commissions/my-commissions'],
  });

  const isLoading = creditsLoading || commissionsLoading;

  // Filter only broker's dispersed/disbursed credits
  const myCredits = allCredits?.filter(credit => 
    credit.brokerId === user?.id && 
    (credit.status === 'dispersed' || credit.status === 'disbursed')
  ) || [];

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
                    Cuando se dispersen créditos de tus solicitudes, aparecerán aquí con información de comisiones.
                  </p>
                </CardContent>
              </Card>
            ) : (
              myCredits.map((credit) => {
                const commission = getCommissionForCredit(credit.id);
                
                return (
                  <Card key={credit.id} className="hover:shadow-md transition-shadow" data-testid={`credit-card-${credit.id}`}>
                    <CardHeader className="pb-4">
                      <div className="flex items-start justify-between">
                        <div className="space-y-2 flex-1">
                          <div className="flex items-center space-x-2">
                            <CardTitle className="text-lg" data-testid={`text-client-${credit.id}`}>
                              {credit.client?.type === 'persona_moral' 
                                ? credit.client?.businessName || 'Sin razón social'
                                : `${credit.client?.firstName || ''} ${credit.client?.lastName || ''}`.trim() || 'Sin nombre'}
                            </CardTitle>
                            <Badge className="bg-emerald-600">
                              <Package className="w-3 h-3 mr-1" />
                              Dispersado
                            </Badge>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <span className="text-gray-600">Monto:</span>
                              <p className="font-semibold text-lg" data-testid={`text-amount-${credit.id}`}>
                                ${Number(credit.amount).toLocaleString('es-MX')}
                              </p>
                            </div>
                            
                            {credit.term && (
                              <div>
                                <span className="text-gray-600">Plazo:</span>
                                <p className="font-medium">{credit.term} meses</p>
                              </div>
                            )}
                            
                            {credit.interestRate && (
                              <div>
                                <span className="text-gray-600">Tasa de Interés:</span>
                                <p className="font-medium">{credit.interestRate}%</p>
                              </div>
                            )}
                            
                            {credit.productTemplate && (
                              <div>
                                <span className="text-gray-600">Producto:</span>
                                <p className="font-medium" data-testid={`text-product-${credit.id}`}>{credit.productTemplate.name}</p>
                              </div>
                            )}
                          </div>

                          <div className="text-xs text-gray-500">
                            Dispersado el {new Date(credit.createdAt).toLocaleDateString('es-ES')}
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    
                    {commission && (
                      <CardContent className="pt-0">
                        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                          <h4 className="font-medium text-sm text-blue-900 mb-3 flex items-center">
                            <DollarSign className="w-4 h-4 mr-1" />
                            Comisión
                          </h4>
                          <div className="grid grid-cols-3 gap-4 text-sm">
                            <div>
                              <span className="text-blue-700">Comisión Total:</span>
                              <p className="font-semibold text-blue-900">
                                ${Number(commission.amount).toLocaleString('es-MX')}
                              </p>
                            </div>
                            {commission.brokerShare && (
                              <div>
                                <span className="text-blue-700">Tu Parte:</span>
                                <p className="font-semibold text-blue-900">
                                  ${Number(commission.brokerShare).toLocaleString('es-MX')}
                                </p>
                              </div>
                            )}
                            <div>
                              <span className="text-blue-700">Estado:</span>
                              <p className="font-medium">
                                {commission.paidAt ? (
                                  <Badge className="bg-green-600">Pagada</Badge>
                                ) : (
                                  <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                                    <Clock className="w-3 h-3 mr-1" />
                                    Pendiente
                                  </Badge>
                                )}
                              </p>
                            </div>
                          </div>
                          {commission.commissionType && (
                            <p className="text-xs text-blue-600 mt-2">
                              Tipo: {commission.commissionType}
                            </p>
                          )}
                        </div>
                      </CardContent>
                    )}
                  </Card>
                );
              })
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
