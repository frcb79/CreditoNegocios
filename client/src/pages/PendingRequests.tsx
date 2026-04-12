import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Sidebar from "@/components/Sidebar";
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
  DialogTitle 
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
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
  AlertCircle
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
      queryClient.invalidateQueries({ queryKey: ['/api/credit-submission-targets'] });
      queryClient.invalidateQueries({ queryKey: ['/api/credit-submissions'] });
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
      queryClient.invalidateQueries({ queryKey: ['/api/credit-submission-targets'] });
      queryClient.invalidateQueries({ queryKey: ['/api/credit-submissions'] });
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
      queryClient.invalidateQueries({ queryKey: ['/api/credit-submission-targets'] });
      setShowProposalModal(false);
      setSelectedTarget(null);
      proposalForm.reset();
    },
  });

  const uploadDocumentMutation = useMutation({
    mutationFn: async (data: { targetId: string; file: File }) => {
      const formData = new FormData();
      formData.append('proposalDocument', data.file);
      const response = await fetch(`/api/credit-submission-targets/${data.targetId}/upload-proposal`, {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) throw new Error('Failed to upload document');
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Documento subido",
        description: "El documento de propuesta ha sido subido exitosamente",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/credit-submission-targets'] });
    },
  });

  const markDispersedMutation = useMutation({
    mutationFn: async (targetId: string) => {
      return apiRequest("PATCH", `/api/credit-submission-targets/${targetId}/mark-dispersed`, {});
    },
    onSuccess: () => {
      toast({
        title: "Marcado como dispersado",
        description: "El crédito ha sido marcado como dispersado",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/credit-submission-targets'] });
    },
  });

  const handleDownloadPDF = async (targetId: string) => {
    try {
      const response = await fetch(`/api/credit-submission-targets/${targetId}/generate-pdf`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to generate PDF');
      
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
        description: "El PDF de la solicitud ha sido descargado",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudo generar el PDF",
        variant: "destructive",
      });
    }
  };

  const handleFileUpload = (target: CreditSubmissionTarget, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      uploadDocumentMutation.mutate({ targetId: target.id, file });
    }
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
      persona_moral: "bg-blue-100 text-blue-800 border-blue-300",
      fisica_empresarial: "bg-green-100 text-green-800 border-green-300",
      fisica: "bg-orange-100 text-orange-800 border-orange-300",
      sin_sat: "bg-gray-100 text-gray-800 border-gray-300",
    };
    return colors[category] || "bg-gray-100 text-gray-800 border-gray-300";
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
      proposal_received: <CheckCircle className="w-3 h-3 mr-1" />,
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
      <div className="min-h-screen flex bg-gray-50">
        <Sidebar />
        <div className="flex-1 flex flex-col">
          <Header 
            title="Aprobaciones"
            subtitle="Revisa y aprueba solicitudes de crédito de brokers"
          />
          <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
            <div className="space-y-6">
              {Array.from({ length: 4 }).map((_, i) => (
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
    <div className="min-h-screen flex bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header 
          title="Aprobaciones"
          subtitle={`${pendingCount} solicitud${pendingCount !== 1 ? 'es' : ''} esperando aprobación`}
        />
        
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          <div className="space-y-6">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center space-x-6">
                  <div className="flex items-center space-x-2">
                    <div className="p-2 bg-yellow-100 rounded-lg">
                      <Clock className="w-5 h-5 text-yellow-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-600">Pendientes</p>
                      <p className="text-2xl font-bold text-yellow-600" data-testid="text-pending-count">
                        {pendingCount}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <div className="p-2 bg-green-100 rounded-lg">
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-600">Aprobadas</p>
                      <p className="text-2xl font-bold text-green-600">
                        {approvedCount}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <Send className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-600">Enviadas</p>
                      <p className="text-2xl font-bold text-blue-600">
                        {sentCount}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <div className="p-2 bg-orange-100 rounded-lg">
                      <XCircle className="w-5 h-5 text-orange-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-600">Devueltas</p>
                      <p className="text-2xl font-bold text-orange-600" data-testid="text-returned-count">
                        {returnedCount}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Filters */}
            <Card>
              <CardContent className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <Input
                      type="text"
                      placeholder="Buscar por cliente, financiera o producto..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                      data-testid="input-search"
                    />
                  </div>

                  <Select value={filterClientType} onValueChange={setFilterClientType}>
                    <SelectTrigger data-testid="select-client-type">
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
                    <SelectTrigger data-testid="select-status">
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
                    <SelectTrigger data-testid="select-institution">
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
              </CardContent>
            </Card>

            <div className="space-y-4">
              {filteredSubmissions.length === 0 ? (
                <Card>
                  <CardContent className="p-12 text-center">
                    <Search className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      {allTargets && allTargets.length > 0 
                        ? 'No se encontraron solicitudes' 
                        : 'No hay solicitudes'}
                    </h3>
                    <p className="text-gray-600">
                      {allTargets && allTargets.length > 0
                        ? 'No hay solicitudes que coincidan con los filtros seleccionados'
                        : 'No hay solicitudes en el sistema.'}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                filteredSubmissions.map(([requestId, group]) => {
                  const { submission, targets } = group;
                  const client = submission.client || targets[0]?.client;
                  const predominantStatus = getPredominantStatus(targets);
                  const isExpanded = expandedSubmissions.has(requestId);

                  return (
                    <Card key={requestId} className="hover:shadow-md transition-shadow">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 space-y-3">
                            {/* Header con título y badges */}
                            <div className="flex items-center space-x-2">
                              <CardTitle className="text-lg">
                                {getClientName(client)}
                              </CardTitle>
                              {client?.type && (
                                <Badge 
                                  variant="outline" 
                                  className={getCategoryBadgeColor(client.type)}
                                  data-testid={`badge-client-type-${requestId}`}
                                >
                                  {getCategoryDisplayName(client.type)}
                                </Badge>
                              )}
                              {getStatusBadge(predominantStatus)}
                            </div>
                            
                            {/* Grid de información principal del submission */}
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-2 text-sm">
                              <div className="flex items-center space-x-2">
                                <DollarSign className="w-4 h-4 text-gray-500" />
                                <span className="font-medium text-gray-700">Monto Solicitado:</span>
                                <span className="text-gray-900 font-semibold" data-testid={`text-amount-${requestId}`}>
                                  {submission.requestedAmount?.toLocaleString('es-MX', { 
                                    style: 'currency', 
                                    currency: 'MXN', 
                                    minimumFractionDigits: 0, 
                                    maximumFractionDigits: 0 
                                  })}
                                </span>
                              </div>
                              
                              <div className="flex items-center space-x-2">
                                <Package className="w-4 h-4 text-gray-500" />
                                <span className="font-medium text-gray-700">Producto:</span>
                                <span className="text-gray-900" data-testid={`text-product-${requestId}`}>
                                  {targets[0]?.productTemplate?.name || 'No especificado'}
                                </span>
                              </div>

                              <div className="flex items-center space-x-2">
                                <Calendar className="w-4 h-4 text-gray-500" />
                                <span className="font-medium text-gray-700">Fecha:</span>
                                <span className="text-gray-900" data-testid={`text-date-${requestId}`}>
                                  {new Date(submission.createdAt).toLocaleDateString('es-ES')}
                                </span>
                              </div>

                              <div className="flex items-center space-x-2">
                                <Building2 className="w-4 h-4 text-gray-500" />
                                <span className="font-medium text-gray-700">Financieras:</span>
                                <span className="text-gray-900 font-semibold" data-testid={`text-institutions-count-${requestId}`}>
                                  {targets.length}
                                </span>
                              </div>

                              {submission.purpose && (
                                <div className="col-span-2 flex items-center space-x-2">
                                  <FileText className="w-4 h-4 text-gray-500" />
                                  <span className="font-medium text-gray-700">Propósito:</span>
                                  <span className="text-gray-900 truncate" data-testid={`text-purpose-${requestId}`}>
                                    {submission.purpose}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </CardHeader>
                      
                      <Collapsible
                        open={isExpanded}
                        onOpenChange={() => toggleSubmissionExpanded(requestId)}
                      >
                        <CollapsibleTrigger asChild>
                          <div className="px-6 pb-4 cursor-pointer border-t">
                            <Button variant="ghost" size="sm" className="w-full mt-2">
                              {isExpanded ? (
                                <ChevronUp className="w-4 h-4 mr-2" />
                              ) : (
                                <ChevronDown className="w-4 h-4 mr-2" />
                              )}
                              {isExpanded ? 'Ocultar financieras' : `Ver ${targets.length} financiera${targets.length !== 1 ? 's' : ''}`}
                            </Button>
                          </div>
                        </CollapsibleTrigger>
                        
                        <CollapsibleContent>
                          <CardContent className="pt-0 space-y-4">
                            {/* Broker Notes - if exists */}
                            {submission.brokerNotes && (
                              <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                                <h4 className="font-medium text-blue-900 mb-2 flex items-center">
                                  <FileText className="w-4 h-4 mr-2" />
                                  Notas del Broker
                                </h4>
                                <p className="text-sm text-blue-800" data-testid={`text-broker-notes-${requestId}`}>
                                  {submission.brokerNotes}
                                </p>
                              </div>
                            )}

                            {/* List of institutions/targets */}
                            {targets.map((target) => {
                              const institutionExpanded = (expandedInstitutionsPerSubmission[requestId] || new Set()).has(target.id);
                              
                              return (
                                <div key={target.id} className="border rounded-lg bg-white">
                                  <div className="p-4 space-y-3">
                                    {/* Institution Header */}
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center space-x-3">
                                        <Building2 className="w-5 h-5 text-gray-500" />
                                        <div>
                                          <h4 className="font-semibold text-gray-900" data-testid={`text-institution-${target.id}`}>
                                            {target.institution?.name || 'Financiera no especificada'}
                                          </h4>
                                          <p className="text-sm text-gray-500">
                                            {target.productTemplate?.name || 'Producto no especificado'}
                                          </p>
                                        </div>
                                      </div>
                                      <div className="flex items-center space-x-2">
                                        {getStatusBadge(target.status)}
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => handleDownloadPDF(target.id)}
                                          data-testid={`button-download-pdf-${target.id}`}
                                        >
                                          <Download className="w-4 h-4 mr-1" />
                                          PDF
                                        </Button>
                                      </div>
                                    </div>

                                    {/* Actions based on status */}
                                    {target.status === 'pending_admin' && (
                                      <div className="flex space-x-2">
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => {
                                            setSelectedTarget(target);
                                            setReviewAction('return_to_broker');
                                            setShowReviewModal(true);
                                          }}
                                          className="text-orange-600 border-orange-200 hover:bg-orange-50"
                                          data-testid={`button-return-to-broker-${target.id}`}
                                        >
                                          <XCircle className="w-4 h-4 mr-1" />
                                          Solicitar Cambios
                                        </Button>
                                        <Button
                                          size="sm"
                                          onClick={() => {
                                            setSelectedTarget(target);
                                            setReviewAction('approve');
                                            setShowReviewModal(true);
                                          }}
                                          className="bg-green-600 hover:bg-green-700"
                                          data-testid={`button-approve-${target.id}`}
                                        >
                                          <CheckCircle className="w-4 h-4 mr-1" />
                                          Visto Bueno
                                        </Button>
                                      </div>
                                    )}

                                    {target.status === 'approved' && (
                                      <Button
                                        size="sm"
                                        onClick={() => markAsSentMutation.mutate(target.id)}
                                        disabled={markAsSentMutation.isPending}
                                        data-testid={`button-mark-sent-${target.id}`}
                                      >
                                        <Send className="w-4 h-4 mr-1" />
                                        Marcar como Enviado a Financiera
                                      </Button>
                                    )}

                                    {target.status === 'sent' && (
                                      <div className="flex space-x-2">
                                        <Input
                                          type="file"
                                          onChange={(e) => handleFileUpload(target, e)}
                                          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                                          className="hidden"
                                          id={`file-upload-${target.id}`}
                                        />
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => document.getElementById(`file-upload-${target.id}`)?.click()}
                                          data-testid={`button-upload-${target.id}`}
                                        >
                                          <Upload className="w-4 h-4 mr-1" />
                                          Subir Propuesta
                                        </Button>
                                        <Button
                                          size="sm"
                                          onClick={() => {
                                            setSelectedTarget(target);
                                            setShowProposalModal(true);
                                          }}
                                          data-testid={`button-add-proposal-${target.id}`}
                                        >
                                          <FileText className="w-4 h-4 mr-1" />
                                          Capturar Propuesta
                                        </Button>
                                        {target.proposalDocument && (
                                          <Badge variant="outline" className="bg-green-50 text-green-700">
                                            Documento subido
                                          </Badge>
                                        )}
                                      </div>
                                    )}

                                    {target.status === 'returned_to_broker' && (target.details || target.adminNotes) && (
                                      <div className="bg-orange-50 p-4 rounded border-2 border-orange-300">
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

                                    {target.status === 'institution_approved' && target.institutionProposal && (
                                      <div className="bg-green-50 p-3 rounded-lg border border-green-200">
                                        <h4 className="font-medium text-green-900 mb-2">Propuesta Recibida</h4>
                                        <div className="grid grid-cols-2 gap-3 text-sm">
                                          <div>
                                            <span className="text-gray-600">Monto Aprobado:</span>
                                            <p className="font-medium">${target.institutionProposal.approvedAmount.toLocaleString('es-MX')}</p>
                                          </div>
                                          <div>
                                            <span className="text-gray-600">Tasa:</span>
                                            <p className="font-medium">{target.institutionProposal.interestRate}%</p>
                                          </div>
                                          <div>
                                            <span className="text-gray-600">Plazo:</span>
                                            <p className="font-medium">{target.institutionProposal.term} meses</p>
                                          </div>
                                          {target.institutionProposal.openingCommission && (
                                            <div>
                                              <span className="text-gray-600">Comisión:</span>
                                              <p className="font-medium">{target.institutionProposal.openingCommission}%</p>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    )}

                                    {target.status === 'selected_winner' && target.isWinner && (
                                      <div className="space-y-2">
                                        <div className="bg-purple-50 p-3 rounded-lg">
                                          <p className="font-medium text-purple-900">Propuesta Seleccionada</p>
                                        </div>
                                        <Button
                                          size="sm"
                                          onClick={() => markDispersedMutation.mutate(target.id)}
                                          disabled={markDispersedMutation.isPending}
                                          className="bg-emerald-600 hover:bg-emerald-700"
                                          data-testid={`button-mark-dispersed-${target.id}`}
                                        >
                                          <Package className="w-4 h-4 mr-1" />
                                          Marcar como Dispersado
                                        </Button>
                                      </div>
                                    )}

                                    {target.status === 'dispersed' && (
                                      <div className="bg-emerald-50 p-3 rounded-lg">
                                        <p className="font-medium text-emerald-900">
                                          Dispersado el {new Date(target.dispersedAt!).toLocaleDateString('es-ES')}
                                        </p>
                                      </div>
                                    )}

                                    {/* Collapsible Matching Analysis */}
                                    {target.institution && client && (
                                      <Collapsible
                                        open={institutionExpanded}
                                        onOpenChange={() => toggleInstitutionExpanded(requestId, target.id)}
                                      >
                                        <CollapsibleTrigger asChild>
                                          <Button variant="outline" size="sm" className="w-full mt-2">
                                            {institutionExpanded ? (
                                              <ChevronUp className="w-4 h-4 mr-2" />
                                            ) : (
                                              <ChevronDown className="w-4 h-4 mr-2" />
                                            )}
                                            {institutionExpanded ? 'Ocultar Análisis de Matching' : 'Ver Análisis de Matching'}
                                          </Button>
                                        </CollapsibleTrigger>
                                        <CollapsibleContent>
                                          <div className="mt-4 p-4 bg-gray-50 rounded-lg">
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
                                </div>
                              );
                            })}
                          </CardContent>
                        </CollapsibleContent>
                      </Collapsible>
                    </Card>
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
                    
                    <div className="flex justify-end space-x-3">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setShowReviewModal(false)}
                      >
                        Cancelar
                      </Button>
                      <Button
                        type="submit"
                        disabled={reviewMutation.isPending}
                        className={reviewAction === 'approve' ? 'bg-green-600 hover:bg-green-700' : 'bg-orange-600 hover:bg-orange-700'}
                      >
                        {reviewMutation.isPending ? "Procesando..." : reviewAction === 'approve' ? 'Dar Visto Bueno' : 'Devolver al Broker'}
                      </Button>
                    </div>
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
                    
                    <div className="flex justify-end space-x-3">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setShowProposalModal(false)}
                      >
                        Cancelar
                      </Button>
                      <Button
                        type="submit"
                        disabled={proposalMutation.isPending}
                      >
                        {proposalMutation.isPending ? "Guardando..." : "Guardar Propuesta"}
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </>
        )}
      </div>
    </div>
  );
}
