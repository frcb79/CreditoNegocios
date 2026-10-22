import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Download, Upload, Loader2, AlertTriangle } from "lucide-react";

type Issue = { row: number; field: string; message: string };
type Preview = {
  total:number;masters:number;brokers:number;ready:boolean;
  errors: Issue[];warnings:{row:number;message:string}[];
  rows: Array<{row:number;email:string;firstName:string;lastName:string;role:string;masterEmail:string;promoCode?:string}>;
};
type SendOutcome = {
  total:number;sent:number;pending:number;failed:number;
  results:Array<{row:number;email:string;role:string;status:string;message:string}>;
};

export default function BulkBrokerInvitationModal(props:{isOpen:boolean;onClose:()=>void}) {
  const { toast }=useToast();
  const client=useQueryClient();
  const [file,setFile]=useState<File|null>(null);
  const [preview,setPreview]=useState<Preview|null>(null);
  const [result,setResult]=useState<SendOutcome|null>(null);
  const [loading,setLoading]=useState(false);
  const [confirmed,setConfirmed]=useState(false);
  const [error,setError]=useState("");
  const [batchPromoCode,setBatchPromoCode]=useState("");

  const clear=()=>{
    setFile(null);setPreview(null);setResult(null);setConfirmed(false);setError("");
    setBatchPromoCode("");
  };
  const request=async (mode:"preview"|"send")=>{
    if(!file)return;
    setLoading(true);setError("");
    try{
      const form=new FormData();
      form.append("file",file);
      if(batchPromoCode.trim()) form.append("promoCode",batchPromoCode.trim().toUpperCase());
      if(mode==="send")form.append("confirmation","ENVIAR_INVITACIONES");
      const response=await fetch("/api/broker-invitations/bulk/"+mode,{
        method:"POST",body:form,credentials:"include",
      });
      const json=await response.json();
      if(!response.ok)throw new Error(json.message || json.errors?.map((i:Issue)=>i.message).join("; ") ||"No se pudo procesar el archivo");
      if(mode==="preview"){setPreview(json);setConfirmed(false);setResult(null);}
      else {
        setResult(json);
        client.invalidateQueries({queryKey:["/api/broker-network"]});
        client.invalidateQueries({queryKey:["/api/users"]});
        toast({title:"Envío masivo procesado",description:`Enviadas: ${json.sent}. Pendientes: ${json.pending}. Errores: ${json.failed}.`});
      }
    }catch(e:any){setError(e.message||"Error al procesar el archivo");}
    finally{setLoading(false);}
  };

  const downloadTemplate=async ()=>{
    try{
      const response=await fetch("/api/broker-invitations/bulk/template",{credentials:"include"});
      if(!response.ok)throw new Error("No fue posible descargar la plantilla");
      const blob=await response.blob();
      const url=URL.createObjectURL(blob);
      const a=document.createElement("a");a.href=url;a.download="CreditoNegocios_Invitaciones.xlsx";a.click();
      URL.revokeObjectURL(url);
    }catch(e:any){setError(e.message);}
  };

  return (
    <Dialog open={props.isOpen} onOpenChange={open=>{if(!open&&!loading){clear();props.onClose();}}}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Invitar Brokers y Master Brokers desde Excel</DialogTitle>
          <DialogDescription>
            Carga la plantilla, verifica las afiliaciones y confirma. No se enviará ningún correo durante la vista previa.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Button type="button" variant="outline" onClick={downloadTemplate}>
            <Download className="w-4 h-4 mr-2"/> Descargar plantilla oficial
          </Button>
          <div className="space-y-1">
            <label htmlFor="bulk-annual-courtesy" className="text-xs font-medium">
              Cupón anual para todo el lote (opcional)
            </label>
            <Input id="bulk-annual-courtesy" value={batchPromoCode}
              onChange={event => {setBatchPromoCode(event.target.value.toUpperCase());setPreview(null);setResult(null);setConfirmed(false);}}
              placeholder="Ej. LANZAMIENTO12" data-testid="input-bulk-annual-promo"/>
            <p className="text-xs text-muted-foreground">
              Se aplicará a todas las invitaciones, salvo que una fila del Excel tenga
              un codigo_promocional diferente. Puedes usar códigos individuales por fila.
              Si no indicas ningún cupón, se enviarán invitaciones sin promoción. Los códigos indicados deben estar activos y vigentes.
            </p>
          </div>
          <Input type="file" accept=".xlsx" aria-label="Archivo de invitaciones" data-testid="input-bulk-invites"
            onChange={event=>{setFile(event.target.files?.[0]||null);setPreview(null);setResult(null);setConfirmed(false);}}/>
          <Button disabled={!file||loading} onClick={()=>request("preview")} data-testid="button-preview-bulk-invites">
            {loading?<Loader2 className="w-4 h-4 animate-spin mr-2"/>:<Upload className="w-4 h-4 mr-2"/>}
            Revisar Excel sin enviar correos
          </Button>
          {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
          {preview&&!result&&<>
            <div className="text-sm font-medium">
              Total: {preview.total} · Masters: {preview.masters} · Brokers: {preview.brokers}
            </div>
            {preview.errors.length>0&&<div className="bg-red-50 text-red-800 rounded p-3 text-sm">
              <p className="font-semibold">Corrige estos errores antes de enviar:</p>
              {preview.errors.slice(0,30).map((e,i)=><p key={i}>Fila {e.row} ({e.field}): {e.message}</p>)}
            </div>}
            {preview.warnings.length>0&&<div className="bg-amber-50 text-amber-800 rounded p-3 text-sm">
              <p className="font-semibold">Advertencias:</p>
              {preview.warnings.slice(0,20).map((w,i)=><p key={i}>Fila {w.row}: {w.message}</p>)}
            </div>}
            <div className="border rounded max-h-44 overflow-y-auto">
              {preview.rows.map(row=><div key={row.row} className="p-2 text-xs border-b">
                Fila {row.row}: {row.firstName} {row.lastName} · {row.email} · {row.role==="master_broker"?"Master Broker":"Broker"}
                {row.masterEmail&&<> · Master: {row.masterEmail}</>}
                <span> · Cupón: {row.promoCode || batchPromoCode || "Sin cupón"}</span>
              </div>)}
            </div>
            {preview.ready&&<label className="flex items-start gap-2 text-sm">
              <Checkbox checked={confirmed} onCheckedChange={v=>setConfirmed(v===true)} data-testid="checkbox-confirm-bulk-invites"/>
              <span>Revisé la lista y autorizo el envío de invitaciones reales a estos correos.</span>
            </label>}
            <Button className="w-full" disabled={!preview.ready||!confirmed||loading} onClick={()=>request("send")}
              data-testid="button-send-bulk-invites">
              {loading?"Procesando...":`Enviar ${preview.total} invitaciones`}
            </Button>
          </>}
          {result&&<div className="space-y-2">
            <p className="text-sm font-semibold">Enviadas: {result.sent} · Pendientes: {result.pending} · Errores: {result.failed}</p>
            <p className="text-xs text-slate-600">Los pendientes pueden reenviarse cuando el servicio de correo esté disponible.</p>
            <div className="border rounded max-h-56 overflow-y-auto">
              {result.results.map(row=><div className="text-xs border-b p-2" key={row.row}>
                {row.row}. {row.email} · {row.status==="sent"?"Enviada":row.status==="pending"?"Pendiente":"Error"} · {row.message}
              </div>)}
            </div>
          </div>}
          <p className="flex gap-2 text-xs text-slate-500">
            <AlertTriangle className="w-4 h-4 shrink-0"/> Máximo 100 personas por archivo. Los Masters se procesan primero.
            Los enlaces de activación son personales y vencen en 24 horas.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
