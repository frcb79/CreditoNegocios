import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, BriefcaseBusiness, UserRound, Store, ShieldCheck, Loader2, ArrowRight, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { CommercialDuplicateAlert, type DuplicateCheckResult } from "@/components/Commercial/CommercialDuplicateAlert";
import { CLIENT_TYPE_PRESENTATION, CLIENT_TYPE_OPTIONS, type ClientProfileType } from "@/lib/clientTypePresentation";
import { cn } from "@/lib/utils";
import type { Client } from "@shared/schema";
import { quickClientSchema } from "@shared/quickClientValidation";


type QuickFormFields = {
  type: ClientProfileType;
  businessName: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  rfc: string;
  state: string;
  industry: string;
  yearsInBusiness: string;
  notes: string;
};
const initial: QuickFormFields = {
  type: "persona_moral",
  businessName: "", firstName: "", lastName: "",
  phone: "", email: "", rfc: "", state: "", industry: "", yearsInBusiness: "", notes: "",
};

const clientTypeIcons = {
  persona_moral: Building2,
  fisica_empresarial: BriefcaseBusiness,
  fisica: UserRound,
  sin_sat: Store,
};

export default function QuickClientForm({
  onSaved,
  onCancel,
  onExisting,
  initialValues,
  adminCapture = false,
}: {
  onSaved: (client: Client, continueProfile?: boolean) => void;
  onCancel: () => void;
  onExisting: (clientId: string) => void;
  initialValues?: Partial<QuickFormFields>;
  adminCapture?: boolean;
}) {
  const { toast } = useToast();
  const cache = useQueryClient();
  const [fields, setFields] = useState<QuickFormFields>(() => ({ ...initial, ...initialValues }));
  const [contactConfirmed, setContactConfirmed] = useState(false);
  const [section, setSection] = useState<"contact" | "matching">("contact");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [duplicate, setDuplicate] = useState<DuplicateCheckResult | null>(null);
  const [checkedSignature, setCheckedSignature] = useState("");
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [originator, setOriginator] = useState("");
  const originators = useQuery<Array<{id:string;firstName?:string;lastName?:string;brandName?:string;role:string;organization?:string}>>({
    queryKey: ["/api/admin/capture-originators"], enabled: adminCapture,
  });

  const update = (key: keyof QuickFormFields, value: string) => {
    setFields(prev => ({ ...prev, [key]: value }));
    setErrors(prev => ({ ...prev, [key]: "" }));
    setRequestError("");
    if (["type", "businessName", "firstName", "lastName", "email", "phone", "rfc"].includes(key)) {
      setContactConfirmed(false);
      setDuplicate(null);
      setCheckedSignature("");
    }
  };

  const checkSignature = (values: QuickFormFields) =>
    JSON.stringify([values.rfc.trim().toUpperCase(), values.phone.replace(/\D/g, ""), values.email.trim().toLowerCase()]);

  const checkDuplicate = async (values: QuickFormFields): Promise<DuplicateCheckResult | null> => {
    if (!values.rfc && !values.phone && !values.email) return null;
    const response = await apiRequest("POST", "/api/clients/check-duplicates", {
      rfc: values.rfc.trim().toUpperCase() || undefined,
      phone: values.phone || undefined,
      email: values.email.trim().toLowerCase() || undefined,
      financingNeedType: "credito_empresarial",
    });
    return response.json();
  };

  const handleCheck = async () => {
    setChecking(true);
    try {
      const result = await checkDuplicate(fields);
      setDuplicate(result);
      setCheckedSignature(checkSignature(fields));
      setRequestError("");
    } catch {
      setRequestError("No se pudo verificar si el cliente existe. Reintenta la consulta.");
      setCheckedSignature("");
    } finally {
      setChecking(false);
    }
  };

  const validateContact = () => {
    if (adminCapture && (!originator || (originator !== "__self__" && !originators.data?.some(u=>u.id===originator)))) {
      setRequestError("Selecciona el asesor antes de continuar."); setSection("contact"); return false;
    }
    const parsed=quickClientSchema.safeParse({...fields,industry:"",yearsInBusiness:"",state:"",notes:""});
    if (!parsed.success) {
      const next:Record<string,string>={}; for(const issue of parsed.error.issues) next[String(issue.path[0])]=issue.message;
      setErrors(prev=>({...prev,...next})); setRequestError("Completa los datos de contacto señalados para continuar.");
      setSection("contact"); requestAnimationFrame(()=>document.getElementById("quick-client-"+String(parsed.error.issues[0]?.path[0]))?.focus()); return false;
    }
    setRequestError(""); return true;
  };
  const advanceContact=()=>{if(validateContact()){setContactConfirmed(true);setSection("matching");requestAnimationFrame(()=>document.getElementById("quick-steps")?.scrollIntoView({block:"start"}));}};
  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving || checking) return;
    const continueProfile = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "profile";
    if (!validateContact()) return;
    const parsed = quickClientSchema.safeParse(fields);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0]);
        if (!next[key]) next[key] = issue.message;
      }
      setErrors(next);
      const first = String(parsed.error.issues[0]?.path[0]);
      setSection(["industry", "yearsInBusiness", "state", "notes"].includes(first) ? "matching" : "contact");
      requestAnimationFrame(() => document.getElementById("quick-client-" + first)?.focus());
      return;
    }
    setSaving(true);
    setRequestError("");
    try {
      // The required pre-submit check is repeated, even if a prior inline check passed.
      // A customer found in a different tenant must never have their identity exposed.
      const result = await checkDuplicate(fields);
      setDuplicate(result);
      setCheckedSignature(checkSignature(fields));
      if (result?.clientExists) {
        setRequestError("El cliente ya existe. Revisa el aviso y utiliza su expediente o solicita revisión comercial.");
        return;
      }
      const data = parsed.data;
      const payload: Record<string, unknown> = {
        type: data.type,
        businessName: data.businessName || null,
        firstName: data.firstName || null,
        lastName: data.lastName || null,
        phone: data.phone || null,
        email: data.email || null,
        rfc: data.rfc ? data.rfc.toUpperCase() : null,
        state: data.state || null,
        industry: data.industry || null,
        yearsInBusiness: typeof data.yearsInBusiness === "number" ? data.yearsInBusiness : null,
        notes: data.notes || null,
        originOpportunity: "credito_empresarial",
        ...(adminCapture && originator !== "__self__" ? { brokerId: originator } : {}),
      };
      const saved = await apiRequest("POST", "/api/clients", payload);
      const client = await saved.json() as Client;
      await cache.invalidateQueries({ queryKey: ["/api/clients"] });
      cache.invalidateQueries({ queryKey: ["/api/dashboard/metrics"] });
      toast({ title: "Prospecto guardado", description: "Puedes completar su perfil cuando la operación lo requiera." });
      onSaved(client, continueProfile);
    } catch (error: any) {
      setRequestError(error?.message || "No se pudo guardar el prospecto. Inténtalo nuevamente.");
    } finally {
      setSaving(false);
    }
  };

  const field = (key: keyof QuickFormFields, label: string, placeholder: string, type = "text", required = false) => (
    <div className="space-y-1.5 min-w-0">
      <Label htmlFor={"quick-client-" + key}>{label}{required && <span aria-hidden="true"> *</span>}</Label>
      <Input
        id={"quick-client-" + key} data-testid={"quick-client-" + key}
        value={fields[key]} onChange={e => update(key, e.target.value)}
        type={type} placeholder={placeholder} aria-invalid={Boolean(errors[key])}
        aria-describedby={errors[key] ? "quick-client-error-" + key : undefined}
        className={cn("h-11 text-base sm:h-10 sm:text-sm", errors[key] && "border-destructive")}
      />
      {errors[key] && <p id={"quick-client-error-" + key} className="text-xs text-destructive" role="alert">{errors[key]}</p>}
    </div>
  );

  const signatureIsCurrent = checkedSignature === checkSignature(fields);
  const existingId = duplicate?.isSameTenant ? duplicate.existingClient?.id : null;
  return (
    <Card className="max-w-4xl mx-auto border-border/80 shadow-sm" data-testid="quick-client-form">
      <CardHeader className="border-b bg-muted/20 p-4 sm:p-6 space-y-1">
        <CardTitle className="text-xl">Nuevo prospecto</CardTitle>
        <CardDescription>Registra los datos básicos y continúa al perfil financiero para mejorar el matching. Puedes guardar y completarlo después.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <form onSubmit={handleSave} noValidate>
          <div className="p-4 sm:p-6 space-y-6">
            {adminCapture && <section hidden={section!=="contact"} className="space-y-2">
              <Label htmlFor="quick-originator">Asignar cliente a *</Label>
              <select id="quick-originator" data-testid="quick-originator" className="w-full h-10 rounded-md border bg-background px-3 text-sm" value={originator} onChange={e=>{setOriginator(e.target.value);setContactConfirmed(false);setRequestError("");}}>
                <option value="">Selecciona un asesor</option>
                <option value="__self__">Plataforma / registro directo</option>
                {originators.data?.map(u=><option key={u.id} value={u.id}>{u.brandName || [u.firstName,u.lastName].filter(Boolean).join(" ") || u.id} · {u.role==="master_broker"?"Master Broker":"Broker"} · {u.organization}</option>)}
              </select>
              {originators.isError && <p role="alert" className="text-sm text-destructive">No se pudo cargar la red. Reintenta antes de asignar.</p>}
              {originators.isLoading && <p className="text-xs text-muted-foreground">Cargando asesores...</p>}
              <p className="text-xs text-muted-foreground">Se registra tu usuario como capturista y el asesor elegido como originador comercial.</p>
            </section>}
            <section hidden={section!=="contact"} aria-labelledby="quick-client-type-title" className="space-y-3">
              <h2 id="quick-client-type-title" className="font-semibold text-sm">1. Tipo de cliente</h2>
              <div className="grid grid-cols-4 gap-1.5 sm:gap-2.5">
                {CLIENT_TYPE_OPTIONS.map(type => {
                  const meta = CLIENT_TYPE_PRESENTATION[type];
                  const Icon = clientTypeIcons[type];
                  const selected = fields.type === type;
                  return (
                    <button
                      type="button" key={type} data-testid={"quick-type-" + type}
                      aria-label={meta.label + ": " + meta.description} aria-pressed={selected} onClick={() => update("type", type)}
                      className={cn("flex flex-col sm:flex-row items-center gap-1 sm:gap-3 text-center sm:text-left rounded-lg border px-1 py-2 sm:p-3 min-w-0 min-h-16 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", selected ? meta.selectedClass : "border-border bg-card hover:bg-muted/50")}
                    >
                      <span className={cn("rounded-md p-1.5 sm:p-2 shrink-0", meta.iconClass)}><Icon className="h-4 w-4 sm:h-5 sm:w-5" /></span>
                      <span className="min-w-0">
                        <span className="block text-xs sm:text-sm font-semibold sm:hidden">{meta.short}</span><span className="hidden sm:block text-sm font-semibold">{meta.label}</span>
                        <span className="hidden sm:block text-xs text-muted-foreground">{meta.description}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground sm:hidden">{CLIENT_TYPE_PRESENTATION[fields.type].label} · {CLIENT_TYPE_PRESENTATION[fields.type].description}</p>
              {fields.type === "sin_sat" && (
                <p className="text-xs text-muted-foreground flex gap-1.5 items-start"><Info className="w-4 h-4 shrink-0" />
                  Para prospectos sin información fiscal disponible. No equivale a un rechazo de crédito ni impide completar el perfil posteriormente.
                </p>
              )}
            </section>

            <nav id="quick-steps" aria-label="Secciones del prospecto" className="sticky top-0 z-10 grid grid-cols-2 gap-1 rounded-lg border bg-background p-1 shadow-sm">
              <Button type="button" variant={section==="contact"?"default":"ghost"} aria-pressed={section==="contact"} data-testid="quick-tab-contact" onClick={()=>setSection("contact")} className="min-h-11 text-xs sm:text-sm whitespace-normal">1. Contacto</Button>
              <Button type="button" variant={section==="matching"?"default":"ghost"} aria-pressed={section==="matching"} data-testid="quick-tab-matching" onClick={advanceContact} disabled={!contactConfirmed||saving||checking} className="min-h-11 text-xs sm:text-sm whitespace-normal">2. Datos del negocio</Button>
            </nav>
            <section hidden={section!=="contact"} aria-labelledby="quick-client-contact-title" className="space-y-3 border-t pt-5">
              <h2 id="quick-client-contact-title" className="text-sm font-semibold">Datos esenciales</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {fields.type === "persona_moral" && field("businessName", "Razón social", "Nombre de la empresa", "text", true)}
                {field("firstName", fields.type === "persona_moral" ? "Nombre del contacto" : "Nombre", "Nombre del prospecto", "text", fields.type !== "persona_moral")}
                {field("lastName", "Apellidos", "Apellidos")}
                {field("phone", "Teléfono", "10 dígitos", "tel")}
                {field("email", "Correo electrónico", "correo@ejemplo.com", "email")}
                {fields.type !== "sin_sat" && field("rfc", "RFC (si se conoce)", "RFC")}
              </div>
              <p className="text-xs text-muted-foreground">Para guardar es suficiente contar con teléfono o correo. No solicitamos información financiera en esta etapa.</p>
            </section>
            <section hidden={section!=="matching"} className="border rounded-lg p-3 space-y-3" data-testid="quick-matching-panel">
              <h2 className="font-semibold text-sm">Datos del negocio para matching</h2>
              <p className="text-xs text-muted-foreground">Paso 2 de 3 · Estos datos son opcionales. Después puedes completar ingresos, buró, garantías y créditos sin volver a capturar el contacto.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    {field("industry", "Giro / actividad", "Ej. Comercio, manufactura")}
                    {field("yearsInBusiness", "Antigüedad del negocio (años)", "Ej. 5", "number")}
                    {field("state", "Estado", "Ej. Nuevo León")}
                  </div>
                  <div className="space-y-1.5 mt-3">
                    <Label htmlFor="quick-client-notes">Notas del prospecto</Label>
                    <Textarea id="quick-client-notes" value={fields.notes} onChange={e => update("notes", e.target.value)} rows={3} maxLength={2000} placeholder="Información relevante para una futura solicitud" />
                  </div>
            </section>
            <section aria-label="Comprobar cliente existente" className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex gap-1.5 items-center text-sm font-medium"><ShieldCheck className="h-4 w-4 text-primary" /> Protección de clientes y oportunidades</span>
                <Button type="button" size="sm" variant="outline" onClick={handleCheck} disabled={checking || saving} data-testid="quick-check-duplicates">
                  {checking && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
                  Verificar si ya existe
                </Button>
              </div>
              {duplicate && signatureIsCurrent && <CommercialDuplicateAlert result={duplicate} />}
              {existingId && duplicate?.clientExists && signatureIsCurrent && (
                <Button type="button" variant="outline" onClick={() => onExisting(existingId)} data-testid="quick-open-existing">
                  Abrir expediente existente <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              )}
              {requestError && <Alert variant="destructive" role="alert"><AlertDescription>{requestError}</AlertDescription></Alert>}
            </section>
          </div>
          <div className="sticky bottom-0 z-10 border-t bg-background/95 backdrop-blur p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 flex flex-wrap gap-2 items-center sm:justify-end shadow-sm">
            <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>Cancelar</Button>
            <Button type="submit" value="save" variant="outline" className="min-h-11 flex-1 sm:flex-none sm:min-h-9" disabled={saving || checking} data-testid="button-submit-client">
              {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
              {saving ? "Guardando..." : "Guardar prospecto"}
            </Button>
            {section==="matching" && <Button type="button" variant="ghost" onClick={()=>setSection("contact")} disabled={saving||checking}>Anterior</Button>}
            {section==="contact" ? <Button type="button" onClick={advanceContact} className="min-h-11 w-full sm:w-auto" disabled={saving||checking} data-testid="quick-next-matching">Siguiente: datos del negocio <ArrowRight className="w-4 h-4 ml-1"/></Button> : <Button type="submit" value="profile" className="min-h-11 w-full sm:w-auto" disabled={saving||checking} data-testid="quick-save-and-profile">Siguiente: perfil financiero <ArrowRight className="w-4 h-4 ml-1"/></Button>}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
