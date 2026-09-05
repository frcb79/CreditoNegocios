import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import MainLayout from "@/components/MainLayout";
import Header from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  Building2, 
  DollarSign,
  TrendingUp,
  Calendar,
  CheckCircle,
  ArrowLeft,
  FileText,
  Download
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
    notes?: string;
  };
  proposalDocument?: string;
  proposalReceivedAt?: string;
  isWinner?: boolean;
  dispersedAt?: string;
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
    firstName?: string;
    lastName?: string;
    businessName?: string;
    type?: string;
    name?: string;
  };
}

export default function ProposalComparison() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [match, params] = useRoute<{ requestId: string }>("/comparar-propuestas/:requestId");
  const requestId = params?.requestId;

  const [selectedWinnerModalTarget, setSelectedWinnerModalTarget] = useState<CreditSubmissionTarget | null>(null);

  const { data: request, isLoading: requestLoading } = useQuery<CreditSubmissionRequest>({
    queryKey: ['/api/credit-submissions', requestId],
    enabled: !!requestId,
  });

  const { data: allTargets, isLoading: targetsLoading } = useQuery<CreditSubmissionTarget[]>({
    queryKey: ['/api/credit-submission-targets', { requestId }],
    enabled: !!requestId,
  });

  const targetsList = allTargets || [];

  const selectWinnerMutation = useMutation({
    mutationFn: async (targetId: string) => {
      return apiRequest("PATCH", `/api/credit-submission-targets/${targetId}/select-winner`, {});
    },
    onSuccess: (data: any, targetId: string) => {
      const winningTarget = targetsList.find(t => t.id === targetId);
      setSelectedWinnerModalTarget(winningTarget || null);
      toast({
        title: "Propuesta seleccionada",
        description: "La propuesta ha sido seleccionada como ganadora exitosamente",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/credit-submission-targets'] });
      queryClient.invalidateQueries({ queryKey: ['/api/credit-submissions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/credits'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo seleccionar la propuesta",
        variant: "destructive",
      });
    },
  });

  const handleDownloadPDF = async (targetId: string) => {
    try {
      const response = await fetch(`/api/credit-submission-targets/${targetId}/generate-pdf`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'No se pudo generar el PDF');
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `propuesta-${targetId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "No se pudo generar el PDF",
        variant: "destructive",
      });
    }
  };

  const getClientDisplayName = (client: any): string => {
    if (!client) return "Cliente";
    if (client.type === 'persona_moral' && client.businessName) {
      return client.businessName;
    }
    const fullName = `${client.firstName || ''} ${client.lastName || ''}`.trim();
    if (fullName) return fullName;
    return client.businessName || client.name || "Cliente";
  };

  if (!match || !requestId) {
    return (
      <MainLayout>
        <Header title="Error" subtitle="Solicitud no encontrada" />
        <main className="flex-1 p-8">
          <Card>
            <CardContent className="p-12 text-center">
              <p className="text-muted-foreground">La solicitud que buscas no existe.</p>
              <Button
                className="mt-4"
                onClick={() => setLocation('/creditos')}
              >
                Volver a Gestión de Créditos
              </Button>
            </CardContent>
          </Card>
        </main>
      </MainLayout>
    );
  }

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
      <MainLayout>
        <Header 
          title="Comparar Propuestas"
          subtitle="Cargando información..."
        />
        <main className="flex-1 p-8">
          <Card className="animate-pulse">
            <CardContent className="p-12">
              <div className="h-8 bg-muted rounded mb-4"></div>
              <div className="h-64 bg-muted rounded"></div>
            </CardContent>
          </Card>
        </main>
      </MainLayout>
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

  const clientName = getClientDisplayName(request?.client);
  const requestedAmountFormatted = request?.requestedAmount 
    ? `$${Number(request.requestedAmount).toLocaleString('es-MX')} MXN` 
    : '';

  return (
    <MainLayout>
      <Header 
        title="Comparativo de Financieras y Propuestas"
        subtitle={`Solicitud para: ${clientName}${requestedAmountFormatted ? ` • Monto solicitado: ${requestedAmountFormatted}` : ''}`}
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
            
            <div className="text-sm text-muted-foreground font-medium">
              {targetsList.length} financiera{targetsList.length !== 1 ? 's' : ''} en esta solicitud
            </div>
          </div>

          {targetsList.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <p className="text-muted-foreground">No hay financieras seleccionadas para esta solicitud.</p>
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
                          ? 'border-purple-600 border-2 bg-purple-50/10' 
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
                            <CardTitle className="text-lg truncate font-bold">
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
                          <div className="flex items-start justify-between p-3 bg-emerald-50 rounded-lg border border-emerald-100">
                            <div className="flex items-center space-x-2">
                              <DollarSign className="w-4 h-4 text-emerald-600" />
                              <span className="text-xs text-emerald-800 font-medium">Monto Aprobado</span>
                            </div>
                            <p className="text-xl font-bold text-emerald-700">
                              ${proposal!.approvedAmount.toLocaleString('es-MX')} MXN
                            </p>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div className="p-2.5 bg-muted/50 rounded-lg">
                              <div className="flex items-center space-x-1 mb-1">
                                <TrendingUp className="w-3 h-3 text-muted-foreground" />
                                <span className="text-xs text-muted-foreground">Tasa Anual</span>
                              </div>
                              <p className="font-semibold text-sm">{proposal!.interestRate}%</p>
                            </div>

                            <div className="p-2.5 bg-muted/50 rounded-lg">
                              <div className="flex items-center space-x-1 mb-1">
                                <Calendar className="w-3 h-3 text-muted-foreground" />
                                <span className="text-xs text-muted-foreground">Plazo</span>
                              </div>
                              <p className="font-semibold text-sm">{proposal!.term} meses</p>
                            </div>
                          </div>

                          {proposal!.openingCommission !== undefined && (
                            <div className="p-2 bg-amber-50 rounded-lg flex justify-between items-center text-xs border border-amber-100">
                              <span className="text-amber-900">Comisión Apertura:</span>
                              <span className="font-semibold text-amber-700">{proposal!.openingCommission}%</span>
                            </div>
                          )}

                          <div className="pt-2 border-t border-border space-y-1.5 text-xs">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Pago Mensual Estimado:</span>
                              <span className="font-semibold">
                                ${monthlyPayment.toLocaleString('es-MX', { maximumFractionDigits: 2 })}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Costo Total Estimado:</span>
                              <span className="font-semibold text-primary">
                                ${totalCost.toLocaleString('es-MX', { maximumFractionDigits: 2 })}
                              </span>
                            </div>
                          </div>

                          {/* Documentos de Propuesta */}
                          <div className="pt-2 border-t border-border space-y-1.5">
                            {target.proposalDocument && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="w-full text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50 h-8"
                                onClick={() => window.open(target.proposalDocument, '_blank')}
                                title="Abrir carátula o documento oficial subido por la financiera"
                              >
                                <FileText className="w-3.5 h-3.5 mr-1.5" />
                                Ver Documento Oficial de Oferta
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="w-full text-xs text-muted-foreground hover:text-foreground h-8"
                              onClick={() => handleDownloadPDF(target.id)}
                            >
                              <Download className="w-3.5 h-3.5 mr-1.5" />
                              Descargar Carátula PDF
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="p-4 bg-muted/40 rounded-lg border border-dashed border-border text-center space-y-2 my-auto">
                          {target.status === 'returned_to_broker' ? (
                            <>
                              <p className="text-xs font-semibold text-orange-800">Solicitud Devuelta</p>
                              <p className="text-xs text-muted-foreground italic">
                                {(target as any).details || (target as any).adminNotes || 'La solicitud requiere correcciones antes de ser aprobada por esta institución.'}
                              </p>
                            </>
                          ) : target.status === 'institution_rejected' ? (
                            <>
                              <p className="text-xs font-semibold text-destructive">Propuesta Declinada</p>
                              <p className="text-xs text-muted-foreground">La institución no aprobó la propuesta de financiamiento.</p>
                            </>
                          ) : (
                            <>
                              <p className="text-xs font-medium text-foreground">Pendiente de propuesta</p>
                              <p className="text-xs text-muted-foreground">Aún no se ha registrado una oferta de esta financiera.</p>
                            </>
                          )}
                        </div>
                      )}

                      <div className="pt-3">
                        {target.status === 'dispersed' ? (
                          <div className="p-2.5 bg-green-100 text-green-900 rounded-lg text-center text-xs font-semibold">
                            ✓ Crédito Dispersado el {target.dispersedAt ? new Date(target.dispersedAt).toLocaleDateString('es-MX') : ''}
                          </div>
                        ) : target.isWinner ? (
                          <div className="space-y-2">
                            <div className="p-2.5 bg-purple-100 text-purple-900 rounded-lg text-center text-xs font-semibold">
                              🏆 Propuesta Seleccionada (Ganadora)
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full text-xs text-purple-700 border-purple-300 hover:bg-purple-50 h-8"
                              onClick={() => setSelectedWinnerModalTarget(target)}
                            >
                              Ver Detalle de Selección
                            </Button>
                          </div>
                        ) : hasProposal ? (
                          <Button
                            className="w-full bg-purple-600 hover:bg-purple-700 text-white text-xs h-9 font-medium"
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

          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="p-4 sm:p-6">
              <h3 className="font-semibold text-foreground mb-2 text-sm">Información y Reglas de Propuestas</h3>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• Puedes comparar todas las financieras seleccionadas y visualizar las ofertas registradas.</li>
                <li>• Al aceptar una propuesta, se asigna como seleccionada y se habilita para su posterior dispersión en Aprobaciones.</li>
                <li>• <strong>Financiamiento Combinado:</strong> Si el cliente requiere complementar su crédito con otra oferta, puedes seleccionar más de una propuesta aprobada. Cada una genera su respectiva dispersión y comisión.</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Modal de Selección Exitosa Multi-Oferta */}
      <Dialog
        open={!!selectedWinnerModalTarget}
        onOpenChange={(open) => {
          if (!open) setSelectedWinnerModalTarget(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2 text-purple-700">
              <CheckCircle className="w-6 h-6 text-purple-600 flex-shrink-0" />
              <span>¡Propuesta Seleccionada con Éxito!</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="p-4 bg-purple-50/80 rounded-lg border border-purple-200">
              <h4 className="font-bold text-purple-950 text-base">
                {selectedWinnerModalTarget?.institution?.name || 'Financiera Seleccionada'}
              </h4>
              {selectedWinnerModalTarget?.institutionProposal && (
                <div className="mt-3 grid grid-cols-2 gap-2.5 text-xs">
                  <div>
                    <span className="text-gray-500">Monto Aprobado:</span>
                    <p className="font-bold text-sm text-emerald-700">
                      ${selectedWinnerModalTarget.institutionProposal.approvedAmount?.toLocaleString('es-MX')} MXN
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500">Tasa de Interés:</span>
                    <p className="font-bold text-sm text-gray-800">
                      {selectedWinnerModalTarget.institutionProposal.interestRate}%
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500">Plazo:</span>
                    <p className="font-bold text-sm text-gray-800">
                      {selectedWinnerModalTarget.institutionProposal.term} meses
                    </p>
                  </div>
                  {selectedWinnerModalTarget.institutionProposal.openingCommission !== undefined && (
                    <div>
                      <span className="text-gray-500">Comisión Apertura:</span>
                      <p className="font-bold text-sm text-amber-700">
                        {selectedWinnerModalTarget.institutionProposal.openingCommission}%
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-900 space-y-1">
              <p className="font-semibold flex items-center gap-1">
                <span>💡</span> ¿El cliente requiere financiamiento adicional?
              </p>
              <p className="text-blue-800 leading-relaxed">
                Si el monto aprobado no cubre la totalidad o el cliente desea tomar un crédito complementario, puedes <strong>seleccionar otra propuesta aprobada</strong> de la lista.
              </p>
            </div>
          </div>

          <DialogFooter className="flex flex-col sm:flex-row gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setSelectedWinnerModalTarget(null)}
              className="w-full sm:w-auto"
            >
              Seleccionar otra oferta
            </Button>
            <Button
              onClick={() => setLocation('/creditos')}
              className="w-full sm:w-auto bg-purple-600 hover:bg-purple-700 text-white"
            >
              Ir a Gestión de Créditos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
