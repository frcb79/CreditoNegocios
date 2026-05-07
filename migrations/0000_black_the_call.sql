CREATE TABLE "client_credit_histories" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" varchar NOT NULL,
	"source" varchar DEFAULT 'manual' NOT NULL,
	"linked_credit_id" varchar,
	"credit_type" varchar NOT NULL,
	"amount_granted" varchar NOT NULL,
	"term_months" varchar NOT NULL,
	"interest_rate" varchar NOT NULL,
	"financial_institution" varchar,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"broker_id" varchar NOT NULL,
	"type" varchar NOT NULL,
	"business_name" varchar,
	"first_name" varchar,
	"last_name" varchar,
	"rfc" varchar,
	"curp" varchar,
	"email" varchar,
	"phone" varchar,
	"address" varchar,
	"street" varchar,
	"number" varchar,
	"interior" varchar,
	"postal_code" varchar,
	"state" varchar,
	"industry" varchar,
	"years_in_business" integer,
	"legal_representative" jsonb,
	"guarantors" jsonb DEFAULT '[]',
	"guarantees" jsonb DEFAULT '[]',
	"profiling_data" jsonb DEFAULT '{}',
	"ingreso_mensual_promedio" varchar,
	"edad_cliente" varchar,
	"estado_civil" varchar,
	"nivel_educativo" varchar,
	"nivel_educacion_accionista" varchar,
	"experiencia_crediticia" varchar,
	"objetivo_credito" varchar,
	"plazo_deseado" varchar,
	"capacidad_pago" varchar,
	"ingresos_familiares" varchar,
	"dependientes_economicos" varchar,
	"tipo_vivienda" varchar,
	"antiguedad_empleo" varchar,
	"sector_economico" varchar,
	"tiempo_actividad" varchar,
	"clientes_banco" varchar,
	"productos_financieros" varchar,
	"monto_solicitado" varchar,
	"garantias" varchar,
	"historial_pagos" varchar,
	"referencias_comerciales" varchar,
	"egreso_mensual_promedio" varchar,
	"ingreso_anual" varchar,
	"participacion_ventas_gobierno" varchar,
	"ventas_terminal_bancaria" varchar,
	"buro_accionista_principal" varchar,
	"buro_empresa" varchar,
	"atrasos_deudas" varchar,
	"atrasos_detalles" text,
	"garantia" varchar,
	"garantia_detalles" jsonb DEFAULT '{}',
	"aval_obligado_solidario" varchar,
	"sat_ciec" varchar,
	"estados_financieros" varchar,
	"opinion_cumplimiento" varchar,
	"opinion_detalles" text,
	"creditos_vigentes" varchar,
	"creditos_vigentes_detalles" jsonb DEFAULT '[]',
	"puesto" varchar,
	"antiguedad_laboral" varchar,
	"ingreso_mensual_promedio_comprobables" varchar,
	"ingreso_mensual_promedio_no_comprobables" varchar,
	"gastos_fijos_mensuales_promedio" varchar,
	"buro_persona_fisica" varchar,
	"atrasos_deudas_buro" varchar,
	"atrasos_deudas_buro_detalles" text,
	"cuenta_con_garantia_fisica" varchar,
	"garantia_fisica_detalles" jsonb DEFAULT '{}',
	"tiene_aval_obligado_solidario_fisica" varchar,
	"observaciones_adicionales_fisica" text,
	"nombre_comercial" varchar,
	"ocupacion" varchar,
	"direccion_negocio_aplica" varchar,
	"es_misma_direccion_negocio" varchar,
	"calle_negocio" varchar,
	"numero_negocio" varchar,
	"interior_negocio" varchar,
	"codigo_postal_negocio" varchar,
	"estado_negocio" varchar,
	"ingreso_mensual_promedio_comprobables_sin_sat" varchar,
	"ingreso_mensual_promedio_no_comprobables_sin_sat" varchar,
	"gastos_fijos_mensuales_promedio_sin_sat" varchar,
	"buro_persona_fisica_sin_sat" varchar,
	"atrasos_deudas_buro_sin_sat" varchar,
	"atrasos_deudas_buro_detalles_sin_sat" text,
	"cuenta_con_garantia_sin_sat" varchar,
	"garantia_sin_sat_detalles" jsonb DEFAULT '{}',
	"tiene_aval_obligado_solidario_sin_sat" varchar,
	"observaciones_adicionales_sin_sat" text,
	"notes" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "commissions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"credit_id" varchar NOT NULL,
	"broker_id" varchar NOT NULL,
	"master_broker_id" varchar,
	"commission_type" varchar,
	"amount" numeric(15, 2) NOT NULL,
	"broker_share" numeric(15, 2),
	"master_broker_share" numeric(15, 2),
	"app_share" numeric(15, 2),
	"status" varchar DEFAULT 'pending' NOT NULL,
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "credit_submission_requests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" varchar NOT NULL,
	"broker_id" varchar NOT NULL,
	"product_template_id" varchar,
	"requested_amount" numeric(15, 2) NOT NULL,
	"purpose" text,
	"broker_notes" text,
	"status" varchar DEFAULT 'pending_admin' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "credit_submission_targets" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" varchar NOT NULL,
	"financial_institution_id" varchar NOT NULL,
	"status" varchar DEFAULT 'pending_admin' NOT NULL,
	"admin_notes" text,
	"details" text,
	"reviewed_by" varchar,
	"reviewed_at" timestamp,
	"institution_proposal" jsonb DEFAULT '{}',
	"proposal_received_at" timestamp,
	"proposal_document" varchar,
	"is_winner" boolean DEFAULT false,
	"dispersed_at" timestamp,
	"credit_id" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "credits" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" varchar NOT NULL,
	"broker_id" varchar NOT NULL,
	"financial_institution_id" varchar,
	"product_template_id" varchar,
	"linked_submission_id" varchar,
	"amount" numeric(15, 2) NOT NULL,
	"interest_rate" numeric(5, 2),
	"term" integer,
	"frequency" varchar,
	"purpose" text,
	"status" varchar DEFAULT 'draft' NOT NULL,
	"start_date" date,
	"end_date" date,
	"payment_amount" numeric(15, 2),
	"remaining_balance" numeric(15, 2),
	"payment_history" jsonb DEFAULT '[]',
	"amortization_table" jsonb DEFAULT '[]',
	"documents" jsonb DEFAULT '[]',
	"final_proposal" jsonb DEFAULT '{}',
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" varchar,
	"credit_id" varchar,
	"broker_id" varchar,
	"type" varchar NOT NULL,
	"file_name" varchar NOT NULL,
	"file_path" varchar NOT NULL,
	"file_size" integer,
	"mime_type" varchar,
	"extracted_data" jsonb DEFAULT '{}',
	"is_valid" boolean DEFAULT true,
	"expires_at" date,
	"uploaded_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "financial_institution_requests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"broker_id" varchar NOT NULL,
	"institution_name" varchar NOT NULL,
	"reason" text NOT NULL,
	"contact_name" varchar,
	"contact_email" varchar,
	"contact_phone" varchar,
	"status" varchar DEFAULT 'pending' NOT NULL,
	"admin_notes" text,
	"reviewed_by" varchar,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "financial_institutions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar NOT NULL,
	"contact_person" varchar,
	"email" varchar,
	"phone" varchar,
	"street" varchar,
	"number" varchar,
	"interior" varchar,
	"city" varchar,
	"postal_code" varchar,
	"state" varchar,
	"description" text,
	"commission_rate" numeric(5, 2),
	"opening_commission_rate" varchar,
	"overrate_commission_rate" varchar,
	"broker_commission_rate" varchar,
	"master_broker_commission_rate" varchar,
	"commission_rates" jsonb DEFAULT '{}',
	"additional_costs" jsonb DEFAULT '[]',
	"requirements" jsonb DEFAULT '{}',
	"products" jsonb DEFAULT '[]',
	"accepted_profiles" text[] DEFAULT ARRAY[]::text[],
	"application_process" jsonb DEFAULT '[]',
	"estimated_timeframes" jsonb DEFAULT '{}',
	"approval_tips" text[] DEFAULT ARRAY[]::text[],
	"required_documents" text[] DEFAULT ARRAY[]::text[],
	"created_by" varchar,
	"created_by_admin" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "institution_products" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" varchar NOT NULL,
	"institution_id" varchar NOT NULL,
	"custom_name" varchar,
	"configuration" jsonb DEFAULT '{}',
	"target_profiles" text[],
	"active_variables" jsonb DEFAULT '{}',
	"is_active" boolean DEFAULT true,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"type" varchar NOT NULL,
	"title" varchar NOT NULL,
	"message" text NOT NULL,
	"data" jsonb DEFAULT '{}',
	"is_read" boolean DEFAULT false,
	"priority" varchar DEFAULT 'normal',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "product_requests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requested_by" varchar NOT NULL,
	"institution_name" varchar,
	"existing_institution_id" varchar,
	"product_name" varchar NOT NULL,
	"product_description" text,
	"business_justification" text,
	"estimated_volume" varchar,
	"target_market" varchar,
	"desired_configuration" jsonb DEFAULT '{}',
	"status" varchar DEFAULT 'pending' NOT NULL,
	"reviewed_by" varchar,
	"review_notes" text,
	"reviewed_at" timestamp,
	"created_product_id" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "product_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar NOT NULL,
	"description" text,
	"category" varchar,
	"target_profiles" text[] DEFAULT '{}',
	"available_variables" jsonb DEFAULT '{}',
	"base_configuration" jsonb DEFAULT '{}',
	"is_active" boolean DEFAULT true,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "product_variables" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar NOT NULL,
	"display_name" varchar NOT NULL,
	"description" text,
	"category" varchar DEFAULT 'basic' NOT NULL,
	"data_type" varchar NOT NULL,
	"options" jsonb,
	"min_value" numeric,
	"max_value" numeric,
	"unit" varchar,
	"default_value" text,
	"is_required" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "product_variables_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" varchar NOT NULL,
	"name" varchar NOT NULL,
	"description" text,
	"category" varchar,
	"available_variables" jsonb DEFAULT '{}',
	"configuration" jsonb DEFAULT '{}',
	"requirements" jsonb DEFAULT '{}',
	"documents" text[] DEFAULT '{}',
	"is_active" boolean DEFAULT true,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_members" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"role" varchar NOT NULL,
	"is_active" boolean DEFAULT true,
	"joined_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" varchar NOT NULL,
	"name" varchar NOT NULL,
	"slug" varchar NOT NULL,
	"parent_tenant_id" varchar,
	"settings" jsonb DEFAULT '{}',
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar,
	"password" varchar,
	"auth_method" varchar DEFAULT 'replit',
	"reset_token" varchar,
	"reset_token_expiry" timestamp,
	"first_name" varchar,
	"last_name" varchar,
	"profile_image_url" varchar,
	"role" varchar DEFAULT 'broker' NOT NULL,
	"master_broker_id" varchar,
	"custom_logo" varchar,
	"brand_name" varchar,
	"primary_color" varchar,
	"secondary_color" varchar,
	"is_white_label" boolean DEFAULT false,
	"auto_register_brokers" boolean DEFAULT false,
	"profile_type" varchar,
	"profile_data" jsonb DEFAULT '{}',
	"commercial_references" jsonb DEFAULT '[]',
	"bank_name" varchar,
	"clabe" varchar,
	"account_holder" varchar,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "client_credit_histories" ADD CONSTRAINT "client_credit_histories_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_credit_histories" ADD CONSTRAINT "client_credit_histories_linked_credit_id_credits_id_fk" FOREIGN KEY ("linked_credit_id") REFERENCES "public"."credits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_broker_id_users_id_fk" FOREIGN KEY ("broker_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_credit_id_credits_id_fk" FOREIGN KEY ("credit_id") REFERENCES "public"."credits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_broker_id_users_id_fk" FOREIGN KEY ("broker_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_master_broker_id_users_id_fk" FOREIGN KEY ("master_broker_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_submission_requests" ADD CONSTRAINT "credit_submission_requests_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_submission_requests" ADD CONSTRAINT "credit_submission_requests_broker_id_users_id_fk" FOREIGN KEY ("broker_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_submission_requests" ADD CONSTRAINT "credit_submission_requests_product_template_id_product_templates_id_fk" FOREIGN KEY ("product_template_id") REFERENCES "public"."product_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_submission_targets" ADD CONSTRAINT "credit_submission_targets_request_id_credit_submission_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."credit_submission_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_submission_targets" ADD CONSTRAINT "credit_submission_targets_financial_institution_id_financial_institutions_id_fk" FOREIGN KEY ("financial_institution_id") REFERENCES "public"."financial_institutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_submission_targets" ADD CONSTRAINT "credit_submission_targets_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_submission_targets" ADD CONSTRAINT "credit_submission_targets_credit_id_credits_id_fk" FOREIGN KEY ("credit_id") REFERENCES "public"."credits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credits" ADD CONSTRAINT "credits_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credits" ADD CONSTRAINT "credits_broker_id_users_id_fk" FOREIGN KEY ("broker_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credits" ADD CONSTRAINT "credits_financial_institution_id_financial_institutions_id_fk" FOREIGN KEY ("financial_institution_id") REFERENCES "public"."financial_institutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credits" ADD CONSTRAINT "credits_product_template_id_product_templates_id_fk" FOREIGN KEY ("product_template_id") REFERENCES "public"."product_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credits" ADD CONSTRAINT "credits_linked_submission_id_credit_submission_requests_id_fk" FOREIGN KEY ("linked_submission_id") REFERENCES "public"."credit_submission_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_credit_id_credits_id_fk" FOREIGN KEY ("credit_id") REFERENCES "public"."credits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_broker_id_users_id_fk" FOREIGN KEY ("broker_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_institution_requests" ADD CONSTRAINT "financial_institution_requests_broker_id_users_id_fk" FOREIGN KEY ("broker_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_institution_requests" ADD CONSTRAINT "financial_institution_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_institutions" ADD CONSTRAINT "financial_institutions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institution_products" ADD CONSTRAINT "institution_products_template_id_product_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."product_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institution_products" ADD CONSTRAINT "institution_products_institution_id_financial_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."financial_institutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institution_products" ADD CONSTRAINT "institution_products_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_requests" ADD CONSTRAINT "product_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_requests" ADD CONSTRAINT "product_requests_existing_institution_id_financial_institutions_id_fk" FOREIGN KEY ("existing_institution_id") REFERENCES "public"."financial_institutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_requests" ADD CONSTRAINT "product_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_requests" ADD CONSTRAINT "product_requests_created_product_id_products_id_fk" FOREIGN KEY ("created_product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_templates" ADD CONSTRAINT "product_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variables" ADD CONSTRAINT "product_variables_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_institution_id_financial_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."financial_institutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_members" ADD CONSTRAINT "tenant_members_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_members" ADD CONSTRAINT "tenant_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");