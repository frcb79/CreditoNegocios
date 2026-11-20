function normalizeOrigin(value: string) {
  return value.trim().replace(/\/$/, "");
}

function splitOrigins(value?: string) {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map(normalizeOrigin);
}

const defaultOrigins = [
  "http://localhost:3000",
  "http://localhost:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5173",
  "https://creditonegocios.com.mx",
  "https://www.creditonegocios.com.mx",
  "https://app.creditonegocios.com.mx",
  "https://credito-negocios.vercel.app",
  "https://credito-negocios-staging.vercel.app",
  "https://creditonegocios-staging.up.railway.app",
  "https://creditonegocios-production.up.railway.app",
];

export const frontendBaseUrl = process.env.FRONTEND_BASE_URL
  ? normalizeOrigin(process.env.FRONTEND_BASE_URL)
  : undefined;

export const allowedOrigins = new Set(
  [
    ...defaultOrigins,
    ...(process.env.RAILWAY_ENVIRONMENT_NAME==="staging" || process.env.RAILWAY_ENVIRONMENT==="staging"
      ? [
          "https://credito-negocios-staging.vercel.app",
          // One explicit, operator-controlled Vercel QA preview; staging ONLY.
          // Never accept this origin in production or allow arbitrary domains.
          ...splitOrigins(process.env.STAGING_AUTH_PREVIEW_ORIGIN)
            .filter(origin=>/^https:\/\/credito-negocios-[a-z0-9]+-francos-projects-62938903\.vercel\.app$/.test(origin)),
        ] : []),
    ...splitOrigins(process.env.ALLOWED_ORIGINS),
    ...(frontendBaseUrl ? [frontendBaseUrl] : []),
  ].filter(Boolean),
);

export function isAllowedOrigin(origin?: string): boolean {
  if (!origin) return true;
  const norm = normalizeOrigin(origin);
  if (allowedOrigins.has(norm)) return true;
  // SEC-P1-CSRF: substring/suffix matches accepted attacker-controlled origins.
  // Only explicit configured origins may receive credentialed CORS privileges.
  return false;
}

export const replitAuthEnabled = Boolean(
  process.env.REPLIT_DOMAINS && process.env.REPL_ID,
);