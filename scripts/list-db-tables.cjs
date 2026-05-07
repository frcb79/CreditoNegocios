const { Pool } = require("pg");

const connectionString = process.env.DATABASE_URL || process.env.DATABASE_PUBLIC_URL;

if (!connectionString) {
  console.error("DATABASE_URL or DATABASE_PUBLIC_URL is required");
  process.exit(1);
}

(async () => {
  const pool = new Pool({ connectionString });
  try {
    const sql = "SELECT table_schema, table_name FROM information_schema.tables WHERE table_type='BASE TABLE' AND table_schema NOT IN ('pg_catalog','information_schema') ORDER BY table_schema, table_name";
    const r = await pool.query(sql);
    console.log("tables:", r.rows.length);
    for (const row of r.rows) {
      console.log(`${row.table_schema}.${row.table_name}`);
    }
  } finally {
    await pool.end();
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
