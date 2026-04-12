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
import { Upload, Download, FileSpreadsheet, Building2, Users, CheckCircle2, XCircle, AlertCircle, Loader2 } from "lucide-react";

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

  const handleDownloadTemplate = async (type: 'financieras' | 'clients') => {
    try {
      const response = await fetch(`/api/import/template/${type}`, {
        credentials: 'include'
      });
      
      if (!response.ok) throw new Error('Error al descargar template');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = type === 'financieras' ? 'template_financieras_productos.xlsx' : 'template_clientes.xlsx';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({
        title: "Template descargado",
        description: `El template de ${type === 'financieras' ? 'financieras y productos' : 'clientes'} se descargó correctamente.`,
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

  const PreviewTable = ({ preview }: { preview: PreviewData }) => (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm text-gray-600">
          Mostrando {Math.min(5, preview.rows.length)} de {preview.totalRows} filas
        </p>
      </div>
      <ScrollArea className="h-64 border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 bg-gray-50">#</TableHead>
              {preview.headers.map((header, i) => (
                <TableHead key={i} className="bg-gray-50 whitespace-nowrap">
                  {header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {preview.rows.slice(0, 5).map((row, rowIndex) => (
              <TableRow key={rowIndex}>
                <TableCell className="font-mono text-gray-500">{rowIndex + 1}</TableCell>
                {preview.headers.map((header, colIndex) => (
                  <TableCell key={colIndex} className="whitespace-nowrap max-w-[200px] truncate">
                    {row[header] || '-'}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollArea>
    </div>
  );

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
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Importación Masiva</h1>
        <p className="text-gray-600 mt-1">
          Carga financieras, productos y clientes desde archivos Excel
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="financieras" className="gap-2">
            <Building2 className="w-4 h-4" />
            <span className="hidden sm:inline">Financieras y Productos</span>
            <span className="sm:hidden">Financieras</span>
          </TabsTrigger>
          <TabsTrigger value="clients" className="gap-2">
            <Users className="w-4 h-4" />
            Clientes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="financieras" className="mt-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Download className="w-5 h-5" />
                  Template de Financieras
                </CardTitle>
                <CardDescription>
                  Descarga el template para cargar financieras con sus productos y requisitos
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm">
                  <p className="font-medium text-blue-900 mb-2">El template incluye:</p>
                  <ul className="list-disc list-inside text-blue-800 space-y-1">
                    <li>Datos generales de la financiera</li>
                    <li>Información de contacto</li>
                    <li>Productos y configuración</li>
                    <li>Requisitos por tipo de cliente</li>
                    <li>Tasas de comisión</li>
                  </ul>
                </div>
                <Button 
                  onClick={() => handleDownloadTemplate('financieras')}
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
      </Tabs>
    </div>
  );
}
