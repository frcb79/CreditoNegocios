import { Pool } from "pg";
import { setDefaultResultOrder } from "node:dns";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../shared/schema";

// Railway containers commonly lack IPv6 egress; prefer IPv4 when resolving DB hosts.
setDefaultResultOrder("ipv4first");

const useMemoryStorage = process.env.USE_MEMORY_STORAGE === "true" || process.env.NODE_ENV === "test";
const connectionString =
  process.env.DATABASE_URL ?? "postgresql://local:local@localhost:5432/creditonegocios";

// Staging release guard: this branch MUST NEVER start against production
// infrastructure. Check before creating the DB pool or running auto-migrations.
// Railway private networking isolates postgres.railway.internal per environment.
if (process.env.NODE_ENV === "production") {
  if (
    process.env.RAILWAY_ENVIRONMENT_NAME !== "staging" ||
    process.env.RAILWAY_ENVIRONMENT_ID !== "e3134695-aaec-41e2-8622-41e3701ed985"
  ) {
    throw new Error("STAGING_RELEASE_ENVIRONMENT_MISMATCH");
  }

  let databaseEndpoint: URL;
  try {
    databaseEndpoint = new URL(connectionString);
  } catch {
    throw new Error("STAGING_DATABASE_URL_INVALID");
  }

  if (
    !["postgres:", "postgresql:"].includes(databaseEndpoint.protocol) ||
    databaseEndpoint.hostname.toLowerCase() !== "postgres.railway.internal" ||
    !databaseEndpoint.username ||
    !databaseEndpoint.pathname ||
    databaseEndpoint.pathname === "/"
  ) {
    throw new Error("STAGING_DATABASE_NOT_ISOLATED");
  }

  // Document storage is separately guarded in documentStorage.ts; also
  // prevent this release from starting if its Supabase API points to prod.
  let storageEndpoint: URL;
  try {
    storageEndpoint = new URL(process.env.SUPABASE_URL || "");
  } catch {
    throw new Error("STAGING_SUPABASE_URL_INVALID");
  }
  if (
    storageEndpoint.protocol !== "https:" ||
    storageEndpoint.hostname !== "hmzpaoapwjkxpfkndbik.supabase.co"
  ) {
    throw new Error("STAGING_SUPABASE_NOT_ISOLATED");
  }

  console.log("[STAGING-ISOLATION] Environment, private PostgreSQL and Supabase project checked.");
}

if (!process.env.DATABASE_URL && !useMemoryStorage) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString });
export const db = drizzle({ client: pool, schema });
