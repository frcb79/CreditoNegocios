import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { FinancialInstitution, ProductTemplate } from "@shared/schema";
import { Plus, AlertCircle, Sparkles, Building2, Layers } from "lucide-react";

interface NewOfferModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultInstitutionId?: string;
  defaultInstitutionName?: string;
}

const PRODUCT_TYPES = [
  { value: "credito_simple", label: "Crédito Simple" },
  { value: "credito_revolvente", label: "Línea de Crédito Revolvente" },
  { value: "arrendamiento", label: "Arrendamiento Puro / Financiero" },
  { value: "factoraje", label: "Factoraje Financiero" },
  { value: "credito_puente", label: "Crédito Puente / Construcción" },
  { value: "otro", label: "Otro Producto Especializado" },
];

const TARGET_PROFILES = [
  { id: "persona_moral", label: "Persona Moral (PM)" },
  { id: "fisica_empresarial", label: "Persona Física con Actividad Empresarial (PFAE)" },
  { id: "fisica", label: "Persona Física (PF)" },
  { id: "sin_sat", label: "Sin Declaraciones SAT / Flujo Bancario" },
];

export default function NewOfferModal({
  isOpen,
  onClose,
  defaultInstitutionId,
  defaultInstitutionName,
}: NewOfferModalProps) {
  const { toast } = useToast();

  const [institutionId, setInstitutionId] = useState<string>(defaultInstitutionId || "");
  const [name, setName] = useState<string>("");
  const [productType, setProductType] = useState<string>("credito_simple");
  const [templateId, setTemplateId] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [selectedProfiles, setSelectedProfiles] = useState<string[]>([
    "persona_moral",
    "fisica_empresarial",
  ]);

  // Initial conditions - Inician vacíos para permitir datos pendientes sin precargas no confirmadas
  const [minAmount, setMinAmount] = useState<string>("");
  const [maxAmount, setMaxAmount] = useState<string>("");
  const [minRate, setMinRate] = useState<string>("");
  const [maxRate, setMaxRate] = useState<string>("");
  const [minTerm, setMinTerm] = useState<string>("");
  const [maxTerm, setMaxTerm] = useState<string>("");

  // Load institutions list for selection if not pre-locked
  const { data: institutions = [] } = useQuery<FinancialInstitution[]>({
    queryKey: ["/api/financial-institutions"],
    enabled: isOpen && !defaultInstitutionId,
  });

  // Load templates list
  const { data: templates = [] } = useQuery<ProductTemplate[]>({
    queryKey: ["/api/product-templates"],
    enabled: isOpen,
  });

  useEffect(() => {
    if (defaultInstitutionId) {
      setInstitutionId(defaultInstitutionId);
    }
  }, [defaultInstitutionId, isOpen]);

  // Handle template selection auto-population
  const handleTemplateChange = (tmplId: string) => {
    setTemplateId(tmplId);
    if (!tmplId || tmplId === "none") return;
    const tmpl = templates.find((t) => t.id === tmplId);
    if (tmpl) {
      if (!name) setName(tmpl.name);
      if (tmpl.description && !description) setDescription(tmpl.description);
      if (tmpl.targetProfiles && tmpl.targetProfiles.length > 0) {
        setSelectedProfiles(tmpl.targetProfiles);
      }
      // Note: No se precargan montos, tasas ni plazos no confirmados;
      // se preserva el estado en blanco para capturar o validar solo lo ingresado
    }
  };

  const createMutation = useMutation({
    mutationFn: async (payload: any) => {
      const response = await fetch("/api/institution-products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Error al registrar la oferta comercial");
      }

      return response.json();
    },
    onSuccess: (createdOffer) => {
      queryClient.invalidateQueries({ queryKey: ["/api/institution-products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/financial-institutions"] });

      toast({
        title: "Oferta registrada como Borrador",
        description: `La oferta "${createdOffer.name || createdOffer.customName}" fue dada de alta exitosamente en estado borrador (v1).`,
      });

      // Reset and close
      handleClose();
    },
    onError: (err: any) => {
      toast({
        title: "Error al crear la oferta",
        description: err.message || "Ocurrió un error inesperado.",
        variant: "destructive",
      });
    },
  });

  const handleProfileToggle = (profileId: string) => {
    setSelectedProfiles((prev) =>
      prev.includes(profileId)
        ? prev.filter((p) => p !== profileId)
        : [...prev, profileId]
    );
  };

  const handleClose = () => {
    setName("");
    setDescription("");
    setTemplateId("");
    setMinAmount("");
    setMaxAmount("");
    setMinRate("");
    setMaxRate("");
    setMinTerm("");
    setMaxTerm("");
    createMutation.reset();
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!institutionId) {
      toast({
        title: "Institución requerida",
        description: "Debe seleccionar una institución financiera.",
        variant: "destructive",
      });
      return;
    }

    if (!name.trim()) {
      toast({
        title: "Nombre requerido",
        description: "Ingrese un nombre comercial para la oferta.",
        variant: "destructive",
      });
      return;
    }

    // Parsear condiciones solo si fueron capturadas (permitir datos pendientes)
    const parsedMinAmount = minAmount.trim() !== "" ? parseFloat(minAmount) : null;
    const parsedMaxAmount = maxAmount.trim() !== "" ? parseFloat(maxAmount) : null;
    const parsedMinRate = minRate.trim() !== "" ? parseFloat(minRate) : null;
    const parsedMaxRate = maxRate.trim() !== "" ? parseFloat(maxRate) : null;
    const parsedMinTerm = minTerm.trim() !== "" ? parseInt(minTerm, 10) : null;
    const parsedMaxTerm = maxTerm.trim() !== "" ? parseInt(maxTerm, 10) : null;

    // Validar exclusivamente valores capturados
    if (parsedMinAmount !== null && (isNaN(parsedMinAmount) || parsedMinAmount < 0)) {
      toast({ title: "Monto inválido", description: "El monto mínimo debe ser un número positivo.", variant: "destructive" });
      return;
    }
    if (parsedMaxAmount !== null && (isNaN(parsedMaxAmount) || parsedMaxAmount < 0)) {
      toast({ title: "Monto inválido", description: "El monto máximo debe ser un número positivo.", variant: "destructive" });
      return;
    }
    if (parsedMinAmount !== null && parsedMaxAmount !== null && parsedMinAmount > parsedMaxAmount) {
      toast({ title: "Montos incoherentes", description: "El monto mínimo no puede ser mayor que el monto máximo.", variant: "destructive" });
      return;
    }

    if (parsedMinRate !== null && (isNaN(parsedMinRate) || parsedMinRate < 0)) {
      toast({ title: "Tasa inválida", description: "La tasa mínima debe ser un porcentaje positivo.", variant: "destructive" });
      return;
    }
    if (parsedMaxRate !== null && (isNaN(parsedMaxRate) || parsedMaxRate < 0)) {
      toast({ title: "Tasa inválida", description: "La tasa máxima debe ser un porcentaje positivo.", variant: "destructive" });
      return;
    }
    if (parsedMinRate !== null && parsedMaxRate !== null && parsedMinRate > parsedMaxRate) {
      toast({ title: "Tasas incoherentes", description: "La tasa mínima no puede ser mayor que la tasa máxima.", variant: "destructive" });
      return;
    }

    if (parsedMinTerm !== null && (isNaN(parsedMinTerm) || parsedMinTerm <= 0)) {
      toast({ title: "Plazo inválido", description: "El plazo mínimo debe ser un número de meses mayor a 0.", variant: "destructive" });
      return;
    }
    if (parsedMaxTerm !== null && (isNaN(parsedMaxTerm) || parsedMaxTerm <= 0)) {
      toast({ title: "Plazo inválido", description: "El plazo máximo debe ser un número de meses mayor a 0.", variant: "destructive" });
      return;
    }
    if (parsedMinTerm !== null && parsedMaxTerm !== null && parsedMinTerm > parsedMaxTerm) {
      toast({ title: "Plazos incoherentes", description: "El plazo mínimo no puede ser mayor que el plazo máximo.", variant: "destructive" });
      return;
    }

    const configuration: Record<string, any> = {};
    if (parsedMinAmount !== null) configuration.minAmount = parsedMinAmount;
    if (parsedMaxAmount !== null) configuration.maxAmount = parsedMaxAmount;
    if (parsedMinRate !== null) configuration.minInterestRate = parsedMinRate;
    if (parsedMaxRate !== null) configuration.maxInterestRate = parsedMaxRate;
    if (parsedMinTerm !== null) configuration.minTermMonths = parsedMinTerm;
    if (parsedMaxTerm !== null) configuration.maxTermMonths = parsedMaxTerm;

    const payload = {
      institutionId,
      name: name.trim(),
      customName: name.trim(),
      productType,
      templateId: templateId && templateId !== "none" ? templateId : null,
      description: description.trim() || null,
      targetProfiles: selectedProfiles,
      configuration,
      // Note: server forces status: "draft"
      status: "draft",
      isActive: true,
    };

    createMutation.mutate(payload);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden bg-white border border-slate-200 rounded-2xl shadow-xl">
        <form onSubmit={handleSubmit} className="flex flex-col h-full overflow-hidden">
          {/* Header */}
          <div className="p-5 sm:p-6 bg-slate-50/70 border-b border-slate-200/80">
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[#2463D6] text-white">
                <Plus className="w-3 h-3" />
                Nueva Oferta Comercial
              </span>
              <span className="text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200/80 font-medium">
                Alta en Borrador (B1)
              </span>
            </div>
            <DialogTitle className="text-lg sm:text-xl font-bold text-[#101F35] tracking-tight">
              Crear Oferta Comercial
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500 mt-0.5">
              Registra una nueva oferta para la financiera con parámetros comerciales iniciales.
            </DialogDescription>
          </div>

          {/* Form Body */}
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
            {/* Informative Security Banner */}
            <div className="p-3.5 bg-amber-50/60 border border-amber-200/70 rounded-xl flex items-start gap-2.5 text-xs text-amber-900">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <strong>Garantía de Seguridad (B1):</strong> Toda oferta nueva se crea obligatoriamente en estado{" "}
                <span className="font-semibold text-amber-800 underline">Borrador (draft)</span> con versión inicial v1. No será visible para brokers ni elegible para solicitudes hasta su posterior publicación auditada (B2).
              </div>
            </div>

            {/* Institution Selector */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">
                Institución Financiera <span className="text-red-500">*</span>
              </Label>
              {defaultInstitutionId ? (
                <div className="flex items-center gap-2 p-2.5 bg-slate-100 rounded-lg border border-slate-200 text-xs text-slate-800 font-medium">
                  <Building2 className="w-4 h-4 text-slate-500" />
                  <span>{defaultInstitutionName || "Institución Financiera"}</span>
                </div>
              ) : (
                <Select value={institutionId} onValueChange={setInstitutionId}>
                  <SelectTrigger className="h-9 text-xs border-slate-200 bg-white">
                    <SelectValue placeholder="Seleccione una institución financiera" />
                  </SelectTrigger>
                  <SelectContent className="max-h-56">
                    {institutions.map((inst) => (
                      <SelectItem key={inst.id} value={inst.id} className="text-xs">
                        {inst.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Offer Name & Product Type */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="offer-name" className="text-xs font-semibold text-slate-700">
                  Nombre Comercial de la Oferta <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="offer-name"
                  placeholder="Ej: Crédito Simple PyME Prime"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-9 text-xs border-slate-200"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">
                  Tipo de Producto <span className="text-red-500">*</span>
                </Label>
                <Select value={productType} onValueChange={setProductType}>
                  <SelectTrigger className="h-9 text-xs border-slate-200 bg-white">
                    <SelectValue placeholder="Seleccione el tipo de crédito" />
                  </SelectTrigger>
                  <SelectContent>
                    {PRODUCT_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value} className="text-xs">
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Optional Template */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                <span>Vincular a Plantilla Base (Opcional)</span>
                <span className="text-[11px] font-normal text-slate-400">Hereda configuración sugerida</span>
              </Label>
              <Select value={templateId} onValueChange={handleTemplateChange}>
                <SelectTrigger className="h-9 text-xs border-slate-200 bg-white">
                  <SelectValue placeholder="Sin plantilla / Configuración independiente" />
                </SelectTrigger>
                <SelectContent className="max-h-56">
                  <SelectItem value="none" className="text-xs">
                    Sin plantilla (Independiente)
                  </SelectItem>
                  {templates.map((tmpl) => (
                    <SelectItem key={tmpl.id} value={tmpl.id} className="text-xs">
                      {tmpl.name} {tmpl.category ? `(${tmpl.category})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="offer-desc" className="text-xs font-semibold text-slate-700">
                Descripción Comercial de la Oferta
              </Label>
              <Textarea
                id="offer-desc"
                placeholder="Detalle de valor, destino de los recursos o particularidades de esta oferta comercial..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="text-xs border-slate-200 min-h-[60px]"
                rows={2}
              />
            </div>

            {/* Target Profiles */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-slate-700">
                Perfiles de Cliente Aceptados
              </Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-slate-50/70 p-3 rounded-xl border border-slate-200/80">
                {TARGET_PROFILES.map((profile) => (
                  <div key={profile.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`profile-${profile.id}`}
                      checked={selectedProfiles.includes(profile.id)}
                      onCheckedChange={() => handleProfileToggle(profile.id)}
                    />
                    <label
                      htmlFor={`profile-${profile.id}`}
                      className="text-xs text-slate-700 font-medium cursor-pointer"
                    >
                      {profile.label}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            {/* Commercial Conditions in Draft */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-slate-700">
                  Condiciones Comerciales Base (Borrador v1)
                </Label>
                <span className="text-[11px] text-slate-400">Datos pendientes permitidos; valida solo lo capturado</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3.5 bg-white rounded-xl border border-slate-200 shadow-2xs">
                {/* Monto Min y Max */}
                <div className="space-y-1">
                  <Label className="text-[11px] text-slate-500">Monto Mínimo (MXN)</Label>
                  <Input
                    type="number"
                    value={minAmount}
                    onChange={(e) => setMinAmount(e.target.value)}
                    className="h-8 text-xs border-slate-200"
                    placeholder="Pendiente (ej. 100,000)"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-slate-500">Monto Máximo (MXN)</Label>
                  <Input
                    type="number"
                    value={maxAmount}
                    onChange={(e) => setMaxAmount(e.target.value)}
                    className="h-8 text-xs border-slate-200"
                    placeholder="Pendiente (ej. 5,000,000)"
                  />
                </div>

                {/* Tasa Min y Max */}
                <div className="space-y-1">
                  <Label className="text-[11px] text-slate-500">Tasa Mínima (% anual)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={minRate}
                    onChange={(e) => setMinRate(e.target.value)}
                    className="h-8 text-xs border-slate-200"
                    placeholder="Pendiente (ej. 18.0)"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-slate-500">Tasa Máxima (% anual)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={maxRate}
                    onChange={(e) => setMaxRate(e.target.value)}
                    className="h-8 text-xs border-slate-200"
                    placeholder="Pendiente (ej. 26.0)"
                  />
                </div>

                {/* Plazo Min y Max */}
                <div className="space-y-1">
                  <Label className="text-[11px] text-slate-500">Plazo Mínimo (meses)</Label>
                  <Input
                    type="number"
                    value={minTerm}
                    onChange={(e) => setMinTerm(e.target.value)}
                    className="h-8 text-xs border-slate-200"
                    placeholder="Pendiente (ej. 12)"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-slate-500">Plazo Máximo (meses)</Label>
                  <Input
                    type="number"
                    value={maxTerm}
                    onChange={(e) => setMaxTerm(e.target.value)}
                    className="h-8 text-xs border-slate-200"
                    placeholder="Pendiente (ej. 36)"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 bg-slate-50 border-t border-slate-200/80 flex items-center justify-end gap-2.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleClose}
              disabled={createMutation.isPending}
              className="h-8 text-xs border-slate-300 text-slate-700"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={createMutation.isPending}
              className="h-8 text-xs bg-[#2463D6] hover:bg-[#1d52b3] text-white shadow-xs font-semibold gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              {createMutation.isPending ? "Registrando..." : "Crear Oferta en Borrador"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
