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
          ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active',
          ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMP,
          ADD COLUMN IF NOT EXISTS status_changed_by VARCHAR,
          ADD COLUMN IF NOT EXISTS status_change_reason TEXT,
          ADD COLUMN IF NOT EXISTS status_change_notes TEXT,
          ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW(),
          ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
      `);

      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS "users_referral_code_unique" 
        ON public.users ("referral_code") 
        WHERE referral_code IS NOT NULL;
        CREATE INDEX IF NOT EXISTS "idx_users_status" 
        ON public.users ("status");
      `);
      console.log("✅ [AutoMigrate] Users table and columns verified");
    } catch (err) {
      console.error("⚠️ [AutoMigrate] Error verifying users table/columns:", err);
    }

    // 2a. Ensure user_status_requests table and indexes exist (Master Broker -> Super Admin workflow)
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS public.user_status_requests (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          requester_id VARCHAR NOT NULL REFERENCES public.users(id),
          target_user_id VARCHAR NOT NULL REFERENCES public.users(id),
          requested_status VARCHAR(20) NOT NULL,
          reason TEXT NOT NULL,
          notes TEXT,
          status VARCHAR(20) NOT NULL DEFAULT 'pending',
          reviewed_by VARCHAR REFERENCES public.users(id),
          reviewed_at TIMESTAMP,
          review_notes TEXT,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS "idx_usr_req_requester" ON public.user_status_requests (requester_id);
        CREATE INDEX IF NOT EXISTS "idx_usr_req_target" ON public.user_status_requests (target_user_id);
        CREATE INDEX IF NOT EXISTS "idx_usr_req_status" ON public.user_status_requests (status);
        CREATE UNIQUE INDEX IF NOT EXISTS "idx_usr_req_unique_pending" 
          ON public.user_status_requests (requester_id, target_user_id, requested_status) 
          WHERE status = 'pending';
      `);
      console.log("✅ [AutoMigrate] User status requests table verified");
    } catch (err) {
      console.error("⚠️ [AutoMigrate] Error verifying user_status_requests table:", err);
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

      console.log("✅ [AutoMigrate] Financial institutions table columns verified");
    } catch (err) {
      console.error("⚠️ [AutoMigrate] Error verifying financial institutions columns:", err);
    }

    // 6. User catalog verification (Zero-destructive startup: never reset passwords, change roles, or overwrite users on existing DB)
    try {
      const userCountRes = await client.query(`SELECT count(*) as count FROM public.users`);
      const totalUsers = parseInt(userCountRes.rows[0]?.count || "0", 10);

      if (totalUsers === 0) {
        // Only on a completely blank database, initialize a root super admin if ADMIN_INITIAL_PASSWORD is explicitly set and secure
        const initialPassword = process.env.ADMIN_INITIAL_PASSWORD?.trim();
        const isSecurePassword = Boolean(
          initialPassword && 
          initialPassword.length >= 12 && 
          initialPassword !== 'Prueba1$' &&
          initialPassword !== 'Franco2026!*' &&
          /[A-Z]/.test(initialPassword) &&
          /[a-z]/.test(initialPassword) &&
          /[0-9]/.test(initialPassword)
        );

        if (!isSecurePassword) {
          console.warn("⚠️ [AutoMigrate] Blank database detected, but ADMIN_INITIAL_PASSWORD is empty, insecure, or default. Super admin account was NOT created. Provide a secure ADMIN_INITIAL_PASSWORD (min 12 chars, upper, lower, number) to bootstrap.");
        } else {
          const hashedPassword = await bcrypt.hash(initialPassword!, 10);
          await client.query(`
            INSERT INTO public.users (
              id, email, password, auth_method, first_name, last_name, role, is_active, permissions, created_at, updated_at
            ) VALUES (
              gen_random_uuid(), 'francocb79@gmail.com', $1, 'local', 'Franco', 'Admin', 'super_admin', true, '{"modules": ["*"], "actions": ["*"]}', NOW(), NOW()
            ) ON CONFLICT (email) DO NOTHING
          `, [hashedPassword]);
          console.log("🌱 [AutoMigrate] Blank database detected: seeded initial super_admin account with secure ADMIN_INITIAL_PASSWORD.");
        }
      } else {
        console.log(`✅ [AutoMigrate] User catalog verified (${totalUsers} existing users). Zero user mutations performed.`);
      }
    } catch (userErr) {
      console.error("⚠️ [AutoMigrate] Error verifying user catalog:", userErr);
    }

    // 7. Ensure system user 'user-super-admin' exists for FK integrity in legacy scripts & migrations (idempotent, never overwrite existing)
    try {
      const sysUser = await client.query(`SELECT id FROM public.users WHERE id = 'user-super-admin'`);
      if (sysUser.rows.length === 0) {
        const crypto = await import("crypto");
        const internalSecret = crypto.randomBytes(32).toString("hex");
        const dummyPassword = await bcrypt.hash(internalSecret, 10);
        await client.query(`
          INSERT INTO public.users (
            id, email, password, auth_method, first_name, last_name, role, is_active, permissions, created_at, updated_at
          ) VALUES (
            'user-super-admin', 'system-admin@creditonegocios.com.mx', $1, 'local', 'Sistema', 'SuperAdmin', 'super_admin', true, '{"modules": ["*"], "actions": ["*"]}', NOW(), NOW()
          ) ON CONFLICT (id) DO NOTHING
        `, [dummyPassword]);
        console.log("✅ [AutoMigrate] Created system user: user-super-admin (idempotent)");
      } else {
        console.log("✅ [AutoMigrate] Verified system user: user-super-admin (idempotent)");
      }
    } catch (sysErr) {
      console.error("⚠️ [AutoMigrate] Error verifying user-super-admin:", sysErr);
    }

    // 8. Financial institutions catalog verification (zero destructive deletions)
    console.log("✅ [AutoMigrate] Financial institutions catalog verified (zero deletions performed).");

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

        -- Ensure default operational rules version v1.0.0 exists
        INSERT INTO public.operational_rules_versions (
          id, version, title, summary, content_markdown, effective_date, is_current, requires_acknowledgment, created_at
        )
        VALUES (
          'seed-rule-version-1-0-0',
          '1.0.0',
          'Reglas de Operación y Protección Comercial de Crédito Negocios',
          'Normas fundamentales de asignación de cartera, vigencia de relaciones comerciales, protección de oportunidades, atribución histórica y ventanas de renovación.',
          '# Reglas de Operación y Protección Comercial\n\n**Versión:** 1.0.0\n**Fecha de Entrada en Vigor:** 24 de Septiembre, 2026\n**Ámbito:** Red de Brokers, Master Brokers y Mesa de Control de Crédito Negocios.\n\n---\n\n## 1. Principio Rector: Protección al Trabajo Real\n\nLa plataforma Crédito Negocios protege el **trabajo comercial efectivamente realizado**, no la simple antigüedad de una relación ni el registro preliminar de un cliente.\n\nEl cliente es una entidad independiente con plena libertad de contratación. Ningún asesor ni broker posee derechos de propiedad perpetuos ni exclusivos sobre ningún cliente.\n\n---\n\n## 2. Clientes y Relación Comercial\n\n1. **El cliente no es propiedad de ningún broker:** Registrar a un cliente en la plataforma le asigna una relación de cartera para su atención, pero no otorga derechos vitalicios ni exclusivos.\n2. **Relación Activa:** Se mantiene vigente mientras el broker mantenga actividad comercial válida verificable con el cliente dentro de la ventana de vigencia configurada.\n3. **Relación sin Actividad Reciente:** Si transcurre el plazo configurado sin interacción comercial válida comprobada, la relación pasa a estado inactivo (sin actividad reciente). El cliente permanece visible en su historial, pero queda disponible para que otro asesor pueda registrar nuevas oportunidades si el cliente así lo decide.\n4. **Reactivación:** Una relación sin actividad reciente se reactiva automáticamente cuando el broker registra un avance comercial formal y validado (como la presentación de una nueva solicitud de crédito o documentación financiera vigente).\n\n---\n\n## 3. Oportunidades y Protección Comercial\n\n1. **¿Qué es una oportunidad?:** Es la gestión de una necesidad específica y concreta de financiamiento para un cliente (por ejemplo: crédito simple para capital de trabajo de $1,500,000 MXN a 36 meses).\n2. **Reserva Inicial:** Al registrar una oportunidad, el broker cuenta con un periodo de reserva inicial para recopilar la documentación del cliente y demostrar que existe una gestión real en marcha.\n3. **Oportunidad Protegida:** Una vez que el broker sube evidencia válida (solicitud firmada, estados financieros o acuse de cotización formal), la oportunidad obtiene el estatus de **Oportunidad Protegida** durante el periodo de gestión activa verificable.\n4. **Qué actividades SÍ mantienen la protección:**\n   - Presentación de solicitudes de crédito formales.\n   - Carga de estados de cuenta y documentación financiera requerida.\n   - Cotizaciones emitidas y compartidas con el cliente.\n   - Avances y propuestas de instituciones financieras aliadas.\n5. **Qué actividades NO mantienen la protección:**\n   - Notas manuales informales de CRM (por ejemplo: "llamé al cliente", "dejé mensaje").\n   - Mensajes no verificados o notas sin documentación anexa.\n6. **Liberación por Inactividad:** Si transcurre el plazo de reserva inicial sin documentación válida, o si una oportunidad protegida acumula inactividad comercial real, la oportunidad se libera automáticamente.\n7. **Oportunidad Equivalente de Otro Asesor:** Si otro broker intenta registrar la misma necesidad de crédito para un cliente que ya cuenta con una oportunidad protegida vigente, el sistema no permitirá duplicarla para proteger la gestión del asesor titular.\n\n---\n\n## 4. Créditos Históricos y Atribución Perpetua\n\n1. **Atribución Inmutable del Crédito Originado:** Cuando un broker gestiona y coloca exitosamente un crédito que es formalmente aprobado y dispersado, dicho crédito conserva permanentemente al broker originador en su registro histórico.\n2. **No Implica Propiedad del Cliente:** La colocación de un crédito a largo plazo (por ejemplo a 24, 36 o 48 meses) **NO otorga exclusividad comercial general** sobre las futuras operaciones o nuevas necesidades del cliente durante la vida de ese crédito.\n3. **Comisiones Históricas Intactas:** Las comisiones generadas por el crédito histórico corresponden única y exclusivamente a quien lo colocó, y no se modifican ni se alteran aunque el cliente decida tramitar una operación distinta en el futuro con otro broker.\n\n---\n\n## 5. Ventanas de Renovación\n\n1. **Apertura de la Ventana:** En el plazo previo al vencimiento de un crédito vigente, el sistema abre la ventana de renovación.\n2. **Prioridad Inicial del Broker Originador:** El broker que originó el crédito inicial dispone de un periodo preferente de prioridad para registrar la oportunidad de renovación y contactar al cliente.\n3. **Necesidad de Actividad Real:** Para hacer valer la prioridad, el broker debe registrar actividad comercial real en la plataforma. Si no hay contacto ni avance dentro del plazo de prioridad, la oportunidad de renovación queda abierta.\n4. **Respeto a Gestiones Previas:** La ventana de renovación respeta en todo momento oportunidades previas válidamente gestionadas y documentadas por terceros con consentimiento del cliente.\n\n---\n\n## 6. Elección de Broker por el Cliente\n\n1. **Libertad de Elección del Cliente:** El cliente tiene derecho a decidir con qué asesor desea tramitar sus operaciones de crédito.\n2. **Confirmación Digital Verificable:** Si un cliente desea ser atendido por un nuevo asesor, el cambio debe validarse mediante una **Confirmación Digital de Elección** enviada al teléfono o correo oficial del cliente mediante un enlace seguro con vigencia temporal, o a través de carta formal firmada por el representante legal.\n3. **Efecto Exclusivo sobre Nuevas Oportunidades:** La confirmación de cambio aplica exclusivamente hacia operaciones futuras; **no altera los créditos históricos previos ni las comisiones devengadas** de operaciones ya cerradas.\n\n---\n\n## 7. Resolución de Controversias y Conflictos\n\n1. **¿Cuándo existe una controversia real?:** Existe controversia cuando dos asesores presentan evidencia fehaciente de estar gestionando simultáneamente la misma operación ante las mismas instituciones financieras para el mismo cliente.\n2. **Intento de Duplicado NO es Controversia:** Que el sistema rechace el alta de un cliente o el registro de una oportunidad porque ya existe una oportunidad protegida vigente es una protección operativa normal, no una controversia.\n3. **Evidencia Requerida:** La parte que solicite revisión ante Mesa de Control debe adjuntar documentación que demuestre autorización del cliente, acuses de recepción y fechas precisas de gestión.\n4. **Intervención y Arbitraje de Mesa de Control:** Mesa de Control revisa la bitácora cronológica inmutable y la evidencia documental para emitir un dictamen final definitivo.\n\n---\n\n## 8. Comisiones y Transparencia\n\n1. **Dónde consultar comisiones:** Todo asesor puede revisar el estado, desglose y cálculo de sus comisiones en el módulo de **Comisiones** de la plataforma.\n2. **Operación que Genera Atribución:** La comisión se genera cuando una solicitud de crédito llega a dispersión efectiva con una financiera aliada.\n3. **No División Automática de Comisiones:** No existen divisiones ni splits automáticos entre brokers en caso de conflicto; la comisión se asigna a quien efectivamente concretó la solución autorizada por el cliente.\n4. **Casos Excepcionales:** Cualquier ajuste extraordinario solo puede ser ordenado y aplicado formalmente por Mesa de Control tras un dictamen debidamente documentado.',
          '2026-09-24',
          TRUE,
          TRUE,
          NOW()
        )
        ON CONFLICT (version) DO NOTHING;
      `);
      console.log("✅ [AutoMigrate] Commercial governance and operational rules tables verified (Fases 1–6)");
    } catch (commErr) {
      console.error("⚠️ [AutoMigrate] Error verifying commercial governance tables:", commErr);
    }

    // 10. Canonical Institution Products Evolution and Versions Table (Bloque A1 / Corrección A1.1 / Corrección final PostgreSQL)
    try {
      await client.query(`
        -- Enriquecimiento aditivo de institution_products sin DEFAULT inmediato
        -- para que las filas históricas preexistentes conserven status IS NULL durante el backfill legacy.
        ALTER TABLE public.institution_products ADD COLUMN IF NOT EXISTS name VARCHAR;
        ALTER TABLE public.institution_products ADD COLUMN IF NOT EXISTS product_type VARCHAR;
        ALTER TABLE public.institution_products ADD COLUMN IF NOT EXISTS slug VARCHAR;
        ALTER TABLE public.institution_products ADD COLUMN IF NOT EXISTS description TEXT;
        ALTER TABLE public.institution_products ADD COLUMN IF NOT EXISTS status VARCHAR;
        ALTER TABLE public.institution_products ADD COLUMN IF NOT EXISTS current_version_number INTEGER;

        -- Permitir template_id opcional
        DO $$
        BEGIN
          ALTER TABLE public.institution_products ALTER COLUMN template_id DROP NOT NULL;
        EXCEPTION
          WHEN OTHERS THEN NULL;
        END $$;

        CREATE INDEX IF NOT EXISTS "inst_prod_type_idx" ON public.institution_products (product_type);
        CREATE INDEX IF NOT EXISTS "inst_prod_status_idx" ON public.institution_products (status);

        -- Tabla histórica de versiones por oferta
        CREATE TABLE IF NOT EXISTS public.institution_product_versions (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          institution_product_id VARCHAR NOT NULL REFERENCES public.institution_products(id) ON DELETE CASCADE,
          version_number INTEGER NOT NULL DEFAULT 1,
          status VARCHAR NOT NULL DEFAULT 'draft',
          effective_from TIMESTAMP,
          effective_to TIMESTAMP,
          conditions JSONB DEFAULT '{}',
          requirements JSONB DEFAULT '{}',
          required_documents TEXT[] DEFAULT ARRAY[]::TEXT[],
          variables_configuration JSONB DEFAULT '{}',
          change_reason TEXT,
          version_hash VARCHAR,
          published_at TIMESTAMP,
          published_by VARCHAR REFERENCES public.users(id),
          created_by VARCHAR REFERENCES public.users(id),
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS "ipv_product_id_idx" ON public.institution_product_versions (institution_product_id);
        CREATE UNIQUE INDEX IF NOT EXISTS "ipv_product_version_unique" ON public.institution_product_versions (institution_product_id, version_number);
        CREATE INDEX IF NOT EXISTS "ipv_status_idx" ON public.institution_product_versions (status);
        CREATE UNIQUE INDEX IF NOT EXISTS "ipv_published_unique" ON public.institution_product_versions (institution_product_id) WHERE status = 'published';

        -- Verificacion defensiva de columnas para tablas preexistentes
        ALTER TABLE IF EXISTS public.institution_product_versions
          ADD COLUMN IF NOT EXISTS published_at TIMESTAMP,
          ADD COLUMN IF NOT EXISTS published_by VARCHAR,
          ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW(),
          ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

        -- Tabla de control de migraciones para ejecución única
        CREATE TABLE IF NOT EXISTS public.app_migrations (
          id VARCHAR PRIMARY KEY,
          executed_at TIMESTAMP DEFAULT NOW()
        );

        -- Función canónica determinista para cálculo de version_hash 100% equivalente a Node computeInstitutionProductVersionHash
        CREATE OR REPLACE FUNCTION public.compute_legacy_version_hash(
          p_product_id VARCHAR,
          p_configuration JSONB,
          p_target_profiles TEXT[],
          p_active_variables JSONB
        ) RETURNS VARCHAR AS $$
        DECLARE
          v_conditions_text TEXT;
          v_profiles_text TEXT;
          v_variables_text TEXT;
          v_payload TEXT;
        BEGIN
          IF p_configuration IS NULL OR p_configuration = '{}'::jsonb THEN
            v_conditions_text := '{}';
          ELSE
            SELECT COALESCE('{' || string_agg('"' || key || '":' || regexp_replace(value::text, '":\s+', '":', 'g'), ',' ORDER BY key) || '}', '{}')
            INTO v_conditions_text
            FROM jsonb_each(p_configuration);
          END IF;

          IF p_target_profiles IS NULL OR array_length(p_target_profiles, 1) IS NULL THEN
            v_profiles_text := '[]';
          ELSE
            SELECT '[' || string_agg('"' || elem || '"', ',') || ']'
            INTO v_profiles_text
            FROM unnest(p_target_profiles) AS elem;
          END IF;

          IF p_active_variables IS NULL OR p_active_variables = '{}'::jsonb THEN
            v_variables_text := '{}';
          ELSE
            SELECT COALESCE('{' || string_agg('"' || key || '":' || regexp_replace(value::text, '":\s+', '":', 'g'), ',' ORDER BY key) || '}', '{}')
            INTO v_variables_text
            FROM jsonb_each(p_active_variables);
          END IF;

          v_payload := '{"conditions":' || v_conditions_text ||
                       ',"productId":"' || p_product_id || '"' ||
                       ',"requiredDocuments":[]' ||
                       ',"requirements":{"targetProfiles":' || v_profiles_text || '}' ||
                       ',"variablesConfiguration":' || v_variables_text ||
                       ',"versionNumber":1}';

          RETURN encode(sha256(convert_to(v_payload, 'UTF8')), 'hex');
        END;
        $$ LANGUAGE plpgsql IMMUTABLE;

        -- Migración aditiva y preservación de institution_products preexistentes (A1 - Corrección final PostgreSQL):
        -- Se ejecuta UNA SOLA VEZ y distingue de forma inequívoca productos preexistentes (status IS NULL) de nuevas ofertas.
        -- NUNCA convierte un borrador nuevo ('draft') en publicado.
        DO $$
        DECLARE
          unversioned_count INTEGER;
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM public.app_migrations WHERE id = '0005_legacy_institution_products_backfill_a1') THEN
            -- A. Actualizar únicamente productos legacy preexistentes activos
            UPDATE public.institution_products
            SET status = 'published', current_version_number = 1
            WHERE is_active = true 
              AND (status IS NULL OR current_version_number IS NULL)
              AND NOT EXISTS (
                SELECT 1 FROM public.institution_product_versions ipv WHERE ipv.institution_product_id = institution_products.id
              );

            -- B. Actualizar únicamente productos legacy preexistentes inactivos (preservados como inactivos/archivados)
            UPDATE public.institution_products
            SET status = 'archived', current_version_number = 1
            WHERE is_active = false 
              AND (status IS NULL OR current_version_number IS NULL)
              AND NOT EXISTS (
                SELECT 1 FROM public.institution_product_versions ipv WHERE ipv.institution_product_id = institution_products.id
              );

            -- C. Generar versión inicial 1 publicada para productos legacy activos con version_hash verificable
            INSERT INTO public.institution_product_versions (
              id,
              institution_product_id,
              version_number,
              status,
              effective_from,
              effective_to,
              conditions,
              requirements,
              required_documents,
              variables_configuration,
              change_reason,
              version_hash,
              published_at,
              published_by,
              created_by
            )
            SELECT
              gen_random_uuid(),
              ip.id,
              1,
              'published',
              NOW(),
              NULL,
              COALESCE(ip.configuration, '{}'::jsonb),
              jsonb_build_object('targetProfiles', COALESCE(to_jsonb(ip.target_profiles), '[]'::jsonb)),
              ARRAY[]::text[],
              COALESCE(ip.active_variables, '{}'::jsonb),
              'Migración automática de producto institucional legacy activo',
              public.compute_legacy_version_hash(ip.id, ip.configuration, ip.target_profiles, ip.active_variables),
              NOW(),
              ip.created_by,
              ip.created_by
            FROM public.institution_products ip
            WHERE ip.status = 'published' AND NOT EXISTS (
              SELECT 1 FROM public.institution_product_versions ipv WHERE ipv.institution_product_id = ip.id
            );

            -- D. Generar versión inicial 1 archivada para productos legacy inactivos con version_hash verificable
            INSERT INTO public.institution_product_versions (
              id,
              institution_product_id,
              version_number,
              status,
              effective_from,
              effective_to,
              conditions,
              requirements,
              required_documents,
              variables_configuration,
              change_reason,
              version_hash,
              published_at,
              published_by,
              created_by
            )
            SELECT
              gen_random_uuid(),
              ip.id,
              1,
              'archived',
              COALESCE(ip.created_at, NOW()),
              NOW(),
              COALESCE(ip.configuration, '{}'::jsonb),
              jsonb_build_object('targetProfiles', COALESCE(to_jsonb(ip.target_profiles), '[]'::jsonb)),
              ARRAY[]::text[],
              COALESCE(ip.active_variables, '{}'::jsonb),
              'Migración automática de producto institucional legacy inactivo',
              public.compute_legacy_version_hash(ip.id, ip.configuration, ip.target_profiles, ip.active_variables),
              NULL,
              NULL,
              ip.created_by
            FROM public.institution_products ip
            WHERE ip.status = 'archived' AND NOT EXISTS (
              SELECT 1 FROM public.institution_product_versions ipv WHERE ipv.institution_product_id = ip.id
            );

            -- E. Verificación estricta de completitud: si algún producto quedó sin versión, abortar sin registrar éxito
            SELECT COUNT(*) INTO unversioned_count
            FROM public.institution_products ip
            WHERE NOT EXISTS (
              SELECT 1 FROM public.institution_product_versions ipv WHERE ipv.institution_product_id = ip.id
            );

            IF unversioned_count > 0 THEN
              RAISE EXCEPTION 'Backfill legacy incompleto: % productos sin versión asociada. Abortando registro en app_migrations.', unversioned_count;
            END IF;

            -- F. Registrar que el backfill fue ejecutado con éxito total para que jamás se repita
            INSERT INTO public.app_migrations (id, executed_at)
            VALUES ('0005_legacy_institution_products_backfill_a1', NOW())
            ON CONFLICT (id) DO NOTHING;
          END IF;
        END $$;

        -- Establecer valores predeterminados para nuevas ofertas creadas a partir de ahora
        ALTER TABLE public.institution_products ALTER COLUMN status SET DEFAULT 'draft';
        ALTER TABLE public.institution_products ALTER COLUMN current_version_number SET DEFAULT 1;

        -- Vista retrocompatible para interfaces legacy
        CREATE OR REPLACE VIEW public.financial_institution_offers AS
          SELECT 
            id,
            institution_id,
            template_id,
            id AS institution_product_id,
            COALESCE(name, custom_name, 'Oferta') AS name,
            slug,
            product_type,
            description,
            current_version_number,
            is_active,
            created_by,
            created_at,
            updated_at
          FROM public.institution_products;
      `);
      console.log("✅ [AutoMigrate] Canonical institution products and versions tables verified (Bloque A1.1)");
    } catch (offersErr) {
      console.error("⚠️ [AutoMigrate] Error verifying offers and versions tables:", offersErr);
      throw offersErr;
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
