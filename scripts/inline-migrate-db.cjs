const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

(async () => {
  const DATABASE_URL = process.env.DATABASE_URL || process.env.DATABASE_PUBLIC_URL;
  
  if (!DATABASE_URL) {
    console.error("❌ DATABASE_URL not set");
    process.exit(1);
  }

  const migrationSQLPath = path.join(process.cwd(), "scripts/migrations/001_add_auth_columns_to_users.sql");
  const migrationSQL = fs.readFileSync(migrationSQLPath, "utf-8");

  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    console.log("📝 Starting database migration...\n");

    const statements = migrationSQL
      .split(";")
      .map((s) =>
        s
          .split("\n")
          .filter((line) => !line.trim().startsWith("--"))
          .join("\n")
          .trim(),
      )
      .filter((s) => s.length > 0);

    console.log(`📊 Found ${statements.length} SQL statement(s)\n`);

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      const preview = stmt.length > 100 ? stmt.substring(0, 97) + "..." : stmt;

      console.log(`[${i + 1}/${statements.length}] ${preview}`);

      try {
        const result = await pool.query(stmt);
        const affectedRows = result.rowCount || 0;
        console.log(`✅ Success${affectedRows > 0 ? ` (${affectedRows} rows)` : ""}\n`);
      } catch (error) {
        if (error.message.includes("already exists")) {
          console.log(`⚠️ Column already exists (skipping)\n`);
        } else {
          throw error;
        }
      }
    }

    console.log("✨ Migration completed successfully!");
    console.log("\n📋 Verifying columns...\n");

    const verifySQL = `
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name='users' AND table_schema='public'
      ORDER BY ordinal_position
    `;

    const result = await pool.query(verifySQL);
    const columns = result.rows.map(r => r.column_name);
    const requiredColumns = ['password', 'auth_method', 'reset_token', 'reset_token_expiry', 'is_active', 'updated_at'];

    const missing = requiredColumns.filter(c => !columns.includes(c));

    if (missing.length === 0) {
      console.log("✅ All required columns present:");
      result.rows.forEach((row, idx) => {
        if (idx < 15) console.log(`   - ${row.column_name}: ${row.data_type}`);
      });
      if (result.rows.length > 15) console.log(`   ... and ${result.rows.length - 15} more`);
      console.log("\n🎉 Database is ready for registration!");
    } else {
      console.log("❌ Missing columns:", missing);
      process.exit(1);
    }

    process.exit(0);
  } catch (error) {
    console.error("\n❌ Migration failed:", error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
