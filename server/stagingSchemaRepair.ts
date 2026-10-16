/**
 * Staging-only, additive compatibility repair for synthetic legacy QA data.
 *
 * The canonical 0004/0005/0007/0009 migrations are NOT automatically applied
 * to Production. Production needs separate attribution review, backups and
 * explicit migration approval. This repair does no UPDATE/DELETE/backfill.
 */
import type { PoolClient } from "pg";

const columns: Record<string, Record<string,string>> = {
  credits: {
    institution_product_id: "VARCHAR",
    version_number: "INTEGER",
    origin_master_broker_id: "VARCHAR",
  },
  commissions: {
    institution_product_id: "VARCHAR",
    version_number: "INTEGER",
  },
  credit_submission_targets: {
    institution_product_id: "VARCHAR",
    version_number: "INTEGER",
  },
  credit_submission_requests: {
    origin_master_broker_id: "VARCHAR",
  },
  legal_acceptances: {
    template_sha256: "VARCHAR(64)",
    personalized_sha256: "VARCHAR(64)",
    personalized_snapshot: "JSONB",
  },
  institution_products: {
    name: "VARCHAR",
    product_type: "VARCHAR",
    slug: "VARCHAR",
    description: "TEXT",
    status: "VARCHAR",
    current_version_number: "INTEGER",
  },
  institution_product_versions: {
    institution_product_id: "VARCHAR",
    version_number: "INTEGER",
    status: "VARCHAR",
    effective_from: "TIMESTAMP",
    effective_to: "TIMESTAMP",
    conditions: "JSONB",
    requirements: "JSONB",
    required_documents: "TEXT[]",
    variables_configuration: "JSONB",
    change_reason: "TEXT",
    version_hash: "VARCHAR",
    published_at: "TIMESTAMP",
    published_by: "VARCHAR",
    created_by: "VARCHAR",
    created_at: "TIMESTAMP",
    updated_at: "TIMESTAMP",
  },
};

export function getMissingPrelaunchSchemaColumns(
  presentRows: Array<{table_name:string;column_name:string}>,
):string[]{
  const present=new Set(presentRows.map(r=>r.table_name+"."+r.column_name));
  return Object.entries(columns).flatMap(([table,fields])=>
    Object.keys(fields).filter(c=>!present.has(table+"."+c)).map(c=>table+"."+c));
}

/** Read-only readiness check. A reachable DB does not imply a working schema. */
export async function checkPrelaunchSchemaReadiness(
  db: Pick<PoolClient,"query">,
):Promise<{ready:boolean;missingCount:number}>{
  const rows=await db.query(
    "SELECT table_name,column_name FROM information_schema.columns WHERE "+
    "table_schema='public' AND table_name=ANY($1::text[])",
    [Object.keys(columns)],
  );
  const missing=getMissingPrelaunchSchemaColumns(rows.rows);
  return {ready:missing.length===0,missingCount:missing.length};
}

export async function applyAdditivePrelaunchSchemaRepair(
  client: Pick<PoolClient,"query">, schema = "public",
): Promise<void> {
  // Only static schema names from this module or TEST_DATABASE_URL QA fixtures.
  if(!/^[a-z][a-z0-9_]{0,60}$/.test(schema)) throw new Error("SCHEMA_NAME_INVALID");
  const quoted = (name:string)=>'"'+name+'"';
  await client.query("BEGIN");
  try{
    const versions = quoted(schema)+"."+quoted("institution_product_versions");
    // A table created here starts empty and draft: never publish or reattribute
    // historical institution offers automatically.
    await client.query(
      "CREATE TABLE IF NOT EXISTS "+versions+" ("+
      "id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),"+
      "institution_product_id VARCHAR NOT NULL REFERENCES "+quoted(schema)+".institution_products(id),"+
      "version_number INTEGER NOT NULL DEFAULT 1,"+
      "status VARCHAR NOT NULL DEFAULT 'draft',"+
      "effective_from TIMESTAMP,effective_to TIMESTAMP,"+
      "conditions JSONB DEFAULT '{}'::jsonb,requirements JSONB DEFAULT '{}'::jsonb,"+
      "required_documents TEXT[] DEFAULT ARRAY[]::TEXT[],"+
      "variables_configuration JSONB DEFAULT '{}'::jsonb,"+
      "change_reason TEXT,version_hash VARCHAR,published_at TIMESTAMP,"+
      "published_by VARCHAR,created_by VARCHAR,"+
      "created_at TIMESTAMP DEFAULT NOW(),updated_at TIMESTAMP DEFAULT NOW())",
    );
    for(const [table,fields] of Object.entries(columns)){
      const full=quoted(schema)+"."+quoted(table);
      for(const [column,definition] of Object.entries(fields)){
        await client.query("ALTER TABLE "+full+" ADD COLUMN IF NOT EXISTS "+
          quoted(column)+" "+definition);
      }
    }
    // Confirm critical schema exists *inside* the transaction. No optimistic
    // "verified" log when a necessary table/column remains absent.
    const rows=await client.query(
      "SELECT table_name,column_name FROM information_schema.columns WHERE "+
      "table_schema=$1 AND table_name=ANY($2::text[])",
      [schema,Object.keys(columns)],
    );
    const missing=getMissingPrelaunchSchemaColumns(rows.rows);
    if(missing.length)throw new Error("STAGING_SCHEMA_INCOMPLETE: "+missing.join(", "));
    await client.query("COMMIT");
    console.log("[STAGING-SCHEMA] Required additive columns verified. No legacy offer publication or data deletions.");
  }catch(err){
    await client.query("ROLLBACK").catch(()=>{});
    throw err;
  }
}
export async function repairStagingSchemaOnStartup(client:Pick<PoolClient,"query">){
  if(process.env.RAILWAY_ENVIRONMENT_NAME?.toLowerCase()!=="staging")return;
  await applyAdditivePrelaunchSchemaRepair(client);
}
