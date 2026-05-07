#!/usr/bin/env node
/**
 * Direct SQL Migration Runner
 * Executes SQL migration using pg pool directly
 */

const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

// Get DATABASE_URL from Railway variables output
// This is a manual workaround since we can't use railway shell --silent from Windows  

const migrationSQLPath = path.join(__dirname, "migrations", "001_add_auth_columns_to_users.sql");

if (!fs.existsSync(migrationSQLPath)) {
  console.error(`❌ Migration file not found: ${migrationSQLPath}`);
  process.exit(1);
}

const migrationSQL = fs.readFileSync(migrationSQLPath, "utf-8");

const DATABASE_URL = process.env.DATABASE_URL || process.env.DATABASE_PUBLIC_URL;

if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL or DATABASE_PUBLIC_URL not found in environment");
  process.exit(1);
}

async function runMigration() {
  const pool = new Pool({ connectionString: DATABASE_URL });
  
  try {
    console.log("📝 Starting migration...\n");
    
    // Split SQL statements
    const statements = migrationSQL
      .split(";")
      .map(s => s.trim())
      .filter(s => s && !s.startsWith("--"));
    
    console.log(`Found ${statements.length} SQL statement(s)\n`);
    
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      const preview = stmt.substring(0, 80) + (stmt.length > 80 ? "..." : "");
      
      console.log(`[${i + 1}/${statements.length}] Executing: ${preview}`);
      
      try {
        const result = await pool.query(stmt);
        console.log(`✅ Success (${result.rowCount || 0} rows affected)\n`);
      } catch (error) {
        console.error(`❌ Error: ${error.message}\n`);
        throw error;
      }
    }
    
    console.log("✨ Migration completed successfully!");
    process.exit(0);
    
  } catch (error) {
    console.error("\n❌ Migration failed:", error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
