import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import pino from "pino";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { allowedOrigins, isAllowedOrigin } from "./runtimeConfig";
import { runAutoMigration } from "./autoMigrate";
import { pool } from "./db";
import { ensureStagingCatalogBackup, logStagingCatalogOverview } from "./stagingCatalogBackup";
import { reconcileStagingCatalog } from "./stagingCatalogReconcile";
import { runStagingReadOnlyQA } from "./stagingMatchingAudit";
import { reconcileStagingTemplates } from "./stagingTemplateSync";
import { runStagingDocumentE2E } from "./stagingDocumentE2E";
import { validateStageSubmissionsReadOnly } from "./stagingSubmissionReadOnlyQA";
import { runStagingUnauthenticatedHttpSmoke } from "./stagingHttpUnauthSmoke";
import { exportStagingDatabaseOutsideRailway } from "./stagingExternalBackup";
import { validateStagingRestore } from "./stagingRestoreCheck";
import { rejectCrossSiteMutations } from "./csrfProtection";

const isProd = process.env.NODE_ENV === "production";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isProd ? "info" : "debug"),
  ...(isProd ? {} : { transport: { target: "pino-pretty", options: { colorize: true } } }),
});

const app = express();

// Security headers — disable CSP here; configure at CDN/Vercel edge level
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

// LEG-10 bearer tokens are secrets, not telemetry.  Neither access logs nor
// structured production request serializers may receive the raw token URL.
const isSensitiveConsentPath = (path: string) =>
  path.startsWith("/api/client-consent/") || path.startsWith("/autorizar-expediente/") ||
  path.startsWith("/api/public/campaign/") || path.startsWith("/api/public/prospect-completion/") ||
  path.startsWith("/api/commercial-resources/completion-links") || path.startsWith("/completar-perfil/") ||
  path.startsWith("/api/admin/brokers/");
app.use((req, res, next) => {
  if (isSensitiveConsentPath(req.path)) {
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  }
  next();
});

// Runs BEFORE CORS, parsers, sessions and routes: rejects cross-site writes
// regardless of content type (HTML forms and multipart included).
app.use(rejectCrossSiteMutations);

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin && isAllowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");
    res.setHeader(
      "Access-Control-Allow-Headers",
      req.headers["access-control-request-headers"] ?? "Content-Type, Authorization",
    );
    res.setHeader(
      "Access-Control-Allow-Methods",
      req.headers["access-control-request-method"] ?? "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    );
  }

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Structured JSON logging in production; dev keeps the verbose inline logger below
if (isProd) {
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === "/api/health" || isSensitiveConsentPath(req.url || "") } }));
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api") && !isSensitiveConsentPath(path)) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Never run schema-changing auto-migrations in staging without a verified
  // point-in-time logical snapshot of the financial catalog first.
  await ensureStagingCatalogBackup(pool);

  // Ensure database schema and super admin users exist before starting routes
  try {
    await runAutoMigration();
  } catch (migErr) {
    console.error("⚠️ [Startup] Auto-migration error:", migErr);
  }

  // Default is a READ-ONLY dry run. An APPLY requires a separate, explicit
  // staging-only environment gate and an independently verified backup.
  if (process.env.STAGING_CATALOG_SYNC_CHUNKS) {
    await reconcileStagingCatalog(pool);
  }

  // Staging metadata sync is opt-in, transactional and defaults to rollback.
  if (process.env.STAGING_TEMPLATE_SYNC_CHUNKS) {
    await reconcileStagingTemplates(pool);
  }

  // Staging only: report aggregate catalog parity without exporting user data.
  // This is read-only and never connects to production from staging.
  if (process.env.RAILWAY_ENVIRONMENT_NAME === "staging") {
    try {
      const { rows } = await pool.query(`
        SELECT
          (SELECT COUNT(*)::int FROM public.financial_institutions) AS financial_institutions,
          (SELECT COUNT(*)::int FROM public.institution_products) AS institution_products,
          (SELECT COUNT(*)::int FROM public.institution_product_versions) AS institution_product_versions,
          (SELECT COUNT(*)::int FROM public.users) AS users,
          (SELECT COUNT(*)::int FROM public.clients) AS clients,
          (SELECT COUNT(*)::int FROM public.prospect_completion_links) AS prospect_completion_links
      `);
      console.info("[STAGING-PARITY] Aggregate record counts:", JSON.stringify(rows[0]));
    } catch (error) {
      console.warn("[STAGING-PARITY] Catalog count check incomplete:", error instanceof Error ? error.message : "unknown");
    }
  }

  if (process.env.STAGING_DOCUMENT_E2E === "true") {
    try {
      await runStagingDocumentE2E();
    } catch (error) {
      console.error("[STAGING-DOCUMENT-E2E-ERROR]", error instanceof Error ? error.message : "unknown");
    }
  }

  try {
    await validateStageSubmissionsReadOnly(pool);
  } catch (error) {
    console.error("[STAGING-SUBMISSION-QA-ERROR]", error instanceof Error ? error.message : "unknown");
  }

  if (process.env.STAGING_DB_BACKUP_TO_SUPABASE === "true") {
    try {
      await exportStagingDatabaseOutsideRailway();
    } catch (error) {
      console.error("[STAGING-EXTERNAL-DB-BACKUP-ERROR]", error instanceof Error ? error.message : "unknown");
    }
  }

  if (process.env.STAGING_RESTORE_QA === "true") {
    try {
      await validateStagingRestore();
    } catch (error) {
      console.error("[STAGING-RESTORE-QA-ERROR]", error instanceof Error ? error.message : "unknown");
    }
  }

  await logStagingCatalogOverview(pool);

  // Test catalog matching and role isolation with synthetic in-memory records only.
  try {
    await runStagingReadOnlyQA(pool);
  } catch (error) {
    console.error("[STAGING-FUNCTIONAL-QA-ERROR]", error instanceof Error ? error.message : "unknown");
  }

  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    if (status >= 500) {
      logger.error({ err, status }, "Unhandled server error");
    }

    res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    const serveStaticEnabled = process.env.SERVE_STATIC !== "false";
    if (serveStaticEnabled) {
      serveStatic(app);
    } else {
      log("SERVE_STATIC=false, running in API-only mode");
    }
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  const host = process.env.HOST || (process.platform === "win32" ? "127.0.0.1" : "0.0.0.0");
  const listenOptions = process.platform === "win32"
    ? { port, host }
    : { port, host, reusePort: true };

  server.listen(listenOptions, () => {
    log(`serving on ${host}:${port}`);
    void runStagingUnauthenticatedHttpSmoke(port).catch(error => {
      console.error("[STAGING-HTTP-UNAUTH-QA-ERROR]", error instanceof Error ? error.message : "unknown");
    });
  });
})();
