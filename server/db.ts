import { Pool } from "pg";
import { setDefaultResultOrder } from "node:dns";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";

// Railway containers commonly lack IPv6 egress; prefer IPv4 when resolving DB hosts.
setDefaultResultOrder("ipv4first");

const useMemoryStorage = process.env.USE_MEMORY_STORAGE === "true";
const connectionString =
  process.env.DATABASE_URL ?? "postgresql://local:local@localhost:5432/creditonegocios";

if (!process.env.DATABASE_URL && !useMemoryStorage) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString });
export const db = drizzle({ client: pool, schema });
