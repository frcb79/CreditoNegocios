import express from "express";
// @ts-ignore
import request from "supertest";
import {
  FORMALIZATION_NOTICE_TEXT,
  shouldShowFormalizationNotice,
  getExactDocumentUrl,
  getDocumentTitle,
  getAcceptanceTypeLabel,
  formatAcceptedDate,
} from "../../shared/legalDocuments";
import { storage } from "../../server/storage";
import { registerLegalRoutes } from "../../server/legalRoutes";
import { getApprovedLegalDocument } from "../../server/legalDocuments";

describe("Bloque 3A: Aviso de formalización, perfil y consulta de documentos legales", () => {
  let app: express.Express;
  let currentAuthUser: any = null;

  beforeEach(async () => {
    app = express();
    app.use(express.json());

    // Mock session/passport auth
    app.use((req: any, _res, next) => {
      if (currentAuthUser) {
        req.isAuthenticated = () => true;
        req.user = currentAuthUser;
        req.dbUser = currentAuthUser;
      } else {
        req.isAuthenticated = () => false;
        req.user = null;
        req.dbUser = null;
      }
      next();
    });

    // Register legal routes
    registerLegalRoutes(app);
  });

  describe("1. Regla de Aviso de Formalización a Broker y Master Broker", () => {
    it("debe exigir el aviso para el rol 'broker'", () => {
      expect(shouldShowFormalizationNotice("broker")).toBe(true);
    });

    it("debe exigir el aviso para el rol 'master_broker'", () => {
      expect(shouldShowFormalizationNotice("master_broker")).toBe(true);
    });

    it("no debe mostrar el aviso a otros roles (admin, super_admin, sin rol)", () => {
      expect(shouldShowFormalizationNotice("admin")).toBe(false);
      expect(shouldShowFormalizationNotice("super_admin")).toBe(false);
      expect(shouldShowFormalizationNotice("cliente")).toBe(false);
      expect(shouldShowFormalizationNotice(null)).toBe(false);
      expect(shouldShowFormalizationNotice(undefined)).toBe(false);
    });

    it("el texto del aviso debe coincidir exactamente con el texto requerido", () => {
      expect(FORMALIZATION_NOTICE_TEXT).toBe(
        "Para comenzar a registrar clientes y generar comisiones deberás formalizar tu Convenio de Colaboración."
      );
    });
  });

  describe("2. Resolución de Enlaces a la Versión Exacta y Títulos", () => {
    it("construye el enlace a la versión exacta para términos y aviso", () => {
      expect(getExactDocumentUrl("terminos", "1.0")).toBe("/legal/terminos?version=1.0");
      expect(getExactDocumentUrl("aviso", "1.0")).toBe("/legal/aviso?version=1.0");
      expect(getExactDocumentUrl("convenio", "1.0")).toBe("/legal/convenio?version=1.0");
      expect(getExactDocumentUrl("reglas-red", "1.0")).toBe("/legal/reglas-red?version=1.0");
      expect(getExactDocumentUrl("reglas-master", "1.0")).toBe("/legal/reglas-master?version=1.0");
    });

    it("escapa parámetros en la URL si fuera necesario", () => {
      expect(getExactDocumentUrl("terminos", "1.0-beta")).toBe("/legal/terminos?version=1.0-beta");
    });

    it("resuelve títulos legibles para cada documento", () => {
      expect(getDocumentTitle("terminos")).toBe("Términos y Condiciones");
      expect(getDocumentTitle("aviso")).toBe("Aviso de Privacidad Integral");
      expect(getDocumentTitle("convenio")).toBe("Convenio de Colaboración");
      expect(getDocumentTitle("reglas-red")).toBe("Reglas de la Red");
      expect(getDocumentTitle("reglas-master")).toBe("Reglas Master Broker");
      expect(getDocumentTitle("otro")).toBe("otro");
    });

    it("resuelve etiquetas descriptivas de tipo de aceptación", () => {
      expect(getAcceptanceTypeLabel("accept_terms")).toBe("Aceptación de Términos");
      expect(getAcceptanceTypeLabel("acknowledge_privacy")).toBe("Reconocimiento del Aviso");
      expect(getAcceptanceTypeLabel("accept_agreement")).toBe("Aceptación de Convenio");
      expect(getAcceptanceTypeLabel("custom_type")).toBe("custom_type");
    });

    it("formatea correctamente la fecha en formato legible e ISO", () => {
      const now = new Date("2026-10-06T18:00:00.000Z");
      const result = formatAcceptedDate(now);
      expect(result.iso).toBe("2026-10-06T18:00:00.000Z");
      expect(result.formatted).toContain("2026");
      expect(result.formatted).toContain("CDMX");
    });
  });

  describe("3. Consulta de Aceptaciones Existentes (/api/legal/my-acceptances)", () => {
    it("rechaza la consulta con 401 si no hay usuario autenticado", async () => {
      currentAuthUser = null;
      const res = await request(app).get("/api/legal/my-acceptances");
      expect(res.status).toBe(401);
    });

    it("devuelve arreglo vacío sin inventar evidencia cuando el usuario no tiene aceptaciones registradas", async () => {
      const userSinAceptaciones = await storage.createUser({
        email: "sin-aceptaciones-3a@example.com",
        firstName: "Nuevo",
        lastName: "SinAceptaciones",
        role: "broker",
        isActive: true,
        status: "active",
      });
      currentAuthUser = userSinAceptaciones;
      const res = await request(app).get("/api/legal/my-acceptances");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("acceptances");
      expect(Array.isArray(res.body.acceptances)).toBe(true);
      expect(res.body.acceptances.length).toBe(0);
    });

    it("devuelve las aceptaciones reales de Términos y Aviso registradas para el usuario", async () => {
      const termsDoc = getApprovedLegalDocument("terminos", "1.0")!;
      const privacyDoc = getApprovedLegalDocument("aviso", "1.0")!;

      const registerResult = await storage.registerUserWithLegalEvidence({
        userData: {
          email: "broker-block3a@example.com",
          password: "HashedPassword123!",
          firstName: "Broker",
          lastName: "Block3A",
          authMethod: "local",
          role: "broker",
        },
        evidence: {
          ipAddress: "192.168.1.10",
          userAgent: "Mozilla/5.0 Test Agent",
          termsDoc,
          privacyDoc,
        },
      });

      currentAuthUser = {
        id: registerResult.user.id,
        email: registerResult.user.email,
        role: "broker",
      };

      const res = await request(app).get("/api/legal/my-acceptances");
      expect(res.status).toBe(200);
      expect(res.body.acceptances).toHaveLength(2);

      const docs = res.body.acceptances.map((a: any) => a.document);
      expect(docs).toContain("terminos");
      expect(docs).toContain("aviso");

      // Verify no fake Convenio is present in Block 3A
      expect(docs).not.toContain("convenio");

      const termAcc = res.body.acceptances.find((a: any) => a.document === "terminos");
      expect(termAcc.version).toBe("1.0");
      expect(termAcc.contentSha256).toBe(termsDoc.contentSha256);
      expect(termAcc.acceptanceType).toBe("accept_terms");
      expect(termAcc.ipAddress).toBe("192.168.1.10");

      const privAcc = res.body.acceptances.find((a: any) => a.document === "aviso");
      expect(privAcc.version).toBe("1.0");
      expect(privAcc.contentSha256).toBe(privacyDoc.contentSha256);
      expect(privAcc.acceptanceType).toBe("acknowledge_privacy");
    });
  });

  describe("4. Control de Acceso por Rol a Documentos Privados (/api/legal/:document)", () => {
    it("permite acceso público a Términos y Aviso sin autenticación", async () => {
      currentAuthUser = null;
      const resTerms = await request(app).get("/api/legal/terminos");
      expect(resTerms.status).toBe(200);
      expect(resTerms.body.document).toBe("terminos");
      expect(resTerms.body.version).toBe("1.0");

      const resPrivacy = await request(app).get("/api/legal/aviso");
      expect(resPrivacy.status).toBe(200);
      expect(resPrivacy.body.document).toBe("aviso");
    });

    it("retorna 404 para documentos no existentes en el catálogo", async () => {
      currentAuthUser = null;
      const res = await request(app).get("/api/legal/documento-inexistente");
      expect(res.status).toBe(404);
    });

    it("retorna 400 si el parámetro version tiene formato inválido", async () => {
      currentAuthUser = null;
      const res = await request(app).get("/api/legal/terminos?version=invalida");
      expect(res.status).toBe(400);
    });

    it("rechaza acceso público (404) para Convenio, Reglas Red y Reglas Master si no hay sesión autenticada", async () => {
      currentAuthUser = null;
      const resConvenio = await request(app).get("/api/legal/convenio");
      expect(resConvenio.status).toBe(404);

      const resReglasRed = await request(app).get("/api/legal/reglas-red");
      expect(resReglasRed.status).toBe(404);

      const resReglasMaster = await request(app).get("/api/legal/reglas-master");
      expect(resReglasMaster.status).toBe(404);
    });

    it("deniega acceso con 403 a roles no autorizados (e.g. cliente)", async () => {
      const clientUser = await storage.createUser({
        email: "cliente-auth-1@example.com",
        firstName: "Cliente",
        lastName: "Prueba",
        role: "cliente",
        isActive: true,
        status: "active",
      });
      currentAuthUser = clientUser;

      const resConvenio = await request(app).get("/api/legal/convenio");
      expect(resConvenio.status).toBe(403);
    });

    it("permite a Broker consultar Convenio y Reglas Red pero deniega Reglas Master (403)", async () => {
      const brokerUser = await storage.createUser({
        email: "broker-auth-1@example.com",
        firstName: "Broker",
        lastName: "Prueba",
        role: "broker",
        isActive: true,
        status: "active",
      });
      currentAuthUser = brokerUser;

      const resConvenio = await request(app).get("/api/legal/convenio");
      expect(resConvenio.status).toBe(200);
      expect(resConvenio.body.document).toBe("convenio");
      expect(resConvenio.body.version).toBe("1.0");
      expect(resConvenio.body.isPrivate).toBe(true);
      expect(resConvenio.body.userAcceptance).toBeNull();

      const resReglasRed = await request(app).get("/api/legal/reglas-red");
      expect(resReglasRed.status).toBe(200);
      expect(resReglasRed.body.document).toBe("reglas-red");
      expect(resReglasRed.body.version).toBe("1.0");

      const resReglasMaster = await request(app).get("/api/legal/reglas-master");
      expect(resReglasMaster.status).toBe(403);
      expect(resReglasMaster.body.message).toContain("Reglas Master Broker");
    });

    it("permite a Master Broker consultar Convenio, Reglas Red y Reglas Master", async () => {
      const masterUser = await storage.createUser({
        email: "master-auth-1@example.com",
        firstName: "Master",
        lastName: "Prueba",
        role: "master_broker",
        isActive: true,
        status: "active",
      });
      currentAuthUser = masterUser;

      const resConvenio = await request(app).get("/api/legal/convenio");
      expect(resConvenio.status).toBe(200);

      const resReglasRed = await request(app).get("/api/legal/reglas-red");
      expect(resReglasRed.status).toBe(200);

      const resReglasMaster = await request(app).get("/api/legal/reglas-master");
      expect(resReglasMaster.status).toBe(200);
      expect(resReglasMaster.body.document).toBe("reglas-master");
      expect(resReglasMaster.body.version).toBe("1.0");
    });

    it("permite a Admin y Super Admin consultar todos los documentos privados", async () => {
      const adminUser = await storage.createUser({
        email: "admin-auth-1@example.com",
        firstName: "Admin",
        lastName: "Prueba",
        role: "admin",
        isActive: true,
        status: "active",
      });
      currentAuthUser = adminUser;

      const resMaster = await request(app).get("/api/legal/reglas-master");
      expect(resMaster.status).toBe(200);
    });
  });

  describe("5. Aislamiento Estricto de Evidencias Propias en Consulta de Documentos", () => {
    it("no expone evidencia de Usuario A cuando Usuario B consulta el documento", async () => {
      // Registrar Usuario A con evidencia
      const termsDoc = getApprovedLegalDocument("terminos", "1.0")!;
      const privacyDoc = getApprovedLegalDocument("aviso", "1.0")!;

      const userA = await storage.registerUserWithLegalEvidence({
        userData: {
          email: "user-a-isolated@example.com",
          password: "Password123!",
          firstName: "User",
          lastName: "A",
          authMethod: "local",
          role: "broker",
        },
        evidence: {
          ipAddress: "10.0.0.1",
          userAgent: "Agent A",
          termsDoc,
          privacyDoc,
        },
      });

      // Crear Usuario B sin evidencias
      const userB = await storage.createUser({
        email: "user-b-isolated@example.com",
        firstName: "User",
        lastName: "B",
        role: "broker",
        isActive: true,
        status: "active",
      });

      // Sesión de Usuario B consulta convenio
      currentAuthUser = userB;
      const resConvenio = await request(app).get("/api/legal/convenio");
      expect(resConvenio.status).toBe(200);
      expect(resConvenio.body.userAcceptance).toBeNull();

      // Sesión de Admin tampoco ve evidencia ajena
      const adminUser = await storage.createUser({
        email: "admin-isolated@example.com",
        firstName: "Admin",
        lastName: "Master",
        role: "super_admin",
        isActive: true,
        status: "active",
      });
      currentAuthUser = adminUser;
      const resAdmin = await request(app).get("/api/legal/convenio");
      expect(resAdmin.status).toBe(200);
      expect(resAdmin.body.userAcceptance).toBeNull();
    });
  });
});
