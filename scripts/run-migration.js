#!/usr/bin/env node
/**
 * Migration Runner: Execute SQL migrations against Supabase
 * Usage: node scripts/run-migration.js <migration-file>
 */

const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
  process.exit(1);
}

const migrationFile = process.argv[2];
if (!migrationFile) {
  console.error('❌ Please provide migration file path');
  console.error('Usage: node scripts/run-migration.js <migration-file>');
  process.exit(1);
}

const sqlPath = path.resolve(migrationFile);
if (!fs.existsSync(sqlPath)) {
  console.error(`❌ Migration file not found: ${sqlPath}`);
  process.exit(1);
}

const sql = fs.readFileSync(sqlPath, 'utf-8');

async function runMigration() {
  try {
    console.log(`📝 Running migration: ${path.basename(sqlPath)}`);
    console.log('---');

    // Use Supabase JavaScript client to execute SQL
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Split SQL by semicolon and execute each statement
    const statements = sql.split(';').filter(s => s.trim() && !s.trim().startsWith('--'));

    for (const statement of statements) {
      const trimmed = statement.trim();
      if (!trimmed) continue;

      console.log(`⚙️ Executing:\n${trimmed}\n`);

      try {
        const { data, error } = await supabase.rpc('exec', { sql: trimmed });
        
        if (error) {
          console.error(`❌ Error: ${error.message}`);
          if (error.details) console.error(`Details: ${error.details}`);
        } else {
          console.log(`✅ Success`);
          if (data) console.log(`Result:`, data);
        }
      } catch (e) {
        console.error(`❌ Execution error: ${e.message}`);
      }
    }

    console.log('---');
    console.log('✨ Migration completed');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

runMigration();
