import { useState, type FormEvent } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, ShieldCheck, Landmark, Plus, Trash2 } from "lucide-react";
import { buildQuickProspectProfile, type QuickProspectInput, type QuickFinancialInput, type ExistingCreditInput } from "@shared/prospectQuickProfile";

const YES_NO = [{value:"si",label:"Sí"},{value:"no",label:"No"}];
const BUREAU = [
  {value:"alto-694-760",label:"Alto (694–760)"},
  {value:"bueno-592-693",label:"Bueno (592–693)"},
  {value:"medio-524-591",label:"Medio (524–591)"},
  {value:"bajo-490-523",label:"Bajo (490–523)"},
  {value:"malo-456-489",label:"Malo (456–489)"},
];
const COMPANY_BUREAU = [
  {value:"alto-310-400",label:"Alto (310–400)"},
  {value:"bueno-250-309",label:"Bueno (250–309)"},
  {value:"medio-230-249",label:"Medio (230–249)"},
  {value:"bajo-220-229",label:"Bajo (220–229)"},
  {value:"malo-100-219",label:"Malo (100–219)"},
];
const GUARANTEES = [
  {value:"sin-garantia",label:"Sin garantía"},
  {value:"prendaria",label:"Prendaria (vehículos, maquinaria)"},
  {value:"hipotecaria",label:"Hipotecaria / inmueble"},
  {value:"otros",label:"Otra"},
];
const PROPERTY_TYPES = ["oficina","departamento","casa","bodega","terreno","otro"].map(x=>({value:x,label:x.charAt(0).toUpperCase()+x.slice(1)}));
const EMPTY_CREDIT: ExistingCreditInput = {tipo:"",institucion:"",saldoOriginal:"",saldo:"",fechaInicio:"",fechaTermino:""};

export default function PublicProspectQuickForm({ initialProfile, onPublicSubmit }: {
  initialProfile?: Record<string, unknown>;
  onPublicSubmit: (profile: Record<string, unknown>) => Promise<void>;
}) {
  const initial = (field:string) => typeof initialProfile?.[field] === "string" ? String(initialProfile[field]) : "";
  const [type,setType] = useState<QuickProspectInput["type"]>(
    (["persona_moral","fisica_empresarial","fisica","sin_sat"].includes(initial("type")) ?
      initial("type") : "fisica") as QuickProspectInput["type"]);
  const [firstName,setFirstName] = useState(initial("firstName"));
  const [lastName,setLastName] = useState(initial("lastName"));
  const [businessName,setBusinessName] = useState(initial("businessName"));
  const [phone,setPhone] = useState(initial("phone"));
  const [email,setEmail] = useState(initial("email"));
  const [monthlyIncome,setMonthlyIncome] = useState(initial("ingresoMensualPromedio") ||
    initial("ingresoMensualPromedioComprobables") || initial("ingresoMensualPromedioComprobablesSinSat"));
  const [yearsInBusiness,setYearsInBusiness] = useState(initialProfile?.yearsInBusiness != null ?
    String(initialProfile.yearsInBusiness) : "");
  const [financial,setFinancial] = useState<QuickFinancialInput>({});
  const [credits,setCredits] = useState<ExistingCreditInput[]>([{...EMPTY_CREDIT}]);
  const [error,setError] = useState("");
  const [loading,setLoading] = useState(false);
  const business = type !== "fisica";
  const company = type === "persona_moral", pfae = type === "fisica_empresarial", noSat = type === "sin_sat";
  const set = (key: keyof QuickFinancialInput, value: string) =>
    setFinancial(prev=>({...prev,[key]:value}));

  function pick(key: keyof QuickFinancialInput, label: string, options: {value:string;label:string}[]) {
    return <div className="space-y-2" key={key}>
      <Label>{label}</Label>
      <Select value={String(financial[key] || "")} onValueChange={value=>set(key,value)}>
        <SelectTrigger data-testid={"public-profile-"+key}><SelectValue placeholder="Seleccionar / Por confirmar" /></SelectTrigger>
        <SelectContent>{options.map(option=><SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
      </Select>
    </div>;
  }
  function typed(key: keyof QuickFinancialInput, label:string, placeholder="") {
    return <label className="space-y-2 block" key={key}>
      <Label>{label}</Label>
      <Input value={String(financial[key] || "")} onChange={e=>set(key,e.target.value)}
        placeholder={placeholder} maxLength={300} data-testid={"public-profile-"+key} />
    </label>;
  }
  function creditField(index:number,field:keyof ExistingCreditInput,label:string,inputType="text") {
    return <label className="space-y-1.5 block">
      <Label>{label}</Label>
      <Input type={inputType} value={credits[index][field]} onChange={e=>setCredits(rows=>rows.map((row,i)=>
        i===index ? {...row,[field]:e.target.value} : row))} required maxLength={120}
        data-testid={"public-credit-"+index+"-"+field} />
    </label>;
  }
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (loading) return;
    try {
      const profile = buildQuickProspectProfile({
        type,firstName,lastName,businessName,phone,email,monthlyIncome,
        yearsInBusiness:business?yearsInBusiness:"",
        financial:{...financial,credits:financial.existingCredits==="si"?credits:undefined},
      });
      setLoading(true);
      await onPublicSubmit(profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No fue posible enviar tus datos. Intenta de nuevo.");
    } finally { setLoading(false); }
  }
  return <Card className="border-blue-100 max-w-5xl mx-auto shadow-sm" data-testid="public-prospect-quick-form">
    <CardHeader className="border-b bg-slate-50/70 pb-4">
      <CardTitle className="text-xl">Completa tu información y perfil financiero</CardTitle>
      <p className="text-sm text-slate-600">Con estos datos comparamos las alternativas publicadas. Puedes dejar pendientes los que no conozcas; tu asesor podrá completar el expediente posteriormente.</p>
    </CardHeader>
    <CardContent className="pt-5">
      <form onSubmit={event=>void submit(event)} className="space-y-7">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Tipo de cliente *</Label>
            <Select value={type} onValueChange={v=>{setType(v as QuickProspectInput["type"]);setFinancial({});}}>
              <SelectTrigger data-testid="quick-profile-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="persona_moral">Empresa (persona moral)</SelectItem>
                <SelectItem value="fisica_empresarial">Persona física con actividad empresarial</SelectItem>
                <SelectItem value="fisica">Persona física</SelectItem>
                <SelectItem value="sin_sat">Negocio sin SAT / por regularizar</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {company && <label className="space-y-2 block">
            <Label htmlFor="quick-business">Razón social *</Label>
            <Input id="quick-business" value={businessName} onChange={e=>setBusinessName(e.target.value)}
              maxLength={150} required data-testid="input-business-name" />
          </label>}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-2"><Label htmlFor="quick-first">{company?"Nombre de contacto *":"Nombre(s) *"}</Label>
              <Input id="quick-first" value={firstName} onChange={e=>setFirstName(e.target.value)}
                autoComplete="given-name" maxLength={100} required data-testid="input-first-name" /></label>
            <label className="block space-y-2"><Label htmlFor="quick-last">Apellidos</Label>
              <Input id="quick-last" value={lastName} onChange={e=>setLastName(e.target.value)}
                autoComplete="family-name" maxLength={150} data-testid="input-last-name" /></label>
            <label className="block space-y-2"><Label htmlFor="quick-phone">WhatsApp / teléfono *</Label>
              <Input id="quick-phone" value={phone} onChange={e=>setPhone(e.target.value)}
                autoComplete="tel" inputMode="tel" maxLength={25} required data-testid="input-phone" /></label>
            <label className="block space-y-2"><Label htmlFor="quick-email">Correo electrónico (opcional)</Label>
              <Input id="quick-email" type="email" value={email} onChange={e=>setEmail(e.target.value)}
                autoComplete="email" maxLength={200} data-testid="input-email" /></label>
            <label className="block space-y-2">
              <Label htmlFor="quick-income">{company?"Ventas promedio mensuales (MXN) *":"Ingresos mensuales promedio (MXN) *"}</Label>
              <Input id="quick-income" inputMode="decimal" type="number" min={1} max={1000000000000}
                step="0.01" value={monthlyIncome} onChange={e=>setMonthlyIncome(e.target.value)}
                placeholder="Ej. 150000" required data-testid="quick-monthly-income" />
              <p className="text-xs text-slate-600">Estimado mensual. Derivamos el rango anual automáticamente; no declaramos ingresos comprobados.</p>
            </label>
            {business && <label className="block space-y-2">
              <Label htmlFor="quick-years">Años operando el negocio</Label>
              <Input id="quick-years" type="number" inputMode="numeric" min={0} max={150} step={1}
                value={yearsInBusiness} onChange={e=>setYearsInBusiness(e.target.value)}
                placeholder="Ej. 3" data-testid="quick-years-in-business" />
            </label>}
            {company && <label className="block space-y-2">
              <Label htmlFor="monthly-outgoings">Egresos mensuales promedio (MXN)</Label>
              <Input id="monthly-outgoings" type="number" min={0} step="0.01" inputMode="decimal"
                value={financial.monthlyOutgoings || ""} onChange={e=>set("monthlyOutgoings",e.target.value)}
                placeholder="Estimado, si lo conoces" />
            </label>}
          </div>
        </div>

        <section className="space-y-5 rounded-xl border border-blue-100 bg-blue-50/20 p-4 sm:p-6" aria-label="Información financiera y perfilamiento" data-testid="public-profile-financial">
          <div className="flex items-start gap-3"><Landmark className="h-6 w-6 text-blue-800 shrink-0" />
            <div><h3 className="text-lg font-bold text-slate-950">Perfilamiento para encontrar alternativas</h3>
              <p className="text-sm text-slate-600">Estos criterios ayudan a identificar productos compatibles. Responde lo que sepas; no se consultará Buró ni SAT en esta etapa.</p></div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {(type==="fisica" || pfae) && pick("creditBureau","Calificación aproximada en Buró (si la conoces)",BUREAU)}
            {noSat && pick("hasBureauHistory","¿Cuenta con historial en Buró?",YES_NO)}
            {noSat && financial.hasBureauHistory==="si" && pick("creditBureauShareholder","Calificación aproximada en Buró",BUREAU)}
            {company && pick("creditBureauCompany","Buró de crédito de la empresa",COMPANY_BUREAU)}
            {company && pick("creditBureauShareholder","Buró del accionista principal",BUREAU)}
            {pick("hasArrears","¿Tienes atrasos, deudas vencidas o quitas en Buró?",YES_NO)}
            {financial.hasArrears==="si" && typed("arrearsDetails","Describe brevemente los atrasos","Ej. Crédito con atraso, fecha aproximada")}
            {pick("guarantee","¿Cuentas con garantía para respaldar el crédito?",GUARANTEES.filter(o=>o.value!=="otros"||company||pfae))}
            {financial.guarantee && financial.guarantee!=="sin-garantia" && <>
              {financial.guarantee==="prendaria" && pick("guaranteeAsset","Tipo de bien en garantía",
                ["vehiculos","maquinaria","otros"].map(x=>({value:x,label:x==="vehiculos"?"Vehículos":x==="maquinaria"?"Maquinaria":"Otro"})))}
              {financial.guarantee==="hipotecaria" && pick("propertyType","Tipo de inmueble",PROPERTY_TYPES)}
              {typed("guaranteeValue","Valor aproximado de la garantía (MXN)","Ej. 2500000")}
              {typed("guaranteeYear","Año del bien (si aplica)","Ej. 2020")}
              {typed("guaranteeLocation","Ubicación general de la garantía","Estado o municipio, sin domicilio completo")}
              {typed("guaranteeLegalStatus","Situación legal de la garantía","Ej. Libre de gravamen")}
            </>}
            {pick("guarantor","¿Cuentas con aval u obligado solidario?",YES_NO)}
            {(company||pfae) && <>
              {pick("governmentSales","Participación de ventas con gobierno",[
                {value:"0",label:"0%"},{value:"0-10",label:"0 a 10%"},{value:"menor-10",label:"Menor a 10%"},
                {value:"11-20",label:"11 a 20%"},{value:"21-40",label:"21 a 40%"},{value:"arriba-40",label:"Más de 40%"}].filter(o=>company?o.value!=="0-10":o.value!=="menor-10"))}
              {pick("terminalSales","Ventas mensuales con terminal bancaria",company?[
                {value:"no",label:"No"},{value:"hasta-50000",label:"Hasta $50,000"},
                {value:"50000-150000",label:"$50,000 a $150,000"},{value:"mayores-150000",label:"Más de $150,000"}]:[
                {value:"no",label:"No"},{value:"hasta-15000",label:"Hasta $15,000"},
                {value:"15000-30000",label:"$15,000 a $30,000"},
                {value:"30000-50000",label:"$30,000 a $50,000"},
                {value:"50000-100000",label:"$50,000 a $100,000"},
                {value:"mayores-100000",label:"Más de $100,000"}])}
              {pick("satConnection","¿Estás abierto a conectar información del SAT mediante CIEC?",YES_NO)}
              {pick("financialStatements","¿Cuentas con estados financieros?",YES_NO)}
              {pick("complianceOpinion","Opinión de cumplimiento fiscal",[
                {value:"positiva",label:"Positiva"},{value:"negativa",label:"Negativa"},{value:"no-disponible",label:"No la conozco"}])}
              {financial.complianceOpinion==="negativa" && typed("opinionDetails","Detalle de opinión negativa")}
            </>}
            {pick("existingCredits","¿Tienes créditos vigentes?",YES_NO)}
          </div>
          {financial.existingCredits==="si" && <div className="space-y-4 rounded-lg border bg-white p-4" data-testid="public-existing-credits">
            <div><h4 className="font-semibold">Créditos vigentes</h4>
              <p className="text-xs text-slate-600">Completa los datos que permitan evaluar tu nivel de endeudamiento.</p></div>
            {credits.map((credit,index)=><div key={index} className="rounded-lg border bg-slate-50 p-4 space-y-3">
              <div className="flex items-center justify-between"><strong className="text-sm">Crédito {index+1}</strong>
                {credits.length>1 && <Button type="button" variant="ghost" size="sm" aria-label={"Eliminar crédito "+(index+1)}
                  onClick={()=>setCredits(rows=>rows.filter((_,i)=>i!==index))}><Trash2 className="h-4 w-4" /></Button>}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {creditField(index,"tipo","Tipo de crédito")}
                {creditField(index,"institucion","Institución financiera")}
                {creditField(index,"saldoOriginal","Monto original (MXN)","number")}
                {creditField(index,"saldo","Saldo actual (MXN)","number")}
                {creditField(index,"fechaInicio","Fecha de inicio","date")}
                {creditField(index,"fechaTermino","Fecha de vencimiento","date")}
              </div>
            </div>)}
            {credits.length<5 && <Button type="button" variant="outline" size="sm"
              onClick={()=>setCredits(rows=>[...rows,{...EMPTY_CREDIT}])}><Plus className="h-4 w-4 mr-2" /> Agregar otro crédito</Button>}
          </div>}
        </section>
        <div className="flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50/50 px-3 py-3 text-xs text-slate-700">
          <ShieldCheck className="h-4 w-4 shrink-0 text-blue-800" />
          No necesitas proporcionar CURP, domicilio, estado civil ni documentos. Tu asesor podrá solicitar después los datos de expediente.
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
