/**
 * One-off staging-only proof that the independent private pg_dump backup can
 * be restored into a NEW random temporary DB on the STAGING PostgreSQL server.
 * Never connects to production, modifies existing DBs or uses real accounts.
 * The temporary database is deleted in finally, even after restore errors.
 */
import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Pool } from "pg";
import { createClient } from "@supabase/supabase-js";

async function execute(cmd:string,args:string[],env:NodeJS.ProcessEnv,timeoutMs:number){
  await new Promise<void>((resolve,reject)=>{
    const child=spawn(cmd,args,{env,stdio:["ignore","ignore","pipe"]});
    let finished=false;
    const timer=setTimeout(()=>{child.kill("SIGKILL");reject(new Error("RESTORE_TIMEOUT"))},timeoutMs);
    let tail="";
    child.stderr?.on("data",chunk=>{tail=(tail+String(chunk)).slice(-2000)});
    child.on("error",err=>{
      if(finished)return;finished=true;clearTimeout(timer);reject(err);
    });
    child.on("close",code=>{
      if(finished)return;finished=true;clearTimeout(timer);
      code===0?resolve():reject(new Error("RESTORE_EXIT_"+code+
        (tail.includes("already exists")?"_SCHEMA_CONFLICT":"")));
    });
  });
}
export async function validateStagingRestore():Promise<void>{
  if(process.env.STAGING_RESTORE_QA!=="true")return;
  const group=process.env.STAGING_RESTORE_BACKUP_GROUP||"";
  if(!/^staging-[0-9]{14}$/.test(group)||
     process.env.RAILWAY_ENVIRONMENT_NAME!=="staging"||
     process.env.RAILWAY_ENVIRONMENT_ID!=="e3134695-aaec-41e2-8622-41e3701ed985"||
     process.env.STAGING_SUPABASE_PROJECT_REF!=="hmzpaoapwjkxpfkndbik"||
     process.env.PRODUCTION_SUPABASE_PROJECT_REF!=="lyoatuvvasnvneikvgvt"||
     process.env.SUPABASE_URL!=="https://hmzpaoapwjkxpfkndbik.supabase.co"||
     new URL(process.env.DATABASE_URL||"postgresql://invalid").hostname!=="postgres.railway.internal")
    throw Error("STAGING_RESTORE_ISOLATION_FAILURE");
  const admin=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
    auth:{persistSession:false}
  });
  const bucket="staging-db-backups";
  const bucketState=await admin.storage.getBucket(bucket);
  if(bucketState.error || bucketState.data?.public!==false)
    throw Error("STAGING_RESTORE_BUCKET_NOT_PRIVATE");
  const manifestFile=await admin.storage.from(bucket).download(group+"/manifest.json");
  if(manifestFile.error||!manifestFile.data)throw Error("STAGING_RESTORE_MANIFEST_MISSING");
  const manifest=JSON.parse(await manifestFile.data.text());
  if(manifest.format!=="pg_dump_custom_v1"||manifest.environment!=="staging"||
     manifest.bucket!==bucket||!Array.isArray(manifest.parts)||manifest.parts.length<1||
     manifest.parts.length>100||typeof manifest.sha256!=="string")
    throw Error("STAGING_RESTORE_MANIFEST_INVALID");
  const dir=await mkdtemp(path.join(tmpdir(),"cn-stage-restore-"));
  const dump=path.join(dir,"verified.dump");
  const file=await open(dump,"w",0o600);
  const hash=createHash("sha256");let byteCount=0;
  try{
    for(const part of manifest.parts){
      if(typeof part.name!=="string"||!part.name.startsWith(group+"/part-")||
         !/^[0-9a-f]{64}$/.test(part.sha256))
        throw Error("STAGING_RESTORE_INVALID_PART");
      const d=await admin.storage.from(bucket).download(part.name);
      if(d.error||!d.data)throw Error("STAGING_RESTORE_PART_NOT_READABLE");
      const content=Buffer.from(await d.data.arrayBuffer());
      if(content.length!==part.size||createHash("sha256").update(content).digest("hex")!==part.sha256)
        throw Error("STAGING_RESTORE_PART_HASH_INVALID");
      await file.write(content);
      byteCount+=content.length;hash.update(content);
    }
  }finally{await file.close()}
  const digest=hash.digest("hex");
  if(digest!==manifest.sha256||byteCount!==manifest.compressedBytes)
    throw Error("STAGING_RESTORE_DIGEST_MISMATCH");
  const conn=new URL(process.env.DATABASE_URL!);
  const dbName="cn_qa_restore_"+randomBytes(5).toString("hex");
  const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1});
  let created=false,cleaned=false;
  try{
    await pool.query('CREATE DATABASE "'+dbName+'" TEMPLATE template0');
    created=true;
    await execute("pg_restore",[
      "--exit-on-error","--no-owner","--no-privileges",
      "--host",conn.hostname,"--port",conn.port||"5432",
      "--username",decodeURIComponent(conn.username),"--dbname",dbName,dump
    ],{...process.env,PGPASSWORD:decodeURIComponent(conn.password),PGCONNECT_TIMEOUT:"10"},180000);
    const restored=new URL(process.env.DATABASE_URL!);
    restored.pathname="/"+dbName;
    const connection=new Pool({connectionString:restored.toString(),max:1});
    let counts:any;
    try{
      const q=await connection.query(
        "SELECT (SELECT count(*)::int FROM public.financial_institutions) institutions,"+
        "(SELECT count(*)::int FROM public.institution_products) offers,"+
        "(SELECT count(*)::int FROM public.institution_product_versions) versions,"+
        "(SELECT count(*)::int FROM public.product_templates) templates,"+
        "(SELECT count(*)::int FROM public.product_variables) variables,"+
        "(SELECT count(*)::int FROM public.credit_submission_requests) submissions"
      );
      counts=q.rows[0];
    }finally{await connection.end()}
    if(counts.institutions!==27||counts.offers!==73||counts.versions!==54||
       counts.templates!==15||counts.variables!==10||counts.submissions!==29)
      throw Error("STAGING_RESTORE_COUNT_MISMATCH");
    console.info("[STAGING-RESTORE-QA] "+JSON.stringify({
      validated:true,source:"private_supabase_staging",format:"pg_dump_custom",
      bytes:byteCount,sha256:digest,counts,temporaryDatabase:true
    }));
  }finally{
    if(created){
      await pool.query('DROP DATABASE IF EXISTS "'+dbName+'" WITH (FORCE)')
        .then(()=>{cleaned=true}).catch(e=>{console.error("[STAGING-RESTORE-QA-CLEANUP-ERROR]",e instanceof Error?e.message:"unknown")});
    }
    await pool.end().catch(()=>{});
    await rm(dir,{recursive:true,force:true}).catch(()=>{});
    if(created)console.info("[STAGING-RESTORE-QA-CLEANUP] "+JSON.stringify({temporaryDatabaseDropped:cleaned}));
  }
}
