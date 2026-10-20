import type { Request, RequestHandler } from "express";
import { isAllowedOrigin } from "./runtimeConfig";

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// A legitimate cross-site frontend must be explicitly whitelisted in
// ALLOWED_ORIGINS / FRONTEND_BASE_URL. No wildcard or substring acceptance.
function trustedOrigin(origin: string, req: Request): boolean {
  try {
    const url = new URL(origin);
    if ((url.protocol !== "https:" && url.protocol !== "http:") ||
        url.username || url.password || url.search || url.hash ||
        url.pathname !== "/" || url.origin !== origin || origin === "null") return false;

    // Same-host requests are valid even behind a first-party custom domain.
    // Host belongs to the request target, not to an untrusted forwarding header.
    const host = req.get("host");
    if (host && url.host.toLowerCase() === host.toLowerCase()) return true;
    return isAllowedOrigin(url.origin);
  } catch {
    return false;
  }
}

/**
 * SEC-P1-CSRF: CORS is not an authorization boundary. The browser sends
 * SameSite=None session cookies on foreign HTML forms even when CORS blocks
 * reading their responses. Reject before body parsing and before routes.
 * Requests without cookies and browser-origin headers may use machine APIs.
 */
export const rejectCrossSiteMutations: RequestHandler = (req, res, next) => {
  const method = req.method.toUpperCase();
  if (!WRITE_METHODS.has(method) && method !== "OPTIONS") return next();

  const origin = req.get("origin");
  if (origin) {
    if (!trustedOrigin(origin, req)) {
      return res.status(403).json({ code: "CSRF_ORIGIN_REJECTED", message: "Origen no autorizado." });
    }
    return next();
  }

  // Browsers cannot fabricate the Sec-Fetch-Site header from JavaScript.
  // Absence of Origin must NOT enable an authenticated form mutation.
  if (req.get("sec-fetch-site") === "cross-site" ||
      (WRITE_METHODS.has(method) && /(?:^|;\\s*)connect\\.sid=/.test(req.get("cookie") || ""))) {
    return res.status(403).json({ code: "CSRF_ORIGIN_REQUIRED", message: "Origen de sesión requerido." });
  }
  next();
};
