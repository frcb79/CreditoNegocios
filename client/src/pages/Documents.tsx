import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import DocumentUpload from "@/components/Documents/DocumentUpload";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Document, Client } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

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
  { value: "other", label: "Otro" },
];

export default function Documents() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterClient, setFilterClient] = useState<string>("all");
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
    if (!clientId) return "Sin cliente";
    const client = clients?.find(c => c.id === clientId);
    if (!client) return `Cliente ${clientId.slice(-8)}`;
    return client.type === 'persona_moral' 
      ? (client.businessName || 'Sin razón social') 
      : `${client.firstName || ''} ${client.lastName || ''}`.trim() || 'Sin nombre';
  };

  const getDocumentTypeLabel = (type: string) => {
    return documentTypes.find(dt => dt.value === type)?.label || type;
  };

  const filteredDocuments = documents?.filter(document => {
    const clientName = getClientName(document.clientId);
    const matchesSearch = 
      document.fileName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      document.type.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesType = filterType === "all" || document.type === filterType;
    const matchesClient = filterClient === "all" || document.clientId === filterClient;
    
    return matchesSearch && matchesType && matchesClient;
  }) || [];

  const documentsWithIssues = documents?.filter(d => !d.isValid).length || 0;
  const documentsExpiringSoon = documents?.filter(d => {
    if (!d.expiresAt) return false;
    const daysUntilExpiry = Math.ceil((new Date(d.expiresAt).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
    return daysUntilExpiry <= 30 && daysUntilExpiry > 0;
  }).length || 0;

  if (isLoading) {
    return (
      <div className="min-h-screen flex bg-gray-50">
        <Sidebar />
        <div className="flex-1 flex flex-col">
          <Header 
            title="Documentos"
            subtitle="Gestiona y organiza todos los documentos"
          />
          
          <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-32 w-full" />
                ))}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-48 w-full" />
                ))}
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header 
          title="Gestión de Documentos"
          subtitle="Organiza y gestiona todos los documentos de tus clientes"
          action={{
            label: "Subir Documento",
            onClick: () => setShowUpload(true)
          }}
        />
        
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <Card className="border border-gray-200">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-neutral text-sm font-medium">Total Documentos</p>
                    <p className="text-2xl font-bold text-gray-900">{documents?.length || 0}</p>
                    <p className="text-xs text-neutral mt-1">Archivos subidos</p>
                  </div>
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                    <i className="fas fa-file-alt text-primary text-lg"></i>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-gray-200">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-neutral text-sm font-medium">Documentos Válidos</p>
                    <p className="text-2xl font-bold text-success">
                      {documents?.filter(d => d.isValid).length || 0}
                    </p>
                    <p className="text-xs text-neutral mt-1">Procesados correctamente</p>
                  </div>
                  <div className="w-12 h-12 bg-success/10 rounded-lg flex items-center justify-center">
                    <i className="fas fa-check-circle text-success text-lg"></i>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-gray-200">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-neutral text-sm font-medium">Con Problemas</p>
                    <p className="text-2xl font-bold text-warning">{documentsWithIssues}</p>
                    <p className="text-xs text-neutral mt-1">Requieren atención</p>
                  </div>
                  <div className="w-12 h-12 bg-warning/10 rounded-lg flex items-center justify-center">
                    <i className="fas fa-exclamation-triangle text-warning text-lg"></i>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-gray-200">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-neutral text-sm font-medium">Próximos a Vencer</p>
                    <p className="text-2xl font-bold text-danger">{documentsExpiringSoon}</p>
                    <p className="text-xs text-neutral mt-1">En 30 días o menos</p>
                  </div>
                  <div className="w-12 h-12 bg-danger/10 rounded-lg flex items-center justify-center">
                    <i className="fas fa-clock text-danger text-lg"></i>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card className="mb-8">
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Input
                  placeholder="Buscar documentos..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  data-testid="input-search-documents"
                />
                
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger data-testid="select-document-type">
                    <SelectValue placeholder="Tipo de documento" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los tipos</SelectItem>
                    {documentTypes.map(type => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={filterClient} onValueChange={setFilterClient}>
                  <SelectTrigger data-testid="select-client-filter">
                    <SelectValue placeholder="Cliente" />
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

                <Button 
                  onClick={() => setShowUpload(true)}
                  className="bg-primary text-white hover:bg-primary-dark"
                  data-testid="button-upload-document"
                >
                  <i className="fas fa-upload mr-2"></i>
                  Subir Documento
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Documents Grid */}
          {filteredDocuments.length === 0 ? (
            <Card>
              <CardContent className="p-12">
                <div className="text-center">
                  <i className="fas fa-file-alt text-6xl text-gray-300 mb-6"></i>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    {documents?.length === 0 ? "No hay documentos" : "No se encontraron documentos"}
                  </h3>
                  <p className="text-neutral mb-6">
                    {documents?.length === 0 
                      ? "Comienza subiendo el primer documento de tus clientes."
                      : "Intenta con otros filtros de búsqueda."
                    }
                  </p>
                  <Button 
                    onClick={() => setShowUpload(true)}
                    className="bg-primary text-white hover:bg-primary-dark"
                  >
                    <i className="fas fa-plus mr-2"></i>
                    Subir Primer Documento
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredDocuments.map((document) => (
                <Card 
                  key={document.id}
                  className="border border-gray-200 hover:shadow-md transition-shadow"
                  data-testid={`document-${document.id}`}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                          <i className="fas fa-file-alt text-primary text-lg"></i>
                        </div>
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-sm truncate" title={document.fileName}>
                            {document.fileName}
                          </CardTitle>
                          <p className="text-xs text-neutral">
                            {getDocumentTypeLabel(document.type)}
                          </p>
                        </div>
                      </div>
                      <Badge 
                        variant={document.isValid ? "default" : "destructive"}
                        className={document.isValid ? "bg-success/10 text-success" : ""}
                      >
                        {document.isValid ? "Válido" : "Problema"}
                      </Badge>
                    </div>
                  </CardHeader>
                  
                  <CardContent className="space-y-4">
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-neutral">Cliente:</span>
                        <span className="font-medium truncate ml-2">
                          {getClientName(document.clientId)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-neutral">Tamaño:</span>
                        <span className="font-medium">
                          {document.fileSize ? `${(document.fileSize / 1024).toFixed(1)} KB` : 'N/A'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-neutral">Subido:</span>
                        <span className="font-medium text-xs">
                          {formatDistanceToNow(new Date(document.uploadedAt!), { 
                            addSuffix: true, 
                            locale: es 
                          })}
                        </span>
                      </div>
                      {document.expiresAt && (
                        <div className="flex justify-between">
                          <span className="text-neutral">Vence:</span>
                          <span className="font-medium text-xs">
                            {new Date(document.expiresAt).toLocaleDateString('es-MX')}
                          </span>
                        </div>
                      )}
                    </div>
                    
                    <div className="flex space-x-2 pt-4 border-t">
                      <Button 
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => {
                          // TODO: Implementar visualizador de documentos
                          alert('Visualizador de documentos próximamente');
                        }}
                        data-testid={`button-view-${document.id}`}
                      >
                        <i className="fas fa-eye mr-1"></i>
                        Ver
                      </Button>
                      <Button 
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          // TODO: Implementar descarga de documentos
                          alert('Descarga de documentos próximamente');
                        }}
                        title="Descargar documento"
                        data-testid={`button-download-${document.id}`}
                      >
                        <i className="fas fa-download"></i>
                      </Button>
                      <Button 
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingDocument(document);
                          setShowUpload(true);
                        }}
                        title="Editar documento"
                        data-testid={`button-edit-${document.id}`}
                      >
                        <i className="fas fa-edit"></i>
                      </Button>
                      <Button 
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                          if (window.confirm('¿Estás seguro de que quieres eliminar este documento?')) {
                            deleteMutation.mutate(document.id);
                          }
                        }}
                        disabled={deleteMutation.isPending}
                        title="Eliminar documento"
                        data-testid={`button-delete-${document.id}`}
                      >
                        {deleteMutation.isPending ? (
                          <i className="fas fa-spinner fa-spin"></i>
                        ) : (
                          <i className="fas fa-trash"></i>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Upload Modal */}
          <Dialog open={showUpload} onOpenChange={setShowUpload}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
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
        </main>
      </div>
    </div>
  );
}
