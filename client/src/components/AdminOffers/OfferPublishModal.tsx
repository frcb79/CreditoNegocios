import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { InstitutionProductWithTemplate } from "@shared/schema";
import {
  Send,
  AlertTriangle,
  CheckCircle2,
  GitBranch,
  ShieldAlert,
  Percent,
  DollarSign,
  Clock,
  Layers,
  FileText,
  AlertCircle,
  Building2,
} from "lucide-react";

interface OfferPublishModalProps {
  isOpen: boolean;
  onClose: () => void;
  offer: InstitutionProductWithTemplate | null;
  financieraName?: string;
  onPublished?: () => void;
}

export default function OfferPublishModal({
  isOpen,
  onClose,
  offer,
  financieraName,
  onPublished,
}: OfferPublishModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [changeReason, setChangeReason] = useState("");
  const [confirmPublish, setConfirmPublish] = useState(false);

  // Consulta de revisión previa con validación y datos completos
  const { data: previewData, isLoading, error } = useQuery<any>({
    queryKey: [`/api/institution-products/${offer?.id}/publish-preview`],
    enabled: !!offer?.id && isOpen,
  });

  const publishMutation = useMutation({
    mutationFn: async (payload: { changeReason: string; confirmPublish: boolean }) => {
      const res = await fetch(`/api/institution-products/${offer?.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Error al publicar la oferta");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Oferta publicada exitosamente",
        description: `La versión v${data.publishedVersion?.versionNumber} ahora está vigente en el catálogo comercial.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/institution-products"] });
      queryClient.invalidateQueries({ queryKey: [`/api/institution-products/${offer?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/institution-products/${offer?.id}/versions`] });
      queryClient.invalidateQueries({ queryKey: [`/api/institution-products/${offer?.id}/draft`] });
      if (onPublished) onPublished();
      onClose();
    },
    onError: (err: any) => {
      toast({
        title: "Error de publicación",
        description: err.message || "No se pudo publicar la versión.",
        variant: "destructive",
      });
    },
  });

  const handlePublish = (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmPublish) {
      toast({
        title: "Confirmación requerida",
        description: "Debe confirmar explícitamente la publicación marcando la casilla de verificación.",
        variant: "destructive",
      });
      return;
    }

    if (changeReason.trim().length < 3) {
      toast({
        title: "Motivo obligatorio",
        description: "El motivo de publicación debe tener al menos 3 caracteres para trazabilidad y auditoría.",
        variant: "destructive",
      });
      return;
    }

    publishMutation.mutate({
      changeReason: changeReason.trim(),
      confirmPublish: true,
    });
  };

  const formatCurrency = (val: any) => {
    if (val === undefined || val === null || val === "") return "Pendiente";
    const num = Number(val);
    if (isNaN(num)) return String(val);
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      maximumFractionDigits: 0,
    }).format(num);
  };

  if (!offer) return null;

  const validation = previewData?.validation || { isValid: false, errors: [], warnings: [] };
  const summary = previewData?.summary;
  const draftVer = previewData?.draftVersion;
  const currentVer = previewData?.currentVersion;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden bg-white border border-slate-200 rounded-2xl shadow-2xl">
        <form onSubmit={handlePublish} className="flex flex-col h-full overflow-hidden">
          {/* Header */}
          <div className="p-5 sm:p-6 bg-slate-50/80 border-b border-slate-200/80">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-[#101F35] text-white">
                  <Send className="w-3 h-3 text-[#2463D6]" />
                  Revisión Previa y Publicación
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200/80">
                  <GitBranch className="w-3 h-3 text-emerald-600" />
                  Sustitución Segura A1
                </span>
              </div>

              {financieraName && (
                <div className="flex items-center gap-1 text-xs text-slate-500 font-medium">
                  <Building2 className="w-3.5 h-3.5 text-slate-400" />
                  <span>{financieraName}</span>
                </div>
              )}
            </div>

            <DialogTitle className="text-lg sm:text-xl font-bold text-[#101F35] tracking-tight">
              {offer.name || offer.customName || "Publicar Oferta Comercial"}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500 mt-0.5">
              Revisa los parámetros comerciales, advertencias y confirma formalmente la entrada en vigencia de la versión.
            </DialogDescription>

            {/* Aviso de sustitución y vigencia */}
            <div className="mt-3 p-2.5 bg-blue-50/70 border border-blue-200/70 rounded-xl flex items-center justify-between gap-2 text-[11px] text-blue-950">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#2463D6] shrink-0" />
                <span>
                  La versión borrador <strong>v{draftVer?.versionNumber || 1}</strong> pasará a estado <strong>Publicada</strong>
                  {currentVer ? ` y sustituirá de forma segura a la versión vigente v${currentVer.versionNumber}.` : "."}
                </span>
              </div>
              <Badge variant="outline" className="text-[10px] font-semibold bg-white text-blue-700 border-blue-200 shrink-0">
                Historial Inmutable
              </Badge>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-20 w-full rounded-xl" />
                <Skeleton className="h-32 w-full rounded-xl" />
                <Skeleton className="h-24 w-full rounded-xl" />
              </div>
            ) : error ? (
              <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>Error al cargar la revisión previa de publicación.</span>
              </div>
            ) : (
              <>
                {/* 1. Quality Gate / Errores o Advertencias */}
                {validation.errors.length > 0 && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-xl space-y-2 text-xs text-red-800">
                    <div className="flex items-center gap-1.5 font-bold text-red-900">
                      <ShieldAlert className="w-4 h-4 text-red-600" />
                      <span>Condiciones mínimas incompletas (Bloquea Publicación)</span>
                    </div>
                    <ul className="list-disc pl-5 space-y-1 text-[11px]">
                      {validation.errors.map((err: string, idx: number) => (
                        <li key={idx}>{err}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {validation.warnings.length > 0 && (
                  <div className="p-3.5 bg-amber-50/80 border border-amber-200/80 rounded-xl space-y-1.5 text-xs text-amber-900">
                    <div className="flex items-center gap-1.5 font-bold text-amber-950">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>Advertencias Comerciales y Campos Pendientes (Permite Publicar)</span>
                    </div>
                    <ul className="list-disc pl-5 space-y-1 text-[11px] text-amber-800">
                      {validation.warnings.map((warn: string, idx: number) => (
                        <li key={idx}>{warn}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* 2. Parámetros Financieros */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Montos */}
                  <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-[#101F35]">
                      <DollarSign className="w-3.5 h-3.5 text-[#2463D6]" />
                      <span>Rango de Monto</span>
                    </div>
                    <span className="text-xs font-semibold text-slate-800 block">
                      {summary?.amounts?.min ? formatCurrency(summary.amounts.min) : "Abierto"} — {summary?.amounts?.max ? formatCurrency(summary.amounts.max) : "Abierto"}
                    </span>
                    {summary?.amounts?.isPending && (
                      <Badge variant="outline" className="text-[9px] bg-slate-50 text-slate-500">
                        Monto Abierto
                      </Badge>
                    )}
                  </div>

                  {/* Tasas */}
                  <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-[#101F35]">
                      <Percent className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Tasa de Interés</span>
                    </div>
                    <span className="text-xs font-semibold text-slate-800 block">
                      {summary?.rates?.min !== null ? `${summary.rates.min}%` : "Pendiente"} — {summary?.rates?.max !== null ? `${summary.rates.max}%` : "Pendiente"}
                    </span>
                    {summary?.rates?.isPending && (
                      <Badge variant="outline" className="text-[9px] bg-amber-50 text-amber-700 border-amber-200">
                        Tasa Pendiente
                      </Badge>
                    )}
                  </div>

                  {/* Plazos */}
                  <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-[#101F35]">
                      <Clock className="w-3.5 h-3.5 text-amber-600" />
                      <span>Plazos</span>
                    </div>
                    <span className="text-xs font-semibold text-slate-800 block">
                      {summary?.terms?.min !== null ? `${summary.terms.min}` : "Abierto"} — {summary?.terms?.max !== null ? `${summary.terms.max} meses` : "Abierto"}
                    </span>
                    {summary?.terms?.isPending && (
                      <Badge variant="outline" className="text-[9px] bg-slate-50 text-slate-500">
                        Plazo Abierto
                      </Badge>
                    )}
                  </div>
                </div>

                {/* 3. Canales de Comisiones (Dos Canales Independientes B2.2 / B3) */}
                <div className="p-3.5 bg-slate-50/70 border border-slate-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#101F35] flex items-center gap-1.5">
                      <Percent className="w-3.5 h-3.5 text-[#2463D6]" />
                      <span>Esquema de Comisiones por Canal (Apertura)</span>
                    </span>
                    <span className="text-[11px] font-semibold text-blue-900">
                      Bolsa Financiera: {summary?.commissions?.financiera !== null ? `${summary?.commissions?.financiera}%` : "Pendiente"}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                    {/* Canal Directo */}
                    <div className="p-2.5 bg-white rounded-lg border border-emerald-200/70 text-xs space-y-1">
                      <div className="flex items-center justify-between font-bold text-emerald-950 text-[11px]">
                        <span>Canal Broker Directo</span>
                        <Badge variant="outline" className="text-[9px] bg-emerald-50 text-emerald-700 border-emerald-200">
                          Directo
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-600">
                        <span>Comisión Broker:</span>
                        <strong className="text-emerald-800">
                          {summary?.commissions?.brokerDirecto !== null ? `${summary.commissions.brokerDirecto}%` : "Pendiente"}
                        </strong>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-600">
                        <span>Margen Plataforma:</span>
                        <strong className="text-slate-900">
                          {summary?.commissions?.isMarginDirectPending ? "Pendiente" : `${summary.commissions.platformMarginDirect}%`}
                        </strong>
                      </div>
                    </div>

                    {/* Canal Master Broker */}
                    <div className="p-2.5 bg-white rounded-lg border border-purple-200/70 text-xs space-y-1">
                      <div className="flex items-center justify-between font-bold text-purple-950 text-[11px]">
                        <span>Canal Master Broker</span>
                        <Badge variant="outline" className="text-[9px] bg-purple-50 text-purple-700 border-purple-200">
                          Red
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-600">
                        <span>Techo Red Master:</span>
                        <strong className="text-purple-800">
                          {summary?.commissions?.masterBroker !== null ? `${summary.commissions.masterBroker}%` : "Pendiente"}
                        </strong>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-600">
                        <span>Margen Plataforma:</span>
                        <strong className="text-slate-900">
                          {summary?.commissions?.isMarginMasterPending ? "Pendiente" : `${summary.commissions.platformMarginMaster}%`}
                        </strong>
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-400 block italic leading-tight">
                    * Si falta una comisión, el margen de plataforma queda como pendiente (nunca calculado como 100% de la bolsa). Sobretasas aisladas exclusivamente para Super Admin.
                  </span>
                </div>

                {/* 4. Perfiles, Documentos y Elegibilidad */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-1.5">
                    <span className="font-bold text-[#101F35] block">Perfiles Admitidos</span>
                    <div className="flex flex-wrap gap-1">
                      {summary?.targetProfiles && summary.targetProfiles.length > 0 ? (
                        summary.targetProfiles.map((p: string) => (
                          <span key={p} className="px-2 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200/80">
                            {p}
                          </span>
                        ))
                      ) : (
                        <span className="text-slate-400 italic text-[11px]">Sin perfiles seleccionados</span>
                      )}
                    </div>
                  </div>

                  <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#101F35] block">Variables de Elegibilidad</span>
                      <Badge variant="outline" className="text-[9px] bg-amber-50 text-amber-700 border-amber-200">
                        Matching Inactivo
                      </Badge>
                    </div>
                    <span className="text-[11px] text-slate-500 block leading-tight">
                      Condiciones pendientes de verificación en expediente real del cliente. Quedan fuera del motor de Matching.
                    </span>
                  </div>
                </div>

                {/* 5. Formulario de Confirmación y Auditoría */}
                <div className="p-4 bg-slate-50/90 rounded-xl border border-slate-200 space-y-3 pt-3">
                  <div className="space-y-1">
                    <Label htmlFor="publish-reason" className="text-xs font-bold text-slate-800">
                      Motivo o Justificación Comercial de la Publicación <span className="text-red-500">*</span>
                    </Label>
                    <Textarea
                      id="publish-reason"
                      value={changeReason}
                      onChange={(e) => setChangeReason(e.target.value)}
                      placeholder="Ej. Aprobación formal de condiciones por mesa de riesgos y entrada en vigor del producto comercial..."
                      className="text-xs border-slate-200 bg-white min-h-[50px]"
                      rows={2}
                      required
                      data-testid="input-publish-reason"
                    />
                    <span className="text-[10px] text-slate-400 block">
                      Obligatorio para auditoría y trazabilidad histórica inmutable (mínimo 3 caracteres).
                    </span>
                  </div>

                  <div className="flex items-start space-x-2 pt-1 select-none">
                    <Checkbox
                      id="confirm-publish-checkbox"
                      checked={confirmPublish}
                      onCheckedChange={(checked) => setConfirmPublish(!!checked)}
                      className="mt-0.5"
                      data-testid="checkbox-confirm-publish"
                    />
                    <Label
                      htmlFor="confirm-publish-checkbox"
                      className="text-xs text-slate-700 leading-snug cursor-pointer font-medium"
                    >
                      Confirmo la revisión completa de esta oferta y autorizo su publicación formal y entrada en vigencia en el catálogo comercial.
                    </Label>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="text-[11px] text-slate-500">
              Estado actual: <span className="font-semibold text-amber-700">Borrador v{draftVer?.versionNumber || 1}</span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onClose}
                className="h-8 text-xs border-slate-200"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={
                  isLoading ||
                  publishMutation.isPending ||
                  !validation.isValid ||
                  !confirmPublish ||
                  changeReason.trim().length < 3
                }
                className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-1.5 shadow-sm disabled:opacity-50"
                data-testid="button-confirm-publish"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{publishMutation.isPending ? "Publicando..." : "Publicar Oferta"}</span>
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
