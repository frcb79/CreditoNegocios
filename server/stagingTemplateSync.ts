import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";

/** Controlled staging-only catalog metadata reconciliation. Never receives
 * a production connection. All DML is transactional; dry run rolls back. */
type Row=Record<string,any>;
function norm(x:unknown):string {
  return String(x??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim()
    .toLowerCase().replace(/\s+/g," ");
}
function unique(rows:Row[],key:(x:Row)=>string,kind:string):Map<string,Row>{
  const map=new Map<string,Row>();
  for(const r of rows) {
    const k=key(r);if(!k||map.has(k))throw Error("STAGING_META_DUPLICATE_"+kind);
    map.set(k,r);
  }
  return map;
}
function envData():{templates:Row[];variables:Row[]}|null{
  const countRaw=process.env.STAGING_TEMPLATE_SYNC_CHUNKS;
  if(!countRaw)return null;
  const n=Number(countRaw);
  if(!Number.isSafeInteger(n)||n<1||n>20)throw Error("STAGING_META_INVALID_CHUNKS");
  let raw="";
  for(let i=0;i<n;i++) {
    const chunk=process.env["STAGING_TEMPLATE_SYNC_CHUNK_"+String(i).padStart(3,"0")];
    if(!chunk)throw Error("STAGING_META_MISSING_CHUNK");
    raw+=chunk;
  }
  if(createHash("md5").update(raw).digest("hex")!==process.env.STAGING_TEMPLATE_SYNC_MD5)
    throw Error("STAGING_META_SOURCE_CHECKSUM");
  const p=JSON.parse(raw);
  if(p.kind!=="CATALOG_TEMPLATE_REFERENCE" || !Array.isArray(p.templates) ||
     !Array.isArray(p.variables)||p.templates.length!==12||p.variables.length!==10)
    throw Error("STAGING_META_SOURCE_COUNTS");
  unique(p.templates,(t:Row)=>norm(t.name),"SOURCE_TEMPLATES");
  unique(p.variables,(v:Row)=>norm(v.name),"SOURCE_VARIABLES");
  return p;
}
function remapVariableIds(data:any,ids:Map<string,string>):any{
  if(Array.isArray(data))return data.map(x=>remapVariableIds(x,ids));
  if(data!==null&&typeof data==="object") {
    const out:Row={};
    for(const [key,value] of Object.entries(data)) {
      const replacement=ids.get(key)||key;
      if(Object.prototype.hasOwnProperty.call(out,replacement))
        throw Error("STAGING_META_DUPLICATE_MAPPED_VARIABLE");
      out[replacement]=remapVariableIds(value,ids);
    }
    return out;
  }
  return typeof data==="string"?(ids.get(data)||data):data;
}
async function sync(client:PoolClient,source:{templates:Row[];variables:Row[]},apply:boolean) {
  const stagingVars=(await client.query("SELECT id,name FROM public.product_variables ORDER BY name")).rows;
  const stagingTemplates=(await client.query("SELECT id,name FROM public.product_templates ORDER BY name")).rows;
  const stageVarByName=unique(stagingVars,x=>norm(x.name),"STAGE_VARIABLES");
  const stageTemplateByName=unique(stagingTemplates,x=>norm(x.name),"STAGE_TEMPLATES");
  const offers=await client.query(
    "SELECT count(*)::int total,count(*) FILTER (WHERE p.status='published')::int published "+
    "FROM public.institution_products p"
  );
  const versionCounts=await client.query(
    "SELECT count(*)::int total,count(*) FILTER (WHERE status='published')::int published "+
    "FROM public.institution_product_versions"
  );
  const initial={templates:stagingTemplates.length,variables:stagingVars.length,
    offers:offers.rows[0],versions:versionCounts.rows[0]};
  if(initial.templates!==13||initial.variables!==3||initial.offers.published!==52||
    initial.versions.total!==54||initial.versions.published!==52)
    throw Error("STAGING_META_STAGE_DRIFT");
  const admin=await client.query(
    "SELECT id FROM public.users WHERE role='super_admin' ORDER BY id LIMIT 1"
  );
  if(admin.rows.length!==1)throw Error("STAGING_META_ADMIN_MISSING");
  const adminId=admin.rows[0].id;
  const variableIds=new Map<string,string>();
  for(const v of source.variables) {
    const current=stageVarByName.get(norm(v.name));
    variableIds.set(v.id,current?.id||randomUUID());
  }
  const missingVariables=source.variables.filter(v=>!stageVarByName.has(norm(v.name)));
  const missingTemplates=source.templates.filter(t=>!stageTemplateByName.has(norm(t.name)));
  console.info("[STAGING-META-PREFLIGHT] "+JSON.stringify({
    mode:apply?"APPLY":"DRY_RUN",sourceTemplates:12,sourceVariables:10,
    originalTemplates:initial.templates,originalVariables:initial.variables,
    newVariables:missingVariables.map(x=>x.name),
    newTemplates:missingTemplates.map(x=>x.name),
    stagePublishedOffers:initial.offers.published
  }));
  const json=(v:unknown)=>v===undefined||v===null?null:JSON.stringify(v);
  for(const v of source.variables) {
    const id=variableIds.get(v.id)!;
    const params=[
      v.name,v.display_name,v.description,v.category,v.data_type,json(v.options),
      v.min_value,v.max_value,v.unit,v.default_value,v.is_required,v.is_active
    ];
    if(stageVarByName.has(norm(v.name))) {
      await client.query(
        "UPDATE public.product_variables SET name=$1,display_name=$2,description=$3,category=$4,"+
        "data_type=$5,options=$6::jsonb,min_value=$7,max_value=$8,unit=$9,default_value=$10,"+
        "is_required=$11,is_active=$12,updated_at=NOW() WHERE id=$13", [...params,id]
      );
    } else {
      await client.query(
        "INSERT INTO public.product_variables (id,name,display_name,description,category,data_type,"+
        "options,min_value,max_value,unit,default_value,is_required,is_active,created_by) "+
        "VALUES ($13,$1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$14)",[...params,id,adminId]
      );
    }
  }
  for(const t of source.templates) {
    const id=stageTemplateByName.get(norm(t.name))?.id||randomUUID();
    const mapped=remapVariableIds(t.available_variables,variableIds);
    const params=[t.name,t.description,t.category,t.target_profiles,
      json(mapped),json(t.base_configuration),t.is_active];
    if(stageTemplateByName.has(norm(t.name))) {
      await client.query(
        "UPDATE public.product_templates SET name=$1,description=$2,category=$3,target_profiles=$4::text[],"+
        "available_variables=$5::jsonb,base_configuration=$6::jsonb,is_active=$7,updated_at=NOW() "+
        "WHERE id=$8",[...params,id]
      );
    } else {
      await client.query(
        "INSERT INTO public.product_templates (id,name,description,category,target_profiles,"+
        "available_variables,base_configuration,is_active,created_by) "+
        "VALUES ($8,$1,$2,$3,$4::text[],$5::jsonb,$6::jsonb,$7,$9)",
        [...params,id,adminId]
      );
    }
  }
  const after=await client.query(
    "SELECT (SELECT count(*)::int FROM public.product_templates) templates,"+
    "(SELECT count(*)::int FROM public.product_variables) variables,"+
    "(SELECT count(*)::int FROM public.institution_products WHERE status='published') published_offers,"+
    "(SELECT count(*)::int FROM public.institution_product_versions WHERE status='published') published_versions,"+
    "(SELECT count(*)::int FROM public.institution_products p LEFT JOIN public.product_templates t "+
    "ON p.template_id=t.id WHERE p.status='published' AND (t.id IS NULL OR t.is_active IS FALSE)) unmapped_offers,"+
    "(SELECT count(*)::int FROM public.users) users,"+
    "(SELECT count(*)::int FROM public.clients) clients,"+
    "(SELECT count(*)::int FROM public.credit_submission_requests) submissions"
  );
  const r=after.rows[0];
  if(r.templates!==stagingTemplates.length+missingTemplates.length ||
     r.variables!==stagingVars.length+missingVariables.length ||
     r.published_offers!==52||r.published_versions!==52||r.unmapped_offers!==0)
    throw Error("STAGING_META_POSTCONDITION");
  const keyNames=(await client.query("SELECT name FROM public.product_variables")).rows.map(x=>norm(x.name));
  if(source.variables.some(v=>!keyNames.includes(norm(v.name))))throw Error("STAGING_META_VARIABLES_NOT_PRESENT");
  console.info("[STAGING-META-"+(apply?"APPLIED":"TESTED_ROLLBACK")+"] "+JSON.stringify({
    templates:r.templates,variables:r.variables,publishedOffers:r.published_offers,
    publishedVersions:r.published_versions,unmappedOffers:r.unmapped_offers,
    users:r.users,clients:r.clients,submissions:r.submissions
  }));
}
export async function reconcileStagingTemplates(pool:Pool):Promise<void> {
  if(!process.env.STAGING_TEMPLATE_SYNC_CHUNKS)return;
  if(process.env.RAILWAY_ENVIRONMENT_NAME!=="staging"||
     process.env.RAILWAY_ENVIRONMENT_ID!=="e3134695-aaec-41e2-8622-41e3701ed985"||
     new URL(process.env.DATABASE_URL||"postgresql://localhost").hostname!=="postgres.railway.internal")
    throw Error("STAGING_META_ENVIRONMENT_GUARD");
  const source=envData()!;
  const apply=process.env.STAGING_TEMPLATE_SYNC_APPLY==="APPLY_STAGE_ONLY_20261103";
  const client=await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    await client.query("SET LOCAL statement_timeout='30000ms'");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('staging-template-metadata-sync'))");
    const backup=await client.query(
      "SELECT to_regclass('staging_catalog_backup_20261103.manifest') IS NOT NULL present"
    );
    if(!backup.rows[0].present)throw Error("STAGING_META_BACKUP_MISSING");
    await sync(client,source,apply);
    await client.query(apply?"COMMIT":"ROLLBACK");
  } catch(error) {
    await client.query("ROLLBACK").catch(()=>{});
    throw error;
  } finally {client.release()}
}
