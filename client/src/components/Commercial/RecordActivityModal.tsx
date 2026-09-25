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
import { Badge } from "@/components/ui/badge";
import { COMMERCIAL_ACTIVITY_OPTIONS } from "./CommercialLabels";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, Info, Loader2, Sparkles, FileText } from "lucide-react";

interface RecordActivityModalProps {
  isOpen: boolean;
  onClose: () => void;
  opportunityId: string;
  clientId: string;
  opportunityTitle?: string;
  onSuccess?: () => void;
}

export const RecordActivityModal: React.FC<RecordActivityModalProps> = ({
  isOpen,
  onClose,
  opportunityId,
  clientId,
  opportunityTitle,
  onSuccess,
}) => {
  const { toast } = useToast();

  const [activityType, setActivityType] = useState("meeting_conducted");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedActivityMeta = COMMERCIAL_ACTIVITY_OPTIONS.find(
    (opt) => opt.value === activityType
  );

  const resetForm = () => {
    setActivityType("meeting_conducted");
    setTitle("");
    setDescription("");
    setEvidenceUrl("");
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast({
        title: "Título requerido",
        description: "Ingresa un resumen o título de la actividad realizada.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await apiRequest("POST", `/api/opportunities/${opportunityId}/activities`, {
        clientId,
        activityType,
        title: title.trim(),
        description: description.trim() || null,
        evidenceUrl: evidenceUrl.trim() || null,
        performedAt: new Date().toISOString(),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Error al registrar actividad");
      }

      toast({
        title: data.validForProtection
          ? "Actividad comercial calificada"
          : "Nota de seguimiento CRM registrada",
        description: data.message,
      });

      queryClient.invalidateQueries({ queryKey: ["/api/clients", clientId, "opportunities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/opportunities", opportunityId, "activities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/clients", clientId] });
      queryClient.invalidateQueries({ queryKey: ["/api/commercial/opportunities"] });

      handleClose();
      onSuccess?.();
    } catch (error: any) {
      toast({
        title: "No se pudo registrar la actividad",
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
            <div className="p-2 rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold">Registrar Actividad Comercial</DialogTitle>
              <DialogDescription className="text-xs">
                {opportunityTitle ? `Sobre: ${opportunityTitle}` : "Documenta el avance comercial"}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="act-type" className="text-xs font-semibold">
              Tipo de Actividad *
            </Label>
            <Select value={activityType} onValueChange={setActivityType}>
              <SelectTrigger id="act-type" className="text-xs">
                <SelectValue placeholder="Selecciona tipo de actividad" />
              </SelectTrigger>
              <SelectContent>
                <div className="px-2 py-1 text-[10px] font-semibold uppercase text-slate-400">
                  Actividades Calificadas (Extienden Protección)
                </div>
                {COMMERCIAL_ACTIVITY_OPTIONS.filter((opt) => opt.isQualifying).map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="text-xs">
                    <span className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      {opt.label}
                    </span>
                  </SelectItem>
                ))}

                <div className="px-2 py-1 text-[10px] font-semibold uppercase text-slate-400 mt-1 border-t">
                  Notas CRM (No Extienden Protección)
                </div>
                {COMMERCIAL_ACTIVITY_OPTIONS.filter((opt) => !opt.isQualifying).map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="text-xs">
                    <span className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                      {opt.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Banner explicativo del impacto en la protección comercial */}
          {selectedActivityMeta?.isQualifying ? (
            <div className="rounded-md p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-[11px] text-emerald-800 dark:text-emerald-300 flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">Actividad Estructurada Calificada:</span>{" "}
                Esta actividad valida la reserva inicial y extenderá la vigencia de la protección comercial por el periodo establecido en las políticas centrales.
              </div>
            </div>
          ) : (
            <div className="rounded-md p-3 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-700 dark:text-slate-300 flex items-start gap-2">
              <Info className="h-4 w-4 text-slate-500 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">Nota CRM de Seguimiento:</span> Esta anotación se guardará en la bitácora histórica para tu control interno, pero{" "}
                <span className="underline">no extenderá</span> la protección comercial frente a otros asesores.
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="act-title" className="text-xs font-semibold">
              Título o Resumen de la Actividad *
            </Label>
            <Input
              id="act-title"
              placeholder="Ej. Reunión presencial con Director de Finanzas"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="act-desc" className="text-xs font-semibold">
              Detalle y Acuerdos
            </Label>
            <Textarea
              id="act-desc"
              placeholder="Describe los puntos tratados, documentos solicitados o siguientes pasos..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="text-xs resize-none"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="act-url" className="text-xs font-semibold">
              Enlace a Documento o Minuta (Opcional)
            </Label>
            <Input
              id="act-url"
              type="url"
              placeholder="https://... enlace de minuta, acuse o documento en la nube"
              value={evidenceUrl}
              onChange={(e) => setEvidenceUrl(e.target.value)}
              className="text-xs"
            />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={handleClose} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Guardar Actividad
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
