import fs from "fs";
import path from "path";

describe("SEC-P0-04: session-authenticated notification WebSocket", () => {
  const routes = fs.readFileSync(path.resolve(__dirname, "../../server/routes.ts"), "utf8");
  const auth = fs.readFileSync(path.resolve(__dirname, "../../server/auth.ts"), "utf8");
  const client = fs.readFileSync(path.resolve(__dirname, "../../client/src/contexts/NotificationContext.tsx"), "utf8");
  const ws = routes.split("// SEC-P0-04: WebSocket users MUST")[1]?.split("// Cron job for credit expiration alerts")[0];

  it("rejects unauthenticated upgrades and loads identity from the trusted session", () => {
    expect(ws).toContain("parseSessionForWebSocket(req as any");
    expect(ws).toContain(".session?.passport?.user");
    expect(ws).toContain("HTTP/1.1 401 Unauthorized");
    expect(ws).toContain("storage.getUser(sessionUserId)");
  });
  it("never authenticates from userId query parameters", () => {
    expect(ws).not.toMatch(/searchParams\.get\(['"]userId['"]\)/);
    expect(client).toContain('buildWebSocketUrl("/ws")');
    expect(client).not.toContain("?userId=");
  });
  it("rejects cross-site WS hijacking origins, even with a session cookie", () => {
    expect(ws).toContain("allowedOrigins.has(origin.origin)");
    expect(ws).toContain("origin.host === req.headers.host");
    expect(ws).toContain("if (!allowedWsOrigin) return rejectUpgrade()");
  });

  it("shares one session store across HTTP and WebSocket and checks user activity", () => {
    expect(auth).toContain("if (sharedSessionMiddleware) return sharedSessionMiddleware");
    expect(ws).toContain("activeUser.isActive === false");
    expect(ws).toContain('activeUser.status === "suspended"');
  });
  it("replaces stale sockets without deleting the current subscriber", () => {
    expect(ws).toContain("if (wsClients.get(userId) === ws) wsClients.delete(userId)");
  });
  it("retains notifications by polling over authenticated HTTP as a fallback", () => {
    expect(client).toContain("setInterval(fetchNotifications, 30_000)");
    expect(client).toContain("credentials: 'include'");
  });
});
