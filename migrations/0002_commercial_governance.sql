-- Migración Aditiva: Gobernanza Comercial, Relaciones, Oportunidades, Actividades, Tokens de Elección, Auditoría y Reglas de Operación

-- 1. client_commercial_relationships
CREATE TABLE IF NOT EXISTS "client_commercial_relationships" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" varchar REFERENCES "tenants"("id"),
  "client_id" varchar NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "broker_id" varchar NOT NULL REFERENCES "users"("id"),
  "master_broker_id" varchar REFERENCES "users"("id"),
  "status" varchar NOT NULL DEFAULT 'legacy_unverified',
  "last_valid_activity_at" timestamp,
  "last_activity_type" varchar,
  "last_activity_summary" text,
  "active_until" timestamp,
  "dormant_until" timestamp,
  "inbound_priority_expires_at" timestamp,
  "inbound_priority_status" varchar,
  "notes" text,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "rel_client_idx" ON "client_commercial_relationships" ("client_id");
CREATE INDEX IF NOT EXISTS "rel_broker_idx" ON "client_commercial_relationships" ("broker_id");
CREATE INDEX IF NOT EXISTS "rel_status_idx" ON "client_commercial_relationships" ("status");

-- 2. commercial_opportunities
CREATE TABLE IF NOT EXISTS "commercial_opportunities" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" varchar REFERENCES "tenants"("id"),
  "client_id" varchar NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "broker_id" varchar NOT NULL REFERENCES "users"("id"),
  "master_broker_id" varchar REFERENCES "users"("id"),
  "title" varchar NOT NULL,
  "financing_need_type" varchar NOT NULL,
  "requested_amount" numeric(15, 2) NOT NULL,
  "product_template_id" varchar REFERENCES "product_templates"("id"),
  "target_institution_id" varchar REFERENCES "financial_institutions"("id"),
  "status" varchar NOT NULL DEFAULT 'registered_hold',
  "hold_expires_at" timestamp NOT NULL,
  "protected_until" timestamp,
  "last_valid_activity_at" timestamp NOT NULL DEFAULT now(),
  "initial_evidence_type" varchar,
  "initial_evidence_doc_url" varchar,
  "initial_evidence_validated_at" timestamp,
  "initial_evidence_validated_by" varchar REFERENCES "users"("id"),
  "linked_submission_id" varchar REFERENCES "credit_submission_requests"("id"),
  "converted_credit_id" varchar REFERENCES "credits"("id"),
  "is_derived_work_suspicion" boolean DEFAULT false,
  "prior_work_broker_id" varchar REFERENCES "users"("id"),
  "notes" text,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "opp_client_idx" ON "commercial_opportunities" ("client_id");
CREATE INDEX IF NOT EXISTS "opp_broker_idx" ON "commercial_opportunities" ("broker_id");
CREATE INDEX IF NOT EXISTS "opp_status_idx" ON "commercial_opportunities" ("status");
CREATE INDEX IF NOT EXISTS "opp_need_idx" ON "commercial_opportunities" ("client_id", "financing_need_type");

-- 3. commercial_activities
CREATE TABLE IF NOT EXISTS "commercial_activities" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "client_id" varchar NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "opportunity_id" varchar REFERENCES "commercial_opportunities"("id"),
  "relationship_id" varchar REFERENCES "client_commercial_relationships"("id"),
  "broker_id" varchar NOT NULL REFERENCES "users"("id"),
  "activity_type" varchar NOT NULL,
  "title" varchar NOT NULL,
  "description" text,
  "document_id" varchar REFERENCES "documents"("id"),
  "evidence_url" varchar,
  "verified_by_system" boolean DEFAULT true,
  "performed_at" timestamp NOT NULL DEFAULT now(),
  "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "comm_act_client_idx" ON "commercial_activities" ("client_id");
CREATE INDEX IF NOT EXISTS "comm_act_opp_idx" ON "commercial_activities" ("opportunity_id");
CREATE INDEX IF NOT EXISTS "comm_act_broker_idx" ON "commercial_activities" ("broker_id");

-- 4. broker_election_confirmations
CREATE TABLE IF NOT EXISTS "broker_election_confirmations" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "client_id" varchar NOT NULL REFERENCES "clients"("id"),
  "opportunity_id" varchar REFERENCES "commercial_opportunities"("id"),
  "previous_broker_id" varchar REFERENCES "users"("id"),
  "selected_broker_id" varchar NOT NULL REFERENCES "users"("id"),
  "channel" varchar NOT NULL,
  "recipient_contact" varchar NOT NULL,
  "recipient_name" varchar,
  "recipient_role" varchar,
  "token_hash" varchar NOT NULL UNIQUE,
  "token_expires_at" timestamp NOT NULL,
  "status" varchar NOT NULL DEFAULT 'pending',
  "confirmed_at" timestamp,
  "confirmation_ip" varchar,
  "confirmation_user_agent" text,
  "revoked_at" timestamp,
  "revoked_reason" varchar,
  "validated_by_admin_id" varchar REFERENCES "users"("id"),
  "manual_evidence_file_url" varchar,
  "manual_validation_notes" text,
  "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "elec_client_idx" ON "broker_election_confirmations" ("client_id");
CREATE INDEX IF NOT EXISTS "elec_token_idx" ON "broker_election_confirmations" ("token_hash");

-- 5. commercial_audit_logs
CREATE TABLE IF NOT EXISTS "commercial_audit_logs" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "entity_type" varchar NOT NULL,
  "entity_id" varchar NOT NULL,
  "client_id" varchar REFERENCES "clients"("id"),
  "broker_id" varchar REFERENCES "users"("id"),
  "performed_by" varchar REFERENCES "users"("id"),
  "action" varchar NOT NULL,
  "previous_state" varchar,
  "new_state" varchar,
  "metadata" jsonb DEFAULT '{}',
  "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "comm_audit_entity_idx" ON "commercial_audit_logs" ("entity_type", "entity_id");
CREATE INDEX IF NOT EXISTS "comm_audit_client_idx" ON "commercial_audit_logs" ("client_id");

-- 6. operational_rules_versions
CREATE TABLE IF NOT EXISTS "operational_rules_versions" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "version" varchar NOT NULL UNIQUE,
  "title" varchar NOT NULL,
  "summary" text NOT NULL,
  "content_markdown" text NOT NULL,
  "effective_date" date NOT NULL,
  "is_current" boolean NOT NULL DEFAULT false,
  "requires_acknowledgment" boolean DEFAULT false,
  "created_by" varchar REFERENCES "users"("id"),
  "created_at" timestamp DEFAULT now()
);

-- 7. user_rule_acknowledgments
CREATE TABLE IF NOT EXISTS "user_rule_acknowledgments" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar NOT NULL REFERENCES "users"("id"),
  "rule_version_id" varchar NOT NULL REFERENCES "operational_rules_versions"("id"),
  "acknowledged_at" timestamp NOT NULL DEFAULT now(),
  "ip_address" varchar
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_rule_ack_unique" ON "user_rule_acknowledgments" ("user_id", "rule_version_id");

-- 8. commercial_configurations
CREATE TABLE IF NOT EXISTS "commercial_configurations" (
  "id" varchar PRIMARY KEY DEFAULT 'default',
  "active_relationship_validity_days" integer NOT NULL DEFAULT 90,
  "initial_opportunity_hold_days" integer NOT NULL DEFAULT 7,
  "opportunity_inactivity_protection_days" integer NOT NULL DEFAULT 45,
  "inbound_priority_hours" integer NOT NULL DEFAULT 48,
  "renewal_window_days_before_maturity" integer NOT NULL DEFAULT 180,
  "renewal_originator_priority_days" integer NOT NULL DEFAULT 15,
  "broker_election_token_validity_hours" integer NOT NULL DEFAULT 72,
  "updated_by" varchar REFERENCES "users"("id"),
  "updated_at" timestamp DEFAULT now()
);

-- 9. commercial_config_audit_logs
CREATE TABLE IF NOT EXISTS "commercial_config_audit_logs" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "parameter_key" varchar NOT NULL,
  "previous_value" varchar NOT NULL,
  "new_value" varchar NOT NULL,
  "changed_by" varchar REFERENCES "users"("id"),
  "change_reason" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "comm_cfg_audit_param_idx" ON "commercial_config_audit_logs" ("parameter_key");
CREATE INDEX IF NOT EXISTS "comm_cfg_audit_created_idx" ON "commercial_config_audit_logs" ("created_at");

