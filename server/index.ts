import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import pino from "pino";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { allowedOrigins } from "./runtimeConfig";

const isProd = process.env.NODE_ENV === "production";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isProd ? "info" : "debug"),
  ...(isProd ? {} : { transport: { target: "pino-pretty", options: { colorize: true } } }),
});

const app = express();

// Security headers — disable CSP here; configure at CDN/Vercel edge level
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin && allowedOrigins.has(origin)) {
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
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === "/api/health" } }));
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
    if (path.startsWith("/api")) {
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
    const serveStaticEnabled = process.env.SERVE_STATIC === "true";
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
  });
})();
