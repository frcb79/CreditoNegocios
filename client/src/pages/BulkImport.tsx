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
import { Upload, Download, FileSpreadsheet, Building2, Users, CheckCircle2, XCircle, AlertCircle, Loader2, Sparkles, Layers, ShieldCheck } from "lucide-react";
import MainLayout from "@/components/MainLayout";
import Header from "@/components/Header";
import { downloadFinancierasTemplateClient } from "@/lib/excelTemplates";
import CommissionBulkUploader from "@/components/Commissions/CommissionBulkUploader";

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
  const [isPreviewingClients, setIsPreviewingClients] = useState(false);

  const [isSyncingSoc, setIsSyncingSoc] = useState(false);
  const [socResult, setSocResult] = useState<any | null>(null);

  const handleSyncSoc = async (file?: File) => {
    setIsSyncingSoc(true);
    try {
      let res;
      if (file) {
        const formData = new FormData();
        formData.append('file', file);
        res = await fetch('/api/import/financieras-soc', {
          method: 'POST',
          body: formData,
          credentials: 'include'
        });
      } else {
        res = await fetch('/api/import/financieras-soc', {
          method: 'POST',
          credentials: 'include'
        });
      }

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Error al sincronizar SOC');
      }

      const data = await res.json();
      setSocResult(data);
      queryClient.invalidateQueries({ queryKey: ['/api/financial-institutions'] });
      toast({
        title: "Sincronización Exitosa de Fichas SOC",
        description: `Se sincronizaron ${data.createdCount} creadas, ${data.updatedCount} actualizadas, y ${data.totalProductsCount} productos vinculados.`,
      });
    } catch (error: any) {
      toast({
        title: "Error al sincronizar SOC",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSyncingSoc(false);
    }
  };

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
      
      const response = await fetch(`/api/import/preview/${type}`, {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Error al previsualizar');
      }
      
      const data = await response.json();
      setPreview(data);
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

  const importFinancierasMutation = useMutation({
    mutationFn: async () => {
      if (!financierasFile) throw new Error('No hay archivo seleccionado');
      
      const formData = new FormData();
      formData.append('file', financierasFile);
      
      const response = await fetch('/api/import/financieras', {
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
      setFinancierasResult(result);
      queryClient.invalidateQueries({ queryKey: ['/api/financial-institutions'] });
      
      if (result.success && result.errors.length === 0) {
        toast({
          title: "Importación exitosa",
          description: `Se importaron ${result.imported} financieras/productos correctamente.`,
        });
      } else if (result.imported > 0) {
        toast({
          title: "Importación parcial",
          description: `Se importaron ${result.imported} registros. ${result.errors.length} errores encontrados.`,
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
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          isDragging ? 'border-primary bg-primary/5' : 'border-gray-300 hover:border-gray-400'
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
        <label htmlFor={`file-${type}`} className="cursor-pointer">
          <div className="flex flex-col items-center gap-3">
            {file ? (
              <>
                <FileSpreadsheet className="w-12 h-12 text-green-600" />
                <div>
                  <p className="font-medium text-gray-900">{file.name}</p>
                  <p className="text-sm text-gray-500">
                    {(file.size / 1024).toFixed(1)} KB
                  </p>
                </div>
              </>
            ) : (
              <>
                <Upload className="w-12 h-12 text-gray-400" />
                <div>
                  <p className="font-medium text-gray-700">
                    Arrastra tu archivo Excel aquí
                  </p>
                  <p className="text-sm text-gray-500">
                    o haz clic para seleccionar (.xlsx, .xls)
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
      <div className="mt-4 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            Mostrando {Math.min(5, preview.rows.length)} de {preview.totalRows} filas detectadas
          </p>
          {hasMatchingFields && (
            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300 text-xs">
              ✓ Columnas de Matching Detectadas
            </Badge>
          )}
        </div>
        <ScrollArea className="h-64 border rounded-md shadow-inner bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 bg-gray-50 text-xs font-bold">#</TableHead>
                {preview.headers.map((header, i) => (
                  <TableHead key={i} className="bg-gray-50 text-xs whitespace-nowrap font-semibold text-gray-700">
                    {header}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.rows.slice(0, 5).map((row, rowIndex) => (
                <TableRow key={rowIndex} className="hover:bg-blue-50/30">
                  <TableCell className="font-mono text-xs text-gray-500">{rowIndex + 1}</TableCell>
                  {preview.headers.map((header, colIndex) => (
                    <TableCell key={colIndex} className="whitespace-nowrap text-xs max-w-[200px] truncate">
                      {row[header] !== undefined && row[header] !== '' ? String(row[header]) : <span className="text-gray-300">-</span>}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
      </div>
    );
  };

  const ErrorList = ({ result }: { result: ImportResult }) => (
    <div className="mt-4 space-y-4">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-green-600" />
          <span className="font-medium">{result.imported} importados</span>
        </div>
        {result.errors.length > 0 && (
          <div className="flex items-center gap-2">
            <XCircle className="w-5 h-5 text-red-600" />
            <span className="font-medium text-red-600">{result.errors.length} errores</span>
          </div>
        )}
      </div>
      
      {result.errors.length > 0 && (
        <ScrollArea className="h-48 border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Fila</TableHead>
                <TableHead>Campo</TableHead>
                <TableHead>Error</TableHead>
                <TableHead>Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.errors.map((error, i) => (
                <TableRow key={i}>
                  <TableCell className="font-mono">{error.row}</TableCell>
                  <TableCell className="font-medium">{error.field}</TableCell>
                  <TableCell className="text-red-600">{error.message}</TableCell>
                  <TableCell className="font-mono text-gray-500 truncate max-w-[150px]">
                    {String(error.value) || '-'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
      )}
      
      {result.warnings.length > 0 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Advertencias</AlertTitle>
          <AlertDescription>
            <ul className="list-disc list-inside text-sm mt-1">
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
        subtitle="Carga financieras, productos y clientes desde archivos Excel"
      />
      <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto space-y-6">

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3 max-w-xl">
          <TabsTrigger value="financieras" className="gap-2">
            <Building2 className="w-4 h-4" />
            <span className="hidden sm:inline">Financieras y Productos</span>
            <span className="sm:hidden">Financieras</span>
          </TabsTrigger>
          <TabsTrigger value="comisiones" className="gap-2">
            <FileSpreadsheet className="w-4 h-4" />
            <span>Comisiones de Red</span>
          </TabsTrigger>
          <TabsTrigger value="clients" className="gap-2">
            <Users className="w-4 h-4" />
            Clientes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="financieras" className="mt-6 space-y-6">
          {/* Fichas Técnicas Oficiales SOC Banner Card */}
          <Card className="border-2 border-primary/30 bg-gradient-to-br from-primary/5 via-background to-blue-500/5 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-primary/10 text-primary">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-bold flex items-center gap-2">
                      Fichas Técnicas Financieras SOC (Oficial)
                      <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-300 text-[10px]">
                        17 Financieras • 31 Productos
                      </Badge>
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Sincroniza y migra directamente las políticas comerciales, productos de crédito (Simple, Revolvente, Arrendamiento, Factoraje, Hipotecario, Anticipo) y requisitos oficiales entregados por SOC.
                    </CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs text-muted-foreground border-border bg-background">
                    <ShieldCheck className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                    Respaldo JSON automático
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <Button
                  onClick={() => handleSyncSoc()}
                  disabled={isSyncingSoc}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-sm text-xs sm:text-sm"
                  data-testid="button-sync-soc"
                >
                  {isSyncingSoc ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Sincronizando Fichas SOC...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      Sincronizar Archivo Oficial (Fichas técnicas fiancieras SOC.xlsx)
                    </>
                  )}
                </Button>

                <label className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-2 text-xs font-medium ring-offset-background hover:bg-muted hover:text-accent-foreground cursor-pointer transition-colors">
                  <Upload className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                  <span>Subir otra versión de Fichas SOC</span>
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleSyncSoc(f);
                    }}
                  />
                </label>
              </div>

              {socResult && (
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs space-y-2">
                  <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-bold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Sincronización de Fichas SOC Completada con Éxito
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-muted-foreground">
                    <div className="bg-background/80 p-2 rounded border">
                      <span className="text-[10px] uppercase text-muted-foreground block font-sans">Nuevas Financieras</span>
                      <strong className="text-foreground text-sm">{socResult.createdCount}</strong>
                    </div>
                    <div className="bg-background/80 p-2 rounded border">
                      <span className="text-[10px] uppercase text-muted-foreground block font-sans">Actualizadas</span>
                      <strong className="text-foreground text-sm">{socResult.updatedCount}</strong>
                    </div>
                    <div className="bg-background/80 p-2 rounded border">
                      <span className="text-[10px] uppercase text-muted-foreground block font-sans">Productos Vinculados</span>
                      <strong className="text-foreground text-sm">{socResult.totalProductsCount}</strong>
                    </div>
                    <div className="bg-background/80 p-2 rounded border truncate" title={socResult.backupPath}>
                      <span className="text-[10px] uppercase text-muted-foreground block font-sans">Archivo de Respaldo</span>
                      <span className="text-[10px] text-muted-foreground truncate block">{socResult.backupPath?.split(/[\\/]/).pop()}</span>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Download className="w-5 h-5" />
                  Template de Financieras
                </CardTitle>
                <CardDescription>
                  Descarga el template oficial para cargar financieras con sus productos y reglas completas de matching
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4 text-sm space-y-3">
                  <p className="font-semibold text-blue-900 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-blue-600" />
                    Plantilla Actualizada con Reglas de Matching Completas:
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                    <div className="bg-white/80 p-2.5 rounded border border-blue-100 shadow-xs">
                      <p className="font-semibold text-blue-950 mb-1">🎯 Criterios de Matching (18 campos):</p>
                      <ul className="list-disc list-inside text-blue-900 space-y-0.5">
                        <li>Buró PF, Accionista y Empresa</li>
                        <li>Ingreso Mensual y Anual</li>
                        <li>Facturación TPV / Terminal</li>
                        <li>Tolerancia y Atrasos en Buró</li>
                        <li>Aval, SAT CIEC y Estados Fin.</li>
                        <li>Opinión SAT y Ventas Gobierno</li>
                      </ul>
                    </div>
                    <div className="bg-white/80 p-2.5 rounded border border-blue-100 shadow-xs">
                      <p className="font-semibold text-blue-950 mb-1">⚙️ Producto y Comisiones:</p>
                      <ul className="list-disc list-inside text-blue-900 space-y-0.5">
                        <li>Monto Min/Max y Plazo</li>
                        <li>Tasa de Interés y Apertura</li>
                        <li>Destinos y Giros Prohibidos</li>
                        <li className="font-semibold text-emerald-800">Comisiones Super Admin, Broker y Master</li>
                      </ul>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <Badge variant="outline" className="bg-emerald-100/80 text-emerald-900 border-emerald-300 text-xs font-medium">
                      ✓ Incluye columnas de Comisión Super Admin (Apertura, Sobretasa, Renovación)
                    </Badge>
                  </div>
                  <p className="text-xs text-blue-700 italic">
                    💡 Si la financiera ya existe, el sistema actualizará sus requisitos y agregará sus nuevos productos automáticamente sin duplicar.
                  </p>
                </div>
                <Button 
                  onClick={() => handleDownloadTemplate('financieras')}
                  className="w-full"
                  variant="outline"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Descargar Template de Financieras
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="w-5 h-5" />
                  Cargar Archivo
                </CardTitle>
                <CardDescription>
                  Sube el archivo Excel con los datos de financieras
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <DropZone
                  type="financieras"
                  file={financierasFile}
                  onFileChange={(e) => handleFileChange(e, 'financieras')}
                />
                
                {financierasFile && !financierasPreview && !financierasResult && (
                  <Button 
                    onClick={() => handlePreview('financieras')}
                    disabled={isPreviewingFinancieras}
                    className="w-full"
                    variant="secondary"
                  >
                    {isPreviewingFinancieras ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
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
                    <div className="flex gap-2">
                      <Button
                        onClick={() => {
                          setFinancierasFile(null);
                          setFinancierasPreview(null);
                        }}
                        variant="outline"
                        className="flex-1"
                      >
                        Cancelar
                      </Button>
                      <Button
                        onClick={() => importFinancierasMutation.mutate()}
                        disabled={importFinancierasMutation.isPending}
                        className="flex-1"
                      >
                        {importFinancierasMutation.isPending ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Importando...
                          </>
                        ) : (
                          <>
                            <Upload className="w-4 h-4 mr-2" />
                            Importar {financierasPreview.totalRows} Registros
                          </>
                        )}
                      </Button>
                    </div>
                  </>
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
                      className="w-full"
                    >
                      Nueva Importación
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="clients" className="mt-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Download className="w-5 h-5" />
                  Template de Clientes
                </CardTitle>
                <CardDescription>
                  Descarga el template para cargar clientes con todos sus datos
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm">
                  <p className="font-medium text-green-900 mb-2">El template incluye hojas para:</p>
                  <ul className="list-disc list-inside text-green-800 space-y-1">
                    <li><Badge variant="outline" className="ml-1">Persona Moral</Badge></li>
                    <li><Badge variant="outline" className="ml-1">PFAE</Badge> (Persona Física con Actividad Empresarial)</li>
                    <li><Badge variant="outline" className="ml-1">Persona Física</Badge></li>
                    <li><Badge variant="outline" className="ml-1">Sin SAT</Badge></li>
                  </ul>
                </div>
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-sm">
                    Cada tipo de cliente tiene campos específicos. Usa la hoja correspondiente para cada tipo.
                  </AlertDescription>
                </Alert>
                <Button 
                  onClick={() => handleDownloadTemplate('clients')}
                  className="w-full"
                  variant="outline"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Descargar Template
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="w-5 h-5" />
                  Cargar Archivo
                </CardTitle>
                <CardDescription>
                  Sube el archivo Excel con los datos de clientes
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <DropZone
                  type="clients"
                  file={clientsFile}
                  onFileChange={(e) => handleFileChange(e, 'clients')}
                />
                
                {clientsFile && !clientsPreview && !clientsResult && (
                  <Button 
                    onClick={() => handlePreview('clients')}
                    disabled={isPreviewingClients}
                    className="w-full"
                    variant="secondary"
                  >
                    {isPreviewingClients ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
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
                    <div className="flex gap-2">
                      <Button
                        onClick={() => {
                          setClientsFile(null);
                          setClientsPreview(null);
                        }}
                        variant="outline"
                        className="flex-1"
                      >
                        Cancelar
                      </Button>
                      <Button
                        onClick={() => importClientsMutation.mutate()}
                        disabled={importClientsMutation.isPending}
                        className="flex-1"
                      >
                        {importClientsMutation.isPending ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Importando...
                          </>
                        ) : (
                          <>
                            <Upload className="w-4 h-4 mr-2" />
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
                      className="w-full"
                    >
                      Nueva Importación
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="comisiones" className="mt-6">
          <CommissionBulkUploader />
        </TabsContent>
      </Tabs>
      </main>
    </MainLayout>
  );
}
