import type { Express } from "express";
import { isAuthenticated } from "./auth";
import {
  getPublishedLegalDocument,
  getApprovedLegalDocument,
} from "./legalDocuments";
import {
  maskEmail,
  getDocumentTitle,
  getRequiredFormalizationDocuments,
} from "../shared/legalDocuments";
import { sendFormalizationOtpEmail } from "./emailService";
import { storage } from "./storage";
import { renderLegalVoucherPdf } from "./legalVoucherPdf";
import { ACTIVE_FORMALIZATION_VERSIONS } from "./legalDocuments";

/**
 * Formatea el texto plano oficial del comprobante de aceptación legal e histórico.
 * Reproduce el documento personalizado exacto inmutable persistido en la formalización,
 * o la versión del catálogo en aceptaciones estándar.
 */
function generateOfficialVoucherText(
  acceptance: any,
  snapshot: any,
  docVersion: any
): string {
  const isPersonalized = Boolean(snapshot);
  const docTitle = snapshot?.title || docVersion?.title || getDocumentTitle(acceptance.document);
  const dateObj = new Date(acceptance.acceptedAt);
  const isoUtc = dateObj.toISOString();
  const cdmxFormatted = new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(dateObj);

  const divider = "================================================================================";
  const subDivider = "--------------------------------------------------------------------------------";

  let out = "";
  out += `${divider}\n`;
  out += `       COMPROBANTE OFICIAL DE FORMALIZACIÓN Y ACEPTACIÓN LEGAL ELECTRÓNICA       \n`;
  out += `                          CRÉDITO NEGOCIOS MÉXICO                               \n`;
  out += `${divider}\n\n`;

  out += `[DATOS DE CONTROL Y EVIDENCIA HISTÓRICA INMUTABLE]\n`;
  out += `${subDivider}\n`;
  out += `Folio de Aceptación:               ${acceptance.id}\n`;
  out += `Documento Formalizado:             ${docTitle} (${acceptance.document})\n`;
  out += `Versión Oficial:                   v${acceptance.version}\n`;
  out += `Tipo de Registro:                  ${acceptance.acceptanceType}\n`;
  out += `Fecha y Hora Oficial (CDMX):       ${cdmxFormatted}\n`;
  out += `Fecha y Hora Oficial (UTC):        ${isoUtc}\n`;
  out += `Usuario / Titular:                 ${acceptance.userName || "N/A"}\n`;
  out += `Correo Electrónico Registrado:     ${acceptance.userEmail}\n`;
  out += `Dirección IP de Aceptación:        ${acceptance.ipAddress || "No registrada"}\n`;
  out += `Agente de Usuario / Navegador:     ${acceptance.userAgent || "No registrado"}\n`;
  out += `Método de Autenticación:           ${snapshot?.evidence?.otpMethod || "Código OTP por Correo Electrónico"}\n`;
  out += `Huella Base Plantilla (SHA-256):   ${snapshot?.templateSha256 || acceptance.contentSha256}\n`;
  out += `Huella Contenido Exacto (SHA-256): ${snapshot?.personalizedSha256 || acceptance.contentSha256}\n`;

  if (isPersonalized && snapshot.incorporatedData) {
    out += `\n[DATOS INCORPORADOS AL DOCUMENTO PERSONALIZADO]\n`;
    out += `${subDivider}\n`;
    const isCompanySigner = snapshot.incorporatedData.profileType === "persona_moral";
    const legalCompanyName = isCompanySigner
      ? (snapshot.incorporatedData.businessName || "Pendiente de proporcionar")
      : (snapshot.incorporatedData.fullName || "N/A");
    out += `Nombre / Razón Social:             ${legalCompanyName}\n`;
    if (isCompanySigner) {
      out += `Representante Firmante:            ${snapshot.incorporatedData.legalRepresentativeName || "Pendiente de proporcionar"}\n`;
      out += `Carácter del Firmante:              ${snapshot.incorporatedData.legalRepresentativePosition || "No especificado"}\n`;
    }
    out += `Rol en Plataforma:                 ${snapshot.incorporatedData.role || "N/A"}\n`;
    out += `Institución Bancaria:              ${snapshot.incorporatedData.bankName || "Pendiente de proporcionar"}\n`;
    out += `Cuenta Bancaria:                   ${snapshot.incorporatedData.bankAccount || "Pendiente de proporcionar"}\n`;
    out += `CLABE Interbancaria:               ${snapshot.incorporatedData.bankClabe || snapshot.incorporatedData.clabe || "Pendiente de proporcionar"}\n`;
    out += `Plazos Comerciales Aplicables:     Consultar el contenido histórico íntegro incorporado a continuación\n`;
  }

  out += `\n${divider}\n`;
  out += `                 CONTENIDO ÍNTEGRO DEL DOCUMENTO PERSONALIZADO                  \n`;
  out += `${divider}\n\n`;
  out += `${snapshot?.personalizedContent || docVersion?.content || "[Contenido no disponible]"}\n\n`;

  out += `${divider}\n`;
  out += `Fin del comprobante oficial. Registro generado de forma inmutable bajo la Fase 1A.3B.\n`;
  out += `${divider}\n`;

  return out;
}

export function registerLegalRoutes(app: Express) {
  // Administrators inspect immutable evidence through dedicated read-only routes.
  // Never widen /api/legal/my-acceptances: those routes remain strictly owner-only.
  const requireActualSuperAdmin = async (req: any, res: any, next: any) => {
    try {
      const actorId = req.user?.claims?.sub || req.user?.id;
      if (!actorId) return res.status(401).json({ message: "No autenticado." });
      const actor = await storage.getUser(actorId);
      if (!actor || actor.role !== "super_admin") {
        return res.status(403).json({ message: "Consulta exclusiva de Super Admin." });
      }
      return next();
    } catch (error) {
      console.error("Super Admin legal authorization failed:", error);
      return res.status(500).json({ message: "No fue posible validar los permisos." });
    }
  };
  const safeAcceptance = (a: any) => ({
    id: a.id, userId: a.userId, userName: a.userName,
    document: a.document, version: a.version, contentSha256: a.contentSha256,
    acceptanceType: a.acceptanceType, acceptedAt: a.acceptedAt,
  });
  const legalSummary = (user: any, userAcceptances: any[]) => {
    const requiredDocuments = getRequiredFormalizationDocuments(user.role);
    const acceptedDocuments = requiredDocuments.filter(doc =>
      userAcceptances.some(a => a.document === doc && a.version === ACTIVE_FORMALIZATION_VERSIONS[doc])
    );
    const hasPriorAcceptance = requiredDocuments.some(doc =>
      userAcceptances.some(a => a.document === doc));
    const currentVersionComplete = requiredDocuments.every(doc => acceptedDocuments.includes(doc));
    const status = currentVersionComplete ? "formalized" :
      hasPriorAcceptance && requiredDocuments.some(doc =>
        userAcceptances.some(a => a.document === doc && a.version !== ACTIVE_FORMALIZATION_VERSIONS[doc])) ?
          "requires_new_acceptance" : "pending";
    const latestAcceptance = userAcceptances.reduce((latest: Date | null, a: any) => {
      const when = new Date(a.acceptedAt);
      return !Number.isNaN(when.getTime()) && (!latest || when > latest) ? when : latest;
    }, null);
    return {
      userId: user.id, role: user.role, status, isFormalized: currentVersionComplete,
      requiredDocuments, acceptedDocuments,
      latestAcceptedAt: latestAcceptance?.toISOString() || null,
    };
  };
  const getAdminTarget = async (res: any, userId: string) => {
    const target = await storage.getUser(userId);
    if (!target) {
      res.status(404).json({ message: "Usuario no encontrado." });
      return null;
    }
    if (target.role !== "broker" && target.role !== "master_broker") {
      res.status(400).json({ message: "La consulta contractual es para Brokers y Master Brokers." });
      return null;
    }
    return target;
  };
  // Batch avoids one database query per Broker/Master in the global directory.
  app.get("/api/admin/legal/users/overview", isAuthenticated, requireActualSuperAdmin, async (_req: any, res) => {
    try {
      const commercialUsers = (await storage.getAllUsers()).filter(u =>
        u.role === "broker" || u.role === "master_broker");
      const all = await storage.getLegalAcceptancesForUsers(commercialUsers.map(u => u.id));
      const byUser = new Map<string, any[]>();
      for (const acc of all) byUser.set(acc.userId, [...(byUser.get(acc.userId) || []), acc]);
      res.set("Cache-Control", "private, no-store");
      return res.json({ users: commercialUsers.map(u => legalSummary(u, byUser.get(u.id) || [])) });
    } catch (error) {
      console.error("Admin formalization overview error:", error);
      return res.status(500).json({ message: "No se pudo consultar el estado de los convenios." });
    }
  });
  app.get("/api/admin/legal/users/:userId/acceptances", isAuthenticated, requireActualSuperAdmin, async (req: any, res) => {
    try {
      const target = await getAdminTarget(res, req.params.userId);
      if (!target) return;
      const acceptances = await storage.getLegalAcceptancesByUser(target.id);
      res.set("Cache-Control", "private, no-store");
      return res.json({
        user: { id: target.id, firstName: target.firstName, lastName: target.lastName,
          email: target.email, role: target.role },
        formalization: legalSummary(target, acceptances),
        acceptances: acceptances.map(safeAcceptance),
      });
    } catch (error) {
      console.error("Admin legal history error:", error);
      return res.status(500).json({ message: "No se pudo consultar el historial legal." });
    }
  });
  app.get("/api/admin/legal/users/:userId/acceptances/:acceptanceId", isAuthenticated, requireActualSuperAdmin, async (req: any, res) => {
    try {
      const target = await getAdminTarget(res, req.params.userId);
      if (!target) return;
      const acc = await storage.getLegalAcceptanceById(req.params.acceptanceId);
      if (!acc || acc.userId !== target.id) {
        return res.status(404).json({ message: "Evidencia no encontrada para este usuario." });
      }
      const document = (await storage.getLegalDocumentVersion(acc.documentId)) ||
        getApprovedLegalDocument(acc.document, acc.version);
      const snapshot = await storage.getPersonalizedAgreementSnapshot(acc.id);
      res.set("Cache-Control", "private, no-store");
      return res.json({
        acceptance: { ...safeAcceptance(acc), userEmail: acc.userEmail,
          ipAddress: acc.ipAddress, userAgent: acc.userAgent },
        document: document ? { title: document.title, document: document.document,
          version: document.version, content: document.content,
          contentSha256: document.contentSha256 } : null,
        snapshot: snapshot || null, isPersonalized: Boolean(snapshot),
      });
    } catch (error) {
      console.error("Admin legal evidence detail error:", error);
      return res.status(500).json({ message: "No se pudo consultar la evidencia legal." });
    }
  });
  app.get("/api/admin/legal/users/:userId/acceptances/:acceptanceId/comprobante", isAuthenticated, requireActualSuperAdmin, async (req: any, res) => {
    try {
      const target = await getAdminTarget(res, req.params.userId);
      if (!target) return;
      const acc = await storage.getLegalAcceptanceById(req.params.acceptanceId);
      if (!acc || acc.userId !== target.id) {
        return res.status(404).json({ message: "Evidencia no encontrada para este usuario." });
      }
      const snapshot = await storage.getPersonalizedAgreementSnapshot(acc.id);
      const docVersion = (await storage.getLegalDocumentVersion(acc.documentId)) ||
        getApprovedLegalDocument(acc.document, acc.version);
      const voucherText = generateOfficialVoucherText(acc, snapshot, docVersion);
      const pdf = await renderLegalVoucherPdf(voucherText);
      const filename = `comprobante-${String(acc.document).replace(/[^a-z0-9_-]/gi, "-")}-${String(acc.id).replace(/[^a-z0-9_-]/gi, "-")}.pdf`;
      res.set("Cache-Control", "private, no-store");
      res.set("Content-Type", "application/pdf");
      res.set("Content-Disposition", `attachment; filename="${filename}"`);
      return res.send(pdf);
    } catch (error) {
      console.error("Admin legal voucher download error:", error);
      return res.status(500).json({ message: "No se pudo descargar el comprobante." });
    }
  });

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

      // Regla de seguridad: acceso exclusivamente propio, sin filtración administrativa
      if (acceptance.userId !== userId) {
        return res.status(403).json({
          message: "No tienes permiso para consultar la evidencia de otro usuario.",
        });
      }

      const docVersion =
        (await storage.getLegalDocumentVersion(acceptance.documentId)) ||
        getApprovedLegalDocument(acceptance.document, acceptance.version);

      const snapshot = await storage.getPersonalizedAgreementSnapshot(acceptance.id);

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
        snapshot: snapshot || null,
        isPersonalized: Boolean(snapshot),
      });
    } catch (error: any) {
      console.error("Error al obtener evidencia de aceptación:", error);
      return res.status(500).json({ message: "Error al obtener evidencia de aceptación." });
    }
  });

  // Comprobante oficial descargable o consultable que reproduce exactamente el snapshot histórico
  app.get("/api/legal/my-acceptances/:id/comprobante", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || req.user?.id || (req as any).dbUser?.id;
      if (!userId) {
        return res.status(401).json({ message: "No autenticado" });
      }

      const acceptance = await storage.getLegalAcceptanceById(req.params.id);
      if (!acceptance) {
        return res.status(404).json({ message: "Registro de aceptación no encontrado." });
      }

      // Regla de seguridad: acceso estrictamente propio
      if (acceptance.userId !== userId) {
        return res.status(403).json({
          message: "No tienes permiso para consultar el comprobante de otro usuario.",
        });
      }

      const snapshot = await storage.getPersonalizedAgreementSnapshot(acceptance.id);
      const docVersion =
        (await storage.getLegalDocumentVersion(acceptance.documentId)) ||
        getApprovedLegalDocument(acceptance.document, acceptance.version);

      const voucherText = generateOfficialVoucherText(acceptance, snapshot, docVersion);

      const shouldDownload =
        req.query.download === "true" || req.headers.accept?.includes("text/plain");

      // LEG-14: default download is PDF, with explicit TXT for legacy clients.
      // PDF uses exactly the persisted snapshot text already shown in JSON.
      const wantsPdf = req.query.format === "pdf" ||
        (req.query.download === "true" && req.query.format !== "txt" && !req.headers.accept?.includes("text/plain")) ||
        req.headers.accept?.includes("application/pdf");
      if (wantsPdf) {
        const pdf = await renderLegalVoucherPdf(voucherText);
        const safeName = `comprobante-${String(acceptance.document).replace(/[^a-z0-9_-]/gi, "-")}-${String(acceptance.id).replace(/[^a-z0-9_-]/gi, "-")}.pdf`;
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);
        res.setHeader("Cache-Control", "private, no-store");
        return res.send(pdf);
      }

      if (shouldDownload) {
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="comprobante-${acceptance.document}-${acceptance.id}.txt"`
        );
        return res.send(voucherText);
      }

      return res.json({
        success: true,
        voucherText,
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
        snapshot: snapshot || null,
        isPersonalized: Boolean(snapshot),
      });
    } catch (error: any) {
      console.error("Error al generar comprobante de aceptación:", error);
      return res.status(500).json({ message: "Error al generar comprobante de aceptación." });
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
        snapshots: verifyResult.snapshots || [],
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
        return res.status(404).json({ message: "Documento o versión no disponible." });
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
      // If unauthenticated or without valid session, return 404 to avoid leaking private templates
      const hasSessionAuth =
        typeof req.isAuthenticated === "function" && req.isAuthenticated() && Boolean(req.user);
      if (!hasSessionAuth) {
        return res.status(404).json({ message: "Documento o versión no disponible." });
      }

      // Execute the real isAuthenticated middleware to verify active account status
      return isAuthenticated(req, res, async () => {
        try {
          const callerUser = (req as any).dbUser || req.user;
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
          const userAcceptances = callerUser.id
            ? await storage.getLegalAcceptancesByUser(callerUser.id)
            : [];
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
