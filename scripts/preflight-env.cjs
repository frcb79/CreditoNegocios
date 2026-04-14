#!/usr/bin/env node

const target = process.env.PREFLIGHT_TARGET || process.argv[2] || "backend";

const requiredByTarget = {
  backend: [
    "DATABASE_URL",
    "SESSION_SECRET",
    "FRONTEND_BASE_URL",
    "ALLOWED_ORIGINS",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "RESEND_API_KEY",
  ],
  frontend: [
    "VITE_PUBLIC_APP_URL",
    "VITE_API_BASE_URL",
    "VITE_WS_BASE_URL",
  ],
  migration: [
    "DATABASE_URL",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
  ],
};

if (!requiredByTarget[target]) {
  console.error(`Unknown target: ${target}`);
  console.error(`Valid targets: ${Object.keys(requiredByTarget).join(", ")}`);
  process.exit(1);
}

const required = requiredByTarget[target];
const missing = required.filter((name) => !process.env[name] || String(process.env[name]).trim() === "");

if (missing.length > 0) {
  console.error(`[fail] Missing required env vars for ${target}:`);
  for (const variable of missing) {
    console.error(`- ${variable}`);
  }
  process.exit(1);
}

if (target === "backend") {
  const databaseUrl = String(process.env.DATABASE_URL || "").toLowerCase();
  const isSupabase = databaseUrl.includes("supabase.co");
  const usesDirectPort = databaseUrl.includes(":5432/");

  if (isSupabase && usesDirectPort) {
    console.error("[fail] DATABASE_URL appears to use Supabase direct port 5432.");
    console.error("[hint] On Railway, use the Supabase pooler connection string (usually port 6543) to avoid IPv6-only host failures.");
    process.exit(1);
  }
}

console.log(`[ok] ${target} environment preflight passed (${required.length} vars)`);
