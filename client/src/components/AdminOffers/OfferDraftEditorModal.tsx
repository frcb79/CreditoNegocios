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
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  InstitutionProductWithTemplate,
  InstitutionProductVersion,
} from "@shared/schema";
import {
  FileEdit,
  DollarSign,
  Percent,
  Clock,
  Users,
  ShieldAlert,
  FileCheck2,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Save,
  Info,
  Building2,
  Plus,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface OfferDraftEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  offer: InstitutionProductWithTemplate | null;
  financieraName?: string;
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

const STANDARD_DOCUMENTS = [
  { id: "csf", label: "Constancia de Situación Fiscal (CSF actualizada)" },
  { id: "proof_of_address", label: "Comprobante de Domicilio (no mayor a 3 meses)" },
  { id: "bank_statements", label: "Estados de Cuenta Bancarios (últimos 3 meses)" },
  { id: "id_official", label: "Identificación Oficial del Solicitante / Representante Legal" },
  { id: "acta_constitutiva", label: "Acta Constitutiva y Poderes Notariales (para PM)" },
  { id: "tax_return", label: "Declaración Anual de Impuestos (último ejercicio fiscal)" },
  { id: "credit_bureau", label: "Reporte de Buró de Crédito Especial" },
];

export default function OfferDraftEditorModal({
  isOpen,
  onClose,
  offer,
  financieraName,
}: OfferDraftEditorModalProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<string>("condiciones");

  // Form states
  const [name, setName] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [productType, setProductType] = useState<string>("credito_simple");
  const [selectedProfiles, setSelectedProfiles] = useState<string[]>([]);

  // Montos, tasas y plazos (permiten vacíos para borrador incompleto)
  const [minAmount, setMinAmount] = useState<string>("");
  const [maxAmount, setMaxAmount] = useState<string>("");
  const [minRate, setMinRate] = useState<string>("");
  const [maxRate, setMaxRate] = useState<string>("");
  const [minTerm, setMinTerm] = useState<string>("");
  const [maxTerm, setMaxTerm] = useState<string>("");

  // Condiciones de elegibilidad configurables (variables recopiladas del cliente)
  const [minCompanyAgeMonths, setMinCompanyAgeMonths] = useState<string>("");
  const [minMonthlyRevenue, setMinMonthlyRevenue] = useState<string>("");
  const [bureauRequirement, setBureauRequirement] = useState<string>("sin_requisito");
  const [guaranteeType, setGuaranteeType] = useState<string>("sin_garantia");
  const [avalesType, setAvalesType] = useState<string>("no_requerido");

  // Documentos requeridos
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);
  const [customDocName, setCustomDocName] = useState<string>("");

  // Motivo de cambio
  const [changeReason, setChangeReason] = useState<string>("");

  // Cargar versión en borrador desde el backend
  const { data: draftData, isLoading: isLoadingDraft } = useQuery<{
    product: any;
    draftVersion: InstitutionProductVersion | null;
  }>({
    queryKey: [`/api/institution-products/${offer?.id}/draft`],
    enabled: isOpen && !!offer?.id,
  });

  // Inicializar el formulario con los datos de la versión borrador
  useEffect(() => {
    if (!offer) return;

    setName(offer.name || offer.customName || "");
    setDescription(offer.description || "");
    setProductType(offer.productType || "credito_simple");

    const draft = draftData?.draftVersion;
    const cond = (draft?.conditions || offer.configuration || {}) as Record<string, any>;
    const req = (draft?.requirements || {}) as Record<string, any>;

    // Perfiles
    if (Array.isArray(req.targetProfiles) && req.targetProfiles.length > 0) {
      setSelectedProfiles(req.targetProfiles);
    } else if (Array.isArray(offer.targetProfiles) && offer.targetProfiles.length > 0) {
      setSelectedProfiles(offer.targetProfiles);
    } else {
      setSelectedProfiles([]);
    }

    // Montos, tasas, plazos
    setMinAmount(cond.minAmount !== undefined && cond.minAmount !== null ? String(cond.minAmount) : "");
    setMaxAmount(cond.maxAmount !== undefined && cond.maxAmount !== null ? String(cond.maxAmount) : "");
    setMinRate(cond.minInterestRate !== undefined && cond.minInterestRate !== null ? String(cond.minInterestRate) : "");
    setMaxRate(cond.maxInterestRate !== undefined && cond.maxInterestRate !== null ? String(cond.maxInterestRate) : "");
    setMinTerm(cond.minTermMonths !== undefined && cond.minTermMonths !== null ? String(cond.minTermMonths) : "");
    setMaxTerm(cond.maxTermMonths !== undefined && cond.maxTermMonths !== null ? String(cond.maxTermMonths) : "");

    // Condiciones de elegibilidad
    setMinCompanyAgeMonths(cond.minCompanyAgeMonths ? String(cond.minCompanyAgeMonths) : "");
    setMinMonthlyRevenue(cond.minMonthlyRevenue ? String(cond.minMonthlyRevenue) : "");
    setBureauRequirement(cond.bureauRequirement || "sin_requisito");
    setGuaranteeType(cond.guaranteeType || "sin_garantia");
    setAvalesType(cond.avalesType || "no_requerido");

    // Documentos requeridos
    if (Array.isArray(draft?.requiredDocuments)) {
      setSelectedDocs(draft.requiredDocuments);
    } else {
      setSelectedDocs([]);
    }

    setChangeReason(draft?.changeReason || "Actualización de parámetros en borrador");
  }, [offer, draftData]);

  // Mutation para guardar cambios en la versión borrador
  const saveMutation = useMutation({
    mutationFn: async (payload: any) => {
      if (!offer?.id) throw new Error("ID de oferta no disponible");

      const response = await fetch(`/api/institution-products/${offer.id}/draft`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || "Error al actualizar la versión en borrador");
      }

      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/institution-products"] });
      queryClient.invalidateQueries({ queryKey: [`/api/institution-products/${offer?.id}/draft`] });
      queryClient.invalidateQueries({ queryKey: [`/api/institution-products/${offer?.id}/versions`] });

      toast({
        title: "Borrador guardado exitosamente",
        description: `Se actualizaron las condiciones de la versión borrador v${data.version?.versionNumber || 1}.`,
      });
      onClose();
    },
    onError: (err: any) => {
      toast({
        title: "Error al guardar el borrador",
        description: err.message || "No se pudo actualizar la versión borrador.",
        variant: "destructive",
      });
    },
  });

  const handleProfileToggle = (id: string) => {
    setSelectedProfiles((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const handleDocToggle = (label: string) => {
    setSelectedDocs((prev) =>
      prev.includes(label) ? prev.filter((d) => d !== label) : [...prev, label]
    );
  };

  const handleAddCustomDoc = () => {
    if (!customDocName.trim()) return;
    if (!selectedDocs.includes(customDocName.trim())) {
      setSelectedDocs((prev) => [...prev, customDocName.trim()]);
    }
    setCustomDocName("");
  };

  const handleRemoveDoc = (doc: string) => {
    setSelectedDocs((prev) => prev.filter((d) => d !== doc));
  };

  // Validaciones de coherencia en tiempo de guardado
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast({
        title: "Nombre requerido",
        description: "La oferta debe tener un nombre comercial.",
        variant: "destructive",
      });
      return;
    }

    // Coherencia de montos capturados
    const parsedMinAmt = minAmount.trim() !== "" ? parseFloat(minAmount) : null;
    const parsedMaxAmt = maxAmount.trim() !== "" ? parseFloat(maxAmount) : null;
    if (parsedMinAmt !== null && parsedMaxAmt !== null && parsedMinAmt > parsedMaxAmt) {
      toast({
        title: "Montos incoherentes",
        description: "El monto mínimo no puede ser mayor que el monto máximo.",
        variant: "destructive",
      });
      return;
    }

    // Coherencia de tasas capturadas
    const parsedMinR = minRate.trim() !== "" ? parseFloat(minRate) : null;
    const parsedMaxR = maxRate.trim() !== "" ? parseFloat(maxRate) : null;
    if (parsedMinR !== null && parsedMaxR !== null && parsedMinR > parsedMaxR) {
      toast({
        title: "Tasas incoherentes",
        description: "La tasa mínima no puede ser mayor que la tasa máxima.",
        variant: "destructive",
      });
      return;
    }

    // Coherencia de plazos capturados
    const parsedMinT = minTerm.trim() !== "" ? parseInt(minTerm, 10) : null;
    const parsedMaxT = maxTerm.trim() !== "" ? parseInt(maxTerm, 10) : null;
    if (parsedMinT !== null && parsedMaxT !== null && parsedMinT > parsedMaxT) {
      toast({
        title: "Plazos incoherentes",
        description: "El plazo mínimo no puede ser mayor que el plazo máximo.",
        variant: "destructive",
      });
      return;
    }

    // Construir conditions combinando variables financieras y de elegibilidad
    const conditions: Record<string, any> = {};
    if (parsedMinAmt !== null) conditions.minAmount = parsedMinAmt;
    if (parsedMaxAmt !== null) conditions.maxAmount = parsedMaxAmt;
    if (parsedMinR !== null) conditions.minInterestRate = parsedMinR;
    if (parsedMaxR !== null) conditions.maxInterestRate = parsedMaxR;
    if (parsedMinT !== null) conditions.minTermMonths = parsedMinT;
    if (parsedMaxT !== null) conditions.maxTermMonths = parsedMaxT;

    // Variables de elegibilidad (recopiladas del cliente)
    if (minCompanyAgeMonths.trim() !== "") {
      conditions.minCompanyAgeMonths = parseInt(minCompanyAgeMonths, 10);
    }
    if (minMonthlyRevenue.trim() !== "") {
      conditions.minMonthlyRevenue = parseFloat(minMonthlyRevenue);
    }
    conditions.bureauRequirement = bureauRequirement;
    conditions.guaranteeType = guaranteeType;
    conditions.avalesType = avalesType;

    const payload = {
      name: name.trim(),
      description: description.trim(),
      productType,
      targetProfiles: selectedProfiles,
      conditions,
      requirements: {
        targetProfiles: selectedProfiles,
        minCompanyAgeMonths: conditions.minCompanyAgeMonths,
        minMonthlyRevenue: conditions.minMonthlyRevenue,
        bureauRequirement,
        guaranteeType,
        avalesType,
      },
      requiredDocuments: selectedDocs,
      variablesConfiguration: {
        garantias: guaranteeType,
        avales: avalesType,
      },
      changeReason: changeReason.trim() || "Modificación de parámetros comerciales en borrador",
    };

    saveMutation.mutate(payload);
  };

  const draftVersionNumber = draftData?.draftVersion?.versionNumber || offer?.currentVersionNumber || 1;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden bg-white border border-slate-200 rounded-2xl shadow-2xl">
        <form onSubmit={handleSubmit} className="flex flex-col h-full overflow-hidden">
          {/* Header */}
          <div className="p-5 sm:p-6 bg-slate-50/80 border-b border-slate-200/80">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-[#101F35] text-white">
                  <FileEdit className="w-3 h-3 text-amber-400" />
                  Editor de Oferta
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200/80">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  Versión Borrador v{draftVersionNumber}
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
              {offer?.name || offer?.customName || "Editar Oferta Comercial"}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500 mt-0.5">
              Configura montos, tasas, plazos, perfiles admitidos, condiciones de elegibilidad y documentación requerida.
            </DialogDescription>

            {/* Aviso de Arquitectura A1 */}
            <div className="mt-3 p-2.5 bg-blue-50/60 border border-blue-200/60 rounded-xl flex items-center gap-2 text-[11px] text-blue-900 leading-snug">
              <Info className="w-4 h-4 text-[#2463D6] shrink-0" />
              <span>
                <strong>Aislamiento de Borrador:</strong> Los cambios se guardan exclusivamente en esta versión borrador. Las versiones publicadas y el historial previo permanecen inmutables.
              </span>
            </div>
          </div>

          {/* Body with Tabs */}
          <div className="flex-1 overflow-y-auto p-5 sm:p-6">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
              <TabsList className="grid grid-cols-2 sm:grid-cols-4 bg-slate-100 p-1 rounded-xl h-auto gap-1">
                <TabsTrigger
                  value="condiciones"
                  className="text-xs py-1.5 rounded-lg data-[state=active]:bg-white data-[state=active]:text-[#2463D6] data-[state=active]:font-semibold shadow-2xs"
                  data-testid="tab-condiciones"
                >
                  Condiciones Financieras
                </TabsTrigger>
                <TabsTrigger
                  value="perfiles"
                  className="text-xs py-1.5 rounded-lg data-[state=active]:bg-white data-[state=active]:text-[#2463D6] data-[state=active]:font-semibold shadow-2xs"
                  data-testid="tab-perfiles"
                >
                  Perfiles Admitidos
                </TabsTrigger>
                <TabsTrigger
                  value="elegibilidad"
                  className="text-xs py-1.5 rounded-lg data-[state=active]:bg-white data-[state=active]:text-[#2463D6] data-[state=active]:font-semibold shadow-2xs"
                  data-testid="tab-elegibilidad"
                >
                  Elegibilidad del Cliente
                </TabsTrigger>
                <TabsTrigger
                  value="documentos"
                  className="text-xs py-1.5 rounded-lg data-[state=active]:bg-white data-[state=active]:text-[#2463D6] data-[state=active]:font-semibold shadow-2xs"
                  data-testid="tab-documentos"
                >
                  Documentación
                </TabsTrigger>
              </TabsList>

              {/* TAB 1: CONDICIONES FINANCIERAS Y GENERALES */}
              <TabsContent value="condiciones" className="space-y-4 pt-1">
                {/* Datos Básicos */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 p-4 bg-slate-50/60 rounded-xl border border-slate-200/70">
                  <div className="space-y-1">
                    <Label htmlFor="draft-name" className="text-xs font-semibold text-slate-700">
                      Nombre de la Oferta <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="draft-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Ej: Crédito Simple PyME Prime"
                      className="h-8 text-xs border-slate-200 bg-white"
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-slate-700">Tipo de Crédito</Label>
                    <Select value={productType} onValueChange={setProductType}>
                      <SelectTrigger className="h-8 text-xs border-slate-200 bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PRODUCT_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value} className="text-xs">
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="sm:col-span-2 space-y-1">
                    <Label htmlFor="draft-desc" className="text-xs font-semibold text-slate-700">
                      Descripción Comercial
                    </Label>
                    <Textarea
                      id="draft-desc"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Propuesta de valor o destino de recursos..."
                      className="text-xs border-slate-200 bg-white min-h-[50px]"
                      rows={2}
                    />
                  </div>
                </div>

                {/* Parámetros Financieros */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Rango de Montos, Tasas y Plazos
                    </h4>
                    <span className="text-[11px] text-slate-400">
                      Datos pendientes permitidos (guarda borrador incompleto)
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Montos */}
                    <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-2">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-[#101F35]">
                        <DollarSign className="w-3.5 h-3.5 text-[#2463D6]" />
                        <span>Montos (MXN)</span>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-slate-500 font-medium">Monto Mínimo</Label>
                        <Input
                          type="number"
                          value={minAmount}
                          onChange={(e) => setMinAmount(e.target.value)}
                          placeholder="Sin límite min"
                          className="h-8 text-xs border-slate-200"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-slate-500 font-medium">Monto Máximo</Label>
                        <Input
                          type="number"
                          value={maxAmount}
                          onChange={(e) => setMaxAmount(e.target.value)}
                          placeholder="Sin límite max"
                          className="h-8 text-xs border-slate-200"
                        />
                      </div>
                    </div>

                    {/* Tasas */}
                    <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-2">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-[#101F35]">
                        <Percent className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Tasa de Interés (% Anual)</span>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-slate-500 font-medium">Tasa Mínima (%)</Label>
                        <Input
                          type="number"
                          step="0.1"
                          value={minRate}
                          onChange={(e) => setMinRate(e.target.value)}
                          placeholder="Sin tasa min"
                          className="h-8 text-xs border-slate-200"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-slate-500 font-medium">Tasa Máxima (%)</Label>
                        <Input
                          type="number"
                          step="0.1"
                          value={maxRate}
                          onChange={(e) => setMaxRate(e.target.value)}
                          placeholder="Sin tasa max"
                          className="h-8 text-xs border-slate-200"
                        />
                      </div>
                    </div>

                    {/* Plazos */}
                    <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-2">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-[#101F35]">
                        <Clock className="w-3.5 h-3.5 text-amber-600" />
                        <span>Plazos (Meses)</span>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-slate-500 font-medium">Plazo Mínimo (meses)</Label>
                        <Input
                          type="number"
                          value={minTerm}
                          onChange={(e) => setMinTerm(e.target.value)}
                          placeholder="Sin plazo min"
                          className="h-8 text-xs border-slate-200"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-slate-500 font-medium">Plazo Máximo (meses)</Label>
                        <Input
                          type="number"
                          value={maxTerm}
                          onChange={(e) => setMaxTerm(e.target.value)}
                          placeholder="Sin plazo max"
                          className="h-8 text-xs border-slate-200"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* TAB 2: PERFILES ADMITIDOS */}
              <TabsContent value="perfiles" className="space-y-3 pt-1">
                <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200/80 text-xs text-slate-600">
                  Selecciona los tipos de cliente admitidos para esta oferta comercial. Puedes guardar el borrador sin selección y definirlo más tarde.
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {TARGET_PROFILES.map((profile) => {
                    const isChecked = selectedProfiles.includes(profile.id);
                    return (
                      <div
                        key={profile.id}
                        onClick={() => handleProfileToggle(profile.id)}
                        className={cn(
                          "p-3.5 rounded-xl border transition-all cursor-pointer flex items-start space-x-3 select-none",
                          isChecked
                            ? "bg-blue-50/50 border-blue-300 ring-1 ring-blue-300/40"
                            : "bg-white border-slate-200 hover:border-slate-300"
                        )}
                      >
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={() => handleProfileToggle(profile.id)}
                          className="mt-0.5"
                        />
                        <div className="space-y-0.5">
                          <span className="text-xs font-bold text-slate-800 block">
                            {profile.label}
                          </span>
                          <span className="text-[11px] text-slate-500 block leading-tight">
                            {profile.id === "persona_moral" && "Empresas constituidas (S.A., S.A.P.I., S. de R.L.)"}
                            {profile.id === "fisica_empresarial" && "Personas físicas con régimen de actividad empresarial o RESICO"}
                            {profile.id === "fisica" && "Personas físicas asalariadas o profesionistas independientes"}
                            {profile.id === "sin_sat" && "Empresas que comprueban ingresos por flujo de cuenta bancaria"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="text-[11px] text-slate-500 italic mt-2">
                  Perfiles seleccionados actualmente: {selectedProfiles.length} de {TARGET_PROFILES.length}.
                </div>
              </TabsContent>

              {/* TAB 3: CONDICIONES DE ELEGIBILIDAD */}
              <TabsContent value="elegibilidad" className="space-y-4 pt-1">
                <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl text-xs text-amber-900 leading-relaxed">
                  <strong>Variables del Expediente:</strong> Estas condiciones corresponden a los datos reales capturados en el perfil y solicitud del cliente. Su evaluación automática está en preparación (conexión a Matching pendiente).
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Antigüedad de la empresa */}
                  <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-bold text-slate-800">
                        Antigüedad Mínima del Negocio
                      </Label>
                      <Badge variant="outline" className="text-[9px] bg-emerald-50 text-emerald-700 border-emerald-200">
                        Recopilada del cliente
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        value={minCompanyAgeMonths}
                        onChange={(e) => setMinCompanyAgeMonths(e.target.value)}
                        placeholder="Ej. 12 ó 24"
                        className="h-8 text-xs border-slate-200"
                      />
                      <span className="text-xs text-slate-500 shrink-0 font-medium">Meses</span>
                    </div>
                    <span className="text-[10px] text-slate-400 block">
                      Matching: Conexión pendiente al motor de pre-calificación
                    </span>
                  </div>

                  {/* Facturación mensual mínima */}
                  <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-bold text-slate-800">
                        Facturación / Ingreso Mensual Mínimo
                      </Label>
                      <Badge variant="outline" className="text-[9px] bg-emerald-50 text-emerald-700 border-emerald-200">
                        Recopilada del cliente
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400 shrink-0">$</span>
                      <Input
                        type="number"
                        value={minMonthlyRevenue}
                        onChange={(e) => setMinMonthlyRevenue(e.target.value)}
                        placeholder="Ej. 150000"
                        className="h-8 text-xs border-slate-200"
                      />
                      <span className="text-xs text-slate-500 shrink-0 font-medium">MXN</span>
                    </div>
                    <span className="text-[10px] text-slate-400 block">
                      Matching: Conexión pendiente al motor de pre-calificación
                    </span>
                  </div>

                  {/* Buró de crédito */}
                  <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-bold text-slate-800">
                        Tolerancia de Buró de Crédito
                      </Label>
                      <Badge variant="outline" className="text-[9px] bg-emerald-50 text-emerald-700 border-emerald-200">
                        Recopilada del cliente
                      </Badge>
                    </div>
                    <Select value={bureauRequirement} onValueChange={setBureauRequirement}>
                      <SelectTrigger className="h-8 text-xs border-slate-200 bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sin_requisito" className="text-xs">Sin requisito estricto</SelectItem>
                        <SelectItem value="al_corriente" className="text-xs">Sin atrasos (MOP 01 al corriente)</SelectItem>
                        <SelectItem value="atraso_menor_30" className="text-xs">Atraso leve permitido (&lt; 30 días)</SelectItem>
                        <SelectItem value="flexible" className="text-xs">Buró flexible con quebrantos justificados</SelectItem>
                      </SelectContent>
                    </Select>
                    <span className="text-[10px] text-slate-400 block">
                      Matching: Conexión pendiente al motor de pre-calificación
                    </span>
                  </div>

                  {/* Garantías */}
                  <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-bold text-slate-800">
                        Requisito de Garantía
                      </Label>
                      <Badge variant="outline" className="text-[9px] bg-emerald-50 text-emerald-700 border-emerald-200">
                        Recopilada del cliente
                      </Badge>
                    </div>
                    <Select value={guaranteeType} onValueChange={setGuaranteeType}>
                      <SelectTrigger className="h-8 text-xs border-slate-200 bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sin_garantia" className="text-xs">Sin Garantía (Crédito Quirografario)</SelectItem>
                        <SelectItem value="garantia_liquida" className="text-xs">Garantía Líquida</SelectItem>
                        <SelectItem value="hipotecaria" className="text-xs">Garantía Hipotecaria (Inmueble)</SelectItem>
                        <SelectItem value="prendaria" className="text-xs">Garantía Prendaria (Maquinaria/Vehículo)</SelectItem>
                      </SelectContent>
                    </Select>
                    <span className="text-[10px] text-slate-400 block">
                      Matching: Conexión pendiente al motor de pre-calificación
                    </span>
                  </div>

                  {/* Avales */}
                  <div className="sm:col-span-2 p-4 bg-white rounded-xl border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-bold text-slate-800">
                        Requisito de Aval / Obligado Solidario
                      </Label>
                      <Badge variant="outline" className="text-[9px] bg-emerald-50 text-emerald-700 border-emerald-200">
                        Recopilada del cliente
                      </Badge>
                    </div>
                    <Select value={avalesType} onValueChange={setAvalesType}>
                      <SelectTrigger className="h-8 text-xs border-slate-200 bg-white max-w-md">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="no_requerido" className="text-xs">No Requerido</SelectItem>
                        <SelectItem value="un_aval" className="text-xs">Un Aval / Obligado Solidario</SelectItem>
                        <SelectItem value="dos_avales" className="text-xs">Dos Avales</SelectItem>
                        <SelectItem value="aval_con_inmueble" className="text-xs">Aval con Inmueble Libre de Gravamen</SelectItem>
                      </SelectContent>
                    </Select>
                    <span className="text-[10px] text-slate-400 block">
                      Matching: Conexión pendiente al motor de pre-calificación
                    </span>
                  </div>
                </div>
              </TabsContent>

              {/* TAB 4: DOCUMENTOS REQUERIDOS */}
              <TabsContent value="documentos" className="space-y-4 pt-1">
                <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200/80 text-xs text-slate-600">
                  Indica los documentos que el broker deberá solicitar al cliente para procesar esta oferta. No se precarga ninguno por defecto.
                </div>

                {/* Catálogo estándar */}
                <div className="space-y-2">
                  <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
                    Documentos Estándar Disponibles
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {STANDARD_DOCUMENTS.map((doc) => {
                      const isSelected = selectedDocs.includes(doc.label);
                      return (
                        <div
                          key={doc.id}
                          onClick={() => handleDocToggle(doc.label)}
                          className={cn(
                            "p-2.5 rounded-lg border text-xs flex items-center space-x-2.5 cursor-pointer select-none transition-all",
                            isSelected
                              ? "bg-emerald-50/60 border-emerald-300 text-emerald-900"
                              : "bg-white border-slate-200 text-slate-700 hover:border-slate-300"
                          )}
                        >
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => handleDocToggle(doc.label)}
                          />
                          <span className="truncate">{doc.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Agregar documento personalizado */}
                <div className="pt-2 border-t border-slate-100 space-y-2">
                  <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
                    Agregar Documento Específico de la Financiera
                  </span>
                  <div className="flex gap-2">
                    <Input
                      value={customDocName}
                      onChange={(e) => setCustomDocName(e.target.value)}
                      placeholder="Ej. Estados Financieros Auditados 2025"
                      className="h-8 text-xs border-slate-200"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddCustomDoc();
                        }
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAddCustomDoc}
                      className="h-8 text-xs border-slate-200 shrink-0 gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Agregar</span>
                    </Button>
                  </div>
                </div>

                {/* Lista de documentos seleccionados */}
                <div className="space-y-2">
                  <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
                    Documentos Solicitados ({selectedDocs.length})
                  </span>
                  {selectedDocs.length === 0 ? (
                    <span className="text-xs text-slate-400 italic block">
                      Ningún documento seleccionado aún. Puedes guardar el borrador y asignarlos posteriormente.
                    </span>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {selectedDocs.map((doc) => (
                        <span
                          key={doc}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-800 border border-slate-200"
                        >
                          <FileCheck2 className="w-3 h-3 text-emerald-600" />
                          <span>{doc}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveDoc(doc)}
                            className="text-slate-400 hover:text-red-500 transition-colors ml-1"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>

            {/* Motivo de cambio */}
            <div className="mt-5 pt-4 border-t border-slate-100 space-y-1">
              <Label htmlFor="change-reason" className="text-xs font-semibold text-slate-600">
                Bitácora de Cambio en Borrador
              </Label>
              <Input
                id="change-reason"
                value={changeReason}
                onChange={(e) => setChangeReason(e.target.value)}
                placeholder="Motivo o notas de esta edición..."
                className="h-8 text-xs border-slate-200"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 sm:p-5 bg-slate-50/90 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="text-[11px] text-slate-500">
              Estado: <span className="font-semibold text-amber-700">Borrador v{draftVersionNumber}</span> (No publicado)
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
                disabled={saveMutation.isPending}
                className="h-8 text-xs bg-[#2463D6] hover:bg-[#1d52b3] text-white font-semibold gap-1.5 shadow-sm"
                data-testid="button-save-draft"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{saveMutation.isPending ? "Guardando..." : "Guardar Borrador"}</span>
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
