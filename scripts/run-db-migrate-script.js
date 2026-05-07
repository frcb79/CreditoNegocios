#!/usr/bin/env node
/**
 * This file gets executed INSIDE railway shell context
 * to run the database migration with proper environment variables
 */

// This file will be invoked with: railway shell < run-db-migrate-script.js
// It needs to be a Node script that can be piped

require('child_process').execSync('node scripts/run-db-migration.js', {
  stdio: 'inherit',
  cwd: process.cwd()
});
