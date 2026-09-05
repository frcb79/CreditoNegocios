import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Credit, Client } from "@shared/schema";
import { formatDistanceToNow, format } from "date-fns";
import { es } from "date-fns/locale";
import { 
  ChevronDown, 
  ChevronUp, 
  X, 
  FileText, 
  Building2, 
  Calendar, 
  DollarSign, 
  User, 
  AlertCircle, 
  ExternalLink, 
  Percent,
  CheckCircle,
  Package,
  Clock
} from "lucide-react";
import FinalProposalModal from "@/components/Modals/FinalProposalModal";
import MatchingComparisonTable from "@/components/MatchingAnalysis/MatchingComparisonTable";
import { submissionStatusConfig, creditStatusConfig, targetStatusConfig, getSubmissionStatusSummary } from "@/lib/statusConfig";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type UnifiedCreditItem = {
  id: string;
  linkedSubmissionId?: string;
  type: 'submission' | 'credit';
  clientId: string;
  amount: string;
  totalApprovedAmount?: number;
  winningTargets?: any[];
  dispersedTargets?: any[];
  status: string;
  createdAt: Date | string;
  term?: number;
  frequency?: string;
  interestRate?: string | number;
  financialInstitutionName?: string;
  productTemplateName?: string;
  targetsCount?: number;
  proposalsCount?: number;
  statusSummary?: ReturnType<typeof getSubmissionStatusSummary>;
  isCommissionPaid?: boolean;
  hasPendingCommission?: boolean;
  broker?: any;
  masterBroker?: any;
  rawSubmission?: any;
  rawCredit?: any;
};

// Ahora se usa configuración compartida desde @/lib/statusConfig

export default function CreditList() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [proposalCredit, setProposalCredit] = useState<Credit | null>(null);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null);
  const [selectedCreditItem, setSelectedCreditItem] = useState<UnifiedCreditItem | null>(null);
  const [expandedInstitutions, setExpandedInstitutions] = useState<Set<string>>(new Set());
  const [, setLocation] = useLocation();

  const markDispersedMutation = useMutation({
    mutationFn: async (targetId: string) => {
      return apiRequest("PATCH", `/api/credit-submission-targets/${targetId}/mark-dispersed`, {});
    },
    onSuccess: () => {
      toast({
        title: "Crédito dispersado exitosamente",
        description: "Se ha registrado la dispersión y generado la comisión correspondiente.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/credit-submission-targets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/credit-submissions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/credits"] });
      queryClient.invalidateQueries({ queryKey: ["/api/commissions"] });
    },
    onError: (err: any) => {
      toast({
        title: "Error al dispersar",
        description: err.message || "No se pudo marcar como dispersado",
        variant: "destructive",
      });
    }
  });

  const { data: credits, isLoading: creditsLoading } = useQuery<Credit[]>({
    queryKey: ["/api/credits"],
  });

  const { data: submissions, isLoading: submissionsLoading } = useQuery<any[]>({
    queryKey: ["/api/credit-submissions"],
  });

  const { data: commissions } = useQuery<any[]>({
    queryKey: ["/api/commissions"],
  });

  const { data: clients } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  const { data: selectedSubmission } = useQuery<any>({
    queryKey: ["/api/credit-submissions", selectedSubmissionId],
    enabled: !!selectedSubmissionId,
  });

  const { data: submissionTargets } = useQuery<any[]>({
    queryKey: ["/api/credit-submission-targets", { requestId: selectedSubmissionId }],
    enabled: !!selectedSubmissionId,
  });

  const activeClientId = selectedSubmission?.clientId || selectedCreditItem?.clientId;
  const { data: selectedClient } = useQuery<Client>({
    queryKey: ["/api/clients", activeClientId],
    enabled: !!activeClientId,
  });

  const { data: institutions } = useQuery<any[]>({
    queryKey: ["/api/financial-institutions"],
    enabled: !!selectedSubmissionId,
  });

  const isLoading = creditsLoading || submissionsLoading;

  const getClientName = (clientId: string) => {
    const client = clients?.find(c => c.id === clientId);
    if (!client) return `Cliente ${clientId.slice(-8)}`;
    return client.type === 'persona_moral' 
      ? (client.businessName || 'Sin razón social') 
      : `${client.firstName || ''} ${client.lastName || ''}`.trim() || 'Sin nombre';
  };

  const getClientInitials = (clientId: string) => {
    const client = clients?.find(c => c.id === clientId);
    if (!client) return '??';
    
    if (client.type === 'persona_moral') {
      return client.businessName?.slice(0, 2).toUpperCase() || 'PM';
    }
    
    const firstName = client.firstName?.[0] || '';
    const lastName = client.lastName?.[0] || '';
    return `${firstName}${lastName}`.toUpperCase() || 'CL';
  };

  const getClientAvatarColor = (clientId: string) => {
    const client = clients?.find(c => c.id === clientId);
    if (!client) return 'bg-gray-100 text-gray-700';
    
    const colors = {
      'persona_moral': 'bg-blue-100 text-blue-700',
      'fisica_empresarial': 'bg-purple-100 text-purple-700',
      'fisica': 'bg-green-100 text-green-700',
      'sin_sat': 'bg-orange-100 text-orange-700'
    };
    
    return colors[client.type as keyof typeof colors] || 'bg-gray-100 text-gray-700';
  };

  // Combine submissions and standalone credits into unified list (EXACTLY 1 card per submission request)
  const unifiedItems = useMemo(() => {
    const items: UnifiedCreditItem[] = [];
    
    // Add every submission request as exactly 1 item
    if (submissions) {
      submissions.forEach(sub => {
        const targets = sub.targets || [];
        const targetsCount = targets.length;
        const proposalsCount = targets.filter((t: any) => t.institutionProposal).length;
        const statusSummary = getSubmissionStatusSummary(targets);

        const winningTargets = targets.filter((t: any) => 
          t.status === 'selected_winner' || t.status === 'dispersed' || t.isWinner
        );
        const dispersedTargets = targets.filter((t: any) => t.status === 'dispersed');
        
        const totalApprovedAmount = winningTargets.reduce((sum: number, t: any) => {
          const val = parseFloat(t.institutionProposal?.approvedAmount || '0');
          return sum + (isNaN(val) ? 0 : val);
        }, 0);

        // Check commission status for dispersed targets
        let isCommissionPaid = false;
        let hasPendingCommission = false;
        if (dispersedTargets.length > 0) {
          const commissionsForSub = dispersedTargets.map((t: any) => 
            commissions?.find((c: any) => c.creditId === t.creditId || (t.id && c.targetId === t.id))
          ).filter(Boolean);

          if (commissionsForSub.length > 0) {
            isCommissionPaid = commissionsForSub.every((c: any) => c.status === 'paid');
            hasPendingCommission = commissionsForSub.some((c: any) => c.status !== 'paid');
          }
        }

        // Determine overall status
        let effectiveStatus = sub.status;
        if (dispersedTargets.length > 0 && dispersedTargets.length === winningTargets.length) {
          effectiveStatus = 'dispersed';
        } else if (dispersedTargets.length > 0) {
          effectiveStatus = 'partially_dispersed';
        } else if (winningTargets.length > 0) {
          effectiveStatus = 'winner_selected';
        }

        items.push({
          id: sub.id,
          type: 'submission',
          clientId: sub.clientId,
          amount: sub.requestedAmount || '0',
          totalApprovedAmount,
          winningTargets,
          dispersedTargets,
          status: effectiveStatus,
          createdAt: sub.createdAt,
          productTemplateName: sub.productTemplate?.name || sub.targets?.find((t: any) => t.productTemplate?.name)?.productTemplate?.name || sub.purpose || 'Crédito Empresarial',
          targetsCount,
          proposalsCount,
          statusSummary,
          isCommissionPaid,
          hasPendingCommission,
          broker: sub.broker,
          masterBroker: sub.masterBroker,
          rawSubmission: sub,
        });
      });
    }
    
    // Add standalone credits that do NOT belong to any submission above
    if (credits) {
      const knownSubmissionIds = new Set((submissions || []).map(s => String(s.id)));
      credits
        .filter(credit => {
          const linkedId = credit.linkedSubmissionId || (credit as any).submissionId;
          // Exclude credits that belong to a known submission request to prevent duplicates
          if (linkedId && knownSubmissionIds.has(String(linkedId))) {
            return false;
          }
          return true;
        })
        .forEach((credit: any) => {
          const linkedComm = commissions?.find(c => c.creditId === credit.id);
          const isCommissionPaid = linkedComm?.status === 'paid';
          const hasPendingCommission = linkedComm && linkedComm.status !== 'paid';

          items.push({
            id: credit.id,
            linkedSubmissionId: credit.linkedSubmissionId || (credit.submissionId ? String(credit.submissionId) : undefined),
            type: 'credit',
            clientId: credit.clientId,
            amount: credit.amount,
            status: credit.status,
            createdAt: credit.createdAt!,
            term: credit.term || undefined,
            frequency: credit.frequency || undefined,
            interestRate: credit.interestRate || undefined,
            financialInstitutionName: credit.financialInstitution?.name,
            productTemplateName: credit.productTemplate?.name,
            isCommissionPaid,
            hasPendingCommission,
            broker: credit.broker,
            masterBroker: credit.masterBroker,
            rawCredit: credit,
          });
        });
    }
    
    // Sort by creation date (newest first)
    return items.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [submissions, credits, commissions]);

  const filteredItems = unifiedItems.filter(item => {
    const clientName = getClientName(item.clientId);
    const brokerName = item.broker ? `${item.broker.firstName || ''} ${item.broker.lastName || ''}`.trim() : '';
    const matchesSearch = 
      clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      brokerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.amount.toString().includes(searchTerm);
    
    // For submissions with status summary, check if any target status matches the filter
    let matchesStatus = filterStatus === "all";
    if (!matchesStatus && item.type === 'submission' && item.statusSummary) {
      const uniqueStatuses = Object.keys(item.statusSummary.statusCounts);
      matchesStatus = uniqueStatuses.includes(filterStatus) || item.status === filterStatus;
    } else if (!matchesStatus) {
      matchesStatus = item.status === filterStatus;
    }
    
    return matchesSearch && matchesStatus;
  });

  const handleItemClick = (item: UnifiedCreditItem) => {
    setSelectedCreditItem(item);
    if (item.type === 'submission') {
      setSelectedSubmissionId(item.id);
    } else if (item.linkedSubmissionId) {
      // Dispersed credit with submission: open full proposals & matching modal
      setSelectedSubmissionId(item.linkedSubmissionId);
    } else {
      setSelectedSubmissionId(null);
    }
  };

  const toggleInstitution = (institutionId: string) => {
    const newExpanded = new Set(expandedInstitutions);
    if (newExpanded.has(institutionId)) {
      newExpanded.delete(institutionId);
    } else {
      newExpanded.add(institutionId);
    }
    setExpandedInstitutions(newExpanded);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Créditos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center space-x-4 p-4 border rounded-lg">
                <Skeleton className="h-12 w-12 rounded-full" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <Skeleton className="h-6 w-20" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gestión de Créditos ({filteredItems.length})</CardTitle>
        
        {/* Filters */}
        <div className="flex space-x-4 mt-4">
          <div className="flex-1">
            <Input
              placeholder="Buscar por cliente, ID o monto..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              data-testid="input-search-credits"
              className="placeholder:text-gray-400"
            />
          </div>
          <div className="w-48">
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger data-testid="select-credit-status">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="draft">Borrador</SelectItem>
                <SelectItem value="submitted">Enviado</SelectItem>
                <SelectItem value="pending_admin">Pendiente Admin</SelectItem>
                <SelectItem value="approved">Visto Bueno</SelectItem>
                <SelectItem value="returned_to_broker">Devuelto</SelectItem>
                <SelectItem value="sent">Enviada</SelectItem>
                <SelectItem value="proposal_received">Propuesta Recibida</SelectItem>
                <SelectItem value="winner">Seleccionada</SelectItem>
                <SelectItem value="sent_to_institutions">Enviado a Financieras</SelectItem>
                <SelectItem value="proposals_received">Propuestas Recibidas</SelectItem>
                <SelectItem value="winner_selected">Ganador Seleccionado</SelectItem>
                <SelectItem value="dispersed">Dispersado</SelectItem>
                <SelectItem value="active">Activo</SelectItem>
                <SelectItem value="completed">Completado</SelectItem>
                <SelectItem value="defaulted">En Mora</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        {filteredItems.length === 0 ? (
          <div className="text-center py-8">
            <i className="fas fa-credit-card text-4xl text-gray-300 mb-4"></i>
            <p className="text-neutral mb-4">
              {unifiedItems.length === 0 ? "No hay créditos ni solicitudes. Usa 'Solicitar Crédito' para comenzar." : "No se encontraron resultados"}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredItems.map((item) => (
              <div
                key={item.id}
                onClick={() => handleItemClick(item)}
                className="flex items-center justify-between p-4 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
                data-testid={`item-${item.id}`}
              >
                <div className="flex items-center space-x-4">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold ${getClientAvatarColor(item.clientId)}`}>
                    {getClientInitials(item.clientId)}
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900" data-testid={`item-client-${item.id}`}>
                      {getClientName(item.clientId)}
                    </h3>
                    <div className="flex items-center gap-2 flex-wrap text-sm">
                      <span className="font-semibold text-gray-800">
                        ${parseFloat(item.amount).toLocaleString('es-MX')} MXN Solicitado
                      </span>
                      {item.totalApprovedAmount && item.totalApprovedAmount > 0 ? (
                        <Badge className="bg-emerald-50 text-emerald-800 border border-emerald-300 text-[11px] font-medium">
                          ${item.totalApprovedAmount.toLocaleString('es-MX')} MXN Aprobado ({item.winningTargets?.length || 1} oferta{item.winningTargets?.length === 1 ? '' : 's'})
                        </Badge>
                      ) : null}
                      {item.term && <span className="text-xs text-neutral">• {item.term} meses</span>}
                      {item.productTemplateName && <span className="text-xs text-neutral">• {item.productTemplateName}</span>}
                    </div>
                    <p className="text-xs text-neutral mt-0.5">
                      {item.type === 'submission' ? 'Solicitud' : 'Crédito'} • Creado {formatDistanceToNow(new Date(item.createdAt), { 
                        addSuffix: true, 
                        locale: es 
                      })}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      {item.broker ? (
                        <Badge variant="outline" className="text-xs py-0.5 px-2 bg-blue-50 text-blue-800 border-blue-200 font-medium">
                          <User className="w-3 h-3 mr-1 text-blue-600 inline" />
                          Bróker: {item.broker.firstName} {item.broker.lastName || ''}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs py-0.5 px-2 bg-gray-50 text-gray-600 border-gray-200">
                          <User className="w-3 h-3 mr-1 inline text-gray-400" />
                          Bróker: No asignado
                        </Badge>
                      )}
                      {item.masterBroker && (
                        <Badge variant="outline" className="text-xs py-0.5 px-2 bg-purple-50 text-purple-700 border-purple-200">
                          <Building2 className="w-3 h-3 mr-1 inline text-purple-600" />
                          MB: {item.masterBroker.brandName || `${item.masterBroker.firstName} ${item.masterBroker.lastName}`}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center space-x-3">
                  <div className="text-right">
                    <div className="flex items-center gap-1.5 justify-end flex-wrap">
                      {item.dispersedTargets && item.dispersedTargets.length > 0 ? (
                        item.dispersedTargets.length === item.winningTargets?.length ? (
                          <Badge className="bg-emerald-600 text-white font-bold text-xs shadow-sm">
                            ✓ Dispersado ({item.dispersedTargets.length})
                          </Badge>
                        ) : (
                          <Badge className="bg-teal-600 text-white font-bold text-xs shadow-sm">
                            Dispersión Parcial ({item.dispersedTargets.length}/{item.winningTargets?.length})
                          </Badge>
                        )
                      ) : item.winningTargets && item.winningTargets.length > 0 ? (
                        <Badge className="bg-amber-500 hover:bg-amber-600 text-white font-bold animate-pulse shadow-sm text-xs">
                          🏆 {item.winningTargets.length} Ganadora{item.winningTargets.length > 1 ? 's' : ''} (Por Dispersar)
                        </Badge>
                      ) : item.type === 'submission' && item.statusSummary ? (
                        <Badge 
                          className={targetStatusConfig[item.statusSummary.primaryStatus as keyof typeof targetStatusConfig]?.color || submissionStatusConfig[item.status as keyof typeof submissionStatusConfig]?.color || "bg-gray-100 text-gray-800"}
                          data-testid={`item-status-${item.id}`}
                        >
                          {targetStatusConfig[item.statusSummary.primaryStatus as keyof typeof targetStatusConfig]?.label || item.status}
                        </Badge>
                      ) : (
                        <Badge 
                          className={creditStatusConfig[item.status as keyof typeof creditStatusConfig]?.color || "bg-gray-100 text-gray-800"}
                          data-testid={`item-status-${item.id}`}
                        >
                          {creditStatusConfig[item.status as keyof typeof creditStatusConfig]?.label || item.status}
                        </Badge>
                      )}

                      {item.isCommissionPaid ? (
                        <Badge className="bg-emerald-700 text-white border-emerald-800 text-xs">
                          <DollarSign className="w-3 h-3 mr-0.5 inline" />
                          Comisión Pagada
                        </Badge>
                      ) : item.hasPendingCommission ? (
                        <Badge className="bg-amber-500 text-white border-amber-600 text-xs animate-pulse">
                          <Clock className="w-3 h-3 mr-0.5 inline" />
                          Comisión Pendiente
                        </Badge>
                      ) : null}
                    </div>
                    {item.targetsCount !== undefined && item.targetsCount > 0 && (
                      <div className="text-[11px] text-gray-500 font-medium mt-1 space-y-0.5">
                        <p>{item.targetsCount} financiera{item.targetsCount !== 1 ? 's' : ''} selec.</p>
                        <div className="flex gap-1.5 justify-end flex-wrap">
                          {item.proposalsCount !== undefined && item.proposalsCount > 0 && (
                            <span className="text-green-600 font-semibold">{item.proposalsCount} prop.</span>
                          )}
                          {item.statusSummary?.statusCounts?.returned_to_broker && item.statusSummary.statusCounts.returned_to_broker > 0 && (
                            <span className="text-orange-600">{item.statusSummary.statusCounts.returned_to_broker} dev.</span>
                          )}
                          {item.statusSummary?.statusCounts?.institution_rejected && item.statusSummary.statusCounts.institution_rejected > 0 && (
                            <span className="text-red-600">{item.statusSummary.statusCounts.institution_rejected} rech.</span>
                          )}
                        </div>
                      </div>
                    )}
                    {item.type === 'credit' && item.frequency && (
                      <p className="text-xs text-neutral mt-1">
                        {item.frequency === 'weekly' ? 'Semanal' : 
                         item.frequency === 'biweekly' ? 'Quincenal' : 'Mensual'}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <FinalProposalModal 
        credit={proposalCredit} 
        isOpen={!!proposalCredit} 
        onClose={() => setProposalCredit(null)} 
      />

      <Dialog 
        open={!!selectedSubmissionId || !!selectedCreditItem} 
        onOpenChange={(open) => {
          if (!open) {
            setSelectedSubmissionId(null);
            setSelectedCreditItem(null);
          }
        }}
      >
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <User className="w-6 h-6 text-primary" />
                <div>
                  <h2 className="text-xl font-bold">
                    {selectedClient 
                      ? getClientName(selectedClient.id) 
                      : selectedCreditItem 
                        ? getClientName(selectedCreditItem.clientId) 
                        : 'Cargando...'}
                  </h2>
                  <p className="text-sm text-gray-500 font-normal">
                    {selectedCreditItem?.type === 'credit' 
                      ? 'Detalle del Crédito Dispersado' 
                      : 'Análisis Detallado de Matching'}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedSubmissionId(null);
                  setSelectedCreditItem(null);
                }}
                data-testid="button-close-dialog"
              >
                <X className="w-4 h-4" />
              </Button>
            </DialogTitle>
          </DialogHeader>

          {selectedSubmission && selectedClient ? (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Información General</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-start space-x-3">
                      <User className="w-5 h-5 text-gray-400 mt-0.5" />
                      <div>
                        <p className="text-xs text-gray-500">Cliente</p>
                        <p className="font-medium">{getClientName(selectedClient.id)}</p>
                        <p className="text-xs text-gray-600">
                          {selectedClient.type === 'persona_moral' ? 'Persona Moral' :
                           selectedClient.type === 'fisica_empresarial' ? 'PFAE' :
                           selectedClient.type === 'fisica' ? 'Persona Física' : 'Sin SAT'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start space-x-3">
                      <DollarSign className="w-5 h-5 text-gray-400 mt-0.5" />
                      <div>
                        <p className="text-xs text-gray-500">Monto Solicitado</p>
                        <p className="font-medium text-lg text-primary">
                          ${parseFloat(selectedSubmission.requestedAmount || '0').toLocaleString('es-MX')} MXN
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start space-x-3">
                      <FileText className="w-5 h-5 text-gray-400 mt-0.5" />
                      <div>
                        <p className="text-xs text-gray-500">Producto</p>
                        <p className="font-medium text-gray-900">
                          {selectedSubmission.productTemplate?.name || 
                           selectedSubmission.targets?.find((t: any) => t.productTemplate?.name)?.productTemplate?.name || 
                           selectedSubmission.purpose || 
                           'Crédito Empresarial'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start space-x-3">
                      <Calendar className="w-5 h-5 text-gray-400 mt-0.5" />
                      <div>
                        <p className="text-xs text-gray-500">Fecha de Creación</p>
                        <p className="font-medium">
                          {format(new Date(selectedSubmission.createdAt), "d 'de' MMMM, yyyy", { locale: es })}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start space-x-3">
                      <div className="w-5 h-5 flex items-center justify-center mt-0.5">
                        <div className="w-3 h-3 rounded-full bg-primary"></div>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Estado Actual</p>
                        {(() => {
                          const targets = submissionTargets || selectedSubmission.targets || [];
                          if (targets.length > 0) {
                            const summary = getSubmissionStatusSummary(targets);
                            const config = targetStatusConfig[summary.primaryStatus as keyof typeof targetStatusConfig] || submissionStatusConfig[selectedSubmission.status as keyof typeof submissionStatusConfig];
                            return (
                              <Badge className={config?.color || "bg-gray-100"}>
                                {config?.label || selectedSubmission.status}
                              </Badge>
                            );
                          }
                          return (
                            <Badge className={submissionStatusConfig[selectedSubmission.status as keyof typeof submissionStatusConfig]?.color || "bg-gray-100"}>
                              {submissionStatusConfig[selectedSubmission.status as keyof typeof submissionStatusConfig]?.label || selectedSubmission.status}
                            </Badge>
                          );
                        })()}
                      </div>
                    </div>

                    <div className="flex items-start space-x-3">
                      <User className="w-5 h-5 text-gray-400 mt-0.5" />
                      <div>
                        <p className="text-xs text-gray-500">Bróker Asignado</p>
                        <p className="font-medium">
                          {selectedSubmission.broker 
                            ? `${selectedSubmission.broker.firstName} ${selectedSubmission.broker.lastName || ''}`.trim()
                            : 'No asignado'}
                        </p>
                        {selectedSubmission.broker?.email && (
                          <p className="text-xs text-gray-600">{selectedSubmission.broker.email}</p>
                        )}
                        {selectedSubmission.broker?.clabe && (
                          <p className="text-xs text-gray-500 font-mono">CLABE: {selectedSubmission.broker.clabe}</p>
                        )}
                      </div>
                    </div>

                    {selectedSubmission.purpose && (
                      <div className="flex items-start space-x-3">
                        <FileText className="w-5 h-5 text-gray-400 mt-0.5" />
                        <div>
                          <p className="text-xs text-gray-500">Propósito</p>
                          <p className="font-medium">{selectedSubmission.purpose}</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {selectedSubmission.brokerNotes && (
                    <div className="mt-4 pt-4 border-t">
                      <p className="text-xs text-gray-500 mb-1">Notas del Broker</p>
                      <p className="text-sm text-gray-700">{selectedSubmission.brokerNotes}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Winning / Dispersed Offers Breakdown */}
              {(() => {
                const currentTargets = submissionTargets || selectedSubmission.targets || [];
                const winners = currentTargets.filter((t: any) => t.status === 'selected_winner' || t.status === 'dispersed' || t.isWinner);
                if (winners.length === 0) return null;

                return (
                  <Card className="border-2 border-amber-300 bg-amber-50/20 shadow-sm">
                    <CardHeader className="bg-amber-100/60 pb-3">
                      <CardTitle className="text-base flex items-center justify-between text-amber-950 font-bold">
                        <span className="flex items-center gap-2">
                          <span className="text-lg">🏆</span> Ofertas Ganadoras Seleccionadas ({winners.length})
                        </span>
                        <span className="text-xs font-normal text-amber-900 bg-amber-200/80 px-2.5 py-1 rounded-full">
                          Aprobaciones Finales
                        </span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4 space-y-4">
                      {winners.map((target: any) => {
                        const institution = institutions?.find((inst: any) => inst.id === target.financialInstitutionId) || target.institution;
                        const prop = target.institutionProposal || {};
                        const comm = commissions?.find((c: any) => c.creditId === target.creditId || (target.id && c.targetId === target.id));
                        const isDispersed = target.status === 'dispersed';
                        const isCommPaid = comm?.status === 'paid';

                        return (
                          <div key={target.id} className="bg-white rounded-lg border border-amber-200 p-4 shadow-sm space-y-3">
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <div className="flex items-center space-x-2">
                                <Building2 className="w-5 h-5 text-amber-700" />
                                <h4 className="font-bold text-gray-900 text-base">
                                  {institution?.name || 'Financiera Ganadora'}
                                </h4>
                              </div>
                              <div className="flex items-center gap-2">
                                {isDispersed ? (
                                  <Badge className="bg-emerald-600 text-white font-semibold">
                                    ✓ Dispersado
                                  </Badge>
                                ) : (
                                  <Badge className="bg-amber-500 text-white font-semibold animate-pulse">
                                    Por Dispersar
                                  </Badge>
                                )}
                              </div>
                            </div>

                            {/* Metrics grid */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-gray-50 p-3 rounded-lg border border-gray-100">
                              <div>
                                <span className="text-xs text-gray-500 block">Monto Aprobado</span>
                                <span className="font-bold text-emerald-700 text-base">
                                  ${parseFloat(prop.approvedAmount || '0').toLocaleString('es-MX')} MXN
                                </span>
                              </div>
                              <div>
                                <span className="text-xs text-gray-500 block">Tasa de Interés</span>
                                <span className="font-bold text-gray-900 text-base">{prop.interestRate || '0'}%</span>
                              </div>
                              <div>
                                <span className="text-xs text-gray-500 block">Plazo</span>
                                <span className="font-bold text-gray-900 text-base">{prop.term || '12'} meses</span>
                              </div>
                              <div>
                                <span className="text-xs text-gray-500 block">Comisión Apertura</span>
                                <span className="font-bold text-gray-900 text-base">{prop.openingCommission ? `${prop.openingCommission}%` : '0%'}</span>
                              </div>
                            </div>

                            {/* Actions & Commission row */}
                            <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100">
                              <div className="flex items-center gap-2">
                                {target.proposalDocument && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-xs h-8 text-blue-700 border-blue-200 hover:bg-blue-50"
                                    onClick={() => window.open(target.proposalDocument, '_blank')}
                                  >
                                    <FileText className="w-3.5 h-3.5 mr-1" />
                                    Ver Carátula / Documento
                                  </Button>
                                )}
                              </div>

                              <div className="flex items-center gap-2 ml-auto">
                                {!isDispersed ? (
                                  isAdmin && (
                                    <Button
                                      size="sm"
                                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-8 shadow-sm"
                                      onClick={() => markDispersedMutation.mutate(target.id)}
                                      disabled={markDispersedMutation.isPending}
                                      data-testid={`button-disperse-${target.id}`}
                                    >
                                      <Package className="w-3.5 h-3.5 mr-1.5" />
                                      Dispersar Crédito
                                    </Button>
                                  )
                                ) : (
                                  <div className="flex items-center gap-2">
                                    {isCommPaid ? (
                                      <Badge className="bg-emerald-700 text-white font-medium text-xs py-1 px-2.5">
                                        <CheckCircle className="w-3 h-3 mr-1 inline" />
                                        Comisión Pagada (${parseFloat(comm.amount).toLocaleString('es-MX')} MXN)
                                      </Badge>
                                    ) : comm ? (
                                      <div className="flex items-center gap-2">
                                        <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-xs py-1">
                                          Comisión Pendiente: ${parseFloat(comm.amount).toLocaleString('es-MX')} MXN
                                        </Badge>
                                        <Button
                                          size="sm"
                                          className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold h-8 shadow-sm"
                                          onClick={() => {
                                            setSelectedSubmissionId(null);
                                            setSelectedCreditItem(null);
                                            setLocation(`/comisiones?creditId=${target.creditId || ''}`);
                                          }}
                                          data-testid={`button-pay-comm-${target.id}`}
                                        >
                                          <DollarSign className="w-3.5 h-3.5 mr-1" />
                                          Pagar Comisión
                                        </Button>
                                      </div>
                                    ) : (
                                      <Badge variant="outline" className="text-emerald-700 border-emerald-300 text-xs">
                                        Dispersado
                                      </Badge>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                );
              })()}

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center justify-between">
                    <span>Financieras Seleccionadas ({submissionTargets?.length || 0})</span>
                    {submissionTargets && submissionTargets.filter(t => t.institutionProposal).length > 0 && (
                      <Badge className="bg-green-100 text-green-800">
                        {submissionTargets.filter(t => t.institutionProposal).length} Propuesta(s)
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {submissionTargets && submissionTargets.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <Building2 className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                      <p className="text-sm">No se han enviado a financieras aún</p>
                    </div>
                  ) : (
                    submissionTargets?.map((target) => {
                      const institution = institutions?.find(inst => inst.id === target.financialInstitutionId);
                      const isExpanded = expandedInstitutions.has(target.id);

                      return (
                        <div key={target.id} className="border rounded-lg overflow-hidden">
                          <Collapsible open={isExpanded} onOpenChange={() => toggleInstitution(target.id)}>
                            <CollapsibleTrigger asChild>
                              <div 
                                className="flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 cursor-pointer transition-colors"
                                data-testid={`target-${target.id}`}
                              >
                                <div className="flex items-center space-x-3 flex-1">
                                  <Building2 className="w-5 h-5 text-primary" />
                                  <div className="flex-1">
                                    <h4 className="font-semibold text-gray-900">
                                      {institution?.name || 'Cargando...'}
                                    </h4>
                                    <p className="text-xs text-gray-600">
                                      {target.institutionProduct?.customName || selectedSubmission.productTemplate?.name || 'Producto no especificado'}
                                    </p>
                                  </div>
                                </div>

                                <div className="flex items-center space-x-3">
                                  <Badge className={targetStatusConfig[target.status as keyof typeof targetStatusConfig]?.color || "bg-gray-100"}>
                                    {targetStatusConfig[target.status as keyof typeof targetStatusConfig]?.label || target.status}
                                  </Badge>
                                  {isExpanded ? (
                                    <ChevronUp className="w-5 h-5 text-gray-400" />
                                  ) : (
                                    <ChevronDown className="w-5 h-5 text-gray-400" />
                                  )}
                                </div>
                              </div>
                            </CollapsibleTrigger>

                            <CollapsibleContent>
                              <div className="p-4 space-y-4">
                                {institution && selectedClient ? (
                                  <div>
                                    <h5 className="font-semibold text-sm mb-3 text-gray-700">Análisis de Matching</h5>
                                    <MatchingComparisonTable
                                      client={selectedClient}
                                      institution={institution}
                                      productTemplate={selectedSubmission.productTemplate}
                                      requestedAmount={parseFloat(selectedSubmission.requestedAmount || '0')}
                                    />
                                  </div>
                                ) : (
                                  <div className="text-center py-4 text-gray-500">
                                    <p className="text-sm">Cargando análisis...</p>
                                  </div>
                                )}

                                {target.institutionProposal && (
                                  <Card className="border-green-200 bg-green-50">
                                    <CardHeader>
                                      <CardTitle className="text-sm text-green-900">Propuesta Institucional</CardTitle>
                                    </CardHeader>
                                    <CardContent className="grid grid-cols-2 gap-4">
                                      <div>
                                        <p className="text-xs text-green-700">Monto Aprobado</p>
                                        <p className="font-semibold text-green-900">
                                          ${parseFloat(target.institutionProposal.approvedAmount || '0').toLocaleString('es-MX')} MXN
                                        </p>
                                      </div>
                                      <div>
                                        <p className="text-xs text-green-700">Tasa de Interés</p>
                                        <p className="font-semibold text-green-900">
                                          {target.institutionProposal.interestRate}%
                                        </p>
                                      </div>
                                      <div>
                                        <p className="text-xs text-green-700">Plazo</p>
                                        <p className="font-semibold text-green-900">
                                          {target.institutionProposal.term} meses
                                        </p>
                                      </div>
                                      {target.institutionProposal.openingCommission && (
                                        <div>
                                          <p className="text-xs text-green-700">Comisión de Apertura</p>
                                          <p className="font-semibold text-green-900">
                                            {target.institutionProposal.openingCommission}%
                                          </p>
                                        </div>
                                      )}
                                      {target.proposalReceivedAt && (
                                        <div className="col-span-2">
                                          <p className="text-xs text-green-700">Fecha de Propuesta</p>
                                          <p className="font-semibold text-green-900">
                                            {format(new Date(target.proposalReceivedAt), "d 'de' MMMM, yyyy", { locale: es })}
                                          </p>
                                        </div>
                                      )}
                                      {target.institutionProposal.notes && (
                                        <div className="col-span-2">
                                          <p className="text-xs text-green-700">Notas</p>
                                          <p className="text-sm text-green-900">{target.institutionProposal.notes}</p>
                                        </div>
                                      )}
                                    </CardContent>
                                  </Card>
                                )}

                                {target.status === 'returned_to_broker' && (target.adminNotes || target.details) && (
                                  <div className="bg-orange-50 border-2 border-orange-300 rounded-lg p-4">
                                    <div className="flex items-start space-x-2">
                                      <AlertCircle className="w-5 h-5 text-orange-600 mt-0.5 flex-shrink-0" />
                                      <div>
                                        <p className="text-sm font-semibold text-orange-900 mb-1">Solicitud Devuelta al Broker</p>
                                        <p className="text-sm text-orange-800" data-testid={`text-admin-comments-${target.id}`}>
                                          {target.details || target.adminNotes}
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                )}

                                {target.adminNotes && target.status !== 'returned_to_broker' && (
                                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                                    <p className="text-xs text-blue-700 mb-1">Notas del Administrador</p>
                                    <p className="text-sm text-blue-900">{target.adminNotes}</p>
                                  </div>
                                )}
                              </div>
                            </CollapsibleContent>
                          </Collapsible>
                        </div>
                      );
                    })
                  )}
                </CardContent>
              </Card>
            </div>
          ) : selectedCreditItem ? (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Detalles del Crédito Dispersado</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-start space-x-3">
                      <User className="w-5 h-5 text-gray-400 mt-0.5" />
                      <div>
                        <p className="text-xs text-gray-500">Cliente</p>
                        <p className="font-semibold text-gray-900">{getClientName(selectedCreditItem.clientId)}</p>
                        {selectedClient && (
                          <p className="text-xs text-gray-600">
                            {selectedClient.type === 'persona_moral' ? 'Persona Moral' :
                             selectedClient.type === 'fisica_empresarial' ? 'PFAE' :
                             selectedClient.type === 'fisica' ? 'Persona Física' : 'Sin SAT'}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-start space-x-3">
                      <DollarSign className="w-5 h-5 text-gray-400 mt-0.5" />
                      <div>
                        <p className="text-xs text-gray-500">Monto Aprobado / Dispersado</p>
                        <p className="font-bold text-xl text-primary">
                          ${parseFloat(selectedCreditItem.amount || '0').toLocaleString('es-MX')} MXN
                        </p>
                      </div>
                    </div>

                    {selectedCreditItem.financialInstitutionName && (
                      <div className="flex items-start space-x-3">
                        <Building2 className="w-5 h-5 text-gray-400 mt-0.5" />
                        <div>
                          <p className="text-xs text-gray-500">Financiera</p>
                          <p className="font-medium text-gray-900">{selectedCreditItem.financialInstitutionName}</p>
                        </div>
                      </div>
                    )}

                    {selectedCreditItem.productTemplateName && (
                      <div className="flex items-start space-x-3">
                        <FileText className="w-5 h-5 text-gray-400 mt-0.5" />
                        <div>
                          <p className="text-xs text-gray-500">Producto / Modalidad</p>
                          <p className="font-medium text-gray-900">{selectedCreditItem.productTemplateName}</p>
                        </div>
                      </div>
                    )}

                    {selectedCreditItem.term && (
                      <div className="flex items-start space-x-3">
                        <Calendar className="w-5 h-5 text-gray-400 mt-0.5" />
                        <div>
                          <p className="text-xs text-gray-500">Plazo</p>
                          <p className="font-medium text-gray-900">{selectedCreditItem.term} meses</p>
                        </div>
                      </div>
                    )}

                    {selectedCreditItem.frequency && (
                      <div className="flex items-start space-x-3">
                        <Calendar className="w-5 h-5 text-gray-400 mt-0.5" />
                        <div>
                          <p className="text-xs text-gray-500">Frecuencia de Pago</p>
                          <p className="font-medium text-gray-900 capitalize">
                            {selectedCreditItem.frequency === 'weekly' ? 'Semanal' :
                             selectedCreditItem.frequency === 'biweekly' ? 'Quincenal' :
                             selectedCreditItem.frequency === 'monthly' ? 'Mensual' : selectedCreditItem.frequency}
                          </p>
                        </div>
                      </div>
                    )}

                    {selectedCreditItem.interestRate && (
                      <div className="flex items-start space-x-3">
                        <Percent className="w-5 h-5 text-gray-400 mt-0.5" />
                        <div>
                          <p className="text-xs text-gray-500">Tasa de Interés</p>
                          <p className="font-medium text-gray-900">{selectedCreditItem.interestRate}%</p>
                        </div>
                      </div>
                    )}

                    <div className="flex items-start space-x-3">
                      <div className="w-5 h-5 flex items-center justify-center mt-0.5">
                        <div className="w-3 h-3 rounded-full bg-primary"></div>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Estado del Crédito</p>
                        {(() => {
                          const config = creditStatusConfig[selectedCreditItem.status as keyof typeof creditStatusConfig];
                          return (
                            <Badge className={config?.color || "bg-gray-100 text-gray-800"}>
                              {config?.label || selectedCreditItem.status}
                            </Badge>
                          );
                        })()}
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 pt-4 border-t flex flex-wrap items-center justify-between gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const cId = selectedCreditItem.clientId;
                        setSelectedSubmissionId(null);
                        setSelectedCreditItem(null);
                        setLocation(`/clientes/${cId}`);
                      }}
                      className="text-xs gap-1.5"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Ver Expediente Completo del Cliente
                    </Button>

                    {selectedCreditItem.linkedSubmissionId && (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => {
                          const subId = selectedCreditItem.linkedSubmissionId;
                          setSelectedSubmissionId(null);
                          setSelectedCreditItem(null);
                          if (subId) {
                            setLocation(`/comparar-propuestas/${subId}`);
                          }
                        }}
                        className="text-xs bg-primary text-white hover:bg-primary-dark"
                      >
                        Ver Comparativo de Propuestas
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="space-y-4">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          )}

          <DialogFooter className="flex justify-between items-center gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setSelectedSubmissionId(null);
                setSelectedCreditItem(null);
              }}
              data-testid="button-close-footer"
            >
              Cerrar
            </Button>
            {((submissionTargets && submissionTargets.length > 0) || selectedCreditItem?.linkedSubmissionId) && (
              <Button
                variant="default"
                onClick={() => {
                  const reqId = selectedSubmissionId || selectedCreditItem?.linkedSubmissionId;
                  setSelectedSubmissionId(null);
                  setSelectedCreditItem(null);
                  if (reqId) {
                    setLocation(`/comparar-propuestas/${reqId}`);
                  }
                }}
                className="bg-primary text-white hover:bg-primary-dark"
                data-testid="button-compare-proposals"
              >
                Ver Comparativo de Propuestas
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
