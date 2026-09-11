import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";

const sessionSecret: string = process.env.SESSION_SECRET ?? "dev-session-secret-local";

if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
  throw new Error("Environment variable SESSION_SECRET not provided");
}

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const dbUrl = process.env.DATABASE_URL ?? "";
  const useMemoryStorage = process.env.USE_MEMORY_STORAGE === "true";
  const usesSupabaseDirectIpv6Host = dbUrl.includes("supabase.co") && dbUrl.includes(":5432");
  const forceMemoryStore = process.env.SESSION_STORE === "memory";
  const runningOnRailway = !!process.env.RAILWAY_ENVIRONMENT_NAME;
  const shouldUseMemoryStore = useMemoryStorage || forceMemoryStore || (runningOnRailway && usesSupabaseDirectIpv6Host);

  const sessionStore = shouldUseMemoryStore
    ? undefined
    : new (connectPg(session))({
        conString: dbUrl,
        createTableIfMissing: false,
        ttl: sessionTtl,
        tableName: "sessions",
      });
  
  const isProduction = process.env.NODE_ENV === 'production';
  
  return session({
    secret: sessionSecret,
    ...(sessionStore ? { store: sessionStore } : {}),
    resave: true,
    saveUninitialized: false,
    proxy: true,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      maxAge: sessionTtl,
      path: '/',
    },
  });
}

export async function setupAuth(app: Express) {
  const rawTrustProxy = process.env.TRUST_PROXY;
  const trustProxySetting = rawTrustProxy
    ? rawTrustProxy === "true"
      ? true
      : rawTrustProxy === "false"
        ? false
        : Number.parseInt(rawTrustProxy, 10)
    : process.env.RAILWAY_ENVIRONMENT_NAME
      ? 1
      : false;

  app.set("trust proxy", Number.isNaN(trustProxySetting as number) ? false : trustProxySetting);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  // Local auth session serialization
  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  // Global logout route
  app.get("/api/logout", (req, res) => {
    req.logout(() => {
      req.session.destroy(() => {
        res.clearCookie('connect.sid');
        res.redirect('/');
      });
    });
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const user = req.user as any;

  // Check if user is authenticated at all
  if (!req.isAuthenticated() || !user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const userId = user.claims?.sub || user.id;
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  // Active user check in database - ensures deactivated users cannot access protected endpoints
  try {
    const dbUser = await storage.getUser(userId);
    if (!dbUser) {
      if (typeof req.logout === 'function') req.logout(() => {});
      return res.status(401).json({ message: "Usuario no encontrado" });
    }
    if (dbUser.isActive === false) {
      if (typeof req.logout === 'function') req.logout(() => {});
      return res.status(401).json({ message: "Tu cuenta ha sido desactivada. Contacta al administrador." });
    }
    (req as any).dbUser = dbUser;
  } catch (err) {
    console.error("Error verifying active status in isAuthenticated:", err);
    return res.status(500).json({ message: "Error interno de autenticación" });
  }

  return next();
};
