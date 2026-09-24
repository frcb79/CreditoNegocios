import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import MainLayout from "@/components/MainLayout";
import Header from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogDescription,
  DialogFooter 
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, invalidateAllCreditQueries } from "@/lib/queryClient";
import { buildApiUrl } from "@/lib/runtimeConfig";
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  FileText, 
  Building2, 
  User, 
  DollarSign,
  Calendar,
  Download,
  Upload,
  Send,
  ChevronDown,
  ChevronUp,
  Package,
  Search,
  AlertTriangle,
  AlertCircle,
  ExternalLink,
  Trophy,
  Home,
  Filter,
  Loader2
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import MatchingComparisonTable from "@/components/MatchingAnalysis/MatchingComparisonTable";
import { targetStatusConfig, getSubmissionStatusSummary } from "@/lib/statusConfig";

interface CreditSubmissionRequest {
  id: string;
  clientId: string;
  brokerId: string;
  requestedAmount: number;
  purpose?: string;
  brokerNotes?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  client?: {
    id: string;
    firstName: string;
    lastName: string;
    type: string;
  };
  broker?: {
    id: string;
    firstName: string;
    lastName: string;
    role: string;
  };
  productTemplate?: {
    id: string;
    name: string;
    description?: string;
  };
}

interface CreditSubmissionTarget {
  id: string;
  requestId: string;
  financialInstitutionId: string;
  status: string;
  adminNotes?: string;
  details?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  institutionProposal?: {
    approvedAmount: number;
    interestRate: number;
    term: number;
    openingCommission?: number;
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
  request?: CreditSubmissionRequest;
  broker?: {
    id: string;
    firstName: string;
    lastName: string;
    email?: string;
    role: string;
    bankName?: string;
    clabe?: string;
  };
  masterBroker?: {
    id: string;
    firstName: string;
    lastName: string;
    email?: string;
    role: string;
  };
  client?: {
    id: string;
    firstName: string;
    lastName: string;
    type: string;
    businessName?: string;
  };
  productTemplate?: {
    id: string;
    name: string;
    description?: string;
  };
}

const reviewSchema = z.object({
  adminNotes: z.string().optional(),
  details: z.string().optional(),
});

const proposalSchema = z.object({
  approvedAmount: z.number().min(1, "Monto requerido"),
  interestRate: z.number().min(0, "Tasa debe ser positiva"),
  term: z.number().min(1, "Plazo requerido"),
  openingCommission: z.number().min(0).optional(),
});

type ReviewForm = z.infer<typeof reviewSchema>;
type ProposalForm = z.infer<typeof proposalSchema>;

export default function PendingRequests() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [selectedTarget, setSelectedTarget] = useState<CreditSubmissionTarget | null>(null);
  const [reviewAction, setReviewAction] = useState<'approve' | 'return_to_broker' | null>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showProposalModal, setShowProposalModal] = useState(false);
  const [expandedSubmissions, setExpandedSubmissions] = useState<Set<string>>(new Set());
  const [expandedInstitutionsPerSubmission, setExpandedInstitutionsPerSubmission] = useState<Record<string, Set<string>>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Filter states
  const [searchTerm, setSearchTerm] = useState("");
  const [filterClientType, setFilterClientType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterInstitution, setFilterInstitution] = useState("all");

  const form = useForm<ReviewForm>({
    resolver: zodResolver(reviewSchema),
    defaultValues: {
      adminNotes: "",
      details: "",
    },
  });

  const proposalForm = useForm<ProposalForm>({
    resolver: zodResolver(proposalSchema),
    defaultValues: {
      approvedAmount: 0,
      interestRate: 0,
      term: 12,
      openingCommission: 0,
    },
  });

  const { data: allTargets, isLoading: targetsLoading } = useQuery<CreditSubmissionTarget[]>({
    queryKey: ['/api/credit-submission-targets'],
  });

  const { data: commissions } = useQuery<any[]>({
    queryKey: ['/api/commissions'],
  });

  const reviewMutation = useMutation({
    mutationFn: async (data: { targetId: string; action: 'approve' | 'return_to_broker'; adminNotes?: string; details?: string }) => {
      const endpoint = `/api/credit-submission-targets/${data.targetId}/${data.action === 'return_to_broker' ? 'return-to-broker' : data.action}`;
      return apiRequest("PATCH", endpoint, { adminNotes: data.adminNotes, details: data.details });
    },
    onSuccess: (_, variables) => {
      const actionText = variables.action === 'approve' ? 'aprobada' : 'devuelta al broker';
      const description = variables.action === 'approve' 
        ? 'La solicitud ha sido aprobada exitosamente'
        : 'La solicitud ha sido devuelta al broker para modificaciones';
      toast({
        title: `Solicitud ${actionText}`,
        description,
      });
      invalidateAllCreditQueries(queryClient);
      setShowReviewModal(false);
      setSelectedTarget(null);
      setReviewAction(null);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo procesar la solicitud",
        variant: "destructive",
      });
    },
  });

  const markAsSentMutation = useMutation({
    mutationFn: async (targetId: string) => {
      return apiRequest("PATCH", `/api/credit-submission-targets/${targetId}/mark-sent`, {});
    },
    onSuccess: () => {
      toast({
        title: "Marcado como enviado",
        description: "La solicitud ha sido marcada como enviada a la financiera",
      });
      invalidateAllCreditQueries(queryClient);
    },
  });

  const proposalMutation = useMutation({
    mutationFn: async (data: { targetId: string; proposal: ProposalForm }) => {
      return apiRequest("POST", `/api/credit-submission-targets/${data.targetId}/institution-proposal`, data.proposal);
    },
    onSuccess: () => {
      toast({
        title: "Propuesta guardada",
        description: "La propuesta de la financiera ha sido guardada exitosamente",
      });
      invalidateAllCreditQueries(queryClient);
      setShowProposalModal(false);
      setSelectedTarget(null);
      proposalForm.reset();
    },
  });

  const uploadDocumentMutation = useMutation({
    mutationFn: async (data: { targetId: string; file: File }) => {
      const formData = new FormData();
      formData.append('proposalDocument', data.file);
      const response = await fetch(buildApiUrl(`/api/credit-submission-targets/${data.targetId}/upload-proposal`), {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Error al subir el documento de propuesta');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Documento subido exitosamente",
        description: "El documento de propuesta ha sido cargado y asociado a la financiera.",
      });
      invalidateAllCreditQueries(queryClient);
    },
    onError: (error: any) => {
      toast({
        title: "Error al subir documento",
        description: error.message || "No se pudo cargar el archivo seleccionado",
        variant: "destructive",
      });
    },
  });

  const markDispersedMutation = useMutation({
    mutationFn: async (targetId: string) => {
      return apiRequest("PATCH", `/api/credit-submission-targets/${targetId}/mark-dispersed`, {});
    },
    onSuccess: () => {
      toast({
        title: "Marcado como dispersado",
        description: "El crédito ha sido marcado como dispersado y la comisión fue generada exitosamente",
      });
      invalidateAllCreditQueries(queryClient);
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
      a.download = `solicitud-${targetId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({
        title: "PDF descargado",
        description: "El PDF de la solicitud ha sido generado y descargado exitosamente",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "No se pudo generar el PDF",
        variant: "destructive",
      });
    }
  };

  const handleFileUpload = (target: CreditSubmissionTarget, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      uploadDocumentMutation.mutate({ targetId: target.id, file });
    }
    // Reset value to allow selecting the same file again if needed
    event.target.value = '';
  };

  const handleProposalSubmit = (data: ProposalForm) => {
    if (!selectedTarget) return;
    proposalMutation.mutate({
      targetId: selectedTarget.id,
      proposal: data,
    });
  };

  const toggleSubmissionExpanded = (requestId: string) => {
    setExpandedSubmissions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(requestId)) {
        newSet.delete(requestId);
      } else {
        newSet.add(requestId);
      }
      return newSet;
    });
  };

  const toggleInstitutionExpanded = (requestId: string, targetId: string) => {
    setExpandedInstitutionsPerSubmission(prev => {
      const submissionSet = prev[requestId] || new Set<string>();
      const newSet = new Set(submissionSet);
      if (newSet.has(targetId)) {
        newSet.delete(targetId);
      } else {
        newSet.add(targetId);
      }
      return {
        ...prev,
        [requestId]: newSet
      };
    });
  };

  const getCategoryBadgeColor = (category: string) => {
    const colors: Record<string, string> = {
      persona_moral: "bg-blue-50 text-blue-700 border-blue-200/80 font-medium",
      fisica_empresarial: "bg-purple-50 text-purple-700 border-purple-200/80 font-medium",
      fisica: "bg-emerald-50 text-emerald-700 border-emerald-200/80 font-medium",
      sin_sat: "bg-slate-50 text-slate-700 border-slate-200/80 font-medium",
    };
    return colors[category] || "bg-slate-50 text-slate-700 border-slate-200/80 font-medium";
  };

  const getCategoryDisplayName = (category: string) => {
    const names: Record<string, string> = {
      persona_moral: "Persona Moral",
      fisica_empresarial: "PFAE",
      fisica: "Persona Física",
      sin_sat: "Sin SAT",
    };
    return names[category] || category;
  };

  const getClientName = (client: any) => {
    if (!client) return "Sin cliente";
    if (client.type === "persona_moral") {
      return client.businessName || "Sin nombre";
    }
    return `${client.firstName || ""} ${client.lastName || ""}`.trim() || "Sin nombre";
  };

  const getStatusBadge = (status: string) => {
    const config = targetStatusConfig[status as keyof typeof targetStatusConfig];
    if (!config) {
      return <Badge variant="secondary">{status}</Badge>;
    }

    const iconMap: Record<string, JSX.Element> = {
      pending_admin: <Clock className="w-3 h-3 mr-1" />,
      approved: <CheckCircle className="w-3 h-3 mr-1" />,
      returned_to_broker: <AlertCircle className="w-3 h-3 mr-1" />,
      sent: <Send className="w-3 h-3 mr-1" />,
      institution_approved: <CheckCircle className="w-3 h-3 mr-1" />,
      proposal_received: <CheckCircle className="w-3 h-3 mr-1" />,
      institution_rejected: <XCircle className="w-3 h-3 mr-1" />,
      rejected: <XCircle className="w-3 h-3 mr-1" />,
      selected_winner: <CheckCircle className="w-3 h-3 mr-1" />,
      winner: <CheckCircle className="w-3 h-3 mr-1" />,
      dispersed: <Package className="w-3 h-3 mr-1" />,
    };

    return (
      <Badge variant="outline" className={config.color}>
        {iconMap[status]}
        {config.label}
      </Badge>
    );
  };

  if (targetsLoading) {
    return (
      <MainLayout>
        <Header 
          title="Aprobaciones"
          subtitle="Revisa y aprueba solicitudes de crédito de brokers"
        />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-xs animate-pulse">
                  <div className="h-3 w-16 bg-slate-200 rounded mb-3"></div>
                  <div className="h-6 w-10 bg-slate-200 rounded"></div>
                </div>
              ))}
            </div>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-white border border-slate-200/80 rounded-xl p-5 shadow-xs animate-pulse space-y-3">
                <div className="flex items-center justify-between">
                  <div className="h-4 bg-slate-200 rounded w-48"></div>
                  <div className="h-5 bg-slate-200 rounded w-20"></div>
                </div>
                <div className="h-14 bg-slate-100 rounded-lg"></div>
              </div>
            ))}
          </div>
        </main>
      </MainLayout>
    );
  }

  // Group targets by submission (requestId)
  const groupedBySubmission = allTargets?.reduce((acc, target) => {
    const requestId = target.requestId;
    if (!acc[requestId]) {
      acc[requestId] = {
        submission: target.request!,
        targets: []
      };
    }
    acc[requestId].targets.push(target);
    return acc;
  }, {} as Record<string, { submission: CreditSubmissionRequest; targets: CreditSubmissionTarget[] }>);

  const submissionEntries = Object.entries(groupedBySubmission || {});

  // Get unique values for filters
  const uniqueInstitutions = Array.from(new Set(
    allTargets?.map(t => t.institution?.name).filter(Boolean) || []
  )).sort();

  // Filter logic - now applies to grouped submissions
  const filteredSubmissions = submissionEntries.filter(([requestId, group]) => {
    const client = group.submission.client || group.targets[0]?.client;
    const clientName = getClientName(client);
    const productName = group.targets[0]?.productTemplate?.name || "";
    
    const matchesSearch = searchTerm === "" || 
      clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      group.targets.some(t => t.institution?.name?.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesClientType = filterClientType === "all" || 
      client?.type === filterClientType;
    
    const matchesStatus = filterStatus === "all" || 
      group.targets.some(t => t.status === filterStatus);
    
    const matchesInstitution = filterInstitution === "all" || 
      group.targets.some(t => t.institution?.name === filterInstitution);
    
    return matchesSearch && matchesClientType && matchesStatus && matchesInstitution;
  });

  // Calculate counts from all targets
  const pendingCount = allTargets?.filter(t => t.status === 'pending_admin').length || 0;
  const approvedCount = allTargets?.filter(t => t.status === 'approved').length || 0;
  const sentCount = allTargets?.filter(t => t.status === 'sent').length || 0;
  const returnedCount = allTargets?.filter(t => t.status === 'returned_to_broker').length || 0;
  const winnerCount = allTargets?.filter(t => t.status === 'selected_winner' || t.isWinner).length || 0;

  // Helper to get predominant status for a submission
  const getPredominantStatus = (targets: CreditSubmissionTarget[]) => {
    const statusCounts = targets.reduce((acc, t) => {
      acc[t.status] = (acc[t.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const predominant = Object.entries(statusCounts).sort(([,a], [,b]) => b - a)[0];
    return predominant ? predominant[0] : 'unknown';
  };

  return (
    <MainLayout>
      <Header 
        title="Aprobaciones"
        subtitle={`${pendingCount} solicitud${pendingCount !== 1 ? 'es' : ''} esperando aprobación`}
      />
      
      <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          <div className="space-y-6">
            {/* Summary Metrics Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {/* Por Revisar */}
              <div className="bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-xs hover:border-slate-300 transition-colors">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-xs font-medium text-slate-500 truncate">Por Revisar</span>
                  <div className="h-7 w-7 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center shrink-0 border border-amber-200/60">
                    <Clock className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-bold tracking-tight text-slate-900" data-testid="text-pending-count">
                    {pendingCount}
                  </span>
                  <span className="text-2xs text-slate-400 font-medium">pendientes</span>
                </div>
              </div>

              {/* Enviadas a Financiera */}
              <div className="bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-xs hover:border-slate-300 transition-colors">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-xs font-medium text-slate-500 truncate">Enviadas</span>
                  <div className="h-7 w-7 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center shrink-0 border border-blue-200/60">
                    <Send className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-bold tracking-tight text-slate-900">
                    {sentCount}
                  </span>
                  <span className="text-2xs text-slate-400 font-medium">en trámite</span>
                </div>
              </div>

              {/* Aprobadas / Propuestas */}
              <div className="bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-xs hover:border-slate-300 transition-colors">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-xs font-medium text-slate-500 truncate">Aprobadas</span>
                  <div className="h-7 w-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0 border border-emerald-200/60">
                    <CheckCircle className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-bold tracking-tight text-slate-900">
                    {approvedCount}
                  </span>
                  <span className="text-2xs text-slate-400 font-medium">con propuesta</span>
                </div>
              </div>

              {/* Ganadoras por Dispersar */}
              <div className={`bg-white border rounded-xl p-3.5 shadow-xs transition-all ${
                winnerCount > 0 
                  ? 'border-amber-300 ring-1 ring-amber-200/70 bg-gradient-to-br from-white to-amber-50/30' 
                  : 'border-slate-200/80 hover:border-slate-300'
              }`}>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-xs font-medium text-slate-700 truncate">Ganadoras</span>
                  <div className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 border ${
                    winnerCount > 0 
                      ? 'bg-amber-100 text-amber-800 border-amber-300' 
                      : 'bg-slate-50 text-slate-500 border-slate-200'
                  }`}>
                    <Trophy className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-bold tracking-tight text-slate-900" data-testid="text-winner-count">
                    {winnerCount}
                  </span>
                  <span className="text-2xs text-amber-700 font-medium">por dispersar</span>
                </div>
              </div>

              {/* Devueltas a Broker */}
              <div className="bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-xs hover:border-slate-300 transition-colors">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-xs font-medium text-slate-500 truncate">Devueltas</span>
                  <div className="h-7 w-7 rounded-lg bg-orange-50 text-orange-700 flex items-center justify-center shrink-0 border border-orange-200/60">
                    <XCircle className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-bold tracking-tight text-slate-900" data-testid="text-returned-count">
                    {returnedCount}
                  </span>
                  <span className="text-2xs text-slate-400 font-medium">a broker</span>
                </div>
              </div>

              {/* Total Solicitudes */}
              <div className="bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-xs hover:border-slate-300 transition-colors">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-xs font-medium text-slate-500 truncate">Total</span>
                  <div className="h-7 w-7 rounded-lg bg-slate-50 text-slate-600 flex items-center justify-center shrink-0 border border-slate-200/80">
                    <FileText className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-bold tracking-tight text-slate-900">
                    {submissionEntries.length}
                  </span>
                  <span className="text-2xs text-slate-400 font-medium">solicitudes</span>
                </div>
              </div>
            </div>

            {/* Filters Bar */}
            <div className="bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                  <Input
                    type="text"
                    placeholder="Buscar por cliente, financiera o producto..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 h-9 text-xs border-slate-200 rounded-lg bg-white placeholder:text-slate-400 focus-visible:ring-1 focus-visible:ring-slate-400"
                    data-testid="input-search"
                  />
                </div>

                <Select value={filterClientType} onValueChange={setFilterClientType}>
                  <SelectTrigger data-testid="select-client-type" className="h-9 text-xs border-slate-200 rounded-lg bg-white text-slate-700">
                    <SelectValue placeholder="Tipo de Cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los Tipos</SelectItem>
                    <SelectItem value="persona_moral">Persona Moral</SelectItem>
                    <SelectItem value="fisica_empresarial">PFAE</SelectItem>
                    <SelectItem value="fisica">Persona Física</SelectItem>
                    <SelectItem value="sin_sat">Sin SAT</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger data-testid="select-status" className="h-9 text-xs border-slate-200 rounded-lg bg-white text-slate-700">
                    <SelectValue placeholder="Estado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los Estados</SelectItem>
                    <SelectItem value="pending_admin">Pendiente Aprobación</SelectItem>
                    <SelectItem value="approved">Aprobada</SelectItem>
                    <SelectItem value="sent">Enviada</SelectItem>
                    <SelectItem value="institution_approved">Propuesta Recibida</SelectItem>
                    <SelectItem value="selected_winner">Seleccionada</SelectItem>
                    <SelectItem value="dispersed">Dispersada</SelectItem>
                    <SelectItem value="rejected">Rechazada</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={filterInstitution} onValueChange={setFilterInstitution}>
                  <SelectTrigger data-testid="select-institution" className="h-9 text-xs border-slate-200 rounded-lg bg-white text-slate-700">
                    <SelectValue placeholder="Financiera" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las Financieras</SelectItem>
                    {uniqueInstitutions.map((institution) => (
                      <SelectItem key={institution} value={institution || ""}>
                        {institution}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-4">
              {filteredSubmissions.length === 0 ? (
                <div className="bg-white border border-slate-200/80 rounded-xl p-12 text-center shadow-xs">
                  <div className="h-12 w-12 rounded-xl bg-slate-100/80 text-slate-400 flex items-center justify-center mx-auto mb-3 border border-slate-200/60">
                    <Search className="w-5 h-5" />
                  </div>
                  <h3 className="text-sm font-semibold text-slate-900 mb-1">
                    {allTargets && allTargets.length > 0 
                      ? 'No se encontraron solicitudes' 
                      : 'No hay solicitudes'}
                  </h3>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    {allTargets && allTargets.length > 0
                      ? 'No hay solicitudes que coincidan con los filtros seleccionados'
                      : 'No hay solicitudes en el sistema actualmente.'}
                  </p>
                </div>
              ) : (
                filteredSubmissions.map(([requestId, group]) => {
                  const { submission, targets } = group;
                  const client = submission.client || targets[0]?.client;
                  const predominantStatus = getPredominantStatus(targets);
                  const isExpanded = expandedSubmissions.has(requestId);
                  const isMortgage = (((submission as any).mortgageData && Object.keys((submission as any).mortgageData).length > 0) || submission.productTemplate?.name?.toLowerCase().includes("hipotecario"));
                  const hasWinner = targets.some(t => (t.status === 'selected_winner' || t.isWinner) && t.status !== 'dispersed');

                  return (
                    <div 
                      key={requestId} 
                      className="bg-white border border-slate-200/80 rounded-xl shadow-xs hover:border-slate-300 transition-all overflow-hidden"
                    >
                      <div className="p-4 sm:p-5">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0 space-y-3">
                            {/* Header con título y badges */}
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="text-base font-bold text-slate-900 truncate">
                                {getClientName(client)}
                              </h3>

                              {client?.type && (
                                <Badge 
                                  variant="outline" 
                                  className={getCategoryBadgeColor(client.type)}
                                  data-testid={`badge-client-type-${requestId}`}
                                >
                                  {getCategoryDisplayName(client.type)}
                                </Badge>
                              )}

                              {hasWinner && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-300/80">
                                  <Trophy className="w-3 h-3 text-amber-600" />
                                  Ganadora por Dispersar
                                </span>
                              )}

                              {getStatusBadge(predominantStatus)}

                              {isMortgage && (
                                <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-300/80 text-xs font-semibold" data-testid={`badge-mortgage-${requestId}`}>
                                  🏠 Hipotecario Vivienda
                                </Badge>
                              )}
                            </div>
                            
                            {/* Grid de información principal del submission */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-slate-50/70 rounded-lg border border-slate-100 text-xs">
                              <div>
                                <span className="text-slate-400 font-medium block text-2xs uppercase tracking-wider">Monto Solicitado</span>
                                <span className="text-slate-900 font-bold text-sm" data-testid={`text-amount-${requestId}`}>
                                  {submission.requestedAmount?.toLocaleString('es-MX', { 
                                    style: 'currency', 
                                    currency: 'MXN', 
                                    minimumFractionDigits: 0, 
                                    maximumFractionDigits: 0 
                                  })}
                                </span>
                              </div>
                              
                              <div>
                                <span className="text-slate-400 font-medium block text-2xs uppercase tracking-wider">Producto</span>
                                <span className="text-slate-800 font-medium truncate block" title={targets[0]?.productTemplate?.name || submission.productTemplate?.name || submission.purpose || 'Crédito Empresarial'} data-testid={`text-product-${requestId}`}>
                                  {targets[0]?.productTemplate?.name || submission.productTemplate?.name || submission.purpose || 'Crédito Empresarial'}
                                </span>
                              </div>

                              <div>
                                <span className="text-slate-400 font-medium block text-2xs uppercase tracking-wider">Fecha Registro</span>
                                <span className="text-slate-800 font-medium" data-testid={`text-date-${requestId}`}>
                                  {new Date(submission.createdAt).toLocaleDateString('es-ES')}
                                </span>
                              </div>

                              <div>
                                <span className="text-slate-400 font-medium block text-2xs uppercase tracking-wider">Financieras</span>
                                <span className="text-slate-900 font-bold" data-testid={`text-institutions-count-${requestId}`}>
                                  {targets.length} {targets.length === 1 ? 'institución' : 'instituciones'}
                                </span>
                              </div>

                              {submission.purpose && (
                                <div className="col-span-2 sm:col-span-4 pt-2 border-t border-slate-200/60 flex items-center gap-1.5 text-slate-600">
                                  <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                  <span className="text-slate-500 font-medium">Propósito:</span>
                                  <span className="text-slate-800 truncate" data-testid={`text-purpose-${requestId}`}>
                                    {submission.purpose}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      <Collapsible
                        open={isExpanded}
                        onOpenChange={() => toggleSubmissionExpanded(requestId)}
                      >
                        <CollapsibleTrigger asChild>
                          <button 
                            type="button" 
                            className="w-full px-5 py-2.5 bg-slate-50/50 hover:bg-slate-100/70 border-t border-slate-100 transition-colors flex items-center justify-center gap-2 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                          >
                            {isExpanded ? (
                              <>
                                <ChevronUp className="w-3.5 h-3.5" />
                                <span>Ocultar financieras</span>
                              </>
                            ) : (
                              <>
                                <ChevronDown className="w-3.5 h-3.5" />
                                <span>Ver {targets.length} financiera{targets.length !== 1 ? 's' : ''}</span>
                              </>
                            )}
                          </button>
                        </CollapsibleTrigger>
                        
                        <CollapsibleContent>
                          <div className="p-4 sm:p-5 pt-3 space-y-3.5 bg-slate-50/30 border-t border-slate-100">
                            {/* Broker Notes - if exists */}
                            {submission.brokerNotes && (
                              <div className="bg-blue-50/60 p-3.5 rounded-lg border border-blue-100/80">
                                <h4 className="font-semibold text-blue-900 mb-1 flex items-center text-xs">
                                  <FileText className="w-3.5 h-3.5 mr-1.5 text-blue-600" />
                                  Notas del Broker
                                </h4>
                                <p className="text-xs text-blue-800/90 leading-relaxed" data-testid={`text-broker-notes-${requestId}`}>
                                  {submission.brokerNotes}
                                </p>
                              </div>
                            )}

                            {/* List of institutions/targets */}
                            {targets.map((target) => {
                              const institutionExpanded = (expandedInstitutionsPerSubmission[requestId] || new Set()).has(target.id);
                              
                              return (
                                <div key={target.id} className="border border-slate-200/90 rounded-xl bg-white p-4 space-y-3.5 shadow-2xs">
                                  {/* Persistent hidden file input for proposals (#15) */}
                                  <input
                                    type="file"
                                    onChange={(e) => handleFileUpload(target, e)}
                                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                                    className="hidden"
                                    id={`file-upload-${target.id}`}
                                  />
                                  
                                  {/* Institution Header */}
                                  <div className="flex items-center justify-between gap-3 flex-wrap">
                                    <div className="flex items-center gap-3">
                                      <div className="h-9 w-9 rounded-lg bg-slate-100/90 text-slate-700 flex items-center justify-center shrink-0 border border-slate-200/60">
                                        <Building2 className="w-4 h-4" />
                                      </div>
                                      <div>
                                        <h4 className="font-semibold text-slate-900 text-sm" data-testid={`text-institution-${target.id}`}>
                                          {target.institution?.name || 'Financiera no especificada'}
                                        </h4>
                                        <p className="text-xs text-slate-500 font-medium">
                                          {target.productTemplate?.name || submission.productTemplate?.name || target.request?.productTemplate?.name || 'Crédito Empresarial'}
                                        </p>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {getStatusBadge(target.status)}
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleDownloadPDF(target.id)}
                                        className="h-8 px-2.5 text-xs border-slate-200 text-slate-700 hover:bg-slate-50"
                                        data-testid={`button-download-pdf-${target.id}`}
                                      >
                                        <Download className="w-3.5 h-3.5 mr-1 text-slate-500" />
                                        PDF
                                      </Button>
                                    </div>
                                  </div>

                                  {/* Actions based on status */}
                                  {target.status === 'pending_admin' && (
                                    <div className="flex items-center gap-2 pt-1">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => {
                                          setSelectedTarget(target);
                                          setReviewAction('return_to_broker');
                                          setShowReviewModal(true);
                                        }}
                                        className="h-8 text-xs font-medium text-amber-800 border-amber-300/80 bg-amber-50/50 hover:bg-amber-100/80"
                                        data-testid={`button-return-to-broker-${target.id}`}
                                      >
                                        <XCircle className="w-3.5 h-3.5 mr-1.5" />
                                        Solicitar Cambios
                                      </Button>
                                      <Button
                                        size="sm"
                                        onClick={() => {
                                          setSelectedTarget(target);
                                          setReviewAction('approve');
                                          setShowReviewModal(true);
                                        }}
                                        className="h-8 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
                                        data-testid={`button-approve-${target.id}`}
                                      >
                                        <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
                                        Visto Bueno
                                      </Button>
                                    </div>
                                  )}

                                  {target.status === 'approved' && (
                                    <div className="pt-1">
                                      <Button
                                        size="sm"
                                        onClick={() => markAsSentMutation.mutate(target.id)}
                                        disabled={markAsSentMutation.isPending}
                                        className="h-8 text-xs font-medium bg-primary hover:bg-primary-dark text-white shadow-xs"
                                        data-testid={`button-mark-sent-${target.id}`}
                                      >
                                        <Send className="w-3.5 h-3.5 mr-1.5" />
                                        Marcar como Enviado a Financiera
                                      </Button>
                                    </div>
                                  )}

                                  {target.status === 'sent' && (
                                    <div className="flex items-center gap-2 flex-wrap pt-1">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => document.getElementById(`file-upload-${target.id}`)?.click()}
                                        className="h-8 text-xs font-medium border-slate-200 hover:bg-slate-50"
                                        data-testid={`button-upload-${target.id}`}
                                      >
                                        <Upload className="w-3.5 h-3.5 mr-1.5 text-slate-500" />
                                        Subir Propuesta
                                      </Button>
                                      <Button
                                        size="sm"
                                        onClick={() => {
                                          setSelectedTarget(target);
                                          setShowProposalModal(true);
                                        }}
                                        className="h-8 text-xs font-medium bg-slate-900 hover:bg-slate-800 text-white"
                                        data-testid={`button-add-proposal-${target.id}`}
                                      >
                                        <FileText className="w-3.5 h-3.5 mr-1.5" />
                                        Capturar Propuesta
                                      </Button>
                                      {target.proposalDocument && (
                                        <>
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-8 text-xs font-medium border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                                            onClick={() => window.open(buildApiUrl(`/api/credit-submission-targets/${target.id}/proposal-document`), '_blank')}
                                          >
                                            <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                                            Ver Propuesta
                                          </Button>
                                          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 self-center text-xs">
                                            Documento subido
                                          </Badge>
                                        </>
                                      )}
                                    </div>
                                  )}

                                  {target.status === 'returned_to_broker' && (target.details || target.adminNotes) && (
                                    <div className="bg-amber-50/70 p-3.5 rounded-lg border border-amber-200/80">
                                      <div className="flex items-start gap-2.5">
                                        <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                                        <div>
                                          <p className="text-xs font-semibold text-amber-900 mb-0.5">Solicitud Devuelta al Broker</p>
                                          <p className="text-xs text-amber-800 leading-relaxed" data-testid={`text-admin-comments-${target.id}`}>
                                            {target.details || target.adminNotes}
                                          </p>
                                        </div>
                                      </div>
                                    </div>
                                  )}

                                  {target.status === 'institution_approved' && (
                                    <div className="space-y-3 pt-1">
                                      {target.institutionProposal && (
                                        <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-200/80">
                                          <div className="flex items-center justify-between mb-3">
                                            <h4 className="font-semibold text-slate-900 flex items-center gap-1.5 text-xs">
                                              <CheckCircle className="w-4 h-4 text-emerald-600" />
                                              Propuesta de la Financiera
                                            </h4>
                                            <Badge className="bg-emerald-600 text-white border-0 text-2xs font-semibold">
                                              Aprobada
                                            </Badge>
                                          </div>
                                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                                            <div className="bg-white p-2.5 rounded-lg border border-slate-200/70 shadow-2xs">
                                              <span className="text-2xs text-slate-400 font-medium block uppercase tracking-wider">Monto Aprobado</span>
                                              <p className="font-bold text-emerald-700 text-sm mt-0.5">
                                                ${Number(target.institutionProposal.approvedAmount || 0).toLocaleString('es-MX')} MXN
                                              </p>
                                            </div>
                                            <div className="bg-white p-2.5 rounded-lg border border-slate-200/70 shadow-2xs">
                                              <span className="text-2xs text-slate-400 font-medium block uppercase tracking-wider">Tasa de Interés</span>
                                              <p className="font-bold text-slate-900 text-sm mt-0.5">{target.institutionProposal.interestRate}%</p>
                                            </div>
                                            <div className="bg-white p-2.5 rounded-lg border border-slate-200/70 shadow-2xs">
                                              <span className="text-2xs text-slate-400 font-medium block uppercase tracking-wider">Plazo</span>
                                              <p className="font-bold text-slate-900 text-sm mt-0.5">{target.institutionProposal.term} meses</p>
                                            </div>
                                            <div className="bg-white p-2.5 rounded-lg border border-slate-200/70 shadow-2xs">
                                              <span className="text-2xs text-slate-400 font-medium block uppercase tracking-wider">Comisión Apertura</span>
                                              <p className="font-bold text-slate-900 text-sm mt-0.5">
                                                {target.institutionProposal.openingCommission ? `${target.institutionProposal.openingCommission}%` : '0%'}
                                              </p>
                                            </div>
                                          </div>
                                        </div>
                                      )}

                                      <div className="flex flex-wrap gap-2 pt-1">
                                        <Button
                                          size="sm"
                                          className="h-8 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
                                          onClick={() => {
                                            setSelectedTarget(target);
                                            if (target.institutionProposal) {
                                              proposalForm.reset({
                                                approvedAmount: Number(target.institutionProposal.approvedAmount || 0),
                                                interestRate: Number(target.institutionProposal.interestRate || 0),
                                                term: Number(target.institutionProposal.term || 12),
                                                openingCommission: Number(target.institutionProposal.openingCommission || 0),
                                              });
                                            }
                                            setShowProposalModal(true);
                                          }}
                                          data-testid={`button-edit-proposal-${target.id}`}
                                        >
                                          <FileText className="w-3.5 h-3.5 mr-1.5" />
                                          Editar Propuesta
                                        </Button>

                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="h-8 text-xs font-medium border-slate-200 text-slate-700 hover:bg-slate-50"
                                          onClick={() => document.getElementById(`file-upload-${target.id}`)?.click()}
                                          data-testid={`button-reupload-${target.id}`}
                                        >
                                          <Upload className="w-3.5 h-3.5 mr-1.5 text-slate-500" />
                                          Reemplazar Documento
                                        </Button>
                                        
                                        {target.proposalDocument && (
                                          <>
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              className="h-8 text-xs font-medium border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                                              onClick={() => window.open(buildApiUrl(`/api/credit-submission-targets/${target.id}/proposal-document`), '_blank')}
                                            >
                                              <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                                              Ver Documento
                                            </Button>
                                            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 self-center text-xs">
                                              ✓ Carátula / Documento cargado
                                            </Badge>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  )}

                                  {target.status === 'selected_winner' && target.isWinner && (
                                    <div className="space-y-2.5 pt-1">
                                      <div className="bg-amber-50/80 p-3 rounded-lg border border-amber-200 flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2">
                                          <Trophy className="w-4 h-4 text-amber-600 shrink-0" />
                                          <p className="font-semibold text-xs text-amber-900">Propuesta Ganadora Seleccionada</p>
                                        </div>
                                        <span className="text-2xs text-amber-700 font-medium">Lista para dispersión</span>
                                      </div>
                                      <Button
                                        size="sm"
                                        onClick={() => markDispersedMutation.mutate(target.id)}
                                        disabled={markDispersedMutation.isPending}
                                        className="h-8 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
                                        data-testid={`button-mark-dispersed-${target.id}`}
                                      >
                                        <Package className="w-3.5 h-3.5 mr-1.5" />
                                        Marcar como Dispersado
                                      </Button>
                                    </div>
                                  )}

                                  {target.status === 'dispersed' && (() => {
                                      const targetComm = commissions?.find((c: any) => 
                                        c.creditId === (target as any).creditId || 
                                        (target.id && c.targetId === target.id)
                                      );
                                      const isPaid = targetComm?.status === 'paid';
                                      const isPending = targetComm && targetComm.status !== 'paid';

                                      return (
                                        <div className="bg-emerald-50/50 p-3.5 rounded-xl border border-emerald-200/80 space-y-2.5">
                                          <div className="flex items-center justify-between flex-wrap gap-2">
                                            <p className="font-semibold text-emerald-900 flex items-center gap-1.5 text-xs">
                                              <CheckCircle className="w-4 h-4 text-emerald-600" />
                                              Dispersado el {target.dispersedAt ? new Date(target.dispersedAt).toLocaleDateString('es-ES') : 'Recientemente'}
                                            </p>
                                            {isPaid ? (
                                              <Badge className="bg-emerald-700 text-white font-medium text-2xs">
                                                <DollarSign className="w-3 h-3 mr-0.5 inline" />
                                                Comisión Pagada (${parseFloat(targetComm.amount).toLocaleString('es-MX')} MXN)
                                              </Badge>
                                            ) : isPending ? (
                                              <Badge className="bg-amber-500 text-white font-medium text-2xs">
                                                <Clock className="w-3 h-3 mr-0.5 inline" />
                                                Comisión Pendiente (${parseFloat(targetComm.amount).toLocaleString('es-MX')} MXN)
                                              </Badge>
                                            ) : (
                                              <Badge variant="outline" className="text-emerald-700 border-emerald-300 text-2xs">
                                                Dispersión Registrada
                                              </Badge>
                                            )}
                                          </div>

                                          {targetComm && (
                                            <div className="bg-white p-3 rounded-lg border border-emerald-100 flex items-center justify-between flex-wrap gap-3 shadow-2xs">
                                              <div className="text-xs">
                                                <span className="text-slate-400 font-medium block text-2xs uppercase tracking-wider">Comisión {targetComm.commissionType === 'apertura' ? 'de Apertura' : ''} del Bróker:</span>
                                                <span className="font-bold text-slate-900 text-sm">${parseFloat(targetComm.amount).toLocaleString('es-MX')} MXN</span>
                                                {target.broker && (
                                                  <span className="text-slate-500 ml-2 text-2xs">
                                                    ({target.broker.firstName} {target.broker.lastName} • {target.broker.bankName || 'Banco'}: {target.broker.clabe || 'Sin CLABE'})
                                                  </span>
                                                )}
                                              </div>
                                              <div className="flex items-center gap-2">
                                                {isPending ? (
                                                  <Button
                                                    size="sm"
                                                    className="h-7 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white shadow-xs"
                                                    onClick={() => setLocation(`/comisiones?creditId=${(target as any).creditId || ''}`)}
                                                    data-testid={`button-pay-commission-${target.id}`}
                                                  >
                                                    <DollarSign className="w-3 h-3 mr-1" />
                                                    Pagar Comisión
                                                  </Button>
                                                ) : (
                                                  <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-7 text-xs font-medium text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                                                    onClick={() => setLocation(`/comisiones?creditId=${(target as any).creditId || ''}`)}
                                                  >
                                                    Ver en Comisiones
                                                  </Button>
                                                )}
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })()}

                                  {/* Collapsible Matching Analysis */}
                                  {target.institution && client && (
                                    <Collapsible
                                      open={institutionExpanded}
                                      onOpenChange={() => toggleInstitutionExpanded(requestId, target.id)}
                                    >
                                      <CollapsibleTrigger asChild>
                                        <Button variant="ghost" size="sm" className="w-full mt-1 text-xs text-slate-500 hover:text-slate-800 border border-slate-200/60 bg-slate-50/50 hover:bg-slate-100/60">
                                          {institutionExpanded ? (
                                            <ChevronUp className="w-3.5 h-3.5 mr-1.5" />
                                          ) : (
                                            <ChevronDown className="w-3.5 h-3.5 mr-1.5" />
                                          )}
                                          {institutionExpanded ? 'Ocultar Análisis de Matching' : 'Ver Análisis de Matching'}
                                        </Button>
                                      </CollapsibleTrigger>
                                      <CollapsibleContent>
                                        <div className="mt-3 p-3.5 bg-slate-50/80 rounded-xl border border-slate-200/70">
                                          <MatchingComparisonTable
                                            client={client}
                                            institution={{
                                              id: target.institution.id,
                                              name: target.institution.name,
                                              requirements: (target.institution as any).requirements,
                                              acceptedProfiles: (target.institution as any).acceptedProfiles
                                            }}
                                            productTemplate={target.productTemplate}
                                            requestedAmount={submission.requestedAmount}
                                          />
                                        </div>
                                      </CollapsibleContent>
                                    </Collapsible>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </main>

        {selectedTarget && (
          <>
            <Dialog open={showReviewModal} onOpenChange={setShowReviewModal}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>
                    {reviewAction === 'approve' ? 'Dar Visto Bueno a Solicitud' : 'Solicitar Cambios al Broker'}
                  </DialogTitle>
                </DialogHeader>

                <Form {...form}>
                  <form onSubmit={form.handleSubmit((data) => {
                    if (!selectedTarget || !reviewAction) return;
                    reviewMutation.mutate({
                      targetId: selectedTarget.id,
                      action: reviewAction,
                      adminNotes: data.adminNotes,
                      details: data.details,
                    });
                  })} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="details"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            {reviewAction === 'approve' 
                              ? 'Detalles para enviar a la financiera (opcional)' 
                              : 'Comentarios para el Broker (opcional)'}
                          </FormLabel>
                          <FormControl>
                            <Textarea 
                              {...field} 
                              rows={3}
                              placeholder={reviewAction === 'approve'
                                ? "Información adicional que se enviará a la financiera..."
                                : "Explica qué necesita modificar o qué información falta..."
                              }
                              data-testid="textarea-details"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="adminNotes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Notas internas del admin (opcional)</FormLabel>
                          <FormControl>
                            <Textarea 
                              {...field} 
                              rows={3}
                              placeholder="Notas internas para registro..."
                              data-testid="textarea-admin-notes"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <DialogFooter className="gap-2 pt-4 border-t border-border/60">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setShowReviewModal(false)}
                        disabled={reviewMutation.isPending}
                      >
                        Cancelar
                      </Button>
                      <Button
                        type="submit"
                        disabled={reviewMutation.isPending}
                        className={reviewAction === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-amber-600 hover:bg-amber-700 text-white'}
                      >
                        {reviewMutation.isPending ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Procesando...
                          </>
                        ) : reviewAction === 'approve' ? (
                          'Dar Visto Bueno'
                        ) : (
                          'Devolver al Broker'
                        )}
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>

            <Dialog open={showProposalModal} onOpenChange={setShowProposalModal}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Capturar Propuesta de Financiera</DialogTitle>
                </DialogHeader>

                <Form {...proposalForm}>
                  <form onSubmit={proposalForm.handleSubmit(handleProposalSubmit)} className="space-y-4">
                    <FormField
                      control={proposalForm.control}
                      name="approvedAmount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Monto Aprobado</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              {...field}
                              onChange={(e) => field.onChange(parseFloat(e.target.value))}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={proposalForm.control}
                      name="interestRate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Tasa de Interés (%)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.1"
                              {...field}
                              onChange={(e) => field.onChange(parseFloat(e.target.value))}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={proposalForm.control}
                      name="term"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Plazo (meses)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              {...field}
                              onChange={(e) => field.onChange(parseInt(e.target.value))}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={proposalForm.control}
                      name="openingCommission"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Comisión de Apertura (%) - Opcional</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.1"
                              {...field}
                              onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <DialogFooter className="gap-2 pt-4 border-t border-border/60">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setShowProposalModal(false)}
                        disabled={proposalMutation.isPending}
                      >
                        Cancelar
                      </Button>
                      <Button
                        type="submit"
                        disabled={proposalMutation.isPending}
                        className="bg-primary text-primary-foreground hover:bg-primary/90"
                      >
                        {proposalMutation.isPending ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Guardando...
                          </>
                        ) : (
                          'Guardar Propuesta'
                        )}
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </>
        )}
      </MainLayout>
    );
  }
