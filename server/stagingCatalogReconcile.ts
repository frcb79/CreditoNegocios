import { createHash } from "node:crypto";
import { Pool, PoolClient } from "pg";
import { computeInstitutionProductVersionHash } from "./offerVersionService";

/**
 * One-time, staging-only reconciliation. This module has NO production DB
 * connection: all source records arrive via temporary, staging-only variables.
 * Default mode is DRY RUN. No automatic "apply" from a Git push.
 *
 * Only catalog tables are writable. All financial and audit values are kept
 * out of server logs. All stage-specific IDs are preserved. Data is applied
 * atomically with no DELETE and rollback on any failure.
 */
type RecordLike = Record<string, any>;
type Catalog = {
  financial_institutions: RecordLike[];
  institution_products: RecordLike[];
  institution_product_versions: RecordLike[];
};

function assertStaging(): void {
  if (process.env.RAILWAY_ENVIRONMENT_NAME !== "staging" ||
      process.env.RAILWAY_ENVIRONMENT_ID !== "e3134695-aaec-41e2-8622-41e3701ed985") {
    throw new Error("CATALOG_SYNC_REQUIRES_RAILWAY_STAGING");
  }
  let databaseUrl: URL;
  try {
    databaseUrl = new URL(process.env.DATABASE_URL || "");
  } catch {
    throw new Error("CATALOG_SYNC_DATABASE_URL_MISSING");
  }
  if (databaseUrl.hostname !== "postgres.railway.internal") {
    throw new Error("CATALOG_SYNC_REFUSES_NONSTAGING_DATABASE");
  }
}
function normalized(value: unknown): string {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .trim().toLowerCase().replace(/\s+/g, " ");
}
function institutionKey(x: RecordLike): string {
  return normalized(x.name);
}
function offerKey(x: RecordLike): string {
  return [normalized(x.institution_name), normalized(x.name), normalized(x.product_type)].join("|");
}
function requireUnique(items: RecordLike[], key: (x: RecordLike) => string, label: string) {
  const m = new Map<string,RecordLike>();
  for (const item of items) {
    const value = key(item);
    if (!value || m.has(value)) throw new Error("CATALOG_SYNC_DUPLICATE_" + label);
    m.set(value, item);
  }
  return m;
}
function requireCatalogPayload(): Catalog | null {
  const countText = process.env.STAGING_CATALOG_SYNC_CHUNKS;
  if (!countText) return null;
  const count = Number(countText);
  if (!Number.isSafeInteger(count) || count < 1 || count > 150) {
    throw new Error("CATALOG_SYNC_CHUNK_COUNT_INVALID");
  }
  let raw = "";
  for (let i=0; i<count; i++) {
    const key = "STAGING_CATALOG_SYNC_CHUNK_" + String(i).padStart(3, "0");
    const value = process.env[key];
    if (!value) throw new Error("CATALOG_SYNC_CHUNK_MISSING_" + i);
    raw += value;
  }
  const checksum = createHash("md5").update(raw).digest("hex");
  if (checksum !== process.env.STAGING_CATALOG_SYNC_MD5) {
    throw new Error("CATALOG_SYNC_CHECKSUM_MISMATCH");
  }
  const p = JSON.parse(raw) as Catalog;
  if (!Array.isArray(p.financial_institutions) ||
      !Array.isArray(p.institution_products) ||
      !Array.isArray(p.institution_product_versions) ||
      p.financial_institutions.length !== 26 ||
      p.institution_products.length !== 52 ||
      p.institution_product_versions.length !== 54) {
    throw new Error("CATALOG_SYNC_SOURCE_COUNTS_INVALID");
  }
  return p;
}
async function run(client: PoolClient, source: Catalog, apply: boolean) {
  const dbInstitutions = (await client.query("SELECT id,name FROM public.financial_institutions")).rows;
  const institutionByName = requireUnique(dbInstitutions, institutionKey, "STAGING_INSTITUTION");
  const prodInstitutions = requireUnique(source.financial_institutions, institutionKey, "SOURCE_INSTITUTION");
  for (const name of prodInstitutions.keys()) {
    if (!institutionByName.has(name)) throw new Error("CATALOG_SYNC_INSTITUTION_MISSING:" + name);
  }

  const dbOffersRaw = (await client.query(
    "SELECT p.id,p.institution_id,coalesce(p.name,p.custom_name,'') AS name,p.product_type " +
    "FROM public.institution_products p"
  )).rows;
  const nameForStageId = new Map(dbInstitutions.map(x=>[x.id, x.name]));
  const dbOffers = dbOffersRaw.map(x=>({...x,institution_name:nameForStageId.get(x.institution_id)}));
  const prodProducts = requireUnique(source.institution_products, offerKey, "SOURCE_OFFER");
  // Legacy staging rows (21) may duplicate names and have no product type.
  // Ignore those extras, but require unique matches for the 52 canonical offers.
  const canonicalStageOffers = dbOffers.filter(x => prodProducts.has(offerKey(x)));
  const productByKey = requireUnique(canonicalStageOffers, offerKey, "STAGING_CANONICAL_OFFER");
  for(const key of prodProducts.keys()){
    if (!productByKey.has(key)) throw new Error("CATALOG_SYNC_OFFER_MISSING:" + key);
  }
  const prodIdToStageId = new Map<string,string>();
  for(const product of source.institution_products) {
    if (!product.id) throw new Error("CATALOG_SYNC_SOURCE_PRODUCT_ID_MISSING");
    prodIdToStageId.set(product.id, productByKey.get(offerKey(product))!.id);
  }
  const stageVersions = (await client.query(
    "SELECT id,institution_product_id,version_number,status FROM public.institution_product_versions"
  )).rows;
  const versionMap = new Map(stageVersions.map(x=>[x.institution_product_id+"|"+x.version_number,x]));
  const versionNumbersByProduct = new Map<string,number[]>();
  for (const v of source.institution_product_versions) {
    const targetId = prodIdToStageId.get(v.product_id);
    if (!targetId) throw new Error("CATALOG_SYNC_SOURCE_VERSION_UNKNOWN_PRODUCT");
    const nums = versionNumbersByProduct.get(targetId) || [];
    if (nums.includes(v.version_number)) throw new Error("CATALOG_SYNC_DUPLICATE_VERSION");
    nums.push(v.version_number); versionNumbersByProduct.set(targetId,nums);
  }
  if (prodIdToStageId.size!==52 || versionNumbersByProduct.size!==52) {
    throw new Error("CATALOG_SYNC_PRODUCT_COVERAGE_INVALID");
  }
  const extraOffers = dbOffers.length - 52;
  const missingVersions = source.institution_product_versions.filter(
    v => !versionMap.has(prodIdToStageId.get(v.product_id)+"|"+v.version_number)
  );
  const before = (await client.query(
    "SELECT (SELECT count(*)::int FROM public.users) users," +
    "(SELECT count(*)::int FROM public.clients) clients,"+
    "(SELECT count(*)::int FROM public.credit_submission_requests) submissions"
  )).rows[0];
  const summary = {
    action: apply ? "APPLY" : "DRY_RUN",
    expectedInstitutions: 26, expectedProducts: 52, expectedVersions: 54,
    extraStageInstitutions: dbInstitutions.length - 26,
    extraLegacyStageProducts: extraOffers,
    missingVersions: missingVersions.length,
    usersUntouched: Number(before.users), clientsUntouched: Number(before.clients),
    submissionsUntouched: Number(before.submissions)
  };
  console.info("[STAGING-SYNC-PREFLIGHT]",JSON.stringify(summary));
  if (!apply) return;

  // Ensure no stage operation has an immutable reference to an offer version
  // whose financial terms could be replaced. Never rewrite historical quotes.
  const matchedIds = [...prodIdToStageId.values()];
  const referenced = await client.query(
    "SELECT COUNT(*)::int AS n FROM (" +
    " SELECT institution_product_id FROM public.credits WHERE institution_product_id = ANY($1::varchar[])" +
    " UNION ALL" +
    " SELECT institution_product_id FROM public.credit_submission_targets WHERE institution_product_id = ANY($1::varchar[])" +
    " UNION ALL" +
    " SELECT institution_product_id FROM public.commissions WHERE institution_product_id = ANY($1::varchar[])" +
    ") refs",
    [matchedIds],
  );
  if (Number(referenced.rows[0].n)>0) throw new Error("CATALOG_SYNC_REFERENCE_REVIEW_REQUIRED");

  // Only the 26 matching financial institutions; no contacts, emails or PII.
  const institutionColumns = [
    "description", "is_active", "commission_rate", "opening_commission_rate",
    "overrate_commission_rate", "broker_commission_rate", "master_broker_commission_rate",
    "commission_rates", "additional_costs", "requirements", "products",
    "accepted_profiles", "application_process", "estimated_timeframes",
    "approval_tips", "required_documents"
  ];
  const institutionJson = new Set([
    "commission_rates","additional_costs","requirements","products",
    "application_process","estimated_timeframes"
  ]);
  for (const record of source.financial_institutions) {
    const stageId = institutionByName.get(institutionKey(record))!.id;
    const parts = institutionColumns.map((c,i)=>'"'+c+'"=$'+(i+1)+(institutionJson.has(c)?"::jsonb":""));
    const values = institutionColumns.map(c=> record[c] === undefined ? null : record[c]);
    await client.query("UPDATE public.financial_institutions SET "+
      parts.join(",")+",updated_at=NOW() WHERE id=$"+(values.length+1),[...values,stageId]);
  }

  const productColumns = [
    "name", "custom_name", "description", "product_type", "slug",
    "configuration", "target_profiles", "active_variables",
    "is_active", "status", "current_version_number"
  ];
  for (const record of source.institution_products) {
    const targetId = prodIdToStageId.get(record.id)!;
    const clauses = productColumns.map((c,i)=>'"'+c+'"=$'+(i+1)+
      (["configuration","active_variables"].includes(c)?"::jsonb":""));
    await client.query("UPDATE public.institution_products SET "+ clauses.join(",")+
      ",updated_at=NOW() WHERE id=$"+(productColumns.length+1),
      [...productColumns.map(c=>record[c]===undefined?null:record[c]),targetId]);
  }

  const stageAdmin = await client.query(
    "SELECT id FROM public.users WHERE role='super_admin' ORDER BY id LIMIT 1"
  );
  if (!stageAdmin.rows.length) throw new Error("CATALOG_SYNC_STAGE_ADMIN_NOT_FOUND");
  const stageAdminId=String(stageAdmin.rows[0].id);

  for (const version of source.institution_product_versions) {
    const productId=prodIdToStageId.get(version.product_id)!;
    const hash=computeInstitutionProductVersionHash({
      institutionProductId: productId,
      versionNumber: version.version_number,
      conditions: version.conditions,
      requirements: version.requirements,
      requiredDocuments: version.required_documents,
      variablesConfiguration: version.variables_configuration,
    });
    const existing=versionMap.get(productId+"|"+version.version_number);
    const fields=[
      version.status,version.effective_from,version.effective_to,
      version.conditions,version.requirements,version.required_documents,
      version.variables_configuration,version.change_reason,hash,
      version.published_at,version.status==="published"?stageAdminId:null
    ];
    if (existing) {
      await client.query(
        "UPDATE public.institution_product_versions SET "+
        "status=$1,effective_from=$2,effective_to=$3,conditions=$4::jsonb,"+
        "requirements=$5::jsonb,required_documents=$6::text[],"+
        "variables_configuration=$7::jsonb,change_reason=$8,version_hash=$9,"+
        "published_at=$10,published_by=$11,updated_at=NOW() WHERE id=$12",
        [...fields,existing.id]
      );
    } else {
      await client.query(
        "INSERT INTO public.institution_product_versions ("+
        "id,institution_product_id,version_number,status,effective_from,effective_to,"+
        "conditions,requirements,required_documents,variables_configuration,"+
        "change_reason,version_hash,published_at,published_by,created_by) "+
        "VALUES (gen_random_uuid()::varchar,$1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::text[],"+
        "$9::jsonb,$10,$11,$12,$13,$14)",
        [productId,version.version_number,...fields.slice(0,8),hash,
          version.published_at,version.status==="published"?stageAdminId:null,stageAdminId]
      );
    }
  }

  const after = (await client.query(
    "SELECT (SELECT count(*)::int FROM public.users) users," +
    "(SELECT count(*)::int FROM public.clients) clients,"+
    "(SELECT count(*)::int FROM public.credit_submission_requests) submissions,"+
    "(SELECT count(*)::int FROM public.institution_products WHERE status='published') published_products,"+
    "(SELECT count(*)::int FROM public.institution_product_versions WHERE status='published') published_versions"
  )).rows[0];
  if (Number(after.users)!==Number(before.users)||
      Number(after.clients)!==Number(before.clients)||
      Number(after.submissions)!==Number(before.submissions)||
      Number(after.published_products)!==52||
      Number(after.published_versions)!==52) {
    throw new Error("CATALOG_SYNC_POSTCONDITION_FAILED");
  }
  console.info("[STAGING-SYNC-APPLIED]",JSON.stringify({
    institutions:26,products:52,versions:54,extraLegacyRetained:extraOffers,
    users:Number(after.users),clients:Number(after.clients),
    submissions:Number(after.submissions)
  }));
}

export async function reconcileStagingCatalog(pool: Pool): Promise<void> {
  if (!process.env.STAGING_CATALOG_SYNC_CHUNKS) return;
  assertStaging();
  const source=requireCatalogPayload()!;
  const apply=process.env.STAGING_CATALOG_SYNC_APPLY==="CONFIRMED_STAGE_ONLY_20261103";
  const client=await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    await client.query("SET LOCAL statement_timeout='30000ms'");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('staging-catalog-sync-20261103'))");
    // The on-database catalog backup must have been created and verified.
    const backup=await client.query(
      "SELECT to_regclass('staging_catalog_backup_20261103.manifest') IS NOT NULL AS exists"
    );
    if (!backup.rows[0].exists) throw new Error("CATALOG_SYNC_NO_VERIFIED_BACKUP");
    await run(client,source,apply);
    if (apply) await client.query("COMMIT");
    else await client.query("ROLLBACK");
  } catch(error) {
    await client.query("ROLLBACK").catch(()=>{});
    throw error;
  } finally {
    client.release();
  }
}
