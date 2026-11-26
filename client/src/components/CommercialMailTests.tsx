import {useState} from "react";
import {useQuery,useMutation,useQueryClient} from "@tanstack/react-query";
import {Button} from "@/components/ui/button";
import {Card,CardHeader,CardTitle,CardContent} from "@/components/ui/card";
import {apiRequest} from "@/lib/queryClient";
import type {CommercialMailDraft} from "@shared/commercialMailDrafts";
type Draft={id:string;revision:number;content:CommercialMailDraft};
type History={id:string;recipient:string;day:number;revision:number;status:string;createdAt:string;providerMessageId:string|null};
const endpoint="/api/admin/commercial-mail-tests";
export default function CommercialMailTests({drafts}:{drafts:Draft[]}){
  const cache=useQueryClient(),query=useQuery<{enabled:boolean;recipients:string[];history:History[]}>({queryKey:[endpoint]});
  const [id,setId]=useState(""),[day,setDay]=useState(""),[recipient,setRecipient]=useState(""),[confirm,setConfirm]=useState(false),[message,setMessage]=useState("");
  const draft=drafts.find(x=>x.id===id);
  const send=useMutation({mutationFn:async()=>{if(!draft||!confirm||!query.data?.enabled)throw Error("Prueba no habilitada");return (await apiRequest("POST",endpoint,{id:crypto.randomUUID(),draftId:draft.id,revision:draft.revision,day:Number(day),recipient,confirm:true})).json();},onSuccess:()=>{setMessage("Resend aceptó la prueba. La entrega se confirma por separado.");setConfirm(false);},onError:(e:Error)=>{setMessage(e.message);setConfirm(false);},onSettled:()=>cache.invalidateQueries({queryKey:[endpoint]})});
  const labels:Record<string,string>={claimed:"Intento registrado",sent:"Aceptado por Resend",uncertain:"Resultado incierto",rejected:"Rechazado"};
  return <Card><CardHeader><CardTitle className="text-sm">Envío de prueba</CardTitle><p className="text-xs text-muted-foreground">Sólo staging, direcciones autorizadas y enlaces de acceso deshabilitados. No usa la audiencia comercial.</p></CardHeader><CardContent className="space-y-3">
    {query.isError?<p role="alert">No se pudo consultar disponibilidad.</p>:query.isLoading?<p>Cargando…</p>:!query.data?.enabled?<p className="text-sm">Pruebas deshabilitadas.</p>:<>
      <label className="block text-sm">Borrador<select className="w-full border rounded-md h-10 bg-background" value={id} onChange={e=>{setId(e.target.value);setDay("");setConfirm(false);}}><option value="">Selecciona versión</option>{drafts.map(d=><option key={d.id} value={d.id}>{d.content.name} · v{d.revision}</option>)}</select></label>
      <label className="block text-sm">Correo<select className="w-full border rounded-md h-10 bg-background" value={day} onChange={e=>{setDay(e.target.value);setConfirm(false);}}><option value="">Selecciona correo</option>{draft?.content.steps.map(s=><option key={s.day} value={s.day}>Día {s.day} · {s.subject}</option>)}</select></label>
      <label className="block text-sm">Destino autorizado<select className="w-full border rounded-md h-10 bg-background" value={recipient} onChange={e=>{setRecipient(e.target.value);setConfirm(false);}}><option value="">Selecciona destinatario</option>{query.data.recipients.map(r=><option key={r} value={r}>{r}</option>)}</select></label>
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={confirm} onChange={e=>setConfirm(e.target.checked)}/> Autorizo este único correo de prueba.</label>
      <Button disabled={!draft||!day||!recipient||!confirm||send.isPending} onClick={()=>send.mutate()}>Enviar prueba</Button>
    </>}
    {message&&<p role="status" className="text-sm">{message}</p>}
    {query.data?.history.map(h=><div key={h.id} className="border rounded-md p-2 text-xs break-words">{h.recipient} · Día {h.day} · v{h.revision} · {labels[h.status]??h.status} · {new Date(h.createdAt).toLocaleString("es-MX")}{h.providerMessageId&&<p>ID Resend: {h.providerMessageId}</p>}</div>)}
  </CardContent></Card>;
}
