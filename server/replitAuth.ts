import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";

import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";
import { replitAuthEnabled } from "./runtimeConfig";

const sessionSecret = process.env.SESSION_SECRET || (process.env.NODE_ENV !== "production" ? "dev-session-secret-local" : undefined);

if (!sessionSecret) {
  throw new Error("Environment variable SESSION_SECRET not provided");
}

function requireReplitAuthConfig() {
  if (!replitAuthEnabled) {
    throw new Error("Replit authentication is not configured for this environment");
  }

  return {
    domains: process.env.REPLIT_DOMAINS!.split(",").map((domain) => domain.trim()).filter(Boolean),
    replitId: process.env.REPL_ID!,
  };
}

const getOidcConfig = memoize(
  async () => {
    const { replitId } = requireReplitAuthConfig();

    return await client.discovery(
      new URL(process.env.ISSUER_URL ?? "https://replit.com/oidc"),
      replitId,
    );
  },
  { maxAge: 3600 * 1000 }
);

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
  
  // Replit always uses HTTPS even in development (webview runs in iframe)
  // We need secure cookies with sameSite: 'none' for the webview to work
  const isReplit = !!process.env.REPL_ID;
  const isProduction = process.env.NODE_ENV === 'production';
  
  // Use secure cookies when in Replit (even in dev) or in production
  const useSecureCookies = isReplit || isProduction;
  
  return session({
    secret: sessionSecret,
    ...(sessionStore ? { store: sessionStore } : {}),
    resave: true,
    saveUninitialized: false,
    proxy: true,
    cookie: {
      httpOnly: true,
      secure: useSecureCookies,
      sameSite: useSecureCookies ? 'none' : 'lax',
      maxAge: sessionTtl,
      path: '/',
    },
  });
}

function updateUserSession(
  user: any,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}

async function upsertUser(
  claims: any,
) {
  const userId = claims["sub"];
  
  // Check if user exists
  const existingUser = await storage.getUser(userId);
  
  // Role handling:
  // - If user exists: ALWAYS preserve existing role from database
  // - If new user: Set default role to "broker"
  // Note: Replit Auth does not send role in claims, so we manage roles via database only
  let role: string;
  if (existingUser) {
    // User exists - preserve their existing role from database
    role = existingUser.role;
  } else {
    // New user - set default role to "broker"
    // Admins can change role via Users management page or SQL
    role = "broker";
  }
  
  // Upsert user with proper role
  await storage.upsertUser({
    id: userId,
    email: claims["email"],
    firstName: claims["first_name"],
    lastName: claims["last_name"],
    profileImageUrl: claims["profile_image_url"],
    role: role,
  }, userId);
}

export async function setupAuth(app: Express) {
  const rawTrustProxy = process.env.TRUST_PROXY;
  const trustProxySetting = rawTrustProxy
    ? rawTrustProxy === "true"
      ? true
      : rawTrustProxy === "false"
        ? false
        : Number.parseInt(rawTrustProxy, 10)
    : process.env.REPLIT_DOMAINS
      ? true
      : process.env.RAILWAY_ENVIRONMENT_NAME
        ? 1
        : false;

  app.set("trust proxy", Number.isNaN(trustProxySetting as number) ? false : trustProxySetting);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  // Needed for local auth sessions (email/password) and Replit OIDC sessions.
  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  if (!replitAuthEnabled) {
    return;
  }

  const config = await getOidcConfig();

  const verify: VerifyFunction = async (
    tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
    verified: passport.AuthenticateCallback
  ) => {
    const user = {};
    updateUserSession(user, tokens);
    await upsertUser(tokens.claims());
    verified(null, user);
  };

  // Handle development environment
  const { domains, replitId } = requireReplitAuthConfig();
  
  for (const domain of domains) {
    const strategy = new Strategy(
      {
        name: `replitauth:${domain}`,
        config,
        scope: "openid email profile offline_access",
        callbackURL: `https://${domain}/api/callback`,
      },
      verify,
    );
    passport.use(strategy);
  }

  app.get("/api/login", (req, res, next) => {
    passport.authenticate(`replitauth:${req.hostname}`, {
      prompt: "login consent",
      scope: ["openid", "email", "profile", "offline_access"],
    })(req, res, next);
  });

  app.get("/api/callback", (req, res, next) => {
    passport.authenticate(`replitauth:${req.hostname}`, {
      successReturnToOrRedirect: "/",
      failureRedirect: "/api/login",
    })(req, res, next);
  });

  app.get("/api/logout", (req, res) => {
    req.logout(() => {
      res.redirect(
        client.buildEndSessionUrl(config, {
          client_id: replitId,
          post_logout_redirect_uri: `${req.protocol}://${req.hostname}`,
        }).href
      );
    });
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const user = req.user as any;

  // Check if user is authenticated at all
  if (!req.isAuthenticated() || !user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  // For local auth (email/password), user.claims.sub exists but no expires_at
  // Allow these users through without token refresh logic
  if (user.claims?.sub && !user.expires_at) {
    return next();
  }

  // For Replit OIDC auth, check token expiration
  if (!user.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const now = Math.floor(Date.now() / 1000);
  if (now <= user.expires_at) {
    return next();
  }

  // Token expired, try to refresh
  const refreshToken = user.refresh_token;
  if (!refreshToken) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    const config = await getOidcConfig();
    const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
    updateUserSession(user, tokenResponse);
    return next();
  } catch (error) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
};
