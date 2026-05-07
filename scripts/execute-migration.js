#!/usr/bin/env node
/**
 * Supabase SQL Executor - Direct execution via psql
 * This script executes SQL migrations against Supabase PostgreSQL
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Load environment
require('dotenv').config();

const migrationFile = process.argv[2];
if (!migrationFile) {
  console.error('Usage: node scripts/execute-migration.js <migration-file>');
  process.exit(1);
}

const sqlPath = path.resolve(migrationFile);
if (!fs.existsSync(sqlPath)) {
  console.error(`Migration file not found: ${sqlPath}`);
  process.exit(1);
}

const SQL = fs.readFileSync(sqlPath, 'utf-8');

// Get DATABASE_URL from environment (for Vercel/Railway deployments)
// For Supabase, construct from VITE_SUPABASE_URL
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;

if (!SUPABASE_URL) {
  console.error('❌ SUPABASE_URL not found in environment variables');
  console.error('   Set VITE_SUPABASE_URL or SUPABASE_URL in .env');
  process.exit(1);
}

// For Supabase, we need to use the management API or direct DB connection
// Let's try using supabase CLI if available
console.log('📝 Attempting migration via Supabase CLI...');
console.log(`📄 File: ${path.basename(sqlPath)}\n`);

try {
  // Try to use supabase CLI to push migrations
  const result = execSync('supabase status', { encoding: 'utf-8', stdio: 'pipe' });
  console.log('✅ Supabase CLI available');
  
  // Create a temporary migration
  const migDir = path.join(process.cwd(), 'supabase', 'migrations');
  if (!fs.existsSync(migDir)) {
    fs.mkdirSync(migDir, { recursive: true });
  }
  
  const timestamp = Date.now();
  const tempMigFile = path.join(migDir, `${timestamp}_auth_columns.sql`);
  fs.writeFileSync(tempMigFile, SQL);
  
  console.log(`\n📋 Temporary migration: ${tempMigFile}`);
  console.log('\n⚙️ Executing migration...\n');
  
  // Execute via supabase db push
  const pushResult = execSync('supabase db push', { encoding: 'utf-8', cwd: process.cwd() });
  console.log(pushResult);
  
  console.log('\n✅ Migration executed successfully!');
  
  // Cleanup
  fs.unlinkSync(tempMigFile);
  
} catch (error) {
  console.log('⚠️ Supabase CLI method failed, trying Node.js direct approach...\n');
  
  try {
    // Alternative: Use @supabase/supabase-js to execute queries
    const { createClient } = require('@supabase/supabase-js');
    const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!SERVICE_ROLE_KEY) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY not found - cannot execute raw SQL');
    }
    
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    
    // Split SQL statements
    const statements = SQL.split(';')
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('--'));
    
    console.log(`Found ${statements.length} SQL statement(s) to execute\n`);
    
    (async () => {
      for (let i = 0; i < statements.length; i++) {
        const stmt = statements[i];
        console.log(`[${i + 1}/${statements.length}] Executing statement...`);
        console.log(`${stmt.substring(0, 80)}${stmt.length > 80 ? '...' : ''}\n`);
        
        try {
          const { data, error } = await supabase.rpc('execute_sql', {
            sql_query: stmt
          });
          
          if (error) throw error;
          console.log('✅ Success\n');
        } catch (e) {
          // If execute_sql function doesn't exist, try direct query
          if (e.message.includes('function execute_sql') || e.message.includes('does not exist')) {
            console.log('⚠️ execute_sql RPC not available\n');
            console.log('ℹ️ For security, Supabase typically doesn\'t allow raw SQL execution.');
            console.log('   Instead, please execute this SQL manually:\n');
            console.log('---SQL---');
            console.log(SQL);
            console.log('---END---\n');
            console.log('Options:');
            console.log('1. Run in Supabase Dashboard > SQL Editor');
            console.log('2. Use psql CLI with DATABASE_URL');
            console.log('3. Use drizzle migrations: npm run db:migrate\n');
            process.exit(1);
          }
          throw e;
        }
      }
      
      console.log('✨ All migrations completed successfully!');
    })();
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('\n⚠️ For security, Supabase restricts raw SQL execution.');
    console.error('   Execute this SQL manually via:');
    console.error('   1. Supabase Dashboard > SQL Editor > Paste and run');
    console.error('   2. psql CLI: psql $DATABASE_URL < migration.sql');
    console.error('\nSQL to execute:');
    console.log('---');
    console.log(SQL);
    console.log('---\n');
    process.exit(1);
  }
}
