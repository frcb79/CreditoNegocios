import { pool } from "./db";
import bcrypt from "bcrypt";

export async function runAutoMigration(): Promise<void> {
  if (process.env.USE_MEMORY_STORAGE === "true") {
    console.log("⚡ Memory storage active, skipping Postgres schema auto-migration.");
    return;
  }

  console.log("🔄 Running automatic database schema verification and repair...");

  let client;
  try {
    client = await pool.connect();
  } catch (connErr) {
    console.error("⚠️ [AutoMigrate] Could not connect to PostgreSQL:", connErr);
    return;
  }

  try {
    // 1. Ensure all columns in users table
    await client.query(`
      ALTER TABLE IF EXISTS public.users
        ADD COLUMN IF NOT EXISTS password VARCHAR,
        ADD COLUMN IF NOT EXISTS auth_method VARCHAR DEFAULT 'local',
        ADD COLUMN IF NOT EXISTS reset_token VARCHAR,
        ADD COLUMN IF NOT EXISTS reset_token_expiry TIMESTAMP,
        ADD COLUMN IF NOT EXISTS first_name VARCHAR,
        ADD COLUMN IF NOT EXISTS last_name VARCHAR,
        ADD COLUMN IF NOT EXISTS profile_image_url VARCHAR,
        ADD COLUMN IF NOT EXISTS role VARCHAR DEFAULT 'broker',
        ADD COLUMN IF NOT EXISTS master_broker_id VARCHAR,
        ADD COLUMN IF NOT EXISTS custom_logo VARCHAR,
        ADD COLUMN IF NOT EXISTS brand_name VARCHAR,
        ADD COLUMN IF NOT EXISTS primary_color VARCHAR,
        ADD COLUMN IF NOT EXISTS secondary_color VARCHAR,
        ADD COLUMN IF NOT EXISTS is_white_label BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS auto_register_brokers BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS profile_type VARCHAR,
        ADD COLUMN IF NOT EXISTS profile_data JSONB DEFAULT '{}',
        ADD COLUMN IF NOT EXISTS commercial_references JSONB DEFAULT '[]',
        ADD COLUMN IF NOT EXISTS bank_name VARCHAR,
        ADD COLUMN IF NOT EXISTS clabe VARCHAR,
        ADD COLUMN IF NOT EXISTS account_number VARCHAR,
        ADD COLUMN IF NOT EXISTS account_holder VARCHAR,
        ADD COLUMN IF NOT EXISTS network_commission_rates JSONB DEFAULT '{}',
        ADD COLUMN IF NOT EXISTS custom_role_title VARCHAR,
        ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{}',
        ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE,
        ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW(),
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
    `);

    // 2. Ensure all columns in commissions table
    await client.query(`
      ALTER TABLE IF EXISTS public.commissions
        ADD COLUMN IF NOT EXISTS master_broker_id VARCHAR,
        ADD COLUMN IF NOT EXISTS commission_type VARCHAR,
        ADD COLUMN IF NOT EXISTS broker_share NUMERIC(15, 2),
        ADD COLUMN IF NOT EXISTS master_broker_share NUMERIC(15, 2),
        ADD COLUMN IF NOT EXISTS app_share NUMERIC(15, 2);
    `);

    // 3. Ensure all columns in financial_institutions table
    await client.query(`
      ALTER TABLE IF EXISTS public.financial_institutions
        ADD COLUMN IF NOT EXISTS commission_rates JSONB DEFAULT '{}',
        ADD COLUMN IF NOT EXISTS additional_costs JSONB DEFAULT '[]',
        ADD COLUMN IF NOT EXISTS requirements JSONB DEFAULT '{}',
        ADD COLUMN IF NOT EXISTS products JSONB DEFAULT '[]',
        ADD COLUMN IF NOT EXISTS accepted_profiles TEXT[] DEFAULT ARRAY[]::text[],
        ADD COLUMN IF NOT EXISTS application_process JSONB DEFAULT '[]',
        ADD COLUMN IF NOT EXISTS estimated_timeframes JSONB DEFAULT '{}',
        ADD COLUMN IF NOT EXISTS approval_tips TEXT[] DEFAULT ARRAY[]::text[],
        ADD COLUMN IF NOT EXISTS required_documents TEXT[] DEFAULT ARRAY[]::text[],
        ADD COLUMN IF NOT EXISTS created_by VARCHAR,
        ADD COLUMN IF NOT EXISTS created_by_admin BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE,
        ADD COLUMN IF NOT EXISTS notes TEXT,
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
    `);

    // 4. Update existing users to 'local' auth so they can authenticate locally
    await client.query(`
      UPDATE public.users 
      SET auth_method = 'local', is_active = TRUE, updated_at = NOW()
      WHERE auth_method IS NULL OR auth_method = 'replit';
    `);

    // 5. Setup / repair the 3 primary Super Admin accounts
    const fallbackPassword = process.env.ADMIN_FALLBACK_PASSWORD || 'Franco2026!*';
    const defaultHashedPassword = await bcrypt.hash(fallbackPassword, 10);

    const superAdminAccounts = [
      { email: 'francocb79@gmail.com', firstName: 'Franco', lastName: 'Admin' },
      { email: 'francocb79@yahoo.com', firstName: 'Franco', lastName: 'Admin' },
      { email: 'fcb@creditonegocios.com.mx', firstName: 'Franco', lastName: 'Carreño' },
    ];

    for (const admin of superAdminAccounts) {
      const existing = await client.query(
        `SELECT id, email, password, role, is_active, auth_method FROM public.users WHERE lower(email) = lower($1)`,
        [admin.email]
      );

      if (existing.rows.length === 0) {
        // Create user if not present
        await client.query(
          `INSERT INTO public.users (
            id, email, password, auth_method, first_name, last_name, role, is_active, permissions, created_at, updated_at
          ) VALUES (
            gen_random_uuid(), $1, $2, 'local', $3, $4, 'super_admin', true, '{"modules": ["*"], "actions": ["*"]}', NOW(), NOW()
          )`,
          [admin.email, defaultHashedPassword, admin.firstName, admin.lastName]
        );
        console.log(`✅ [AutoMigrate] Created Super Admin account: ${admin.email}`);
      } else {
        const row = existing.rows[0];
        const needsPassword = !row.password;
        if (needsPassword) {
          await client.query(
            `UPDATE public.users 
             SET role = 'super_admin', 
                 is_active = TRUE, 
                 auth_method = 'local',
                 permissions = '{"modules": ["*"], "actions": ["*"]}',
                 password = $2,
                 updated_at = NOW()
             WHERE lower(email) = lower($1)`,
            [admin.email, defaultHashedPassword]
          );
          console.log(`✅ [AutoMigrate] Updated Super Admin: ${admin.email} (initialized default password)`);
        } else {
          await client.query(
            `UPDATE public.users 
             SET role = 'super_admin', 
                 is_active = TRUE, 
                 auth_method = 'local',
                 permissions = '{"modules": ["*"], "actions": ["*"]}',
                 updated_at = NOW()
             WHERE lower(email) = lower($1)`,
            [admin.email]
          );
          console.log(`✅ [AutoMigrate] Verified Super Admin: ${admin.email} (existing password preserved)`);
        }
      }
    }

    console.log("✨ [AutoMigrate] Schema verification and user sync completed successfully!");
  } catch (error) {
    console.error("❌ [AutoMigrate] Schema verification error:", error);
  } finally {
    if (client) {
      client.release();
    }
  }
}
