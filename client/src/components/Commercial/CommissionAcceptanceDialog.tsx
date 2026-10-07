import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Building2,
  Percent,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  FileCheck,
} from "lucide-react";

interface CommissionAcceptanceDialogProps {
  isOpen: boolean;
  onClose: () => void;
  institution: {
    id: string;
    name: string;
  } | null;
  rates?: {
    apertura?: string | number;
    sobretasa?: string | number;
    renovacion?: string | number;
    [key: string]: any;
  };
  ratesHash?: string;
  isOutdated?: boolean;
  onAccepted?: () => void;
}

export function CommissionAcceptanceDialog({
  isOpen,
  onClose,
  institution,
  rates,
  ratesHash,
  isOutdated = false,
  onAccepted,
}: CommissionAcceptanceDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [hasAcknowledged, setHasAcknowledged] = useState(false);

  const acceptMutation = useMutation({
    mutationFn: async () => {
      if (!institution?.id) throw new Error("Institución no seleccionada");
      return apiRequest(
        "POST",
        `/api/broker/commission-acceptances/${institution.id}`,
        {}
      );
    },
    onSuccess: () => {
      toast({
        title: "Esquema Comercial Aceptado",
        description: `Has aceptado exitosamente las condiciones comerciales para ${institution?.name}. Ahora puedes cotizar créditos con esta financiera.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/broker/commission-acceptances"] });
      queryClient.invalidateQueries({ queryKey: ["/api/financial-institutions"] });
      setHasAcknowledged(false);
      onAccepted?.();
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: "Error al aceptar esquema",
        description: error.message || "No se pudo registrar la aceptación comercial",
        variant: "destructive",
      });
    },
  });

  if (!institution) return null;

  const aperturaVal = rates?.apertura !== undefined ? String(rates.apertura) : "0";
  const sobretasaVal = rates?.sobretasa !== undefined ? String(rates.sobretasa) : "0";
  const renovacionVal = rates?.renovacion !== undefined ? String(rates.renovacion) : "0";

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md sm:max-w-lg p-0 overflow-hidden border-slate-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-900 to-indigo-900 text-white p-6 relative">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-xs flex items-center justify-center border border-white/20">
              <ShieldCheck className="w-5 h-5 text-blue-200" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-white flex items-center gap-2">
                Aceptación de Esquema Comercial
              </DialogTitle>
              <DialogDescription className="text-xs text-blue-200 mt-0.5">
                {institution.name}
              </DialogDescription>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Outdated alert if modified */}
          {isOutdated && (
            <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-200 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-900 leading-relaxed">
                <span className="font-bold block">Actualización de Condiciones Comerciales</span>
                Las tasas o comisiones de esta financiera han sido actualizadas. Es necesario que confirmes y aceptes el nuevo esquema vigente para continuar cotizando.
              </div>
            </div>
          )}

          {/* Rates Breakdown Card */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Percent className="w-4 h-4 text-blue-600" />
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Comisiones Asignadas
                </span>
              </div>
              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[11px] font-semibold">
                Esquema Vigente
              </Badge>
            </div>

            <div className="grid grid-cols-3 gap-3 pt-1">
              <div className="p-3 bg-white rounded-lg border border-slate-200/70 text-center shadow-2xs">
                <span className="text-[11px] text-slate-500 font-medium block">Apertura</span>
                <span className="text-base font-extrabold text-blue-600 block mt-0.5">
                  {aperturaVal}%
                </span>
                <span className="text-[10px] text-slate-400">Por colocación</span>
              </div>

              <div className="p-3 bg-white rounded-lg border border-slate-200/70 text-center shadow-2xs">
                <span className="text-[11px] text-slate-500 font-medium block">Sobretasa</span>
                <span className="text-base font-extrabold text-indigo-600 block mt-0.5">
                  {sobretasaVal}%
                </span>
                <span className="text-[10px] text-slate-400">Spread adicional</span>
              </div>

              <div className="p-3 bg-white rounded-lg border border-slate-200/70 text-center shadow-2xs">
                <span className="text-[11px] text-slate-500 font-medium block">Renovación</span>
                <span className="text-base font-extrabold text-emerald-600 block mt-0.5">
                  {renovacionVal}%
                </span>
                <span className="text-[10px] text-slate-400">Por recompra</span>
              </div>
            </div>

            {ratesHash && (
              <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                <span>Versión Técnica (Hash):</span>
                <span>{ratesHash.substring(0, 12)}...</span>
              </div>
            )}
          </div>

          {/* Legal / Policy Note */}
          <div className="p-3.5 bg-blue-50/60 rounded-xl border border-blue-100 flex items-start gap-2.5 text-xs text-slate-700 leading-relaxed">
            <FileCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <p>
              Al aceptar este esquema comercial, confirmas estar de acuerdo con las comisiones aplicables a las operaciones canalizadas hacia <strong>{institution.name}</strong>. Esta aceptación quedará registrada con fecha, hora, dirección IP y huella criptográfica.
            </p>
          </div>

          {/* Checkbox acknowledgement */}
          <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50/80 cursor-pointer transition-colors">
            <input
              type="checkbox"
              checked={hasAcknowledged}
              onChange={(e) => setHasAcknowledged(e.target.checked)}
              className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              data-testid="checkbox-acknowledge-commission-scheme"
            />
            <span className="text-xs text-slate-700 font-medium leading-normal select-none">
              He leído y acepto el esquema de comisiones y condiciones comerciales vigentes para {institution.name}.
            </span>
          </label>
        </div>

        {/* Footer */}
        <DialogFooter className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-2 sm:gap-0">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={acceptMutation.isPending}
            className="text-xs text-slate-600 hover:text-slate-900"
          >
            Cancelar
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={() => acceptMutation.mutate()}
            disabled={!hasAcknowledged || acceptMutation.isPending}
            className="text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-xs"
            data-testid="button-confirm-commission-acceptance"
          >
            {acceptMutation.isPending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                Registrando...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                Aceptar Esquema Comercial
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
