#!/usr/bin/env node
/**
 * Railway Hosted Migration - Detects if running in Railway environment
 * If in Railway: Uses direct database connection
 * If local: Provides instructions
 */

const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const migrationSQLPath = path.join(__dirname, "migrations", "001_add_auth_columns_to_users.sql");

if (!fs.existsSync(migrationSQLPath)) {
  console.error(`❌ Migration file not found: ${migrationSQLPath}`);
  process.exit(1);
}

const migrationSQL = fs.readFileSync(migrationSQLPath, "utf-8");

// Check if running in Railway environment
const isInRailway = !!process.env.RAILWAY_ENVIRONMENT;

async function runMigration() {
  const DATABASE_URL = process.env.DATABASE_URL;
  
  if (!DATABASE_URL) {
    console.error("❌ DATABASE_URL environment variable not set");
    console.error("\nTo run this locally, use:");
    console.error("  railway shell");
    console.error("  node scripts/run-db-migration.js\n");
    console.log("Or from package.json:");
    console.log("  npm run migrate:staging\n");
    process.exit(1);
  }
  
  const pool = new Pool({ connectionString: DATABASE_URL });
  
  try {
    console.log(`📝 Starting database migration...`);
    console.log(`${isInRailway ? "🚆 Running in Railway environment" : "💻 Running locally"}\n`);
    
    // Split SQL statements
    const statements = migrationSQL
      .split(";")
      .map(s => s.trim())
      .filter(s => s && !s.startsWith("--"));
    
    console.log(`📊 Found ${statements.length} SQL statement(s)\n`);
    
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      const preview = stmt.length > 100 
        ? stmt.substring(0, 97) + "..." 
        : stmt;
      
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
    console.log("\n📋 Verifying schema...");
    
    // Verify the columns were added
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
      console.log("✅ All required columns present:\n");
      result.rows.forEach(row => {
        console.log(`   - ${row.column_name}: ${row.data_type}`);
      });
    } else {
      console.log("❌ Missing columns:", missing);
      process.exit(1);
    }
    
    console.log("\n🎉 Database is ready for registration!");
    process.exit(0);
    
  } catch (error) {
    console.error("\n❌ Migration failed:", error.message);
    console.error("\nFull error:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
