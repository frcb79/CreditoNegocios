import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { InstitutionProductWithTemplate, InstitutionProductVersion } from "@shared/schema";
import { 
  GitBranch, 
  Calendar, 
  Hash, 
  FileText, 
  CheckCircle2, 
  Clock, 
  Archive, 
  ShieldCheck, 
  DollarSign, 
  Percent, 
  Layers, 
  Info,
  Check,
  Copy
} from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

interface OfferVersionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  offer: InstitutionProductWithTemplate | null;
  financieraName?: string;
}

export default function OfferVersionsModal({
  isOpen,
  onClose,
  offer,
  financieraName,
}: OfferVersionsModalProps) {
  const { toast } = useToast();
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  const { data: versions = [], isLoading } = useQuery<InstitutionProductVersion[]>({
    queryKey: [`/api/institution-products/${offer?.id}/versions`],
    enabled: !!offer?.id && isOpen,
  });

  const handleCopyHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    toast({
      title: "Hash copiado",
      description: "Hash SHA-256 de la versión copiado al portapapeles.",
    });
    setTimeout(() => setCopiedHash(null), 2000);
  };

  const formatCurrency = (val: any) => {
    if (val === undefined || val === null || val === "") return "N/D";
    const num = Number(val);
    if (isNaN(num)) return String(val);
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      maximumFractionDigits: 0,
    }).format(num);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "published":
      case "active":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Publicada / Vigente
          </span>
        );
      case "draft":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            Borrador
          </span>
        );
      case "superseded":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
            Reemplazada
          </span>
        );
      case "archived":
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
            Archivada
          </span>
        );
    }
  };

  if (!offer) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden bg-white border border-slate-200 rounded-2xl shadow-xl">
        {/* Header */}
        <div className="p-5 sm:p-6 bg-slate-50/70 border-b border-slate-200/80">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[#101F35] text-white">
                  <GitBranch className="w-3 h-3 text-[#2463D6]" />
                  Historial de Versiones
                </span>
                <span className="text-xs text-slate-500 font-medium">
                  {financieraName || "Institución Financiera"}
                </span>
              </div>
              <DialogTitle className="text-lg sm:text-xl font-bold text-[#101F35] tracking-tight">
                {offer.name || offer.customName || "Oferta Comercial"}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500 mt-1">
                Registro inmutable de versiones de la oferta con hash verificable y trazabilidad.
              </DialogDescription>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              {getStatusBadge(offer.status || "draft")}
              <span className="text-[11px] font-medium text-slate-500">
                Versión actual: <strong className="text-slate-900">v{offer.currentVersionNumber || 1}</strong>
              </span>
            </div>
          </div>
        </div>

        {/* Content / Timeline */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="p-4 rounded-xl border border-slate-200 space-y-3 bg-white">
                  <div className="flex justify-between items-center">
                    <Skeleton className="h-5 w-24" />
                    <Skeleton className="h-5 w-20" />
                  </div>
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ))}
            </div>
          ) : versions.length === 0 ? (
            <div className="text-center py-10 px-4 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
              <Clock className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-800">Sin versiones registradas</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Esta oferta aún no cuenta con un snapshot histórico en el registro.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {versions
                .slice()
                .sort((a, b) => (b.versionNumber || 0) - (a.versionNumber || 0))
                .map((version) => {
                  const cond = (version.conditions || {}) as any;
                  const req = (version.requirements || {}) as any;
                  const docs = Array.isArray(version.requiredDocuments) ? version.requiredDocuments : [];

                  return (
                    <div
                      key={version.id}
                      className="bg-white border border-slate-200/90 hover:border-slate-300 rounded-xl p-4 sm:p-5 shadow-xs transition-all space-y-3.5"
                    >
                      {/* Top Bar of Card */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded font-mono font-bold text-xs bg-slate-100 text-slate-800 border border-slate-200">
                            v{version.versionNumber}
                          </span>
                          {getStatusBadge(version.status)}
                          {version.versionNumber === offer.currentVersionNumber && (
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#2463D6] bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200/70">
                              Activa
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 text-[11px] text-slate-500">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span>
                            {version.createdAt
                              ? new Date(version.createdAt).toLocaleDateString("es-MX", {
                                  year: "numeric",
                                  month: "short",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : "Fecha no disponible"}
                          </span>
                        </div>
                      </div>

                      {/* Motivo de cambio */}
                      <div>
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 block mb-1">
                          Motivo del Snapshot:
                        </span>
                        <p className="text-xs text-slate-700 bg-slate-50/70 p-2.5 rounded-lg border border-slate-100">
                          {version.changeReason || "Alta inicial en borrador"}
                        </p>
                      </div>

                      {/* Condiciones Comerciales Snapshot */}
                      <div>
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 block mb-1.5">
                          Condiciones Comerciales Registradas:
                        </span>
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div className="p-2.5 bg-slate-50/60 rounded-lg border border-slate-200/60">
                            <span className="text-[10px] text-slate-400 block font-medium">Monto</span>
                            <span className="font-semibold text-slate-800 mt-0.5 block truncate">
                              {cond.minAmount ? formatCurrency(cond.minAmount) : "N/D"} — {cond.maxAmount ? formatCurrency(cond.maxAmount) : "N/D"}
                            </span>
                          </div>
                          <div className="p-2.5 bg-slate-50/60 rounded-lg border border-slate-200/60">
                            <span className="text-[10px] text-slate-400 block font-medium">Tasa Anual</span>
                            <span className="font-semibold text-slate-800 mt-0.5 block">
                              {cond.minInterestRate ?? "N/D"}% — {cond.maxInterestRate ?? "N/D"}%
                            </span>
                          </div>
                          <div className="p-2.5 bg-slate-50/60 rounded-lg border border-slate-200/60">
                            <span className="text-[10px] text-slate-400 block font-medium">Plazo</span>
                            <span className="font-semibold text-slate-800 mt-0.5 block">
                              {cond.minTermMonths ?? "N/D"} — {cond.maxTermMonths ?? "N/D"} meses
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Requisitos y Hash */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
                        <div className="flex items-center gap-1.5">
                          <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
                          <span className="text-[11px] text-slate-500">Hash de integridad:</span>
                          {version.versionHash ? (
                            <button
                              onClick={() => handleCopyHash(version.versionHash!)}
                              className="inline-flex items-center gap-1 font-mono text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200/80 hover:bg-slate-200 transition-colors"
                              title="Haga clic para copiar el hash completo"
                            >
                              <span>{version.versionHash.slice(0, 10)}...{version.versionHash.slice(-8)}</span>
                              {copiedHash === version.versionHash ? (
                                <Check className="w-3 h-3 text-emerald-600" />
                              ) : (
                                <Copy className="w-3 h-3 text-slate-400" />
                              )}
                            </button>
                          ) : (
                            <span className="text-[11px] text-slate-400 italic">No calculado</span>
                          )}
                        </div>

                        {version.publishedAt && (
                          <div className="text-[11px] text-emerald-700 font-medium">
                            Publicada el {new Date(version.publishedAt).toLocaleDateString("es-MX")}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-slate-500">
            <Info className="w-4 h-4 text-[#2463D6] shrink-0" />
            <span>
              <strong>Alcance B1:</strong> Catálogo y auditoría de versiones. La edición detallada de nuevas versiones estará disponible en <strong>B2</strong>.
            </span>
          </div>
          <Button
            onClick={onClose}
            variant="outline"
            size="sm"
            className="h-8 text-xs border-slate-300 text-slate-700 hover:bg-white"
          >
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
