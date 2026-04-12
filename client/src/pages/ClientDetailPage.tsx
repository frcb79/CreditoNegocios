import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Client, Credit, Document, ClientCreditHistory } from "@shared/schema";
import { formatDistanceToNow, format } from "date-fns";
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
  DollarSign,
  Plus,
  History,
  ArrowLeft,
  X,
  Eye,
  AlertCircle
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import CreditRequestModal from "@/components/Modals/CreditRequestModal";
import DocumentUpload from "@/components/Documents/DocumentUpload";
import { targetStatusConfig, getSubmissionStatusSummary } from "@/lib/statusConfig";

const vigenteFormSchema = z.object({
  tipo: z.string().min(1, "El tipo de crédito es requerido"),
  saldoOriginal: z.string().min(1, "El saldo original es requerido"),
  saldo: z.string().min(1, "El saldo actual es requerido"),
  institucion: z.string().min(1, "La institución es requerida"),
  fechaInicio: z.string().optional(),
  fechaTermino: z.string().optional(),
});

type VigenteFormData = z.infer<typeof vigenteFormSchema>;

export default function ClientDetailPage() {
  const [, params] = useRoute("/clientes/:clientId");
  const [, setLocation] = useLocation();
  const [showHistoryForm, setShowHistoryForm] = useState(false);
  const [showVigentesForm, setShowVigentesForm] = useState(false);
  const [editingVigente, setEditingVigente] = useState<any | null>(null);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showFinancialModal, setShowFinancialModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showCreditRequestModal, setShowCreditRequestModal] = useState(false);
  const [showDocumentUploadModal, setShowDocumentUploadModal] = useState(false);
  const { toast } = useToast();

  const clientId = params?.clientId || "";

  const { data: client, isLoading } = useQuery<Client>({
    queryKey: ["/api/clients", clientId],
    enabled: !!clientId,
  });

  const { data: credits } = useQuery<Credit[]>({
    queryKey: [`/api/credits/client/${clientId}`],
    enabled: !!clientId,
  });

  const { data: submissions } = useQuery<any[]>({
    queryKey: [`/api/credit-submissions/client/${clientId}`],
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

  const handleEditClient = (client: Client) => {
    // Navigate back to clients page with edit query param
    setLocation(`/clientes?edit=${client.id}`);
  };

  const handleGoBack = () => {
    setLocation("/clientes");
  };

  if (!clientId) {
    return (
      <div className="min-h-screen flex bg-gray-50">
        <Sidebar />
        <div className="flex-1 flex flex-col">
          <Header 
            title="Cliente no encontrado"
            subtitle="El cliente especificado no existe"
          />
          <main className="flex-1 p-8">
            <div className="text-center">
              <p className="text-neutral mb-4">No se encontró el cliente</p>
              <Button onClick={handleGoBack}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Volver a Clientes
              </Button>
            </div>
          </main>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex bg-gray-50">
        <Sidebar />
        <div className="flex-1 flex flex-col">
          <Header 
            title="Cargando..."
            subtitle="Obteniendo información del cliente"
          />
          <main className="flex-1 p-8">
            <div className="space-y-6">
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
          </main>
        </div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="min-h-screen flex bg-gray-50">
        <Sidebar />
        <div className="flex-1 flex flex-col">
          <Header 
            title="Cliente no encontrado"
            subtitle="El cliente especificado no existe"
          />
          <main className="flex-1 p-8">
            <div className="text-center">
              <p className="text-neutral mb-4">No se encontró el cliente</p>
              <Button onClick={handleGoBack}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Volver a Clientes
              </Button>
            </div>
          </main>
        </div>
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
    <div className="min-h-screen flex bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header 
          title={clientName || "Cliente"}
          subtitle={`RFC: ${client.rfc}`}
        />
        
        <main className="flex-1 overflow-y-auto">
          <div className="bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center space-x-4">
                  <div className={`w-16 h-16 rounded-xl flex items-center justify-center shadow-lg ${
                    client.type === 'persona_moral' ? 'bg-blue-100 text-blue-700' :
                    client.type === 'fisica_empresarial' ? 'bg-purple-100 text-purple-700' :
                    client.type === 'fisica' ? 'bg-green-100 text-green-700' :
                    'bg-orange-100 text-orange-700'
                  }`}>
                    <span className="font-bold text-xl" data-testid="client-initials">
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
                  variant="outline"
                  onClick={handleGoBack}
                  data-testid="button-back-to-clients"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Volver
                </Button>
              </div>

              {/* Action Buttons */}
              <div className="flex space-x-3">
                <Button 
                  onClick={() => handleEditClient(client)}
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
                <Card className="border border-gray-200">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center justify-between">
                      <span className="flex items-center">
                        {client.type === 'persona_moral' ? <Building2 className="h-5 w-5 mr-2" /> : <User className="h-5 w-5 mr-2" />}
                        Información General
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowInfoModal(true)}
                        data-testid="button-view-more-info"
                        className="text-blue-500 hover:text-blue-700"
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        Ver más
                      </Button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {client.type === 'persona_moral' ? (
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
                        {(client.type === 'fisica_empresarial' || client.type === 'fisica' || client.type === 'sin_sat') && (
                          <div className="flex items-start justify-between py-2 border-b border-gray-100">
                            <span className="text-sm text-neutral">Estado Civil</span>
                            <span className="text-sm font-medium text-right">{client.estadoCivil || 'No especificado'}</span>
                          </div>
                        )}
                      </>
                    )}
                    <div className="flex items-start justify-between py-2 border-b border-gray-100">
                      <span className="text-sm text-neutral">RFC</span>
                      <span className="text-sm font-medium">{client.rfc}</span>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b border-gray-100">
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
                <Card className="border border-gray-200">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center justify-between">
                      <span className="flex items-center">
                        <TrendingUp className="h-5 w-5 mr-2" />
                        Perfil Financiero
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowFinancialModal(true)}
                        data-testid="button-view-more-financial"
                        className="text-blue-500 hover:text-blue-700"
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        Ver más
                      </Button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {client.type === 'persona_moral' && (
                      <>
                        <div className="flex items-start justify-between py-2 border-b border-gray-100">
                          <span className="text-sm text-neutral">Ingresos anuales</span>
                          <span className="text-sm font-medium">
                            {client.ingresoAnual ? `$${parseFloat(client.ingresoAnual || '0').toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN` : 'No especificado'}
                          </span>
                        </div>
                        <div className="flex items-start justify-between py-2 border-b border-gray-100">
                          <span className="text-sm text-neutral">Egresos mensuales</span>
                          <span className="text-sm font-medium">
                            {client.egresoMensualPromedio ? `$${parseFloat(client.egresoMensualPromedio || '0').toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN` : 'No especificado'}
                          </span>
                        </div>
                        <div className="flex items-start justify-between py-2 border-b border-gray-100">
                          <span className="text-sm text-neutral">Participación ventas gobierno</span>
                          <span className="text-sm font-medium text-right">{client.participacionVentasGobierno || 'No especificado'}</span>
                        </div>
                        <div className="flex items-start justify-between py-2 border-b border-gray-100">
                          <span className="text-sm text-neutral">Buró accionista principal</span>
                          <span className="text-sm font-medium text-right">{client.buroAccionistaPrincipal || 'No especificado'}</span>
                        </div>
                        <div className="flex items-start justify-between py-2 border-b border-gray-100">
                          <span className="text-sm text-neutral">Buró empresa</span>
                          <span className="text-sm font-medium text-right">{client.buroEmpresa || 'No especificado'}</span>
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
                          <span className="text-sm text-neutral">Puesto</span>
                          <span className="text-sm font-medium text-right">{client.puesto || 'No especificado'}</span>
                        </div>
                        <div className="flex items-start justify-between py-2 border-b border-gray-100">
                          <span className="text-sm text-neutral">Antigüedad laboral</span>
                          <span className="text-sm font-medium text-right">{client.antiguedadLaboral || 'No especificado'}</span>
                        </div>
                        <div className="flex items-start justify-between py-2 border-b border-gray-100">
                          <span className="text-sm text-neutral">Ingresos comprobables</span>
                          <span className="text-sm font-medium">
                            {client.ingresoMensualPromedioComprobables ? `$${parseFloat(client.ingresoMensualPromedioComprobables || '0').toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN` : 'No especificado'}
                          </span>
                        </div>
                        <div className="flex items-start justify-between py-2 border-b border-gray-100">
                          <span className="text-sm text-neutral">Ingresos no comprobables</span>
                          <span className="text-sm font-medium">
                            {client.ingresoMensualPromedioNoComprobables ? `$${parseFloat(client.ingresoMensualPromedioNoComprobables || '0').toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN` : 'No especificado'}
                          </span>
                        </div>
                        <div className="flex items-start justify-between py-2 border-b border-gray-100">
                          <span className="text-sm text-neutral">Gastos fijos mensuales</span>
                          <span className="text-sm font-medium">
                            {client.gastosFijosMensualesPromedio ? `$${parseFloat(client.gastosFijosMensualesPromedio || '0').toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN` : 'No especificado'}
                          </span>
                        </div>
                        <div className="flex items-start justify-between py-2 border-b border-gray-100">
                          <span className="text-sm text-neutral">Buró persona física</span>
                          <span className="text-sm font-medium text-right">{client.buroPersonaFisica || 'No especificado'}</span>
                        </div>
                      </>
                    )}
                    {client.type === 'sin_sat' && (
                      <>
                        <div className="flex items-start justify-between py-2 border-b border-gray-100">
                          <span className="text-sm text-neutral">Nombre comercial</span>
                          <span className="text-sm font-medium text-right">{client.nombreComercial || 'No especificado'}</span>
                        </div>
                        <div className="flex items-start justify-between py-2 border-b border-gray-100">
                          <span className="text-sm text-neutral">Ocupación</span>
                          <span className="text-sm font-medium text-right">{client.ocupacion || 'No especificada'}</span>
                        </div>
                        <div className="flex items-start justify-between py-2 border-b border-gray-100">
                          <span className="text-sm text-neutral">Ingresos comprobables</span>
                          <span className="text-sm font-medium">
                            {client.ingresoMensualPromedioComprobablesSinSat ? `$${parseFloat(client.ingresoMensualPromedioComprobablesSinSat || '0').toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN` : 'No especificado'}
                          </span>
                        </div>
                        <div className="flex items-start justify-between py-2 border-b border-gray-100">
                          <span className="text-sm text-neutral">Ingresos no comprobables</span>
                          <span className="text-sm font-medium">
                            {client.ingresoMensualPromedioNoComprobablesSinSat ? `$${parseFloat(client.ingresoMensualPromedioNoComprobablesSinSat || '0').toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN` : 'No especificado'}
                          </span>
                        </div>
                        <div className="flex items-start justify-between py-2 border-b border-gray-100">
                          <span className="text-sm text-neutral">Gastos fijos mensuales</span>
                          <span className="text-sm font-medium">
                            {client.gastosFijosMensualesPromedioSinSat ? `$${parseFloat(client.gastosFijosMensualesPromedioSinSat || '0').toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN` : 'No especificado'}
                          </span>
                        </div>
                        <div className="flex items-start justify-between py-2 border-b border-gray-100">
                          <span className="text-sm text-neutral">Buró persona física</span>
                          <span className="text-sm font-medium text-right">{client.buroPersonaFisicaSinSat || 'No especificado'}</span>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>

                {/* Documentos Recientes */}
                <Card className="border border-gray-200">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center justify-between">
                      <span className="flex items-center">
                        <FileText className="h-5 w-5 mr-2" />
                        Documentos
                      </span>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{documents?.length || 0}</Badge>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowDocumentUploadModal(true)}
                          data-testid="button-upload-document"
                          className="text-blue-500 hover:text-blue-700"
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Subir
                        </Button>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {!documents || documents.length === 0 ? (
                      <div className="text-center py-8">
                        <FileText className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                        <p className="text-sm text-neutral mb-3">No hay documentos subidos</p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowDocumentUploadModal(true)}
                          data-testid="button-upload-first-document"
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Subir primer documento
                        </Button>
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

                {/* Historial Crediticio con Tabs */}
                <Card className="border border-gray-200">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center justify-between">
                      <span className="flex items-center">
                        <History className="h-5 w-5 mr-2" />
                        Historial Crediticio
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowHistoryModal(true)}
                        data-testid="button-view-more-history"
                        className="text-blue-500 hover:text-blue-700"
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        Ver más
                      </Button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Tabs defaultValue="gestion" className="w-full">
                      <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="gestion" data-testid="tab-en-gestion">
                          En Gestión
                        </TabsTrigger>
                        <TabsTrigger value="vigentes" data-testid="tab-creditos-vigentes">
                          Créditos Vigentes
                        </TabsTrigger>
                        <TabsTrigger value="pasados" data-testid="tab-creditos-pasados">
                          Créditos Pasados
                        </TabsTrigger>
                      </TabsList>

                      {/* Tab Créditos Vigentes */}
                      <TabsContent value="vigentes" className="mt-4">
                        <div className="flex justify-end mb-3">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setShowVigentesForm(true)}
                            data-testid="button-add-vigente"
                          >
                            <Plus className="h-4 w-4 mr-1" />
                            Agregar
                          </Button>
                        </div>
                        
                        {showVigentesForm ? (
                          <VigenteForm
                            clientId={clientId}
                            onCancel={() => setShowVigentesForm(false)}
                            onSuccess={() => setShowVigentesForm(false)}
                          />
                        ) : (
                          <>
                            {(() => {
                              const today = new Date();
                              today.setHours(0, 0, 0, 0);
                              const allVigentes = (client?.creditosVigentesDetalles as any[]) || [];
                              const vigentes = allVigentes.filter((credito: any) => {
                                if (!credito.fechaTermino) return true;
                                const endDate = new Date(credito.fechaTermino);
                                endDate.setHours(0, 0, 0, 0);
                                return endDate >= today;
                              });
                              
                              return vigentes.length === 0 ? (
                                <div className="text-center py-8">
                                  <CreditCard className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                                  <p className="text-sm text-neutral mb-2">No hay créditos vigentes</p>
                                  <p className="text-xs text-neutral">
                                    Los créditos vigentes se registran en el perfil del cliente
                                  </p>
                                </div>
                              ) : (
                                <div className="space-y-3 max-h-64 overflow-y-auto">
                                  {vigentes.map((credito: any, index: number) => (
                                    <div key={index} className="p-3 bg-gray-50 rounded-lg" data-testid={`vigente-item-${index}`}>
                                      <div className="flex items-start justify-between mb-2">
                                        <div className="flex-1">
                                          <div className="flex items-center gap-2 mb-1">
                                            <p className="text-sm font-semibold text-gray-900">
                                              ${parseFloat(credito.saldo || credito.monto || '0').toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN
                                            </p>
                                            {credito.tipo && (
                                              <Badge variant="outline" className="text-xs">
                                                {credito.tipo}
                                              </Badge>
                                            )}
                                          </div>
                                          {credito.institucion && (
                                            <p className="text-xs text-neutral">
                                              Financiera: {credito.institucion}
                                            </p>
                                          )}
                                          {credito.saldoOriginal && (
                                            <p className="text-xs text-neutral">
                                              Saldo Original: ${parseFloat(credito.saldoOriginal || '0').toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN
                                            </p>
                                          )}
                                          <div className="flex gap-4 mt-2">
                                            {credito.fechaInicio && (
                                              <p className="text-xs text-neutral" data-testid={`fecha-inicio-${index}`}>
                                                Inicio: {format(new Date(credito.fechaInicio), 'dd/MM/yyyy')}
                                              </p>
                                            )}
                                            {credito.fechaTermino && (
                                              <p className="text-xs text-neutral" data-testid={`fecha-termino-${index}`}>
                                                Término: {format(new Date(credito.fechaTermino), 'dd/MM/yyyy')}
                                              </p>
                                            )}
                                          </div>
                                        </div>
                                        <Badge variant="default" className="bg-green-100 text-green-800">
                                          Vigente
                                        </Badge>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              );
                            })()}
                          </>
                        )}
                      </TabsContent>

                      {/* Tab Créditos Pasados */}
                      <TabsContent value="pasados" className="mt-4">
                        <div className="flex justify-end mb-3">
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
                                        ${parseFloat(history.amountGranted || '0').toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN
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
                      </TabsContent>

                      {/* Tab En Gestión */}
                      <TabsContent value="gestion" className="mt-4">
                        {!submissions || submissions.length === 0 ? (
                          <div className="text-center py-8">
                            <FileText className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                            <p className="text-sm text-neutral mb-2">No hay créditos en gestión</p>
                            <p className="text-xs text-neutral">
                              Los créditos en gestión aparecerán aquí cuando se registren en el sistema
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-3 max-h-64 overflow-y-auto">
                            {submissions.map((submission) => {
                              const approvedCount = submission.targets?.filter((t: any) => t.institutionProposal).length || 0;
                              const totalTargets = submission.targets?.length || 0;
                              
                              return (
                                <div key={submission.id} className="p-3 bg-gray-50 rounded-lg" data-testid={`submission-item-${submission.id}`}>
                                  <div className="flex items-start justify-between mb-2">
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2 mb-1">
                                        <p className="text-sm font-semibold text-gray-900">
                                          ${submission.requestedAmount ? Number(submission.requestedAmount).toLocaleString('es-MX') : '0'} MXN
                                        </p>
                                        <Badge 
                                          variant="outline" 
                                          className={
                                            submission.status === 'dispersed' ? 'bg-blue-100 text-blue-800' :
                                            submission.status === 'returned_to_broker' ? 'bg-orange-100 text-orange-800' :
                                            approvedCount > 0 ? 'bg-green-100 text-green-800' :
                                            submission.status === 'sent_to_institutions' ? 'bg-yellow-100 text-yellow-800' :
                                            'bg-gray-100 text-gray-800'
                                          }
                                        >
                                          {submission.status === 'pending_admin' ? 'Pendiente Admin' :
                                           submission.status === 'returned_to_broker' ? 'Devuelto' :
                                           submission.status === 'sent_to_institutions' ? `En Revisión (${totalTargets})` :
                                           submission.status === 'dispersed' ? 'Dispersado' :
                                           submission.status}
                                        </Badge>
                                      </div>
                                      {submission.productTemplate?.name && (
                                        <p className="text-xs text-neutral">
                                          Producto: {submission.productTemplate.name}
                                        </p>
                                      )}
                                      {submission.purpose && (
                                        <p className="text-xs text-neutral mt-1">
                                          Propósito: {submission.purpose}
                                        </p>
                                      )}
                                      {approvedCount > 0 && (
                                        <p className="text-xs text-green-700 mt-1 font-medium">
                                          {approvedCount} propuesta{approvedCount > 1 ? 's' : ''} recibida{approvedCount > 1 ? 's' : ''}
                                        </p>
                                      )}
                                      {submission.status === 'returned_to_broker' && submission.targets && submission.targets.length > 0 && (
                                        <>
                                          {submission.targets.map((target: any) => (
                                            target.status === 'returned_to_broker' && target.details && (
                                              <div key={target.id} className="mt-2 p-2 bg-orange-50 border border-orange-200 rounded">
                                                <p className="text-xs font-semibold text-orange-800 mb-1">Comentarios del Admin:</p>
                                                <p className="text-xs text-orange-700">{target.details}</p>
                                              </div>
                                            )
                                          ))}
                                        </>
                                      )}
                                    </div>
                                  </div>
                                  <p className="text-xs text-neutral">
                                    Creado {formatDistanceToNow(new Date(submission.createdAt!), { 
                                      addSuffix: true, 
                                      locale: es 
                                    })}
                                  </p>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </TabsContent>
                    </Tabs>
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

            {/* Modal Información General */}
            <Dialog open={showInfoModal} onOpenChange={setShowInfoModal}>
              <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center">
                    {client.type === 'persona_moral' ? <Building2 className="h-5 w-5 mr-2" /> : <User className="h-5 w-5 mr-2" />}
                    Información General Completa
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-6 mt-4">
                  <div className="grid grid-cols-2 gap-4">
                    {client.type === 'persona_moral' ? (
                      <>
                        <div className="space-y-2">
                          <Label className="text-sm font-semibold text-neutral">Razón Social</Label>
                          <p className="text-sm">{client.businessName || 'No especificada'}</p>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-semibold text-neutral">Industria</Label>
                          <p className="text-sm">{client.industry || 'No especificada'}</p>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-semibold text-neutral">Años en operación</Label>
                          <p className="text-sm">{client.yearsInBusiness || 0} años</p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="space-y-2">
                          <Label className="text-sm font-semibold text-neutral">Nombre</Label>
                          <p className="text-sm">{client.firstName || 'No especificado'}</p>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-semibold text-neutral">Apellido</Label>
                          <p className="text-sm">{client.lastName || 'No especificado'}</p>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-semibold text-neutral">CURP</Label>
                          <p className="text-sm">{client.curp || 'No proporcionada'}</p>
                        </div>
                      </>
                    )}
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold text-neutral">RFC</Label>
                      <p className="text-sm">{client.rfc}</p>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold text-neutral">Tipo de Cliente</Label>
                      <Badge className={getClientTypeColor(client.type)}>
                        {getClientTypeLabel(client.type)}
                      </Badge>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold text-neutral">Estado</Label>
                      <Badge variant={client.isActive ? "default" : "secondary"} className={client.isActive ? "bg-green-100 text-green-800" : ""}>
                        {client.isActive ? "Activo" : "Inactivo"}
                      </Badge>
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <h3 className="text-sm font-semibold mb-4 flex items-center">
                      <Phone className="h-4 w-4 mr-2" />
                      Información de Contacto
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-sm font-semibold text-neutral">Email</Label>
                        <p className="text-sm break-all">{client.email || 'No proporcionado'}</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-semibold text-neutral">Teléfono</Label>
                        <p className="text-sm">{client.phone || 'No proporcionado'}</p>
                      </div>
                      {client.type === 'persona_moral' && (
                        <div className="space-y-2">
                          <Label className="text-sm font-semibold text-neutral">CURP</Label>
                          <p className="text-sm">{client.curp || 'No proporcionado'}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {(client.type === 'fisica_empresarial' || client.type === 'fisica' || client.type === 'sin_sat') && (
                    <div className="border-t pt-4">
                      <h3 className="text-sm font-semibold mb-4">Información Demográfica</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="text-sm font-semibold text-neutral">Estado Civil</Label>
                          <p className="text-sm">{client.estadoCivil || 'No especificado'}</p>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-semibold text-neutral">Nivel Educativo</Label>
                          <p className="text-sm">{client.nivelEducativo || 'No especificado'}</p>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-semibold text-neutral">Tipo de Vivienda</Label>
                          <p className="text-sm">{client.tipoVivienda || 'No especificado'}</p>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-semibold text-neutral">Dependientes Económicos</Label>
                          <p className="text-sm">{client.dependientesEconomicos || 'No especificado'}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="border-t pt-4">
                    <h3 className="text-sm font-semibold mb-4 flex items-center">
                      <MapPin className="h-4 w-4 mr-2" />
                      Dirección
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-sm font-semibold text-neutral">Calle</Label>
                        <p className="text-sm">{client.street || 'No especificada'}</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-semibold text-neutral">Número</Label>
                        <p className="text-sm">{client.number || 'No especificado'}</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-semibold text-neutral">Número Interior</Label>
                        <p className="text-sm">{client.interior || 'No especificado'}</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-semibold text-neutral">Código Postal</Label>
                        <p className="text-sm">{client.postalCode || 'No especificado'}</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-semibold text-neutral">Estado</Label>
                        <p className="text-sm">{client.state || 'No especificado'}</p>
                      </div>
                    </div>
                  </div>

                  {client.createdAt && (
                    <div className="border-t pt-4">
                      <div className="space-y-2">
                        <Label className="text-sm font-semibold text-neutral">Fecha de Registro</Label>
                        <p className="text-sm">
                          {new Date(client.createdAt).toLocaleDateString('es-MX', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>

            {/* Modal Perfil Financiero */}
            <Dialog open={showFinancialModal} onOpenChange={setShowFinancialModal}>
              <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center">
                    <TrendingUp className="h-5 w-5 mr-2" />
                    Perfil Financiero Completo
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-6 mt-4">
                  {client.type === 'persona_moral' && (
                    <>
                      <div className="border-b pb-4">
                        <h3 className="text-sm font-semibold mb-4">Información Financiera</h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-neutral">Ingresos Anuales</Label>
                            <p className="text-sm">
                              {client.ingresoAnual ? `$${parseFloat(client.ingresoAnual || '0').toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN` : 'No especificado'}
                            </p>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-neutral">Egresos Mensuales Promedio</Label>
                            <p className="text-sm">
                              {client.egresoMensualPromedio ? `$${parseFloat(client.egresoMensualPromedio || '0').toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN` : 'No especificado'}
                            </p>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-neutral">Participación Ventas Gobierno</Label>
                            <p className="text-sm">{client.participacionVentasGobierno || 'No especificado'}</p>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-neutral">Ventas con Terminal Bancaria</Label>
                            <p className="text-sm">
                              {client.ventasTerminalBancaria ? `$${parseFloat(client.ventasTerminalBancaria || '0').toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN` : 'No especificado'}
                            </p>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-neutral">Sector Económico</Label>
                            <p className="text-sm">{client.sectoreEconomico || 'No especificado'}</p>
                          </div>
                        </div>
                      </div>
                      <div className="border-b pb-4">
                        <h3 className="text-sm font-semibold mb-4">Buró de Crédito</h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-neutral">Buró Accionista Principal</Label>
                            <p className="text-sm">{client.buroAccionistaPrincipal || 'No especificado'}</p>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-neutral">Buró Empresa</Label>
                            <p className="text-sm">{client.buroEmpresa || 'No especificado'}</p>
                          </div>
                        </div>
                      </div>
                      <div className="border-b pb-4">
                        <h3 className="text-sm font-semibold mb-4">Garantías</h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-neutral">Cuenta con Garantía</Label>
                            <p className="text-sm">{client.garantia || 'No especificado'}</p>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-neutral">Aval u Obligado Solidario</Label>
                            <p className="text-sm">{client.avalObligadoSolidario || 'No especificado'}</p>
                          </div>
                          {client.garantiaDetalles && typeof client.garantiaDetalles === 'object' && Object.keys(client.garantiaDetalles as object).length > 0 ? (
                            <div className="space-y-2 col-span-2">
                              <Label className="text-sm font-semibold text-neutral">Detalles de Garantía</Label>
                              <div className="text-sm bg-gray-50 p-3 rounded border space-y-2">
                                {(() => {
                                  const detalles = client.garantiaDetalles as any;
                                  if (detalles.tipo || detalles.monto || detalles.valor) {
                                    const tipoMap: Record<string, string> = {
                                      'vehiculos': 'Vehículos',
                                      'maquinaria': 'Maquinaria',
                                      'otros': 'Otros'
                                    };
                                    return (
                                      <div>
                                        <p className="font-medium">Garantía Prendaria</p>
                                        {detalles.tipo && <p>Tipo: {tipoMap[detalles.tipo] || detalles.tipo}</p>}
                                        {(detalles.monto || detalles.valor) && (
                                          <p>Valor: ${parseFloat(detalles.monto || detalles.valor || '0').toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN</p>
                                        )}
                                        {detalles.ano && <p>Año: {detalles.ano}</p>}
                                      </div>
                                    );
                                  } else if (detalles.tipoInmueble || detalles.valorInmueble) {
                                    const inmuebleMap: Record<string, string> = {
                                      'oficina': 'Oficina',
                                      'departamento': 'Departamento',
                                      'casa': 'Casa',
                                      'bodega': 'Bodega',
                                      'terreno': 'Terreno',
                                      'otro': 'Otro'
                                    };
                                    return (
                                      <div>
                                        <p className="font-medium">Garantía Hipotecaria</p>
                                        {detalles.tipoInmueble && <p>Tipo: {inmuebleMap[detalles.tipoInmueble] || detalles.tipoInmueble}</p>}
                                        {detalles.valorInmueble && (
                                          <p>Valor: ${parseFloat(detalles.valorInmueble || '0').toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN</p>
                                        )}
                                        {detalles.ubicacion && <p>Ubicación: {detalles.ubicacion}</p>}
                                        {detalles.situacionLegal && <p>Situación Legal: {detalles.situacionLegal}</p>}
                                      </div>
                                    );
                                  } else if (detalles.descripcion) {
                                    return (
                                      <div>
                                        <p className="font-medium">Otros Activos</p>
                                        <p>{detalles.descripcion}</p>
                                      </div>
                                    );
                                  }
                                  return <p className="text-xs">{JSON.stringify(detalles, null, 2)}</p>;
                                })()}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </div>
                      <div className="border-b pb-4">
                        <h3 className="text-sm font-semibold mb-4">Documentación y Cumplimiento</h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-neutral">SAT CIEC</Label>
                            <p className="text-sm">{client.satCiec || 'No especificado'}</p>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-neutral">Estados Financieros</Label>
                            <p className="text-sm">{client.estadosFinancieros || 'No especificado'}</p>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-neutral">Opinión de Cumplimiento</Label>
                            <p className="text-sm">{client.opinionCumplimiento || 'No especificado'}</p>
                          </div>
                          {client.opinionDetalles && (
                            <div className="space-y-2 col-span-2">
                              <Label className="text-sm font-semibold text-neutral">Detalles de Opinión</Label>
                              <p className="text-sm bg-gray-50 p-3 rounded border whitespace-pre-wrap">{client.opinionDetalles}</p>
                            </div>
                          )}
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-neutral">Atrasos en Deudas</Label>
                            <p className="text-sm">{client.atrasosDeudas || 'No especificado'}</p>
                          </div>
                          {client.atrasosDetalles && (
                            <div className="space-y-2 col-span-2">
                              <Label className="text-sm font-semibold text-neutral">Detalles de Atrasos</Label>
                              <p className="text-sm bg-gray-50 p-3 rounded border whitespace-pre-wrap">{client.atrasosDetalles}</p>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="border-b pb-4">
                        <h3 className="text-sm font-semibold mb-4">Créditos Vigentes</h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-neutral">Créditos Vigentes</Label>
                            <p className="text-sm">{client.creditosVigentes || 'No especificado'}</p>
                          </div>
                          {client.creditosVigentesDetalles && Array.isArray(client.creditosVigentesDetalles) && client.creditosVigentesDetalles.length > 0 ? (
                            <div className="space-y-2 col-span-2">
                              <Label className="text-sm font-semibold text-neutral">Detalles de Créditos Vigentes</Label>
                              <div className="text-sm bg-gray-50 p-3 rounded border space-y-3">
                                {client.creditosVigentesDetalles.map((credito: any, index: number) => (
                                  <div key={index} className="pb-2 border-b last:border-b-0 last:pb-0">
                                    <div className="flex items-start justify-between">
                                      <div className="space-y-1">
                                        <p className="font-medium">{credito.tipo || 'Crédito'}</p>
                                        {credito.institucion && <p className="text-xs text-gray-600">Institución: {credito.institucion}</p>}
                                        {(credito.fechaInicio || credito.fechaTermino) && (
                                          <p className="text-xs text-gray-600">
                                            {credito.fechaInicio && `Inicio: ${credito.fechaInicio}`}
                                            {credito.fechaInicio && credito.fechaTermino && ' • '}
                                            {credito.fechaTermino && `Término: ${credito.fechaTermino}`}
                                          </p>
                                        )}
                                      </div>
                                      <div className="text-right space-y-1">
                                        {(credito.saldo || credito.saldoOriginal) && (
                                          <div>
                                            {credito.saldo && (
                                              <p className="font-semibold text-gray-900">
                                                ${parseFloat(credito.saldo || '0').toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN
                                              </p>
                                            )}
                                            {credito.saldoOriginal && credito.saldo !== credito.saldoOriginal && (
                                              <p className="text-xs text-gray-600">
                                                Original: ${parseFloat(credito.saldoOriginal || '0').toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN
                                              </p>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </div>
                      {client.notes && (
                        <div className="border-b pb-4">
                          <h3 className="text-sm font-semibold mb-4">Notas y Observaciones</h3>
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-neutral">Notas</Label>
                            <p className="text-sm bg-gray-50 p-3 rounded border whitespace-pre-wrap">{client.notes}</p>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {client.type === 'fisica_empresarial' && (
                    <>
                      <div className="border-b pb-4">
                        <h3 className="text-sm font-semibold mb-4">Información Laboral</h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-neutral">Puesto</Label>
                            <p className="text-sm">{client.puesto || 'No especificado'}</p>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-neutral">Antigüedad Laboral</Label>
                            <p className="text-sm">{client.antiguedadLaboral || 'No especificado'}</p>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-neutral">Sector Económico</Label>
                            <p className="text-sm">{client.sectoreEconomico || 'No especificado'}</p>
                          </div>
                        </div>
                      </div>
                      <div className="border-b pb-4">
                        <h3 className="text-sm font-semibold mb-4">Información Financiera</h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-neutral">Ingresos Mensuales Comprobables</Label>
                            <p className="text-sm">
                              {client.ingresoMensualPromedioComprobables ? `$${parseFloat(client.ingresoMensualPromedioComprobables || '0').toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN` : 'No especificado'}
                            </p>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-neutral">Ingresos Mensuales No Comprobables</Label>
                            <p className="text-sm">
                              {client.ingresoMensualPromedioNoComprobables ? `$${parseFloat(client.ingresoMensualPromedioNoComprobables || '0').toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN` : 'No especificado'}
                            </p>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-neutral">Gastos Fijos Mensuales Promedio</Label>
                            <p className="text-sm">
                              {client.gastosFijosMensualesPromedio ? `$${parseFloat(client.gastosFijosMensualesPromedio || '0').toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN` : 'No especificado'}
                            </p>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-neutral">Ingreso Anual</Label>
                            <p className="text-sm">
                              {client.ingresoAnual ? `$${parseFloat(client.ingresoAnual || '0').toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN` : 'No especificado'}
                            </p>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-neutral">Participación de Ventas con Gobierno</Label>
                            <p className="text-sm">{client.participacionVentasGobierno || 'No especificado'}</p>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-neutral">Ventas con Terminal Bancaria</Label>
                            <p className="text-sm">
                              {client.ventasTerminalBancaria ? `$${parseFloat(client.ventasTerminalBancaria || '0').toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN` : 'No especificado'}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="border-b pb-4">
                        <h3 className="text-sm font-semibold mb-4">Buró de Crédito</h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-neutral">Buró de Crédito Persona Física</Label>
                            <p className="text-sm">{client.buroPersonaFisica || 'No especificado'}</p>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-neutral">Atrasos en Deudas Buró</Label>
                            <p className="text-sm">{client.atrasosDeudasBuro || 'No especificado'}</p>
                          </div>
                          {client.atrasosDeudasBuroDetalles && (
                            <div className="space-y-2 col-span-2">
                              <Label className="text-sm font-semibold text-neutral">Detalles de Atrasos en Buró</Label>
                              <p className="text-sm bg-gray-50 p-3 rounded border whitespace-pre-wrap">{client.atrasosDeudasBuroDetalles}</p>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="border-b pb-4">
                        <h3 className="text-sm font-semibold mb-4">Garantías</h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-neutral">Cuenta con Garantía</Label>
                            <p className="text-sm">{client.garantia || 'No especificado'}</p>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-neutral">Tiene Aval u Obligado Solidario</Label>
                            <p className="text-sm">{client.avalObligadoSolidario || 'No especificado'}</p>
                          </div>
                          {client.garantiaDetalles && typeof client.garantiaDetalles === 'object' && Object.keys(client.garantiaDetalles as object).length > 0 ? (
                            <div className="space-y-2 col-span-2">
                              <Label className="text-sm font-semibold text-neutral">Detalles de Garantía</Label>
                              <div className="text-sm bg-gray-50 p-3 rounded border space-y-2">
                                {(() => {
                                  const detalles = client.garantiaDetalles as any;
                                  if (detalles.tipo || detalles.monto || detalles.valor) {
                                    const tipoMap: Record<string, string> = {
                                      'vehiculos': 'Vehículos',
                                      'maquinaria': 'Maquinaria',
                                      'otros': 'Otros'
                                    };
                                    return (
                                      <div>
                                        <p className="font-medium">Garantía Prendaria</p>
                                        {detalles.tipo && <p>Tipo: {tipoMap[detalles.tipo] || detalles.tipo}</p>}
                                        {(detalles.monto || detalles.valor) && (
                                          <p>Valor: ${parseFloat(detalles.monto || detalles.valor || '0').toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN</p>
                                        )}
                                        {detalles.ano && <p>Año: {detalles.ano}</p>}
                                      </div>
                                    );
                                  } else if (detalles.tipoInmueble || detalles.valorInmueble) {
                                    const inmuebleMap: Record<string, string> = {
                                      'oficina': 'Oficina',
                                      'departamento': 'Departamento',
                                      'casa': 'Casa',
                                      'bodega': 'Bodega',
                                      'terreno': 'Terreno',
                                      'otro': 'Otro'
                                    };
                                    return (
                                      <div>
                                        <p className="font-medium">Garantía Hipotecaria</p>
                                        {detalles.tipoInmueble && <p>Tipo: {inmuebleMap[detalles.tipoInmueble] || detalles.tipoInmueble}</p>}
                                        {detalles.valorInmueble && (
                                          <p>Valor: ${parseFloat(detalles.valorInmueble || '0').toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN</p>
                                        )}
                                        {detalles.ubicacion && <p>Ubicación: {detalles.ubicacion}</p>}
                                        {detalles.situacionLegal && <p>Situación Legal: {detalles.situacionLegal}</p>}
                                      </div>
                                    );
                                  } else if (detalles.descripcion) {
                                    return (
                                      <div>
                                        <p className="font-medium">Otros Activos</p>
                                        <p>{detalles.descripcion}</p>
                                      </div>
                                    );
                                  }
                                  return <p className="text-xs">{JSON.stringify(detalles, null, 2)}</p>;
                                })()}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </div>
                      <div className="border-b pb-4">
                        <h3 className="text-sm font-semibold mb-4">Documentación y Cumplimiento</h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-neutral">Abierto a conectarse con SAT vía CIEC</Label>
                            <p className="text-sm">{client.satCiec || 'No especificado'}</p>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-neutral">¿Cuenta con Estados Financieros?</Label>
                            <p className="text-sm">{client.estadosFinancieros || 'No especificado'}</p>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-neutral">Opinión de Cumplimiento</Label>
                            <p className="text-sm">{client.opinionCumplimiento || 'No especificado'}</p>
                          </div>
                          {client.opinionDetalles && (
                            <div className="space-y-2 col-span-2">
                              <Label className="text-sm font-semibold text-neutral">Detalles de Opinión</Label>
                              <p className="text-sm bg-gray-50 p-3 rounded border whitespace-pre-wrap">{client.opinionDetalles}</p>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="border-b pb-4">
                        <h3 className="text-sm font-semibold mb-4">Créditos Vigentes</h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-neutral">Créditos Vigentes</Label>
                            <p className="text-sm">{client.creditosVigentes || 'No especificado'}</p>
                          </div>
                          {client.creditosVigentesDetalles && Array.isArray(client.creditosVigentesDetalles) && client.creditosVigentesDetalles.length > 0 ? (
                            <div className="space-y-2 col-span-2">
                              <Label className="text-sm font-semibold text-neutral">Detalles de Créditos Vigentes</Label>
                              <div className="text-sm bg-gray-50 p-3 rounded border space-y-3">
                                {client.creditosVigentesDetalles.map((credito: any, index: number) => (
                                  <div key={index} className="pb-2 border-b last:border-b-0 last:pb-0">
                                    <div className="flex items-start justify-between">
                                      <div className="space-y-1">
                                        <p className="font-medium">{credito.tipo || 'Crédito'}</p>
                                        {credito.institucion && <p className="text-xs text-gray-600">Institución: {credito.institucion}</p>}
                                        {(credito.fechaInicio || credito.fechaTermino) && (
                                          <p className="text-xs text-gray-600">
                                            {credito.fechaInicio && `Inicio: ${credito.fechaInicio}`}
                                            {credito.fechaInicio && credito.fechaTermino && ' • '}
                                            {credito.fechaTermino && `Término: ${credito.fechaTermino}`}
                                          </p>
                                        )}
                                      </div>
                                      <div className="text-right space-y-1">
                                        {(credito.saldo || credito.saldoOriginal) && (
                                          <div>
                                            {credito.saldo && (
                                              <p className="font-semibold text-gray-900">
                                                ${parseFloat(credito.saldo || '0').toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN
                                              </p>
                                            )}
                                            {credito.saldoOriginal && credito.saldo !== credito.saldoOriginal && (
                                              <p className="text-xs text-gray-600">
                                                Original: ${parseFloat(credito.saldoOriginal || '0').toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN
                                              </p>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </div>
                      <div className="border-b pb-4">
                        <h3 className="text-sm font-semibold mb-4">Observaciones Adicionales</h3>
                        <div className="space-y-2">
                          {client.observacionesAdicionalesFisica || client.notes ? (
                            <p className="text-sm bg-gray-50 p-3 rounded border whitespace-pre-wrap">{client.observacionesAdicionalesFisica || client.notes}</p>
                          ) : (
                            <p className="text-sm text-neutral">No hay observaciones registradas</p>
                          )}
                        </div>
                      </div>
                    </>
                  )}

                  {client.type === 'fisica' && (
                    <>
                      <div className="border-b pb-4">
                        <h3 className="text-sm font-semibold mb-4">Información Laboral</h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-neutral">Puesto</Label>
                            <p className="text-sm">{client.puesto || 'No especificado'}</p>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-neutral">Antigüedad Laboral</Label>
                            <p className="text-sm">{client.antiguedadLaboral || 'No especificado'}</p>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-neutral">Sector Económico</Label>
                            <p className="text-sm">{client.sectoreEconomico || 'No especificado'}</p>
                          </div>
                        </div>
                      </div>
                      <div className="border-b pb-4">
                        <h3 className="text-sm font-semibold mb-4">Información Financiera</h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-neutral">Ingresos Mensuales Comprobables</Label>
                            <p className="text-sm">
                              {client.ingresoMensualPromedioComprobables ? `$${parseFloat(client.ingresoMensualPromedioComprobables || '0').toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN` : 'No especificado'}
                            </p>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-neutral">Ingresos Mensuales No Comprobables</Label>
                            <p className="text-sm">
                              {client.ingresoMensualPromedioNoComprobables ? `$${parseFloat(client.ingresoMensualPromedioNoComprobables || '0').toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN` : 'No especificado'}
                            </p>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-neutral">Gastos Fijos Mensuales Promedio</Label>
                            <p className="text-sm">
                              {client.gastosFijosMensualesPromedio ? `$${parseFloat(client.gastosFijosMensualesPromedio || '0').toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN` : 'No especificado'}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="border-b pb-4">
                        <h3 className="text-sm font-semibold mb-4">Buró de Crédito</h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-neutral">Buró Persona Física</Label>
                            <p className="text-sm">{client.buroPersonaFisica || 'No especificado'}</p>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-neutral">Atrasos en Deudas Buró</Label>
                            <p className="text-sm">{client.atrasosDeudasBuro || 'No especificado'}</p>
                          </div>
                          {client.atrasosDeudasBuroDetalles && (
                            <div className="space-y-2 col-span-2">
                              <Label className="text-sm font-semibold text-neutral">Detalles de Atrasos en Buró</Label>
                              <p className="text-sm bg-gray-50 p-3 rounded border whitespace-pre-wrap">{client.atrasosDeudasBuroDetalles}</p>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="border-b pb-4">
                        <h3 className="text-sm font-semibold mb-4">Garantías</h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-neutral">Cuenta con Garantía Física</Label>
                            <p className="text-sm">{client.cuentaConGarantiaFisica || 'No especificado'}</p>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-neutral">Tiene Aval u Obligado Solidario</Label>
                            <p className="text-sm">{client.tieneAvalObligadoSolidarioFisica || 'No especificado'}</p>
                          </div>
                          {client.garantiaFisicaDetalles && typeof client.garantiaFisicaDetalles === 'object' && Object.keys(client.garantiaFisicaDetalles as object).length > 0 ? (
                            <div className="space-y-2 col-span-2">
                              <Label className="text-sm font-semibold text-neutral">Detalles de Garantía Física</Label>
                              <div className="text-sm bg-gray-50 p-3 rounded border space-y-2">
                                {(() => {
                                  const detalles = client.garantiaFisicaDetalles as any;
                                  if (detalles.tipo || detalles.valor) {
                                    const tipoMap: Record<string, string> = {
                                      'vehiculos': 'Vehículos',
                                      'maquinaria': 'Maquinaria',
                                      'otros': 'Otros'
                                    };
                                    return (
                                      <div>
                                        <p className="font-medium">Garantía Prendaria</p>
                                        {detalles.tipo && <p>Tipo: {tipoMap[detalles.tipo] || detalles.tipo}</p>}
                                        {detalles.valor && (
                                          <p>Valor: ${parseFloat(detalles.valor || '0').toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN</p>
                                        )}
                                        {detalles.ano && <p>Año: {detalles.ano}</p>}
                                      </div>
                                    );
                                  } else if (detalles.tipoInmueble || detalles.valorInmueble) {
                                    const inmuebleMap: Record<string, string> = {
                                      'oficina': 'Oficina',
                                      'departamento': 'Departamento',
                                      'casa': 'Casa',
                                      'bodega': 'Bodega',
                                      'terreno': 'Terreno',
                                      'otro': 'Otro'
                                    };
                                    return (
                                      <div>
                                        <p className="font-medium">Garantía Hipotecaria</p>
                                        {detalles.tipoInmueble && <p>Tipo: {inmuebleMap[detalles.tipoInmueble] || detalles.tipoInmueble}</p>}
                                        {detalles.valorInmueble && (
                                          <p>Valor: ${parseFloat(detalles.valorInmueble || '0').toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN</p>
                                        )}
                                        {detalles.ubicacion && <p>Ubicación: {detalles.ubicacion}</p>}
                                        {detalles.situacionLegal && <p>Situación Legal: {detalles.situacionLegal}</p>}
                                      </div>
                                    );
                                  }
                                  return <p className="text-xs">{JSON.stringify(detalles, null, 2)}</p>;
                                })()}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </div>
                      <div className="border-b pb-4">
                        <h3 className="text-sm font-semibold mb-4">Notas y Observaciones</h3>
                        <div className="space-y-3">
                          {client.notes && (
                            <div className="space-y-2">
                              <Label className="text-sm font-semibold text-neutral">Notas</Label>
                              <p className="text-sm bg-gray-50 p-3 rounded border whitespace-pre-wrap">{client.notes}</p>
                            </div>
                          )}
                          {client.observacionesAdicionalesFisica && (
                            <div className="space-y-2">
                              <Label className="text-sm font-semibold text-neutral">Observaciones Adicionales</Label>
                              <p className="text-sm bg-gray-50 p-3 rounded border whitespace-pre-wrap">{client.observacionesAdicionalesFisica}</p>
                            </div>
                          )}
                          {!client.notes && !client.observacionesAdicionalesFisica && (
                            <p className="text-sm text-neutral">No hay notas u observaciones registradas</p>
                          )}
                        </div>
                      </div>
                    </>
                  )}

                  {client.type === 'sin_sat' && (
                    <>
                      <div className="border-b pb-4">
                        <h3 className="text-sm font-semibold mb-4">Información del Negocio</h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-neutral">Nombre Comercial</Label>
                            <p className="text-sm">{client.nombreComercial || 'No especificado'}</p>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-neutral">Ocupación</Label>
                            <p className="text-sm">{client.ocupacion || 'No especificada'}</p>
                          </div>
                        </div>
                      </div>
                      <div className="border-b pb-4">
                        <h3 className="text-sm font-semibold mb-4">Información Financiera</h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-neutral">Ingresos Mensuales Comprobables</Label>
                            <p className="text-sm">
                              {client.ingresoMensualPromedioComprobablesSinSat ? `$${parseFloat(client.ingresoMensualPromedioComprobablesSinSat || '0').toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN` : 'No especificado'}
                            </p>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-neutral">Ingresos Mensuales No Comprobables</Label>
                            <p className="text-sm">
                              {client.ingresoMensualPromedioNoComprobablesSinSat ? `$${parseFloat(client.ingresoMensualPromedioNoComprobablesSinSat || '0').toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN` : 'No especificado'}
                            </p>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-neutral">Gastos Fijos Mensuales Promedio</Label>
                            <p className="text-sm">
                              {client.gastosFijosMensualesPromedioSinSat ? `$${parseFloat(client.gastosFijosMensualesPromedioSinSat || '0').toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN` : 'No especificado'}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="border-b pb-4">
                        <h3 className="text-sm font-semibold mb-4">Buró de Crédito</h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-neutral">Buró Persona Física</Label>
                            <p className="text-sm">{client.buroPersonaFisicaSinSat || 'No especificado'}</p>
                          </div>
                        </div>
                      </div>
                      <div className="border-b pb-4">
                        <h3 className="text-sm font-semibold mb-4">Garantías</h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-neutral">Cuenta con Garantía</Label>
                            <p className="text-sm">{client.cuentaConGarantiaSinSat || 'No especificado'}</p>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-neutral">Tiene Aval u Obligado Solidario</Label>
                            <p className="text-sm">{client.tieneAvalObligadoSolidarioSinSat || 'No especificado'}</p>
                          </div>
                          {client.garantiaSinSatDetalles && typeof client.garantiaSinSatDetalles === 'object' && Object.keys(client.garantiaSinSatDetalles as object).length > 0 ? (
                            <div className="space-y-2 col-span-2">
                              <Label className="text-sm font-semibold text-neutral">Detalles de Garantía</Label>
                              <div className="text-sm bg-gray-50 p-3 rounded border space-y-2">
                                {(() => {
                                  const detalles = client.garantiaSinSatDetalles as any;
                                  if (detalles.tipo || detalles.valor) {
                                    return (
                                      <div>
                                        <p className="font-medium">Garantía Prendaria</p>
                                        {detalles.tipo && <p>Tipo: {detalles.tipo}</p>}
                                        {detalles.valor && (
                                          <p>Valor: ${parseFloat(detalles.valor || '0').toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN</p>
                                        )}
                                        {detalles.ano && <p>Año: {detalles.ano}</p>}
                                      </div>
                                    );
                                  } else if (detalles.tipoInmueble || detalles.valorInmueble) {
                                    const inmuebleMap: Record<string, string> = {
                                      'oficina': 'Oficina',
                                      'departamento': 'Departamento',
                                      'casa': 'Casa',
                                      'bodega': 'Bodega',
                                      'terreno': 'Terreno',
                                      'otro': 'Otro'
                                    };
                                    return (
                                      <div>
                                        <p className="font-medium">Garantía Hipotecaria</p>
                                        {detalles.tipoInmueble && <p>Tipo: {inmuebleMap[detalles.tipoInmueble] || detalles.tipoInmueble}</p>}
                                        {detalles.valorInmueble && (
                                          <p>Valor: ${parseFloat(detalles.valorInmueble || '0').toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN</p>
                                        )}
                                        {detalles.ubicacion && <p>Ubicación: {detalles.ubicacion}</p>}
                                        {detalles.situacionLegal && <p>Situación Legal: {detalles.situacionLegal}</p>}
                                      </div>
                                    );
                                  } else if (detalles.descripcion) {
                                    return (
                                      <div>
                                        <p className="font-medium">Otros Activos</p>
                                        <p>{detalles.descripcion}</p>
                                      </div>
                                    );
                                  }
                                  return <p className="text-xs">{JSON.stringify(detalles, null, 2)}</p>;
                                })()}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </div>
                      <div className="border-b pb-4">
                        <h3 className="text-sm font-semibold mb-4">Documentación y Cumplimiento</h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-neutral">Atrasos en Deudas Buró</Label>
                            <p className="text-sm">{client.atrasosDeudasBuroSinSat || 'No especificado'}</p>
                          </div>
                          {client.atrasosDeudasBuroDetallesSinSat && (
                            <div className="space-y-2 col-span-2">
                              <Label className="text-sm font-semibold text-neutral">Detalles de Atrasos en Buró</Label>
                              <p className="text-sm bg-gray-50 p-3 rounded border whitespace-pre-wrap">{client.atrasosDeudasBuroDetallesSinSat}</p>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="border-b pb-4">
                        <h3 className="text-sm font-semibold mb-4">Notas y Observaciones</h3>
                        <div className="space-y-3">
                          {client.notes && (
                            <div className="space-y-2">
                              <Label className="text-sm font-semibold text-neutral">Notas</Label>
                              <p className="text-sm bg-gray-50 p-3 rounded border whitespace-pre-wrap">{client.notes}</p>
                            </div>
                          )}
                          {client.observacionesAdicionalesSinSat && (
                            <div className="space-y-2">
                              <Label className="text-sm font-semibold text-neutral">Observaciones Adicionales</Label>
                              <p className="text-sm bg-gray-50 p-3 rounded border whitespace-pre-wrap">{client.observacionesAdicionalesSinSat}</p>
                            </div>
                          )}
                          {!client.notes && !client.observacionesAdicionalesSinSat && (
                            <p className="text-sm text-neutral">No hay notas u observaciones registradas</p>
                          )}
                        </div>
                      </div>
                    </>
                  )}

                  {/* Default fallback if no type matches */}
                  {!['persona_moral', 'fisica_empresarial', 'fisica', 'sin_sat'].includes(client.type) && (
                    <div className="p-4 bg-yellow-50 border border-yellow-200 rounded">
                      <p className="text-sm text-yellow-800">
                        Tipo de cliente no reconocido: <strong>{client.type}</strong>
                      </p>
                      <p className="text-xs text-yellow-600 mt-2">
                        Por favor contacta al administrador para resolver este problema.
                      </p>
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>

            {/* Modal Historial Crediticio */}
            <Dialog open={showHistoryModal} onOpenChange={setShowHistoryModal}>
              <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center">
                    <History className="h-5 w-5 mr-2" />
                    Historial Crediticio Completo
                  </DialogTitle>
                </DialogHeader>
                <div className="mt-4">
                  <Tabs defaultValue="gestion" className="w-full">
                    <TabsList className="grid w-full grid-cols-3">
                      <TabsTrigger value="gestion">
                        En Gestión
                      </TabsTrigger>
                      <TabsTrigger value="vigentes">
                        Créditos Vigentes
                      </TabsTrigger>
                      <TabsTrigger value="pasados">
                        Créditos Pasados
                      </TabsTrigger>
                    </TabsList>

                    {/* Tab Créditos Vigentes */}
                    <TabsContent value="vigentes" className="mt-4">
                      <div className="flex justify-end mb-3">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setShowHistoryModal(false);
                            setShowVigentesForm(true);
                          }}
                          data-testid="button-add-vigente-modal"
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Agregar
                        </Button>
                      </div>
                      
                      {(() => {
                        const vigentes = (client?.creditosVigentesDetalles as any[]) || [];
                        return vigentes.length === 0 ? (
                          <div className="text-center py-8">
                            <CreditCard className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                            <p className="text-sm text-neutral mb-2">No hay créditos vigentes</p>
                            <p className="text-xs text-neutral">
                              Los créditos vigentes se registran en el perfil del cliente
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {vigentes.map((credito: any, index: number) => (
                              <div key={index} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                                <div className="flex items-start justify-between mb-3">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-2">
                                      <p className="text-base font-semibold text-gray-900">
                                        ${parseFloat(credito.saldo || credito.monto || '0').toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN
                                      </p>
                                      {credito.tipo && (
                                        <Badge variant="outline">
                                          {credito.tipo}
                                        </Badge>
                                      )}
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 mt-2">
                                      {credito.institucion && (
                                        <div>
                                          <Label className="text-xs text-neutral">Financiera</Label>
                                          <p className="text-sm">{credito.institucion}</p>
                                        </div>
                                      )}
                                      {credito.saldoOriginal && (
                                        <div>
                                          <Label className="text-xs text-neutral">Saldo Original</Label>
                                          <p className="text-sm">${parseFloat(credito.saldoOriginal || '0').toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN</p>
                                        </div>
                                      )}
                                      {credito.fechaInicio && (
                                        <div>
                                          <Label className="text-xs text-neutral">Fecha Inicio</Label>
                                          <p className="text-sm">{credito.fechaInicio}</p>
                                        </div>
                                      )}
                                      {credito.fechaTermino && (
                                        <div>
                                          <Label className="text-xs text-neutral">Fecha Término</Label>
                                          <p className="text-sm">{credito.fechaTermino}</p>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  <Badge variant="default" className="bg-green-100 text-green-800">
                                    Vigente
                                  </Badge>
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </TabsContent>

                    {/* Tab Créditos Pasados */}
                    <TabsContent value="pasados" className="mt-4">
                      <div className="flex justify-end mb-3">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setShowHistoryModal(false);
                            setShowHistoryForm(true);
                          }}
                          data-testid="button-add-credit-history-modal"
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Agregar
                        </Button>
                      </div>
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
                            onClick={() => {
                              setShowHistoryModal(false);
                              setShowHistoryForm(true);
                            }}
                          >
                            <Plus className="h-4 w-4 mr-1" />
                            Agregar Historial
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {creditHistories.map((history) => (
                            <div key={history.id} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                              <div className="flex items-start justify-between mb-3">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-2">
                                    <p className="text-base font-semibold text-gray-900">
                                      ${parseFloat(history.amountGranted || '0').toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN
                                    </p>
                                    <Badge variant="outline">
                                      {history.creditType}
                                    </Badge>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2 mt-2">
                                    <div>
                                      <Label className="text-xs text-neutral">Plazo</Label>
                                      <p className="text-sm">{history.termMonths} meses</p>
                                    </div>
                                    <div>
                                      <Label className="text-xs text-neutral">Tasa de Interés</Label>
                                      <p className="text-sm">{history.interestRate}%</p>
                                    </div>
                                    {history.financialInstitution && (
                                      <div>
                                        <Label className="text-xs text-neutral">Financiera</Label>
                                        <p className="text-sm">{history.financialInstitution}</p>
                                      </div>
                                    )}
                                    <div>
                                      <Label className="text-xs text-neutral">Registrado</Label>
                                      <p className="text-sm">
                                        {formatDistanceToNow(new Date(history.createdAt!), { 
                                          addSuffix: true, 
                                          locale: es 
                                        })}
                                      </p>
                                    </div>
                                  </div>
                                  {history.notes && (
                                    <div className="mt-2">
                                      <Label className="text-xs text-neutral">Notas</Label>
                                      <p className="text-sm italic text-gray-600">{history.notes}</p>
                                    </div>
                                  )}
                                </div>
                                <Badge 
                                  variant="secondary"
                                  className={history.source === 'manual' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}
                                >
                                  {history.source === 'manual' ? 'Manual' : 'Sistema'}
                                </Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </TabsContent>

                    {/* Tab En Gestión */}
                    <TabsContent value="gestion" className="mt-4">
                      {!submissions || submissions.length === 0 ? (
                        <div className="text-center py-8">
                          <FileText className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                          <p className="text-sm text-neutral mb-2">No hay créditos en gestión</p>
                          <p className="text-xs text-neutral">
                            Los créditos en gestión aparecerán aquí cuando se registren en el sistema
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {submissions.map((submission) => {
                            const approvedCount = submission.targets?.filter((t: any) => t.institutionProposal).length || 0;
                            const totalTargets = submission.targets?.length || 0;
                            
                            return (
                              <div key={submission.id} className="p-4 bg-gray-50 rounded-lg border border-gray-200" data-testid={`submission-${submission.id}`}>
                                <div className="flex items-start justify-between mb-3">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-2">
                                      <p className="text-base font-semibold text-gray-900">
                                        ${submission.requestedAmount ? Number(submission.requestedAmount).toLocaleString('es-MX') : '0'} MXN
                                      </p>
                                      <Badge 
                                        variant="outline" 
                                        className={
                                          submission.status === 'dispersed' ? 'bg-blue-100 text-blue-800' :
                                          submission.status === 'returned_to_broker' ? 'bg-orange-100 text-orange-800' :
                                          approvedCount > 0 ? 'bg-green-100 text-green-800' :
                                          submission.status === 'sent_to_institutions' ? 'bg-yellow-100 text-yellow-800' :
                                          'bg-gray-100 text-gray-800'
                                        }
                                      >
                                        {submission.status === 'draft' ? 'Borrador' :
                                         submission.status === 'submitted' ? 'Enviado' :
                                         submission.status === 'returned_to_broker' ? 'Devuelto' :
                                         submission.status === 'sent_to_institutions' ? `En Revisión (${totalTargets})` :
                                         submission.status === 'dispersed' ? 'Dispersado' :
                                         submission.status}
                                      </Badge>
                                      {approvedCount > 0 && (
                                        <Badge className="bg-green-600">
                                          {approvedCount} propuesta{approvedCount !== 1 ? 's' : ''}
                                        </Badge>
                                      )}
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 mt-2">
                                      <div>
                                        <Label className="text-xs text-neutral">Producto</Label>
                                        <p className="text-sm">{submission.productTemplate?.name || 'N/A'}</p>
                                      </div>
                                      <div>
                                        <Label className="text-xs text-neutral">Enviado</Label>
                                        <p className="text-sm">
                                          {formatDistanceToNow(new Date(submission.createdAt), { 
                                            addSuffix: true, 
                                            locale: es 
                                          })}
                                        </p>
                                      </div>
                                    </div>
                                    
                                    {/* Sección de Financieras Seleccionadas */}
                                    {submission.targets && submission.targets.length > 0 && (
                                      <div className="mt-3 space-y-2">
                                        <Label className="text-xs font-semibold text-gray-700">
                                          Financieras Seleccionadas ({submission.targets.length})
                                        </Label>
                                        <div className="space-y-2">
                                          {submission.targets.map((target: any) => (
                                            <div key={target.id} className="p-2 bg-white border border-gray-200 rounded">
                                              <div className="flex items-start justify-between">
                                                <div className="flex-1">
                                                  <p className="text-sm font-medium text-gray-900">
                                                    {target.institution?.name || 'Cargando...'}
                                                  </p>
                                                  <p className="text-xs text-gray-600">
                                                    {target.institutionProduct?.customName || submission.productTemplate?.name || 'Producto no asignado'}
                                                  </p>
                                                </div>
                                                <div className="flex flex-col items-end space-y-1">
                                                  <Badge className={targetStatusConfig[target.status as keyof typeof targetStatusConfig]?.color || 'bg-gray-100'}>
                                                    {targetStatusConfig[target.status as keyof typeof targetStatusConfig]?.label || target.status}
                                                  </Badge>
                                                </div>
                                              </div>
                                              
                                              {/* Notas del admin cuando está devuelto */}
                                              {target.status === 'returned_to_broker' && target.adminNotes && (
                                                <div className="mt-1.5 p-2 bg-orange-50 border border-orange-300 rounded flex items-start space-x-2">
                                                  <AlertCircle className="w-4 h-4 text-orange-600 mt-0.5 flex-shrink-0" />
                                                  <div>
                                                    <p className="text-xs font-semibold text-orange-900">Devuelto:</p>
                                                    <p className="text-xs text-orange-800">{target.adminNotes}</p>
                                                  </div>
                                                </div>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </TabsContent>
                  </Tabs>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </main>
      </div>

      {/* Credit Request Modal */}
      <CreditRequestModal
        isOpen={showCreditRequestModal}
        onClose={() => setShowCreditRequestModal(false)}
        preselectedClientId={clientId}
      />

      {/* Document Upload Modal */}
      <Dialog open={showDocumentUploadModal} onOpenChange={setShowDocumentUploadModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Subir Documento del Cliente</DialogTitle>
            <DialogDescription>
              Sube documentos para {client?.businessName || `${client?.firstName} ${client?.lastName}`}
            </DialogDescription>
          </DialogHeader>
          <DocumentUpload
            preselectedClientId={clientId}
            onSuccess={() => {
              queryClient.invalidateQueries({ queryKey: [`/api/documents/client/${clientId}`] });
              setShowDocumentUploadModal(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function VigenteForm({ 
  clientId,
  onCancel,
  onSuccess 
}: { 
  clientId: string;
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const { data: client } = useQuery<Client>({
    queryKey: ["/api/clients", clientId],
    enabled: !!clientId,
  });

  const form = useForm<VigenteFormData>({
    resolver: zodResolver(vigenteFormSchema),
    defaultValues: {
      tipo: "",
      saldoOriginal: "",
      saldo: "",
      institucion: "",
      fechaInicio: "",
      fechaTermino: "",
    },
  });

  const updateVigentesMutation = useMutation({
    mutationFn: async (data: VigenteFormData) => {
      const currentVigentes = (client?.creditosVigentesDetalles as any[]) || [];
      const updatedVigentes = [...currentVigentes, data];
      
      return await apiRequest(
        "PUT",
        `/api/clients/${clientId}`,
        { 
          creditosVigentesDetalles: updatedVigentes 
        }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients", clientId] });
      toast({
        title: "Crédito vigente agregado",
        description: "El crédito vigente se agregó correctamente",
      });
      form.reset();
      onSuccess();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo agregar el crédito vigente",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: VigenteFormData) => {
    updateVigentesMutation.mutate(data);
  };

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-900">Agregar Crédito Vigente</h3>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          data-testid="button-close-vigente-form"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="tipo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de Crédito *</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="ej: Crédito Simple, PYME" 
                      {...field} 
                      data-testid="input-vigente-tipo"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="institucion"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Institución *</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="ej: BCM, Konfio, Pretmex" 
                      {...field} 
                      data-testid="input-vigente-institucion"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="saldoOriginal"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Saldo Original * (MXN)</FormLabel>
                  <FormControl>
                    <Input 
                      type="number"
                      placeholder="100000" 
                      {...field} 
                      data-testid="input-vigente-saldo-original"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="saldo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Saldo Actual * (MXN)</FormLabel>
                  <FormControl>
                    <Input 
                      type="number"
                      placeholder="75000" 
                      {...field} 
                      data-testid="input-vigente-saldo"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="fechaInicio"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fecha Inicio</FormLabel>
                  <FormControl>
                    <Input 
                      type="date"
                      {...field} 
                      data-testid="input-vigente-fecha-inicio"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="fechaTermino"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fecha Término</FormLabel>
                  <FormControl>
                    <Input 
                      type="date"
                      {...field} 
                      data-testid="input-vigente-fecha-termino"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="flex justify-end space-x-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              data-testid="button-cancel-vigente"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={updateVigentesMutation.isPending}
              data-testid="button-save-vigente"
            >
              {updateVigentesMutation.isPending ? "Guardando..." : "Guardar"}
            </Button>
          </div>
        </form>
      </Form>
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
