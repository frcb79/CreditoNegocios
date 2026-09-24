import { useState, useMemo, useEffect } from "react";
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
import { 
  DropdownMenu, 
  DropdownMenuTrigger, 
  DropdownMenuContent, 
  DropdownMenuItem 
} from "@/components/ui/dropdown-menu";
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
  Clock,
  Search,
  MoreHorizontal,
  Home,
  Users,
  Loader2
} from "lucide-react";
import FinalProposalModal from "@/components/Modals/FinalProposalModal";
import MatchingComparisonTable from "@/components/MatchingAnalysis/MatchingComparisonTable";
import { submissionStatusConfig, creditStatusConfig, targetStatusConfig, getSubmissionStatusSummary, getStatusLabel } from "@/lib/statusConfig";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { buildApiUrl } from "@/lib/runtimeConfig";
import { cn } from "@/lib/utils";

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
  paidCommissionsCount?: number;
  totalCommissionsCount?: number;
  broker?: any;
  masterBroker?: any;
  rawSubmission?: any;
  rawCredit?: any;
};

// Ahora se usa configuración compartida desde @/lib/statusConfig

export default function CreditList() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const isMasterBroker = user?.role === 'master_broker';
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [masterTab, setMasterTab] = useState<'direct' | 'network'>('direct');
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
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/metrics"] });
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

  const { data: productTemplates } = useQuery<any[]>({
    queryKey: ["/api/product-templates"],
  });

  const isLoading = creditsLoading || submissionsLoading;

  const getProductName = (target?: any, submission?: any) => {
    if (target?.institutionProduct?.customName) return target.institutionProduct.customName;
    if (target?.productTemplate?.name) return target.productTemplate.name;
    if (submission?.productTemplate?.name) return submission.productTemplate.name;
    const templateId = target?.productTemplateId || submission?.productTemplateId;
    if (templateId && productTemplates) {
      const found = productTemplates.find((pt: any) => pt.id === templateId);
      if (found?.name) return found.name;
    }
    const purpose = target?.purpose || submission?.purpose;
    if (purpose) {
      const purposeMap: Record<string, string> = {
        'capital_trabajo': 'Crédito Capital de Trabajo',
        'adquisicion_activos': 'Crédito Adquisición de Activos',
        'refinanciamiento': 'Crédito Refinanciamiento',
        'expansion': 'Crédito Expansión',
        'liquidez': 'Crédito de Liquidez',
        'arrendamiento': 'Arrendamiento Puro / Financiero',
      };
      if (purposeMap[purpose]) return purposeMap[purpose];
    }
    return 'Crédito Empresarial';
  };

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
        let paidCommissionsCount = 0;
        const totalCommissionsCount = dispersedTargets.length;
        if (dispersedTargets.length > 0) {
          const targetComms = dispersedTargets.map((t: any) => {
            const comm = commissions?.find((c: any) => c.creditId === t.creditId || (t.id && c.targetId === t.id));
            return { target: t, commission: comm };
          });

          paidCommissionsCount = targetComms.filter((tc: any) => tc.commission?.status === 'paid').length;
          // Paid only if EVERY dispersed target has a registered commission AND that commission is 'paid'
          isCommissionPaid = targetComms.length > 0 && targetComms.every((tc: any) => tc.commission && tc.commission.status === 'paid');
          // Pending if any dispersed target lacks a commission or its status is not 'paid'
          hasPendingCommission = targetComms.some((tc: any) => !tc.commission || tc.commission.status !== 'paid');
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
          productTemplateName: getProductName(sub.targets?.find((t: any) => t.productTemplate?.name), sub),
          targetsCount,
          proposalsCount,
          statusSummary,
          isCommissionPaid,
          hasPendingCommission,
          paidCommissionsCount,
          totalCommissionsCount,
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
          const hasPendingCommission = credit.status === 'dispersed' && (!linkedComm || linkedComm.status !== 'paid');

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
            paidCommissionsCount: isCommissionPaid ? 1 : 0,
            totalCommissionsCount: credit.status === 'dispersed' ? 1 : 0,
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

  const directItemsCount = useMemo(() => {
    if (!isMasterBroker || !user?.id) return 0;
    return unifiedItems.filter(item => {
      const bId = item.broker?.id || item.rawSubmission?.brokerId || item.rawCredit?.brokerId;
      return bId === user.id;
    }).length;
  }, [unifiedItems, isMasterBroker, user?.id]);

  const networkItemsCount = useMemo(() => {
    if (!isMasterBroker || !user?.id) return 0;
    return unifiedItems.filter(item => {
      const bId = item.broker?.id || item.rawSubmission?.brokerId || item.rawCredit?.brokerId;
      return bId && bId !== user.id;
    }).length;
  }, [unifiedItems, isMasterBroker, user?.id]);

  useEffect(() => {
    if (isMasterBroker && directItemsCount === 0 && networkItemsCount > 0) {
      setMasterTab('network');
    }
  }, [isMasterBroker, directItemsCount, networkItemsCount]);

  const filteredItems = useMemo(() => {
    let list = unifiedItems;

    if (isMasterBroker && user?.id) {
      if (masterTab === 'direct') {
        list = list.filter(item => {
          const bId = item.broker?.id || item.rawSubmission?.brokerId || item.rawCredit?.brokerId;
          return bId === user.id;
        });
      } else if (masterTab === 'network') {
        list = list.filter(item => {
          const bId = item.broker?.id || item.rawSubmission?.brokerId || item.rawCredit?.brokerId;
          return bId && bId !== user.id;
        });
      }
    }

    return list.filter(item => {
      const clientName = getClientName(item.clientId);
      const brokerName = item.broker ? `${item.broker.firstName || ''} ${item.broker.lastName || ''}`.trim() : '';
      const matchesSearch = 
        clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        brokerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.amount.toString().includes(searchTerm);
      
      let matchesStatus = filterStatus === "all";
      if (!matchesStatus && item.type === 'submission' && item.statusSummary) {
        const uniqueStatuses = Object.keys(item.statusSummary.statusCounts);
        matchesStatus = uniqueStatuses.includes(filterStatus) || item.status === filterStatus;
      } else if (!matchesStatus) {
        matchesStatus = item.status === filterStatus;
      }
      
      return matchesSearch && matchesStatus;
    });
  }, [unifiedItems, searchTerm, filterStatus, isMasterBroker, masterTab, user?.id, clients]);

  const getClientSubtitle = (clientId: string) => {
    const client = clients?.find(c => c.id === clientId);
    if (!client) return `Exp. #${clientId.slice(-6).toUpperCase()}`;
    const typeLabel = client.type === 'persona_moral' ? 'PM' : client.type === 'fisica_empresarial' ? 'PFAE' : 'PF';
    const rfcText = client.rfc ? `RFC: ${client.rfc}` : 'RFC: No proporcionado';
    return `${typeLabel} • ${rfcText}`;
  };

  const formatRelativeDate = (dateInput: Date | string) => {
    try {
      const d = new Date(dateInput);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      
      if (diffHours < 1) {
        const diffMins = Math.max(1, Math.floor(diffMs / (1000 * 60)));
        return `hace ${diffMins}m`;
      }
      if (diffHours < 24) {
        return `hace ${diffHours}h`;
      }
      if (diffHours < 48) {
        return 'ayer';
      }
      return format(d, 'd MMM', { locale: es });
    } catch {
      return 'Reciente';
    }
  };

  const getStatusDisplay = (item: UnifiedCreditItem) => {
    if (item.dispersedTargets && item.dispersedTargets.length > 0) {
      if (item.dispersedTargets.length === item.winningTargets?.length) {
        return {
          label: "Dispersado",
          badgeClass: "bg-emerald-50 text-emerald-800 border-emerald-200/80",
          dotClass: "bg-emerald-500",
        };
      }
      return {
        label: `Dispersión parcial (${item.dispersedTargets.length})`,
        badgeClass: "bg-teal-50 text-teal-800 border-teal-200/80",
        dotClass: "bg-teal-500",
      };
    }

    if (item.winningTargets && item.winningTargets.length > 0) {
      return {
        label: `Ganador seleccionado (${item.winningTargets.length})`,
        badgeClass: "bg-purple-50 text-purple-800 border-purple-200/80",
        dotClass: "bg-purple-500",
      };
    }

    const effectiveStatus = (item.type === 'submission' && item.statusSummary?.primaryStatus) 
      ? item.statusSummary.primaryStatus 
      : item.status;
    
    const label = getStatusLabel(effectiveStatus);
    const norm = (effectiveStatus || '').toLowerCase();

    if (norm === 'dispersed' || norm === 'disbursed' || norm === 'dispersado') {
      return { label, badgeClass: "bg-emerald-50 text-emerald-800 border-emerald-200/80", dotClass: "bg-emerald-500" };
    }
    if (norm.includes('aprobado') || norm.includes('approved')) {
      return { label, badgeClass: "bg-emerald-50 text-emerald-800 border-emerald-200/80", dotClass: "bg-emerald-500" };
    }
    if (norm.includes('winner') || norm.includes('ganador')) {
      return { label, badgeClass: "bg-purple-50 text-purple-800 border-purple-200/80", dotClass: "bg-purple-500" };
    }
    if (norm.includes('sent') || norm.includes('enviad') || norm.includes('proposals') || norm.includes('propuesta')) {
      return { label, badgeClass: "bg-blue-50 text-blue-800 border-blue-200/80", dotClass: "bg-blue-500" };
    }
    if (norm.includes('pending') || norm.includes('pendient') || norm.includes('review') || norm.includes('revision')) {
      return { label, badgeClass: "bg-amber-50 text-amber-800 border-amber-200/80", dotClass: "bg-amber-500" };
    }
    if (norm.includes('reject') || norm.includes('rechaz') || norm.includes('returned') || norm.includes('devuelt')) {
      return { label, badgeClass: "bg-rose-50 text-rose-800 border-rose-200/80", dotClass: "bg-rose-500" };
    }
    return {
      label,
      badgeClass: "bg-slate-50 text-slate-700 border-slate-200/80",
      dotClass: "bg-slate-400",
    };
  };

  const isMortgageItem = (item: UnifiedCreditItem) => {
    return Boolean(
      item.productTemplateName?.toLowerCase().includes("hipotecario") ||
      (item.rawSubmission?.mortgageData && Object.keys(item.rawSubmission.mortgageData).length > 0) ||
      (item.rawCredit?.mortgageData && Object.keys(item.rawCredit.mortgageData).length > 0)
    );
  };

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
      <div className="bg-white border border-slate-200/80 rounded-xl p-6 space-y-4 shadow-sm">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-9 w-64" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between p-3 border-b border-slate-100">
              <div className="flex items-center space-x-3">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-24" />
              </div>
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-8 w-20" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200/80 rounded-xl shadow-sm overflow-hidden">
        {/* Tabs for Master Broker */}
        {isMasterBroker && (
          <div className="flex border-b border-slate-200 bg-slate-50/60 px-6 pt-3 gap-8">
            <button
              type="button"
              onClick={() => setMasterTab('direct')}
              className={`pb-3 text-sm font-semibold border-b-2 flex items-center gap-2 transition-colors ${
                masterTab === 'direct'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Package className="w-4 h-4" />
              Mis Créditos Directos ({directItemsCount})
            </button>
            <button
              type="button"
              onClick={() => setMasterTab('network')}
              className={`pb-3 text-sm font-semibold border-b-2 flex items-center gap-2 transition-colors ${
                masterTab === 'network'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Users className="w-4 h-4" />
              Créditos de mi Red ({networkItemsCount})
            </button>
          </div>
        )}

        {/* Subheader / Toolbar */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between bg-white">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-slate-900 tracking-tight">
              Operaciones registradas
            </h2>
            <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
              {filteredItems.length}
            </span>
          </div>

          <div className="flex items-center gap-3 flex-1 sm:max-w-md">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Buscar por cliente, ID o monto..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                data-testid="input-search-credits"
                className="pl-9 h-9 text-xs placeholder:text-slate-400 border-slate-200 bg-slate-50/50 focus:bg-white transition-colors"
              />
            </div>
            <div className="w-44">
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger data-testid="select-credit-status" className="h-9 text-xs border-slate-200 bg-white">
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los estados</SelectItem>
                  <SelectItem value="draft">Borrador</SelectItem>
                  <SelectItem value="submitted">En validación</SelectItem>
                  <SelectItem value="pending_admin">Pendiente de revisión</SelectItem>
                  <SelectItem value="approved">Aprobado</SelectItem>
                  <SelectItem value="returned_to_broker">Devuelto</SelectItem>
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
        </div>

        {/* Table Content */}
        {filteredItems.length === 0 ? (
          <div className="text-center py-16 px-4">
            <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
              <FileText className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-slate-900 mb-1">
              {unifiedItems.length === 0 ? "No hay operaciones registradas" : "Sin resultados para tu búsqueda"}
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              {unifiedItems.length === 0
                ? "Inicia un nuevo expediente utilizando el botón Nueva Solicitud en la parte superior."
                : "Intenta ajustar el término de búsqueda o limpia los filtros para ver los expedientes."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wider text-slate-500 select-none">
                  <th className="py-3 px-4">Cliente / Expediente</th>
                  <th className="py-3 px-4">Producto / Vertical</th>
                  <th className="py-3 px-4 text-right">Monto</th>
                  <th className="py-3 px-4">Financiera</th>
                  <th className="py-3 px-4 text-center">Estado</th>
                  <th className="py-3 px-4">Originador</th>
                  <th className="py-3 px-3 text-center">Actualizado</th>
                  <th className="py-3 px-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.map((item) => {
                  const isMortgage = isMortgageItem(item);
                  const statusInfo = getStatusDisplay(item);
                  return (
                    <tr
                      key={item.id}
                      onClick={() => handleItemClick(item)}
                      className="hover:bg-slate-50/70 transition-colors cursor-pointer group h-[60px]"
                      data-testid={`item-${item.id}`}
                    >
                      {/* 1. Cliente / Expediente */}
                      <td className="py-3 px-4">
                        <div className="flex flex-col min-w-0">
                          <span 
                            className="text-sm font-semibold text-slate-900 group-hover:text-primary transition-colors" 
                            data-testid={`item-client-${item.id}`}
                            title={getClientName(item.clientId)}
                          >
                            {getClientName(item.clientId)}
                          </span>
                          <span className="text-[11px] text-slate-500">
                            {getClientSubtitle(item.clientId)}
                          </span>
                        </div>
                      </td>

                      {/* 2. Producto / Vertical */}
                      <td className="py-3 px-4">
                        {isMortgage ? (
                          <span 
                            data-testid={`badge-mortgage-${item.id}`} 
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium bg-amber-50 text-amber-900 border border-amber-200/80 whitespace-nowrap"
                          >
                            <Home className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                            <span>Hipotecario Vivienda</span>
                          </span>
                        ) : (
                          <div className="flex flex-col">
                            <span className="text-xs font-medium text-slate-800" title={item.productTemplateName || 'Crédito Simple'}>
                              {item.productTemplateName || 'Crédito Simple'}
                            </span>
                            {item.term ? (
                              <span className="text-[11px] text-slate-400">
                                {item.term} meses {item.frequency ? `• ${item.frequency === 'monthly' ? 'Mensual' : item.frequency}` : ''}
                              </span>
                            ) : null}
                          </div>
                        )}
                      </td>

                      {/* 3. Monto */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex flex-col items-end whitespace-nowrap">
                          <span className="text-sm font-semibold text-slate-900 tabular-nums">
                            ${parseFloat(item.amount || '0').toLocaleString('es-MX')} MXN
                          </span>
                          {item.totalApprovedAmount && item.totalApprovedAmount > 0 ? (
                            <span className="text-[11px] text-emerald-700 font-medium tabular-nums">
                              Aprobado: ${item.totalApprovedAmount.toLocaleString('es-MX')}
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400">Solicitado</span>
                          )}
                        </div>
                      </td>

                      {/* 4. Financiera */}
                      <td className="py-2.5 px-4">
                        {(() => {
                          if (item.winningTargets && item.winningTargets.length > 0) {
                            const instName = item.winningTargets[0].financialInstitution?.name || 'Financiera Ganadora';
                            const count = item.winningTargets.length;
                            return (
                              <div className="flex flex-col max-w-[160px]">
                                <span className="text-xs font-medium text-slate-800 truncate" title={instName}>{instName}</span>
                                {count > 1 && <span className="text-[11px] text-slate-500">+{count - 1} oferta adicional</span>}
                              </div>
                            );
                          }
                          if (item.financialInstitutionName) {
                            return <span className="text-xs font-medium text-slate-800 truncate block max-w-[160px]" title={item.financialInstitutionName}>{item.financialInstitutionName}</span>;
                          }
                          if (item.targetsCount && item.targetsCount > 0) {
                            return (
                              <div className="flex flex-col">
                                <span className="text-xs text-slate-700 font-medium">{item.targetsCount} financiera{item.targetsCount !== 1 ? 's' : ''}</span>
                                <span className="text-[11px] text-slate-400">{item.proposalsCount || 0} propuestas</span>
                              </div>
                            );
                          }
                          return <span className="text-xs text-slate-400 italic">Por asignar</span>;
                        })()}
                      </td>

                      {/* 5. Estado */}
                      <td className="py-2.5 px-4 text-center">
                        <div className="flex flex-col items-center justify-center gap-0.5">
                          <span 
                            data-testid={`item-status-${item.id}`}
                            className={cn(
                              "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border whitespace-nowrap",
                              statusInfo.badgeClass
                            )}
                          >
                            <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", statusInfo.dotClass)} />
                            <span>{statusInfo.label}</span>
                          </span>
                          {item.isCommissionPaid ? (
                            <span className="text-[10px] font-medium text-emerald-700">Comisión pagada</span>
                          ) : item.hasPendingCommission ? (
                            <span className="text-[10px] font-medium text-amber-700">Comisión pendiente</span>
                          ) : null}
                        </div>
                      </td>

                      {/* 6. Originador */}
                      <td className="py-2.5 px-4">
                        <div className="flex flex-col text-xs max-w-[150px]">
                          {item.broker ? (
                            <span className="font-medium text-slate-800 truncate" title={`${item.broker.firstName} ${item.broker.lastName || ''}`}>
                              {item.broker.firstName} {item.broker.lastName || ''}
                            </span>
                          ) : (
                            <span className="text-slate-400 italic">No asignado</span>
                          )}
                          {item.masterBroker && (
                            <span className="text-[11px] text-slate-500 truncate" title={`MB: ${item.masterBroker.brandName || item.masterBroker.firstName}`}>
                              MB: {item.masterBroker.brandName || item.masterBroker.firstName}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 7. Actualizado */}
                      <td className="py-2.5 px-3 text-center">
                        <span 
                          className="text-xs text-slate-500 whitespace-nowrap"
                          title={format(new Date(item.createdAt), "dd 'de' MMMM, yyyy HH:mm", { locale: es })}
                        >
                          {formatRelativeDate(item.createdAt)}
                        </span>
                      </td>

                      {/* 8. Acciones */}
                      <td className="py-2.5 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2.5 text-xs font-medium text-slate-700 hover:text-slate-900 border-slate-200 hover:bg-slate-50"
                            onClick={() => handleItemClick(item)}
                          >
                            Gestionar
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-slate-400 hover:text-slate-700">
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44 text-xs">
                              <DropdownMenuItem onClick={() => handleItemClick(item)}>
                                Ver expediente completo
                              </DropdownMenuItem>
                              {item.clientId && (
                                <DropdownMenuItem onClick={() => setLocation(`/clientes/${item.clientId}`)}>
                                  Ver cliente
                                </DropdownMenuItem>
                              )}
                              {isAdmin && item.hasPendingCommission && (
                                <DropdownMenuItem 
                                  data-testid={`button-pay-commission-item-${item.id}`}
                                  onClick={() => {
                                    const creditIdParam = item.dispersedTargets?.[0]?.creditId || item.id;
                                    setLocation(`/comisiones?creditId=${creditIdParam}`);
                                  }}
                                  className="text-emerald-700 focus:text-emerald-800"
                                >
                                  <DollarSign className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                                  Pagar comisión
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
            <DialogTitle className="flex items-center space-x-3">
              <User className="w-6 h-6 text-primary shrink-0" />
              <div>
                <h2 className="text-xl font-bold">
                  {selectedClient 
                    ? getClientName(selectedClient.id) 
                    : selectedCreditItem 
                      ? getClientName(selectedCreditItem.clientId) 
                      : 'Cargando...'}
                </h2>
                <p className="text-sm text-muted-foreground font-normal">
                  {selectedCreditItem?.type === 'credit' 
                    ? 'Detalle del Crédito Dispersado' 
                    : 'Análisis Detallado de Matching'}
                </p>
              </div>
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
                                      {markDispersedMutation.isPending && markDispersedMutation.variables === target.id ? (
                                        <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                                      ) : (
                                        <Package className="w-3.5 h-3.5 mr-1.5" />
                                      )}
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
                                    ) : (
                                      <div className="flex items-center gap-2">
                                        <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-xs py-1">
                                          {comm ? `Comisión Pendiente: $${parseFloat(comm.amount).toLocaleString('es-MX')} MXN` : 'Comisión por Liquidar'}
                                        </Badge>
                                        {isAdmin && (
                                          <Button
                                            size="sm"
                                            className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold h-8 shadow-sm"
                                            onClick={() => {
                                              setSelectedSubmissionId(null);
                                              setSelectedCreditItem(null);
                                              setLocation(`/comisiones?creditId=${target.creditId || selectedSubmission.id || ''}`);
                                            }}
                                            data-testid={`button-pay-comm-${target.id}`}
                                          >
                                            <DollarSign className="w-3.5 h-3.5 mr-1" />
                                            Pagar Comisión
                                          </Button>
                                        )}
                                      </div>
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
                                      {getProductName(target, selectedSubmission)}
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
                                      {target.proposalDocument && (
                                        <div className="col-span-2 pt-2 border-t border-green-200 flex items-center justify-between">
                                          <span className="text-xs text-green-800 font-medium flex items-center gap-1.5">
                                            <FileText className="w-3.5 h-3.5 text-green-700" />
                                            Documento oficial de propuesta disponible
                                          </span>
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            className="text-xs h-7 gap-1 border-green-300 text-green-800 hover:bg-green-100"
                                            onClick={() => window.open(buildApiUrl(`/api/credit-submission-targets/${target.id}/proposal-document`), '_blank')}
                                          >
                                            <ExternalLink className="w-3.5 h-3.5" />
                                            Ver Documento Oficial
                                          </Button>
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
                      <User className="w-5 h-5 text-muted-foreground mt-0.5" />
                      <div>
                        <p className="text-xs text-muted-foreground">Cliente</p>
                        <p className="font-semibold text-foreground">{getClientName(selectedCreditItem.clientId)}</p>
                        {selectedClient && (
                          <p className="text-xs text-muted-foreground">
                            {selectedClient.type === 'persona_moral' ? 'Persona Moral' :
                             selectedClient.type === 'fisica_empresarial' ? 'PFAE' :
                             selectedClient.type === 'fisica' ? 'Persona Física' : 'Sin SAT'}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-start space-x-3">
                      <DollarSign className="w-5 h-5 text-muted-foreground mt-0.5" />
                      <div>
                        <p className="text-xs text-muted-foreground">Monto Aprobado / Dispersado</p>
                        <p className="font-bold text-xl text-primary">
                          ${parseFloat(selectedCreditItem.amount || '0').toLocaleString('es-MX')} MXN
                        </p>
                      </div>
                    </div>

                    {selectedCreditItem.financialInstitutionName && (
                      <div className="flex items-start space-x-3">
                        <Building2 className="w-5 h-5 text-muted-foreground mt-0.5" />
                        <div>
                          <p className="text-xs text-muted-foreground">Financiera</p>
                          <p className="font-medium text-foreground">{selectedCreditItem.financialInstitutionName}</p>
                        </div>
                      </div>
                    )}

                    {selectedCreditItem.productTemplateName && (
                      <div className="flex items-start space-x-3">
                        <FileText className="w-5 h-5 text-muted-foreground mt-0.5" />
                        <div>
                          <p className="text-xs text-muted-foreground">Producto / Modalidad</p>
                          <p className="font-medium text-foreground">{selectedCreditItem.productTemplateName}</p>
                        </div>
                      </div>
                    )}

                    {selectedCreditItem.term && (
                      <div className="flex items-start space-x-3">
                        <Calendar className="w-5 h-5 text-muted-foreground mt-0.5" />
                        <div>
                          <p className="text-xs text-muted-foreground">Plazo</p>
                          <p className="font-medium text-foreground">{selectedCreditItem.term} meses</p>
                        </div>
                      </div>
                    )}

                    {selectedCreditItem.frequency && (
                      <div className="flex items-start space-x-3">
                        <Calendar className="w-5 h-5 text-muted-foreground mt-0.5" />
                        <div>
                          <p className="text-xs text-muted-foreground">Frecuencia de Pago</p>
                          <p className="font-medium text-foreground capitalize">
                            {selectedCreditItem.frequency === 'weekly' ? 'Semanal' :
                             selectedCreditItem.frequency === 'biweekly' ? 'Quincenal' :
                             selectedCreditItem.frequency === 'monthly' ? 'Mensual' : selectedCreditItem.frequency}
                          </p>
                        </div>
                      </div>
                    )}

                    {selectedCreditItem.interestRate && (
                      <div className="flex items-start space-x-3">
                        <Percent className="w-5 h-5 text-muted-foreground mt-0.5" />
                        <div>
                          <p className="text-xs text-muted-foreground">Tasa de Interés</p>
                          <p className="font-medium text-foreground">{selectedCreditItem.interestRate}%</p>
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

          <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-between items-center gap-2 pt-4 border-t">
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
                data-testid="button-compare-proposals"
              >
                Ver Comparativo de Propuestas
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
