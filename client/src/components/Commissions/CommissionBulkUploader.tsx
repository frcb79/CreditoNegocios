import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { 
  Download, 
  Upload, 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Loader2, 
  ArrowRight,
  RefreshCw,
  Building2
} from "lucide-react";

interface CommissionPreviewItem {
  id: string;
  name: string;
  currentRates: {
    financiera: { total: string; apertura: string; sobretasa: string; renovacion: string };
    masterBroker: { total: string; apertura: string; sobretasa: string; renovacion: string };
    broker: { total: string; apertura: string; sobretasa: string; renovacion: string };
  };
  newRates: {
    financiera: { total: string; apertura: string; sobretasa: string; renovacion: string };
    masterBroker: { total: string; apertura: string; sobretasa: string; renovacion: string };
    broker: { total: string; apertura: string; sobretasa: string; renovacion: string };
  };
  warnings: string[];
  isMatched: boolean;
}

interface PreviewResponse {
  preview: CommissionPreviewItem[];
  totalRows: number;
  matchedCount: number;
  unmatchedCount: number;
  warningsCount: number;
}

export default function CommissionBulkUploader() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<PreviewResponse | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);

  const handleDownloadTemplate = async () => {
    try {
      const response = await fetch('/api/import/template/commissions', {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Error al descargar plantilla');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Plantilla_Comisiones_Financieras.xlsx';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Plantilla descargada",
        description: "Plantilla oficial de comisiones generada con las financieras actuales.",
      });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "No se pudo descargar la plantilla de comisiones.",
        variant: "destructive"
      });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setPreviewData(null);
    }
  };

  const handlePreview = async () => {
    if (!selectedFile) return;
    setIsPreviewing(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await fetch('/api/import/preview/commissions', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || 'Error al previsualizar archivo de comisiones');
      }

      const data: PreviewResponse = await response.json();
      setPreviewData(data);

      toast({
        title: "Archivo analizado",
        description: `Se detectaron ${data.matchedCount} financieras coincidentes y ${data.warningsCount} alertas.`,
      });
    } catch (err: any) {
      toast({
        title: "Error en análisis",
        description: err.message || "No se pudo leer el archivo de comisiones.",
        variant: "destructive"
      });
    } finally {
      setIsPreviewing(false);
    }
  };

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile) throw new Error('No hay archivo seleccionado');
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await fetch('/api/import/commissions', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || 'Error al importar comisiones');
      }

      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/financial-institutions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/commissions'] });
      toast({
        title: "Comisiones actualizadas con éxito",
        description: `Se actualizaron ${data.updatedCount} financieras correctamente.`,
      });
      setSelectedFile(null);
      setPreviewData(null);
    },
    onError: (err: any) => {
      toast({
        title: "Error al aplicar comisiones",
        description: err.message || "Ocurrió un error al actualizar la base de datos.",
        variant: "destructive"
      });
    }
  });

  return (
    <div className="space-y-6">
      {/* Tarjeta de instrucciones y descarga */}
      <Card className="border-blue-200 bg-blue-50/40">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-600 text-white flex items-center justify-center">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="text-base text-blue-950">
                  Archivo Independiente de Comisiones de Red y Financieras
                </CardTitle>
                <CardDescription className="text-xs text-blue-800">
                  Actualiza masivamente las comisiones que otorgan las financieras y las que ofreces a Master Brokers y Brokers Directos sin alterar requisitos ni políticas crediticias.
                </CardDescription>
              </div>
            </div>
            <Button 
              onClick={handleDownloadTemplate} 
              variant="outline"
              className="border-blue-300 text-blue-800 hover:bg-blue-100/60 text-xs font-semibold h-9"
            >
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Descargar Plantilla Actual
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Selector de Archivo */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Upload className="w-4 h-4 text-primary" />
            Cargar Archivo de Comisiones (Excel .xlsx)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="border-2 border-dashed border-gray-300 hover:border-primary/60 transition-colors rounded-xl p-6 text-center bg-gray-50/50">
            <input 
              type="file" 
              accept=".xlsx, .xls" 
              id="commissions-file-input"
              className="hidden" 
              onChange={handleFileChange}
            />
            <label htmlFor="commissions-file-input" className="cursor-pointer space-y-2 block">
              <div className="w-12 h-12 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto">
                <FileSpreadsheet className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-800">
                  {selectedFile ? selectedFile.name : "Haz clic aquí para seleccionar tu archivo de comisiones"}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Formatos aceptados: .xlsx, .xls
                </p>
              </div>
            </label>
          </div>

          <div className="flex justify-end gap-3">
            {selectedFile && (
              <Button
                onClick={handlePreview}
                disabled={isPreviewing}
                className="bg-primary text-white text-xs h-9"
              >
                {isPreviewing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    Analizando archivo...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                    Previsualizar Cambios
                  </>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Previsualización de Cambios */}
      {previewData && (
        <Card className="border-gray-200">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <CardTitle className="text-sm font-semibold">
                  Previsualización de Actualización ({previewData.matchedCount} de {previewData.totalRows} Financieras)
                </CardTitle>
                <CardDescription className="text-xs">
                  Revisa los cambios antes de confirmar. Las comisiones anteriores se actualizarán en toda la plataforma.
                </CardDescription>
              </div>
              <Button
                onClick={() => importMutation.mutate()}
                disabled={importMutation.isPending || previewData.matchedCount === 0}
                className="bg-green-600 hover:bg-green-700 text-white text-xs font-semibold h-9"
              >
                {importMutation.isPending ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    Aplicando cambios...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                    Confirmar y Actualizar Comisiones
                  </>
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {previewData.warningsCount > 0 && (
              <Alert className="mb-4 bg-amber-50 border-amber-300">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <AlertTitle className="text-amber-800 text-xs font-bold">
                  Atención: Se detectaron {previewData.warningsCount} advertencias comerciales
                </AlertTitle>
                <AlertDescription className="text-xs text-amber-700">
                  Verifica que las comisiones ofrecidas a Master Brokers o Brokers Directos no superen lo que otorga la Financiera para evitar márgenes negativos.
                </AlertDescription>
              </Alert>
            )}

            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <Table>
                <TableHeader className="bg-gray-100 text-xs font-bold text-gray-700">
                  <TableRow>
                    <TableHead>Financiera</TableHead>
                    <TableHead className="text-center bg-blue-50/70 text-blue-900">Financiera (Apertura)</TableHead>
                    <TableHead className="text-center bg-green-50/70 text-green-900">Master Broker (Apertura)</TableHead>
                    <TableHead className="text-center bg-purple-50/70 text-purple-900">Bróker Directo (Apertura)</TableHead>
                    <TableHead className="text-center bg-amber-50/70 text-amber-900">Margen Casa Matriz</TableHead>
                    <TableHead>Estado / Alertas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="text-xs divide-y divide-gray-200">
                  {previewData.preview.map((item, idx) => {
                    const finAp = parseFloat(item.newRates.financiera.apertura || '0');
                    const mbAp = parseFloat(item.newRates.masterBroker.apertura || '0');
                    const brkAp = parseFloat(item.newRates.broker.apertura || '0');

                    const marginDirect = finAp - brkAp;
                    const marginMaster = finAp - mbAp;

                    return (
                      <TableRow key={idx} className={!item.isMatched ? "bg-red-50/40" : ""}>
                        <TableCell className="font-semibold text-gray-900 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5 text-gray-400" />
                            {item.name}
                          </div>
                        </TableCell>
                        <TableCell className="text-center bg-blue-50/30 font-medium">
                          <div className="flex items-center justify-center gap-1.5">
                            <span className="text-gray-400 line-through text-[11px]">
                              {item.currentRates.financiera.apertura}%
                            </span>
                            <ArrowRight className="w-3 h-3 text-blue-500" />
                            <span className="font-bold text-blue-700">
                              {item.newRates.financiera.apertura}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center bg-green-50/30 font-medium">
                          <div className="flex items-center justify-center gap-1.5">
                            <span className="text-gray-400 line-through text-[11px]">
                              {item.currentRates.masterBroker.apertura}%
                            </span>
                            <ArrowRight className="w-3 h-3 text-green-500" />
                            <span className="font-bold text-green-700">
                              {item.newRates.masterBroker.apertura}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center bg-purple-50/30 font-medium">
                          <div className="flex items-center justify-center gap-1.5">
                            <span className="text-gray-400 line-through text-[11px]">
                              {item.currentRates.broker.apertura}%
                            </span>
                            <ArrowRight className="w-3 h-3 text-purple-500" />
                            <span className="font-bold text-purple-700">
                              {item.newRates.broker.apertura}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center bg-amber-50/30">
                          <div className="text-[11px] font-medium space-y-0.5">
                            <div className={marginMaster < 0 ? "text-red-600 font-bold" : "text-gray-700"}>
                              Red Master: +{marginMaster.toFixed(2)}%
                            </div>
                            <div className={marginDirect < 0 ? "text-red-600 font-bold" : "text-gray-700"}>
                              Directo: +{marginDirect.toFixed(2)}%
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {item.warnings.length > 0 ? (
                            <div className="space-y-1">
                              {item.warnings.map((w, wIdx) => (
                                <Badge key={wIdx} variant="destructive" className="text-[10px] font-normal block py-0.5">
                                  {w}
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <Badge className="bg-green-100 text-green-800 border-green-300 text-[10px]">
                              <CheckCircle2 className="w-3 h-3 mr-1 inline text-green-600" />
                              Listo para aplicar
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
