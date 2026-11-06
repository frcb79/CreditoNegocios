#!/usr/bin/env node
"use strict";
/**
 * Railway STAGING only: inspect and optionally harden the nine commercial tables.
 * --inspect is read-only. --apply needs STAGING_RLS_APPLY=true and a guaranteed
 * Railway staging DB owner/bypass role. No Supabase project is contacted.
 * Does not create policies, expose grants, insert, update or delete records.
 */
const { Client } = require("pg");

const EXPECTED_ENVIRONMENT_ID = "e3134695-aaec-41e2-8622-41e3701ed985";
const TABLES = Object.freeze([
  "origin_attribution_reviews",
  "commercial_resource_templates",
  "commercial_resource_suggestions",
  "commercial_resource_artworks",
  "commercial_approved_logos",
  "commercial_profile_logos",
  "commercial_campaign_links",
  "commercial_resource_styles",
  "commercial_resource_topics",
]);

function assertStagingRailwayEnvironment(env) {
  if (env.RAILWAY_ENVIRONMENT_NAME !== "staging" ||
      env.RAILWAY_ENVIRONMENT_ID !== EXPECTED_ENVIRONMENT_ID) {
    throw new Error("STAGING_RLS_GUARD: Railway staging environment mismatch");
  }
  let host;
  try { host = new URL(env.DATABASE_URL || "").hostname; }
  catch { throw new Error("STAGING_RLS_GUARD: invalid DATABASE_URL"); }
  if (host !== "postgres.railway.internal") {
    throw new Error("STAGING_RLS_GUARD: refusing non-Railway database");
  }
}

function analyzeCatalog(rows) {
  const byName = new Map(rows.map(row => [row.name, row]));
  const missing = TABLES.filter(name => !byName.has(name));
  const noAccess = rows.filter(row => !row.can_select || !row.can_insert ||
    !row.can_update || !row.can_delete).map(row => row.name);
  const unsafeOwner = rows.filter(row =>
    !(row.is_superuser || row.bypasses_rls || row.owner === row.db_role)
  ).map(row => row.name);
  return { missing, noAccess, unsafeOwner,
    enabled: rows.filter(row => row.rls_enabled).length,
    total: TABLES.length };
}

async function queryCatalog(db) {
  const { rows } = await db.query(`
    SELECT c.relname AS name, c.relrowsecurity AS rls_enabled,
           pg_get_userbyid(c.relowner) AS owner, current_user AS db_role,
           r.rolsuper AS is_superuser, r.rolbypassrls AS bypasses_rls,
           has_table_privilege(current_user,c.oid,'SELECT') AS can_select,
           has_table_privilege(current_user,c.oid,'INSERT') AS can_insert,
           has_table_privilege(current_user,c.oid,'UPDATE') AS can_update,
           has_table_privilege(current_user,c.oid,'DELETE') AS can_delete
    FROM pg_class c
    JOIN pg_namespace ns ON ns.oid=c.relnamespace
    JOIN pg_roles r ON r.rolname=current_user
    WHERE ns.nspname='public' AND c.relkind IN ('r','p')
      AND c.relname=ANY($1::text[])
    ORDER BY c.relname
  `, [TABLES]);
  return rows;
}

async function main() {
  assertStagingRailwayEnvironment(process.env);
  const apply = process.argv.includes("--apply");
  if (apply && process.env.STAGING_RLS_APPLY !== "true") {
    throw new Error("STAGING_RLS_GUARD: explicit staging opt-in missing");
  }
  const db = new Client({ connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 7500, query_timeout: 15000 });
  await db.connect();
  try {
    const before = analyzeCatalog(await queryCatalog(db));
    console.log(`[STAGING_RLS_QA] before: tables=${before.total-before.missing.length}/${before.total} enabled=${before.enabled}`);
    if (before.missing.length) {
      console.warn("[STAGING_RLS_QA] MISSING_TABLES: " + before.missing.join(","));
    }
    if (before.unsafeOwner.length) {
      console.warn("[STAGING_RLS_QA] BACKEND_ROLE_WOULD_BE_RESTRICTED: " + before.unsafeOwner.join(","));
    }
    if (before.noAccess.length) {
      console.warn("[STAGING_RLS_QA] INSUFFICIENT_BACKEND_GRANTS: " + before.noAccess.join(","));
    }
    if (!apply) {
      console.log("[STAGING_RLS_QA] INSPECT_ONLY: no database changes");
      return;
    }
    if (before.missing.length || before.unsafeOwner.length || before.noAccess.length) {
      throw new Error("STAGING_RLS_GUARD: unsafe catalog or backend privileges");
    }
    if (before.enabled === TABLES.length) {
      console.log("[STAGING_RLS_QA] ALREADY_ENABLED: nine tables have RLS; no changes");
      return;
    }
    await db.query("BEGIN");
    try {
      await db.query("SET LOCAL lock_timeout = '3s'");
      await db.query("SET LOCAL statement_timeout = '10s'");
      for (const name of TABLES) {
        // Identifiers only from static, reviewed TABLES; no dynamic user input.
        await db.query('ALTER TABLE public."' + name + '" ENABLE ROW LEVEL SECURITY');
      }
      const after = analyzeCatalog(await queryCatalog(db));
      if (after.enabled !== TABLES.length || after.missing.length ||
          after.unsafeOwner.length || after.noAccess.length) {
        throw new Error("STAGING_RLS_GUARD: verification failed before commit");
      }
      // Exercise authorized backend reads against every actual staging table,
      // without reading sensitive row values or writing any records.
      for (const name of TABLES) {
        await db.query('SELECT 1 FROM public."' + name + '" LIMIT 0');
      }
      await db.query("COMMIT");
    } catch (e) {
      await db.query("ROLLBACK").catch(() => {});
      throw e;
    }
    const result = analyzeCatalog(await queryCatalog(db));
    if (result.enabled !== TABLES.length) {
      throw new Error("STAGING_RLS_GUARD: committed state not confirmed");
    }
    console.log("[STAGING_RLS_QA] PASS: nine staging tables RLS enabled; backend queries verified");
  } finally {
    await db.end();
  }
}
if (require.main === module) {
  main().catch(err => {
    console.error("[STAGING_RLS_QA] FAIL: " + (err.message || "unknown error"));
    process.exitCode = 1;
  });
}
module.exports = { TABLES, assertStagingRailwayEnvironment, analyzeCatalog };
