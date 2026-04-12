import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { ChevronDown, ChevronUp, X, FileText, Building2, Calendar, DollarSign, User, AlertCircle } from "lucide-react";
import FinalProposalModal from "@/components/Modals/FinalProposalModal";
import MatchingComparisonTable from "@/components/MatchingAnalysis/MatchingComparisonTable";
import { submissionStatusConfig, creditStatusConfig, targetStatusConfig, getSubmissionStatusSummary } from "@/lib/statusConfig";

type UnifiedCreditItem = {
  id: string;
  type: 'submission' | 'credit';
  clientId: string;
  amount: string;
  status: string;
  createdAt: Date | string;
  term?: number;
  frequency?: string;
  productTemplateName?: string;
  targetsCount?: number;
  proposalsCount?: number;
  statusSummary?: ReturnType<typeof getSubmissionStatusSummary>;
};

// Ahora se usa configuración compartida desde @/lib/statusConfig

export default function CreditList() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [proposalCredit, setProposalCredit] = useState<Credit | null>(null);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null);
  const [expandedInstitutions, setExpandedInstitutions] = useState<Set<string>>(new Set());
  const [, setLocation] = useLocation();

  const { data: credits, isLoading: creditsLoading } = useQuery<Credit[]>({
    queryKey: ["/api/credits"],
  });

  const { data: submissions, isLoading: submissionsLoading } = useQuery<any[]>({
    queryKey: ["/api/credit-submissions"],
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

  const { data: selectedClient } = useQuery<Client>({
    queryKey: ["/api/clients", selectedSubmission?.clientId],
    enabled: !!selectedSubmission?.clientId,
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

  // Combine submissions and credits into unified list
  const unifiedItems = useMemo(() => {
    const items: UnifiedCreditItem[] = [];
    
    // Add submissions that haven't been dispersed (exclude both 'dispersed' and 'disbursed')
    if (submissions) {
      submissions
        .filter(sub => sub.status !== 'dispersed' && sub.status !== 'disbursed')
        .forEach(sub => {
          const targetsCount = sub.targets?.length || 0;
          const proposalsCount = sub.targets?.filter((t: any) => t.institutionProposal).length || 0;
          const statusSummary = getSubmissionStatusSummary(sub.targets || []);
          
          items.push({
            id: sub.id,
            type: 'submission',
            clientId: sub.clientId,
            amount: sub.requestedAmount || '0',
            status: sub.status,
            createdAt: sub.createdAt,
            productTemplateName: sub.productTemplate?.name,
            targetsCount,
            proposalsCount,
            statusSummary,
          });
        });
    }
    
    // Add dispersed credits (include both 'dispersed' and 'disbursed' statuses, plus any with linkedSubmissionId)
    if (credits) {
      credits
        .filter(credit => credit.status === 'dispersed' || credit.status === 'disbursed' || credit.linkedSubmissionId)
        .forEach(credit => {
          items.push({
            id: credit.id,
            type: 'credit',
            clientId: credit.clientId,
            amount: credit.amount,
            status: credit.status,
            createdAt: credit.createdAt!,
            term: credit.term || undefined,
            frequency: credit.frequency || undefined,
          });
        });
    }
    
    // Sort by creation date (newest first)
    return items.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [submissions, credits]);

  const filteredItems = unifiedItems.filter(item => {
    const clientName = getClientName(item.clientId);
    const matchesSearch = 
      clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.amount.toString().includes(searchTerm);
    
    // For submissions with status summary, check if any target status matches the filter
    let matchesStatus = filterStatus === "all";
    if (!matchesStatus && item.type === 'submission' && item.statusSummary) {
      const uniqueStatuses = Object.keys(item.statusSummary.statusCounts);
      matchesStatus = uniqueStatuses.includes(filterStatus);
    } else if (!matchesStatus) {
      matchesStatus = item.status === filterStatus;
    }
    
    return matchesSearch && matchesStatus;
  });

  const handleItemClick = (item: UnifiedCreditItem) => {
    if (item.type === 'credit') {
      setLocation(`/clientes/${item.clientId}`);
    } else {
      setSelectedSubmissionId(item.id);
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
                    <p className="text-sm text-neutral">
                      ${parseFloat(item.amount).toLocaleString('es-MX')} MXN
                      {item.term && ` • ${item.term} meses`}
                      {item.productTemplateName && ` • ${item.productTemplateName}`}
                    </p>
                    <p className="text-xs text-neutral">
                      {item.type === 'submission' ? 'Solicitud' : 'Crédito'} • Creado {formatDistanceToNow(new Date(item.createdAt), { 
                        addSuffix: true, 
                        locale: es 
                      })}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-3">
                  <div className="text-right">
                    {(() => {
                      // For submissions with multiple statuses, show all badges or summary
                      if (item.type === 'submission' && item.statusSummary?.hasMultipleStatuses) {
                        return (
                          <div className="flex flex-col gap-1 items-end">
                            {item.statusSummary.badges.map((badge, idx) => (
                              <Badge 
                                key={idx}
                                className={badge.color}
                                data-testid={`item-status-${item.id}-${idx}`}
                              >
                                {badge.label}
                              </Badge>
                            ))}
                          </div>
                        );
                      }
                      
                      // For single status or credits, show normal badge
                      const config = item.type === 'submission' ? submissionStatusConfig : creditStatusConfig;
                      const statusInfo = config[item.status as keyof typeof config];
                      return (
                        <Badge 
                          className={statusInfo?.color || "bg-gray-100 text-gray-800"}
                          data-testid={`item-status-${item.id}`}
                        >
                          {statusInfo?.label || item.status}
                        </Badge>
                      );
                    })()}
                    {item.type === 'submission' && item.proposalsCount !== undefined && item.proposalsCount > 0 && (
                      <p className="text-xs text-green-600 font-medium mt-1">
                        {item.proposalsCount} propuesta{item.proposalsCount !== 1 ? 's' : ''}
                      </p>
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

      <Dialog open={!!selectedSubmissionId} onOpenChange={(open) => !open && setSelectedSubmissionId(null)}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <User className="w-6 h-6 text-primary" />
                <div>
                  <h2 className="text-xl font-bold">
                    {selectedClient ? getClientName(selectedClient.id) : 'Cargando...'}
                  </h2>
                  <p className="text-sm text-gray-500 font-normal">
                    Análisis Detallado de Matching
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedSubmissionId(null)}
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
                        <p className="font-medium">{selectedSubmission.productTemplate?.name || 'No especificado'}</p>
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
                        <Badge className={submissionStatusConfig[selectedSubmission.status as keyof typeof submissionStatusConfig]?.color || "bg-gray-100"}>
                          {submissionStatusConfig[selectedSubmission.status as keyof typeof submissionStatusConfig]?.label || selectedSubmission.status}
                        </Badge>
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
          ) : (
            <div className="space-y-4">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          )}

          <DialogFooter className="flex justify-between">
            <Button
              variant="outline"
              onClick={() => setSelectedSubmissionId(null)}
              data-testid="button-close-footer"
            >
              Cerrar
            </Button>
            {submissionTargets && submissionTargets.filter(t => t.institutionProposal).length > 1 && (
              <Button
                variant="default"
                onClick={() => {
                  setSelectedSubmissionId(null);
                }}
                data-testid="button-compare-proposals"
              >
                Ver Comparación de Propuestas
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
