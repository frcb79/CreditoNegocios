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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FINANCING_NEEDS_OPTIONS } from "./CommercialLabels";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, Clock, Loader2, ShieldCheck, Sparkles } from "lucide-react";

interface CreateOpportunityModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: string;
  clientName?: string;
  onSuccess?: () => void;
}

export const CreateOpportunityModal: React.FC<CreateOpportunityModalProps> = ({
  isOpen,
  onClose,
  clientId,
  clientName,
  onSuccess,
}) => {
  const { toast } = useToast();

  const [title, setTitle] = useState("");
  const [financingNeedType, setFinancingNeedType] = useState("credito_empresarial");
  const [requestedAmount, setRequestedAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [conflictError, setConflictError] = useState<{
    message: string;
    conflictingOpportunity?: any;
  } | null>(null);

  const resetForm = () => {
    setTitle("");
    setFinancingNeedType("credito_empresarial");
    setRequestedAmount("");
    setNotes("");
    setConflictError(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !requestedAmount) {
      toast({
        title: "Campos requeridos",
        description: "Por favor ingresa un título y el monto solicitado para la oportunidad.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    setConflictError(null);

    try {
      const cleanAmount = requestedAmount.replace(/[^0-9.]/g, "");
      const res = await apiRequest("POST", `/api/clients/${clientId}/opportunities`, {
        title: title.trim(),
        financingNeedType,
        requestedAmount: cleanAmount,
        notes: notes.trim() || null,
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409 && data.conflict) {
          setConflictError({
            message: data.message || "Existe una oportunidad protegida vigente para esta necesidad.",
            conflictingOpportunity: data.conflictingOpportunity,
          });
          return;
        }
        throw new Error(data.message || "Error al registrar oportunidad");
      }

      toast({
        title: "Oportunidad registrada",
        description: data.message || "Oportunidad creada exitosamente en periodo de reserva inicial.",
      });

      queryClient.invalidateQueries({ queryKey: ["/api/clients", clientId, "opportunities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/clients", clientId] });
      queryClient.invalidateQueries({ queryKey: ["/api/commercial/opportunities"] });

      handleClose();
      onSuccess?.();
    } catch (error: any) {
      toast({
        title: "No se pudo registrar la oportunidad",
        description: error.message || "Ocurrió un error inesperado.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold">Nueva Oportunidad Comercial</DialogTitle>
              <DialogDescription className="text-xs">
                {clientName ? `Para: ${clientName}` : "Registra una necesidad de financiamiento protegida"}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {conflictError && (
          <Alert className="border-amber-300 bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <AlertTitle className="text-sm font-semibold">Protección Comercial Vigente de Otro Asesor</AlertTitle>
            <AlertDescription className="text-xs mt-1 space-y-1">
              <p>{conflictError.message}</p>
              <p className="text-[11px] text-amber-700 dark:text-amber-400">
                La plataforma protege el trabajo activo del broker titular. Para tramitar esta línea, el cliente debe emitir formalmente una confirmación de elección de broker o presentar una solicitud de cambio verificable a Mesa de Control.
              </p>
            </AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="opp-title" className="text-xs font-semibold">
              Título de la oportunidad *
            </Label>
            <Input
              id="opp-title"
              placeholder="Ej. Crédito simple para ampliación de bodega"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="text-sm"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="opp-need" className="text-xs font-semibold">
                Necesidad de Financiamiento *
              </Label>
              <Select value={financingNeedType} onValueChange={setFinancingNeedType}>
                <SelectTrigger id="opp-need" className="text-xs">
                  <SelectValue placeholder="Selecciona necesidad" />
                </SelectTrigger>
                <SelectContent>
                  {FINANCING_NEEDS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value} className="text-xs">
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="opp-amount" className="text-xs font-semibold">
                Monto Solicitado (MXN) *
              </Label>
              <Input
                id="opp-amount"
                type="text"
                placeholder="$2,500,000"
                value={requestedAmount}
                onChange={(e) => setRequestedAmount(e.target.value)}
                required
                className="text-sm font-medium"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="opp-notes" className="text-xs font-semibold">
              Notas iniciales de prospección
            </Label>
            <Textarea
              id="opp-notes"
              placeholder="Detalles sobre el destino del crédito, garantías disponibles o plazo estimado..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="text-xs resize-none"
            />
          </div>

          <div className="rounded-md p-3 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-400 flex items-start gap-2">
            <Clock className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                Regla de Protección Comercial:
              </span>{" "}
              Se asignará un periodo de reserva inicial según las políticas del sistema. Registra actividades estructuradas (reunión, carga de documentos o cotización) para extender la protección comercial.
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={handleClose} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Registrar Oportunidad
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
