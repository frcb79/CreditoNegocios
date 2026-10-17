import express from "express";
import session from "express-session";
import cron from "node-cron";
import type { Server } from "http";
// @ts-ignore
import request from "supertest";
import {
  getPublishedLegalDocument,
  getAllApprovedCatalogVersions,
  getApprovedLegalDocument,
  validateRegistrationAcceptance,
} from "../../server/legalDocuments";
import { registerLegalRoutes } from "../../server/legalRoutes";
import { registerRoutes } from "../../server/routes";
import { MemStorage, storage } from "../../server/storage";
import catalog from "../../server/legalDocumentCatalog.json";

const afterPublication = new Date("2026-10-07T12:00:00Z");

describe("Bloque 2: Legal Document Persistence & Registration Acceptance Evidence", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  describe("1. Persistence of approved catalog versions and immutability", () => {
    it("loads all 5 approved legal documents into storage upon initialization", async () => {
      const memStorage = new MemStorage();
      const versions = await memStorage.getLegalDocumentVersions();
      expect(versions.length).toBe(5);

      const terms = await memStorage.getLegalDocumentVersion("terminos:1.0");
      expect(terms).toBeDefined();
      expect(terms?.document).toBe("terminos");
      expect(terms?.version).toBe("1.0");
      expect(terms?.contentSha256).toBe("e2ec998a066e702a43ee0f69dbadce692a5dac6171774254664d372423f1f2eb");

      const privacy = await memStorage.getLegalDocumentVersion("aviso:1.0");
      expect(privacy).toBeDefined();
      expect(privacy?.document).toBe("aviso");
      expect(privacy?.version).toBe("1.0");
      expect(privacy?.contentSha256).toBe("66b082fab14d3aded2362796ded41f88b6ee71e2452208f024c48e16f1416efd");

      const convenio = await memStorage.getLegalDocumentVersion("convenio:1.0");
      expect(convenio).toBeDefined();
      expect(convenio?.contentSha256).toBe("8da70ad24e725d7d9e1a15dee77b6058f6e2a41ea6fe996ab3d3e1cf6400824a");

      const reglasRed = await memStorage.getLegalDocumentVersion("reglas-red:1.0");
      expect(reglasRed).toBeDefined();
      expect(reglasRed?.contentSha256).toBe("0b63f36bbefc7e94cb35be0fd98816c4773f1409b576b83769cebdd5f879014c");

      const reglasMaster = await memStorage.getLegalDocumentVersion("reglas-master:1.0");
      expect(reglasMaster).toBeDefined();
      expect(reglasMaster?.contentSha256).toBe("d7f3aca19b76f7b551a2a3f6df623bd9f236513a15c8410be4d9eaea4cc56760");
    });

    it("exposes all approved catalog versions through helper functions", () => {
      const allApproved = getAllApprovedCatalogVersions();
      expect(allApproved.length).toBe(5);

      const terms = getApprovedLegalDocument("terminos", "1.0");
      expect(terms?.id).toBe("terminos:1.0");
      expect(terms?.contentSha256).toBe("e2ec998a066e702a43ee0f69dbadce692a5dac6171774254664d372423f1f2eb");

      const privacy = getApprovedLegalDocument("aviso", "1.0");
      expect(privacy?.id).toBe("aviso:1.0");
      expect(privacy?.contentSha256).toBe("66b082fab14d3aded2362796ded41f88b6ee71e2452208f024c48e16f1416efd");
    });

    it("prevents mutating objects returned by MemStorage from altering stored versions (structuredClone)", async () => {
      const memStorage = new MemStorage();
      const termsBefore = await memStorage.getLegalDocumentVersion("terminos:1.0");
      expect(termsBefore).toBeDefined();
      const originalTitle = termsBefore!.title;
      const originalContent = termsBefore!.content;

      // Attempt mutating the returned object
      termsBefore!.title = "MUTATED_TITLE";
      termsBefore!.content = "MUTATED_CONTENT";

      // Re-fetch and verify storage remains pristine
      const freshTerms = await memStorage.getLegalDocumentVersion("terminos:1.0");
      expect(freshTerms!.title).toBe(originalTitle);
      expect(freshTerms!.content).toBe(originalContent);

      const allVersions = await memStorage.getLegalDocumentVersions();
      allVersions[0].content = "CORRUPTED_ALL";
      const freshAllVersions = await memStorage.getLegalDocumentVersions();
      expect(freshAllVersions[0].content).not.toBe("CORRUPTED_ALL");
    });

    it("prevents mutating objects returned by MemStorage from altering stored acceptances", async () => {
      const memStorage = new MemStorage();
      const termsDoc = getApprovedLegalDocument("terminos", "1.0")!;
      const privacyDoc = getApprovedLegalDocument("aviso", "1.0")!;

      const result = await memStorage.registerUserWithLegalEvidence({
        userData: {
          email: "immutable-evidence@example.com",
          password: "password123",
          firstName: "Mario",
          lastName: "Test",
          authMethod: "local",
          role: "broker",
        },
        evidence: {
          ipAddress: "198.51.100.1",
          userAgent: "TestAgent/1.0",
          termsDoc,
          privacyDoc,
        },
      });

      // Attempt mutating the returned acceptances directly
      result.acceptances[0].ipAddress = "999.999.999.999";
      result.acceptances[0].userAgent = "HACKED_AGENT";

      const acceptances = await memStorage.getLegalAcceptancesByUser(result.user.id);
      expect(acceptances[0].ipAddress).toBe("198.51.100.1");
      expect(acceptances[0].userAgent).toBe("TestAgent/1.0");

      // Attempt mutating array returned by getLegalAcceptancesByUser
      acceptances[0].ipAddress = "888.888.888.888";
      const freshAcceptances = await memStorage.getLegalAcceptancesByUser(result.user.id);
      expect(freshAcceptances[0].ipAddress).toBe("198.51.100.1");
    });
  });

  describe("2. Server-side validation of confirmations and published versions", () => {
    it("accepts valid confirmations matching current published versions", () => {
      const result = validateRegistrationAcceptance({
        acceptTerms: true,
        termsVersion: "1.0",
        acknowledgePrivacy: true,
        privacyVersion: "1.0",
        now: afterPublication,
      });

      expect(result.valid).toBe(true);
      expect(result.termsDoc?.id).toBe("terminos:1.0");
      expect(result.privacyDoc?.id).toBe("aviso:1.0");
    });

    it("rejects when Terms acceptance is false or missing", () => {
      const missing = validateRegistrationAcceptance({
        termsVersion: "1.0",
        acknowledgePrivacy: true,
        privacyVersion: "1.0",
        now: afterPublication,
      });
      expect(missing.valid).toBe(false);
      expect(missing.error).toContain("Términos y Condiciones");

      const falsy = validateRegistrationAcceptance({
        acceptTerms: false,
        termsVersion: "1.0",
        acknowledgePrivacy: true,
        privacyVersion: "1.0",
        now: afterPublication,
      });
      expect(falsy.valid).toBe(false);
      expect(falsy.error).toContain("Términos y Condiciones");
    });

    it("rejects when Privacy acknowledgment is false or missing", () => {
      const missing = validateRegistrationAcceptance({
        acceptTerms: true,
        termsVersion: "1.0",
        privacyVersion: "1.0",
        now: afterPublication,
      });
      expect(missing.valid).toBe(false);
      expect(missing.error).toContain("Aviso de Privacidad");

      const falsy = validateRegistrationAcceptance({
        acceptTerms: true,
        termsVersion: "1.0",
        acknowledgePrivacy: false,
        privacyVersion: "1.0",
        now: afterPublication,
      });
      expect(falsy.valid).toBe(false);
      expect(falsy.error).toContain("Aviso de Privacidad");
    });

    it("rejects when termsVersion is outdated or unknown", () => {
      const outdated = validateRegistrationAcceptance({
        acceptTerms: true,
        termsVersion: "0.9",
        acknowledgePrivacy: true,
        privacyVersion: "1.0",
        now: afterPublication,
      });
      expect(outdated.valid).toBe(false);
      expect(outdated.error).toContain("desactualizada");

      const future = validateRegistrationAcceptance({
        acceptTerms: true,
        termsVersion: "2.0",
        acknowledgePrivacy: true,
        privacyVersion: "1.0",
        now: afterPublication,
      });
      expect(future.valid).toBe(false);
      expect(future.error).toContain("desactualizada");
    });

    it("rejects when privacyVersion is outdated or unknown", () => {
      const outdated = validateRegistrationAcceptance({
        acceptTerms: true,
        termsVersion: "1.0",
        acknowledgePrivacy: true,
        privacyVersion: "0.5",
        now: afterPublication,
      });
      expect(outdated.valid).toBe(false);
      expect(outdated.error).toContain("desactualizada");

      const nonExistent = validateRegistrationAcceptance({
        acceptTerms: true,
        termsVersion: "1.0",
        acknowledgePrivacy: true,
        privacyVersion: "9.9",
        now: afterPublication,
      });
      expect(nonExistent.valid).toBe(false);
      expect(nonExistent.error).toContain("desactualizada");
    });
  });

  describe("3. In-transaction validation and discrepancy rollback", () => {
    it("creates account and 2 legal acceptance records atomically with server timestamp, IP and user agent", async () => {
      const memStorage = new MemStorage();
      const email = `broker-${Date.now()}@example.com`;
      const termsDoc = getApprovedLegalDocument("terminos", "1.0")!;
      const privacyDoc = getApprovedLegalDocument("aviso", "1.0")!;

      const result = await memStorage.registerUserWithLegalEvidence({
        userData: {
          email,
          password: "hashedPassword123",
          firstName: "Carlos",
          lastName: "López",
          authMethod: "local",
          role: "broker",
        },
        evidence: {
          ipAddress: "203.0.113.42",
          userAgent: "Mozilla/5.0 TestBrowser/1.0",
          termsDoc: {
            id: termsDoc.id,
            document: termsDoc.document,
            version: termsDoc.version,
            contentSha256: termsDoc.contentSha256,
          },
          privacyDoc: {
            id: privacyDoc.id,
            document: privacyDoc.document,
            version: privacyDoc.version,
            contentSha256: privacyDoc.contentSha256,
          },
        },
      });

      expect(result.user).toBeDefined();
      expect(result.user.email).toBe(email);
      expect(result.acceptances.length).toBe(2);

      const termsRecord = result.acceptances.find((a) => a.document === "terminos");
      expect(termsRecord).toBeDefined();
      expect(termsRecord?.userId).toBe(result.user.id);
      expect(termsRecord?.userEmail).toBe(email);
      expect(termsRecord?.documentId).toBe("terminos:1.0");
      expect(termsRecord?.version).toBe("1.0");
      expect(termsRecord?.contentSha256).toBe(termsDoc.contentSha256);
      expect(termsRecord?.acceptanceType).toBe("accept_terms");
      expect(termsRecord?.ipAddress).toBe("203.0.113.42");
      expect(termsRecord?.userAgent).toBe("Mozilla/5.0 TestBrowser/1.0");
      expect(Object.prototype.toString.call(termsRecord?.acceptedAt)).toBe("[object Date]");
      expect(Number.isFinite(new Date(termsRecord!.acceptedAt).getTime())).toBe(true);

      const privacyRecord = result.acceptances.find((a) => a.document === "aviso");
      expect(privacyRecord).toBeDefined();
      expect(privacyRecord?.userId).toBe(result.user.id);
      expect(privacyRecord?.userEmail).toBe(email);
      expect(privacyRecord?.documentId).toBe("aviso:1.0");
      expect(privacyRecord?.version).toBe("1.0");
      expect(privacyRecord?.contentSha256).toBe(privacyDoc.contentSha256);
      expect(privacyRecord?.acceptanceType).toBe("acknowledge_privacy");
      expect(privacyRecord?.ipAddress).toBe("203.0.113.42");
      expect(privacyRecord?.userAgent).toBe("Mozilla/5.0 TestBrowser/1.0");
      expect(Object.prototype.toString.call(privacyRecord?.acceptedAt)).toBe("[object Date]");
      expect(Number.isFinite(new Date(privacyRecord!.acceptedAt).getTime())).toBe(true);

      const userAcceptances = await memStorage.getLegalAcceptancesByUser(result.user.id);
      expect(userAcceptances.length).toBe(2);
    });

    it("rejects without creating account or evidence when terms hash differs from catalog", async () => {
      const memStorage = new MemStorage();
      const email = "tampered-terms@example.com";
      const termsDoc = getApprovedLegalDocument("terminos", "1.0")!;
      const privacyDoc = getApprovedLegalDocument("aviso", "1.0")!;

      const initialUsersCount = (await memStorage.getAllUsers()).length;

      await expect(
        memStorage.registerUserWithLegalEvidence({
          userData: {
            email,
            password: "hashedPassword123",
            firstName: "Tampered",
            lastName: "Terms",
            authMethod: "local",
            role: "broker",
          },
          evidence: {
            ipAddress: "127.0.0.1",
            userAgent: "TestAgent",
            termsDoc: {
              ...termsDoc,
              contentSha256: "0000000000000000000000000000000000000000000000000000000000000000",
            },
            privacyDoc,
          },
        }),
      ).rejects.toThrow(/Discrepancia en el hash de los Términos/);

      // Verify no user and no evidence was created
      const user = await memStorage.getUserByEmail(email);
      expect(user).toBeUndefined();
      expect((await memStorage.getAllUsers()).length).toBe(initialUsersCount);
    });

    it("rejects without creating account or evidence when privacy hash differs from catalog", async () => {
      const memStorage = new MemStorage();
      const email = "tampered-privacy@example.com";
      const termsDoc = getApprovedLegalDocument("terminos", "1.0")!;
      const privacyDoc = getApprovedLegalDocument("aviso", "1.0")!;

      const initialUsersCount = (await memStorage.getAllUsers()).length;

      await expect(
        memStorage.registerUserWithLegalEvidence({
          userData: {
            email,
            password: "hashedPassword123",
            firstName: "Tampered",
            lastName: "Privacy",
            authMethod: "local",
            role: "broker",
          },
          evidence: {
            ipAddress: "127.0.0.1",
            userAgent: "TestAgent",
            termsDoc,
            privacyDoc: {
              ...privacyDoc,
              contentSha256: "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
            },
          },
        }),
      ).rejects.toThrow(/Discrepancia en el hash del Aviso/);

      const user = await memStorage.getUserByEmail(email);
      expect(user).toBeUndefined();
      expect((await memStorage.getAllUsers()).length).toBe(initialUsersCount);
    });

    it("rejects when document version is not in approved catalog", async () => {
      const memStorage = new MemStorage();
      const email = "unapproved-doc@example.com";
      const privacyDoc = getApprovedLegalDocument("aviso", "1.0")!;

      await expect(
        memStorage.registerUserWithLegalEvidence({
          userData: {
            email,
            password: "hashedPassword123",
            firstName: "Unapproved",
            lastName: "Doc",
            authMethod: "local",
            role: "broker",
          },
          evidence: {
            ipAddress: "127.0.0.1",
            userAgent: "TestAgent",
            termsDoc: {
              id: "terminos:9.9",
              document: "terminos",
              version: "9.9",
              contentSha256: "abc",
            },
            privacyDoc,
          },
        }),
      ).rejects.toThrow(/no está aprobada en el catálogo/);

      const user = await memStorage.getUserByEmail(email);
      expect(user).toBeUndefined();
    });

    it("prevents duplicate registration and does not create stray evidence", async () => {
      const memStorage = new MemStorage();
      const email = "duplicate@example.com";
      const termsDoc = getApprovedLegalDocument("terminos", "1.0")!;
      const privacyDoc = getApprovedLegalDocument("aviso", "1.0")!;

      const firstResult = await memStorage.registerUserWithLegalEvidence({
        userData: {
          email,
          password: "hashedPassword123",
          firstName: "Primero",
          lastName: "Uno",
          authMethod: "local",
          role: "broker",
        },
        evidence: {
          ipAddress: "127.0.0.1",
          userAgent: "TestAgent",
          termsDoc,
          privacyDoc,
        },
      });

      const initialAcceptances = await memStorage.getLegalAcceptancesByUser(firstResult.user.id);
      expect(initialAcceptances.length).toBe(2);

      await expect(
        memStorage.registerUserWithLegalEvidence({
          userData: {
            email,
            password: "hashedPassword456",
            firstName: "Segundo",
            lastName: "Dos",
            authMethod: "local",
            role: "broker",
          },
          evidence: {
            ipAddress: "127.0.0.1",
            userAgent: "TestAgent",
            termsDoc,
            privacyDoc,
          },
        }),
      ).rejects.toThrow(/ya está registrado/);

      const finalAcceptances = await memStorage.getLegalAcceptancesByUser(firstResult.user.id);
      expect(finalAcceptances.length).toBe(2);
    });
  });

  describe("4. Real Legal Route Handlers (registerLegalRoutes)", () => {
    let app: express.Express;
    let activeUser: any;
    let inactiveUser: any;
    let suspendedUser: any;
    let currentUserInSession: any = null;

    beforeAll(async () => {
      // Create test users in storage
      activeUser = await storage.createUser({
        email: "legal-active@example.com",
        firstName: "Active",
        lastName: "User",
        role: "broker",
        isActive: true,
        status: "active",
      });

      inactiveUser = await storage.createUser({
        email: "legal-inactive@example.com",
        firstName: "Inactive",
        lastName: "User",
        role: "broker",
        isActive: false,
        status: "inactive",
      });

      suspendedUser = await storage.createUser({
        email: "legal-suspended@example.com",
        firstName: "Suspended",
        lastName: "User",
        role: "broker",
        isActive: true,
        status: "suspended",
      });

      // Record acceptances for active user
      const termsDoc = getApprovedLegalDocument("terminos", "1.0")!;
      const privacyDoc = getApprovedLegalDocument("aviso", "1.0")!;
      await storage.registerUserWithLegalEvidence({
        userData: {
          email: "accepted-evidence@example.com",
          password: "password123",
          firstName: "Accepted",
          lastName: "Evidence",
          authMethod: "local",
          role: "broker",
        },
        evidence: {
          ipAddress: "192.0.2.100",
          userAgent: "TestBrowser/1.0",
          termsDoc,
          privacyDoc,
        },
      });

      // Setup express app with session and passport simulation
      app = express();
      app.use(express.json());

      // Middleware simulating session auth state
      app.use((req: any, _res, next) => {
        if (currentUserInSession) {
          req.isAuthenticated = () => true;
          req.user = currentUserInSession;
        } else {
          req.isAuthenticated = () => false;
          req.user = null;
        }
        next();
      });

      // Register the real legal routes
      registerLegalRoutes(app);
    });

    beforeEach(() => {
      currentUserInSession = null;
    });

    it("GET /api/legal/my-acceptances returns 401 when anonymous / unauthenticated", async () => {
      currentUserInSession = null;
      const res = await request(app)
        .get("/api/legal/my-acceptances")
        .expect(401);

      expect(res.body.message).toBe("Unauthorized");
    });

    it("GET /api/legal/my-acceptances returns 401 when user is inactive", async () => {
      currentUserInSession = { id: inactiveUser.id };
      const res = await request(app)
        .get("/api/legal/my-acceptances")
        .expect(401);

      expect(res.body.message).toContain("desactivada");
    });

    it("GET /api/legal/my-acceptances returns 401 when user is suspended", async () => {
      currentUserInSession = { id: suspendedUser.id };
      const res = await request(app)
        .get("/api/legal/my-acceptances")
        .expect(401);

      expect(res.body.message).toContain("suspendida");
    });

    it("GET /api/legal/my-acceptances returns 200 with acceptances for authenticated active user", async () => {
      currentUserInSession = { id: activeUser.id };
      const res = await request(app)
        .get("/api/legal/my-acceptances")
        .expect(200);

      expect(res.body).toHaveProperty("acceptances");
      expect(Array.isArray(res.body.acceptances)).toBe(true);
    });

    it("prevents route collision: /api/legal/my-acceptances is not captured as /api/legal/:document", async () => {
      // If collision occurred, /api/legal/:document would treat "my-acceptances" as a document name and return 404
      currentUserInSession = { id: activeUser.id };
      const res = await request(app)
        .get("/api/legal/my-acceptances");

      expect(res.status).not.toBe(404);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("acceptances");
    });

    it("maintains public access to legal documents without requiring authentication", async () => {
      currentUserInSession = null; // Unauthenticated
      const termsRes = await request(app)
        .get("/api/legal/terminos")
        .expect(200);

      expect(termsRes.body.document).toBe("terminos");
      expect(termsRes.body.version).toBe("1.0");

      const privacyRes = await request(app)
        .get("/api/legal/aviso")
        .expect(200);

      expect(privacyRes.body.document).toBe("aviso");
      expect(privacyRes.body.version).toBe("1.0");
    });

    it("handles document loading errors gracefully (invalid version -> 400, unknown doc -> 404)", async () => {
      currentUserInSession = null;
      const invalidVersionRes = await request(app)
        .get("/api/legal/terminos?version=invalid-version")
        .expect(400);

      expect(invalidVersionRes.body.message).toContain("inválida");

      const unknownDocRes = await request(app)
        .get("/api/legal/documento-inexistente")
        .expect(404);

      expect(unknownDocRes.body.message).toContain("no disponible");
    });

    it("handles internal storage errors with 500 JSON response on my-acceptances", async () => {
      currentUserInSession = { id: activeUser.id };
      const originalMethod = storage.getLegalAcceptancesByUser;
      // Force storage error
      storage.getLegalAcceptancesByUser = jest.fn().mockRejectedValue(new Error("Database disconnected"));

      try {
        const res = await request(app)
          .get("/api/legal/my-acceptances")
          .expect(500);

        expect(res.body.message).toContain("Error al obtener historial de aceptaciones");
      } finally {
        storage.getLegalAcceptancesByUser = originalMethod;
      }
    });

    it("admin-created user has no legal acceptances attributed and receives empty array in my-acceptances", async () => {
      const adminCreatedUser = await storage.createUser({
        email: `admin-created-${Date.now()}@example.com`,
        firstName: "AdminCreated",
        lastName: "User",
        role: "broker",
        isActive: true,
        status: "active",
      });

      // Directly verify storage has zero acceptances for this user
      const directAcceptances = await storage.getLegalAcceptancesByUser(adminCreatedUser.id);
      expect(directAcceptances).toEqual([]);

      // Verify endpoint behavior when user logs in: returns 200 with { acceptances: [] }
      currentUserInSession = { id: adminCreatedUser.id };
      const res = await request(app)
        .get("/api/legal/my-acceptances")
        .expect(200);

      expect(res.body.acceptances).toEqual([]);
    });

    it("strictly isolates acceptances by session user and denies foreign access", async () => {
      const termsDoc = getApprovedLegalDocument("terminos", "1.0")!;
      const privacyDoc = getApprovedLegalDocument("aviso", "1.0")!;

      const userAReg = await storage.registerUserWithLegalEvidence({
        userData: {
          email: `user-a-${Date.now()}@example.com`,
          password: "password123",
          firstName: "User",
          lastName: "A",
          authMethod: "local",
          role: "broker",
        },
        evidence: {
          ipAddress: "198.51.100.10",
          userAgent: "AgentA",
          termsDoc,
          privacyDoc,
        },
      });

      const userBReg = await storage.registerUserWithLegalEvidence({
        userData: {
          email: `user-b-${Date.now()}@example.com`,
          password: "password123",
          firstName: "User",
          lastName: "B",
          authMethod: "local",
          role: "broker",
        },
        evidence: {
          ipAddress: "198.51.100.20",
          userAgent: "AgentB",
          termsDoc,
          privacyDoc,
        },
      });

      // When authenticated as User A:
      currentUserInSession = { id: userAReg.user.id };
      const resA = await request(app)
        .get("/api/legal/my-acceptances")
        .expect(200);

      expect(resA.body.acceptances.length).toBe(2);
      expect(resA.body.acceptances.every((a: any) => a.userId === userAReg.user.id)).toBe(true);
      expect(resA.body.acceptances.some((a: any) => a.userId === userBReg.user.id)).toBe(false);

      // Attempt to access user B's records via query parameter or spoofed header
      const tamperedRes = await request(app)
        .get(`/api/legal/my-acceptances?userId=${userBReg.user.id}`)
        .expect(200);

      // Only returns user A's own acceptances; cannot snoop User B
      expect(tamperedRes.body.acceptances.length).toBe(2);
      expect(tamperedRes.body.acceptances.every((a: any) => a.userId === userAReg.user.id)).toBe(true);
      expect(tamperedRes.body.acceptances.some((a: any) => a.userId === userBReg.user.id)).toBe(false);

      // Switch to User B:
      currentUserInSession = { id: userBReg.user.id };
      const resB = await request(app)
        .get("/api/legal/my-acceptances")
        .expect(200);

      expect(resB.body.acceptances.length).toBe(2);
      expect(resB.body.acceptances.every((a: any) => a.userId === userBReg.user.id)).toBe(true);
      expect(resB.body.acceptances.some((a: any) => a.userId === userAReg.user.id)).toBe(false);
    });
  });

  describe("5. Real Registration Route Handler (/api/auth/register via registerRoutes)", () => {
    let app: express.Express;
    let server: Server;

    beforeAll(async () => {
      app = express();
      app.use(express.json());
      // Explicitly disable trust proxy on this app to test untrusted header spoofing
      app.set("trust proxy", false);

      // Middleware to simulate unverifiable IP source for test requests
      app.use((req: any, _res, next) => {
        if (req.headers["x-test-null-ip"] === "true") {
          Object.defineProperty(req, "ip", { value: undefined, configurable: true });
          if (req.socket) {
            Object.defineProperty(req.socket, "remoteAddress", { value: undefined, configurable: true });
          }
        }
        next();
      });

      server = await registerRoutes(app);
    });

    afterAll((done) => {
      // Stop all background cron tasks scheduled by registerRoutes
      cron.getTasks().forEach((task: any) => task.stop());
      if (server && (server as any).listening) {
        server.close(done);
      } else {
        done();
      }
    });

    it("succeeds when valid legal confirmations and current versions are provided", async () => {
      const email = `real-route-${Date.now()}@example.com`;
      const res = await request(app)
        .post("/api/auth/register")
        .send({
          email,
          password: "password123",
          firstName: "Real",
          lastName: "Handler",
          acceptTerms: true,
          termsVersion: "1.0",
          acknowledgePrivacy: true,
          privacyVersion: "1.0",
        })
        .expect(201);

      expect(res.body.message).toBe("Registro exitoso");
      expect(res.body.user).toBeDefined();

      // Verify acceptances were persisted in storage
      const acceptances = await storage.getLegalAcceptancesByUser(res.body.user.id);
      expect(acceptances.length).toBe(2);
      expect(acceptances.map((a) => a.document).sort()).toEqual(["aviso", "terminos"]);
    });

    it("captures client IP via req.ip without trusting spoofed X-Forwarded-For when trust proxy is disabled", async () => {
      const email = `spoofed-ip-${Date.now()}@example.com`;
      const spoofedIp = "203.0.113.199";

      const res = await request(app)
        .post("/api/auth/register")
        .set("X-Forwarded-For", spoofedIp)
        .send({
          email,
          password: "password123",
          firstName: "Spoof",
          lastName: "Test",
          acceptTerms: true,
          termsVersion: "1.0",
          acknowledgePrivacy: true,
          privacyVersion: "1.0",
        })
        .expect(201);

      const acceptances = await storage.getLegalAcceptancesByUser(res.body.user.id);
      expect(acceptances.length).toBe(2);
      // Because trust proxy is false, req.ip does NOT trust X-Forwarded-For: 203.0.113.199
      for (const record of acceptances) {
        expect(record.ipAddress).not.toBe(spoofedIp);
      }
    });

    it("persists null IP address when no verifiable IP source is available", async () => {
      const email = `null-ip-${Date.now()}@example.com`;

      const res = await request(app)
        .post("/api/auth/register")
        .set("X-Test-Null-Ip", "true")
        .send({
          email,
          password: "password123",
          firstName: "Null",
          lastName: "Ip",
          acceptTerms: true,
          termsVersion: "1.0",
          acknowledgePrivacy: true,
          privacyVersion: "1.0",
        })
        .expect(201);

      const acceptances = await storage.getLegalAcceptancesByUser(res.body.user.id);
      expect(acceptances.length).toBe(2);
      for (const record of acceptances) {
        expect(record.ipAddress).toBeNull();
      }
    });

    it("captures client IP from trusted proxy when trust proxy is enabled", async () => {
      const originalTrustProxy = process.env.TRUST_PROXY;
      process.env.TRUST_PROXY = "1";
      const proxyApp = express();
      proxyApp.use(express.json());

      const proxyServer = await registerRoutes(proxyApp);
      proxyApp.set("trust proxy", 1); // Configure real trusted reverse proxy hop
      try {
        const email = `trusted-ip-${Date.now()}@example.com`;
        const trustedClientIp = "198.51.100.55";

        const res = await request(proxyApp)
          .post("/api/auth/register")
          .set("X-Forwarded-For", trustedClientIp)
          .send({
            email,
            password: "password123",
            firstName: "Trusted",
            lastName: "Proxy",
            acceptTerms: true,
            termsVersion: "1.0",
            acknowledgePrivacy: true,
            privacyVersion: "1.0",
          })
          .expect(201);

        const acceptances = await storage.getLegalAcceptancesByUser(res.body.user.id);
        expect(acceptances.length).toBe(2);
        for (const record of acceptances) {
          expect(record.ipAddress).toBe(trustedClientIp);
        }
      } finally {
        if (originalTrustProxy !== undefined) {
          process.env.TRUST_PROXY = originalTrustProxy;
        } else {
          delete process.env.TRUST_PROXY;
        }
        cron.getTasks().forEach((task: any) => task.stop());
        if (proxyServer && (proxyServer as any).listening) {
          await new Promise<void>((resolve) => proxyServer.close(() => resolve()));
        }
      }
    });

    it("handles null and empty IP address in storage layer safely", async () => {
      const termsDoc = getApprovedLegalDocument("terminos", "1.0")!;
      const privacyDoc = getApprovedLegalDocument("aviso", "1.0")!;

      const result = await storage.registerUserWithLegalEvidence({
        userData: {
          email: `storage-null-ip-${Date.now()}@example.com`,
          password: "password123",
          firstName: "Storage",
          lastName: "NullIP",
          authMethod: "local",
          role: "broker",
        },
        evidence: {
          ipAddress: null,
          userAgent: "TestAgent",
          termsDoc,
          privacyDoc,
        },
      });

      expect(result.acceptances.length).toBe(2);
      expect(result.acceptances[0].ipAddress).toBeNull();
      expect(result.acceptances[1].ipAddress).toBeNull();
    });

    it("rejects with 400 when Terms are not accepted", async () => {
      const email = `reject-terms-${Date.now()}@example.com`;
      const res = await request(app)
        .post("/api/auth/register")
        .send({
          email,
          password: "password123",
          firstName: "No",
          lastName: "Terms",
          acceptTerms: false,
          termsVersion: "1.0",
          acknowledgePrivacy: true,
          privacyVersion: "1.0",
        })
        .expect(400);

      expect(res.body.message).toContain("Términos y Condiciones");
      const user = await storage.getUserByEmail(email);
      expect(user).toBeUndefined();
    });

    it("rejects with 400 when Privacy acknowledgment is missing", async () => {
      const email = `reject-privacy-${Date.now()}@example.com`;
      const res = await request(app)
        .post("/api/auth/register")
        .send({
          email,
          password: "password123",
          firstName: "No",
          lastName: "Privacy",
          acceptTerms: true,
          termsVersion: "1.0",
          privacyVersion: "1.0",
        })
        .expect(400);

      expect(res.body.message).toContain("Aviso de Privacidad");
      const user = await storage.getUserByEmail(email);
      expect(user).toBeUndefined();
    });

    it("rejects with 400 when termsVersion is outdated", async () => {
      const email = `outdated-terms-${Date.now()}@example.com`;
      const res = await request(app)
        .post("/api/auth/register")
        .send({
          email,
          password: "password123",
          firstName: "Outdated",
          lastName: "Terms",
          acceptTerms: true,
          termsVersion: "0.9",
          acknowledgePrivacy: true,
          privacyVersion: "1.0",
        })
        .expect(400);

      expect(res.body.message).toContain("desactualizada");
      const user = await storage.getUserByEmail(email);
      expect(user).toBeUndefined();
    });

    it("rejects with 400 when privacyVersion is outdated", async () => {
      const email = `outdated-privacy-${Date.now()}@example.com`;
      const res = await request(app)
        .post("/api/auth/register")
        .send({
          email,
          password: "password123",
          firstName: "Outdated",
          lastName: "Privacy",
          acceptTerms: true,
          termsVersion: "1.0",
          acknowledgePrivacy: true,
          privacyVersion: "0.1",
        })
        .expect(400);

      expect(res.body.message).toContain("desactualizada");
      const user = await storage.getUserByEmail(email);
      expect(user).toBeUndefined();
    });
  });
});
