import { getOfferAgePolicy } from "@shared/offerAgePolicy";
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
  Send,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface OfferDraftEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  offer: InstitutionProductWithTemplate | null;
  financieraName?: string;
  onOpenPublish?: (offer: InstitutionProductWithTemplate) => void;
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
  onOpenPublish,
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
  const [rateSource, setRateSource] = useState<string>("");
  const [maxRate, setMaxRate] = useState<string>("");
  const [minTerm, setMinTerm] = useState<string>("");
  const [maxTerm, setMaxTerm] = useState<string>("");

  // Esquema de comisiones individual por oferta (B2.2)
  const [finCommissionRate, setFinCommissionRate] = useState<string>("");
  const [finRenewal, setFinRenewal] = useState("");
  const [finOverrate, setFinOverrate] = useState("");
  const [masterRenewal, setMasterRenewal] = useState("");
  const [brokerRenewal, setBrokerRenewal] = useState("");
  const [masterCommissionRate, setMasterCommissionRate] = useState<string>("");
  const [brokerCommissionRate, setBrokerCommissionRate] = useState<string>("");
  const [commissionNotes, setCommissionNotes] = useState<string>("");

  // Condiciones de elegibilidad configurables (variables recopiladas del cliente)
  const [minCompanyAgeMonths, setMinCompanyAgeMonths] = useState<string>("");
  const [minMonthlyRevenue, setMinMonthlyRevenue] = useState<string>("");
  const [bureauRequirement, setBureauRequirement] = useState<string>("sin_requisito");
  const [guaranteeType, setGuaranteeType] = useState<string>("sin_garantia");
  const [avalesType, setAvalesType] = useState<string>("no_requerido");

  const [ageMonthsByProfile, setAgeMonthsByProfile] = useState<Record<string, string>>({});
  const [ageReviewReason, setAgeReviewReason] = useState("");
  const [ageReviewed, setAgeReviewed] = useState(false);

  // Documentos requeridos
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);
  const [publishAfterSave, setPublishAfterSave] = useState(false);
  const [customDocName, setCustomDocName] = useState<string>("");

  // Motivo de cambio
  const [changeReason, setChangeReason] = useState<string>("");

  // Cargar versión en borrador desde el backend
  const { data: draftData, isLoading: isLoadingDraft, isError: draftError } = useQuery<{
    product: any;
    draftVersion: InstitutionProductVersion | null;
  }>({
    queryKey: [`/api/institution-products/${offer?.id}/draft`],
    enabled: isOpen && !!offer?.id,
    refetchOnWindowFocus: false,
  });

  // Inicializar el formulario con los datos de la versión borrador
  useEffect(() => {
    if (!offer) return;

    const future = (draftData?.draftVersion?.variablesConfiguration as any)?.futureMetadata;
    setName(future?.name || offer.name || offer.customName || "");
    setDescription(future?.description ?? offer.description ?? "");
    setProductType(future?.productType || offer.productType || "credito_simple");

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
    setRateSource(cond.rateSource === undefined || cond.rateSource === null ? "" : String(cond.rateSource));
    setMaxRate(cond.maxInterestRate !== undefined && cond.maxInterestRate !== null ? String(cond.maxInterestRate) : "");
    setMinTerm(cond.minTermMonths !== undefined && cond.minTermMonths !== null ? String(cond.minTermMonths) : "");
    setMaxTerm(cond.maxTermMonths !== undefined && cond.maxTermMonths !== null ? String(cond.maxTermMonths) : "");

    // Comisiones individuales por oferta (B2.2)
    const comm = (cond.commissionRates || {}) as Record<string, any>;
    setFinCommissionRate(
      comm.financiera?.apertura !== undefined && comm.financiera?.apertura !== null ? String(comm.financiera.apertura) : ""
    );
    setMasterCommissionRate(
      comm.masterBroker?.apertura !== undefined && comm.masterBroker?.apertura !== null ? String(comm.masterBroker.apertura) : ""
    );
    setBrokerCommissionRate(
      comm.broker?.apertura !== undefined && comm.broker?.apertura !== null ? String(comm.broker.apertura) : ""
    );
    setFinRenewal(comm.financiera?.renovacion == null ? "" : String(comm.financiera.renovacion));
    setFinOverrate(comm.financiera?.sobretasa == null ? "" : String(comm.financiera.sobretasa));
    setMasterRenewal(comm.masterBroker?.renovacion == null ? "" : String(comm.masterBroker.renovacion));
    setBrokerRenewal(comm.broker?.renovacion == null ? "" : String(comm.broker.renovacion));
    setCommissionNotes(comm.notes || "");

    // Condiciones de elegibilidad
    setMinCompanyAgeMonths(String(cond.minCompanyAgeMonths ?? req.minMonthsInBusiness ?? req.ranges?.tiempoActividad?.min ?? ""));
    setMinMonthlyRevenue(String(cond.minMonthlyRevenue ?? req.minMonthlyIncome ?? req.ranges?.ingresoMensualPromedio?.min ?? ""));
    setBureauRequirement(cond.bureauRequirement || "por_definir");
    setGuaranteeType(cond.guaranteeType || "por_definir");
    setAvalesType(cond.avalesType || "por_definir");

    const agePolicy = getOfferAgePolicy(cond, req);
    setAgeMonthsByProfile(Object.fromEntries(agePolicy.rows.map(row => [row.profile, agePolicy.resolved ? String(row.effectiveMonths) : ""])));
    setAgeReviewReason(agePolicy.resolution?.reason || "");
    setAgeReviewed(false);

    // Documentos requeridos
    if (Array.isArray(draft?.requiredDocuments)) {
      setSelectedDocs(draft.requiredDocuments.filter((doc): doc is string => typeof doc === "string"));
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
      if (publishAfterSave && offer) onOpenPublish?.(data.product || offer);
      setPublishAfterSave(false);
    },
    onError: (err: any) => {
      setPublishAfterSave(false);
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
  const handleSubmit = (e: React.FormEvent, review = false) => {
    e.preventDefault();

    if (isLoadingDraft || !draftData?.draftVersion || saveMutation.isPending) return;

    if (!name.trim()) {
      toast({
        title: "Nombre requerido",
        description: "La oferta debe tener un nombre comercial.",
        variant: "destructive",
      });
      return;
    }

    const numericValues = [minAmount, maxAmount, minRate, maxRate, minTerm, maxTerm, minCompanyAgeMonths, minMonthlyRevenue];
    if (numericValues.some(value => value.trim() !== "" && (!Number.isFinite(Number(value)) || Number(value) < 0)) ||
        [minTerm,maxTerm,minCompanyAgeMonths].some(value => value.trim() !== "" && !Number.isInteger(Number(value)))) {
      toast({title: "Valor numérico inválido", description: "Usa valores positivos o cero y meses enteros.", variant: "destructive"});
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

    // Coherencia de comisiones individuales por oferta (B2.2)
    const parsedFinComm = finCommissionRate.trim() !== "" ? parseFloat(finCommissionRate) : null;
    const parsedMasterComm = masterCommissionRate.trim() !== "" ? parseFloat(masterCommissionRate) : null;
    const parsedBrokerComm = brokerCommissionRate.trim() !== "" ? parseFloat(brokerCommissionRate) : null;
    const parseExtra = (v: string) => v.trim() === "" ? null : Number(v);
    const parsedFinRenewal = parseExtra(finRenewal);
    const parsedFinOverrate = parseExtra(finOverrate);
    const parsedMasterRenewal = parseExtra(masterRenewal);
    const parsedBrokerRenewal = parseExtra(brokerRenewal);
    if ([parsedFinRenewal, parsedFinOverrate, parsedMasterRenewal, parsedBrokerRenewal]
      .some(value => value !== null && (!Number.isFinite(value) || value < 0 || value > 100))) {
      toast({ title: "Porcentaje inválido", description: "Las tasas deben estar entre 0% y 100%.", variant: "destructive" });
      return;
    }

    if (parsedFinComm !== null && (isNaN(parsedFinComm) || parsedFinComm < 0)) {
      toast({
        title: "Comisión Financiera inválida",
        description: "La comisión pagada por la financiera debe ser un número mayor o igual a 0.",
        variant: "destructive",
      });
      return;
    }
    if (parsedMasterComm !== null && (isNaN(parsedMasterComm) || parsedMasterComm < 0)) {
      toast({
        title: "Comisión Master Broker inválida",
        description: "La comisión para Master Broker debe ser un número mayor o igual a 0.",
        variant: "destructive",
      });
      return;
    }
    if (parsedBrokerComm !== null && (isNaN(parsedBrokerComm) || parsedBrokerComm < 0)) {
      toast({
        title: "Comisión Broker Directo inválida",
        description: "La comisión para Broker Directo debe ser un número mayor o igual a 0.",
        variant: "destructive",
      });
      return;
    }

    if (parsedFinComm !== null) {
      if (parsedMasterComm !== null && parsedMasterComm > parsedFinComm) {
        toast({
          title: "Incoherencia en Comisión Master",
          description: `La comisión para Master Broker (${parsedMasterComm}%) no puede ser superior a la comisión que paga la financiera (${parsedFinComm}%).`,
          variant: "destructive",
        });
        return;
      }
      if (parsedBrokerComm !== null && parsedBrokerComm > parsedFinComm) {
        toast({
          title: "Incoherencia en Comisión Broker",
          description: `La comisión para Broker Directo (${parsedBrokerComm}%) no puede ser superior a la comisión que paga la financiera (${parsedFinComm}%).`,
          variant: "destructive",
        });
        return;
      }
    }

    // Construir conditions combinando variables financieras, comisiones y de elegibilidad
    const baseConditions = (draftData?.draftVersion?.conditions || offer?.configuration || {}) as Record<string, any>;
    const conditions: Record<string, any> = {};
    conditions.minAmount = parsedMinAmt;
    conditions.maxAmount = parsedMaxAmt;
    conditions.minInterestRate = parsedMinR;
    conditions.rateSource = rateSource.trim() || null;
    conditions.maxInterestRate = parsedMaxR;
    conditions.minTermMonths = parsedMinT;
    conditions.maxTermMonths = parsedMaxT;

    // Comisiones individuales por oferta
    const baseComm = baseConditions.commissionRates || {};
    const rateText = (value: any) => value == null ? "" : String(value);
    const commissionsChanged = finCommissionRate !== rateText(baseComm.financiera?.apertura) ||
      masterCommissionRate !== rateText(baseComm.masterBroker?.apertura) ||
      brokerCommissionRate !== rateText(baseComm.broker?.apertura) ||
      finRenewal !== rateText(baseComm.financiera?.renovacion) ||
      finOverrate !== rateText(baseComm.financiera?.sobretasa) ||
      masterRenewal !== rateText(baseComm.masterBroker?.renovacion) ||
      brokerRenewal !== rateText(baseComm.broker?.renovacion) ||
      commissionNotes !== (baseComm.notes || "");
    if (commissionsChanged) {
      conditions.commissionRates = {
        ...baseComm,
        financiera: { ...baseComm.financiera, apertura: parsedFinComm, renovacion: parsedFinRenewal, sobretasa: parsedFinOverrate },
        masterBroker: { ...baseComm.masterBroker, apertura: parsedMasterComm, renovacion: parsedMasterRenewal, sobretasa: 0 },
        broker: { ...baseComm.broker, apertura: parsedBrokerComm, renovacion: parsedBrokerRenewal, sobretasa: 0 },
        type: baseComm.type || "porcentaje",
        notes: commissionNotes.trim(),
      };
      // Sobretasa exclusivamente interna: jamás forma parte de las comisiones repartibles.
      conditions.overrateOwner = "credito_negocios";
    }

    // Variables de elegibilidad (asociadas a campos reales del expediente)
    conditions.minCompanyAgeMonths = minCompanyAgeMonths.trim() ? Number(minCompanyAgeMonths) : null;
    conditions.minMonthlyRevenue = minMonthlyRevenue.trim() ? Number(minMonthlyRevenue) : null;
    if (bureauRequirement !== "por_definir") conditions.bureauRequirement = bureauRequirement;
    if (guaranteeType !== "por_definir") conditions.guaranteeType = guaranteeType;
    if (avalesType !== "por_definir") conditions.avalesType = avalesType;

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
        ...(bureauRequirement !== "por_definir" ? { bureauRequirement } : {}),
        ...(guaranteeType !== "por_definir" ? { guaranteeType } : {}),
        ...(avalesType !== "por_definir" ? { avalesType } : {}),
      },
      ...(ageReviewed ? { businessAgeReview: {
        confirmed: true, reason: ageReviewReason,
        monthsByProfile: Object.fromEntries(selectedProfiles.map(profile => [profile, ageMonthsByProfile[profile]?.trim() ? Number(ageMonthsByProfile[profile]) : null])),
      } } : {}),
      requiredDocuments: selectedDocs,
      variablesConfiguration: {
        ...(draftData?.draftVersion?.variablesConfiguration as Record<string, any> || {}),
        futureMetadata: { name: name.trim(), customName: name.trim(), description: description.trim(), productType },
        ...(guaranteeType !== "por_definir" ? { garantias: guaranteeType } : {}),
        ...(avalesType !== "por_definir" ? { avales: avalesType } : {}),
      },
      changeReason: changeReason.trim() || "Modificación de parámetros comerciales y comisiones en borrador",
    };

    setPublishAfterSave(review);
    saveMutation.mutate(payload);
  };

  const sourceConditions = (draftData?.draftVersion?.conditions || {}) as Record<string, any>;
  const sourceRequirements = (draftData?.draftVersion?.requirements || {}) as Record<string, any>;
  const agePolicy = getOfferAgePolicy({ ...sourceConditions, minCompanyAgeMonths: minCompanyAgeMonths.trim() ? Number(minCompanyAgeMonths) : null }, { ...sourceRequirements, targetProfiles: selectedProfiles });
  const sourceFields: Record<string, unknown> = sourceConditions.sourceTechnicalFields || {};
  const eligibilityDetails: Record<string, unknown> = {
    "Antigüedad según archivo": sourceRequirements.businessAgeSource || sourceRequirements.minMonthsInBusinessSource,
    "Ventas mensuales según archivo": sourceRequirements.minMonthlyIncomeSource,
    "Ventas anuales mínimas": sourceRequirements.minAnnualIncome ?? sourceRequirements.minAnnualIncomeSource,
    "Tolerancia de Buró": sourceRequirements.bureauPolicySource,
    "Buró accionista mínimo": sourceRequirements.minShareholderBureau,
    "Buró empresa mínimo": sourceRequirements.minBusinessBureau,
    "Buró persona física mínimo": sourceRequirements.minPersonalBureau ?? sourceRequirements.minPersonalBureauSource,
    "Permite atrasos": sourceRequirements.allowsArrears == null ? null : sourceRequirements.allowsArrears ? "Sí" : "No",
    "Política de atrasos": sourceRequirements.arrearsPolicy,
    "Requisito de garantía": sourceRequirements.guarantee,
    "Aval / obligado solidario": sourceRequirements.guarantorSource,
    "Requiere CIEC": sourceRequirements.requiresCiec == null ? null : sourceRequirements.requiresCiec ? "Sí" : "No",
    "Estados financieros": sourceRequirements.requiresFinancialStatements == null ? null : sourceRequirements.requiresFinancialStatements ? "Sí" : "No",
    "Opinión SAT": sourceRequirements.satOpinion,
    "Ventas a gobierno máximo": sourceRequirements.governmentSalesLimit,
    "Restricciones de giro": sourceRequirements.excludedSectors,
    "Presencia": sourceRequirements.presence,
  };
  const sourcePanel = (fields: Record<string, unknown>) => <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border p-3 text-xs" data-testid="offer-imported-fields">
    {Object.entries(fields).filter(([,v]) => v !== null && v !== undefined && v !== "").map(([key,value]) =>
      <div key={key}><dt className="font-semibold text-slate-700">{key}</dt><dd className="text-slate-600 whitespace-pre-wrap break-words">{String(value)}</dd></div>)}
  </dl>;
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
            {isLoadingDraft && <p role="status">Cargando los datos del borrador…</p>}
            {draftError && <p role="alert" className="text-red-700">No se pudo cargar el borrador. Cierra y vuelve a abrir la oferta.</p>}
            <fieldset disabled={isLoadingDraft || draftError || !draftData?.draftVersion || saveMutation.isPending}>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
              <TabsList className="grid grid-cols-2 sm:grid-cols-5 bg-slate-100 p-1 rounded-xl h-auto gap-1">
                <TabsTrigger
                  value="condiciones"
                  className="text-xs py-1.5 rounded-lg data-[state=active]:bg-white data-[state=active]:text-[#2463D6] data-[state=active]:font-semibold shadow-2xs"
                  data-testid="tab-condiciones"
                >
                  Condiciones
                </TabsTrigger>
                <TabsTrigger
                  value="comisiones"
                  className="text-xs py-1.5 rounded-lg data-[state=active]:bg-white data-[state=active]:text-[#2463D6] data-[state=active]:font-semibold shadow-2xs"
                  data-testid="tab-comisiones"
                >
                  Comisiones
                </TabsTrigger>
                <TabsTrigger
                  value="perfiles"
                  className="text-xs py-1.5 rounded-lg data-[state=active]:bg-white data-[state=active]:text-[#2463D6] data-[state=active]:font-semibold shadow-2xs"
                  data-testid="tab-perfiles"
                >
                  Perfiles
                </TabsTrigger>
                <TabsTrigger
                  value="elegibilidad"
                  className="text-xs py-1.5 rounded-lg data-[state=active]:bg-white data-[state=active]:text-[#2463D6] data-[state=active]:font-semibold shadow-2xs"
                  data-testid="tab-elegibilidad"
                >
                  Elegibilidad
                </TabsTrigger>
                <TabsTrigger
                  value="documentos"
                  className="text-xs py-1.5 rounded-lg data-[state=active]:bg-white data-[state=active]:text-[#2463D6] data-[state=active]:font-semibold shadow-2xs col-span-2 sm:col-span-1"
                  data-testid="tab-documentos"
                >
                  Documentación
                </TabsTrigger>
              </TabsList>

              {/* TAB 1: CONDICIONES FINANCIERAS Y GENERALES */}
              <TabsContent value="condiciones" className="space-y-4 pt-1">
                {sourcePanel({"Tasa / factor según archivo": sourceConditions.rateSource,
                  "Apertura al cliente": sourceConditions.clientOpeningSource,
                  "Monto máximo variable": sourceConditions.informationalMaximumLoan,
                  "Destinos": sourceConditions.loanPurposes, "Tiempo de respuesta": sourceConditions.turnaround,
                  "Observaciones": sourceConditions.sourceNotes})}
                {Object.keys(sourceFields).length > 0 && <details className="text-xs"><summary className="cursor-pointer font-semibold">Ver todos los datos del archivo importado</summary>{sourcePanel(sourceFields)}</details>}

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
                        <Label className="text-[10px] text-slate-500 font-medium">Tasa indicativa o fórmula publicada</Label>
                        <Input type="text" value={rateSource} onChange={e => setRateSource(e.target.value)}
                          placeholder="Ej. TIIE + 8.15, 18% o 18%-29%"
                          className="h-8 text-xs border-slate-200" data-testid="input-rate-source" />
                        <p className="text-[10px] text-slate-500">Este texto se muestra en el catálogo. No se convierte una fórmula TIIE a tasa fija.</p>
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

              {/* TAB 2: ESQUEMA DE COMISIONES POR OFERTA (B2.2) */}
              <TabsContent value="comisiones" className="space-y-4 pt-1">
                <div className="p-3.5 bg-blue-50/70 border border-blue-200/80 rounded-xl text-xs text-blue-950 leading-relaxed space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-blue-900">
                    <Percent className="w-4 h-4 text-[#2463D6]" />
                    <span>Esquema Individual por Oferta (B2.2)</span>
                  </div>
                  <p className="text-[11px] text-blue-800 leading-normal">
                    Cada oferta comercial conserva su propio esquema independiente de comisiones. Los cambios se guardan exclusivamente en esta versión borrador bajo control de versiones y auditoría (no se alteran versiones históricas ni otras ofertas).
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* 1. Comisión Financiera a Plataforma */}
                  <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#101F35]">
                        Comisión Financiera
                      </span>
                      <Badge variant="outline" className="text-[9px] bg-blue-50 text-blue-700 border-blue-200 font-semibold">
                        Bolsa Bruta
                      </Badge>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-slate-500 font-medium">Apertura (% del crédito)</Label>
                      <div className="relative">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={finCommissionRate}
                          onChange={(e) => setFinCommissionRate(e.target.value)}
                          placeholder="Ej. 4.0"
                          className="h-8 text-xs border-slate-200 pr-6"
                          data-testid="input-fin-commission"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold">%</span>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[10px] text-slate-500">Renovación (% de crédito)</Label>
                      <Input type="number" step="0.01" min="0" max="100"
                        value={finRenewal} onChange={e => setFinRenewal(e.target.value)}
                        placeholder="0.00" className="h-8 text-xs"
                        data-testid="input-fin-renewal" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-slate-500">Sobretasa CN (%) — exclusiva de plataforma</Label>
                      <Input type="number" step="0.01" min="0" max="100"
                        value={finOverrate} onChange={e => setFinOverrate(e.target.value)}
                        placeholder="0.00" className="h-8 text-xs"
                        data-testid="input-fin-overrate" />
                    </div>
                    <span className="text-[10px] text-slate-400 block leading-tight">
                      Monto bruto que la financiera paga a Crédito Negocios por colocación.
                    </span>
                  </div>

                  {/* 2. Comisión Master Broker */}
                  <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#101F35]">
                        Master Broker
                      </span>
                      <Badge variant="outline" className="text-[9px] bg-purple-50 text-purple-700 border-purple-200 font-semibold">
                        Techo de Red
                      </Badge>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-slate-500 font-medium">Apertura autorizada (%)</Label>
                      <div className="relative">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={masterCommissionRate}
                          onChange={(e) => setMasterCommissionRate(e.target.value)}
                          placeholder="Ej. 3.0"
                          className="h-8 text-xs border-slate-200 pr-6"
                          data-testid="input-master-commission"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold">%</span>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[10px] text-slate-500">Renovación autorizada (%)</Label>
                      <Input type="number" step="0.01" min="0" max="100"
                        value={masterRenewal} onChange={e => setMasterRenewal(e.target.value)}
                        placeholder="0.00" className="h-8 text-xs"
                        data-testid="input-master-renewal" />
                    </div>
                    <span className="text-[10px] text-slate-400 block leading-tight">
                      Tope de red. En colocación directa percibe este porcentaje; en red, percibe el diferencial.
                    </span>
                  </div>

                  {/* 3. Comisión Broker Directo */}
                  <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#101F35]">
                        Broker Directo
                      </span>
                      <Badge variant="outline" className="text-[9px] bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold">
                        Originador
                      </Badge>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-slate-500 font-medium">Apertura autorizada (%)</Label>
                      <div className="relative">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={brokerCommissionRate}
                          onChange={(e) => setBrokerCommissionRate(e.target.value)}
                          placeholder="Ej. 2.0"
                          className="h-8 text-xs border-slate-200 pr-6"
                          data-testid="input-broker-commission"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold">%</span>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[10px] text-slate-500">Renovación autorizada (%)</Label>
                      <Input type="number" step="0.01" min="0" max="100"
                        value={brokerRenewal} onChange={e => setBrokerRenewal(e.target.value)}
                        placeholder="0.00" className="h-8 text-xs"
                        data-testid="input-broker-renewal" />
                    </div>
                    <span className="text-[10px] text-slate-400 block leading-tight">
                      Comisión garantizada al broker originador que registra la solicitud.
                    </span>
                  </div>
                </div>

                {/* Resumen Interactivo de Distribución Económica (Dos Canales Independientes) */}
                {(() => {
                  const pFin = finCommissionRate.trim() !== "" ? parseFloat(finCommissionRate) : null;
                  const pMb = masterCommissionRate.trim() !== "" ? parseFloat(masterCommissionRate) : null;
                  const pBrk = brokerCommissionRate.trim() !== "" ? parseFloat(brokerCommissionRate) : null;

                  const marginDirect = (pFin !== null && pBrk !== null) ? Math.max(0, pFin - pBrk) : (pFin !== null && pBrk === null ? pFin : null);
                  const marginMaster = (pFin !== null && pMb !== null) ? Math.max(0, pFin - pMb) : (pFin !== null && pMb === null ? pFin : null);

                  const hasMbError = pFin !== null && pMb !== null && pMb > pFin;
                  const hasBrkError = pFin !== null && pBrk !== null && pBrk > pFin;

                  return (
                    <div className="p-4 bg-slate-50/90 rounded-xl border border-slate-200 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          <span>Distribución Económica por Canal Comercial</span>
                        </span>
                        {hasMbError || hasBrkError ? (
                          <Badge variant="destructive" className="text-[10px]">
                            Inconsistencia detectada
                          </Badge>
                        ) : pFin !== null ? (
                          <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200 font-semibold">
                            Bolsa Financiera: {pFin}%
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-slate-400 border-slate-200">
                            Borrador incompleto (permitido)
                          </Badge>
                        )}
                      </div>

                      {/* Warning Banners */}
                      {hasMbError && (
                        <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center gap-2">
                          <AlertCircle className="w-4 h-4 shrink-0" />
                          <span>La tasa para Master Broker ({pMb}%) supera la comisión pagada por la financiera ({pFin}%).</span>
                        </div>
                      )}
                      {hasBrkError && (
                        <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center gap-2">
                          <AlertCircle className="w-4 h-4 shrink-0" />
                          <span>La tasa para Broker Directo ({pBrk}%) supera la comisión pagada por la financiera ({pFin}%).</span>
                        </div>
                      )}

                      {/* Canales Separados */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                        {/* Canal 1: Broker Directo */}
                        <div className="p-3 bg-white rounded-xl border border-emerald-200/80 shadow-2xs space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-emerald-900 flex items-center gap-1">
                              Canal Broker Directo
                            </span>
                            <Badge variant="outline" className="text-[9px] bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold">
                              Canal Directo
                            </Badge>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-center pt-1">
                            <div className="p-2 bg-emerald-50/50 rounded-lg border border-emerald-100">
                              <span className="text-[10px] text-emerald-700 block font-medium">Comisión Broker</span>
                              <span className="text-sm font-bold text-emerald-800 mt-0.5 block">
                                {pBrk !== null ? `${pBrk}%` : "—"}
                              </span>
                            </div>
                            <div className="p-2 bg-slate-50 rounded-lg border border-slate-200">
                              <span className="text-[10px] text-slate-500 block font-medium">Margen Plataforma</span>
                              <span className="text-sm font-bold text-slate-900 mt-0.5 block">
                                {marginDirect !== null ? `${marginDirect.toFixed(2)}%` : "—"}
                              </span>
                            </div>
                          </div>
                          <span className="text-[10px] text-slate-400 block leading-tight">
                            Colocaciones originadas por broker directo independiente.
                          </span>
                        </div>

                        {/* Canal 2: Master Broker */}
                        <div className="p-3 bg-white rounded-xl border border-purple-200/80 shadow-2xs space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-purple-900 flex items-center gap-1">
                              Canal Master Broker
                            </span>
                            <Badge variant="outline" className="text-[9px] bg-purple-50 text-purple-700 border-purple-200 font-semibold">
                              Canal Red
                            </Badge>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-center pt-1">
                            <div className="p-2 bg-purple-50/50 rounded-lg border border-purple-100">
                              <span className="text-[10px] text-purple-700 block font-medium">Techo Red Master</span>
                              <span className="text-sm font-bold text-purple-800 mt-0.5 block">
                                {pMb !== null ? `${pMb}%` : "—"}
                              </span>
                            </div>
                            <div className="p-2 bg-slate-50 rounded-lg border border-slate-200">
                              <span className="text-[10px] text-slate-500 block font-medium">Margen Plataforma</span>
                              <span className="text-sm font-bold text-slate-900 mt-0.5 block">
                                {marginMaster !== null ? `${marginMaster.toFixed(2)}%` : "—"}
                              </span>
                            </div>
                          </div>
                          <span className="text-[10px] text-slate-400 block leading-tight">
                            Techo asignado al Master. Su red de brokers se distribuye según reglas comerciales de red.
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Notas de Comisiones */}
                <div className="space-y-1">
                  <Label htmlFor="comm-notes" className="text-xs font-semibold text-slate-700">
                    Condiciones Especiales o Notas de Comisión
                  </Label>
                  <Textarea
                    id="comm-notes"
                    value={commissionNotes}
                    onChange={(e) => setCommissionNotes(e.target.value)}
                    placeholder="Acuerdos contractuales particulares con la financiera para esta oferta..."
                    className="text-xs border-slate-200 bg-white min-h-[45px]"
                    rows={2}
                  />
                </div>
              </TabsContent>

              {/* TAB 3: PERFILES ADMITIDOS */}
              <TabsContent value="perfiles" className="space-y-3 pt-1">
                <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200/80 text-xs text-slate-600">
                  Selecciona los tipos de cliente admitidos para esta oferta comercial. Puedes guardar el borrador sin selección y definirlo más tarde.
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {TARGET_PROFILES.map((profile) => {
                    const isChecked = selectedProfiles.includes(profile.id);
                    return (
                      <label
                        key={profile.id}
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
                      </label>
                    );
                  })}
                </div>

                <div className="text-[11px] text-slate-500 italic mt-2">
                  Perfiles seleccionados actualmente: {selectedProfiles.length} de {TARGET_PROFILES.length}.
                </div>
              </TabsContent>

              {/* TAB 4: CONDICIONES DE ELEGIBILIDAD */}
              <TabsContent value="elegibilidad" className="space-y-4 pt-1">
                <p className="text-xs font-semibold">Detalle de elegibilidad importado</p>
                {sourcePanel(eligibilityDetails)}
                {agePolicy.hasConflict && !agePolicy.needsReview && !agePolicy.resolved && <p className="text-xs text-blue-700" data-testid="age-policy-source-specific">El archivo original fija mínimos específicos por perfil; el matching utilizará esos valores en lugar del mínimo numérico general importado.</p>}
                {(agePolicy.needsReview || agePolicy.resolved) && <div className="rounded-xl border border-amber-300 p-3 space-y-3 text-xs" data-testid="age-policy-review">
                  <strong>Conciliar antigüedad por perfil</strong>
                  <p>Fuente: {agePolicy.source}. {agePolicy.resolved ? "Conciliación guardada." : "La publicación queda bloqueada hasta confirmar la política correcta."} Conservamos el texto original.</p>
                  {agePolicy.rows.map(row => <label className="block space-y-1" key={row.profile}>
                    <span>{row.label}: fuente {row.sourceMonths ?? "ambigua"} · configurado {row.configuredMonths ?? "pendiente"} meses</span>
                    <Input aria-label={`Antigüedad confirmada ${row.profile}`} type="number" min="0" step="1" placeholder="Meses confirmados con la financiera" value={ageMonthsByProfile[row.profile] || ""}
                      onChange={e => {setAgeMonthsByProfile(prev => ({...prev, [row.profile]: e.target.value})); setAgeReviewed(false);}} />
                  </label>)}
                  <label className="block">Motivo de conciliación<Input value={ageReviewReason} onChange={e => {setAgeReviewReason(e.target.value);setAgeReviewed(false);}} data-testid="age-review-reason" /></label>
                  <label className="flex gap-2"><input type="checkbox" checked={ageReviewed} onChange={e => setAgeReviewed(e.target.checked)} data-testid="age-review-confirm" />Confirmo que revisé la fuente y autorizo estos mínimos por perfil como responsable comercial.</label>
                </div>}
                <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl text-xs text-amber-900 leading-relaxed">
                  <strong>Variables de Elegibilidad:</strong> No se asume que los datos estén recopilados. Únicamente se contrastan contra campos reales del expediente del cliente. Los datos faltantes o marcados como no verificados quedan pendientes por criterio.
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Antigüedad de la empresa */}
                  <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-bold text-slate-800">
                        Antigüedad Mínima del Negocio
                      </Label>
                      <Badge variant="outline" className="text-[9px] bg-slate-100 text-slate-700 border-slate-200">
                        Pendiente de Cotejo
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
                    <span className="text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200/60 block">
                      Matching: se evalúa con los datos capturados; información faltante queda pendiente.
                    </span>
                  </div>

                  {/* Facturación mensual mínima */}
                  <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-bold text-slate-800">
                        Facturación / Ingreso Mensual Mínimo
                      </Label>
                      <Badge variant="outline" className="text-[9px] bg-slate-100 text-slate-700 border-slate-200">
                        Pendiente de Cotejo
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
                    <span className="text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200/60 block">
                      Matching: se evalúa con los datos capturados; información faltante queda pendiente.
                    </span>
                  </div>

                  {/* Buró de crédito */}
                  <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-bold text-slate-800">
                        Tolerancia de Buró de Crédito
                      </Label>
                      <Badge variant="outline" className="text-[9px] bg-amber-50 text-amber-700 border-amber-200">
                        Pendiente de Verificación Documental
                      </Badge>
                    </div>
                    <Select value={bureauRequirement} onValueChange={setBureauRequirement}>
                      <SelectTrigger className="h-8 text-xs border-slate-200 bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="por_definir">Por clasificar (revisar detalle importado)</SelectItem>
                        <SelectItem value="sin_requisito" className="text-xs">Sin requisito estricto</SelectItem>
                        <SelectItem value="al_corriente" className="text-xs">Sin atrasos (MOP 01 al corriente)</SelectItem>
                        <SelectItem value="atraso_menor_30" className="text-xs">Atraso leve permitido (&lt; 30 días)</SelectItem>
                        <SelectItem value="flexible" className="text-xs">Buró flexible con quebrantos justificados</SelectItem>
                      </SelectContent>
                    </Select>
                    <span className="text-[10px] text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-200 block">
                      Matching: se evalúa con los datos capturados; información faltante queda pendiente.
                    </span>
                  </div>

                  {/* Garantías */}
                  <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-bold text-slate-800">
                        Requisito de Garantía
                      </Label>
                      <Badge variant="outline" className="text-[9px] bg-amber-50 text-amber-700 border-amber-200">
                        Pendiente de Verificación Documental
                      </Badge>
                    </div>
                    <Select value={guaranteeType} onValueChange={setGuaranteeType}>
                      <SelectTrigger className="h-8 text-xs border-slate-200 bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="por_definir">Por clasificar (revisar detalle importado)</SelectItem>
                        <SelectItem value="sin_garantia" className="text-xs">Sin Garantía (Crédito Quirografario)</SelectItem>
                        <SelectItem value="garantia_liquida" className="text-xs">Garantía Líquida</SelectItem>
                        <SelectItem value="hipotecaria" className="text-xs">Garantía Hipotecaria (Inmueble)</SelectItem>
                        <SelectItem value="prendaria" className="text-xs">Garantía Prendaria (Maquinaria/Vehículo)</SelectItem>
                      </SelectContent>
                    </Select>
                    <span className="text-[10px] text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-200 block">
                      Matching: se evalúa con los datos capturados; información faltante queda pendiente.
                    </span>
                  </div>

                  {/* Avales */}
                  <div className="sm:col-span-2 p-4 bg-white rounded-xl border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-bold text-slate-800">
                        Requisito de Aval / Obligado Solidario
                      </Label>
                      <Badge variant="outline" className="text-[9px] bg-amber-50 text-amber-700 border-amber-200">
                        Pendiente de Verificación Documental
                      </Badge>
                    </div>
                    <Select value={avalesType} onValueChange={setAvalesType}>
                      <SelectTrigger className="h-8 text-xs border-slate-200 bg-white max-w-md">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="por_definir">Por clasificar (revisar detalle importado)</SelectItem>
                        <SelectItem value="no_requerido" className="text-xs">No Requerido</SelectItem>
                        <SelectItem value="un_aval" className="text-xs">Un Aval / Obligado Solidario</SelectItem>
                        <SelectItem value="dos_avales" className="text-xs">Dos Avales</SelectItem>
                        <SelectItem value="aval_con_inmueble" className="text-xs">Aval con Inmueble Libre de Gravamen</SelectItem>
                      </SelectContent>
                    </Select>
                    <span className="text-[10px] text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-200 block">
                      Matching: se evalúa con los datos capturados; información faltante queda pendiente.
                    </span>
                  </div>
                </div>

                <div className="p-3 bg-slate-50/80 border border-slate-200/80 rounded-xl text-[11px] text-slate-600 flex items-start gap-2">
                  <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                  <span>
                    <strong>Garantía de Integridad:</strong> Cada criterio se contrasta con el expediente. Guardar documentos o condiciones no desactiva globalmente el matching. Una contradicción de la oferta requiere conciliación antes de publicar.
                  </span>
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
                        <label
                          key={doc.id}
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
                          <span>{doc.label}</span>
                        </label>
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
            </fieldset>
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
              {onOpenPublish && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isLoadingDraft || saveMutation.isPending || !draftData?.draftVersion}
                  onClick={(event) => handleSubmit(event, true)}
                  className="h-8 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50 font-semibold gap-1.5"
                  data-testid="button-open-publish-from-editor"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Revisar y Publicar</span>
                </Button>
              )}
              <Button
                type="submit"
                size="sm"
                disabled={isLoadingDraft || saveMutation.isPending || !draftData?.draftVersion}
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
