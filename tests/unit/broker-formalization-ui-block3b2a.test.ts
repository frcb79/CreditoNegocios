/**
 * PRUEBAS FOCALIZADAS DEL BLOQUE 3B2A
 * Formalización UI + Consulta Autenticada + Bloqueo Obligatorio en Servidor
 * 
 * Verificaciones requeridas:
 * 1. Sin formalizar: rechazo en servidor (403 FORMALIZATION_REQUIRED) y cero clientes creados.
 * 2. Formalizado: continúa el flujo existente sujeto a sus permisos.
 * 3. Master sin Reglas Master: rechazo (403 FORMALIZATION_REQUIRED) hasta completar formalización.
 * 4. Usuario no puede consultar evidencia de otro (aislamiento y autorización).
 * 5. Historial y estado se actualizan tras aceptación.
 * 6. Administradores exentos de la obligación de formalización.
 */

import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import express from "express";
// @ts-ignore
import request from "supertest";
import cron from "node-cron";
import { storage } from "../../server/storage";
import { registerLegalRoutes } from "../../server/legalRoutes";
import { registerRoutes } from "../../server/routes";
import { _testEmailStore } from "../../server/emailService";
import { pool } from "../../server/db";

describe("Bloque 3B2A: Formalización de Convenio y Bloqueo Obligatorio de Clientes", () => {
  let app: express.Express;
  let server: Server;
  let currentAuthUser: any = null;

  beforeAll(async () => {
    app = express();
    app.use(express.json());

    // Mock authentication middleware before registering routes
    app.use((req: any, _res: any, next: any) => {
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

    registerLegalRoutes(app);
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

  beforeEach(() => {
    delete _testEmailStore.simulateFailure;
    delete _testEmailStore.lastFormalizationOtp;
  });

  const createTestUser = async (
    role = "broker",
    name = "Test User",
    status: "active" | "inactive" | "suspended" = "active"
  ) => {
    const parts = name.split(" ");
    return await storage.createUser({
      email: `user-${randomUUID()}@example.com`,
      firstName: parts[0] || "Test",
      lastName: parts.slice(1).join(" ") || "User",
      role,
      isActive: status === "active",
      status,
    });
  };

  const formalizeUserViaOtp = async (
    user: any,
    docs = [
      { document: "convenio", version: "1.0" },
      { document: "reglas-red", version: "1.0" },
    ],
  ) => {
    currentAuthUser = user;
    const reqRes = await request(app)
      .post("/api/legal/formalization/request-otp")
      .send({ confirmedDocuments: docs });

    if (reqRes.status !== 200) {
      throw new Error(`Failed to request OTP: ${JSON.stringify(reqRes.body)}`);
    }

    const code = _testEmailStore.lastFormalizationOtp?.code;
    if (!code) {
      throw new Error("No OTP code found in email store");
    }

    const verifyRes = await request(app)
      .post("/api/legal/formalization/verify-otp")
      .send({ code, confirmedDocuments: docs });

    if (verifyRes.status !== 200) {
      throw new Error(`Failed to verify OTP: ${JSON.stringify(verifyRes.body)}`);
    }

    return verifyRes.body.acceptances;
  };

  describe("1. Sin formalizar: rechazo en servidor y cero clientes creados", () => {
    it("Broker sin formalizar: POST /api/clients responde 403 FORMALIZATION_REQUIRED y crea cero clientes", async () => {
      const broker = await createTestUser("broker", "Broker SinFormalizar");
      currentAuthUser = broker;

      const initialClients = await storage.getClients();
      const brokerInitialCount = initialClients.filter((c) => c.createdBy === broker.id).length;

      const res = await request(app)
        .post("/api/clients")
        .send({
          firstName: "Prospecto",
          lastName: "Prueba",
          email: `client-${randomUUID()}@empresa.com`,
          phone: "5512345678",
          type: "persona_moral",
          businessName: "Comercializadora Prueba SA",
        });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe("FORMALIZATION_REQUIRED");
      expect(res.body.message).toContain("formalizar tu Convenio de Colaboración");

      // Verify ZERO clients created
      const afterClients = await storage.getClients();
      const brokerAfterCount = afterClients.filter((c) => c.createdBy === broker.id).length;
      expect(brokerAfterCount).toBe(brokerInitialCount);
    });

    it("Broker sin formalizar: POST /api/mortgage-leads responde 403 FORMALIZATION_REQUIRED y crea cero prospectos", async () => {
      const broker = await createTestUser("broker", "Broker HipoSinFormalizar");
      currentAuthUser = broker;

      const initialClients = await storage.getClients();
      const brokerInitialCount = initialClients.filter((c) => c.createdBy === broker.id).length;

      const res = await request(app)
        .post("/api/mortgage-leads")
        .send({
          firstName: "Cliente",
          lastName: "Hipotecario",
          phone: "5598765432",
          email: `hipo-${randomUUID()}@test.com`,
          propertyValue: "3500000",
          requestedAmount: "2800000",
          downPayment: "700000",
          propertyLocation: "CDMX",
          requestedTermMonths: 240,
          monthlyIncome: "85000",
          incomeType: "asalariado",
        });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe("FORMALIZATION_REQUIRED");
      expect(res.body.message).toContain("formalizar tu Convenio de Colaboración");

      // Verify ZERO clients created
      const afterClients = await storage.getClients();
      const brokerAfterCount = afterClients.filter((c) => c.createdBy === broker.id).length;
      expect(brokerAfterCount).toBe(brokerInitialCount);
    });
  });

  describe("2. Formalizado: continúa el flujo existente sujeto a sus permisos", () => {
    it("Broker formalizado mediante OTP puede dar de alta clientes exitosamente (201 Created)", async () => {
      const broker = await createTestUser("broker", "Broker Formalizado");
      currentAuthUser = broker;

      // 1. Formalize via OTP flow
      await formalizeUserViaOtp(broker);

      // Verify formalization status is now true
      const statusRes = await request(app).get("/api/legal/formalization/status");
      expect(statusRes.status).toBe(200);
      expect(statusRes.body.isFormalized).toBe(true);

      // 2. Broker can now register client
      const res = await request(app)
        .post("/api/clients")
        .send({
          firstName: "Cliente",
          lastName: "Formalizado",
          email: `client-form-${randomUUID()}@empresa.com`,
          phone: "5587654321",
          type: "persona_moral",
          businessName: "Empresa de Éxito SA",
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.firstName).toBe("Cliente");
      expect(res.body.createdBy).toBe(broker.id);

      // Verify client persists in storage
      const storedClient = await storage.getClient(res.body.id);
      expect(storedClient).toBeDefined();
      expect(storedClient?.firstName).toBe("Cliente");
    });
  });

  describe("3. Master Broker sin Reglas Master: rechazo hasta completar formalización integral", () => {
    it("Master Broker que sólo cuenta con convenio y reglas-red es rechazado (403 FORMALIZATION_REQUIRED) hasta formalizar reglas-master", async () => {
      // Create user originally as broker and formalize broker docs (convenio + reglas-red)
      const user = await createTestUser("broker", "Broker A Master");
      await formalizeUserViaOtp(user, [
        { document: "convenio", version: "1.0" },
        { document: "reglas-red", version: "1.0" },
      ]);

      // Promote user to master_broker
      const updatedMaster = await storage.updateUser(user.id, { role: "master_broker" });
      currentAuthUser = updatedMaster;

      // Check formalization status: requires formalization because reglas-master is missing
      const statusRes = await request(app).get("/api/legal/formalization/status");
      expect(statusRes.status).toBe(200);
      expect(statusRes.body.isFormalized).toBe(false);
      expect(statusRes.body.requiredDocuments).toContain("reglas-master");

      // Attempt to create client as master_broker without reglas-master -> 403
      const res = await request(app)
        .post("/api/clients")
        .send({
          firstName: "Prospecto",
          lastName: "MasterIncompleto",
          email: `master-inc-${randomUUID()}@test.com`,
          phone: "5523456789",
          type: "persona_moral",
          businessName: "Negocio Master SA",
        });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe("FORMALIZATION_REQUIRED");

      // Now test that a Master Broker who formalizes all required docs (convenio, reglas-red, reglas-master) can create clients
      const fullMaster = await createTestUser("master_broker", "Master Completo");
      await formalizeUserViaOtp(fullMaster, [
        { document: "convenio", version: "1.0" },
        { document: "reglas-red", version: "1.0" },
        { document: "reglas-master", version: "1.0" },
      ]);

      currentAuthUser = fullMaster;
      const statusAfter = await request(app).get("/api/legal/formalization/status");
      expect(statusAfter.status).toBe(200);
      expect(statusAfter.body.isFormalized).toBe(true);

      // Now Master Broker can create client
      const resAfter = await request(app)
        .post("/api/clients")
        .send({
          firstName: "Prospecto",
          lastName: "MasterCompleto",
          email: `master-comp-${randomUUID()}@test.com`,
          phone: "5523456789",
          type: "persona_moral",
          businessName: "Negocio Master SA",
        });

      expect(resAfter.status).toBe(201);
      expect(resAfter.body.id).toBeDefined();
    });
  });

  describe("4. Usuario no puede consultar evidencia de otro (Aislamiento y Autorización)", () => {
    it("Usuario A no recibe la evidencia de Usuario B en /api/legal/my-acceptances", async () => {
      const userA = await createTestUser("broker", "Broker A");
      const userB = await createTestUser("broker", "Broker B");

      // User B formalizes
      const acceptancesB = await formalizeUserViaOtp(userB);
      expect(acceptancesB.length).toBeGreaterThan(0);
      const accBId = acceptancesB[0].id;

      // User A requests their own acceptances
      currentAuthUser = userA;
      const resA = await request(app).get("/api/legal/my-acceptances");
      expect(resA.status).toBe(200);

      const ids = resA.body.acceptances.map((a: any) => a.id);
      expect(ids).not.toContain(accBId);
    });

    it("Usuario A no puede consultar la evidencia de Usuario B por ID en /api/legal/my-acceptances/:id (403)", async () => {
      const userA = await createTestUser("broker", "Broker A");
      const userB = await createTestUser("broker", "Broker B");

      const acceptancesB = await formalizeUserViaOtp(userB);
      const accBId = acceptancesB[0].id;

      // User A requests User B's acceptance ID
      currentAuthUser = userA;
      const res = await request(app).get(`/api/legal/my-acceptances/${accBId}`);
      expect(res.status).toBe(403);
      expect(res.body.message).toContain("No tienes permiso para consultar la evidencia de otro usuario");
    });

    it("Usuario A sí puede consultar su propia evidencia en /api/legal/my-acceptances/:id", async () => {
      const userA = await createTestUser("broker", "Broker A Propio");
      const acceptancesA = await formalizeUserViaOtp(userA);
      const accAId = acceptancesA[0].id;

      currentAuthUser = userA;
      const res = await request(app).get(`/api/legal/my-acceptances/${accAId}`);
      expect(res.status).toBe(200);
      expect(res.body.acceptance.id).toBe(accAId);
      expect(res.body.acceptance.document).toBeDefined();
      expect(res.body.document.content).toBeDefined();
      // Masked email
      expect(res.body.acceptance.userEmail).toContain("***");
    });

    it("Petición no autenticada a /api/legal/convenio responde 401", async () => {
      currentAuthUser = null;
      const res = await request(app).get("/api/legal/convenio");
      expect(res.status).toBe(401);
    });

    it("Usuario con cuenta inactiva (isActive: false) es rechazado en /api/legal/convenio (401)", async () => {
      const inactiveUser = await createTestUser("broker", "Broker Inactivo", "inactive");
      currentAuthUser = inactiveUser;

      const res = await request(app).get("/api/legal/convenio");
      expect(res.status).toBe(401);
      expect(res.body.message).toContain("desactivada");
    });

    it("Usuario con cuenta suspendida (status: suspended) es rechazado en /api/legal/convenio (401)", async () => {
      const suspendedUser = await createTestUser("broker", "Broker Suspendido", "suspended");
      currentAuthUser = suspendedUser;

      const res = await request(app).get("/api/legal/convenio");
      expect(res.status).toBe(401);
      expect(res.body.message).toContain("suspendida");
    });

    it("Petición a documento desconocido responde 404", async () => {
      currentAuthUser = null;
      const res = await request(app).get("/api/legal/documento-inexistente");
      expect(res.status).toBe(404);
      expect(res.body.message).toContain("no encontrado");
    });

    it("Broker común no puede consultar /api/legal/reglas-master (403)", async () => {
      const broker = await createTestUser("broker", "Broker Regular");
      currentAuthUser = broker;

      const res = await request(app).get("/api/legal/reglas-master");
      expect(res.status).toBe(403);
      expect(res.body.message).toContain("No tienes autorización para consultar las Reglas Master Broker");
    });

    it("Páginas públicas de Términos y Aviso siguen siendo públicas para usuarios sin sesión", async () => {
      currentAuthUser = null;
      const termsRes = await request(app).get("/api/legal/terminos");
      expect(termsRes.status).toBe(200);
      expect(termsRes.body.document).toBe("terminos");

      const privacyRes = await request(app).get("/api/legal/aviso");
      expect(privacyRes.status).toBe(200);
      expect(privacyRes.body.document).toBe("aviso");
    });
  });

  describe("5. API & Reglas de Estado: Flujo OTP, Intentos y Cooldown", () => {
    it("Verificación con código erróneo decrementa intentos y emite remainingAttempts", async () => {
      const broker = await createTestUser("broker", "Broker IntentosOtp");
      currentAuthUser = broker;

      const reqRes = await request(app)
        .post("/api/legal/formalization/request-otp")
        .send({
          confirmedDocuments: [
            { document: "convenio", version: "1.0" },
            { document: "reglas-red", version: "1.0" },
          ],
        });
      expect(reqRes.status).toBe(200);
      expect(reqRes.body.expiresAt).toBeDefined();
      expect(reqRes.body.resendAvailableAt).toBeDefined();

      const badVerifyRes = await request(app)
        .post("/api/legal/formalization/verify-otp")
        .send({
          code: "000000",
          confirmedDocuments: [
            { document: "convenio", version: "1.0" },
            { document: "reglas-red", version: "1.0" },
          ],
        });

      expect(badVerifyRes.status).toBe(400);
      expect(typeof badVerifyRes.body.remainingAttempts).toBe("number");
      expect(badVerifyRes.body.remainingAttempts).toBeLessThanOrEqual(4);
    });

    it("Solicitud consecutiva dentro de la ventana de cooldown responde 429 con resendAvailableAt", async () => {
      const broker = await createTestUser("broker", "Broker CooldownWindow");
      currentAuthUser = broker;

      const req1 = await request(app)
        .post("/api/legal/formalization/request-otp")
        .send({
          confirmedDocuments: [
            { document: "convenio", version: "1.0" },
            { document: "reglas-red", version: "1.0" },
          ],
        });
      expect(req1.status).toBe(200);

      // Solicitud inmediata debe ser rechazada por cooldown
      const req2 = await request(app)
        .post("/api/legal/formalization/request-otp")
        .send({
          confirmedDocuments: [
            { document: "convenio", version: "1.0" },
            { document: "reglas-red", version: "1.0" },
          ],
        });
      expect(req2.status).toBe(429);
      expect(req2.body.resendAvailableAt).toBeDefined();
    });
  });

  describe("6. UI / Lógica de Interfaz: Aislamiento por Usuario y Estado Formalizado", () => {
    it("El estado formalization/status pasa de isFormalized=false a true con historial completo", async () => {
      const broker = await createTestUser("broker", "Broker EstadoHistorial");
      currentAuthUser = broker;

      // Initial status: not formalized
      const initialStatus = await request(app).get("/api/legal/formalization/status");
      expect(initialStatus.status).toBe(200);
      expect(initialStatus.body.isFormalized).toBe(false);
      expect(initialStatus.body.requiresFormalization).toBe(true);

      // Perform complete formalization via OTP
      await formalizeUserViaOtp(broker);

      // Updated status: isFormalized is true
      const updatedStatus = await request(app).get("/api/legal/formalization/status");
      expect(updatedStatus.status).toBe(200);
      expect(updatedStatus.body.isFormalized).toBe(true);
      expect(updatedStatus.body.formalizedAt).toBeDefined();

      // Acceptances history contains both new records
      const historyRes = await request(app).get("/api/legal/my-acceptances");
      expect(historyRes.status).toBe(200);
      const docsInHistory = historyRes.body.acceptances.map((a: any) => a.document);
      expect(docsInHistory).toContain("convenio");
      expect(docsInHistory).toContain("reglas-red");

      // Verify each record has SHA-256 fingerprint matching catalog
      const convenioRecord = historyRes.body.acceptances.find((a: any) => a.document === "convenio");
      const catalogDoc = await storage.getLegalDocumentVersion("convenio:1.0");
      expect(convenioRecord.contentSha256).toBe(catalogDoc?.contentSha256);
    });

    it("Admin puede registrar clientes sin requerir formalización previa", async () => {
      const admin = await createTestUser("admin", "Admin Plataforma");
      currentAuthUser = admin;

      const res = await request(app)
        .post("/api/clients")
        .send({
          firstName: "Cliente",
          lastName: "AdminCreado",
          email: `client-admin-${randomUUID()}@empresa.com`,
          phone: "5533334444",
          type: "persona_moral",
          businessName: "Corporativo Admin SA",
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.firstName).toBe("Cliente");
    });
  });
});
