import { useState } from "react";
import { useQuery,useMutation,useQueryClient } from "@tanstack/react-query";
import { Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/queryClient";
import { historicalCreditIntakeSchema,mexicoToday } from "@shared/historicalCreditIntake";
import { useToast } from "@/hooks/use-toast";
type Choice={id:string;name:string};
type Client={id:string;brokerId:string;type:string;businessName?:string;firstName?:string;lastName?:string;broker?:{firstName?:string;lastName?:string;role?:string}};
type Doc={id:string;fileName:string;creditId?:string;isValid?:boolean};
type Intake={id:string;reference:string;actualDate:string;amount:string;clientName:string;institutionName:string;commissionStatus:string};
const empty={clientId:"",financialInstitutionId:"",productTemplateId:"",externalReference:"",actualDate:"",amount:"",termMonths:"",evidenceDocumentId:"",historicalNetwork:"unknown",historicalMasterName:"",commissionStatus:"unknown",commissionEvidenceDocumentId:"",notes:""};
const clientName=(c:Client)=>c.businessName||[c.firstName,c.lastName].filter(Boolean).join(" ")||c.id;
const cls="h-10 w-full border rounded-md bg-background px-2 text-sm";
export default function HistoricalCreditIntakeModal({isOpen,onClose}:{isOpen:boolean;onClose:()=>void}){
  const {toast}=useToast(),cache=useQueryClient();
  const [fields,setFields]=useState(empty),[confirmed,setConfirmed]=useState(false),[error,setError]=useState("");
  const put=(k:keyof typeof empty,v:string)=>{setFields(f=>({...f,[k]:v,...(k==="clientId"?{evidenceDocumentId:"",commissionEvidenceDocumentId:""}:{})}));if(k==="clientId")setConfirmed(false);setError("");};
  const clients=useQuery<Client[]>({queryKey:["/api/clients"],enabled:isOpen});
  const lenders=useQuery<Choice[]>({queryKey:["/api/financial-institutions"],enabled:isOpen});
  const products=useQuery<Choice[]>({queryKey:["/api/product-templates"],enabled:isOpen});
  const documents=useQuery<Doc[]>({queryKey:["historical-intake-documents",fields.clientId],enabled:isOpen&&!!fields.clientId,queryFn:async()=>(await apiRequest("GET","/api/documents?clientId="+encodeURIComponent(fields.clientId))).json()});
  const intakes=useQuery<Intake[]>({queryKey:["/api/admin/historical-credit-intakes"],enabled:isOpen});
  const selected=clients.data?.find(c=>c.id===fields.clientId);
  const eligibleDocs=(documents.data||[]).filter(d=>!d.creditId&&d.isValid!==false);
  const create=useMutation({mutationFn:async(data:unknown)=>(await apiRequest("POST","/api/admin/historical-credit-intakes",data)).json(),onSuccess:()=>{cache.invalidateQueries({queryKey:["/api/admin/historical-credit-intakes"]});setFields(empty);setConfirmed(false);setError("");toast({title:"Registro histórico guardado",description:"Pendiente de conciliación. No se generó comisión."});},onError:(e:Error)=>setError(e.message)});
  const submit=(e:React.FormEvent)=>{e.preventDefault();if(create.isPending)return;const parsed=historicalCreditIntakeSchema.safeParse({...fields,brokerId:selected?.brokerId||"",termMonths:Number(fields.termMonths),historicalMasterName:fields.historicalNetwork==="master"?fields.historicalMasterName:undefined,commissionEvidenceDocumentId:fields.commissionStatus==="paid_external"?fields.commissionEvidenceDocumentId:undefined,originatorConfirmed:confirmed});if(!parsed.success){setError(parsed.error.issues[0]?.message||"Revisa los datos.");return;}create.mutate(parsed.data);};
  const select=(key:keyof typeof empty,label:string,options:Array<{value:string;label:string}>)=><div className="space-y-1"><Label htmlFor={"history-"+key}>{label}</Label><select className={cls} id={"history-"+key} value={fields[key]} onChange={e=>put(key,e.target.value)}><option value="">Seleccionar</option>{options.map(x=><option key={x.value} value={x.value}>{x.label}</option>)}</select></div>;
  const field=(key:keyof typeof empty,label:string,type="text")=><div className="space-y-1"><Label htmlFor={"history-"+key}>{label}</Label><Input id={"history-"+key} type={type} step={type==="number"?(key==="amount"?"0.01":"1"):undefined} min={type==="number"?(key==="amount"?"0.01":"1"):undefined} max={type==="date"?mexicoToday():undefined} value={fields[key]} onChange={e=>put(key,e.target.value)}/></div>;
  return <Dialog open={isOpen} onOpenChange={open=>{if(!open&&!create.isPending)onClose();}}><DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Registrar operación histórica</DialogTitle><DialogDescription>Captura un crédito otorgado anteriormente para conciliación administrativa. No confirma dispersión ni calcula comisiones.</DialogDescription></DialogHeader>
  <form onSubmit={submit} className="space-y-4">
    {select("clientId","Cliente existente *",(clients.data||[]).map(c=>({value:c.id,label:clientName(c)})))}
    {selected&&<div className="rounded-md border p-3 space-y-2"><p className="text-sm">Asesor del expediente: {selected.broker?[selected.broker.firstName,selected.broker.lastName].filter(Boolean).join(" ")||selected.brokerId:selected.brokerId}</p><label className="flex gap-2 items-start text-xs"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>Confirmo que este asesor originó la operación según la evidencia. Si no coincide, primero debe conciliarse la atribución.</label></div>}
    <div className="grid sm:grid-cols-2 gap-3">{select("financialInstitutionId","Financiera *",(lenders.data||[]).map(x=>({value:x.id,label:x.name})))}{select("productTemplateId","Producto *",(products.data||[]).map(x=>({value:x.id,label:x.name})))}{field("externalReference","Referencia de contrato / crédito *")}{field("actualDate","Fecha real de desembolso *","date")}{field("amount","Monto desembolsado (MXN) *","number")}{field("termMonths","Plazo (meses) *","number")}</div>
    {select("evidenceDocumentId","Evidencia del desembolso *",eligibleDocs.map(d=>({value:d.id,label:d.fileName})))}
    {fields.clientId&&eligibleDocs.length===0&&<p className="text-xs text-muted-foreground">Carga primero el contrato o comprobante en Documentos del cliente. No utilices un archivo de otra operación.</p>}
    {select("historicalNetwork","Red comercial al momento del otorgamiento *",[{value:"unknown",label:"Por verificar"},{value:"direct",label:"Broker directo / plataforma"},{value:"master",label:"Master Broker o red Master"}])}
    {fields.historicalNetwork==="master"&&field("historicalMasterName","Master histórico según evidencia *")}
    {select("commissionStatus","Situación declarada de comisión *",[{value:"unknown",label:"Por conciliar"},{value:"pending",label:"Pendiente"},{value:"paid_external",label:"Pagada fuera de plataforma"},{value:"not_applicable",label:"No aplicable"}])}
    {fields.commissionStatus==="paid_external"&&select("commissionEvidenceDocumentId","Evidencia de pago previo *",eligibleDocs.map(d=>({value:d.id,label:d.fileName})))}
    <div className="space-y-1"><Label>Observaciones</Label><Textarea value={fields.notes} onChange={e=>put("notes",e.target.value)} maxLength={1000}/></div>
    {(clients.isError||lenders.isError||products.isError||documents.isError)&&<p role="alert" className="text-sm text-destructive">No fue posible consultar el catálogo o expediente. Reintenta.</p>}
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
    <DialogFooter><Button type="button" variant="outline" onClick={onClose} disabled={create.isPending}>Cerrar</Button><Button type="submit" disabled={create.isPending||!confirmed||!fields.evidenceDocumentId}>Guardar para conciliación</Button></DialogFooter>
  </form>
  <section className="border-t pt-3 space-y-2"><h3 className="text-sm font-semibold">Registros históricos por conciliar</h3>{intakes.isError?<p className="text-xs text-destructive">No se pudo consultar la lista.</p>:intakes.isLoading?<p className="text-xs">Cargando...</p>:!intakes.data?.length?<p className="text-xs text-muted-foreground">Sin registros históricos.</p>:intakes.data.map(x=><div key={x.id} className="rounded-md border p-2 text-xs"><p className="font-medium">{x.clientName} · {x.institutionName}</p><p>{x.reference} · {x.actualDate} · ${Number(x.amount).toLocaleString("es-MX")} MXN</p><p className="text-muted-foreground">Pendiente de conciliación</p></div>)}</section>
  </DialogContent></Dialog>;
}
