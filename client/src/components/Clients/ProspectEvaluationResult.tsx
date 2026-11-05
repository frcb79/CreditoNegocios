import { ArrowRight, Building2, CalendarClock, CheckCircle2, CircleHelp, FileText, Landmark, ShieldCheck } from "lucide-react";
import {
  buildPublicProspectSummary, getPublicDocumentGroups, PUBLIC_PROCESS_TIMES,
  type PublicFinancingSummary,
} from "@shared/publicProspectPresentation";

export type PublicDisplayAssessment = {
  status:"possible_options"|"missing_information"|"under_review"|"pending";
  institutionCount?:number; reviewedOffers?:number; message:string;
  criteria?:{matched:string[];toReview:string[];notMatched:string[]};
};
export default function ProspectEvaluationResult({
  assessment,profile,financing,advisorName,
}:{
  assessment:PublicDisplayAssessment|null;
  profile:Record<string,unknown>;
  financing:PublicFinancingSummary;
  advisorName:string;
}) {
  const reviewedOffers=Math.max(0,assessment?.reviewedOffers||0);
  const hasEvaluated=Boolean(assessment && assessment.status!=="pending" && reviewedOffers>0);
  const hasOptions=assessment?.status==="possible_options" && Number(assessment.institutionCount)>0;
  const institutionCount=hasOptions ? assessment!.institutionCount! : 0;
  const rows=buildPublicProspectSummary(profile,financing);
  const docs=getPublicDocumentGroups(profile.type);
  const matched=assessment?.criteria?.matched||[];
  const pending=assessment?.criteria?.toReview||[];
  const failed=assessment?.criteria?.notMatched||[];
  const criteria=[
    {title:"Criterios cumplidos",subtitle:"Coincidencias del análisis. No implican una aprobación.",
      labels:matched,bg:"border-emerald-200 bg-emerald-50/60",color:"text-emerald-800",icon:CheckCircle2,
      empty:"No se identificaron coincidencias confirmadas."},
    {title:"Para confirmar",subtitle:"Información que podría afinar la evaluación con tu asesor.",
      labels:pending,bg:"border-amber-200 bg-amber-50/60",color:"text-amber-800",icon:CalendarClock,
      empty:"No hay categorías adicionales pendientes identificadas."},
    {title:"Aspectos por revisar",subtitle:"Criterios que requieren otra evaluación; no son un rechazo definitivo.",
      labels:failed,bg:"border-slate-200 bg-slate-50",color:"text-slate-700",icon:CircleHelp,
      empty:"Sin observaciones generales registradas."},
  ];
  return <section className="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm"
    data-testid="prospect-profile-success">
    <header className="bg-[#103d72] px-6 py-7 text-white sm:px-10">
      <div className="flex items-center gap-2 text-sm font-semibold text-blue-100">
        <ShieldCheck className="h-5 w-5"/> Evaluación preliminar · Crédito Negocios
      </div>
      <h1 className="mt-2 text-2xl font-bold sm:text-3xl">¡Recibimos tu información!</h1>
      <p className="mt-2 text-sm text-blue-100">Tu información quedó registrada con {advisorName}.
        Tu asesor podrá continuar con los siguientes pasos.</p>
    </header>
    <div className="space-y-7 p-5 sm:p-8" data-testid="public-anonymous-matching">
      <section className="space-y-3" id="prospect-submitted-summary" data-testid="prospect-submitted-summary">
        <h2 className="text-xl font-bold text-slate-950">Tu resumen de solicitud</h2>
        <p className="text-sm text-slate-600">Estos son los datos que nos compartiste para la evaluación.</p>
        <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-3">
          {rows.map(({label,value})=><div key={label}
            className="min-w-0 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-3">
            <p className="text-xs font-medium text-slate-500">{label}</p>
            <p className="mt-1 break-words text-sm font-semibold text-slate-950">{value}</p>
          </div>)}
        </div>
      </section>

      <section className="space-y-3" data-testid="public-criteria-evidence">
        <h2 className="text-xl font-bold text-slate-950">Lo que detectó la evaluación</h2>
        <p className="text-sm text-slate-600">Con base en los criterios generales del catálogo, identificamos lo siguiente:</p>
        <div className="grid gap-3 lg:grid-cols-3">
          {criteria.map(card=><div key={card.title} className={"rounded-xl border p-4 sm:p-5 "+card.bg}>
            <div className={"flex items-center gap-2 font-semibold "+card.color}>
              <card.icon className="h-5 w-5 shrink-0"/>{card.title}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-600">{card.subtitle}</p>
            <div className="mt-4 space-y-2">
              {hasEvaluated && card.labels.length ? card.labels.map(label=>
                <div key={label} className="flex items-start gap-2 text-sm text-slate-800">
                  <CheckCircle2 className={"mt-0.5 h-4 w-4 shrink-0 "+card.color}/><span>{label}</span>
                </div>) : <p className="text-sm text-slate-600">
                  {hasEvaluated?card.empty:"Tu asesor revisará los datos capturados."}</p>}
            </div>
          </div>)}
        </div>
      </section>

      <section className="rounded-2xl border border-blue-200 bg-blue-50/70 p-5 sm:p-7"
        data-testid="prospect-diagnosis">
        <div className="grid items-center gap-5 lg:grid-cols-[.9fr_1.1fr]">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white px-3 py-1 text-xs font-semibold text-blue-900">
              <CheckCircle2 className="h-4 w-4"/> Diagnóstico de la evaluación
            </span>
            <h2 className="mt-3 text-2xl font-extrabold leading-tight text-slate-950"
              data-testid="matching-result-headline">
              {hasOptions?"Encontramos alternativas para continuar":
               hasEvaluated?"Tenemos un diagnóstico para continuar":
               "Tu asesor continuará revisando alternativas"}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-700">
              {assessment?.message||"Recibimos tu solicitud. El asesor continuará con la evaluación."}
            </p>
          </div>
          <div className="space-y-3" data-testid="verified-match-summary">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-blue-800 p-5 text-white">
                <Landmark className="h-6 w-6 text-blue-100"/>
                <p className="mt-2 text-4xl font-extrabold tabular-nums"
                  data-testid="verified-institution-count">{hasEvaluated?institutionCount:"—"}</p>
                <p className="mt-1 text-sm font-semibold">
                  {hasOptions?"Financieras potencialmente compatibles":
                    "Financieras con coincidencia completa identificadas"}
                </p>
              </div>
              <div className="rounded-xl border border-blue-200 bg-white p-5 text-blue-950">
                <Building2 className="h-6 w-6 text-blue-700"/>
                <p className="mt-2 text-4xl font-extrabold tabular-nums"
                  data-testid="real-reviewed-offers">{hasEvaluated?reviewedOffers:"—"}</p>
                <p className="mt-1 text-sm font-semibold">Productos comparados</p>
              </div>
            </div>
            <p className="text-xs leading-relaxed text-slate-600">
              {hasEvaluated && !hasOptions ?
                "Por ahora no hay coincidencias completas. Esto no equivale a una negativa de financiamiento." :
                "Los resultados son preliminares y no constituyen aprobación ni oferta de crédito."}
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-3" data-testid="prospect-next-steps">
        <h2 className="text-xl font-bold text-slate-950">¿Qué sigue con tu solicitud?</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            ["Revisión con tu asesor","Revisaremos los hallazgos y confirmaremos la información."],
            ["Selección de alternativas","Tu asesor te presentará opciones relevantes, cuando estén disponibles."],
            ["Continuación del trámite","Con tu autorización, reuniremos documentación para la(s) financiera(s)."],
          ].map(([title,description],index)=><div key={title}
            className="flex gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 font-bold text-blue-900">
              {index+1}</span>
            <div><p className="text-sm font-semibold text-slate-950">{title}</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">{description}</p></div>
          </div>)}
        </div>
      </section>
      <section className="space-y-3" data-testid="prospect-process-times">
        <h2 className="text-xl font-bold text-slate-950">Tiempos estimados del proceso</h2>
        <p className="text-sm text-slate-600">
          Los tiempos varían según la financiera y las características del caso.
          Tu asesor te confirmará los plazos aplicables.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {PUBLIC_PROCESS_TIMES.map((item,index)=><div key={item.title}
            className="flex gap-3 rounded-xl border border-slate-200 p-4">
            {index===0?<CalendarClock className="h-6 w-6 shrink-0 text-blue-800"/>:
              index===1?<FileText className="h-6 w-6 shrink-0 text-blue-800"/>:
              <Landmark className="h-6 w-6 shrink-0 text-blue-800"/>}
            <div><p className="text-xs font-bold text-blue-800">{item.value}</p>
              <p className="mt-1 text-sm text-slate-800">{item.title}</p></div>
          </div>)}
        </div>
      </section>

      <section className="space-y-3" data-testid="prospect-document-guide">
        <h2 className="text-xl font-bold text-slate-950">Documentos generales que conviene preparar</h2>
        <p className="text-sm text-slate-600">Puedes ir reuniéndolos para agilizar tu trámite.
          No es obligatorio entregarlos en esta etapa; tu asesor te confirmará cuáles aplican.</p>
        {docs.map(group=><div key={group.heading}
          className="rounded-2xl border border-blue-100 bg-blue-50/40 p-4 sm:p-5">
          <div className="mb-4 flex gap-3 items-start">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-900">
              <FileText className="h-5 w-5"/></span>
            <div><h3 className="font-bold text-blue-950">{group.heading}</h3>
              <p className="text-xs text-slate-600">{group.description}</p></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.items.map(item=><div key={item.title} className="rounded-xl border border-slate-200 bg-white p-3">
              <FileText className="mb-2 h-5 w-5 text-blue-700"/>
              <p className="text-sm font-semibold text-slate-950">{item.title}</p>
              {item.detail && <p className="mt-1 text-xs leading-relaxed text-slate-600">{item.detail}</p>}
            </div>)}
          </div>
        </div>)}
      </section>
      <p className="border-t pt-4 text-xs leading-relaxed text-slate-600">
        Esta evaluación utiliza la información proporcionada y criterios generales de ofertas publicadas.
        No es una aprobación ni una oferta de crédito. La decisión y condiciones finales dependen de cada institución.
        No se ha enviado automáticamente tu expediente a ninguna financiera ni se revelan sus nombres o reglas internas.
      </p>
    </div>
  </section>;
}
