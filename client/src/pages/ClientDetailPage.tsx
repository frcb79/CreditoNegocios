import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import MainLayout from "@/components/MainLayout";
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
  DialogDescription,
  DialogFooter
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
  AlertCircle,
  Download,
  ExternalLink,
  Trash2,
  Loader2
} from "lucide-react";
import { buildApiUrl } from "@/lib/runtimeConfig";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import CreditRequestModal from "@/components/Modals/CreditRequestModal";
import NewOpportunityTypeModal from "@/components/Modals/NewOpportunityTypeModal";
import MortgageLeadModal from "@/components/Modals/MortgageLeadModal";
import DocumentUpload from "@/components/Documents/DocumentUpload";
import { targetStatusConfig, getSubmissionStatusSummary } from "@/lib/statusConfig";
import { cn } from "@/lib/utils";

const vigenteFormSchema = z.object({
  tipo: z.string().min(1, "El tipo de crédito es requerido"),
  saldoOriginal: z.string().min(1, "El saldo original es requerido"),
  saldo: z.string().min(1, "El saldo actual es requerido"),
  institucion: z.string().min(1, "La institución es requerida"),
  fechaInicio: z.string().optional(),
  fechaTermino: z.string().optional(),
});

type VigenteFormData = z.infer<typeof vigenteFormSchema>;

export const formatDisplayValue = (val: any): string => {
  if (val === null || val === undefined || val === '') return 'No especificado';
  if (typeof val !== 'string') return String(val);
  
  const customMap: Record<string, string> = {
    'persona_moral': 'Persona Moral',
    'fisica_empresarial': 'Persona Física con Actividad Empresarial',
    'fisica': 'Persona Física',
    'sin_sat': 'Sin SAT',
    'moral': 'Moral',
    'si': 'Sí',
    'no': 'No',
    'casado': 'Casado(a)',
    'soltero': 'Soltero(a)',
    'union-libre': 'Unión libre',
    'divorciado': 'Divorciado(a)',
    'viudo': 'Viudo(a)',
    'excelente': 'Excelente',
    'bueno': 'Bueno',
    'regular': 'Regular',
    'malo': 'Malo',
    'sin-historial': 'Sin historial',
    '1-2-anos': '1 a 2 años',
    '2-5-anos': '2 a 5 años',
    '5-10-anos': '5 a 10 años',
    'mas-10-anos': 'Más de 10 años',
    'menos-1-anio': 'Menos de 1 año',
    '1-3-anios': '1 a 3 años',
    '3-5-anios': '3 a 5 años',
    'mas-5-anios': 'Más de 5 años',
    'sin-experiencia': 'Sin experiencia',
    'capital_trabajo': 'Capital de trabajo',
    'expansion': 'Expansión de negocio',
    'equipamiento': 'Adquisición de activo fijo / maquinaria',
    'construccion': 'Construcción',
    'pyme': 'PYME',
    'simple': 'Crédito Simple',
    'revolvente': 'Crédito Revolvente',
    'hipotecario': 'Crédito Hipotecario',
    'automotriz': 'Crédito Automotriz',
    'arrendamiento': 'Arrendamiento',
    'factoraje': 'Factoraje',
    'tarjeta_credito': 'Tarjeta de Crédito',
    'negativa': 'Negativa',
    'positiva': 'Positiva',
    'sin_opinion': 'Sin opinión',
  };

  const lowerVal = val.toLowerCase().trim();
  if (customMap[lowerVal]) {
    return customMap[lowerVal];
  }

  let formatted = val
    .replace(/[-_]/g, ' ')
    .replace(/\banos\b/g, 'años')
    .replace(/\banio\b/g, 'año')
    .replace(/\banios\b/g, 'años');

  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
};

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
  const [showOpportunityTypeModal, setShowOpportunityTypeModal] = useState(false);
  const [showMortgageLeadModal, setShowMortgageLeadModal] = useState(false);
  const [showDocumentUploadModal, setShowDocumentUploadModal] = useState(false);
  const [previewDocument, setPreviewDocument] = useState<Document | null>(null);
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

  const deleteVigenteMutation = useMutation({
    mutationFn: async (creditIndex: number) => {
      const currentVigentes = (client?.creditosVigentesDetalles as any[]) || [];
      const updatedVigentes = currentVigentes.filter((_, idx) => idx !== creditIndex);
      return await apiRequest(
        "PUT",
        `/api/clients/${clientId}`,
        { creditosVigentesDetalles: updatedVigentes }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients", clientId] });
      toast({
        title: "Crédito eliminado",
        description: "El crédito vigente ha sido eliminado correctamente",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo eliminar el crédito vigente",
        variant: "destructive",
      });
    },
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
      <MainLayout>
        <Header 
          title="Cliente no encontrado"
          subtitle="El cliente especificado no existe o la ruta es inválida"
        />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          <div className="max-w-xl mx-auto bg-white border border-slate-200/80 rounded-xl p-8 text-center shadow-xs">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400">
              <User className="h-6 w-6" />
            </div>
            <h3 className="text-base font-semibold text-slate-900 mb-1">Cliente no encontrado</h3>
            <p className="text-xs text-slate-500 mb-5">El identificador de cliente no corresponde a ningún registro activo.</p>
            <Button onClick={handleGoBack} variant="outline" className="text-xs h-8 border-slate-200">
              <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
              Volver a Clientes
            </Button>
          </div>
        </main>
      </MainLayout>
    );
  }

  if (isLoading) {
    return (
      <MainLayout>
        <Header 
          title="Cargando..."
          subtitle="Obteniendo información del cliente"
        />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          <div className="space-y-6">
            <div className="bg-white border border-slate-200/80 rounded-xl p-6 shadow-xs flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <Skeleton className="h-14 w-14 rounded-xl" />
                <div className="space-y-2">
                  <Skeleton className="h-6 w-56" />
                  <Skeleton className="h-4 w-32" />
                </div>
              </div>
              <Skeleton className="h-8 w-24" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Skeleton className="h-64 rounded-xl" />
              <Skeleton className="h-64 rounded-xl" />
              <Skeleton className="h-64 rounded-xl" />
              <Skeleton className="h-64 rounded-xl" />
            </div>
          </div>
        </main>
      </MainLayout>
    );
  }

  if (!client) {
    return (
      <MainLayout>
        <Header 
          title="Cliente no encontrado"
          subtitle="El cliente especificado no existe o fue dado de baja"
        />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          <div className="max-w-xl mx-auto bg-white border border-slate-200/80 rounded-xl p-8 text-center shadow-xs">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400">
              <User className="h-6 w-6" />
            </div>
            <h3 className="text-base font-semibold text-slate-900 mb-1">Cliente no encontrado</h3>
            <p className="text-xs text-slate-500 mb-5">El cliente no existe o no se tienen permisos para visualizarlo.</p>
            <Button onClick={handleGoBack} variant="outline" className="text-xs h-8 border-slate-200">
              <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
              Volver a Clientes
            </Button>
          </div>
        </main>
      </MainLayout>
    );
  }

  const clientName = client.type === 'persona_moral' ? client.businessName : `${client.firstName} ${client.lastName}`;
  const initials = client.type === 'persona_moral' 
    ? client.businessName?.slice(0, 2).toUpperCase()
    : `${client.firstName?.[0]}${client.lastName?.[0]}`;

  const getClientTypeBadge = (type: string) => {
    switch (type) {
      case 'persona_moral':
        return {
          label: 'PM',
          title: 'Persona Moral',
          badgeClass: 'bg-blue-50 text-blue-700 border-blue-200/80',
          dotClass: 'bg-blue-500'
        };
      case 'fisica_empresarial':
        return {
          label: 'PFAE',
          title: 'Persona Física con Actividad Empresarial',
          badgeClass: 'bg-purple-50 text-purple-700 border-purple-200/80',
          dotClass: 'bg-purple-500'
        };
      case 'fisica':
        return {
          label: 'PF',
          title: 'Persona Física',
          badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
          dotClass: 'bg-emerald-500'
        };
      default:
        return {
          label: 'Sin SAT',
          title: 'Sin registro SAT',
          badgeClass: 'bg-slate-50 text-slate-700 border-slate-200/80',
          dotClass: 'bg-slate-400'
        };
    }
  };

  const typeBadgeInfo = getClientTypeBadge(client.type);

  return (
    <MainLayout>
      <Header 
        title={clientName || "Cliente"}
        subtitle={`Expediente comercial • RFC: ${client.rfc || 'No registrado'}`}
      >
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleGoBack}
            className="h-8 text-xs font-medium text-slate-600 border-slate-200 hover:bg-slate-50"
            data-testid="button-back-to-clients"
          >
            <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
            Volver
          </Button>
          <Button 
            onClick={() => handleEditClient(client)}
            variant="outline"
            size="sm"
            className="h-8 text-xs font-medium border-slate-200 hover:bg-slate-50"
            data-testid="button-edit-client"
          >
            <FileText className="h-3.5 w-3.5 mr-1.5 text-slate-500" />
            Editar
          </Button>
          <Button 
            size="sm"
            className="h-8 text-xs font-medium bg-primary hover:bg-primary-dark text-white shadow-xs"
            onClick={() => setShowOpportunityTypeModal(true)}
            data-testid="button-new-credit"
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Nueva Oportunidad
          </Button>
        </div>
      </Header>
        
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Institutional Profile Header Card */}
        <div className="bg-white border border-slate-200/80 rounded-xl p-5 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center space-x-4">
              <div className="w-13 h-13 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 font-bold text-lg shadow-xs flex-shrink-0">
                <span data-testid="client-initials">{initials}</span>
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <h2 className="text-xl font-bold text-slate-900 truncate" data-testid="client-name">
                    {clientName}
                  </h2>
                  <span
                    className={cn(
                      "inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border gap-1.5",
                      typeBadgeInfo.badgeClass
                    )}
                    title={typeBadgeInfo.title}
                    data-testid="client-type-badge"
                  >
                    <span className={cn("w-1.5 h-1.5 rounded-full", typeBadgeInfo.dotClass)} />
                    {typeBadgeInfo.label}
                  </span>

                  {client.originOpportunity === 'hipotecario_vivienda' && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200/80 gap-1" data-testid="client-origin-badge">
                      <span className="text-[11px]">🏠</span> Hipotecario Vivienda
                    </span>
                  )}
                  {client.originOpportunity === 'credito_empresarial' && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-blue-50 text-blue-800 border border-blue-200/80 gap-1" data-testid="client-origin-badge">
                      <span className="text-[11px]">🏢</span> Crédito Empresarial
                    </span>
                  )}
                  <span 
                    className={cn(
                      "inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border gap-1",
                      client.isActive 
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200/80" 
                        : "bg-slate-50 text-slate-600 border-slate-200/80"
                    )}
                    data-testid="client-status"
                  >
                    <span className={cn("w-1.5 h-1.5 rounded-full", client.isActive ? "bg-emerald-500" : "bg-slate-400")} />
                    {client.isActive ? "Activo" : "Inactivo"}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                  <span className="font-mono text-slate-700" data-testid="client-rfc">
                    RFC: {client.rfc}
                  </span>
                  {client.phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="w-3 h-3 text-slate-400" />
                      {client.phone}
                    </span>
                  )}
                  {client.email && (
                    <span className="flex items-center gap-1 truncate max-w-[250px]">
                      <Mail className="w-3 h-3 text-slate-400" />
                      {client.email}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Quick action: Generar cotización (mantener compatibilidad) */}
            <div className="flex items-center gap-2 self-end sm:self-center">
              <Button 
                variant="outline"
                size="sm"
                onClick={() => {
                  toast({
                    title: "Próximamente",
                    description: "Esta funcionalidad estará disponible pronto.",
                  });
                }}
                className="h-8 text-xs font-medium text-slate-600 border-slate-200 hover:bg-slate-50"
                data-testid="button-generate-quote"
              >
                <DollarSign className="h-3.5 w-3.5 mr-1 text-slate-400" />
                Cotización
              </Button>
            </div>
          </div>
        </div>

        {/* Dashboard Cards Grid */}
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* 1. Información General */}
            <Card className="border border-slate-200/80 shadow-xs bg-white rounded-xl">
              <CardHeader className="p-4 sm:p-5 pb-3 border-b border-slate-100 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                  {client.type === 'persona_moral' ? <Building2 className="h-4 w-4 text-primary" /> : <User className="h-4 w-4 text-primary" />}
                  <span>Información General</span>
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowInfoModal(true)}
                  data-testid="button-view-more-info"
                  className="h-7 px-2.5 text-xs font-medium text-primary hover:text-primary-dark hover:bg-primary/5"
                >
                  <Eye className="h-3.5 w-3.5 mr-1" />
                  Ver más
                </Button>
              </CardHeader>
              <CardContent className="p-4 sm:p-5 pt-3 space-y-2.5">
                {client.type === 'persona_moral' ? (
                  <>
                    <div className="flex items-start justify-between py-1.5 border-b border-slate-100/80 text-xs">
                      <span className="text-slate-500 font-medium">Razón Social</span>
                      <span className="font-semibold text-slate-800 text-right">{client.businessName}</span>
                    </div>
                    <div className="flex items-start justify-between py-1.5 border-b border-slate-100/80 text-xs">
                      <span className="text-slate-500 font-medium">Industria</span>
                      <span className="font-medium text-slate-800 text-right">{client.industry || 'No especificada'}</span>
                    </div>
                    <div className="flex items-start justify-between py-1.5 border-b border-slate-100/80 text-xs">
                      <span className="text-slate-500 font-medium">Años en operación</span>
                      <span className="font-medium text-slate-800">{client.yearsInBusiness || 0} años</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-start justify-between py-1.5 border-b border-slate-100/80 text-xs">
                      <span className="text-slate-500 font-medium">Nombre completo</span>
                      <span className="font-semibold text-slate-800 text-right">{client.firstName} {client.lastName}</span>
                    </div>
                    <div className="flex items-start justify-between py-1.5 border-b border-slate-100/80 text-xs">
                      <span className="text-slate-500 font-medium">CURP</span>
                      <span className="font-mono text-slate-800">{client.curp || 'No proporcionada'}</span>
                    </div>
                    {(client.type === 'fisica_empresarial' || client.type === 'fisica' || client.type === 'sin_sat') && (
                      <div className="flex items-start justify-between py-1.5 border-b border-slate-100/80 text-xs">
                        <span className="text-slate-500 font-medium">Estado Civil</span>
                        <span className="font-medium text-slate-800 text-right">{client.estadoCivil || 'No especificado'}</span>
                      </div>
                    )}
                  </>
                )}
                <div className="flex items-start justify-between py-1.5 border-b border-slate-100/80 text-xs">
                  <span className="text-slate-500 font-medium">RFC</span>
                  <span className="font-mono font-medium text-slate-800">{client.rfc}</span>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-slate-100/80 text-xs">
                  <span className="text-slate-500 font-medium flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5 text-slate-400" />
                    Teléfono
                  </span>
                  <span className="font-medium text-slate-800">{client.phone || 'No proporcionado'}</span>
                </div>
                <div className="flex items-center justify-between py-1.5 text-xs">
                  <span className="text-slate-500 font-medium flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5 text-slate-400" />
                    Email
                  </span>
                  <span className="font-medium text-slate-800 text-right break-all">{client.email || 'No proporcionado'}</span>
                </div>
              </CardContent>
            </Card>

            {/* 2. Perfil Financiero */}
            <Card className="border border-slate-200/80 shadow-xs bg-white rounded-xl">
              <CardHeader className="p-4 sm:p-5 pb-3 border-b border-slate-100 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-emerald-600" />
                  <span>Perfil Financiero</span>
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowFinancialModal(true)}
                  data-testid="button-view-more-financial"
                  className="h-7 px-2.5 text-xs font-medium text-primary hover:text-primary-dark hover:bg-primary/5"
                >
                  <Eye className="h-3.5 w-3.5 mr-1" />
                  Ver más
                </Button>
              </CardHeader>
              <CardContent className="p-4 sm:p-5 pt-3 space-y-2.5">
                {client.type === 'persona_moral' && (
                  <>
                    <div className="flex items-start justify-between py-1.5 border-b border-slate-100/80 text-xs">
                      <span className="text-slate-500 font-medium">Ingresos anuales</span>
                      <span className="font-semibold text-slate-900">
                        {client.ingresoAnual ? `$${parseFloat(client.ingresoAnual || '0').toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN` : 'No especificado'}
                      </span>
                    </div>
                    <div className="flex items-start justify-between py-1.5 border-b border-slate-100/80 text-xs">
                      <span className="text-slate-500 font-medium">Egresos mensuales</span>
                      <span className="font-medium text-slate-800">
                        {client.egresoMensualPromedio ? `$${parseFloat(client.egresoMensualPromedio || '0').toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN` : 'No especificado'}
                      </span>
                    </div>
                    <div className="flex items-start justify-between py-1.5 border-b border-slate-100/80 text-xs">
                      <span className="text-slate-500 font-medium">Ventas gobierno</span>
                      <span className="font-medium text-slate-800 text-right">{formatDisplayValue(client.participacionVentasGobierno)}</span>
                    </div>
                    <div className="flex items-start justify-between py-1.5 border-b border-slate-100/80 text-xs">
                      <span className="text-slate-500 font-medium">Buró accionista principal</span>
                      <span className="font-medium text-slate-800 text-right">{formatDisplayValue(client.buroAccionistaPrincipal)}</span>
                    </div>
                    <div className="flex items-start justify-between py-1.5 border-b border-slate-100/80 text-xs">
                      <span className="text-slate-500 font-medium">Buró empresa</span>
                      <span className="font-medium text-slate-800 text-right">{formatDisplayValue(client.buroEmpresa)}</span>
                    </div>
                    <div className="flex items-start justify-between py-1.5 text-xs">
                      <span className="text-slate-500 font-medium">Sector económico</span>
                      <span className="font-medium text-slate-800 text-right">{formatDisplayValue(client.sectoreEconomico)}</span>
                    </div>
                  </>
                )}
                {(client.type === 'fisica_empresarial' || client.type === 'fisica') && (
                  <>
                    <div className="flex items-start justify-between py-1.5 border-b border-slate-100/80 text-xs">
                      <span className="text-slate-500 font-medium">Puesto</span>
                      <span className="font-medium text-slate-800 text-right">{formatDisplayValue(client.puesto)}</span>
                    </div>
                    <div className="flex items-start justify-between py-1.5 border-b border-slate-100/80 text-xs">
                      <span className="text-slate-500 font-medium">Antigüedad laboral</span>
                      <span className="font-medium text-slate-800 text-right">{formatDisplayValue(client.antiguedadLaboral)}</span>
                    </div>
                    <div className="flex items-start justify-between py-1.5 border-b border-slate-100/80 text-xs">
                      <span className="text-slate-500 font-medium">Ingresos comprobables</span>
                      <span className="font-semibold text-slate-900">
                        {client.ingresoMensualPromedioComprobables ? `$${parseFloat(client.ingresoMensualPromedioComprobables || '0').toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN` : 'No especificado'}
                      </span>
                    </div>
                    <div className="flex items-start justify-between py-1.5 border-b border-slate-100/80 text-xs">
                      <span className="text-slate-500 font-medium">Ingresos no comprobables</span>
                      <span className="font-medium text-slate-800">
                        {client.ingresoMensualPromedioNoComprobables ? `$${parseFloat(client.ingresoMensualPromedioNoComprobables || '0').toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN` : 'No especificado'}
                      </span>
                    </div>
                    <div className="flex items-start justify-between py-1.5 border-b border-slate-100/80 text-xs">
                      <span className="text-slate-500 font-medium">Gastos fijos mensuales</span>
                      <span className="font-medium text-slate-800">
                        {client.gastosFijosMensualesPromedio ? `$${parseFloat(client.gastosFijosMensualesPromedio || '0').toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN` : 'No especificado'}
                      </span>
                    </div>
                    <div className="flex items-start justify-between py-1.5 text-xs">
                      <span className="text-slate-500 font-medium">Buró persona física</span>
                      <span className="font-medium text-slate-800 text-right">{formatDisplayValue(client.buroPersonaFisica)}</span>
                    </div>
                  </>
                )}
                {client.type === 'sin_sat' && (
                  <>
                    <div className="flex items-start justify-between py-1.5 border-b border-slate-100/80 text-xs">
                      <span className="text-slate-500 font-medium">Nombre comercial</span>
                      <span className="font-medium text-slate-800 text-right">{formatDisplayValue(client.nombreComercial)}</span>
                    </div>
                    <div className="flex items-start justify-between py-1.5 border-b border-slate-100/80 text-xs">
                      <span className="text-slate-500 font-medium">Ocupación</span>
                      <span className="font-medium text-slate-800 text-right">{formatDisplayValue(client.ocupacion)}</span>
                    </div>
                    <div className="flex items-start justify-between py-1.5 border-b border-slate-100/80 text-xs">
                      <span className="text-slate-500 font-medium">Ingresos comprobables</span>
                      <span className="font-semibold text-slate-900">
                        {client.ingresoMensualPromedioComprobablesSinSat ? `$${parseFloat(client.ingresoMensualPromedioComprobablesSinSat || '0').toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN` : 'No especificado'}
                      </span>
                    </div>
                    <div className="flex items-start justify-between py-1.5 border-b border-slate-100/80 text-xs">
                      <span className="text-slate-500 font-medium">Ingresos no comprobables</span>
                      <span className="font-medium text-slate-800">
                        {client.ingresoMensualPromedioNoComprobablesSinSat ? `$${parseFloat(client.ingresoMensualPromedioNoComprobablesSinSat || '0').toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN` : 'No especificado'}
                      </span>
                    </div>
                    <div className="flex items-start justify-between py-1.5 border-b border-slate-100/80 text-xs">
                      <span className="text-slate-500 font-medium">Gastos fijos mensuales</span>
                      <span className="font-medium text-slate-800">
                        {client.gastosFijosMensualesPromedioSinSat ? `$${parseFloat(client.gastosFijosMensualesPromedioSinSat || '0').toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN` : 'No especificado'}
                      </span>
                    </div>
                    <div className="flex items-start justify-between py-1.5 text-xs">
                      <span className="text-slate-500 font-medium">Buró persona física</span>
                      <span className="font-medium text-slate-800 text-right">{formatDisplayValue(client.buroPersonaFisicaSinSat)}</span>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* 3. Documentos Recientes */}
            <Card className="border border-slate-200/80 shadow-xs bg-white rounded-xl">
              <CardHeader className="p-4 sm:p-5 pb-3 border-b border-slate-100 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-blue-600" />
                  <span>Bóveda Documental</span>
                </CardTitle>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                    {documents?.length || 0}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowDocumentUploadModal(true)}
                    data-testid="button-upload-document"
                    className="h-7 px-2.5 text-xs font-medium text-slate-700 border-slate-200 hover:bg-slate-50"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1 text-slate-500" />
                    Subir
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-4 sm:p-5">
                {!documents || documents.length === 0 ? (
                  <div className="text-center py-7 border border-dashed border-slate-200 rounded-lg">
                    <FileText className="h-9 w-9 text-slate-300 mx-auto mb-2" />
                    <p className="text-xs font-medium text-slate-700 mb-1">Sin documentos registrados</p>
                    <p className="text-[11px] text-slate-400 mb-3">Sube los comprobantes fiscales o identificación</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowDocumentUploadModal(true)}
                      data-testid="button-upload-first-document"
                      className="h-7 text-xs border-slate-200"
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Subir primer documento
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {documents.slice(0, 5).map((doc) => (
                      <div key={doc.id} className="flex items-center justify-between p-2.5 bg-slate-50/80 border border-slate-100 rounded-lg gap-2 hover:bg-slate-50 transition-colors">
                        <div className="flex items-center space-x-2.5 flex-1 min-w-0">
                          <div className="w-7 h-7 rounded-md bg-blue-50 border border-blue-100 flex items-center justify-center flex-shrink-0 text-blue-600">
                            <FileText className="h-3.5 w-3.5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-slate-800 truncate" title={doc.fileName}>
                              {doc.fileName}
                            </p>
                            <p className="text-[11px] text-slate-500 capitalize truncate">{doc.type.replace('_', ' ')}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <span 
                            className={cn(
                              "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border gap-1",
                              doc.isValid 
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200/80" 
                                : "bg-amber-50 text-amber-700 border-amber-200/80"
                            )}
                          >
                            <span className={cn("w-1 h-1 rounded-full", doc.isValid ? "bg-emerald-500" : "bg-amber-500")} />
                            {doc.isValid ? "Válido" : "Pendiente"}
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 rounded-md"
                            onClick={() => {
                              setPreviewDocument(doc);
                            }}
                            title="Visualizar documento"
                            data-testid={`button-view-doc-${doc.id}`}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 rounded-md"
                            onClick={() => {
                              window.open(buildApiUrl(`/api/documents/${doc.id}/download`), '_blank', 'noopener,noreferrer');
                            }}
                            title="Descargar documento"
                            data-testid={`button-download-doc-${doc.id}`}
                          >
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    {documents && documents.length > 5 && (
                      <p className="text-[11px] text-center text-slate-500 pt-1 font-medium">
                        +{documents.length - 5} documentos adicionales en bóveda
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 4. Historial Crediticio con Tabs */}
            <Card className="border border-slate-200/80 shadow-xs bg-white rounded-xl">
              <CardHeader className="p-4 sm:p-5 pb-3 border-b border-slate-100 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                  <History className="h-4 w-4 text-purple-600" />
                  <span>Historial Crediticio</span>
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowHistoryModal(true)}
                  data-testid="button-view-more-history"
                  className="h-7 px-2.5 text-xs font-medium text-primary hover:text-primary-dark hover:bg-primary/5"
                >
                  <Eye className="h-3.5 w-3.5 mr-1" />
                  Ver más
                </Button>
              </CardHeader>
              <CardContent className="p-4 sm:p-5 pt-3">
                <Tabs defaultValue="gestion" className="w-full">
                  <TabsList className="grid w-full grid-cols-3 h-8 bg-slate-100/80 p-0.5 rounded-lg">
                    <TabsTrigger value="gestion" data-testid="tab-en-gestion" className="text-xs h-7 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-xs">
                      En Gestión ({submissions?.length || 0})
                    </TabsTrigger>
                    <TabsTrigger value="vigentes" data-testid="tab-creditos-vigentes" className="text-xs h-7 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-xs">
                      Vigentes ({(() => {
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        const allVigentes = (client?.creditosVigentesDetalles as any[]) || [];
                        return allVigentes.filter((credito: any) => {
                          if (!credito.fechaTermino) return true;
                          const endDate = new Date(credito.fechaTermino);
                          endDate.setHours(0, 0, 0, 0);
                          return endDate >= today;
                        }).length;
                      })()})
                    </TabsTrigger>
                    <TabsTrigger value="pasados" data-testid="tab-creditos-pasados" className="text-xs h-7 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-xs">
                      Pasados ({creditHistories?.length || 0})
                    </TabsTrigger>
                  </TabsList>

                  {/* Tab Créditos Vigentes */}
                  <TabsContent value="vigentes" className="mt-3">
                    <div className="flex justify-end mb-2.5">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setShowVigentesForm(true)}
                        data-testid="button-add-vigente"
                        className="h-7 text-xs font-medium text-slate-700 border-slate-200 hover:bg-slate-50"
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" />
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
                            <div className="text-center py-7 border border-dashed border-slate-200 rounded-lg">
                              <CreditCard className="h-9 w-9 text-slate-300 mx-auto mb-2" />
                              <p className="text-xs font-medium text-slate-700 mb-1">Sin créditos vigentes</p>
                              <p className="text-[11px] text-slate-400">
                                Los créditos vigentes se registran para análisis de capacidad de pago
                              </p>
                            </div>
                          ) : (
                            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                              {vigentes.map((credito: any, index: number) => (
                                <div key={index} className="p-2.5 bg-slate-50/80 border border-slate-100 rounded-lg" data-testid={`vigente-item-${index}`}>
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-1.5 mb-1">
                                        <p className="text-xs font-bold text-slate-900">
                                          ${parseFloat(credito.saldo || credito.monto || '0').toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN
                                        </p>
                                        {credito.tipo && (
                                          <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200/60">
                                            {credito.tipo}
                                          </span>
                                        )}
                                      </div>
                                      {credito.institucion && (
                                        <p className="text-[11px] text-slate-500 truncate">
                                          Financiera: <span className="text-slate-700 font-medium">{credito.institucion}</span>
                                        </p>
                                      )}
                                      {credito.saldoOriginal && (
                                        <p className="text-[11px] text-slate-500">
                                          Saldo Original: ${parseFloat(credito.saldoOriginal || '0').toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN
                                        </p>
                                      )}
                                      <div className="flex gap-3 mt-1.5 text-[10px] text-slate-500">
                                        {credito.fechaInicio && (
                                          <span data-testid={`fecha-inicio-${index}`}>
                                            Inicio: {format(new Date(credito.fechaInicio), 'dd/MM/yyyy')}
                                          </span>
                                        )}
                                        {credito.fechaTermino && (
                                          <span data-testid={`fecha-termino-${index}`}>
                                            Término: {format(new Date(credito.fechaTermino), 'dd/MM/yyyy')}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1.5 flex-shrink-0">
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                                        Vigente
                                      </span>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 w-7 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md"
                                        onClick={() => {
                                          const origIndex = allVigentes.indexOf(credito);
                                          if (confirm("¿Estás seguro de eliminar este crédito vigente?")) {
                                            deleteVigenteMutation.mutate(origIndex !== -1 ? origIndex : index);
                                          }
                                        }}
                                        disabled={deleteVigenteMutation.isPending}
                                        title="Eliminar crédito vigente"
                                        data-testid={`button-delete-vigente-${index}`}
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </div>
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
                  <TabsContent value="pasados" className="mt-3">
                    <div className="flex justify-end mb-2.5">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setShowHistoryForm(true)}
                        data-testid="button-add-credit-history"
                        className="h-7 text-xs font-medium text-slate-700 border-slate-200 hover:bg-slate-50"
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        Agregar
                      </Button>
                    </div>
                    {isLoadingHistories ? (
                      <div className="space-y-2">
                        <Skeleton className="h-16 rounded-lg" />
                        <Skeleton className="h-16 rounded-lg" />
                      </div>
                    ) : !creditHistories || creditHistories.length === 0 ? (
                      <div className="text-center py-7 border border-dashed border-slate-200 rounded-lg">
                        <History className="h-9 w-9 text-slate-300 mx-auto mb-2" />
                        <p className="text-xs font-medium text-slate-700 mb-1">Sin historial previo registrado</p>
                        <p className="text-[11px] text-slate-400 mb-3">
                          Puedes capturar referencias o créditos liquidados
                        </p>
                        <Button
                          size="sm"
                          onClick={() => setShowHistoryForm(true)}
                          data-testid="button-add-first-history"
                          className="h-7 text-xs"
                        >
                          <Plus className="h-3.5 w-3.5 mr-1" />
                          Agregar Historial
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                        {creditHistories.map((history) => (
                          <div key={history.id} className="p-2.5 bg-slate-50/80 border border-slate-100 rounded-lg" data-testid={`history-item-${history.id}`}>
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 mb-1">
                                  <p className="text-xs font-bold text-slate-900">
                                    ${parseFloat(history.amountGranted || '0').toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN
                                  </p>
                                  <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200/60">
                                    {history.creditType}
                                  </span>
                                </div>
                                <p className="text-[11px] text-slate-500">
                                  {history.termMonths} meses • Tasa: <span className="font-semibold text-slate-700">{history.interestRate}%</span>
                                </p>
                                {history.financialInstitution && (
                                  <p className="text-[11px] text-slate-500 truncate">
                                    Financiera: <span className="text-slate-700 font-medium">{history.financialInstitution}</span>
                                  </p>
                                )}
                                {history.notes && (
                                  <p className="text-[11px] text-slate-600 mt-1 italic line-clamp-2">
                                    {history.notes}
                                  </p>
                                )}
                              </div>
                              <span 
                                className={cn(
                                  "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border flex-shrink-0",
                                  history.source === 'manual' 
                                    ? "bg-blue-50 text-blue-700 border-blue-200/80" 
                                    : "bg-emerald-50 text-emerald-700 border-emerald-200/80"
                                )}
                              >
                                {history.source === 'manual' ? 'Manual' : 'Sistema'}
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-400 mt-1">
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
                  <TabsContent value="gestion" className="mt-3">
                    {!submissions || submissions.length === 0 ? (
                      <div className="text-center py-7 border border-dashed border-slate-200 rounded-lg">
                        <FileText className="h-9 w-9 text-slate-300 mx-auto mb-2" />
                        <p className="text-xs font-medium text-slate-700 mb-1">Sin créditos en gestión</p>
                        <p className="text-[11px] text-slate-400">
                          Las solicitudes y propuestas activas se visualizarán aquí
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                        {submissions.map((submission) => {
                          const approvedCount = submission.targets?.filter((t: any) => t.institutionProposal).length || 0;
                          const totalTargets = submission.targets?.length || 0;
                          
                          return (
                            <div key={submission.id} className="p-2.5 bg-slate-50/80 border border-slate-100 rounded-lg" data-testid={`submission-item-${submission.id}`}>
                              <div className="flex items-start justify-between gap-2 mb-1">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <p className="text-xs font-bold text-slate-900">
                                      ${submission.requestedAmount ? Number(submission.requestedAmount).toLocaleString('es-MX') : '0'} MXN
                                    </p>
                                    <span 
                                      className={cn(
                                        "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border",
                                        submission.status === 'dispersed' ? 'bg-blue-50 text-blue-700 border-blue-200/80' :
                                        submission.status === 'returned_to_broker' ? 'bg-orange-50 text-orange-700 border-orange-200/80' :
                                        approvedCount > 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80' :
                                        submission.status === 'sent_to_institutions' ? 'bg-amber-50 text-amber-700 border-amber-200/80' :
                                        'bg-slate-50 text-slate-700 border-slate-200/80'
                                      )}
                                    >
                                      {submission.status === 'pending_admin' ? 'Pendiente Admin' :
                                       submission.status === 'returned_to_broker' ? 'Devuelto' :
                                       submission.status === 'sent_to_institutions' ? `En Revisión (${totalTargets})` :
                                       submission.status === 'dispersed' ? 'Dispersado' :
                                       submission.status}
                                    </span>
                                  </div>
                                  {submission.productTemplate?.name && (
                                    <p className="text-[11px] text-slate-500 truncate">
                                      Producto: <span className="text-slate-700 font-medium">{submission.productTemplate.name}</span>
                                    </p>
                                  )}
                                  {submission.purpose && (
                                    <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
                                      Propósito: {submission.purpose}
                                    </p>
                                  )}
                                  {approvedCount > 0 && (
                                    <p className="text-[11px] text-emerald-700 mt-1 font-semibold flex items-center gap-1">
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                      {approvedCount} propuesta{approvedCount > 1 ? 's' : ''} recibida{approvedCount > 1 ? 's' : ''}
                                    </p>
                                  )}
                                  {submission.status === 'returned_to_broker' && submission.targets && submission.targets.length > 0 && (
                                    <>
                                      {submission.targets.map((target: any) => (
                                        target.status === 'returned_to_broker' && target.details && (
                                          <div key={target.id} className="mt-1.5 p-2 bg-orange-50/80 border border-orange-200 rounded-md">
                                            <p className="text-[11px] font-semibold text-orange-900 mb-0.5">Comentarios del Admin:</p>
                                            <p className="text-[11px] text-orange-800">{target.details}</p>
                                          </div>
                                        )
                                      ))}
                                    </>
                                  )}
                                </div>
                              </div>
                              <p className="text-[10px] text-slate-400 mt-1">
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
            <Card className="border border-slate-200/80 shadow-xs bg-white rounded-xl">
              <CardHeader className="p-4 sm:p-5 pb-3 border-b border-slate-100 flex flex-row items-center space-y-0">
                <CardTitle className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-slate-500" />
                  <span>Notas Adicionales del Expediente</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 sm:p-5">
                <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">{client.notes}</p>
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
                          <Label className="text-sm font-semibold text-muted-foreground">Razón Social</Label>
                          <p className="text-sm">{client.businessName || 'No especificada'}</p>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-semibold text-muted-foreground">Industria</Label>
                          <p className="text-sm">{client.industry || 'No especificada'}</p>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-semibold text-muted-foreground">Años en operación</Label>
                          <p className="text-sm">{client.yearsInBusiness || 0} años</p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="space-y-2">
                          <Label className="text-sm font-semibold text-muted-foreground">Nombre</Label>
                          <p className="text-sm">{client.firstName || 'No especificado'}</p>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-semibold text-muted-foreground">Apellido</Label>
                          <p className="text-sm">{client.lastName || 'No especificado'}</p>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-semibold text-muted-foreground">CURP</Label>
                          <p className="text-sm">{client.curp || 'No proporcionada'}</p>
                        </div>
                      </>
                    )}
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold text-muted-foreground">RFC</Label>
                      <p className="text-sm">{client.rfc}</p>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold text-muted-foreground">Tipo de Cliente</Label>
                      <Badge className={getClientTypeBadge(client.type).badgeClass}>
                        {getClientTypeBadge(client.type).label}
                      </Badge>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold text-muted-foreground">Estado</Label>
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
                        <Label className="text-sm font-semibold text-muted-foreground">Email</Label>
                        <p className="text-sm break-all">{client.email || 'No proporcionado'}</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-semibold text-muted-foreground">Teléfono</Label>
                        <p className="text-sm">{client.phone || 'No proporcionado'}</p>
                      </div>
                      {client.type === 'persona_moral' && (
                        <div className="space-y-2">
                          <Label className="text-sm font-semibold text-muted-foreground">CURP</Label>
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
                          <Label className="text-sm font-semibold text-muted-foreground">Estado Civil</Label>
                          <p className="text-sm">{client.estadoCivil || 'No especificado'}</p>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-semibold text-muted-foreground">Nivel Educativo</Label>
                          <p className="text-sm">{client.nivelEducativo || 'No especificado'}</p>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-semibold text-muted-foreground">Tipo de Vivienda</Label>
                          <p className="text-sm">{client.tipoVivienda || 'No especificado'}</p>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-semibold text-muted-foreground">Dependientes Económicos</Label>
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
                        <Label className="text-sm font-semibold text-muted-foreground">Calle</Label>
                        <p className="text-sm">{client.street || 'No especificada'}</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-semibold text-muted-foreground">Número</Label>
                        <p className="text-sm">{client.number || 'No especificado'}</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-semibold text-muted-foreground">Número Interior</Label>
                        <p className="text-sm">{client.interior || 'No especificado'}</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-semibold text-muted-foreground">Código Postal</Label>
                        <p className="text-sm">{client.postalCode || 'No especificado'}</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-semibold text-muted-foreground">Estado</Label>
                        <p className="text-sm">{client.state || 'No especificado'}</p>
                      </div>
                    </div>
                  </div>

                  {client.createdAt && (
                    <div className="border-t pt-4">
                      <div className="space-y-2">
                        <Label className="text-sm font-semibold text-muted-foreground">Fecha de Registro</Label>
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
                <DialogFooter className="pt-4 border-t mt-6">
                  <Button
                    variant="outline"
                    onClick={() => setShowInfoModal(false)}
                    data-testid="button-close-info-modal"
                  >
                    Cerrar
                  </Button>
                </DialogFooter>
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
                            <Label className="text-sm font-semibold text-muted-foreground">Ingresos Anuales</Label>
                            <p className="text-sm">
                              {client.ingresoAnual ? `$${parseFloat(client.ingresoAnual || '0').toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN` : 'No especificado'}
                            </p>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-muted-foreground">Egresos Mensuales Promedio</Label>
                            <p className="text-sm">
                              {client.egresoMensualPromedio ? `$${parseFloat(client.egresoMensualPromedio || '0').toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN` : 'No especificado'}
                            </p>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-muted-foreground">Participación Ventas Gobierno</Label>
                            <p className="text-sm">{client.participacionVentasGobierno || 'No especificado'}</p>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-muted-foreground">Ventas con Terminal Bancaria</Label>
                            <p className="text-sm">
                              {client.ventasTerminalBancaria ? `$${parseFloat(client.ventasTerminalBancaria || '0').toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN` : 'No especificado'}
                            </p>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-muted-foreground">Sector Económico</Label>
                            <p className="text-sm">{client.sectoreEconomico || 'No especificado'}</p>
                          </div>
                        </div>
                      </div>
                      <div className="border-b pb-4">
                        <h3 className="text-sm font-semibold mb-4">Buró de Crédito</h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-muted-foreground">Buró Accionista Principal</Label>
                            <p className="text-sm">{client.buroAccionistaPrincipal || 'No especificado'}</p>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-muted-foreground">Buró Empresa</Label>
                            <p className="text-sm">{client.buroEmpresa || 'No especificado'}</p>
                          </div>
                        </div>
                      </div>
                      <div className="border-b pb-4">
                        <h3 className="text-sm font-semibold mb-4">Garantías</h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-muted-foreground">Cuenta con Garantía</Label>
                            <p className="text-sm">{client.garantia || 'No especificado'}</p>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-muted-foreground">Aval u Obligado Solidario</Label>
                            <p className="text-sm">{client.avalObligadoSolidario || 'No especificado'}</p>
                          </div>
                          {client.garantiaDetalles && typeof client.garantiaDetalles === 'object' && Object.keys(client.garantiaDetalles as object).length > 0 ? (
                            <div className="space-y-2 col-span-2">
                              <Label className="text-sm font-semibold text-muted-foreground">Detalles de Garantía</Label>
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
                            <Label className="text-sm font-semibold text-muted-foreground">SAT CIEC</Label>
                            <p className="text-sm">{client.satCiec || 'No especificado'}</p>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-muted-foreground">Estados Financieros</Label>
                            <p className="text-sm">{client.estadosFinancieros || 'No especificado'}</p>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-muted-foreground">Opinión de Cumplimiento</Label>
                            <p className="text-sm">{client.opinionCumplimiento || 'No especificado'}</p>
                          </div>
                          {client.opinionDetalles && (
                            <div className="space-y-2 col-span-2">
                              <Label className="text-sm font-semibold text-muted-foreground">Detalles de Opinión</Label>
                              <p className="text-sm bg-gray-50 p-3 rounded border whitespace-pre-wrap">{client.opinionDetalles}</p>
                            </div>
                          )}
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-muted-foreground">Atrasos en Deudas</Label>
                            <p className="text-sm">{client.atrasosDeudas || 'No especificado'}</p>
                          </div>
                          {client.atrasosDetalles && (
                            <div className="space-y-2 col-span-2">
                              <Label className="text-sm font-semibold text-muted-foreground">Detalles de Atrasos</Label>
                              <p className="text-sm bg-gray-50 p-3 rounded border whitespace-pre-wrap">{client.atrasosDetalles}</p>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="border-b pb-4">
                        <h3 className="text-sm font-semibold mb-4">Créditos Vigentes</h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-muted-foreground">Créditos Vigentes</Label>
                            <p className="text-sm">{client.creditosVigentes || 'No especificado'}</p>
                          </div>
                          {client.creditosVigentesDetalles && Array.isArray(client.creditosVigentesDetalles) && client.creditosVigentesDetalles.length > 0 ? (
                            <div className="space-y-2 col-span-2">
                              <Label className="text-sm font-semibold text-muted-foreground">Detalles de Créditos Vigentes</Label>
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
                            <Label className="text-sm font-semibold text-muted-foreground">Notas</Label>
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
                            <Label className="text-sm font-semibold text-muted-foreground">Puesto</Label>
                            <p className="text-sm">{client.puesto || 'No especificado'}</p>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-muted-foreground">Antigüedad Laboral</Label>
                            <p className="text-sm">{client.antiguedadLaboral || 'No especificado'}</p>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-muted-foreground">Sector Económico</Label>
                            <p className="text-sm">{client.sectoreEconomico || 'No especificado'}</p>
                          </div>
                        </div>
                      </div>
                      <div className="border-b pb-4">
                        <h3 className="text-sm font-semibold mb-4">Información Financiera</h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-muted-foreground">Ingresos Mensuales Comprobables</Label>
                            <p className="text-sm">
                              {client.ingresoMensualPromedioComprobables ? `$${parseFloat(client.ingresoMensualPromedioComprobables || '0').toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN` : 'No especificado'}
                            </p>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-muted-foreground">Ingresos Mensuales No Comprobables</Label>
                            <p className="text-sm">
                              {client.ingresoMensualPromedioNoComprobables ? `$${parseFloat(client.ingresoMensualPromedioNoComprobables || '0').toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN` : 'No especificado'}
                            </p>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-muted-foreground">Gastos Fijos Mensuales Promedio</Label>
                            <p className="text-sm">
                              {client.gastosFijosMensualesPromedio ? `$${parseFloat(client.gastosFijosMensualesPromedio || '0').toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN` : 'No especificado'}
                            </p>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-muted-foreground">Ingreso Anual</Label>
                            <p className="text-sm">
                              {client.ingresoAnual ? `$${parseFloat(client.ingresoAnual || '0').toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN` : 'No especificado'}
                            </p>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-muted-foreground">Participación de Ventas con Gobierno</Label>
                            <p className="text-sm">{client.participacionVentasGobierno || 'No especificado'}</p>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-muted-foreground">Ventas con Terminal Bancaria</Label>
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
                            <Label className="text-sm font-semibold text-muted-foreground">Buró de Crédito Persona Física</Label>
                            <p className="text-sm">{client.buroPersonaFisica || 'No especificado'}</p>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-muted-foreground">Atrasos en Deudas Buró</Label>
                            <p className="text-sm">{client.atrasosDeudasBuro || 'No especificado'}</p>
                          </div>
                          {client.atrasosDeudasBuroDetalles && (
                            <div className="space-y-2 col-span-2">
                              <Label className="text-sm font-semibold text-muted-foreground">Detalles de Atrasos en Buró</Label>
                              <p className="text-sm bg-gray-50 p-3 rounded border whitespace-pre-wrap">{client.atrasosDeudasBuroDetalles}</p>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="border-b pb-4">
                        <h3 className="text-sm font-semibold mb-4">Garantías</h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-muted-foreground">Cuenta con Garantía</Label>
                            <p className="text-sm">{client.garantia || 'No especificado'}</p>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-muted-foreground">Tiene Aval u Obligado Solidario</Label>
                            <p className="text-sm">{client.avalObligadoSolidario || 'No especificado'}</p>
                          </div>
                          {client.garantiaDetalles && typeof client.garantiaDetalles === 'object' && Object.keys(client.garantiaDetalles as object).length > 0 ? (
                            <div className="space-y-2 col-span-2">
                              <Label className="text-sm font-semibold text-muted-foreground">Detalles de Garantía</Label>
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
                            <Label className="text-sm font-semibold text-muted-foreground">Abierto a conectarse con SAT vía CIEC</Label>
                            <p className="text-sm">{client.satCiec || 'No especificado'}</p>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-muted-foreground">¿Cuenta con Estados Financieros?</Label>
                            <p className="text-sm">{client.estadosFinancieros || 'No especificado'}</p>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-muted-foreground">Opinión de Cumplimiento</Label>
                            <p className="text-sm">{client.opinionCumplimiento || 'No especificado'}</p>
                          </div>
                          {client.opinionDetalles && (
                            <div className="space-y-2 col-span-2">
                              <Label className="text-sm font-semibold text-muted-foreground">Detalles de Opinión</Label>
                              <p className="text-sm bg-gray-50 p-3 rounded border whitespace-pre-wrap">{client.opinionDetalles}</p>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="border-b pb-4">
                        <h3 className="text-sm font-semibold mb-4">Créditos Vigentes</h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-muted-foreground">Créditos Vigentes</Label>
                            <p className="text-sm">{client.creditosVigentes || 'No especificado'}</p>
                          </div>
                          {client.creditosVigentesDetalles && Array.isArray(client.creditosVigentesDetalles) && client.creditosVigentesDetalles.length > 0 ? (
                            <div className="space-y-2 col-span-2">
                              <Label className="text-sm font-semibold text-muted-foreground">Detalles de Créditos Vigentes</Label>
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
                            <Label className="text-sm font-semibold text-muted-foreground">Puesto</Label>
                            <p className="text-sm">{client.puesto || 'No especificado'}</p>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-muted-foreground">Antigüedad Laboral</Label>
                            <p className="text-sm">{client.antiguedadLaboral || 'No especificado'}</p>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-muted-foreground">Sector Económico</Label>
                            <p className="text-sm">{client.sectoreEconomico || 'No especificado'}</p>
                          </div>
                        </div>
                      </div>
                      <div className="border-b pb-4">
                        <h3 className="text-sm font-semibold mb-4">Información Financiera</h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-muted-foreground">Ingresos Mensuales Comprobables</Label>
                            <p className="text-sm">
                              {client.ingresoMensualPromedioComprobables ? `$${parseFloat(client.ingresoMensualPromedioComprobables || '0').toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN` : 'No especificado'}
                            </p>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-muted-foreground">Ingresos Mensuales No Comprobables</Label>
                            <p className="text-sm">
                              {client.ingresoMensualPromedioNoComprobables ? `$${parseFloat(client.ingresoMensualPromedioNoComprobables || '0').toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN` : 'No especificado'}
                            </p>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-muted-foreground">Gastos Fijos Mensuales Promedio</Label>
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
                            <Label className="text-sm font-semibold text-muted-foreground">Buró Persona Física</Label>
                            <p className="text-sm">{client.buroPersonaFisica || 'No especificado'}</p>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-muted-foreground">Atrasos en Deudas Buró</Label>
                            <p className="text-sm">{client.atrasosDeudasBuro || 'No especificado'}</p>
                          </div>
                          {client.atrasosDeudasBuroDetalles && (
                            <div className="space-y-2 col-span-2">
                              <Label className="text-sm font-semibold text-muted-foreground">Detalles de Atrasos en Buró</Label>
                              <p className="text-sm bg-gray-50 p-3 rounded border whitespace-pre-wrap">{client.atrasosDeudasBuroDetalles}</p>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="border-b pb-4">
                        <h3 className="text-sm font-semibold mb-4">Garantías</h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-muted-foreground">Cuenta con Garantía Física</Label>
                            <p className="text-sm">{client.cuentaConGarantiaFisica || 'No especificado'}</p>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-muted-foreground">Tiene Aval u Obligado Solidario</Label>
                            <p className="text-sm">{client.tieneAvalObligadoSolidarioFisica || 'No especificado'}</p>
                          </div>
                          {client.garantiaFisicaDetalles && typeof client.garantiaFisicaDetalles === 'object' && Object.keys(client.garantiaFisicaDetalles as object).length > 0 ? (
                            <div className="space-y-2 col-span-2">
                              <Label className="text-sm font-semibold text-muted-foreground">Detalles de Garantía Física</Label>
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
                              <Label className="text-sm font-semibold text-muted-foreground">Notas</Label>
                              <p className="text-sm bg-gray-50 p-3 rounded border whitespace-pre-wrap">{client.notes}</p>
                            </div>
                          )}
                          {client.observacionesAdicionalesFisica && (
                            <div className="space-y-2">
                              <Label className="text-sm font-semibold text-muted-foreground">Observaciones Adicionales</Label>
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
                            <Label className="text-sm font-semibold text-muted-foreground">Nombre Comercial</Label>
                            <p className="text-sm">{client.nombreComercial || 'No especificado'}</p>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-muted-foreground">Ocupación</Label>
                            <p className="text-sm">{client.ocupacion || 'No especificada'}</p>
                          </div>
                        </div>
                      </div>
                      <div className="border-b pb-4">
                        <h3 className="text-sm font-semibold mb-4">Información Financiera</h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-muted-foreground">Ingresos Mensuales Comprobables</Label>
                            <p className="text-sm">
                              {client.ingresoMensualPromedioComprobablesSinSat ? `$${parseFloat(client.ingresoMensualPromedioComprobablesSinSat || '0').toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN` : 'No especificado'}
                            </p>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-muted-foreground">Ingresos Mensuales No Comprobables</Label>
                            <p className="text-sm">
                              {client.ingresoMensualPromedioNoComprobablesSinSat ? `$${parseFloat(client.ingresoMensualPromedioNoComprobablesSinSat || '0').toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN` : 'No especificado'}
                            </p>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-muted-foreground">Gastos Fijos Mensuales Promedio</Label>
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
                            <Label className="text-sm font-semibold text-muted-foreground">Buró Persona Física</Label>
                            <p className="text-sm">{client.buroPersonaFisicaSinSat || 'No especificado'}</p>
                          </div>
                        </div>
                      </div>
                      <div className="border-b pb-4">
                        <h3 className="text-sm font-semibold mb-4">Garantías</h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-muted-foreground">Cuenta con Garantía</Label>
                            <p className="text-sm">{client.cuentaConGarantiaSinSat || 'No especificado'}</p>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-muted-foreground">Tiene Aval u Obligado Solidario</Label>
                            <p className="text-sm">{client.tieneAvalObligadoSolidarioSinSat || 'No especificado'}</p>
                          </div>
                          {client.garantiaSinSatDetalles && typeof client.garantiaSinSatDetalles === 'object' && Object.keys(client.garantiaSinSatDetalles as object).length > 0 ? (
                            <div className="space-y-2 col-span-2">
                              <Label className="text-sm font-semibold text-muted-foreground">Detalles de Garantía</Label>
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
                            <Label className="text-sm font-semibold text-muted-foreground">Atrasos en Deudas Buró</Label>
                            <p className="text-sm">{client.atrasosDeudasBuroSinSat || 'No especificado'}</p>
                          </div>
                          {client.atrasosDeudasBuroDetallesSinSat && (
                            <div className="space-y-2 col-span-2">
                              <Label className="text-sm font-semibold text-muted-foreground">Detalles de Atrasos en Buró</Label>
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
                              <Label className="text-sm font-semibold text-muted-foreground">Notas</Label>
                              <p className="text-sm bg-gray-50 p-3 rounded border whitespace-pre-wrap">{client.notes}</p>
                            </div>
                          )}
                          {client.observacionesAdicionalesSinSat && (
                            <div className="space-y-2">
                              <Label className="text-sm font-semibold text-muted-foreground">Observaciones Adicionales</Label>
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
                <DialogFooter className="pt-4 border-t mt-6">
                  <Button
                    variant="outline"
                    onClick={() => setShowFinancialModal(false)}
                    data-testid="button-close-financial-modal"
                  >
                    Cerrar
                  </Button>
                </DialogFooter>
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
                        En Gestión ({submissions?.length || 0})
                      </TabsTrigger>
                      <TabsTrigger value="vigentes">
                        Vigentes ({(() => {
                          const today = new Date();
                          today.setHours(0, 0, 0, 0);
                          const allVigentes = (client?.creditosVigentesDetalles as any[]) || [];
                          return allVigentes.filter((credito: any) => {
                            if (!credito.fechaTermino) return true;
                            const endDate = new Date(credito.fechaTermino);
                            endDate.setHours(0, 0, 0, 0);
                            return endDate >= today;
                          }).length;
                        })()})
                      </TabsTrigger>
                      <TabsTrigger value="pasados">
                        Pasados ({creditHistories?.length || 0})
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
                            <p className="text-sm text-muted-foreground mb-2">No hay créditos vigentes</p>
                            <p className="text-xs text-muted-foreground">
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
                                          <Label className="text-xs text-muted-foreground">Financiera</Label>
                                          <p className="text-sm">{credito.institucion}</p>
                                        </div>
                                      )}
                                      {credito.saldoOriginal && (
                                        <div>
                                          <Label className="text-xs text-muted-foreground">Saldo Original</Label>
                                          <p className="text-sm">${parseFloat(credito.saldoOriginal || '0').toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN</p>
                                        </div>
                                      )}
                                      {credito.fechaInicio && (
                                        <div>
                                          <Label className="text-xs text-muted-foreground">Fecha Inicio</Label>
                                          <p className="text-sm">{credito.fechaInicio}</p>
                                        </div>
                                      )}
                                      {credito.fechaTermino && (
                                        <div>
                                          <Label className="text-xs text-muted-foreground">Fecha Término</Label>
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
                          <p className="text-sm text-muted-foreground mb-2">No hay historial crediticio registrado</p>
                          <p className="text-xs text-muted-foreground mb-3">
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
                                      <Label className="text-xs text-muted-foreground">Plazo</Label>
                                      <p className="text-sm">{history.termMonths} meses</p>
                                    </div>
                                    <div>
                                      <Label className="text-xs text-muted-foreground">Tasa de Interés</Label>
                                      <p className="text-sm">{history.interestRate}%</p>
                                    </div>
                                    {history.financialInstitution && (
                                      <div>
                                        <Label className="text-xs text-muted-foreground">Financiera</Label>
                                        <p className="text-sm">{history.financialInstitution}</p>
                                      </div>
                                    )}
                                    <div>
                                      <Label className="text-xs text-muted-foreground">Registrado</Label>
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
                                      <Label className="text-xs text-muted-foreground">Notas</Label>
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
                          <p className="text-sm text-muted-foreground mb-2">No hay créditos en gestión</p>
                          <p className="text-xs text-muted-foreground">
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
                                        <Label className="text-xs text-muted-foreground">Producto</Label>
                                        <p className="text-sm">{submission.productTemplate?.name || 'N/A'}</p>
                                      </div>
                                      <div>
                                        <Label className="text-xs text-muted-foreground">Enviado</Label>
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
                <DialogFooter className="pt-4 border-t mt-6">
                  <Button
                    variant="outline"
                    onClick={() => setShowHistoryModal(false)}
                    data-testid="button-close-history-modal"
                  >
                    Cerrar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
        </main>

      {/* Credit Request Modal (Empresarial) */}
      <CreditRequestModal
        isOpen={showCreditRequestModal}
        onClose={() => setShowCreditRequestModal(false)}
        preselectedClientId={clientId}
      />

      {/* New Opportunity Type Modal (Bifurcación) */}
      <NewOpportunityTypeModal
        isOpen={showOpportunityTypeModal}
        onClose={() => setShowOpportunityTypeModal(false)}
        onSelectEmpresarial={() => setShowCreditRequestModal(true)}
        onSelectHipotecario={() => setShowMortgageLeadModal(true)}
      />

      {/* Mortgage Lead Modal (Hipotecario Vivienda - Camino B con existingClient) */}
      <MortgageLeadModal
        isOpen={showMortgageLeadModal}
        onClose={() => setShowMortgageLeadModal(false)}
        existingClient={client}
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
            onCancel={() => setShowDocumentUploadModal(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Document Preview Modal */}
      <Dialog open={!!previewDocument} onOpenChange={(open) => !open && setPreviewDocument(null)}>
        <DialogContent className="max-w-4xl w-[95vw] max-h-[90vh] flex flex-col p-4 sm:p-6">
          <DialogHeader className="flex flex-row items-center justify-between pb-2 border-b">
            <div>
              <DialogTitle className="text-base sm:text-lg truncate max-w-[300px] sm:max-w-md">
                {previewDocument?.fileName || "Visualizador de Documento"}
              </DialogTitle>
              <DialogDescription className="capitalize text-xs">
                {previewDocument?.type?.replace(/_/g, " ")} • {previewDocument?.isValid ? "Documento Válido" : "Pendiente de validación"}
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2 pr-6">
              {previewDocument && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      window.open(buildApiUrl(`/api/documents/${previewDocument.id}/download`), '_blank');
                    }}
                    className="h-8 text-xs"
                  >
                    <Download className="h-3.5 w-3.5 mr-1" />
                    Descargar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      window.open(buildApiUrl(`/api/documents/${previewDocument.id}/file`), '_blank');
                    }}
                    className="h-8 text-xs text-primary"
                    title="Abrir en pestaña nueva"
                  >
                    <ExternalLink className="h-3.5 w-3.5 mr-1" />
                    Abrir nueva pestaña
                  </Button>
                </>
              )}
            </div>
          </DialogHeader>

          <div className="flex-1 min-h-[400px] sm:min-h-[500px] max-h-[70vh] bg-gray-100 rounded-lg overflow-hidden flex items-center justify-center p-2 mt-2">
            {previewDocument && (
              <>
                {previewDocument.mimeType?.startsWith('image/') ? (
                  <img
                    src={buildApiUrl(`/api/documents/${previewDocument.id}/file`)}
                    alt={previewDocument.fileName}
                    className="max-h-full max-w-full object-contain rounded shadow"
                  />
                ) : previewDocument.mimeType === 'application/pdf' || previewDocument.fileName?.toLowerCase().endsWith('.pdf') ? (
                  <iframe
                    src={`${buildApiUrl(`/api/documents/${previewDocument.id}/file`)}#toolbar=1`}
                    title={previewDocument.fileName}
                    className="w-full h-full min-h-[450px] border-0 rounded"
                  />
                ) : (
                  <div className="text-center p-8 bg-white rounded-lg shadow-sm border max-w-md">
                    <FileText className="h-16 w-16 text-primary mx-auto mb-4 opacity-75" />
                    <h4 className="font-semibold text-gray-800 mb-1">{previewDocument.fileName}</h4>
                    <p className="text-xs text-gray-500 mb-4">
                      Este formato de archivo no permite visualización directa integrada.
                    </p>
                    <Button
                      onClick={() => {
                        window.open(buildApiUrl(`/api/documents/${previewDocument.id}/download`), '_blank');
                      }}
                      className="bg-primary text-white"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Descargar archivo para ver
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
          <DialogFooter className="pt-3 border-t mt-3 flex justify-end">
            <Button
              variant="outline"
              onClick={() => setPreviewDocument(null)}
              data-testid="button-close-preview-modal"
            >
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
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
              disabled={updateVigentesMutation.isPending}
              data-testid="button-cancel-vigente"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={updateVigentesMutation.isPending}
              data-testid="button-save-vigente"
            >
              {updateVigentesMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                "Guardar"
              )}
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

          <DialogFooter className="gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={createHistoryMutation.isPending}
              data-testid="button-cancel-history"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={createHistoryMutation.isPending}
              data-testid="button-submit-history"
            >
              {createHistoryMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                "Agregar Historial"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
