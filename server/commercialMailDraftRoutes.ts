import cron from "node-cron";
import {runCommercialMailDispatch} from "./commercialMailDispatch";
import {commercialMailDispatchSettings} from "./commercialMailDispatchRender";
import {registerCommercialMailUnsubscribe} from "./commercialMailUnsubscribe";
import type {Express} from "express";
import {randomUUID} from "node:crypto";
import {z} from "zod";
import {pool} from "./db";
import {storage} from "./storage";
import {isAuthenticated} from "./auth";
import {registerCommercialMailTestRoutes} from "./commercialMailTestRoutes";
import {registerCommercialMailPlanRoutes} from "./commercialMailPlanRoutes";
import {COMMERCIAL_MAIL_RECIPIENTS_SQL} from "./commercialMailRecipients";
import {audiences,commercialMailSchema} from "../shared/commercialMailDrafts";
const writeSchema=z.object({id:z.string().uuid().optional(),expectedRevision:z.number().int().min(0),content:commercialMailSchema}).strict();
export function registerCommercialMailDraftRoutes(app:Express){
  const guard=async(req:any,res:any,next:any)=>{
    res.setHeader("Cache-Control","private, no-store");
    try{const actor=await storage.getUser(req.user?.claims?.sub||req.user?.id||req.dbUser?.id);if(!actor||actor.role!=="super_admin"||actor.status!=="active"||actor.isActive===false)return res.status(403).json({message:"Sólo Super Admin"});req.commercialMailActor=actor.id;next();}catch{return res.status(503).json({message:"No fue posible verificar el acceso"});}
  };
  app.get("/api/admin/commercial-mail-drafts",isAuthenticated,guard,async(_req,res)=>{
    try{const {rows}=await pool.query(`SELECT DISTINCT ON(draft_id) draft_id AS id,revision,content,created_at AS "updatedAt" FROM public.commercial_mail_draft_revisions ORDER BY draft_id,revision DESC`);res.json(rows);}catch{return res.status(503).json({message:"No fue posible consultar borradores"});}
  });
  app.get("/api/admin/commercial-mail-drafts/recipients",isAuthenticated,guard,async(req,res)=>{
    const audience=z.enum(audiences).safeParse(req.query.audience);
    if(!audience.success)return res.status(400).json({message:"Audiencia inválida"});
    try{const {rows}=await pool.query(COMMERCIAL_MAIL_RECIPIENTS_SQL,[audience.data]);
      if(rows.length>500)return res.status(422).json({message:"Audiencia supera 500 candidatos; requiere paginación antes de continuar."});
      return res.json({recipients:rows});
    }catch{return res.status(503).json({message:"No fue posible calcular destinatarios"});}
  });
  app.post("/api/admin/commercial-mail-drafts",isAuthenticated,guard,async(req:any,res)=>{
    const parsed=writeSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({message:parsed.error.issues[0]?.message||"Borrador inválido"});
    const {id,expectedRevision,content}=parsed.data;
    if((!id&&expectedRevision!==0)||(id&&expectedRevision===0))return res.status(400).json({message:"Revisión inválida"});
    const tx=await pool.connect().catch(()=>null);if(!tx)return res.status(503).json({message:"Base de datos no disponible"});
    try{await tx.query("BEGIN");const key=id||randomUUID();
      await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",["commercial-mail:"+key]);
      const latest=(await tx.query("SELECT max(revision)::int AS revision FROM public.commercial_mail_draft_revisions WHERE draft_id=$1",[key])).rows[0].revision||0;
      if(latest!==expectedRevision){await tx.query("ROLLBACK");return res.status(409).json({message:"El borrador cambió. Actualiza antes de guardar."});}
      if(content.recipientIds?.length){
        const candidates=(await tx.query(COMMERCIAL_MAIL_RECIPIENTS_SQL,[content.audience])).rows;
        const allowed=new Set(candidates.map(row=>row.id));
        if(candidates.length>500||content.recipientIds.some(id=>!allowed.has(id))){
          await tx.query("ROLLBACK");return res.status(409).json({message:"La audiencia cambió. Actualiza la selección antes de guardar."});
        }
      }
      const result=await tx.query('INSERT INTO public.commercial_mail_draft_revisions(draft_id,revision,content,created_by) VALUES($1,$2,$3::jsonb,$4) RETURNING draft_id AS id,revision,content,created_at AS "updatedAt"',[key,latest+1,JSON.stringify(content),req.commercialMailActor]);
      await tx.query("COMMIT");return res.status(201).json(result.rows[0]);
    }catch{await tx.query("ROLLBACK").catch(()=>{});return res.status(503).json({message:"No fue posible guardar el borrador"});}finally{tx.release();}
  });
  app.get("/api/admin/commercial-mail-drafts/:id/revisions",isAuthenticated,guard,async(req,res)=>{
    if(!z.string().uuid().safeParse(req.params.id).success)return res.status(400).json({message:"ID inválido"});
    try{const {rows}=await pool.query('SELECT draft_id AS id,revision,content,created_at AS "updatedAt" FROM public.commercial_mail_draft_revisions WHERE draft_id=$1 ORDER BY revision DESC LIMIT 100',[req.params.id]);return res.json(rows);}catch{return res.status(503).json({message:"No fue posible consultar versiones"});}
  });
  registerCommercialMailPlanRoutes(app,isAuthenticated,guard);
  registerCommercialMailTestRoutes(app,isAuthenticated,guard);
  registerCommercialMailUnsubscribe(app);
  if(commercialMailDispatchSettings(process.env).enabled)cron.schedule("*/5 * * * *",async()=>{try{console.log("[CommercialMail]",await runCommercialMailDispatch());}catch{console.error("[CommercialMail] Dispatch task failed");}},{timezone:"America/Mexico_City"});
}
