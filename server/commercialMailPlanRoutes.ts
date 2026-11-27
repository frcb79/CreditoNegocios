import {commercialMailDispatchSettings,commercialEmailHash} from "./commercialMailDispatchRender";
import type {Express,RequestHandler} from "express";
import {randomUUID} from "node:crypto";
import {z} from "zod";
import {pool} from "./db";
import {summarizeCommercialMailPlan} from "./commercialMailPreflight";
import {commercialMailSchema} from "../shared/commercialMailDrafts";
import {commercialPlanJobs} from "../shared/commercialMailSchedule";
import {COMMERCIAL_MAIL_RECIPIENTS_SQL} from "./commercialMailRecipients";
import {INSERT_COMMERCIAL_MAIL_PLAN_JOBS_SQL,LIST_COMMERCIAL_MAIL_PLANS_SQL} from "./commercialMailPlanSchema";
const scheduleInput=z.object({draftId:z.string().uuid(),revision:z.number().int().positive(),startsAt:z.string().datetime({offset:true}),confirm:z.literal(true)}).strict();
const endpoint="/api/admin/commercial-mail-plans";
// Preparation is not approval; dispatch additionally requires explicit production configuration.
export function registerCommercialMailPlanRoutes(app:Express,auth:RequestHandler,guard:RequestHandler){
  app.get(endpoint,auth,guard,async(_req,res)=>{
    try{const {rows}=await pool.query(LIST_COMMERCIAL_MAIL_PLANS_SQL);return res.json({plans:rows,dispatchEnabled:commercialMailDispatchSettings(process.env).enabled});}
    catch{return res.status(503).json({message:"No se pudieron consultar las campañas previstas"});}
  });
  app.get(endpoint+"/:id/preflight",auth,guard,async(req,res)=>{
    if(!z.string().uuid().safeParse(req.params.id).success)return res.status(400).json({message:"ID inválido"});
    try{
      const plan=(await pool.query("SELECT p.state,r.content FROM public.commercial_mail_plans p JOIN public.commercial_mail_draft_revisions r ON r.draft_id=p.draft_id AND r.revision=p.revision WHERE p.id=$1",[req.params.id])).rows[0];
      if(!plan)return res.status(404).json({message:"Campaña no encontrada"});
      const draft=commercialMailSchema.safeParse(plan.content);
      if(!draft.success)return res.status(409).json({message:"Versión de campaña inválida"});
      const candidates=(await pool.query(COMMERCIAL_MAIL_RECIPIENTS_SQL,[draft.data.audience])).rows;
      if(candidates.length>500)return res.status(422).json({message:"Audiencia supera el límite de revisión; no se puede confirmar elegibilidad."});
      const jobs=(await pool.query('SELECT user_id AS "userId",scheduled_for AS "scheduledFor" FROM public.commercial_mail_plan_jobs WHERE plan_id=$1',[req.params.id])).rows;
      return res.json(summarizeCommercialMailPlan(draft.data.audience,plan.state,jobs,new Set(candidates.map(r=>r.id)),new Date(),commercialMailDispatchSettings(process.env).enabled));
    }catch{return res.status(503).json({message:"No se pudo revalidar la campaña"});}
  });
  app.post(endpoint,auth,guard,async(req:any,res)=>{
    const parsed=scheduleInput.safeParse(req.body);
    if(!parsed.success)return res.status(400).json({message:"Confirma versión, fecha y preparación de campaña."});
    const {draftId,revision,startsAt}=parsed.data;
    const start=new Date(startsAt),now=Date.now();
    if(start.getTime()<now+60000||start.getTime()>now+90*86400000)return res.status(400).json({message:"Selecciona una fecha futura dentro de los siguientes 90 días."});
    const tx=await pool.connect().catch(()=>null);
    if(!tx)return res.status(503).json({message:"Base de datos no disponible"});
    try{
      await tx.query("BEGIN");
      await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",["commercial-mail:"+draftId]);
      const row=(await tx.query("SELECT revision,content FROM public.commercial_mail_draft_revisions WHERE draft_id=$1 ORDER BY revision DESC LIMIT 1",[draftId])).rows[0];
      if(!row||row.revision!==revision){await tx.query("ROLLBACK");return res.status(409).json({message:"Selecciona la versión vigente del borrador."});}
      const draft=commercialMailSchema.safeParse(row.content);
      if(!draft.success||!draft.data.recipientIds?.length){await tx.query("ROLLBACK");return res.status(422).json({message:"Guarda una selección explícita de destinatarios."});}
      const content=draft.data, ids=content.recipientIds!;

      const candidates=(await tx.query(COMMERCIAL_MAIL_RECIPIENTS_SQL,[content.audience])).rows;
      const allowed=new Set(candidates.map(r=>r.id));
      if(candidates.length>500||ids.some(id=>!allowed.has(id))){await tx.query("ROLLBACK");return res.status(409).json({message:"La audiencia cambió. Revisa el borrador antes de programar."});}
      const existing=(await tx.query("SELECT id FROM public.commercial_mail_plans WHERE draft_id=$1 AND state='planned'",[draftId])).rows[0];
      if(existing){await tx.query("ROLLBACK");return res.status(409).json({message:"Ya existe una preparación para este borrador. Cancélala antes de crear otra."});}
      const id=randomUUID();
      await tx.query("INSERT INTO public.commercial_mail_plans(id,draft_id,revision,starts_at,created_by) VALUES($1,$2,$3,$4,$5)",[id,draftId,revision,start,req.commercialMailActor]);
      const jobs=commercialPlanJobs(start,ids,content.steps.map(s=>s.day),content.audience==="pending_registration");
      await tx.query(INSERT_COMMERCIAL_MAIL_PLAN_JOBS_SQL,[id,jobs.map(j=>j.userId),jobs.map(j=>j.day),jobs.map(j=>j.scheduledFor)]);
      await tx.query("COMMIT");
      return res.status(201).json({id,dispatchEnabled:false,jobCount:ids.length*content.steps.length});
    }catch{await tx.query("ROLLBACK").catch(()=>{});return res.status(503).json({message:"No se pudo preparar la campaña"});}finally{tx.release();}
  });
  app.post(endpoint+"/:id/approve",auth,guard,async(req:any,res)=>{
    if(!commercialMailDispatchSettings(process.env).enabled)return res.status(403).json({message:"El envío comercial está deshabilitado."});
    if(!z.string().uuid().safeParse(req.params.id).success||!z.object({confirm:z.literal(true),revision:z.number().int().positive()}).strict().safeParse(req.body).success)return res.status(400).json({message:"Confirma la versión y el envío real."});
    const tx=await pool.connect().catch(()=>null);if(!tx)return res.status(503).json({message:"Base de datos no disponible"});
    try{
      await tx.query("BEGIN");
      const row=(await tx.query("SELECT p.state,p.revision,p.starts_at,r.content FROM public.commercial_mail_plans p JOIN public.commercial_mail_draft_revisions r ON r.draft_id=p.draft_id AND r.revision=p.revision WHERE p.id=$1 FOR UPDATE OF p",[req.params.id])).rows[0];
      const draft=commercialMailSchema.safeParse(row?.content);
      if(!row||row.state!=="planned"||row.revision!==req.body.revision||new Date(row.starts_at).getTime()<Date.now()+60000||!draft.success){await tx.query("ROLLBACK");return res.status(409).json({message:"Campaña inválida, cancelada o con inicio vencido."});}
      const jobs=(await tx.query("SELECT DISTINCT user_id FROM public.commercial_mail_plan_jobs WHERE plan_id=$1",[req.params.id])).rows;
      const users=(await tx.query(COMMERCIAL_MAIL_RECIPIENTS_SQL,[draft.data.audience])).rows;
      const byId=new Map<string,{id:string;email:string}>(users.map(u=>[u.id,u]));
      if(!jobs.length||users.length>500||jobs.some(j=>!byId.has(j.user_id))){await tx.query("ROLLBACK");return res.status(409).json({message:"La audiencia cambió. Prepara un calendario nuevo."});}
      if(draft.data.audience==="pending_registration"){
        const old=await tx.query("SELECT DISTINCT data->>'brokerId' AS id FROM public.notifications WHERE type='broker_invitation_sent' AND created_at<=now()-interval '25 days' AND data->>'brokerId'=ANY($1::varchar[])",[jobs.map(j=>j.user_id)]);
        if(old.rows.length!==jobs.length){await tx.query("ROLLBACK");return res.status(409).json({message:"Recuperación sólo para invitaciones de al menos 25 días."});}
      }
      const hashes=Object.fromEntries(jobs.map(j=>[j.user_id,commercialEmailHash(byId.get(j.user_id)!.email)]));
      const result=await tx.query("INSERT INTO public.commercial_mail_approvals(plan_id,approved_by,recipient_hashes) VALUES($1,$2,$3::jsonb) ON CONFLICT DO NOTHING RETURNING plan_id",[req.params.id,req.commercialMailActor,JSON.stringify(hashes)]);
      if(!result.rowCount){await tx.query("ROLLBACK");return res.status(409).json({message:"Ya se aprobó esta campaña."});}
      await tx.query("COMMIT");return res.json({approved:true});
    }catch{await tx.query("ROLLBACK").catch(()=>{});return res.status(503).json({message:"No se pudo aprobar la campaña."});}finally{tx.release();}
  });
  app.post(endpoint+"/:id/cancel",auth,guard,async(req:any,res)=>{
    if(!z.string().uuid().safeParse(req.params.id).success)return res.status(400).json({message:"ID inválido"});
    try{
      const result=await pool.query("UPDATE public.commercial_mail_plans SET state='cancelled',cancelled_at=now(),cancelled_by=$2 WHERE id=$1 AND state='planned' RETURNING id",[req.params.id,req.commercialMailActor]);
      if(!result.rowCount)return res.status(409).json({message:"La campaña no está preparada o ya fue cancelada."});
      return res.json({cancelled:true});
    }catch{return res.status(503).json({message:"No se pudo cancelar"});}
  });
}
