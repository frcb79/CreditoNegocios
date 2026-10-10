import type { Express } from "express";
import { isAuthenticated } from "./auth";
import { getPublishedLegalDocument } from "./legalDocuments";
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
