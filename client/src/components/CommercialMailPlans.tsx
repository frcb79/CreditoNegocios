import {useState} from "react";
import {useQuery,useMutation,useQueryClient} from "@tanstack/react-query";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Card,CardHeader,CardTitle,CardContent} from "@/components/ui/card";
import {apiRequest} from "@/lib/queryClient";
import type {CommercialMailDraft} from "@shared/commercialMailDrafts";
import {commercialBatchDate} from "@shared/commercialMailSchedule";
type Draft={id:string;revision:number;content:CommercialMailDraft};
type Plan={id:string;draftId:string;revision:number;startsAt:string;state:"planned"|"cancelled";name:string;audience:string;recipientCount:number;jobCount:number;approved:boolean;sentCount:number;uncertainCount:number;skippedCount:number};
type Preflight={recipientCount:number;eligibleRecipients:number;excludedRecipients:number;eligibleFutureJobs:number;overdueJobs:number;blockers:string[];dispatchEnabled:boolean};
const endpoint="/api/admin/commercial-mail-plans";
function planLabel(p:Plan){
  if(p.state==="cancelled")return "Cancelada";
  if(!p.approved)return new Date(p.startsAt).getTime()<=Date.now()?"Preparación vencida, sin envíos":"Preparada, sin envíos";
  if(p.uncertainCount>0)return "Requiere revisión";
  if(p.sentCount+p.skippedCount>=p.jobCount && p.jobCount>0)return "Completada";
  return p.sentCount+p.skippedCount>0?"En ejecución":"Aprobada";
}
export default function CommercialMailPlans({drafts,newsletter=false}:{drafts:Draft[];newsletter?:boolean}){
  const cache=useQueryClient();
  const plans=useQuery<{plans:Plan[];dispatchEnabled:boolean}>({queryKey:[endpoint]});
  const [id,setId]=useState(""),[start,setStart]=useState(""),[confirm,setConfirm]=useState(false),[message,setMessage]=useState("");
  const [reviewId,setReviewId]=useState("");
  const [approvalId,setApprovalId]=useState("");
  const review=useQuery<Preflight>({queryKey:[endpoint,reviewId,"preflight"],enabled:!!reviewId,queryFn:async()=>(await apiRequest("GET",endpoint+"/"+reviewId+"/preflight")).json()});
  const draft=drafts.find(d=>d.id===id), date=new Date(start);
  const valid=!!draft?.content.recipientIds?.length&&Number.isFinite(date.getTime())&&date.getTime()>Date.now()+60000;
  const schedule=useMutation({mutationFn:async()=>{if(!draft||!valid||!confirm)throw Error("Revisa la selección.");return (await apiRequest("POST",endpoint,{draftId:draft.id,revision:draft.revision,startsAt:date.toISOString(),confirm:true})).json();},onSuccess:()=>{setConfirm(false);setMessage("Calendario preparado; ningún envío fue activado.");cache.invalidateQueries({queryKey:[endpoint]});},onError:(e:Error)=>setMessage(e.message)});
  const cancel=useMutation({mutationFn:async(id:string)=>(await apiRequest("POST",endpoint+"/"+id+"/cancel",{})).json(),onSuccess:()=>{setMessage("Preparación cancelada.");cache.invalidateQueries({queryKey:[endpoint]});},onError:(e:Error)=>setMessage(e.message)});
  const approve=useMutation({mutationFn:async(p:Plan)=>(await apiRequest("POST",endpoint+"/"+p.id+"/approve",{confirm:true,revision:p.revision})).json(),onSuccess:()=>{setApprovalId("");setMessage("Campaña autorizada para envío en su calendario.");cache.invalidateQueries({queryKey:[endpoint]});},onError:(e:Error)=>setMessage(e.message)});
  return <Card><CardHeader><CardTitle className="text-sm">{newsletter?"Calendario de newsletters":"Calendario de campañas"}</CardTitle><p className="text-xs text-muted-foreground">Modo preparación: guarda fechas y destinatarios de una versión. Preparar no autoriza envíos. Una aprobación inicia lotes automáticos de hasta 10 cada 30 minutos, de lunes a viernes 9–18 h (CDMX).</p></CardHeader><CardContent className="space-y-3">
    <label className="block text-sm">Borrador guardado<select className="w-full border rounded-md h-10 bg-background" value={id} onChange={e=>{setId(e.target.value);setConfirm(false);}}><option value="">Selecciona una campaña</option>{drafts.map(d=><option key={d.id} value={d.id}>{d.content.name} · v{d.revision}</option>)}</select></label>
    <label className="block text-sm">Inicio (hora local de este dispositivo)<Input type="datetime-local" value={start} onChange={e=>{setStart(e.target.value);setConfirm(false);}}/></label>
    {draft&&<div className="border rounded-md p-3 space-y-2"><p className="text-sm font-medium">{draft.content.recipientIds?.length??0} destinatarios · {draft.content.steps.length} correos por destinatario</p>{draft.content.audience==="pending_registration"&&<p className="text-xs text-amber-700">Recuperación para invitaciones de al menos 25 días. El primer correo seleccionado comienza en la fecha indicada; las siguientes etapas mantienen su separación.</p>}{draft.content.steps.map(s=><div key={s.day} className="text-xs break-words">Día {s.day} · {Number.isFinite(date.getTime())?commercialBatchDate(date,s.day-(draft.content.audience==="pending_registration"?draft.content.steps[0].day:1),0).toLocaleString("es-MX",{timeZone:"America/Mexico_City"}):"Fecha pendiente"} · {s.subject}</div>)}</div>}
    <label className="flex gap-2 items-start text-sm"><input type="checkbox" checked={confirm} onChange={e=>setConfirm(e.target.checked)}/> Confirmo que revisé el calendario y la versión guardada; sólo quiero preparar la campaña.</label>
    <Button disabled={!valid||!confirm||schedule.isPending} onClick={()=>schedule.mutate()}>Preparar calendario</Button>
    {message&&<p role="status" className="text-sm">{message}</p>}
    {plans.isError?<p role="alert">No se pudo consultar el calendario.</p>:plans.isLoading?<p>Cargando…</p>:plans.data?.plans.filter(p=>(p.audience==="newsletter")===newsletter).map(p=><div key={p.id} className="border rounded-md p-3 flex flex-wrap items-center gap-2"><div className="flex-1 min-w-0"><p className="font-medium text-sm break-words">{p.name} · v{p.revision}</p><p className="text-xs text-muted-foreground">{new Date(p.startsAt).toLocaleString("es-MX")} · {p.recipientCount} destinatarios · {p.jobCount} envíos previstos · {planLabel(p)}</p><p className="text-xs">{p.sentCount} aceptados por Resend · {p.skippedCount} omitidos/vencidos · {p.uncertainCount} por verificar</p></div>{p.state==="planned"&&!p.approved&&new Date(p.startsAt).getTime()>Date.now()+60000&&plans.data?.dispatchEnabled&&<>{approvalId===p.id?<><p className="basis-full text-xs text-amber-700">Confirmas el envío real a {p.recipientCount} destinatarios, hasta {p.jobCount} correos, versión {p.revision}.</p><Button size="sm" disabled={approve.isPending} onClick={()=>approve.mutate(p)}>Confirmar envío real</Button><Button size="sm" variant="outline" onClick={()=>setApprovalId("")}>Volver</Button></>:<Button size="sm" onClick={()=>setApprovalId(p.id)}>Autorizar campaña</Button>}</>}{p.state==="planned"&&<Button variant="outline" size="sm" disabled={cancel.isPending} onClick={()=>cancel.mutate(p.id)}>Cancelar campaña</Button>}<Button variant="outline" size="sm" onClick={()=>{setReviewId(p.id);if(reviewId===p.id)void review.refetch();}}>Revalidar audiencia</Button>{reviewId===p.id&&<div className="basis-full border-t pt-2 text-xs space-y-1">{review.isFetching?<p>Recalculando…</p>:review.isError?<p role="alert">No se pudo verificar la elegibilidad.</p>:review.data&&<><p>{review.data.eligibleRecipients} elegibles · {review.data.excludedRecipients} fuera del segmento · {review.data.eligibleFutureJobs} envíos futuros · {review.data.overdueJobs} fechas vencidas</p>{review.data.blockers.map(b=><p key={b} className="text-muted-foreground">{b}</p>)}</>}</div>}</div>)}
  </CardContent></Card>;
}
