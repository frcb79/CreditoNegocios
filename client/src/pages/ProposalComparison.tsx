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
import { apiRequest, invalidateAllCreditQueries } from "@/lib/queryClient";
import { 
  Building2, 
  DollarSign,
  TrendingUp,
  Calendar,
  CheckCircle,
  ArrowLeft,
  FileText,
  Download,
  Trophy,
  Percent,
  Clock,
  Info,
  ShieldCheck,
  Check
} from "lucide-react";
import { buildApiUrl } from "@/lib/runtimeConfig";

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

  const clientId = request?.clientId || (allTargets?.[0] as any)?.clientId;
  const { data: fetchedClient } = useQuery<any>({
    queryKey: ['/api/clients', clientId],
    enabled: !!clientId && !request?.client,
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
      invalidateAllCreditQueries(queryClient);
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
      const response = await fetch(buildApiUrl(`/api/credit-submission-targets/${targetId}/generate-pdf`), {
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
        <main className="flex-1 p-6 sm:p-8">
          <div className="bg-white border border-slate-200/80 rounded-xl p-12 text-center shadow-xs max-w-lg mx-auto">
            <div className="h-12 w-12 rounded-xl bg-slate-100/80 text-slate-400 flex items-center justify-center mx-auto mb-3 border border-slate-200/60">
              <Info className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-semibold text-slate-900 mb-1">Solicitud no encontrada</h3>
            <p className="text-xs text-slate-500 mb-5">El identificador proporcionado no corresponde a ninguna solicitud activa.</p>
            <Button
              variant="outline"
              size="sm"
              className="text-xs border-slate-200 text-slate-700 hover:bg-slate-50"
              onClick={() => setLocation('/creditos')}
            >
              <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
              Volver a Gestión de Créditos
            </Button>
          </div>
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
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="h-8 w-36 bg-slate-200 rounded-lg animate-pulse"></div>
              <div className="h-4 w-28 bg-slate-200 rounded animate-pulse"></div>
            </div>
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="bg-white border border-slate-200/80 rounded-xl p-5 shadow-xs animate-pulse space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="h-5 bg-slate-200 rounded w-36"></div>
                    <div className="h-5 bg-slate-200 rounded w-20"></div>
                  </div>
                  <div className="h-20 bg-slate-100 rounded-lg"></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="h-12 bg-slate-100 rounded-lg"></div>
                    <div className="h-12 bg-slate-100 rounded-lg"></div>
                  </div>
                  <div className="h-14 bg-slate-100 rounded-lg"></div>
                  <div className="h-9 bg-slate-200 rounded-lg"></div>
                </div>
              ))}
            </div>
          </div>
        </main>
      </MainLayout>
    );
  }

  const getTargetStatusBadge = (target: CreditSubmissionTarget) => {
    if (target.status === 'dispersed') {
      return (
        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs font-semibold">
          <Check className="w-3 h-3 mr-1" />
          Dispersada
        </Badge>
      );
    }
    if (target.isWinner || target.status === 'selected_winner' || target.status === 'winner') {
      return (
        <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 text-xs font-semibold">
          <Trophy className="w-3 h-3 mr-1 text-purple-600" />
          Seleccionada (Ganadora)
        </Badge>
      );
    }
    if (target.status === 'returned_to_broker') {
      return (
        <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-300 text-xs font-medium">
          <Clock className="w-3 h-3 mr-1 text-amber-600" />
          Devuelta
        </Badge>
      );
    }
    if (target.status === 'institution_rejected' || target.status === 'rejected') {
      return (
        <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-xs font-medium">
          Rechazada
        </Badge>
      );
    }
    if (target.status === 'institution_approved' || target.institutionProposal) {
      return (
        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs font-medium">
          <CheckCircle className="w-3 h-3 mr-1 text-emerald-600" />
          Propuesta Recibida
        </Badge>
      );
    }
    if (target.status === 'sent') {
      return (
        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs font-medium">
          Enviada a Financiera
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200 text-xs font-medium">
        En Proceso
      </Badge>
    );
  };

  const clientObj = request?.client || fetchedClient || (allTargets?.[0] as any)?.client || (allTargets?.[0] as any)?.request?.client;
  const clientName = getClientDisplayName(clientObj);
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
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Barra superior de navegación y conteo */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200/70">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLocation('/creditos')}
              data-testid="button-back"
              className="h-8 text-xs border-slate-200 text-slate-700 hover:bg-slate-50 w-fit"
            >
              <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
              Volver a Gestión de Créditos
            </Button>
            
            <div className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-primary/60"></span>
              <span>{targetsList.length} financiera{targetsList.length !== 1 ? 's' : ''} en esta solicitud</span>
            </div>
          </div>

          {targetsList.length === 0 ? (
            <div className="bg-white border border-slate-200/80 rounded-xl p-12 text-center shadow-xs">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400">
                <Building2 className="w-6 h-6" />
              </div>
              <p className="text-sm font-semibold text-slate-800">Sin financieras asignadas</p>
              <p className="text-xs text-slate-500 mt-1">No hay financieras seleccionadas para esta solicitud de crédito.</p>
            </div>
          ) : (
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
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

                const isDispersed = target.status === 'dispersed';
                const isWinner = Boolean(target.isWinner || target.status === 'selected_winner' || target.status === 'winner');
                const isReturned = target.status === 'returned_to_broker';
                const isRejected = target.status === 'institution_rejected' || target.status === 'rejected';

                let cardBorderClass = 'border-slate-200/80 hover:border-slate-300';
                if (isDispersed) {
                  cardBorderClass = 'border-emerald-300 ring-1 ring-emerald-200/70 bg-gradient-to-b from-white to-emerald-50/20';
                } else if (isWinner) {
                  cardBorderClass = 'border-purple-300 ring-1 ring-purple-200/70 bg-gradient-to-b from-white to-purple-50/20';
                } else if (isReturned) {
                  cardBorderClass = 'border-amber-300/80 bg-amber-50/20';
                } else if (isRejected) {
                  cardBorderClass = 'border-slate-200 opacity-80';
                }

                return (
                  <div 
                    key={target.id} 
                    className={`bg-white border rounded-xl shadow-xs transition-all flex flex-col justify-between overflow-hidden ${cardBorderClass}`}
                  >
                    {/* Header de la tarjeta de propuesta */}
                    <div className="p-4 sm:p-5 pb-3 border-b border-slate-100 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="h-8 w-8 rounded-lg bg-slate-100/90 text-slate-700 flex items-center justify-center shrink-0 border border-slate-200/60">
                            <Building2 className="w-4 h-4" />
                          </div>
                          <h3 className="text-sm sm:text-base font-bold text-slate-900 truncate">
                            {target.institution?.name || 'Financiera'}
                          </h3>
                        </div>
                      </div>
                      <div>
                        {getTargetStatusBadge(target)}
                      </div>
                    </div>
                    
                    {/* Cuerpo de la tarjeta con datos financieros */}
                    <div className="p-4 sm:p-5 pt-3 space-y-4 flex-1 flex flex-col justify-between">
                      {hasProposal ? (
                        <div className="space-y-3">
                          {/* Monto Aprobado */}
                          <div className="flex items-center justify-between p-3 bg-slate-50/80 rounded-lg border border-slate-100">
                            <div className="flex items-center gap-1.5">
                              <DollarSign className="w-3.5 h-3.5 text-slate-500" />
                              <span className="text-xs text-slate-600 font-medium">Monto Aprobado</span>
                            </div>
                            <span className="text-lg font-bold text-emerald-700 tracking-tight">
                              ${proposal!.approvedAmount.toLocaleString('es-MX')} MXN
                            </span>
                          </div>

                          {/* Grid Tasa y Plazo */}
                          <div className="grid grid-cols-2 gap-2.5">
                            <div className="p-2.5 bg-white rounded-lg border border-slate-200/70 shadow-2xs">
                              <div className="flex items-center gap-1 mb-0.5">
                                <TrendingUp className="w-3 h-3 text-slate-400" />
                                <span className="text-[11px] text-slate-500 font-medium">Tasa Anual</span>
                              </div>
                              <p className="font-semibold text-xs sm:text-sm text-slate-800">{proposal!.interestRate}%</p>
                            </div>

                            <div className="p-2.5 bg-white rounded-lg border border-slate-200/70 shadow-2xs">
                              <div className="flex items-center gap-1 mb-0.5">
                                <Calendar className="w-3 h-3 text-slate-400" />
                                <span className="text-[11px] text-slate-500 font-medium">Plazo</span>
                              </div>
                              <p className="font-semibold text-xs sm:text-sm text-slate-800">{proposal!.term} meses</p>
                            </div>
                          </div>

                          {/* Comisión por Apertura si aplica */}
                          {proposal!.openingCommission !== undefined && (
                            <div className="p-2 bg-amber-50/60 rounded-lg flex justify-between items-center text-xs border border-amber-200/60">
                              <span className="text-amber-900 font-medium">Comisión por Apertura:</span>
                              <span className="font-bold text-amber-800">{proposal!.openingCommission}%</span>
                            </div>
                          )}

                          {/* Resumen de Costos */}
                          <div className="pt-2 border-t border-slate-100 space-y-1.5 text-xs">
                            <div className="flex justify-between items-center">
                              <span className="text-slate-500">Pago Mensual Estimado:</span>
                              <span className="font-semibold text-slate-800">
                                ${monthlyPayment.toLocaleString('es-MX', { maximumFractionDigits: 2 })}
                              </span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-slate-500">Costo Total Estimado:</span>
                              <span className="font-bold text-slate-900">
                                ${totalCost.toLocaleString('es-MX', { maximumFractionDigits: 2 })}
                              </span>
                            </div>
                          </div>

                          {/* Documentos de Propuesta */}
                          <div className="pt-2 border-t border-slate-100 space-y-1.5">
                            {target.proposalDocument && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="w-full text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50 h-8"
                                onClick={() => window.open(buildApiUrl(`/api/credit-submission-targets/${target.id}/proposal-document`), '_blank')}
                                title="Abrir carátula o documento oficial subido por la financiera"
                              >
                                <FileText className="w-3.5 h-3.5 mr-1.5" />
                                Ver Documento Oficial de Oferta
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="w-full text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 h-8"
                              onClick={() => handleDownloadPDF(target.id)}
                            >
                              <Download className="w-3.5 h-3.5 mr-1.5" />
                              Descargar Carátula PDF
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="p-4 bg-slate-50/70 rounded-lg border border-dashed border-slate-200 text-center space-y-1.5 my-auto">
                          {target.status === 'returned_to_broker' ? (
                            <>
                              <p className="text-xs font-semibold text-amber-900">Solicitud Devuelta</p>
                              <p className="text-xs text-slate-600 italic">
                                {(target as any).details || (target as any).adminNotes || 'La solicitud requiere correcciones antes de ser aprobada por esta institución.'}
                              </p>
                            </>
                          ) : target.status === 'institution_rejected' ? (
                            <>
                              <p className="text-xs font-semibold text-red-700">Propuesta Declinada</p>
                              <p className="text-xs text-slate-500">La institución no aprobó la propuesta de financiamiento.</p>
                            </>
                          ) : (
                            <>
                              <p className="text-xs font-semibold text-slate-700">Pendiente de propuesta</p>
                              <p className="text-xs text-slate-500">Aún no se ha registrado una oferta formal de esta financiera.</p>
                            </>
                          )}
                        </div>
                      )}

                      {/* Botón o Estado Operativo Inferior */}
                      <div className="pt-3 border-t border-slate-100">
                        {target.status === 'dispersed' ? (
                          <div className="p-2.5 bg-emerald-50 text-emerald-800 border border-emerald-200/80 rounded-lg text-center text-xs font-semibold flex items-center justify-center gap-1.5">
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Crédito Dispersado el {target.dispersedAt ? new Date(target.dispersedAt).toLocaleDateString('es-MX') : ''}</span>
                          </div>
                        ) : target.isWinner ? (
                          <div className="space-y-2">
                            <div className="p-2.5 bg-purple-50 text-purple-900 border border-purple-200/80 rounded-lg text-center text-xs font-semibold flex items-center justify-center gap-1.5">
                              <Trophy className="w-3.5 h-3.5 text-purple-600" />
                              <span>Propuesta Seleccionada (Ganadora)</span>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full text-xs text-purple-700 border-purple-200 hover:bg-purple-50 h-8"
                              onClick={() => setSelectedWinnerModalTarget(target)}
                            >
                              Ver Detalle de Selección
                            </Button>
                          </div>
                        ) : hasProposal ? (
                          <Button
                            className="w-full bg-primary hover:bg-primary/90 text-white text-xs h-9 font-medium shadow-xs"
                            onClick={() => selectWinnerMutation.mutate(target.id)}
                            disabled={selectWinnerMutation.isPending}
                            data-testid={`button-select-winner-${target.id}`}
                          >
                            <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
                            {selectWinnerMutation.isPending ? 'Seleccionando...' : 'Aceptar Propuesta'}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Información y Reglas Institucionales */}
          <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-4 sm:p-5 shadow-2xs">
            <h3 className="font-semibold text-slate-900 mb-2 text-xs sm:text-sm flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-primary" />
              <span>Información y Reglas de Propuestas</span>
            </h3>
            <ul className="text-xs text-slate-600 space-y-1.5">
              <li className="flex items-start gap-1.5">
                <span className="text-slate-400 mt-0.5">•</span>
                <span>Puedes comparar todas las financieras seleccionadas y visualizar las ofertas registradas.</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-slate-400 mt-0.5">•</span>
                <span>Al aceptar una propuesta, se asigna como seleccionada y se habilita para su posterior dispersión en Aprobaciones.</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-slate-400 mt-0.5">•</span>
                <span><strong>Financiamiento Combinado:</strong> Si el cliente requiere complementar su crédito con otra oferta, puedes seleccionar más de una propuesta aprobada. Cada una genera su respectiva dispersión y comisión.</span>
              </li>
            </ul>
          </div>
        </div>
      </main>

      {/* Modal de Selección Exitosa Multi-Oferta */}
      <Dialog
        open={!!selectedWinnerModalTarget}
        onOpenChange={(open) => {
          if (!open) setSelectedWinnerModalTarget(null);
        }}
      >
        <DialogContent className="max-w-md w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2 text-purple-700 dark:text-purple-300">
              <CheckCircle className="w-5 h-5 text-purple-600 dark:text-purple-400 flex-shrink-0" />
              <span>¡Propuesta Seleccionada con Éxito!</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="p-3.5 bg-purple-50/70 dark:bg-purple-950/20 rounded-lg border border-purple-200/80 dark:border-purple-800/40">
              <h4 className="font-bold text-purple-950 dark:text-purple-100 text-base">
                {selectedWinnerModalTarget?.institution?.name || 'Financiera Seleccionada'}
              </h4>
              {selectedWinnerModalTarget?.institutionProposal && (
                <div className="mt-3 grid grid-cols-2 gap-2.5 text-xs">
                  <div>
                    <span className="text-muted-foreground">Monto Aprobado:</span>
                    <p className="font-bold text-sm text-emerald-700 dark:text-emerald-400">
                      ${selectedWinnerModalTarget.institutionProposal.approvedAmount?.toLocaleString('es-MX')} MXN
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Tasa de Interés:</span>
                    <p className="font-bold text-sm text-foreground">
                      {selectedWinnerModalTarget.institutionProposal.interestRate}%
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Plazo:</span>
                    <p className="font-bold text-sm text-foreground">
                      {selectedWinnerModalTarget.institutionProposal.term} meses
                    </p>
                  </div>
                  {selectedWinnerModalTarget.institutionProposal.openingCommission !== undefined && (
                    <div>
                      <span className="text-muted-foreground">Comisión Apertura:</span>
                      <p className="font-bold text-sm text-amber-700 dark:text-amber-400">
                        {selectedWinnerModalTarget.institutionProposal.openingCommission}%
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="p-3 bg-blue-50/70 dark:bg-blue-950/20 border border-blue-200/80 dark:border-blue-800/40 rounded-lg text-xs text-blue-900 dark:text-blue-200 space-y-1">
              <p className="font-semibold flex items-center gap-1">
                <span>💡</span> ¿El cliente requiere financiamiento adicional?
              </p>
              <p className="text-blue-800 dark:text-blue-300 leading-relaxed">
                Si el monto aprobado no cubre la totalidad o el cliente desea tomar un crédito complementario, puedes <strong>seleccionar otra propuesta aprobada</strong> de la lista.
              </p>
            </div>
          </div>

          <DialogFooter className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-border/60">
            <Button
              variant="outline"
              onClick={() => setSelectedWinnerModalTarget(null)}
              className="w-full sm:w-auto"
            >
              Seleccionar otra oferta
            </Button>
            <Button
              onClick={() => setLocation('/creditos')}
              className="w-full sm:w-auto bg-purple-600 hover:bg-purple-700 dark:bg-purple-600 dark:hover:bg-purple-500 text-white"
            >
              Ir a Gestión de Créditos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
