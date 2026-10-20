import type { RequestHandler } from "express";

// SEC-P1-IMPORT: legacy financial/commission Excel importers write directly
// to global institution rates and bypass offer-version and margin controls.
// MVP uses the normal Super Admin/offer draft->publish UI instead. Disabled
// for every role (including Super Admin) until version-safe import exists.
const ECONOMIC_TYPES = new Set(["financieras", "financieras-soc", "commissions", "comisiones"]);

export const blockLegacyEconomicExcelImport: RequestHandler = (_req, res) =>
  res.status(409).json({
    code: "OFFER_VERSIONED_IMPORT_REQUIRED",
    message: "La importación económica por Excel está suspendida. Utiliza el editor de ofertas versionadas.",
  });

export const blockLegacyEconomicExcelType: RequestHandler = (req, res, next) =>
  ECONOMIC_TYPES.has(String(req.params.type || "").toLowerCase())
    ? blockLegacyEconomicExcelImport(req, res, next)
    : next();
