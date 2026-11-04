/**
 * Ephemeral document E2E: staging only, test payload only, no client documents.
 * Execute once per flag, then remove the flag after verifying logs.
 */
import { randomUUID, createHash } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  assertDocumentStorageEnvironmentIsolatedAndAuthorized,
  persistDocumentFile,
  getDocumentAccessTarget,
  removeStoredDocument,
} from "./documentStorage";

export async function runStagingDocumentE2E(): Promise<void> {
  if (process.env.STAGING_DOCUMENT_E2E !== "true") return;
  if (process.env.RAILWAY_ENVIRONMENT_NAME !== "staging" ||
      process.env.RAILWAY_ENVIRONMENT_ID !== "e3134695-aaec-41e2-8622-41e3701ed985" ||
      process.env.STAGING_SUPABASE_PROJECT_REF !== "hmzpaoapwjkxpfkndbik" ||
      process.env.PRODUCTION_SUPABASE_PROJECT_REF !== "lyoatuvvasnvneikvgvt" ||
      process.env.SUPABASE_URL !== "https://hmzpaoapwjkxpfkndbik.supabase.co" ||
      process.env.SUPABASE_STORAGE_BUCKET !== "staging-documents") {
    throw new Error("STAGING_DOC_E2E_REFUSES_CROSS_ENVIRONMENT");
  }
  await assertDocumentStorageEnvironmentIsolatedAndAuthorized("staging-documents","staging-documents");
  const project=process.env.SUPABASE_URL!;
  const admin=createClient(project,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
    auth:{persistSession:false}
  });
  const {data:bucket,error:bucketError}=await admin.storage.getBucket("staging-documents");
  if (bucketError || !bucket || bucket.public !== false) {
    throw new Error("STAGING_DOC_E2E_BUCKET_NOT_PRIVATE");
  }

  const token=randomUUID();
  const source=Buffer.from("Cred ito Negocios staging document test\n"+token+"\n","utf8");
  const fingerprint=createHash("sha256").update(source).digest("hex");
  const folder=await mkdtemp(path.join(tmpdir(),"cn-docqa-"));
  const file=path.join(folder,"staging-qa-"+token+".txt");
  let reference:string|undefined;
  const result:{upload:boolean;download:boolean;signedUrl:boolean;deleted:boolean}={
    upload:false,download:false,signedUrl:false,deleted:false
  };
  try {
    await writeFile(file,source,{mode:0o600});
    const uploaded=await persistDocumentFile({
      path:file,originalname:"staging-qa.txt",mimetype:"text/plain"
    } as Express.Multer.File,{
      brokerId:"STAGING-QA-NO-USER",clientId:null,creditId:null,type:"document-test"
    });
    if(uploaded.storageProvider!=="supabase" || !uploaded.filePath.startsWith("supabase://staging-documents/")) {
      throw new Error("STAGING_DOC_E2E_UPLOAD_NOT_REMOTE");
    }
    reference=uploaded.filePath;
    result.upload=true;
    const item=reference.slice("supabase://staging-documents/".length);
    const download=await admin.storage.from("staging-documents").download(item);
    if(download.error || !download.data)throw new Error("STAGING_DOC_E2E_DOWNLOAD_FAILURE");
    const recovered=Buffer.from(await download.data.arrayBuffer());
    if(createHash("sha256").update(recovered).digest("hex")!==fingerprint)
      throw new Error("STAGING_DOC_E2E_CHECKSUM_MISMATCH");
    result.download=true;
    const target=await getDocumentAccessTarget(reference,{download:true,fileName:"staging-qa.txt"});
    if(target.kind!=="redirect" || !target.url.startsWith(project+"/storage/v1/object/sign/"))
      throw new Error("STAGING_DOC_E2E_SIGNED_URL_MISSING");
    result.signedUrl=true;
    await removeStoredDocument(reference);
    reference=undefined;
    const after=await admin.storage.from("staging-documents").list("STAGING-QA-NO-USER/unassigned");
    if(after.error)throw new Error("STAGING_DOC_E2E_VERIFY_REMOVAL_FAILED");
    if(after.data?.some(x=>x.name.startsWith("document-test-")))
      throw new Error("STAGING_DOC_E2E_LEFTOVER_TEST_FILE");
    result.deleted=true;
    console.info("[STAGING-DOCUMENT-E2E] "+JSON.stringify({result,privateBucket:true,bytes:source.length}));
  } finally {
    if(reference)await removeStoredDocument(reference).catch(()=>{});
    await rm(folder,{recursive:true,force:true}).catch(()=>{});
  }
}
