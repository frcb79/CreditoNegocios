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
    // 0. Ensure uuid extensions if available
    try {
      await client.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);
    } catch (e) {
      console.log("ℹ️ [AutoMigrate] pgcrypto extension check:", (e as any).message);
    }

    // 1. Ensure sessions table exists for connect-pg-simple
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS public.sessions (
          sid VARCHAR NOT NULL COLLATE "default",
          sess JSON NOT NULL,
          expire TIMESTAMP(6) NOT NULL,
          CONSTRAINT "sessions_pkey" PRIMARY KEY ("sid")
        );
        CREATE INDEX IF NOT EXISTS "IDX_sessions_expire" ON public.sessions ("expire");
      `);
      console.log("✅ [AutoMigrate] Sessions table verified");
    } catch (err) {
      console.error("⚠️ [AutoMigrate] Error verifying sessions table:", err);
    }

    // 2. Ensure users table and ALL columns exist
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS public.users (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          email VARCHAR UNIQUE
        );
      `);

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
          ADD COLUMN IF NOT EXISTS referral_code VARCHAR,
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

      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS "users_referral_code_unique" 
        ON public.users ("referral_code") 
        WHERE referral_code IS NOT NULL;
      `);
      console.log("✅ [AutoMigrate] Users table and columns verified");
    } catch (err) {
      console.error("⚠️ [AutoMigrate] Error verifying users table/columns:", err);
    }

    // 3. Ensure clients table columns exist
    try {
      await client.query(`
        ALTER TABLE IF EXISTS public.clients
          ADD COLUMN IF NOT EXISTS profiling_data JSONB DEFAULT '{}',
          ADD COLUMN IF NOT EXISTS ingreso_mensual_promedio VARCHAR,
          ADD COLUMN IF NOT EXISTS edad_cliente VARCHAR,
          ADD COLUMN IF NOT EXISTS estado_civil VARCHAR,
          ADD COLUMN IF NOT EXISTS nivel_educativo VARCHAR,
          ADD COLUMN IF NOT EXISTS nivel_educacion_accionista VARCHAR,
          ADD COLUMN IF NOT EXISTS experiencia_crediticia VARCHAR,
          ADD COLUMN IF NOT EXISTS egreso_mensual_promedio VARCHAR,
          ADD COLUMN IF NOT EXISTS puesto VARCHAR,
          ADD COLUMN IF NOT EXISTS antiguedad_laboral VARCHAR,
          ADD COLUMN IF NOT EXISTS nombre_comercial VARCHAR,
          ADD COLUMN IF NOT EXISTS ocupacion VARCHAR,
          ADD COLUMN IF NOT EXISTS direccion_negocio_aplica VARCHAR,
          ADD COLUMN IF NOT EXISTS es_misma_direccion_negocio VARCHAR,
          ADD COLUMN IF NOT EXISTS calle_negocio VARCHAR,
          ADD COLUMN IF NOT EXISTS numero_negocio VARCHAR,
          ADD COLUMN IF NOT EXISTS interior_negocio VARCHAR,
          ADD COLUMN IF NOT EXISTS codigo_postal_negocio VARCHAR,
          ADD COLUMN IF NOT EXISTS estado_negocio VARCHAR;
      `);
      console.log("✅ [AutoMigrate] Clients table columns verified");
    } catch (err) {
      console.error("⚠️ [AutoMigrate] Error verifying clients columns:", err);
    }

    // 4. Ensure all columns in commissions table
    try {
      await client.query(`
        ALTER TABLE IF EXISTS public.commissions
          ADD COLUMN IF NOT EXISTS master_broker_id VARCHAR,
          ADD COLUMN IF NOT EXISTS commission_type VARCHAR,
          ADD COLUMN IF NOT EXISTS broker_share NUMERIC(15, 2),
          ADD COLUMN IF NOT EXISTS master_broker_share NUMERIC(15, 2),
          ADD COLUMN IF NOT EXISTS app_share NUMERIC(15, 2);
      `);
      console.log("✅ [AutoMigrate] Commissions table columns verified");
    } catch (err) {
      console.error("⚠️ [AutoMigrate] Error verifying commissions columns:", err);
    }

    // 5. Ensure all columns in financial_institutions table
    try {
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
      console.log("✅ [AutoMigrate] Financial institutions table columns verified");
    } catch (err) {
      console.error("⚠️ [AutoMigrate] Error verifying financial institutions columns:", err);
    }

    // 6. Update existing users to 'local' auth so they can authenticate locally
    try {
      await client.query(`
        UPDATE public.users 
        SET auth_method = 'local', is_active = TRUE, updated_at = NOW()
        WHERE auth_method IS NULL OR auth_method = 'replit';
      `);
    } catch (err) {
      console.error("⚠️ [AutoMigrate] Error updating auth_method:", err);
    }

    // 7. Setup / repair the 3 dedicated test accounts with their distinct roles and Prueba1$ password
    const testPassword = process.env.ADMIN_FALLBACK_PASSWORD || 'Prueba1$';
    const defaultHashedPassword = await bcrypt.hash(testPassword, 10);

    const dedicatedAccounts = [
      { 
        email: 'francocb79@gmail.com', 
        firstName: 'Franco', 
        lastName: 'Admin', 
        role: 'super_admin',
        referralCode: null,
        permissions: JSON.stringify({ modules: ["*"], actions: ["*"] }),
      },
      { 
        email: 'fcb@creditonegocios.com.mx', 
        firstName: 'Franco', 
        lastName: 'Carreño', 
        role: 'master_broker',
        referralCode: 'MB-FRANCO',
        permissions: JSON.stringify({ 
          modules: ["dashboard", "clientes", "creditos", "comisiones", "red_brokers", "documentos", "reportes", "usuarios", "configuracion"], 
          actions: ["view", "edit", "submit_proposals", "manage_users"],
          scope: "network"
        }),
      },
      { 
        email: 'francocb79@yahoo.com', 
        firstName: 'Franco', 
        lastName: 'Broker', 
        role: 'broker',
        referralCode: null,
        permissions: JSON.stringify({ 
          modules: ["dashboard", "clientes", "creditos", "documentos", "sistema_productos", "configuracion"], 
          actions: ["view", "edit", "submit_proposals"],
          scope: "own"
        }),
      },
    ];

    let masterBrokerDbId: string | null = null;

    for (const acc of dedicatedAccounts) {
      try {
        const existing = await client.query(
          `SELECT id, email, password, role, is_active, auth_method FROM public.users WHERE lower(trim(email)) = lower(trim($1))`,
          [acc.email]
        );

        if (existing.rows.length === 0) {
          const insertRes = await client.query(
            `INSERT INTO public.users (
              id, email, password, auth_method, first_name, last_name, role, referral_code, is_active, permissions, created_at, updated_at
            ) VALUES (
              gen_random_uuid(), lower(trim($1)), $2, 'local', $3, $4, $5, $6, true, $7::jsonb, NOW(), NOW()
            ) RETURNING id`,
            [acc.email, defaultHashedPassword, acc.firstName, acc.lastName, acc.role, acc.referralCode, acc.permissions]
          );
          console.log(`✅ [AutoMigrate] Created ${acc.role} account: ${acc.email}`);
          if (acc.role === 'master_broker') {
            masterBrokerDbId = insertRes.rows[0]?.id;
          }
        } else {
          const updateRes = await client.query(
            `UPDATE public.users 
             SET role = $2, 
                 is_active = TRUE, 
                 auth_method = 'local',
                 permissions = $3::jsonb,
                 password = $4,
                 first_name = COALESCE(first_name, $5),
                 last_name = COALESCE(last_name, $6),
                 referral_code = COALESCE(referral_code, $7),
                 updated_at = NOW()
             WHERE lower(trim(email)) = lower(trim($1))
             RETURNING id`,
            [acc.email, acc.role, acc.permissions, defaultHashedPassword, acc.firstName, acc.lastName, acc.referralCode]
          );
          console.log(`✅ [AutoMigrate] Synchronized ${acc.role} account: ${acc.email} (password set to: ${testPassword})`);
          if (acc.role === 'master_broker') {
            masterBrokerDbId = updateRes.rows[0]?.id;
          }
        }
      } catch (userErr) {
        console.error(`⚠️ [AutoMigrate] Error syncing account ${acc.email}:`, userErr);
      }
    }

    // Link the broker francocb79@yahoo.com to the master broker fcb@creditonegocios.com.mx
    if (masterBrokerDbId) {
      try {
        await client.query(
          `UPDATE public.users 
           SET master_broker_id = $1 
           WHERE lower(trim(email)) = 'francocb79@yahoo.com'`,
          [masterBrokerDbId]
        );
        console.log(`✅ [AutoMigrate] Linked broker francocb79@yahoo.com to Master Broker fcb@creditonegocios.com.mx`);
      } catch (linkErr) {
        console.error("⚠️ [AutoMigrate] Error linking broker to master broker:", linkErr);
      }
    }

    // 8. Ensure system user 'user-super-admin' exists for FK integrity in legacy scripts & migrations
    try {
      const sysUser = await client.query(`SELECT id FROM public.users WHERE id = 'user-super-admin'`);
      if (sysUser.rows.length === 0) {
        await client.query(`
          INSERT INTO public.users (
            id, email, password, auth_method, first_name, last_name, role, is_active, permissions, created_at, updated_at
          ) VALUES (
            'user-super-admin', 'system-admin@creditonegocios.com.mx', $1, 'local', 'Sistema', 'SuperAdmin', 'super_admin', true, '{"modules": ["*"], "actions": ["*"]}', NOW(), NOW()
          ) ON CONFLICT (id) DO UPDATE SET is_active = TRUE, role = 'super_admin'
        `, [defaultHashedPassword]);
        console.log("✅ [AutoMigrate] Created system user: user-super-admin");
      } else {
        console.log("✅ [AutoMigrate] Verified system user: user-super-admin");
      }
    } catch (sysErr) {
      console.error("⚠️ [AutoMigrate] Error verifying user-super-admin:", sysErr);
    }

    console.log("✨ [AutoMigrate] Schema verification and user sync completed successfully!");
  } catch (error) {
    console.error("❌ [AutoMigrate] General schema verification error:", error);
  } finally {
    if (client) {
      client.release();
    }
  }
}
