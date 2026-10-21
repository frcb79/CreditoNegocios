import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Truck, Building2, CircleHelp, CheckCircle2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Client } from "@shared/schema";
import { LEASING_ASSET_TYPES, leaseLeadSchema } from "@shared/leasing";

type Fields = Record<string, string>;
const empty: Fields = {
  clientId: "", clientType: "persona_moral", businessName: "", firstName: "", lastName: "",
  phone: "", email: "", rfc: "", assetType: "vehiculo", assetDescription: "",
  brand: "", model: "", version: "", year: "", unitValue: "", quantity: "1",
  leaseModality: "por_definir", preferredTermMonths: "", initialContribution: "",
  state: "", monthlyRevenue: "", yearsInBusiness: "", brokerNotes: "",
};
const mxn = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n);
const nameOf = (client: Client) => client.type === "persona_moral"
  ? client.businessName || "Empresa sin nombre"
  : `${client.firstName || ""} ${client.lastName || ""}`.trim() || "Prospecto sin nombre";

interface LeasingLeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function LeasingLeadModal({ isOpen, onClose, onSuccess }: LeasingLeadModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [fields, setFields] = useState<Fields>(empty);
  const [useExisting, setUseExisting] = useState(false);
  const [formError, setFormError] = useState("");
  const { data: clients = [] } = useQuery<Client[]>({ queryKey: ["/api/clients"], enabled: isOpen });
  useEffect(() => {
    if (isOpen) { setFields({ ...empty }); setUseExisting(false); setFormError(""); }
  }, [isOpen]);

  const put = (key: string, value: string) => { setFields(prev => ({ ...prev, [key]: value })); setFormError(""); };
  const submit = useMutation({
    mutationFn: async (payload: unknown) => (await apiRequest("POST", "/api/leasing-leads", payload)).json(),
    onSuccess: (result: any) => {
      for (const key of ["/api/clients", "/api/credit-submissions", "/api/dashboard/pipeline", "/api/dashboard/metrics", "/api/notifications"]) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
      toast({ title: "Cotización solicitada", description: result.message || "La oportunidad quedó registrada para revisión." });
      onSuccess?.();
      onClose();
    },
    onError: (error: any) => setFormError(error?.message || "No se pudo registrar la solicitud"),
  });

  const handleSubmit = () => {
    const payload: Record<string, unknown> = {
      assetType: fields.assetType,
      assetDescription: fields.assetDescription || undefined,
      brand: fields.brand || undefined,
      model: fields.model || undefined,
      version: fields.version || undefined,
      year: fields.year ? Number(fields.year) : undefined,
      unitValue: Number(fields.unitValue),
      quantity: Number(fields.quantity),
      leaseModality: fields.leaseModality,
      preferredTermMonths: fields.preferredTermMonths ? Number(fields.preferredTermMonths) : undefined,
      initialContribution: fields.initialContribution ? Number(fields.initialContribution) : undefined,
      state: fields.state || undefined,
      monthlyRevenue: fields.monthlyRevenue ? Number(fields.monthlyRevenue) : undefined,
      yearsInBusiness: fields.yearsInBusiness ? Number(fields.yearsInBusiness) : undefined,
      brokerNotes: fields.brokerNotes || undefined,
    };
    if (useExisting) {
      payload.clientId = fields.clientId;
    } else {
      Object.assign(payload, {
        clientType: fields.clientType, businessName: fields.businessName || undefined,
        firstName: fields.firstName || undefined, lastName: fields.lastName || undefined,
        phone: fields.phone || undefined, email: fields.email || undefined,
        rfc: fields.rfc || undefined,
      });
    }
    const valid = leaseLeadSchema.safeParse(payload);
    if (!valid.success) {
      setFormError(valid.error.issues[0]?.message || "Revisa los campos obligatorios");
      return;
    }
    setFormError("");
    submit.mutate(valid.data);
  };
  const selectedClient = clients.find(c => c.id === fields.clientId);
  const total = Number(fields.unitValue) * Number(fields.quantity);
  const vehicle = fields.assetType === "vehiculo";
  const field = (key: string, title: string, placeholder?: string, type: string = "text", required = false) => (
    <div className="space-y-1.5 min-w-0" key={key}>
      <Label htmlFor={`lease-${key}`} className="text-xs font-medium">{title}{required ? " *" : ""}</Label>
      <Input
        id={`lease-${key}`} data-testid={`input-lease-${key}`}
        type={type} min={type === "number" ? "0" : undefined}
        placeholder={placeholder} value={fields[key] || ""}
        onChange={e => put(key, e.target.value)}
        className="h-9 text-sm"
      />
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !submit.isPending) onClose(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[92vh] flex flex-col p-0 overflow-hidden" data-testid="modal-leasing-lead">
        <DialogHeader className="p-4 sm:p-5 border-b bg-muted/20">
          <DialogTitle className="flex items-center gap-2"><Truck className="h-5 w-5 text-primary" /> Solicitar cotización de Arrendamiento</DialogTitle>
          <DialogDescription>Con los datos básicos y el activo podemos iniciar la cotización. El expediente completo se solicita después, si tu prospecto está interesado.</DialogDescription>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-5">
          <section className="space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2"><Building2 className="h-4 w-4" /> 1. Prospecto</h3>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant={!useExisting ? "default" : "outline"} onClick={() => { setUseExisting(false); put("clientId", ""); }}>Nuevo prospecto</Button>
              <Button type="button" size="sm" variant={useExisting ? "default" : "outline"} onClick={() => { setUseExisting(true); setFormError(""); }}>Cliente existente</Button>
            </div>
            {useExisting ? (
              <div className="space-y-1.5">
                <Label>Selecciona el cliente registrado *</Label>
                <Select value={fields.clientId} onValueChange={v => put("clientId", v)}>
                  <SelectTrigger data-testid="select-lease-existing-client"><SelectValue placeholder="Buscar en mi cartera" /></SelectTrigger>
                  <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{nameOf(c)}{c.rfc ? ` · ${c.rfc}` : ""}</SelectItem>)}</SelectContent>
                </Select>
                {selectedClient && <p className="text-xs text-muted-foreground">Se creará una nueva oportunidad para {nameOf(selectedClient)} sin duplicar su expediente.</p>}
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label>Tipo de prospecto *</Label>
                  <Select value={fields.clientType} onValueChange={v => put("clientType", v)}>
                    <SelectTrigger data-testid="select-lease-client-type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="persona_moral">Empresa / Persona Moral</SelectItem>
                      <SelectItem value="fisica_empresarial">Persona Física con Actividad Empresarial</SelectItem>
                      <SelectItem value="fisica">Persona Física</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {fields.clientType === "persona_moral" && field("businessName", "Razón social", "Nombre de la empresa", "text", true)}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {field("firstName", fields.clientType === "persona_moral" ? "Nombre del contacto" : "Nombre", "Nombre", "text", fields.clientType !== "persona_moral")}
                  {field("lastName", "Apellido", "Apellido")}
                  {field("phone", "Teléfono", "10 dígitos", "tel", true)}
                  {field("email", "Correo electrónico", "correo@empresa.com", "email", true)}
                  {field("rfc", "RFC (opcional)", "Se puede completar después")}
                </div>
              </>
            )}
          </section>
          <section className="space-y-3 border-t pt-4">
            <h3 className="text-sm font-semibold">2. ¿Qué desea arrendar?</h3>
            <div className="space-y-1.5">
              <Label>Tipo de activo *</Label>
              <Select value={fields.assetType} onValueChange={v => put("assetType", v)}>
                <SelectTrigger data-testid="select-lease-asset"><SelectValue /></SelectTrigger>
                <SelectContent>{LEASING_ASSET_TYPES.map(t => <SelectItem value={t.value} key={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {vehicle ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {field("brand", "Marca del automóvil", "Toyota, BMW, Nissan...", "text", true)}
                {field("model", "Modelo", "Corolla, X3, Versa...", "text", true)}
                {field("version", "Versión (si se conoce)", "Versión y equipamiento")}
                {field("year", "Año modelo", String(new Date().getFullYear()), "number", true)}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="lease-assetDescription">Tipo específico de maquinaria / activo *</Label>
                  <Textarea id="lease-assetDescription" data-testid="input-lease-assetDescription" rows={2}
                    value={fields.assetDescription}
                    placeholder="Ej. excavadora hidráulica de 20 toneladas, tractor agrícola 110 HP, tractocamión quinta rueda..."
                    onChange={e => put("assetDescription", e.target.value)} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {field("brand", "Marca (si se conoce)", "Caterpillar, John Deere...")}
                  {field("model", "Modelo (si se conoce)", "Modelo del equipo")}
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {field("unitValue", "Valor aproximado por unidad (MXN)", "Ej. 750000", "number", true)}
              {field("quantity", "Número de unidades", "1", "number", true)}
            </div>
            {total > 0 && Number.isFinite(total) &&
              <p className="text-sm font-semibold text-primary" data-testid="lease-total-value">Valor total estimado de activos: {mxn(total)}</p>}
            <p className="text-xs text-muted-foreground">El valor es una referencia para cotizar; no representa crédito aprobado ni mensualidad definitiva.</p>
          </section>
          <section className="space-y-3 border-t pt-4">
            <h3 className="text-sm font-semibold">3. Preferencias e información adicional <span className="text-muted-foreground font-normal">(opcional)</span></h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Modalidad</Label>
                <Select value={fields.leaseModality} onValueChange={v => put("leaseModality", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="por_definir">Por definir</SelectItem>
                    <SelectItem value="puro">Arrendamiento puro</SelectItem>
                    <SelectItem value="financiero">Arrendamiento financiero</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {field("preferredTermMonths", "Plazo deseado (meses)", "Ej. 36", "number")}
              {field("initialContribution", "Aportación inicial estimada (MXN)", "Si se conoce", "number")}
              {field("state", "Estado de operación", "Ej. Jalisco")}
              {field("monthlyRevenue", "Ingresos mensuales aproximados (MXN)", "Si se conocen", "number")}
              {field("yearsInBusiness", "Antigüedad del negocio (años)", "Si se conoce", "number")}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lease-notes">Notas para cotización</Label>
              <Textarea id="lease-notes" rows={2} value={fields.brokerNotes} onChange={e => put("brokerNotes", e.target.value)}
                placeholder="Uso del activo, proveedor, condiciones relevantes..." />
            </div>
          </section>
          <Alert className="border-sky-200 bg-sky-50/50">
            <CircleHelp className="h-4 w-4" />
            <AlertDescription className="text-xs">
              La oportunidad se guarda para revisión interna de Crédito Negocios. No se comparten datos ni documentos con arrendadoras automáticamente.
            </AlertDescription>
          </Alert>
          {formError && <Alert variant="destructive" role="alert"><AlertDescription data-testid="lease-form-error">{formError}</AlertDescription></Alert>}
        </div>
        <DialogFooter className="p-4 border-t bg-background flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose} disabled={submit.isPending}>Cancelar</Button>
          <Button type="button" onClick={handleSubmit} disabled={submit.isPending} data-testid="button-submit-leasing">
            <CheckCircle2 className="h-4 w-4 mr-1.5" /> {submit.isPending ? "Guardando..." : "Registrar para cotización"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
