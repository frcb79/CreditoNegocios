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
  "https://credito-negocios-staging.vercel.app",
  "https://creditonegocios.com.mx",
  "https://www.creditonegocios.com.mx",
  "https://app.creditonegocios.com.mx",
  "https://creditonegocios-staging.up.railway.app",
];

export const frontendBaseUrl = process.env.FRONTEND_BASE_URL
  ? normalizeOrigin(process.env.FRONTEND_BASE_URL)
  : undefined;

export const allowedOrigins = new Set(
  [
    ...defaultOrigins,
    ...splitOrigins(process.env.ALLOWED_ORIGINS),
    ...(frontendBaseUrl ? [frontendBaseUrl] : []),
  ].filter(Boolean),
);

export function isAllowedOrigin(origin?: string): boolean {
  if (!origin) return true;
  const norm = normalizeOrigin(origin);
  if (allowedOrigins.has(norm)) return true;
  if (norm.endsWith(".vercel.app")) return true;
  if (norm.includes("creditonegocios")) return true;
  return false;
}

export const replitAuthEnabled = Boolean(
  process.env.REPLIT_DOMAINS && process.env.REPL_ID,
);