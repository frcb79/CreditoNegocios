import type { Express } from "express";
import { z } from "zod";
import { pool } from "./db";
import { storage } from "./storage";
import { isAuthenticated } from "./auth";
import { evaluateProspectPreapplication } from "./prospectAutoMatching";

/** Read and retry are strictly bound to the actual logged-in lead owner. */
export function registerProspectAutoMatchingRoutes(app: Express) {
  const authorize=async(req:any) => {
    const userId=req.user?.claims?.sub || req.user?.id || req.dbUser?.id;
    if (!userId) return null;
    const user=await storage.getUser(userId);
    if (!user || !["broker","master_broker"].includes(user.role) ||
      user.isActive === false || user.status !== "active") return null;
    return user.id;
  };
  const leadParam=z.string().uuid();
  app.get("/api/commercial-resources/received/:id/preapplication",isAuthenticated,async(req:any,res)=>{
    res.setHeader("Cache-Control","private, no-store");
    try {
      const owner=await authorize(req);
      if(!owner) return res.status(403).json({message:"No autorizado"});
      const param=leadParam.safeParse(req.params.id);
      if(!param.success) return res.status(404).json({message:"Prospecto no encontrado"});
      const found=await pool.query(`
        SELECT p.id,p.lead_id AS "leadId",p.client_id AS "clientId",
          p.status,p.financing_data AS financing,p.summary,p.details,
          p.evaluated_at AS "evaluatedAt",p.created_at AS "createdAt"
        FROM public.prospect_preapplications p
        JOIN public.commercial_marketing_leads l ON l.id=p.lead_id
        WHERE p.lead_id=$1 AND l.owner_user_id=$2 AND p.owner_user_id=$2
          AND p.tenant_id IS NOT DISTINCT FROM l.tenant_id
      `,[param.data,owner]);
      if(!found.rows.length) return res.status(404).json({message:"Pre-solicitud aún no disponible"});
      return res.json(found.rows[0]);
    } catch { return res.status(503).json({message:"No fue posible revisar la pre-solicitud"}); }
  });
  app.post("/api/commercial-resources/received/:id/preapplication/retry",isAuthenticated,async(req:any,res)=>{
    res.setHeader("Cache-Control","private, no-store");
    try {
      const owner=await authorize(req);
      if(!owner) return res.status(403).json({message:"No autorizado"});
      const param=leadParam.safeParse(req.params.id);
      if(!param.success || Object.keys(req.body||{}).length)
        return res.status(400).json({message:"Solicitud inválida"});
      const found=await pool.query(`
        SELECT p.id,p.status
        FROM public.prospect_preapplications p
        JOIN public.commercial_marketing_leads l ON l.id=p.lead_id
        WHERE p.lead_id=$1 AND l.owner_user_id=$2 AND p.owner_user_id=$2
          AND p.tenant_id IS NOT DISTINCT FROM l.tenant_id
      `,[param.data,owner]);
      if(!found.rows[0]) return res.status(404).json({message:"Pre-solicitud no encontrada"});
      if(["awaiting_details","identity_review"].includes(found.rows[0].status))
        return res.status(409).json({message:"Primero revisa identidad y datos de financiamiento"});
      const assessment=await evaluateProspectPreapplication(param.data,owner);
      return res.json({assessment});
    }catch{return res.status(503).json({message:"No fue posible realizar la evaluación"});}
  });
}
