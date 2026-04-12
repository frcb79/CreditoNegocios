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

// User storage table (mandatory for Replit Auth)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  password: varchar("password"), // Hashed password for local auth (null for Replit Auth users)
  authMethod: varchar("auth_method").default("replit"), // "replit" or "local"
  resetToken: varchar("reset_token"), // Token for password reset
  resetTokenExpiry: timestamp("reset_token_expiry"), // When the reset token expires
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  role: varchar("role").notNull().default("broker"), // "super_admin", "admin", "master_broker", "broker"
  masterBrokerId: varchar("master_broker_id"),
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
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Clients table
export const clients = pgTable("clients", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  brokerId: varchar("broker_id").notNull().references(() => users.id),
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
});

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
  clientId: varchar("client_id").notNull().references(() => clients.id),
  brokerId: varchar("broker_id").notNull().references(() => users.id),
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
});


// Commissions table
export const commissions = pgTable("commissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  creditId: varchar("credit_id").notNull().references(() => credits.id),
  brokerId: varchar("broker_id").notNull().references(() => users.id),
  masterBrokerId: varchar("master_broker_id").references(() => users.id),
  commissionType: varchar("commission_type"), // "total", "apertura", "sobretasa", "renovacion"
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  brokerShare: decimal("broker_share", { precision: 15, scale: 2 }),
  masterBrokerShare: decimal("master_broker_share", { precision: 15, scale: 2 }),
  appShare: decimal("app_share", { precision: 15, scale: 2 }),
  status: varchar("status").notNull().default("pending"), // "pending", "paid", "advance_requested", "advance_paid"
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

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
  clientId: varchar("client_id").references(() => clients.id),
  creditId: varchar("credit_id").references(() => credits.id),
  brokerId: varchar("broker_id").references(() => users.id),
  type: varchar("type").notNull(), // "rfc", "curp", "proof_of_address", "income_statement", etc.
  fileName: varchar("file_name").notNull(),
  filePath: varchar("file_path").notNull(),
  fileSize: integer("file_size"),
  mimeType: varchar("mime_type"),
  extractedData: jsonb("extracted_data").default('{}'),
  isValid: boolean("is_valid").default(true),
  expiresAt: date("expires_at"),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
});

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
  clientId: varchar("client_id").notNull().references(() => clients.id),
  brokerId: varchar("broker_id").notNull().references(() => users.id),
  productTemplateId: varchar("product_template_id").references(() => productTemplates.id), // Plantilla de producto solicitada
  requestedAmount: decimal("requested_amount", { precision: 15, scale: 2 }).notNull(),
  purpose: text("purpose"), // Purpose of the credit
  brokerNotes: text("broker_notes"), // Initial notes from broker
  status: varchar("status").notNull().default("pending_admin"), // "pending_admin", "partially_approved", "completed", "cancelled"
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

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

// Tenants table - Multi-tenant organizations
export const tenants = pgTable("tenants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: varchar("type").notNull(), // "platform", "master_broker", "organization", "independent_broker", "independent"
  name: varchar("name").notNull(),
  slug: varchar("slug").unique().notNull(), // For subdomains/URLs
  parentTenantId: varchar("parent_tenant_id"), // Self-reference, will be constrained later if needed
  settings: jsonb("settings").default('{}'), // White-label, branding, configurations
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Tenant Members table - Users belonging to tenants with roles
export const tenantMembers = pgTable("tenant_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  role: varchar("role", { enum: ["owner", "admin", "member"] }).notNull(), // Role within this specific tenant
  isActive: boolean("is_active").default(true),
  joinedAt: timestamp("joined_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

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

