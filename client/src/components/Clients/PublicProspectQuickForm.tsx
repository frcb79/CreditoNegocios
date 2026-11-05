import { useState, type FormEvent } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, ShieldCheck } from "lucide-react";
import { buildQuickProspectProfile, type QuickProspectInput } from "@shared/prospectQuickProfile";

export default function PublicProspectQuickForm({ initialProfile, onPublicSubmit }: {
  initialProfile?: Record<string, unknown>;
  onPublicSubmit: (profile: Record<string, unknown>) => Promise<void>;
}) {
  const initial = (field:string) => typeof initialProfile?.[field] === "string" ? String(initialProfile[field]) : "";
  const [type,setType] = useState<QuickProspectInput["type"]>(
    (["persona_moral","fisica_empresarial","fisica","sin_sat"].includes(initial("type")) ?
      initial("type") : "fisica") as QuickProspectInput["type"]);
  const [firstName,setFirstName]=useState(initial("firstName"));
  const [lastName,setLastName]=useState(initial("lastName"));
  const [businessName,setBusinessName]=useState(initial("businessName"));
  const [phone,setPhone]=useState(initial("phone"));
  const [email,setEmail]=useState(initial("email"));
  const [monthlyIncome,setMonthlyIncome]=useState(initial("ingresoMensualPromedio") ||
    initial("ingresoMensualPromedioComprobables") || initial("ingresoMensualPromedioComprobablesSinSat"));
  const [yearsInBusiness,setYearsInBusiness]=useState(
    initialProfile?.yearsInBusiness != null ? String(initialProfile.yearsInBusiness) : "");
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(false);
  const business=type !== "fisica";
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    setError("");
    if(loading)return;
    try {
      const profile=buildQuickProspectProfile({
        type,firstName,lastName,businessName,phone,email,
        monthlyIncome,yearsInBusiness:business?yearsInBusiness:"",
      });
      setLoading(true);
      await onPublicSubmit(profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No fue posible enviar tus datos. Intenta de nuevo.");
    } finally {setLoading(false);}
  }
  return <Card className="border-blue-100 max-w-5xl mx-auto shadow-sm" data-testid="public-prospect-quick-form">
    <CardHeader className="border-b bg-slate-50/70 pb-4">
      <CardTitle className="text-xl">Completa tu información</CardTitle>
      <p className="text-sm text-slate-600">Solo necesitamos lo esencial para buscar alternativas de financiamiento. Tu asesor podrá completar el expediente después.</p>
    </CardHeader>
    <CardContent className="pt-5">
      <form onSubmit={event=>void submit(event)} className="space-y-5">
        <div className="space-y-2">
          <Label>Tipo de cliente *</Label>
          <Select value={type} onValueChange={value=>setType(value as QuickProspectInput["type"])}>
            <SelectTrigger data-testid="quick-profile-type"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="persona_moral">Empresa (persona moral)</SelectItem>
              <SelectItem value="fisica_empresarial">Persona física con actividad empresarial</SelectItem>
              <SelectItem value="fisica">Persona física</SelectItem>
              <SelectItem value="sin_sat">Negocio sin SAT / por regularizar</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {type==="persona_moral" && <label className="space-y-2 block">
          <Label htmlFor="quick-business">Razón social *</Label>
          <Input id="quick-business" value={businessName} onChange={e=>setBusinessName(e.target.value)}
            autoComplete="organization" maxLength={150} required data-testid="input-business-name" />
        </label>}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-2">
            <Label htmlFor="quick-first">{type==="persona_moral"?"Nombre de contacto *":"Nombre(s) *"}</Label>
            <Input id="quick-first" value={firstName} onChange={e=>setFirstName(e.target.value)}
              autoComplete="given-name" maxLength={100} required data-testid="input-first-name" />
          </label>
          <label className="block space-y-2">
            <Label htmlFor="quick-last">Apellidos</Label>
            <Input id="quick-last" value={lastName} onChange={e=>setLastName(e.target.value)}
              autoComplete="family-name" maxLength={150} data-testid="input-last-name" />
          </label>
          <label className="block space-y-2">
            <Label htmlFor="quick-phone">WhatsApp / teléfono *</Label>
            <Input id="quick-phone" value={phone} onChange={e=>setPhone(e.target.value)}
              autoComplete="tel" inputMode="tel" maxLength={25} required data-testid="input-phone" />
          </label>
          <label className="block space-y-2">
            <Label htmlFor="quick-email">Correo electrónico (opcional)</Label>
            <Input id="quick-email" type="email" value={email} onChange={e=>setEmail(e.target.value)}
              autoComplete="email" maxLength={200} data-testid="input-email" />
          </label>
          <label className="block space-y-2">
            <Label htmlFor="quick-income">{business?"Ventas o ingresos promedio mensuales (MXN) *":"Ingresos promedio mensuales (MXN) *"}</Label>
            <Input id="quick-income" inputMode="decimal" type="number" min={1} max={1000000000000}
              step="0.01" value={monthlyIncome} onChange={e=>setMonthlyIncome(e.target.value)}
              placeholder="Ej. 150000" required data-testid="quick-monthly-income" />
            <p className="text-xs text-slate-600">Estimado mensual. Calculamos automáticamente el rango anual; no es un ingreso comprobado.</p>
          </label>
          {business && <label className="block space-y-2">
            <Label htmlFor="quick-years">¿Cuántos años lleva operando tu negocio? (opcional)</Label>
            <Input id="quick-years" type="number" inputMode="numeric" min={0} max={150} step={1}
              value={yearsInBusiness} onChange={e=>setYearsInBusiness(e.target.value)}
              placeholder="Ej. 3" data-testid="quick-years-in-business" />
          </label>}
        </div>
        <div className="flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50/50 px-3 py-3 text-xs text-slate-700">
          <ShieldCheck className="h-4 w-4 shrink-0 text-blue-800" />
          No necesitas proporcionar CURP, dirección ni documentos en esta etapa. Tu asesor te pedirá lo adicional cuando sea necesario.
        </div>
        {error && <p role="alert" className="text-sm text-red-700" data-testid="public-profile-error">{error}</p>}
        <Button className="w-full sm:w-auto bg-blue-800 hover:bg-blue-900 text-white" type="submit"
          disabled={loading} data-testid="button-submit-client">
          {loading?<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Analizando...</>:"Enviar y conocer mi evaluación preliminar"}
        </Button>
      </form>
    </CardContent>
  </Card>;
}
