/**
 * One-shot PostgreSQL custom-format backup of Railway STAGING to a PRIVATE
 * bucket in a DIFFERENT provider (Supabase STAGING). No production access.
 *
 * No credentials, row data, signed download URLs or object keys are logged.
 * Stored chunks are verified by read-back checksum before the manifest appears.
 * Restoring requires reconstructing chunks then pg_restore; the backup itself
 * does not modify staging PostgreSQL.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, open, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { assertDocumentStorageEnvironmentIsolatedAndAuthorized } from "./documentStorage";

const STAGE="e3134695-aaec-41e2-8622-41e3701ed985";
const STAGE_STORAGE="hmzpaoapwjkxpfkndbik";
const PROD_STORAGE="lyoatuvvasnvneikvgvt";
const BUCKET="staging-db-backups";
const CHUNK_SIZE=5*1024*1024;

function ensureIsolated(){
  if(process.env.RAILWAY_ENVIRONMENT_NAME!=="staging" ||
     process.env.RAILWAY_ENVIRONMENT_ID!==STAGE ||
     process.env.STAGING_SUPABASE_PROJECT_REF!==STAGE_STORAGE ||
     process.env.PRODUCTION_SUPABASE_PROJECT_REF!==PROD_STORAGE ||
     process.env.SUPABASE_URL!=="https://"+STAGE_STORAGE+".supabase.co" ||
     process.env.SUPABASE_STORAGE_BUCKET!=="staging-documents" ||
     new URL(process.env.DATABASE_URL||"postgresql://invalid").hostname!=="postgres.railway.internal" ||
     !process.env.SUPABASE_SERVICE_ROLE_KEY)
    throw new Error("STAGING_DB_BACKUP_CROSS_ENVIRONMENT_BLOCKED");
}
async function runProgram(cmd:string,args:string[],env:NodeJS.ProcessEnv,timeout:number){
  return await new Promise<void>((resolve,reject)=>{
    const child=spawn(cmd,args,{env,stdio:["ignore","ignore","pipe"]});
    let errorOutput="";let closed=false;
    const timer=setTimeout(()=>{child.kill("SIGKILL");reject(new Error("TIMEOUT"))},timeout);
    child.stderr?.on("data",part=>{errorOutput+=String(part).slice(0,1000)});
    child.on("error",err=>{if(closed)return;closed=true;clearTimeout(timer);reject(err)});
    child.on("close",code=>{
      if(closed)return;closed=true;clearTimeout(timer);
      if(code===0)resolve();else reject(new Error("EXIT_"+String(code)+":"+
        (errorOutput.includes("version mismatch")?"PG_VERSION_MISMATCH":"DUMP_FAILED")));
    });
  });
}

export async function exportStagingDatabaseOutsideRailway():Promise<void>{
  if(process.env.STAGING_DB_BACKUP_TO_SUPABASE!=="true")return;
  ensureIsolated();
  await assertDocumentStorageEnvironmentIsolatedAndAuthorized("staging-documents","staging-documents");
  const database=new URL(process.env.DATABASE_URL!);
  const dir=await mkdtemp(path.join(tmpdir(),"cn-staging-pg-"));
  const archive=path.join(dir,"staging.postgresql.dump");
  const parts:string[]=[];
  const client=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
    auth:{persistSession:false}
  });
  const target="staging-"+new Date().toISOString().replace(/[^0-9]/g,"").slice(0,14);
  let bucketCreated=false;
  try{
    const {data:existing,error:lookupError}=await client.storage.getBucket(BUCKET);
    if(!existing){
      if(lookupError && !/not found|does not exist/i.test(String(lookupError.message))) {
        throw new Error("STAGING_DB_BACKUP_BUCKET_LOOKUP_FAILED");
      }
      const {error:createError}=await client.storage.createBucket(BUCKET,{public:false});
      if(createError)throw new Error("STAGING_DB_BACKUP_CREATE_PRIVATE_BUCKET_FAILED");
      bucketCreated=true;
    }else if(existing.public!==false){
      throw new Error("STAGING_DB_BACKUP_BUCKET_MUST_BE_PRIVATE");
    }
    const args=[
      "--format=custom","--compress=6","--no-owner","--no-privileges",
      "--file",archive,"--host",database.hostname,
      "--port",database.port||"5432",
      "--username",decodeURIComponent(database.username),
      "--dbname",decodeURIComponent(database.pathname.slice(1))
    ];
    await runProgram("pg_dump",args,{
      ...process.env,PGPASSWORD:decodeURIComponent(database.password),
      PGCONNECT_TIMEOUT:"10"
    },180000);
    await runProgram("pg_restore",["--list",archive],process.env,20000);
    const size=(await stat(archive)).size;
    if(size<4096 || size>500*1024*1024)throw new Error("STAGING_DB_BACKUP_SIZE_UNEXPECTED");
    const file=await open(archive,"r");
    let totalSha=createHash("sha256");
    const chunks:Array<{name:string;size:number;sha256:string}>=[];
    try{
      for(let offset=0,index=0;offset<size;offset+=CHUNK_SIZE,index++){
        const length=Math.min(CHUNK_SIZE,size-offset);
        const buffer=Buffer.alloc(length);
        const n=await file.read(buffer,0,length,offset);
        if(n.bytesRead!==length)throw new Error("STAGING_DB_BACKUP_LOCAL_FILE_INCOMPLETE");
        totalSha.update(buffer);
        const sha256=createHash("sha256").update(buffer).digest("hex");
        const name=target+"/part-"+String(index).padStart(4,"0")+".bin";
        const uploaded=await client.storage.from(BUCKET).upload(name,buffer,{
          contentType:"application/octet-stream",upsert:false
        });
        if(uploaded.error)throw new Error("STAGING_DB_BACKUP_PART_UPLOAD_FAILED");
        parts.push(name);
        const downloaded=await client.storage.from(BUCKET).download(name);
        if(downloaded.error||!downloaded.data)
          throw new Error("STAGING_DB_BACKUP_PART_READBACK_FAILED");
        const check=Buffer.from(await downloaded.data.arrayBuffer());
        if(createHash("sha256").update(check).digest("hex")!==sha256)
          throw new Error("STAGING_DB_BACKUP_PART_HASH_MISMATCH");
        chunks.push({name,size:length,sha256});
      }
    }finally{await file.close()}
    const digest=totalSha.digest("hex");
    const manifest={format:"pg_dump_custom_v1",environment:"staging",provider:"railway",
      outsideProvider:"supabase-staging",bucket:BUCKET,createdAt:new Date().toISOString(),
      compressedBytes:size,sha256:digest,parts:chunks};
    const {error:manifestError}=await client.storage.from(BUCKET).upload(
      target+"/manifest.json",Buffer.from(JSON.stringify(manifest,null,2)),{
        contentType:"application/json",upsert:false
      }
    );
    if(manifestError)throw new Error("STAGING_DB_BACKUP_MANIFEST_UPLOAD_FAILED");
    console.info("[STAGING-EXTERNAL-DB-BACKUP] "+JSON.stringify({
      verified:true,format:"pg_dump_custom",storage:"private_supabase_staging",
      bucket:BUCKET,backupGroup:target,parts:chunks.length,bytes:size,sha256:digest,
      bucketCreated
    }));
  }catch(err){
    if(parts.length)await client.storage.from(BUCKET).remove(parts).catch(()=>{});
    throw err;
  }finally{
    await rm(dir,{recursive:true,force:true}).catch(()=>{});
  }
}
