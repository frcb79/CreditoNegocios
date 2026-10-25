import { randomUUID } from "node:crypto";
import type { Express, Response } from "express";
import rateLimit from "express-rate-limit";
import multer from "multer";
import { validateCommercialLogoPng } from "./commercialProfileLogoValidation";
import { normalizeV4Map, parseV4Archive, type GraphicImport } from "./commercialGraphicImporter";
import { pool } from "./db";
import { storage } from "./storage";
import { isAuthenticated } from "./auth";
import {
  commercialResourceUploadSchema, commercialSuggestionSchema,
  type CommercialResourceUpload,
} from "../shared/commercialResourceDefinition";

const READ_ROLES = new Set(["broker", "master_broker", "admin", "super_admin"]);
const SUGGEST_ROLES = new Set(["broker", "master_broker"]);

type Identity = { id: string; role: string };

async function identify(req: any): Promise<Identity | null> {
  const id = req.user?.claims?.sub || req.user?.id || req.dbUser?.id;
  if (typeof id !== "string" || !id) return null;
  const user = await storage.getUser(id);
  if (!user || user.isActive === false || (user.status && user.status !== "active") || !READ_ROLES.has(user.role)) return null;
  return { id: user.id, role: user.role };
}

function forbid(res: Response) {
  return res.status(403).json({ message: "Acceso no autorizado" });
}

const artworkUpload = multer({storage:multer.memoryStorage(), limits:{
  files:2, fileSize:50 * 1024 * 1024, fields:1, fieldSize:2000
}});
const artworkUploadLimit = rateLimit({
  windowMs:15*60*1000, limit:12, standardHeaders:"draft-7", legacyHeaders:false
});
function graphicJson(input:GraphicImport) {
 return {
  slug:input.slug, name:input.name, product:input.product, channel:input.channel,
  definition:{
    layout:"minimal", hero:"none",
    colors:{background:"#0B2F4B",accent:"#A8E4E8",foreground:"#FFFFFF"},
    headline:input.copy.headline,
    supportingLine:input.copy.supportingLine,
    description:input.copy.description,
    hook:input.copy.hook,
    cta:input.copy.cta,
    highlights:input.copy.highlights,
    allowedIdentityFields:{displayName:true,whatsapp:true,institutionalLogo:true},
    graphic:input.graphic
  }
 };
}

const suggestionsRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 6,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Has enviado demasiadas sugerencias. Intenta más tarde." }
});

/**
 * Security invariants:
 * - All writes of templates/publication are strictly Super Admin.
 * - Broker/master cannot access drafts or suggestions from others.
 * - No endpoint to alter published copy, upload binary media or edit suggestions.
 * - Published versions are immutable. Replace by creating a new version.
 * - No suggestion workflow status, assignment or moderation.
 */
export function registerCommercialResourceRoutes(app: Express) {
  app.get("/api/commercial-resources/templates", isAuthenticated, async (req: any, res) => {
    const user = await identify(req);
    if (!user) return forbid(res);
    try {
      const result = await pool.query(
        `SELECT t.id, t.slug, t.version, t.name, t.product, t.channel, t.definition,
                t.published_at, e.style, c.topic, c.leasing_subtype
         FROM public.commercial_resource_templates t
         LEFT JOIN public.commercial_resource_styles e ON e.template_id=t.id
         LEFT JOIN public.commercial_resource_topics c ON c.template_id=t.id
         WHERE t.status='published'
         ORDER BY t.published_at DESC, t.name ASC LIMIT 1000`
      );
      return res.json(result.rows);
    } catch (error) {
      console.error("[COM_RES] Published catalog read failed", error);
      return res.status(503).json({ message: "Catálogo de recursos no disponible" });
    }
  });

  app.get("/api/admin/commercial-resources/templates", isAuthenticated, async (req: any, res) => {
    const user = await identify(req);
    if (user?.role !== "super_admin") return forbid(res);
    try {
      const result = await pool.query(
        `SELECT t.id,t.slug,t.version,t.name,t.product,t.channel,t.definition,
                t.status,t.created_at,t.published_at,t.retired_at,t.import_batch_id,e.style,c.topic,c.leasing_subtype
         FROM public.commercial_resource_templates t
         LEFT JOIN public.commercial_resource_styles e ON e.template_id=t.id
         LEFT JOIN public.commercial_resource_topics c ON c.template_id=t.id
         ORDER BY t.created_at DESC LIMIT 2000`
      );
      return res.json(result.rows);
    } catch (error) {
      console.error("[COM_RES] Admin templates list failed", error);
      return res.status(503).json({ message: "No fue posible cargar las plantillas" });
    }
  });

  // Editorial style is metadata only. The artwork and published copy are immutable.
  app.post("/api/admin/commercial-resources/templates/:id/style",isAuthenticated,async(req:any,res)=>{
    const user=await identify(req);
    if(user?.role!=="super_admin")return forbid(res);
    const id=String(req.params.id||"");
    const style=req.body?.style;
    const allowed=["llamativo","explicativo","institucional","promocional","informativo",null];
    if(!id || !req.body || Object.keys(req.body).length!==1 ||
      !allowed.includes(style))return res.status(400).json({message:"Categoría inválida"});
    try {
      const exists=await pool.query(
        "SELECT id FROM public.commercial_resource_templates WHERE id=$1",[id]);
      if(exists.rowCount!==1)return res.status(404).json({message:"Plantilla no encontrada"});
      if(style===null){
        await pool.query("DELETE FROM public.commercial_resource_styles WHERE template_id=$1",[id]);
      } else {
        await pool.query(`
          INSERT INTO public.commercial_resource_styles(template_id,style,set_by,updated_at)
          VALUES($1,$2,$3,NOW()) ON CONFLICT(template_id)
          DO UPDATE SET style=EXCLUDED.style,set_by=EXCLUDED.set_by,updated_at=NOW()`,
          [id,style,user.id]);
      }
      return res.json({id,style});
    }catch(error){
      console.error("[COM_RES] Editorial style write failed",error);
      return res.status(503).json({message:"No se pudo guardar la categoría"});
    }
  });

  const logoUpload = multer({
    storage: multer.memoryStorage(), limits: { files: 1, fileSize: 1_000_000, fields: 0 }
  });

  // Commercial identity remains server-derived. A profile photo, legacy
  // customLogo and manually approved logo do not opt a user into marketing.
  app.get("/api/commercial-resources/my-approved-identity", isAuthenticated, async(req:any,res)=>{
    const user=await identify(req);
    if(!user || !SUGGEST_ROLES.has(user.role)) return forbid(res);
    try {
      const result=await pool.query(`
        SELECT u.first_name,u.last_name,u.brand_name,u.profile_data,
               l.image_sha256 AS logo_sha
        FROM public.users u
        LEFT JOIN public.commercial_profile_logos l ON l.user_id=u.id
        WHERE u.id=$1 AND u.status='active'`,[user.id]);
      if(result.rowCount!==1)return forbid(res);
      const record=result.rows[0], profile=record.profile_data||{};
      const full=[record.first_name,record.last_name].filter(Boolean).join(" ");
      const displayName=user.role==="master_broker"
        ? (record.brand_name||profile.business?.businessName||full)
        : (full||profile.business?.businessName||"");
      const whatsapp=String(profile.business?.businessPhone||profile.phone||"");
      return res.json({
        displayName, whatsapp,
        approvedLogoUrl:record.logo_sha
          ? "/api/commercial-resources/my-approved-logo?v="+record.logo_sha.slice(0,16)
          : null
      });
    }catch(error){
      console.error("[COM_RES] Commercial identity read failed",error);
      return res.status(503).json({message:"Identidad comercial no disponible"});
    }
  });

  app.get("/api/commercial-resources/my-approved-logo",isAuthenticated,async(req:any,res)=>{
    const user=await identify(req);
    if(!user||!SUGGEST_ROLES.has(user.role))return forbid(res);
    try {
      const result=await pool.query(
        "SELECT image_data FROM public.commercial_profile_logos WHERE user_id=$1",[user.id]);
      if(result.rowCount!==1)return res.status(404).end();
      res.setHeader("Content-Type","image/png");
      res.setHeader("Cache-Control","private, no-store");
      res.setHeader("X-Content-Type-Options","nosniff");
      return res.end(result.rows[0].image_data);
    }catch(error){
      console.error("[COM_RES] Own commercial logo read failed",error);
      return res.status(503).end();
    }
  });

  // Opt-in by the owner; never allow a client-chosen userId or admin bypass.
  app.post("/api/commercial-resources/my-logo",isAuthenticated,async(req:any,res,next)=>{
    const user=await identify(req);
    if(!user||!SUGGEST_ROLES.has(user.role))return forbid(res);
    logoUpload.single("logo")(req,res,(err:any)=>{
      if(err)return res.status(400).json({message:"El logo debe ser PNG de máximo 1 MB."});
      next();
    });
  },async(req:any,res)=>{
    const user=await identify(req);
    if(!user||!SUGGEST_ROLES.has(user.role))return forbid(res);
    const file=req.file as Express.Multer.File|undefined;
    if(!file||file.mimetype!=="image/png"||
       !file.originalname.toLowerCase().endsWith(".png")) {
      return res.status(400).json({message:"Selecciona un archivo PNG válido."});
    }
    let valid;
    try { valid=validateCommercialLogoPng(file.buffer); }
    catch(err:any){return res.status(400).json({message:err.message||"PNG no compatible."});}
    try {
      await pool.query(`
        INSERT INTO public.commercial_profile_logos(user_id,image_data,image_sha256,updated_at)
        VALUES($1,$2,$3,NOW())
        ON CONFLICT(user_id) DO UPDATE SET image_data=EXCLUDED.image_data,
          image_sha256=EXCLUDED.image_sha256,updated_at=NOW()`,
        [user.id,valid.png,valid.sha256]);
      return res.json({stored:true,sha256:valid.sha256,width:valid.width,height:valid.height});
    }catch(error){
      console.error("[COM_RES] Self-managed commercial logo write failed",error);
      return res.status(503).json({message:"No se pudo guardar el logo."});
    }
  });

  app.delete("/api/commercial-resources/my-logo",isAuthenticated,async(req:any,res)=>{
    const user=await identify(req);
    if(!user||!SUGGEST_ROLES.has(user.role))return forbid(res);
    try {
      await pool.query("DELETE FROM public.commercial_profile_logos WHERE user_id=$1",[user.id]);
      return res.json({stored:false});
    }catch(error){
      console.error("[COM_RES] Own commercial logo removal failed",error);
      return res.status(503).json({message:"No se pudo retirar el logo."});
    }
  });

  // Artworks are never public while the corresponding version remains a draft.
  // Browser image loading uses the authenticated same-origin session.
  app.get("/api/commercial-resources/templates/:id/art", isAuthenticated, async (req: any, res) => {
    const user=await identify(req);
    if(!user)return forbid(res);
    try {
      const row=await pool.query(
        `SELECT a.image_data,a.sha256 FROM public.commercial_resource_artworks a
         JOIN public.commercial_resource_templates t ON t.id=a.template_id
         WHERE t.id=$1 AND (t.status='published' OR $2='super_admin')`,
        [req.params.id,user.role]
      );
      if(row.rowCount!==1)return res.status(404).json({message:"Arte no disponible"});
      res.setHeader("Content-Type","image/png");
      res.setHeader("Cache-Control","private, no-store");
      res.setHeader("X-Content-Type-Options","nosniff");
      return res.end(row.rows[0].image_data);
    } catch(error) {
      console.error("[COM_RES] Artwork read failed",error);
      return res.status(503).json({message:"Arte no disponible"});
    }
  });

  // COM-RES private PNG transport: JSON POST deliberately bypasses third-party
  // image URL fetchers that strip SameSite session cookies (HTTP 401 observed).
  // NEVER expose drafts anonymously or place binary artwork in catalog lists.
  app.post("/api/commercial-resources/private-artwork-data",isAuthenticated,async(req:any,res)=>{
    const user=await identify(req);
    if(!user)return forbid(res);
    const payload=req.body;
    const isLogo=payload?.myLogo===true && Object.keys(payload).length===1;
    const id=payload?.templateId;
    const isTemplate=typeof id==="string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) &&
      Object.keys(payload).length===1;
    if(!payload||typeof payload!=="object"||Array.isArray(payload)||(!isLogo&&!isTemplate)){
      return res.status(400).json({message:"Solicitud de imagen inválida"});
    }
    try {
      let png:Buffer;
      if(isLogo){
        if(user.role!=="broker"&&user.role!=="master_broker")return forbid(res);
        const found=await pool.query(
          "SELECT image_data FROM public.commercial_profile_logos WHERE user_id=$1",[user.id]);
        if(found.rowCount!==1)return res.status(404).json({message:"Logotipo no disponible"});
        png=found.rows[0].image_data;
      }else{
        const found=await pool.query(`
          SELECT a.image_data FROM public.commercial_resource_artworks a
          JOIN public.commercial_resource_templates t ON t.id=a.template_id
          WHERE t.id=$1 AND (t.status='published' OR $2='super_admin')`,
          [id,user.role]);
        if(found.rowCount!==1)return res.status(404).json({message:"Arte no disponible"});
        png=found.rows[0].image_data;
      }
      if(!Buffer.isBuffer(png)||png.length<40||png.length>3_000_000){
        return res.status(503).json({message:"Imagen guardada no válida"});
      }
      res.setHeader("Content-Type","application/json; charset=utf-8");
      res.setHeader("Cache-Control","private, no-store, max-age=0");
      res.setHeader("Pragma","no-cache");
      res.setHeader("Vary","Cookie");
      res.setHeader("X-Content-Type-Options","nosniff");
      // Bypass the generic res.json audit serializer: never log raw image bytes.
      return res.status(200).end(JSON.stringify({mimeType:"image/png",pngBase64:png.toString("base64")}));
    }catch(error){
      console.error("[COM_RES] Private artwork JSON delivery failed",error);
      return res.status(503).json({message:"No se pudo entregar la imagen privada"});
    }
  });

  // No public endpoint accepts artwork. All versions are imported as drafts.
  // Bundle import is transactional: all valid artworks or none.
  app.post("/api/admin/commercial-resources/graphic-import",isAuthenticated,artworkUploadLimit,async(req:any,res,next)=>{
    const user=await identify(req);
    if(user?.role!=="super_admin")return forbid(res);
    artworkUpload.any()(req,res,(err:any)=>{
      if(err)return res.status(400).json({message:"Archivo rechazado: "+(err.message||"límite excedido")});
      next();
    });
  },async(req:any,res)=>{
    const user=await identify(req);
    if(user?.role!=="super_admin")return forbid(res);
    const files=(req.files||[]) as Express.Multer.File[];
    let entries:GraphicImport[];
    try {
      if(files.length===1 && files[0].fieldname==="archive" &&
        (files[0].mimetype==="application/zip"||files[0].originalname.toLowerCase().endsWith(".zip"))) {
        entries=parseV4Archive(files[0].buffer);
      } else if(files.length===2 && files.some(f=>f.fieldname==="map") &&
                files.some(f=>f.fieldname==="background")) {
        const map=files.find(f=>f.fieldname==="map")!;
        const image=files.find(f=>f.fieldname==="background")!;
        if(map.size>32_000 || image.size>3_000_000)throw new Error("Mapa o PNG demasiado grande.");
        // The single-import folder is inferred from the map contract and
        // checked again inside normalizeV4Map.
        const parsed=JSON.parse(map.buffer.toString("utf8").replace(/^\uFEFF/,""));
        const group=parsed.schemaVersion==="cn-graphic-overlay/v1"
          ?"ARTES_Y_MAPAS/03_Impactantes_y_Sobrias_Anteriores/26_Variantes_Anteriores/"
          :parsed.canvas?.height===1080?"ARTES_Y_MAPAS/04_Formato_Cuadrado_1x1/"
          :parsed.canvas?.height===1920?"ARTES_Y_MAPAS/05_Formato_Vertical_9x16/"
          :"ARTES_Y_MAPAS/01_Impactantes_Explicativas_NUEVAS/";
        entries=[normalizeV4Map(map.buffer,image.buffer,group)];
      } else return res.status(400).json({message:"Carga un ZIP del lote o un par mapa JSON + PNG maestro."});
      if(entries.length>65)throw new Error("Demasiadas plantillas.");
      const slugs=new Set<string>();
      for(const item of entries) {
        if(slugs.has(item.slug))throw new Error("Identificador duplicado.");
        slugs.add(item.slug);
        const valid=commercialResourceUploadSchema.safeParse(graphicJson(item));
        if(!valid.success)throw new Error(item.slug+": "+valid.error.issues[0]?.message);
      }
    }catch(error:any){
      return res.status(400).json({message:"Paquete rechazado sin guardar borradores",detail:error.message});
    }
    const client=await pool.connect();
    const batchId=randomUUID();
    const imported:any[]=[];
    try {
      await client.query("BEGIN");
      for(const item of entries) {
        const input=commercialResourceUploadSchema.parse(graphicJson(item));
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",["resources:"+input.slug]);
        const existing=await client.query(
          `SELECT t.id,t.version FROM public.commercial_resource_templates t
           JOIN public.commercial_resource_artworks a ON a.template_id=t.id
           WHERE t.slug=$1 AND a.sha256=$2 AND t.definition=$3::jsonb
           ORDER BY t.version DESC LIMIT 1`,[input.slug,item.graphic.sha256,JSON.stringify(input.definition)]
        );
        if(existing.rows.length){
          // A reimport does not reclassify already approved or retired content.
          // An identical draft may receive its newly supplied metadata.
          if(item.catalog) {
            const draft=await client.query(
              "SELECT status FROM public.commercial_resource_templates WHERE id=$1 FOR UPDATE",
              [existing.rows[0].id]);
            if(draft.rows[0]?.status==="draft") {
              await client.query(`INSERT INTO public.commercial_resource_styles(template_id,style,set_by)
                VALUES($1,$2,$3) ON CONFLICT(template_id) DO UPDATE SET
                style=EXCLUDED.style,set_by=EXCLUDED.set_by,updated_at=NOW()`,
                [existing.rows[0].id,item.catalog.style,user.id]);
              await client.query(`INSERT INTO public.commercial_resource_topics(template_id,topic,leasing_subtype,set_by)
                VALUES($1,$2,$3,$4) ON CONFLICT(template_id) DO UPDATE SET
                topic=EXCLUDED.topic,leasing_subtype=EXCLUDED.leasing_subtype,
                set_by=EXCLUDED.set_by,updated_at=NOW()`,
                [existing.rows[0].id,item.catalog.topic,item.catalog.leasingSubtype||null,user.id]);
            }
          }
          imported.push({slug:input.slug,id:existing.rows[0].id,version:existing.rows[0].version,result:"already_exists"});
          continue;
        }
        const v=await client.query(
          "SELECT COALESCE(MAX(version),0)+1 AS version FROM public.commercial_resource_templates WHERE slug=$1",
          [input.slug]
        );
        const row=await client.query(
          `INSERT INTO public.commercial_resource_templates
          (slug,version,name,product,channel,definition,status,created_by,import_batch_id)
          VALUES ($1,$2,$3,$4,$5,$6::jsonb,'draft',$7,$8) RETURNING id,version`,
          [input.slug,Number(v.rows[0].version),input.name,input.product,input.channel,JSON.stringify(input.definition),user.id,batchId]
        );
        await client.query(
          `INSERT INTO public.commercial_resource_artworks(template_id,image_data,sha256,width,height)
           VALUES ($1,$2,$3,$4,$5)`,
          [row.rows[0].id,item.png,item.graphic.sha256,item.graphic.canvas.width,item.graphic.canvas.height]
        );
        if(item.catalog) {
          await client.query(`INSERT INTO public.commercial_resource_styles(template_id,style,set_by)
             VALUES($1,$2,$3) ON CONFLICT(template_id) DO UPDATE SET
             style=EXCLUDED.style,set_by=EXCLUDED.set_by,updated_at=NOW()`,
             [row.rows[0].id,item.catalog.style,user.id]);
          await client.query(`INSERT INTO public.commercial_resource_topics(template_id,topic,leasing_subtype,set_by)
             VALUES($1,$2,$3,$4) ON CONFLICT(template_id) DO UPDATE SET
             topic=EXCLUDED.topic,leasing_subtype=EXCLUDED.leasing_subtype,
             set_by=EXCLUDED.set_by,updated_at=NOW()`,
             [row.rows[0].id,item.catalog.topic,item.catalog.leasingSubtype||null,user.id]);
        }
        imported.push({slug:input.slug,id:row.rows[0].id,version:row.rows[0].version,
          result:"draft",typographyReviewRequired:item.graphic.typographyReviewRequired});
      }
      await client.query("COMMIT");
      return res.status(201).json({message:"Importación privada finalizada. Ningún material fue publicado.",
        batchId,scanned:entries.length,created:imported.filter(x=>x.result==="draft").length,
        existing:imported.filter(x=>x.result==="already_exists").length,
        requiresTypographyReview:imported.filter(x=>x.typographyReviewRequired).length,
        items:imported});
    }catch(error){
      await client.query("ROLLBACK");
      console.error("[COM_RES] Atomic artwork import failed",error);
      return res.status(503).json({message:"Falló importación: todos los cambios se revirtieron"});
    }finally{client.release();}
  });

  app.post("/api/admin/commercial-resources/templates", isAuthenticated, async (req: any, res) => {
    const user = await identify(req);
    if (user?.role !== "super_admin") return forbid(res);
    if (JSON.stringify(req.body ?? {}).length > 32_000) {
      return res.status(413).json({ message: "La plantilla excede el límite de 32 KB" });
    }
    const parsed = commercialResourceUploadSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Plantilla inválida", detail: parsed.error.issues[0]?.message });
    const input: CommercialResourceUpload = parsed.data;
    if (input.definition.graphic) return res.status(400).json({ message: "Para archivos gráficos utiliza el importador PNG + mapa autorizado." });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["resources:" + input.slug]);
      const num = await client.query(
        "SELECT COALESCE(MAX(version),0)+1 AS version FROM public.commercial_resource_templates WHERE slug=$1",
        [input.slug]
      );
      const version = Number(num.rows[0]?.version || 1);
      const created = await client.query(
        "INSERT INTO public.commercial_resource_templates (slug,version,name,product,channel,definition,status,created_by) VALUES ($1,$2,$3,$4,$5,$6::jsonb,'draft',$7) RETURNING id,slug,version,name,product,channel,definition,status,created_at",
        [input.slug, version, input.name, input.product, input.channel, JSON.stringify(input.definition), user.id]
      );
      await client.query("COMMIT");
      return res.status(201).json(created.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("[COM_RES] Template draft create failed", error);
      return res.status(500).json({ message: "No se pudo guardar la plantilla" });
    } finally {
      client.release();
    }
  });

  // Atomic deletion of unpublished mistakes only. A referenced, published or
  // retired version is never deletable; there is no cascading historical loss.
  app.post("/api/admin/commercial-resources/drafts/delete",isAuthenticated,async(req:any,res)=>{
    const user=await identify(req);
    if(user?.role!=="super_admin")return forbid(res);
    const ids=req.body?.ids;
    if(!req.body||Object.keys(req.body).length!==1||!Array.isArray(ids)||
      ids.length<1||ids.length>200||new Set(ids).size!==ids.length||
      !ids.every((id:unknown)=>typeof id==="string"&&/^[a-f0-9-]{36}$/i.test(id))) {
      return res.status(400).json({message:"Selecciona de 1 a 200 borradores válidos sin duplicados."});
    }
    const client=await pool.connect();
    try{
      await client.query("BEGIN");
      // Lock in stable order, identical to publish/import advisory lock order.
      const slugs=await client.query(
        "SELECT DISTINCT slug FROM public.commercial_resource_templates WHERE id=ANY($1::varchar[]) ORDER BY slug",
        [ids]);
      if(slugs.rowCount===0){
        await client.query("ROLLBACK");
        return res.status(404).json({message:"No se encontraron los borradores."});
      }
      for(const row of slugs.rows){
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",["resources:"+row.slug]);
      }
      const selected=await client.query(
        "SELECT id,status FROM public.commercial_resource_templates WHERE id=ANY($1::varchar[]) ORDER BY id FOR UPDATE",
        [ids]);
      if(selected.rowCount!==ids.length||selected.rows.some(row=>row.status!=="draft")){
        await client.query("ROLLBACK");
        return res.status(409).json({message:"Solo se pueden eliminar borradores existentes. Las publicaciones e históricos están protegidos."});
      }
      // Explicit guard before RESTRICT FKs (which remain a second defense).
      const links=await client.query(
        "SELECT COUNT(*)::int AS count FROM public.commercial_campaign_links WHERE template_id=ANY($1::varchar[])",[ids]);
      const leads=await client.query(
        "SELECT COUNT(*)::int AS count FROM public.commercial_marketing_leads WHERE template_id=ANY($1::varchar[])",[ids]);
      if(links.rows[0].count>0||leads.rows[0].count>0){
        await client.query("ROLLBACK");
        return res.status(409).json({message:"Hay plantillas vinculadas a campañas o prospectos. No se pueden borrar."});
      }
      await client.query("DELETE FROM public.commercial_resource_topics WHERE template_id=ANY($1::varchar[])",[ids]);
      await client.query("DELETE FROM public.commercial_resource_styles WHERE template_id=ANY($1::varchar[])",[ids]);
      await client.query("DELETE FROM public.commercial_resource_artworks WHERE template_id=ANY($1::varchar[])",[ids]);
      const deleted=await client.query(
        "DELETE FROM public.commercial_resource_templates WHERE id=ANY($1::varchar[]) AND status='draft' RETURNING id",
        [ids]);
      if(deleted.rowCount!==ids.length)throw new Error("Eliminación incompleta");
      await client.query("COMMIT");
      return res.json({deleted:deleted.rowCount,ids:deleted.rows.map(row=>row.id)});
    }catch(error){
      await client.query("ROLLBACK");
      console.error("[COM_RES] Atomic draft deletion failed",error);
      return res.status(503).json({message:"No se pudieron eliminar los borradores. No se modificó el lote."});
    }finally{client.release();}
  });

  app.post("/api/admin/commercial-resources/templates/:id/publish", isAuthenticated, async (req: any, res) => {
    const user = await identify(req);
    if (user?.role !== "super_admin") return forbid(res);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // Serialize publication per slug and prevent concurrent double-publish.
      const found = await client.query("SELECT id,slug,status FROM public.commercial_resource_templates WHERE id=$1", [req.params.id]);
      if (found.rowCount !== 1 || found.rows[0].status !== "draft") {
        await client.query("ROLLBACK");
        return res.status(409).json({ message: "Solo puede publicarse una versión en borrador" });
      }
      const artwork = await client.query(
        `SELECT t.definition,a.template_id FROM public.commercial_resource_templates t
         LEFT JOIN public.commercial_resource_artworks a ON a.template_id=t.id WHERE t.id=$1`,
        [req.params.id]
      );
      const graphic=artwork.rows[0]?.definition?.graphic;
      if (graphic) {
        if (!artwork.rows[0]?.template_id || graphic.typographyReviewRequired ||
            req.body?.editorialLegalApproved !== true) {
          await client.query("ROLLBACK");
          return res.status(409).json({ message: "Arte aún en revisión: requiere PNG íntegro, tipografía confirmada y aprobación comercial/legal explícita." });
        }
      }
      const slug: string = found.rows[0].slug;
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["resources:" + slug]);
      const current = await client.query("SELECT id,status FROM public.commercial_resource_templates WHERE id=$1 FOR UPDATE", [req.params.id]);
      if (current.rows[0]?.status !== "draft") {
        await client.query("ROLLBACK");
        return res.status(409).json({ message: "La plantilla ya cambió de estado" });
      }
      await client.query(
        "UPDATE public.commercial_resource_templates SET status='retired',retired_at=NOW() WHERE slug=$1 AND status='published'",
        [slug]
      );
      const result = await client.query(
        "UPDATE public.commercial_resource_templates SET status='published',published_by=$2,published_at=NOW() WHERE id=$1 AND status='draft' RETURNING id,slug,version,status,published_at",
        [req.params.id, user.id]
      );
      await client.query("COMMIT");
      return res.json(result.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("[COM_RES] Publish failed", error);
      return res.status(500).json({ message: "No se pudo publicar la plantilla" });
    } finally {
      client.release();
    }
  });

  app.post("/api/admin/commercial-resources/templates/:id/retire", isAuthenticated, async (req: any, res) => {
    const user = await identify(req);
    if (user?.role !== "super_admin") return forbid(res);
    try {
      const result = await pool.query(
        "UPDATE public.commercial_resource_templates SET status='retired',retired_at=NOW() WHERE id=$1 AND status='published' RETURNING id,status",
        [req.params.id]
      );
      if (result.rowCount !== 1) return res.status(409).json({ message: "Solo puede retirarse una plantilla publicada" });
      return res.json(result.rows[0]);
    } catch (error) {
      console.error("[COM_RES] Retire failed", error);
      return res.status(500).json({ message: "No se pudo retirar la plantilla" });
    }
  });

  app.post("/api/commercial-resources/suggestions", isAuthenticated, suggestionsRateLimit, async (req: any, res) => {
    const user = await identify(req);
    if (!user || !SUGGEST_ROLES.has(user.role)) return forbid(res);
    const parsed = commercialSuggestionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message || "Sugerencia inválida" });
    try {
      const count = await pool.query(
        "SELECT COUNT(*)::int AS n FROM public.commercial_resource_suggestions WHERE user_id=$1 AND created_at>NOW()-INTERVAL '24 hours'",
        [user.id]
      );
      if (Number(count.rows[0]?.n || 0) >= 12) return res.status(429).json({ message: "Límite de sugerencias alcanzado por hoy" });
      const memberships = await storage.getTenantMembersByUser(user.id);
      const tenantId = memberships.find(member => member.isActive)?.tenantId || null;
      await pool.query(
        "INSERT INTO public.commercial_resource_suggestions (user_id,tenant_id,product,channel,suggestion) VALUES ($1,$2,$3,$4,$5)",
        [user.id, tenantId, parsed.data.product || null, parsed.data.channel || null, parsed.data.suggestion]
      );
      return res.status(201).json({ message: "Sugerencia enviada" });
    } catch (error) {
      console.error("[COM_RES] Suggestion creation failed", error);
      return res.status(500).json({ message: "No fue posible recibir tu sugerencia" });
    }
  });

  app.get("/api/admin/commercial-resources/suggestions", isAuthenticated, async (req: any, res) => {
    const user = await identify(req);
    if (user?.role !== "super_admin") return forbid(res);
    try {
      const result = await pool.query(
        "SELECT s.id, s.user_id, s.tenant_id, s.product, s.channel, s.suggestion, s.created_at, u.first_name, u.last_name FROM public.commercial_resource_suggestions s JOIN public.users u ON u.id=s.user_id ORDER BY s.created_at DESC LIMIT 300"
      );
      return res.json(result.rows);
    } catch (error) {
      console.error("[COM_RES] Suggestion inbox failed", error);
      return res.status(503).json({ message: "No fue posible cargar las sugerencias" });
    }
  });
}
