import { sql } from 'drizzle-orm';
import {
  index,
  uniqueIndex,
  jsonb,
  pgTable,
  timestamp,
  varchar,
  text,
  integer,
  decimal,
  boolean,
  date,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table (mandatory for Replit Auth)
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  password: varchar("password"), // Hashed password for local auth
  authMethod: varchar("auth_method").default("local"), // "local"
  resetToken: varchar("reset_token"), // Token for password reset
  resetTokenExpiry: timestamp("reset_token_expiry"), // When the reset token expires
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  role: varchar("role").notNull().default("broker"), // "super_admin", "admin", "master_broker", "broker"
  masterBrokerId: varchar("master_broker_id"),
  referralCode: varchar("referral_code").unique(), // Clave única de franquicia para afiliar brokers a su red
  // White label fields for master brokers
  customLogo: varchar("custom_logo"), // URL to custom logo
  brandName: varchar("brand_name"), // Custom brand name
  primaryColor: varchar("primary_color"), // Hex color code
  secondaryColor: varchar("secondary_color"), // Hex color code
  isWhiteLabel: boolean("is_white_label").default(false), // Enable white label
  autoRegisterBrokers: boolean("auto_register_brokers").default(false), // Allow auto-registration
  // User profiling information
  profileType: varchar("profile_type"), // "persona_moral", "fisica_empresarial", "fisica", "sin_sat"
  profileData: jsonb("profile_data").default('{}'), // Contains all profiling responses
  // Commercial references for brokers (array of {name, phone, email})
  commercialReferences: jsonb("commercial_references").default('[]'),
  // Banking information for commission payments
  bankName: varchar("bank_name"),
  clabe: varchar("clabe"), // 18-digit CLABE interbancaria
  accountHolder: varchar("account_holder"), // Nombre del titular
  // Custom commission rates assigned by Master Broker to their network per institution
  networkCommissionRates: jsonb("network_commission_rates").default('{}'),
  // Granular RBAC Permissions & Custom Role Title
  customRoleTitle: varchar("custom_role_title"), // e.g. "Mesa de Control", "Analista de Crédito", "Gerente Operativo"
  permissions: jsonb("permissions").default('{}'), // { modules: string[], actions: string[], scope?: 'global' | 'network' | 'own' }
  // Commercial Access Status & Active Promo
  accessStatus: varchar("access_status").notNull().default("free"), // "free", "promotional", "trial", "active", "complimentary", "expired", "suspended"
  accessStatusExpiresAt: timestamp("access_status_expires_at"),
  accessStatusNotes: text("access_status_notes"),
  activePromoId: varchar("active_promo_id"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Tenant organization types catalogue
export const TENANT_TYPES = ["platform", "master_broker", "broker"] as const;
export type TenantType = (typeof TENANT_TYPES)[number];

// Tenants table - Multi-tenant organizations
export const tenants = pgTable("tenants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: varchar("type").notNull(), // "platform", "master_broker", "broker"
  name: varchar("name").notNull(),
  slug: varchar("slug").unique().notNull(), // For subdomains/URLs
  parentTenantId: varchar("parent_tenant_id"), // Self-reference, will be constrained later if needed
  settings: jsonb("settings").default('{}'), // White-label, branding, configurations
  accessStatus: varchar("access_status").default("free"),
  accessStatusExpiresAt: timestamp("access_status_expires_at"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Tenant member role catalogue
export const TENANT_MEMBER_ROLES = ["owner", "admin", "member"] as const;
export type TenantMemberRole = (typeof TENANT_MEMBER_ROLES)[number];

// Tenant Members table - Users belonging to tenants with roles
export const tenantMembers = pgTable("tenant_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  role: varchar("role", { enum: ["owner", "admin", "member"] }).notNull(), // Role within this specific tenant
  canOriginate: boolean("can_originate").default(false), // Capacidad de actuar como broker originador y percibir comisiones
  isActive: boolean("is_active").default(true),
  joinedAt: timestamp("joined_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("tenant_members_tenant_user_unique").on(table.tenantId, table.userId),
  index("tenant_members_user_idx").on(table.userId),
  index("tenant_members_tenant_idx").on(table.tenantId),
]);

// Organization member with user data
export interface TenantMemberWithUser {
  id: string;
  tenantId: string;
  userId: string;
  role: TenantMemberRole;
  canOriginate?: boolean | null;
  isActive: boolean;
  joinedAt: Date | null;
  updatedAt: Date | null;
  user: {
    id: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    role: string;
    customRoleTitle: string | null;
    permissions: unknown;
    isActive: boolean | null;
    profileImageUrl: string | null;
    updatedAt: Date | null;
  };
}

// Clients table
export const clients = pgTable("clients", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id),
  brokerId: varchar("broker_id").notNull().references(() => users.id),
  createdBy: varchar("created_by").references(() => users.id),
  type: varchar("type").notNull(), // "persona_moral" | "fisica_empresarial" | "fisica" | "sin_sat"
  businessName: varchar("business_name"),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  rfc: varchar("rfc"), // Nullable para permitir clientes SIN SAT sin RFC
  curp: varchar("curp"),
  email: varchar("email"),
  phone: varchar("phone"),
  address: varchar("address"), // Legacy column - preservar para compatibilidad
  street: varchar("street"),
  number: varchar("number"),
  interior: varchar("interior"),
  postalCode: varchar("postal_code"),
  state: varchar("state"),
  industry: varchar("industry"),
  yearsInBusiness: integer("years_in_business"),
  legalRepresentative: jsonb("legal_representative"), // For moral persons
  guarantors: jsonb("guarantors").default('[]'),
  guarantees: jsonb("guarantees").default('[]'),
  
  // Client profiling data from Excel questions
  profilingData: jsonb("profiling_data").default('{}'), // Contains all profiling responses
  ingresoMensualPromedio: varchar("ingreso_mensual_promedio"),
  edadCliente: varchar("edad_cliente"),
  estadoCivil: varchar("estado_civil"),
  nivelEducativo: varchar("nivel_educativo"),
  nivelEducacionAccionista: varchar("nivel_educacion_accionista"), // Para persona moral
  experienciaCrediticia: varchar("experiencia_crediticia"),
  objetivoCredito: varchar("objetivo_credito"),
  plazoDeseado: varchar("plazo_deseado"),
  capacidadPago: varchar("capacidad_pago"),
  ingresosFamiliares: varchar("ingresos_familiares"),
  dependientesEconomicos: varchar("dependientes_economicos"),
  tipoVivienda: varchar("tipo_vivienda"),
  antiguedadEmpleo: varchar("antiguedad_empleo"),
  sectoreEconomico: varchar("sector_economico"),
  tiempoActividad: varchar("tiempo_actividad"),
  clientesBanco: varchar("clientes_banco"),
  productosFinancieros: varchar("productos_financieros"),
  montoSolicitado: varchar("monto_solicitado"),
  garantias: varchar("garantias"),
  historialPagos: varchar("historial_pagos"),
  referenciasComerciales: varchar("referencias_comerciales"),
  
  // Campos específicos para Persona Moral
  egresoMensualPromedio: varchar("egreso_mensual_promedio"),
  ingresoAnual: varchar("ingreso_anual"),
  participacionVentasGobierno: varchar("participacion_ventas_gobierno"),
  ventasTerminalBancaria: varchar("ventas_terminal_bancaria"),
  buroAccionistaPrincipal: varchar("buro_accionista_principal"),
  buroEmpresa: varchar("buro_empresa"),
  atrasosDeudas: varchar("atrasos_deudas"),
  atrasosDetalles: text("atrasos_detalles"),
  garantia: varchar("garantia"),
  garantiaDetalles: jsonb("garantia_detalles").default('{}'),
  avalObligadoSolidario: varchar("aval_obligado_solidario"),
  satCiec: varchar("sat_ciec"),
  estadosFinancieros: varchar("estados_financieros"),
  opinionCumplimiento: varchar("opinion_cumplimiento"),
  opinionDetalles: text("opinion_detalles"),
  creditosVigentes: varchar("creditos_vigentes"),
  creditosVigentesDetalles: jsonb("creditos_vigentes_detalles").default('[]'),
  
  // Nuevos campos específicos para Persona Física
  puesto: varchar("puesto"),
  antiguedadLaboral: varchar("antiguedad_laboral"),
  ingresoMensualPromedioComprobables: varchar("ingreso_mensual_promedio_comprobables"),
  ingresoMensualPromedioNoComprobables: varchar("ingreso_mensual_promedio_no_comprobables"),
  gastosFijosMensualesPromedio: varchar("gastos_fijos_mensuales_promedio"),
  buroPersonaFisica: varchar("buro_persona_fisica"),
  atrasosDeudasBuro: varchar("atrasos_deudas_buro"),
  atrasosDeudasBuroDetalles: text("atrasos_deudas_buro_detalles"),
  cuentaConGarantiaFisica: varchar("cuenta_con_garantia_fisica"),
  garantiaFisicaDetalles: jsonb("garantia_fisica_detalles").default('{}'),
  tieneAvalObligadoSolidarioFisica: varchar("tiene_aval_obligado_solidario_fisica"),
  observacionesAdicionalesFisica: text("observaciones_adicionales_fisica"),
  
  // Nuevos campos específicos para Sin SAT
  nombreComercial: varchar("nombre_comercial"),
  ocupacion: varchar("ocupacion"), // Reubicado al lado de CURP
  direccionNegocioAplica: varchar("direccion_negocio_aplica"), // SI/NO
  esMismaDireccionNegocio: varchar("es_misma_direccion_negocio"), // SI/NO
  calleNegocio: varchar("calle_negocio"),
  numeroNegocio: varchar("numero_negocio"),
  interiorNegocio: varchar("interior_negocio"),
  codigoPostalNegocio: varchar("codigo_postal_negocio"),
  estadoNegocio: varchar("estado_negocio"),
  
  // Perfilamiento específico para Sin SAT
  ingresoMensualPromedioComprobablesSinSat: varchar("ingreso_mensual_promedio_comprobables_sin_sat"),
  ingresoMensualPromedioNoComprobablesSinSat: varchar("ingreso_mensual_promedio_no_comprobables_sin_sat"),
  gastosFijosMensualesPromedioSinSat: varchar("gastos_fijos_mensuales_promedio_sin_sat"),
  buroPersonaFisicaSinSat: varchar("buro_persona_fisica_sin_sat"),
  atrasosDeudasBuroSinSat: varchar("atrasos_deudas_buro_sin_sat"),
  atrasosDeudasBuroDetallesSinSat: text("atrasos_deudas_buro_detalles_sin_sat"),
  cuentaConGarantiaSinSat: varchar("cuenta_con_garantia_sin_sat"),
  garantiaSinSatDetalles: jsonb("garantia_sin_sat_detalles").default('{}'),
  tieneAvalObligadoSolidarioSinSat: varchar("tiene_aval_obligado_solidario_sin_sat"),
  observacionesAdicionalesSinSat: text("observaciones_adicionales_sin_sat"),
  
  notes: text("notes"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("clients_tenant_idx").on(table.tenantId),
  index("clients_broker_idx").on(table.brokerId),
]);

// Client Credit Histories table - Historial crediticio de clientes (manual y automático)
export const clientCreditHistories = pgTable("client_credit_histories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientId: varchar("client_id").notNull().references(() => clients.id),
  source: varchar("source").notNull().default("manual"), // "manual" | "system"
  linkedCreditId: varchar("linked_credit_id").references(() => credits.id), // Solo para créditos del sistema
  
  // Campos del historial crediticio
  creditType: varchar("credit_type").notNull(), // Tipo de crédito
  amountGranted: varchar("amount_granted").notNull(), // Monto otorgado
  termMonths: varchar("term_months").notNull(), // Plazo en meses
  interestRate: varchar("interest_rate").notNull(), // Tasa de interés
  financialInstitution: varchar("financial_institution"), // Nombre de la financiera (opcional)
  notes: text("notes"), // Notas adicionales
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Financial Institutions table (moved before credits to resolve forward reference)
export const financialInstitutions = pgTable("financial_institutions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  contactPerson: varchar("contact_person"),
  email: varchar("email"),
  phone: varchar("phone"),
  // Address fields
  street: varchar("street"),
  number: varchar("number"),
  interior: varchar("interior"),
  city: varchar("city"),
  postalCode: varchar("postal_code"),
  state: varchar("state"),
  description: text("description"),
  
  // Commission rates - expanded from single commissionRate
  commissionRate: decimal("commission_rate", { precision: 5, scale: 2 }), // Legacy field maintained for compatibility
  openingCommissionRate: varchar("opening_commission_rate"), // Comisión de apertura
  overrateCommissionRate: varchar("overrate_commission_rate"), // Comisión de sobretasa
  brokerCommissionRate: varchar("broker_commission_rate"), // Comisión del broker
  masterBrokerCommissionRate: varchar("master_broker_commission_rate"), // Comisión del master broker
  
  // Commission rates structure (JSONB) - New flexible structure
  commissionRates: jsonb("commission_rates").default('{}'), // { masterBroker: { total, apertura, sobretasa, renovacion }, broker: { total, apertura, sobretasa, renovacion } }
  
  // Business structure
  additionalCosts: jsonb("additional_costs").default('[]'), // Costos adicionales
  requirements: jsonb("requirements").default('{}'), // Requisitos por tipo de cliente: { persona_moral: {...}, fisica_empresarial: {...}, fisica: {...}, sin_sat: {...} }
  products: jsonb("products").default('[]'), // Productos disponibles
  acceptedProfiles: text("accepted_profiles").array().default(sql`ARRAY[]::text[]`), // Perfiles de cliente aceptados globalmente: ['persona_moral', 'fisica_empresarial', 'fisica', 'sin_sat']
  
  // Broker-facing information
  applicationProcess: jsonb("application_process").default('[]'), // Array de pasos del proceso de solicitud: [{ step: 1, title: "...", description: "...", estimatedTime: "..." }]
  estimatedTimeframes: jsonb("estimated_timeframes").default('{}'), // Tiempos estimados: { analysis: "24-48hrs", approval: "5 días", dispersion: "48hrs" }
  approvalTips: text("approval_tips").array().default(sql`ARRAY[]::text[]`), // Tips para mejorar probabilidad de aprobación
  requiredDocuments: text("required_documents").array().default(sql`ARRAY[]::text[]`), // Lista de documentos requeridos
  
  // Administrative fields
  createdBy: varchar("created_by").references(() => users.id), // Usuario que la creó
  createdByAdmin: boolean("created_by_admin").default(false), // Si fue creada por un admin
  
  // Status and metadata
  isActive: boolean("is_active").default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Credits table
export const credits = pgTable("credits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id),
  clientId: varchar("client_id").notNull().references(() => clients.id),
  brokerId: varchar("broker_id").notNull().references(() => users.id),
  createdBy: varchar("created_by").references(() => users.id),
  financialInstitutionId: varchar("financial_institution_id").references(() => financialInstitutions.id),
  productTemplateId: varchar("product_template_id").references(() => productTemplates.id), // Tipo de crédito
  linkedSubmissionId: varchar("linked_submission_id").references(() => creditSubmissionRequests.id), // Link to original submission request
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  interestRate: decimal("interest_rate", { precision: 5, scale: 2 }),
  term: integer("term"), // in months
  frequency: varchar("frequency"), // "weekly", "biweekly", "monthly"
  purpose: text("purpose"), // Fin del crédito
  status: varchar("status").notNull().default("draft"), // "draft", "submitted", "under_review", "approved", "rejected", "disbursed", "active", "completed", "defaulted"
  startDate: date("start_date"),
  endDate: date("end_date"),
  paymentAmount: decimal("payment_amount", { precision: 15, scale: 2 }),
  remainingBalance: decimal("remaining_balance", { precision: 15, scale: 2 }),
  paymentHistory: jsonb("payment_history").default('[]'),
  amortizationTable: jsonb("amortization_table").default('[]'),
  documents: jsonb("documents").default('[]'),
  
  // Final proposal data (set by admin when credit is approved)
  finalProposal: jsonb("final_proposal").default('{}'), // { approvedAmount, term, commissionRates: { masterBroker: {...}, broker: {...} }, commissionsToApply: ['apertura', 'sobretasa'] }
  
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("credits_tenant_idx").on(table.tenantId),
  index("credits_client_idx").on(table.clientId),
  index("credits_broker_idx").on(table.brokerId),
]);


export const COMMISSION_STATUSES = [
  "generated",
  "approved",
  "dispersing",
  "paid",
  "failed",
  "cancelled",
] as const;
export type CommissionStatus = (typeof COMMISSION_STATUSES)[number];

// Commissions table
export const commissions = pgTable("commissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id),
  creditId: varchar("credit_id").notNull().references(() => credits.id),
  brokerId: varchar("broker_id").notNull().references(() => users.id),
  masterBrokerId: varchar("master_broker_id").references(() => users.id),
  commissionType: varchar("commission_type"), // "total", "apertura", "sobretasa", "renovacion"
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  brokerShare: decimal("broker_share", { precision: 15, scale: 2 }),
  masterBrokerShare: decimal("master_broker_share", { precision: 15, scale: 2 }),
  appShare: decimal("app_share", { precision: 15, scale: 2 }),
  frozenAmount: decimal("frozen_amount", { precision: 15, scale: 2 }), // Monto neto congelado al aprobarse
  status: varchar("status").notNull().default("generated"), // "generated", "approved", "dispersing", "paid", "failed", "cancelled"
  approvedAt: timestamp("approved_at"),
  approvedBy: varchar("approved_by").references(() => users.id),
  paidAt: timestamp("paid_at"),
  paidBy: varchar("paid_by").references(() => users.id),
  paymentMethod: varchar("payment_method"), // "stp", "manual"
  clabe: varchar("clabe"),
  bankName: varchar("bank_name"),
  accountHolder: varchar("account_holder"),
  idempotencyKey: varchar("idempotency_key"),
  trackingKey: varchar("tracking_key"),
  providerResponse: jsonb("provider_response").default('{}'),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("commissions_tenant_idx").on(table.tenantId),
  index("commissions_credit_idx").on(table.creditId),
  index("commissions_broker_idx").on(table.brokerId),
  index("commissions_status_idx").on(table.status),
  uniqueIndex("commissions_credit_type_unique").on(table.creditId, table.commissionType),
  uniqueIndex("commissions_idempotency_key_unique").on(table.idempotencyKey),
]);

// Commission Audit Logs table
export const commissionAuditLogs = pgTable("commission_audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  commissionId: varchar("commission_id").notNull().references(() => commissions.id, { onDelete: 'cascade' }),
  action: varchar("action").notNull(), // "created", "recalculated", "approved", "cancelled", "dispersion_attempt", "dispersion_success", "dispersion_failed", "marked_paid", "credit_modified_incident"
  performedBy: varchar("performed_by").references(() => users.id),
  previousStatus: varchar("previous_status"),
  newStatus: varchar("new_status"),
  details: jsonb("details").default('{}'),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("comm_audit_commission_idx").on(table.commissionId),
  index("comm_audit_created_at_idx").on(table.createdAt),
]);

// Notifications table
export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  type: varchar("type").notNull(), // "credit_expiring", "document_pending", "commission_received", "credit_approved", etc.
  title: varchar("title").notNull(),
  message: text("message").notNull(),
  data: jsonb("data").default('{}'),
  isRead: boolean("is_read").default(false),
  priority: varchar("priority").default("normal"), // "low", "normal", "high", "urgent"
  createdAt: timestamp("created_at").defaultNow(),
});

// Documents table
export const documents = pgTable("documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id),
  clientId: varchar("client_id").references(() => clients.id),
  creditId: varchar("credit_id").references(() => credits.id),
  brokerId: varchar("broker_id").references(() => users.id),
  uploadedBy: varchar("uploaded_by").references(() => users.id),
  type: varchar("type").notNull(), // "rfc", "curp", "proof_of_address", "income_statement", etc.
  fileName: varchar("file_name").notNull(),
  filePath: varchar("file_path").notNull(),
  fileSize: integer("file_size"),
  mimeType: varchar("mime_type"),
  extractedData: jsonb("extracted_data").default('{}'),
  isValid: boolean("is_valid").default(true),
  expiresAt: date("expires_at"),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
}, (table) => [
  index("documents_tenant_idx").on(table.tenantId),
]);

// Product Templates - Productos genéricos creados por super admin
export const productTemplates = pgTable("product_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(), // e.g., "Crédito PYME", "Crédito Simple", "Crédito Automotriz"
  description: text("description"),
  category: varchar("category"), // "business", "personal", "automotive", etc.
  
  // Perfiles de cliente a los que va dirigido
  targetProfiles: text("target_profiles").array().default(sql`'{}'`), // ["persona_moral", "fisica_empresarial", "fisica", "sin_sat"]
  
  // Variables disponibles para este template
  availableVariables: jsonb("available_variables").default('{}'), // Variables y configuración base
  
  // Configuración base del template
  baseConfiguration: jsonb("base_configuration").default('{}'), // Config predeterminada
  
  // Estado y metadata
  isActive: boolean("is_active").default(true),
  createdBy: varchar("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Institution Products - Templates personalizados por cada financiera
export const institutionProducts = pgTable("institution_products", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  templateId: varchar("template_id").notNull().references(() => productTemplates.id),
  institutionId: varchar("institution_id").notNull().references(() => financialInstitutions.id),
  
  // Personalización por financiera
  customName: varchar("custom_name"), // Nombre personalizado (opcional)
  configuration: jsonb("configuration").default('{}'), // Configuración específica de la financiera
  
  // Perfiles de cliente que esta financiera acepta para este producto (puede restringir del template padre)
  targetProfiles: text("target_profiles").array(), // Hereda del template, puede restringir más
  
  // Variables activas para esta financiera
  activeVariables: jsonb("active_variables").default('{}'), // Qué variables usa y cómo
  
  // Estado y metadata
  isActive: boolean("is_active").default(true),
  createdBy: varchar("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Products - Productos simples creados por super admin (LEGACY - mantener por compatibilidad)
export const products = pgTable("products", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  institutionId: varchar("institution_id").notNull().references(() => financialInstitutions.id),
  name: varchar("name").notNull(), // e.g., "BCM Crédito Simple", "Pretmex PYME"
  description: text("description"),
  category: varchar("category"), // Para organizar productos
  
  // Variables disponibles para este producto
  availableVariables: jsonb("available_variables").default('{}'), // Variables y su configuración
  
  // Configuración del producto
  configuration: jsonb("configuration").default('{}'), // Valores específicos (tasas, montos, etc.)
  
  // Requisitos y documentos
  requirements: jsonb("requirements").default('{}'), // Requisitos específicos
  documents: text("documents").array().default(sql`'{}'`), // Documentos requeridos
  
  // Estado y metadata
  isActive: boolean("is_active").default(true),
  createdBy: varchar("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Product Requests - Solicitudes de brokers para nuevos productos
export const productRequests = pgTable("product_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  requestedBy: varchar("requested_by").notNull().references(() => users.id),
  
  // Información del producto solicitado
  institutionName: varchar("institution_name"), // Si es financiera nueva
  existingInstitutionId: varchar("existing_institution_id").references(() => financialInstitutions.id),
  productName: varchar("product_name").notNull(),
  productDescription: text("product_description"),
  
  // Justificación y detalles
  businessJustification: text("business_justification"), // Por qué necesita este producto
  estimatedVolume: varchar("estimated_volume"), // Volumen estimado de créditos
  targetMarket: varchar("target_market"), // Mercado objetivo
  
  // Configuración deseada
  desiredConfiguration: jsonb("desired_configuration").default('{}'), // Configuración solicitada
  
  // Estado de la solicitud
  status: varchar("status").notNull().default("pending"), // "pending", "under_review", "approved", "rejected", "implemented"
  reviewedBy: varchar("reviewed_by").references(() => users.id),
  reviewNotes: text("review_notes"),
  reviewedAt: timestamp("reviewed_at"),
  
  // Referencias al producto creado (si fue aprobado)
  createdProductId: varchar("created_product_id").references(() => products.id),
  
  // Metadata
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Product Variables - Catálogo extensible de variables
export const productVariables = pgTable("product_variables", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull().unique(), // e.g., "monto", "plazo", "tasa_interes"
  displayName: varchar("display_name").notNull(), // e.g., "Monto", "Plazo", "Tasa de Interés"
  description: text("description"),
  category: varchar("category").notNull().default("basic"), // "basic", "financial", "requirements"
  
  // Tipo de variable y configuración
  dataType: varchar("data_type").notNull(), // "range", "select", "boolean", "text", "number"
  options: jsonb("options"), // Opciones para select/multiple_select
  minValue: decimal("min_value"), // Para rangos y números
  maxValue: decimal("max_value"), // Para rangos y números
  unit: varchar("unit"), // Unidad para números
  defaultValue: text("default_value"), // Valor por defecto
  isRequired: boolean("is_required").default(false), // Si es requerido
  
  // Estado
  isActive: boolean("is_active").default(true),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Create insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertClientSchema = createInsertSchema(clients).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCreditSchema = createInsertSchema(credits).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertClientCreditHistorySchema = createInsertSchema(clientCreditHistories).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Credit submission system for broker → admin → financiera approval flow
export const creditSubmissionRequests = pgTable("credit_submission_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id),
  clientId: varchar("client_id").notNull().references(() => clients.id),
  brokerId: varchar("broker_id").notNull().references(() => users.id),
  createdBy: varchar("created_by").references(() => users.id),
  productTemplateId: varchar("product_template_id").references(() => productTemplates.id), // Plantilla de producto solicitada
  requestedAmount: decimal("requested_amount", { precision: 15, scale: 2 }).notNull(),
  purpose: text("purpose"), // Purpose of the credit
  brokerNotes: text("broker_notes"), // Initial notes from broker
  status: varchar("status").notNull().default("pending_admin"), // "pending_admin", "partially_approved", "completed", "cancelled"
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("credit_submissions_tenant_idx").on(table.tenantId),
]);

export const creditSubmissionTargets = pgTable("credit_submission_targets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  requestId: varchar("request_id").notNull().references(() => creditSubmissionRequests.id, { onDelete: 'cascade' }),
  financialInstitutionId: varchar("financial_institution_id").notNull().references(() => financialInstitutions.id),
  status: varchar("status").notNull().default("pending_admin"), // "pending_admin", "approved", "returned_to_broker", "sent", "institution_approved", "institution_rejected", "selected_winner", "dispersed"
  adminNotes: text("admin_notes"), // Admin internal notes
  details: text("details"), // Details sent to broker (when returned) or to institution (when approved)
  reviewedBy: varchar("reviewed_by").references(() => users.id), // Admin who reviewed
  reviewedAt: timestamp("reviewed_at"),
  
  // Institution proposal data
  institutionProposal: jsonb("institution_proposal").default('{}'), // { approvedAmount, interestRate, term, openingCommission, etc }
  proposalReceivedAt: timestamp("proposal_received_at"),
  proposalDocument: varchar("proposal_document"), // Path to uploaded proposal document
  
  // Winner selection
  isWinner: boolean("is_winner").default(false), // Broker selected this as final choice
  dispersedAt: timestamp("dispersed_at"), // When the credit was actually disbursed
  
  creditId: varchar("credit_id").references(() => credits.id), // Created credit after selection as winner
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertCreditSubmissionRequestSchema = createInsertSchema(creditSubmissionRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCreditSubmissionTargetSchema = createInsertSchema(creditSubmissionTargets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertFinancialInstitutionSchema = createInsertSchema(financialInstitutions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCommissionSchema = createInsertSchema(commissions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCommissionAuditLogSchema = createInsertSchema(commissionAuditLogs).omit({
  id: true,
  createdAt: true,
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  createdAt: true,
});

export const insertDocumentSchema = createInsertSchema(documents).omit({
  id: true,
  uploadedAt: true,
});

// Credit item schema for active credits
export const creditItemSchema = z.object({
  tipo: z.string().optional(),
  saldoOriginal: z.string().optional(),
  saldo: z.string().optional(),
  institucion: z.string().optional(),
  fechaInicio: z.string().optional(),
  fechaTermino: z.string().optional(),
});

// Update insertClientSchema to use structured credit arrays
export const updatedInsertClientSchema = insertClientSchema.extend({
  creditosVigentesDetalles: z.array(creditItemSchema).optional(),
});

// Valid RBAC modules, actions and scopes for tenant members
export const VALID_PERMISSIONS_MODULES = [
  "dashboard",
  "clientes",
  "creditos",
  "aprobaciones",
  "comisiones",
  "financieras",
  "sistema_productos",
  "red_brokers",
  "documentos",
  "reportes",
  "importacion",
  "usuarios",
  "configuracion",
] as const;

export type ValidPermissionsModule = typeof VALID_PERMISSIONS_MODULES[number];

export const VALID_PERMISSIONS_ACTIONS = [
  "view",
  "edit",
  "submit_proposals",
  "approve_disperse",
  "manage_commissions",
  "manage_users",
  "export_reports",
] as const;

export type ValidPermissionsAction = typeof VALID_PERMISSIONS_ACTIONS[number];

export const VALID_PERMISSIONS_SCOPES = [
  "global",
  "network",
  "standard",
  "own",
  "tenant",
] as const;

export type ValidPermissionsScope = typeof VALID_PERMISSIONS_SCOPES[number];

export const tenantMemberPermissionsSchema = z.object({
  modules: z.array(z.enum(VALID_PERMISSIONS_MODULES)).default([]),
  actions: z.array(z.enum(VALID_PERMISSIONS_ACTIONS)).default([]),
  scope: z.enum(VALID_PERMISSIONS_SCOPES).optional(),
});

export type TenantMemberPermissions = z.infer<typeof tenantMemberPermissionsSchema>;

// Schemas for organizational member operations
export const createTenantMemberSchema = z.object({
  email: z.string().email("Email inválido"),
  firstName: z.string().min(1, "El nombre es requerido"),
  lastName: z.string().min(1, "El apellido es requerido"),
  role: z.enum(TENANT_MEMBER_ROLES).default("member"),
  canOriginate: z.boolean().default(false),
  customRoleTitle: z.string().optional(),
  permissions: tenantMemberPermissionsSchema.optional(),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres").optional(),
  sendInvite: z.boolean().default(true),
});

export type CreateTenantMemberInput = z.infer<typeof createTenantMemberSchema>;

export const updateTenantMemberSchema = z.object({
  role: z.enum(TENANT_MEMBER_ROLES).optional(),
  canOriginate: z.boolean().optional(),
  customRoleTitle: z.string().nullable().optional(),
  permissions: tenantMemberPermissionsSchema.optional(),
});

export type UpdateTenantMemberInput = z.infer<typeof updateTenantMemberSchema>;

// Financial Institution Requests table - Broker requests to add new institutions
export const financialInstitutionRequests = pgTable("financial_institution_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  brokerId: varchar("broker_id").notNull().references(() => users.id),
  institutionName: varchar("institution_name").notNull(),
  reason: text("reason").notNull(), // Why they want this institution added
  contactName: varchar("contact_name"), // Optional contact info
  contactEmail: varchar("contact_email"),
  contactPhone: varchar("contact_phone"),
  status: varchar("status").notNull().default("pending"), // "pending", "approved", "rejected"
  adminNotes: text("admin_notes"), // Admin can add notes when reviewing
  reviewedBy: varchar("reviewed_by").references(() => users.id), // Admin who reviewed
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Bank Analysis Reports table
export const bankAnalysisReports = pgTable("bank_analysis_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientId: varchar("client_id").notNull().references(() => clients.id),
  status: varchar("status").notNull().default("pending"), // "pending", "processed", "failed_validation"
  validationFlags: jsonb("validation_flags").default('{}'), // continuity, rfc, account check, etc.
  monthlySummaries: jsonb("monthly_summaries").default('[]'), // array of MonthlyAnalysisResult
  financialMetrics: jsonb("financial_metrics").default('{}'), // averages, DSCR, Burn rate, SPM
  scoreResult: jsonb("score_result").default('{}'), // final scorecard scoring
  todasTransaccionesExcluidas: jsonb("todas_transacciones_excluidas").default('[]'), // excluded loans/transfers
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Promo codes catalogue & benefit types
export const PROMO_BENEFIT_TYPES = [
  "free",
  "percentage_discount",
  "fixed_discount",
  "free_months",
  "permanent_free"
] as const;
export type PromoBenefitType = (typeof PROMO_BENEFIT_TYPES)[number];

export const PROMO_TARGET_SCOPES = [
  "global",
  "master_broker",
  "broker",
  "organization",
  "alliance",
  "campaign"
] as const;
export type PromoTargetScope = (typeof PROMO_TARGET_SCOPES)[number];

export const ACCESS_STATUSES = [
  "free",
  "promotional",
  "trial",
  "active",
  "complimentary",
  "expired",
  "suspended"
] as const;
export type AccessStatus = (typeof ACCESS_STATUSES)[number];

export const promoCodes = pgTable("promo_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: varchar("code").unique().notNull(), // Uppercase promo code string, e.g. ALIANZA-2026
  name: varchar("name").notNull(),
  description: text("description"),
  benefitType: varchar("benefit_type").notNull(), // "free", "percentage_discount", "fixed_discount", "free_months", "permanent_free"
  benefitValue: decimal("benefit_value", { precision: 10, scale: 2 }).default("0.00"), // e.g. 100, 500, 3
  durationMonths: integer("duration_months"), // null for permanent
  startsAt: timestamp("starts_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at"), // optional code expiration
  isActive: boolean("is_active").default(true).notNull(),
  maxUses: integer("max_uses"), // optional max redemptions limit
  currentUses: integer("current_uses").default(0).notNull(),
  targetScope: varchar("target_scope").default("global").notNull(), // "global", "master_broker", "broker", "organization", "alliance", "campaign"
  targetEntityId: varchar("target_entity_id"), // Specific organization, user, or campaign tag
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("promo_codes_code_idx").on(table.code),
  index("promo_codes_is_active_idx").on(table.isActive),
]);

export const promoRedemptions = pgTable("promo_redemptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  promoCodeId: varchar("promo_code_id").notNull().references(() => promoCodes.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  tenantId: varchar("tenant_id").references(() => tenants.id),
  appliedAt: timestamp("applied_at").defaultNow().notNull(),
  startsAt: timestamp("starts_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at"),
  status: varchar("status").notNull().default("active"), // "active", "expired", "revoked"
  metadata: jsonb("metadata").default('{}'),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("promo_redemptions_user_idx").on(table.userId),
  index("promo_redemptions_promo_idx").on(table.promoCodeId),
]);

// Create insert schemas for bank analysis reports
export const insertBankAnalysisReportSchema = createInsertSchema(bankAnalysisReports).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Create insert schemas for tenants
export const insertTenantSchema = createInsertSchema(tenants).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTenantMemberSchema = createInsertSchema(tenantMembers).omit({
  id: true,
  joinedAt: true,
  updatedAt: true,
}).extend({
  role: z.enum(['owner', 'admin', 'member'])
});

// Product system insert schemas
export const insertProductVariableSchema = createInsertSchema(productVariables).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertProductTemplateSchema = createInsertSchema(productTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertInstitutionProductSchema = createInsertSchema(institutionProducts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertProductSchema = createInsertSchema(products).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertProductRequestSchema = createInsertSchema(productRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  reviewedAt: true,
});

export const insertFinancialInstitutionRequestSchema = createInsertSchema(financialInstitutionRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  status: true,
  reviewedBy: true,
  reviewedAt: true,
  adminNotes: true,
});


// Export types
export type UpsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertClient = z.infer<typeof updatedInsertClientSchema>;
export type Client = typeof clients.$inferSelect;
export type CreditItem = z.infer<typeof creditItemSchema>;
export type InsertCredit = z.infer<typeof insertCreditSchema>;
export type Credit = typeof credits.$inferSelect;
export type InsertClientCreditHistory = z.infer<typeof insertClientCreditHistorySchema>;
export type ClientCreditHistory = typeof clientCreditHistories.$inferSelect;
export type InsertFinancialInstitution = z.infer<typeof insertFinancialInstitutionSchema>;
export type FinancialInstitution = typeof financialInstitutions.$inferSelect;
export type InsertCommission = z.infer<typeof insertCommissionSchema>;
export type Commission = typeof commissions.$inferSelect;
export type InsertCommissionAuditLog = z.infer<typeof insertCommissionAuditLogSchema>;
export type CommissionAuditLog = typeof commissionAuditLogs.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documents.$inferSelect;
export type InsertTenant = z.infer<typeof insertTenantSchema>;
export type Tenant = typeof tenants.$inferSelect;
export type InsertTenantMember = z.infer<typeof insertTenantMemberSchema>;
export type TenantMember = typeof tenantMembers.$inferSelect;

// Product system types
export type InsertProductVariable = z.infer<typeof insertProductVariableSchema>;
export type ProductVariable = typeof productVariables.$inferSelect;

export type InsertProductTemplate = z.infer<typeof insertProductTemplateSchema>;
export type ProductTemplate = typeof productTemplates.$inferSelect;

export type InsertInstitutionProduct = z.infer<typeof insertInstitutionProductSchema>;
export type InstitutionProduct = typeof institutionProducts.$inferSelect;

// Institution Product with template data from JOIN
export type InstitutionProductWithTemplate = InstitutionProduct & {
  template: {
    id: string;
    name: string;
    description: string | null;
    category: string | null;
    targetProfiles: string[];
    availableVariables: any;
    baseConfiguration: any;
    isActive: boolean;
  } | null;
};

export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof products.$inferSelect;

export type InsertProductRequest = z.infer<typeof insertProductRequestSchema>;
export type ProductRequest = typeof productRequests.$inferSelect;

// Credit submission system types
export type InsertCreditSubmissionRequest = z.infer<typeof insertCreditSubmissionRequestSchema>;
export type CreditSubmissionRequest = typeof creditSubmissionRequests.$inferSelect;

export type InsertCreditSubmissionTarget = z.infer<typeof insertCreditSubmissionTargetSchema>;
export type CreditSubmissionTarget = typeof creditSubmissionTargets.$inferSelect;

export type InsertFinancialInstitutionRequest = z.infer<typeof insertFinancialInstitutionRequestSchema>;
export type FinancialInstitutionRequest = typeof financialInstitutionRequests.$inferSelect;

export type InsertBankAnalysisReport = z.infer<typeof insertBankAnalysisReportSchema>;
export type BankAnalysisReport = typeof bankAnalysisReports.$inferSelect;

// Promo Code insert schemas
export const insertPromoCodeSchema = createInsertSchema(promoCodes).omit({
  id: true,
  currentUses: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  code: z.string().min(3, "El código debe tener al menos 3 caracteres").transform(c => c.trim().toUpperCase()),
  name: z.string().min(2, "El nombre es requerido"),
  benefitType: z.enum(PROMO_BENEFIT_TYPES),
  benefitValue: z.union([z.string(), z.number()]).transform(v => String(v)),
  durationMonths: z.number().int().positive().nullable().optional(),
  targetScope: z.enum(PROMO_TARGET_SCOPES).default("global"),
  maxUses: z.number().int().positive().nullable().optional(),
  expiresAt: z.coerce.date().nullable().optional(),
  startsAt: z.coerce.date().optional(),
});

export const insertPromoRedemptionSchema = createInsertSchema(promoRedemptions).omit({
  id: true,
  appliedAt: true,
  createdAt: true,
});

export const redeemPromoCodeSchema = z.object({
  code: z.string().min(1, "El código es requerido").transform(c => c.trim().toUpperCase()),
});

export const validatePromoCodeSchema = z.object({
  code: z.string().min(1, "El código es requerido").transform(c => c.trim().toUpperCase()),
});

export const updateUserAccessStatusSchema = z.object({
  accessStatus: z.enum(ACCESS_STATUSES),
  expiresAt: z.coerce.date().nullable().optional(),
  notes: z.string().optional(),
});

export type InsertPromoCode = z.infer<typeof insertPromoCodeSchema>;
export type PromoCode = typeof promoCodes.$inferSelect;
export type InsertPromoRedemption = z.infer<typeof insertPromoRedemptionSchema>;
export type PromoRedemption = typeof promoRedemptions.$inferSelect;

