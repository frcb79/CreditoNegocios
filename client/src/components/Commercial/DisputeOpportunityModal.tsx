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
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { AlertCircle, AlertTriangle, Loader2, Scale } from "lucide-react";
import { FORMAL_DISPUTE_REASON_OPTIONS } from "./CommercialLabels";
import type { FormalDisputeReason } from "@shared/schema";

interface DisputeOpportunityModalProps {
  isOpen: boolean;
  onClose: () => void;
  opportunityId: string;
  clientId: string;
  opportunityTitle?: string;
  onSuccess?: () => void;
}

export const DisputeOpportunityModal: React.FC<DisputeOpportunityModalProps> = ({
  isOpen,
  onClose,
  opportunityId,
  clientId,
  opportunityTitle,
  onSuccess,
}) => {
  const { user } = useAuth();
  const { toast } = useToast();

  const isMesaControl = user?.role === "super_admin" || user?.role === "admin";

  const [disputeReason, setDisputeReason] = useState<FormalDisputeReason>(
    isMesaControl ? "mesa_control_intervention" : "client_broker_change_request"
  );
  const [justification, setJustification] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [verificationMethod, setVerificationMethod] = useState("signed_letter");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetForm = () => {
    setDisputeReason(isMesaControl ? "mesa_control_intervention" : "client_broker_change_request");
    setJustification("");
    setEvidenceUrl("");
    setVerificationMethod("signed_letter");
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!justification.trim() || justification.trim().length < 10) {
      toast({
        title: "Justificación requerida",
        description: "Por favor describe ampliamente el motivo formal de la controversia (mínimo 10 caracteres).",
        variant: "destructive",
      });
      return;
    }

    if (disputeReason === "contradictory_evidence" && !evidenceUrl.trim()) {
      toast({
        title: "Evidencia obligatoria",
        description: "Para la causal de evidencia contradictoria debes proporcionar el enlace al documento probatorio.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await apiRequest("POST", `/api/opportunities/${opportunityId}/dispute`, {
        disputeReason,
        justification: justification.trim(),
        evidenceUrl: evidenceUrl.trim() || null,
        verificationMethod,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Error al abrir la controversia formal");
      }

      toast({
        title: "Controversia formal registrada",
        description: data.message || "La oportunidad ha sido colocada en estado de disputa para revisión de Mesa de Control.",
      });

      queryClient.invalidateQueries({ queryKey: ["/api/clients", clientId, "opportunities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/clients", clientId] });
      queryClient.invalidateQueries({ queryKey: ["/api/commercial/opportunities"] });

      handleClose();
      onSuccess?.();
    } catch (error: any) {
      toast({
        title: "No se pudo iniciar la controversia",
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
            <div className="p-2 rounded-lg bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300">
              <Scale className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold">Apertura Formal de Controversia</DialogTitle>
              <DialogDescription className="text-xs">
                {opportunityTitle ? `Para: ${opportunityTitle}` : "Procedimiento formal de resolución comercial"}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Alert className="border-amber-200 bg-amber-50/70 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200">
          <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <AlertTitle className="text-xs font-semibold">Regla de Protección de Derechos</AlertTitle>
          <AlertDescription className="text-[11px] mt-0.5">
            Una afirmación o nota unilateral de un broker no puede degradar ni congelar los derechos vigentes de otro asesor. Solo proceden controversias con solicitud verificable del cliente o evidencia contradictoria documental.
          </AlertDescription>
        </Alert>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="dispute-reason" className="text-xs font-semibold">
              Causal Formal de Controversia *
            </Label>
            <Select value={disputeReason} onValueChange={(val) => setDisputeReason(val as FormalDisputeReason)}>
              <SelectTrigger id="dispute-reason" className="text-xs">
                <SelectValue placeholder="Selecciona causal" />
              </SelectTrigger>
              <SelectContent>
                {FORMAL_DISPUTE_REASON_OPTIONS.filter((opt) => {
                  if (opt.value === "mesa_control_intervention") return isMesaControl;
                  return true;
                }).map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="text-xs">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {disputeReason === "client_broker_change_request" && (
            <div className="space-y-1.5">
              <Label htmlFor="dispute-method" className="text-xs font-semibold">
                Método de Verificación de Elección del Cliente *
              </Label>
              <Select value={verificationMethod} onValueChange={setVerificationMethod}>
                <SelectTrigger id="dispute-method" className="text-xs">
                  <SelectValue placeholder="Selecciona método" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="signed_letter" className="text-xs">
                    Carta membretada y firmada por representante legal
                  </SelectItem>
                  <SelectItem value="digital_token" className="text-xs">
                    Token seguro de confirmación digital
                  </SelectItem>
                  <SelectItem value="recorded_call" className="text-xs">
                    Grabación o validación telefónica registrada
                  </SelectItem>
                  {isMesaControl && (
                    <SelectItem value="mesa_control_manual" className="text-xs">
                      Validación manual de Mesa de Control
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="dispute-evidence" className="text-xs font-semibold">
              Enlace a Documento Probatorio / Carta {disputeReason === "contradictory_evidence" ? "*" : "(Recomendado)"}
            </Label>
            <Input
              id="dispute-evidence"
              type="url"
              placeholder="https://... carta firmada, expediente o constancia probatoria"
              value={evidenceUrl}
              onChange={(e) => setEvidenceUrl(e.target.value)}
              className="text-xs"
              required={disputeReason === "contradictory_evidence"}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="dispute-justification" className="text-xs font-semibold">
              Justificación Detallada *
            </Label>
            <Textarea
              id="dispute-justification"
              placeholder="Detalla los antecedentes, fecha de manifestación del cliente y fundamento de la solicitud..."
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              rows={3}
              required
              className="text-xs resize-none"
            />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={handleClose} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-red-600 hover:bg-red-700 text-white font-medium"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Abrir Controversia
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
