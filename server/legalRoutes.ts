import type { Express } from "express";
import { getPublishedLegalDocument } from "./legalDocuments";

export function registerLegalRoutes(app: Express) {
  // Public, read-only routes. Do not depend on a session or write acceptance evidence.
  app.get("/api/legal/:document", (req, res) => {
    const requestedVersion = req.query.version;
    if (requestedVersion !== undefined &&
        (typeof requestedVersion !== "string" || !/^\d+\.\d+$/.test(requestedVersion))) {
      return res.status(400).json({ message: "Versión de documento inválida." });
    }
    const document = getPublishedLegalDocument(req.params.document, requestedVersion);
    if (!document) {
      return res.status(404).json({ message: "Documento o versión no disponible." });
    }
    res.set("Cache-Control", "no-cache");
    // Express computes an ETag for the whole JSON, including identity and dates.
    return res.json(document);
  });
}
