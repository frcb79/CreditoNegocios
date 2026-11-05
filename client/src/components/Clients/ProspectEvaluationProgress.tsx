import { useEffect, useState } from "react";
import { prospectProgressStage, PREQUALIFICATION_STAGE_BOUNDARIES_MS } from "@/lib/prospectProgressTiming";
import { CheckCircle2, Circle, ClipboardCheck, Landmark, Loader2, ShieldCheck } from "lucide-react";

export type ProspectProcessingPhase = "sending" | "ready";
export default function ProspectEvaluationProgress({phase}:{phase:ProspectProcessingPhase}) {
  const [activeStage,setActiveStage]=useState<0|1|2>(0);
  useEffect(()=>{
    const start=Date.now();
    const timers=PREQUALIFICATION_STAGE_BOUNDARIES_MS.map(boundary=>
      setTimeout(()=>setActiveStage(prospectProgressStage(Date.now()-start)),boundary));
    return ()=>timers.forEach(clearTimeout);
  },[]);
  const ready=phase==="ready" && activeStage===2;
  const stages=[
    {title:"Validando información capturada",detail:"Comprobamos los datos de tu solicitud."},
    {title:"Comparando alternativas publicadas",detail:"El motor revisa criterios del catálogo de financiamiento."},
    {title:"Preparando el diagnóstico preliminar",detail:"Organizamos el resultado y los siguientes pasos."},
  ];
  return <section className="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm"
    role="status" aria-live="polite" aria-busy={!ready} data-testid="prospect-evaluation-processing">
    <div className="bg-[#103d72] px-6 py-8 text-white sm:px-10">
      <div className="flex items-center gap-2 text-sm font-semibold text-blue-100">
        <ShieldCheck className="h-5 w-5"/> Evaluación preliminar · Crédito Negocios
      </div>
      <h1 className="mt-3 text-2xl font-bold sm:text-3xl">Estamos analizando tu solicitud</h1>
      <p className="mt-2 text-blue-100">Revisamos la información y las alternativas publicadas para preparar tu diagnóstico.</p>
    </div>
    <div className="grid gap-6 p-5 sm:p-8 lg:grid-cols-[1.8fr_1fr]">
      <div className="rounded-2xl border border-blue-100 bg-gradient-to-b from-blue-50 to-white px-5 py-8 sm:px-8">
        <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-3xl border border-blue-100 bg-white text-blue-800 shadow-sm">
          {ready ? <ClipboardCheck className="h-12 w-12"/> : <Landmark className="h-12 w-12"/>}
        </div>
        <h2 className="mt-5 text-center text-xl font-bold text-slate-950">
          {ready?"Preparando tu resultado":"Procesando tu evaluación preliminar"}
        </h2>
        <p className="mx-auto mt-2 max-w-lg text-center text-sm leading-relaxed text-slate-600">
          {ready?"El análisis terminó; estamos ordenando los hallazgos para mostrártelos.":
            "La comparación puede tardar unos segundos. No cierres esta ventana."}
        </p>
        <div className="mt-7 space-y-3">
          {stages.map((stage,index)=>{
            const done=index<activeStage;
            const active=index===activeStage;
            return <div key={stage.title} className={"flex items-center gap-3 rounded-xl border p-4 "+
              (done?"border-emerald-200 bg-emerald-50/80":
                active?"border-blue-200 bg-blue-100/60":"border-slate-200 bg-white")}>
              {done?<CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-700"/>:
                active?<Loader2 className="h-6 w-6 shrink-0 animate-spin text-blue-800"/>:
                <Circle className="h-6 w-6 shrink-0 text-slate-400"/>}
              <div className="min-w-0 flex-1"><p className="font-semibold text-slate-900">{stage.title}</p>
                <p className="mt-1 text-xs text-slate-600">{stage.detail}</p></div>
              <span className={"hidden rounded-full px-2.5 py-1 text-xs font-semibold sm:inline-flex "+
                (done?"bg-emerald-100 text-emerald-800":
                  active?"bg-blue-100 text-blue-900":"bg-slate-100 text-slate-500")}>
                {done?"Listo":active?"En proceso":"Pendiente"}</span>
            </div>;
          })}
        </div>
      </div>
      <aside className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <h3 className="text-lg font-bold text-blue-950">¿Qué verás al terminar?</h3>
        <div className="mt-4 space-y-4 text-sm text-slate-700">
          <p><strong>Resumen completo.</strong> Los datos que compartiste.</p>
          <p><strong>Coincidencias y puntos a confirmar.</strong> Criterios generales, sin revelar instituciones.</p>
          <p><strong>Próximos pasos.</strong> Orientación para continuar con tu asesor.</p>
        </div>
        <div className="mt-6 rounded-xl border border-blue-100 bg-white p-4 text-sm text-blue-950">
          <ShieldCheck className="mb-2 h-5 w-5 text-blue-700"/>
          No hemos enviado tu expediente a ninguna institución financiera.
        </div>
      </aside>
    </div>
  </section>;
}
