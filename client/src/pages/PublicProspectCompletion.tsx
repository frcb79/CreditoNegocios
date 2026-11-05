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
import ProspectEvaluationProgress, { type ProspectProcessingPhase } from "@/components/Clients/ProspectEvaluationProgress";
import ProspectEvaluationResult from "@/components/Clients/ProspectEvaluationResult";
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

  if (processing) return <ProspectEvaluationProgress phase={processingPhase}/>;
  if (complete && submittedProfile) return <ProspectEvaluationResult
    assessment={assessment}
    profile={submittedProfile}
    financing={{product,amount:Number(amount),termMonths:Number(termMonths),purpose,leasingAssetType}}
    advisorName={info.data.advisorName}
  />;

  return <div className="space-y-5" data-testid="prospect-completion-form">
    <div className="bg-white border rounded-xl p-5 space-y-3">
      <h1 className="text-2xl font-bold">Solicita tu evaluación preliminar</h1>
      <p>Completa tus datos de financiamiento y perfil financiero para comparar alternativas publicadas. Tu asesor será <strong>{info.data.advisorName}</strong>.</p>
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
        // Show the processing view while the server performs the real catalog
        // comparison. Hold the prepared state briefly so the result does not
        // replace the form instantly on a fast response.
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
          await new Promise<void>(resolve=>setTimeout(resolve,
            Math.max(800,1800-(Date.now()-startedAt))));
          setComplete(true);
        } catch(error) {
          setSubmittedProfile(null);
          throw error;
        } finally {
          setProcessing(false);
        }
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
