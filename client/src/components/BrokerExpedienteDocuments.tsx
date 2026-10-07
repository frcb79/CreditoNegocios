import React, { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { buildApiUrl } from "@/lib/runtimeConfig";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  FileText,
  UploadCloud,
  Trash2,
  Download,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  FileCheck2,
  Building2,
  CreditCard,
  UserCheck,
} from "lucide-react";

export type ExpedienteDocType = "ine" | "csf" | "bank_statement";

interface ExpedienteDocConfig {
  type: ExpedienteDocType;
  title: string;
  subtitle: string;
  acceptedFormats: string;
  acceptAttribute: string;
  icon: React.ReactNode;
}

const EXPEDIENTE_SLOTS: ExpedienteDocConfig[] = [
  {
    type: "ine",
    title: "Identificación Oficial (INE / Pasaporte)",
    subtitle: "Identificación oficial vigente del titular o representante legal.",
    acceptedFormats: "PDF, JPG o PNG (máx. 10MB)",
    acceptAttribute: ".pdf,.jpg,.jpeg,.png",
    icon: <UserCheck className="h-5 w-5 text-blue-600 dark:text-blue-400" />,
  },
  {
    type: "csf",
    title: "Constancia de Situación Fiscal (SAT)",
    subtitle: "Constancia emitida por el SAT con antigüedad máxima de 3 meses para facturación y retenciones.",
    acceptedFormats: "Únicamente PDF (máx. 10MB)",
    acceptAttribute: ".pdf",
    icon: <Building2 className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />,
  },
  {
    type: "bank_statement",
    title: "Estado de Cuenta Bancario",
    subtitle: "Carátula bancaria donde sea legible la CLABE interbancaria coincidente con tu perfil de dispersión.",
    acceptedFormats: "Únicamente PDF (máx. 10MB)",
    acceptAttribute: ".pdf",
    icon: <CreditCard className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />,
  },
];

interface BrokerExpedienteDocumentsProps {
  user?: any;
}

export default function BrokerExpedienteDocuments({ user: propUser }: BrokerExpedienteDocumentsProps) {
  const { user: authUser } = useAuth();
  const currentUser = propUser || authUser;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [uploadingSlot, setUploadingSlot] = useState<ExpedienteDocType | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fileInputRefs = {
    ine: useRef<HTMLInputElement>(null),
    csf: useRef<HTMLInputElement>(null),
    bank_statement: useRef<HTMLInputElement>(null),
  };

  const isBrokerOrMaster =
    currentUser?.role === "broker" || currentUser?.role === "master_broker";

  // Fetch current broker profile documents
  const {
    data,
    isLoading,
    isError,
    refetch,
  } = useQuery<{ documents: any[] }>({
    queryKey: ["/api/broker/profile-documents", currentUser?.id],
    enabled: Boolean(currentUser?.id && isBrokerOrMaster),
    queryFn: async () => {
      const res = await fetch(buildApiUrl("/api/broker/profile-documents"), {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error("No fue posible cargar los documentos de expediente.");
      }
      return res.json();
    },
    staleTime: 30000,
  });

  const documents = data?.documents || [];

  // Mutation to upload document
  const uploadMutation = useMutation({
    mutationFn: async ({ file, type }: { file: File; type: ExpedienteDocType }) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", type);

      const res = await fetch(buildApiUrl("/api/broker/profile-documents"), {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Error al subir el archivo.");
      }
      return res.json();
    },
    onSuccess: (_, variables) => {
      toast({
        title: "Documento cargado con éxito",
        description: `Se actualizó correctamente el documento de expediente.`,
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/broker/profile-documents", currentUser?.id],
      });
    },
    onError: (err: any) => {
      toast({
        title: "Error al subir documento",
        description: err.message || "No se pudo completar la carga del archivo.",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setUploadingSlot(null);
    },
  });

  // Mutation to delete document
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(buildApiUrl(`/api/broker/profile-documents/${id}`), {
        method: "DELETE",
        credentials: "include",
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Error al eliminar el documento.");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Documento eliminado",
        description: "El archivo ha sido retirado de tu expediente.",
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/broker/profile-documents", currentUser?.id],
      });
    },
    onError: (err: any) => {
      toast({
        title: "Error al eliminar",
        description: err.message || "No fue posible eliminar el archivo.",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setDeletingId(null);
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: ExpedienteDocType) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "Archivo muy pesado",
        description: "El tamaño máximo permitido es de 10 MB.",
        variant: "destructive",
      });
      e.target.value = "";
      return;
    }

    setUploadingSlot(type);
    uploadMutation.mutate({ file, type });
    e.target.value = "";
  };

  const getDocForSlot = (type: ExpedienteDocType) => {
    return documents.find((d: any) => d.type === type);
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return "";
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const uploadedCount = EXPEDIENTE_SLOTS.filter((s) => Boolean(getDocForSlot(s.type))).length;

  if (!isBrokerOrMaster) {
    return null;
  }

  return (
    <Card className="border border-border/80 shadow-xs mb-6" data-testid="broker-expediente-section">
      <CardHeader className="py-3 px-4 sm:px-6 border-b border-border/60">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <CardTitle className="text-base font-semibold">
                Expediente para Dispersión de Comisiones
              </CardTitle>
              <Badge
                variant={uploadedCount === 3 ? "default" : "outline"}
                className={
                  uploadedCount === 3
                    ? "bg-emerald-600 text-white hover:bg-emerald-600 text-[10px] px-2 py-0.5"
                    : "text-amber-700 bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 text-[10px] px-2 py-0.5"
                }
              >
                {uploadedCount} de 3 cargados
              </Badge>
            </div>
            <CardDescription className="text-xs mt-0.5">
              Documentación fiscal y bancaria necesaria para procesar el pago y timbrado de tus comisiones.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {uploadedCount === 3 ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 rounded-md border border-emerald-200 dark:border-emerald-800">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Expediente Completo
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 px-2.5 py-1 rounded-md border border-amber-200 dark:border-amber-800">
                <AlertCircle className="h-3.5 w-3.5" />
                Pendiente de Carga
              </span>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-6 space-y-4">
        {/* Non-blocking Notice */}
        <Alert className="border-blue-200 bg-blue-50/80 text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200 text-xs py-2.5">
          <ShieldCheck className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
          <div className="ml-2">
            <AlertTitle className="font-semibold text-xs text-blue-900 dark:text-blue-200">
              Carga no bloqueante de operación
            </AlertTitle>
            <AlertDescription className="text-[11px] sm:text-xs text-blue-800 dark:text-blue-300 mt-0.5 leading-relaxed">
              Puedes continuar formalizando tu convenio y cotizando créditos con normalidad. Estos documentos serán verificados únicamente antes de la <strong>primera dispersión de tus comisiones ganadas</strong> para validar la cuenta bancaria receptora y emitir las constancias fiscales.
            </AlertDescription>
          </div>
        </Alert>

        {/* 3 Document Slots */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 pt-1">
          {EXPEDIENTE_SLOTS.map((slot) => {
            const existingDoc = getDocForSlot(slot.type);
            const isUploading = uploadingSlot === slot.type;
            const isDeleting = deletingId === existingDoc?.id;

            return (
              <div
                key={slot.type}
                className={`relative flex flex-col justify-between rounded-lg border p-4 transition-colors ${
                  existingDoc
                    ? "border-emerald-200/80 bg-emerald-50/30 dark:border-emerald-900/40 dark:bg-emerald-950/10"
                    : "border-border/80 bg-card hover:border-primary/40"
                }`}
                data-testid={`expediente-slot-${slot.type}`}
              >
                <div>
                  {/* Slot Header */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="p-2 rounded-md bg-muted/60 shrink-0">
                      {slot.icon}
                    </div>
                    {existingDoc ? (
                      <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200 hover:bg-emerald-100 text-[10px] px-2 py-0.5 shrink-0">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Cargado
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground text-[10px] px-2 py-0.5 shrink-0">
                        Pendiente
                      </Badge>
                    )}
                  </div>

                  <h4 className="font-semibold text-xs sm:text-sm text-foreground mb-1 leading-snug">
                    {slot.title}
                  </h4>
                  <p className="text-[11px] text-muted-foreground leading-relaxed mb-3">
                    {slot.subtitle}
                  </p>
                </div>

                {/* Upload or Details */}
                <div className="mt-auto pt-2 border-t border-border/50">
                  <input
                    type="file"
                    ref={fileInputRefs[slot.type]}
                    accept={slot.acceptAttribute}
                    className="hidden"
                    onChange={(e) => handleFileChange(e, slot.type)}
                    data-testid={`file-input-${slot.type}`}
                  />

                  {existingDoc ? (
                    <div className="space-y-2.5">
                      <div className="bg-background/80 rounded border border-border/60 p-2 text-[11px] truncate">
                        <div className="font-medium truncate text-foreground flex items-center gap-1.5" title={existingDoc.fileName}>
                          <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
                          <span className="truncate">{existingDoc.fileName}</span>
                        </div>
                        {existingDoc.fileSize && (
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            {formatFileSize(existingDoc.fileSize)}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 pt-0.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs flex-1 gap-1 px-2"
                          onClick={() => {
                            window.open(buildApiUrl(`/api/broker/profile-documents/${existingDoc.id}/download`), "_blank");
                          }}
                          data-testid={`button-download-${slot.type}`}
                        >
                          <Download className="h-3.5 w-3.5" />
                          Ver
                        </Button>

                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs px-2"
                          disabled={isUploading}
                          onClick={() => fileInputRefs[slot.type].current?.click()}
                          title="Reemplazar archivo"
                          data-testid={`button-replace-${slot.type}`}
                        >
                          {isUploading ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <UploadCloud className="h-3.5 w-3.5" />
                          )}
                        </Button>

                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs px-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          disabled={isDeleting}
                          onClick={() => {
                            if (window.confirm("¿Seguro que deseas eliminar este documento de tu expediente?")) {
                              setDeletingId(existingDoc.id);
                              deleteMutation.mutate(existingDoc.id);
                            }
                          }}
                          title="Eliminar archivo"
                          data-testid={`button-delete-${slot.type}`}
                        >
                          {isDeleting ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isUploading}
                        onClick={() => fileInputRefs[slot.type].current?.click()}
                        className="w-full h-8 text-xs font-medium border-dashed border-primary/50 text-primary hover:bg-primary/5"
                        data-testid={`button-upload-${slot.type}`}
                      >
                        {isUploading ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                            Cargando...
                          </>
                        ) : (
                          <>
                            <UploadCloud className="h-3.5 w-3.5 mr-1.5" />
                            Subir Archivo
                          </>
                        )}
                      </Button>
                      <p className="text-[10px] text-center text-muted-foreground truncate">
                        {slot.acceptedFormats}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
