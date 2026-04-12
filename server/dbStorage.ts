import { db } from "./db";
import { 
  users, clients, credits, financialInstitutions, 
  commissions, notifications, documents, tenants, 
  tenantMembers, productVariables, productTemplates,
  institutionProducts, products, productRequests,
  creditSubmissionRequests, creditSubmissionTargets,
  clientCreditHistories,
  type User, type UpsertUser, type Client, type InsertClient,
  type Credit, type InsertCredit, type FinancialInstitution,
  type InsertFinancialInstitution, type Commission, type InsertCommission,
  type Notification, type InsertNotification, type Document, type InsertDocument,
  type Tenant, type InsertTenant, type TenantMember, type InsertTenantMember,
  type ProductVariable, type InsertProductVariable, type ProductTemplate,
  type InsertProductTemplate, type InstitutionProduct, type InsertInstitutionProduct,
  type InstitutionProductWithTemplate,
  type Product, type InsertProduct, type ProductRequest, type InsertProductRequest,
  type CreditSubmissionRequest, type InsertCreditSubmissionRequest,
  type CreditSubmissionTarget, type InsertCreditSubmissionTarget,
  type ClientCreditHistory, type InsertClientCreditHistory
} from "@shared/schema";
import { eq, desc, asc, like, and, or, inArray, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import type { IStorage } from "./storage";

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
  
  // ===== USER OPERATIONS =====
  async getUser(id: string): Promise<User | undefined> {
    try {
      const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
      return result[0];
    } catch (error) {
      console.error("Error fetching user:", error);
      return undefined;
    }
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    try {
      const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
      return result[0];
    } catch (error) {
      console.error("Error fetching user by email:", error);
      return undefined;
    }
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

  async updateUser(id: string, userData: Partial<UpsertUser>): Promise<User | undefined> {
    try {
      // Fetch existing user to perform deep merge of profileData
      const existingUser = await this.getUser(id);
      if (!existingUser) return undefined;

      // Deep merge profileData to preserve existing nested fields with null-safety
      const priorProfileData = existingUser.profileData ?? {};
      const mergedProfileData = userData.profileData
        ? {
            ...priorProfileData,
            ...userData.profileData,
            // Merge nested address object if provided
            ...(userData.profileData.address && {
              address: {
                ...(priorProfileData.address || {}),
                ...userData.profileData.address,
              },
            }),
          }
        : priorProfileData;

      const [updated] = await db
        .update(users)
        .set({ 
          ...userData, 
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
          templateId: institutionProducts.templateId,
          institutionId: institutionProducts.institutionId,
          customName: institutionProducts.customName,
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
            targetProfiles: productTemplates.targetProfiles,
            availableVariables: productTemplates.availableVariables,
            baseConfiguration: productTemplates.baseConfiguration,
            isActive: productTemplates.isActive,
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

  async createInstitutionProduct(productData: InsertInstitutionProduct): Promise<InstitutionProduct> {
    try {
      // Si no se proporcionan activeVariables, heredar de la plantilla
      let activeVariables = productData.activeVariables ?? {};
      
      if (!productData.activeVariables || Object.keys(productData.activeVariables).length === 0) {
        try {
          // Obtener la plantilla para heredar sus variables
          const template = await this.getProductTemplate(productData.templateId);
          if (template && template.availableVariables) {
            // Obtener las variables reales de la tabla product_variables
            const variableIds = Object.keys(template.availableVariables);
            if (variableIds.length > 0) {
              const variables = await this.getProductVariablesByIds(variableIds);
              // Convertir a formato activeVariables
              activeVariables = variables.map((variable: ProductVariable, index: number) => ({
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
          // Continue with empty activeVariables if there's an error
        }
      }

      const [created] = await db
        .insert(institutionProducts)
        .values({
          ...productData,
          id: randomUUID(),
          configuration: productData.configuration ?? {},
          activeVariables: activeVariables,
          isActive: productData.isActive ?? true,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
      return created;
    } catch (error) {
      console.error("Error creating institution product:", error);
      throw error;
    }
  }

  async updateInstitutionProduct(id: string, productData: Partial<InsertInstitutionProduct>): Promise<InstitutionProduct | undefined> {
    try {
      const [updated] = await db
        .update(institutionProducts)
        .set({ ...productData, updatedAt: new Date() })
        .where(eq(institutionProducts.id, id))
        .returning();
      return updated;
    } catch (error) {
      console.error("Error updating institution product:", error);
      return undefined;
    }
  }

  async deleteInstitutionProduct(id: string): Promise<boolean> {
    try {
      const result = await db.delete(institutionProducts).where(eq(institutionProducts.id, id));
      return (result.rowCount ?? 0) > 0;
    } catch (error) {
      console.error("Error deleting institution product:", error);
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
          id: randomUUID(),
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

  // ===== CLIENT OPERATIONS =====
  
  async getClients(brokerId?: string): Promise<Client[]> {
    try {
      if (brokerId) {
        const result = await db
          .select()
          .from(clients)
          .where(eq(clients.brokerId, brokerId))
          .orderBy(desc(clients.createdAt));
        return result;
      } else {
        const result = await db
          .select()
          .from(clients)
          .orderBy(desc(clients.createdAt));
        return result;
      }
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
  async getCredits(filters?: { brokerId?: string; clientId?: string; status?: string; statuses?: string[]; from?: Date; to?: Date }): Promise<Credit[]> {
    try {
      let query = db.select().from(credits);
      
      if (filters) {
        const conditions = [];
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
      const [created] = await db
        .insert(credits)
        .values({
          ...credit,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
      return created;
    } catch (error) {
      console.error("Error creating credit:", error);
      throw error;
    }
  }
  
  async updateCredit(id: string, credit: Partial<InsertCredit>): Promise<Credit | undefined> {
    try {
      const [updated] = await db
        .update(credits)
        .set({
          ...credit,
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
  async getCommissions(filtersOrBrokerId?: { brokerId?: string; masterBrokerId?: string; includeNetwork?: boolean; status?: string; from?: Date; to?: Date } | string): Promise<Commission[]> {
    // TODO: Implement SQL query with filter support
    return [];
  }
  async createCommission(commission: InsertCommission): Promise<Commission> { throw new Error("Not implemented"); }
  async updateCommission(id: string, commission: Partial<InsertCommission>): Promise<Commission | undefined> { return undefined; }

  // Notification operations
  async getNotifications(userId: string): Promise<Notification[]> {
    try {
      return await db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt));
    } catch (error) {
      console.error("Error fetching notifications:", error);
      return [];
    }
  }

  async createNotification(notification: InsertNotification): Promise<Notification> {
    try {
      const [created] = await db.insert(notifications).values(notification).returning();
      return created;
    } catch (error) {
      console.error("Error creating notification:", error);
      throw error;
    }
  }

  async markNotificationAsRead(id: string): Promise<boolean> {
    try {
      const result = await db.update(notifications).set({ isRead: true }).where(eq(notifications.id, id));
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
  async getDocuments(filters?: { clientId?: string; creditId?: string; brokerId?: string }): Promise<Document[]> {
    try {
      const conditions = [];
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
  async getTenants(): Promise<Tenant[]> { return []; }
  async getTenant(id: string): Promise<Tenant | undefined> { return undefined; }
  async getTenantBySlug(slug: string): Promise<Tenant | undefined> { return undefined; }
  async createTenant(tenant: InsertTenant): Promise<Tenant> { throw new Error("Not implemented"); }
  async updateTenant(id: string, tenant: Partial<InsertTenant>): Promise<Tenant | undefined> { return undefined; }
  async deleteTenant(id: string): Promise<boolean> { return false; }
  async getTenantsByParent(parentTenantId: string): Promise<Tenant[]> { return []; }

  // Tenant member operations
  async getTenantMembers(tenantId?: string): Promise<TenantMember[]> { return []; }
  async getTenantMember(id: string): Promise<TenantMember | undefined> { return undefined; }
  async createTenantMember(member: InsertTenantMember): Promise<TenantMember> { throw new Error("Not implemented"); }
  async updateTenantMember(id: string, member: Partial<InsertTenantMember>): Promise<TenantMember | undefined> { return undefined; }
  async deleteTenantMember(id: string): Promise<boolean> { return false; }
  async getTenantMembersByUser(userId: string): Promise<TenantMember[]> { return []; }
  async getUserTenantMembership(userId: string, tenantId: string): Promise<TenantMember | undefined> { return undefined; }

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
  async getFinancialInstitutionRequests(filters?: { status?: string; brokerId?: string }): Promise<FinancialInstitutionRequest[]> { return []; }
  async getFinancialInstitutionRequest(id: string): Promise<FinancialInstitutionRequest | undefined> { return undefined; }
  async createFinancialInstitutionRequest(request: InsertFinancialInstitutionRequest): Promise<FinancialInstitutionRequest> { throw new Error("Not implemented"); }
  async updateFinancialInstitutionRequest(id: string, request: Partial<FinancialInstitutionRequest>): Promise<FinancialInstitutionRequest | undefined> { return undefined; }

  // Credit Submission Requests operations
  async getCreditSubmissionRequests(filters?: { status?: string; brokerId?: string; clientId?: string }): Promise<CreditSubmissionRequest[]> {
    try {
      const conditions = [];
      if (filters?.status) {
        conditions.push(eq(creditSubmissionRequests.status, filters.status));
      }
      if (filters?.brokerId) {
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
      const result = await db.insert(creditSubmissionRequests)
        .values(requestData)
        .returning();
      return result[0];
    } catch (error) {
      console.error("Error creating credit submission request:", error);
      throw error;
    }
  }

  async updateCreditSubmissionRequest(id: string, requestData: Partial<InsertCreditSubmissionRequest>): Promise<CreditSubmissionRequest | undefined> {
    try {
      const result = await db.update(creditSubmissionRequests)
        .set({ ...requestData, updatedAt: new Date() })
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
      const result = await db.insert(creditSubmissionTargets)
        .values(targetData)
        .returning();
      return result[0];
    } catch (error) {
      console.error("Error creating credit submission target:", error);
      throw error;
    }
  }

  async updateCreditSubmissionTarget(id: string, targetData: Partial<InsertCreditSubmissionTarget>): Promise<CreditSubmissionTarget | undefined> {
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
    try {
      // First, get the target to find the associated submission
      const target = await db.select().from(creditSubmissionTargets).where(eq(creditSubmissionTargets.id, targetId)).limit(1);
      if (!target || target.length === 0) {
        return undefined;
      }
      
      const requestId = target[0].requestId;
      
      // Update the target status to approved
      const result = await db.update(creditSubmissionTargets)
        .set({
          status: "approved",
          adminNotes: adminNotes || "",
          details: details || "",
          reviewedBy: adminId,
          reviewedAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(creditSubmissionTargets.id, targetId))
        .returning();
      
      // Update the submission status to sent_to_institutions
      await db.update(creditSubmissionRequests)
        .set({
          status: "sent_to_institutions",
          updatedAt: new Date()
        })
        .where(eq(creditSubmissionRequests.id, requestId));
      
      return result[0];
    } catch (error) {
      console.error("Error approving credit submission target:", error);
      return undefined;
    }
  }

  async rejectCreditSubmissionTarget(targetId: string, adminId: string, adminNotes?: string): Promise<CreditSubmissionTarget | undefined> {
    try {
      const result = await db.update(creditSubmissionTargets)
        .set({
          status: "rejected",
          adminNotes: adminNotes || "",
          reviewedBy: adminId,
          reviewedAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(creditSubmissionTargets.id, targetId))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Error rejecting credit submission target:", error);
      return undefined;
    }
  }

  async returnCreditSubmissionTargetToBroker(targetId: string, adminId: string, details?: string, adminNotes?: string): Promise<CreditSubmissionTarget | undefined> {
    try {
      // First, get the target to find the associated submission
      const target = await db.select().from(creditSubmissionTargets).where(eq(creditSubmissionTargets.id, targetId)).limit(1);
      if (!target || target.length === 0) {
        return undefined;
      }
      
      const requestId = target[0].requestId;
      
      // Update the target status
      const result = await db.update(creditSubmissionTargets)
        .set({
          status: "returned_to_broker",
          adminNotes: adminNotes || "",
          details: details || "", // Comments for broker
          reviewedBy: adminId,
          reviewedAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(creditSubmissionTargets.id, targetId))
        .returning();
      
      // Also update the submission status so it appears in the broker's list
      await db.update(creditSubmissionRequests)
        .set({
          status: "returned_to_broker",
          updatedAt: new Date()
        })
        .where(eq(creditSubmissionRequests.id, requestId));
      
      return result[0];
    } catch (error) {
      console.error("Error returning credit submission target to broker:", error);
      return undefined;
    }
  }
}