import { db, pool } from "./db";
import { 
  users, clients, credits, financialInstitutions, 
  commissions, commissionAuditLogs, notifications, documents, tenants, 
  tenantMembers, productVariables, productTemplates,
  institutionProducts, products, productRequests,
  financialInstitutionRequests,
  creditSubmissionRequests, creditSubmissionTargets,
  clientCreditHistories,
  bankAnalysisReports,
  promoCodes, promoRedemptions,
  type User, type UpsertUser, type Client, type InsertClient,
  type Credit, type InsertCredit, type FinancialInstitution,
  type InsertFinancialInstitution, type Commission, type InsertCommission,
  type CommissionAuditLog, type InsertCommissionAuditLog,
  type Notification, type InsertNotification, type Document, type InsertDocument,
  type Tenant, type InsertTenant, type TenantMember, type InsertTenantMember,
  type TenantMemberWithUser, type TenantMemberRole,
  type ProductVariable, type InsertProductVariable, type ProductTemplate,
  type InsertProductTemplate, type InstitutionProduct, type InsertInstitutionProduct,
  type InstitutionProductWithTemplate,
  type Product, type InsertProduct, type ProductRequest, type InsertProductRequest,
  type FinancialInstitutionRequest, type InsertFinancialInstitutionRequest,
  type CreditSubmissionRequest, type InsertCreditSubmissionRequest,
  type CreditSubmissionTarget, type InsertCreditSubmissionTarget,
  type ClientCreditHistory, type InsertClientCreditHistory,
  type BankAnalysisReport, type InsertBankAnalysisReport,
  type PromoCode, type InsertPromoCode,
  type PromoRedemption, type InsertPromoRedemption,
  commercialAuditLogs, type UserOperationalStatus,
  userStatusRequests, type UserStatusRequest, type UserStatusRequestStatus, type UserStatusRequestAction,
  legalDocumentVersions, legalAcceptances, formalizationOtpRequests,
  type LegalDocumentVersionDb, type InsertLegalDocumentVersionDb, type LegalAcceptance, type InsertLegalAcceptance, type FormalizationOtpRequest,
  institutionProductVersions,
  type InstitutionProductVersion,
  type InsertInstitutionProductVersion,
  type FinancialInstitutionOffer,
  type FinancialInstitutionOfferVersion,
  type InsertFinancialInstitutionOffer,
  type InsertFinancialInstitutionOfferVersion,
  type FinancialInstitutionOfferWithVersion,
} from "../shared/schema";
import {
  computeInstitutionProductVersionHash,
  computeOfferVersionHash,
  validateMinimumPublishConditions,
  validateOfferVersionParameters,
  isOfferEligibleForRequests,
} from "./offerVersionService";
import { eq, ne, isNotNull, desc, asc, like, and, or, inArray, sql, gte } from "drizzle-orm";

import { buildOfferCommissionDocument } from "./offerCommissionAcceptance";
import { assertFrozenOfferLineage, readFrozenOfferLineage } from "./offerLineageService";
import { assertOfferCommissionAcceptanceInTransaction, assertLegacyProposalPredatesPublishedCatalogInTransaction } from "./offerCommissionTransactionalGate";
import { assertTargetReviewMutable } from "./targetReviewTransitions";
import { getPlatformTenant, getOwnedTenant } from "./brokerNetworkTransitionService";
import { randomUUID, createHash } from "crypto";
import {
  getApprovedLegalDocument,
  FORMALIZATION_OTP_EXPIRATION_MS,
  FORMALIZATION_OTP_COOLDOWN_MS,
  FORMALIZATION_OTP_MAX_ATTEMPTS,
  FORMALIZATION_OTP_MAX_REQUESTS_PER_WINDOW,
  FORMALIZATION_OTP_WINDOW_MS,
  getActiveFormalizationDocument,
  validateFormalizationConfirmation,
  generateOtpCode,
  hashOtpCode,
  verifyOtpCode,
} from "./legalDocuments";
import {
  isRoleSubjectToFormalization,
  getRequiredFormalizationDocuments,
  buildPersonalizedAgreement,
  type PersonalizedAgreementData,
  type PersonalizedDocumentSnapshot,
} from "../shared/legalDocuments";

import type {
  IStorage,
  InvitationActivationInput,
  FormalizationDocumentItem,
  FormalizationDocumentsResult,
  FormalizationStatusResult,
  CreateFormalizationOtpResult,
  VerifyFormalizationOtpResult,
} from "./storage";

/**
 * Order-independent comparison of JSONB snapshots, including nested rate maps.
 * PostgreSQL jsonb reorders keys; raw JSON.stringify would reject valid snapshots.
 */
function stableJsonSnapshot(value: any): string {
  if (value === undefined || value === null) return "null";
  if (Array.isArray(value)) return "[" + value.map(stableJsonSnapshot).join(",") + "]";
  if (typeof value === "object") {
    return "{" + Object.keys(value).filter(key => value[key] !== undefined).sort()
      .map(key => JSON.stringify(key) + ":" + stableJsonSnapshot(value[key])).join(",") + "}";
  }
  return JSON.stringify(value);
}

export class DbStorage implements IStorage {
  
  constructor() {
    this.initializeDefaultData();
  }

  private async initializeDefaultData() {
    try {
      // Check if we need to seed data
      const existingVariables = await this.getProductVariables();
      if (existingVariables.length === 0) {
        await this.seedDefaultVariables();
      }

      const existingInstitutions = await this.getFinancialInstitutions();
      if (existingInstitutions.length === 0) {
        await this.seedDefaultInstitutions();
      }
    } catch (error) {
      console.log("Note: Database schema mismatch, falling back to MemStorage for demonstration");
      // Don't crash, just continue without seeding
    }
  }

  private async seedDefaultVariables() {
    const defaultVariables = [
      {
        name: "tipo_credito",
        displayName: "Tipo de Crédito",
        description: "Categoría del producto crediticio",
        dataType: "select",
        options: ["simple", "revolvente", "factoraje"],
        defaultValue: "simple",
        isRequired: true,
      },
      {
        name: "monto",
        displayName: "Monto",
        description: "Monto del crédito solicitado",
        dataType: "currency",
        minValue: 50000,
        maxValue: 50000000,
        isRequired: true,
      },
      {
        name: "plazo",
        displayName: "Plazo",
        description: "Plazo del crédito en meses",
        dataType: "number",
        minValue: 1,
        maxValue: 60,
        unit: "meses",
        isRequired: true,
      }
    ];

    for (const variable of defaultVariables) {
      await this.createProductVariable(variable as InsertProductVariable);
    }
  }

  private async seedDefaultInstitutions() {
    const institutions = [
      {
        name: "Banco Comercial Mexicano",
        contactPerson: "María González",
        email: "maria.gonzalez@bcm.mx",
        phone: "+52 55 1234 5678",
        openingCommissionRate: "2.5",
        overrateCommissionRate: "1.0",
        masterBrokerCommissionRate: "40.0",
        brokerCommissionRate: "60.0",
        additionalCosts: [],
        requirements: {},
        products: [],
        createdByAdmin: true,
        isActive: true,
      },
      {
        name: "Pretmex",
        contactPerson: "Carlos Ruiz", 
        email: "carlos.ruiz@pretmex.mx",
        phone: "+52 55 9876 5432",
        openingCommissionRate: "3.0",
        overrateCommissionRate: "1.5",
        masterBrokerCommissionRate: "45.0",
        brokerCommissionRate: "55.0",
        additionalCosts: [],
        requirements: {},
        products: [],
        createdByAdmin: true,
        isActive: true,
      }
    ];

    for (const institution of institutions) {
      await this.createFinancialInstitution(institution as InsertFinancialInstitution);
    }
  }

  // Implement BankAnalysisReport methods using the database
  async createBankAnalysisReport(report: InsertBankAnalysisReport): Promise<BankAnalysisReport> {
    const [created] = await db
      .insert(bankAnalysisReports)
      .values(report)
      .returning();
    return created;
  }


  async getBankAnalysisReportById(id: string): Promise<BankAnalysisReport | undefined> {
    const result = await db
      .select()
      .from(bankAnalysisReports)
      .where(eq(bankAnalysisReports.id, id))
      .limit(1);
    return result[0];
  }

  async getBankAnalysisReportsByClient(clientId: string): Promise<BankAnalysisReport[]> {
    return await db
      .select()
      .from(bankAnalysisReports)
      .where(eq(bankAnalysisReports.clientId, clientId));
  }
  
  // ===== USER OPERATIONS =====
  private mapRawUser(r: any): User {
    return {
      id: r.id,
      email: r.email,
      password: r.password,
      authMethod: r.auth_method || "local",
      resetToken: r.reset_token,
      resetTokenExpiry: r.reset_token_expiry ? new Date(r.reset_token_expiry) : null,
      firstName: r.first_name,
      lastName: r.last_name,
      profileImageUrl: r.profile_image_url,
      role: r.role || "broker",
      masterBrokerId: r.master_broker_id,
      referralCode: r.referral_code,
      customLogo: r.custom_logo,
      brandName: r.brand_name,
      primaryColor: r.primary_color,
      secondaryColor: r.secondary_color,
      isWhiteLabel: Boolean(r.is_white_label),
      autoRegisterBrokers: Boolean(r.auto_register_brokers),
      profileType: r.profile_type,
      profileData: r.profile_data || {},
      commercialReferences: r.commercial_references || [],
      bankName: r.bank_name,
      clabe: r.clabe,
      accountHolder: r.account_holder,
      networkCommissionRates: r.network_commission_rates || {},
      customRoleTitle: r.custom_role_title,
      permissions: r.permissions || {},
      isActive: r.is_active !== false,
      createdAt: r.created_at ? new Date(r.created_at) : new Date(),
      updatedAt: r.updated_at ? new Date(r.updated_at) : new Date(),
    } as User;
  }

  async getUser(id: string): Promise<User | undefined> {
    try {
      const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
      if (result && result.length > 0) return result[0];
    } catch (error) {
      console.warn("⚠️ [DBStorage] Drizzle error fetching user by ID, using raw SQL fallback:", error);
    }
    try {
      const raw = await pool.query(`SELECT * FROM public.users WHERE id = $1 LIMIT 1`, [id]);
      if (raw.rows && raw.rows.length > 0) {
        return this.mapRawUser(raw.rows[0]);
      }
    } catch (rawError) {
      console.error("❌ [DBStorage] Raw SQL fallback error fetching user by ID:", rawError);
    }
    return undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const normalizedEmail = email.trim().toLowerCase();
    try {
      const result = await db.select().from(users).where(eq(sql`LOWER(${users.email})`, normalizedEmail)).limit(1);
      if (result && result.length > 0) return result[0];
    } catch (error) {
      console.warn("⚠️ [DBStorage] Drizzle error fetching user by email, using raw SQL fallback:", error);
    }
    try {
      const raw = await pool.query(
        `SELECT * FROM public.users WHERE LOWER(TRIM(email)) = LOWER(TRIM($1)) LIMIT 1`,
        [normalizedEmail]
      );
      if (raw.rows && raw.rows.length > 0) {
        return this.mapRawUser(raw.rows[0]);
      }
    } catch (rawError) {
      console.error("❌ [DBStorage] Raw SQL fallback error fetching user by email:", rawError);
    }
    return undefined;
  }

  async getAllUsers(): Promise<User[]> {
    try {
      return await db
        .select()
        .from(users)
        .orderBy(asc(users.createdAt));
    } catch (error) {
      console.error("Error fetching all users:", error);
      return [];
    }
  }

  async createUser(userData: UpsertUser): Promise<User> {
    try {
      const [created] = await db
        .insert(users)
        .values({ 
          ...userData, 
          id: randomUUID(),
          createdAt: new Date(), 
          updatedAt: new Date() 
        })
        .returning();
      return created;
    } catch (error) {
      console.error("Error creating user:", error);
      throw error;
    }
  }

  async upsertUser(user: UpsertUser & { id: string }, replitId?: string): Promise<User> {
    try {
      // Check if user exists by ID or email
      const existingUserById = await this.getUser(user.id);
      const existingUserByEmail = user.email ? await this.getUserByEmail(user.email) : undefined;
      
      if (existingUserById) {
        // Update existing user by ID
        const [updated] = await db
          .update(users)
          .set({ ...user, updatedAt: new Date() })
          .where(eq(users.id, user.id))
          .returning();
        return updated;
      } else if (existingUserByEmail) {
        // Update existing user by email (different ID, same email - use email's ID)
        const [updated] = await db
          .update(users)
          .set({ ...user, id: existingUserByEmail.id, updatedAt: new Date() })
          .where(eq(users.id, existingUserByEmail.id))
          .returning();
        return updated;
      } else {
        // Create new user
        const [created] = await db
          .insert(users)
          .values({ ...user, createdAt: new Date(), updatedAt: new Date() })
          .returning();
        return created;
      }
    } catch (error) {
      console.error("Error upserting user:", error);
      throw error;
    }
  }

  async createLocalUser(userData: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    authMethod: string;
    role: string;
    masterBrokerId?: string;
    referralCode?: string;
  }): Promise<User> {
    try {
      const [created] = await db
        .insert(users)
        .values({
          email: userData.email,
          password: userData.password,
          firstName: userData.firstName,
          lastName: userData.lastName,
          authMethod: userData.authMethod,
          role: userData.role,
          masterBrokerId: userData.masterBrokerId || null,
          referralCode: userData.referralCode || null,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
      return created;
    } catch (error) {
      console.error("Error creating local user:", error);
      throw error;
    }
  }

  async getLegalDocumentVersions(): Promise<LegalDocumentVersionDb[]> {
    return await db.select().from(legalDocumentVersions);
  }

  async getLegalDocumentVersion(id: string): Promise<LegalDocumentVersionDb | undefined> {
    const [version] = await db
      .select()
      .from(legalDocumentVersions)
      .where(eq(legalDocumentVersions.id, id));
    return version;
  }

  /**
   * COM-27: serialized, all-or-nothing Master network rate change and its
   * contractual version. Avoid a silent update if immutable publication fails.
   */
  async updateNetworkRatesWithVersionAtomic(params: {
    masterBrokerId: string;
    newRates: Record<string, any>;
    changedBy: string;
  }): Promise<{
    changed: boolean;
    rates: Record<string, any>;
    version: import("./commercialTermsService").NetworkRatesVersionData | null;
  }> {
    const { masterBrokerId, changedBy } = params;
    if (!masterBrokerId || masterBrokerId !== changedBy ||
        !params.newRates || Array.isArray(params.newRates) ||
        typeof params.newRates !== "object") {
      throw new Error("NETWORK_RATES_INVALID_INPUT");
    }
    // Timestamp fields are UI bookkeeping; only actual economic changes need
    // a new contract. Canonicalize nesting to avoid JSON key-order mismatches.
    const economicSnapshot = (value: unknown): string => {
      if (Array.isArray(value)) return "[" + value.map(economicSnapshot).join(",") + "]";
      if (value && typeof value === "object") {
        const obj = value as Record<string, unknown>;
        return "{" + Object.keys(obj).filter(k => k !== "updatedAt" && obj[k] !== undefined).sort()
          .map(k => JSON.stringify(k) + ":" + economicSnapshot(obj[k])).join(",") + "}";
      }
      return JSON.stringify(value);
    };
    return db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"cn:network-rates:" + masterBrokerId}))`);
      const result = await tx.execute(sql`SELECT id, role, brand_name, first_name, last_name, network_commission_rates
        FROM users WHERE id = ${masterBrokerId} FOR UPDATE`);
      const row = result.rows?.[0] as Record<string, any> | undefined;
      if (!row || row.role !== "master_broker") {
        throw new Error("NETWORK_RATES_MASTER_NOT_FOUND");
      }
      const oldRates = (row.network_commission_rates && typeof row.network_commission_rates === "object")
        ? row.network_commission_rates as Record<string, any> : {};
      if (economicSnapshot(oldRates) === economicSnapshot(params.newRates)) {
        return { changed: false, rates: oldRates, version: null };
      }

      const existing = await tx.select({ id: legalDocumentVersions.id, version: legalDocumentVersions.version })
        .from(legalDocumentVersions)
        .where(like(legalDocumentVersions.id, `comisiones-red:${masterBrokerId}:net-%`));
      const highest = existing.reduce((n, doc) => {
        const match = /^net-(\d+)\.0$/.exec(doc.version);
        if (!match) throw new Error("NETWORK_RATES_VERSION_INVALID");
        return Math.max(n, Number(match[1]));
      }, 0);
      const versionNumber = `net-${highest + 1}.0`;
      const masterName = row.brand_name ||
        [row.first_name, row.last_name].filter(Boolean).join(" ") || "Master Broker";
      const effectiveDate = new Date().toISOString();
      const summary = `Actualización de comisiones de red asignadas por ${masterName}`;
      const content = [
        `COMISIONES DE RED - MASTER BROKER: ${masterName}`,
        `Versión: ${versionNumber}`,
        `Fecha: ${effectiveDate}`,
        `Tasas asignadas:\n${JSON.stringify(params.newRates, null, 2)}`,
      ].join("\n");
      const contentSha256 = createHash("sha256").update(content, "utf8").digest("hex");
      const versionData: import("./commercialTermsService").NetworkRatesVersionData = {
        masterBrokerId, document: "comisiones-red", version: versionNumber,
        title: `Comisiones de Red (${masterName}) v${versionNumber}`,
        summary, content, contentSha256,
        previousRates: oldRates, newRates: params.newRates,
        effectiveDate, updatedAt: effectiveDate,
      };
      await tx.insert(legalDocumentVersions).values({
        id: `comisiones-red:${masterBrokerId}:${versionNumber}`,
        document: "comisiones-red", title: versionData.title,
        version: versionNumber, sourceFile: "network_rates",
        content: content + "\n<!-- METADATA: " + JSON.stringify({ versionData }) + " -->",
        contentSha256, effectiveAt: new Date(effectiveDate),
      });
      await tx.update(users).set({
        networkCommissionRates: params.newRates,
        updatedAt: new Date(),
      }).where(eq(users.id, masterBrokerId));
      return { changed: true, rates: params.newRates, version: versionData };
    });
  }

  async createLegalDocumentVersion(data: InsertLegalDocumentVersionDb): Promise<LegalDocumentVersionDb> {
    const id = data.id || `${data.document}:${data.version}`;
    const [created] = await db
      .insert(legalDocumentVersions)
      .values({
        id,
        document: data.document,
        title: data.title,
        version: data.version,
        sourceFile: data.sourceFile || "commercial_config",
        content: data.content,
        contentSha256: data.contentSha256,
        effectiveAt: data.effectiveAt ? new Date(data.effectiveAt) : new Date(),
      })
      .onConflictDoNothing()
      .returning();
    if (created) return created;
    const existing = await this.getLegalDocumentVersion(id);
    return existing!;
  }

  async getLegalAcceptancesByUser(userId: string): Promise<LegalAcceptance[]> {
    return await db
      .select()
      .from(legalAcceptances)
      .where(eq(legalAcceptances.userId, userId))
      .orderBy(desc(legalAcceptances.acceptedAt));
  }

  async createLegalAcceptance(data: InsertLegalAcceptance): Promise<LegalAcceptance> {
    const [created] = await db.insert(legalAcceptances).values(data).returning();
    return created;
  }

  async getLegalAcceptanceById(id: string): Promise<LegalAcceptance | undefined> {
    const [acceptance] = await db
      .select()
      .from(legalAcceptances)
      .where(eq(legalAcceptances.id, id));
    return acceptance;
  }

  async getPersonalizedAgreementSnapshot(acceptanceId: string): Promise<PersonalizedDocumentSnapshot | undefined> {
    const [acceptance] = await db
      .select()
      .from(legalAcceptances)
      .where(eq(legalAcceptances.id, acceptanceId));
    if (!acceptance || acceptance.document !== "convenio") {
      return undefined;
    }

    if (acceptance.personalizedSnapshot) {
      return acceptance.personalizedSnapshot as PersonalizedDocumentSnapshot;
    }

    const [otpRecord] = await db
      .select()
      .from(formalizationOtpRequests)
      .where(and(
        eq(formalizationOtpRequests.userId, acceptance.userId),
        eq(formalizationOtpRequests.consumed, true)
      ))
      .orderBy(desc(formalizationOtpRequests.consumedAt))
      .limit(1);

    const snapshotItem = otpRecord?.documentsSnapshot
      ? (otpRecord.documentsSnapshot as any[]).find((s) => s.document === "convenio")
      : null;

    const docVersion = (await this.getLegalDocumentVersion(acceptance.documentId)) || getApprovedLegalDocument(acceptance.document, acceptance.version);
    if (!docVersion) return undefined;

    const incorporatedData = snapshotItem?.incorporatedData || {
      fullName: acceptance.userName || acceptance.userEmail,
      email: acceptance.userEmail,
      role: "broker",
      rfc: "Pendiente de proporcionar",
      address: "Pendiente de proporcionar",
      phone: "Pendiente de proporcionar",
      bankName: "Pendiente de proporcionar",
      clabe: "Pendiente de proporcionar",
      bankClabeSummary: "Pendiente de proporcionar",
    };

    const personalizedContent = snapshotItem?.personalizedContent || buildPersonalizedAgreement(
      docVersion.content,
      incorporatedData,
      {
        acceptedAt: acceptance.acceptedAt,
        ipAddress: acceptance.ipAddress,
        userAgent: acceptance.userAgent,
        otpMethod: "Correo Electrónico (OTP)",
      }
    );

    const personalizedSha256 = snapshotItem?.personalizedSha256 || createHash("sha256").update(personalizedContent, "utf8").digest("hex");

    return {
      id: acceptance.id,
      document: "convenio",
      version: acceptance.version,
      title: docVersion.title,
      templateSha256: docVersion.contentSha256,
      personalizedSha256,
      personalizedContent,
      incorporatedData,
      evidence: {
        acceptedAt: new Date(acceptance.acceptedAt).toISOString(),
        ipAddress: acceptance.ipAddress,
        userAgent: acceptance.userAgent,
        otpMethod: "Correo Electrónico (OTP)",
      },
    };
  }

  async registerUserWithLegalEvidence(params: {
    userData: {
      email: string;
      password: string;
      firstName: string;
      lastName: string;
      authMethod: string;
      role: string;
      masterBrokerId?: string;
      referralCode?: string;
    };
    evidence: {
      ipAddress: string | null;
      userAgent: string;
      termsDoc: {
        id: string;
        document: string;
        version: string;
        contentSha256: string;
      };
      privacyDoc: {
        id: string;
        document: string;
        version: string;
        contentSha256: string;
      };
    };
  }): Promise<{ user: User; acceptances: LegalAcceptance[]; tenant: Tenant; member: TenantMember }> {
    return await db.transaction(async (tx) => {
      // 1. Validate against approved catalog
      const catalogTerms = getApprovedLegalDocument(params.evidence.termsDoc.document, params.evidence.termsDoc.version);
      if (!catalogTerms) {
        throw new Error(`La versión de Términos (${params.evidence.termsDoc.version}) no está aprobada en el catálogo.`);
      }
      if (catalogTerms.contentSha256 !== params.evidence.termsDoc.contentSha256) {
        throw new Error("Discrepancia en el hash de los Términos y Condiciones.");
      }

      const catalogPrivacy = getApprovedLegalDocument(params.evidence.privacyDoc.document, params.evidence.privacyDoc.version);
      if (!catalogPrivacy) {
        throw new Error(`La versión del Aviso de Privacidad (${params.evidence.privacyDoc.version}) no está aprobada en el catálogo.`);
      }
      if (catalogPrivacy.contentSha256 !== params.evidence.privacyDoc.contentSha256) {
        throw new Error("Discrepancia en el hash del Aviso de Privacidad.");
      }

      // 2. Verify persisted versions in the database match catalog and its hashes
      const [persistedTerms] = await tx
        .select()
        .from(legalDocumentVersions)
        .where(eq(legalDocumentVersions.id, params.evidence.termsDoc.id));
      if (!persistedTerms) {
        throw new Error(`La versión de Términos (${params.evidence.termsDoc.id}) no se encuentra persistida.`);
      }
      if (
        persistedTerms.contentSha256 !== catalogTerms.contentSha256 ||
        persistedTerms.document !== catalogTerms.document ||
        persistedTerms.version !== catalogTerms.version
      ) {
        throw new Error("Discrepancia detectada entre Términos persistidos y catálogo aprobado.");
      }
      const termsHash = createHash("sha256").update(persistedTerms.content, "utf8").digest("hex");
      if (termsHash !== catalogTerms.contentSha256) {
        throw new Error("Discrepancia en la integridad del contenido persistido de Términos.");
      }

      const [persistedPrivacy] = await tx
        .select()
        .from(legalDocumentVersions)
        .where(eq(legalDocumentVersions.id, params.evidence.privacyDoc.id));
      if (!persistedPrivacy) {
        throw new Error(`La versión del Aviso (${params.evidence.privacyDoc.id}) no se encuentra persistida.`);
      }
      if (
        persistedPrivacy.contentSha256 !== catalogPrivacy.contentSha256 ||
        persistedPrivacy.document !== catalogPrivacy.document ||
        persistedPrivacy.version !== catalogPrivacy.version
      ) {
        throw new Error("Discrepancia detectada entre Aviso persistido y catálogo aprobado.");
      }
      const privacyHash = createHash("sha256").update(persistedPrivacy.content, "utf8").digest("hex");
      if (privacyHash !== catalogPrivacy.contentSha256) {
        throw new Error("Discrepancia en la integridad del contenido persistido de Aviso.");
      }

      // 3. User & Acceptances insertion (rolls back on any error above)
      const [createdUser] = await tx
        .insert(users)
        .values({
          email: params.userData.email,
          password: params.userData.password,
          firstName: params.userData.firstName,
          lastName: params.userData.lastName,
          authMethod: params.userData.authMethod,
          role: params.userData.role,
          masterBrokerId: params.userData.masterBrokerId || null,
          referralCode: params.userData.referralCode || null,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      const acceptedAt = new Date();

      const [termsAcceptance] = await tx
        .insert(legalAcceptances)
        .values({
          userId: createdUser.id,
          userEmail: createdUser.email!,
          documentId: params.evidence.termsDoc.id,
          document: params.evidence.termsDoc.document,
          version: params.evidence.termsDoc.version,
          contentSha256: params.evidence.termsDoc.contentSha256,
          acceptanceType: "accept_terms",
          ipAddress: params.evidence.ipAddress ?? null,
          userAgent: params.evidence.userAgent,
          acceptedAt,
        })
        .returning();

      const [privacyAcceptance] = await tx
        .insert(legalAcceptances)
        .values({
          userId: createdUser.id,
          userEmail: createdUser.email!,
          documentId: params.evidence.privacyDoc.id,
          document: params.evidence.privacyDoc.document,
          version: params.evidence.privacyDoc.version,
          contentSha256: params.evidence.privacyDoc.contentSha256,
          acceptanceType: "acknowledge_privacy",
          ipAddress: params.evidence.ipAddress ?? null,
          userAgent: params.evidence.userAgent,
          acceptedAt,
        })
        .returning();


      // Parent organization selection and Broker ownership in the SAME
      // transaction as identity + both legal evidence rows.
      let parentTenantId: string;
      if (params.userData.masterBrokerId) {
        const [master] = await tx.select().from(users)
          .where(eq(users.id, params.userData.masterBrokerId)).limit(1);
        const status = master?.status || (master?.isActive ? "active" : "inactive");
        if (!master || master.role !== "master_broker" || master.isActive === false || status !== "active") {
          throw new Error("El Master Broker de afiliación no es válido o no está activo.");
        }
        const ownMasterTenant = await getOwnedTenant(tx, master.id, "master_broker");
        parentTenantId = ownMasterTenant.id;
      } else {
        const platformTenant = await getPlatformTenant(tx);
        parentTenantId = platformTenant.id;
      }

      const now = new Date();
      const [brokerTenant] = await tx.insert(tenants).values({
        type: "broker",
        name: (`Broker ${createdUser.firstName || ""} ${createdUser.lastName || ""}`).trim(),
        slug: `broker-${createdUser.id.slice(0, 8).toLowerCase()}`,
        parentTenantId,
        settings: { legacyOwnerUserId: createdUser.id, createdFrom: "canonical_broker_creation" },
        isActive: true, createdAt: now, updatedAt: now,
      }).returning();
      const [ownerMember] = await tx.insert(tenantMembers).values({
        tenantId: brokerTenant.id, userId: createdUser.id,
        role: "owner", canOriginate: true, isActive: true,
        joinedAt: now, updatedAt: now,
      }).returning();

      return {
        user: createdUser,
        acceptances: [termsAcceptance, privacyAcceptance],
        tenant: brokerTenant,
        member: ownerMember,
      };
    });
  }

  async getFormalizationDocuments(userId: string): Promise<FormalizationDocumentsResult> {
    const user = await this.getUser(userId);
    if (!user) {
      throw new Error("Usuario no encontrado.");
    }

    const requires = isRoleSubjectToFormalization(user.role);
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || (user as any).accountHolder || user.email!;

    if (!requires) {
      return {
        requiresFormalization: false,
        isFormalized: true,
        message: "El rol del usuario no requiere formalización de convenio.",
        user: {
          id: user.id,
          email: user.email!,
          name: fullName,
          role: user.role,
        },
        requiredDocuments: [],
        documents: [],
      };
    }

    const status = await this.isUserFormalized(user.id, user.role);
    const requiredDocs = getRequiredFormalizationDocuments(user.role);

    const personalizedData: PersonalizedAgreementData = {
      fullName,
      rfc: (user as any).profileData?.rfc || (user as any).rfc || null,
      address: (user as any).profileData?.address || (user as any).address || null,
      email: user.email!,
      phone: (user as any).profileData?.phone || (user as any).phone || null,
      role: user.role,
      bankName: (user as any).bankName || null,
      clabe: (user as any).clabe || null,
    };

    const documentItems: FormalizationDocumentItem[] = [];
    for (const docType of requiredDocs) {
      const docVer = (await this.getLegalDocumentVersion(`${docType}:1.0`)) || getApprovedLegalDocument(docType, "1.0");
      if (!docVer) continue;

      if (docType === "convenio") {
        const personalizedContent = buildPersonalizedAgreement(docVer.content, personalizedData);
        documentItems.push({
          id: docVer.id,
          document: docVer.document,
          title: docVer.title,
          version: docVer.version,
          content: personalizedContent,
          contentSha256: docVer.contentSha256,
          effectiveAt: docVer.effectiveAt,
          isPrivate: true,
          personalized: true,
          incorporatedData: personalizedData,
        });
      } else {
        documentItems.push({
          id: docVer.id,
          document: docVer.document,
          title: docVer.title,
          version: docVer.version,
          content: docVer.content,
          contentSha256: docVer.contentSha256,
          effectiveAt: docVer.effectiveAt,
          isPrivate: true,
          personalized: false,
        });
      }
    }

    return {
      requiresFormalization: true,
      isFormalized: status.isFormalized,
      user: {
        id: user.id,
        email: user.email!,
        name: fullName,
        role: user.role,
      },
      requiredDocuments: requiredDocs,
      documents: documentItems,
    };
  }

  async getFormalizationStatus(userId: string): Promise<FormalizationStatusResult> {
    const user = await this.getUser(userId);
    if (!user) {
      return {
        requiresFormalization: false,
        isFormalized: false,
        formalizedAt: null,
        requiredDocuments: [],
        acceptedDocuments: [],
      };
    }

    const requires = isRoleSubjectToFormalization(user.role);
    if (!requires) {
      return {
        requiresFormalization: false,
        isFormalized: true,
        formalizedAt: null,
        requiredDocuments: [],
        acceptedDocuments: [],
      };
    }

    const status = await this.isUserFormalized(user.id, user.role);
    return {
      requiresFormalization: true,
      isFormalized: status.isFormalized,
      formalizedAt: status.formalizedAt || null,
      requiredDocuments: getRequiredFormalizationDocuments(user.role),
      acceptedDocuments: status.acceptedDocuments,
    };
  }

  async createOrResendFormalizationOtp(params: {
    userId: string;
    confirmedDocuments: Array<{ document: string; version: string }>;
  }): Promise<CreateFormalizationOtpResult> {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('formalization_otp_' || ${params.userId}))`);

      const [user] = await tx
        .select()
        .from(users)
        .where(eq(users.id, params.userId));
      if (!user) {
        return { success: false, statusCode: 404, error: "Usuario no encontrado." };
      }

      if (!isRoleSubjectToFormalization(user.role)) {
        return { success: false, statusCode: 400, error: "El rol del usuario no requiere formalización." };
      }

      const requiredDocs = getRequiredFormalizationDocuments(user.role);
      const existingAcceptances = await tx
        .select()
        .from(legalAcceptances)
        .where(eq(legalAcceptances.userId, user.id));

      const alreadyFormalizedDocs = existingAcceptances
        .filter((a) => requiredDocs.includes(a.document))
        .map((a) => a.document);

      if (requiredDocs.length > 0 && requiredDocs.every((doc) => alreadyFormalizedDocs.includes(doc))) {
        return { success: false, statusCode: 400, error: "El usuario ya ha formalizado su Convenio." };
      }

      const validation = validateFormalizationConfirmation(user.role, params.confirmedDocuments);
      if (!validation.valid) {
        return { success: false, statusCode: 400, error: validation.error };
      }

      const oneHourAgo = new Date(Date.now() - FORMALIZATION_OTP_WINDOW_MS);
      const recent = await tx
        .select()
        .from(formalizationOtpRequests)
        .where(and(
          eq(formalizationOtpRequests.userId, user.id),
          gte(formalizationOtpRequests.createdAt, oneHourAgo)
        ));

      if (recent.length >= FORMALIZATION_OTP_MAX_REQUESTS_PER_WINDOW) {
        return {
          success: false,
          statusCode: 429,
          error: "Has superado el límite de solicitudes de código. Por favor intenta más tarde.",
        };
      }

      const now = new Date();

      const [latestOtp] = await tx
        .select()
        .from(formalizationOtpRequests)
        .where(eq(formalizationOtpRequests.userId, user.id))
        .orderBy(desc(formalizationOtpRequests.createdAt))
        .limit(1);

      if (latestOtp) {
        const resendAvailableAt = new Date(latestOtp.resendAvailableAt).getTime();
        if (now.getTime() < resendAvailableAt) {
          const remainingSeconds = Math.ceil((resendAvailableAt - now.getTime()) / 1000);
          return {
            success: false,
            statusCode: 429,
            error: `Debes esperar ${remainingSeconds} segundos antes de solicitar un nuevo código.`,
            resendAvailableAt: latestOtp.resendAvailableAt,
          };
        }
      }

      // Invalidate existing active OTP
      await tx
        .update(formalizationOtpRequests)
        .set({ invalidated: true, invalidatedAt: now })
        .where(and(
          eq(formalizationOtpRequests.userId, user.id),
          eq(formalizationOtpRequests.consumed, false),
          eq(formalizationOtpRequests.invalidated, false)
        ));

      const rawCode = generateOtpCode();
      const codeHash = hashOtpCode(rawCode);
      const expiresAt = new Date(now.getTime() + FORMALIZATION_OTP_EXPIRATION_MS);
      const resendAvailableAt = new Date(now.getTime() + FORMALIZATION_OTP_COOLDOWN_MS);
      const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || (user as any).accountHolder || user.email!;

      const personalizedData: PersonalizedAgreementData = {
        fullName,
        rfc: (user as any).profileData?.rfc || (user as any).rfc || null,
        address: (user as any).profileData?.address || (user as any).address || null,
        email: user.email!,
        phone: (user as any).profileData?.phone || (user as any).phone || null,
        role: user.role,
        bankName: (user as any).bankName || null,
        clabe: (user as any).clabe || null,
      };

      const documentsSnapshot = validation.catalogDocs!.map((d) => {
        if (d.document === "convenio") {
          const personalizedText = buildPersonalizedAgreement(d.content, personalizedData);
          const personalizedSha = createHash("sha256").update(personalizedText, "utf8").digest("hex");
          return {
            id: d.id,
            document: d.document,
            version: d.version,
            title: d.title,
            templateSha256: d.contentSha256,
            contentSha256: d.contentSha256,
            personalizedContent: personalizedText,
            personalizedSha256: personalizedSha,
            incorporatedData: personalizedData,
          };
        }
        return {
          id: d.id,
          document: d.document,
          version: d.version,
          title: d.title,
          contentSha256: d.contentSha256,
          content: d.content,
        };
      });

      const [newOtp] = await tx
        .insert(formalizationOtpRequests)
        .values({
          userId: user.id,
          userEmail: user.email!,
          userName: fullName,
          userRole: user.role,
          documentsSnapshot,
          codeHash,
          attempts: 0,
          maxAttempts: FORMALIZATION_OTP_MAX_ATTEMPTS,
          expiresAt,
          resendAvailableAt,
          consumed: false,
          invalidated: false,
        })
        .returning();

      return {
        success: true,
        statusCode: 200,
        otp: newOtp,
        rawCode,
        documentsForEmail: validation.catalogDocs!.map((d) => ({ title: d.title, version: d.version })),
      };
    });
  }

  async invalidateFormalizationOtp(otpId: string, reason?: string): Promise<void> {
    await db
      .update(formalizationOtpRequests)
      .set({ invalidated: true, invalidatedAt: new Date() })
      .where(eq(formalizationOtpRequests.id, otpId));
  }

  async verifyAndFormalizeAgreementWithOtp(params: {
    userId: string;
    code: string;
    confirmedDocuments: Array<{ document: string; version: string }>;
    ipAddress: string;
    userAgent: string;
  }): Promise<VerifyFormalizationOtpResult> {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('formalization_otp_' || ${params.userId}))`);

      const [user] = await tx
        .select()
        .from(users)
        .where(eq(users.id, params.userId));
      if (!user) {
        return { success: false, statusCode: 404, error: "Usuario no encontrado." };
      }

      const [activeOtp] = await tx
        .select()
        .from(formalizationOtpRequests)
        .where(and(
          eq(formalizationOtpRequests.userId, user.id),
          eq(formalizationOtpRequests.consumed, false),
          eq(formalizationOtpRequests.invalidated, false)
        ))
        .orderBy(desc(formalizationOtpRequests.createdAt))
        .limit(1);

      if (!activeOtp) {
        return {
          success: false,
          statusCode: 400,
          error: "No se encontró una solicitud activa de formalización para este usuario.",
        };
      }

      const now = new Date();

      if (activeOtp.attempts >= activeOtp.maxAttempts) {
        await tx
          .update(formalizationOtpRequests)
          .set({ invalidated: true, invalidatedAt: now })
          .where(eq(formalizationOtpRequests.id, activeOtp.id));
        return {
          success: false,
          statusCode: 400,
          error: "Has superado el límite máximo de 5 intentos fallidos. Solicita un nuevo código.",
          remainingAttempts: 0,
        };
      }

      if (now.getTime() > new Date(activeOtp.expiresAt).getTime()) {
        await tx
          .update(formalizationOtpRequests)
          .set({ invalidated: true, invalidatedAt: now })
          .where(eq(formalizationOtpRequests.id, activeOtp.id));
        return {
          success: false,
          statusCode: 400,
          error: "El código de verificación ha expirado. Solicita un nuevo código.",
        };
      }

      // Check identity drift
      const currentUserName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || (user as any).accountHolder || user.email!;
      if (
        user.email !== activeOtp.userEmail ||
        currentUserName !== activeOtp.userName ||
        user.role !== activeOtp.userRole
      ) {
        await tx
          .update(formalizationOtpRequests)
          .set({ invalidated: true, invalidatedAt: now })
          .where(eq(formalizationOtpRequests.id, activeOtp.id));
        return {
          success: false,
          statusCode: 400,
          error: "Los datos de identidad (nombre, correo o rol) han cambiado desde que se solicitó el código. Debes reiniciar el proceso de formalización.",
          requiresRestart: true,
        };
      }

      // Validate documents and active versions
      const validation = validateFormalizationConfirmation(activeOtp.userRole, params.confirmedDocuments);
      if (!validation.valid) {
        return { success: false, statusCode: 400, error: validation.error };
      }

      const validatedPersistedDocs: LegalDocumentVersionDb[] = [];
      for (const conf of params.confirmedDocuments) {
        const activeDoc = getActiveFormalizationDocument(conf.document);
        if (!activeDoc || activeDoc.version !== conf.version) {
          return {
            success: false,
            statusCode: 400,
            error: `La versión '${conf.version}' para el documento '${conf.document}' no está habilitada actualmente.`,
          };
        }

        const docId = `${conf.document}:${conf.version}`;
        const [persisted] = await tx
          .select()
          .from(legalDocumentVersions)
          .where(eq(legalDocumentVersions.id, docId));

        if (!persisted) {
          return {
            success: false,
            statusCode: 400,
            error: `La versión persistida no se encuentra disponible: ${docId}`,
          };
        }

        if (persisted.id !== docId || persisted.document !== conf.document || persisted.version !== conf.version) {
          return {
            success: false,
            statusCode: 400,
            error: `Discrepancia en la identidad del documento persistido: ${docId}`,
          };
        }

        const recomputedSha256 = createHash("sha256").update(persisted.content || "", "utf8").digest("hex");
        if (recomputedSha256 !== persisted.contentSha256) {
          return {
            success: false,
            statusCode: 400,
            error: `Discrepancia de integridad en el contenido persistido: ${docId}`,
          };
        }

        if (recomputedSha256 !== activeDoc.contentSha256 || persisted.contentSha256 !== activeDoc.contentSha256) {
          return {
            success: false,
            statusCode: 400,
            error: `Discrepancia de integridad con el catálogo activo: ${docId}`,
          };
        }

        const snapshot = (activeOtp.documentsSnapshot as any[]).find((s) => s.document === conf.document);
        if (
          !snapshot ||
          snapshot.id !== docId ||
          snapshot.version !== conf.version ||
          snapshot.contentSha256 !== activeDoc.contentSha256 ||
          snapshot.contentSha256 !== recomputedSha256
        ) {
          return {
            success: false,
            statusCode: 400,
            error: "Las versiones o el contenido de los documentos cambiaron desde la solicitud del código. Solicita un nuevo código.",
          };
        }

        validatedPersistedDocs.push(persisted);
      }

      // Constant-time HMAC code verification
      const isMatch = verifyOtpCode(params.code, activeOtp.codeHash);
      if (!isMatch) {
        const nextAttempts = activeOtp.attempts + 1;
        const limitReached = nextAttempts >= activeOtp.maxAttempts;
        await tx
          .update(formalizationOtpRequests)
          .set({
            attempts: nextAttempts,
            invalidated: limitReached,
            invalidatedAt: limitReached ? now : null,
          })
          .where(eq(formalizationOtpRequests.id, activeOtp.id));

        const remaining = Math.max(0, activeOtp.maxAttempts - nextAttempts);
        return {
          success: false,
          statusCode: 400,
          error: limitReached
            ? "Has superado el límite máximo de 5 intentos fallidos. Solicita un nuevo código."
            : `Código incorrecto. Te quedan ${remaining} ${remaining === 1 ? "intento" : "intentos"}.`,
          remainingAttempts: remaining,
        };
      }

      // Mark OTP as consumed
      const [consumedOtp] = await tx
        .update(formalizationOtpRequests)
        .set({ consumed: true, consumedAt: now })
        .where(and(
          eq(formalizationOtpRequests.id, activeOtp.id),
          eq(formalizationOtpRequests.consumed, false)
        ))
        .returning();

      if (!consumedOtp) {
        return {
          success: false,
          statusCode: 400,
          error: "El código ya fue consumido por otra transacción simultánea.",
        };
      }

      // Insert legal acceptances with confirmed identity snapshot and dual hashes (LEG-13)
      const createdAcceptances: LegalAcceptance[] = [];
      const createdSnapshots: PersonalizedDocumentSnapshot[] = [];
      for (const doc of validatedPersistedDocs) {
        let isConvenio = doc.document === "convenio";
        let finalSha256: string | null = null;
        let snapshotObj: PersonalizedDocumentSnapshot | null = null;

        if (isConvenio) {
          const rawSnapshot = (activeOtp.documentsSnapshot as any[]).find((s) => s.document === "convenio");
          const finalPersonalizedText = buildPersonalizedAgreement(
            doc.content,
            rawSnapshot?.incorporatedData || {
              fullName: activeOtp.userName,
              email: activeOtp.userEmail,
              role: activeOtp.userRole,
            },
            {
              acceptedAt: now,
              ipAddress: params.ipAddress,
              userAgent: params.userAgent,
              otpMethod: "Correo Electrónico (OTP)",
              otpRequestId: activeOtp.id,
            }
          );
          finalSha256 = createHash("sha256").update(finalPersonalizedText, "utf8").digest("hex");
          snapshotObj = {
            id: "", // updated below after insert
            document: "convenio",
            version: doc.version,
            title: doc.title,
            templateSha256: doc.contentSha256,
            personalizedSha256: finalSha256,
            personalizedContent: finalPersonalizedText,
            incorporatedData: rawSnapshot?.incorporatedData,
            evidence: {
              acceptedAt: now.toISOString(),
              ipAddress: params.ipAddress,
              userAgent: params.userAgent,
              otpMethod: "Correo Electrónico (OTP)",
            },
          };
        }

        const [inserted] = await tx
          .insert(legalAcceptances)
          .values({
            userId: activeOtp.userId,
            userEmail: activeOtp.userEmail,
            userName: activeOtp.userName,
            documentId: doc.id,
            document: doc.document,
            version: doc.version,
            contentSha256: doc.contentSha256,
            acceptanceType: `accept_${doc.document.replace(/-/g, '_')}`,
            ipAddress: params.ipAddress,
            userAgent: params.userAgent,
            acceptedAt: now,
            templateSha256: isConvenio ? doc.contentSha256 : null,
            personalizedSha256: isConvenio ? finalSha256 : null,
            personalizedSnapshot: snapshotObj,
          })
          .returning();
        createdAcceptances.push(inserted);

        if (isConvenio && snapshotObj) {
          snapshotObj.id = inserted.id;
          createdSnapshots.push(snapshotObj);
        }
      }

      return {
        success: true,
        statusCode: 200,
        acceptances: createdAcceptances,
        snapshots: createdSnapshots,
      };
    });
  }

  async getLatestFormalizationOtpByUser(userId: string): Promise<FormalizationOtpRequest | undefined> {
    const [latest] = await db
      .select()
      .from(formalizationOtpRequests)
      .where(eq(formalizationOtpRequests.userId, userId))
      .orderBy(desc(formalizationOtpRequests.createdAt))
      .limit(1);
    return latest;
  }

  async countFormalizationOtpRequests(userId: string, since: Date): Promise<number> {
    const records = await db
      .select()
      .from(formalizationOtpRequests)
      .where(and(
        eq(formalizationOtpRequests.userId, userId),
        gte(formalizationOtpRequests.createdAt, since)
      ));
    return records.length;
  }

  async isUserFormalized(userId: string, role?: string): Promise<{ isFormalized: boolean; formalizedAt?: Date; acceptedDocuments: string[] }> {
    let userRole = role;
    if (!userRole) {
      const user = await this.getUser(userId);
      userRole = user?.role;
    }
    const requiredDocs = getRequiredFormalizationDocuments(userRole);
    if (requiredDocs.length === 0) {
      return { isFormalized: true, acceptedDocuments: [] };
    }

    const acceptances = await this.getLegalAcceptancesByUser(userId);
    const acceptedDocsMap = new Map<string, Date>();
    for (const acc of acceptances) {
      if (requiredDocs.includes(acc.document) && !acceptedDocsMap.has(acc.document)) {
        acceptedDocsMap.set(acc.document, new Date(acc.acceptedAt));
      }
    }

    const allAccepted = requiredDocs.every((doc) => acceptedDocsMap.has(doc));
    if (!allAccepted) {
      return {
        isFormalized: false,
        acceptedDocuments: Array.from(acceptedDocsMap.keys()),
      };
    }

    let latestDate = new Date(0);
    for (const doc of requiredDocs) {
      const d = acceptedDocsMap.get(doc)!;
      if (d.getTime() > latestDate.getTime()) {
        latestDate = d;
      }
    }

    return {
      isFormalized: true,
      formalizedAt: latestDate,
      acceptedDocuments: Array.from(acceptedDocsMap.keys()),
    };
  }

  async updateUser(id: string, userData: Partial<UpsertUser>): Promise<User | undefined> {
    try {
      // Fetch existing user to perform deep merge of profileData
      const existingUser = await this.getUser(id);
      if (!existingUser) return undefined;

      // Deep merge profileData to preserve existing nested fields with null-safety
      const priorProfileData = existingUser.profileData && typeof existingUser.profileData === 'object' ? existingUser.profileData as Record<string, any> : {};
      const incomingProfileData = userData.profileData && typeof userData.profileData === 'object' ? userData.profileData as Record<string, any> : undefined;
      const mergedProfileData = incomingProfileData
        ? {
            ...priorProfileData,
            ...incomingProfileData,
            // Merge nested address object if provided
            ...(incomingProfileData.address && {
              address: {
                ...(priorProfileData.address || {}),
                ...incomingProfileData.address,
              },
            }),
          }
        : priorProfileData;
 
      // Strip operational status fields to prevent bypass of central governance
      const {
        status: _status,
        isActive: _isActive,
        statusChangedAt: _statusChangedAt,
        statusChangedBy: _statusChangedBy,
        statusChangeReason: _statusChangeReason,
        statusChangeNotes: _statusChangeNotes,
        ...safeUserData
      } = userData as any;

      const [updated] = await db
        .update(users)
        .set({ 
          ...safeUserData, 
          profileData: mergedProfileData,
          updatedAt: new Date() 
        })
        .where(eq(users.id, id))
        .returning();
      return updated;
    } catch (error) {
      console.error("Error updating user:", error);
      return undefined;
    }
  }

  async getUsersByMasterBroker(masterBrokerId: string): Promise<User[]> {
    try {
      return await db
        .select()
        .from(users)
        .where(eq(users.masterBrokerId, masterBrokerId))
        .orderBy(asc(users.firstName), asc(users.lastName));
    } catch (error) {
      console.error("Error fetching users by master broker:", error);
      return [];
    }
  }

  async setPasswordResetToken(userId: string, token: string, expiry: Date): Promise<void> {
    try {
      await db
        .update(users)
        .set({ 
          resetToken: token,
          resetTokenExpiry: expiry,
          updatedAt: new Date()
        })
        .where(eq(users.id, userId));
    } catch (error) {
      console.error("Error setting password reset token:", error);
      throw error;
    }
  }

  async getUserByResetToken(token: string): Promise<User | undefined> {
    try {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.resetToken, token));
      return user;
    } catch (error) {
      console.error("Error getting user by reset token:", error);
      return undefined;
    }
  }

  async clearPasswordResetToken(userId: string): Promise<void> {
    try {
      await db
        .update(users)
        .set({ 
          resetToken: null,
          resetTokenExpiry: null,
          updatedAt: new Date()
        })
        .where(eq(users.id, userId));
    } catch (error) {
      console.error("Error clearing password reset token:", error);
      throw error;
    }
  }

  async updateUserPassword(userId: string, hashedPassword: string): Promise<void> {
    try {
      await db
        .update(users)
        .set({ 
          password: hashedPassword,
          updatedAt: new Date()
        })
        .where(eq(users.id, userId));
    } catch (error) {
      console.error("Error updating user password:", error);
      throw error;
    }
  }


  async completeInvitationActivation(params: InvitationActivationInput): Promise<LegalAcceptance[]> {
    return db.transaction(async (tx) => {
      const [user] = await tx.select().from(users)
        .where(eq(users.id, params.userId)).for("update");
      if (!user || user.resetToken !== params.token || user.password ||
          !user.resetTokenExpiry || new Date(user.resetTokenExpiry).getTime() <= Date.now()) {
        throw new Error("Token de activación inválido, consumido o expirado.");
      }
      for (const candidate of [params.termsDoc, params.privacyDoc]) {
        const official = getApprovedLegalDocument(candidate.document, candidate.version);
        const [persisted] = await tx.select().from(legalDocumentVersions)
          .where(eq(legalDocumentVersions.id, candidate.id));
        if (!official || !persisted || official.id !== candidate.id ||
            official.contentSha256 !== candidate.contentSha256 ||
            persisted.contentSha256 !== candidate.contentSha256 ||
            createHash("sha256").update(persisted.content, "utf8").digest("hex") !== candidate.contentSha256) {
          throw new Error("Documento legal de activación no vigente o no verificable.");
        }
      }
      const existing = await tx.select().from(legalAcceptances)
        .where(eq(legalAcceptances.userId, user.id));
      if (existing.some(a => a.document === "terminos" || a.document === "aviso")) {
        throw new Error("La activación legal ya fue registrada. Contacta soporte.");
      }
      const now = new Date();
      const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || null;
      const [terms] = await tx.insert(legalAcceptances).values({
        userId: user.id, userEmail: user.email!, userName: fullName,
        documentId: params.termsDoc.id, document: params.termsDoc.document,
        version: params.termsDoc.version, contentSha256: params.termsDoc.contentSha256,
        acceptanceType: "accept_terms", ipAddress: params.ipAddress,
        userAgent: params.userAgent, acceptedAt: now,
      }).returning();
      const [privacy] = await tx.insert(legalAcceptances).values({
        userId: user.id, userEmail: user.email!, userName: fullName,
        documentId: params.privacyDoc.id, document: params.privacyDoc.document,
        version: params.privacyDoc.version, contentSha256: params.privacyDoc.contentSha256,
        acceptanceType: "acknowledge_privacy", ipAddress: params.ipAddress,
        userAgent: params.userAgent, acceptedAt: now,
      }).returning();
      await tx.update(users).set({
        password: params.passwordHash, resetToken: null,
        resetTokenExpiry: null, updatedAt: now,
      }).where(eq(users.id, user.id));
      return [terms, privacy];
    });
  }

  async createCommercialAuditLog(logData: any): Promise<any> {
    const [inserted] = await db.insert(commercialAuditLogs).values({
      ...logData,
      id: logData.id || randomUUID(),
      createdAt: logData.createdAt || new Date(),
    }).returning();
    return inserted;
  }

  async getCommercialAuditLogs(filters?: { entityType?: string; entityId?: string }): Promise<any[]> {
    const conditions = [];
    if (filters?.entityType) conditions.push(eq(commercialAuditLogs.entityType, filters.entityType));
    if (filters?.entityId) conditions.push(eq(commercialAuditLogs.entityId, filters.entityId));

    return await db.select().from(commercialAuditLogs)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(commercialAuditLogs.createdAt));
  }

  async updateUserOperationalStatus(params: {
    userId: string;
    targetStatus: UserOperationalStatus;
    changedBy: string;
    reason: string;
    notes?: string;
  }): Promise<User> {
    return await db.transaction(async (tx) => {
      const [user] = await tx.select().from(users).where(eq(users.id, params.userId));
      if (!user) {
        throw new Error("Usuario no encontrado");
      }

      const previousStatus = (user.status as UserOperationalStatus) || (user.isActive ? 'active' : 'inactive');
      const newIsActive = params.targetStatus === 'active';
      const now = new Date();

      const [updatedUser] = await tx
        .update(users)
        .set({
          status: params.targetStatus,
          isActive: newIsActive,
          statusChangedAt: now,
          statusChangedBy: params.changedBy,
          statusChangeReason: params.reason,
          statusChangeNotes: params.notes || null,
          updatedAt: now,
        })
        .where(eq(users.id, params.userId))
        .returning();

      const action = params.targetStatus === 'active' 
        ? 'reactivate' 
        : params.targetStatus === 'suspended' 
          ? 'suspend' 
          : 'deactivate';

      await tx.insert(commercialAuditLogs).values({
        entityType: 'user',
        entityId: params.userId,
        clientId: null,
        brokerId: user.role === 'broker' || user.role === 'master_broker' ? user.id : null,
        performedBy: params.changedBy,
        action,
        previousState: previousStatus,
        newState: params.targetStatus,
        metadata: {
          reason: params.reason,
          notes: params.notes || null,
          targetRole: user.role,
          targetEmail: user.email,
          previousIsActive: user.isActive,
          newIsActive,
        },
        createdAt: now,
      });

      return updatedUser;
    });
  }

  async createUserStatusRequest(data: {
    requesterId: string;
    targetUserId: string;
    requestedStatus: UserStatusRequestAction;
    reason: string;
    notes?: string;
  }): Promise<UserStatusRequest> {
    const [inserted] = await db.insert(userStatusRequests).values({
      requesterId: data.requesterId,
      targetUserId: data.targetUserId,
      requestedStatus: data.requestedStatus,
      reason: data.reason,
      notes: data.notes || null,
      status: 'pending',
    }).returning();
    return inserted;
  }

  async getUserStatusRequest(id: string): Promise<UserStatusRequest | undefined> {
    const [res] = await db.select().from(userStatusRequests).where(eq(userStatusRequests.id, id));
    return res;
  }

  async getUserStatusRequests(filters?: {
    requesterId?: string;
    targetUserId?: string;
    status?: UserStatusRequestStatus;
  }): Promise<(UserStatusRequest & { requester?: User; targetUser?: User; reviewer?: User })[]> {
    const conditions = [];
    if (filters?.requesterId) conditions.push(eq(userStatusRequests.requesterId, filters.requesterId));
    if (filters?.targetUserId) conditions.push(eq(userStatusRequests.targetUserId, filters.targetUserId));
    if (filters?.status) conditions.push(eq(userStatusRequests.status, filters.status));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const list = await db.select().from(userStatusRequests)
      .where(whereClause)
      .orderBy(desc(userStatusRequests.createdAt));

    if (list.length === 0) return [];

    const userIds = new Set<string>();
    for (const r of list) {
      if (r.requesterId) userIds.add(r.requesterId);
      if (r.targetUserId) userIds.add(r.targetUserId);
      if (r.reviewedBy) userIds.add(r.reviewedBy);
    }

    const hydratedUsers = await db.select().from(users).where(inArray(users.id, Array.from(userIds)));
    const userMap = new Map(hydratedUsers.map(u => [u.id, u]));

    return list.map(r => ({
      ...r,
      requester: userMap.get(r.requesterId),
      targetUser: userMap.get(r.targetUserId),
      reviewer: r.reviewedBy ? userMap.get(r.reviewedBy) : undefined,
    }));
  }

  async hasPendingStatusRequest(params: {
    requesterId: string;
    targetUserId: string;
    requestedStatus: UserStatusRequestAction;
  }): Promise<boolean> {
    const [existing] = await db.select({ id: userStatusRequests.id })
      .from(userStatusRequests)
      .where(and(
        eq(userStatusRequests.requesterId, params.requesterId),
        eq(userStatusRequests.targetUserId, params.targetUserId),
        eq(userStatusRequests.requestedStatus, params.requestedStatus),
        eq(userStatusRequests.status, 'pending')
      ))
      .limit(1);
    return Boolean(existing);
  }

  async resolveUserStatusRequest(params: {
    requestId: string;
    resolution: 'approved' | 'rejected';
    reviewedBy: string;
    reviewNotes?: string;
  }): Promise<UserStatusRequest> {
    const now = new Date();
    const [updated] = await db.update(userStatusRequests)
      .set({
        status: params.resolution,
        reviewedBy: params.reviewedBy,
        reviewedAt: now,
        reviewNotes: params.reviewNotes || null,
        updatedAt: now,
      })
      .where(and(
        eq(userStatusRequests.id, params.requestId),
        eq(userStatusRequests.status, 'pending')
      ))
      .returning();

    if (!updated) {
      const existing = await this.getUserStatusRequest(params.requestId);
      if (!existing) {
        throw new Error("Solicitud no encontrada");
      }
      throw new Error(`La solicitud ya fue resuelta previamente (estado: ${existing.status})`);
    }

    return updated;
  }

  // ===== PRODUCT VARIABLES =====
  async getProductVariables(): Promise<ProductVariable[]> {
    try {
      return await db
        .select()
        .from(productVariables)
        .orderBy(asc(productVariables.displayName));
    } catch (error) {
      console.error("Error fetching product variables:", error);
      return [];
    }
  }

  async getProductVariable(id: string): Promise<ProductVariable | undefined> {
    try {
      const result = await db.select().from(productVariables).where(eq(productVariables.id, id)).limit(1);
      return result[0];
    } catch (error) {
      console.error("Error fetching product variable:", error);
      return undefined;
    }
  }

  async getProductVariableByName(name: string): Promise<ProductVariable | undefined> {
    try {
      const result = await db.select().from(productVariables).where(eq(productVariables.name, name)).limit(1);
      return result[0];
    } catch (error) {
      console.error("Error fetching product variable by name:", error);
      return undefined;
    }
  }

  async getProductVariablesByIds(ids: string[]): Promise<ProductVariable[]> {
    try {
      if (ids.length === 0) {
        return [];
      }
      return await db
        .select()
        .from(productVariables)
        .where(inArray(productVariables.id, ids))
        .orderBy(asc(productVariables.displayName));
    } catch (error) {
      console.error("Error fetching product variables by IDs:", error);
      return [];
    }
  }

  async createProductVariable(variableData: InsertProductVariable): Promise<ProductVariable> {
    try {
      const [created] = await db
        .insert(productVariables)
        .values({
          ...variableData,
          id: randomUUID(),
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
      return created;
    } catch (error) {
      console.error("Error creating product variable:", error);
      throw error;
    }
  }

  async updateProductVariable(id: string, variableData: Partial<InsertProductVariable>): Promise<ProductVariable | undefined> {
    try {
      const [updated] = await db
        .update(productVariables)
        .set({ ...variableData, updatedAt: new Date() })
        .where(eq(productVariables.id, id))
        .returning();
      return updated;
    } catch (error) {
      console.error("Error updating product variable:", error);
      return undefined;
    }
  }

  async deleteProductVariable(id: string): Promise<boolean> {
    try {
      const result = await db.delete(productVariables).where(eq(productVariables.id, id));
      return (result.rowCount ?? 0) > 0;
    } catch (error) {
      console.error("Error deleting product variable:", error);
      return false;
    }
  }

  // ===== PRODUCT TEMPLATES =====
  async getProductTemplates(): Promise<ProductTemplate[]> {
    try {
      return await db
        .select()
        .from(productTemplates)
        .orderBy(desc(productTemplates.createdAt));
    } catch (error) {
      console.error("Error fetching product templates:", error);
      return [];
    }
  }

  async getProductTemplate(id: string): Promise<ProductTemplate | undefined> {
    try {
      const result = await db.select().from(productTemplates).where(eq(productTemplates.id, id)).limit(1);
      return result[0];
    } catch (error) {
      console.error("Error fetching product template:", error);
      return undefined;
    }
  }

  async createProductTemplate(templateData: InsertProductTemplate): Promise<ProductTemplate> {
    try {
      const [created] = await db
        .insert(productTemplates)
        .values({
          ...templateData,
          id: randomUUID(),
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
      return created;
    } catch (error) {
      console.error("Error creating product template:", error);
      throw error;
    }
  }

  async updateProductTemplate(id: string, templateData: Partial<InsertProductTemplate>): Promise<ProductTemplate | undefined> {
    try {
      const [updated] = await db
        .update(productTemplates)
        .set({ ...templateData, updatedAt: new Date() })
        .where(eq(productTemplates.id, id))
        .returning();
      return updated;
    } catch (error) {
      console.error("Error updating product template:", error);
      return undefined;
    }
  }

  async deleteProductTemplate(id: string): Promise<boolean> {
    try {
      const result = await db.delete(productTemplates).where(eq(productTemplates.id, id));
      return (result.rowCount ?? 0) > 0;
    } catch (error) {
      console.error("Error deleting product template:", error);
      return false;
    }
  }

  // ===== INSTITUTION PRODUCTS =====
  async getInstitutionProducts(institutionId?: string): Promise<InstitutionProductWithTemplate[]> {
    try {
      const conditions = [];
      if (institutionId) {
        conditions.push(eq(institutionProducts.institutionId, institutionId));
      }
      
      return await db
        .select({
          id: institutionProducts.id,
          name: institutionProducts.name,
          customName: institutionProducts.customName,
          productType: institutionProducts.productType,
          slug: institutionProducts.slug,
          description: institutionProducts.description,
          status: institutionProducts.status,
          currentVersionNumber: institutionProducts.currentVersionNumber,
          templateId: institutionProducts.templateId,
          institutionId: institutionProducts.institutionId,
          targetProfiles: institutionProducts.targetProfiles,
          configuration: institutionProducts.configuration,
          activeVariables: institutionProducts.activeVariables,
          isActive: institutionProducts.isActive,
          createdBy: institutionProducts.createdBy,
          createdAt: institutionProducts.createdAt,
          updatedAt: institutionProducts.updatedAt,
          // Include template information via JOIN
          template: {
            id: productTemplates.id,
            name: productTemplates.name,
            description: productTemplates.description,
            category: productTemplates.category,
            targetProfiles: sql<string[]>`COALESCE(${productTemplates.targetProfiles}, ARRAY[]::text[])`,
            availableVariables: productTemplates.availableVariables,
            baseConfiguration: productTemplates.baseConfiguration,
            isActive: sql<boolean>`COALESCE(${productTemplates.isActive}, true)`,
          }
        })
        .from(institutionProducts)
        .leftJoin(productTemplates, eq(institutionProducts.templateId, productTemplates.id))
        .where(and(...conditions))
        .orderBy(desc(institutionProducts.createdAt));
    } catch (error) {
      console.error("Error fetching institution products:", error);
      return [];
    }
  }

  async getInstitutionProduct(id: string): Promise<InstitutionProduct | undefined> {
    try {
      const result = await db.select().from(institutionProducts).where(eq(institutionProducts.id, id)).limit(1);
      return result[0];
    } catch (error) {
      console.error("Error fetching institution product:", error);
      return undefined;
    }
  }

  async getInstitutionProductsByTemplate(templateId: string): Promise<InstitutionProduct[]> {
    try {
      return await db
        .select()
        .from(institutionProducts)
        .where(eq(institutionProducts.templateId, templateId))
        .orderBy(desc(institutionProducts.createdAt));
    } catch (error) {
      console.error("Error fetching institution products by template:", error);
      return [];
    }
  }

  async createInstitutionProduct(
    productData: InsertInstitutionProduct,
    initialVersion?: Partial<InsertInstitutionProductVersion>
  ): Promise<InstitutionProduct> {
    try {
      // Si no se proporcionan activeVariables, heredar de la plantilla si existe
      let activeVariables = productData.activeVariables ?? {};
      
      if ((!productData.activeVariables || Object.keys(productData.activeVariables).length === 0) && productData.templateId) {
        try {
          const template = await this.getProductTemplate(productData.templateId);
          if (template && template.availableVariables) {
            const variableIds = Object.keys(template.availableVariables);
            if (variableIds.length > 0) {
              const variables = await this.getProductVariablesByIds(variableIds);
              activeVariables = variables.map((variable: ProductVariable) => ({
                id: variable.id,
                name: variable.displayName || variable.name,
                description: variable.description || '',
                dataType: variable.dataType,
                value: variable.defaultValue || '',
                minValue: variable.minValue ? parseFloat(variable.minValue.toString()) : undefined,
                maxValue: variable.maxValue ? parseFloat(variable.maxValue.toString()) : undefined,
                unit: variable.unit || undefined,
                isRequired: variable.isRequired || false,
                isVisible: true,
                options: variable.options || undefined
              }));
            }
          }
        } catch (error) {
          console.warn("Could not inherit variables from template:", error);
        }
      }

      return await db.transaction(async (tx) => {
        const productId = (productData as any).id ?? randomUUID();
        const now = new Date();
        const offerName = (productData as any).name ?? productData.customName ?? null;

        const [created] = await tx
          .insert(institutionProducts)
          .values({
            ...productData,
            id: productId,
            name: offerName,
            customName: productData.customName ?? offerName,
            templateId: productData.templateId ?? null,
            configuration: productData.configuration ?? {},
            activeVariables: activeVariables,
            status: "draft", // Forzado a draft desde el servidor; solo el flujo validado de publicación puede establecer published
            currentVersionNumber: productData.currentVersionNumber ?? 1,
            isActive: productData.isActive ?? true,
            createdAt: now,
            updatedAt: now,
          })
          .returning();

        if (initialVersion) {
          const versionId = randomUUID();
          const conditions = initialVersion.conditions ?? {};
          const requirements = initialVersion.requirements ?? {};
          const variablesConfig = initialVersion.variablesConfiguration ?? {};
          const requiredDocuments = Array.isArray(initialVersion.requiredDocuments) ? initialVersion.requiredDocuments : [];
          const versionHash = computeInstitutionProductVersionHash({
            institutionProductId: productId,
            versionNumber: 1,
            conditions,
            requirements,
            requiredDocuments,
            variablesConfiguration: variablesConfig,
          });

          await tx.insert(institutionProductVersions).values({
            id: versionId,
            institutionProductId: productId,
            versionNumber: 1,
            status: "draft", // Forzado a draft desde el servidor
            effectiveFrom: null,
            effectiveTo: null,
            conditions,
            requirements,
            requiredDocuments,
            variablesConfiguration: variablesConfig,
            changeReason: initialVersion.changeReason ?? "Versión inicial en borrador",
            versionHash,
            publishedAt: initialVersion.publishedAt ?? null,
            publishedBy: initialVersion.publishedBy ?? null,
            createdBy: initialVersion.createdBy ?? productData.createdBy ?? null,
            createdAt: now,
            updatedAt: now,
          });
        }

        return { ...created, institutionProductId: created.id };
      });
    } catch (error) {
      console.error("Error creating institution product:", error);
      throw error;
    }
  }

  async updateInstitutionProduct(id: string, productData: Partial<InsertInstitutionProduct>): Promise<InstitutionProduct | undefined> {
    try {
      const [existing] = await db.select().from(institutionProducts).where(eq(institutionProducts.id, id));
      if (!existing) return undefined;

      // 1. Prohibir cambiar el estado directamente a 'published' saltándose el versionado y gate de calidad
      if (productData.status === 'published' && existing.status !== 'published') {
        throw new Error("No se puede cambiar el estado a 'published' directamente; utilice el flujo de publicación de versiones con validación de condiciones mínimas.");
      }

      // 2. Si la oferta ya está publicada o tiene versiones publicadas/superseded, impedir alteración directa de condiciones
      const publishedVersions = await db.select().from(institutionProductVersions)
        .where(and(
          eq(institutionProductVersions.institutionProductId, id),
          or(
            eq(institutionProductVersions.status, "published"),
            eq(institutionProductVersions.status, "superseded"),
            eq(institutionProductVersions.status, "active")
          )
        )).limit(1);

      const isPublished = existing.status === 'published' || publishedVersions.length > 0;
      if (isPublished) {
        const touchesConditions = productData.configuration !== undefined ||
          productData.targetProfiles !== undefined ||
          productData.activeVariables !== undefined;
        if (touchesConditions) {
          throw new Error("No se pueden modificar directamente las condiciones de una oferta publicada; cree una nueva versión en borrador para modificar condiciones.");
        }
      }

      const [updated] = await db
        .update(institutionProducts)
        .set({ ...productData, updatedAt: new Date() })
        .where(eq(institutionProducts.id, id))
        .returning();
      return updated;
    } catch (error) {
      console.error("Error updating institution product:", error);
      throw error;
    }
  }

  async deleteInstitutionProduct(id: string): Promise<boolean> {
    try {
      // Protección: comprobar si hay versiones publicadas o superseded
      const publishedVersions = await db.select().from(institutionProductVersions)
        .where(and(
          eq(institutionProductVersions.institutionProductId, id),
          or(
            eq(institutionProductVersions.status, "published"),
            eq(institutionProductVersions.status, "superseded"),
            eq(institutionProductVersions.status, "active")
          )
        )).limit(1);

      if (publishedVersions.length > 0) {
        throw new Error("No se puede eliminar una oferta con historial de versiones publicado o utilizado en solicitudes.");
      }

      // Eliminar versiones en borrador
      await db.delete(institutionProductVersions).where(eq(institutionProductVersions.institutionProductId, id));

      const result = await db.delete(institutionProducts).where(eq(institutionProducts.id, id));
      return (result.rowCount ?? 0) > 0;
    } catch (error) {
      console.error("Error deleting institution product:", error);
      throw error;
    }
  }

  // ===== CANONICAL INSTITUTION PRODUCT VERSIONS (Bloque A1.1) =====
  async getInstitutionProductVersions(productId: string): Promise<InstitutionProductVersion[]> {
    try {
      const versions = await db.select().from(institutionProductVersions)
        .where(eq(institutionProductVersions.institutionProductId, productId))
        .orderBy(desc(institutionProductVersions.versionNumber));
      return versions.map(v => ({ ...v, offerId: v.institutionProductId }));
    } catch (error) {
      console.error(`Error getting product versions for ${productId} in DbStorage:`, error);
      return [];
    }
  }

  async getInstitutionProductVersion(id: string): Promise<InstitutionProductVersion | undefined> {
    try {
      const [version] = await db.select().from(institutionProductVersions)
        .where(eq(institutionProductVersions.id, id))
        .limit(1);
      if (!version) return undefined;
      return { ...version, offerId: version.institutionProductId };
    } catch (error) {
      console.error(`Error getting product version ${id} in DbStorage:`, error);
      return undefined;
    }
  }

  async getActiveInstitutionProductVersion(productId: string): Promise<InstitutionProductVersion | undefined> {
    try {
      const [activeVersion] = await db.select().from(institutionProductVersions)
        .where(and(
          eq(institutionProductVersions.institutionProductId, productId),
          or(
            eq(institutionProductVersions.status, "published"),
            eq(institutionProductVersions.status, "active")
          )
        ))
        .orderBy(desc(institutionProductVersions.versionNumber))
        .limit(1);
      if (!activeVersion) return undefined;
      return { ...activeVersion, offerId: activeVersion.institutionProductId };
    } catch (error) {
      console.error(`Error getting active product version for ${productId} in DbStorage:`, error);
      return undefined;
    }
  }

  async createInstitutionProductDraftVersion(
    productId: string,
    versionData: Partial<InsertInstitutionProductVersion> & { changeReason?: string }
  ): Promise<InstitutionProductVersion> {
    try {
      const [product] = await db.select().from(institutionProducts)
        .where(eq(institutionProducts.id, productId))
        .limit(1);
      if (!product) {
        throw new Error(`Oferta/Producto con ID ${productId} no encontrado`);
      }

      const existingVersions = await db.select().from(institutionProductVersions)
        .where(eq(institutionProductVersions.institutionProductId, productId));
      const maxVer = existingVersions.reduce((max, v) => Math.max(max, v.versionNumber), 0);
      const nextVersionNumber = maxVer + 1;

      const now = new Date();
      const versionId = randomUUID();
      const conditions = versionData.conditions ?? {};
      const requirements = versionData.requirements ?? {};
      const variablesConfig = versionData.variablesConfiguration ?? {};
      const requiredDocuments = Array.isArray(versionData.requiredDocuments) ? versionData.requiredDocuments : [];
      const versionHash = computeInstitutionProductVersionHash({
        institutionProductId: productId,
        versionNumber: nextVersionNumber,
        conditions,
        requirements,
        requiredDocuments,
        variablesConfiguration: variablesConfig,
      });

      const [createdVersion] = await db.insert(institutionProductVersions).values({
        id: versionId,
        institutionProductId: productId,
        versionNumber: nextVersionNumber,
        status: "draft",
        effectiveFrom: null,
        effectiveTo: null,
        conditions,
        requirements,
        requiredDocuments,
        variablesConfiguration: variablesConfig,
        changeReason: versionData.changeReason ?? `Borrador para versión ${nextVersionNumber}`,
        versionHash,
        publishedAt: null,
        publishedBy: null,
        createdBy: versionData.createdBy ?? product.createdBy ?? null,
        createdAt: now,
        updatedAt: now,
      }).returning();

      return { ...createdVersion, offerId: productId };
    } catch (error) {
      console.error(`Error creating draft version for ${productId} in DbStorage:`, error);
      throw error;
    }
  }

  async publishInstitutionProductVersion(
    productId: string,
    versionId: string,
    options?: { publishedBy?: string; changeReason?: string }
  ): Promise<InstitutionProductVersion> {
    try {
      return await db.transaction(async (tx) => {
        // Concurrencia segura: SELECT FOR UPDATE sobre el producto padre
        await tx.execute(sql`SELECT id FROM institution_products WHERE id = ${productId} FOR UPDATE`);

        const [version] = await tx.select().from(institutionProductVersions)
          .where(and(
            eq(institutionProductVersions.id, versionId),
            eq(institutionProductVersions.institutionProductId, productId)
          )).limit(1);

        if (!version) {
          throw new Error(`Versión ${versionId} no encontrada para la oferta ${productId}`);
        }

        if (version.status !== "draft") {
          throw new Error(`Solo se pueden publicar versiones en borrador (estado actual: ${version.status})`);
        }

        // Gate de condiciones mínimas obligatorias antes de publicar
        const validation = validateMinimumPublishConditions({
          conditions: version.conditions,
          requirements: version.requirements,
          requiredDocuments: version.requiredDocuments ?? [],
          changeReason: options?.changeReason || version.changeReason,
          productType: (await tx.select({ productType: institutionProducts.productType }).from(institutionProducts).where(eq(institutionProducts.id, productId)))[0]?.productType,
        });

        if (!validation.isValid) {
          throw new Error(`Condiciones mínimas de publicación no cumplidas: ${validation.errors.join("; ")}`);
        }

        const now = new Date();

        // COM-28: Same transaction as version publication. Without the
        // immutable economic document, no new payout terms can be accepted.
        const previousPublished = (await tx.select().from(institutionProductVersions)
          .where(and(eq(institutionProductVersions.institutionProductId, productId),
            or(eq(institutionProductVersions.status, "published"),
              eq(institutionProductVersions.status, "active")))))
          .sort((a, b) => b.versionNumber - a.versionNumber)[0] || null;
        const economicDocument = buildOfferCommissionDocument(previousPublished, version);
        if (economicDocument) {
          await tx.insert(legalDocumentVersions).values({
            ...economicDocument, effectiveAt: now,
          }).onConflictDoNothing();
          const [persisted] = await tx.select().from(legalDocumentVersions)
            .where(eq(legalDocumentVersions.id, economicDocument.id));
          if (!persisted || persisted.contentSha256 !== economicDocument.contentSha256 ||
              persisted.content !== economicDocument.content) {
            throw new Error("OFFER_COMMISSION_DOCUMENT_HASH_CONFLICT");
          }
        }

        // 1. Marcar versión publicada previa como superseded
        await tx.update(institutionProductVersions)
          .set({ status: "superseded", effectiveTo: now, updatedAt: now })
          .where(and(
            eq(institutionProductVersions.institutionProductId, productId),
            or(
              eq(institutionProductVersions.status, "published"),
              eq(institutionProductVersions.status, "active")
            )
          ));

        // 2. Publicar la versión objetivo
        const [publishedVersion] = await tx.update(institutionProductVersions)
          .set({
            status: "published",
            effectiveFrom: now,
            publishedAt: now,
            publishedBy: options?.publishedBy ?? null,
            changeReason: options?.changeReason || version.changeReason,
            updatedAt: now,
          })
          .where(eq(institutionProductVersions.id, versionId))
          .returning();

        // 3. Promover metadatos futuros del borrador solo tras publicar.
        const futureMeta = (version.variablesConfiguration as any)?.futureMetadata;
        const parentUpdate: Record<string, any> = {
          status: "published",
          currentVersionNumber: version.versionNumber,
          configuration: (version.conditions as Record<string, any>) || undefined,
          targetProfiles: (version.requirements as any)?.targetProfiles || undefined,
          updatedAt: now,
        };
        if (futureMeta?.name) parentUpdate.name = futureMeta.name;
        if (futureMeta?.customName) parentUpdate.customName = futureMeta.customName;
        if (futureMeta?.description !== undefined) parentUpdate.description = futureMeta.description;
        if (futureMeta?.productType) parentUpdate.productType = futureMeta.productType;
        await tx.update(institutionProducts)
          .set(parentUpdate)
          .where(eq(institutionProducts.id, productId));

        return { ...publishedVersion, offerId: productId };
      });
    } catch (error) {
      console.error(`Error publishing version ${versionId} for product ${productId} in DbStorage:`, error);
      throw error;
    }
  }

  async updateInstitutionProductDraftAndParent(
    productId: string,
    versionId: string,
    versionData: Partial<InsertInstitutionProductVersion>,
    productData?: Partial<InsertInstitutionProduct>
  ): Promise<{ product: InstitutionProduct; version: InstitutionProductVersion }> {
    try {
      return await db.transaction(async (tx) => {
        // Match publication lock order: parent first, then draft version.
        // Otherwise a publish may commit between draft status read and write.
        await tx.execute(sql`SELECT id FROM institution_products WHERE id = ${productId} FOR UPDATE`);
        const [version] = await tx.select().from(institutionProductVersions)
          .where(and(
            eq(institutionProductVersions.id, versionId),
            eq(institutionProductVersions.institutionProductId, productId)
          )).limit(1);

        if (!version) {
          throw new Error(`Versión ${versionId} no encontrada para la oferta ${productId}`);
        }

        if (version.status !== "draft") {
          throw new Error(`No se puede modificar una versión con estado '${version.status}'. Solo las versiones en borrador pueden ser modificadas.`);
        }

        const validation = validateOfferVersionParameters(versionData);
        if (!validation.isValid) {
          throw new Error(`Inconsistencia en los datos capturados: ${validation.errors.join("; ")}`);
        }

        const conditions = versionData.conditions !== undefined ? versionData.conditions : version.conditions;
        const requirements = versionData.requirements !== undefined ? versionData.requirements : version.requirements;
        const variablesConfig = versionData.variablesConfiguration !== undefined ? versionData.variablesConfiguration : version.variablesConfiguration;
        const requiredDocuments = versionData.requiredDocuments !== undefined
          ? (Array.isArray(versionData.requiredDocuments) ? versionData.requiredDocuments : [])
          : (version.requiredDocuments || []);

        const versionHash = computeInstitutionProductVersionHash({
          institutionProductId: productId,
          versionNumber: version.versionNumber,
          conditions,
          requirements,
          requiredDocuments,
          variablesConfiguration: variablesConfig,
        });

        const [updatedVersion] = await tx.update(institutionProductVersions)
          .set({
            conditions,
            requirements,
            requiredDocuments,
            variablesConfiguration: variablesConfig,
            changeReason: versionData.changeReason !== undefined ? versionData.changeReason : version.changeReason,
            versionHash,
            updatedAt: new Date(),
          })
          .where(and(
            eq(institutionProductVersions.id, versionId),
            eq(institutionProductVersions.institutionProductId, productId),
            eq(institutionProductVersions.status, "draft")
          ))
          .returning();
        if (!updatedVersion) {
          throw new Error("OFFER_DRAFT_ALREADY_PUBLISHED_OR_CHANGED");
        }

        let updatedProduct: any;
        const [currentProd] = await tx.select().from(institutionProducts)
          .where(eq(institutionProducts.id, productId))
          .limit(1);

        if (productData && currentProd) {
          // B3.1: Aislamiento total - si el producto ya está publicado, no sobreescribir configuration comercial con la de un borrador
          const finalProductData = currentProd.status === "published"
            ? {
                ...productData,
                configuration: currentProd.configuration,
                targetProfiles: currentProd.targetProfiles,
              }
            : productData;

          const [prod] = await tx.update(institutionProducts)
            .set({
              ...finalProductData,
              updatedAt: new Date(),
            })
            .where(eq(institutionProducts.id, productId))
            .returning();
          updatedProduct = prod;
        } else {
          updatedProduct = currentProd;
        }

        return {
          product: updatedProduct,
          version: { ...updatedVersion, offerId: productId },
        };
      });
    } catch (error) {
      console.error(`Error updating draft version and product ${productId} in DbStorage:`, error);
      throw error;
    }
  }

  async updateInstitutionProductDraftVersion(
    productId: string,
    versionId: string,
    versionData: Partial<InsertInstitutionProductVersion>
  ): Promise<InstitutionProductVersion> {
    const res = await this.updateInstitutionProductDraftAndParent(productId, versionId, versionData);
    return res.version;
  }

  async deleteInstitutionProductVersion(id: string): Promise<boolean> {
    try {
      const [version] = await db.select().from(institutionProductVersions)
        .where(eq(institutionProductVersions.id, id))
        .limit(1);
      if (!version) return false;

      if (version.status === "published" || version.status === "superseded" || version.status === "active") {
        throw new Error("No se puede eliminar una versión publicada o histórica (superseded). La integridad del historial es obligatoria.");
      }

      const result = await db.delete(institutionProductVersions).where(eq(institutionProductVersions.id, id));
      return (result.rowCount ?? 0) > 0;
    } catch (error) {
      console.error(`Error deleting version ${id} in DbStorage:`, error);
      throw error;
    }
  }

  // ===== FINANCIAL INSTITUTION OFFERS ALIASES (Retrocompatibilidad total Bloque A1) =====
  async getOffers(options?: { institutionId?: string; productType?: string; status?: string; isActive?: boolean }): Promise<FinancialInstitutionOffer[]> {
    try {
      const conditions = [];
      if (options?.institutionId) conditions.push(eq(institutionProducts.institutionId, options.institutionId));
      if (options?.productType) conditions.push(eq(institutionProducts.productType, options.productType));
      if (options?.status) conditions.push(eq(institutionProducts.status, options.status));
      if (options?.isActive !== undefined) conditions.push(eq(institutionProducts.isActive, options.isActive));

      const query = db.select().from(institutionProducts);
      const rows = conditions.length > 0
        ? await query.where(and(...conditions)).orderBy(desc(institutionProducts.createdAt))
        : await query.orderBy(desc(institutionProducts.createdAt));

      return rows.map(r => ({
        ...r,
        name: r.name ?? r.customName ?? "",
        institutionProductId: r.id,
      }));
    } catch (error) {
      console.error("Error getting offers in DbStorage:", error);
      return [];
    }
  }

  async getOffer(id: string): Promise<FinancialInstitutionOffer | undefined> {
    try {
      const [offer] = await db.select().from(institutionProducts).where(eq(institutionProducts.id, id)).limit(1);
      if (!offer) return undefined;
      return {
        ...offer,
        name: offer.name ?? offer.customName ?? "",
        institutionProductId: offer.id,
      };
    } catch (error) {
      console.error(`Error getting offer ${id} in DbStorage:`, error);
      return undefined;
    }
  }

  async getOffersByInstitution(institutionId: string, options?: { includeInactive?: boolean }): Promise<FinancialInstitutionOffer[]> {
    return this.getOffers({
      institutionId,
      isActive: options?.includeInactive ? undefined : true,
    });
  }

  async getOffersByProductType(institutionId: string, productType: string): Promise<FinancialInstitutionOffer[]> {
    return this.getOffers({
      institutionId,
      productType,
      isActive: true,
    });
  }

  async createOffer(
    offerData: InsertFinancialInstitutionOffer & { name?: string },
    initialVersion?: Partial<InsertFinancialInstitutionOfferVersion>
  ): Promise<{ offer: FinancialInstitutionOffer; version: FinancialInstitutionOfferVersion }> {
    const offerId = (offerData as any).id ?? randomUUID();
    const offerName = offerData.name ?? offerData.customName ?? "Oferta Comercial";

    const product = await this.createInstitutionProduct({
      ...offerData,
      id: offerId,
      name: offerName,
      customName: offerName,
      status: "draft",
    } as any);

    const version = await this.createInstitutionProductDraftVersion(offerId, {
      ...initialVersion,
      status: "draft",
      changeReason: initialVersion?.changeReason ?? "Versión inicial en borrador",
    });

    return {
      offer: { ...product, name: offerName, institutionProductId: offerId, status: "draft" },
      version: { ...version, offerId, status: "draft" },
    };
  }

  async updateOffer(id: string, offerData: Partial<InsertFinancialInstitutionOffer>): Promise<FinancialInstitutionOffer | undefined> {
    return this.updateInstitutionProduct(id, offerData);
  }

  async deleteOffer(id: string): Promise<boolean> {
    return this.deleteInstitutionProduct(id);
  }

  async getOfferVersions(offerId: string): Promise<FinancialInstitutionOfferVersion[]> {
    return this.getInstitutionProductVersions(offerId);
  }

  async getOfferVersion(id: string): Promise<FinancialInstitutionOfferVersion | undefined> {
    return this.getInstitutionProductVersion(id);
  }

  async getActiveOfferVersion(offerId: string): Promise<FinancialInstitutionOfferVersion | undefined> {
    return this.getActiveInstitutionProductVersion(offerId);
  }

  async createOfferVersion(
    offerId: string,
    versionData: Partial<InsertFinancialInstitutionOfferVersion> & { changeReason?: string }
  ): Promise<FinancialInstitutionOfferVersion> {
    return this.createInstitutionProductDraftVersion(offerId, versionData);
  }

  async updateOfferDraftVersion(
    offerId: string,
    versionId: string,
    versionData: Partial<InsertFinancialInstitutionOfferVersion>
  ): Promise<FinancialInstitutionOfferVersion> {
    return this.updateInstitutionProductDraftVersion(offerId, versionId, versionData);
  }

  async updateOfferDraftAndParent(
    offerId: string,
    versionId: string,
    versionData: Partial<InsertFinancialInstitutionOfferVersion>,
    offerData?: Partial<InsertFinancialInstitutionOffer>
  ): Promise<{ offer: FinancialInstitutionOffer; version: FinancialInstitutionOfferVersion }> {
    const res = await this.updateInstitutionProductDraftAndParent(offerId, versionId, versionData, offerData);
    return { offer: res.product, version: res.version };
  }

  async publishOfferVersion(
    offerId: string,
    versionId: string,
    options?: { publishedBy?: string; changeReason?: string }
  ): Promise<FinancialInstitutionOfferVersion> {
    return this.publishInstitutionProductVersion(offerId, versionId, options);
  }

  async deleteOfferVersion(id: string): Promise<boolean> {
    return this.deleteInstitutionProductVersion(id);
  }

  async supersedeOfferVersion(offerId: string, oldVersionNumber: number, supersededAt?: Date): Promise<boolean> {
    try {
      const result = await db.update(institutionProductVersions)
        .set({ status: "superseded", effectiveTo: supersededAt ?? new Date(), updatedAt: new Date() })
        .where(and(
          eq(institutionProductVersions.institutionProductId, offerId),
          eq(institutionProductVersions.versionNumber, oldVersionNumber)
        ));
      return (result.rowCount ?? 0) > 0;
    } catch (error) {
      console.error(`Error superseding version in DbStorage:`, error);
      return false;
    }
  }

  // ===== FINANCIAL INSTITUTIONS =====
  async getFinancialInstitutions(userId?: string): Promise<FinancialInstitution[]> {
    try {
      // Remove the isActive filter to return ALL financial institutions (active and inactive)
      let query = db.select().from(financialInstitutions)
        .orderBy(asc(financialInstitutions.name));
        
      const result = await query;
      
      if (userId) {
        // Filter to admin-created institutions and user's own institutions
        return result.filter(f => f.createdByAdmin || f.createdBy === userId);
      }
      
      return result;
    } catch (error) {
      console.error("Error fetching financial institutions:", error);
      return [];
    }
  }

  async getFinancialInstitution(id: string): Promise<FinancialInstitution | undefined> {
    try {
      const result = await db.select().from(financialInstitutions).where(eq(financialInstitutions.id, id)).limit(1);
      return result[0];
    } catch (error) {
      console.error("Error fetching financial institution:", error);
      return undefined;
    }
  }

  async createFinancialInstitution(institutionData: InsertFinancialInstitution): Promise<FinancialInstitution> {
    try {
      const [created] = await db
        .insert(financialInstitutions)
        .values({
          ...institutionData,
          id: (institutionData as any).id || randomUUID(),
          contactPerson: institutionData.contactPerson ?? null,
          email: institutionData.email ?? null,
          phone: institutionData.phone ?? null,
          openingCommissionRate: institutionData.openingCommissionRate ? String(institutionData.openingCommissionRate) : null,
          overrateCommissionRate: institutionData.overrateCommissionRate ? String(institutionData.overrateCommissionRate) : null,
          masterBrokerCommissionRate: institutionData.masterBrokerCommissionRate ? String(institutionData.masterBrokerCommissionRate) : null,
          brokerCommissionRate: institutionData.brokerCommissionRate ? String(institutionData.brokerCommissionRate) : null,
          additionalCosts: institutionData.additionalCosts ?? [],
          requirements: institutionData.requirements ?? {},
          products: institutionData.products ?? [],
          notes: institutionData.notes ?? null,
          createdByAdmin: institutionData.createdByAdmin ?? false,
          createdBy: institutionData.createdBy ?? null,
          isActive: institutionData.isActive ?? true,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
      return created;
    } catch (error) {
      console.error("Error creating financial institution:", error);
      throw error;
    }
  }

  async updateFinancialInstitution(id: string, institutionData: Partial<InsertFinancialInstitution>): Promise<FinancialInstitution | undefined> {
    try {
      const [updated] = await db
        .update(financialInstitutions)
        .set({ ...institutionData, updatedAt: new Date() })
        .where(eq(financialInstitutions.id, id))
        .returning();
      return updated;
    } catch (error) {
      console.error("Error updating financial institution:", error);
      return undefined;
    }
  }

  async deleteFinancialInstitution(id: string): Promise<boolean> {
    try {
      // 1. Unlink foreign key references
      await db.update(credits).set({ financialInstitutionId: null }).where(eq(credits.financialInstitutionId, id));
      await db.update(productRequests).set({ existingInstitutionId: null }).where(eq(productRequests.existingInstitutionId, id));
      
      // 2. Comprobar si existen créditos o versiones publicadas vinculadas
      const linkedCredits = await db.select({ id: credits.id }).from(credits).where(eq(credits.financialInstitutionId, id)).limit(1);
      const linkedTargets = await db.select({ id: creditSubmissionTargets.id }).from(creditSubmissionTargets)
        .where(eq(creditSubmissionTargets.financialInstitutionId, id)).limit(1);
      const linkedPublishedVersions = await db.select({ id: institutionProductVersions.id })
        .from(institutionProductVersions)
        .innerJoin(institutionProducts, eq(institutionProductVersions.institutionProductId, institutionProducts.id))
        .where(and(
          eq(institutionProducts.institutionId, id),
          or(
            eq(institutionProductVersions.status, "published"),
            eq(institutionProductVersions.status, "superseded"),
            eq(institutionProductVersions.status, "active")
          )
        )).limit(1);

      const hasHistory = linkedCredits.length > 0 || linkedTargets.length > 0 || linkedPublishedVersions.length > 0;

      if (hasHistory) {
        // Desactivación lógica obligatoria: NUNCA eliminar solicitudes, créditos ni versiones utilizadas
        await db.update(financialInstitutions).set({ isActive: false, updatedAt: new Date() }).where(eq(financialInstitutions.id, id));
        await db.update(institutionProducts).set({ isActive: false, status: 'archived', updatedAt: new Date() }).where(eq(institutionProducts.institutionId, id));
        return true;
      }

      // Si no tiene historial transaccional ni legal, eliminar de forma segura
      await db.delete(creditSubmissionTargets).where(eq(creditSubmissionTargets.financialInstitutionId, id));
      await db.delete(institutionProducts).where(eq(institutionProducts.institutionId, id));
      await db.delete(products).where(eq(products.institutionId, id));
      
      // 3. Delete financial institution
      const result = await db.delete(financialInstitutions).where(eq(financialInstitutions.id, id));
      return (result.rowCount ?? 0) > 0;
    } catch (error) {
      console.error("Error deleting financial institution:", error);
      return false;
    }
  }

  // ===== CLIENT OPERATIONS =====
  
  async getClients(filters?: string | { brokerId?: string; tenantId?: string; tenantIds?: string[] }): Promise<Client[]> {
    try {
      if (typeof filters === "string") {
        return await db
          .select()
          .from(clients)
          .where(eq(clients.brokerId, filters))
          .orderBy(desc(clients.createdAt));
      }

      const conditions = [];
      if (filters?.tenantIds && filters.tenantIds.length > 0) {
        conditions.push(inArray(clients.tenantId, filters.tenantIds));
      } else if (filters?.tenantId) {
        conditions.push(eq(clients.tenantId, filters.tenantId));
      }
      if (filters?.brokerId) {
        conditions.push(eq(clients.brokerId, filters.brokerId));
      }

      const query = conditions.length > 0
        ? db.select().from(clients).where(and(...conditions)).orderBy(desc(clients.createdAt))
        : db.select().from(clients).orderBy(desc(clients.createdAt));

      return await query;
    } catch (error) {
      console.error("Error fetching clients:", error);
      return [];
    }
  }

  async getClient(id: string): Promise<Client | undefined> {
    try {
      const result = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
      return result[0];
    } catch (error) {
      console.error("Error fetching client:", error);
      return undefined;
    }
  }

  async createClient(clientData: InsertClient): Promise<Client> {
    try {
      const [created] = await db
        .insert(clients)
        .values({
          ...clientData,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
      return created;
    } catch (error) {
      console.error("Error creating client:", error);
      throw error;
    }
  }

  async updateClient(id: string, clientData: Partial<InsertClient>): Promise<Client | undefined> {
    try {
      const [updated] = await db
        .update(clients)
        .set({ ...clientData, updatedAt: new Date() })
        .where(eq(clients.id, id))
        .returning();
      return updated;
    } catch (error) {
      console.error("Error updating client:", error);
      return undefined;
    }
  }

  async deleteClient(id: string): Promise<boolean> {
    try {
      const result = await db.delete(clients).where(eq(clients.id, id));
      return (result as any).rowCount > 0;
    } catch (error) {
      console.error("Error deleting client:", error);
      return false;
    }
  }

  // Client Credit History operations
  async createClientCreditHistory(historyData: InsertClientCreditHistory): Promise<ClientCreditHistory> {
    try {
      const [created] = await db
        .insert(clientCreditHistories)
        .values({
          ...historyData,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
      return created;
    } catch (error) {
      console.error("Error creating client credit history:", error);
      throw error;
    }
  }

  async getClientCreditHistories(clientId: string): Promise<ClientCreditHistory[]> {
    try {
      return await db
        .select()
        .from(clientCreditHistories)
        .where(eq(clientCreditHistories.clientId, clientId))
        .orderBy(desc(clientCreditHistories.createdAt));
    } catch (error) {
      console.error("Error fetching client credit histories:", error);
      return [];
    }
  }

  // Credit operations
  async getCredits(filters?: { brokerId?: string; clientId?: string; status?: string; statuses?: string[]; from?: Date; to?: Date; tenantId?: string; tenantIds?: string[] }): Promise<Credit[]> {
    try {
      let query = db.select().from(credits);
      
      if (filters) {
        const conditions = [];
        if (filters.tenantIds && filters.tenantIds.length > 0) {
          conditions.push(inArray(credits.tenantId, filters.tenantIds));
        } else if (filters.tenantId) {
          conditions.push(eq(credits.tenantId, filters.tenantId));
        }
        if (filters.brokerId) conditions.push(eq(credits.brokerId, filters.brokerId));
        if (filters.clientId) conditions.push(eq(credits.clientId, filters.clientId));
        
        // Backward compatibility: handle both status and statuses
        const normalizedStatuses = filters.statuses || (filters.status ? [filters.status] : undefined);
        if (normalizedStatuses && normalizedStatuses.length > 0) {
          conditions.push(sql`${credits.status} IN ${normalizedStatuses}`);
        }
        
        // Date range filters
        if (filters.from) conditions.push(sql`${credits.createdAt} >= ${filters.from.toISOString()}`);
        if (filters.to) conditions.push(sql`${credits.createdAt} <= ${filters.to.toISOString()}`);
        
        if (conditions.length > 0) {
          query = query.where(and(...conditions)) as any;
        }
      }
      
      return await query.orderBy(desc(credits.createdAt));
    } catch (error) {
      console.error("Error fetching credits:", error);
      return [];
    }
  }
  
  async getCredit(id: string): Promise<Credit | undefined> {
    try {
      const result = await db.select().from(credits).where(eq(credits.id, id));
      return result[0];
    } catch (error) {
      console.error("Error fetching credit:", error);
      return undefined;
    }
  }
  
  async createCredit(credit: InsertCredit): Promise<Credit> {
    try {
      const snapshotLineage = readFrozenOfferLineage(credit.finalProposal);
      const explicitLineage = credit.institutionProductId || credit.versionNumber != null
        ? readFrozenOfferLineage({
            institutionProductId: credit.institutionProductId, versionNumber: credit.versionNumber,
          }) : null;
      if (explicitLineage && (!snapshotLineage ||
          explicitLineage.institutionProductId !== snapshotLineage.institutionProductId ||
          explicitLineage.versionNumber !== snapshotLineage.versionNumber)) {
        throw new Error("OFFER_VERSION_IDENTITY_MISMATCH");
      }
      const canonical = snapshotLineage || explicitLineage;
      if (canonical) {
        const product = await this.getInstitutionProduct(canonical.institutionProductId);
        if (!product || (credit.financialInstitutionId &&
            product.institutionId !== credit.financialInstitutionId)) {
          throw new Error("OFFER_VERSION_INSTITUTION_MISMATCH");
        }
        const versions = await this.getInstitutionProductVersions(canonical.institutionProductId);
        const version = versions.find(v => v.versionNumber === canonical.versionNumber);
        if (!version || !["published", "superseded"].includes(version.status)) {
          throw new Error("OFFER_VERSION_NOT_PUBLISHED");
        }
        // A newer version cannot alter the version already frozen for this financing.
        if (version.status === "superseded" && !credit.linkedSubmissionId) {
          throw new Error("OFFER_VERSION_NOT_CURRENT");
        }
      }

      // Commercial lineage is always derived server-side at creation time.
      // If the credit comes from a submission, inherit the immutable affiliation
      // captured when that submission was originated—even if the broker moved later.
      let originMasterBrokerId: string | null = null;
      let inheritedFromSubmission = false;

      if (credit.linkedSubmissionId) {
        const submission = await this.getCreditSubmissionRequest(credit.linkedSubmissionId);
        if (submission) {
          originMasterBrokerId = submission.originMasterBrokerId ?? null;
          inheritedFromSubmission = true;
        }
      }
      if (!inheritedFromSubmission) {
        const brokerAtOrigination = await this.getUser(credit.brokerId);
        if (brokerAtOrigination?.role === "master_broker") {
          originMasterBrokerId = brokerAtOrigination.id;
        } else if (brokerAtOrigination?.role === "broker" && brokerAtOrigination.masterBrokerId) {
          const parentAtOrigination = await this.getUser(brokerAtOrigination.masterBrokerId);
          // Casa Matriz / Admin is direct platform business, not a Master layer.
          originMasterBrokerId =
            parentAtOrigination?.role === "master_broker" ? parentAtOrigination.id : null;
        }
      }

      const [created] = await db.transaction(async (tx) => {
        if (!credit.linkedSubmissionId) {
          if (canonical) {
            await assertOfferCommissionAcceptanceInTransaction(tx, {
              offerId: canonical.institutionProductId,
              versionNumber: canonical.versionNumber,
              financialInstitutionId: credit.financialInstitutionId || null,
              brokerId: credit.brokerId,
              originMasterBrokerId,
            });
          } else {
            await assertLegacyProposalPredatesPublishedCatalogInTransaction(tx, {
              financialInstitutionId: credit.financialInstitutionId || null,
            });
          }
        }
        return tx.insert(credits).values({
          ...credit,
          institutionProductId: canonical?.institutionProductId ?? null,
          versionNumber: canonical?.versionNumber ?? null,
          originMasterBrokerId,
          createdAt: new Date(),
          updatedAt: new Date(),
        }).returning();
      });
      return created;
    } catch (error) {
      console.error("Error creating credit:", error);
      throw error;
    }
  }
  
  async updateCredit(id: string, credit: Partial<InsertCredit>): Promise<Credit | undefined> {
    try {
      const { originMasterBrokerId: _immutableOrigin,
        institutionProductId: _immutableOffer, versionNumber: _immutableVersion,
        ...safeCredit } = credit as any;
      if (safeCredit.finalProposal !== undefined) {
        const [existing] = await db.select().from(credits).where(eq(credits.id, id)).limit(1);
        if (!existing) return undefined;
        const oldLineage = readFrozenOfferLineage(existing.finalProposal);
        const newLineage = readFrozenOfferLineage(safeCredit.finalProposal);
        if (oldLineage || existing.institutionProductId || existing.versionNumber != null) {
          assertFrozenOfferLineage(existing.finalProposal, safeCredit.finalProposal);
          if (existing.institutionProductId !== (newLineage?.institutionProductId ?? null) ||
              existing.versionNumber !== (newLineage?.versionNumber ?? null)) {
            // Existing pre-0009 versioned credits require audited historical reconciliation.
            if (existing.institutionProductId || existing.versionNumber != null) {
              throw new Error("OFFER_VERSION_IDENTITY_MISMATCH");
            }
          }
        } else if (newLineage) {
          throw new Error("OFFER_VERSION_REQUIRES_RECONCILIATION");
        }
      }
      const [updated] = await db
        .update(credits)
        .set({
          ...safeCredit,
          updatedAt: new Date(),
        })
        .where(eq(credits.id, id))
        .returning();
      return updated;
    } catch (error) {
      console.error("Error updating credit:", error);
      return undefined;
    }
  }
  
  async getCreditsByStatus(status: string): Promise<Credit[]> {
    try {
      return await db
        .select()
        .from(credits)
        .where(eq(credits.status, status))
        .orderBy(desc(credits.createdAt));
    } catch (error) {
      console.error("Error fetching credits by status:", error);
      return [];
    }
  }
  
  async getExpiringCredits(days: number): Promise<Credit[]> {
    try {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + days);
      
      return await db
        .select()
        .from(credits)
        .where(
          and(
            eq(credits.status, 'active'),
            sql`${credits.endDate} <= ${futureDate.toISOString().split('T')[0]}`
          )
        )
        .orderBy(asc(credits.endDate));
    } catch (error) {
      console.error("Error fetching expiring credits:", error);
      return [];
    }
  }

  async countCreditsByStatus(filters: { brokerId?: string; masterBrokerId?: string; includeNetwork?: boolean; statuses?: string[] }): Promise<number> {
    // TODO: Implement SQL COUNT query with network support
    return 0;
  }

  async sumCreditAmounts(filters: { brokerId?: string; masterBrokerId?: string; includeNetwork?: boolean; statuses?: string[]; from?: Date; to?: Date }): Promise<string> {
    // TODO: Implement SQL SUM query with COALESCE(SUM(amount::numeric),0)
    return "0.00";
  }

  // Commission operations
  async getCommission(id: string): Promise<Commission | undefined> {
    try {
      const [commission] = await db.select().from(commissions).where(eq(commissions.id, id));
      return commission;
    } catch (error) {
      console.error("Error fetching commission by id:", error);
      return undefined;
    }
  }

  async getCommissions(filtersOrBrokerId?: {
    brokerId?: string;
    masterBrokerId?: string;
    includeNetwork?: boolean;
    status?: string;
    statuses?: string[];
    from?: Date;
    to?: Date;
    tenantId?: string;
    tenantIds?: string[];
    creditId?: string;
    idempotencyKey?: string;
  } | string): Promise<Commission[]> {
    try {
      const filters = typeof filtersOrBrokerId === "string"
        ? { brokerId: filtersOrBrokerId }
        : filtersOrBrokerId;

      if (!filters) {
        return await db.select().from(commissions).orderBy(desc(commissions.createdAt));
      }

      const conditions: any[] = [];

      if (filters.creditId) {
        conditions.push(eq(commissions.creditId, filters.creditId));
      }

      if (filters.tenantId) {
        conditions.push(eq(commissions.tenantId, filters.tenantId));
      }

      if (filters.tenantIds && filters.tenantIds.length > 0) {
        conditions.push(inArray(commissions.tenantId, filters.tenantIds));
      }

      if (filters.idempotencyKey) {
        conditions.push(eq(commissions.idempotencyKey, filters.idempotencyKey));
      }

      if (filters.brokerId) {
        conditions.push(eq(commissions.brokerId, filters.brokerId));
      } else if (filters.masterBrokerId) {
        if (filters.includeNetwork) {
          const networkBrokers = await this.getUsersByMasterBroker(filters.masterBrokerId);
          const brokerIds = [...networkBrokers.map((b) => b.id), filters.masterBrokerId];
          conditions.push(
            or(
              eq(commissions.masterBrokerId, filters.masterBrokerId),
              inArray(commissions.brokerId, brokerIds)
            )
          );
        } else {
          conditions.push(
            or(
              eq(commissions.masterBrokerId, filters.masterBrokerId),
              eq(commissions.brokerId, filters.masterBrokerId)
            )
          );
        }
      }

      if (filters.status) {
        conditions.push(eq(commissions.status, filters.status));
      }

      if (filters.statuses && filters.statuses.length > 0) {
        conditions.push(inArray(commissions.status, filters.statuses));
      }

      if (filters.from) {
        conditions.push(sql`${commissions.createdAt} >= ${filters.from}`);
      }

      if (filters.to) {
        conditions.push(sql`${commissions.createdAt} <= ${filters.to}`);
      }

      if (conditions.length === 0) {
        return await db.select().from(commissions).orderBy(desc(commissions.createdAt));
      }

      return await db
        .select()
        .from(commissions)
        .where(and(...conditions))
        .orderBy(desc(commissions.createdAt));
    } catch (error) {
      console.error("Error fetching commissions:", error);
      return [];
    }
  }

  async createCommission(commissionData: InsertCommission): Promise<Commission> {
    try {
      const [credit] = await db.select().from(credits).where(eq(credits.id, commissionData.creditId)).limit(1);
      if (!credit) throw new Error("COMMISSION_CREDIT_NOT_FOUND");
      if ((commissionData.institutionProductId || commissionData.versionNumber != null) &&
          (commissionData.institutionProductId !== credit.institutionProductId ||
           commissionData.versionNumber !== credit.versionNumber)) throw new Error("COMMISSION_OFFER_VERSION_MISMATCH");
      const [created] = await db.insert(commissions).values({
        ...commissionData, institutionProductId: credit.institutionProductId ?? null,
        versionNumber: credit.versionNumber ?? null,
      }).returning();
      return created;
    } catch (error) {
      console.error("Error creating commission:", error);
      throw error;
    }
  }

  async updateCommission(id: string, commissionData: Partial<Commission>): Promise<Commission | undefined> {
    try {
      const [updated] = await db
        .update(commissions)
        .set({ ...commissionData, updatedAt: new Date() })
        .where(eq(commissions.id, id))
        .returning();
      return updated;
    } catch (error) {
      console.error("Error updating commission:", error);
      return undefined;
    }
  }

  async transitionCommissionStatus(
    id: string,
    fromStatuses: string[],
    toStatus: string,
    additionalUpdates?: Partial<Commission>
  ): Promise<Commission | null> {
    try {
      const [updated] = await db
        .update(commissions)
        .set({
          ...additionalUpdates,
          status: toStatus as any,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(commissions.id, id),
            inArray(commissions.status, fromStatuses as any)
          )
        )
        .returning();
      return updated || null;
    } catch (error) {
      console.error("Error transitioning commission status:", error);
      return null;
    }
  }

  /**
   * OPE-10/11: Confirm a tranche and calculate its prepared commission as ONE
   * PostgreSQL transaction. Locks the credit so the second request re-evaluates
   * the approved limit and confirmed tranches against the committed first one.
   */
  async confirmCreditDisbursementAtomic(params: {
    creditId: string;
    expectedProposal: Credit["finalProposal"];
    expectedAmount: string;
    confirmedAmount: number;
    dispersalIndex: number;
    commission: InsertCommission;
    performedBy: string;
    actorEmail?: string | null;
    notes?: string | null;
    idempotencyKey?: string | null;
  }): Promise<{ credit: Credit; commission: Commission; alreadyConfirmed: boolean }> {
    return db.transaction(tx => this.confirmCreditDisbursementInTx(
      tx as unknown as typeof db, params
    ));
  }

  private async confirmCreditDisbursementInTx(
    tx: typeof db,
    params: Parameters<NonNullable<IStorage["confirmCreditDisbursementAtomic"]>>[0]
  ): Promise<{ credit: Credit; commission: Commission; alreadyConfirmed: boolean }> {

    const amount = Number(params.confirmedAmount);
    const index = Number(params.dispersalIndex);
    const key = params.idempotencyKey?.trim() || null;
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(index) || index < 1 ||
        params.commission.creditId !== params.creditId ||
        params.commission.status !== "generated" ||
        (params.commission.idempotencyKey || null) !== key) {
      throw new Error("DISBURSEMENT_INVALID_INPUT");
    }

      const [locked] = await tx.select().from(credits)
        .where(eq(credits.id, params.creditId)).for("update");
      if (!locked) throw new Error("DISBURSEMENT_CREDIT_NOT_FOUND");
      if (["cancelled", "rejected"].includes(locked.status) || !locked.brokerId ||
          !locked.financialInstitutionId) {
        throw new Error("DISBURSEMENT_CREDIT_NOT_ELIGIBLE");
      }
      const sourceProposal = (locked.finalProposal || {}) as Record<string, any>;
      const frozen = readFrozenOfferLineage(sourceProposal);
      if ((locked.institutionProductId || locked.versionNumber != null) &&
          (locked.institutionProductId !== frozen?.institutionProductId ||
           locked.versionNumber !== frozen?.versionNumber)) throw new Error("DISBURSEMENT_OFFER_VERSION_MISMATCH");
      if ((params.commission.institutionProductId || params.commission.versionNumber != null) &&
          (params.commission.institutionProductId !== locked.institutionProductId ||
           params.commission.versionNumber !== locked.versionNumber)) throw new Error("DISBURSEMENT_OFFER_VERSION_MISMATCH");
      // The immutable database lineage is authoritative; never let editable
      // proposal JSON invent a Master beneficiary for a historical credit.
      if (sourceProposal.originMasterBrokerId !== undefined &&
          (sourceProposal.originMasterBrokerId || null) !== (locked.originMasterBrokerId || null)) {
        throw new Error("DISBURSEMENT_ORIGIN_LINEAGE_MISMATCH");
      }
      const priorTranches: any[] = Array.isArray(sourceProposal.disbursementTranches)
        ? sourceProposal.disbursementTranches
        : sourceProposal.disbursementConfirmation ? [sourceProposal.disbursementConfirmation] : [];
      const existingTranche = priorTranches.find(t => Number(t.dispersalIndex || 1) === index);
      if (existingTranche) {
        if (Math.abs(Number(existingTranche.confirmedAmount) - amount) >= 0.01 ||
            (key && existingTranche.idempotencyKey && existingTranche.idempotencyKey !== key)) {
          throw new Error("DISBURSEMENT_TRANCHE_ALREADY_CONFIRMED");
        }
        const [prior] = await tx.select().from(commissions)
          .where(eq(commissions.id, existingTranche.commissionId || "")).limit(1);
        if (!prior) throw new Error("DISBURSEMENT_INCONSISTENT_EXISTING_TRANCHE");
        return { credit: locked, commission: prior, alreadyConfirmed: true };
      }

      // Validate a fresh commercial snapshot only for a NEW tranche.
      // Identical retries have already been safely resolved under the row lock.
      if (stableJsonSnapshot(sourceProposal) !== stableJsonSnapshot(params.expectedProposal || {}) ||
          String(locked.amount) !== String(params.expectedAmount) ||
          locked.brokerId !== params.commission.brokerId ||
          (locked.originMasterBrokerId || null) !==
            (params.commission.masterBrokerId || null)) {
        throw new Error("DISBURSEMENT_STALE_COMMERCIAL_SNAPSHOT");
      }
      const maxAmount = Number(locked.amount);
      const previousTotal = priorTranches.reduce((sum, t) => sum + Number(t.confirmedAmount || 0), 0);
      if (!Number.isFinite(maxAmount) || maxAmount <= 0 || previousTotal + amount > maxAmount + 0.01) {
        throw new Error("TOTAL_DISBURSEMENT_EXCEEDS_APPROVED_AMOUNT");
      }

      // Do not allow idempotency keys to be reused on other credits or tranches.
      if (key) {
        const [duplicateKey] = await tx.select().from(commissions)
          .where(eq(commissions.idempotencyKey, key)).limit(1);
        if (duplicateKey) throw new Error("DISBURSEMENT_DUPLICATE_IDEMPOTENCY_KEY");
      }
      const [duplicateType] = await tx.select().from(commissions)
        .where(and(eq(commissions.creditId, locked.id),
          eq(commissions.commissionType, params.commission.commissionType || ""))).limit(1);
      if (duplicateType) throw new Error("DISBURSEMENT_COMMISSION_ALREADY_EXISTS");

      const [createdCommission] = await tx.insert(commissions).values({
        ...params.commission,
        tenantId: locked.tenantId || params.commission.tenantId || null,
        brokerId: locked.brokerId,
        masterBrokerId: locked.originMasterBrokerId || null,
        creditId: locked.id,
        institutionProductId: locked.institutionProductId ?? null,
        versionNumber: locked.versionNumber ?? null,
        idempotencyKey: key,
        status: "generated",
      }).returning();

      const now = new Date();
      const tranche = {
        dispersalIndex: index,
        confirmedAmount: amount,
        confirmedAt: now.toISOString(),
        confirmedBy: params.performedBy,
        confirmedByEmail: params.actorEmail || null,
        notes: params.notes || null,
        idempotencyKey: key,
        commissionId: createdCommission.id,
        status: "confirmed",
      };
      const updatedTranches = [...priorTranches, tranche]
        .sort((a, b) => Number(a.dispersalIndex || 1) - Number(b.dispersalIndex || 1));
      const updatedProposal = {
        ...sourceProposal,
        disbursementConfirmation: tranche,
        disbursementTranches: updatedTranches,
        disbursementStatus: "confirmed",
        confirmedDisbursedAmount: previousTotal + amount,
      };
      const [updatedCredit] = await tx.update(credits)
        .set({
          status: "disbursed",
          finalProposal: updatedProposal,
          notes: params.notes
            ? (locked.notes ? locked.notes + " | Confirmación: " + params.notes : "Confirmación: " + params.notes)
            : locked.notes,
          updatedAt: now,
        })
        .where(eq(credits.id, locked.id)).returning();

      // Both audit rows are mandatory, never swallowed. Any insert failure rolls back all changes.
      await tx.insert(commissionAuditLogs).values([
        {
          commissionId: createdCommission.id,
          action: "created",
          performedBy: params.performedBy,
          previousStatus: null,
          newStatus: "generated",
          details: {
            creditId: locked.id, commissionType: createdCommission.commissionType,
            confirmedAmount: amount, dispersalIndex: index,
            originMasterBrokerId: locked.originMasterBrokerId,
            idempotencyKey: key,
          },
        },
        {
          commissionId: createdCommission.id,
          action: "disbursement_confirmed",
          performedBy: params.performedBy,
          previousStatus: "generated",
          newStatus: "generated",
          details: {
            creditId: locked.id, confirmedAmount: amount,
            dispersalIndex: index, confirmedAt: now.toISOString(),
            notes: params.notes || null,
          },
        },
      ]);
      return { credit: updatedCredit, commission: createdCommission, alreadyConfirmed: false };
  }

  /**
   * OPE-06: serialize double clicks and multiple processes on the TARGET row.
   * An already selected target returns its previously linked credit; an error
   * while creating or linking the credit rolls back both changes.
   */
  async selectWinningTargetAtomic(
    params: Parameters<NonNullable<IStorage["selectWinningTargetAtomic"]>>[0]
  ): Promise<{ target: CreditSubmissionTarget; credit: Credit; alreadySelected: boolean }> {
    return db.transaction(async tx => {
      const [target] = await tx.select().from(creditSubmissionTargets)
        .where(eq(creditSubmissionTargets.id, params.targetId)).for("update");
      if (!target || target.requestId !== params.requestId) {
        throw new Error("WINNER_TARGET_NOT_FOUND");
      }
      const [request] = await tx.select().from(creditSubmissionRequests)
        .where(eq(creditSubmissionRequests.id, target.requestId)).limit(1);
      if (!request) throw new Error("WINNER_REQUEST_NOT_FOUND");

      const offerLineage = readFrozenOfferLineage(target.institutionProposal);
      if ((target.institutionProductId || target.versionNumber != null) &&
          (target.institutionProductId !== offerLineage?.institutionProductId ||
           target.versionNumber !== offerLineage?.versionNumber)) {
        throw new Error("OFFER_VERSION_IDENTITY_MISMATCH");
      }
      if (target.creditId) {
        const [existing] = await tx.select().from(credits)
          .where(eq(credits.id, target.creditId)).limit(1);
        if (!existing || existing.linkedSubmissionId !== request.id ||
            existing.financialInstitutionId !== target.financialInstitutionId ||
            existing.clientId !== request.clientId ||
            existing.brokerId !== request.brokerId ||
            (existing.originMasterBrokerId || null) !== (request.originMasterBrokerId || null)) {
          throw new Error("WINNER_EXISTING_CREDIT_LINEAGE_MISMATCH");
        }
        if (!target.isWinner) throw new Error("WINNER_TARGET_CREDIT_NOT_SELECTED");
        assertFrozenOfferLineage(target.institutionProposal, existing.finalProposal);
        if ((existing.institutionProductId || existing.versionNumber != null) &&
            (existing.institutionProductId !== offerLineage?.institutionProductId ||
             existing.versionNumber !== offerLineage?.versionNumber)) throw new Error("OFFER_VERSION_IDENTITY_MISMATCH");
        return { target, credit: existing, alreadySelected: true };
      }

      if (!["approved", "institution_approved", "selected_winner"].includes(target.status)) {
        throw new Error("WINNER_TARGET_NOT_ELIGIBLE");
      }
      const proposal = (target.institutionProposal || {}) as Record<string, unknown>;
      const approved = Number(proposal.approvedAmount);
      const rate = Number(proposal.interestRate);
      const term = Number(proposal.term);
      if (!Number.isFinite(approved) || approved <= 0 ||
          !Number.isFinite(rate) || rate < 0 ||
          !Number.isInteger(term) || term <= 0) {
        throw new Error("WINNER_PROPOSAL_INCOMPLETE");
      }
      if (stableJsonSnapshot(target.institutionProposal || {}) !==
          stableJsonSnapshot(params.expectedProposal || {})) {
        throw new Error("WINNER_PROPOSAL_CHANGED");
      }
      const proposed = params.newCredit;
      // One offer and exact version travel with the target into its frozen credit.
      assertFrozenOfferLineage(target.institutionProposal, proposed?.finalProposal);
      if (!proposed || !proposed.id || proposed.clientId !== request.clientId ||
          proposed.brokerId !== request.brokerId ||
          proposed.linkedSubmissionId !== request.id ||
          proposed.financialInstitutionId !== target.financialInstitutionId ||
          (proposed.originMasterBrokerId || null) !== (request.originMasterBrokerId || null) ||
          Number(proposed.amount) !== approved ||
          Number(proposed.interestRate) !== rate ||
          Number(proposed.term) !== term) {
        throw new Error("WINNER_CREDIT_PROPOSAL_MISMATCH");
      }
      if (offerLineage) {
        await assertOfferCommissionAcceptanceInTransaction(tx, {
          offerId: offerLineage.institutionProductId,
          versionNumber: offerLineage.versionNumber,
          financialInstitutionId: target.financialInstitutionId,
          brokerId: request.brokerId,
          originMasterBrokerId: request.originMasterBrokerId ?? null,
          proposalRecordedAt: target.proposalReceivedAt,
        });
      } else {
        await assertLegacyProposalPredatesPublishedCatalogInTransaction(tx, {
          financialInstitutionId: target.financialInstitutionId,
          proposalRecordedAt: target.proposalReceivedAt,
        });
      }
      const [created] = await tx.insert(credits).values({
        ...proposed,
        id: proposed.id,
        originMasterBrokerId: request.originMasterBrokerId || null,
        institutionProductId: offerLineage?.institutionProductId ?? null,
        versionNumber: offerLineage?.versionNumber ?? null,
        status: "approved",
      }).returning();
      const [selected] = await tx.update(creditSubmissionTargets).set({
        institutionProductId: offerLineage?.institutionProductId ?? null,
        versionNumber: offerLineage?.versionNumber ?? null,
        creditId: created.id,
        isWinner: true,
        status: "selected_winner",
        updatedAt: new Date(),
      }).where(eq(creditSubmissionTargets.id, target.id)).returning();
      if (!selected) throw new Error("WINNER_TARGET_UPDATE_FAILED");
      return { target: selected, credit: created, alreadySelected: false };
    });
  }

  /**
   * OPE-12: winner eligibility, historical attribution, optional credit creation,
   * target linkage, tranche, commission and audit all commit in one PG transaction.
   * No Master affiliation is ever inferred from the Broker's CURRENT parent.
   */
  async confirmTargetDisbursementAtomic(
    params: Parameters<NonNullable<IStorage["confirmTargetDisbursementAtomic"]>>[0]
  ): Promise<{ target: CreditSubmissionTarget; credit: Credit; commission: Commission; alreadyConfirmed: boolean }> {
    return db.transaction(async rawTx => {
      const tx = rawTx as unknown as typeof db;
      const [target] = await tx.select().from(creditSubmissionTargets)
        .where(eq(creditSubmissionTargets.id, params.targetId)).for("update");
      if (!target || target.requestId !== params.requestId) {
        throw new Error("DISBURSEMENT_TARGET_NOT_FOUND");
      }
      if (!target.isWinner || ["cancelled", "rejected"].includes(target.status)) {
        throw new Error("DISBURSEMENT_TARGET_NOT_ELIGIBLE");
      }
      if (stableJsonSnapshot(target.institutionProposal || {}) !==
          stableJsonSnapshot(params.expectedTargetProposal || {})) {
        throw new Error("DISBURSEMENT_TARGET_PROPOSAL_CHANGED");
      }
      const [request] = await tx.select().from(creditSubmissionRequests)
        .where(eq(creditSubmissionRequests.id, target.requestId)).limit(1);
      if (!request || request.brokerId !== params.expectedBrokerId ||
          (request.originMasterBrokerId || null) !== params.expectedOriginMasterBrokerId) {
        throw new Error("DISBURSEMENT_REQUEST_ATTRIBUTION_CHANGED");
      }
      const offerLineage = assertFrozenOfferLineage(target.institutionProposal, params.expectedProposal);
      if ((target.institutionProductId || target.versionNumber != null) &&
          (target.institutionProductId !== offerLineage?.institutionProductId ||
           target.versionNumber !== offerLineage?.versionNumber)) throw new Error("OFFER_VERSION_IDENTITY_MISMATCH");
      let creditId = target.creditId;
      if (!creditId) {
        const proposed = params.newCredit;
        if (!proposed || !proposed.id || proposed.brokerId !== request.brokerId ||
            (proposed.originMasterBrokerId || null) !== (request.originMasterBrokerId || null) ||
            proposed.financialInstitutionId !== target.financialInstitutionId ||
            proposed.linkedSubmissionId !== request.id ||
            proposed.clientId !== request.clientId ||
            proposed.amount !== params.expectedAmount ||
            stableJsonSnapshot(proposed.finalProposal || {}) !==
              stableJsonSnapshot(params.expectedProposal || {})) {
          throw new Error("DISBURSEMENT_TARGET_CREDIT_INVALID");
        }
        assertFrozenOfferLineage(target.institutionProposal, proposed.finalProposal);
        if (offerLineage) {
          await assertOfferCommissionAcceptanceInTransaction(tx, {
            offerId: offerLineage.institutionProductId,
            versionNumber: offerLineage.versionNumber,
            financialInstitutionId: target.financialInstitutionId,
            brokerId: request.brokerId,
            originMasterBrokerId: request.originMasterBrokerId ?? null,
            proposalRecordedAt: target.proposalReceivedAt,
          });
        } else {
          await assertLegacyProposalPredatesPublishedCatalogInTransaction(tx, {
            financialInstitutionId: target.financialInstitutionId,
            proposalRecordedAt: target.proposalReceivedAt,
          });
        }
        const [created] = await tx.insert(credits).values({
          ...proposed,
          id: proposed.id,
          status: "approved",
          brokerId: request.brokerId,
          originMasterBrokerId: request.originMasterBrokerId || null,
          financialInstitutionId: target.financialInstitutionId,
          linkedSubmissionId: request.id,
          clientId: request.clientId,
          institutionProductId: offerLineage?.institutionProductId ?? null,
          versionNumber: offerLineage?.versionNumber ?? null,
        }).returning();
        creditId = created.id;
      } else {
        const [existing] = await tx.select().from(credits)
          .where(eq(credits.id, creditId)).limit(1);
        assertFrozenOfferLineage(target.institutionProposal, existing?.finalProposal);
        if ((existing?.institutionProductId || existing?.versionNumber != null) &&
            (existing?.institutionProductId !== offerLineage?.institutionProductId ||
             existing?.versionNumber !== offerLineage?.versionNumber)) throw new Error("OFFER_VERSION_IDENTITY_MISMATCH");
        if (!existing || existing.brokerId !== request.brokerId ||
            existing.linkedSubmissionId !== request.id ||
            existing.financialInstitutionId !== target.financialInstitutionId ||
            (existing.originMasterBrokerId || null) !== (request.originMasterBrokerId || null)) {
          throw new Error("DISBURSEMENT_TARGET_CREDIT_LINEAGE_MISMATCH");
        }
      }

      const result = await this.confirmCreditDisbursementInTx(tx, {
        creditId,
        expectedProposal: params.expectedProposal,
        expectedAmount: params.expectedAmount,
        confirmedAmount: params.confirmedAmount,
        dispersalIndex: params.dispersalIndex,
        commission: { ...params.commission, creditId },
        performedBy: params.performedBy,
        actorEmail: params.actorEmail,
        notes: params.notes,
        idempotencyKey: params.idempotencyKey,
      });

      const [updatedTarget] = await tx.update(creditSubmissionTargets)
        .set({
          creditId,
          institutionProductId: offerLineage?.institutionProductId ?? null,
          versionNumber: offerLineage?.versionNumber ?? null,
          status: "dispersed",
          dispersedAt: target.dispersedAt || new Date(),
          updatedAt: new Date(),
        })
        .where(eq(creditSubmissionTargets.id, target.id)).returning();
      if (!updatedTarget) throw new Error("DISBURSEMENT_TARGET_UPDATE_FAILED");
      return { ...result, target: updatedTarget };
    });
  }

  /**
   * Record a verified manual payout atomically in PostgreSQL.
   * Row locking serializes two operators on one commission; reference-scoped
   * advisory locks prevent two commissions using the same SPEI reference.
   * Notification sending intentionally belongs OUTSIDE the transaction.
   */
  async recordManualCommissionPayment(params: {
    commissionId: string;
    expected: Commission;
    updates: Partial<Commission>;
    audit: InsertCommissionAuditLog;
  }): Promise<{ commission: Commission; alreadyPaid: boolean }> {
    const reference = String(params.updates.trackingKey || "").trim();
    if (!reference || params.updates.status !== "paid" || params.audit.commissionId !== params.commissionId) {
      throw new Error("MANUAL_PAYOUT_INVALID_INPUT");
    }

    return db.transaction(async (tx) => {
      const [locked] = await tx.select().from(commissions)
        .where(eq(commissions.id, params.commissionId)).for("update");
      if (!locked) throw new Error("MANUAL_PAYOUT_NOT_FOUND");
      if (locked.status === "paid") {
        if (locked.trackingKey !== reference) throw new Error("MANUAL_PAYOUT_ALREADY_PAID_DIFFERENT_REFERENCE");
        return { commission: locked, alreadyPaid: true };
      }
      if (locked.status !== "approved" || !locked.approvedAt || !locked.approvedBy ||
          locked.frozenAmount === null || !Number.isFinite(Number(locked.frozenAmount))) {
        throw new Error("MANUAL_PAYOUT_NOT_APPROVED");
      }
      const reviewedFields: (keyof Commission)[] = [
        "creditId", "brokerId", "masterBrokerId", "amount", "brokerShare",
        "masterBrokerShare", "appShare", "frozenAmount", "approvedBy",
      ];
      if (reviewedFields.some(k => String(locked[k] ?? "") !== String(params.expected[k] ?? "")) ||
          locked.approvedAt.getTime() !== (params.expected.approvedAt?.getTime() ?? -1)) {
        throw new Error("MANUAL_PAYOUT_STALE_REVIEW");
      }

      // Serializes concurrent references even without schema changes/migrations.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${reference}))`);
      const existing = await tx.select({ id: commissions.id }).from(commissions)
        .where(and(eq(commissions.status, "paid"), eq(commissions.trackingKey, reference)))
        .limit(1);
      if (existing.some(row => row.id !== params.commissionId)) {
        throw new Error("MANUAL_PAYOUT_DUPLICATE_BANK_REFERENCE");
      }

      const [updated] = await tx.update(commissions)
        .set({ ...params.updates, status: "paid", updatedAt: new Date() })
        .where(and(eq(commissions.id, params.commissionId), eq(commissions.status, "approved")))
        .returning();
      if (!updated) throw new Error("MANUAL_PAYOUT_CONCURRENT_CHANGE");

      // If audit insertion fails, the paid state rolls back with it.
      await tx.insert(commissionAuditLogs).values({
        ...params.audit,
        commissionId: params.commissionId,
        previousStatus: "approved",
        newStatus: "paid",
      });
      return { commission: updated, alreadyPaid: false };
    });
  }

  async createCommissionAuditLog(logData: InsertCommissionAuditLog): Promise<CommissionAuditLog> {
    try {
      const [created] = await db.insert(commissionAuditLogs).values(logData).returning();
      return created;
    } catch (error) {
      console.error("Error creating commission audit log:", error);
      throw error;
    }
  }

  async getCommissionAuditLogs(commissionId: string): Promise<CommissionAuditLog[]> {
    try {
      return await db
        .select()
        .from(commissionAuditLogs)
        .where(eq(commissionAuditLogs.commissionId, commissionId))
        .orderBy(desc(commissionAuditLogs.createdAt));
    } catch (error) {
      console.error("Error fetching commission audit logs:", error);
      return [];
    }
  }

  // Notification operations
  async getNotifications(userId: string): Promise<Notification[]> {
    try {
      return await db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt));
    } catch (error) {
      console.error("Error fetching notifications:", error);
      return [];
    }
  }

  async createNotification(notification: InsertNotification & { relatedEntityType?: string; relatedEntityId?: string; metadata?: unknown }): Promise<Notification> {
    try {
      const [created] = await db.insert(notifications).values(notification).returning();
      return created;
    } catch (error) {
      console.error("Error creating notification:", error);
      throw error;
    }
  }

  async markNotificationAsRead(id: string, userId: string): Promise<boolean> {
    try {
      // Ownership check is part of the atomic UPDATE to prevent cross-user mutations.
      const result = await db.update(notifications).set({ isRead: true }).where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
      return (result as any).rowCount > 0;
    } catch (error) {
      console.error("Error marking notification as read:", error);
      return false;
    }
  }

  async getUnreadNotificationCount(userId: string): Promise<number> {
    try {
      const [result] = await db.select({ count: sql<number>`count(*)` }).from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
      return result.count || 0;
    } catch (error) {
      console.error("Error getting unread notification count:", error);
      return 0;
    }
  }

  // Document operations
  async getDocuments(filters?: { clientId?: string; creditId?: string; brokerId?: string; tenantId?: string; tenantIds?: string[] }): Promise<Document[]> {
    try {
      const conditions = [];
      if (filters?.tenantIds && filters.tenantIds.length > 0) {
        conditions.push(inArray(documents.tenantId, filters.tenantIds));
      } else if (filters?.tenantId) {
        conditions.push(eq(documents.tenantId, filters.tenantId));
      }
      if (filters?.clientId) {
        conditions.push(eq(documents.clientId, filters.clientId));
      }
      if (filters?.creditId) {
        conditions.push(eq(documents.creditId, filters.creditId));
      }
      if (filters?.brokerId) {
        conditions.push(eq(documents.brokerId, filters.brokerId));
      }

      const query = conditions.length > 0 
        ? db.select().from(documents).where(and(...conditions)).orderBy(desc(documents.uploadedAt))
        : db.select().from(documents).orderBy(desc(documents.uploadedAt));

      return await query;
    } catch (error) {
      console.error("Error getting documents:", error);
      return [];
    }
  }

  async getDocument(id: string): Promise<Document | undefined> {
    try {
      const [document] = await db.select().from(documents).where(eq(documents.id, id));
      return document;
    } catch (error) {
      console.error("Error getting document:", error);
      return undefined;
    }
  }

  async createDocument(document: InsertDocument): Promise<Document> {
    try {
      const [created] = await db.insert(documents).values(document).returning();
      return created;
    } catch (error) {
      console.error("Error creating document:", error);
      throw error;
    }
  }

  async updateDocument(id: string, document: Partial<InsertDocument>): Promise<Document | undefined> {
    try {
      const [updated] = await db.update(documents).set(document).where(eq(documents.id, id)).returning();
      return updated;
    } catch (error) {
      console.error("Error updating document:", error);
      return undefined;
    }
  }

  async deleteDocument(id: string): Promise<boolean> {
    try {
      const result = await db.delete(documents).where(eq(documents.id, id));
      return (result as any).rowCount > 0;
    } catch (error) {
      console.error("Error deleting document:", error);
      return false;
    }
  }

  // Tenant operations
  async getTenants(): Promise<Tenant[]> {
    try {
      return await db.select().from(tenants).orderBy(asc(tenants.createdAt));
    } catch (error) {
      console.error("Error getting tenants:", error);
      return [];
    }
  }

  async getTenant(id: string): Promise<Tenant | undefined> {
    try {
      const [tenant] = await db.select().from(tenants).where(eq(tenants.id, id));
      return tenant;
    } catch (error) {
      console.error("Error getting tenant by id:", error);
      return undefined;
    }
  }

  async getTenantBySlug(slug: string): Promise<Tenant | undefined> {
    try {
      const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, slug));
      return tenant;
    } catch (error) {
      console.error("Error getting tenant by slug:", error);
      return undefined;
    }
  }

  async createTenant(tenantData: InsertTenant): Promise<Tenant> {
    try {
      const existing = await this.getTenantBySlug(tenantData.slug);
      if (existing) {
        throw new Error(`Tenant with slug '${tenantData.slug}' already exists`);
      }

      const id = randomUUID();
      const [created] = await db.insert(tenants).values({
        ...tenantData,
        id,
        parentTenantId: tenantData.parentTenantId ?? null,
        settings: tenantData.settings || {},
        isActive: tenantData.isActive ?? true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();
      return created;
    } catch (error) {
      console.error("Error creating tenant:", error);
      throw error;
    }
  }

  async updateTenant(id: string, tenantData: Partial<InsertTenant>): Promise<Tenant | undefined> {
    try {
      if (tenantData.slug) {
        const existingWithSlug = await this.getTenantBySlug(tenantData.slug);
        if (existingWithSlug && existingWithSlug.id !== id) {
          throw new Error(`Tenant with slug '${tenantData.slug}' already exists`);
        }
      }

      const [updated] = await db.update(tenants)
        .set({
          ...tenantData,
          updatedAt: new Date(),
        })
        .where(eq(tenants.id, id))
        .returning();
      return updated;
    } catch (error) {
      console.error("Error updating tenant:", error);
      return undefined;
    }
  }

  async deleteTenant(id: string): Promise<boolean> {
    try {
      await db.delete(tenantMembers).where(eq(tenantMembers.tenantId, id));
      const result = await db.delete(tenants).where(eq(tenants.id, id)).returning();
      return result.length > 0;
    } catch (error) {
      console.error("Error deleting tenant:", error);
      return false;
    }
  }

  async getTenantsByParent(parentTenantId: string): Promise<Tenant[]> {
    try {
      return await db.select().from(tenants)
        .where(eq(tenants.parentTenantId, parentTenantId))
        .orderBy(asc(tenants.createdAt));
    } catch (error) {
      console.error("Error getting tenants by parent:", error);
      return [];
    }
  }

  // Tenant member operations
  async getTenantMembers(tenantId?: string): Promise<TenantMember[]> {
    try {
      const query = tenantId
        ? db.select().from(tenantMembers).where(eq(tenantMembers.tenantId, tenantId)).orderBy(asc(tenantMembers.joinedAt))
        : db.select().from(tenantMembers).orderBy(asc(tenantMembers.joinedAt));
      return await query;
    } catch (error) {
      console.error("Error getting tenant members:", error);
      return [];
    }
  }

  async getTenantMember(id: string): Promise<TenantMember | undefined> {
    try {
      const [member] = await db.select().from(tenantMembers).where(eq(tenantMembers.id, id));
      return member;
    } catch (error) {
      console.error("Error getting tenant member:", error);
      return undefined;
    }
  }

  async createTenantMember(memberData: InsertTenantMember): Promise<TenantMember> {
    try {
      // 1. Verify tenant exists
      const tenant = await this.getTenant(memberData.tenantId);
      if (!tenant) {
        throw new Error(`Tenant '${memberData.tenantId}' does not exist`);
      }

      // 2. Verify user exists
      const user = await this.getUser(memberData.userId);
      if (!user) {
        throw new Error(`User '${memberData.userId}' does not exist`);
      }

      // 3. Prevent duplicate membership
      const existingMembership = await this.getUserTenantMembership(memberData.userId, memberData.tenantId);
      if (existingMembership) {
        throw new Error(`User '${memberData.userId}' is already a member of tenant '${memberData.tenantId}'`);
      }

      const id = randomUUID();
      const [created] = await db.insert(tenantMembers).values({
        ...memberData,
        id,
        isActive: memberData.isActive ?? true,
        joinedAt: new Date(),
        updatedAt: new Date(),
      }).returning();
      return created;
    } catch (error) {
      console.error("Error creating tenant member:", error);
      throw error;
    }
  }

  async updateTenantMember(id: string, memberData: Partial<InsertTenantMember>): Promise<TenantMember | undefined> {
    try {
      const [updated] = await db.update(tenantMembers)
        .set({
          ...memberData,
          updatedAt: new Date(),
        })
        .where(eq(tenantMembers.id, id))
        .returning();
      return updated;
    } catch (error) {
      console.error("Error updating tenant member:", error);
      return undefined;
    }
  }

  async deleteTenantMember(id: string): Promise<boolean> {
    try {
      const result = await db.delete(tenantMembers).where(eq(tenantMembers.id, id)).returning();
      return result.length > 0;
    } catch (error) {
      console.error("Error deleting tenant member:", error);
      return false;
    }
  }

  async getTenantMembersByUser(userId: string): Promise<TenantMember[]> {
    try {
      return await db.select().from(tenantMembers)
        .where(eq(tenantMembers.userId, userId))
        .orderBy(asc(tenantMembers.joinedAt));
    } catch (error) {
      console.error("Error getting tenant members by user:", error);
      return [];
    }
  }

  async getUserTenantMembership(userId: string, tenantId: string): Promise<TenantMember | undefined> {
    try {
      const [membership] = await db.select().from(tenantMembers)
        .where(and(eq(tenantMembers.userId, userId), eq(tenantMembers.tenantId, tenantId)));
      return membership;
    } catch (error) {
      console.error("Error getting user tenant membership:", error);
      return undefined;
    }
  }

  async getTenantMembersWithUsers(tenantId: string): Promise<TenantMemberWithUser[]> {
    try {
      const rows = await db
        .select({
          id: tenantMembers.id,
          tenantId: tenantMembers.tenantId,
          userId: tenantMembers.userId,
          role: tenantMembers.role,
          isActive: tenantMembers.isActive,
          joinedAt: tenantMembers.joinedAt,
          updatedAt: tenantMembers.updatedAt,
          user: {
            id: users.id,
            email: users.email,
            firstName: users.firstName,
            lastName: users.lastName,
            role: users.role,
            customRoleTitle: users.customRoleTitle,
            permissions: users.permissions,
            isActive: users.isActive,
            profileImageUrl: users.profileImageUrl,
            updatedAt: users.updatedAt,
          },
        })
        .from(tenantMembers)
        .innerJoin(users, eq(tenantMembers.userId, users.id))
        .where(eq(tenantMembers.tenantId, tenantId))
        .orderBy(asc(tenantMembers.joinedAt));

      return rows as TenantMemberWithUser[];
    } catch (error) {
      console.error("Error getting tenant members with users:", error);
      return [];
    }
  }

  async getTenantMemberWithUser(tenantId: string, memberId: string): Promise<TenantMemberWithUser | undefined> {
    try {
      const [row] = await db
        .select({
          id: tenantMembers.id,
          tenantId: tenantMembers.tenantId,
          userId: tenantMembers.userId,
          role: tenantMembers.role,
          isActive: tenantMembers.isActive,
          joinedAt: tenantMembers.joinedAt,
          updatedAt: tenantMembers.updatedAt,
          user: {
            id: users.id,
            email: users.email,
            firstName: users.firstName,
            lastName: users.lastName,
            role: users.role,
            customRoleTitle: users.customRoleTitle,
            permissions: users.permissions,
            isActive: users.isActive,
            profileImageUrl: users.profileImageUrl,
            updatedAt: users.updatedAt,
          },
        })
        .from(tenantMembers)
        .innerJoin(users, eq(tenantMembers.userId, users.id))
        .where(and(eq(tenantMembers.id, memberId), eq(tenantMembers.tenantId, tenantId)));

      return row as TenantMemberWithUser | undefined;
    } catch (error) {
      console.error("Error getting tenant member with user:", error);
      return undefined;
    }
  }

  async countActiveOwners(tenantId: string): Promise<number> {
    try {
      const [result] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(tenantMembers)
        .where(
          and(
            eq(tenantMembers.tenantId, tenantId),
            eq(tenantMembers.role, "owner"),
            eq(tenantMembers.isActive, true)
          )
        );
      return result?.count || 0;
    } catch (error) {
      console.error("Error counting active owners:", error);
      return 0;
    }
  }

  async createTenantMemberWithUser(params: {
    tenantId: string;
    email: string;
    firstName: string;
    lastName: string;
    internalRole: TenantMemberRole;
    userRole: string;
    customRoleTitle?: string | null;
    permissions?: unknown;
    password?: string | null;
    authMethod?: string;
    resetToken?: string | null;
    resetTokenExpiry?: Date | null;
  }): Promise<{ user: User; member: TenantMember }> {
    return await db.transaction(async (tx) => {
      // 1. Verify tenant exists
      const [tenant] = await tx.select().from(tenants).where(eq(tenants.id, params.tenantId));
      if (!tenant) {
        throw new Error(`Tenant '${params.tenantId}' does not exist`);
      }

      // 2. Check if user already exists
      const [existingUser] = await tx.select().from(users).where(eq(users.email, params.email));
      let user: User;

      if (existingUser) {
        const [existingMembership] = await tx
          .select()
          .from(tenantMembers)
          .where(and(eq(tenantMembers.userId, existingUser.id), eq(tenantMembers.tenantId, params.tenantId)));
        if (existingMembership) {
          throw new Error(`El usuario con email '${params.email}' ya es miembro de esta organización`);
        }
        user = existingUser;
      } else {
        const userId = randomUUID();
        const [createdUser] = await tx
          .insert(users)
          .values({
            id: userId,
            email: params.email,
            firstName: params.firstName,
            lastName: params.lastName,
            role: params.userRole,
            customRoleTitle: params.customRoleTitle || null,
            permissions: params.permissions || {},
            password: params.password || null,
            authMethod: params.authMethod || "local",
            resetToken: params.resetToken || null,
            resetTokenExpiry: params.resetTokenExpiry || null,
            masterBrokerId: null,
            isActive: true,
          })
          .returning();
        user = createdUser;
      }

      // 3. Create membership
      const memberId = randomUUID();
      const [createdMember] = await tx
        .insert(tenantMembers)
        .values({
          id: memberId,
          tenantId: params.tenantId,
          userId: user.id,
          role: params.internalRole,
          isActive: true,
          joinedAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      return { user, member: createdMember };
    });
  }

  async deactivateTenantMember(tenantId: string, memberId: string): Promise<{ member: TenantMember; userDeactivatedGlobally: boolean }> {
    return await db.transaction(async (tx) => {
      const [member] = await tx
        .select()
        .from(tenantMembers)
        .where(and(eq(tenantMembers.id, memberId), eq(tenantMembers.tenantId, tenantId)));

      if (!member) {
        throw new Error("Membresía no encontrada");
      }

      if (member.role === "owner" && member.isActive) {
        const [activeOwners] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(tenantMembers)
          .where(
            and(
              eq(tenantMembers.tenantId, tenantId),
              eq(tenantMembers.role, "owner"),
              eq(tenantMembers.isActive, true)
            )
          );

        if ((activeOwners?.count || 0) <= 1) {
          throw new Error("No se puede desactivar al último propietario activo de la organización");
        }
      }

      const [updatedMember] = await tx
        .update(tenantMembers)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(tenantMembers.id, memberId))
        .returning();

      // Membresía en tenant no debe alterar automáticamente el estado global del usuario
      return { member: updatedMember, userDeactivatedGlobally: false };
    });
  }

  async activateTenantMember(tenantId: string, memberId: string): Promise<{ member: TenantMember }> {
    return await db.transaction(async (tx) => {
      const [member] = await tx
        .select()
        .from(tenantMembers)
        .where(and(eq(tenantMembers.id, memberId), eq(tenantMembers.tenantId, tenantId)));

      if (!member) {
        throw new Error("Membresía no encontrada");
      }

      const [updatedMember] = await tx
        .update(tenantMembers)
        .set({ isActive: true, updatedAt: new Date() })
        .where(eq(tenantMembers.id, memberId))
        .returning();

      // Membresía en tenant no debe alterar automáticamente el estado global del usuario
      return { member: updatedMember };
    });
  }

  // Legacy product operations
  async getProducts(institutionId?: string): Promise<Product[]> { return []; }
  async getProduct(id: string): Promise<Product | undefined> { return undefined; }
  async createProduct(product: InsertProduct): Promise<Product> { throw new Error("Not implemented"); }
  async updateProduct(id: string, product: Partial<InsertProduct>): Promise<Product | undefined> { return undefined; }
  async deleteProduct(id: string): Promise<boolean> { return false; }

  // Product request operations
  async getProductRequests(filters?: { status?: string; requestedBy?: string }): Promise<ProductRequest[]> { return []; }
  async getProductRequest(id: string): Promise<ProductRequest | undefined> { return undefined; }
  async createProductRequest(request: InsertProductRequest): Promise<ProductRequest> { throw new Error("Not implemented"); }
  async updateProductRequest(id: string, request: Partial<InsertProductRequest>): Promise<ProductRequest | undefined> { return undefined; }
  async deleteProductRequest(id: string): Promise<boolean> { return false; }

  // Financial Institution Request operations
  async getFinancialInstitutionRequests(filters?: { status?: string; brokerId?: string }): Promise<FinancialInstitutionRequest[]> {
    try {
      const conditions = [];
      if (filters?.status) {
        conditions.push(eq(financialInstitutionRequests.status, filters.status));
      }
      if (filters?.brokerId) {
        conditions.push(eq(financialInstitutionRequests.brokerId, filters.brokerId));
      }

      const rows = conditions.length > 0
        ? await db.select().from(financialInstitutionRequests).where(and(...conditions)).orderBy(desc(financialInstitutionRequests.createdAt))
        : await db.select().from(financialInstitutionRequests).orderBy(desc(financialInstitutionRequests.createdAt));

      return rows;
    } catch (error) {
      console.error("Error fetching financial institution requests:", error);
      return [];
    }
  }

  async getFinancialInstitutionRequest(id: string): Promise<FinancialInstitutionRequest | undefined> {
    try {
      const [request] = await db.select().from(financialInstitutionRequests).where(eq(financialInstitutionRequests.id, id));
      return request;
    } catch (error) {
      console.error("Error fetching financial institution request:", error);
      return undefined;
    }
  }

  async createFinancialInstitutionRequest(request: InsertFinancialInstitutionRequest): Promise<FinancialInstitutionRequest> {
    const [created] = await db
      .insert(financialInstitutionRequests)
      .values({
        ...request,
        contactName: request.contactName ?? null,
        contactEmail: request.contactEmail ?? null,
        contactPhone: request.contactPhone ?? null,
        status: "pending",
        updatedAt: new Date(),
      })
      .returning();

    return created;
  }

  async updateFinancialInstitutionRequest(id: string, request: Partial<FinancialInstitutionRequest>): Promise<FinancialInstitutionRequest | undefined> {
    try {
      const shouldSetReviewedAt = request.status && request.status !== "pending";
      const payload: Partial<FinancialInstitutionRequest> = {
        ...request,
        updatedAt: new Date(),
      };

      if (shouldSetReviewedAt && !request.reviewedAt) {
        payload.reviewedAt = new Date();
      }

      const [updated] = await db
        .update(financialInstitutionRequests)
        .set(payload)
        .where(eq(financialInstitutionRequests.id, id))
        .returning();

      return updated;
    } catch (error) {
      console.error("Error updating financial institution request:", error);
      return undefined;
    }
  }

  // Credit Submission Requests operations
  async getCreditSubmissionRequests(filters?: { status?: string; brokerId?: string; brokerIds?: string[]; clientId?: string; tenantId?: string; tenantIds?: string[] }): Promise<CreditSubmissionRequest[]> {
    try {
      const conditions = [];
      if (filters?.tenantIds && filters.tenantIds.length > 0) {
        conditions.push(inArray(creditSubmissionRequests.tenantId, filters.tenantIds));
      } else if (filters?.tenantId) {
        conditions.push(eq(creditSubmissionRequests.tenantId, filters.tenantId));
      }
      if (filters?.status) {
        conditions.push(eq(creditSubmissionRequests.status, filters.status));
      }
      if (filters?.brokerIds && filters.brokerIds.length > 0) {
        conditions.push(inArray(creditSubmissionRequests.brokerId, filters.brokerIds));
      } else if (filters?.brokerId) {
        conditions.push(eq(creditSubmissionRequests.brokerId, filters.brokerId));
      }
      if (filters?.clientId) {
        conditions.push(eq(creditSubmissionRequests.clientId, filters.clientId));
      }
      
      // Query 1: Get submissions
      let submissions;
      if (conditions.length > 0) {
        submissions = await db.select().from(creditSubmissionRequests)
          .where(and(...conditions))
          .orderBy(desc(creditSubmissionRequests.createdAt));
      } else {
        submissions = await db.select().from(creditSubmissionRequests)
          .orderBy(desc(creditSubmissionRequests.createdAt));
      }
      
      if (submissions.length === 0) {
        return [];
      }
      
      // Query 2: Get all targets for these submissions in one query
      const submissionIds = submissions.map(s => s.id);
      const allTargets = await db.select().from(creditSubmissionTargets)
        .where(inArray(creditSubmissionTargets.requestId, submissionIds));
      
      // Group targets by requestId
      const targetsByRequestId = new Map<string, CreditSubmissionTarget[]>();
      allTargets.forEach(target => {
        if (!targetsByRequestId.has(target.requestId)) {
          targetsByRequestId.set(target.requestId, []);
        }
        targetsByRequestId.get(target.requestId)!.push(target);
      });
      
      // Query 3: Get all product templates for these submissions in one query
      const templateIds = submissions
        .map(s => s.productTemplateId)
        .filter((id): id is string => id !== null);
      
      let templateMap = new Map<string, ProductTemplate>();
      if (templateIds.length > 0) {
        const templates = await db.select().from(productTemplates)
          .where(inArray(productTemplates.id, templateIds));
        templates.forEach(template => {
          templateMap.set(template.id, template);
        });
      }
      
      // Combine everything
      const submissionsWithTargets = submissions.map(submission => ({
        ...submission,
        targets: targetsByRequestId.get(submission.id) || [],
        productTemplate: submission.productTemplateId 
          ? templateMap.get(submission.productTemplateId) || null
          : null
      }));
      
      return submissionsWithTargets as any;
    } catch (error) {
      console.error("Error fetching credit submission requests:", error);
      return [];
    }
  }

  async getCreditSubmissionRequest(id: string): Promise<CreditSubmissionRequest | undefined> {
    try {
      const result = await db.select().from(creditSubmissionRequests)
        .where(eq(creditSubmissionRequests.id, id))
        .limit(1);
      return result[0];
    } catch (error) {
      console.error("Error fetching credit submission request:", error);
      return undefined;
    }
  }

  async createCreditSubmissionRequest(requestData: InsertCreditSubmissionRequest): Promise<CreditSubmissionRequest> {
    try {
      const explicitOfferId = (requestData as any).institutionProductId || (requestData as any).offerId;
      if (explicitOfferId) {
        const product = await this.getInstitutionProduct(explicitOfferId);
        if (!product) {
          throw new Error("La oferta especificada no existe.");
        }
        const versions = await this.getInstitutionProductVersions(explicitOfferId);
        if (!isOfferEligibleForRequests(product, versions)) {
          throw new Error("La oferta seleccionada se encuentra en borrador o no cuenta con una versión publicada vigente.");
        }
      }

      const brokerAtOrigination = await this.getUser(requestData.brokerId);
      let originMasterBrokerId: string | null = null;
      if (brokerAtOrigination?.role === "master_broker") {
        originMasterBrokerId = brokerAtOrigination.id;
      } else if (brokerAtOrigination?.role === "broker" && brokerAtOrigination.masterBrokerId) {
        const parentAtOrigination = await this.getUser(brokerAtOrigination.masterBrokerId);
        originMasterBrokerId =
          parentAtOrigination?.role === "master_broker" ? parentAtOrigination.id : null;
      }

      const result = await db.insert(creditSubmissionRequests)
        .values({ ...requestData, originMasterBrokerId })
        .returning();
      return result[0];
    } catch (error) {
      console.error("Error creating credit submission request:", error);
      throw error;
    }
  }

  async updateCreditSubmissionRequest(id: string, requestData: Partial<InsertCreditSubmissionRequest>): Promise<CreditSubmissionRequest | undefined> {
    try {
      const { originMasterBrokerId: _immutableOrigin, ...safeRequestData } = requestData as any;
      const result = await db.update(creditSubmissionRequests)
        .set({ ...safeRequestData, updatedAt: new Date() })
        .where(eq(creditSubmissionRequests.id, id))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Error updating credit submission request:", error);
      return undefined;
    }
  }

  // Credit Submission Targets operations
  async getCreditSubmissionTargets(filters?: { requestId?: string; status?: string; financialInstitutionId?: string }): Promise<CreditSubmissionTarget[]> {
    try {
      const conditions = [];
      if (filters?.requestId) {
        conditions.push(eq(creditSubmissionTargets.requestId, filters.requestId));
      }
      if (filters?.status) {
        conditions.push(eq(creditSubmissionTargets.status, filters.status));
      }
      if (filters?.financialInstitutionId) {
        conditions.push(eq(creditSubmissionTargets.financialInstitutionId, filters.financialInstitutionId));
      }
      
      if (conditions.length > 0) {
        return await db.select().from(creditSubmissionTargets)
          .where(and(...conditions))
          .orderBy(desc(creditSubmissionTargets.createdAt));
      } else {
        return await db.select().from(creditSubmissionTargets)
          .orderBy(desc(creditSubmissionTargets.createdAt));
      }
    } catch (error) {
      console.error("Error fetching credit submission targets:", error);
      return [];
    }
  }

  async getCreditSubmissionTarget(id: string): Promise<CreditSubmissionTarget | undefined> {
    try {
      const result = await db.select().from(creditSubmissionTargets)
        .where(eq(creditSubmissionTargets.id, id))
        .limit(1);
      return result[0];
    } catch (error) {
      console.error("Error fetching credit submission target:", error);
      return undefined;
    }
  }

  async getCreditSubmissionTargetByCreditId(creditId: string): Promise<CreditSubmissionTarget | undefined> {
    try {
      const result = await db.select().from(creditSubmissionTargets)
        .where(eq(creditSubmissionTargets.creditId, creditId))
        .limit(1);
      return result[0];
    } catch (error) {
      console.error("Error fetching credit submission target by credit ID:", error);
      return undefined;
    }
  }

  async getCreditSubmissionTargetsByRequest(requestId: string): Promise<CreditSubmissionTarget[]> {
    try {
      return await db.select().from(creditSubmissionTargets)
        .where(eq(creditSubmissionTargets.requestId, requestId))
        .orderBy(asc(creditSubmissionTargets.createdAt));
    } catch (error) {
      console.error("Error fetching credit submission targets by request:", error);
      return [];
    }
  }

  async createCreditSubmissionTarget(targetData: InsertCreditSubmissionTarget): Promise<CreditSubmissionTarget> {
    try {
      const frozen = readFrozenOfferLineage(targetData.institutionProposal);
      const supplied = targetData.institutionProductId || targetData.versionNumber != null
        ? readFrozenOfferLineage({ institutionProductId: targetData.institutionProductId,
            versionNumber: targetData.versionNumber }) : null;
      if (supplied && (!frozen || supplied.institutionProductId !== frozen.institutionProductId ||
          supplied.versionNumber !== frozen.versionNumber)) throw new Error("OFFER_VERSION_IDENTITY_MISMATCH");
      const result = await db.insert(creditSubmissionTargets)
        .values({ ...targetData, institutionProductId: frozen?.institutionProductId ?? null,
          versionNumber: frozen?.versionNumber ?? null })
        .returning();
      return result[0];
    } catch (error) {
      console.error("Error creating credit submission target:", error);
      throw error;
    }
  }

  async updateCreditSubmissionTarget(id: string, targetData: Partial<InsertCreditSubmissionTarget>): Promise<CreditSubmissionTarget | undefined> {
    // This path can compete with selectWinningTargetAtomic. Both lock the same
    // target row so a late financial proposal cannot replace a frozen winner.
    const isReviewTransition = targetData.institutionProposal !== undefined ||
      ["institution_approved", "institution_rejected", "approved", "rejected",
       "returned_to_broker", "sent"].includes(targetData.status || "");
    if (isReviewTransition) {
      return db.transaction(async tx => {
        const [locked] = await tx.select().from(creditSubmissionTargets)
          .where(eq(creditSubmissionTargets.id, id)).for("update");
        if (!locked) return undefined;
        assertTargetReviewMutable(locked);
        const frozen = readFrozenOfferLineage(targetData.institutionProposal !== undefined
          ? targetData.institutionProposal : locked.institutionProposal);
        const persisted = locked.institutionProductId || locked.versionNumber != null
          ? readFrozenOfferLineage({ institutionProductId: locked.institutionProductId,
              versionNumber: locked.versionNumber }) : null;
        if (persisted && (!frozen || persisted.institutionProductId !== frozen.institutionProductId ||
            persisted.versionNumber !== frozen.versionNumber)) {
          throw new Error("OFFER_VERSION_IDENTITY_MISMATCH");
        }
        if (targetData.institutionProposal !== undefined) {
          const oldIdentity = readFrozenOfferLineage(locked.institutionProposal);
          if (oldIdentity) {
            assertFrozenOfferLineage(locked.institutionProposal, targetData.institutionProposal);
          } else {
            // A newly identified proposal is allowed before winning, but never
            // silently replace previously bound offer/version identifiers.
            readFrozenOfferLineage(targetData.institutionProposal);
          }
        }
        const [updated] = await tx.update(creditSubmissionTargets)
          .set({ ...targetData, institutionProductId: frozen?.institutionProductId ?? null,
            versionNumber: frozen?.versionNumber ?? null, updatedAt: new Date() })
          .where(eq(creditSubmissionTargets.id, id)).returning();
        return updated;
      });
    }
    try {
      const result = await db.update(creditSubmissionTargets)
        .set({ ...targetData, updatedAt: new Date() })
        .where(eq(creditSubmissionTargets.id, id))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Error updating credit submission target:", error);
      return undefined;
    }
  }

  async approveCreditSubmissionTarget(targetId: string, adminId: string, adminNotes?: string, details?: string): Promise<CreditSubmissionTarget | undefined> {
    // Same target-row lock as selectWinningTargetAtomic: an administrator cannot
    // approve a selected winner even when both actions race across processes.
    return db.transaction(async tx => {
      const [locked] = await tx.select().from(creditSubmissionTargets)
        .where(eq(creditSubmissionTargets.id, targetId)).for("update");
      if (!locked) return undefined;
      assertTargetReviewMutable(locked);
      const [updated] = await tx.update(creditSubmissionTargets).set({
        status: "approved", adminNotes: adminNotes || "", details: details || "",
        reviewedBy: adminId, reviewedAt: new Date(), updatedAt: new Date(),
      }).where(eq(creditSubmissionTargets.id, targetId)).returning();
      const pending = await tx.select({ id: creditSubmissionTargets.id })
        .from(creditSubmissionTargets)
        .where(and(eq(creditSubmissionTargets.requestId, locked.requestId),
          eq(creditSubmissionTargets.status, "pending_admin"))).limit(1);
      const [otherWinner] = await tx.select({ id: creditSubmissionTargets.id })
              .from(creditSubmissionTargets)
              .where(and(
                eq(creditSubmissionTargets.requestId, locked.requestId),
                ne(creditSubmissionTargets.id, locked.id),
                or(
                  eq(creditSubmissionTargets.isWinner, true),
                  isNotNull(creditSubmissionTargets.creditId),
                  inArray(creditSubmissionTargets.status, ["selected_winner", "dispersed"])
                )
              )).limit(1);
      if (pending.length === 0 && !otherWinner) {
        // Do not regress an active/partially funded request during sibling review.
        await tx.update(creditSubmissionRequests).set({
          status: "sent_to_institutions", updatedAt: new Date(),
        }).where(and(
          eq(creditSubmissionRequests.id, locked.requestId),
          inArray(creditSubmissionRequests.status,
            ["pending_admin", "approved", "returned_to_broker"])
        ));
      }
      return updated;
    });
  }

  async rejectCreditSubmissionTarget(targetId: string, adminId: string, adminNotes?: string): Promise<CreditSubmissionTarget | undefined> {
    return db.transaction(async tx => {
      const [locked] = await tx.select().from(creditSubmissionTargets)
        .where(eq(creditSubmissionTargets.id, targetId)).for("update");
      if (!locked) return undefined;
      assertTargetReviewMutable(locked);
      const [updated] = await tx.update(creditSubmissionTargets).set({
        status: "rejected", adminNotes: adminNotes || "",
        reviewedBy: adminId, reviewedAt: new Date(), updatedAt: new Date(),
      }).where(eq(creditSubmissionTargets.id, targetId)).returning();
      return updated;
    });
  }

  async returnCreditSubmissionTargetToBroker(targetId: string, adminId: string, details?: string, adminNotes?: string): Promise<CreditSubmissionTarget | undefined> {
    return db.transaction(async tx => {
      const [locked] = await tx.select().from(creditSubmissionTargets)
        .where(eq(creditSubmissionTargets.id, targetId)).for("update");
      if (!locked) return undefined;
      assertTargetReviewMutable(locked);
      const [updated] = await tx.update(creditSubmissionTargets).set({
        status: "returned_to_broker", adminNotes: adminNotes || "",
        details: details || "", reviewedBy: adminId,
        reviewedAt: new Date(), updatedAt: new Date(),
      }).where(eq(creditSubmissionTargets.id, targetId)).returning();
      const [otherWinner] = await tx.select({ id: creditSubmissionTargets.id })
        .from(creditSubmissionTargets)
        .where(and(
          eq(creditSubmissionTargets.requestId, locked.requestId),
          ne(creditSubmissionTargets.id, locked.id),
          or(
            eq(creditSubmissionTargets.isWinner, true),
            isNotNull(creditSubmissionTargets.creditId),
            inArray(creditSubmissionTargets.status, ["selected_winner", "dispersed"])
          )
        )).limit(1);
      if (!otherWinner) {
        await tx.update(creditSubmissionRequests).set({
          status: "returned_to_broker", updatedAt: new Date(),
        }).where(and(
          eq(creditSubmissionRequests.id, locked.requestId),
          inArray(creditSubmissionRequests.status,
            ["pending_admin", "approved", "sent_to_institutions", "returned_to_broker"])
        ));
      }
      return updated;
    });
  }

  // Bloque 11: Real PostgreSQL Transaction for Mortgage Lead Creation
  // Executes BEGIN -> (Insert Client if Camino A) -> Insert CreditSubmissionRequest -> (Insert Targets if any) -> COMMIT
  // On error: automatic ROLLBACK by PostgreSQL via db.transaction
  async createMortgageLeadTransactional(params: {
    clientData?: InsertClient;
    clientId?: string;
    submissionData: Omit<InsertCreditSubmissionRequest, 'clientId'>;
    financialInstitutionIds?: string[];
  }): Promise<{
    client: Client;
    submission: CreditSubmissionRequest;
    targets: CreditSubmissionTarget[];
  }> {
    return await db.transaction(async (tx) => {
      let client: Client;

      if (params.clientData) {
        // Camino A: insert new client within transaction
        const [createdClient] = await tx
          .insert(clients)
          .values({
            ...params.clientData,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning();
        client = createdClient;
      } else if (params.clientId) {
        // Camino B: select existing client within transaction
        const [existingClient] = await tx
          .select()
          .from(clients)
          .where(eq(clients.id, params.clientId));
        if (!existingClient) {
          throw new Error("Cliente no encontrado");
        }
        client = existingClient;
      } else {
        throw new Error("Se requiere clientData (Camino A) o clientId (Camino B)");
      }

      // Derive immutable master broker at submission origination
      const [brokerAtOrigination] = await tx
        .select()
        .from(users)
        .where(eq(users.id, params.submissionData.brokerId))
        .limit(1);

      let originMasterBrokerId: string | null = null;
      if (brokerAtOrigination?.role === "master_broker") {
        originMasterBrokerId = brokerAtOrigination.id;
      } else if (brokerAtOrigination?.role === "broker" && brokerAtOrigination.masterBrokerId) {
        const [parentAtOrigination] = await tx
          .select()
          .from(users)
          .where(eq(users.id, brokerAtOrigination.masterBrokerId))
          .limit(1);
        originMasterBrokerId =
          parentAtOrigination?.role === "master_broker" ? parentAtOrigination.id : null;
      }

      // Insert credit submission request within transaction
      const [submission] = await tx
        .insert(creditSubmissionRequests)
        .values({
          ...params.submissionData,
          clientId: client.id,
          originMasterBrokerId,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      // Insert targets within transaction if provided
      const targets: CreditSubmissionTarget[] = [];
      if (Array.isArray(params.financialInstitutionIds) && params.financialInstitutionIds.length > 0) {
        for (const institutionId of params.financialInstitutionIds) {
          const [target] = await tx
            .insert(creditSubmissionTargets)
            .values({
              requestId: submission.id,
              financialInstitutionId: institutionId,
              status: 'pending_admin',
              createdAt: new Date(),
              updatedAt: new Date(),
            })
            .returning();
          targets.push(target);
        }
      }

      return { client, submission, targets };
    });
  }

  // Promo codes & redemptions operations (Bloque 10)
  async getPromoCodes(filters?: { isActive?: boolean; targetScope?: string }): Promise<PromoCode[]> {
    try {
      const conditions = [];
      if (filters?.isActive !== undefined) {
        conditions.push(eq(promoCodes.isActive, filters.isActive));
      }
      if (filters?.targetScope) {
        conditions.push(eq(promoCodes.targetScope, filters.targetScope));
      }

      if (conditions.length > 0) {
        return await db.select().from(promoCodes).where(and(...conditions)).orderBy(desc(promoCodes.createdAt));
      }
      return await db.select().from(promoCodes).orderBy(desc(promoCodes.createdAt));
    } catch (error) {
      console.error("Error getting promo codes:", error);
      return [];
    }
  }

  async getPromoCode(id: string): Promise<PromoCode | undefined> {
    try {
      const result = await db.select().from(promoCodes).where(eq(promoCodes.id, id)).limit(1);
      return result[0];
    } catch (error) {
      console.error("Error getting promo code by id:", error);
      return undefined;
    }
  }

  async getPromoCodeByCode(code: string): Promise<PromoCode | undefined> {
    try {
      const normalized = code.trim().toUpperCase();
      const result = await db.select().from(promoCodes).where(eq(promoCodes.code, normalized)).limit(1);
      return result[0];
    } catch (error) {
      console.error("Error getting promo code by code:", error);
      return undefined;
    }
  }

  async createPromoCode(data: InsertPromoCode & { createdBy?: string }): Promise<PromoCode> {
    const id = randomUUID();
    const normalizedCode = data.code.trim().toUpperCase();
    const newPromo = {
      id,
      code: normalizedCode,
      name: data.name,
      description: data.description || null,
      benefitType: data.benefitType,
      benefitValue: data.benefitValue !== undefined && data.benefitValue !== null ? String(data.benefitValue) : "0",
      durationMonths: data.durationMonths ?? null,
      maxUses: data.maxUses ?? null,
      currentUses: 0,
      targetScope: data.targetScope || "all",
      startsAt: data.startsAt ? new Date(data.startsAt) : new Date(),
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
      isActive: data.isActive !== undefined ? data.isActive : true,
      targetEntityId: data.targetEntityId || null,
      createdBy: data.createdBy || null,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    const result = await db.insert(promoCodes).values(newPromo).returning();
    return result[0];
  }

  async updatePromoCode(id: string, data: Partial<InsertPromoCode> & { currentUses?: number; isActive?: boolean }): Promise<PromoCode | undefined> {
    try {
      const updateData: any = {
        ...data,
        updatedAt: new Date()
      };
      if (data.code) {
        updateData.code = data.code.trim().toUpperCase();
      }
      if (data.benefitValue !== undefined) {
        updateData.benefitValue = String(data.benefitValue);
      }
      if (data.startsAt) {
        updateData.startsAt = new Date(data.startsAt);
      }
      if (data.expiresAt !== undefined) {
        updateData.expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;
      }
      const result = await db.update(promoCodes).set(updateData).where(eq(promoCodes.id, id)).returning();
      return result[0];
    } catch (error) {
      console.error("Error updating promo code:", error);
      return undefined;
    }
  }

  async getPromoRedemptions(filters?: { promoCodeId?: string; userId?: string; tenantId?: string }): Promise<PromoRedemption[]> {
    try {
      const conditions = [];
      if (filters?.promoCodeId) {
        conditions.push(eq(promoRedemptions.promoCodeId, filters.promoCodeId));
      }
      if (filters?.userId) {
        conditions.push(eq(promoRedemptions.userId, filters.userId));
      }
      if (filters?.tenantId) {
        conditions.push(eq(promoRedemptions.tenantId, filters.tenantId));
      }

      if (conditions.length > 0) {
        return await db.select().from(promoRedemptions).where(and(...conditions)).orderBy(desc(promoRedemptions.appliedAt));
      }
      return await db.select().from(promoRedemptions).orderBy(desc(promoRedemptions.appliedAt));
    } catch (error) {
      console.error("Error getting promo redemptions:", error);
      return [];
    }
  }

  async getPromoRedemption(id: string): Promise<PromoRedemption | undefined> {
    try {
      const result = await db.select().from(promoRedemptions).where(eq(promoRedemptions.id, id)).limit(1);
      return result[0];
    } catch (error) {
      console.error("Error getting promo redemption:", error);
      return undefined;
    }
  }

  async createPromoRedemption(data: InsertPromoRedemption): Promise<PromoRedemption> {
    const id = (data as any).id || randomUUID();
    const newRedemption = {
      id,
      promoCodeId: data.promoCodeId,
      userId: data.userId,
      tenantId: data.tenantId || null,
      appliedAt: new Date(),
      startsAt: data.startsAt ? new Date(data.startsAt) : new Date(),
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
      status: data.status || "active",
      metadata: data.metadata || {},
      createdAt: new Date()
    };
    const result = await db.insert(promoRedemptions).values(newRedemption).returning();
    
    // Increment promo currentUses
    await db.update(promoCodes)
      .set({
        currentUses: sql`${promoCodes.currentUses} + 1`,
        updatedAt: new Date()
      })
      .where(eq(promoCodes.id, data.promoCodeId));

    return result[0];
  }

  async getUserActiveRedemption(userId: string): Promise<{ redemption: PromoRedemption; promoCode: PromoCode } | undefined> {
    try {
      const redemptions = await db.select().from(promoRedemptions)
        .where(and(eq(promoRedemptions.userId, userId), eq(promoRedemptions.status, "active")))
        .orderBy(desc(promoRedemptions.appliedAt))
        .limit(1);

      if (!redemptions || redemptions.length === 0) return undefined;
      const redemption = redemptions[0];
      const promo = await this.getPromoCode(redemption.promoCodeId);
      if (!promo) return undefined;
      return { redemption, promoCode: promo };
    } catch (error) {
      console.error("Error getting user active redemption:", error);
      return undefined;
    }
  }

  async updateUserAccessStatus(userId: string, accessStatus: string, expiresAt?: Date | null, notes?: string | null, activePromoId?: string | null): Promise<User | undefined> {
    try {
      const updateData: any = {
        accessStatus,
        updatedAt: new Date()
      };
      if (expiresAt !== undefined) {
        updateData.accessStatusExpiresAt = expiresAt;
      }
      if (notes !== undefined) {
        updateData.accessStatusNotes = notes;
      }
      if (activePromoId !== undefined) {
        updateData.activePromoId = activePromoId;
      }
      const result = await db.update(users).set(updateData).where(eq(users.id, userId)).returning();
      return result[0];
    } catch (error) {
      console.error("Error updating user access status:", error);
      return undefined;
    }
  }

  async updateTenantAccessStatus(tenantId: string, accessStatus: string, expiresAt?: Date | null): Promise<Tenant | undefined> {
    try {
      const updateData: any = {
        accessStatus,
        updatedAt: new Date()
      };
      if (expiresAt !== undefined) {
        updateData.accessStatusExpiresAt = expiresAt;
      }
      const result = await db.update(tenants).set(updateData).where(eq(tenants.id, tenantId)).returning();
      return result[0];
    } catch (error) {
      console.error("Error updating tenant access status:", error);
      return undefined;
    }
  }
}