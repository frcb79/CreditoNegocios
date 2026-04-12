import {
  users,
  clients,
  credits,
  financialInstitutions,
  financialInstitutionRequests,
  commissions,
  notifications,
  documents,
  tenants,
  tenantMembers,
  type User,
  type UpsertUser,
  type Client,
  type InsertClient,
  type Credit,
  type InsertCredit,
  type FinancialInstitution,
  type InsertFinancialInstitution,
  type FinancialInstitutionRequest,
  type InsertFinancialInstitutionRequest,
  type Commission,
  type InsertCommission,
  type Notification,
  type InsertNotification,
  type Document,
  type InsertDocument,
  type Tenant,
  type InsertTenant,
  type TenantMember,
  type InsertTenantMember,
  type ProductVariable,
  type InsertProductVariable,
  type ProductTemplate,
  type InsertProductTemplate,
  type InstitutionProduct,
  type InsertInstitutionProduct,
  type InstitutionProductWithTemplate,
  type Product,
  type InsertProduct,
  type ProductRequest,
  type InsertProductRequest,
  type CreditSubmissionRequest,
  type InsertCreditSubmissionRequest,
  type CreditSubmissionTarget,
  type InsertCreditSubmissionTarget,
  type ClientCreditHistory,
  type InsertClientCreditHistory,
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // User operations (mandatory for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  createUser(userData: UpsertUser): Promise<User>;
  createLocalUser(userData: { email: string; password: string; firstName: string; lastName: string; authMethod: string; role: string }): Promise<User>;
  upsertUser(user: UpsertUser & { id: string }, replitId?: string): Promise<User>;
  updateUser(id: string, userData: Partial<UpsertUser>): Promise<User | undefined>;
  getUsersByMasterBroker(masterBrokerId: string): Promise<User[]>;
  setPasswordResetToken(userId: string, token: string, expiry: Date): Promise<void>;
  getUserByResetToken(token: string): Promise<User | undefined>;
  clearPasswordResetToken(userId: string): Promise<void>;
  updateUserPassword(userId: string, hashedPassword: string): Promise<void>;

  // Client operations
  getClients(brokerId?: string): Promise<Client[]>;
  getClient(id: string): Promise<Client | undefined>;
  createClient(client: InsertClient): Promise<Client>;
  updateClient(id: string, client: Partial<InsertClient>): Promise<Client | undefined>;
  deleteClient(id: string): Promise<boolean>;

  // Client Credit History operations
  createClientCreditHistory(historyData: InsertClientCreditHistory): Promise<ClientCreditHistory>;
  getClientCreditHistories(clientId: string): Promise<ClientCreditHistory[]>;

  // Credit operations
  getCredits(filters?: { brokerId?: string; clientId?: string; statuses?: string[]; from?: Date; to?: Date }): Promise<Credit[]>;
  getCredit(id: string): Promise<Credit | undefined>;
  createCredit(credit: InsertCredit): Promise<Credit>;
  updateCredit(id: string, credit: Partial<InsertCredit>): Promise<Credit | undefined>;
  getCreditsByStatus(status: string): Promise<Credit[]>;
  getExpiringCredits(days: number): Promise<Credit[]>;
  countCreditsByStatus(filters: { brokerId?: string; masterBrokerId?: string; includeNetwork?: boolean; statuses?: string[] }): Promise<number>;
  sumCreditAmounts(filters: { brokerId?: string; masterBrokerId?: string; includeNetwork?: boolean; statuses?: string[]; from?: Date; to?: Date }): Promise<string>;

  // Financial Institution operations
  getFinancialInstitutions(): Promise<FinancialInstitution[]>;
  getFinancialInstitution(id: string): Promise<FinancialInstitution | undefined>;
  createFinancialInstitution(institution: InsertFinancialInstitution): Promise<FinancialInstitution>;
  updateFinancialInstitution(id: string, institution: Partial<InsertFinancialInstitution>): Promise<FinancialInstitution | undefined>;

  // Commission operations
  getCommissions(filters?: { brokerId?: string; masterBrokerId?: string; includeNetwork?: boolean; status?: string; from?: Date; to?: Date }): Promise<Commission[]>;
  createCommission(commission: InsertCommission): Promise<Commission>;
  updateCommission(id: string, commission: Partial<InsertCommission>): Promise<Commission | undefined>;

  // Notification operations
  getNotifications(userId: string): Promise<Notification[]>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markNotificationAsRead(id: string): Promise<boolean>;
  getUnreadNotificationCount(userId: string): Promise<number>;

  // Document operations
  getDocuments(filters?: { clientId?: string; creditId?: string; brokerId?: string }): Promise<Document[]>;
  createDocument(document: InsertDocument): Promise<Document>;
  updateDocument(id: string, document: Partial<InsertDocument>): Promise<Document | undefined>;
  deleteDocument(id: string): Promise<boolean>;

  // Tenant operations
  getTenants(): Promise<Tenant[]>;
  getTenant(id: string): Promise<Tenant | undefined>;
  getTenantBySlug(slug: string): Promise<Tenant | undefined>;
  createTenant(tenant: InsertTenant): Promise<Tenant>;
  updateTenant(id: string, tenant: Partial<InsertTenant>): Promise<Tenant | undefined>;
  deleteTenant(id: string): Promise<boolean>;
  getTenantsByParent(parentTenantId: string): Promise<Tenant[]>;

  // Tenant Member operations
  getTenantMembers(tenantId?: string): Promise<TenantMember[]>;
  getTenantMember(id: string): Promise<TenantMember | undefined>;
  createTenantMember(tenantMember: InsertTenantMember): Promise<TenantMember>;
  updateTenantMember(id: string, tenantMember: Partial<InsertTenantMember>): Promise<TenantMember | undefined>;
  deleteTenantMember(id: string): Promise<boolean>;
  getTenantMembersByUser(userId: string): Promise<TenantMember[]>;
  getUserTenantMembership(userId: string, tenantId: string): Promise<TenantMember | undefined>;

  // Product Variables operations
  getProductVariables(): Promise<ProductVariable[]>;
  getProductVariable(id: string): Promise<ProductVariable | undefined>;
  getProductVariableByName(name: string): Promise<ProductVariable | undefined>;
  createProductVariable(variableData: InsertProductVariable): Promise<ProductVariable>;
  updateProductVariable(id: string, variableData: Partial<InsertProductVariable>): Promise<ProductVariable | undefined>;
  deleteProductVariable(id: string): Promise<boolean>;

  // Product Templates operations
  getProductTemplates(): Promise<ProductTemplate[]>;
  getProductTemplate(id: string): Promise<ProductTemplate | undefined>;
  createProductTemplate(templateData: InsertProductTemplate): Promise<ProductTemplate>;
  updateProductTemplate(id: string, templateData: Partial<InsertProductTemplate>): Promise<ProductTemplate | undefined>;
  deleteProductTemplate(id: string): Promise<boolean>;

  // Institution Products operations
  getInstitutionProducts(institutionId?: string): Promise<InstitutionProductWithTemplate[]>;
  getInstitutionProduct(id: string): Promise<InstitutionProduct | undefined>;
  getInstitutionProductsByTemplate(templateId: string): Promise<InstitutionProduct[]>;
  createInstitutionProduct(productData: InsertInstitutionProduct): Promise<InstitutionProduct>;
  updateInstitutionProduct(id: string, productData: Partial<InsertInstitutionProduct>): Promise<InstitutionProduct | undefined>;
  deleteInstitutionProduct(id: string): Promise<boolean>;

  // Products operations (simplified - LEGACY)
  getProducts(institutionId?: string): Promise<Product[]>;
  getProduct(id: string): Promise<Product | undefined>;
  createProduct(productData: InsertProduct): Promise<Product>;
  updateProduct(id: string, productData: Partial<InsertProduct>): Promise<Product | undefined>;
  deleteProduct(id: string): Promise<boolean>;

  // Product Requests operations
  getProductRequests(filters?: { status?: string; requestedBy?: string }): Promise<ProductRequest[]>;
  getProductRequest(id: string): Promise<ProductRequest | undefined>;
  createProductRequest(requestData: InsertProductRequest): Promise<ProductRequest>;
  updateProductRequest(id: string, requestData: Partial<InsertProductRequest>): Promise<ProductRequest | undefined>;
  deleteProductRequest(id: string): Promise<boolean>;

  // Financial Institution Requests operations (broker requests to add new institutions)
  getFinancialInstitutionRequests(filters?: { status?: string; brokerId?: string }): Promise<FinancialInstitutionRequest[]>;
  getFinancialInstitutionRequest(id: string): Promise<FinancialInstitutionRequest | undefined>;
  createFinancialInstitutionRequest(requestData: InsertFinancialInstitutionRequest): Promise<FinancialInstitutionRequest>;
  updateFinancialInstitutionRequest(id: string, requestData: Partial<FinancialInstitutionRequest>): Promise<FinancialInstitutionRequest | undefined>;

  // Credit Submission Requests operations (broker → admin approval flow)
  getCreditSubmissionRequests(filters?: { status?: string; brokerId?: string; clientId?: string }): Promise<CreditSubmissionRequest[]>;
  getCreditSubmissionRequest(id: string): Promise<CreditSubmissionRequest | undefined>;
  createCreditSubmissionRequest(requestData: InsertCreditSubmissionRequest): Promise<CreditSubmissionRequest>;
  updateCreditSubmissionRequest(id: string, requestData: Partial<InsertCreditSubmissionRequest>): Promise<CreditSubmissionRequest | undefined>;

  // Credit Submission Targets operations (per-institution approval)
  getCreditSubmissionTargets(filters?: { requestId?: string; status?: string; financialInstitutionId?: string }): Promise<CreditSubmissionTarget[]>;
  getCreditSubmissionTarget(id: string): Promise<CreditSubmissionTarget | undefined>;
  getCreditSubmissionTargetByCreditId(creditId: string): Promise<CreditSubmissionTarget | undefined>;
  getCreditSubmissionTargetsByRequest(requestId: string): Promise<CreditSubmissionTarget[]>;
  createCreditSubmissionTarget(targetData: InsertCreditSubmissionTarget): Promise<CreditSubmissionTarget>;
  updateCreditSubmissionTarget(id: string, targetData: Partial<InsertCreditSubmissionTarget>): Promise<CreditSubmissionTarget | undefined>;
  approveCreditSubmissionTarget(targetId: string, adminId: string, adminNotes?: string, details?: string): Promise<CreditSubmissionTarget | undefined>;
  rejectCreditSubmissionTarget(targetId: string, adminId: string, adminNotes?: string): Promise<CreditSubmissionTarget | undefined>;
  returnCreditSubmissionTargetToBroker(targetId: string, adminId: string, details?: string, adminNotes?: string): Promise<CreditSubmissionTarget | undefined>;

}

export class MemStorage implements IStorage {
  private users: Map<string, User> = new Map();
  private clients: Map<string, Client> = new Map();
  private clientCreditHistories: Map<string, ClientCreditHistory> = new Map();
  private credits: Map<string, Credit> = new Map();
  private financialInstitutions: Map<string, FinancialInstitution> = new Map();
  private commissions: Map<string, Commission> = new Map();
  private notifications: Map<string, Notification> = new Map();
  private documents: Map<string, Document> = new Map();
  private tenants: Map<string, Tenant> = new Map();
  private tenantMembers: Map<string, TenantMember> = new Map();
  
  // Product system storage
  private productVariables: Map<string, ProductVariable> = new Map();
  private productTemplates: Map<string, ProductTemplate> = new Map();
  private institutionProducts: Map<string, InstitutionProduct> = new Map();
  private products: Map<string, Product> = new Map();
  private productRequests: Map<string, ProductRequest> = new Map();
  
  // Financial institution requests storage
  private financialInstitutionRequests: Map<string, FinancialInstitutionRequest> = new Map();
  
  // Configuration system storage
  
  // Credit submission system storage
  private creditSubmissionRequests: Map<string, CreditSubmissionRequest> = new Map();
  private creditSubmissionTargets: Map<string, CreditSubmissionTarget> = new Map();

  constructor() {
    this.seedData();
    this.migrateExistingData();
  }

  private seedData() {
    // Seed financial institutions
    const institution1: FinancialInstitution = {
      id: "fin-1",
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
      notes: null,
      createdByAdmin: true,
      createdBy: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.financialInstitutions.set(institution1.id, institution1);

    // Add Pretmex
    const pretmex: FinancialInstitution = {
      id: "fin-pretmex",
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
      notes: null,
      createdByAdmin: true,
      createdBy: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.financialInstitutions.set(pretmex.id, pretmex);

    // Add Konfio
    const konfio: FinancialInstitution = {
      id: "fin-konfio",
      name: "Konfio",
      contactPerson: "Ana Mendoza",
      email: "ana.mendoza@konfio.mx",
      phone: "+52 55 5555 1234",
      openingCommissionRate: "2.8",
      overrateCommissionRate: "1.2",
      masterBrokerCommissionRate: "35.0",
      brokerCommissionRate: "65.0",
      additionalCosts: [],
      requirements: {},
      products: [],
      notes: null,
      createdByAdmin: true,
      createdBy: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.financialInstitutions.set(konfio.id, konfio);

    // Create sub-brokers (will be assigned to master broker when user logs in)
    const broker1: User = {
      id: "broker-1",
      email: "broker1@brokerapp.mx",
      firstName: "Luis",
      lastName: "Hernández",
      profileImageUrl: null,
      role: "broker",
      masterBrokerId: "43418506", // This will be the current user's ID
      customLogo: null,
      brandName: null,
      primaryColor: null,
      secondaryColor: null,
      isWhiteLabel: false,
      autoRegisterBrokers: false,
      profileType: null,
      profileData: {},
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.users.set(broker1.id, broker1);

    const broker2: User = {
      id: "broker-2",
      email: "broker2@brokerapp.mx",
      firstName: "Carmen",
      lastName: "López",
      profileImageUrl: null,
      role: "broker",
      masterBrokerId: "43418506",
      customLogo: null,
      brandName: null,
      primaryColor: null,
      secondaryColor: null,
      isWhiteLabel: false,
      autoRegisterBrokers: false,
      profileType: null,
      profileData: {},
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.users.set(broker2.id, broker2);

    const broker3: User = {
      id: "broker-3",
      email: "broker3@brokerapp.mx",
      firstName: "Roberto",
      lastName: "Martínez",
      profileImageUrl: null,
      role: "broker",
      masterBrokerId: "43418506",
      customLogo: null,
      brandName: null,
      primaryColor: null,
      secondaryColor: null,
      isWhiteLabel: false,
      autoRegisterBrokers: false,
      profileType: null,
      profileData: {},
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.users.set(broker3.id, broker3);

    // Create specific user Luis Llano
    const luisLlano: User = {
      id: "user-luis-llano", 
      email: "luis.llano@brokerapp.mx",
      firstName: "Luis",
      lastName: "Llano",
      profileImageUrl: null,
      role: "master_broker",
      masterBrokerId: null,
      customLogo: null,
      brandName: null,
      primaryColor: null,
      secondaryColor: null,
      isWhiteLabel: false,
      autoRegisterBrokers: false,
      profileType: null,
      profileData: {},
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.users.set(luisLlano.id, luisLlano);

    // Create super admin user for platform management
    const superAdmin: User = {
      id: "user-super-admin",
      email: "admin@brokerapp.mx",
      firstName: "Platform",
      lastName: "Administrator",
      profileImageUrl: null,
      role: "super_admin",
      masterBrokerId: null,
      customLogo: null,
      brandName: null,
      primaryColor: null,
      secondaryColor: null,
      isWhiteLabel: false,
      autoRegisterBrokers: false,
      profileType: null,
      profileData: {},
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.users.set(superAdmin.id, superAdmin);

    // Add specific super admin user for this session
    const sessionAdmin: User = {
      id: "user-session-admin",
      email: "francocb79@gmail.com",
      firstName: "Franco",
      lastName: "Calderón",
      profileImageUrl: null,
      role: "super_admin",
      masterBrokerId: null,
      customLogo: null,
      brandName: null,
      primaryColor: null,
      secondaryColor: null,
      isWhiteLabel: false,
      autoRegisterBrokers: false,
      profileType: null,
      profileData: {},
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.users.set(sessionAdmin.id, sessionAdmin);

    // Seed test tenants
    const platformTenant: Tenant = {
      id: "tenant-platform",
      type: "platform",
      name: "Broker Platform",
      slug: "platform",
      parentTenantId: null,
      settings: { theme: "default", features: ["all"] },
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.tenants.set(platformTenant.id, platformTenant);

    const masterBrokerTenant: Tenant = {
      id: "tenant-mb-1",
      type: "master_broker",
      name: "Master Broker Organization",
      slug: "master-broker-org",
      parentTenantId: "tenant-platform",
      settings: { branding: "custom", colors: { primary: "#3b82f6" } },
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.tenants.set(masterBrokerTenant.id, masterBrokerTenant);

    // Create tenant memberships
    const platformMembership: TenantMember = {
      id: "tm-platform-1",
      tenantId: "tenant-platform",
      userId: "user-luis-llano",
      role: "owner",
      isActive: true,
      joinedAt: new Date(),
      updatedAt: new Date(),
    };
    this.tenantMembers.set(platformMembership.id, platformMembership);

    // Super admin platform membership
    const superAdminPlatformMembership: TenantMember = {
      id: "tm-platform-super",
      tenantId: "tenant-platform",
      userId: "user-super-admin",
      role: "owner",
      isActive: true,
      joinedAt: new Date(),
      updatedAt: new Date(),
    };
    this.tenantMembers.set(superAdminPlatformMembership.id, superAdminPlatformMembership);

    const mbMembership: TenantMember = {
      id: "tm-mb-1",
      tenantId: "tenant-mb-1",
      userId: "user-luis-llano",
      role: "owner",
      isActive: true,
      joinedAt: new Date(),
      updatedAt: new Date(),
    };
    this.tenantMembers.set(mbMembership.id, mbMembership);

    // Create client OXF SA de CV
    const oxfClient: Client = {
      id: "client-oxf",
      brokerId: "43418506", // Master broker's client
      type: "moral",
      businessName: "OXF SA de CV",
      firstName: null,
      lastName: null,
      rfc: "OXF940101ABC",
      curp: null,
      email: "contacto@oxf.mx",
      phone: "+52 55 1234 9876",
      street: "Av. Reforma",
      number: "123",
      interior: null,
      postalCode: "06600",
      state: "CDMX",
      industry: "Tecnología",
      yearsInBusiness: 5,
      legalRepresentative: {
        name: "Francisco Jiménez",
        position: "Director General",
        rfc: "JIFR850315XYZ"
      },
      guarantors: [],
      guarantees: [],
      profilingData: {},
      ingresoMensualPromedio: null,
      edadCliente: null,
      estadoCivil: null,
      nivelEducativo: null,
      nivelEducacionAccionista: null,
      experienciaCrediticia: null,
      objetivoCredito: null,
      plazoDeseado: null,
      capacidadPago: null,
      ingresosFamiliares: null,
      dependientesEconomicos: null,
      tipoVivienda: null,
      antiguedadEmpleo: null,
      sectoreEconomico: null,
      tiempoActividad: null,
      clientesBanco: null,
      productosFinancieros: null,
      montoSolicitado: null,
      garantias: null,
      historialPagos: null,
      referenciasComerciales: null,
      egresoMensualPromedio: null,
      ingresoAnual: null,
      participacionVentasGobierno: null,
      ventasTerminalBancaria: null,
      buroAccionistaPrincipal: null,
      buroEmpresa: null,
      atrasosDeudas: null,
      atrasosDetalles: null,
      garantia: null,
      garantiaDetalles: {},
      avalObligadoSolidario: null,
      satCiec: null,
      estadosFinancieros: null,
      opinionCumplimiento: null,
      opinionDetalles: null,
      creditosVigentes: null,
      creditosVigentesDetalles: [],
      puesto: null,
      antiguedadLaboral: null,
      ingresoMensualPromedioComprobables: null,
      ingresoMensualPromedioNoComprobables: null,
      gastosFijosMensualesPromedio: null,
      buroPersonaFisica: null,
      atrasosDeudasBuro: null,
      atrasosDeudasBuroDetalles: null,
      cuentaConGarantiaFisica: null,
      garantiaFisicaDetalles: {},
      tieneAvalObligadoSolidarioFisica: null,
      creditosVigentesFisica: null,
      creditosVigentesFisicaDetalles: [],
      observacionesAdicionalesFisica: null,
      nombreComercial: null,
      ocupacion: null,
      direccionNegocioAplica: null,
      esMismaDireccionNegocio: null,
      calleNegocio: null,
      numeroNegocio: null,
      interiorNegocio: null,
      codigoPostalNegocio: null,
      estadoNegocio: null,
      ingresoMensualPromedioComprobablesSinSat: null,
      ingresoMensualPromedioNoComprobablesSinSat: null,
      gastosFijosMensualesPromedioSinSat: null,
      buroPersonaFisicaSinSat: null,
      atrasosDeudasBuroSinSat: null,
      atrasosDeudasBuroDetallesSinSat: null,
      cuentaConGarantiaSinSat: null,
      garantiaSinSatDetalles: {},
      tieneAvalObligadoSolidarioSinSat: null,
      creditosVigentesSinSat: null,
      creditosVigentesSinSatDetalles: [],
      observacionesAdicionalesSinSat: null,
      notes: "Cliente corporativo importante",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.clients.set(oxfClient.id, oxfClient);

    // Create clients for sub-brokers
    const client1: Client = {
      id: "client-1",
      brokerId: "broker-1",
      type: "physical",
      businessName: null,
      firstName: "María",
      lastName: "Sánchez",
      rfc: "SAMA850315ABC",
      curp: "SAMA850315MDFNRR07",
      email: "maria.sanchez@email.com",
      phone: "+52 55 1111 2222",
      street: "Calle Norte",
      number: "45",
      interior: null,
      postalCode: "01000",
      state: "CDMX",
      industry: "Comercio",
      yearsInBusiness: 3,
      legalRepresentative: null,
      guarantors: [],
      guarantees: [],
      profilingData: {},
      ingresoMensualPromedio: null,
      edadCliente: null,
      estadoCivil: null,
      nivelEducativo: null,
      nivelEducacionAccionista: null,
      experienciaCrediticia: null,
      objetivoCredito: null,
      plazoDeseado: null,
      capacidadPago: null,
      ingresosFamiliares: null,
      dependientesEconomicos: null,
      tipoVivienda: null,
      antiguedadEmpleo: null,
      sectoreEconomico: null,
      tiempoActividad: null,
      clientesBanco: null,
      productosFinancieros: null,
      montoSolicitado: null,
      garantias: null,
      historialPagos: null,
      referenciasComerciales: null,
      egresoMensualPromedio: null,
      ingresoAnual: null,
      participacionVentasGobierno: null,
      ventasTerminalBancaria: null,
      buroAccionistaPrincipal: null,
      buroEmpresa: null,
      atrasosDeudas: null,
      atrasosDetalles: null,
      garantia: null,
      garantiaDetalles: {},
      avalObligadoSolidario: null,
      satCiec: null,
      estadosFinancieros: null,
      opinionCumplimiento: null,
      opinionDetalles: null,
      creditosVigentes: null,
      creditosVigentesDetalles: [],
      puesto: null,
      antiguedadLaboral: null,
      ingresoMensualPromedioComprobables: null,
      ingresoMensualPromedioNoComprobables: null,
      gastosFijosMensualesPromedio: null,
      buroPersonaFisica: null,
      atrasosDeudasBuro: null,
      atrasosDeudasBuroDetalles: null,
      cuentaConGarantiaFisica: null,
      garantiaFisicaDetalles: {},
      tieneAvalObligadoSolidarioFisica: null,
      creditosVigentesFisica: null,
      creditosVigentesFisicaDetalles: [],
      observacionesAdicionalesFisica: null,
      nombreComercial: null,
      ocupacion: null,
      direccionNegocioAplica: null,
      esMismaDireccionNegocio: null,
      calleNegocio: null,
      numeroNegocio: null,
      interiorNegocio: null,
      codigoPostalNegocio: null,
      estadoNegocio: null,
      ingresoMensualPromedioComprobablesSinSat: null,
      ingresoMensualPromedioNoComprobablesSinSat: null,
      gastosFijosMensualesPromedioSinSat: null,
      buroPersonaFisicaSinSat: null,
      atrasosDeudasBuroSinSat: null,
      atrasosDeudasBuroDetallesSinSat: null,
      cuentaConGarantiaSinSat: null,
      garantiaSinSatDetalles: {},
      tieneAvalObligadoSolidarioSinSat: null,
      creditosVigentesSinSat: null,
      creditosVigentesSinSatDetalles: [],
      observacionesAdicionalesSinSat: null,
      notes: "Cliente persona física",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.clients.set(client1.id, client1);

    const client2: Client = {
      id: "client-2",
      brokerId: "broker-2",
      type: "moral",
      businessName: "Innovación Empresarial SA",
      firstName: null,
      lastName: null,
      rfc: "IEM920101XYZ",
      curp: null,
      email: "info@innovacion.mx",
      phone: "+52 55 3333 4444",
      street: "Insurgentes Sur",
      number: "200",
      interior: null,
      postalCode: "03100",
      state: "CDMX",
      industry: "Servicios",
      yearsInBusiness: 8,
      legalRepresentative: {
        name: "Pedro Ramírez",
        position: "CEO",
        rfc: "RAMP750420DEF"
      },
      guarantors: [],
      guarantees: [],
      profilingData: {},
      ingresoMensualPromedio: null,
      edadCliente: null,
      estadoCivil: null,
      nivelEducativo: null,
      nivelEducacionAccionista: null,
      experienciaCrediticia: null,
      objetivoCredito: null,
      plazoDeseado: null,
      capacidadPago: null,
      ingresosFamiliares: null,
      dependientesEconomicos: null,
      tipoVivienda: null,
      antiguedadEmpleo: null,
      sectoreEconomico: null,
      tiempoActividad: null,
      clientesBanco: null,
      productosFinancieros: null,
      montoSolicitado: null,
      garantias: null,
      historialPagos: null,
      referenciasComerciales: null,
      egresoMensualPromedio: null,
      ingresoAnual: null,
      participacionVentasGobierno: null,
      ventasTerminalBancaria: null,
      buroAccionistaPrincipal: null,
      buroEmpresa: null,
      atrasosDeudas: null,
      atrasosDetalles: null,
      garantia: null,
      garantiaDetalles: {},
      avalObligadoSolidario: null,
      satCiec: null,
      estadosFinancieros: null,
      opinionCumplimiento: null,
      opinionDetalles: null,
      creditosVigentes: null,
      creditosVigentesDetalles: [],
      puesto: null,
      antiguedadLaboral: null,
      ingresoMensualPromedioComprobables: null,
      ingresoMensualPromedioNoComprobables: null,
      gastosFijosMensualesPromedio: null,
      buroPersonaFisica: null,
      atrasosDeudasBuro: null,
      atrasosDeudasBuroDetalles: null,
      cuentaConGarantiaFisica: null,
      garantiaFisicaDetalles: {},
      tieneAvalObligadoSolidarioFisica: null,
      creditosVigentesFisica: null,
      creditosVigentesFisicaDetalles: [],
      observacionesAdicionalesFisica: null,
      nombreComercial: null,
      ocupacion: null,
      direccionNegocioAplica: null,
      esMismaDireccionNegocio: null,
      calleNegocio: null,
      numeroNegocio: null,
      interiorNegocio: null,
      codigoPostalNegocio: null,
      estadoNegocio: null,
      ingresoMensualPromedioComprobablesSinSat: null,
      ingresoMensualPromedioNoComprobablesSinSat: null,
      gastosFijosMensualesPromedioSinSat: null,
      buroPersonaFisicaSinSat: null,
      atrasosDeudasBuroSinSat: null,
      atrasosDeudasBuroDetallesSinSat: null,
      cuentaConGarantiaSinSat: null,
      garantiaSinSatDetalles: {},
      tieneAvalObligadoSolidarioSinSat: null,
      creditosVigentesSinSat: null,
      creditosVigentesSinSatDetalles: [],
      observacionesAdicionalesSinSat: null,
      notes: "Empresa de servicios tecnológicos",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.clients.set(client2.id, client2);

    const client3: Client = {
      id: "client-3",
      brokerId: "broker-3",
      type: "physical",
      businessName: null,
      firstName: "Jorge",
      lastName: "García",
      rfc: "GAJO780912GHI",
      curp: "GAJO780912HDFRCR05",
      email: "jorge.garcia@email.com",
      phone: "+52 55 5555 6666",
      street: "Polanco",
      number: "78",
      interior: null,
      postalCode: "11550",
      state: "CDMX",
      industry: "Construcción",
      yearsInBusiness: 12,
      legalRepresentative: null,
      guarantors: [],
      guarantees: [],
      profilingData: {},
      ingresoMensualPromedio: null,
      edadCliente: null,
      estadoCivil: null,
      nivelEducativo: null,
      nivelEducacionAccionista: null,
      experienciaCrediticia: null,
      objetivoCredito: null,
      plazoDeseado: null,
      capacidadPago: null,
      ingresosFamiliares: null,
      dependientesEconomicos: null,
      tipoVivienda: null,
      antiguedadEmpleo: null,
      sectoreEconomico: null,
      tiempoActividad: null,
      clientesBanco: null,
      productosFinancieros: null,
      montoSolicitado: null,
      garantias: null,
      historialPagos: null,
      referenciasComerciales: null,
      egresoMensualPromedio: null,
      ingresoAnual: null,
      participacionVentasGobierno: null,
      ventasTerminalBancaria: null,
      buroAccionistaPrincipal: null,
      buroEmpresa: null,
      atrasosDeudas: null,
      atrasosDetalles: null,
      garantia: null,
      garantiaDetalles: {},
      avalObligadoSolidario: null,
      satCiec: null,
      estadosFinancieros: null,
      opinionCumplimiento: null,
      opinionDetalles: null,
      creditosVigentes: null,
      creditosVigentesDetalles: [],
      puesto: null,
      antiguedadLaboral: null,
      ingresoMensualPromedioComprobables: null,
      ingresoMensualPromedioNoComprobables: null,
      gastosFijosMensualesPromedio: null,
      buroPersonaFisica: null,
      atrasosDeudasBuro: null,
      atrasosDeudasBuroDetalles: null,
      cuentaConGarantiaFisica: null,
      garantiaFisicaDetalles: {},
      tieneAvalObligadoSolidarioFisica: null,
      creditosVigentesFisica: null,
      creditosVigentesFisicaDetalles: [],
      observacionesAdicionalesFisica: null,
      nombreComercial: null,
      ocupacion: null,
      direccionNegocioAplica: null,
      esMismaDireccionNegocio: null,
      calleNegocio: null,
      numeroNegocio: null,
      interiorNegocio: null,
      codigoPostalNegocio: null,
      estadoNegocio: null,
      ingresoMensualPromedioComprobablesSinSat: null,
      ingresoMensualPromedioNoComprobablesSinSat: null,
      gastosFijosMensualesPromedioSinSat: null,
      buroPersonaFisicaSinSat: null,
      atrasosDeudasBuroSinSat: null,
      atrasosDeudasBuroDetallesSinSat: null,
      cuentaConGarantiaSinSat: null,
      garantiaSinSatDetalles: {},
      tieneAvalObligadoSolidarioSinSat: null,
      creditosVigentesSinSat: null,
      creditosVigentesSinSatDetalles: [],
      observacionesAdicionalesSinSat: null,
      notes: "Contratista independiente",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.clients.set(client3.id, client3);

    // Create credit for OXF SA de CV (5 million with 2.5% commission)
    const oxfCredit: Credit = {
      id: "credit-oxf",
      clientId: "client-oxf",
      brokerId: "43418506",
      financialInstitutionId: "fin-1",
      amount: "5000000.00",
      term: 36,
      interestRate: "12.5",
      frequency: "monthly",
      status: "approved",
      startDate: "2024-01-01",
      endDate: "2027-01-01",
      paymentAmount: "138889.00",
      remainingBalance: "5000000.00",
      paymentHistory: [],
      amortizationTable: [],
      documents: [],
      notes: "Crédito aprobado para expansión de operaciones",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.credits.set(oxfCredit.id, oxfCredit);

    // Create credits for sub-brokers with different statuses
    const credit1: Credit = {
      id: "credit-1",
      clientId: "client-1",
      brokerId: "broker-1",
      financialInstitutionId: "fin-pretmex",
      amount: "800000.00",
      term: 24,
      interestRate: "15.0",
      frequency: "monthly",
      status: "en_revision",
      startDate: null,
      endDate: null,
      paymentAmount: null,
      remainingBalance: null,
      paymentHistory: [],
      amortizationTable: [],
      documents: [],
      notes: "En proceso de evaluación",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.credits.set(credit1.id, credit1);

    const credit2: Credit = {
      id: "credit-2",
      clientId: "client-2",
      brokerId: "broker-2",
      financialInstitutionId: "fin-konfio",
      amount: "1500000.00",
      term: 48,
      interestRate: "11.8",
      frequency: "monthly",
      status: "validacion_juridica",
      startDate: null,
      endDate: null,
      paymentAmount: null,
      remainingBalance: null,
      paymentHistory: [],
      amortizationTable: [],
      documents: [],
      notes: "Documentos en validación jurídica",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.credits.set(credit2.id, credit2);

    const credit3: Credit = {
      id: "credit-3",
      clientId: "client-3",
      brokerId: "broker-3",
      financialInstitutionId: "fin-1",
      amount: "600000.00",
      term: 18,
      interestRate: "18.5",
      frequency: "monthly",
      status: "rechazado",
      startDate: null,
      endDate: null,
      paymentAmount: null,
      remainingBalance: null,
      paymentHistory: [],
      amortizationTable: [],
      documents: [],
      notes: "Rechazado por falta de garantías suficientes",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.credits.set(credit3.id, credit3);

    // Create commission for OXF credit
    const oxfCommission: Commission = {
      id: "comm-oxf",
      creditId: "credit-oxf",
      brokerId: "43418506",
      masterBrokerId: null,
      amount: "125000.00",
      status: "pendiente",
      brokerShare: "125000.00",
      masterBrokerShare: null,
      appShare: null,
      paidAt: null,
      createdAt: new Date(),
    };
    this.commissions.set(oxfCommission.id, oxfCommission);

    // Seed product variables - predefined variables for the system
    const tipoCredito: ProductVariable = {
      id: "var-tipo-credito",
      name: "tipo_credito",
      displayName: "Tipo de Crédito",
      description: "Tipo de producto crediticio disponible",
      variableType: "select",
      configuration: {
        options: [
          { value: "simple", label: "Crédito Simple" },
          { value: "revolvente", label: "Crédito Revolvente" },
          { value: "hipotecario", label: "Crédito Hipotecario" },
          { value: "automotriz", label: "Crédito Automotriz" },
          { value: "pyme", label: "Crédito PYME" }
        ]
      },
      category: "basic",
      isActive: true,
      createdBy: "user-super-admin",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.productVariables.set(tipoCredito.id, tipoCredito);

    const destino: ProductVariable = {
      id: "var-destino",
      name: "destino",
      displayName: "Destino",
      description: "Destino del crédito solicitado",
      variableType: "select",
      configuration: {
        options: [
          { value: "capital_trabajo", label: "Capital de Trabajo" },
          { value: "expansion", label: "Expansión del Negocio" },
          { value: "equipamiento", label: "Compra de Equipamiento" },
          { value: "refinanciamiento", label: "Refinanciamiento" },
          { value: "inventario", label: "Financiamiento de Inventario" },
          { value: "personal", label: "Gastos Personales" }
        ]
      },
      category: "basic",
      isActive: true,
      createdBy: "user-super-admin",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.productVariables.set(destino.id, destino);

    const monto: ProductVariable = {
      id: "var-monto",
      name: "monto",
      displayName: "Monto",
      description: "Rango de monto del crédito (Mínimo y Máximo)",
      variableType: "range",
      configuration: {
        min: 50000,
        max: 50000000,
        step: 10000,
        currency: "MXN",
        format: "currency"
      },
      category: "financial",
      isActive: true,
      createdBy: "user-super-admin",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.productVariables.set(monto.id, monto);

    const plazos: ProductVariable = {
      id: "var-plazos",
      name: "plazos",
      displayName: "Plazos",
      description: "Plazos disponibles para el crédito en meses",
      variableType: "select",
      configuration: {
        options: [
          { value: "6", label: "6 meses" },
          { value: "12", label: "12 meses" },
          { value: "18", label: "18 meses" },
          { value: "24", label: "24 meses" },
          { value: "36", label: "36 meses" },
          { value: "48", label: "48 meses" },
          { value: "60", label: "60 meses" }
        ],
        multiple: true
      },
      category: "financial",
      isActive: true,
      createdBy: "user-super-admin",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.productVariables.set(plazos.id, plazos);

    const comisionApertura: ProductVariable = {
      id: "var-comision-apertura",
      name: "comision_apertura",
      displayName: "Comisión por Apertura",
      description: "Porcentaje de comisión por apertura del crédito",
      variableType: "range",
      configuration: {
        min: 0,
        max: 10,
        step: 0.1,
        suffix: "%",
        format: "percentage"
      },
      category: "financial",
      isActive: true,
      createdBy: "user-super-admin",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.productVariables.set(comisionApertura.id, comisionApertura);

    const tasaInteres: ProductVariable = {
      id: "var-tasa-interes",
      name: "tasa_interes",
      displayName: "Tasa de Interés",
      description: "Rango de tasa de interés (Mínima y Máxima)",
      variableType: "range",
      configuration: {
        min: 8.0,
        max: 35.0,
        step: 0.1,
        suffix: "% anual",
        format: "percentage"
      },
      category: "financial",
      isActive: true,
      createdBy: "user-super-admin",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.productVariables.set(tasaInteres.id, tasaInteres);

    const garantias: ProductVariable = {
      id: "var-garantias",
      name: "garantias",
      displayName: "Garantías",
      description: "Tipos de garantías requeridas",
      variableType: "select",
      configuration: {
        options: [
          { value: "sin_garantia", label: "Sin Garantía" },
          { value: "garantia_liquida", label: "Garantía Líquida" },
          { value: "aval", label: "Aval" },
          { value: "hipotecaria", label: "Garantía Hipotecaria" },
          { value: "prendaria", label: "Garantía Prendaria" },
          { value: "fiduciaria", label: "Garantía Fiduciaria" }
        ],
        multiple: true
      },
      category: "requirements",
      isActive: true,
      createdBy: "user-super-admin",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.productVariables.set(garantias.id, garantias);

    const avales: ProductVariable = {
      id: "var-avales",
      name: "avales",
      displayName: "Avales",
      description: "Requisitos de avales para el crédito",
      variableType: "select",
      configuration: {
        options: [
          { value: "no_requerido", label: "No Requerido" },
          { value: "un_aval", label: "Un Aval" },
          { value: "dos_avales", label: "Dos Avales" },
          { value: "aval_solidario", label: "Aval Solidario" },
          { value: "aval_mancomunado", label: "Aval Mancomunado" }
        ]
      },
      category: "requirements",
      isActive: true,
      createdBy: "user-super-admin",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.productVariables.set(avales.id, avales);

    // Seed Products (simplified structure)
    const bcmCreditoSimple: Product = {
      id: "product-bcm-simple",
      institutionId: "fin-1", // Banco Comercial Mexicano
      name: "BCM Crédito Simple",
      description: "Producto básico de crédito simple para empresas de BCM",
      category: "business",
      availableVariables: {
        "var-tipo-credito": { required: true, defaultValue: "simple" },
        "var-destino": { required: true },
        "var-monto": { required: true, minValue: 50000, maxValue: 3000000 },
        "var-plazos": { required: true, allowedValues: ["12", "24", "36"] },
        "var-tasa-interes": { required: true, minValue: 14.5, maxValue: 25 },
        "var-comision-apertura": { required: true, defaultValue: 2.0 },
        "var-garantias": { required: true },
        "var-avales": { required: false, defaultValue: "no_requerido" }
      },
      configuration: {
        tasa_preferencial: 14.5,
        monto_maximo: 3000000,
        comision_especial: 2.0,
        score_minimo: 650,
        antiguedad_minima_meses: 6
      },
      requirements: {
        score_minimo: 650,
        antiguedad_minima_meses: 6
      },
      documents: ["rfc", "estados_financieros", "comprobante_ingresos", "referencias_comerciales"],
      isActive: true,
      createdBy: "user-super-admin",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.products.set(bcmCreditoSimple.id, bcmCreditoSimple);

    const pretmexPyme: Product = {
      id: "product-pretmex-pyme",
      institutionId: "fin-pretmex", // Pretmex
      name: "Pretmex PYME Plus",
      description: "Producto especializado para pequeñas y medianas empresas de Pretmex",
      category: "business",
      availableVariables: {
        "var-tipo-credito": { required: true, defaultValue: "pyme" },
        "var-destino": { required: true, allowedValues: ["capital_trabajo", "expansion", "equipamiento"] },
        "var-monto": { required: true, minValue: 100000, maxValue: 8000000 },
        "var-plazos": { required: true, allowedValues: ["12", "18", "24", "36", "48"] },
        "var-tasa-interes": { required: true, minValue: 17.5, maxValue: 30 },
        "var-comision-apertura": { required: true, defaultValue: 3.5 },
        "var-garantias": { required: true },
        "var-avales": { required: true, defaultValue: "un_aval" }
      },
      configuration: {
        tasa_preferencial: 17.5,
        monto_maximo: 8000000,
        comision_especial: 3.5,
        score_minimo: 700,
        antiguedad_minima_meses: 12
      },
      requirements: {
        score_minimo: 700,
        antiguedad_minima_meses: 12
      },
      documents: ["rfc", "estados_financieros", "flujo_efectivo", "comprobante_ingresos", "plan_negocio", "proyecciones_financieras"],
      isActive: true,
      createdBy: "user-super-admin",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.products.set(pretmexPyme.id, pretmexPyme);

    const konfioPyme: Product = {
      id: "product-konfio-pyme",
      institutionId: "fin-konfio", // Konfio
      name: "Konfio Capital Empresarial",
      description: "Solución de capital empresarial flexible de Konfio",
      category: "business",
      availableVariables: {
        "var-tipo-credito": { required: true, defaultValue: "pyme" },
        "var-destino": { required: true, allowedValues: ["capital_trabajo", "expansion", "equipamiento"] },
        "var-monto": { required: true, minValue: 100000, maxValue: 5000000 },
        "var-plazos": { required: true, allowedValues: ["12", "18", "24", "36", "48"] },
        "var-tasa-interes": { required: true, minValue: 19.0, maxValue: 30 },
        "var-comision-apertura": { required: true, defaultValue: 2.8 },
        "var-garantias": { required: true },
        "var-avales": { required: true, defaultValue: "un_aval" }
      },
      configuration: {
        tasa_preferencial: 19.0,
        monto_maximo: 5000000,
        comision_especial: 2.8,
        score_minimo: 700,
        antiguedad_minima_meses: 12
      },
      requirements: {
        score_minimo: 700,
        antiguedad_minima_meses: 12
      },
      documents: ["rfc", "estados_financieros", "comprobante_ingresos", "buro_comercial"],
      isActive: true,
      createdBy: "user-super-admin",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.products.set(konfioPyme.id, konfioPyme);

    // Seed sample product requests
    const sampleRequest: ProductRequest = {
      id: "request-sample-1",
      requestedBy: "user-luis-llano",
      institutionName: null,
      existingInstitutionId: "fin-1",
      productName: "BCM Crédito Automotriz",
      productDescription: "Producto de crédito especializado para compra de vehículos",
      businessJustification: "Varios clientes están solicitando financiamiento automotriz y BCM no tiene este producto disponible",
      estimatedVolume: "10-15 créditos mensuales",
      targetMarket: "Personas físicas con ingresos comprobables",
      desiredConfiguration: {
        monto_minimo: 50000,
        monto_maximo: 2000000,
        plazos: ["12", "24", "36", "48", "60"],
        tasa_base: 16.5,
        enganche_minimo: 15
      },
      status: "pending",
      reviewedBy: null,
      reviewNotes: null,
      reviewedAt: null,
      createdProductId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.productRequests.set(sampleRequest.id, sampleRequest);
  }

  // User operations
  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.email === email);
  }

  async createLocalUser(userData: { email: string; password: string; firstName: string; lastName: string; authMethod: string; role: string }): Promise<User> {
    const id = randomUUID();
    const user: User = {
      id,
      email: userData.email,
      password: userData.password,
      authMethod: userData.authMethod,
      firstName: userData.firstName,
      lastName: userData.lastName,
      role: userData.role,
      profileImageUrl: null,
      masterBrokerId: null,
      customLogo: null,
      brandName: null,
      primaryColor: null,
      secondaryColor: null,
      isWhiteLabel: false,
      autoRegisterBrokers: false,
      profileType: null,
      profileData: {},
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.users.set(id, user);
    return user;
  }

  async upsertUser(userData: UpsertUser, replitId?: string): Promise<User> {
    // If replitId is provided, use it as the user ID (for Replit Auth)
    if (replitId) {
      const existingUser = this.users.get(replitId);
      
      if (existingUser) {
        const updatedUser = {
          ...existingUser,
          ...userData,
          updatedAt: new Date(),
        };
        this.users.set(replitId, updatedUser);
        return updatedUser;
      }

      const user: User = {
        ...userData,
        id: replitId,
        email: userData.email ?? null,
        firstName: userData.firstName ?? null,
        lastName: userData.lastName ?? null,
        profileImageUrl: userData.profileImageUrl ?? null,
        masterBrokerId: userData.masterBrokerId ?? null,
        role: userData.role || "broker",
        customLogo: userData.customLogo ?? null,
        brandName: userData.brandName ?? null,
        primaryColor: userData.primaryColor ?? null,
        secondaryColor: userData.secondaryColor ?? null,
        isWhiteLabel: userData.isWhiteLabel ?? false,
        autoRegisterBrokers: userData.autoRegisterBrokers ?? false,
        profileType: userData.profileType ?? null,
        profileData: userData.profileData ?? {},
        isActive: userData.isActive ?? true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.users.set(replitId, user);
      return user;
    }

    // Regular behavior - find by email
    const existingUser = Array.from(this.users.values()).find(u => u.email === userData.email);
    
    if (existingUser) {
      const updatedUser = {
        ...existingUser,
        ...userData,
        updatedAt: new Date(),
      };
      this.users.set(existingUser.id, updatedUser);
      return updatedUser;
    }

    const id = randomUUID();
    const user: User = {
      ...userData,
      id,
      email: userData.email ?? null,
      firstName: userData.firstName ?? null,
      lastName: userData.lastName ?? null,
      profileImageUrl: userData.profileImageUrl ?? null,
      masterBrokerId: userData.masterBrokerId ?? null,
      role: userData.role || "broker",
      customLogo: userData.customLogo ?? null,
      brandName: userData.brandName ?? null,
      primaryColor: userData.primaryColor ?? null,
      secondaryColor: userData.secondaryColor ?? null,
      isWhiteLabel: userData.isWhiteLabel ?? false,
      autoRegisterBrokers: userData.autoRegisterBrokers ?? false,
      profileType: userData.profileType ?? null,
      profileData: userData.profileData ?? {},
      isActive: userData.isActive ?? true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.users.set(id, user);
    return user;
  }

  async updateUser(id: string, userData: Partial<UpsertUser>): Promise<User | undefined> {
    const existingUser = this.users.get(id);
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

    const updatedUser = {
      ...existingUser,
      ...userData,
      profileData: mergedProfileData,
      updatedAt: new Date(),
    };
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  async getUsersByMasterBroker(masterBrokerId: string): Promise<User[]> {
    return Array.from(this.users.values()).filter(u => u.masterBrokerId === masterBrokerId);
  }

  // Client operations
  async getClients(brokerId?: string): Promise<Client[]> {
    const allClients = Array.from(this.clients.values());
    return brokerId ? allClients.filter(c => c.brokerId === brokerId) : allClients;
  }

  async getClient(id: string): Promise<Client | undefined> {
    return this.clients.get(id);
  }

  async createClient(clientData: InsertClient): Promise<Client> {
    const id = randomUUID();
    const client: Client = {
      ...clientData,
      id,
      email: clientData.email ?? null,
      phone: clientData.phone ?? null,
      street: clientData.street ?? null,
      number: clientData.number ?? null,
      interior: clientData.interior ?? null,
      postalCode: clientData.postalCode ?? null,
      state: clientData.state ?? null,
      firstName: clientData.firstName ?? null,
      lastName: clientData.lastName ?? null,
      businessName: clientData.businessName ?? null,
      industry: clientData.industry ?? null,
      yearsInBusiness: clientData.yearsInBusiness ?? null,
      legalRepresentative: clientData.legalRepresentative ?? null,
      curp: clientData.curp ?? null,
      notes: clientData.notes ?? null,
      guarantors: clientData.guarantors || [],
      guarantees: clientData.guarantees || [],
      profilingData: clientData.profilingData ?? {},
      ingresoMensualPromedio: clientData.ingresoMensualPromedio ?? null,
      edadCliente: clientData.edadCliente ?? null,
      estadoCivil: clientData.estadoCivil ?? null,
      nivelEducativo: clientData.nivelEducativo ?? null,
      nivelEducacionAccionista: clientData.nivelEducacionAccionista ?? null,
      experienciaCrediticia: clientData.experienciaCrediticia ?? null,
      objetivoCredito: clientData.objetivoCredito ?? null,
      plazoDeseado: clientData.plazoDeseado ?? null,
      capacidadPago: clientData.capacidadPago ?? null,
      ingresosFamiliares: clientData.ingresosFamiliares ?? null,
      dependientesEconomicos: clientData.dependientesEconomicos ?? null,
      tipoVivienda: clientData.tipoVivienda ?? null,
      antiguedadEmpleo: clientData.antiguedadEmpleo ?? null,
      sectoreEconomico: clientData.sectoreEconomico ?? null,
      tiempoActividad: clientData.tiempoActividad ?? null,
      clientesBanco: clientData.clientesBanco ?? null,
      productosFinancieros: clientData.productosFinancieros ?? null,
      montoSolicitado: clientData.montoSolicitado ?? null,
      garantias: clientData.garantias ?? null,
      historialPagos: clientData.historialPagos ?? null,
      referenciasComerciales: clientData.referenciasComerciales ?? null,
      egresoMensualPromedio: clientData.egresoMensualPromedio ?? null,
      ingresoAnual: clientData.ingresoAnual ?? null,
      participacionVentasGobierno: clientData.participacionVentasGobierno ?? null,
      ventasTerminalBancaria: clientData.ventasTerminalBancaria ?? null,
      buroAccionistaPrincipal: clientData.buroAccionistaPrincipal ?? null,
      buroEmpresa: clientData.buroEmpresa ?? null,
      atrasosDeudas: clientData.atrasosDeudas ?? null,
      atrasosDetalles: clientData.atrasosDetalles ?? null,
      garantia: clientData.garantia ?? null,
      garantiaDetalles: clientData.garantiaDetalles ?? {},
      avalObligadoSolidario: clientData.avalObligadoSolidario ?? null,
      satCiec: clientData.satCiec ?? null,
      estadosFinancieros: clientData.estadosFinancieros ?? null,
      opinionCumplimiento: clientData.opinionCumplimiento ?? null,
      opinionDetalles: clientData.opinionDetalles ?? null,
      creditosVigentes: clientData.creditosVigentes ?? null,
      creditosVigentesDetalles: clientData.creditosVigentesDetalles ?? [],
      puesto: clientData.puesto ?? null,
      antiguedadLaboral: clientData.antiguedadLaboral ?? null,
      ingresoMensualPromedioComprobables: clientData.ingresoMensualPromedioComprobables ?? null,
      ingresoMensualPromedioNoComprobables: clientData.ingresoMensualPromedioNoComprobables ?? null,
      gastosFijosMensualesPromedio: clientData.gastosFijosMensualesPromedio ?? null,
      buroPersonaFisica: clientData.buroPersonaFisica ?? null,
      atrasosDeudasBuro: clientData.atrasosDeudasBuro ?? null,
      atrasosDeudasBuroDetalles: clientData.atrasosDeudasBuroDetalles ?? null,
      cuentaConGarantiaFisica: clientData.cuentaConGarantiaFisica ?? null,
      garantiaFisicaDetalles: clientData.garantiaFisicaDetalles ?? {},
      tieneAvalObligadoSolidarioFisica: clientData.tieneAvalObligadoSolidarioFisica ?? null,
      creditosVigentesFisica: clientData.creditosVigentesFisica ?? null,
      creditosVigentesFisicaDetalles: clientData.creditosVigentesFisicaDetalles ?? [],
      observacionesAdicionalesFisica: clientData.observacionesAdicionalesFisica ?? null,
      nombreComercial: clientData.nombreComercial ?? null,
      ocupacion: clientData.ocupacion ?? null,
      direccionNegocioAplica: clientData.direccionNegocioAplica ?? null,
      esMismaDireccionNegocio: clientData.esMismaDireccionNegocio ?? null,
      calleNegocio: clientData.calleNegocio ?? null,
      numeroNegocio: clientData.numeroNegocio ?? null,
      interiorNegocio: clientData.interiorNegocio ?? null,
      codigoPostalNegocio: clientData.codigoPostalNegocio ?? null,
      estadoNegocio: clientData.estadoNegocio ?? null,
      ingresoMensualPromedioComprobablesSinSat: clientData.ingresoMensualPromedioComprobablesSinSat ?? null,
      ingresoMensualPromedioNoComprobablesSinSat: clientData.ingresoMensualPromedioNoComprobablesSinSat ?? null,
      gastosFijosMensualesPromedioSinSat: clientData.gastosFijosMensualesPromedioSinSat ?? null,
      buroPersonaFisicaSinSat: clientData.buroPersonaFisicaSinSat ?? null,
      atrasosDeudasBuroSinSat: clientData.atrasosDeudasBuroSinSat ?? null,
      atrasosDeudasBuroDetallesSinSat: clientData.atrasosDeudasBuroDetallesSinSat ?? null,
      cuentaConGarantiaSinSat: clientData.cuentaConGarantiaSinSat ?? null,
      garantiaSinSatDetalles: clientData.garantiaSinSatDetalles ?? {},
      tieneAvalObligadoSolidarioSinSat: clientData.tieneAvalObligadoSolidarioSinSat ?? null,
      creditosVigentesSinSat: clientData.creditosVigentesSinSat ?? null,
      creditosVigentesSinSatDetalles: clientData.creditosVigentesSinSatDetalles ?? [],
      observacionesAdicionalesSinSat: clientData.observacionesAdicionalesSinSat ?? null,
      isActive: clientData.isActive ?? true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.clients.set(id, client);
    return client;
  }

  async updateClient(id: string, clientData: Partial<InsertClient>): Promise<Client | undefined> {
    const existing = this.clients.get(id);
    if (!existing) return undefined;

    const updated = {
      ...existing,
      ...clientData,
      updatedAt: new Date(),
    };
    this.clients.set(id, updated);
    return updated;
  }

  async deleteClient(id: string): Promise<boolean> {
    return this.clients.delete(id);
  }

  // Client Credit History operations
  async createClientCreditHistory(historyData: InsertClientCreditHistory): Promise<ClientCreditHistory> {
    const id = `history-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const history: ClientCreditHistory = {
      id,
      ...historyData,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.clientCreditHistories.set(id, history);
    return history;
  }

  async getClientCreditHistories(clientId: string): Promise<ClientCreditHistory[]> {
    return Array.from(this.clientCreditHistories.values())
      .filter(history => history.clientId === clientId);
  }

  // Credit operations
  async getCredits(filters?: { brokerId?: string; clientId?: string; status?: string; statuses?: string[]; from?: Date; to?: Date }): Promise<Credit[]> {
    let credits = Array.from(this.credits.values());
    
    // Backward compatibility: convert status to statuses
    const normalizedStatuses = filters?.statuses || (filters?.status ? [filters.status] : undefined);
    
    if (filters?.brokerId) {
      credits = credits.filter(c => c.brokerId === filters.brokerId);
    }
    if (filters?.clientId) {
      credits = credits.filter(c => c.clientId === filters.clientId);
    }
    if (normalizedStatuses && normalizedStatuses.length > 0) {
      credits = credits.filter(c => normalizedStatuses.includes(c.status));
    }
    if (filters?.from) {
      credits = credits.filter(c => c.createdAt && new Date(c.createdAt) >= filters.from!);
    }
    if (filters?.to) {
      credits = credits.filter(c => c.createdAt && new Date(c.createdAt) <= filters.to!);
    }
    
    return credits.sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
  }

  async getCredit(id: string): Promise<Credit | undefined> {
    return this.credits.get(id);
  }

  async createCredit(creditData: InsertCredit): Promise<Credit> {
    const id = randomUUID();
    const credit: Credit = {
      ...creditData,
      id,
      financialInstitutionId: creditData.financialInstitutionId ?? null,
      interestRate: creditData.interestRate ?? null,
      term: creditData.term ?? null,
      frequency: creditData.frequency ?? null,
      startDate: creditData.startDate ?? null,
      endDate: creditData.endDate ?? null,
      paymentAmount: creditData.paymentAmount ?? null,
      remainingBalance: creditData.remainingBalance ?? null,
      notes: creditData.notes ?? null,
      status: creditData.status || 'draft',
      paymentHistory: creditData.paymentHistory || [],
      amortizationTable: creditData.amortizationTable || [],
      documents: creditData.documents || [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.credits.set(id, credit);
    return credit;
  }

  async updateCredit(id: string, creditData: Partial<InsertCredit>): Promise<Credit | undefined> {
    const existing = this.credits.get(id);
    if (!existing) return undefined;

    const updated = {
      ...existing,
      ...creditData,
      updatedAt: new Date(),
    };
    this.credits.set(id, updated);
    return updated;
  }

  async getCreditsByStatus(status: string): Promise<Credit[]> {
    return Array.from(this.credits.values()).filter(c => c.status === status);
  }

  async getExpiringCredits(days: number): Promise<Credit[]> {
    const now = new Date();
    const futureDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    
    return Array.from(this.credits.values()).filter(c => {
      if (!c.endDate || c.status !== 'active') return false;
      const endDate = new Date(c.endDate);
      return endDate <= futureDate && endDate >= now;
    });
  }

  async countCreditsByStatus(filters: { brokerId?: string; masterBrokerId?: string; includeNetwork?: boolean; statuses?: string[] }): Promise<number> {
    let credits = Array.from(this.credits.values());
    
    // Filter by broker or master broker network
    if (filters.brokerId) {
      credits = credits.filter(c => c.brokerId === filters.brokerId);
    } else if (filters.masterBrokerId) {
      if (filters.includeNetwork) {
        // Get all brokers in the network
        const networkBrokers = await this.getUsersByMasterBroker(filters.masterBrokerId);
        const brokerIds = [...networkBrokers.map(b => b.id), filters.masterBrokerId];
        credits = credits.filter(c => brokerIds.includes(c.brokerId));
      } else {
        // Only master broker's own credits
        credits = credits.filter(c => c.brokerId === filters.masterBrokerId);
      }
    }
    
    // Filter by statuses
    if (filters.statuses && filters.statuses.length > 0) {
      credits = credits.filter(c => filters.statuses!.includes(c.status));
    }
    
    return credits.length;
  }

  async sumCreditAmounts(filters: { brokerId?: string; masterBrokerId?: string; includeNetwork?: boolean; statuses?: string[]; from?: Date; to?: Date }): Promise<string> {
    let credits = Array.from(this.credits.values());
    
    // Filter by broker or master broker network
    if (filters.brokerId) {
      credits = credits.filter(c => c.brokerId === filters.brokerId);
    } else if (filters.masterBrokerId) {
      if (filters.includeNetwork) {
        // Get all brokers in the network
        const networkBrokers = await this.getUsersByMasterBroker(filters.masterBrokerId);
        const brokerIds = [...networkBrokers.map(b => b.id), filters.masterBrokerId];
        credits = credits.filter(c => brokerIds.includes(c.brokerId));
      } else {
        // Only master broker's own credits
        credits = credits.filter(c => c.brokerId === filters.masterBrokerId);
      }
    }
    
    // Filter by statuses
    if (filters.statuses && filters.statuses.length > 0) {
      credits = credits.filter(c => filters.statuses!.includes(c.status));
    }
    
    // Filter by date range
    if (filters.from) {
      credits = credits.filter(c => c.createdAt && new Date(c.createdAt) >= filters.from!);
    }
    if (filters.to) {
      credits = credits.filter(c => c.createdAt && new Date(c.createdAt) <= filters.to!);
    }
    
    // Sum amounts (return as string for decimal precision)
    const total = credits.reduce((sum, credit) => sum + parseFloat(credit.amount || '0'), 0);
    return total.toFixed(2);
  }

  // Financial Institution operations
  async getFinancialInstitutions(userId?: string): Promise<FinancialInstitution[]> {
    let institutions = Array.from(this.financialInstitutions.values()).filter(f => f.isActive);
    
    if (userId) {
      // Return admin-created institutions and user's own institutions
      institutions = institutions.filter(f => 
        f.createdByAdmin || f.createdBy === userId
      );
    }
    
    return institutions;
  }

  async getFinancialInstitution(id: string): Promise<FinancialInstitution | undefined> {
    return this.financialInstitutions.get(id);
  }

  async createFinancialInstitution(institutionData: InsertFinancialInstitution): Promise<FinancialInstitution> {
    const id = randomUUID();
    const institution: FinancialInstitution = {
      ...institutionData,
      id,
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
    };
    this.financialInstitutions.set(id, institution);
    return institution;
  }

  async updateFinancialInstitution(id: string, institutionData: Partial<InsertFinancialInstitution>): Promise<FinancialInstitution | undefined> {
    const existing = this.financialInstitutions.get(id);
    if (!existing) return undefined;

    const updated = {
      ...existing,
      ...institutionData,
      openingCommissionRate: institutionData.openingCommissionRate !== undefined ? 
        (institutionData.openingCommissionRate ? String(institutionData.openingCommissionRate) : null) : existing.openingCommissionRate,
      overrateCommissionRate: institutionData.overrateCommissionRate !== undefined ? 
        (institutionData.overrateCommissionRate ? String(institutionData.overrateCommissionRate) : null) : existing.overrateCommissionRate,
      masterBrokerCommissionRate: institutionData.masterBrokerCommissionRate !== undefined ? 
        (institutionData.masterBrokerCommissionRate ? String(institutionData.masterBrokerCommissionRate) : null) : existing.masterBrokerCommissionRate,
      brokerCommissionRate: institutionData.brokerCommissionRate !== undefined ? 
        (institutionData.brokerCommissionRate ? String(institutionData.brokerCommissionRate) : null) : existing.brokerCommissionRate,
      updatedAt: new Date(),
    };
    this.financialInstitutions.set(id, updated);
    return updated;
  }

  // Commission operations
  async getCommissions(filtersOrBrokerId?: { brokerId?: string; masterBrokerId?: string; includeNetwork?: boolean; status?: string; from?: Date; to?: Date } | string): Promise<Commission[]> {
    let commissions = Array.from(this.commissions.values());
    
    // Backward compatibility: handle string brokerId parameter
    const filters = typeof filtersOrBrokerId === 'string' 
      ? { brokerId: filtersOrBrokerId } 
      : filtersOrBrokerId;
    
    if (!filters) return commissions;
    
    // Filter by broker or master broker network
    if (filters.brokerId) {
      commissions = commissions.filter(c => c.brokerId === filters.brokerId);
    } else if (filters.masterBrokerId) {
      if (filters.includeNetwork) {
        // Get all brokers in the network
        const networkBrokers = await this.getUsersByMasterBroker(filters.masterBrokerId);
        const brokerIds = [...networkBrokers.map(b => b.id), filters.masterBrokerId];
        commissions = commissions.filter(c => brokerIds.includes(c.brokerId));
      } else {
        // Only master broker's own commissions
        commissions = commissions.filter(c => c.brokerId === filters.masterBrokerId);
      }
    }
    
    // Filter by status
    if (filters.status) {
      commissions = commissions.filter(c => c.status === filters.status);
    }
    
    // Filter by date range
    if (filters.from) {
      commissions = commissions.filter(c => c.createdAt && new Date(c.createdAt) >= filters.from!);
    }
    if (filters.to) {
      commissions = commissions.filter(c => c.createdAt && new Date(c.createdAt) <= filters.to!);
    }
    
    return commissions;
  }

  async createCommission(commissionData: InsertCommission): Promise<Commission> {
    const id = randomUUID();
    const commission: Commission = {
      ...commissionData,
      id,
      masterBrokerId: commissionData.masterBrokerId ?? null,
      brokerShare: commissionData.brokerShare ?? null,
      masterBrokerShare: commissionData.masterBrokerShare ?? null,
      appShare: commissionData.appShare ?? null,
      paidAt: commissionData.paidAt ?? null,
      status: commissionData.status || 'pending',
      createdAt: new Date(),
    };
    this.commissions.set(id, commission);
    return commission;
  }

  async updateCommission(id: string, commissionData: Partial<InsertCommission>): Promise<Commission | undefined> {
    const existing = this.commissions.get(id);
    if (!existing) return undefined;

    const updated = {
      ...existing,
      ...commissionData,
    };
    this.commissions.set(id, updated);
    return updated;
  }

  // Notification operations
  async getNotifications(userId: string): Promise<Notification[]> {
    return Array.from(this.notifications.values())
      .filter(n => n.userId === userId)
      .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
  }

  async createNotification(notificationData: InsertNotification): Promise<Notification> {
    const id = randomUUID();
    const notification: Notification = {
      ...notificationData,
      id,
      data: notificationData.data || {},
      isRead: notificationData.isRead ?? false,
      priority: notificationData.priority || "normal",
      createdAt: new Date(),
    };
    this.notifications.set(id, notification);
    return notification;
  }

  async markNotificationAsRead(id: string): Promise<boolean> {
    const notification = this.notifications.get(id);
    if (!notification) return false;

    notification.isRead = true;
    this.notifications.set(id, notification);
    return true;
  }

  async getUnreadNotificationCount(userId: string): Promise<number> {
    return Array.from(this.notifications.values())
      .filter(n => n.userId === userId && !n.isRead).length;
  }

  // Document operations
  async getDocuments(filters?: { clientId?: string; creditId?: string; brokerId?: string }): Promise<Document[]> {
    let documents = Array.from(this.documents.values());
    
    if (filters?.clientId) {
      documents = documents.filter(d => d.clientId === filters.clientId);
    }
    if (filters?.creditId) {
      documents = documents.filter(d => d.creditId === filters.creditId);
    }
    if (filters?.brokerId) {
      documents = documents.filter(d => d.brokerId === filters.brokerId);
    }
    
    return documents.sort((a, b) => new Date(b.uploadedAt!).getTime() - new Date(a.uploadedAt!).getTime());
  }

  async createDocument(documentData: InsertDocument): Promise<Document> {
    const id = randomUUID();
    const document: Document = {
      ...documentData,
      id,
      clientId: documentData.clientId ?? null,
      creditId: documentData.creditId ?? null,
      brokerId: documentData.brokerId ?? null,
      fileSize: documentData.fileSize ?? null,
      mimeType: documentData.mimeType ?? null,
      expiresAt: documentData.expiresAt ?? null,
      extractedData: documentData.extractedData || {},
      isValid: documentData.isValid ?? true,
      uploadedAt: new Date(),
    };
    this.documents.set(id, document);
    return document;
  }

  async updateDocument(id: string, documentData: Partial<InsertDocument>): Promise<Document | undefined> {
    const existing = this.documents.get(id);
    if (!existing) return undefined;

    const updated = {
      ...existing,
      ...documentData,
    };
    this.documents.set(id, updated);
    return updated;
  }

  async deleteDocument(id: string): Promise<boolean> {
    return this.documents.delete(id);
  }

  // Tenant operations
  async getTenants(): Promise<Tenant[]> {
    return Array.from(this.tenants.values())
      .sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return aTime - bTime;
      });
  }

  async getTenant(id: string): Promise<Tenant | undefined> {
    return this.tenants.get(id);
  }

  async getTenantBySlug(slug: string): Promise<Tenant | undefined> {
    return Array.from(this.tenants.values()).find(t => t.slug === slug);
  }

  async createTenant(tenantData: InsertTenant): Promise<Tenant> {
    // Check slug uniqueness
    const existingTenant = await this.getTenantBySlug(tenantData.slug);
    if (existingTenant) {
      throw new Error(`Tenant with slug '${tenantData.slug}' already exists`);
    }
    
    const id = randomUUID();
    const tenant: Tenant = {
      ...tenantData,
      id,
      parentTenantId: tenantData.parentTenantId ?? null,
      settings: tenantData.settings || {},
      isActive: tenantData.isActive ?? true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.tenants.set(id, tenant);
    return tenant;
  }

  async updateTenant(id: string, tenantData: Partial<InsertTenant>): Promise<Tenant | undefined> {
    const existing = this.tenants.get(id);
    if (!existing) return undefined;

    // Check slug uniqueness if slug is being updated
    if (tenantData.slug && tenantData.slug !== existing.slug) {
      const existingWithSlug = await this.getTenantBySlug(tenantData.slug);
      if (existingWithSlug && existingWithSlug.id !== id) {
        throw new Error(`Tenant with slug '${tenantData.slug}' already exists`);
      }
    }

    const updated = {
      ...existing,
      ...tenantData,
      updatedAt: new Date(),
    };
    this.tenants.set(id, updated);
    return updated;
  }

  async deleteTenant(id: string): Promise<boolean> {
    return this.tenants.delete(id);
  }

  async getTenantsByParent(parentTenantId: string): Promise<Tenant[]> {
    return Array.from(this.tenants.values())
      .filter(t => t.parentTenantId === parentTenantId)
      .sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return aTime - bTime;
      });
  }

  // Tenant Member operations
  async getTenantMembers(tenantId?: string): Promise<TenantMember[]> {
    let members = Array.from(this.tenantMembers.values());
    
    if (tenantId) {
      members = members.filter(m => m.tenantId === tenantId);
    }
    
    return members.sort((a, b) => {
      const aTime = a.joinedAt ? new Date(a.joinedAt).getTime() : 0;
      const bTime = b.joinedAt ? new Date(b.joinedAt).getTime() : 0;
      return aTime - bTime;
    });
  }

  async getTenantMember(id: string): Promise<TenantMember | undefined> {
    return this.tenantMembers.get(id);
  }

  async createTenantMember(tenantMemberData: InsertTenantMember): Promise<TenantMember> {
    const id = randomUUID();
    const tenantMember: TenantMember = {
      ...tenantMemberData,
      id,
      isActive: tenantMemberData.isActive ?? true,
      joinedAt: new Date(),
      updatedAt: new Date(),
    };
    this.tenantMembers.set(id, tenantMember);
    return tenantMember;
  }

  async updateTenantMember(id: string, tenantMemberData: Partial<InsertTenantMember>): Promise<TenantMember | undefined> {
    const existing = this.tenantMembers.get(id);
    if (!existing) return undefined;

    const updated = {
      ...existing,
      ...tenantMemberData,
    };
    this.tenantMembers.set(id, updated);
    return updated;
  }

  async deleteTenantMember(id: string): Promise<boolean> {
    return this.tenantMembers.delete(id);
  }

  async getTenantMembersByUser(userId: string): Promise<TenantMember[]> {
    return Array.from(this.tenantMembers.values())
      .filter(m => m.userId === userId)
      .sort((a, b) => {
        const aTime = a.joinedAt ? new Date(a.joinedAt).getTime() : 0;
        const bTime = b.joinedAt ? new Date(b.joinedAt).getTime() : 0;
        return aTime - bTime;
      });
  }

  async getUserTenantMembership(userId: string, tenantId: string): Promise<TenantMember | undefined> {
    return Array.from(this.tenantMembers.values())
      .find(m => m.userId === userId && m.tenantId === tenantId);
  }

  // Product Variables operations
  async getProductVariables(): Promise<ProductVariable[]> {
    return Array.from(this.productVariables.values())
      .sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return aTime - bTime;
      });
  }

  async getProductVariable(id: string): Promise<ProductVariable | undefined> {
    return this.productVariables.get(id);
  }

  async getProductVariableByName(name: string): Promise<ProductVariable | undefined> {
    return Array.from(this.productVariables.values())
      .find(v => v.name === name);
  }

  async createProductVariable(variableData: InsertProductVariable): Promise<ProductVariable> {
    const id = randomUUID();
    const productVariable: ProductVariable = {
      ...variableData,
      id,
      description: variableData.description ?? null,
      category: variableData.category ?? null,
      configuration: variableData.configuration ?? {},
      isActive: variableData.isActive ?? true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.productVariables.set(id, productVariable);
    return productVariable;
  }

  async updateProductVariable(id: string, variableData: Partial<InsertProductVariable>): Promise<ProductVariable | undefined> {
    const existing = this.productVariables.get(id);
    if (!existing) return undefined;

    const updated: ProductVariable = {
      ...existing,
      ...variableData,
      updatedAt: new Date(),
    };
    this.productVariables.set(id, updated);
    return updated;
  }

  async deleteProductVariable(id: string): Promise<boolean> {
    return this.productVariables.delete(id);
  }

  // Product Templates operations
  async getProductTemplates(): Promise<ProductTemplate[]> {
    return Array.from(this.productTemplates.values())
      .sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return aTime - bTime;
      });
  }

  async getProductTemplate(id: string): Promise<ProductTemplate | undefined> {
    return this.productTemplates.get(id);
  }

  async createProductTemplate(templateData: InsertProductTemplate): Promise<ProductTemplate> {
    const id = randomUUID();
    const productTemplate: ProductTemplate = {
      ...templateData,
      id,
      description: templateData.description ?? null,
      category: templateData.category ?? null,
      availableVariables: templateData.availableVariables ?? {},
      baseConfiguration: templateData.baseConfiguration ?? {},
      isActive: templateData.isActive ?? true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.productTemplates.set(id, productTemplate);
    return productTemplate;
  }

  async updateProductTemplate(id: string, templateData: Partial<InsertProductTemplate>): Promise<ProductTemplate | undefined> {
    const existing = this.productTemplates.get(id);
    if (!existing) return undefined;

    const updated: ProductTemplate = {
      ...existing,
      ...templateData,
      updatedAt: new Date(),
    };
    this.productTemplates.set(id, updated);
    return updated;
  }

  async deleteProductTemplate(id: string): Promise<boolean> {
    return this.productTemplates.delete(id);
  }

  // Institution Products operations
  async getInstitutionProducts(institutionId?: string): Promise<InstitutionProductWithTemplate[]> {
    let products = Array.from(this.institutionProducts.values());
    
    if (institutionId) {
      products = products.filter(p => p.institutionId === institutionId);
    }
    
    // Join with template data
    const productsWithTemplate: InstitutionProductWithTemplate[] = products.map(product => {
      const template = this.productTemplates.get(product.templateId);
      return {
        ...product,
        template: template ? {
          id: template.id,
          name: template.name,
          description: template.description,
          category: template.category,
          targetProfiles: template.targetProfiles || [],
          availableVariables: template.availableVariables,
          baseConfiguration: template.baseConfiguration,
          isActive: template.isActive,
        } : null,
      };
    });
    
    return productsWithTemplate.sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return aTime - bTime;
    });
  }

  async getInstitutionProduct(id: string): Promise<InstitutionProduct | undefined> {
    return this.institutionProducts.get(id);
  }

  async getInstitutionProductsByTemplate(templateId: string): Promise<InstitutionProduct[]> {
    return Array.from(this.institutionProducts.values())
      .filter(p => p.templateId === templateId)
      .sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return aTime - bTime;
      });
  }

  async createInstitutionProduct(productData: InsertInstitutionProduct): Promise<InstitutionProduct> {
    const id = randomUUID();
    const institutionProduct: InstitutionProduct = {
      ...productData,
      id,
      customName: productData.customName ?? null,
      configuration: productData.configuration ?? {},
      activeVariables: productData.activeVariables ?? {},
      isActive: productData.isActive ?? true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.institutionProducts.set(id, institutionProduct);
    return institutionProduct;
  }

  async updateInstitutionProduct(id: string, productData: Partial<InsertInstitutionProduct>): Promise<InstitutionProduct | undefined> {
    const existing = this.institutionProducts.get(id);
    if (!existing) return undefined;

    const updated: InstitutionProduct = {
      ...existing,
      ...productData,
      updatedAt: new Date(),
    };
    this.institutionProducts.set(id, updated);
    return updated;
  }

  async deleteInstitutionProduct(id: string): Promise<boolean> {
    return this.institutionProducts.delete(id);
  }

  // Products operations (simplified - LEGACY)
  async getProducts(institutionId?: string): Promise<Product[]> {
    let products = Array.from(this.products.values());
    
    if (institutionId) {
      products = products.filter(p => p.institutionId === institutionId);
    }
    
    return products.sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return aTime - bTime;
    });
  }

  async getProduct(id: string): Promise<Product | undefined> {
    return this.products.get(id);
  }

  async createProduct(productData: InsertProduct): Promise<Product> {
    const id = randomUUID();
    const product: Product = {
      ...productData,
      id,
      description: productData.description ?? null,
      category: productData.category ?? null,
      availableVariables: productData.availableVariables ?? {},
      configuration: productData.configuration ?? {},
      requirements: productData.requirements ?? {},
      documents: productData.documents ?? [],
      isActive: productData.isActive ?? true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.products.set(id, product);
    return product;
  }

  async updateProduct(id: string, productData: Partial<InsertProduct>): Promise<Product | undefined> {
    const existing = this.products.get(id);
    if (!existing) return undefined;

    const updated: Product = {
      ...existing,
      ...productData,
      updatedAt: new Date(),
    };
    this.products.set(id, updated);
    return updated;
  }

  async deleteProduct(id: string): Promise<boolean> {
    return this.products.delete(id);
  }

  // Product Requests operations
  async getProductRequests(filters?: { status?: string; requestedBy?: string }): Promise<ProductRequest[]> {
    let requests = Array.from(this.productRequests.values());
    
    if (filters?.status) {
      requests = requests.filter(r => r.status === filters.status);
    }
    
    if (filters?.requestedBy) {
      requests = requests.filter(r => r.requestedBy === filters.requestedBy);
    }
    
    return requests.sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime; // Más recientes primero
    });
  }

  async getProductRequest(id: string): Promise<ProductRequest | undefined> {
    return this.productRequests.get(id);
  }

  async createProductRequest(requestData: InsertProductRequest): Promise<ProductRequest> {
    const id = randomUUID();
    const productRequest: ProductRequest = {
      ...requestData,
      id,
      institutionName: requestData.institutionName ?? null,
      existingInstitutionId: requestData.existingInstitutionId ?? null,
      productDescription: requestData.productDescription ?? null,
      businessJustification: requestData.businessJustification ?? null,
      estimatedVolume: requestData.estimatedVolume ?? null,
      targetMarket: requestData.targetMarket ?? null,
      desiredConfiguration: requestData.desiredConfiguration ?? {},
      status: requestData.status ?? "pending",
      reviewedBy: requestData.reviewedBy ?? null,
      reviewNotes: requestData.reviewNotes ?? null,
      reviewedAt: null, // Este campo se setea automáticamente cuando se revisa
      createdProductId: requestData.createdProductId ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.productRequests.set(id, productRequest);
    return productRequest;
  }

  async updateProductRequest(id: string, requestData: Partial<InsertProductRequest>): Promise<ProductRequest | undefined> {
    const existing = this.productRequests.get(id);
    if (!existing) return undefined;

    const updated: ProductRequest = {
      ...existing,
      ...requestData,
      updatedAt: new Date(),
    };
    this.productRequests.set(id, updated);
    return updated;
  }

  async deleteProductRequest(id: string): Promise<boolean> {
    return this.productRequests.delete(id);
  }

  // Financial Institution Requests operations
  async getFinancialInstitutionRequests(filters?: { status?: string; brokerId?: string }): Promise<FinancialInstitutionRequest[]> {
    let requests = Array.from(this.financialInstitutionRequests.values());
    
    if (filters?.status) {
      requests = requests.filter(r => r.status === filters.status);
    }
    
    if (filters?.brokerId) {
      requests = requests.filter(r => r.brokerId === filters.brokerId);
    }
    
    return requests.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getFinancialInstitutionRequest(id: string): Promise<FinancialInstitutionRequest | undefined> {
    return this.financialInstitutionRequests.get(id);
  }

  async createFinancialInstitutionRequest(requestData: InsertFinancialInstitutionRequest): Promise<FinancialInstitutionRequest> {
    const id = randomUUID();
    const request: FinancialInstitutionRequest = {
      ...requestData,
      id,
      contactName: requestData.contactName ?? null,
      contactEmail: requestData.contactEmail ?? null,
      contactPhone: requestData.contactPhone ?? null,
      status: "pending",
      adminNotes: null,
      reviewedBy: null,
      reviewedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.financialInstitutionRequests.set(id, request);
    return request;
  }

  async updateFinancialInstitutionRequest(id: string, requestData: Partial<FinancialInstitutionRequest>): Promise<FinancialInstitutionRequest | undefined> {
    const existing = this.financialInstitutionRequests.get(id);
    if (!existing) return undefined;

    const updated: FinancialInstitutionRequest = {
      ...existing,
      ...requestData,
      updatedAt: new Date(),
      // Update reviewedAt when status changes to approved/rejected
      reviewedAt: (requestData.status && requestData.status !== 'pending') 
        ? (requestData.reviewedAt || new Date()) 
        : existing.reviewedAt,
    };
    this.financialInstitutionRequests.set(id, updated);
    return updated;
  }

  /**
   * Migrates existing legacy products to the new 3-layer architecture
   * Converts Products → ProductTemplates → InstitutionProducts
   */
  private migrateExistingData() {
    // Skip migration if templates already exist (avoid duplicate migration)
    if (this.productTemplates.size > 0) {
      return;
    }

    console.log("🔄 Starting migration of legacy products to 3-layer architecture...");

    // Convert existing Products to ProductTemplates
    const legacyProducts = Array.from(this.products.values());
    
    legacyProducts.forEach(legacyProduct => {
      // Create generic ProductTemplate from legacy Product
      const template: ProductTemplate = {
        id: `template-${legacyProduct.id}`,
        name: legacyProduct.name,
        description: legacyProduct.description,
        category: legacyProduct.category,
        availableVariables: legacyProduct.availableVariables || {},
        baseConfiguration: legacyProduct.configuration || {},
        isActive: legacyProduct.isActive,
        createdBy: "user-super-admin", // System migration
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      this.productTemplates.set(template.id, template);
      console.log(`✅ Created ProductTemplate: ${template.name}`);

      // Create InstitutionProduct linking template to its institution
      if (legacyProduct.institutionId) {
        const institutionProduct: InstitutionProduct = {
          id: `inst-prod-${legacyProduct.id}`,
          templateId: template.id,
          institutionId: legacyProduct.institutionId,
          customName: legacyProduct.name, // Use same name initially
          configuration: legacyProduct.configuration || {},
          activeVariables: legacyProduct.availableVariables || {},
          isActive: legacyProduct.isActive,
          createdBy: "user-super-admin", // System migration
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        this.institutionProducts.set(institutionProduct.id, institutionProduct);
        console.log(`✅ Created InstitutionProduct: ${institutionProduct.customName} for institution ${legacyProduct.institutionId}`);
      }
    });

    console.log(`🎉 Migration completed! Created ${this.productTemplates.size} templates and ${this.institutionProducts.size} institution products`);
  }

  // Credit Submission Requests operations
  async getCreditSubmissionRequests(filters?: { status?: string; brokerId?: string; clientId?: string }): Promise<CreditSubmissionRequest[]> {
    let requests = Array.from(this.creditSubmissionRequests.values());
    
    if (filters?.status) {
      requests = requests.filter(r => r.status === filters.status);
    }
    
    if (filters?.brokerId) {
      requests = requests.filter(r => r.brokerId === filters.brokerId);
    }

    if (filters?.clientId) {
      requests = requests.filter(r => r.clientId === filters.clientId);
    }
    
    return requests.sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime; // Most recent first
    });
  }

  async getCreditSubmissionRequest(id: string): Promise<CreditSubmissionRequest | undefined> {
    return this.creditSubmissionRequests.get(id);
  }

  async createCreditSubmissionRequest(requestData: InsertCreditSubmissionRequest): Promise<CreditSubmissionRequest> {
    const id = randomUUID();
    const request: CreditSubmissionRequest = {
      ...requestData,
      id,
      purpose: requestData.purpose ?? null,
      brokerNotes: requestData.brokerNotes ?? null,
      status: requestData.status ?? "pending_admin",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.creditSubmissionRequests.set(id, request);
    return request;
  }

  async updateCreditSubmissionRequest(id: string, requestData: Partial<InsertCreditSubmissionRequest>): Promise<CreditSubmissionRequest | undefined> {
    const existing = this.creditSubmissionRequests.get(id);
    if (!existing) return undefined;

    const updated: CreditSubmissionRequest = {
      ...existing,
      ...requestData,
      updatedAt: new Date(),
    };
    this.creditSubmissionRequests.set(id, updated);
    return updated;
  }

  // Credit Submission Targets operations
  async getCreditSubmissionTargets(filters?: { requestId?: string; status?: string; financialInstitutionId?: string }): Promise<CreditSubmissionTarget[]> {
    let targets = Array.from(this.creditSubmissionTargets.values());
    
    if (filters?.requestId) {
      targets = targets.filter(t => t.requestId === filters.requestId);
    }
    
    if (filters?.status) {
      targets = targets.filter(t => t.status === filters.status);
    }
    
    if (filters?.financialInstitutionId) {
      targets = targets.filter(t => t.financialInstitutionId === filters.financialInstitutionId);
    }
    
    return targets;
  }

  async getCreditSubmissionTarget(id: string): Promise<CreditSubmissionTarget | undefined> {
    return this.creditSubmissionTargets.get(id);
  }

  async getCreditSubmissionTargetByCreditId(creditId: string): Promise<CreditSubmissionTarget | undefined> {
    return Array.from(this.creditSubmissionTargets.values()).find(target => target.creditId === creditId);
  }

  async getCreditSubmissionTargetsByRequest(requestId: string): Promise<CreditSubmissionTarget[]> {
    return Array.from(this.creditSubmissionTargets.values()).filter(target => target.requestId === requestId);
  }

  async createCreditSubmissionTarget(targetData: InsertCreditSubmissionTarget): Promise<CreditSubmissionTarget> {
    const id = randomUUID();
    const target: CreditSubmissionTarget = {
      ...targetData,
      id,
      status: targetData.status ?? "pending_admin",
      creditId: targetData.creditId ?? null,
      reviewedBy: targetData.reviewedBy ?? null,
      adminNotes: targetData.adminNotes ?? null,
      reviewedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.creditSubmissionTargets.set(id, target);
    return target;
  }

  async updateCreditSubmissionTarget(id: string, targetData: Partial<InsertCreditSubmissionTarget>): Promise<CreditSubmissionTarget | undefined> {
    const existing = this.creditSubmissionTargets.get(id);
    if (!existing) return undefined;

    const updated: CreditSubmissionTarget = {
      ...existing,
      ...targetData,
      updatedAt: new Date(),
    };
    this.creditSubmissionTargets.set(id, updated);
    return updated;
  }

  async approveCreditSubmissionTarget(targetId: string, adminId: string, adminNotes?: string, details?: string): Promise<CreditSubmissionTarget | undefined> {
    const existing = this.creditSubmissionTargets.get(targetId);
    if (!existing) return undefined;

    const updated: CreditSubmissionTarget = {
      ...existing,
      status: "approved",
      reviewedBy: adminId,
      adminNotes: adminNotes || null,
      details: details || null,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    };
    this.creditSubmissionTargets.set(targetId, updated);
    return updated;
  }

  async rejectCreditSubmissionTarget(targetId: string, adminId: string, adminNotes?: string): Promise<CreditSubmissionTarget | undefined> {
    const existing = this.creditSubmissionTargets.get(targetId);
    if (!existing) return undefined;

    const updated: CreditSubmissionTarget = {
      ...existing,
      status: "rejected",
      reviewedBy: adminId,
      adminNotes: adminNotes || null,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    };
    this.creditSubmissionTargets.set(targetId, updated);
    return updated;
  }

  async returnCreditSubmissionTargetToBroker(targetId: string, adminId: string, details?: string, adminNotes?: string): Promise<CreditSubmissionTarget | undefined> {
    const existing = this.creditSubmissionTargets.get(targetId);
    if (!existing) return undefined;

    const updated: CreditSubmissionTarget = {
      ...existing,
      status: "returned_to_broker",
      reviewedBy: adminId,
      adminNotes: adminNotes || null,
      details: details || null, // Comments for broker
      reviewedAt: new Date(),
      updatedAt: new Date(),
    };
    this.creditSubmissionTargets.set(targetId, updated);
    return updated;
  }

  // Configuration Tabs operations

}

// Import DbStorage (ready for future use)
import { DbStorage } from "./dbStorage";

// Switch to DbStorage for persistent data storage
export const storage = new DbStorage();

// Keep MemStorage available for fallback/testing if needed
export const memStorage = new MemStorage();

// DbStorage is now the primary storage system with PostgreSQL persistence
