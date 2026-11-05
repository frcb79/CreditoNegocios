import { randomUUID, createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

type UploadContext = {
  brokerId: string;
  clientId?: string | null;
  creditId?: string | null;
  type: string;
};

type AccessTarget =
  | { kind: "redirect"; url: string }
  | { kind: "local"; absolutePath: string };

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseStorageBucket = process.env.SUPABASE_STORAGE_BUCKET || "documents";

const supabaseAdmin = supabaseUrl && supabaseServiceRoleKey
  ? createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false },
    })
  : null;


/**
 * SEC-P0-STORAGE: Staging must use a different Supabase PROJECT, not merely a
 * bucket name. A service_role key bypasses Storage RLS in its own project and
 * could otherwise read the Production bucket even if the UI chose staging-*.
 *
 * Fail closed unless:
 *  - operator explicitly enabled the guard AFTER provisioning separation;
 *  - both project references exist and are different;
 *  - the endpoint belongs to the expected staging project;
 *  - legacy JWTs embed the staging project ref, or modern sb_secret keys are
 *    verified against the private staging bucket via the staging-only URL;
 *  - the requested bucket matches the configured staging-prefixed bucket.
 *
 * Token payload decoding is not signature verification; the Supabase service
 * verifies JWTs on use. Opaque sb_secret keys cannot reveal their project ref;
 * check their format here and authorize them server-side against the private
 * staging bucket before any upload, delete or signed URL.
 */
export function assertDocumentStorageEnvironmentIsolated(
  configuredBucket: string = supabaseStorageBucket,
  requestedBucket: string = configuredBucket,
  config: {
    stagingProjectRef?: string;
    productionProjectRef?: string;
    supabaseUrl?: string;
    serviceRoleKey?: string;
  } = {},
) {
  if ((process.env.RAILWAY_ENVIRONMENT_NAME || "").toLowerCase() !== "staging") return;

  const deny = () => { throw new Error("STAGING_DOCUMENT_STORAGE_NOT_ISOLATED"); };
  const stagingRef = config.stagingProjectRef ?? process.env.STAGING_SUPABASE_PROJECT_REF;
  const productionRef = config.productionProjectRef ?? process.env.PRODUCTION_SUPABASE_PROJECT_REF;
  const url = config.supabaseUrl ?? process.env.SUPABASE_URL;
  const key = config.serviceRoleKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (process.env.STAGING_DOCUMENT_STORAGE_ISOLATED !== "true" ||
      !stagingRef || !productionRef || stagingRef === productionRef ||
      !/^[a-z0-9]{20}$/.test(stagingRef) || !/^[a-z0-9]{20}$/.test(productionRef) ||
      !configuredBucket.startsWith("staging-") ||
      requestedBucket !== configuredBucket || !url || !key) deny();

  try {
    const endpoint = new URL(url!);
    if (endpoint.protocol !== "https:" ||
        endpoint.hostname !== stagingRef + ".supabase.co" ||
        (endpoint.pathname !== "/" && endpoint.pathname !== "")) deny();

    if (key!.startsWith("sb_secret_")) {
      // Modern Supabase secrets are opaque: authorization is verified by
      // assertDocumentStorageEnvironmentIsolatedAndAuthorized before I/O.
      if (!/^sb_secret_[A-Za-z0-9_-]{20,}$/.test(key!)) deny();
    } else {
      const parts = key!.split(".");
      if (parts.length !== 3) deny();
      const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
      if (claims?.role !== "service_role" || claims?.ref !== stagingRef) deny();
    }
  } catch {
    deny();
  }
}

/**
 * Verify a modern secret against the actual private staging bucket before any
 * file I/O. An accidentally reused Production secret cannot authorize requests
 * at the pinned Staging project hostname, even though its value is opaque.
 */
export async function assertDocumentStorageEnvironmentIsolatedAndAuthorized(
  configuredBucket: string = supabaseStorageBucket,
  requestedBucket: string = configuredBucket,
): Promise<void> {
  assertDocumentStorageEnvironmentIsolated(configuredBucket, requestedBucket);
  if ((process.env.RAILWAY_ENVIRONMENT_NAME || "").toLowerCase() !== "staging" ||
      !supabaseServiceRoleKey?.startsWith("sb_secret_")) return;
  if (!supabaseAdmin) throw new Error("STAGING_DOCUMENT_STORAGE_NOT_ISOLATED");
  try {
    const { data, error } = await supabaseAdmin.storage.getBucket(configuredBucket);
    if (error || !data || data.id !== configuredBucket || data.public !== false) {
      throw new Error("STAGING_DOCUMENT_STORAGE_NOT_ISOLATED");
    }
  } catch {
    throw new Error("STAGING_DOCUMENT_STORAGE_NOT_ISOLATED");
  }
}

const stagingVolumeEnabled = () => process.env.RAILWAY_ENVIRONMENT_NAME === "staging" &&
  process.env.STAGING_DOCUMENT_VOLUME_ENABLED === "true";

const requireStagingVolume = () => {
  if (process.env.RAILWAY_ENVIRONMENT_ID !== "e3134695-aaec-41e2-8622-41e3701ed985" ||
      process.env.RAILWAY_VOLUME_MOUNT_PATH !== "/data/cn-documents") {
    throw new Error("STAGING_DOCUMENT_VOLUME_NOT_ISOLATED");
  }
  return "/data/cn-documents";
};

function sanitizeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-");
}

function buildStoragePath(file: Express.Multer.File, context: UploadContext) {
  const extension = path.extname(file.originalname);
  const relatedEntity = context.clientId || context.creditId || "unassigned";
  const fileName = `${sanitizeSegment(context.type)}-${randomUUID()}${extension}`;

  return [
    sanitizeSegment(context.brokerId),
    sanitizeSegment(relatedEntity),
    fileName,
  ].join("/");
}

function parseSupabaseFilePath(filePath: string) {
  if (!filePath.startsWith("supabase://")) {
    return null;
  }

  const withoutScheme = filePath.slice("supabase://".length);
  const separatorIndex = withoutScheme.indexOf("/");
  if (separatorIndex === -1) {
    return null;
  }

  return {
    bucket: withoutScheme.slice(0, separatorIndex),
    objectPath: withoutScheme.slice(separatorIndex + 1),
  };
}

async function safeDeleteLocalFile(filePath: string) {
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(process.cwd(), filePath);

  try {
    await fs.unlink(absolutePath);
  } catch (error: any) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }
}

export async function persistDocumentFile(file: Express.Multer.File, context: UploadContext) {
  if (stagingVolumeEnabled()) {
    try {
      return await migrateLocalDocumentToStorage({
        sourcePath: file.path, fileName: file.originalname,
        mimeType: file.mimetype, context,
      });
    } finally {
      await safeDeleteLocalFile(file.path);
    }
  }
  // Do not silently fall back to ephemeral local uploads in Staging.
  await assertDocumentStorageEnvironmentIsolatedAndAuthorized();
  if (!supabaseAdmin) {
    return { filePath: file.path, storageProvider: "local" as const };
  }

  try {
    const storedFile = await migrateLocalDocumentToStorage({
      sourcePath: file.path,
      fileName: file.originalname,
      mimeType: file.mimetype,
      context,
    });

    return {
      filePath: storedFile.filePath,
      storageProvider: "supabase" as const,
    };
  } finally {
    await safeDeleteLocalFile(file.path);
  }
}

export async function migrateLocalDocumentToStorage(params: {
  sourcePath: string;
  fileName: string;
  mimeType?: string | null;
  context: UploadContext;
}) {
  if (stagingVolumeEnabled()) {
    const root = requireStagingVolume();
    const storageKey = buildStoragePath({
      originalname: params.fileName,
    } as Express.Multer.File, params.context);
    const destination = path.resolve(root, storageKey);
    if (!destination.startsWith(root + path.sep)) throw new Error("INVALID_DOCUMENT_PATH");
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(params.sourcePath, destination);
    return { filePath: destination, storageProvider: "local" as const };
  }
  await assertDocumentStorageEnvironmentIsolatedAndAuthorized();
  if (!supabaseAdmin) {
    throw new Error("Supabase Storage is not configured for this environment");
  }

  const storagePath = buildStoragePath(
    {
      originalname: params.fileName,
    } as Express.Multer.File,
    params.context,
  );

  const fileBuffer = await fs.readFile(params.sourcePath);
  const { error } = await supabaseAdmin.storage
    .from(supabaseStorageBucket)
    .upload(storagePath, fileBuffer, {
      contentType: params.mimeType || undefined,
      upsert: false,
    });

  if (error) {
    throw error;
  }

  return {
    filePath: `supabase://${supabaseStorageBucket}/${storagePath}`,
    storageProvider: "supabase" as const,
  };
}

export async function removeStoredDocument(filePath?: string | null) {
  if (!filePath) {
    return;
  }

  const supabaseFile = parseSupabaseFilePath(filePath);
  if (supabaseFile) {
    await assertDocumentStorageEnvironmentIsolatedAndAuthorized(supabaseStorageBucket, supabaseFile.bucket);
    if (!supabaseAdmin) {
      throw new Error("Supabase Storage is not configured for this environment");
    }

    const { error } = await supabaseAdmin.storage
      .from(supabaseFile.bucket)
      .remove([supabaseFile.objectPath]);

    if (error) {
      throw error;
    }

    return;
  }

  await safeDeleteLocalFile(filePath);
}

export async function getDocumentAccessTarget(
  filePath: string,
  options?: { download?: boolean; fileName?: string },
): Promise<AccessTarget> {
  const supabaseFile = parseSupabaseFilePath(filePath);
  if (supabaseFile) {
    await assertDocumentStorageEnvironmentIsolatedAndAuthorized(supabaseStorageBucket, supabaseFile.bucket);
    if (!supabaseAdmin) {
      throw new Error("Supabase Storage is not configured for this environment");
    }

    const { data, error } = await supabaseAdmin.storage
      .from(supabaseFile.bucket)
      .createSignedUrl(supabaseFile.objectPath, 60, options?.download ? { download: options.fileName || true } : undefined);

    if (error || !data?.signedUrl) {
      throw error || new Error("Failed to generate signed URL");
    }

    return { kind: "redirect", url: data.signedUrl };
  }

  return {
    kind: "local",
    absolutePath: path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath),
  };
}

export async function runStagingVolumePdfQA() {
  if (!stagingVolumeEnabled() || process.env.STAGING_VOLUME_PDF_QA !== "true") return;
  const key = "ab960719-12f9-47c0-8175-dc6f3fc3ed2b/d2449166-4086-41f8-89f2-28e7354773ed/other-6ec0173e-5eb7-484f-b4c3-c0856c8a8779.pdf";
  if (!supabaseAdmin) throw new Error("STAGING_PDF_QA_SOURCE_UNAVAILABLE");
  const source = await supabaseAdmin.storage.from("staging-documents").download(key);
  if (source.error || !source.data) throw new Error("STAGING_PDF_QA_DOWNLOAD_FAILED");
  const original = Buffer.from(await source.data.arrayBuffer());
  if (original.length !== 187613) throw new Error("STAGING_PDF_QA_BAD_SIZE");
  const temporary = path.join("/tmp", "cn-volume-qa-" + randomUUID() + ".pdf");
  await fs.writeFile(temporary, original);
  let destination: string | null = null;
  try {
    const stored = await migrateLocalDocumentToStorage({
      sourcePath: temporary, fileName: "volume-test.pdf", mimeType: "application/pdf",
      context: { brokerId: "staging-qa", clientId: "volume-check", type: "other" },
    });
    destination = stored.filePath;
    const access = await getDocumentAccessTarget(destination, { download: true, fileName: "volume-test.pdf" });
    if (access.kind !== "local") throw new Error("STAGING_PDF_QA_NOT_LOCAL");
    const copied = await fs.readFile(access.absolutePath);
    if (createHash("sha256").update(original).digest("hex") !==
        createHash("sha256").update(copied).digest("hex"))
      throw new Error("STAGING_PDF_QA_CHECKSUM");
    await removeStoredDocument(destination);
    destination = null;
    console.info("[STAGING_VOLUME_PDF_QA] PASS upload/read/download/delete, bytes=" + original.length);
    if (process.env.STAGING_REMOVE_LEGACY_STORAGE === "true") {
      await assertDocumentStorageEnvironmentIsolatedAndAuthorized();
      const backups = [
        "staging-20261104032434/manifest.json", "staging-20261104032434/part-0000.bin",
        "staging-20261104032503/manifest.json", "staging-20261104032503/part-0000.bin",
      ];
      const removedPdf = await supabaseAdmin.storage.from("staging-documents").remove([key]);
      if (removedPdf.error) throw new Error("STAGING_CLEANUP_DOCUMENT_FAILED");
      const removedBackups = await supabaseAdmin.storage.from("staging-db-backups").remove(backups);
      if (removedBackups.error) throw new Error("STAGING_CLEANUP_BACKUPS_FAILED");
      console.info("[STAGING_LEGACY_STORAGE_CLEANUP] PASS 5 legacy objects");
    }
  } finally {
    if (destination) await removeStoredDocument(destination).catch(() => {});
    await fs.unlink(temporary).catch(() => {});
  }
}

export function isSupabaseStorageEnabled() {
  return Boolean(supabaseAdmin);
}