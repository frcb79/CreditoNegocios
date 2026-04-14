import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import rateLimit from "express-rate-limit";
import { pool } from "./db";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import PDFDocument from "pdfkit";
import bcrypt from "bcrypt";
import { sendPasswordResetEmail } from "./emailService";
import { getDocumentAccessTarget, persistDocumentFile, removeStoredDocument } from "./documentStorage";
import { 
  generateFinancierasTemplate, 
  generateClientsTemplate, 
  previewExcelFile, 
  importFinancieras, 
  importClients 
} from "./excelImport";
import { 
  updatedInsertClientSchema, 
  insertCreditSchema, 
  insertFinancialInstitutionSchema,
  insertNotificationSchema,
  insertDocumentSchema,
  insertTenantSchema,
  insertTenantMemberSchema,
  insertProductVariableSchema,
  insertProductSchema,
  insertProductRequestSchema,
  insertProductTemplateSchema,
  insertInstitutionProductSchema,
  insertCreditSubmissionRequestSchema,
  insertCreditSubmissionTargetSchema,
  insertClientCreditHistorySchema,
  insertUserSchema,
  insertFinancialInstitutionRequestSchema
} from "@shared/schema";
import { z } from "zod";
import multer from "multer";
import path from "path";
import cron from "node-cron";
import { 
  tenantContextMiddleware, 
  requireTenantContext, 
  requireTenantMembership, 
  requireTenantRole,
  resolveTenantFromParam,
  resolveTenantFromQuery
} from "./middleware/tenantContext";

// Multer configuration for file uploads
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf|doc|docx/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos de imagen y documentos'));
    }
  }
});

// WebSocket clients
const wsClients = new Map<string, WebSocket>();

// Broadcast notification to user
function broadcastToUser(userId: string, notification: any) {
  const client = wsClients.get(userId);
  if (client && client.readyState === WebSocket.OPEN) {
    client.send(JSON.stringify(notification));
  }
}

// Authorization helper for broker-owned resources
// Validates that a user has permission to access a resource based on brokerId
async function authorizeBrokerResource(params: {
  currentUserId: string;
  resourceBrokerId: string;
  currentUserRole?: string;
}): Promise<{ authorized: boolean; reason?: string }> {
  const { currentUserId, resourceBrokerId, currentUserRole } = params;
  
  // Admins and super_admins have full access
  if (currentUserRole === 'admin' || currentUserRole === 'super_admin') {
    return { authorized: true };
  }
  
  // Same user owns the resource
  if (currentUserId === resourceBrokerId) {
    return { authorized: true };
  }
  
  // Master brokers can access resources owned by their network brokers
  if (currentUserRole === 'master_broker') {
    const resourceBroker = await storage.getUser(resourceBrokerId);
    if (resourceBroker && resourceBroker.masterBrokerId === currentUserId) {
      return { authorized: true };
    }
  }
  
  return { authorized: false, reason: 'Access denied. You can only access your own resources.' };
}

// Helper to check if user can access a client
async function authorizeClientAccess(userId: string, userRole: string, clientId: string): Promise<{ authorized: boolean; client?: any; reason?: string }> {
  const client = await storage.getClient(clientId);
  if (!client) {
    return { authorized: false, reason: 'Client not found' };
  }
  
  const authResult = await authorizeBrokerResource({
    currentUserId: userId,
    resourceBrokerId: client.brokerId,
    currentUserRole: userRole,
  });
  
  return { ...authResult, client };
}

// Helper to check if user can access a credit
async function authorizeCreditAccess(userId: string, userRole: string, creditId: string): Promise<{ authorized: boolean; credit?: any; reason?: string }> {
  const credit = await storage.getCredit(creditId);
  if (!credit) {
    return { authorized: false, reason: 'Credit not found' };
  }
  
  const authResult = await authorizeBrokerResource({
    currentUserId: userId,
    resourceBrokerId: credit.brokerId,
    currentUserRole: userRole,
  });
  
  return { ...authResult, credit };
}

// Helper to check if user can access a document
async function authorizeDocumentAccess(userId: string, userRole: string, documentId: string): Promise<{ authorized: boolean; document?: any; reason?: string }> {
  const document = await storage.getDocument(documentId);
  if (!document) {
    return { authorized: false, reason: 'Document not found' };
  }
  
  // Document has brokerId
  if (document.brokerId) {
    const authResult = await authorizeBrokerResource({
      currentUserId: userId,
      resourceBrokerId: document.brokerId,
      currentUserRole: userRole,
    });
    return { ...authResult, document };
  }
  
  // Document linked to client - check client ownership
  if (document.clientId) {
    const client = await storage.getClient(document.clientId);
    if (client) {
      const authResult = await authorizeBrokerResource({
        currentUserId: userId,
        resourceBrokerId: client.brokerId,
        currentUserRole: userRole,
      });
      return { ...authResult, document };
    }
  }
  
  // Admins can access orphan documents
  if (userRole === 'admin' || userRole === 'super_admin') {
    return { authorized: true, document };
  }
  
  return { authorized: false, document, reason: 'Access denied' };
}

// Helper function to enrich credit submission target with related data
async function enrichCreditSubmissionTarget(target: any) {
  const request = await storage.getCreditSubmissionRequest(target.requestId);
  if (!request) {
    return { ...target, request: null, broker: null, masterBroker: null, client: null, institution: null, productTemplate: null };
  }
  
  const broker = await storage.getUser(request.brokerId);
  const client = await storage.getClient(request.clientId);
  const institution = await storage.getFinancialInstitution(target.financialInstitutionId);
  
  let masterBroker = null;
  if (broker && broker.masterBrokerId) {
    masterBroker = await storage.getUser(broker.masterBrokerId);
  }
  
  let productTemplate = null;
  if (request.productTemplateId) {
    productTemplate = await storage.getProductTemplate(request.productTemplateId);
  }
  
  return {
    ...target,
    request: {
      ...request,
      broker,
      client
    },
    broker,
    masterBroker,
    client,
    institution,
    productTemplate
  };
}

// Authorization helpers for multi-tenant operations
async function authorizeTenantAccess(params: {
  userId: string;
  tenantId: string;
  requireRole?: ('owner' | 'admin' | 'member')[];
  allowSuperAdmin?: boolean;
}): Promise<{ hasAccess: boolean; userRole?: string; membership?: any }> {
  const { userId, tenantId, requireRole = ['member'], allowSuperAdmin = true } = params;
  
  const user = await storage.getUser(userId);
  
  // Platform-level access
  if (allowSuperAdmin && (user?.role === 'super_admin' || user?.role === 'admin')) {
    return { hasAccess: true, userRole: user.role };
  }
  
  // Tenant membership access
  const membership = await storage.getUserTenantMembership(userId, tenantId);
  if (!membership || !membership.isActive) {
    return { hasAccess: false };
  }
  
  const hasRequiredRole = requireRole.includes(membership.role as any);
  return { 
    hasAccess: hasRequiredRole, 
    userRole: user?.role, 
    membership 
  };
}

async function requirePlatformRole(userId: string, allowedRoles: string[]): Promise<boolean> {
  let user = await storage.getUser(userId);
  
  // Fallback: If user not found by ID, try to get super admin for development
  if (!user) {
    user = await storage.getUserByEmail("admin@brokerapp.mx");
  }
  
  return user ? allowedRoles.includes(user.role) : false;
}

// STP Payment simulation
async function processStpPayment(amount: string, accountNumber: string) {
  // Simulate STP payment processing
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  return {
    success: Math.random() > 0.1, // 90% success rate
    transactionId: `STP-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    amount,
    accountNumber,
    processedAt: new Date(),
  };
}

// OCR simulation for document processing
function simulateOcrProcessing(file: Express.Multer.File) {
  // Simulate OCR extraction based on file type
  const extractedData: any = {};
  
  if (file.originalname.toLowerCase().includes('rfc')) {
    extractedData.rfc = 'XAXX010101000';
    extractedData.name = 'Juan Pérez García';
  } else if (file.originalname.toLowerCase().includes('curp')) {
    extractedData.curp = 'PEGJ800101HDFRRN09';
    extractedData.name = 'Juan Pérez García';
    extractedData.birthDate = '1980-01-01';
  } else if (file.originalname.toLowerCase().includes('comprobante')) {
    extractedData.address = 'Av. Insurgentes Sur 123, Col. Roma Norte, CDMX';
    extractedData.name = 'Juan Pérez García';
  }
  
  return extractedData;
}

export async function registerRoutes(app: Express): Promise<Server> {
  app.get('/api/health', async (_req, res) => {
    try {
      await pool.query('select 1');

      res.json({
        status: 'ok',
        services: {
          api: 'ok',
          database: 'ok',
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      res.status(503).json({
        status: 'degraded',
        services: {
          api: 'ok',
          database: 'error',
        },
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Auth middleware
  await setupAuth(app);

  // Tenant context middleware - must be after auth setup
  app.use(tenantContextMiddleware);

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Rate limiters for auth endpoints
  const authLoginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Demasiados intentos. Intenta de nuevo en 15 minutos." },
  });

  const authMutationLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Demasiados intentos. Intenta de nuevo en 15 minutos." },
  });

  // Local authentication - Register
  const registerSchema = z.object({
    email: z.string().email("Email inválido"),
    password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
    firstName: z.string().min(1, "Nombre requerido"),
    lastName: z.string().min(1, "Apellido requerido"),
  });

  app.post('/api/auth/register', authMutationLimiter, async (req: any, res) => {
    try {
      const data = registerSchema.parse(req.body);
      
      // Check if email already exists
      const existingUser = await storage.getUserByEmail(data.email);
      if (existingUser) {
        return res.status(400).json({ message: "Este email ya está registrado" });
      }
      
      // Hash password
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(data.password, saltRounds);
      
      // Create user
      const user = await storage.createLocalUser({
        email: data.email,
        password: hashedPassword,
        firstName: data.firstName,
        lastName: data.lastName,
        authMethod: "local",
        role: "broker", // Default role for new registrations
      });
      
      // Create session for the new user
      req.login({ claims: { sub: user.id } }, (err: any) => {
        if (err) {
          console.error("Error creating session:", err);
          return res.status(500).json({ message: "Error al iniciar sesión" });
        }
        
        // Explicitly save session to ensure it's written to the store before responding
        req.session.save((saveErr: any) => {
          if (saveErr) {
            console.error("Error saving session:", saveErr);
            return res.status(500).json({ message: "Error al iniciar sesión" });
          }
          res.status(201).json({ 
            message: "Registro exitoso",
            user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role }
          });
        });
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Error in registration:", error);
      res.status(500).json({ message: "Error al registrar usuario" });
    }
  });

  // Local authentication - Login
  const loginSchema = z.object({
    email: z.string().email("Email inválido"),
    password: z.string().min(1, "Contraseña requerida"),
  });

  app.post('/api/auth/login', authLoginLimiter, async (req: any, res) => {
    try {
      const data = loginSchema.parse(req.body);
      
      // Find user by email
      const user = await storage.getUserByEmail(data.email);
      if (!user) {
        return res.status(401).json({ message: "Email o contraseña incorrectos" });
      }
      
      // Check if user uses local auth
      if (user.authMethod !== "local" || !user.password) {
        return res.status(401).json({ message: "Esta cuenta usa autenticación de Replit. Por favor inicia sesión con Replit." });
      }
      
      // Verify password
      const isValidPassword = await bcrypt.compare(data.password, user.password);
      if (!isValidPassword) {
        return res.status(401).json({ message: "Email o contraseña incorrectos" });
      }
      
      // Check if user is active
      if (!user.isActive) {
        return res.status(401).json({ message: "Tu cuenta ha sido desactivada. Contacta al administrador." });
      }
      
      // Create session
      req.login({ claims: { sub: user.id } }, (err: any) => {
        if (err) {
          console.error("Error creating session:", err);
          return res.status(500).json({ message: "Error al iniciar sesión" });
        }
        
        // Explicitly save session to ensure it's written to the store before responding
        req.session.save((saveErr: any) => {
          if (saveErr) {
            console.error("Error saving session:", saveErr);
            return res.status(500).json({ message: "Error al iniciar sesión" });
          }
          res.json({ 
            message: "Login exitoso",
            user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role }
          });
        });
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Error in login:", error);
      res.status(500).json({ message: "Error al iniciar sesión" });
    }
  });

  // Forgot Password - Request reset token
  const forgotPasswordSchema = z.object({
    email: z.string().email("Email inválido"),
  });

  app.post('/api/auth/forgot-password', authMutationLimiter, async (req, res) => {
    try {
      const data = forgotPasswordSchema.parse(req.body);
      
      // Find user by email
      const user = await storage.getUserByEmail(data.email);
      
      // Always return success to prevent email enumeration attacks
      if (!user) {
        return res.json({ 
          message: "Si el email existe en nuestro sistema, recibirás un enlace para restablecer tu contraseña.",
        });
      }
      
      // Check if user uses local auth
      if (user.authMethod !== "local") {
        return res.json({ 
          message: "Esta cuenta usa autenticación de Replit. Por favor inicia sesión con Replit.",
        });
      }
      
      // Generate secure token
      const crypto = await import('crypto');
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      
      // Save token to database
      await storage.setPasswordResetToken(user.id, resetToken, resetTokenExpiry);
      
      // Send password reset email
      const userName = user.firstName || undefined;
      const emailResult = await sendPasswordResetEmail(user.email, resetToken, userName);
      
      if (!emailResult.success) {
        console.error('Failed to send password reset email:', emailResult.error);
        // Still return success message to prevent email enumeration
      }
      
      res.json({ 
        message: "Si el email existe en nuestro sistema, recibirás un enlace para restablecer tu contraseña.",
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Error in forgot password:", error);
      res.status(500).json({ message: "Error al procesar la solicitud" });
    }
  });

  // Reset Password - Set new password with token
  const resetPasswordSchema = z.object({
    token: z.string().min(1, "Token requerido"),
    password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
  });

  app.post('/api/auth/reset-password', async (req, res) => {
    try {
      const data = resetPasswordSchema.parse(req.body);
      
      // Find user by reset token
      const user = await storage.getUserByResetToken(data.token);
      
      if (!user) {
        return res.status(400).json({ message: "Token inválido o expirado" });
      }
      
      // Check if token has expired
      if (!user.resetTokenExpiry || new Date() > new Date(user.resetTokenExpiry)) {
        return res.status(400).json({ message: "El token ha expirado. Por favor solicita uno nuevo." });
      }
      
      // Hash new password
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(data.password, saltRounds);
      
      // Update password and clear reset token
      await storage.updateUserPassword(user.id, hashedPassword);
      await storage.clearPasswordResetToken(user.id);
      
      res.json({ message: "Contraseña actualizada exitosamente. Ya puedes iniciar sesión." });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Error in reset password:", error);
      res.status(500).json({ message: "Error al restablecer la contraseña" });
    }
  });

  // User profile update
  app.put('/api/users/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      
      // Users can only update their own profile (unless admin)
      const currentUser = await storage.getUser(userId);
      
      if (!currentUser) {
        return res.status(401).json({ message: "User not found" });
      }
      
      const isAdmin = currentUser.role === 'admin' || currentUser.role === 'super_admin';
      
      if (id !== userId && !isAdmin) {
        return res.status(403).json({ message: "Unauthorized to update this profile" });
      }
      
      const userData = req.body;
      
      // Non-admins cannot change their own role
      if (!isAdmin && userData.role && userData.role !== currentUser.role) {
        return res.status(403).json({ message: "Cannot change your own role" });
      }
      
      const user = await storage.updateUser(id, userData);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      res.json(user);
    } catch (error) {
      console.error("Error updating user profile:", error);
      res.status(500).json({ message: "Failed to update user profile" });
    }
  });

  // Account deactivation request
  app.post('/api/users/:id/deactivation-request', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      
      // Users can only request deactivation for their own account
      if (id !== userId) {
        return res.status(403).json({ message: "Unauthorized to request deactivation for this account" });
      }
      
      const currentUser = await storage.getUser(userId);
      if (!currentUser) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Get all admins and super_admins to notify
      const allUsers = await storage.getUsers();
      const admins = allUsers.filter(u => u.role === 'admin' || u.role === 'super_admin');
      
      // Create notification for each admin
      const notificationPromises = admins.map(admin => 
        storage.createNotification({
          userId: admin.id,
          type: 'account_deactivation_request',
          title: 'Solicitud de Baja de Cuenta',
          message: `${currentUser.firstName} ${currentUser.lastName} (${currentUser.email}) ha solicitado dar de baja su cuenta.`,
          relatedEntityType: 'user',
          relatedEntityId: userId,
          metadata: {
            requestedBy: userId,
            requestedByName: `${currentUser.firstName} ${currentUser.lastName}`,
            requestedByEmail: currentUser.email,
            requestedAt: new Date().toISOString(),
          },
        })
      );
      
      await Promise.all(notificationPromises);
      
      res.json({ 
        success: true, 
        message: "Solicitud de baja enviada correctamente. Un administrador revisará tu solicitud." 
      });
    } catch (error) {
      console.error("Error creating deactivation request:", error);
      res.status(500).json({ message: "Failed to create deactivation request" });
    }
  });

  // Tenant Context Testing Endpoint
  app.get('/api/tenant-context', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || "user-super-admin";
      const user = await storage.getUser(userId);
      
      res.json({
        requestInfo: {
          method: req.method,
          path: req.path,
          headers: {
            'x-tenant-slug': req.headers['x-tenant-slug'],
          },
          query: req.query,
          params: req.params,
        },
        tenantContext: req.tenantContext,
        userInfo: {
          userId,
          userRole: user?.role,
          isPlatformAdmin: req.tenantContext?.isPlatformAdmin,
        },
        resolutionSources: {
          headerSlug: req.headers['x-tenant-slug'],
          querySlug: req.query.slug,
          pathParams: Object.keys(req.params).length > 0 ? req.params : null,
        },
        debug: {
          middlewareApplied: 'tenantContextMiddleware',
          timestamp: new Date().toISOString(),
        }
      });
    } catch (error) {
      console.error("Error in tenant context test endpoint:", error);
      res.status(500).json({ 
        message: "Internal server error",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Dashboard metrics with role-based data and trends
  app.get('/api/dashboard/metrics', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const isAdmin = user.role === 'admin' || user.role === 'super_admin';
      const isMasterBroker = user.role === 'master_broker';
      const isBroker = user.role === 'broker';
      
      // Date ranges for trends
      const now = new Date();
      const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      
      // Pipeline statuses
      const pipelineStatuses = ['submitted', 'under_review', 'approved'];
      const disbursedStatuses = ['disbursed', 'active'];
      
      let metrics: any = {
        role: user.role,
      };
      
      if (isBroker || isMasterBroker || isAdmin) {
        // Broker metrics (for broker and master_broker roles)
        const brokerId = (isBroker || isMasterBroker) ? userId : undefined;
        
        // Pipeline count (current month) - with date filter to match trend comparison
        const pipelineCount = (await storage.getCredits({
          brokerId,
          statuses: pipelineStatuses,
          from: currentMonthStart,
        })).length;
        
        // Pipeline count (last month) for trend
        const lastMonthPipeline = (await storage.getCredits({
          brokerId,
          statuses: pipelineStatuses,
          from: lastMonthStart,
          to: lastMonthEnd,
        })).length;
        
        // Disbursed credits (current month) - with date filter to match trend comparison
        const disbursedCount = (await storage.getCredits({
          brokerId,
          statuses: disbursedStatuses,
          from: currentMonthStart,
        })).length;
        
        // Disbursed volume (current month)
        const disbursedVolume = await storage.sumCreditAmounts({
          brokerId,
          statuses: disbursedStatuses,
          from: currentMonthStart,
        });
        
        // Disbursed volume (last month) for trend
        const lastMonthVolume = await storage.sumCreditAmounts({
          brokerId,
          statuses: disbursedStatuses,
          from: lastMonthStart,
          to: lastMonthEnd,
        });
        
        // Commissions
        const commissions = await storage.getCommissions({ brokerId });
        const currentMonthPaid = commissions
          .filter(c => c.status === 'paid' && c.createdAt && new Date(c.createdAt) >= currentMonthStart)
          .reduce((sum, c) => sum + parseFloat(c.amount || '0'), 0);
        
        const lastMonthPaid = commissions
          .filter(c => c.status === 'paid' && c.createdAt && 
                  new Date(c.createdAt) >= lastMonthStart && new Date(c.createdAt) <= lastMonthEnd)
          .reduce((sum, c) => sum + parseFloat(c.amount || '0'), 0);
        
        const pendingCommissions = commissions
          .filter(c => c.status === 'pending')
          .reduce((sum, c) => sum + parseFloat(c.amount || '0'), 0);
        
        // Calculate trends
        const pipelineDelta = lastMonthPipeline > 0 
          ? ((pipelineCount - lastMonthPipeline) / lastMonthPipeline * 100).toFixed(1)
          : '0';
        
        const volumeDelta = parseFloat(lastMonthVolume) > 0
          ? ((parseFloat(disbursedVolume) - parseFloat(lastMonthVolume)) / parseFloat(lastMonthVolume) * 100).toFixed(1)
          : '0';
        
        const commissionDelta = lastMonthPaid > 0
          ? ((currentMonthPaid - lastMonthPaid) / lastMonthPaid * 100).toFixed(1)
          : '0';
        
        metrics.broker = {
          pipelineRequests: pipelineCount,
          disbursedCredits: disbursedCount,
          disbursedVolume: parseFloat(disbursedVolume),
          commissionsPaid: currentMonthPaid,
          commissionsPending: pendingCommissions,
          commissionsTotal: currentMonthPaid + pendingCommissions,
        };
        
        metrics.trend = {
          pipeline: {
            current: pipelineCount,
            previous: lastMonthPipeline,
            deltaPct: parseFloat(pipelineDelta),
          },
          disbursedVolume: {
            current: parseFloat(disbursedVolume),
            previous: parseFloat(lastMonthVolume),
            deltaPct: parseFloat(volumeDelta),
          },
          commissionsPaid: {
            current: currentMonthPaid,
            previous: lastMonthPaid,
            deltaPct: parseFloat(commissionDelta),
          },
        };
      }
      
      // Master Broker additional metrics
      if (isMasterBroker) {
        const networkBrokers = await storage.getUsersByMasterBroker(userId);
        const networkPipeline = await storage.countCreditsByStatus({
          masterBrokerId: userId,
          includeNetwork: true,
          statuses: pipelineStatuses,
        });
        
        const networkDisbursed = await storage.sumCreditAmounts({
          masterBrokerId: userId,
          includeNetwork: true,
          statuses: disbursedStatuses,
          from: currentMonthStart,
        });
        
        metrics.masterBroker = {
          activeBrokers: networkBrokers.filter(b => b.isActive).length,
          networkPipeline,
          networkDisbursedVolume: parseFloat(networkDisbursed),
        };
      }
      
      // Admin metrics
      if (isAdmin) {
        const allCredits = await storage.getCredits({});
        const totalPipeline = allCredits.filter(c => pipelineStatuses.includes(c.status)).length;
        const totalDisbursed = allCredits.filter(c => disbursedStatuses.includes(c.status)).length;
        const allUsers = await storage.getAllUsers();
        const activeBrokers = allUsers.filter(u => (u.role === 'broker' || u.role === 'master_broker') && u.isActive).length;
        
        metrics.admin = {
          totalPipeline,
          totalDisbursed,
          activeBrokers,
          totalClients: (await storage.getClients()).length,
        };
      }
      
      res.json(metrics);
    } catch (error) {
      console.error("Error fetching dashboard metrics:", error);
      res.status(500).json({ message: "Failed to fetch metrics" });
    }
  });

  // Credit pipeline
  app.get('/api/dashboard/pipeline', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const credits = await storage.getCredits({ brokerId: userId });
      
      const pipeline = {
        en_revision: credits.filter(c => c.status === 'under_review').length,
        validacion: credits.filter(c => c.status === 'submitted').length,
        aprobacion: credits.filter(c => c.status === 'approved').length,
        por_firmar: credits.filter(c => c.status === 'approved').length,
        dispersion: credits.filter(c => c.status === 'disbursed').length,
      };
      
      const recentCases = credits
        .slice(0, 5)
        .map(credit => ({
          id: credit.id,
          clientName: credit.clientId, // Would need to join with client data
          amount: credit.amount,
          status: credit.status,
          updatedAt: credit.updatedAt,
        }));
      
      res.json({ pipeline, recentCases });
    } catch (error) {
      console.error("Error fetching pipeline:", error);
      res.status(500).json({ message: "Failed to fetch pipeline" });
    }
  });

  // Notifications
  app.get('/api/notifications', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const notifications = await storage.getNotifications(userId);
      res.json(notifications);
    } catch (error) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({ message: "Failed to fetch notifications" });
    }
  });

  app.patch('/api/notifications/:id/read', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const success = await storage.markNotificationAsRead(id);
      
      if (success) {
        res.json({ message: "Notification marked as read" });
      } else {
        res.status(404).json({ message: "Notification not found" });
      }
    } catch (error) {
      console.error("Error marking notification as read:", error);
      res.status(500).json({ message: "Failed to mark notification as read" });
    }
  });

  // User Management (Admin only)
  app.get('/api/users', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const currentUser = await storage.getUser(userId);
      
      // Only admins can list all users
      if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'super_admin')) {
        return res.status(403).json({ message: "Access denied. Admin privileges required." });
      }
      
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.post('/api/users', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const currentUser = await storage.getUser(userId);
      
      // Only admins can create users
      if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'super_admin')) {
        return res.status(403).json({ message: "Access denied. Admin privileges required." });
      }
      
      const userData = insertUserSchema.parse(req.body);
      
      // Check if email already exists
      const existingUser = await storage.getUserByEmail(userData.email);
      if (existingUser) {
        return res.status(400).json({ message: "El email ya está registrado en el sistema" });
      }
      
      const newUser = await storage.createUser(userData);
      
      res.status(201).json(newUser);
    } catch (error: any) {
      console.error("Error creating user:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      // Check for duplicate key constraint
      if (error?.code === '23505' || error?.constraint?.includes('email')) {
        return res.status(400).json({ message: "El email ya está registrado en el sistema" });
      }
      res.status(500).json({ message: "Failed to create user" });
    }
  });

  app.patch('/api/users/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const currentUser = await storage.getUser(userId);
      
      // Only admins can update users
      if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'super_admin')) {
        return res.status(403).json({ message: "Access denied. Admin privileges required." });
      }
      
      const { id } = req.params;
      const userData = insertUserSchema.partial().parse(req.body);
      
      // Check if changing email to one that already exists
      if (userData.email) {
        const existingUser = await storage.getUserByEmail(userData.email);
        if (existingUser && existingUser.id !== id) {
          return res.status(400).json({ message: "El email ya está registrado por otro usuario" });
        }
      }
      
      const updatedUser = await storage.updateUser(id, userData);
      
      if (!updatedUser) {
        return res.status(404).json({ message: "Usuario no encontrado" });
      }
      
      res.json(updatedUser);
    } catch (error: any) {
      console.error("Error updating user:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      // Check for duplicate key constraint
      if (error?.code === '23505' || error?.constraint?.includes('email')) {
        return res.status(400).json({ message: "El email ya está registrado por otro usuario" });
      }
      res.status(500).json({ message: "Failed to update user" });
    }
  });

  app.patch('/api/users/:id/toggle-status', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const currentUser = await storage.getUser(userId);
      
      // Only admins can toggle user status
      if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'super_admin')) {
        return res.status(403).json({ message: "Access denied. Admin privileges required." });
      }
      
      const { id } = req.params;
      const user = await storage.getUser(id);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Prevent deactivating yourself
      if (user.id === userId) {
        return res.status(400).json({ message: "No puedes desactivar tu propia cuenta" });
      }
      
      const updatedUser = await storage.updateUser(id, { isActive: !user.isActive });
      
      res.json(updatedUser);
    } catch (error) {
      console.error("Error toggling user status:", error);
      res.status(500).json({ message: "Failed to toggle user status" });
    }
  });

  // Clients
  app.get('/api/clients', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      // Admin and super_admin can see all clients
      const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
      
      if (isAdmin) {
        const clients = await storage.getClients();
        return res.json(clients);
      }
      
      // Master brokers can see their own clients + their network's clients
      if (user?.role === 'master_broker') {
        const networkBrokers = await storage.getUsersByMasterBroker(userId);
        const brokerIds = [userId, ...networkBrokers.map(b => b.id)];
        const allClients = await storage.getClients();
        const filteredClients = allClients.filter(c => brokerIds.includes(c.brokerId));
        return res.json(filteredClients);
      }
      
      // Regular brokers only see their own clients
      const clients = await storage.getClients(userId);
      res.json(clients);
    } catch (error) {
      console.error("Error fetching clients:", error);
      res.status(500).json({ message: "Failed to fetch clients" });
    }
  });

  app.get('/api/clients/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      // Authorization check - broker can only access own clients
      const authResult = await authorizeClientAccess(userId, user?.role || '', id);
      if (!authResult.authorized) {
        return res.status(authResult.reason === 'Client not found' ? 404 : 403).json({ message: authResult.reason });
      }
      
      res.json(authResult.client);
    } catch (error) {
      console.error("Error fetching client:", error);
      res.status(500).json({ message: "Failed to fetch client" });
    }
  });

  app.post('/api/clients', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const clientData = updatedInsertClientSchema.parse({
        ...req.body,
        brokerId: userId,
      });
      
      const client = await storage.createClient(clientData);
      
      // Create notification
      await storage.createNotification({
        userId,
        type: 'client_created',
        title: 'Nuevo cliente agregado',
        message: `Se ha agregado el cliente ${client.businessName || `${client.firstName} ${client.lastName}`}`,
        data: { clientId: client.id },
      });
      
      res.status(201).json(client);
    } catch (error) {
      console.error("Error creating client:", error);
      res.status(500).json({ message: "Failed to create client" });
    }
  });

  app.put('/api/clients/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      // Authorization check - broker can only update own clients
      const authResult = await authorizeClientAccess(userId, user?.role || '', id);
      if (!authResult.authorized) {
        return res.status(authResult.reason === 'Client not found' ? 404 : 403).json({ message: authResult.reason });
      }
      
      const clientData = updatedInsertClientSchema.partial().parse(req.body);
      const client = await storage.updateClient(id, clientData);
      
      if (!client) {
        return res.status(404).json({ message: "Client not found" });
      }
      
      res.json(client);
    } catch (error) {
      console.error("Error updating client:", error);
      res.status(500).json({ message: "Failed to update client" });
    }
  });

  app.delete('/api/clients/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      // Authorization check - broker can only delete own clients
      const authResult = await authorizeClientAccess(userId, user?.role || '', id);
      if (!authResult.authorized) {
        return res.status(authResult.reason === 'Client not found' ? 404 : 403).json({ message: authResult.reason });
      }
      
      const success = await storage.deleteClient(id);
      
      if (success) {
        res.json({ message: "Client deleted successfully" });
      } else {
        res.status(404).json({ message: "Client not found" });
      }
    } catch (error) {
      console.error("Error deleting client:", error);
      res.status(500).json({ message: "Failed to delete client" });
    }
  });

  // Client Credit Histories
  app.get('/api/clients/:clientId/credit-histories', isAuthenticated, async (req: any, res) => {
    try {
      const { clientId } = req.params;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      // Authorization check - broker can only access own client's histories
      const authResult = await authorizeClientAccess(userId, user?.role || '', clientId);
      if (!authResult.authorized) {
        return res.status(authResult.reason === 'Client not found' ? 404 : 403).json({ message: authResult.reason });
      }
      
      const histories = await storage.getClientCreditHistories(clientId);
      res.json(histories);
    } catch (error) {
      console.error("Error fetching client credit histories:", error);
      res.status(500).json({ message: "Failed to fetch credit histories" });
    }
  });

  app.post('/api/clients/:clientId/credit-histories', isAuthenticated, async (req: any, res) => {
    try {
      const { clientId } = req.params;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      // Authorization check - broker can only add histories to own clients
      const authResult = await authorizeClientAccess(userId, user?.role || '', clientId);
      if (!authResult.authorized) {
        return res.status(authResult.reason === 'Client not found' ? 404 : 403).json({ message: authResult.reason });
      }
      
      const historyData = insertClientCreditHistorySchema.parse({
        ...req.body,
        clientId,
        source: 'manual',
      });
      
      const history = await storage.createClientCreditHistory(historyData);
      res.status(201).json(history);
    } catch (error) {
      console.error("Error creating client credit history:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create credit history" });
    }
  });

  // Credits
  app.get('/api/credits', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const { clientId, status } = req.query;
      
      // Admin and super_admin can see all credits
      const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
      
      if (isAdmin) {
        const credits = await storage.getCredits({
          clientId: clientId as string,
          status: status as string,
        });
        return res.json(credits);
      }
      
      // Master brokers can see their own credits + their network's credits
      if (user?.role === 'master_broker') {
        const networkBrokers = await storage.getUsersByMasterBroker(userId);
        const brokerIds = [userId, ...networkBrokers.map(b => b.id)];
        const allCredits = await storage.getCredits({
          clientId: clientId as string,
          status: status as string,
        });
        const filteredCredits = allCredits.filter(c => brokerIds.includes(c.brokerId));
        return res.json(filteredCredits);
      }
      
      // Regular brokers only see their own credits
      const credits = await storage.getCredits({
        brokerId: userId,
        clientId: clientId as string,
        status: status as string,
      });
      
      res.json(credits);
    } catch (error) {
      console.error("Error fetching credits:", error);
      res.status(500).json({ message: "Failed to fetch credits" });
    }
  });

  app.post('/api/credits', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const creditData = insertCreditSchema.parse({
        ...req.body,
        brokerId: userId,
      });
      
      const credit = await storage.createCredit(creditData);
      
      // Create notification
      await storage.createNotification({
        userId,
        type: 'credit_created',
        title: 'Nuevo crédito creado',
        message: `Se ha creado un crédito por $${credit.amount}`,
        data: { creditId: credit.id },
      });
      
      res.status(201).json(credit);
    } catch (error) {
      console.error("Error creating credit:", error);
      res.status(500).json({ message: "Failed to create credit" });
    }
  });

  app.put('/api/credits/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      // Authorization check - broker can only update own credits
      const authResult = await authorizeCreditAccess(userId, user?.role || '', id);
      if (!authResult.authorized) {
        return res.status(authResult.reason === 'Credit not found' ? 404 : 403).json({ message: authResult.reason });
      }
      
      const creditData = insertCreditSchema.partial().parse(req.body);
      const oldCredit = authResult.credit;
      
      const credit = await storage.updateCredit(id, creditData);
      
      if (!credit) {
        return res.status(404).json({ message: "Credit not found" });
      }
      
      // Check if status changed to 'dispersado' or 'disbursed' - trigger commission calculation
      const statusChanged = oldCredit.status !== credit.status;
      const isDispersed = credit.status === 'dispersado' || credit.status === 'disbursed';
      
      if (statusChanged && isDispersed) {
        console.log(`[Commission Trigger] Credit ${id} status changed to ${credit.status}, calculating commissions...`);
        
        // Check if credit comes from a winning submission target
        const submissionTarget = await storage.getCreditSubmissionTargetByCreditId(id);
        if (submissionTarget) {
          // Only calculate commissions if this is a winning target that has been dispersed
          if (!submissionTarget.isWinner || submissionTarget.status !== 'dispersed') {
            console.warn(`[Commission Trigger] Credit ${id} comes from submission target but not winner or not dispersed yet, skipping commission calculation`);
            return res.json(credit);
          }
          console.log(`[Commission Trigger] Credit ${id} comes from winning submission target ${submissionTarget.id}, proceeding with commission calculation`);
        }
        
        // Check if finalProposal exists
        const finalProposal = credit.finalProposal as any;
        if (!finalProposal || !finalProposal.approvedAmount) {
          console.warn(`[Commission Trigger] No finalProposal found for credit ${id}, skipping commission calculation`);
        } else {
          // Get broker and master broker
          const broker = await storage.getUser(credit.brokerId);
          if (!broker) {
            console.warn(`[Commission Trigger] Broker ${credit.brokerId} not found for credit ${id}`);
          } else {
            const masterBrokerId = broker.masterBrokerId;
            const approvedAmount = parseFloat(finalProposal.approvedAmount);
            const commissionsToApply = finalProposal.commissionsToApply || [];
            const commissionRates = finalProposal.commissionRates || {};
            
            console.log(`[Commission Trigger] Creating commissions for credit ${id}, amount: ${approvedAmount}, apply: ${commissionsToApply.join(', ')}`);
            
            // Create commission records for each type that should be applied
            for (const commissionKey of commissionsToApply) {
              // Parse commission key: "masterBroker_apertura" or "broker_apertura"
              const [role, type] = commissionKey.split('_');
              
              if (role === 'masterBroker' && masterBrokerId) {
                const rate = parseFloat(commissionRates.masterBroker?.[type] || '0');
                const amount = (approvedAmount * rate / 100).toFixed(2);
                
                await storage.createCommission({
                  creditId: credit.id,
                  brokerId: credit.brokerId,
                  masterBrokerId: masterBrokerId,
                  commissionType: type,
                  amount: amount,
                  masterBrokerShare: amount, // Full amount goes to master broker
                  brokerShare: '0',
                  appShare: '0',
                  status: 'pending',
                });
                
                console.log(`[Commission] Created ${type} commission for Master Broker ${masterBrokerId}: $${amount} MXN (${rate}%)`);
              } else if (role === 'broker') {
                const rate = parseFloat(commissionRates.broker?.[type] || '0');
                const amount = (approvedAmount * rate / 100).toFixed(2);
                
                await storage.createCommission({
                  creditId: credit.id,
                  brokerId: credit.brokerId,
                  masterBrokerId: masterBrokerId || undefined,
                  commissionType: type,
                  amount: amount,
                  brokerShare: amount, // Full amount goes to broker
                  masterBrokerShare: '0',
                  appShare: '0',
                  status: 'pending',
                });
                
                console.log(`[Commission] Created ${type} commission for Broker ${credit.brokerId}: $${amount} MXN (${rate}%)`);
              }
            }
          }
        }
      }
      
      res.json(credit);
    } catch (error) {
      console.error("Error updating credit:", error);
      res.status(500).json({ message: "Failed to update credit" });
    }
  });

  app.get('/api/credits/client/:clientId', isAuthenticated, async (req: any, res) => {
    try {
      const { clientId } = req.params;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      // Admin and super_admin can see all credits, brokers only see their own
      const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
      
      const credits = await storage.getCredits({ 
        clientId,
        brokerId: isAdmin ? undefined : userId,
      });
      
      res.json(credits);
    } catch (error) {
      console.error("Error fetching client credits:", error);
      res.status(500).json({ message: "Failed to fetch client credits" });
    }
  });

  // Re-gestion (expiring credits for renewal)
  app.get('/api/re-gestion', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const expiringCredits = await storage.getExpiringCredits(90); // Next 90 days
      
      // Admin and super_admin can see all opportunities, brokers only see their own
      const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
      const userExpiringCredits = isAdmin 
        ? expiringCredits 
        : expiringCredits.filter(c => c.brokerId === userId);
      
      const opportunities = userExpiringCredits.map(credit => ({
        id: credit.id,
        clientId: credit.clientId,
        currentAmount: credit.amount,
        remainingBalance: credit.remainingBalance,
        endDate: credit.endDate,
        paymentHistory: credit.paymentHistory,
        // Calculate potential new credit and savings
        suggestedAmount: (parseFloat(credit.amount || '0') * 1.2).toFixed(2),
        estimatedSavings: (parseFloat(credit.paymentAmount || '0') * 0.15).toFixed(2),
      }));
      
      res.json(opportunities);
    } catch (error) {
      console.error("Error fetching re-gestion opportunities:", error);
      res.status(500).json({ message: "Failed to fetch re-gestion opportunities" });
    }
  });

  // Financial Institutions
  app.get('/api/financial-institutions', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const institutions = await storage.getFinancialInstitutions(userId);
      res.json(institutions);
    } catch (error) {
      console.error("Error fetching financial institutions:", error);
      res.status(500).json({ message: "Failed to fetch financial institutions" });
    }
  });

  // Get single financial institution by ID
  app.get('/api/financial-institutions/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const institution = await storage.getFinancialInstitution(id);
      
      if (!institution) {
        return res.status(404).json({ message: 'Financial institution not found' });
      }
      
      res.json(institution);
    } catch (error) {
      console.error("Error fetching financial institution:", error);
      res.status(500).json({ message: "Failed to fetch financial institution" });
    }
  });

  app.post('/api/financial-institutions', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const user = await storage.getUser(userId);
      
      // Check permissions - only admin and super_admin can create financial institutions
      if (!user || (user.role !== 'super_admin' && user.role !== 'admin')) {
        return res.status(403).json({ message: 'Insufficient permissions' });
      }
      
      const institutionData = insertFinancialInstitutionSchema.parse({
        ...req.body,
        createdBy: userId,
        createdByAdmin: true,
      });
      
      const institution = await storage.createFinancialInstitution(institutionData);
      res.status(201).json(institution);
    } catch (error) {
      console.error("Error creating financial institution:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: 'Invalid data', errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to create financial institution" });
      }
    }
  });

  // Toggle financial institution active status
  app.patch('/api/financial-institutions/:id/toggle-status', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user?.claims?.sub;
      const user = await storage.getUser(userId);

      // Check permissions
      if (!user || (user.role !== 'super_admin' && user.role !== 'admin')) {
        return res.status(403).json({ message: 'Insufficient permissions' });
      }

      const institution = await storage.getFinancialInstitution(id);
      if (!institution) {
        return res.status(404).json({ message: 'Financial institution not found' });
      }

      const updatedInstitution = await storage.updateFinancialInstitution(id, {
        isActive: !institution.isActive
      });

      res.json(updatedInstitution);
    } catch (error) {
      console.error("Error toggling financial institution status:", error);
      res.status(500).json({ message: "Failed to toggle financial institution status" });
    }
  });

  // Update financial institution data
  app.patch('/api/financial-institutions/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user?.claims?.sub;
      const user = await storage.getUser(userId);

      // Check permissions
      if (!user || (user.role !== 'super_admin' && user.role !== 'admin')) {
        return res.status(403).json({ message: 'Insufficient permissions' });
      }

      const institution = await storage.getFinancialInstitution(id);
      if (!institution) {
        return res.status(404).json({ message: 'Financial institution not found' });
      }

      // Parse update data directly from request body
      const updateData = req.body;
      const updatedInstitution = await storage.updateFinancialInstitution(id, updateData);

      res.json(updatedInstitution);
    } catch (error) {
      console.error("Error updating financial institution:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: 'Invalid data', errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to update financial institution" });
      }
    }
  });
  
  // Commission calculation endpoint
  app.get('/api/financial-institutions/:id/commission-calculation', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { amount } = req.query;
      
      if (!amount) {
        return res.status(400).json({ message: 'Amount is required' });
      }
      
      const userId = req.user?.claims?.sub;
      const user = await storage.getUser(userId);
      const institution = await storage.getFinancialInstitution(id);
      
      if (!institution) {
        return res.status(404).json({ message: 'Financial institution not found' });
      }
      
      const creditAmount = parseFloat(amount as string);
      
      // Calculate commissions
      const openingCommission = (creditAmount * (parseFloat(institution.openingCommissionRate || "0"))) / 100;
      const overrateCommission = (creditAmount * (parseFloat(institution.overrateCommissionRate || "0"))) / 100;
      const totalCommission = openingCommission + overrateCommission;
      
      // Calculate distribution based on user role and institution configuration
      let userCommission = totalCommission;
      let masterBrokerCommission = 0;
      
      if (institution.createdByAdmin && user?.role === 'broker' && user?.masterBrokerId) {
        // If it's an admin-created institution and user is a broker with master broker
        const brokerRate = parseFloat(institution.brokerCommissionRate || "100");
        const masterRate = parseFloat(institution.masterBrokerCommissionRate || "0");
        
        userCommission = (totalCommission * brokerRate) / 100;
        masterBrokerCommission = (totalCommission * masterRate) / 100;
      }
      
      // Calculate additional costs
      const additionalCosts = Array.isArray(institution.additionalCosts) ? institution.additionalCosts : [];
      let totalAdditionalCosts = 0;
      
      additionalCosts.forEach((cost: any) => {
        if (cost.type === 'percentage') {
          totalAdditionalCosts += (creditAmount * cost.amount) / 100;
        } else {
          totalAdditionalCosts += cost.amount;
        }
      });
      
      const finalCommission = userCommission - totalAdditionalCosts;
      
      res.json({
        creditAmount,
        openingCommission,
        overrateCommission,
        totalCommission,
        userCommission,
        masterBrokerCommission,
        additionalCosts: totalAdditionalCosts,
        finalCommission: Math.max(0, finalCommission),
        breakdown: {
          openingRate: institution.openingCommissionRate || 0,
          overrateRate: institution.overrateCommissionRate || 0,
          brokerRate: institution.brokerCommissionRate || 100,
          masterBrokerRate: institution.masterBrokerCommissionRate || 0,
          costs: additionalCosts
        }
      });
    } catch (error) {
      console.error('Error calculating commission:', error);
      res.status(500).json({ message: 'Failed to calculate commission' });
    }
  });

  // Financial Institution Requests (broker requests to add new institutions)
  app.post('/api/financial-institutions/request', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      const requestData = insertFinancialInstitutionRequestSchema.parse({
        ...req.body,
        brokerId: userId,
      });
      
      const request = await storage.createFinancialInstitutionRequest(requestData);
      
      // Create notifications for all admins
      const allUsers = await storage.getAllUsers();
      const admins = allUsers.filter(u => u.role === 'admin' || u.role === 'super_admin');
      
      for (const admin of admins) {
        await storage.createNotification({
          userId: admin.id,
          type: 'institution_request',
          title: 'Nueva solicitud de financiera',
          message: `Un broker ha solicitado agregar la financiera: ${requestData.institutionName}`,
          data: { requestId: request.id },
        });
      }
      
      res.status(201).json(request);
    } catch (error) {
      console.error("Error creating financial institution request:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: 'Invalid data', errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to create financial institution request" });
      }
    }
  });

  // Commissions and STP payments
  app.get('/api/commissions', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      // Admin and super_admin can see all commissions
      const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
      
      if (isAdmin) {
        const commissions = await storage.getCommissions();
        return res.json(commissions);
      }
      
      // Master brokers can see their own commissions + their network's commissions
      if (user?.role === 'master_broker') {
        const networkBrokers = await storage.getUsersByMasterBroker(userId);
        const brokerIds = [userId, ...networkBrokers.map(b => b.id)];
        const allCommissions = await storage.getCommissions();
        const filteredCommissions = allCommissions.filter(c => 
          brokerIds.includes(c.brokerId) || c.masterBrokerId === userId
        );
        return res.json(filteredCommissions);
      }
      
      // Regular brokers only see their own commissions
      const commissions = await storage.getCommissions(userId);
      res.json(commissions);
    } catch (error) {
      console.error("Error fetching commissions:", error);
      res.status(500).json({ message: "Failed to fetch commissions" });
    }
  });

  app.post('/api/commissions/:id/pay', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { accountNumber } = req.body;
      
      const commission = await storage.getCommissions().then(comms => 
        comms.find(c => c.id === id)
      );
      
      if (!commission) {
        return res.status(404).json({ message: "Commission not found" });
      }
      
      // Process STP payment
      const paymentResult = await processStpPayment(commission.amount!, accountNumber);
      
      if (paymentResult.success) {
        await storage.updateCommission(id, {
          status: 'paid',
          paidAt: new Date(),
        });
        
        res.json({
          message: "Payment processed successfully",
          transactionId: paymentResult.transactionId,
        });
      } else {
        res.status(400).json({ message: "Payment processing failed" });
      }
    } catch (error) {
      console.error("Error processing payment:", error);
      res.status(500).json({ message: "Failed to process payment" });
    }
  });

  // Document management with OCR
  app.post('/api/documents', isAuthenticated, upload.single('file'), async (req: any, res) => {
    let storedFilePath: string | undefined;

    try {
      const userId = req.user.claims.sub;
      const { clientId, creditId, type } = req.body;
      const file = req.file;
      
      if (!file) {
        return res.status(400).json({ message: "No file uploaded" });
      }
      
      // Simulate OCR processing
      const extractedData = simulateOcrProcessing(file);
      const storedFile = await persistDocumentFile(file, {
        brokerId: userId,
        clientId: clientId || null,
        creditId: creditId || null,
        type,
      });
      storedFilePath = storedFile.filePath;
      
      const documentData = insertDocumentSchema.parse({
        clientId: clientId || null,
        creditId: creditId || null,
        brokerId: userId,
        type,
        fileName: file.originalname,
        filePath: storedFile.filePath,
        fileSize: file.size,
        mimeType: file.mimetype,
        extractedData,
      });
      
      const document = await storage.createDocument(documentData);
      
      res.status(201).json(document);
    } catch (error) {
      if (storedFilePath) {
        try {
          await removeStoredDocument(storedFilePath);
        } catch (cleanupError) {
          console.error("Error cleaning up stored document after failed create:", cleanupError);
        }
      }
      console.error("Error uploading document:", error);
      res.status(500).json({ message: "Failed to upload document" });
    }
  });

  app.get('/api/documents/:id/file', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);

      const authResult = await authorizeDocumentAccess(userId, user?.role || '', id);
      if (!authResult.authorized || !authResult.document) {
        return res.status(authResult.reason === 'Document not found' ? 404 : 403).json({ message: authResult.reason || 'Access denied' });
      }

      const accessTarget = await getDocumentAccessTarget(authResult.document.filePath, {
        fileName: authResult.document.fileName,
      });

      if (accessTarget.kind === 'redirect') {
        return res.redirect(accessTarget.url);
      }

      if (authResult.document.mimeType) {
        res.type(authResult.document.mimeType);
      }

      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(authResult.document.fileName)}"`);
      return res.sendFile(accessTarget.absolutePath);
    } catch (error) {
      console.error('Error opening document:', error);
      res.status(500).json({ message: 'Failed to open document' });
    }
  });

  app.get('/api/documents/:id/download', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);

      const authResult = await authorizeDocumentAccess(userId, user?.role || '', id);
      if (!authResult.authorized || !authResult.document) {
        return res.status(authResult.reason === 'Document not found' ? 404 : 403).json({ message: authResult.reason || 'Access denied' });
      }

      const accessTarget = await getDocumentAccessTarget(authResult.document.filePath, {
        download: true,
        fileName: authResult.document.fileName,
      });

      if (accessTarget.kind === 'redirect') {
        return res.redirect(accessTarget.url);
      }

      return res.download(accessTarget.absolutePath, authResult.document.fileName);
    } catch (error) {
      console.error('Error downloading document:', error);
      res.status(500).json({ message: 'Failed to download document' });
    }
  });

  app.get('/api/documents', isAuthenticated, async (req: any, res) => {
    try {
      const { clientId, creditId } = req.query;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      // Admin and super_admin can see all documents
      const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
      
      if (isAdmin) {
        const documents = await storage.getDocuments({
          clientId: clientId as string,
          creditId: creditId as string,
        });
        return res.json(documents);
      }
      
      // Master brokers can see their own documents + their network's documents
      if (user?.role === 'master_broker') {
        const networkBrokers = await storage.getUsersByMasterBroker(userId);
        const brokerIds = [userId, ...networkBrokers.map(b => b.id)];
        const allDocuments = await storage.getDocuments({
          clientId: clientId as string,
          creditId: creditId as string,
        });
        const filteredDocuments = allDocuments.filter(d => d.brokerId && brokerIds.includes(d.brokerId));
        return res.json(filteredDocuments);
      }
      
      // Regular brokers only see their own documents
      const documents = await storage.getDocuments({
        clientId: clientId as string,
        creditId: creditId as string,
        brokerId: userId,
      });
      
      res.json(documents);
    } catch (error) {
      console.error("Error fetching documents:", error);
      res.status(500).json({ message: "Failed to fetch documents" });
    }
  });

  app.get('/api/documents/client/:clientId', isAuthenticated, async (req: any, res) => {
    try {
      const { clientId } = req.params;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      // First check if user can access this client
      const authResult = await authorizeClientAccess(userId, user?.role || '', clientId);
      if (!authResult.authorized) {
        return res.status(authResult.reason === 'Client not found' ? 404 : 403).json({ message: authResult.reason });
      }
      
      // User is authorized to access this client, fetch documents
      const documents = await storage.getDocuments({ clientId });
      
      res.json(documents);
    } catch (error) {
      console.error("Error fetching client documents:", error);
      res.status(500).json({ message: "Failed to fetch client documents" });
    }
  });

  app.put('/api/documents/:id', isAuthenticated, upload.single('file'), async (req: any, res) => {
    let newStoredFilePath: string | undefined;

    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      // Authorization check - broker can only update own documents
      const authResult = await authorizeDocumentAccess(userId, user?.role || '', id);
      if (!authResult.authorized) {
        return res.status(authResult.reason === 'Document not found' ? 404 : 403).json({ message: authResult.reason });
      }
      
      const { clientId, creditId, type } = req.body;
      const file = req.file;
      
      let updateData: any = {
        clientId: clientId || null,
        creditId: creditId || null,
        type,
      };
      
      // If new file is uploaded, update file information and process OCR
      if (file) {
        const extractedData = simulateOcrProcessing(file);
        const storedFile = await persistDocumentFile(file, {
          brokerId: userId,
          clientId: clientId || authResult.document.clientId || null,
          creditId: creditId || authResult.document.creditId || null,
          type: type || authResult.document.type,
        });
        newStoredFilePath = storedFile.filePath;

        updateData = {
          ...updateData,
          fileName: file.originalname,
          filePath: storedFile.filePath,
          fileSize: file.size,
          mimeType: file.mimetype,
          extractedData,
        };
      }
      
      const document = await storage.updateDocument(id, updateData);
      
      if (!document) {
        if (newStoredFilePath) {
          await removeStoredDocument(newStoredFilePath);
        }
        return res.status(404).json({ message: "Document not found" });
      }

      if (newStoredFilePath && authResult.document.filePath !== newStoredFilePath) {
        try {
          await removeStoredDocument(authResult.document.filePath);
        } catch (cleanupError) {
          console.error('Error deleting previous document file after update:', cleanupError);
        }
      }
      
      res.json(document);
    } catch (error) {
      if (newStoredFilePath) {
        try {
          await removeStoredDocument(newStoredFilePath);
        } catch (cleanupError) {
          console.error('Error cleaning up new stored document after failed update:', cleanupError);
        }
      }
      console.error("Error updating document:", error);
      res.status(500).json({ message: "Failed to update document" });
    }
  });

  app.delete('/api/documents/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      // Authorization check - broker can only delete own documents
      const authResult = await authorizeDocumentAccess(userId, user?.role || '', id);
      if (!authResult.authorized) {
        return res.status(authResult.reason === 'Document not found' ? 404 : 403).json({ message: authResult.reason });
      }
      
      const success = await storage.deleteDocument(id);
      
      if (success) {
        try {
          await removeStoredDocument(authResult.document.filePath);
        } catch (cleanupError) {
          console.error('Error deleting stored document file after record deletion:', cleanupError);
        }
        res.json({ message: "Document deleted successfully" });
      } else {
        res.status(404).json({ message: "Document not found" });
      }
    } catch (error) {
      console.error("Error deleting document:", error);
      res.status(500).json({ message: "Failed to delete document" });
    }
  });

  // Broker network management
  app.get('/api/broker-network', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (user?.role !== 'master_broker' && user?.role !== 'admin') {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const brokers = await storage.getUsersByMasterBroker(userId);
      res.json(brokers);
    } catch (error) {
      console.error("Error fetching broker network:", error);
      res.status(500).json({ message: "Failed to fetch broker network" });
    }
  });

  // Broker invitations
  app.post('/api/broker-invitations', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (user?.role !== 'master_broker' && user?.role !== 'admin') {
        return res.status(403).json({ message: "Access denied" });
      }

      const { email, firstName, lastName, phone, message } = req.body;
      
      // Create a notification for now (in a real app this would send an email)
      const notification = await storage.createNotification({
        userId,
        type: 'broker_invitation_sent',
        title: 'Invitación de broker enviada',
        message: `Invitación enviada a ${firstName} ${lastName} (${email})`,
        data: { 
          email, 
          firstName, 
          lastName, 
          phone,
          invitationMessage: message 
        },
        priority: 'medium',
      });
      
      // Broadcast real-time notification
      broadcastToUser(userId, {
        type: 'notification',
        notification,
      });

      res.status(201).json({ 
        message: "Invitation sent successfully",
        invitation: { email, firstName, lastName, phone }
      });
    } catch (error) {
      console.error("Error sending broker invitation:", error);
      res.status(500).json({ message: "Failed to send broker invitation" });
    }
  });

  // Tenant routes
  app.get('/api/tenants', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      // Only super admins and platform admins can see all tenants
      if (user?.role === 'super_admin' || user?.role === 'admin') {
        const tenants = await storage.getTenants();
        res.json(tenants);
      } else {
        // Regular users only see tenants they're members of
        const userMemberships = await storage.getTenantMembersByUser(userId);
        const tenantIds = userMemberships.map(m => m.tenantId);
        const tenants = await storage.getTenants();
        const userTenants = tenants.filter(t => tenantIds.includes(t.id));
        res.json(userTenants);
      }
    } catch (error) {
      console.error("Error fetching tenants:", error);
      res.status(500).json({ message: "Failed to fetch tenants" });
    }
  });

  app.get('/api/tenants/:id', isAuthenticated, resolveTenantFromParam(), requireTenantMembership, async (req: any, res) => {
    try {
      // Tenant is already resolved and membership is already checked by middleware
      res.json(req.tenantContext.tenant);
    } catch (error) {
      console.error("Error fetching tenant:", error);
      res.status(500).json({ message: "Failed to fetch tenant" });
    }
  });

  app.get('/api/tenants/slug/:slug', isAuthenticated, requireTenantMembership, async (req: any, res) => {
    try {
      // Tenant context is already resolved by tenantContextMiddleware from slug parameter
      // and membership is already checked by requireTenantMembership
      res.json(req.tenantContext.tenant);
    } catch (error) {
      console.error("Error fetching tenant by slug:", error);
      res.status(500).json({ message: "Failed to fetch tenant" });
    }
  });

  app.post('/api/tenants', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Check platform role permissions
      const hasPermission = await requirePlatformRole(userId, ['super_admin', 'admin', 'master_broker']);
      if (!hasPermission) {
        return res.status(403).json({ message: "Access denied" });
      }

      const tenantData = insertTenantSchema.parse(req.body);
      const tenant = await storage.createTenant(tenantData);
      
      // Create automatic ownership membership for creator
      await storage.createTenantMember({
        tenantId: tenant.id,
        userId: userId,
        role: 'owner',
        isActive: true,
      });
      
      res.status(201).json(tenant);
    } catch (error) {
      console.error("Error creating tenant:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: 'Invalid data', errors: error.errors });
      } else if (error instanceof Error && error.message.includes('already exists')) {
        res.status(409).json({ message: error.message });
      } else {
        res.status(500).json({ message: "Failed to create tenant" });
      }
    }
  });

  app.put('/api/tenants/:id', isAuthenticated, resolveTenantFromParam(), requireTenantRole(['owner', 'admin']), async (req: any, res) => {
    try {
      const { id } = req.params;
      
      const tenantData = insertTenantSchema.partial().parse(req.body);
      const tenant = await storage.updateTenant(id, tenantData);
      
      if (!tenant) {
        return res.status(404).json({ message: "Tenant not found" });
      }
      
      res.json(tenant);
    } catch (error) {
      console.error("Error updating tenant:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: 'Invalid data', errors: error.errors });
      } else if (error instanceof Error && error.message.includes('already exists')) {
        res.status(409).json({ message: error.message });
      } else {
        res.status(500).json({ message: "Failed to update tenant" });
      }
    }
  });

  app.delete('/api/tenants/:id', isAuthenticated, resolveTenantFromParam(), requireTenantRole(['owner']), async (req: any, res) => {
    try {
      const { id } = req.params;
      
      const success = await storage.deleteTenant(id);
      
      if (success) {
        res.json({ message: "Tenant deleted successfully" });
      } else {
        res.status(404).json({ message: "Tenant not found" });
      }
    } catch (error) {
      console.error("Error deleting tenant:", error);
      res.status(500).json({ message: "Failed to delete tenant" });
    }
  });

  // Tenant Members routes
  app.get('/api/tenant-members', isAuthenticated, resolveTenantFromQuery('tenantId'), requireTenantMembership, async (req: any, res) => {
    try {
      const { tenantId } = req.query;
      
      const tenantMembers = await storage.getTenantMembers(tenantId as string);
      res.json(tenantMembers);
    } catch (error) {
      console.error("Error fetching tenant members:", error);
      res.status(500).json({ message: "Failed to fetch tenant members" });
    }
  });

  app.get('/api/tenant-members/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      
      const tenantMember = await storage.getTenantMember(id);
      
      if (!tenantMember) {
        return res.status(404).json({ message: "Tenant member not found" });
      }
      
      // Check if user has access to this tenant
      const { hasAccess } = await authorizeTenantAccess({
        userId,
        tenantId: tenantMember.tenantId,
        requireRole: ['member', 'admin', 'owner'],
        allowSuperAdmin: true
      });
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      res.json(tenantMember);
    } catch (error) {
      console.error("Error fetching tenant member:", error);
      res.status(500).json({ message: "Failed to fetch tenant member" });
    }
  });

  app.post('/api/tenant-members', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      const tenantMemberData = insertTenantMemberSchema.parse(req.body);
      
      // Manually resolve tenant context from the request body data
      const tenant = await storage.getTenant(tenantMemberData.tenantId);
      if (!tenant) {
        return res.status(404).json({ message: "Tenant not found" });
      }
      
      req.tenantContext.tenant = tenant;
      if (userId) {
        const membership = await storage.getUserTenantMembership(userId, tenant.id);
        if (membership) {
          req.tenantContext.membership = membership;
        }
      }
      
      // Check role requirements manually for this specific case
      const roleCheck = requireTenantRole(['admin', 'owner']);
      const roleResult = await new Promise((resolve) => {
        roleCheck(req, res, (err) => {
          if (err) {
            resolve(false);
          } else {
            resolve(true);
          }
        });
      });
      
      if (!roleResult) {
        return; // Response already sent by roleCheck
      }
      
      const tenantMember = await storage.createTenantMember(tenantMemberData);
      
      res.status(201).json(tenantMember);
    } catch (error) {
      console.error("Error creating tenant member:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: 'Invalid data', errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to create tenant member" });
      }
    }
  });

  app.put('/api/tenant-members/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      
      const existingMember = await storage.getTenantMember(id);
      if (!existingMember) {
        return res.status(404).json({ message: "Tenant member not found" });
      }
      
      // Check if user has permission to update members in this tenant
      const { hasAccess } = await authorizeTenantAccess({
        userId,
        tenantId: existingMember.tenantId,
        requireRole: ['admin', 'owner'],
        allowSuperAdmin: true
      });
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const tenantMemberData = insertTenantMemberSchema.partial().parse(req.body);
      const tenantMember = await storage.updateTenantMember(id, tenantMemberData);
      
      if (!tenantMember) {
        return res.status(404).json({ message: "Tenant member not found" });
      }
      
      res.json(tenantMember);
    } catch (error) {
      console.error("Error updating tenant member:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: 'Invalid data', errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to update tenant member" });
      }
    }
  });

  app.delete('/api/tenant-members/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      
      const existingMember = await storage.getTenantMember(id);
      if (!existingMember) {
        return res.status(404).json({ message: "Tenant member not found" });
      }
      
      // Check if user has permission to delete members in this tenant
      const { hasAccess } = await authorizeTenantAccess({
        userId,
        tenantId: existingMember.tenantId,
        requireRole: ['admin', 'owner'],
        allowSuperAdmin: true
      });
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const success = await storage.deleteTenantMember(id);
      
      if (success) {
        res.json({ message: "Tenant member deleted successfully" });
      } else {
        res.status(404).json({ message: "Tenant member not found" });
      }
    } catch (error) {
      console.error("Error deleting tenant member:", error);
      res.status(500).json({ message: "Failed to delete tenant member" });
    }
  });

  // =====================================================================
  // PRODUCT SYSTEM ROUTES (3-Layer Architecture)
  // =====================================================================

  // 🔹 PRODUCT VARIABLES (Level 1: Base catalog - Admin/SuperAdmin only)
  app.get('/api/product-variables', isAuthenticated, async (req: any, res) => {
    try {
      // For development: use fallback user if claims not available
      const userId = req.user?.claims?.sub || "user-super-admin";
      
      const hasPermission = await requirePlatformRole(userId, ['super_admin', 'admin']);
      if (!hasPermission) {
        return res.status(403).json({ message: "Access denied - Admin privileges required" });
      }

      const variables = await storage.getProductVariables();
      res.json(variables);
    } catch (error) {
      console.error("Error fetching product variables:", error);
      res.status(500).json({ message: "Failed to fetch product variables" });
    }
  });

  app.get('/api/product-variables/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      
      const hasPermission = await requirePlatformRole(userId, ['super_admin', 'admin']);
      if (!hasPermission) {
        return res.status(403).json({ message: "Access denied - Admin privileges required" });
      }

      const variable = await storage.getProductVariable(id);
      if (!variable) {
        return res.status(404).json({ message: "Product variable not found" });
      }
      
      res.json(variable);
    } catch (error) {
      console.error("Error fetching product variable:", error);
      res.status(500).json({ message: "Failed to fetch product variable" });
    }
  });

  app.get('/api/product-variables/name/:name', isAuthenticated, async (req: any, res) => {
    try {
      const { name } = req.params;
      const userId = req.user.claims.sub;
      
      const hasPermission = await requirePlatformRole(userId, ['super_admin', 'admin']);
      if (!hasPermission) {
        return res.status(403).json({ message: "Access denied - Admin privileges required" });
      }

      const variable = await storage.getProductVariableByName(name);
      if (!variable) {
        return res.status(404).json({ message: "Product variable not found" });
      }
      
      res.json(variable);
    } catch (error) {
      console.error("Error fetching product variable by name:", error);
      res.status(500).json({ message: "Failed to fetch product variable" });
    }
  });

  app.post('/api/product-variables', isAuthenticated, async (req: any, res) => {
    try {
      // For development: use fallback user if claims not available  
      const userId = req.user?.claims?.sub || "user-super-admin";
      
      const hasPermission = await requirePlatformRole(userId, ['super_admin', 'admin']);
      if (!hasPermission) {
        return res.status(403).json({ message: "Access denied - Admin privileges required" });
      }

      // Add createdBy from authenticated user
      const variableData = insertProductVariableSchema.parse({
        ...req.body,
        createdBy: userId
      });
      const variable = await storage.createProductVariable(variableData);
      
      res.status(201).json(variable);
    } catch (error) {
      console.error("Error creating product variable:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: 'Invalid data', errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to create product variable" });
      }
    }
  });

  app.put('/api/product-variables/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      
      const hasPermission = await requirePlatformRole(userId, ['super_admin', 'admin']);
      if (!hasPermission) {
        return res.status(403).json({ message: "Access denied - Admin privileges required" });
      }

      const variableData = insertProductVariableSchema.partial().parse(req.body);
      const variable = await storage.updateProductVariable(id, variableData);
      
      if (!variable) {
        return res.status(404).json({ message: "Product variable not found" });
      }
      
      res.json(variable);
    } catch (error) {
      console.error("Error updating product variable:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: 'Invalid data', errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to update product variable" });
      }
    }
  });

  app.delete('/api/product-variables/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      
      const hasPermission = await requirePlatformRole(userId, ['super_admin', 'admin']);
      if (!hasPermission) {
        return res.status(403).json({ message: "Access denied - Admin privileges required" });
      }

      const success = await storage.deleteProductVariable(id);
      
      if (success) {
        res.json({ message: "Product variable deleted successfully" });
      } else {
        res.status(404).json({ message: "Product variable not found" });
      }
    } catch (error) {
      console.error("Error deleting product variable:", error);
      res.status(500).json({ message: "Failed to delete product variable" });
    }
  });

  // 🔹 PRODUCT TEMPLATES (Level 2: Generic products - Admin/SuperAdmin only)
  app.get('/api/product-templates', isAuthenticated, async (req: any, res) => {
    try {
      // For development: use fallback user if claims not available
      const userId = req.user?.claims?.sub || "user-super-admin";
      
      const hasPermission = await requirePlatformRole(userId, ['super_admin', 'admin']);
      if (!hasPermission) {
        return res.status(403).json({ message: "Access denied - Admin privileges required" });
      }

      const templates = await storage.getProductTemplates();
      console.log(`📋 GET /api/product-templates - Returning ${templates.length} templates:`, templates.map(t => `${t.name} (${t.id})`).join(', '));
      res.json(templates);
    } catch (error) {
      console.error("Error fetching product templates:", error);
      res.status(500).json({ message: "Failed to fetch product templates" });
    }
  });

  app.get('/api/product-templates/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      
      const hasPermission = await requirePlatformRole(userId, ['super_admin', 'admin']);
      if (!hasPermission) {
        return res.status(403).json({ message: "Access denied - Admin privileges required" });
      }

      const template = await storage.getProductTemplate(id);
      if (!template) {
        return res.status(404).json({ message: "Product template not found" });
      }
      
      res.json(template);
    } catch (error) {
      console.error("Error fetching product template:", error);
      res.status(500).json({ message: "Failed to fetch product template" });
    }
  });

  app.post('/api/product-templates', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      const hasPermission = await requirePlatformRole(userId, ['super_admin', 'admin']);
      if (!hasPermission) {
        return res.status(403).json({ message: "Access denied - Admin privileges required" });
      }

      // Parse body but add createdBy automatically for security
      const bodyData = insertProductTemplateSchema.omit({ createdBy: true }).parse(req.body);
      const templateData = {
        ...bodyData,
        createdBy: userId, // Set automatically from authenticated user
      };
      const template = await storage.createProductTemplate(templateData);
      console.log(`✅ Created template ${template.name} (ID: ${template.id})`);
      
      // Verify it's in storage
      const verification = await storage.getProductTemplate(template.id);
      console.log(`🔍 Verification - Template exists in storage: ${!!verification}`);
      
      res.status(201).json(template);
    } catch (error) {
      console.error("Error creating product template:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: 'Invalid data', errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to create product template" });
      }
    }
  });

  app.put('/api/product-templates/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      
      const hasPermission = await requirePlatformRole(userId, ['super_admin', 'admin']);
      if (!hasPermission) {
        return res.status(403).json({ message: "Access denied - Admin privileges required" });
      }

      // Parse body but omit createdBy for security (can't be updated)
      const templateData = insertProductTemplateSchema.omit({ createdBy: true }).partial().parse(req.body);
      console.log(`🔄 Updating template ${id} with data:`, templateData);
      
      const template = await storage.updateProductTemplate(id, templateData);
      
      if (!template) {
        console.log(`❌ Template ${id} not found for update`);
        return res.status(404).json({ message: "Product template not found" });
      }
      
      console.log(`✅ Updated template ${template.name} (ID: ${template.id}, isActive: ${template.isActive})`);
      
      // Verify it's still in storage
      const verification = await storage.getProductTemplate(template.id);
      console.log(`🔍 Verification after update - Template exists: ${!!verification}, isActive: ${verification?.isActive}`);
      
      res.json(template);
    } catch (error) {
      console.error("Error updating product template:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: 'Invalid data', errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to update product template" });
      }
    }
  });

  app.delete('/api/product-templates/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      
      const hasPermission = await requirePlatformRole(userId, ['super_admin', 'admin']);
      if (!hasPermission) {
        return res.status(403).json({ message: "Access denied - Admin privileges required" });
      }

      const success = await storage.deleteProductTemplate(id);
      
      if (success) {
        res.json({ message: "Product template deleted successfully" });
      } else {
        res.status(404).json({ message: "Product template not found" });
      }
    } catch (error) {
      console.error("Error deleting product template:", error);
      res.status(500).json({ message: "Failed to delete product template" });
    }
  });

  // 🔹 INSTITUTION PRODUCTS (Level 3A: Assigned to financieras - Admin only)
  app.get('/api/institution-products', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { institutionId } = req.query;
      
      const hasPermission = await requirePlatformRole(userId, ['super_admin', 'admin']);
      if (!hasPermission) {
        return res.status(403).json({ message: "Access denied - Admin privileges required" });
      }

      const products = await storage.getInstitutionProducts(institutionId as string);
      res.json(products);
    } catch (error) {
      console.error("Error fetching institution products:", error);
      res.status(500).json({ message: "Failed to fetch institution products" });
    }
  });

  app.get('/api/institution-products/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      
      const hasPermission = await requirePlatformRole(userId, ['super_admin', 'admin']);
      if (!hasPermission) {
        return res.status(403).json({ message: "Access denied - Admin privileges required" });
      }

      const product = await storage.getInstitutionProduct(id);
      if (!product) {
        return res.status(404).json({ message: "Institution product not found" });
      }
      
      res.json(product);
    } catch (error) {
      console.error("Error fetching institution product:", error);
      res.status(500).json({ message: "Failed to fetch institution product" });
    }
  });

  app.get('/api/institution-products/template/:templateId', isAuthenticated, async (req: any, res) => {
    try {
      const { templateId } = req.params;
      const userId = req.user.claims.sub;
      
      const hasPermission = await requirePlatformRole(userId, ['super_admin', 'admin']);
      if (!hasPermission) {
        return res.status(403).json({ message: "Access denied - Admin privileges required" });
      }

      const products = await storage.getInstitutionProductsByTemplate(templateId);
      res.json(products);
    } catch (error) {
      console.error("Error fetching institution products by template:", error);
      res.status(500).json({ message: "Failed to fetch institution products by template" });
    }
  });

  app.post('/api/institution-products', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      const hasPermission = await requirePlatformRole(userId, ['super_admin', 'admin']);
      if (!hasPermission) {
        return res.status(403).json({ message: "Access denied - Admin privileges required" });
      }

      // Parse body but add createdBy automatically for security
      const bodyData = insertInstitutionProductSchema.omit({ createdBy: true }).parse(req.body);
      
      // Auto-copy targetProfiles from template if not provided
      let targetProfiles = bodyData.targetProfiles;
      if (!targetProfiles || targetProfiles.length === 0) {
        const template = await storage.getProductTemplate(bodyData.templateId);
        if (template && template.targetProfiles && template.targetProfiles.length > 0) {
          targetProfiles = template.targetProfiles;
        }
      }
      
      const productData = {
        ...bodyData,
        targetProfiles, // Use copied or provided targetProfiles
        createdBy: userId, // Set automatically from authenticated user
      };
      const product = await storage.createInstitutionProduct(productData);
      
      res.status(201).json(product);
    } catch (error) {
      console.error("Error creating institution product:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: 'Invalid data', errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to create institution product" });
      }
    }
  });

  app.put('/api/institution-products/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      
      const hasPermission = await requirePlatformRole(userId, ['super_admin', 'admin']);
      if (!hasPermission) {
        return res.status(403).json({ message: "Access denied - Admin privileges required" });
      }

      const productData = insertInstitutionProductSchema.partial().parse(req.body);
      const product = await storage.updateInstitutionProduct(id, productData);
      
      if (!product) {
        return res.status(404).json({ message: "Institution product not found" });
      }
      
      res.json(product);
    } catch (error) {
      console.error("Error updating institution product:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: 'Invalid data', errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to update institution product" });
      }
    }
  });

  app.delete('/api/institution-products/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      
      const hasPermission = await requirePlatformRole(userId, ['super_admin', 'admin']);
      if (!hasPermission) {
        return res.status(403).json({ message: "Access denied - Admin privileges required" });
      }

      const success = await storage.deleteInstitutionProduct(id);
      
      if (success) {
        res.json({ message: "Institution product deleted successfully" });
      } else {
        res.status(404).json({ message: "Institution product not found" });
      }
    } catch (error) {
      console.error("Error deleting institution product:", error);
      res.status(500).json({ message: "Failed to delete institution product" });
    }
  });

  // 🔹 TENANT PRODUCTS (Level 3B: Tenant customization - Tenant members only)
  // TEMPORARILY DISABLED - NOT IMPLEMENTED IN STORAGE
  /*
  app.get('/api/tenant-products', isAuthenticated, requireTenantContext, requireTenantMembership, async (req: any, res) => {
    try {
      const tenantId = req.tenantContext?.tenant?.id;
      
      if (!tenantId) {
        return res.status(400).json({ message: "Tenant context required" });
      }

      const products = await storage.getTenantProducts(tenantId);
      res.json(products);
    } catch (error) {
      console.error("Error fetching tenant products:", error);
      res.status(500).json({ message: "Failed to fetch tenant products" });
    }
  });
  */

  /*
  app.get('/api/tenant-products/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;

      const product = await storage.getTenantProduct(id);
      if (!product) {
        return res.status(404).json({ message: "Tenant product not found" });
      }

      // Check if user has access to this tenant
      const { hasAccess } = await authorizeTenantAccess({
        userId,
        tenantId: product.tenantId,
        requireRole: ['member', 'admin', 'owner'],
        allowSuperAdmin: true
      });
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      res.json(product);
    } catch (error) {
      console.error("Error fetching tenant product:", error);
      res.status(500).json({ message: "Failed to fetch tenant product" });
    }
  });

  app.get('/api/tenant-products/institution/:institutionProductId', isAuthenticated, requireTenantContext, requireTenantMembership, async (req: any, res) => {
    try {
      const { institutionProductId } = req.params;

      const products = await storage.getTenantProductsByInstitutionProduct(institutionProductId);
      res.json(products);
    } catch (error) {
      console.error("Error fetching tenant products by institution product:", error);
      res.status(500).json({ message: "Failed to fetch tenant products by institution product" });
    }
  });

  app.post('/api/tenant-products', isAuthenticated, requireTenantContext, requireTenantMembership, async (req: any, res) => {
    try {
      const tenantId = req.tenantContext?.tenant?.id;
      
      if (!tenantId) {
        return res.status(400).json({ message: "Tenant context required" });
      }

      const productData = insertTenantProductSchema.parse({
        ...req.body,
        tenantId // Ensure tenantId matches current tenant context
      });
      
      const product = await storage.createTenantProduct(productData);
      
      res.status(201).json(product);
    } catch (error) {
      console.error("Error creating tenant product:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: 'Invalid data', errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to create tenant product" });
      }
    }
  });

  app.put('/api/tenant-products/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;

      const existingProduct = await storage.getTenantProduct(id);
      if (!existingProduct) {
        return res.status(404).json({ message: "Tenant product not found" });
      }

      // Check if user has access to modify this tenant's products
      const { hasAccess } = await authorizeTenantAccess({
        userId,
        tenantId: existingProduct.tenantId,
        requireRole: ['admin', 'owner'],
        allowSuperAdmin: true
      });
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      const productData = insertTenantProductSchema.partial().parse(req.body);
      const product = await storage.updateTenantProduct(id, productData);
      
      if (!product) {
        return res.status(404).json({ message: "Tenant product not found" });
      }
      
      res.json(product);
    } catch (error) {
      console.error("Error updating tenant product:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: 'Invalid data', errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to update tenant product" });
      }
    }
  });

  app.delete('/api/tenant-products/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;

      const existingProduct = await storage.getTenantProduct(id);
      if (!existingProduct) {
        return res.status(404).json({ message: "Tenant product not found" });
      }

      // Check if user has access to delete this tenant's products
      const { hasAccess } = await authorizeTenantAccess({
        userId,
        tenantId: existingProduct.tenantId,
        requireRole: ['admin', 'owner'],
        allowSuperAdmin: true
      });
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      const success = await storage.deleteTenantProduct(id);
      
      if (success) {
        res.json({ message: "Tenant product deleted successfully" });
      } else {
        res.status(404).json({ message: "Tenant product not found" });
      }
    } catch (error) {
      console.error("Error deleting tenant product:", error);
      res.status(500).json({ message: "Failed to delete tenant product" });
    }
  });
  */

  // ================================
  // CREDIT SUBMISSION SYSTEM ROUTES
  // ================================

  // Get credit submission requests - Admin can see all, brokers see their own
  app.get('/api/credit-submissions', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const filters: { status?: string; brokerId?: string } = {};
      
      // If user is broker, only show their submissions
      if (user.role === 'broker' || user.role === 'master_broker') {
        filters.brokerId = userId;
      }
      
      // Apply query filters
      if (req.query.status) {
        filters.status = req.query.status as string;
      }

      const submissions = await storage.getCreditSubmissionRequests(filters);
      res.json(submissions);
    } catch (error) {
      console.error("Error fetching credit submissions:", error);
      res.status(500).json({ message: "Failed to fetch credit submissions" });
    }
  });

  // Get specific credit submission request
  app.get('/api/credit-submissions/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      const submission = await storage.getCreditSubmissionRequest(id);
      if (!submission) {
        return res.status(404).json({ message: "Credit submission not found" });
      }

      // Authorization check - brokers can only see their own submissions
      if ((user?.role === 'broker' || user?.role === 'master_broker') && submission.brokerId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      res.json(submission);
    } catch (error) {
      console.error("Error fetching credit submission:", error);
      res.status(500).json({ message: "Failed to fetch credit submission" });
    }
  });

  // Get broker's own submissions with targets - ENRICHED with related data
  app.get('/api/credit-submission-requests/my-submissions', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const submissions = await storage.getCreditSubmissionRequests({ brokerId: userId });
      
      const submissionsWithEnrichedData = await Promise.all(
        submissions.map(async (submission) => {
          // Get related data
          const client = submission.clientId ? await storage.getClient(submission.clientId) : null;
          const productTemplate = submission.productTemplateId ? await storage.getProductTemplate(submission.productTemplateId) : null;
          const broker = await storage.getUser(submission.brokerId);
          
          // Get targets with institution data
          const targets = await storage.getCreditSubmissionTargets({ requestId: submission.id });
          const enrichedTargets = await Promise.all(
            targets.map(async (target) => {
              const institution = await storage.getFinancialInstitution(target.financialInstitutionId);
              return {
                ...target,
                institution
              };
            })
          );
          
          return {
            ...submission,
            client,
            productTemplate,
            broker,
            targets: enrichedTargets
          };
        })
      );

      res.json(submissionsWithEnrichedData);
    } catch (error) {
      console.error("Error fetching my submissions:", error);
      res.status(500).json({ message: "Failed to fetch my submissions" });
    }
  });

  // Get specific submission request
  app.get('/api/credit-submission-requests/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const submission = await storage.getCreditSubmissionRequest(id);
      
      if (!submission) {
        return res.status(404).json({ message: "Submission request not found" });
      }

      // Authorization check - brokers can only see their own submissions, admins can see all
      if ((user.role === 'broker' || user.role === 'master_broker') && submission.brokerId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      res.json(submission);
    } catch (error) {
      console.error("Error fetching submission request:", error);
      res.status(500).json({ message: "Failed to fetch submission request" });
    }
  });

  // Get credit submissions for a specific client - ENRICHED with related data
  app.get('/api/credit-submissions/client/:clientId', isAuthenticated, async (req: any, res) => {
    try {
      const { clientId } = req.params;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Get all submissions for this client
      const allSubmissions = await storage.getCreditSubmissionRequests({ clientId });
      
      // Enrich with related data
      const submissionsWithEnrichedData = await Promise.all(
        allSubmissions.map(async (submission) => {
          // Get related data
          const client = submission.clientId ? await storage.getClient(submission.clientId) : null;
          const productTemplate = submission.productTemplateId ? await storage.getProductTemplate(submission.productTemplateId) : null;
          const broker = await storage.getUser(submission.brokerId);
          
          // Get targets with institution data
          const targets = await storage.getCreditSubmissionTargets({ requestId: submission.id });
          const enrichedTargets = await Promise.all(
            targets.map(async (target) => {
              const institution = await storage.getFinancialInstitution(target.financialInstitutionId);
              return {
                ...target,
                institution
              };
            })
          );
          
          return {
            ...submission,
            client,
            productTemplate,
            broker,
            targets: enrichedTargets
          };
        })
      );

      res.json(submissionsWithEnrichedData);
    } catch (error) {
      console.error("Error fetching client credit submissions:", error);
      res.status(500).json({ message: "Failed to fetch client credit submissions" });
    }
  });

  // Create new credit submission request - Brokers and Admins
  app.post('/api/credit-submissions', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      // Brokers, master brokers, admins and super_admins can create submissions
      const allowedRoles = ['broker', 'master_broker', 'admin', 'super_admin'];
      if (!user || !allowedRoles.includes(user.role)) {
        return res.status(403).json({ message: "You don't have permission to create credit submissions" });
      }

      const submissionData = insertCreditSubmissionRequestSchema.parse({
        ...req.body,
        brokerId: userId,
        status: 'pending_admin'
      });

      const submission = await storage.createCreditSubmissionRequest(submissionData);
      
      // Create targets for each selected financial institution
      const targets = [];
      if (req.body.financialInstitutionIds && Array.isArray(req.body.financialInstitutionIds)) {
        for (const institutionId of req.body.financialInstitutionIds) {
          const targetData = {
            requestId: submission.id,
            financialInstitutionId: institutionId,
            status: 'pending_admin'
          };
          const target = await storage.createCreditSubmissionTarget(targetData);
          targets.push(target);
        }
      }

      res.status(201).json({ submission, targets });
    } catch (error: any) {
      console.error("Error creating credit submission:", error);
      if (error.name === 'ZodError') {
        res.status(400).json({ message: "Invalid submission data", errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to create credit submission" });
      }
    }
  });

  // Get credit submission targets
  app.get('/api/credit-submission-targets', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const filters: { requestId?: string; status?: string; financialInstitutionId?: string } = {};
      
      if (req.query.requestId) filters.requestId = req.query.requestId as string;
      if (req.query.status) filters.status = req.query.status as string;
      if (req.query.financialInstitutionId) filters.financialInstitutionId = req.query.financialInstitutionId as string;

      const targets = await storage.getCreditSubmissionTargets(filters);
      
      // Enrich targets with request, broker, master broker, and client information
      const enrichedTargets = await Promise.all(targets.map(enrichCreditSubmissionTarget));
      
      res.json(enrichedTargets);
    } catch (error) {
      console.error("Error fetching credit submission targets:", error);
      res.status(500).json({ message: "Failed to fetch credit submission targets" });
    }
  });

  // Approve credit submission target - Admins only
  app.patch('/api/credit-submission-targets/:id/approve', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { adminNotes, details } = req.body;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      // Only admins can approve
      if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
        return res.status(403).json({ message: "Only admins can approve submissions" });
      }

      const rawTarget = await storage.approveCreditSubmissionTarget(id, userId, adminNotes, details);
      
      if (!rawTarget) {
        return res.status(404).json({ message: "Credit submission target not found" });
      }

      const target = await enrichCreditSubmissionTarget(rawTarget);
      res.json(target);
    } catch (error) {
      console.error("Error approving credit submission target:", error);
      res.status(500).json({ message: "Failed to approve credit submission target" });
    }
  });

  // Reject credit submission target - Admins only (for institution rejections)
  app.patch('/api/credit-submission-targets/:id/reject', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { adminNotes } = req.body;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      // Only admins can reject
      if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
        return res.status(403).json({ message: "Only admins can reject submissions" });
      }

      const rawTarget = await storage.rejectCreditSubmissionTarget(id, userId, adminNotes);
      
      if (!rawTarget) {
        return res.status(404).json({ message: "Credit submission target not found" });
      }

      const target = await enrichCreditSubmissionTarget(rawTarget);
      res.json(target);
    } catch (error) {
      console.error("Error rejecting credit submission target:", error);
      res.status(500).json({ message: "Failed to reject credit submission target" });
    }
  });

  // Return credit submission target to broker - Admins only
  app.patch('/api/credit-submission-targets/:id/return-to-broker', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { adminNotes, details } = req.body;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      // Only admins can return to broker
      if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
        return res.status(403).json({ message: "Only admins can return submissions to broker" });
      }

      const rawTarget = await storage.returnCreditSubmissionTargetToBroker(id, userId, details, adminNotes);
      
      if (!rawTarget) {
        return res.status(404).json({ message: "Credit submission target not found" });
      }

      const target = await enrichCreditSubmissionTarget(rawTarget);
      res.json(target);
    } catch (error) {
      console.error("Error returning credit submission target to broker:", error);
      res.status(500).json({ message: "Failed to return credit submission target to broker" });
    }
  });

  // 1. Generate PDF for credit submission target
  app.post('/api/credit-submission-targets/:id/generate-pdf', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const rawTarget = await storage.getCreditSubmissionTarget(id);
      
      if (!rawTarget) {
        return res.status(404).json({ message: "Credit submission target not found" });
      }

      const target = await enrichCreditSubmissionTarget(rawTarget);

      const doc = new PDFDocument({ margin: 50 });
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=solicitud-${id}.pdf`);
      
      doc.pipe(res);
      
      // Header con logo placeholder y título
      doc.fontSize(24).fillColor('#1e40af').text('SOLICITUD DE CRÉDITO', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor('#6b7280').text('Sistema de Gestión de Créditos para Brokers', { align: 'center' });
      doc.moveDown(1.5);
      
      // Línea separadora
      doc.strokeColor('#1e40af').lineWidth(2).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(1);
      
      // Información de referencia
      doc.fillColor('#000000').fontSize(10);
      doc.text(`Folio: ${target.requestId.substring(0, 8).toUpperCase()}`, 50, doc.y);
      doc.text(`Fecha: ${new Date().toLocaleDateString('es-MX')}`, 400, doc.y - 12, { align: 'right' });
      doc.text(`Financiera: ${target.institution?.name || 'N/A'}`, 50, doc.y + 5);
      doc.moveDown(2);
      
      if (target.request) {
        const client = target.request.client;
        
        // Sección Cliente
        doc.fontSize(14).fillColor('#1e40af').text('DATOS DEL CLIENTE', { underline: true });
        doc.moveDown(0.5);
        
        if (client) {
          doc.fontSize(10).fillColor('#000000');
          const clientData = [
            ['Nombre Completo', `${client.firstName || ''} ${client.lastName || ''}`.trim()],
            ['Tipo de Cliente', client.type === 'persona_moral' ? 'Persona Moral' : 
                             client.type === 'fisica' ? 'Persona Física' : 
                             client.type === 'fisica_empresarial' ? 'PFAE' : 
                             client.type === 'sin_sat' ? 'Sin SAT' : client.type || 'N/A'],
            ['RFC', client.rfc || 'N/A'],
            ['Email', client.email || 'N/A'],
            ['Teléfono', client.phone || 'N/A']
          ];
          
          clientData.forEach(([label, value]) => {
            doc.fillColor('#4b5563').text(label + ':', 70, doc.y);
            doc.fillColor('#000000').text(value, 220, doc.y - 12);
            doc.moveDown(0.8);
          });
        }
        
        doc.moveDown(1);
        
        // Sección Solicitud
        doc.fontSize(14).fillColor('#1e40af').text('DETALLES DE LA SOLICITUD', { underline: true });
        doc.moveDown(0.5);
        doc.fontSize(10).fillColor('#000000');
        
        const requestData = [
          ['Monto Solicitado', `$${parseFloat(target.request.requestedAmount as any).toLocaleString('es-MX')} MXN`],
          ['Producto', target.request.productTemplate?.name || 'N/A'],
          ['Propósito', target.request.purpose || 'N/A']
        ];
        
        requestData.forEach(([label, value]) => {
          doc.fillColor('#4b5563').text(label + ':', 70, doc.y);
          doc.fillColor('#000000').text(value, 220, doc.y - 12);
          doc.moveDown(0.8);
        });
        
        doc.moveDown(1);
        
        // Sección Broker
        if (target.request.broker) {
          doc.fontSize(14).fillColor('#1e40af').text('INFORMACIÓN DEL BROKER', { underline: true });
          doc.moveDown(0.5);
          doc.fontSize(10).fillColor('#000000');
          
          const brokerData = [
            ['Nombre', `${target.request.broker.firstName} ${target.request.broker.lastName}`],
            ['Email', target.request.broker.email || 'N/A']
          ];
          
          brokerData.forEach(([label, value]) => {
            doc.fillColor('#4b5563').text(label + ':', 70, doc.y);
            doc.fillColor('#000000').text(value, 220, doc.y - 12);
            doc.moveDown(0.8);
          });
          
          doc.moveDown(1);
        }
        
        // Notas importantes
        if (target.adminNotes) {
          doc.fontSize(14).fillColor('#1e40af').text('DETALLES IMPORTANTES', { underline: true });
          doc.moveDown(0.5);
          doc.fontSize(10).fillColor('#000000');
          doc.text(target.adminNotes, { align: 'justify' });
          doc.moveDown(1);
        }
        
        if (target.request.brokerNotes) {
          doc.fontSize(14).fillColor('#1e40af').text('NOTAS DEL BROKER', { underline: true });
          doc.moveDown(0.5);
          doc.fontSize(10).fillColor('#000000');
          doc.text(target.request.brokerNotes, { align: 'justify' });
        }
      }
      
      // Footer
      doc.fontSize(8).fillColor('#9ca3af')
        .text(`Generado el ${new Date().toLocaleString('es-MX')}`, 50, 750, { align: 'center' });
      
      doc.end();
    } catch (error) {
      console.error("Error generating PDF:", error);
      res.status(500).json({ message: "Failed to generate PDF" });
    }
  });

  // 2. Mark submission target as sent - Admins only
  app.patch('/api/credit-submission-targets/:id/mark-sent', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
        return res.status(403).json({ message: "Only admins can mark as sent" });
      }

      // Get the target to find the associated submission
      const existingTarget = await storage.getCreditSubmissionTarget(id);
      if (!existingTarget) {
        return res.status(404).json({ message: "Credit submission target not found" });
      }

      const rawTarget = await storage.updateCreditSubmissionTarget(id, {
        status: 'sent',
        reviewedBy: userId,
        reviewedAt: new Date(),
      });
      
      if (!rawTarget) {
        return res.status(404).json({ message: "Credit submission target not found" });
      }

      // Update the submission status to sent_to_institutions
      await storage.updateCreditSubmissionRequest(existingTarget.requestId, {
        status: 'sent_to_institutions',
      });

      const target = await enrichCreditSubmissionTarget(rawTarget);
      res.json(target);
    } catch (error) {
      console.error("Error marking as sent:", error);
      res.status(500).json({ message: "Failed to mark as sent" });
    }
  });

  // 3. Upload proposal document
  app.post('/api/credit-submission-targets/:id/upload-proposal', isAuthenticated, upload.single('proposalDocument'), async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
        return res.status(403).json({ message: "Only admins can upload proposals" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const rawTarget = await storage.updateCreditSubmissionTarget(id, {
        proposalDocument: req.file.path,
      });
      
      if (!rawTarget) {
        return res.status(404).json({ message: "Credit submission target not found" });
      }

      const target = await enrichCreditSubmissionTarget(rawTarget);
      res.json(target);
    } catch (error) {
      console.error("Error uploading proposal:", error);
      res.status(500).json({ message: "Failed to upload proposal" });
    }
  });

  // 4. Save institution proposal - Admins only
  app.post('/api/credit-submission-targets/:id/institution-proposal', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
        return res.status(403).json({ message: "Only admins can save institution proposals" });
      }

      const proposalSchema = z.object({
        approvedAmount: z.number(),
        interestRate: z.number(),
        term: z.number(),
        openingCommission: z.number().optional(),
      });

      const proposal = proposalSchema.parse(req.body);

      const rawTarget = await storage.updateCreditSubmissionTarget(id, {
        institutionProposal: proposal,
        status: 'institution_approved',
        proposalReceivedAt: new Date(),
      });
      
      if (!rawTarget) {
        return res.status(404).json({ message: "Credit submission target not found" });
      }

      const target = await enrichCreditSubmissionTarget(rawTarget);
      res.json(target);
    } catch (error) {
      console.error("Error saving institution proposal:", error);
      res.status(500).json({ message: "Failed to save institution proposal" });
    }
  });

  // 5. Select winner - Brokers and admins can select
  app.patch('/api/credit-submission-targets/:id/select-winner', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const target = await storage.getCreditSubmissionTarget(id);
      
      if (!target) {
        return res.status(404).json({ message: "Credit submission target not found" });
      }

      // Get the submission request to verify ownership
      const request = await storage.getCreditSubmissionRequest(target.requestId);
      if (!request) {
        return res.status(404).json({ message: "Credit submission request not found" });
      }

      // Only the broker who created the submission or admins can select winner
      const isAdmin = user.role === 'admin' || user.role === 'super_admin';
      const isOwner = request.brokerId === userId;
      
      if (!isAdmin && !isOwner) {
        return res.status(403).json({ message: "Only the broker who created the submission or admins can select the winner" });
      }

      const allTargets = await storage.getCreditSubmissionTargetsByRequest(target.requestId);
      
      for (const t of allTargets) {
        if (t.id === id) {
          await storage.updateCreditSubmissionTarget(t.id, {
            isWinner: true,
            status: 'selected_winner',
          });
        } else {
          await storage.updateCreditSubmissionTarget(t.id, {
            isWinner: false,
          });
        }
      }

      const proposal = target.institutionProposal as any;
      const credit = await storage.createCredit({
        clientId: request.clientId,
        brokerId: request.brokerId,
        financialInstitutionId: target.financialInstitutionId,
        amount: proposal.approvedAmount?.toString() || request.requestedAmount.toString(),
        interestRate: proposal.interestRate?.toString(),
        term: proposal.term,
        purpose: request.purpose,
        status: 'approved',
      });

      await storage.updateCreditSubmissionTarget(id, {
        creditId: credit.id,
      });

      const enrichedTarget = await enrichCreditSubmissionTarget(target);
      res.json({ target: enrichedTarget, credit });
    } catch (error) {
      console.error("Error selecting winner:", error);
      res.status(500).json({ message: "Failed to select winner" });
    }
  });

  // 6. Mark as dispersed - Only for winners - CREATES CREDIT IN credits TABLE
  app.patch('/api/credit-submission-targets/:id/mark-dispersed', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
        return res.status(403).json({ message: "Only admins can mark as dispersed" });
      }

      const target = await storage.getCreditSubmissionTarget(id);
      
      if (!target) {
        return res.status(404).json({ message: "Credit submission target not found" });
      }

      if (!target.isWinner) {
        return res.status(400).json({ message: "Only winner targets can be marked as dispersed" });
      }

      // Prevent duplicate dispersal - check if already dispersed
      if (target.status === 'dispersed') {
        const enrichedTarget = await enrichCreditSubmissionTarget(target);
        return res.json(enrichedTarget);
      }

      // Get submission request
      const request = await storage.getCreditSubmissionRequest(target.requestId);
      if (!request) {
        return res.status(404).json({ message: "Credit submission request not found" });
      }

      let credit;
      const proposal = target.institutionProposal as any;
      
      // Check if credit already exists (from select-winner flow)
      if (target.creditId) {
        // Reuse existing credit, update status AND backfill linked fields
        credit = await storage.updateCredit(target.creditId, {
          status: 'disbursed',
          linkedSubmissionId: request.id, // Backfill link to original submission
          productTemplateId: request.productTemplateId, // Backfill product template
        });
      } else {
        // Create new credit in credits table with linked submission
        credit = await storage.createCredit({
          clientId: request.clientId,
          brokerId: request.brokerId,
          financialInstitutionId: target.financialInstitutionId,
          productTemplateId: request.productTemplateId,
          linkedSubmissionId: request.id, // Link to original submission
          amount: proposal.approvedAmount?.toString() || request.requestedAmount.toString(),
          interestRate: proposal.interestRate?.toString(),
          term: proposal.term,
          purpose: request.purpose,
          status: 'disbursed', // Start as disbursed since we're dispersing it
        });
      }

      // Update target with dispersal info
      const updated = await storage.updateCreditSubmissionTarget(id, {
        status: 'dispersed',
        dispersedAt: new Date(),
        creditId: credit!.id,
      });

      // CREATE COMMISSIONS
      if (proposal && proposal.approvedAmount) {
        const broker = await storage.getUser(request.brokerId);
        if (broker) {
          const masterBrokerId = broker.masterBrokerId;
          const approvedAmount = parseFloat(proposal.approvedAmount);
          
          // Get institution for commission rates
          const institution = await storage.getFinancialInstitution(target.financialInstitutionId);
          
          if (institution) {
            const commissionRates = institution.commissionRates as any || {};
            
            // Calculate opening commission for broker
            if (commissionRates.broker?.apertura) {
              const brokerOpeningRate = parseFloat(commissionRates.broker.apertura);
              const brokerOpeningAmount = (approvedAmount * brokerOpeningRate) / 100;
              
              await storage.createCommission({
                creditId: credit!.id,
                brokerId: request.brokerId,
                masterBrokerId: masterBrokerId || null,
                amount: brokerOpeningAmount.toFixed(2),
                brokerShare: brokerOpeningAmount.toFixed(2),
                masterBrokerShare: '0.00',
                appShare: '0.00',
                status: 'pending',
                commissionType: 'apertura',
              });
              
              console.log(`[Commission] Created opening commission for broker ${request.brokerId}: $${brokerOpeningAmount.toFixed(2)}`);
            }
            
            // Calculate opening commission for master broker if exists
            if (masterBrokerId && commissionRates.masterBroker?.apertura) {
              const masterOpeningRate = parseFloat(commissionRates.masterBroker.apertura);
              const masterOpeningAmount = (approvedAmount * masterOpeningRate) / 100;
              
              await storage.createCommission({
                creditId: credit!.id,
                brokerId: request.brokerId, // Keep original broker as brokerId
                masterBrokerId: masterBrokerId, // Set master broker in masterBrokerId field
                amount: masterOpeningAmount.toFixed(2),
                brokerShare: '0.00',
                masterBrokerShare: masterOpeningAmount.toFixed(2),
                appShare: '0.00',
                status: 'pending',
                commissionType: 'apertura',
              });
              
              console.log(`[Commission] Created opening commission for master broker ${masterBrokerId}: $${masterOpeningAmount.toFixed(2)}`);
            }
          }
        }
      }

      const enrichedTarget = await enrichCreditSubmissionTarget(updated!);
      res.json(enrichedTarget);
    } catch (error) {
      console.error("Error marking as dispersed:", error);
      res.status(500).json({ message: "Failed to mark as dispersed" });
    }
  });

  // ============================================
  // EXCEL IMPORT ROUTES
  // ============================================
  
  const excelUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const ext = file.originalname.toLowerCase();
      if (ext.endsWith('.xlsx') || ext.endsWith('.xls')) {
        cb(null, true);
      } else {
        cb(new Error('Solo se permiten archivos Excel (.xlsx, .xls)'));
      }
    }
  });

  app.get('/api/import/template/:type', isAuthenticated, async (req: any, res) => {
    try {
      const { type } = req.params;
      const userId = req.user?.claims?.sub || req.user?.id;
      
      if (!userId) {
        return res.status(401).json({ message: 'No autorizado' });
      }
      
      const hasPermission = await requirePlatformRole(userId, ['super_admin', 'admin']);
      if (!hasPermission) {
        return res.status(403).json({ message: 'Solo administradores pueden descargar templates' });
      }
      
      let buffer: Buffer;
      let filename: string;
      
      if (type === 'financieras') {
        buffer = generateFinancierasTemplate();
        filename = 'template_financieras_productos.xlsx';
      } else if (type === 'clients') {
        buffer = generateClientsTemplate();
        filename = 'template_clientes.xlsx';
      } else {
        return res.status(400).json({ message: 'Tipo de template inválido' });
      }
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (error: any) {
      console.error('Error generating template:', error);
      res.status(500).json({ message: error.message || 'Error al generar template' });
    }
  });

  app.post('/api/import/preview/:type', isAuthenticated, excelUpload.single('file'), async (req: any, res) => {
    try {
      const { type } = req.params;
      const userId = req.user?.claims?.sub || req.user?.id;
      
      if (!userId) {
        return res.status(401).json({ message: 'No autorizado' });
      }
      
      const hasPermission = await requirePlatformRole(userId, ['super_admin', 'admin']);
      if (!hasPermission) {
        return res.status(403).json({ message: 'Solo administradores pueden importar datos' });
      }
      
      if (!req.file) {
        return res.status(400).json({ message: 'No se recibió ningún archivo' });
      }
      
      if (type !== 'financieras' && type !== 'clients') {
        return res.status(400).json({ message: 'Tipo de importación inválido' });
      }
      
      const preview = previewExcelFile(req.file.buffer, type);
      res.json(preview);
    } catch (error: any) {
      console.error('Error previewing file:', error);
      res.status(500).json({ message: error.message || 'Error al previsualizar archivo' });
    }
  });

  app.post('/api/import/financieras', isAuthenticated, excelUpload.single('file'), async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || req.user?.id;
      
      if (!userId) {
        return res.status(401).json({ message: 'No autorizado' });
      }
      
      const hasPermission = await requirePlatformRole(userId, ['super_admin', 'admin']);
      if (!hasPermission) {
        return res.status(403).json({ message: 'Solo administradores pueden importar financieras' });
      }
      
      if (!req.file) {
        return res.status(400).json({ message: 'No se recibió ningún archivo' });
      }
      
      const result = await importFinancieras(req.file.buffer, userId);
      res.json(result);
    } catch (error: any) {
      console.error('Error importing financieras:', error);
      res.status(500).json({ message: error.message || 'Error al importar financieras' });
    }
  });

  app.post('/api/import/clients', isAuthenticated, excelUpload.single('file'), async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || req.user?.id;
      
      if (!userId) {
        return res.status(401).json({ message: 'No autorizado' });
      }
      
      const hasPermission = await requirePlatformRole(userId, ['super_admin', 'admin']);
      if (!hasPermission) {
        return res.status(403).json({ message: 'Solo administradores pueden importar clientes' });
      }
      
      if (!req.file) {
        return res.status(400).json({ message: 'No se recibió ningún archivo' });
      }
      
      const result = await importClients(req.file.buffer, userId);
      res.json(result);
    } catch (error: any) {
      console.error('Error importing clients:', error);
      res.status(500).json({ message: error.message || 'Error al importar clientes' });
    }
  });


  // WebSocket setup
  const httpServer = createServer(app);
  
  const wss = new WebSocketServer({ 
    server: httpServer, 
    path: '/ws' 
  });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const userId = url.searchParams.get('userId');
    
    if (userId) {
      wsClients.set(userId, ws);
      console.log(`WebSocket connected for user: ${userId}`);
    }

    ws.on('close', () => {
      if (userId) {
        wsClients.delete(userId);
        console.log(`WebSocket disconnected for user: ${userId}`);
      }
    });
  });

  // Cron job for credit expiration alerts
  cron.schedule('0 9 * * *', async () => { // Daily at 9 AM
    console.log('Running daily credit expiration check...');
    
    const expiringCredits = await storage.getExpiringCredits(30);
    
    for (const credit of expiringCredits) {
      const notification = await storage.createNotification({
        userId: credit.brokerId,
        type: 'credit_expiring',
        title: 'Crédito próximo a vencer',
        message: `El crédito ${credit.id} vence en los próximos 30 días`,
        data: { creditId: credit.id },
        priority: 'high',
      });
      
      // Broadcast real-time notification
      broadcastToUser(credit.brokerId, {
        type: 'notification',
        notification,
      });
    }
  });

  return httpServer;
}
