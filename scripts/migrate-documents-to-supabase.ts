import { promises as fs } from "fs";
import path from "path";
import { eq } from "drizzle-orm";
import { db, pool } from "../server/db";
import { migrateLocalDocumentToStorage } from "../server/documentStorage";
import { documents } from "../shared/schema";

async function fileExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const shouldDeleteLocalFiles = process.argv.includes("--delete-local");
  const allDocuments = await db.select().from(documents);
  const candidates = allDocuments.filter((document) => !document.filePath.startsWith("supabase://"));

  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  for (const document of candidates) {
    const absolutePath = path.isAbsolute(document.filePath)
      ? document.filePath
      : path.resolve(process.cwd(), document.filePath);

    const exists = await fileExists(absolutePath);
    if (!exists) {
      skipped += 1;
      console.warn(`[skip] ${document.id} missing file: ${absolutePath}`);
      continue;
    }

    try {
      const storedFile = await migrateLocalDocumentToStorage({
        sourcePath: absolutePath,
        fileName: document.fileName,
        mimeType: document.mimeType,
        context: {
          brokerId: document.brokerId || "unknown-broker",
          clientId: document.clientId,
          creditId: document.creditId,
          type: document.type,
        },
      });

      await db
        .update(documents)
        .set({ filePath: storedFile.filePath })
        .where(eq(documents.id, document.id));

      if (shouldDeleteLocalFiles) {
        await fs.unlink(absolutePath);
      }

      migrated += 1;
      console.log(`[ok] ${document.id} -> ${storedFile.filePath}`);
    } catch (error) {
      failed += 1;
      console.error(`[error] ${document.id}`, error);
    }
  }

  console.log(`Migrated: ${migrated}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Failed: ${failed}`);
}

main()
  .catch((error) => {
    console.error("Document migration failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });