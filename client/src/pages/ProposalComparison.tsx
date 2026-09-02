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

  const targetsList = allTargets || [];

  const calculateMonthlyPayment = (amount: number, rate: number, term: number) => {
    const monthlyRate = rate / 100 / 12;
    if (!monthlyRate || isNaN(monthlyRate)) return 0;
    const payment = (amount * monthlyRate * Math.pow(1 + monthlyRate, term)) / 
                    (Math.pow(1 + monthlyRate, term) - 1);
    return isNaN(payment) ? 0 : payment;
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

  const getTargetStatusBadge = (target: CreditSubmissionTarget) => {
    if (target.status === 'dispersed') {
      return <Badge className="bg-success text-white">Dispersada</Badge>;
    }
    if (target.isWinner || target.status === 'selected_winner' || target.status === 'winner') {
      return <Badge className="bg-purple-600 text-white">Seleccionada (Ganadora)</Badge>;
    }
    if (target.status === 'returned_to_broker') {
      return <Badge className="bg-orange-100 text-orange-800 border-orange-300">Devuelta</Badge>;
    }
    if (target.status === 'institution_rejected' || target.status === 'rejected') {
      return <Badge className="bg-red-100 text-red-800 border-red-300">Rechazada</Badge>;
    }
    if (target.status === 'institution_approved' || target.institutionProposal) {
      return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300">Propuesta Recibida</Badge>;
    }
    if (target.status === 'sent') {
      return <Badge className="bg-blue-100 text-blue-800 border-blue-300">Enviada a Financiera</Badge>;
    }
    return <Badge className="bg-gray-100 text-gray-700">En Proceso</Badge>;
  };

  return (
    <div className="min-h-screen flex bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header 
          title="Comparativo de Financieras y Propuestas"
          subtitle={`Solicitud para ${request?.client?.firstName || ''} ${request?.client?.lastName || ''}`}
        />
        
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                onClick={() => setLocation('/creditos')}
                data-testid="button-back"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Volver a Gestión de Créditos
              </Button>
              
              <div className="text-sm text-gray-600">
                {targetsList.length} financiera{targetsList.length !== 1 ? 's' : ''} en esta solicitud
              </div>
            </div>

            {targetsList.length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <p className="text-gray-600">No hay financieras seleccionadas para esta solicitud.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {targetsList.map((target) => {
                  const proposal = target.institutionProposal;
                  const hasProposal = Boolean(proposal && proposal.approvedAmount);
                  
                  const monthlyPayment = hasProposal ? calculateMonthlyPayment(
                    proposal!.approvedAmount,
                    proposal!.interestRate,
                    proposal!.term
                  ) : 0;

                  const totalCost = hasProposal ? calculateTotalCost(
                    proposal!.approvedAmount,
                    proposal!.interestRate,
                    proposal!.term,
                    proposal!.openingCommission
                  ) : 0;

                  return (
                    <Card 
                      key={target.id} 
                      className={`hover:shadow-lg transition-shadow flex flex-col justify-between ${
                        target.status === 'dispersed' 
                          ? 'border-green-500 border-2 bg-green-50/10' 
                          : target.isWinner 
                            ? 'border-purple-600 border-2' 
                            : target.status === 'returned_to_broker'
                              ? 'border-orange-300 bg-orange-50/20'
                              : ''
                      }`}
                    >
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-1.5 flex-1">
                            <div className="flex items-center space-x-2">
                              <Building2 className="w-5 h-5 text-primary flex-shrink-0" />
                              <CardTitle className="text-lg truncate">
                                {target.institution?.name || 'Financiera'}
                              </CardTitle>
                            </div>
                            <div>
                              {getTargetStatusBadge(target)}
                            </div>
                          </div>
                        </div>
                      </CardHeader>
                      
                      <CardContent className="space-y-4 flex-1 flex flex-col justify-between">
                        {hasProposal ? (
                          <div className="space-y-3">
                            <div className="flex items-start justify-between p-3 bg-green-50 rounded-lg">
                              <div className="flex items-center space-x-2">
                                <DollarSign className="w-4 h-4 text-green-600" />
                                <span className="text-sm text-gray-600">Monto Aprobado</span>
                              </div>
                              <p className="text-xl font-bold text-green-600">
                                ${proposal!.approvedAmount.toLocaleString('es-MX')}
                              </p>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                              <div className="p-3 bg-gray-50 rounded-lg">
                                <div className="flex items-center space-x-1 mb-1">
                                  <TrendingUp className="w-3 h-3 text-gray-500" />
                                  <span className="text-xs text-gray-500">Tasa</span>
                                </div>
                                <p className="font-semibold">{proposal!.interestRate}%</p>
                              </div>

                              <div className="p-3 bg-gray-50 rounded-lg">
                                <div className="flex items-center space-x-1 mb-1">
                                  <Calendar className="w-3 h-3 text-gray-500" />
                                  <span className="text-xs text-gray-500">Plazo</span>
                                </div>
                                <p className="font-semibold">{proposal!.term} meses</p>
                              </div>
                            </div>

                            {proposal!.openingCommission && (
                              <div className="p-2.5 bg-amber-50 rounded-lg flex justify-between items-center text-xs">
                                <span className="text-gray-600">Comisión Apertura:</span>
                                <span className="font-semibold text-amber-700">{proposal!.openingCommission}%</span>
                              </div>
                            )}

                            <div className="pt-2 border-t border-gray-200 space-y-1.5 text-xs">
                              <div className="flex justify-between">
                                <span className="text-gray-600">Pago Mensual:</span>
                                <span className="font-semibold">
                                  ${monthlyPayment.toLocaleString('es-MX', { maximumFractionDigits: 2 })}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">Costo Total Estimado:</span>
                                <span className="font-semibold text-primary">
                                  ${totalCost.toLocaleString('es-MX', { maximumFractionDigits: 2 })}
                                </span>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="p-4 bg-gray-50 rounded-lg border border-dashed border-gray-200 text-center space-y-2 my-auto">
                            {target.status === 'returned_to_broker' ? (
                              <>
                                <p className="text-xs font-semibold text-orange-800">Solicitud Devuelta</p>
                                <p className="text-xs text-gray-600 italic">
                                  {(target as any).details || (target as any).adminNotes || 'La solicitud requiere correcciones antes de ser aprobada por esta institución.'}
                                </p>
                              </>
                            ) : target.status === 'institution_rejected' ? (
                              <>
                                <p className="text-xs font-semibold text-red-700">Propuesta Declinada</p>
                                <p className="text-xs text-gray-500">La institución no aprobó la propuesta de financiamiento.</p>
                              </>
                            ) : (
                              <>
                                <p className="text-xs font-medium text-gray-600">Pendiente de propuesta</p>
                                <p className="text-xs text-gray-400">Aún no se ha registrado una oferta de esta financiera.</p>
                              </>
                            )}
                          </div>
                        )}

                        <div className="pt-3">
                          {target.status === 'dispersed' ? (
                            <div className="p-2.5 bg-green-100 text-green-900 rounded-lg text-center text-xs font-semibold">
                              ✓ Crédito Dispersado
                            </div>
                          ) : target.isWinner ? (
                            <div className="p-2.5 bg-purple-100 text-purple-900 rounded-lg text-center text-xs font-semibold">
                              ✓ Propuesta Seleccionada
                            </div>
                          ) : hasProposal ? (
                            <Button
                              className="w-full bg-purple-600 hover:bg-purple-700 text-xs h-9"
                              onClick={() => selectWinnerMutation.mutate(target.id)}
                              disabled={selectWinnerMutation.isPending}
                              data-testid={`button-select-winner-${target.id}`}
                            >
                              <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
                              {selectWinnerMutation.isPending ? 'Seleccionando...' : 'Aceptar Propuesta'}
                            </Button>
                          ) : null}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}

            <Card className="bg-blue-50 border-blue-200">
              <CardContent className="p-4 sm:p-6">
                <h3 className="font-semibold text-blue-900 mb-2 text-sm">Información y Reglas de Propuestas</h3>
                <ul className="text-xs text-blue-800 space-y-1">
                  <li>• Puedes comparar todas las financieras seleccionadas y visualizar las ofertas registradas.</li>
                  <li>• Al aceptar una propuesta, se asigna como seleccionada y se habilita para su posterior dispersión.</li>
                  <li>• En caso de que el cliente pueda y desee tomar más de una oferta, cada propuesta aprobada mantiene su estado disponible para aceptación independiente.</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
}
