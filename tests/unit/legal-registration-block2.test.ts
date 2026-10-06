import express from "express";
import session from "express-session";
import { randomUUID } from "node:crypto";
import {
  getPublishedLegalDocument,
  getAllApprovedCatalogVersions,
  getApprovedLegalDocument,
  validateRegistrationAcceptance,
} from "../../server/legalDocuments";
import { registerLegalRoutes } from "../../server/legalRoutes";
import { MemStorage } from "../../server/storage";
import catalog from "../../server/legalDocumentCatalog.json";
import { z } from "zod";
import bcrypt from "bcrypt";

const request = require("supertest");
const afterPublication = new Date("2026-10-07T12:00:00Z");

describe("Bloque 2: Legal Document Persistence & Registration Acceptance Evidence", () => {
  afterEach(() => jest.useRealTimers());

  describe("1. Persistence of approved catalog versions", () => {
    it("loads all 5 approved legal documents into storage upon initialization", async () => {
      const storage = new MemStorage();
      const versions = await storage.getLegalDocumentVersions();
      expect(versions.length).toBe(5);

      const terms = await storage.getLegalDocumentVersion("terminos:1.0");
      expect(terms).toBeDefined();
      expect(terms?.document).toBe("terminos");
      expect(terms?.version).toBe("1.0");
      expect(terms?.contentSha256).toBe("e2ec998a066e702a43ee0f69dbadce692a5dac6171774254664d372423f1f2eb");

      const privacy = await storage.getLegalDocumentVersion("aviso:1.0");
      expect(privacy).toBeDefined();
      expect(privacy?.document).toBe("aviso");
      expect(privacy?.version).toBe("1.0");
      expect(privacy?.contentSha256).toBe("66b082fab14d3aded2362796ded41f88b6ee71e2452208f024c48e16f1416efd");

      const convenio = await storage.getLegalDocumentVersion("convenio:1.0");
      expect(convenio).toBeDefined();
      expect(convenio?.contentSha256).toBe("8da70ad24e725d7d9e1a15dee77b6058f6e2a41ea6fe996ab3d3e1cf6400824a");

      const reglasRed = await storage.getLegalDocumentVersion("reglas-red:1.0");
      expect(reglasRed).toBeDefined();
      expect(reglasRed?.contentSha256).toBe("0b63f36bbefc7e94cb35be0fd98816c4773f1409b576b83769cebdd5f879014c");

      const reglasMaster = await storage.getLegalDocumentVersion("reglas-master:1.0");
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

  describe("3. Atomic user and evidence registration in storage", () => {
    it("creates account and 2 legal acceptance records atomically with server timestamp, IP and user agent", async () => {
      const storage = new MemStorage();
      const email = `broker-${Date.now()}@example.com`;
      const termsDoc = getPublishedLegalDocument("terminos", "1.0", afterPublication)!;
      const privacyDoc = getPublishedLegalDocument("aviso", "1.0", afterPublication)!;

      const result = await storage.registerUserWithLegalEvidence({
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

      // Verify Terms acceptance record
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
      expect(termsRecord?.acceptedAt).toBeInstanceOf(Date);

      // Verify Privacy acknowledgment record
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
      expect(privacyRecord?.acceptedAt).toBeInstanceOf(Date);

      // Verify retrieval by user id
      const userAcceptances = await storage.getLegalAcceptancesByUser(result.user.id);
      expect(userAcceptances.length).toBe(2);
    });

    it("does not generate synthetic acceptances for existing test users", async () => {
      const storage = new MemStorage();
      const allUsers = await storage.getAllUsers();
      expect(allUsers.length).toBeGreaterThan(0);

      for (const existingUser of allUsers) {
        const acceptances = await storage.getLegalAcceptancesByUser(existingUser.id);
        expect(acceptances).toHaveLength(0);
      }
    });

    it("prevents duplicate registration and does not create stray evidence", async () => {
      const storage = new MemStorage();
      const email = "duplicate@example.com";
      const termsDoc = getPublishedLegalDocument("terminos", "1.0", afterPublication)!;
      const privacyDoc = getPublishedLegalDocument("aviso", "1.0", afterPublication)!;

      await storage.registerUserWithLegalEvidence({
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

      const initialAcceptancesCount = (await storage.getAllLegalAcceptances()).length;

      // Attempt second registration with same email
      await expect(
        storage.registerUserWithLegalEvidence({
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
      ).rejects.toThrow();

      const finalAcceptancesCount = (await storage.getAllLegalAcceptances()).length;
      expect(finalAcceptancesCount).toBe(initialAcceptancesCount);
    });
  });

  describe("4. Registration API HTTP endpoint verification", () => {
    function createTestApp(storageInstance: MemStorage) {
      const app = express();
      app.use(express.json());
      app.set("trust proxy", true);

      // Session setup
      app.use(
        session({
          secret: "test-secret",
          resave: false,
          saveUninitialized: false,
        }),
      );

      // Mock passport req.login
      app.use((req: any, _res, next) => {
        req.login = (user: any, cb: any) => {
          req.session.user = user;
          cb(null);
        };
        next();
      });

      const registerSchema = z.object({
        email: z.string().email("Email inválido"),
        password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
        firstName: z.string().min(1, "Nombre requerido"),
        lastName: z.string().min(1, "Apellido requerido"),
        referralCode: z.string().optional(),
        promoCode: z.string().optional(),
        acceptTerms: z.literal(true, {
          errorMap: () => ({ message: "Debes aceptar los Términos y Condiciones para continuar." }),
        }),
        termsVersion: z.string({
          required_error: "La versión de Términos y Condiciones es requerida",
        }),
        acknowledgePrivacy: z.literal(true, {
          errorMap: () => ({ message: "Debes confirmar que has leído el Aviso de Privacidad para continuar." }),
        }),
        privacyVersion: z.string({
          required_error: "La versión del Aviso de Privacidad es requerida",
        }),
      });

      app.post("/api/auth/register", async (req: any, res) => {
        try {
          const data = registerSchema.parse(req.body);

          const legalValidation = validateRegistrationAcceptance({
            acceptTerms: data.acceptTerms,
            termsVersion: data.termsVersion,
            acknowledgePrivacy: data.acknowledgePrivacy,
            privacyVersion: data.privacyVersion,
            now: afterPublication,
          });

          if (!legalValidation.valid || !legalValidation.termsDoc || !legalValidation.privacyDoc) {
            return res.status(400).json({ message: legalValidation.error || "Aceptación legal inválida." });
          }

          const existingUser = await storageInstance.getUserByEmail(data.email);
          if (existingUser) {
            return res.status(400).json({ message: "Este email ya está registrado" });
          }

          const forwarded = req.headers["x-forwarded-for"];
          let clientIp = req.ip || req.socket?.remoteAddress || "127.0.0.1";
          if (typeof forwarded === "string" && forwarded.length > 0) {
            clientIp = forwarded.split(",")[0].trim();
          }

          const userAgent = req.headers["user-agent"] || "unknown";

          const { user, acceptances } = await storageInstance.registerUserWithLegalEvidence({
            userData: {
              email: data.email,
              password: await bcrypt.hash(data.password, 10),
              firstName: data.firstName,
              lastName: data.lastName,
              authMethod: "local",
              role: "broker",
            },
            evidence: {
              ipAddress: clientIp,
              userAgent,
              termsDoc: {
                id: legalValidation.termsDoc.id,
                document: legalValidation.termsDoc.document,
                version: legalValidation.termsDoc.version,
                contentSha256: legalValidation.termsDoc.contentSha256,
              },
              privacyDoc: {
                id: legalValidation.privacyDoc.id,
                document: legalValidation.privacyDoc.document,
                version: legalValidation.privacyDoc.version,
                contentSha256: legalValidation.privacyDoc.contentSha256,
              },
            },
          });

          return res.status(201).json({
            message: "Registro exitoso",
            user: { id: user.id, email: user.email },
            acceptancesCount: acceptances.length,
          });
        } catch (error: any) {
          if (error instanceof z.ZodError) {
            return res.status(400).json({ message: error.errors[0].message });
          }
          return res.status(500).json({ message: "Error al registrar usuario" });
        }
      });

      return app;
    }

    it("succeeds when both legal confirmations and current versions are provided", async () => {
      const storage = new MemStorage();
      const app = createTestApp(storage);

      const response = await request(app)
        .post("/api/auth/register")
        .set("X-Forwarded-For", "198.51.100.25")
        .set("User-Agent", "Mozilla/5.0 AgentTest")
        .send({
          email: "valid-register@example.com",
          password: "securePassword123",
          firstName: "Ana",
          lastName: "García",
          acceptTerms: true,
          termsVersion: "1.0",
          acknowledgePrivacy: true,
          privacyVersion: "1.0",
        })
        .expect(201);

      expect(response.body.message).toBe("Registro exitoso");
      expect(response.body.acceptancesCount).toBe(2);

      const user = await storage.getUserByEmail("valid-register@example.com");
      expect(user).toBeDefined();

      const acceptances = await storage.getLegalAcceptancesByUser(user!.id);
      expect(acceptances).toHaveLength(2);
      expect(acceptances[0].ipAddress).toBe("198.51.100.25");
      expect(acceptances[0].userAgent).toBe("Mozilla/5.0 AgentTest");
    });

    it("rejects with 400 when Terms are not accepted", async () => {
      const storage = new MemStorage();
      const app = createTestApp(storage);

      const response = await request(app)
        .post("/api/auth/register")
        .send({
          email: "no-terms@example.com",
          password: "securePassword123",
          firstName: "Ana",
          lastName: "García",
          acceptTerms: false,
          termsVersion: "1.0",
          acknowledgePrivacy: true,
          privacyVersion: "1.0",
        })
        .expect(400);

      expect(response.body.message).toContain("Términos y Condiciones");
      const user = await storage.getUserByEmail("no-terms@example.com");
      expect(user).toBeUndefined();
    });

    it("rejects with 400 when Privacy acknowledgment is missing", async () => {
      const storage = new MemStorage();
      const app = createTestApp(storage);

      const response = await request(app)
        .post("/api/auth/register")
        .send({
          email: "no-privacy@example.com",
          password: "securePassword123",
          firstName: "Ana",
          lastName: "García",
          acceptTerms: true,
          termsVersion: "1.0",
          privacyVersion: "1.0",
        })
        .expect(400);

      expect(response.body.message).toContain("Aviso de Privacidad");
      const user = await storage.getUserByEmail("no-privacy@example.com");
      expect(user).toBeUndefined();
    });

    it("rejects with 400 when termsVersion is outdated", async () => {
      const storage = new MemStorage();
      const app = createTestApp(storage);

      const response = await request(app)
        .post("/api/auth/register")
        .send({
          email: "outdated-terms@example.com",
          password: "securePassword123",
          firstName: "Ana",
          lastName: "García",
          acceptTerms: true,
          termsVersion: "0.9",
          acknowledgePrivacy: true,
          privacyVersion: "1.0",
        })
        .expect(400);

      expect(response.body.message).toContain("desactualizada");
      const user = await storage.getUserByEmail("outdated-terms@example.com");
      expect(user).toBeUndefined();
    });

    it("rejects with 400 when privacyVersion is outdated", async () => {
      const storage = new MemStorage();
      const app = createTestApp(storage);

      const response = await request(app)
        .post("/api/auth/register")
        .send({
          email: "outdated-privacy@example.com",
          password: "securePassword123",
          firstName: "Ana",
          lastName: "García",
          acceptTerms: true,
          termsVersion: "1.0",
          acknowledgePrivacy: true,
          privacyVersion: "0.1",
        })
        .expect(400);

      expect(response.body.message).toContain("desactualizada");
      const user = await storage.getUserByEmail("outdated-privacy@example.com");
      expect(user).toBeUndefined();
    });
  });
});
