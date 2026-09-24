import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { insertDocumentSchema } from "@shared/schema";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent } from "@/components/ui/card";
import { Client } from "@shared/schema";
import { UploadCloud, FolderOpen, Sparkles, Loader2, Upload } from "lucide-react";

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

const uploadSchema = z.object({
  clientId: z.string().optional(),
  creditId: z.string().optional(),
  type: z.string().min(1, "Tipo de documento requerido"),
  customDocumentName: z.string().optional(),
  file: z.any().optional(),
});

interface DocumentUploadProps {
  onSuccess?: () => void;
  onCancel?: () => void;
  preselectedClientId?: string;
  preselectedCreditId?: string;
  editingDocument?: any; // Document to edit
}

export default function DocumentUpload({ 
  onSuccess,
  onCancel,
  preselectedClientId,
  preselectedCreditId,
  editingDocument
}: DocumentUploadProps) {
  const { toast } = useToast();
  const [dragActive, setDragActive] = useState(false);

  const handleCancel = () => {
    form.reset();
    onCancel?.();
  };

  const { data: clients } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  const form = useForm({
    resolver: zodResolver(uploadSchema),
    defaultValues: {
      clientId: editingDocument?.clientId || preselectedClientId || "no-client",
      creditId: editingDocument?.creditId || preselectedCreditId || "no-client",
      type: editingDocument?.type || "",
      customDocumentName: editingDocument?.extractedData?.customDocumentName || "",
      file: null,
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const url = editingDocument ? `/api/documents/${editingDocument.id}` : "/api/documents";
      const method = editingDocument ? "PUT" : "POST";
      
      const response = await fetch(url, {
        method,
        body: data,
        credentials: "include",
      });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || `Error al ${editingDocument ? 'actualizar' : 'subir'} documento`);
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: editingDocument ? "Documento actualizado exitosamente" : "Documento subido exitosamente",
        description: "La extracción automática de información estará disponible pronto.",
      });
      form.reset();
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast({
        title: editingDocument ? "Error al actualizar documento" : "Error al subir documento",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: any) => {
    const formData = new FormData();
    
    // Only append file if provided (for editing, file might not change)
    if (data.file && data.file[0]) {
      formData.append("file", data.file[0]);
    }
    
    formData.append("type", data.type);
    if (data.customDocumentName) {
      formData.append("customDocumentName", data.customDocumentName);
    }
    if (data.clientId && data.clientId !== "no-client") {
      formData.append("clientId", data.clientId);
    }
    if (data.creditId && data.creditId !== "no-client") formData.append("creditId", data.creditId);
    
    uploadMutation.mutate(formData);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const fileList = Array.from(e.dataTransfer.files);
      form.setValue("file", fileList as any);
    }
  };

  const selectedFile = form.watch("file") as unknown as File[] | undefined;

  return (
    <Card className="border-0 shadow-none bg-transparent">
      <CardContent className="p-0">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="clientId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cliente (Opcional)</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-client-upload">
                          <SelectValue placeholder="Seleccionar cliente" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="no-client">Sin cliente específico</SelectItem>
                        {clients?.map((client) => (
                          <SelectItem key={client.id} value={client.id}>
                            {client.type === 'persona_moral' ? client.businessName : `${client.firstName} ${client.lastName}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de Documento</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-document-type-upload">
                          <SelectValue placeholder="Seleccionar tipo" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {documentTypes.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {form.watch("type") === "other" && (
              <FormField
                control={form.control}
                name="customDocumentName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre del documento *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Ej: Escritura pública del inmueble, Boleta predial, etc."
                        {...field}
                        data-testid="input-custom-document-name"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="file"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Archivo</FormLabel>
                  <FormControl>
                    <div
                      className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                        dragActive ? "border-primary bg-primary/5" : "border-border"
                      }`}
                      onDragEnter={handleDrag}
                      onDragLeave={handleDrag}
                      onDragOver={handleDrag}
                      onDrop={handleDrop}
                    >
                      <div className="space-y-4">
                        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                          <UploadCloud className="w-8 h-8 text-primary" />
                        </div>
                        
                        {selectedFile && selectedFile.length > 0 ? (
                          <div>
                            <p className="font-medium text-foreground">
                              Archivo seleccionado:
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {selectedFile[0] ? selectedFile[0].name : 'Archivo'} ({selectedFile[0] ? (selectedFile[0].size / 1024).toFixed(1) : '0'} KB)
                            </p>
                          </div>
                        ) : (
                          <div>
                            <p className="text-lg font-medium text-foreground mb-2">
                              Arrastra tu archivo aquí
                            </p>
                            <p className="text-muted-foreground mb-4">
                              o haz clic para seleccionar
                            </p>
                          </div>
                        )}
                        
                        <Input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                          onChange={(e) => field.onChange(e.target.files)}
                          className="hidden"
                          id="file-upload"
                          data-testid="input-file-upload"
                        />
                        <label
                          htmlFor="file-upload"
                          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary hover:bg-primary/90 cursor-pointer transition-colors"
                        >
                          <FolderOpen className="w-4 h-4 mr-2" />
                          Seleccionar Archivo
                        </label>
                        
                        <p className="text-xs text-muted-foreground">
                          Formatos soportados: PDF, JPG, PNG, DOC, DOCX (máx. 10MB)
                        </p>
                      </div>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* OCR Info */}
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <Sparkles className="w-5 h-5 text-primary mt-1 shrink-0" />
                <div>
                  <h4 className="font-medium text-foreground mb-1">
                    Extracción automática de información
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    Esta funcionalidad estará disponible pronto para ayudarte en la validación y gestión de documentos.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-4 pt-2">
              <Button 
                type="button" 
                variant="outline" 
                onClick={handleCancel}
                disabled={uploadMutation.isPending}
                data-testid="button-cancel-upload"
              >
                Cancelar
              </Button>
              <Button 
                type="submit" 
                disabled={uploadMutation.isPending}
                className="bg-primary text-white hover:bg-primary/90"
                data-testid="button-submit-upload"
              >
                {uploadMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4 mr-2" />
                )}
                Subir Documento
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
