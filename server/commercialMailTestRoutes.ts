import type {Express,RequestHandler} from "express";
import {z} from "zod";
import {Resend} from "resend";
import {pool} from "./db";
import {commercialMailSchema} from "../shared/commercialMailDrafts";
import {commercialMailTestSettings,renderCommercialTest} from "./commercialMailTestRender";
const endpoint="/api/admin/commercial-mail-tests";
const input=z.object({id:z.string().uuid(),draftId:z.string().uuid(),revision:z.number().int().positive(),day:z.number().int().min(1).max(90),recipient:z.string().trim().email().max(254),confirm:z.literal(true)}).strict();
export function registerCommercialMailTestRoutes(app:Express,auth:RequestHandler,guard:RequestHandler){
  app.get(endpoint,auth,guard,async(_req,res)=>{
    const settings=commercialMailTestSettings(process.env);
    try{const {rows}=await pool.query('SELECT id,draft_id AS "draftId",revision,step_day AS day,recipient,status,created_at AS "createdAt",provider_message_id AS "providerMessageId" FROM public.commercial_mail_tests ORDER BY created_at DESC LIMIT 50');return res.json({...settings,history:rows});}
    catch{return res.status(503).json({message:"No se pudo consultar el historial de pruebas"});}
  });
  app.post(endpoint,auth,guard,async(req:any,res)=>{
    const settings=commercialMailTestSettings(process.env), parsed=input.safeParse(req.body);
    if(!settings.enabled)return res.status(403).json({message:"Envíos de prueba deshabilitados; requieren staging y lista autorizada."});
    if(!parsed.success)return res.status(400).json({message:"Confirma un correo de prueba válido."});
    const p=parsed.data,recipient=p.recipient.toLowerCase();
    if(!settings.recipients.includes(recipient))return res.status(403).json({message:"Destinatario no autorizado."});
    const tx=await pool.connect().catch(()=>null);
    if(!tx)return res.status(503).json({message:"Base de datos no disponible"});
    let mail:ReturnType<typeof renderCommercialTest>;
    try{
      await tx.query("BEGIN");
      await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",["commercial-mail-test-global"]);
      const existing=(await tx.query("SELECT status FROM public.commercial_mail_tests WHERE id=$1",[p.id])).rows[0];
      if(existing){await tx.query("ROLLBACK");return res.status(409).json({message:"Prueba ya registrada; consulta su historial antes de repetir."});}
      const recent=(await tx.query("SELECT 1 FROM public.commercial_mail_tests WHERE created_at>now()-interval '1 minute' LIMIT 1")).rowCount;
      if(recent){await tx.query("ROLLBACK");return res.status(429).json({message:"Espera un minuto entre pruebas."});}
      const row=(await tx.query("SELECT revision,content FROM public.commercial_mail_draft_revisions WHERE draft_id=$1 ORDER BY revision DESC LIMIT 1",[p.draftId])).rows[0];
      const draft=commercialMailSchema.safeParse(row?.content);
      const step=draft.success&&row.revision===p.revision?draft.data.steps.find(s=>s.day===p.day):undefined;
      if(!step){await tx.query("ROLLBACK");return res.status(409).json({message:"Guarda y selecciona la versión vigente."});}
      mail=renderCommercialTest(step);
      await tx.query("INSERT INTO public.commercial_mail_tests(id,draft_id,revision,step_day,recipient,actor_id,status) VALUES($1,$2,$3,$4,$5,$6,'claimed')",[p.id,p.draftId,p.revision,p.day,recipient,req.commercialMailActor]);
      await tx.query("COMMIT");
    }catch{await tx.query("ROLLBACK").catch(()=>{});return res.status(503).json({message:"No se pudo preparar la prueba"});}finally{tx.release();}
    // Never retry a claimed or uncertain attempt automatically. No activation token or campaign recipient used.
    try{
      const resend=new Resend(process.env.RESEND_API_KEY!);
      const result=await resend.emails.send({from:process.env.EMAIL_FROM!,to:recipient,...mail!},{idempotencyKey:"commercial-mail-test/"+p.id});
      const status=result.data?.id?"sent":result.error?"rejected":"uncertain";
      await pool.query("UPDATE public.commercial_mail_tests SET status=$2,provider_message_id=$3 WHERE id=$1 AND status='claimed'",[p.id,status,result.data?.id??null]);
      if(status!=="sent")return res.status(502).json({message:"Resend no confirmó la prueba; consulta historial."});
      return res.json({status,providerMessageId:result.data!.id});
    }catch{
      await pool.query("UPDATE public.commercial_mail_tests SET status='uncertain' WHERE id=$1 AND status='claimed'",[p.id]).catch(()=>{});
      return res.status(503).json({message:"Resultado no confirmado. Revisa el historial y Resend antes de repetir."});
    }
  });
}
