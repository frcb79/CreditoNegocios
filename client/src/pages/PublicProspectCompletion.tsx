import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import PublicProspectQuickForm from "@/components/Clients/PublicProspectQuickForm";
import ProspectPageLayout, { ProspectTrustNotice } from "@/components/Clients/ProspectPageLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ProspectEvaluationProgress, { type ProspectProcessingPhase } from "@/components/Clients/ProspectEvaluationProgress";
import ProspectEvaluationResult from "@/components/Clients/ProspectEvaluationResult";
import { LEASING_ASSET_TYPES } from "@shared/leasing";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { CheckCircle2, Layers, LockKeyhole, Zap, ShieldCheck } from "lucide-react";

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
  const [readyDialogOpen, setReadyDialogOpen] = useState(false);
  const [submittedProfile, setSubmittedProfile] = useState<Record<string,unknown> | null>(null);
  const [processing, setProcessing] = useState(false);
  const [processingPhase, setProcessingPhase] = useState<ProspectProcessingPhase>("sending");
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

  if (complete && submittedProfile) return <ProspectEvaluationResult
    assessment={assessment}
    profile={submittedProfile}
    financing={{product,amount:Number(amount),termMonths:Number(termMonths),purpose,leasingAssetType}}
    advisorName={info.data.advisorName}
  />;

  return <>
    {processing && <ProspectEvaluationProgress phase={processingPhase}/>}
    <Dialog open={readyDialogOpen} onOpenChange={()=>{}}>
      <DialogContent className="max-w-md" data-testid="prospect-result-ready-modal">
        <DialogHeader>
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 mb-3">
            <CheckCircle2 className="h-8 w-8"/>
          </div>
          <DialogTitle className="text-2xl">Tu evaluación preliminar está lista</DialogTitle>
          <DialogDescription>Terminamos de revisar las alternativas publicadas y preparamos el resumen
            para que continúes con tu asesor.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button className="w-full bg-blue-800 text-white hover:bg-blue-900"
            data-testid="prospect-open-diagnosis"
            onClick={()=>{setReadyDialogOpen(false);setComplete(true);setProcessing(false);}}>
            Ver mi diagnóstico
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <div className={processing?"hidden":"space-y-5"} data-testid="prospect-completion-form">
    <header className="overflow-hidden rounded-2xl bg-gradient-to-r from-[#0d376c] to-[#154c91] px-6 py-7 text-white shadow-sm sm:px-9"
      data-testid="prospect-form-header">
      <div className="flex items-center gap-4">
        <ShieldCheck className="h-11 w-11 shrink-0 text-blue-100"/>
        <div><p className="text-sm font-medium text-blue-100">Crédito Negocios</p>
          <h1 className="text-2xl font-extrabold sm:text-3xl">Solicita tu evaluación preliminar</h1>
          <p className="mt-1 text-sm text-blue-100">
            Captura la información esencial y obtén una evaluación preliminar de tu solicitud.
          </p></div>
      </div>
    </header>
    <section className="grid items-center gap-5 px-2 py-3 md:grid-cols-[1fr_1.25fr]" data-testid="prospect-form-benefits">
      <div>
        <h2 className="text-2xl font-extrabold leading-tight text-blue-950 sm:text-3xl">
          Da el primer paso para impulsar tu negocio
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          Completa los datos esenciales de tu negocio y perfil financiero.
          Con ellos compararemos alternativas publicadas que podrían ajustarse a tus necesidades.
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2 border-l border-blue-100 pl-3 text-center sm:gap-4 sm:pl-6">
        {([
          [Zap,"Evaluación preliminar","Rápida y sin compromiso"],
          [Layers,"Opciones a tu medida","Según tu perfil financiero"],
          [LockKeyhole,"Información protegida","Datos tratados de forma segura"],
        ] as const).map(([Icon,title,description])=><div key={title} className="flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-800">
            <Icon className="h-6 w-6"/></div>
          <p className="text-xs font-bold leading-tight text-blue-950 sm:text-sm">{title}</p>
          <p className="text-[11px] leading-snug text-slate-600">{description}</p>
        </div>)}
      </div>
    </section>
    <ProspectTrustNotice advisorName={info.data.advisorName} personalLink />
      <section className="bg-white border border-blue-100 rounded-2xl p-5 sm:p-7 space-y-5 shadow-sm" aria-label="Financiamiento solicitado">
        <div>
          <h2 className="text-2xl font-extrabold text-blue-950">¿Qué financiamiento necesitas?</h2>
          <p className="text-sm text-slate-600">Cuéntanos los detalles principales del financiamiento que estás buscando.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="space-y-2">
          <Label>Tipo de financiamiento *</Label>
          <Select value={product} onValueChange={v=>{setProduct(v);setFinancingError("");}}>
            <SelectTrigger data-testid="prospect-financing-product"><SelectValue placeholder="Selecciona un producto" /></SelectTrigger>
            <SelectContent>{PRODUCT_OPTIONS.map(option=><SelectItem key={option.id} value={option.id}>{option.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
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
        <label className="space-y-2 block">
          <Label htmlFor="prospect-purpose">Destino del financiamiento *</Label>
          <Textarea id="prospect-purpose" data-testid="prospect-financing-purpose" rows={2}
            maxLength={600} value={purpose} onChange={e=>setPurpose(e.target.value)}
            placeholder="Ej. Adquirir maquinaria, capital de trabajo, ampliación..." />
        </label>
        </div>
        {product === "arrendamiento" && <div className="space-y-2">
          <Label>Tipo de activo que deseas arrendar *</Label>
          <Select value={leasingAssetType} onValueChange={setLeasingAssetType}>
            <SelectTrigger data-testid="prospect-leasing-asset"><SelectValue placeholder="Selecciona el activo" /></SelectTrigger>
            <SelectContent>{LEASING_ASSET_TYPES.map(item=><SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>}
        {financingError && <p role="alert" className="text-sm text-destructive">{financingError}</p>}
      </section>
      <PublicProspectQuickForm initialProfile={initialProfile} consentAccepted={accepted} onConsentChange={setAccepted}
        onPublicSubmit={async profile => {
        if(!accepted)throw new Error("Acepta el Aviso de Privacidad para continuar.");
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
        const startedAt=Date.now();
        setSubmittedProfile(profile);
        setProcessingPhase("sending");
        setProcessing(true);
        try {
          const response=await fetch("/api/public/prospect-completion/" + encodeURIComponent(token), {
            method:"POST",credentials:"omit",headers:{"Content-Type":"application/json"},
            body:JSON.stringify({profile,financing,privacyVersion:info.data.privacyVersion,
              acknowledgePrivacy:true,companyWebsite:""}),
          });
          const result=await response.json();
          if(!response.ok) throw new Error(result.message || "No se pudo enviar la información");
          setAssessment(result.assessment || null);
          setProcessingPhase("ready");
          // A real request has completed; respect five seconds of visible
          // progress without pretending to perform extra server-side work.
          await new Promise<void>(resolve=>setTimeout(resolve,
            Math.max(0,5000-(Date.now()-startedAt))));
          setReadyDialogOpen(true);
        } catch(error) {
          setSubmittedProfile(null);
          setProcessing(false);
          throw error;
        }
      }} />
    {onBack && <Button variant="outline" onClick={onBack}>Volver</Button>}
  </div>
  </>;
}

export default function PublicProspectCompletion() {
  const { token } = useParams<{ token: string }>();
  const info = useCompletionInfo(token);
  return <ProspectPageLayout advisorName={info.data?.advisorName} wide>
    <ProspectCompletionForm key={token} token={token} />
  </ProspectPageLayout>;
}
