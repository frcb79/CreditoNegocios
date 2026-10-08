import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import express from "express";
// @ts-ignore
import request from "supertest";
import cron from "node-cron";
import bcrypt from "bcrypt";
import { storage } from "../../server/storage";
import { registerRoutes } from "../../server/routes";
import { pool } from "../../server/db";
import { runAutoMigration } from "../../server/autoMigrate";

describe("P0 Hotfix - Production Security & Zero-Destructive Startup", () => {
  let app: express.Express;
  let server: Server;
  let currentAuthUser: any = null;

  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    app = express();
    app.use(express.json());

    // Mock session middleware for testing
    app.use((req: any, _res: any, next: any) => {
      req.login = (_claims: any, cb: any) => cb(null);
      req.session = { 
        save: (cb: any) => cb(null),
        regenerate: (cb: any) => cb(null),
      };
      if (currentAuthUser) {
        req.isAuthenticated = () => true;
        req.user = currentAuthUser;
        req.user.claims = { sub: currentAuthUser.id };
        req.dbUser = currentAuthUser;
      } else {
        req.isAuthenticated = () => false;
        req.user = null;
        req.dbUser = null;
      }
      next();
    });

    server = await registerRoutes(app);
  });

  afterAll(async () => {
    cron.getTasks().forEach((task: any) => task.stop());
    if (server && (server as any).listening) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    try {
      await pool.end();
    } catch {
      // Ignore pool closing in test
    }
  });

  // =========================================================================
  // 1. LOGIN SECURITY: Eliminación de contraseñas hardcodeadas y bypasses
  // =========================================================================
  describe("1. Login Security Hardening (/api/auth/login)", () => {
    let superAdminUser: any;
    let suspendedUser: any;
    let inactiveUser: any;
    const realPassword = "SuperSecurePassword2026!";

    beforeEach(async () => {
      currentAuthUser = null;
      const hashedPassword = await bcrypt.hash(realPassword, 10);

      superAdminUser = await storage.createUser({
        email: `francocb79@gmail.com`, // Correo antes sujeto a bypass
        password: hashedPassword,
        firstName: "Franco",
        lastName: "Admin",
        role: "super_admin",
        isActive: true,
        status: "active",
      } as any);

      suspendedUser = await storage.createUser({
        email: `suspended-${randomUUID()}@network.test`,
        password: hashedPassword,
        firstName: "Suspended",
        lastName: "User",
        role: "broker",
        isActive: true,
        status: "suspended",
      } as any);

      inactiveUser = await storage.createUser({
        email: `inactive-${randomUUID()}@network.test`,
        password: hashedPassword,
        firstName: "Inactive",
        lastName: "User",
        role: "broker",
        isActive: false,
        status: "inactive",
      } as any);
    });

    it("Rechaza contraseñas hardcodeadas ('Prueba1$', 'Franco2026!*') en cuenta de super admin", async () => {
      const resPrueba = await request(app)
        .post("/api/auth/login")
        .send({ email: "francocb79@gmail.com", password: "Prueba1$" });
      expect(resPrueba.status).toBe(401);
      expect(resPrueba.body.message).toMatch(/Email o contraseña incorrectos/i);

      const resFranco = await request(app)
        .post("/api/auth/login")
        .send({ email: "francocb79@gmail.com", password: "Franco2026!*" });
      expect(resFranco.status).toBe(401);
      expect(resFranco.body.message).toMatch(/Email o contraseña incorrectos/i);
    });

    it("Permite login normal exclusivamente con contraseña válida criptográfica", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: "francocb79@gmail.com", password: realPassword });
      expect(res.status).toBe(200);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe("francocb79@gmail.com");
    });

    it("Bloquea cuentas suspendidas aun cuando la contraseña sea correcta", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: suspendedUser.email, password: realPassword });
      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/cuenta se encuentra temporalmente suspendida/i);
    });

    it("Bloquea cuentas inactivas aun cuando la contraseña sea correcta", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: inactiveUser.email, password: realPassword });
      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/cuenta ha sido desactivada/i);
    });

    it("No cambia authMethod a 'local' si la verificación de credenciales falla", async () => {
      const externalUser = await storage.createUser({
        email: `external-${randomUUID()}@network.test`,
        password: await bcrypt.hash("LegitPass123!", 10),
        firstName: "External",
        lastName: "AuthUser",
        role: "broker",
        isActive: true,
        status: "active",
        authMethod: "replit",
      } as any);

      // Intento fallido con contraseña errónea
      const resFail = await request(app)
        .post("/api/auth/login")
        .send({ email: externalUser.email, password: "WrongPassword999!" });
      expect(resFail.status).toBe(401);

      // authMethod debe mantenerse como estaba (no mutar a 'local')
      const userAfterFail = await storage.getUser(externalUser.id);
      expect(userAfterFail?.authMethod).toBe("replit");

      // Ahora intento exitoso con contraseña correcta
      const resSuccess = await request(app)
        .post("/api/auth/login")
        .send({ email: externalUser.email, password: "LegitPass123!" });
      expect(resSuccess.status).toBe(200);

      // Ahora sí authMethod migra a 'local'
      const userAfterSuccess = await storage.getUser(externalUser.id);
      expect(userAfterSuccess?.authMethod).toBe("local");
    });
  });

  // =========================================================================
  // 2. ZERO-DESTRUCTIVE STARTUP: AutoMigrate sin mutaciones DML en BD existente
  // =========================================================================
  describe("2. Zero-Destructive Startup (Stateful Database Simulation)", () => {
    let originalConnect: any;

    interface MockDbState {
      users: any[];
      institutions: any[];
      commissions: any[];
    }

    let dbState: MockDbState;

    beforeEach(async () => {
      const realSecretHash = await bcrypt.hash("CustomSecretPassword999!", 10);
      dbState = {
        users: [
          {
            id: "user-super-1",
            email: "francocb79@gmail.com",
            password: realSecretHash,
            role: "super_admin",
            is_active: true,
            status: "active",
          },
          {
            id: "user-master-1",
            email: "fcb@creditonegocios.com.mx",
            password: realSecretHash,
            role: "master_broker",
            is_active: true,
            status: "active",
          },
          {
            id: "user-suspended-1",
            email: "suspended@broker.test",
            password: realSecretHash,
            role: "broker",
            is_active: false,
            status: "suspended",
          },
        ],
        institutions: [
          { id: "inst-active", name: "Financiera Activa", is_active: true },
          { id: "inst-inactive", name: "Financiera Desactivada Negocio", is_active: false },
          { id: "inst-demo", name: "Financiera Demo", is_active: false },
        ],
        commissions: [
          { id: "comm-1", status: "pending", amount: "50000.00" },
          { id: "comm-2", status: "paid", amount: "25000.00" },
        ],
      };

      originalConnect = pool.connect;
      (pool as any).connect = jest.fn().mockImplementation(async () => {
        return {
          query: jest.fn().mockImplementation(async (sql: string, params?: any[]) => {
            const normalizedSql = sql.replace(/\s+/g, " ").trim();

            // 1. SELECT count(*) as count FROM public.users
            if (/SELECT\s+count\(\*\)\s+as\s+count\s+FROM\s+public\.users/i.test(normalizedSql)) {
              return { rows: [{ count: String(dbState.users.length) }] };
            }

            // 2. Catch destructive user updates
            if (/UPDATE\s+public\.users\s+SET/i.test(normalizedSql)) {
              if (/password\s*=/i.test(normalizedSql)) {
                throw new Error("VIOLATION: Attempted to overwrite user passwords on startup!");
              }
              if (/is_active\s*=\s*TRUE/i.test(normalizedSql)) {
                throw new Error("VIOLATION: Attempted to force reactivate users on startup!");
              }
              return { rows: [], rowCount: 0 };
            }

            // 3. Catch institution deletions
            if (/DELETE\s+FROM\s+public\.financial_institutions/i.test(normalizedSql)) {
              throw new Error("VIOLATION: Attempted to delete financial institutions on startup!");
            }

            // 4. Catch institution mass-activations
            if (/UPDATE\s+public\.financial_institutions\s+SET\s+is_active\s*=\s*TRUE/i.test(normalizedSql)) {
              throw new Error("VIOLATION: Attempted to mass-reactivate financial institutions on startup!");
            }

            // 5. Catch commission deletions
            if (/DELETE\s+FROM\s+public\.commissions/i.test(normalizedSql)) {
              throw new Error("VIOLATION: Attempted to delete commissions on startup!");
            }

            // 6. Catch commission status changes
            if (/UPDATE\s+public\.commissions\s+SET\s+status\s*=\s*'generated'/i.test(normalizedSql)) {
              throw new Error("VIOLATION: Attempted to auto-convert commission status on startup!");
            }

            // DDL or other safe queries
            return { rows: [], rowCount: 0 };
          }),
          release: jest.fn(),
        };
      });
    });

    afterEach(() => {
      (pool as any).connect = originalConnect;
    });

    it("El arranque conserva intactos usuarios, contraseñas, financieras y comisiones", async () => {
      delete process.env.USE_MEMORY_STORAGE;
      await runAutoMigration();

      // Verify passwords and states were not mutated
      const superUser = dbState.users.find((u) => u.email === "francocb79@gmail.com");
      expect(await bcrypt.compare("CustomSecretPassword999!", superUser.password)).toBe(true);
      expect(await bcrypt.compare("Prueba1$", superUser.password)).toBe(false);

      const suspended = dbState.users.find((u) => u.email === "suspended@broker.test");
      expect(suspended.status).toBe("suspended");
      expect(suspended.is_active).toBe(false);

      // Verify institutions and commissions were not touched
      expect(dbState.institutions.find((i) => i.id === "inst-inactive")?.is_active).toBe(false);
      expect(dbState.commissions.find((c) => c.id === "comm-1")?.status).toBe("pending");
    });

    it("Múltiples cold-starts consecutivos son 100% idempotentes y no destructivos", async () => {
      delete process.env.USE_MEMORY_STORAGE;
      // Boot 1
      await runAutoMigration();
      // Boot 2
      await runAutoMigration();
      // Boot 3
      await runAutoMigration();

      const superUser = dbState.users.find((u) => u.email === "francocb79@gmail.com");
      expect(await bcrypt.compare("CustomSecretPassword999!", superUser.password)).toBe(true);
    });

    it("En base vacía, no crea super admin si ADMIN_INITIAL_PASSWORD falta o es default/insegura", async () => {
      let insertedUsers: any[] = [];
      const mockClient = {
        query: jest.fn().mockImplementation(async (sql: string, params?: any[]) => {
          const normalizedSql = sql.replace(/\s+/g, " ").trim();
          if (/SELECT\s+count\(\*\)\s+as\s+count\s+FROM\s+public\.users/i.test(normalizedSql)) {
            return { rows: [{ count: "0" }] }; // DB vacía
          }
          if (/INSERT INTO public\.users/i.test(normalizedSql) && /francocb79@gmail\.com/i.test(normalizedSql)) {
            insertedUsers.push(params);
            return { rows: [], rowCount: 1 };
          }
          return { rows: [], rowCount: 0 };
        }),
        release: jest.fn(),
      };
      (pool as any).connect = jest.fn().mockResolvedValue(mockClient);

      delete process.env.ADMIN_INITIAL_PASSWORD;
      delete process.env.USE_MEMORY_STORAGE;
      await runAutoMigration();
      expect(insertedUsers.length).toBe(0);

      // Con default / insegura 'Prueba1$'
      process.env.ADMIN_INITIAL_PASSWORD = "Prueba1$";
      await runAutoMigration();
      expect(insertedUsers.length).toBe(0);

      // Con contraseña explícita y segura (>= 12 chars, mayúscula, minúscula, número)
      process.env.ADMIN_INITIAL_PASSWORD = "SuperSecureAdminPassword2026!";
      await runAutoMigration();
      expect(insertedUsers.length).toBe(1);
      expect(await bcrypt.compare("SuperSecureAdminPassword2026!", insertedUsers[0][0])).toBe(true);

      delete process.env.ADMIN_INITIAL_PASSWORD;
    });

    it("No ejecuta UPDATE residuales sobre users o tenant_members can_originate durante el arranque", async () => {
      const executedQueries: string[] = [];
      const mockClient = {
        query: jest.fn().mockImplementation(async (sql: string) => {
          executedQueries.push(sql);
          if (/SELECT\s+count\(\*\)\s+as\s+count\s+FROM\s+public\.users/i.test(sql)) {
            return { rows: [{ count: "10" }] };
          }
          return { rows: [], rowCount: 0 };
        }),
        release: jest.fn(),
      };
      (pool as any).connect = jest.fn().mockResolvedValue(mockClient);

      delete process.env.USE_MEMORY_STORAGE;
      await runAutoMigration();

      const hasUserUpdate = executedQueries.some((q) => /UPDATE\s+public\.users/i.test(q));
      const hasTenantMembersUpdate = executedQueries.some((q) => /UPDATE\s+public\.tenant_members/i.test(q));
      expect(hasUserUpdate).toBe(false);
      expect(hasTenantMembersUpdate).toBe(false);
    });
  });
});
