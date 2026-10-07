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

describe("Bloque 3A: Aviso de formalización y consulta de aceptaciones en el perfil", () => {
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
    it("construye el enlace a la versión exacta para términos", () => {
      expect(getExactDocumentUrl("terminos", "1.0")).toBe("/legal/terminos?version=1.0");
    });

    it("construye el enlace a la versión exacta para aviso", () => {
      expect(getExactDocumentUrl("aviso", "1.0")).toBe("/legal/aviso?version=1.0");
    });

    it("escapa parámetros en la URL si fuera necesario", () => {
      expect(getExactDocumentUrl("terminos", "1.0-beta")).toBe("/legal/terminos?version=1.0-beta");
    });

    it("resuelve títulos legibles para cada documento", () => {
      expect(getDocumentTitle("terminos")).toBe("Términos y Condiciones");
      expect(getDocumentTitle("aviso")).toBe("Aviso de Privacidad Integral");
      expect(getDocumentTitle("otro")).toBe("otro");
    });

    it("resuelve etiquetas descriptivas de tipo de aceptación", () => {
      expect(getAcceptanceTypeLabel("accept_terms")).toBe("Aceptación de Términos");
      expect(getAcceptanceTypeLabel("acknowledge_privacy")).toBe("Reconocimiento del Aviso");
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
        } else {
          req.isAuthenticated = () => false;
          req.user = null;
        }
        next();
      });

      // Register legal routes using storage instance
      registerLegalRoutes(app);
    });

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
});
