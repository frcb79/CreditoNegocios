import type { Pool } from "pg";

/**
 * STAGING-ONLY catalog snapshot, deliberately outside public.
 *
 * Scope: financial catalog/configuration tables only. NOT a replacement for
 * Railway's recoverable volume backup or a copy of Production user data.
 * This runs BEFORE auto-migrations on the staging-only branch and is
 * deliberately one-time: repeated deploys verify the immutable snapshot.
 */
const BACKUP_SCHEMA = "staging_catalog_backup_20261103";
const TABLES = [
  "financial_institutions",
  "institution_products",
  "institution_product_versions",
  "product_templates",
  "product_variables",
  "commercial_configurations",
  "operational_rules_versions",
] as const;

const quote = (value: string) => '"' + value.replace(/"/g, '""') + '"';

async function fingerprint(query: (sql: string) => Promise<any>, qualified: string) {
  const result = await query(`
    SELECT COUNT(*)::bigint AS n,
           md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY md5(to_jsonb(t)::text)), '')) AS digest
      FROM ${qualified} t
  `);
  return { count: Number(result.rows[0].n), checksum: String(result.rows[0].digest) };
}

export async function ensureStagingCatalogBackup(pool: Pool): Promise<void> {
  if (process.env.RAILWAY_ENVIRONMENT_NAME !== "staging") return;

  // Mandatory second line of defense; server/db.ts checks the DB and API hosts
  // before the pool is created.
  if (process.env.RAILWAY_ENVIRONMENT_ID !== "e3134695-aaec-41e2-8622-41e3701ed985") {
    throw new Error("STAGING_CATALOG_BACKUP_WRONG_ENVIRONMENT");
  }

  const client = await pool.connect();
  let started = false;
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
    started = true;
    await client.query("SET LOCAL statement_timeout = '20000ms'");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('creditonegocios_stage_catalog_backup_20261103'))");

    const schema = quote(BACKUP_SCHEMA);
    const manifest = schema + "." + quote("manifest");
    const existing = await client.query(
      "SELECT to_regclass($1) IS NOT NULL AS present",
      [BACKUP_SCHEMA + ".manifest"],
    );
    const alreadyCreated = Boolean(existing.rows[0].present);
    if (!alreadyCreated) {
      await client.query("CREATE SCHEMA IF NOT EXISTS " + schema);
      // An earlier/foreign incomplete copy must never be treated as a backup.
      const prior = await client.query(
        "SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_schema=$1",
        [BACKUP_SCHEMA],
      );
      if (Number(prior.rows[0].n) !== 0) throw new Error("STAGING_CATALOG_BACKUP_PARTIAL_SCHEMA");

      await client.query(`CREATE TABLE ${manifest} (
        table_name TEXT PRIMARY KEY, row_count BIGINT NOT NULL,
        checksum TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);

      for (const name of TABLES) {
        const source = "public." + quote(name);
        const target = schema + "." + quote(name);
        await client.query("CREATE TABLE " + target + " AS TABLE " + source + " WITH DATA");
        const sourceFingerprint = await fingerprint((sql) => client.query(sql), source);
        const targetFingerprint = await fingerprint((sql) => client.query(sql), target);
        if (
          sourceFingerprint.count !== targetFingerprint.count ||
          sourceFingerprint.checksum !== targetFingerprint.checksum
        ) throw new Error("STAGING_CATALOG_BACKUP_MISMATCH:" + name);
        await client.query(
          "INSERT INTO " + manifest + " (table_name,row_count,checksum) VALUES ($1,$2,$3)",
          [name, targetFingerprint.count, targetFingerprint.checksum],
        );
      }
    }

    const manifestRows = await client.query(
      "SELECT table_name,row_count::int,checksum FROM " + manifest + " ORDER BY table_name",
    );
    if (manifestRows.rows.length !== TABLES.length) throw new Error("STAGING_CATALOG_BACKUP_INCOMPLETE");

    const report: Array<{table: string; rows: number}> = [];
    for (const name of TABLES) {
      const entry = manifestRows.rows.find((row: any) => row.table_name === name);
      if (!entry) throw new Error("STAGING_CATALOG_BACKUP_MISSING_TABLE:" + name);
      const archived = await fingerprint((sql) => client.query(sql), schema + "." + quote(name));
      if (archived.count !== Number(entry.row_count) || archived.checksum !== entry.checksum) {
        throw new Error("STAGING_CATALOG_BACKUP_CORRUPTED:" + name);
      }
      report.push({ table: name, rows: archived.count });
    }

    await client.query("COMMIT");
    started = false;
    console.info(
      "[STAGING-CATALOG-BACKUP] " + (alreadyCreated ? "VERIFIED_EXISTING" : "CREATED_AND_VERIFIED") +
      " " + JSON.stringify({ schema: BACKUP_SCHEMA, tables: report }),
    );
  } catch (error) {
    if (started) await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/** Diagnostics contain only catalog names, IDs, statuses and version numbers. */
export async function logStagingCatalogOverview(pool: Pool): Promise<void> {
  if (process.env.RAILWAY_ENVIRONMENT_NAME !== "staging") return;
  const institutions = await pool.query(
    "SELECT id,name,is_active FROM public.financial_institutions ORDER BY lower(name),id",
  );
  for (const item of institutions.rows) {
    console.info("[STAGING-INSTITUTION] " + JSON.stringify({
      id: item.id, name: item.name, active: item.is_active,
    }));
  }

  const products = await pool.query(`
    SELECT p.id,p.institution_id,coalesce(p.name,p.custom_name,'') AS name,
           p.product_type,p.status,p.current_version_number,
           (SELECT COUNT(*)::int FROM public.institution_product_versions v
             WHERE v.institution_product_id=p.id) AS versions
      FROM public.institution_products p
     ORDER BY lower(coalesce(p.name,p.custom_name,'')),p.id
  `);
  for (const item of products.rows) {
    console.info("[STAGING-OFFER] " + JSON.stringify({
      id: item.id, institution_id: item.institution_id,
      name: item.name, type: item.product_type,
      status: item.status, version: item.current_version_number,
      versions: item.versions,
    }));
  }

  const versionStatus = await pool.query(
    "SELECT status, COUNT(*)::int AS count FROM public.institution_product_versions GROUP BY status ORDER BY status",
  );
  console.info("[STAGING-VERSION-STATUSES] " + JSON.stringify(versionStatus.rows));

  // Fingerprints only: never log banking/commercial values or document data.
  // MD5 here is a deterministic comparison label, not a security primitive.
  const institutionFields = await pool.query(`
    SELECT id,
      md5(coalesce(requirements, 'null'::jsonb)::text) AS requirements_hash,
      md5(coalesce(products, 'null'::jsonb)::text) AS products_hash,
      md5(coalesce(commission_rates, 'null'::jsonb)::text) AS commissions_hash,
      md5(coalesce(additional_costs, 'null'::jsonb)::text) AS costs_hash,
      md5(coalesce(application_process, 'null'::jsonb)::text) AS process_hash,
      md5(coalesce(to_jsonb(required_documents), 'null'::jsonb)::text) AS documents_hash
    FROM public.financial_institutions ORDER BY id
  `);
  for (const row of institutionFields.rows) {
    console.info("[STAGING-INSTITUTION-FIELDS] " + JSON.stringify(row));
  }

  const productFields = await pool.query(`
    SELECT id,
      md5(coalesce(configuration, 'null'::jsonb)::text) AS configuration_hash,
      md5(coalesce(to_jsonb(target_profiles), 'null'::jsonb)::text) AS profiles_hash,
      md5(coalesce(active_variables, 'null'::jsonb)::text) AS variables_hash,
      coalesce(is_active,false) AS active
    FROM public.institution_products ORDER BY id
  `);
  for (const row of productFields.rows) {
    console.info("[STAGING-PRODUCT-FIELDS] " + JSON.stringify(row));
  }

  const versionFields = await pool.query(`
    SELECT institution_product_id, version_number, status,
      md5(coalesce(conditions, 'null'::jsonb)::text) AS conditions_hash,
      md5(coalesce(requirements, 'null'::jsonb)::text) AS requirements_hash,
      md5(coalesce(to_jsonb(required_documents), 'null'::jsonb)::text) AS documents_hash,
      md5(coalesce(variables_configuration, 'null'::jsonb)::text) AS variables_hash
    FROM public.institution_product_versions ORDER BY institution_product_id, version_number
  `);
  for (const row of versionFields.rows) {
    console.info("[STAGING-VERSION-FIELDS] " + JSON.stringify(row));
  }
}
