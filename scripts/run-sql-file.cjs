const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const fileArg = process.argv[2];
if (!fileArg) {
  console.error("Usage: node scripts/run-sql-file.cjs <sql-file-path>");
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL || process.env.DATABASE_PUBLIC_URL;
if (!connectionString) {
  console.error("DATABASE_URL or DATABASE_PUBLIC_URL is required");
  process.exit(1);
}

const sqlPath = path.resolve(process.cwd(), fileArg);
if (!fs.existsSync(sqlPath)) {
  console.error(`SQL file not found: ${sqlPath}`);
  process.exit(1);
}

const raw = fs.readFileSync(sqlPath, "utf8");
const statements = raw
  .split(";")
  .map((s) =>
    s
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n")
      .trim(),
  )
  .filter((s) => s.length > 0);

(async () => {
  const pool = new Pool({ connectionString });
  try {
    console.log(`Executing ${statements.length} SQL statements from ${fileArg}`);
    let ok = 0;
    let skipped = 0;
    for (let i = 0; i < statements.length; i += 1) {
      const stmt = statements[i];
      try {
        await pool.query(stmt);
        ok += 1;
      } catch (e) {
        const msg = String(e.message || "");
        if (msg.includes("already exists")) {
          skipped += 1;
          continue;
        }
        console.error(`Failed at statement ${i + 1}: ${msg}`);
        throw e;
      }
    }
    console.log(`Done. Success: ${ok}, Skipped: ${skipped}`);
  } finally {
    await pool.end();
  }
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
