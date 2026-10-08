import type { Express } from "express";
import { isAuthenticated } from "./auth";
import { getPublishedLegalDocument, getApprovedLegalDocument } from "./legalDocuments";
import { maskEmail } from "../shared/legalDocuments";
import { sendFormalizationOtpEmail } from "./emailService";
import { storage } from "./storage";

export function registerLegalRoutes(app: Express) {
  // Acceptance evidence for current user (must be declared before :document to prevent route collision)
  app.get("/api/legal/my-acceptances", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || req.user?.id || (req as any).dbUser?.id;
      if (!userId) {
        return res.status(401).json({ message: "No autenticado" });
      }
      const acceptances = await storage.getLegalAcceptancesByUser(userId);
      return res.json({ acceptances });
    } catch (error: any) {
      console.error("Error al obtener historial de aceptaciones:", error);
      return res.status(500).json({ message: "Error al obtener historial de aceptaciones." });
    }
  });

  // Acceptance record detail with exact document version content and evidence
  app.get("/api/legal/my-acceptances/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || req.user?.id || (req as any).dbUser?.id;
      if (!userId) {
        return res.status(401).json({ message: "No autenticado" });
      }

      const acceptance = await storage.getLegalAcceptanceById(req.params.id);
      if (!acceptance) {
        return res.status(404).json({ message: "Registro de aceptación no encontrado." });
      }

      const callerUser = (req as any).dbUser || (await storage.getUser(userId));
      const isAdmin = callerUser && (callerUser.role === "admin" || callerUser.role === "super_admin");

      if (acceptance.userId !== userId && !isAdmin) {
        return res.status(403).json({
          message: "No tienes permiso para consultar la evidencia de otro usuario.",
        });
      }

      const docVersion =
        (await storage.getLegalDocumentVersion(acceptance.documentId)) ||
        getApprovedLegalDocument(acceptance.document, acceptance.version);

      return res.json({
        acceptance: {
          id: acceptance.id,
          userId: acceptance.userId,
          userEmail: maskEmail(acceptance.userEmail),
          userName: acceptance.userName,
          documentId: acceptance.documentId,
          document: acceptance.document,
          version: acceptance.version,
          contentSha256: acceptance.contentSha256,
          acceptanceType: acceptance.acceptanceType,
          ipAddress: acceptance.ipAddress,
          userAgent: acceptance.userAgent,
          acceptedAt: acceptance.acceptedAt,
        },
        document: docVersion
          ? {
              id: docVersion.id,
              document: docVersion.document,
              title: docVersion.title,
              version: docVersion.version,
              content: docVersion.content,
              contentSha256: docVersion.contentSha256,
              effectiveAt: docVersion.effectiveAt,
            }
          : null,
      });
    } catch (error: any) {
      console.error("Error al obtener evidencia de aceptación:", error);
      return res.status(500).json({ message: "Error al obtener evidencia de aceptación." });
    }
  });

  // Formalization status for current user
  app.get("/api/legal/formalization/status", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || req.user?.id || (req as any).dbUser?.id;
      if (!userId) {
        return res.status(401).json({ message: "No autenticado" });
      }
      const status = await storage.getFormalizationStatus(userId);
      return res.json(status);
    } catch (error: any) {
      console.error("Error al obtener estado de formalización:", error);
      return res.status(500).json({ message: "Error al obtener estado de formalización." });
    }
  });

  // Query documents required for formalization based on authenticated user's role
  app.get("/api/legal/formalization/documents", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || req.user?.id || (req as any).dbUser?.id;
      if (!userId) {
        return res.status(401).json({ message: "No autenticado" });
      }
      const result = await storage.getFormalizationDocuments(userId);
      return res.json(result);
    } catch (error: any) {
      console.error("Error al obtener documentos para formalización:", error);
      return res.status(500).json({ message: "Error al obtener documentos para formalización." });
    }
  });

  // Request formalization OTP to registered email
  app.post("/api/legal/formalization/request-otp", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || req.user?.id || (req as any).dbUser?.id;
      if (!userId) {
        return res.status(401).json({ message: "No autenticado" });
      }

      const otpResult = await storage.createOrResendFormalizationOtp({
        userId,
        confirmedDocuments: req.body?.confirmedDocuments,
      });

      if (!otpResult.success) {
        return res.status(otpResult.statusCode).json({
          message: otpResult.error,
          resendAvailableAt: otpResult.resendAvailableAt,
        });
      }

      const emailResult = await sendFormalizationOtpEmail({
        to: otpResult.otp!.userEmail,
        userName: otpResult.otp!.userName || undefined,
        code: otpResult.rawCode!,
        role: otpResult.otp!.userRole,
        documents: otpResult.documentsForEmail!,
      });

      if (!emailResult.success) {
        // Invalidate OTP in storage immediately so it is never usable
        await storage.invalidateFormalizationOtp(otpResult.otp!.id, "email_delivery_failed");
        return res.status(502).json({
          message: "No fue posible enviar el código de verificación por correo. Intenta de nuevo.",
          error: emailResult.error,
        });
      }

      return res.json({
        success: true,
        message: "Código de verificación enviado al correo registrado.",
        emailMasked: maskEmail(otpResult.otp!.userEmail),
        expiresAt: otpResult.otp!.expiresAt.toISOString(),
        resendAvailableAt: otpResult.otp!.resendAvailableAt.toISOString(),
      });
    } catch (error: any) {
      console.error("Error al solicitar OTP de formalización:", error);
      return res.status(500).json({ message: "Error interno al solicitar código de verificación." });
    }
  });

  // Verify OTP and record legal acceptances atomically
  app.post("/api/legal/formalization/verify-otp", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || req.user?.id || (req as any).dbUser?.id;
      if (!userId) {
        return res.status(401).json({ message: "No autenticado" });
      }

      const { code, confirmedDocuments } = req.body || {};
      if (!code || typeof code !== "string" || !/^\d{6}$/.test(code.trim())) {
        return res.status(400).json({
          message: "El código de verificación debe ser de 6 dígitos numéricos.",
        });
      }

      const clientIp = req.ip || req.socket?.remoteAddress || "";
      const userAgent = (req.headers["user-agent"] as string) || "unknown";

      const verifyResult = await storage.verifyAndFormalizeAgreementWithOtp({
        userId,
        code: code.trim(),
        confirmedDocuments,
        ipAddress: clientIp,
        userAgent,
      });

      if (!verifyResult.success) {
        return res.status(verifyResult.statusCode).json({
          message: verifyResult.error,
          remainingAttempts: verifyResult.remainingAttempts,
          requiresRestart: verifyResult.requiresRestart,
        });
      }

      return res.json({
        success: true,
        message: "Convenio formalizado exitosamente.",
        acceptances: verifyResult.acceptances!.map((a) => ({
          id: a.id,
          document: a.document,
          version: a.version,
          contentSha256: a.contentSha256,
          acceptedAt: a.acceptedAt,
        })),
      });
    } catch (error: any) {
      console.error("Error al verificar OTP de formalización:", error);
      return res.status(500).json({ message: "Error interno al procesar la verificación del código." });
    }
  });

  // Public for terminos and aviso; authenticated and role-authorized for convenio, reglas-red, reglas-master.
  app.get("/api/legal/:document", async (req: any, res: any) => {
    try {
      const documentName = req.params.document;
      const publicDocs = ["terminos", "aviso"];
      const privateDocs = ["convenio", "reglas-red", "reglas-master"];

      // Unknown documents return 404 immediately
      if (!publicDocs.includes(documentName) && !privateDocs.includes(documentName)) {
        return res.status(404).json({ message: "Documento legal no encontrado o no disponible." });
      }

      const requestedVersion = req.query.version;
      if (
        requestedVersion !== undefined &&
        (typeof requestedVersion !== "string" || !/^\d+\.\d+$/.test(requestedVersion))
      ) {
        return res.status(400).json({ message: "Versión de documento inválida." });
      }

      // Public documents: terminos and aviso (no authentication required)
      if (publicDocs.includes(documentName)) {
        const document = getPublishedLegalDocument(documentName, requestedVersion);
        if (!document) {
          return res.status(404).json({ message: "Documento o versión no disponible." });
        }
        res.set("Cache-Control", "no-cache");
        return res.json(document);
      }

      // Private documents: convenio, reglas-red, reglas-master
      // Execute the real isAuthenticated middleware to reject inactive, suspended or unauthenticated accounts
      return isAuthenticated(req, res, async () => {
        try {
          const callerUser = (req as any).dbUser;
          if (!callerUser) {
            return res.status(401).json({ message: "Usuario no encontrado o no activo." });
          }

          const allowedRoles = ["broker", "master_broker", "admin", "super_admin"];
          if (!allowedRoles.includes(callerUser.role)) {
            return res.status(403).json({ message: "No tienes autorización para consultar este documento." });
          }

          if (
            documentName === "reglas-master" &&
            callerUser.role !== "master_broker" &&
            callerUser.role !== "admin" &&
            callerUser.role !== "super_admin"
          ) {
            return res.status(403).json({ message: "No tienes autorización para consultar las Reglas Master Broker." });
          }

          const targetVersion = (typeof requestedVersion === "string" ? requestedVersion : undefined) || "1.0";
          const docVersion =
            (await storage.getLegalDocumentVersion(`${documentName}:${targetVersion}`)) ||
            getApprovedLegalDocument(documentName, targetVersion);

          if (!docVersion) {
            return res.status(404).json({ message: "Documento o versión no disponible." });
          }

          // Fetch caller's own acceptance evidence for this document/version if it exists
          const userAcceptances = await storage.getLegalAcceptancesByUser(callerUser.id);
          const ownAcceptance = userAcceptances.find(
            (a) => a.document === documentName && a.version === targetVersion
          );

          res.set("Cache-Control", "no-cache");
          return res.json({
            id: docVersion.id,
            document: docVersion.document,
            title: docVersion.title,
            version: docVersion.version,
            content: docVersion.content,
            contentSha256: docVersion.contentSha256,
            effectiveAt: docVersion.effectiveAt,
            isPrivate: true,
            userAcceptance: ownAcceptance
              ? {
                  id: ownAcceptance.id,
                  document: ownAcceptance.document,
                  version: ownAcceptance.version,
                  contentSha256: ownAcceptance.contentSha256,
                  acceptanceType: ownAcceptance.acceptanceType,
                  userEmail: maskEmail(ownAcceptance.userEmail),
                  userName: ownAcceptance.userName,
                  ipAddress: ownAcceptance.ipAddress,
                  userAgent: ownAcceptance.userAgent,
                  acceptedAt: ownAcceptance.acceptedAt,
                }
              : null,
          });
        } catch (innerError: any) {
          console.error("Error al procesar consulta de documento privado:", innerError);
          return res.status(500).json({ message: "Error interno al obtener documento legal." });
        }
      });
    } catch (error: any) {
      console.error("Error al obtener documento legal:", error);
      return res.status(500).json({ message: "Error interno al obtener documento legal." });
    }
  });
}

