import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  Building2, 
  DollarSign,
  TrendingUp,
  Calendar,
  CheckCircle,
  ArrowLeft
} from "lucide-react";

interface CreditSubmissionTarget {
  id: string;
  requestId: string;
  financialInstitutionId: string;
  status: string;
  institutionProposal?: {
    approvedAmount: number;
    interestRate: number;
    term: number;
    openingCommission?: number;
  };
  proposalReceivedAt?: string;
  isWinner?: boolean;
  createdAt: string;
  institution?: {
    id: string;
    name: string;
  };
}

interface CreditSubmissionRequest {
  id: string;
  clientId: string;
  brokerId: string;
  requestedAmount: number;
  purpose?: string;
  createdAt: string;
  client?: {
    id: string;
    firstName: string;
    lastName: string;
  };
}

export default function ProposalComparison() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [match, params] = useRoute<{ requestId: string }>("/comparar-propuestas/:requestId");
  const requestId = params?.requestId;

  const { data: request, isLoading: requestLoading } = useQuery<CreditSubmissionRequest>({
    queryKey: ['/api/credit-submissions', requestId],
    enabled: !!requestId,
  });

  const { data: allTargets, isLoading: targetsLoading } = useQuery<CreditSubmissionTarget[]>({
    queryKey: ['/api/credit-submission-targets', { requestId }],
    enabled: !!requestId,
  });

  const selectWinnerMutation = useMutation({
    mutationFn: async (targetId: string) => {
      return apiRequest("PATCH", `/api/credit-submission-targets/${targetId}/select-winner`, {});
    },
    onSuccess: () => {
      toast({
        title: "Propuesta seleccionada",
        description: "La propuesta ha sido seleccionada como ganadora",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/credit-submission-targets'] });
      setLocation('/mis-solicitudes');
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo seleccionar la propuesta",
        variant: "destructive",
      });
    },
  });

  if (!match || !requestId) {
    return (
      <div className="min-h-screen flex bg-gray-50">
        <Sidebar />
        <div className="flex-1 flex flex-col">
          <Header title="Error" subtitle="Solicitud no encontrada" />
          <main className="flex-1 p-8">
            <Card>
              <CardContent className="p-12 text-center">
                <p className="text-gray-600">La solicitud que buscas no existe.</p>
                <Button
                  className="mt-4"
                  onClick={() => setLocation('/mis-solicitudes')}
                >
                  Volver a Mis Créditos
                </Button>
              </CardContent>
            </Card>
          </main>
        </div>
      </div>
    );
  }

  const approvedProposals = allTargets?.filter(
    t => t.status === 'institution_approved' && t.institutionProposal
  ) || [];

  const calculateMonthlyPayment = (amount: number, rate: number, term: number) => {
    const monthlyRate = rate / 100 / 12;
    const payment = (amount * monthlyRate * Math.pow(1 + monthlyRate, term)) / 
                    (Math.pow(1 + monthlyRate, term) - 1);
    return payment;
  };

  const calculateTotalCost = (amount: number, rate: number, term: number, commission?: number) => {
    const monthlyPayment = calculateMonthlyPayment(amount, rate, term);
    const totalPayments = monthlyPayment * term;
    const commissionAmount = commission ? (amount * commission / 100) : 0;
    return totalPayments + commissionAmount;
  };

  const isLoading = requestLoading || targetsLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen flex bg-gray-50">
        <Sidebar />
        <div className="flex-1 flex flex-col">
          <Header 
            title="Comparar Propuestas"
            subtitle="Cargando..."
          />
          <main className="flex-1 p-8">
            <Card className="animate-pulse">
              <CardContent className="p-12">
                <div className="h-8 bg-gray-200 rounded mb-4"></div>
                <div className="h-64 bg-gray-200 rounded"></div>
              </CardContent>
            </Card>
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
          title="Comparar Propuestas"
          subtitle={`Solicitud para ${request?.client?.firstName} ${request?.client?.lastName}`}
        />
        
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                onClick={() => setLocation('/mis-solicitudes')}
                data-testid="button-back"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Volver a Mis Créditos
              </Button>
              
              <div className="text-sm text-gray-600">
                Comparando {approvedProposals.length} propuestas
              </div>
            </div>

            {approvedProposals.length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <p className="text-gray-600">No hay propuestas aprobadas para comparar.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {approvedProposals.map((target) => {
                  const proposal = target.institutionProposal!;
                  const monthlyPayment = calculateMonthlyPayment(
                    proposal.approvedAmount,
                    proposal.interestRate,
                    proposal.term
                  );
                  const totalCost = calculateTotalCost(
                    proposal.approvedAmount,
                    proposal.interestRate,
                    proposal.term,
                    proposal.openingCommission
                  );

                  return (
                    <Card 
                      key={target.id} 
                      className={`hover:shadow-lg transition-shadow ${target.isWinner ? 'border-purple-600 border-2' : ''}`}
                    >
                      <CardHeader className="pb-4">
                        <div className="flex items-start justify-between">
                          <div className="space-y-2 flex-1">
                            <div className="flex items-center space-x-2">
                              <Building2 className="w-5 h-5 text-primary" />
                              <CardTitle className="text-lg">
                                {target.institution?.name}
                              </CardTitle>
                            </div>
                            {target.isWinner && (
                              <Badge className="bg-purple-600">
                                <CheckCircle className="w-3 h-3 mr-1" />
                                Seleccionada
                              </Badge>
                            )}
                          </div>
                        </div>
                      </CardHeader>
                      
                      <CardContent className="space-y-4">
                        <div className="space-y-3">
                          <div className="flex items-start justify-between p-3 bg-green-50 rounded-lg">
                            <div className="flex items-center space-x-2">
                              <DollarSign className="w-4 h-4 text-green-600" />
                              <span className="text-sm text-gray-600">Monto Aprobado</span>
                            </div>
                            <p className="text-xl font-bold text-green-600">
                              ${proposal.approvedAmount.toLocaleString('es-MX')}
                            </p>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div className="p-3 bg-gray-50 rounded-lg">
                              <div className="flex items-center space-x-1 mb-1">
                                <TrendingUp className="w-3 h-3 text-gray-500" />
                                <span className="text-xs text-gray-500">Tasa</span>
                              </div>
                              <p className="font-semibold">{proposal.interestRate}%</p>
                            </div>

                            <div className="p-3 bg-gray-50 rounded-lg">
                              <div className="flex items-center space-x-1 mb-1">
                                <Calendar className="w-3 h-3 text-gray-500" />
                                <span className="text-xs text-gray-500">Plazo</span>
                              </div>
                              <p className="font-semibold">{proposal.term} meses</p>
                            </div>
                          </div>

                          {proposal.openingCommission && (
                            <div className="p-3 bg-amber-50 rounded-lg">
                              <span className="text-sm text-gray-600">Comisión de Apertura</span>
                              <p className="font-semibold text-amber-700">
                                {proposal.openingCommission}%
                              </p>
                            </div>
                          )}

                          <div className="pt-3 border-t border-gray-200 space-y-2">
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-600">Pago Mensual</span>
                              <span className="font-semibold">
                                ${monthlyPayment.toLocaleString('es-MX', { maximumFractionDigits: 2 })}
                              </span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-600">Costo Total</span>
                              <span className="font-semibold text-lg">
                                ${totalCost.toLocaleString('es-MX', { maximumFractionDigits: 2 })}
                              </span>
                            </div>
                          </div>
                        </div>

                        {!target.isWinner && (
                          <Button
                            className="w-full bg-purple-600 hover:bg-purple-700"
                            onClick={() => selectWinnerMutation.mutate(target.id)}
                            disabled={selectWinnerMutation.isPending}
                            data-testid={`button-select-winner-${target.id}`}
                          >
                            <CheckCircle className="w-4 h-4 mr-2" />
                            {selectWinnerMutation.isPending ? 'Seleccionando...' : 'Seleccionar como Ganadora'}
                          </Button>
                        )}

                        {target.isWinner && (
                          <div className="p-3 bg-purple-50 rounded-lg text-center">
                            <p className="text-sm font-medium text-purple-900">
                              Esta es la propuesta seleccionada
                            </p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}

            <Card className="bg-blue-50 border-blue-200">
              <CardContent className="p-6">
                <h3 className="font-medium text-blue-900 mb-2">Información Importante</h3>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• El costo total incluye todos los pagos mensuales más la comisión de apertura</li>
                  <li>• Los pagos mensuales son aproximados y pueden variar según el método de cálculo</li>
                  <li>• Al seleccionar una propuesta como ganadora, se creará el crédito en el sistema</li>
                  <li>• Solo puedes seleccionar una propuesta ganadora por solicitud</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
}
