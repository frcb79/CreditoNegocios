import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Upload, Download, FileSpreadsheet, Building2, Users, CheckCircle2, XCircle, AlertCircle, Loader2, Sparkles } from "lucide-react";
import MainLayout from "@/components/MainLayout";
import Header from "@/components/Header";
import { downloadFinancierasTemplateClient } from "@/lib/excelTemplates";
import CommissionMasterV5Preview from "@/components/Commissions/CommissionMasterV5Preview";

interface ImportError {
  row: number;
  field: string;
  message: string;
  value: any;
}

interface PreviewData {
  headers: string[];
  rows: any[];
  totalRows: number;
}

interface ImportResult {
  success: boolean;
  imported: number;
  errors: ImportError[];
  warnings: string[];
}

export default function BulkImport() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("financieras");
  
  const [financierasFile, setFinancierasFile] = useState<File | null>(null);
  const [clientsFile, setClientsFile] = useState<File | null>(null);
  
  const [financierasPreview, setFinancierasPreview] = useState<PreviewData | null>(null);
  const [clientsPreview, setClientsPreview] = useState<PreviewData | null>(null);
  
  const [financierasResult, setFinancierasResult] = useState<ImportResult | null>(null);
  const [clientsResult, setClientsResult] = useState<ImportResult | null>(null);
  
  const [isPreviewingFinancieras, setIsPreviewingFinancieras] = useState(false);
  const [financierasV5Issues, setFinancierasV5Issues] = useState<{ row: number; field: string; level: string; message: string }[]>([]);
  const [canApplyFinancieras, setCanApplyFinancieras] = useState(false);
  const [applyingFinancieras, setApplyingFinancieras] = useState(false);
  const [appliedFinancieras, setAppliedFinancieras] = useState<string | null>(null);
  const [financierasV5Match, setFinancierasV5Match] = useState<{row:number; action:string}[]>([]);
  const [isPreviewingClients, setIsPreviewingClients] = useState(false);

  const handleDownloadTemplate = async (type: 'financieras' | 'clients') => {
    try {
      if (type === 'financieras') {
        downloadFinancierasTemplateClient();
        toast({
          title: "Template descargado",
          description: "La plantilla oficial de financieras con comisiones para Super Admin se generó y descargó correctamente.",
        });
        return;
      }

      const response = await fetch(`/api/import/template/${type}`, {
        credentials: 'include'
      });
      
      if (!response.ok) throw new Error('Error al descargar template');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'template_clientes.xlsx';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({
        title: "Template descargado",
        description: "El template de clientes se descargó correctamente.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudo descargar el template.",
        variant: "destructive",
      });
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, type: 'financieras' | 'clients') => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (type === 'financieras') {
      setFinancierasFile(file);
      setFinancierasPreview(null);
      setFinancierasV5Issues([]);
      setFinancierasV5Match([]);
      setCanApplyFinancieras(false);
      setAppliedFinancieras(null);
      setFinancierasResult(null);
    } else {
      setClientsFile(file);
      setClientsPreview(null);
      setClientsResult(null);
    }
  };

  const handlePreview = async (type: 'financieras' | 'clients') => {
    const file = type === 'financieras' ? financierasFile : clientsFile;
    if (!file) return;
    
    const setLoading = type === 'financieras' ? setIsPreviewingFinancieras : setIsPreviewingClients;
    const setPreview = type === 'financieras' ? setFinancierasPreview : setClientsPreview;
    
    setLoading(true);
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch(type === 'financieras' ? '/api/import/v5/preview/financieras' : '/api/import/preview/clients', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Error al previsualizar');
      }
      
      const data = await response.json();
      if (type === 'financieras') {
        setFinancierasV5Issues([...(data.errors || []), ...(data.warnings || [])]);
        setFinancierasV5Match(data.matches || []);
        setCanApplyFinancieras(Boolean(data.writable) && (data.errors || []).length === 0);
        setAppliedFinancieras(null);
        const columns = ['Financiera', 'Oferta', 'Familia', 'Perfiles', 'Monto mínimo', 'Monto máximo', 'Estatus'];
        setPreview({
          headers: columns, totalRows: data.totalRows,
          rows: (data.rows || []).map((r: any) => ({
            'Financiera': r.financiera,
            'Oferta': r.nombreOferta,
            'Familia': r.familia,
            'Perfiles': (r.perfiles || []).join(', '),
            'Monto mínimo': r.montoMinimo,
            'Monto máximo': r.montoMaximoVariable || r.montoMaximo,
            'Estatus': (r.issues || []).some((i: any) => i.level === 'error') ? 'Error' :
              (r.issues || []).length ? 'Revisar' : 'Validado',
          })),
        });
      } else {
        setPreview(data);
      }
    } catch (error: any) {
      toast({
        title: "Error de previsualización",
        description: error.message || "No se pudo previsualizar el archivo.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const applyFinancierasV5 = async () => {
    if (!financierasFile || !canApplyFinancieras || applyingFinancieras) return;
    if (!window.confirm("¿Importar las ofertas V5 como BORRADORES en Staging? No se publicará ningún producto.")) return;
    setApplyingFinancieras(true);
    try {
      const formData = new FormData();
      formData.append("file", financierasFile);
      const res = await fetch("/api/import/v5/apply/financieras", {
        method: "POST", body: formData, credentials: "include",
      });
      const body = await res.json();
      if (!res.ok) throw Error(body.message || "No se pudo importar el maestro");
      setAppliedFinancieras(
        "Financieras creadas: " + body.result.institutionsCreated +
        "; ofertas en borrador: " + body.result.offersCreated +
        "; ofertas existentes sin cambio: " + body.result.alreadyPresent);
      setCanApplyFinancieras(false);
      queryClient.invalidateQueries({ queryKey: ["/api/financial-institutions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/institution-products"] });
      toast({ title: "Importación de borradores confirmada en Staging",
        description: "No se publicaron ofertas ni se actualizaron comisiones globales." });
    } catch (e: any) {
      toast({ title: "Importación rechazada", description: e.message, variant: "destructive" });
    } finally {
      setApplyingFinancieras(false);
    }
  };

  const importClientsMutation = useMutation({
    mutationFn: async () => {
      if (!clientsFile) throw new Error('No hay archivo seleccionado');
      
      const formData = new FormData();
      formData.append('file', clientsFile);
      
      const response = await fetch('/api/import/clients', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Error al importar');
      }
      
      return response.json();
    },
    onSuccess: (result) => {
      setClientsResult(result);
      queryClient.invalidateQueries({ queryKey: ['/api/clients'] });
      
      if (result.success && result.errors.length === 0) {
        toast({
          title: "Importación exitosa",
          description: `Se importaron ${result.imported} clientes correctamente.`,
        });
      } else if (result.imported > 0) {
        toast({
          title: "Importación parcial",
          description: `Se importaron ${result.imported} clientes. ${result.errors.length} errores encontrados.`,
          variant: "default",
        });
      } else {
        toast({
          title: "Error en importación",
          description: "No se pudieron importar los datos. Revisa los errores.",
          variant: "destructive",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Error al importar los datos.",
        variant: "destructive",
      });
    }
  });

  const DropZone = ({ 
    type, 
    file, 
    onFileChange 
  }: { 
    type: 'financieras' | 'clients';
    file: File | null;
    onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  }) => {
    const [isDragging, setIsDragging] = useState(false);
    
    const handleDrop = useCallback((e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile && (droppedFile.name.endsWith('.xlsx') || droppedFile.name.endsWith('.xls'))) {
        const event = { target: { files: [droppedFile] } } as any;
        onFileChange(event);
      }
    }, [onFileChange]);
    
    return (
      <div
        className={`border-2 border-dashed rounded-lg p-5 sm:p-6 text-center transition-colors cursor-pointer ${
          isDragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 bg-muted/20'
        }`}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <input
          type="file"
          id={`file-${type}`}
          accept=".xlsx,.xls"
          onChange={onFileChange}
          className="hidden"
        />
        <label htmlFor={`file-${type}`} className="cursor-pointer block">
          <div className="flex flex-col items-center gap-2">
            {file ? (
              <>
                <FileSpreadsheet className="w-8 h-8 text-emerald-600" />
                <div>
                  <p className="font-semibold text-xs text-foreground">{file.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {(file.size / 1024).toFixed(1)} KB • Listo para previsualizar
                  </p>
                </div>
              </>
            ) : (
              <>
                <Upload className="w-7 h-7 text-muted-foreground/70" />
                <div>
                  <p className="font-semibold text-xs text-foreground">
                    Arrastra tu archivo Excel (.xlsx, .xls)
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    o haz clic aquí para seleccionarlo
                  </p>
                </div>
              </>
            )}
          </div>
        </label>
      </div>
    );
  };

  const PreviewTable = ({ preview }: { preview: PreviewData }) => {
    const hasMatchingFields = preview.headers.some(h => 
      h.includes('buro') || h.includes('ingreso_anual') || h.includes('ventas_terminal') || h.includes('atrasos')
    );

    return (
      <div className="mt-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground">
            Mostrando {Math.min(200, preview.rows.length)} de {preview.totalRows} filas detectadas
          </p>
          {hasMatchingFields && (
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-emerald-500/30 text-[10px] py-0.5">
              ✓ Columnas de Matching Detectadas
            </Badge>
          )}
        </div>
        <div className="border border-border/80 rounded-lg overflow-hidden bg-card shadow-xs">
          <ScrollArea className="h-56">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="w-10 text-[11px] font-bold text-muted-foreground">#</TableHead>
                  {preview.headers.map((header, i) => (
                    <TableHead key={i} className="text-[11px] whitespace-nowrap font-semibold text-muted-foreground">
                      {header}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.rows.slice(0, 200).map((row, rowIndex) => (
                  <TableRow key={rowIndex} className="hover:bg-muted/30">
                    <TableCell className="font-mono text-[11px] text-muted-foreground">{rowIndex + 1}</TableCell>
                    {preview.headers.map((header, colIndex) => (
                      <TableCell key={colIndex} className="whitespace-nowrap text-xs max-w-[190px] truncate text-foreground">
                        {row[header] !== undefined && row[header] !== '' ? String(row[header]) : <span className="text-muted-foreground/40">-</span>}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </div>
      </div>
    );
  };

  const ErrorList = ({ result }: { result: ImportResult }) => (
    <div className="mt-3 space-y-3">
      <div className="flex items-center gap-3 text-xs">
        <div className="flex items-center gap-1.5 font-medium text-emerald-800 dark:text-emerald-300">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>{result.imported} registros importados</span>
        </div>
        {result.errors.length > 0 && (
          <div className="flex items-center gap-1.5 font-medium text-destructive">
            <XCircle className="w-4 h-4 text-destructive" />
            <span>{result.errors.length} errores encontrados</span>
          </div>
        )}
      </div>
      
      {result.errors.length > 0 && (
        <div className="border border-destructive/30 rounded-lg overflow-hidden bg-card">
          <ScrollArea className="h-44">
            <Table>
              <TableHeader>
                <TableRow className="bg-destructive/5">
                  <TableHead className="w-14 text-[11px] font-bold">Fila</TableHead>
                  <TableHead className="text-[11px] font-bold">Campo</TableHead>
                  <TableHead className="text-[11px] font-bold">Error</TableHead>
                  <TableHead className="text-[11px] font-bold">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.errors.map((error, i) => (
                  <TableRow key={i} className="hover:bg-destructive/5">
                    <TableCell className="font-mono text-xs text-muted-foreground">{error.row}</TableCell>
                    <TableCell className="font-medium text-xs text-foreground">{error.field}</TableCell>
                    <TableCell className="text-xs text-destructive">{error.message}</TableCell>
                    <TableCell className="font-mono text-[11px] text-muted-foreground truncate max-w-[140px]">
                      {String(error.value) || '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </div>
      )}
      
      {result.warnings.length > 0 && (
        <Alert className="py-2.5 px-3">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle className="text-xs font-semibold">Advertencias</AlertTitle>
          <AlertDescription>
            <ul className="list-disc list-inside text-xs mt-1 space-y-0.5">
              {result.warnings.map((warning, i) => (
                <li key={i}>{warning}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );

  return (
    <MainLayout>
      <Header 
        title="Importación Masiva"
        subtitle="Carga y sincroniza financieras, comisiones de red y cartera de clientes desde Excel"
      />
      <main className="flex-1 p-3 sm:p-5 lg:p-6 overflow-y-auto space-y-4">

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="overflow-x-auto pb-1 -mx-1 px-1">
          <TabsList className="inline-flex w-full min-w-[340px] sm:max-w-md h-9 p-1 bg-muted/70 rounded-lg">
            <TabsTrigger value="financieras" className="flex-1 text-xs font-medium py-1 px-2 gap-1.5">
              <Building2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Financieras y Productos</span>
              <span className="sm:hidden">Financieras</span>
            </TabsTrigger>
            <TabsTrigger value="comisiones" className="flex-1 text-xs font-medium py-1 px-2 gap-1.5">
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Comisiones Red</span>
            </TabsTrigger>
            <TabsTrigger value="clients" className="flex-1 text-xs font-medium py-1 px-2 gap-1.5">
              <Users className="w-3.5 h-3.5" />
              <span>Clientes</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="financieras" className="mt-4 space-y-4">
          <div className="max-w-5xl">
            <Card className="border border-border/80 shadow-xs flex flex-col justify-between">
              <CardHeader className="py-3 px-4 sm:px-5 border-b border-border/60">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Upload className="w-4 h-4 text-primary" />
                  Cargar Archivo Excel
                </CardTitle>
                <CardDescription className="text-xs">
                  Selecciona la V5 para validar estructura, perfiles y coincidencias; no modifica la base de datos.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 sm:p-5 space-y-3.5 flex-1 flex flex-col justify-between">
                <DropZone
                  type="financieras"
                  file={financierasFile}
                  onFileChange={(e) => handleFileChange(e, 'financieras')}
                />
                
                {financierasFile && !financierasPreview && !financierasResult && (
                  <Button 
                    onClick={() => handlePreview('financieras')}
                    disabled={isPreviewingFinancieras}
                    className="w-full h-9 text-xs font-medium"
                    variant="secondary"
                  >
                    {isPreviewingFinancieras ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                        Procesando...
                      </>
                    ) : (
                      'Previsualizar Datos'
                    )}
                  </Button>
                )}
                
                {financierasPreview && (
                  <>
                    <PreviewTable preview={financierasPreview} />
                    <div className="rounded-md border border-border p-3 text-xs space-y-1">
                      <p className="font-semibold">Coincidencias: {financierasV5Match.filter(m => m.action === 'existing_offer').length} ofertas existentes; {financierasV5Match.filter(m => m.action === 'new_offer' || m.action === 'new_institution_and_offer').length} por crear.</p>
                      <p>Observaciones por validar: {financierasV5Issues.length}</p>
                      {financierasV5Issues.slice(0, 16).map((issue, i) =>
                        <p key={i} className={issue.level === 'error' ? 'text-destructive' : 'text-muted-foreground'}>
                          Fila {issue.row} · {issue.field}: {issue.message}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button
                        onClick={() => {
                          setFinancierasFile(null);
                          setFinancierasPreview(null);
                        }}
                        variant="outline"
                        size="sm"
                        className="flex-1 h-9 text-xs"
                      >
                        Cancelar
                      </Button>
                      <div className="flex-1 rounded-md border border-amber-300/50 bg-amber-500/10 p-2 text-xs text-foreground">
                        Solo los borradores pueden importarse en Staging; publicación y comisiones quedan separadas.
                      </div>
 
                      {canApplyFinancieras && (
                        <Button size="sm" className="flex-1" disabled={applyingFinancieras}
                          onClick={applyFinancierasV5}>
                          {applyingFinancieras ? "Importando borradores..." : "Confirmar carga en Staging"}
                        </Button>
                      )}
                    </div>
                  </>
                )}
                
                {appliedFinancieras && (
                  <Alert><CheckCircle2 className="h-4 w-4" /><AlertDescription>{appliedFinancieras}</AlertDescription></Alert>
                )}
                {financierasResult && (
                  <>
                    <ErrorList result={financierasResult} />
                    <Button
                      onClick={() => {
                        setFinancierasFile(null);
                        setFinancierasPreview(null);
                        setFinancierasResult(null);
                      }}
                      variant="outline"
                      size="sm"
                      className="w-full h-9 text-xs"
                    >
                      Nueva Importación
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="clients" className="mt-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="border border-border/80 shadow-xs flex flex-col justify-between">
              <CardHeader className="py-3 px-4 sm:px-5 border-b border-border/60">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Download className="w-4 h-4 text-primary" />
                  Template de Clientes
                </CardTitle>
                <CardDescription className="text-xs">
                  Plantilla estandarizada para cargar prospectos y clientes con régimen fiscal
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 sm:p-5 space-y-3.5 flex-1 flex flex-col justify-between">
                <div className="bg-muted/30 border border-border/70 rounded-lg p-3 text-xs space-y-2">
                  <p className="font-semibold text-foreground">El archivo incluye pestañas dedicadas:</p>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline" className="text-[11px] bg-background">Persona Moral</Badge>
                    <Badge variant="outline" className="text-[11px] bg-background">PFAE</Badge>
                    <Badge variant="outline" className="text-[11px] bg-background">Persona Física</Badge>
                    <Badge variant="outline" className="text-[11px] bg-background">Sin SAT</Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Cada régimen cuenta con sus columnas específicas de perfilamiento. Usa la pestaña correspondiente a cada tipo.
                  </p>
                </div>
                <Button 
                  onClick={() => handleDownloadTemplate('clients')}
                  className="w-full h-9 text-xs font-medium"
                  variant="outline"
                >
                  <Download className="w-3.5 h-3.5 mr-1.5" />
                  Descargar Template de Clientes
                </Button>
              </CardContent>
            </Card>

            <Card className="border border-border/80 shadow-xs flex flex-col justify-between">
              <CardHeader className="py-3 px-4 sm:px-5 border-b border-border/60">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Upload className="w-4 h-4 text-primary" />
                  Cargar Archivo de Clientes
                </CardTitle>
                <CardDescription className="text-xs">
                  Sube el archivo Excel con los datos de clientes para validación y alta masiva
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 sm:p-5 space-y-3.5 flex-1 flex flex-col justify-between">
                <DropZone
                  type="clients"
                  file={clientsFile}
                  onFileChange={(e) => handleFileChange(e, 'clients')}
                />
                
                {clientsFile && !clientsPreview && !clientsResult && (
                  <Button 
                    onClick={() => handlePreview('clients')}
                    disabled={isPreviewingClients}
                    className="w-full h-9 text-xs font-medium"
                    variant="secondary"
                  >
                    {isPreviewingClients ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                        Procesando...
                      </>
                    ) : (
                      'Previsualizar Datos'
                    )}
                  </Button>
                )}
                
                {clientsPreview && (
                  <>
                    <PreviewTable preview={clientsPreview} />
                    <div className="flex gap-2 pt-1">
                      <Button
                        onClick={() => {
                          setClientsFile(null);
                          setClientsPreview(null);
                        }}
                        variant="outline"
                        size="sm"
                        className="flex-1 h-9 text-xs"
                      >
                        Cancelar
                      </Button>
                      <Button
                        onClick={() => importClientsMutation.mutate()}
                        disabled={importClientsMutation.isPending}
                        size="sm"
                        className="flex-1 h-9 text-xs font-semibold"
                      >
                        {importClientsMutation.isPending ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                            Importando...
                          </>
                        ) : (
                          <>
                            <Upload className="w-3.5 h-3.5 mr-1.5" />
                            Importar {clientsPreview.totalRows} Clientes
                          </>
                        )}
                      </Button>
                    </div>
                  </>
                )}
                
                {clientsResult && (
                  <>
                    <ErrorList result={clientsResult} />
                    <Button
                      onClick={() => {
                        setClientsFile(null);
                        setClientsPreview(null);
                        setClientsResult(null);
                      }}
                      variant="outline"
                      size="sm"
                      className="w-full h-9 text-xs"
                    >
                      Nueva Importación
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="comisiones" className="mt-4">
          <CommissionMasterV5Preview />
        </TabsContent>
      </Tabs>
      </main>
    </MainLayout>
  );
}
