import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import PublicProspectQuickForm from "@/components/Clients/PublicProspectQuickForm";
import ProspectPageLayout, { ProspectTrustNotice } from "@/components/Clients/ProspectPageLayout";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, ClipboardCheck, ShieldCheck, ArrowRight, CircleHelp } from "lucide-react";
import { LEASING_ASSET_TYPES } from "@shared/leasing";

type Assessment = {
  status: "possible_options" | "missing_information" | "under_review" | "pending";
  institutionCount?: number;
  reviewedOffers?: number;
  message: string;
  criteria?: { matched: string[]; toReview: string[]; notMatched: string[] };
};
type InitialFinancing = {
  product?: string; amount?: string; termMonths?: string; purpose?: string;
};
const PRODUCT_OPTIONS = [
  { id:"simple", name:"Crédito Simple / Capital de trabajo" },
  { id:"revolvente", name:"Crédito Revolvente" },
  { id:"factoraje", name:"Factoraje" },
  { id:"arrendamiento", name:"Arrendamiento" },
  { id:"hipotecario", name:"Hipotecario / Garantía inmobiliaria" },
  { id:"tpv_anticipo", name:"Anticipo de ventas (TPV)" },
  { id:"institucional", name:"Otro financiamiento (revisión por asesor)" },
];

function useCompletionInfo(token: string) {
  return useQuery<{ advisorName: string; privacyVersion: string }>({
    queryKey: ["public-prospect-completion", token], retry: false, staleTime: Infinity, refetchOnWindowFocus: false,
    queryFn: async () => {
      const response = await fetch("/api/public/prospect-completion/" + encodeURIComponent(token), { credentials: "omit", cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "Enlace no disponible");
      return body;
    },
  });
}

export function ProspectCompletionForm({ token, initialProfile, initialFinancing, onBack }: {
  token: string; initialProfile?: Record<string, unknown>; initialFinancing?: InitialFinancing; onBack?: () => void;
}) {
  const [accepted, setAccepted] = useState(false);
  const [complete, setComplete] = useState(false);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [product,setProduct] = useState(initialFinancing?.product || "");
  const [amount,setAmount] = useState(initialFinancing?.amount || "");
  const [termMonths,setTermMonths] = useState(initialFinancing?.termMonths || "");
  const [purpose,setPurpose] = useState(initialFinancing?.purpose || "");
  const [leasingAssetType,setLeasingAssetType] = useState("");
  const [financingError,setFinancingError] = useState("");
  const info = useCompletionInfo(token);
  if (info.isLoading) return <p role="status">Preparando tu formulario…</p>;
  if (info.error || !info.data) return <div role="alert" className="rounded-xl border bg-white p-6 space-y-3">
    <h1 className="text-xl font-bold">Enlace no disponible</h1>
    <p>{info.error instanceof Error ? info.error.message : "Solicita un nuevo enlace a tu asesor."}</p>
  </div>;

  if (complete) {
    const hasOptions=assessment?.status === "possible_options" && Number(assessment.institutionCount) > 0;
    const criteriaMatched=assessment?.criteria?.matched || [];
    const criteriaPending=assessment?.criteria?.toReview || [];
    const criteriaNotMatched=assessment?.criteria?.notMatched || [];
    const reviewedOffers=assessment?.reviewedOffers || 0;
    const hasEvaluated=Boolean(assessment && assessment.status !== "pending" && reviewedOffers > 0);
    return <section className="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm"
      data-testid="prospect-profile-success">
      <div className="bg-[#103d72] px-6 py-8 sm:px-10 text-white">
        <div className="flex items-center gap-2 text-sm font-semibold text-blue-100">
          <ShieldCheck className="h-5 w-5" /> Evaluación preliminar · Crédito Negocios
        </div>
        <h1 className="mt-3 text-2xl sm:text-3xl font-bold">
          {hasEvaluated ? "Ya analizamos tu solicitud" : "Recibimos tu solicitud"}
        </h1>
        <p className="mt-2 text-sm sm:text-base text-blue-100 leading-relaxed">
          Tu información quedó registrada con {info.data.advisorName}. Tu asesor podrá continuar contigo.
        </p>
      </div>

      <div className="p-5 sm:p-8 space-y-6" data-testid="public-anonymous-matching">
        <div className="grid gap-4 lg:grid-cols-[1.35fr_.65fr]">
          <div className={hasOptions ?
            "rounded-2xl bg-gradient-to-br from-blue-900 to-blue-700 text-white p-6 sm:p-8 shadow-sm" :
            "rounded-2xl border border-blue-200 bg-blue-50 p-6 sm:p-8"}>
            <div className={"mb-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold " +
              (hasOptions ? "bg-white/15 text-white" : "bg-white text-blue-900 border border-blue-200")}>
              <CheckCircle2 className="h-4 w-4" /> Evaluación preliminar registrada
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold leading-tight" data-testid="matching-result-headline">
              {hasOptions ? "Encontramos alternativas para explorar contigo" :
                reviewedOffers>0 ? "Tenemos un diagnóstico para continuar" :
                "Tu asesor revisará alternativas para ti"}
            </h2>
            <p className={"mt-4 text-sm sm:text-base leading-relaxed " +
              (hasOptions?"text-blue-100":"text-slate-700")}>
              {assessment?.message || "Recibimos tu información. Tu asesor continuará la revisión."}
            </p>
            <p className={"mt-4 text-xs "+(hasOptions?"text-blue-100":"text-slate-600")}>
              El análisis es orientativo y no constituye aprobación ni una oferta de financiamiento.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-6 flex flex-col justify-center items-center text-center shadow-sm"
            data-testid="verified-match-summary">
            <div className={"h-16 w-16 flex items-center justify-center rounded-2xl mb-3 " +
              (hasOptions?"bg-blue-100 text-blue-900":"bg-slate-100 text-slate-700")}>
              <ClipboardCheck className="h-8 w-8" />
            </div>
            {hasOptions ? <>
              <p className="text-5xl sm:text-6xl font-extrabold tracking-tight tabular-nums text-blue-950"
                data-testid="verified-institution-count">{assessment!.institutionCount}</p>
              <p className="mt-2 font-semibold text-slate-950">
                {assessment!.institutionCount===1?"Institución potencialmente compatible":"Instituciones potencialmente compatibles"}
              </p>
              <p className="mt-2 text-xs text-slate-600">Sin revelar instituciones ni condiciones privadas.</p>
            </> : <>
              <p className="text-3xl font-bold text-slate-950">
                {reviewedOffers > 0 ? "Por afinar" : "En revisión"}
              </p>
              <p className="mt-2 text-sm text-slate-600">
                {reviewedOffers > 0 ? "Aún no se confirma una alternativa completa." :
                  "No hay productos publicados comparables para esta selección."}
              </p>
            </>}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 p-4 sm:p-5" data-testid="prospect-submitted-summary">
          <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
            <h3 className="font-bold text-slate-950">Tu solicitud en resumen</h3>
            {reviewedOffers>0 && <span className="rounded-full bg-blue-50 border border-blue-100 px-3 py-1 text-xs font-medium text-blue-900"
              data-testid="real-reviewed-offers">{reviewedOffers} {reviewedOffers===1?"producto comparado":"productos comparados"}</span>}
          </div>
          <div className="grid gap-3 sm:grid-cols-3 text-sm">
            <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Financiamiento</p>
              <p className="mt-1 font-semibold text-slate-950">{PRODUCT_OPTIONS.find(x=>x.id===product)?.name||"Por revisar"}</p></div>
            <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Monto solicitado</p>
              <p className="mt-1 font-semibold text-slate-950">{Number(amount).toLocaleString("es-MX",{style:"currency",currency:"MXN",maximumFractionDigits:0})}</p></div>
            <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Plazo deseado</p>
              <p className="mt-1 font-semibold text-slate-950">{termMonths} meses</p></div>
          </div>
        </div>

        {hasEvaluated && (criteriaMatched.length>0 || criteriaPending.length>0 || criteriaNotMatched.length>0) &&
          <div className="space-y-3" data-testid="public-criteria-evidence">
            <h3 className="text-lg font-bold text-slate-950">Lo que detectó la evaluación</h3>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
                <div className="font-semibold text-emerald-900 flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5" /> Criterios cumplidos
                </div>
                <p className="mt-2 text-xs text-slate-600">Coincidencias verificadas en el análisis de productos, sin implicar aprobación.</p>
                <div className="mt-3 space-y-2">{criteriaMatched.length ? criteriaMatched.map(label=>
                  <p key={label} className="flex items-start gap-2 text-sm text-slate-800">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-700 shrink-0"/>{label}</p>) :
                  <p className="text-sm text-slate-600">Sin coincidencias confirmadas aún.</p>}</div>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
                <div className="font-semibold text-amber-900 flex items-center gap-2">
                  <CircleHelp className="h-5 w-5" /> Para confirmar
                </div>
                <p className="mt-2 text-xs text-slate-600">Información que podría afinar la evaluación con tu asesor.</p>
                <div className="mt-3 space-y-2">{criteriaPending.length ? criteriaPending.map(label=>
                  <p key={label} className="flex items-start gap-2 text-sm text-slate-800">
                    <ArrowRight className="mt-0.5 h-4 w-4 text-amber-700 shrink-0"/>{label}</p>) :
                  <p className="text-sm text-slate-600">No hay categorías pendientes identificadas.</p>}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="font-semibold text-slate-900 flex items-center gap-2">
                  <CircleHelp className="h-5 w-5" /> Aspectos por revisar
                </div>
                <p className="mt-2 text-xs text-slate-600">Criterios sin coincidencia en algún producto, no un rechazo definitivo.</p>
                <div className="mt-3 space-y-2">{criteriaNotMatched.length ? criteriaNotMatched.map(label=>
                  <p key={label} className="flex items-start gap-2 text-sm text-slate-800">
                    <ArrowRight className="mt-0.5 h-4 w-4 text-slate-500 shrink-0"/>{label}</p>) :
                  <p className="text-sm text-slate-600">No se identificaron aspectos desfavorables generales.</p>}</div>
              </div>
            </div>
          </div>}

        <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-5 sm:p-6">
          <h3 className="text-lg font-bold text-blue-950">¿Qué sigue con tu solicitud?</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div className="flex gap-3 items-start"><span className="rounded-full bg-emerald-100 text-emerald-900 h-8 w-8 flex items-center justify-center font-bold shrink-0">1</span>
              <div><p className="font-semibold text-sm">Recibimos tus datos</p><p className="text-xs text-slate-600 mt-1">Tu asesor ya tiene la solicitud.</p></div></div>
            <div className="flex gap-3 items-start"><span className="rounded-full bg-blue-100 text-blue-900 h-8 w-8 flex items-center justify-center font-bold shrink-0">2</span>
              <div><p className="font-semibold text-sm">Evaluación preliminar</p><p className="text-xs text-slate-600 mt-1">{hasEvaluated?"Se analizaron productos publicados.":"Pendiente de finalizar la comparación."}</p></div></div>
            <div className="flex gap-3 items-start"><span className="rounded-full bg-blue-100 text-blue-900 h-8 w-8 flex items-center justify-center font-bold shrink-0">3</span>
              <div><p className="font-semibold text-sm">Tu asesor continúa</p><p className="text-xs text-slate-600 mt-1">Te apoyará con requisitos y alternativas.</p></div></div>
          </div>
        </div>
        <p className="text-xs leading-relaxed text-slate-600 border-t pt-4">
          El resultado utiliza los datos proporcionados y las reglas del catálogo de ofertas publicadas.
          No representa aprobación ni oferta de crédito. Las condiciones y decisiones finales dependen de cada institución.
          No se ha enviado tu expediente a ninguna financiera y no mostramos nombres, umbrales ni tasas internas.
        </p>
      </div>
    </section>;
  }

  return <div className="space-y-5" data-testid="prospect-completion-form">
    <div className="bg-white border rounded-xl p-5 space-y-3">
      <h1 className="text-2xl font-bold">Completa tu perfil de financiamiento</h1>
      <p>Tu información será recibida por <strong>{info.data.advisorName}</strong>. Los datos que desconozcas de tu perfil pueden quedar pendientes de revisión.</p>
      <ProspectTrustNotice advisorName={info.data.advisorName} personalLink />
      <label className="flex gap-3 items-start text-sm">
        <Checkbox checked={accepted} onCheckedChange={v => setAccepted(v === true)} aria-label="Acepto el Aviso de Privacidad" />
        <span>He leído el <Link href="/legal/aviso" target="_blank" className="underline">Aviso de Privacidad</Link> y autorizo compartir mis datos con Crédito Negocios y el asesor indicado para realizar una evaluación preliminar de financiamiento. El envío posterior a instituciones requiere validaciones y autorizaciones adicionales.</span>
      </label>
      {!accepted && <p className="text-sm text-muted-foreground">Confirma el Aviso de Privacidad para continuar.</p>}
    </div>
    {accepted && <>
      <section className="bg-white border rounded-xl p-5 space-y-4" aria-label="Financiamiento solicitado">
        <div>
          <h2 className="text-lg font-bold">¿Qué financiamiento necesitas?</h2>
          <p className="text-sm text-muted-foreground">Estos datos permiten comparar automáticamente las alternativas publicadas, sin enviar tu solicitud a ninguna institución.</p>
        </div>
        <div className="space-y-2">
          <Label>Tipo de financiamiento *</Label>
          <Select value={product} onValueChange={v=>{setProduct(v);setFinancingError("");}}>
            <SelectTrigger data-testid="prospect-financing-product"><SelectValue placeholder="Selecciona un producto" /></SelectTrigger>
            <SelectContent>{PRODUCT_OPTIONS.map(option=><SelectItem key={option.id} value={option.id}>{option.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="space-y-2">
            <Label htmlFor="prospect-requested-amount">Monto exacto solicitado (MXN) *</Label>
            <Input id="prospect-requested-amount" data-testid="prospect-financing-amount" type="number" inputMode="numeric"
              min={10000} max={1000000000000} step={1} value={amount} onChange={e=>setAmount(e.target.value)}
              placeholder="Ej. 1000000" />
          </label>
          <label className="space-y-2">
            <Label htmlFor="prospect-term-months">Plazo deseado en meses *</Label>
            <Input id="prospect-term-months" data-testid="prospect-financing-term" type="number" inputMode="numeric"
              min={1} max={360} step={1} value={termMonths} onChange={e=>setTermMonths(e.target.value)}
              placeholder="Ej. 36" />
          </label>
        </div>
        <label className="space-y-2 block">
          <Label htmlFor="prospect-purpose">Destino del financiamiento *</Label>
          <Textarea id="prospect-purpose" data-testid="prospect-financing-purpose" rows={2}
            maxLength={600} value={purpose} onChange={e=>setPurpose(e.target.value)}
            placeholder="Ej. Adquirir maquinaria, capital de trabajo, ampliación..." />
        </label>
        {product === "arrendamiento" && <div className="space-y-2">
          <Label>Tipo de activo que deseas arrendar *</Label>
          <Select value={leasingAssetType} onValueChange={setLeasingAssetType}>
            <SelectTrigger data-testid="prospect-leasing-asset"><SelectValue placeholder="Selecciona el activo" /></SelectTrigger>
            <SelectContent>{LEASING_ASSET_TYPES.map(item=><SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>}
        {financingError && <p role="alert" className="text-sm text-destructive">{financingError}</p>}
      </section>
      <PublicProspectQuickForm initialProfile={initialProfile} onPublicSubmit={async profile => {
        const money=Number(amount), months=Number(termMonths);
        if (!product || !amount || !Number.isInteger(money) || money < 10000 || money > 1000000000000 ||
            !termMonths || !Number.isInteger(months) || months < 1 || months > 360 ||
            purpose.trim().length < 5 || (product === "arrendamiento" && !leasingAssetType)) {
          const message="Completa tipo de financiamiento, monto exacto, plazo, destino y activo cuando corresponda.";
          setFinancingError(message);throw new Error(message);
        }
        setFinancingError("");
        const financing={product,amount:money,termMonths:months,purpose:purpose.trim(),
          ...(product === "arrendamiento" ? {leasingAssetType} : {})};
        const response = await fetch("/api/public/prospect-completion/" + encodeURIComponent(token), {
          method: "POST", credentials: "omit", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profile, financing, privacyVersion: info.data.privacyVersion, acknowledgePrivacy: true, companyWebsite: "" }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || "No se pudo enviar la información");
        setAssessment(result.assessment || null);
        setComplete(true);
      }} />
    </>}
    {!accepted && onBack && <Button variant="outline" onClick={onBack}>Volver</Button>}
  </div>;
}

export default function PublicProspectCompletion() {
  const { token } = useParams<{ token: string }>();
  const info = useCompletionInfo(token);
  return <ProspectPageLayout advisorName={info.data?.advisorName} wide>
    <ProspectCompletionForm key={token} token={token} />
  </ProspectPageLayout>;
}
