import { pool } from "./db";
import bcrypt from "bcrypt";
import catalog from "./legalDocumentCatalog.json";

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

    // 0b. Ensure system migration markers table exists for idempotent one-time executions
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS public.system_migration_markers (
          key VARCHAR PRIMARY KEY,
          applied_at TIMESTAMP NOT NULL DEFAULT NOW(),
          metadata JSONB DEFAULT '{}'
        );
      `);
    } catch (e) {
      console.log("ℹ️ [AutoMigrate] system_migration_markers table check:", (e as any).message);
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

    // 3b. Ensure credits table columns, immutable origin affiliation and indexes exist
    try {
      const originColumnCheck = await client.query(`
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'credits'
            AND column_name = 'origin_master_broker_id'
        ) AS exists;
      `);
      const originColumnAlreadyExisted = Boolean(originColumnCheck.rows?.[0]?.exists);

      await client.query(`
        ALTER TABLE IF EXISTS public.credits
          ADD COLUMN IF NOT EXISTS tenant_id VARCHAR,
          ADD COLUMN IF NOT EXISTS created_by VARCHAR,
          ADD COLUMN IF NOT EXISTS mortgage_data JSONB DEFAULT '{}',
          ADD COLUMN IF NOT EXISTS origin_master_broker_id VARCHAR;

        CREATE INDEX IF NOT EXISTS "credits_tenant_idx" ON public.credits ("tenant_id");
        CREATE INDEX IF NOT EXISTS "credits_broker_idx" ON public.credits ("broker_id");
        CREATE INDEX IF NOT EXISTS "credits_client_idx" ON public.credits ("client_id");
        CREATE INDEX IF NOT EXISTS "credits_origin_master_broker_idx" ON public.credits ("origin_master_broker_id");
      `);

      await client.query(`
        DO $$ BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'credits_origin_master_broker_fk'
          ) THEN
            ALTER TABLE public.credits
              ADD CONSTRAINT credits_origin_master_broker_fk
              FOREIGN KEY (origin_master_broker_id) REFERENCES public.users(id);
          END IF;
        END $$;

        CREATE OR REPLACE FUNCTION public.prevent_credit_origin_master_change()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $$
        BEGIN
          IF NEW.origin_master_broker_id IS DISTINCT FROM OLD.origin_master_broker_id THEN
            RAISE EXCEPTION 'origin_master_broker_id is immutable after credit creation';
          END IF;
          RETURN NEW;
        END;
        $$;

        DROP TRIGGER IF EXISTS trg_credits_origin_master_immutable ON public.credits;
        CREATE TRIGGER trg_credits_origin_master_immutable
        BEFORE UPDATE OF origin_master_broker_id ON public.credits
        FOR EACH ROW
        EXECUTE FUNCTION public.prevent_credit_origin_master_change();
      `);

      console.log("✅ [AutoMigrate] Credits table columns, origin affiliation and indexes verified");
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

    // 6. User auth method defaults verified via column definitions

    // 7. Safe initial admin bootstrap ONLY if database is 100% empty (never alters existing accounts)
    try {
      const userCountRes = await client.query(`SELECT count(*)::int as count FROM public.users`);
      const userCount = Number(userCountRes.rows[0]?.count ?? 0);

      if (userCount === 0 && process.env.AUTO_SEED_DEFAULT_ADMIN === 'true') {
        const bootstrapAdminEmail = process.env.INITIAL_ADMIN_EMAIL || 'admin@creditonegocios.com.mx';
        const bootstrapPassword = process.env.INITIAL_ADMIN_PASSWORD;
        if (bootstrapPassword) {
          const hashedPassword = await bcrypt.hash(bootstrapPassword, 10);
          await client.query(`
            INSERT INTO public.users (
              id, email, password, auth_method, first_name, last_name, role, is_active, permissions, created_at, updated_at
            ) VALUES (
              gen_random_uuid(), lower(trim($1)), $2, 'local', 'Admin', 'Inicial', 'super_admin', true, '{"modules": ["*"], "actions": ["*"]}'::jsonb, NOW(), NOW()
            ) ON CONFLICT (email) DO NOTHING;
          `, [bootstrapAdminEmail, hashedPassword]);
          console.log(`🛡️ [AutoMigrate] Created initial bootstrap admin for empty database: ${bootstrapAdminEmail}`);
        } else {
          console.log(`ℹ️ [AutoMigrate] Database is empty but INITIAL_ADMIN_PASSWORD is not set. Skipping admin creation.`);
        }
      } else {
        console.log(`✅ [AutoMigrate] User catalog verified (${userCount} existing users). Zero user mutations performed.`);
      }
    } catch (bootstrapErr) {
      console.error("⚠️ [AutoMigrate] Error verifying user catalog:", bootstrapErr);
    }

    // 8. Ensure system user 'user-super-admin' exists for FK integrity in legacy scripts & migrations (idempotent, never alters password or role)
    try {
      await client.query(`
        INSERT INTO public.users (
          id, email, password, auth_method, first_name, last_name, role, is_active, permissions, created_at, updated_at
        ) VALUES (
          'user-super-admin', 'system-admin@creditonegocios.com.mx', 'DISABLED_SYSTEM_ACCOUNT', 'local', 'Sistema', 'SuperAdmin', 'super_admin', true, '{"modules": ["*"], "actions": ["*"]}', NOW(), NOW()
        ) ON CONFLICT (id) DO NOTHING;
      `);
      console.log("✅ [AutoMigrate] Verified system user: user-super-admin (idempotent)");
    } catch (sysErr) {
      console.error("⚠️ [AutoMigrate] Error verifying user-super-admin:", sysErr);
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

    // 11a. Freeze historical network affiliation for opportunities and submissions exactly once.
    // New records derive these values server-side at origination.
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS public.system_migration_markers (
          key VARCHAR PRIMARY KEY,
          applied_at TIMESTAMP NOT NULL DEFAULT NOW(),
          metadata JSONB DEFAULT '{}'
        );

        ALTER TABLE IF EXISTS public.credit_submission_requests
          ADD COLUMN IF NOT EXISTS origin_master_broker_id VARCHAR;

        CREATE INDEX IF NOT EXISTS "credit_submissions_origin_master_idx"
          ON public.credit_submission_requests (origin_master_broker_id);

        CREATE INDEX IF NOT EXISTS "opp_master_broker_idx"
          ON public.commercial_opportunities (master_broker_id);

        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'credit_submissions_origin_master_fk'
          ) THEN
            ALTER TABLE public.credit_submission_requests
              ADD CONSTRAINT credit_submissions_origin_master_fk
              FOREIGN KEY (origin_master_broker_id)
              REFERENCES public.users(id);
          END IF;
        END
        $$;

        CREATE OR REPLACE FUNCTION public.prevent_opportunity_origin_master_change()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $$
        BEGIN
          IF NEW.master_broker_id IS DISTINCT FROM OLD.master_broker_id THEN
            RAISE EXCEPTION 'commercial opportunity master_broker_id is immutable after origination';
          END IF;
          RETURN NEW;
        END;
        $$;

        DROP TRIGGER IF EXISTS trg_opportunity_origin_master_immutable ON public.commercial_opportunities;
        CREATE TRIGGER trg_opportunity_origin_master_immutable
        BEFORE UPDATE OF master_broker_id ON public.commercial_opportunities
        FOR EACH ROW
        EXECUTE FUNCTION public.prevent_opportunity_origin_master_change();

        CREATE OR REPLACE FUNCTION public.prevent_submission_origin_master_change()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $$
        BEGIN
          IF NEW.origin_master_broker_id IS DISTINCT FROM OLD.origin_master_broker_id THEN
            RAISE EXCEPTION 'credit submission origin_master_broker_id is immutable after origination';
          END IF;
          RETURN NEW;
        END;
        $$;

        DROP TRIGGER IF EXISTS trg_submission_origin_master_immutable ON public.credit_submission_requests;
        CREATE TRIGGER trg_submission_origin_master_immutable
        BEFORE UPDATE OF origin_master_broker_id ON public.credit_submission_requests
        FOR EACH ROW
        EXECUTE FUNCTION public.prevent_submission_origin_master_change();
      `);
      console.log("✅ [AutoMigrate] Historical opportunity/submission network affiliation verified");
    } catch (networkAffErr) {
      console.error("⚠️ [AutoMigrate] Error freezing historical network affiliation:", networkAffErr);
    }

    // 7. Legal document versions and immutable acceptances (Bloque 2)
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS public.legal_document_versions (
          id VARCHAR PRIMARY KEY,
          document VARCHAR(64) NOT NULL,
          title VARCHAR(255) NOT NULL,
          version VARCHAR(32) NOT NULL,
          source_file VARCHAR(255) NOT NULL,
          content TEXT NOT NULL,
          content_sha256 VARCHAR(64) NOT NULL,
          effective_at TIMESTAMP,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS public.legal_acceptances (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id VARCHAR NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
          user_email VARCHAR NOT NULL,
          user_name VARCHAR,
          document_id VARCHAR NOT NULL REFERENCES public.legal_document_versions(id),
          document VARCHAR(64) NOT NULL,
          version VARCHAR(32) NOT NULL,
          content_sha256 VARCHAR(64) NOT NULL,
          acceptance_type VARCHAR(64) NOT NULL,
          ip_address VARCHAR(128) NOT NULL,
          user_agent TEXT NOT NULL,
          accepted_at TIMESTAMP NOT NULL DEFAULT NOW()
        );

        ALTER TABLE IF EXISTS public.legal_acceptances
          ADD COLUMN IF NOT EXISTS user_name VARCHAR;

        CREATE TABLE IF NOT EXISTS public.formalization_otp_requests (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id VARCHAR NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
          user_email VARCHAR NOT NULL,
          user_name VARCHAR,
          user_role VARCHAR(64) NOT NULL,
          documents_snapshot JSONB NOT NULL,
          code_hash VARCHAR(64) NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0,
          max_attempts INTEGER NOT NULL DEFAULT 5,
          expires_at TIMESTAMP NOT NULL,
          resend_available_at TIMESTAMP NOT NULL,
          consumed BOOLEAN NOT NULL DEFAULT FALSE,
          consumed_at TIMESTAMP,
          invalidated BOOLEAN NOT NULL DEFAULT FALSE,
          invalidated_at TIMESTAMP,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        );

        ALTER TABLE IF EXISTS public.formalization_otp_requests
          ADD COLUMN IF NOT EXISTS invalidated BOOLEAN NOT NULL DEFAULT FALSE;
        ALTER TABLE IF EXISTS public.formalization_otp_requests
          ADD COLUMN IF NOT EXISTS invalidated_at TIMESTAMP;

        CREATE INDEX IF NOT EXISTS idx_formalization_otp_user_id ON public.formalization_otp_requests(user_id);
        CREATE INDEX IF NOT EXISTS idx_formalization_otp_created_at ON public.formalization_otp_requests(created_at);

        CREATE INDEX IF NOT EXISTS idx_legal_acceptances_user_id ON public.legal_acceptances(user_id);
        CREATE INDEX IF NOT EXISTS idx_legal_acceptances_document_id ON public.legal_acceptances(document_id);

        -- broker_commission_acceptances
        CREATE TABLE IF NOT EXISTS public.broker_commission_acceptances (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id VARCHAR NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
          institution_id VARCHAR NOT NULL REFERENCES public.financial_institutions(id) ON DELETE CASCADE,
          accepted_rates JSONB NOT NULL DEFAULT '{}',
          rates_hash VARCHAR(64) NOT NULL,
          accepted_at TIMESTAMP NOT NULL DEFAULT NOW(),
          ip_address VARCHAR,
          user_agent TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_bca_user_inst ON public.broker_commission_acceptances(user_id, institution_id);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_bca_user_inst_hash ON public.broker_commission_acceptances(user_id, institution_id, rates_hash);

        CREATE OR REPLACE FUNCTION protect_legal_document_versions()
        RETURNS TRIGGER AS $$
        BEGIN
          RAISE EXCEPTION 'Legal document versions are immutable and cannot be updated or deleted.';
        END;
        $$ LANGUAGE plpgsql;

        DROP TRIGGER IF EXISTS trg_protect_legal_document_versions ON public.legal_document_versions;
        CREATE TRIGGER trg_protect_legal_document_versions
          BEFORE UPDATE OR DELETE ON public.legal_document_versions
          FOR EACH ROW
          EXECUTE FUNCTION protect_legal_document_versions();

        CREATE OR REPLACE FUNCTION protect_legal_acceptances()
        RETURNS TRIGGER AS $$
        BEGIN
          RAISE EXCEPTION 'Legal acceptances are immutable audit records and cannot be updated or deleted.';
        END;
        $$ LANGUAGE plpgsql;

        DROP TRIGGER IF EXISTS trg_protect_legal_acceptances ON public.legal_acceptances;
        CREATE TRIGGER trg_protect_legal_acceptances
          BEFORE UPDATE OR DELETE ON public.legal_acceptances
          FOR EACH ROW
          EXECUTE FUNCTION protect_legal_acceptances();
      `);

      // Seed approved versions from catalog with ON CONFLICT (id) DO NOTHING
      for (const entry of catalog) {
        await client.query(
          `
          INSERT INTO public.legal_document_versions (
            id, document, title, version, source_file, content, content_sha256, effective_at, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
          ON CONFLICT (id) DO NOTHING;
          `,
          [
            entry.id,
            entry.document,
            entry.title,
            entry.version,
            entry.sourceFile,
            entry.content,
            entry.contentSha256,
            entry.effectiveAt ? new Date(entry.effectiveAt) : null,
          ],
        );
      }
      console.log("✅ [AutoMigrate] Legal document versions and immutable acceptances verified (Bloque 2)");
    } catch (legalErr) {
      console.error("⚠️ [AutoMigrate] Error verifying legal tables:", legalErr);
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
