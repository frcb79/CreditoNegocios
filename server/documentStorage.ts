import { randomUUID } from "crypto";
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

export function isSupabaseStorageEnabled() {
  return Boolean(supabaseAdmin);
}