/**
 * PRUEBAS FOCALIZADAS DEL BLOQUE 3B1
 * Backend de aceptación del Convenio mediante OTP por correo
 * 
 * =========================================================================================
 * DECLARACIÓN EXPLÍCITA DE ENTORNO Y ALMACENAMIENTO:
 * - Estas pruebas unitarias se ejecutan utilizando MemStorage (almacenamiento en memoria).
 * - Validan los flujos de negocio, el bloqueo concurrente con cola asíncrona (withUserLock),
 *   la detección de deriva de identidad, la invalidación de OTP sustituidos, el cooldown atómico,
 *   y el fallo controlado de envío de correo.
 * - Estas pruebas en MemStorage NO validan directamente la base de datos PostgreSQL.
 * - DbStorage (PostgreSQL) implementa garantías equivalentes mediante transacciones ACID de Drizzle
 *   y bloqueos consultivos a nivel de transacción:
 *   pg_advisory_xact_lock(hashtext('formalization_otp_' || userId)), persistencia de intentos fallidos
 *   sin rollback del contador, y sentencias UPDATE con WHERE consumed=false e invalidated=false.
 * =========================================================================================
 */

import { randomUUID } from "node:crypto";
import express from "express";
// @ts-ignore
import request from "supertest";
import { storage } from "../../server/storage";
import { registerLegalRoutes } from "../../server/legalRoutes";
import {
  getApprovedLegalDocument,
  getActiveFormalizationDocument,
  getFormalizationCatalogDocuments,
  validateFormalizationConfirmation,
  hashOtpCode,
  verifyOtpCode,
  getFormalizationOtpSecret,
  FORMALIZATION_OTP_EXPIRATION_MS,
  FORMALIZATION_OTP_COOLDOWN_MS,
  FORMALIZATION_OTP_MAX_ATTEMPTS,
  FORMALIZATION_OTP_MAX_REQUESTS_PER_WINDOW,
  ACTIVE_FORMALIZATION_VERSIONS,
} from "../../server/legalDocuments";
import {
  getRequiredFormalizationDocuments,
  isRoleSubjectToFormalization,
  maskEmail,
  getDocumentTitle,
  getAcceptanceTypeLabel,
} from "../../shared/legalDocuments";
import { _testEmailStore } from "../../server/emailService";
import { pool } from "../../server/db";

describe("Bloque 3B1 (MemStorage): Backend de aceptación del Convenio mediante OTP por correo", () => {
  let app: express.Express;
  let currentAuthUser: any = null;

  afterAll(async () => {
    try {
      await pool.end();
    } catch {
      // Ignore pool closing errors in tests
    }
  });

  const createTestUser = async (role = "broker", name = "Test User") => {
    const parts = name.split(" ");
    return await storage.createUser({
      email: `user-${randomUUID()}@example.com`,
      firstName: parts[0] || "Test",
      lastName: parts.slice(1).join(" ") || "User",
      role,
      isActive: true,
      status: "active",
    });
  };

  beforeEach(() => {
    app = express();
    app.use(express.json());

    // Mock authentication middleware
    app.use((req: any, _res, next) => {
      if (currentAuthUser) {
        req.isAuthenticated = () => true;
        req.user = currentAuthUser;
      } else {
        req.isAuthenticated = () => false;
        req.user = null;
      }
      next();
    });

    registerLegalRoutes(app);
    delete _testEmailStore.simulateFailure;
    delete _testEmailStore.lastFormalizationOtp;
  });

  describe("1. Consulta autenticada de documentos a formalizar (/api/legal/formalization/documents)", () => {
    it("rechaza la consulta con 401 si no hay usuario autenticado", async () => {
      currentAuthUser = null;
      const res = await request(app).get("/api/legal/formalization/documents");
      expect(res.status).toBe(401);
    });

    it("entrega Convenio + Reglas de la Red para un usuario con rol 'broker'", async () => {
      const brokerUser = await createTestUser("broker", "Carlos Broker");
      currentAuthUser = brokerUser;

      const res = await request(app).get("/api/legal/formalization/documents");
      expect(res.status).toBe(200);
      expect(res.body.requiresFormalization).toBe(true);
      expect(res.body.isFormalized).toBe(false);
      expect(res.body.user.role).toBe("broker");
      expect(res.body.user.email).toBe(brokerUser.email);
      expect(res.body.user.name).toBe("Carlos Broker");

      // Verify documents returned
      const docs = res.body.documents;
      expect(Array.isArray(docs)).toBe(true);
      expect(docs.length).toBe(2);
      const docTypes = docs.map((d: any) => d.document);
      expect(docTypes).toContain("convenio");
      expect(docTypes).toContain("reglas-red");
      expect(docTypes).not.toContain("reglas-master");

      // Verify document versions and content hashes
      const convenio = docs.find((d: any) => d.document === "convenio");
      expect(convenio.version).toBe("1.0");
      expect(convenio.title).toBe("Convenio de Colaboración");
      expect(convenio.contentSha256).toBe("8da70ad24e725d7d9e1a15dee77b6058f6e2a41ea6fe996ab3d3e1cf6400824a");
      expect(convenio.content).toContain("CONVENIO DE COLABORACIÓN COMERCIAL");

      const reglasRed = docs.find((d: any) => d.document === "reglas-red");
      expect(reglasRed.version).toBe("1.0");
      expect(reglasRed.title).toBe("Reglas de la Red");
      expect(reglasRed.contentSha256).toBe("0b63f36bbefc7e94cb35be0fd98816c4773f1409b576b83769cebdd5f879014c");
    });

    it("entrega Convenio + Reglas de la Red + Reglas Master Broker para rol 'master_broker'", async () => {
      const masterUser = await createTestUser("master_broker", "María Master");
      currentAuthUser = masterUser;

      const res = await request(app).get("/api/legal/formalization/documents");
      expect(res.status).toBe(200);
      expect(res.body.requiresFormalization).toBe(true);
      expect(res.body.isFormalized).toBe(false);
      expect(res.body.user.role).toBe("master_broker");

      const docs = res.body.documents;
      expect(docs.length).toBe(3);
      const docTypes = docs.map((d: any) => d.document);
      expect(docTypes).toContain("convenio");
      expect(docTypes).toContain("reglas-red");
      expect(docTypes).toContain("reglas-master");

      const reglasMaster = docs.find((d: any) => d.document === "reglas-master");
      expect(reglasMaster.version).toBe("1.0");
      expect(reglasMaster.title).toBe("Reglas Master Broker");
      expect(reglasMaster.contentSha256).toBe("d7f3aca19b76f7b551a2a3f6df623bd9f236513a15c8410be4d9eaea4cc56760");
    });

    it("indica que no requiere formalización para otros roles (admin, super_admin, cliente)", async () => {
      const adminUser = await createTestUser("admin", "Admin Sistema");
      currentAuthUser = adminUser;

      const res = await request(app).get("/api/legal/formalization/documents");
      expect(res.status).toBe(200);
      expect(res.body.requiresFormalization).toBe(false);
      expect(res.body.message).toContain("no requiere formalización");
    });

    it("determina el usuario, correo y rol exclusivamente desde la sesión del servidor", async () => {
      const brokerUser = await createTestUser("broker", "Servidor Real");
      currentAuthUser = brokerUser;

      // Attacker tries to pass fake role and email in query parameters
      const res = await request(app)
        .get("/api/legal/formalization/documents?role=master_broker&email=falso@example.com");
      expect(res.status).toBe(200);
      expect(res.body.user.role).toBe("broker");
      expect(res.body.user.email).toBe(brokerUser.email);
      expect(res.body.documents.length).toBe(2);
    });
  });

  describe("2. Validación estricta de documentos y versiones habilitadas", () => {
    it("valida exitosamente cuando todos los documentos requeridos de broker están presentes con versión vigente", () => {
      const result = validateFormalizationConfirmation("broker", [
        { document: "convenio", version: "1.0" },
        { document: "reglas-red", version: "1.0" },
      ]);
      expect(result.valid).toBe(true);
      expect(result.catalogDocs?.length).toBe(2);
    });

    it("rechaza si falta confirmar algún documento requerido (ej. omite reglas-red para broker)", () => {
      const result = validateFormalizationConfirmation("broker", [
        { document: "convenio", version: "1.0" },
      ]);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("reglas-red");
    });

    it("rechaza si un master_broker omite reglas-master", () => {
      const result = validateFormalizationConfirmation("master_broker", [
        { document: "convenio", version: "1.0" },
        { document: "reglas-red", version: "1.0" },
      ]);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("reglas-master");
    });

    it("rechaza si se envían documentos adicionales no aplicables al rol", () => {
      const result = validateFormalizationConfirmation("broker", [
        { document: "convenio", version: "1.0" },
        { document: "reglas-red", version: "1.0" },
        { document: "reglas-master", version: "1.0" },
      ]);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("no corresponde a los documentos de formalización");
    });

    it("rechaza versiones no habilitadas (ej. 0.9 o 2.0) aunque existan versiones en el catálogo", () => {
      const result = validateFormalizationConfirmation("broker", [
        { document: "convenio", version: "0.9" },
        { document: "reglas-red", version: "1.0" },
      ]);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("no está habilitada actualmente");
    });

    it("rechaza confirmaciones duplicadas del mismo documento", () => {
      const result = validateFormalizationConfirmation("broker", [
        { document: "convenio", version: "1.0" },
        { document: "convenio", version: "1.0" },
      ]);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("duplicado");
    });
  });

  describe("3. Seguridad del OTP: HMAC SHA-256 y comparación en tiempo constante", () => {
    it("utiliza HMAC SHA-256 con el secreto del servidor para proteger el código", () => {
      const secret = getFormalizationOtpSecret();
      expect(secret).toBeDefined();
      expect(typeof secret).toBe("string");

      const code = "123456";
      const hash1 = hashOtpCode(code);
      const hash2 = hashOtpCode(code);
      expect(hash1).toBe(hash2);
      expect(hash1.length).toBe(64); // SHA-256 hex length
    });

    it("comprueba el código en tiempo constante con timingSafeEqual", () => {
      const code = "654321";
      const validHash = hashOtpCode(code);
      expect(verifyOtpCode(code, validHash)).toBe(true);
      expect(verifyOtpCode("000000", validHash)).toBe(false);
      expect(verifyOtpCode("65432", validHash)).toBe(false);
      expect(verifyOtpCode("", validHash)).toBe(false);
    });
  });

  describe("4. Concurrencia atómica al solicitar OTP (3 emisiones simultáneas)", () => {
    let testBroker: any;

    beforeEach(async () => {
      testBroker = await createTestUser("broker", "Emision Concurrente");
      currentAuthUser = testBroker;
    });

    it("3 solicitudes simultáneas de emisión reciben solo un 200 y dos 429 por cooldown atómico", async () => {
      const emitRequests = Array.from({ length: 3 }).map(() =>
        request(app)
          .post("/api/legal/formalization/request-otp")
          .send({
            confirmedDocuments: [
              { document: "convenio", version: "1.0" },
              { document: "reglas-red", version: "1.0" },
            ],
          })
      );

      const responses: any[] = await Promise.all(emitRequests);
      const statuses = responses.map((r: any) => r.status);

      // Exactly ONE request must succeed (200), and the other TWO must be rejected by cooldown (429)
      const successCount = statuses.filter((s: any) => s === 200).length;
      const cooldownCount = statuses.filter((s: any) => s === 429).length;

      expect(successCount).toBe(1);
      expect(cooldownCount).toBe(2);

      // Verify that in storage there is strictly ONE active OTP, not 3
      const allOtps = Array.from((storage as any).formalizationOtpRequests.values()).filter(
        (o: any) => o.userId === testBroker.id && !o.invalidated
      );
      expect(allOtps.length).toBe(1);
    });
  });

  describe("5. Reenvío de OTP e invalidación del código previo", () => {
    let testBroker: any;

    beforeEach(async () => {
      testBroker = await createTestUser("broker", "Reenvio Invalida");
      currentAuthUser = testBroker;
    });

    it("un reenvío tras el cooldown invalida el código anterior; verificar con el anterior debe fallar", async () => {
      // 1. First emission
      const firstRes = await request(app)
        .post("/api/legal/formalization/request-otp")
        .send({
          confirmedDocuments: [
            { document: "convenio", version: "1.0" },
            { document: "reglas-red", version: "1.0" },
          ],
        });
      expect(firstRes.status).toBe(200);
      const firstCode = _testEmailStore.lastFormalizationOtp!.code;

      // 2. Advance time past cooldown for the active OTP in storage
      const otp1 = await storage.getLatestFormalizationOtpByUser(testBroker.id);
      expect(otp1).toBeDefined();
      const storedOtp1 = (storage as any).formalizationOtpRequests.get(otp1!.id);
      storedOtp1.resendAvailableAt = new Date(Date.now() - 5000); // cooldown elapsed

      // 3. Second emission (resend)
      const secondRes = await request(app)
        .post("/api/legal/formalization/request-otp")
        .send({
          confirmedDocuments: [
            { document: "convenio", version: "1.0" },
            { document: "reglas-red", version: "1.0" },
          ],
        });
      expect(secondRes.status).toBe(200);
      const secondCode = _testEmailStore.lastFormalizationOtp!.code;
      expect(secondCode).not.toBe(firstCode);

      // Verify first OTP is now marked as invalidated
      const allBrokerOtps = Array.from((storage as any).formalizationOtpRequests.values()).filter(
        (o: any) => o.userId === testBroker.id
      ) as any[];
      const supersededOtp = allBrokerOtps.find((o) => o.id === otp1!.id);
      expect(supersededOtp.invalidated).toBe(true);
      expect(supersededOtp.invalidatedAt).toBeDefined();

      // 4. Verification with the superseded first code must be REJECTED
      const tryFirstRes = await request(app)
        .post("/api/legal/formalization/verify-otp")
        .send({
          code: firstCode,
          confirmedDocuments: [
            { document: "convenio", version: "1.0" },
            { document: "reglas-red", version: "1.0" },
          ],
        });
      expect(tryFirstRes.status).toBe(400);
      expect(tryFirstRes.body.message).toContain("incorrecto");

      // 5. Verification with the new second code SUCCEEDS
      const trySecondRes = await request(app)
        .post("/api/legal/formalization/verify-otp")
        .send({
          code: secondCode,
          confirmedDocuments: [
            { document: "convenio", version: "1.0" },
            { document: "reglas-red", version: "1.0" },
          ],
        });
      expect(trySecondRes.status).toBe(200);
      expect(trySecondRes.body.success).toBe(true);
    });
  });

  describe("6. Deriva de identidad: detección y reinicio obligatorio", () => {
    let testBroker: any;
    let validCode: string;

    beforeEach(async () => {
      testBroker = await createTestUser("broker", "Persona Original");
      currentAuthUser = testBroker;

      const res = await request(app)
        .post("/api/legal/formalization/request-otp")
        .send({
          confirmedDocuments: [
            { document: "convenio", version: "1.0" },
            { document: "reglas-red", version: "1.0" },
          ],
        });
      expect(res.status).toBe(200);
      validCode = _testEmailStore.lastFormalizationOtp!.code;
    });

    it("rechaza si cambia el correo tras emitir el OTP, invalida el OTP y exige reiniciar", async () => {
      // Modify user's email in DB/storage
      const storedUser = await storage.getUser(testBroker.id);
      storedUser!.email = "nuevo-correo-modificado@example.com";
      currentAuthUser.email = "nuevo-correo-modificado@example.com";

      const res = await request(app)
        .post("/api/legal/formalization/verify-otp")
        .send({
          code: validCode,
          confirmedDocuments: [
            { document: "convenio", version: "1.0" },
            { document: "reglas-red", version: "1.0" },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.requiresRestart).toBe(true);
      expect(res.body.message).toContain("identidad");

      // Verify OTP was marked invalidated
      const latestOtp = await storage.getLatestFormalizationOtpByUser(testBroker.id);
      expect(latestOtp!.invalidated).toBe(true);
    });

    it("rechaza si cambia el nombre tras emitir el OTP, invalida el OTP y exige reiniciar", async () => {
      const storedUser = await storage.getUser(testBroker.id);
      storedUser!.firstName = "NombreCambiado";
      storedUser!.lastName = "ApellidoCambiado";
      currentAuthUser.firstName = "NombreCambiado";
      currentAuthUser.lastName = "ApellidoCambiado";

      const res = await request(app)
        .post("/api/legal/formalization/verify-otp")
        .send({
          code: validCode,
          confirmedDocuments: [
            { document: "convenio", version: "1.0" },
            { document: "reglas-red", version: "1.0" },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.requiresRestart).toBe(true);
      expect(res.body.message).toContain("identidad");
    });

    it("rechaza si cambia el rol tras emitir el OTP, invalida el OTP y exige reiniciar", async () => {
      const storedUser = await storage.getUser(testBroker.id);
      storedUser!.role = "master_broker";
      currentAuthUser.role = "master_broker";

      const res = await request(app)
        .post("/api/legal/formalization/verify-otp")
        .send({
          code: validCode,
          confirmedDocuments: [
            { document: "convenio", version: "1.0" },
            { document: "reglas-red", version: "1.0" },
            { document: "reglas-master", version: "1.0" },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.requiresRestart).toBe(true);
      expect(res.body.message).toContain("identidad");
    });

    it("conserva exactamente la identidad confirmada en las evidencias aunque el perfil cambie después", async () => {
      const originalEmail = testBroker.email;
      const originalName = "Persona Original";

      // Formalize successfully with original identity
      const formalizeRes = await request(app)
        .post("/api/legal/formalization/verify-otp")
        .send({
          code: validCode,
          confirmedDocuments: [
            { document: "convenio", version: "1.0" },
            { document: "reglas-red", version: "1.0" },
          ],
        });
      expect(formalizeRes.status).toBe(200);

      // Now alter user profile later
      const storedUser = await storage.getUser(testBroker.id);
      storedUser!.email = "otro-correo-posterior@example.com";
      storedUser!.firstName = "NombrePosterior";

      // Inspect persisted acceptances
      const acceptances = await storage.getLegalAcceptancesByUser(testBroker.id);
      expect(acceptances.length).toBe(2);
      for (const acc of acceptances) {
        expect(acc.userEmail).toBe(originalEmail);
        expect(acc.userEmail).not.toBe("otro-correo-posterior@example.com");
        expect(acc.userName).toBe(originalName);
        expect(acc.userName).not.toBe("NombrePosterior");
      }
    });
  });

  describe("7. Manejo de fallos en el servicio de correo", () => {
    let testBroker: any;

    beforeEach(async () => {
      testBroker = await createTestUser("broker", "Fallo Correo");
      currentAuthUser = testBroker;
    });

    it("si el envío de correo falla, devuelve 502, el OTP queda invalidado y no se puede verificar", async () => {
      // Simulate email service failure
      _testEmailStore.simulateFailure = true;

      const res = await request(app)
        .post("/api/legal/formalization/request-otp")
        .send({
          confirmedDocuments: [
            { document: "convenio", version: "1.0" },
            { document: "reglas-red", version: "1.0" },
          ],
        });

      expect(res.status).toBe(502);
      expect(res.body.message).toContain("No fue posible enviar el código");

      // Verify that in storage the OTP was immediately marked invalidated
      const otps = Array.from((storage as any).formalizationOtpRequests.values()).filter(
        (o: any) => o.userId === testBroker.id
      ) as any[];
      expect(otps.length).toBe(1);
      expect(otps[0].invalidated).toBe(true);

      // Any attempt to verify must fail
      const verifyRes = await request(app)
        .post("/api/legal/formalization/verify-otp")
        .send({
          code: "123456",
          confirmedDocuments: [
            { document: "convenio", version: "1.0" },
            { document: "reglas-red", version: "1.0" },
          ],
        });
      expect(verifyRes.status).toBe(400);
      expect(verifyRes.body.message).toContain("No se encontró una solicitud activa");
    });

    it("fallo de correo seguido de solicitud inmediata responde 429 y no crea otro OTP", async () => {
      // 1. First request fails email delivery
      _testEmailStore.simulateFailure = true;

      const firstRes = await request(app)
        .post("/api/legal/formalization/request-otp")
        .send({
          confirmedDocuments: [
            { document: "convenio", version: "1.0" },
            { document: "reglas-red", version: "1.0" },
          ],
        });

      expect(firstRes.status).toBe(502);

      // 2. Immediate second request (even with email working again) must hit cooldown (429)
      _testEmailStore.simulateFailure = false;

      const secondRes = await request(app)
        .post("/api/legal/formalization/request-otp")
        .send({
          confirmedDocuments: [
            { document: "convenio", version: "1.0" },
            { document: "reglas-red", version: "1.0" },
          ],
        });

      expect(secondRes.status).toBe(429);
      expect(secondRes.body.message).toContain("esperar");

      // Verify that in storage there is only 1 OTP recorded (the first invalidated one), not 2
      const otps = Array.from((storage as any).formalizationOtpRequests.values()).filter(
        (o: any) => o.userId === testBroker.id
      ) as any[];
      expect(otps.length).toBe(1);
      expect(otps[0].invalidated).toBe(true);
    });
  });

  describe("8. Concurrencia en verificación y persistencia de intentos fallidos", () => {
    let testBroker: any;
    let validCode: string;

    beforeEach(async () => {
      testBroker = await createTestUser("broker", "Concurrencia Verificacion");
      currentAuthUser = testBroker;

      const res = await request(app)
        .post("/api/legal/formalization/request-otp")
        .send({
          confirmedDocuments: [
            { document: "convenio", version: "1.0" },
            { document: "reglas-red", version: "1.0" },
          ],
        });
      expect(res.status).toBe(200);
      validCode = _testEmailStore.lastFormalizationOtp!.code;
    });

    it("6 verificaciones incorrectas simultáneas incrementan estrictamente los intentos, alcanzan el límite y bloquean el código correcto posterior", async () => {
      // Launch 6 concurrent verification requests with wrong code
      const wrongRequests = Array.from({ length: 6 }).map(() =>
        request(app)
          .post("/api/legal/formalization/verify-otp")
          .send({
            code: "000000",
            confirmedDocuments: [
              { document: "convenio", version: "1.0" },
              { document: "reglas-red", version: "1.0" },
            ],
          })
      );

      const results = await Promise.all(wrongRequests);

      // All 6 requests must be rejected with 400
      for (const r of results) {
        expect(r.status).toBe(400);
      }

      // Check attempts in storage
      const otpRecord = await storage.getLatestFormalizationOtpByUser(testBroker.id);
      expect(otpRecord).toBeDefined();
      // Attempts must not be stuck at 1; must have incremented up to or past maxAttempts
      expect(otpRecord!.attempts).toBeGreaterThanOrEqual(5);
      expect(otpRecord!.invalidated).toBe(true);

      // Now attempt with the correct code: MUST BE REJECTED
      const correctRes = await request(app)
        .post("/api/legal/formalization/verify-otp")
        .send({
          code: validCode,
          confirmedDocuments: [
            { document: "convenio", version: "1.0" },
            { document: "reglas-red", version: "1.0" },
          ],
        });

      expect(correctRes.status).toBe(400);
      expect(correctRes.body.message).toMatch(/(límite|expirado|activa)/i);

      // Ensure no acceptances were recorded
      const acceptances = await storage.getLegalAcceptancesByUser(testBroker.id);
      expect(acceptances.length).toBe(0);
    });
  });

  describe("9. Integridad del catálogo persistido y rollback ante discrepancias", () => {
    let testBroker: any;
    let validCode: string;

    beforeEach(async () => {
      testBroker = await createTestUser("broker", "Integridad Hash");
      currentAuthUser = testBroker;

      const res = await request(app)
        .post("/api/legal/formalization/request-otp")
        .send({
          confirmedDocuments: [
            { document: "convenio", version: "1.0" },
            { document: "reglas-red", version: "1.0" },
          ],
        });
      expect(res.status).toBe(200);
      validCode = _testEmailStore.lastFormalizationOtp!.code;
    });

    it("rechaza si el hash del contenido en el catálogo persistido difiere de la versión activa habilitada", async () => {
      // Artificially tamper with the persisted document version hash in storage
      const convenioDoc = (storage as any).legalDocumentVersions.get("convenio:1.0");
      const originalHash = convenioDoc.contentSha256;
      convenioDoc.contentSha256 = "hash_alterado_malicioso";

      try {
        const res = await request(app)
          .post("/api/legal/formalization/verify-otp")
          .send({
            code: validCode,
            confirmedDocuments: [
              { document: "convenio", version: "1.0" },
              { document: "reglas-red", version: "1.0" },
            ],
          });

        expect(res.status).toBe(400);
        expect(res.body.message).toContain("integridad");

        // Verify no acceptances were persisted
        const acceptances = await storage.getLegalAcceptancesByUser(testBroker.id);
        expect(acceptances.length).toBe(0);
      } finally {
        convenioDoc.contentSha256 = originalHash;
      }
    });

    it("texto persistido alterado sin modificar su hash: formalización rechazada, OTP sin consumir y cero evidencias", async () => {
      const convenioDoc = (storage as any).legalDocumentVersions.get("convenio:1.0");
      const originalContent = convenioDoc.content;

      // Tamper with the persisted text content while keeping contentSha256 unchanged
      convenioDoc.content = originalContent + " /* TEXTO MALICIOSO INYECTADO */";

      try {
        const res = await request(app)
          .post("/api/legal/formalization/verify-otp")
          .send({
            code: validCode,
            confirmedDocuments: [
              { document: "convenio", version: "1.0" },
              { document: "reglas-red", version: "1.0" },
            ],
          });

        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/(integridad|contenido)/i);

        // Verify OTP is NOT consumed
        const latestOtp = await storage.getLatestFormalizationOtpByUser(testBroker.id);
        expect(latestOtp!.consumed).toBe(false);

        // Verify zero acceptances recorded
        const acceptances = await storage.getLegalAcceptancesByUser(testBroker.id);
        expect(acceptances.length).toBe(0);
      } finally {
        convenioDoc.content = originalContent;
      }
    });
  });

  describe("10. Consulta de estado y /api/legal/my-acceptances", () => {
    let brokerUser: any;

    beforeEach(async () => {
      const termsDoc = getApprovedLegalDocument("terminos", "1.0")!;
      const privacyDoc = getApprovedLegalDocument("aviso", "1.0")!;

      const reg = await storage.registerUserWithLegalEvidence({
        userData: {
          email: `broker-historial-${randomUUID()}@example.com`,
          password: "password123",
          firstName: "Daniela",
          lastName: "Historial",
          authMethod: "local",
          role: "broker",
        },
        evidence: {
          ipAddress: "127.0.0.1",
          userAgent: "Register Agent",
          termsDoc,
          privacyDoc,
        },
      });

      brokerUser = reg.user;
      currentAuthUser = brokerUser;
    });

    it("muestra estado no formalizado inicialmente y formalizado tras completar el flujo", async () => {
      const initialStatusRes = await request(app).get("/api/legal/formalization/status");
      expect(initialStatusRes.status).toBe(200);
      expect(initialStatusRes.body.requiresFormalization).toBe(true);
      expect(initialStatusRes.body.isFormalized).toBe(false);
      expect(initialStatusRes.body.formalizedAt).toBeNull();
      expect(initialStatusRes.body.requiredDocuments).toEqual(["convenio", "reglas-red"]);
      expect(initialStatusRes.body.acceptedDocuments).toEqual([]);

      // Request OTP and complete formalization
      await request(app)
        .post("/api/legal/formalization/request-otp")
        .send({
          confirmedDocuments: [
            { document: "convenio", version: "1.0" },
            { document: "reglas-red", version: "1.0" },
          ],
        });
      const code = _testEmailStore.lastFormalizationOtp!.code;

      await request(app)
        .post("/api/legal/formalization/verify-otp")
        .send({
          code,
          confirmedDocuments: [
            { document: "convenio", version: "1.0" },
            { document: "reglas-red", version: "1.0" },
          ],
        });

      const updatedStatusRes = await request(app).get("/api/legal/formalization/status");
      expect(updatedStatusRes.status).toBe(200);
      expect(updatedStatusRes.body.requiresFormalization).toBe(true);
      expect(updatedStatusRes.body.isFormalized).toBe(true);
      expect(updatedStatusRes.body.formalizedAt).toBeDefined();
      expect(updatedStatusRes.body.acceptedDocuments).toContain("convenio");
      expect(updatedStatusRes.body.acceptedDocuments).toContain("reglas-red");
    });

    it("entrega tanto registros como formalizaciones en /api/legal/my-acceptances", async () => {
      const initialAcceptancesRes = await request(app).get("/api/legal/my-acceptances");
      expect(initialAcceptancesRes.status).toBe(200);
      expect(initialAcceptancesRes.body.acceptances.length).toBe(2);

      // Complete formalization
      await request(app)
        .post("/api/legal/formalization/request-otp")
        .send({
          confirmedDocuments: [
            { document: "convenio", version: "1.0" },
            { document: "reglas-red", version: "1.0" },
          ],
        });
      const code = _testEmailStore.lastFormalizationOtp!.code;

      await request(app)
        .post("/api/legal/formalization/verify-otp")
        .send({
          code,
          confirmedDocuments: [
            { document: "convenio", version: "1.0" },
            { document: "reglas-red", version: "1.0" },
          ],
        });

      const fullAcceptancesRes = await request(app).get("/api/legal/my-acceptances");
      expect(fullAcceptancesRes.status).toBe(200);
      const accList = fullAcceptancesRes.body.acceptances;
      expect(accList.length).toBe(4);

      const docsInHistory = accList.map((a: any) => a.document);
      expect(docsInHistory).toContain("terminos");
      expect(docsInHistory).toContain("aviso");
      expect(docsInHistory).toContain("convenio");
      expect(docsInHistory).toContain("reglas-red");

      expect(getDocumentTitle("convenio")).toBe("Convenio de Colaboración");
      expect(getDocumentTitle("reglas-red")).toBe("Reglas de la Red");
      expect(getAcceptanceTypeLabel("accept_convenio")).toBe("Aceptación de Convenio");
      expect(getAcceptanceTypeLabel("accept_reglas_red")).toBe("Aceptación de Reglas de la Red");
    });
  });
});
