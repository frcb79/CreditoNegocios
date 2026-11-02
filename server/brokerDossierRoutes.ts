import type { Express, RequestHandler } from "express";
import { isAuthenticated } from "./auth";
import { storage } from "./storage";
import { withAccountAccess } from "./accountAccess";
import { getDocumentAccessTarget } from "./documentStorage";

export const isBrokerPersonalDocument = (doc: any, userId: string) =>
  doc.brokerId === userId && !doc.clientId && !doc.creditId;

/** Profile JSON may contain old invitation metadata: never return credentials. */
export function dossierProfile(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(dossierProfile);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) =>
    !/password|token|secret|otp|invitation|promoCode|commission|sobretasa/i.test(key)
  ).map(([key, v]) => [key, dossierProfile(v)]));
}

export function registerBrokerDossierRoutes(app: Express) {
  const requireSuperAdmin: RequestHandler = async (req: any, res, next) => {
    const actor = await storage.getUser(req.user?.claims?.sub || req.user?.id);
    if (actor?.role !== "super_admin") return res.status(403).json({ message: "Sólo Super Admin puede consultar expedientes de asesores." });
    next();
  };
  const target = async (id: string) => {
    const user = await storage.getUser(id);
    return user && ["broker", "master_broker"].includes(user.role) ? user : null;
  };
  app.get("/api/admin/brokers/:id/dossier", isAuthenticated, requireSuperAdmin, async (req, res) => {
    try {
      const user = await target(req.params.id);
      if (!user) return res.status(404).json({ message: "Asesor no encontrado" });
      const [accounts, documents, acceptances, memberships, activity, master] = await Promise.all([
        withAccountAccess([user]), storage.getDocuments({ brokerId: user.id }),
        storage.getLegalAcceptancesByUser(user.id), storage.getTenantMembersByUser(user.id),
        storage.getCommercialAuditLogs({ entityType: "administrative_activity", entityId: user.id, limit: 100 }),
        user.masterBrokerId ? storage.getUser(user.masterBrokerId) : Promise.resolve(undefined),
      ]);
      const access = accounts[0];
      res.setHeader("Cache-Control", "private, no-store");
      return res.json({
        user: { id: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email,
          role: user.role, status: user.status, isActive: user.isActive,
          registrationStatus: access.registrationStatus, hasAccessed: access.hasAccessed,
          firstAccessAt: access.firstAccessAt, lastAccessAt: access.lastAccessAt,
          accessEvidenceSource: access.accessEvidenceSource,
          createdAt: user.createdAt, profileType: user.profileType,
          profileData: dossierProfile(user.profileData), commercialReferences: dossierProfile(user.commercialReferences),
          brandName: user.brandName, bankName: user.bankName, clabe: user.clabe, accountHolder: user.accountHolder,
          accessStatus: user.accessStatus, accessStatusExpiresAt: user.accessStatusExpiresAt,
          master: master ? { id: master.id, name: [master.firstName, master.lastName].filter(Boolean).join(" "), email: master.email } : null },
        memberships: await Promise.all(memberships.map(async m => ({ name: (await storage.getTenant(m.tenantId))?.name || "Organización", role: m.role, isActive: m.isActive, joinedAt: m.joinedAt }))),
        documents: documents.filter(d => isBrokerPersonalDocument(d, user.id)).map(d => ({
          id: d.id, type: d.type, fileName: d.fileName, mimeType: d.mimeType, fileSize: d.fileSize,
          uploadedAt: d.uploadedAt, expiresAt: d.expiresAt, isValid: d.isValid,
        })),
        acceptances: acceptances.map(a => ({ id: a.id, document: a.document, version: a.version, acceptedAt: a.acceptedAt })),
        activity: activity.map(a => ({ id: a.id, action: a.action, newState: a.newState, createdAt: a.createdAt,
          route: a.metadata?.route, method: a.metadata?.method })),
      });
    } catch { return res.status(503).json({ message: "No fue posible consultar el expediente del asesor" }); }
  });
  app.get("/api/admin/brokers/:id/documents/:documentId/download", isAuthenticated, requireSuperAdmin, async (req, res) => {
    try {
      const user = await target(req.params.id);
      const doc = await storage.getDocument(req.params.documentId);
      if (!user || !doc || !isBrokerPersonalDocument(doc, user.id)) return res.status(404).json({ message: "Documento no encontrado" });
      const access = await getDocumentAccessTarget(doc.filePath, { download: true, fileName: doc.fileName });
      res.setHeader("Cache-Control", "private, no-store");
      if (access.kind === "redirect") return res.redirect(access.url);
      return res.download(access.absolutePath, doc.fileName);
    } catch { return res.status(503).json({ message: "No fue posible descargar el documento" }); }
  });
}
