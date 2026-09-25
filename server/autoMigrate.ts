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
          ADD COLUMN IF NOT EXISTS access_status VARCHAR DEFAULT 'free',
          ADD COLUMN IF NOT EXISTS access_status_expires_at TIMESTAMP,
          ADD COLUMN IF NOT EXISTS access_status_notes TEXT,
          ADD COLUMN IF NOT EXISTS active_promo_id VARCHAR,
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

    // 2b. Ensure tenants and tenant_members tables and indexes exist
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS public.tenants (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          type VARCHAR NOT NULL,
          name VARCHAR NOT NULL,
          slug VARCHAR NOT NULL,
          parent_tenant_id VARCHAR,
          settings JSONB DEFAULT '{}',
          is_active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
        );
      `);

      await client.query(`
        ALTER TABLE IF EXISTS public.tenants
          ADD COLUMN IF NOT EXISTS access_status VARCHAR DEFAULT 'free',
          ADD COLUMN IF NOT EXISTS access_status_expires_at TIMESTAMP;
      `);
      console.log("✅ [AutoMigrate] Tenants table verified");
    } catch (err) {
      console.error("⚠️ [AutoMigrate] Error verifying tenants table:", err);
    }

    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS public.tenant_members (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id VARCHAR NOT NULL,
          user_id VARCHAR NOT NULL,
          role VARCHAR NOT NULL,
          is_active BOOLEAN DEFAULT TRUE,
          joined_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );

        CREATE UNIQUE INDEX IF NOT EXISTS "tenant_members_tenant_user_unique" 
        ON public.tenant_members ("tenant_id", "user_id");

        CREATE INDEX IF NOT EXISTS "tenant_members_user_idx" 
        ON public.tenant_members ("user_id");

        CREATE INDEX IF NOT EXISTS "tenant_members_tenant_idx" 
        ON public.tenant_members ("tenant_id");

        ALTER TABLE IF EXISTS public.tenant_members
          ADD COLUMN IF NOT EXISTS can_originate BOOLEAN DEFAULT false;

        UPDATE public.tenant_members
          SET can_originate = true
          WHERE role = 'owner' AND can_originate IS NOT TRUE;
      `);
      console.log("✅ [AutoMigrate] Tenant members table and indexes verified");
    } catch (err) {
      console.error("⚠️ [AutoMigrate] Error verifying tenant_members table/indexes:", err);
    }

    // 3. Ensure clients table columns exist
    try {
      await client.query(`
        ALTER TABLE IF EXISTS public.clients
          ADD COLUMN IF NOT EXISTS tenant_id VARCHAR,
          ADD COLUMN IF NOT EXISTS created_by VARCHAR,
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
          ADD COLUMN IF NOT EXISTS estado_negocio VARCHAR,
          ADD COLUMN IF NOT EXISTS origin_opportunity VARCHAR;

        CREATE INDEX IF NOT EXISTS "clients_tenant_idx" ON public.clients ("tenant_id");
        CREATE INDEX IF NOT EXISTS "clients_broker_idx" ON public.clients ("broker_id");
      `);
      console.log("✅ [AutoMigrate] Clients table columns verified");
    } catch (err) {
      console.error("⚠️ [AutoMigrate] Error verifying clients columns:", err);
    }

    // 3b. Ensure credits table columns and indexes exist
    try {
      await client.query(`
        ALTER TABLE IF EXISTS public.credits
          ADD COLUMN IF NOT EXISTS tenant_id VARCHAR,
          ADD COLUMN IF NOT EXISTS created_by VARCHAR,
          ADD COLUMN IF NOT EXISTS mortgage_data JSONB DEFAULT '{}';

        CREATE INDEX IF NOT EXISTS "credits_tenant_idx" ON public.credits ("tenant_id");
        CREATE INDEX IF NOT EXISTS "credits_broker_idx" ON public.credits ("broker_id");
        CREATE INDEX IF NOT EXISTS "credits_client_idx" ON public.credits ("client_id");
      `);
      console.log("✅ [AutoMigrate] Credits table columns and indexes verified");
    } catch (err) {
      console.error("⚠️ [AutoMigrate] Error verifying credits columns/indexes:", err);
    }

    // 3c. Ensure documents table columns and indexes exist
    try {
      await client.query(`
        ALTER TABLE IF EXISTS public.documents
          ADD COLUMN IF NOT EXISTS tenant_id VARCHAR,
          ADD COLUMN IF NOT EXISTS uploaded_by VARCHAR;

        CREATE INDEX IF NOT EXISTS "documents_tenant_idx" ON public.documents ("tenant_id");
      `);
      console.log("✅ [AutoMigrate] Documents table columns and indexes verified");
    } catch (err) {
      console.error("⚠️ [AutoMigrate] Error verifying documents columns/indexes:", err);
    }

    // 3d. Ensure credit_submission_requests table columns and indexes exist
    try {
      await client.query(`
        ALTER TABLE IF EXISTS public.credit_submission_requests
          ADD COLUMN IF NOT EXISTS tenant_id VARCHAR,
          ADD COLUMN IF NOT EXISTS created_by VARCHAR,
          ADD COLUMN IF NOT EXISTS mortgage_data JSONB DEFAULT '{}';

        CREATE INDEX IF NOT EXISTS "credit_submissions_tenant_idx" ON public.credit_submission_requests ("tenant_id");
      `);
      console.log("✅ [AutoMigrate] Credit submission requests table columns and indexes verified");
    } catch (err) {
      console.error("⚠️ [AutoMigrate] Error verifying credit_submission_requests columns/indexes:", err);
    }

    // 4. Ensure all columns in commissions table and audit logging (Bloque 6)
    try {
      await client.query(`
        ALTER TABLE IF EXISTS public.commissions
          ADD COLUMN IF NOT EXISTS tenant_id VARCHAR,
          ADD COLUMN IF NOT EXISTS master_broker_id VARCHAR,
          ADD COLUMN IF NOT EXISTS commission_type VARCHAR,
          ADD COLUMN IF NOT EXISTS broker_share NUMERIC(15, 2),
          ADD COLUMN IF NOT EXISTS master_broker_share NUMERIC(15, 2),
          ADD COLUMN IF NOT EXISTS app_share NUMERIC(15, 2),
          ADD COLUMN IF NOT EXISTS frozen_amount NUMERIC(15, 2),
          ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP,
          ADD COLUMN IF NOT EXISTS approved_by VARCHAR,
          ADD COLUMN IF NOT EXISTS paid_by VARCHAR,
          ADD COLUMN IF NOT EXISTS payment_method VARCHAR,
          ADD COLUMN IF NOT EXISTS clabe VARCHAR,
          ADD COLUMN IF NOT EXISTS bank_name VARCHAR,
          ADD COLUMN IF NOT EXISTS account_holder VARCHAR,
          ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR,
          ADD COLUMN IF NOT EXISTS tracking_key VARCHAR,
          ADD COLUMN IF NOT EXISTS provider_response JSONB DEFAULT '{}',
          ADD COLUMN IF NOT EXISTS notes TEXT,
          ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT now();
      `);

      // Safe deduplication before applying unique index (keep paid or most recent)
      await client.query(`
        DELETE FROM public.commissions
        WHERE id IN (
          SELECT id FROM (
            SELECT id, ROW_NUMBER() OVER (
              PARTITION BY credit_id, commission_type 
              ORDER BY CASE WHEN status = 'paid' THEN 0 ELSE 1 END, created_at DESC
            ) as rn
            FROM public.commissions
            WHERE credit_id IS NOT NULL AND commission_type IS NOT NULL
          ) t WHERE t.rn > 1
        );
      `);

      // Ensure indexes and unique constraints
      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS commissions_credit_type_unique 
          ON public.commissions (credit_id, commission_type);
        CREATE UNIQUE INDEX IF NOT EXISTS commissions_idempotency_key_unique 
          ON public.commissions (idempotency_key) WHERE idempotency_key IS NOT NULL;
        CREATE INDEX IF NOT EXISTS commissions_tenant_idx ON public.commissions (tenant_id);
        CREATE INDEX IF NOT EXISTS commissions_status_idx ON public.commissions (status);
      `);

      // Create commission_audit_logs table
      await client.query(`
        CREATE TABLE IF NOT EXISTS public.commission_audit_logs (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          commission_id VARCHAR NOT NULL REFERENCES public.commissions(id) ON DELETE CASCADE,
          action VARCHAR NOT NULL,
          performed_by VARCHAR,
          previous_status VARCHAR,
          new_status VARCHAR,
          details JSONB DEFAULT '{}',
          created_at TIMESTAMP DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS comm_audit_commission_idx ON public.commission_audit_logs (commission_id);
        CREATE INDEX IF NOT EXISTS comm_audit_created_at_idx ON public.commission_audit_logs (created_at);
      `);

      // Backfill status: 'pending' -> 'generated', preserve 'paid'
      await client.query(`
        UPDATE public.commissions
        SET status = 'generated'
        WHERE status = 'pending';
      `);

      // Backfill tenant_id from linked credits
      await client.query(`
        UPDATE public.commissions c
        SET tenant_id = cr.tenant_id
        FROM public.credits cr
        WHERE c.credit_id = cr.id AND c.tenant_id IS NULL AND cr.tenant_id IS NOT NULL;
      `);

      console.log("✅ [AutoMigrate] Commissions table, audit logs and indexes verified (Bloque 6)");
    } catch (err) {
      console.error("⚠️ [AutoMigrate] Error verifying commissions columns/indexes:", err);
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

      // Ensure all financial institutions are active
      await client.query(`
        UPDATE public.financial_institutions
        SET is_active = TRUE, updated_at = NOW()
        WHERE is_active IS NOT TRUE;
      `);
      console.log("✅ [AutoMigrate] Financial institutions table columns verified and all institutions activated");
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
          modules: [
            "dashboard", "clientes", "creditos", "comisiones", "financieras",
            "sistema_productos", "red_brokers", "documentos", "reportes", "usuarios", "configuracion"
          ], 
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
          modules: [
            "dashboard", "clientes", "creditos", "comisiones", "financieras",
            "sistema_productos", "documentos", "configuracion"
          ], 
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

    // 7B. Auto-sanitization across the database for RBAC modules & comisiones
    try {
      // Restore comisiones, financieras, sistema_productos to all brokers & master_brokers
      const sanitizeRes = await client.query(`
        SELECT id, email, role, permissions 
        FROM public.users 
        WHERE role IN ('broker', 'master_broker') 
          AND permissions IS NOT NULL 
          AND permissions != '{}'::jsonb
      `);

      for (const row of sanitizeRes.rows) {
        const perms = row.permissions || {};
        if (Array.isArray(perms.modules) && perms.modules.length > 0) {
          const mods = new Set<string>(perms.modules);
          let changed = false;

          if (!mods.has('comisiones')) {
            mods.add('comisiones');
            changed = true;
          }
          if (!mods.has('financieras')) {
            mods.add('financieras');
            changed = true;
          }
          if (!mods.has('sistema_productos')) {
            mods.add('sistema_productos');
            changed = true;
          }

          if (changed) {
            perms.modules = Array.from(mods);
            await client.query(
              `UPDATE public.users SET permissions = $1::jsonb, updated_at = NOW() WHERE id = $2`,
              [JSON.stringify(perms), row.id]
            );
            console.log(`🛡️ [AutoMigrate] Sanitized permissions for user ${row.email || row.id} (${row.role})`);
          }
        }
      }

      // Ensure non-originators (can_originate = false) NEVER have comisiones in permissions
      const nonOrigRes = await client.query(`
        SELECT tm.user_id, u.permissions
        FROM public.tenant_members tm
        JOIN public.users u ON tm.user_id = u.id
        WHERE tm.is_active = true 
          AND tm.can_originate = false 
          AND tm.role = 'member'
          AND u.role NOT IN ('super_admin', 'admin')
      `);

      for (const row of nonOrigRes.rows) {
        const perms = row.permissions || {};
        if (Array.isArray(perms.modules) && perms.modules.includes('comisiones')) {
          perms.modules = perms.modules.filter((m: string) => m !== 'comisiones');
          await client.query(
            `UPDATE public.users SET permissions = $1::jsonb, updated_at = NOW() WHERE id = $2`,
            [JSON.stringify(perms), row.user_id]
          );
          console.log(`🛡️ [AutoMigrate] Removed comisiones for non-originating collaborator ${row.user_id}`);
        }
      }
    } catch (sanErr) {
      console.warn("⚠️ [AutoMigrate] Notice during auto-sanitization:", (sanErr as any)?.message);
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

    // 9. Clean up obsolete test financial institutions (E2E and dummy test records)
    try {
      const deleteResult = await client.query(`
        WITH test_insts AS (
          SELECT id FROM public.financial_institutions
          WHERE name ILIKE 'E2E Flujo Completo%' 
             OR name IN ('Financiera Demo', 'Financiera Prueba Franco')
        ),
        del_targets AS (
          DELETE FROM public.credit_submission_targets
          WHERE financial_institution_id IN (SELECT id FROM test_insts)
        ),
        upd_credits AS (
          UPDATE public.credits
          SET financial_institution_id = NULL
          WHERE financial_institution_id IN (SELECT id FROM test_insts)
        ),
        upd_prod_reqs AS (
          UPDATE public.product_requests
          SET existing_institution_id = NULL
          WHERE existing_institution_id IN (SELECT id FROM test_insts)
        ),
        del_inst_prods AS (
          DELETE FROM public.institution_products
          WHERE institution_id IN (SELECT id FROM test_insts)
        ),
        del_prods AS (
          DELETE FROM public.products
          WHERE institution_id IN (SELECT id FROM test_insts)
        )
        DELETE FROM public.financial_institutions
        WHERE id IN (SELECT id FROM test_insts)
        RETURNING id, name;
      `);
      if (deleteResult.rowCount && deleteResult.rowCount > 0) {
        console.log(`🧹 [AutoMigrate] Cleaned up ${deleteResult.rowCount} test financial institutions:`, deleteResult.rows.map(r => r.name).join(', '));
      } else {
        console.log("✅ [AutoMigrate] Financial institutions catalog verified clean (no obsolete test records found).");
      }
    } catch (cleanErr) {
      console.error("⚠️ [AutoMigrate] Error cleaning test financial institutions:", cleanErr);
    }

    // 10. Ensure promo_codes and promo_redemptions tables exist (Bloque 10)
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS public.promo_codes (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          code VARCHAR UNIQUE NOT NULL,
          name VARCHAR NOT NULL,
          description TEXT,
          benefit_type VARCHAR NOT NULL,
          benefit_value NUMERIC(10, 2) DEFAULT 0.00,
          duration_months INTEGER,
          starts_at TIMESTAMP NOT NULL DEFAULT NOW(),
          expires_at TIMESTAMP,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          max_uses INTEGER,
          current_uses INTEGER NOT NULL DEFAULT 0,
          target_scope VARCHAR NOT NULL DEFAULT 'global',
          target_entity_id VARCHAR,
          created_by VARCHAR REFERENCES public.users(id),
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS "promo_codes_code_idx" ON public.promo_codes ("code");
        CREATE INDEX IF NOT EXISTS "promo_codes_is_active_idx" ON public.promo_codes ("is_active");

        CREATE TABLE IF NOT EXISTS public.promo_redemptions (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          promo_code_id VARCHAR NOT NULL REFERENCES public.promo_codes(id) ON DELETE CASCADE,
          user_id VARCHAR NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
          tenant_id VARCHAR REFERENCES public.tenants(id),
          applied_at TIMESTAMP NOT NULL DEFAULT NOW(),
          starts_at TIMESTAMP NOT NULL DEFAULT NOW(),
          expires_at TIMESTAMP,
          status VARCHAR NOT NULL DEFAULT 'active',
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMP DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS "promo_redemptions_user_idx" ON public.promo_redemptions ("user_id");
        CREATE INDEX IF NOT EXISTS "promo_redemptions_promo_idx" ON public.promo_redemptions ("promo_code_id");
      `);
      console.log("✅ [AutoMigrate] Promo codes and redemptions tables verified (Bloque 10)");
    } catch (promoErr) {
      console.error("⚠️ [AutoMigrate] Error verifying promo tables:", promoErr);
    }

    // 11. Ensure commercial governance and operational rules tables exist (Fases 1–6)
    try {
      await client.query(`
        -- 1. client_commercial_relationships
        CREATE TABLE IF NOT EXISTS public.client_commercial_relationships (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id VARCHAR REFERENCES public.tenants(id),
          client_id VARCHAR NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
          broker_id VARCHAR NOT NULL REFERENCES public.users(id),
          master_broker_id VARCHAR REFERENCES public.users(id),
          status VARCHAR NOT NULL DEFAULT 'legacy_unverified',
          last_valid_activity_at TIMESTAMP,
          last_activity_type VARCHAR,
          last_activity_summary TEXT,
          active_until TIMESTAMP,
          dormant_until TIMESTAMP,
          inbound_priority_expires_at TIMESTAMP,
          inbound_priority_status VARCHAR,
          notes TEXT,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS "rel_client_idx" ON public.client_commercial_relationships (client_id);
        CREATE INDEX IF NOT EXISTS "rel_broker_idx" ON public.client_commercial_relationships (broker_id);
        CREATE INDEX IF NOT EXISTS "rel_status_idx" ON public.client_commercial_relationships (status);

        -- 2. commercial_opportunities
        CREATE TABLE IF NOT EXISTS public.commercial_opportunities (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id VARCHAR REFERENCES public.tenants(id),
          client_id VARCHAR NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
          broker_id VARCHAR NOT NULL REFERENCES public.users(id),
          master_broker_id VARCHAR REFERENCES public.users(id),
          title VARCHAR NOT NULL,
          financing_need_type VARCHAR NOT NULL,
          requested_amount NUMERIC(15, 2) NOT NULL,
          product_template_id VARCHAR REFERENCES public.product_templates(id),
          target_institution_id VARCHAR REFERENCES public.financial_institutions(id),
          status VARCHAR NOT NULL DEFAULT 'registered_hold',
          hold_expires_at TIMESTAMP NOT NULL,
          protected_until TIMESTAMP,
          last_valid_activity_at TIMESTAMP NOT NULL DEFAULT NOW(),
          initial_evidence_type VARCHAR,
          initial_evidence_doc_url VARCHAR,
          initial_evidence_validated_at TIMESTAMP,
          initial_evidence_validated_by VARCHAR REFERENCES public.users(id),
          linked_submission_id VARCHAR REFERENCES public.credit_submission_requests(id),
          converted_credit_id VARCHAR REFERENCES public.credits(id),
          is_derived_work_suspicion BOOLEAN DEFAULT FALSE,
          prior_work_broker_id VARCHAR REFERENCES public.users(id),
          notes TEXT,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS "opp_client_idx" ON public.commercial_opportunities (client_id);
        CREATE INDEX IF NOT EXISTS "opp_broker_idx" ON public.commercial_opportunities (broker_id);
        CREATE INDEX IF NOT EXISTS "opp_status_idx" ON public.commercial_opportunities (status);
        CREATE INDEX IF NOT EXISTS "opp_need_idx" ON public.commercial_opportunities (client_id, financing_need_type);

        -- 3. commercial_activities
        CREATE TABLE IF NOT EXISTS public.commercial_activities (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          client_id VARCHAR NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
          opportunity_id VARCHAR REFERENCES public.commercial_opportunities(id),
          relationship_id VARCHAR REFERENCES public.client_commercial_relationships(id),
          broker_id VARCHAR NOT NULL REFERENCES public.users(id),
          activity_type VARCHAR NOT NULL,
          title VARCHAR NOT NULL,
          description TEXT,
          document_id VARCHAR REFERENCES public.documents(id),
          evidence_url VARCHAR,
          verified_by_system BOOLEAN DEFAULT TRUE,
          performed_at TIMESTAMP NOT NULL DEFAULT NOW(),
          created_at TIMESTAMP DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS "comm_act_client_idx" ON public.commercial_activities (client_id);
        CREATE INDEX IF NOT EXISTS "comm_act_opp_idx" ON public.commercial_activities (opportunity_id);
        CREATE INDEX IF NOT EXISTS "comm_act_broker_idx" ON public.commercial_activities (broker_id);

        -- 4. broker_election_confirmations
        CREATE TABLE IF NOT EXISTS public.broker_election_confirmations (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          client_id VARCHAR NOT NULL REFERENCES public.clients(id),
          opportunity_id VARCHAR REFERENCES public.commercial_opportunities(id),
          previous_broker_id VARCHAR REFERENCES public.users(id),
          selected_broker_id VARCHAR NOT NULL REFERENCES public.users(id),
          channel VARCHAR NOT NULL,
          recipient_contact VARCHAR NOT NULL,
          recipient_name VARCHAR,
          recipient_role VARCHAR,
          token_hash VARCHAR NOT NULL UNIQUE,
          token_expires_at TIMESTAMP NOT NULL,
          status VARCHAR NOT NULL DEFAULT 'pending',
          confirmed_at TIMESTAMP,
          confirmation_ip VARCHAR,
          confirmation_user_agent TEXT,
          revoked_at TIMESTAMP,
          revoked_reason VARCHAR,
          validated_by_admin_id VARCHAR REFERENCES public.users(id),
          manual_evidence_file_url VARCHAR,
          manual_validation_notes TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS "elec_client_idx" ON public.broker_election_confirmations (client_id);
        CREATE INDEX IF NOT EXISTS "elec_token_idx" ON public.broker_election_confirmations (token_hash);

        -- 5. commercial_audit_logs
        CREATE TABLE IF NOT EXISTS public.commercial_audit_logs (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          entity_type VARCHAR NOT NULL,
          entity_id VARCHAR NOT NULL,
          client_id VARCHAR REFERENCES public.clients(id),
          broker_id VARCHAR REFERENCES public.users(id),
          performed_by VARCHAR REFERENCES public.users(id),
          action VARCHAR NOT NULL,
          previous_state VARCHAR,
          new_state VARCHAR,
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMP DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS "comm_audit_entity_idx" ON public.commercial_audit_logs (entity_type, entity_id);
        CREATE INDEX IF NOT EXISTS "comm_audit_client_idx" ON public.commercial_audit_logs (client_id);

        -- 6. operational_rules_versions
        CREATE TABLE IF NOT EXISTS public.operational_rules_versions (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          version VARCHAR NOT NULL UNIQUE,
          title VARCHAR NOT NULL,
          summary TEXT NOT NULL,
          content_markdown TEXT NOT NULL,
          effective_date DATE NOT NULL,
          is_current BOOLEAN NOT NULL DEFAULT FALSE,
          requires_acknowledgment BOOLEAN DEFAULT FALSE,
          created_by VARCHAR REFERENCES public.users(id),
          created_at TIMESTAMP DEFAULT NOW()
        );

        -- 7. user_rule_acknowledgments
        CREATE TABLE IF NOT EXISTS public.user_rule_acknowledgments (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id VARCHAR NOT NULL REFERENCES public.users(id),
          rule_version_id VARCHAR NOT NULL REFERENCES public.operational_rules_versions(id),
          acknowledged_at TIMESTAMP NOT NULL DEFAULT NOW(),
          ip_address VARCHAR
        );

        CREATE UNIQUE INDEX IF NOT EXISTS "user_rule_ack_unique" ON public.user_rule_acknowledgments (user_id, rule_version_id);

        -- 8. commercial_configurations
        CREATE TABLE IF NOT EXISTS public.commercial_configurations (
          id VARCHAR PRIMARY KEY DEFAULT 'default',
          active_relationship_validity_days INTEGER NOT NULL DEFAULT 90,
          initial_opportunity_hold_days INTEGER NOT NULL DEFAULT 7,
          opportunity_inactivity_protection_days INTEGER NOT NULL DEFAULT 45,
          inbound_priority_hours INTEGER NOT NULL DEFAULT 48,
          renewal_window_days_before_maturity INTEGER NOT NULL DEFAULT 180,
          renewal_originator_priority_days INTEGER NOT NULL DEFAULT 15,
          broker_election_token_validity_hours INTEGER NOT NULL DEFAULT 72,
          updated_by VARCHAR REFERENCES public.users(id),
          updated_at TIMESTAMP DEFAULT NOW()
        );

        -- 9. commercial_config_audit_logs
        CREATE TABLE IF NOT EXISTS public.commercial_config_audit_logs (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          parameter_key VARCHAR NOT NULL,
          previous_value VARCHAR NOT NULL,
          new_value VARCHAR NOT NULL,
          changed_by VARCHAR REFERENCES public.users(id),
          change_reason TEXT,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS "comm_cfg_audit_param_idx" ON public.commercial_config_audit_logs (parameter_key);
        CREATE INDEX IF NOT EXISTS "comm_cfg_audit_created_idx" ON public.commercial_config_audit_logs (created_at);

        -- Ensure default commercial configuration exists
        INSERT INTO public.commercial_configurations (id)
        VALUES ('default')
        ON CONFLICT (id) DO NOTHING;
      `);
      console.log("✅ [AutoMigrate] Commercial governance and operational rules tables verified (Fases 1–6)");
    } catch (commErr) {
      console.error("⚠️ [AutoMigrate] Error verifying commercial governance tables:", commErr);
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
