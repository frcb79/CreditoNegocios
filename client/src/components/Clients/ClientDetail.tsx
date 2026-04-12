import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogDescription 
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Client, Credit, Document, ClientCreditHistory } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { 
  Building2, 
  User, 
  Phone, 
  Mail, 
  MapPin, 
  FileText, 
  CreditCard,
  TrendingUp,
  Calendar,
  DollarSign,
  X,
  Plus,
  History
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import CreditRequestModal from "@/components/Modals/CreditRequestModal";

interface ClientDetailProps {
  clientId: string;
  onEdit: (client: Client) => void;
  onClose: () => void;
}

export default function ClientDetail({ clientId, onEdit, onClose }: ClientDetailProps) {
  const [showHistoryForm, setShowHistoryForm] = useState(false);
  const [showCreditRequestModal, setShowCreditRequestModal] = useState(false);
  const { toast } = useToast();

  const formatCurrency = (value: string | number | null | undefined): string => {
    if (!value || value === '0' || value === 0) return '$0';
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(numValue)) return '$0';
    return `$${numValue.toLocaleString('es-MX')}`;
  };

  const { data: client, isLoading } = useQuery<Client>({
    queryKey: ["/api/clients", clientId],
  });

  const { data: credits } = useQuery<Credit[]>({
    queryKey: [`/api/credits/client/${clientId}`],
    enabled: !!clientId,
  });

  const { data: documents } = useQuery<Document[]>({
    queryKey: [`/api/documents/client/${clientId}`],
    enabled: !!clientId,
  });

  const { data: creditHistories, isLoading: isLoadingHistories } = useQuery<ClientCreditHistory[]>({
    queryKey: ["/api/clients", clientId, "credit-histories"],
    enabled: !!clientId,
  });

  // Fetch credit submission requests for this client
  const { data: submissionRequests, isLoading: isLoadingRequests } = useQuery<any[]>({
    queryKey: [`/api/credit-submissions/client/${clientId}`],
    enabled: !!clientId,
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-8 w-8" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="p-6">
        <p className="text-center text-neutral">Cliente no encontrado</p>
      </div>
    );
  }

  const clientName = client.type === 'persona_moral' ? client.businessName : `${client.firstName} ${client.lastName}`;
  const initials = client.type === 'persona_moral' 
    ? client.businessName?.slice(0, 2).toUpperCase()
    : `${client.firstName?.[0]}${client.lastName?.[0]}`;

  const getClientTypeLabel = (type: string) => {
    const types = {
      'persona_moral': 'PM',
      'fisica_empresarial': 'PFAE',
      'fisica': 'PF',
      'sin_sat': 'Sin SAT'
    };
    return types[type as keyof typeof types] || type;
  };

  const getClientTypeColor = (type: string) => {
    const colors = {
      'persona_moral': 'bg-blue-100 text-blue-800',
      'fisica_empresarial': 'bg-purple-100 text-purple-800',
      'fisica': 'bg-green-100 text-green-800',
      'sin_sat': 'bg-orange-100 text-orange-800'
    };
    return colors[type as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center space-x-4">
            <div className="w-16 h-16 bg-gradient-to-br from-primary to-primary/80 rounded-xl flex items-center justify-center shadow-lg">
              <span className="text-white font-bold text-xl" data-testid="client-initials">
                {initials}
              </span>
            </div>
            <div>
              <div className="flex items-center space-x-3">
                <h2 className="text-2xl font-bold text-gray-900" data-testid="client-name">
                  {clientName}
                </h2>
                <Badge className={getClientTypeColor(client.type)} data-testid="client-type-badge">
                  {getClientTypeLabel(client.type)}
                </Badge>
                <Badge 
                  variant={client.isActive ? "default" : "secondary"}
                  className={client.isActive ? "bg-green-100 text-green-800" : ""}
                  data-testid="client-status"
                >
                  {client.isActive ? "Activo" : "Inactivo"}
                </Badge>
              </div>
              <p className="text-neutral mt-1" data-testid="client-rfc">
                RFC: {client.rfc}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            data-testid="button-close-client-detail"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Action Buttons */}
        <div className="flex space-x-3">
          <Button 
            onClick={() => onEdit(client)}
            className="bg-primary text-white hover:bg-primary/90"
            data-testid="button-edit-client"
          >
            <FileText className="h-4 w-4 mr-2" />
            Editar Información
          </Button>
          <Button 
            className="bg-green-600 text-white hover:bg-green-700"
            onClick={() => setShowCreditRequestModal(true)}
            data-testid="button-new-credit"
          >
            <CreditCard className="h-4 w-4 mr-2" />
            Nuevo Crédito
          </Button>
          <Button 
            variant="outline"
            onClick={() => {
              toast({
                title: "Próximamente",
                description: "Esta funcionalidad estará disponible pronto.",
              });
            }}
            data-testid="button-generate-quote"
          >
            <DollarSign className="h-4 w-4 mr-2" />
            Generar Cotización
          </Button>
        </div>
      </div>

      {/* Dashboard Cards */}
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Información General */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center">
                {client.type === 'moral' ? <Building2 className="h-5 w-5 mr-2" /> : <User className="h-5 w-5 mr-2" />}
                Información General
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {client.type === 'moral' ? (
                <>
                  <div className="flex items-start justify-between py-2 border-b border-gray-100">
                    <span className="text-sm text-neutral">Razón Social</span>
                    <span className="text-sm font-medium text-right">{client.businessName}</span>
                  </div>
                  <div className="flex items-start justify-between py-2 border-b border-gray-100">
                    <span className="text-sm text-neutral">Industria</span>
                    <span className="text-sm font-medium text-right">{client.industry || 'No especificada'}</span>
                  </div>
                  <div className="flex items-start justify-between py-2 border-b border-gray-100">
                    <span className="text-sm text-neutral">Años en operación</span>
                    <span className="text-sm font-medium">{client.yearsInBusiness || 0} años</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-start justify-between py-2 border-b border-gray-100">
                    <span className="text-sm text-neutral">Nombre completo</span>
                    <span className="text-sm font-medium text-right">{client.firstName} {client.lastName}</span>
                  </div>
                  <div className="flex items-start justify-between py-2 border-b border-gray-100">
                    <span className="text-sm text-neutral">CURP</span>
                    <span className="text-sm font-medium">{client.curp || 'No proporcionada'}</span>
                  </div>
                </>
              )}
              <div className="flex items-start justify-between py-2 border-b border-gray-100">
                <span className="text-sm text-neutral">RFC</span>
                <span className="text-sm font-medium">{client.rfc}</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-neutral flex items-center">
                  <Phone className="h-4 w-4 mr-2" />
                  Teléfono
                </span>
                <span className="text-sm font-medium">{client.phone || 'No proporcionado'}</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-neutral flex items-center">
                  <Mail className="h-4 w-4 mr-2" />
                  Email
                </span>
                <span className="text-sm font-medium text-right break-all">{client.email || 'No proporcionado'}</span>
              </div>
            </CardContent>
          </Card>

          {/* Perfil Financiero */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center">
                <TrendingUp className="h-5 w-5 mr-2" />
                Perfil Financiero
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {client.type === 'moral' && (
                <>
                  <div className="flex items-start justify-between py-2 border-b border-gray-100">
                    <span className="text-sm text-neutral">Ingresos anuales</span>
                    <span className="text-sm font-medium">
                      {formatCurrency(client.ingresoAnual)} MXN
                    </span>
                  </div>
                  <div className="flex items-start justify-between py-2 border-b border-gray-100">
                    <span className="text-sm text-neutral">Sector económico</span>
                    <span className="text-sm font-medium text-right">{client.sectoreEconomico || 'No especificado'}</span>
                  </div>
                </>
              )}
              {(client.type === 'fisica_empresarial' || client.type === 'fisica') && (
                <>
                  <div className="flex items-start justify-between py-2 border-b border-gray-100">
                    <span className="text-sm text-neutral">Ingresos mensuales</span>
                    <span className="text-sm font-medium">
                      {formatCurrency(client.ingresoMensualPromedio)} MXN
                    </span>
                  </div>
                  <div className="flex items-start justify-between py-2 border-b border-gray-100">
                    <span className="text-sm text-neutral">Sector económico</span>
                    <span className="text-sm font-medium text-right">{client.sectoreEconomico || 'No especificado'}</span>
                  </div>
                </>
              )}
              {client.type === 'sin_sat' && (
                <>
                  <div className="flex items-start justify-between py-2 border-b border-gray-100">
                    <span className="text-sm text-neutral">Ingresos mensuales</span>
                    <span className="text-sm font-medium">
                      {formatCurrency(client.ingresoMensualPromedio)} MXN
                    </span>
                  </div>
                  <div className="flex items-start justify-between py-2 border-b border-gray-100">
                    <span className="text-sm text-neutral">Ocupación</span>
                    <span className="text-sm font-medium text-right">{client.ocupacion || 'No especificada'}</span>
                  </div>
                </>
              )}
              <div className="flex items-start justify-between py-2">
                <span className="text-sm text-neutral flex items-center">
                  <MapPin className="h-4 w-4 mr-2" />
                  Dirección
                </span>
                <span className="text-sm font-medium text-right max-w-[60%]">{client.address || 'No proporcionada'}</span>
              </div>
            </CardContent>
          </Card>

          {/* Documentos Recientes */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center justify-between">
                <span className="flex items-center">
                  <FileText className="h-5 w-5 mr-2" />
                  Documentos
                </span>
                <Badge variant="secondary">{documents?.length || 0}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!documents || documents.length === 0 ? (
                <div className="text-center py-8">
                  <FileText className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-neutral">No hay documentos subidos</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {documents.slice(0, 5).map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center space-x-3 flex-1 min-w-0">
                        <FileText className="h-5 w-5 text-primary flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{doc.fileName}</p>
                          <p className="text-xs text-neutral capitalize">{doc.type.replace('_', ' ')}</p>
                        </div>
                      </div>
                      <Badge 
                        variant={doc.isValid ? "default" : "secondary"}
                        className={doc.isValid ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}
                      >
                        {doc.isValid ? "Válido" : "Pendiente"}
                      </Badge>
                    </div>
                  ))}
                  {documents && documents.length > 5 && (
                    <p className="text-xs text-center text-neutral">
                      +{documents.length - 5} documentos más
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Historial Crediticio Manual */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center justify-between">
                <span className="flex items-center">
                  <History className="h-5 w-5 mr-2" />
                  Historial Crediticio
                </span>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{creditHistories?.length || 0}</Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowHistoryForm(true)}
                    data-testid="button-add-credit-history"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Agregar
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingHistories ? (
                <div className="space-y-3">
                  <Skeleton className="h-20" />
                  <Skeleton className="h-20" />
                </div>
              ) : !creditHistories || creditHistories.length === 0 ? (
                <div className="text-center py-8">
                  <History className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-neutral mb-2">No hay historial crediticio registrado</p>
                  <p className="text-xs text-neutral mb-3">
                    Si el cliente tiene créditos anteriores, puede ingresarlos manualmente
                  </p>
                  <Button
                    size="sm"
                    onClick={() => setShowHistoryForm(true)}
                    data-testid="button-add-first-history"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Agregar Historial
                  </Button>
                </div>
              ) : (
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {creditHistories.map((history) => (
                    <div key={history.id} className="p-3 bg-gray-50 rounded-lg" data-testid={`history-item-${history.id}`}>
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-sm font-semibold text-gray-900">
                              ${parseFloat(history.amountGranted).toLocaleString('es-MX')} MXN
                            </p>
                            <Badge variant="outline" className="text-xs">
                              {history.creditType}
                            </Badge>
                          </div>
                          <p className="text-xs text-neutral">
                            {history.termMonths} meses • Tasa: {history.interestRate}%
                          </p>
                          {history.financialInstitution && (
                            <p className="text-xs text-neutral mt-1">
                              Financiera: {history.financialInstitution}
                            </p>
                          )}
                          {history.notes && (
                            <p className="text-xs text-gray-600 mt-2 italic">
                              {history.notes}
                            </p>
                          )}
                        </div>
                        <Badge 
                          variant="secondary"
                          className={history.source === 'manual' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}
                        >
                          {history.source === 'manual' ? 'Manual' : 'Sistema'}
                        </Badge>
                      </div>
                      <p className="text-xs text-neutral">
                        Registrado {formatDistanceToNow(new Date(history.createdAt!), { 
                          addSuffix: true, 
                          locale: es 
                        })}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Historial de Solicitudes */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center">
                <FileText className="h-5 w-5 mr-2" />
                Historial de Solicitudes
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingRequests ? (
                <div className="space-y-3">
                  <Skeleton className="h-20" />
                  <Skeleton className="h-20" />
                </div>
              ) : !submissionRequests || submissionRequests.length === 0 ? (
                <div className="text-center py-8">
                  <FileText className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-neutral">No hay solicitudes registradas</p>
                </div>
              ) : (
                <div className="space-y-4 max-h-64 overflow-y-auto">
                  {submissionRequests.map((request) => (
                    <div key={request.id} className="border rounded-lg p-4 bg-gray-50" data-testid={`request-item-${request.id}`}>
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-sm font-semibold text-gray-900">
                              ${parseFloat(request.requestedAmount).toLocaleString('es-MX')} MXN
                            </p>
                            <Badge 
                              variant="outline"
                              className={
                                request.status === 'pending_admin' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' :
                                request.status === 'approved' ? 'bg-green-50 text-green-700 border-green-200' :
                                request.status === 'rejected' ? 'bg-red-50 text-red-700 border-red-200' :
                                'bg-gray-50 text-gray-700 border-gray-200'
                              }
                            >
                              {request.status === 'pending_admin' ? 'Pendiente' :
                               request.status === 'approved' ? 'Aprobada' :
                               request.status === 'rejected' ? 'Rechazada' :
                               request.status}
                            </Badge>
                          </div>
                          {request.purpose && (
                            <p className="text-xs text-neutral mb-2">
                              Propósito: {request.purpose}
                            </p>
                          )}
                        </div>
                      </div>
                      
                      {/* Targets (Financieras) */}
                      {request.targets && request.targets.length > 0 && (
                        <div className="space-y-2 mt-3 pt-3 border-t border-gray-200">
                          <p className="text-xs font-medium text-gray-600">Financieras contactadas:</p>
                          <div className="space-y-1">
                            {request.targets.map((target: any) => (
                              <div key={target.id} className="flex items-center justify-between text-xs">
                                <span className="text-gray-700">{target.institution?.name || 'N/A'}</span>
                                <Badge 
                                  variant="outline" 
                                  className={`text-xs ${
                                    target.status === 'pending_admin' ? 'bg-yellow-50 text-yellow-700' :
                                    target.status === 'approved' ? 'bg-green-50 text-green-700' :
                                    target.status === 'rejected' ? 'bg-red-50 text-red-700' :
                                    'bg-gray-50'
                                  }`}
                                >
                                  {target.status === 'pending_admin' ? '⏳ Pendiente' :
                                   target.status === 'approved' ? '✓ Aprobada' :
                                   target.status === 'rejected' ? '✗ Rechazada' :
                                   target.status}
                                </Badge>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      <p className="text-xs text-neutral mt-3">
                        Creada {formatDistanceToNow(new Date(request.createdAt), { 
                          addSuffix: true, 
                          locale: es 
                        })}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Notas adicionales */}
        {client.notes && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center">
                <FileText className="h-5 w-5 mr-2" />
                Notas adicionales
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-700">{client.notes}</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Dialog para agregar historial crediticio */}
      <CreditHistoryDialog
        open={showHistoryForm}
        onOpenChange={setShowHistoryForm}
        clientId={clientId}
      />

      {/* Credit Request Modal */}
      <CreditRequestModal
        isOpen={showCreditRequestModal}
        onClose={() => setShowCreditRequestModal(false)}
        preselectedClientId={clientId}
      />
    </div>
  );
}

function CreditHistoryDialog({ 
  open, 
  onOpenChange, 
  clientId 
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void; 
  clientId: string;
}) {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    creditType: '',
    amountGranted: '',
    termMonths: '',
    interestRate: '',
    financialInstitution: '',
    notes: ''
  });

  const createHistoryMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return await apiRequest(
        'POST',
        `/api/clients/${clientId}/credit-histories`,
        {
          creditType: data.creditType,
          amountGranted: data.amountGranted,
          termMonths: data.termMonths,
          interestRate: data.interestRate,
          financialInstitution: data.financialInstitution || null,
          notes: data.notes || null,
        }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients", clientId, "credit-histories"] });
      toast({
        title: "Historial agregado",
        description: "El historial crediticio se agregó correctamente",
      });
      setFormData({
        creditType: '',
        amountGranted: '',
        termMonths: '',
        interestRate: '',
        financialInstitution: '',
        notes: ''
      });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo agregar el historial crediticio",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.creditType || !formData.amountGranted || !formData.termMonths || !formData.interestRate) {
      toast({
        title: "Campos requeridos",
        description: "Por favor completa todos los campos obligatorios",
        variant: "destructive",
      });
      return;
    }

    createHistoryMutation.mutate(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Agregar Historial Crediticio</DialogTitle>
          <DialogDescription>
            Ingrese información de créditos anteriores del cliente
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="creditType">Tipo de Crédito *</Label>
            <Input
              id="creditType"
              value={formData.creditType}
              onChange={(e) => setFormData({ ...formData, creditType: e.target.value })}
              placeholder="ej: Crédito Simple, PYME, etc."
              data-testid="input-credit-type"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="amountGranted">Monto Otorgado * (MXN)</Label>
              <Input
                id="amountGranted"
                type="number"
                value={formData.amountGranted}
                onChange={(e) => setFormData({ ...formData, amountGranted: e.target.value })}
                placeholder="100000"
                data-testid="input-amount"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="termMonths">Plazo * (meses)</Label>
              <Input
                id="termMonths"
                type="number"
                value={formData.termMonths}
                onChange={(e) => setFormData({ ...formData, termMonths: e.target.value })}
                placeholder="12"
                data-testid="input-term"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="interestRate">Tasa de Interés * (%)</Label>
            <Input
              id="interestRate"
              type="number"
              step="0.01"
              value={formData.interestRate}
              onChange={(e) => setFormData({ ...formData, interestRate: e.target.value })}
              placeholder="12.5"
              data-testid="input-interest-rate"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="financialInstitution">Financiera</Label>
            <Input
              id="financialInstitution"
              value={formData.financialInstitution}
              onChange={(e) => setFormData({ ...formData, financialInstitution: e.target.value })}
              placeholder="ej: BCM, Konfio, Pretmex, etc."
              data-testid="input-financial-institution"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notas</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Observaciones adicionales..."
              rows={3}
              data-testid="input-notes"
            />
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              data-testid="button-cancel-history"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={createHistoryMutation.isPending}
              data-testid="button-submit-history"
            >
              {createHistoryMutation.isPending ? "Guardando..." : "Agregar Historial"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
