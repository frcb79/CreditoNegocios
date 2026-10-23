import type { Express, Response } from "express";
import rateLimit from "express-rate-limit";
import multer from "multer";
import { createHash } from "node:crypto";
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
  files:2, fileSize:22_000_000, fields:1, fieldSize:2000
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
        "SELECT id, slug, version, name, product, channel, definition, published_at FROM public.commercial_resource_templates WHERE status = 'published' ORDER BY published_at DESC, name ASC LIMIT 200"
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
        "SELECT id, slug, version, name, product, channel, definition, status, created_at, published_at, retired_at FROM public.commercial_resource_templates ORDER BY created_at DESC LIMIT 300"
      );
      return res.json(result.rows);
    } catch (error) {
      console.error("[COM_RES] Admin templates list failed", error);
      return res.status(503).json({ message: "No fue posible cargar las plantillas" });
    }
  });

  const logoUpload=multer({ storage:multer.memoryStorage(),limits:{files:1,fileSize:1000000} });

  // These values are read only from authenticated database records, not editable
  // profileData approval flags or arbitrary client-provided URLs.
  app.get("/api/commercial-resources/my-approved-identity",isAuthenticated,async(req:any,res)=>{
    const user=await identify(req);
    if(!user||!SUGGEST_ROLES.has(user.role))return forbid(res);
    try {
      const result=await pool.query(`
        SELECT u.first_name,u.last_name,u.brand_name,u.profile_data,
          EXISTS(SELECT 1 FROM public.commercial_approved_logos al WHERE al.user_id=u.id) AS has_logo
        FROM public.users u WHERE u.id=$1 AND u.status='active'`,[user.id]);
      if(!result.rows.length)return forbid(res);
      const profile=result.rows[0].profile_data||{};
      const full=[result.rows[0].first_name,result.rows[0].last_name].filter(Boolean).join(" ");
      const displayName=user.role==="master_broker"
        ? (result.rows[0].brand_name||profile.business?.businessName||full)
        : (full||profile.business?.businessName||"");
      const whatsapp=String(profile.business?.businessPhone||profile.phone||"");
      return res.json({displayName,whatsapp,approvedLogoUrl:result.rows[0].has_logo?
        "/api/commercial-resources/my-approved-logo":null});
    } catch(error) {
      console.error("[COM_RES] Approved identity read failed",error);
      return res.status(503).json({message:"Identidad comercial no disponible"});
    }
  });
  app.get("/api/commercial-resources/my-approved-logo",isAuthenticated,async(req:any,res)=>{
    const user=await identify(req);
    if(!user||!SUGGEST_ROLES.has(user.role))return forbid(res);
    try {
      const row=await pool.query("SELECT image_data FROM public.commercial_approved_logos WHERE user_id=$1",[user.id]);
      if(row.rowCount!==1)return res.status(404).end();
      res.setHeader("Content-Type","image/png");
      res.setHeader("Cache-Control","private, no-store");
      res.setHeader("X-Content-Type-Options","nosniff");
      return res.end(row.rows[0].image_data);
    } catch(error){
      console.error("[COM_RES] Approved logo read failed",error);
      return res.status(503).end();
    }
  });
  app.get("/api/admin/commercial-resources/logo-candidates",isAuthenticated,async(req:any,res)=>{
    const user=await identify(req);
    if(user?.role!=="super_admin")return forbid(res);
    try {
      const row=await pool.query(`
        SELECT u.id,u.email,u.first_name,u.last_name,u.brand_name,u.role,
          a.approved_at IS NOT NULL AS logo_approved
        FROM public.users u LEFT JOIN public.commercial_approved_logos a ON a.user_id=u.id
        WHERE u.role IN ('broker','master_broker') AND u.status='active'
        ORDER BY u.first_name,u.last_name LIMIT 400`);
      return res.json(row.rows);
    }catch(error){console.error("[COM_RES] logo candidate list failed",error);return res.status(503).json({message:"No disponibles"});}
  });
  app.post("/api/admin/commercial-resources/approve-logo/:id",isAuthenticated,async(req:any,res,next)=>{
    const user=await identify(req);
    if(user?.role!=="super_admin")return forbid(res);
    logoUpload.single("logo")(req,res,(err:any)=>{
      if(err)return res.status(400).json({message:"PNG inválido o superior a 1 MB."});
      next();
    });
  },async(req:any,res)=>{
    const user=await identify(req);
    if(user?.role!=="super_admin")return forbid(res);
    const file=req.file as Express.Multer.File|undefined;
    const b=file?.buffer;
    if(!b||!file||b.length<50||b.length>1000000||
       b.subarray(0,8).toString("hex")!=="89504e470d0a1a0a"||
       b.toString("ascii",12,16)!=="IHDR"||
       b.toString("ascii",b.length-8,b.length-4)!=="IEND"){
      return res.status(400).json({message:"Se requiere un PNG íntegro para aprobación."});
    }
    const width=b.readUInt32BE(16),height=b.readUInt32BE(20);
    if(width<32||height<32||width>2048||height>2048){
      return res.status(400).json({message:"Logo fuera de dimensiones permitidas."});
    }
    try {
      const candidate=await pool.query(
        "SELECT id FROM public.users WHERE id=$1 AND role IN ('broker','master_broker') AND status='active'",
        [req.params.id]);
      if(candidate.rowCount!==1)return res.status(404).json({message:"Broker/Master no encontrado"});
      const hash=createHash("sha256").update(b).digest("hex");
      await pool.query(`
        INSERT INTO public.commercial_approved_logos (user_id,image_data,image_sha256,approved_by,approved_at)
        VALUES ($1,$2,$3,$4,NOW())
        ON CONFLICT(user_id) DO UPDATE SET image_data=EXCLUDED.image_data,
          image_sha256=EXCLUDED.image_sha256,approved_by=EXCLUDED.approved_by,approved_at=NOW()`,
        [req.params.id,b,hash,user.id]);
      return res.json({approved:true,sha256:hash});
    }catch(error){console.error("[COM_RES] logo approval failed",error);return res.status(503).json({message:"No se pudo aprobar logo"});}
  });
  app.delete("/api/admin/commercial-resources/approve-logo/:id",isAuthenticated,async(req:any,res)=>{
    const user=await identify(req);
    if(user?.role!=="super_admin")return forbid(res);
    try {
      await pool.query("DELETE FROM public.commercial_approved_logos WHERE user_id=$1",[req.params.id]);
      return res.json({approved:false});
    }catch(error){console.error("[COM_RES] logo revocation failed",error);return res.status(503).json({message:"No se pudo retirar logo"});}
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
          ?"03_Impactantes_y_Sobrias_Anteriores/26_Variantes_Anteriores/"
          :parsed.canvas?.height===1080?"04_Formato_Cuadrado_1x1/"
          :parsed.canvas?.height===1920?"05_Formato_Vertical_9x16/"
          :"01_Impactantes_Explicativas_NUEVAS/";
        entries=[normalizeV4Map(map.buffer,image.buffer,group)];
      } else return res.status(400).json({message:"Carga un ZIP V4 o un par mapa JSON + PNG maestro."});
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
          imported.push({slug:input.slug,id:existing.rows[0].id,version:existing.rows[0].version,result:"already_exists"});
          continue;
        }
        const v=await client.query(
          "SELECT COALESCE(MAX(version),0)+1 AS version FROM public.commercial_resource_templates WHERE slug=$1",
          [input.slug]
        );
        const row=await client.query(
          `INSERT INTO public.commercial_resource_templates
          (slug,version,name,product,channel,definition,status,created_by)
          VALUES ($1,$2,$3,$4,$5,$6::jsonb,'draft',$7) RETURNING id,version`,
          [input.slug,Number(v.rows[0].version),input.name,input.product,input.channel,JSON.stringify(input.definition),user.id]
        );
        await client.query(
          `INSERT INTO public.commercial_resource_artworks(template_id,image_data,sha256,width,height)
           VALUES ($1,$2,$3,$4,$5)`,
          [row.rows[0].id,item.png,item.graphic.sha256,item.graphic.canvas.width,item.graphic.canvas.height]
        );
        imported.push({slug:input.slug,id:row.rows[0].id,version:row.rows[0].version,
          result:"draft",typographyReviewRequired:item.graphic.typographyReviewRequired});
      }
      await client.query("COMMIT");
      return res.status(201).json({message:"Importación privada finalizada. Ningún material fue publicado.",
        scanned:entries.length,created:imported.filter(x=>x.result==="draft").length,
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
