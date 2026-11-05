import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import ClientForm from "@/components/Clients/ClientForm";
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
  message: string;
  criteria?: { matched: string[]; toReview: string[] };
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
    const hasEvaluated=Boolean(assessment && assessment.status !== "pending");
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
        {hasOptions ? <div className="grid sm:grid-cols-[auto_1fr] items-center gap-4 rounded-xl border border-blue-200 bg-blue-50 p-5">
          <div className="flex items-center justify-center rounded-xl bg-white border border-blue-100 px-6 py-4">
            <span className="text-5xl font-extrabold tabular-nums text-blue-900" data-testid="verified-institution-count">
              {assessment!.institutionCount}
            </span>
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-blue-950">
              {assessment!.institutionCount === 1 ? "Institución con una alternativa preliminar" :
                "Instituciones con alternativas preliminares"}
            </h2>
            <p className="text-sm text-slate-700 leading-relaxed mt-1">
              Encontramos opciones que podrían adaptarse a tu solicitud según los criterios evaluados.
              Tu asesor confirmará requisitos y disponibilidad.
            </p>
          </div>
        </div> :
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
            <h2 className="font-semibold text-amber-950">
              {assessment?.status==="missing_information" ? "Hay datos que necesitamos confirmar" :
                assessment?.status==="under_review" ? "Tu asesor revisará otras alternativas" :
                "Tu información está lista para revisión"}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-700">
              {assessment?.message || "Tu asesor continuará con la revisión de tu solicitud."}
            </p>
          </div>}

        {hasEvaluated && (criteriaMatched.length>0 || criteriaPending.length>0) &&
          <div className="grid gap-4 md:grid-cols-2" data-testid="public-criteria-evidence">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 sm:p-5">
              <div className="flex items-center gap-2 font-semibold text-emerald-900">
                <ClipboardCheck className="w-5 h-5 shrink-0" /> Coincidencias del análisis
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-600">
                Aspectos que coinciden con al menos una alternativa preliminar.
              </p>
              {criteriaMatched.length ? <div className="mt-3 space-y-2">
                {criteriaMatched.map(label=><div key={label} className="flex gap-2 text-sm text-slate-800 items-start">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 mt-0.5 shrink-0" /> {label}
                </div>)}
              </div> : <p className="mt-3 text-sm text-slate-600">Sin coincidencias confirmadas todavía.</p>}
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 sm:p-5">
              <div className="flex items-center gap-2 font-semibold text-amber-900">
                <CircleHelp className="w-5 h-5 shrink-0" /> Para afinar la evaluación
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-600">
                Información que podría abrir más alternativas; no significa incumplimiento.
              </p>
              {criteriaPending.length ? <div className="mt-3 space-y-2">
                {criteriaPending.map(label=><div key={label} className="flex gap-2 text-sm text-slate-800 items-start">
                  <ArrowRight className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" /> {label}
                </div>)}
              </div> : <p className="mt-3 text-sm text-slate-600">Por ahora no hay pendientes generales identificados.</p>}
            </div>
          </div>}

        <div className="rounded-xl border bg-slate-50 p-4 sm:p-5 space-y-3">
          <h2 className="font-semibold text-slate-900">¿Qué sigue?</h2>
          <div className="grid gap-3 sm:grid-cols-3 text-sm">
            <div className="flex gap-2 items-start"><CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-700" /><span>Recibimos tus datos</span></div>
            <div className="flex gap-2 items-start"><CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-700" />
              <span>{hasEvaluated?"Se realizó el análisis preliminar":"Análisis por completar"}</span></div>
            <div className="flex gap-2 items-start"><ArrowRight className="w-5 h-5 shrink-0 text-blue-800" /><span>Tu asesor revisará los siguientes pasos</span></div>
          </div>
        </div>
        <p className="text-xs leading-relaxed text-slate-600 border-t pt-4">
          Los resultados utilizan información proporcionada y criterios del catálogo de ofertas vigentes.
          No representan aprobación, oferta de crédito ni actividad histórica de colocación;
          la decisión y condiciones finales dependen de cada institución. No se ha enviado tu expediente a ninguna financiera.
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
      <ClientForm client={initialProfile} onSuccess={onBack || (() => setAccepted(false))} onPublicSubmit={async profile => {
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
