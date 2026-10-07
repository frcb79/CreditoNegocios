import type { Express } from "express";
import { isAuthenticated } from "./auth";
import { getPublishedLegalDocument } from "./legalDocuments";
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

  // Public, read-only routes. Do not depend on a session or write acceptance evidence.
  app.get("/api/legal/:document", (req, res) => {
    try {
      const requestedVersion = req.query.version;
      if (
        requestedVersion !== undefined &&
        (typeof requestedVersion !== "string" || !/^\d+\.\d+$/.test(requestedVersion))
      ) {
        return res.status(400).json({ message: "Versión de documento inválida." });
      }
      const document = getPublishedLegalDocument(req.params.document, requestedVersion);
      if (!document) {
        return res.status(404).json({ message: "Documento o versión no disponible." });
      }
      res.set("Cache-Control", "no-cache");
      // Express computes an ETag for the whole JSON, including identity and dates.
      return res.json(document);
    } catch (error: any) {
      console.error("Error al obtener documento legal:", error);
      return res.status(500).json({ message: "Error interno al obtener documento legal." });
    }
  });
}

