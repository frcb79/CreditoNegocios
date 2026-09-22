import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import MainLayout from "@/components/MainLayout";
import Header from "@/components/Header";
import DocumentUpload from "@/components/Documents/DocumentUpload";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Document, Client } from "@shared/schema";
import { buildApiUrl } from "@/lib/runtimeConfig";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { 
  FileText, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  Upload, 
  Search, 
  Filter, 
  Eye, 
  Download, 
  Edit3, 
  Trash2, 
  Plus, 
  FolderArchive,
  User,
  HardDrive,
  Calendar,
  AlertCircle,
  FileCheck2,
  X
} from "lucide-react";

const documentTypes = [
  { value: "curp", label: "CURP" },
  { value: "acta_constitutiva", label: "Acta Constitutiva" },
  { value: "aval", label: "Aval" },
  { value: "garantia", label: "Garantía" },
  { value: "csf", label: "Constancia de Situación Fiscal (CSF)" },
  { value: "identificacion_rep_legal", label: "Identificación Rep Legal" },
  { value: "id_mayoritario", label: "ID Mayoritario" },
  { value: "proof_of_address", label: "Comprobante de Domicilio" },
  { value: "income_statement", label: "Estado de Cuenta" },
  { value: "bank_statement", label: "Estado de Cuenta Bancario" },
  { value: "tax_return", label: "Declaración Anual" },
  { value: "other", label: "Otro documento" },
];

export default function Documents() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterClient, setFilterClient] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [showUpload, setShowUpload] = useState(false);
  const [editingDocument, setEditingDocument] = useState<Document | null>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: documents, isLoading } = useQuery<Document[]>({
    queryKey: ["/api/documents"],
  });

  const { data: clients } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (documentId: string) => {
      await fetch(`/api/documents/${documentId}`, {
        method: "DELETE",
        credentials: "include",
      });
    },
    onSuccess: () => {
      toast({
        title: "Documento eliminado",
        description: "El documento se ha eliminado correctamente",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const getClientName = (clientId: string | null) => {
    if (!clientId) return "Sin cliente asignado";
    const client = clients?.find(c => c.id === clientId);
    if (!client) return `Cliente ${clientId.slice(-8)}`;
    return client.type === 'persona_moral' 
      ? (client.businessName || 'Sin razón social') 
      : `${client.firstName || ''} ${client.lastName || ''}`.trim() || 'Sin nombre';
  };

  const getDocumentTypeLabel = (type: string) => {
    return documentTypes.find(dt => dt.value === type)?.label || type;
  };

  const documentsWithIssues = documents?.filter(d => !d.isValid).length || 0;
  const validDocumentsCount = documents?.filter(d => d.isValid).length || 0;
  const documentsExpiringSoon = documents?.filter(d => {
    if (!d.expiresAt) return false;
    const daysUntilExpiry = Math.ceil((new Date(d.expiresAt).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
    return daysUntilExpiry <= 30 && daysUntilExpiry > 0;
  }).length || 0;

  const filteredDocuments = documents?.filter(document => {
    const clientName = getClientName(document.clientId);
    const matchesSearch = 
      document.fileName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      document.type.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesType = filterType === "all" || document.type === filterType;
    const matchesClient = filterClient === "all" || document.clientId === filterClient;
    
    let matchesStatus = true;
    if (filterStatus === "valid") {
      matchesStatus = !!document.isValid;
    } else if (filterStatus === "issues") {
      matchesStatus = !document.isValid;
    } else if (filterStatus === "expiring") {
      if (!document.expiresAt) {
        matchesStatus = false;
      } else {
        const days = Math.ceil((new Date(document.expiresAt).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
        matchesStatus = days <= 30 && days > 0;
      }
    }
    
    return matchesSearch && matchesType && matchesClient && matchesStatus;
  }) || [];

  const totalDocumentsCount = documents?.length || 0;

  if (isLoading) {
    return (
      <MainLayout>
        <Header 
          title="Repositorio Documental"
          subtitle="Cargando expedientes y documentos de clientes..."
        />
        
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          <div className="max-w-7xl mx-auto space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-2xs animate-pulse">
                  <div className="h-3 w-16 bg-slate-200 rounded mb-2.5"></div>
                  <div className="h-6 w-12 bg-slate-200 rounded mb-1"></div>
                  <div className="h-2 w-24 bg-slate-100 rounded"></div>
                </div>
              ))}
            </div>
            <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs animate-pulse">
              <div className="h-9 bg-slate-100 rounded-lg"></div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-white border border-slate-200/80 rounded-xl p-5 shadow-2xs animate-pulse space-y-3">
                  <div className="h-5 bg-slate-200 rounded w-2/3"></div>
                  <div className="h-4 bg-slate-100 rounded w-1/2"></div>
                  <div className="h-12 bg-slate-50 rounded-lg"></div>
                </div>
              ))}
            </div>
          </div>
        </main>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <Header 
        title="Repositorio Documental"
        subtitle={`${totalDocumentsCount} archivo${totalDocumentsCount !== 1 ? 's' : ''} registrado${totalDocumentsCount !== 1 ? 's' : ''} en expedientes`}
        action={{
          label: "Subir Documento",
          onClick: () => {
            setEditingDocument(null);
            setShowUpload(true);
          }
        }}
      />
      
      <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
        <div className="max-w-7xl mx-auto space-y-5">

          {/* Institutional Metrics Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Total */}
            <div 
              onClick={() => setFilterStatus("all")}
              className={`bg-white border rounded-xl p-3.5 shadow-2xs transition-all cursor-pointer ${
                filterStatus === "all" ? "border-slate-800 ring-1 ring-slate-800" : "border-slate-200/80 hover:border-slate-300"
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-semibold text-slate-500 truncate">Total Archivos</span>
                <div className="h-7 w-7 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center shrink-0 border border-slate-200/60">
                  <FolderArchive className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-bold tracking-tight text-slate-900" data-testid="text-total-docs">
                  {totalDocumentsCount}
                </span>
                <span className="text-2xs text-slate-400 font-medium">expedientes</span>
              </div>
            </div>

            {/* Válidos */}
            <div 
              onClick={() => setFilterStatus(filterStatus === "valid" ? "all" : "valid")}
              className={`bg-white border rounded-xl p-3.5 shadow-2xs transition-all cursor-pointer ${
                filterStatus === "valid" ? "border-emerald-600 ring-1 ring-emerald-600" : "border-slate-200/80 hover:border-slate-300"
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-semibold text-slate-500 truncate">Válidos</span>
                <div className="h-7 w-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0 border border-emerald-200/60">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-bold tracking-tight text-emerald-600" data-testid="text-valid-docs">
                  {validDocumentsCount}
                </span>
                <span className="text-2xs text-slate-400 font-medium">conformes</span>
              </div>
            </div>

            {/* Con Problemas */}
            <div 
              onClick={() => setFilterStatus(filterStatus === "issues" ? "all" : "issues")}
              className={`bg-white border rounded-xl p-3.5 shadow-2xs transition-all cursor-pointer ${
                filterStatus === "issues" ? "border-amber-600 ring-1 ring-amber-600" : "border-slate-200/80 hover:border-slate-300"
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-semibold text-slate-500 truncate">Requieren Atención</span>
                <div className="h-7 w-7 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center shrink-0 border border-amber-200/60">
                  <AlertTriangle className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className={`text-2xl font-bold tracking-tight ${documentsWithIssues > 0 ? "text-amber-600" : "text-slate-900"}`} data-testid="text-issue-docs">
                  {documentsWithIssues}
                </span>
                <span className="text-2xs text-slate-400 font-medium">incompletos</span>
              </div>
            </div>

            {/* Vencen en 30 días */}
            <div 
              onClick={() => setFilterStatus(filterStatus === "expiring" ? "all" : "expiring")}
              className={`bg-white border rounded-xl p-3.5 shadow-2xs transition-all cursor-pointer ${
                filterStatus === "expiring" ? "border-rose-600 ring-1 ring-rose-600" : "border-slate-200/80 hover:border-slate-300"
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-semibold text-slate-500 truncate">Vencen en 30 días</span>
                <div className="h-7 w-7 rounded-lg bg-rose-50 text-rose-700 flex items-center justify-center shrink-0 border border-rose-200/60">
                  <Clock className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className={`text-2xl font-bold tracking-tight ${documentsExpiringSoon > 0 ? "text-rose-600" : "text-slate-900"}`} data-testid="text-expiring-docs">
                  {documentsExpiringSoon}
                </span>
                <span className="text-2xs text-slate-400 font-medium">expedientes</span>
              </div>
            </div>
          </div>

          {/* Search and Filters Toolbar */}
          <div className="bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-2xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-center">
              {/* Buscador */}
              <div className="relative lg:col-span-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                <Input
                  placeholder="Buscar por archivo, cliente o tipo..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 h-9 text-xs border-slate-200 rounded-lg focus-visible:ring-1 focus-visible:ring-slate-400"
                  data-testid="input-search-documents"
                />
                {searchTerm && (
                  <button 
                    onClick={() => setSearchTerm("")} 
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Selector Tipo */}
              <div className="lg:col-span-3">
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger className="h-9 text-xs border-slate-200 rounded-lg" data-testid="select-document-type">
                    <SelectValue placeholder="Tipo de documento" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los tipos de documento</SelectItem>
                    {documentTypes.map(type => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Selector Cliente */}
              <div className="lg:col-span-3">
                <Select value={filterClient} onValueChange={setFilterClient}>
                  <SelectTrigger className="h-9 text-xs border-slate-200 rounded-lg" data-testid="select-client-filter">
                    <SelectValue placeholder="Filtrar por cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los clientes</SelectItem>
                    {clients?.map(client => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.type === 'persona_moral' ? client.businessName : `${client.firstName} ${client.lastName}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Botón Subir */}
              <div className="lg:col-span-2">
                <Button 
                  onClick={() => {
                    setEditingDocument(null);
                    setShowUpload(true);
                  }}
                  className="w-full h-9 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white shadow-xs rounded-lg flex items-center justify-center gap-1.5"
                  data-testid="button-upload-document"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Subir Documento</span>
                </Button>
              </div>
            </div>

            {/* Filtro activo por estado pill */}
            {filterStatus !== "all" && (
              <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-slate-500">
                  Mostrando únicamente: <strong className="text-slate-800">
                    {filterStatus === "valid" && "Documentos Válidos"}
                    {filterStatus === "issues" && "Documentos con Problemas"}
                    {filterStatus === "expiring" && "Documentos que Vencen en 30 días"}
                  </strong>
                </span>
                <button 
                  onClick={() => setFilterStatus("all")}
                  className="text-primary hover:underline font-medium text-xs flex items-center gap-1"
                >
                  <X className="w-3 h-3" /> Limpiar filtro
                </button>
              </div>
            )}
          </div>

          {/* Documents View: Compact Document Manager (Table on md+, Compact Rows on mobile) */}
          {filteredDocuments.length === 0 ? (
            <Card className="border border-slate-200/80 shadow-2xs bg-white">
              <CardContent className="p-12 text-center">
                <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-400 mx-auto flex items-center justify-center mb-4">
                  <FolderArchive className="w-6 h-6" />
                </div>
                <h3 className="text-base font-semibold text-slate-900 mb-1">
                  {totalDocumentsCount === 0 ? "Repositorio vacío" : "No se encontraron documentos"}
                </h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto mb-5">
                  {totalDocumentsCount === 0 
                    ? "Comienza subiendo el primer expediente digital de tus clientes para validación crediticia."
                    : "Ningún documento coincide con los criterios de búsqueda o filtros seleccionados."
                  }
                </p>
                {totalDocumentsCount === 0 ? (
                  <Button 
                    onClick={() => {
                      setEditingDocument(null);
                      setShowUpload(true);
                    }}
                    className="h-9 px-4 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-lg shadow-xs inline-flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    Subir Primer Documento
                  </Button>
                ) : (
                  <Button 
                    variant="outline"
                    onClick={() => {
                      setSearchTerm("");
                      setFilterType("all");
                      setFilterClient("all");
                      setFilterStatus("all");
                    }}
                    className="h-8 text-xs border-slate-200 text-slate-600 rounded-lg"
                  >
                    Restablecer filtros
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {/* Desktop / Tablet: Tabla Compacta Operativa */}
              <div className="hidden md:block bg-white border border-slate-200/80 rounded-xl shadow-2xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200/80 bg-slate-50/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                        <th className="py-3 px-4">Documento / Archivo</th>
                        <th className="py-3 px-3">Tipo</th>
                        <th className="py-3 px-3">Cliente / Expediente</th>
                        <th className="py-3 px-3">Estado / Vigencia</th>
                        <th className="py-3 px-3">Detalles</th>
                        <th className="py-3 px-4 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {filteredDocuments.map((document) => {
                        const clientName = getClientName(document.clientId);
                        const isExpiring = document.expiresAt && (() => {
                          const days = Math.ceil((new Date(document.expiresAt).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                          return days <= 30 && days > 0;
                        })();

                        return (
                          <tr 
                            key={document.id}
                            className="hover:bg-slate-50/60 transition-colors group"
                            data-testid={`document-${document.id}`}
                          >
                            {/* Documento / Archivo */}
                            <td className="py-3 px-4 max-w-[280px]">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
                                  document.isValid 
                                    ? "bg-slate-50 text-slate-700 border-slate-200/80" 
                                    : "bg-amber-50 text-amber-700 border-amber-200/80"
                                }`}>
                                  <FileText className="w-4 h-4" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div 
                                    onClick={() => {
                                      window.open(buildApiUrl(`/api/documents/${document.id}/file`), '_blank', 'noopener,noreferrer');
                                    }}
                                    className="font-semibold text-slate-900 truncate hover:text-primary cursor-pointer leading-snug"
                                    title={document.fileName}
                                  >
                                    {document.fileName}
                                  </div>
                                  {(document.extractedData as any)?.customDocumentName && (
                                    <div 
                                      className="text-2xs font-medium text-slate-500 truncate"
                                      data-testid={`text-custom-name-${document.id}`}
                                    >
                                      {(document.extractedData as any).customDocumentName}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>

                            {/* Tipo */}
                            <td className="py-3 px-3">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-2xs font-medium bg-slate-100 text-slate-700 border border-slate-200/60 whitespace-nowrap">
                                {getDocumentTypeLabel(document.type)}
                              </span>
                            </td>

                            {/* Cliente / Expediente */}
                            <td className="py-3 px-3 max-w-[220px]">
                              <div className="flex items-center gap-1.5 min-w-0" title={clientName}>
                                <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <span className="font-medium text-slate-800 truncate">
                                  {clientName}
                                </span>
                              </div>
                            </td>

                            {/* Estado / Vigencia */}
                            <td className="py-3 px-3 whitespace-nowrap">
                              <div className="flex flex-col gap-0.5">
                                <Badge 
                                  variant="outline"
                                  className={`w-fit text-2xs px-2 py-0.5 rounded-md font-semibold ${
                                    document.isValid 
                                      ? "bg-emerald-50 text-emerald-700 border-emerald-200/80" 
                                      : "bg-amber-50 text-amber-700 border-amber-200/80"
                                  }`}
                                >
                                  {document.isValid ? (
                                    <span className="inline-flex items-center gap-1">
                                      <CheckCircle2 className="w-2.5 h-2.5" /> Válido
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1">
                                      <AlertCircle className="w-2.5 h-2.5" /> Revisión
                                    </span>
                                  )}
                                </Badge>

                                {document.expiresAt && (
                                  <span className={`text-2xs font-medium flex items-center gap-1 mt-0.5 ${
                                    isExpiring ? "text-rose-600 font-semibold" : "text-slate-500"
                                  }`}>
                                    <Clock className="w-2.5 h-2.5 shrink-0" />
                                    {isExpiring ? "Vence en 30 días: " : "Vence: "}
                                    {new Date(document.expiresAt).toLocaleDateString('es-MX')}
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Detalles (Tamaño y Fecha) */}
                            <td className="py-3 px-3 text-2xs text-slate-500 whitespace-nowrap">
                              <div className="flex flex-col">
                                <span className="font-medium text-slate-700">
                                  {document.fileSize ? `${(document.fileSize / 1024).toFixed(1)} KB` : 'N/A'}
                                </span>
                                <span>
                                  {formatDistanceToNow(new Date(document.uploadedAt!), { 
                                    addSuffix: true, 
                                    locale: es 
                                  })}
                                </span>
                              </div>
                            </td>

                            {/* Acciones */}
                            <td className="py-3 px-4 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1">
                                <Button 
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2.5 text-2xs font-medium border-slate-200 hover:bg-slate-100 text-slate-700 rounded-md inline-flex items-center gap-1"
                                  onClick={() => {
                                    window.open(buildApiUrl(`/api/documents/${document.id}/file`), '_blank', 'noopener,noreferrer');
                                  }}
                                  title="Ver archivo"
                                  data-testid={`button-view-${document.id}`}
                                >
                                  <Eye className="w-3 h-3" />
                                  <span>Ver</span>
                                </Button>

                                <Button 
                                  size="sm"
                                  variant="outline"
                                  className="h-7 w-7 p-0 border-slate-200 hover:bg-slate-100 text-slate-600 rounded-md"
                                  onClick={() => {
                                    window.open(buildApiUrl(`/api/documents/${document.id}/download`), '_blank', 'noopener,noreferrer');
                                  }}
                                  title="Descargar documento"
                                  data-testid={`button-download-${document.id}`}
                                >
                                  <Download className="w-3 h-3" />
                                </Button>

                                <Button 
                                  size="sm"
                                  variant="outline"
                                  className="h-7 w-7 p-0 border-slate-200 hover:bg-slate-100 text-slate-600 rounded-md"
                                  onClick={() => {
                                    setEditingDocument(document);
                                    setShowUpload(true);
                                  }}
                                  title="Editar documento"
                                  data-testid={`button-edit-${document.id}`}
                                >
                                  <Edit3 className="w-3 h-3" />
                                </Button>

                                <Button 
                                  size="sm"
                                  variant="outline"
                                  className="h-7 w-7 p-0 border-slate-200 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 text-slate-500 rounded-md transition-colors"
                                  onClick={() => {
                                    if (window.confirm('¿Estás seguro de que quieres eliminar este documento del repositorio?')) {
                                      deleteMutation.mutate(document.id);
                                    }
                                  }}
                                  disabled={deleteMutation.isPending}
                                  title="Eliminar documento"
                                  data-testid={`button-delete-${document.id}`}
                                >
                                  {deleteMutation.isPending ? (
                                    <div className="w-2.5 h-2.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></div>
                                  ) : (
                                    <Trash2 className="w-3 h-3" />
                                  )}
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile View: Filas compactas responsivas */}
              <div className="md:hidden space-y-2.5">
                {filteredDocuments.map((document) => {
                  const clientName = getClientName(document.clientId);
                  const isExpiring = document.expiresAt && (() => {
                    const days = Math.ceil((new Date(document.expiresAt).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                    return days <= 30 && days > 0;
                  })();

                  return (
                    <div 
                      key={document.id}
                      className="bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-2xs"
                      data-testid={`document-mobile-${document.id}`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-start gap-2 min-w-0 flex-1">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
                            document.isValid 
                              ? "bg-slate-50 text-slate-700 border-slate-200/80" 
                              : "bg-amber-50 text-amber-700 border-amber-200/80"
                          }`}>
                            <FileText className="w-3.5 h-3.5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <h4 
                              onClick={() => {
                                window.open(buildApiUrl(`/api/documents/${document.id}/file`), '_blank', 'noopener,noreferrer');
                              }}
                              className="text-xs font-semibold text-slate-900 truncate cursor-pointer hover:text-primary leading-snug"
                              title={document.fileName}
                            >
                              {document.fileName}
                            </h4>
                            <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                              <span className="text-2xs font-medium text-slate-500">
                                {getDocumentTypeLabel(document.type)}
                              </span>
                              {(document.extractedData as any)?.customDocumentName && (
                                <span 
                                  className="text-2xs font-medium text-slate-600 truncate max-w-[150px]"
                                  data-testid={`text-custom-name-mobile-${document.id}`}
                                >
                                  • {(document.extractedData as any).customDocumentName}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <Badge 
                          variant="outline"
                          className={`text-2xs px-2 py-0.5 rounded-md font-semibold shrink-0 ${
                            document.isValid 
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200/80" 
                              : "bg-amber-50 text-amber-700 border-amber-200/80"
                          }`}
                        >
                          {document.isValid ? "Válido" : "Revisión"}
                        </Badge>
                      </div>

                      <div className="bg-slate-50/80 rounded-lg p-2 border border-slate-100 text-2xs space-y-1 mb-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-slate-500 flex items-center gap-1">
                            <User className="w-3 h-3 text-slate-400" /> Cliente:
                          </span>
                          <span className="font-medium text-slate-800 truncate max-w-[65%]">
                            {clientName}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-slate-500">
                          <span>
                            {document.fileSize ? `${(document.fileSize / 1024).toFixed(1)} KB` : 'N/A'} • {formatDistanceToNow(new Date(document.uploadedAt!), { addSuffix: true, locale: es })}
                          </span>
                          {document.expiresAt && (
                            <span className={isExpiring ? "text-rose-600 font-semibold" : ""}>
                              Vence: {new Date(document.expiresAt).toLocaleDateString('es-MX')}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Botones de acción móvil con sufijo -mobile para garantizar unicidad de data-testid */}
                      <div className="flex items-center justify-end gap-1.5 pt-1">
                        <Button 
                          size="sm"
                          variant="outline"
                          className="flex-1 h-7 text-2xs font-medium border-slate-200 hover:bg-slate-50 text-slate-700 rounded-md inline-flex items-center justify-center gap-1"
                          onClick={() => {
                            window.open(buildApiUrl(`/api/documents/${document.id}/file`), '_blank', 'noopener,noreferrer');
                          }}
                          data-testid={`button-view-mobile-${document.id}`}
                        >
                          <Eye className="w-3 h-3" />
                          <span>Ver</span>
                        </Button>

                        <Button 
                          size="sm"
                          variant="outline"
                          className="h-7 w-7 p-0 border-slate-200 text-slate-600 rounded-md"
                          onClick={() => {
                            window.open(buildApiUrl(`/api/documents/${document.id}/download`), '_blank', 'noopener,noreferrer');
                          }}
                          title="Descargar documento"
                          data-testid={`button-download-mobile-${document.id}`}
                        >
                          <Download className="w-3 h-3" />
                        </Button>

                        <Button 
                          size="sm"
                          variant="outline"
                          className="h-7 w-7 p-0 border-slate-200 text-slate-600 rounded-md"
                          onClick={() => {
                            setEditingDocument(document);
                            setShowUpload(true);
                          }}
                          title="Editar documento"
                          data-testid={`button-edit-mobile-${document.id}`}
                        >
                          <Edit3 className="w-3 h-3" />
                        </Button>

                        <Button 
                          size="sm"
                          variant="outline"
                          className="h-7 w-7 p-0 border-slate-200 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 text-slate-500 rounded-md"
                          onClick={() => {
                            if (window.confirm('¿Estás seguro de que quieres eliminar este documento?')) {
                              deleteMutation.mutate(document.id);
                            }
                          }}
                          disabled={deleteMutation.isPending}
                          title="Eliminar documento"
                          data-testid={`button-delete-mobile-${document.id}`}
                        >
                          {deleteMutation.isPending ? (
                            <div className="w-2.5 h-2.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></div>
                          ) : (
                            <Trash2 className="w-3 h-3" />
                          )}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Upload Modal - Preserved internal form for Bloque 12.8 */}
          <Dialog open={showUpload} onOpenChange={setShowUpload}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-base font-semibold text-slate-900">
                  {editingDocument ? 'Editar Documento' : 'Subir Nuevo Documento'}
                </DialogTitle>
              </DialogHeader>
              {showUpload && (
                <DocumentUpload 
                  editingDocument={editingDocument}
                  onSuccess={() => {
                    setShowUpload(false);
                    setEditingDocument(null);
                    queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
                  }}
                />
              )}
            </DialogContent>
          </Dialog>
        </div>
      </main>
    </MainLayout>
  );
}
