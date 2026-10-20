import { randomUUID } from "node:crypto";
import express from "express";
import type { Server } from "node:http";
import WebSocket from "ws";
// @ts-ignore
import request from "supertest";
import cron from "node-cron";
import { storage } from "../../server/storage";
import { registerRoutes } from "../../server/routes";
import { pool } from "../../server/db";

describe("SEC-P0-04: actual server WebSocket session lifecycle", () => {
  let server: Server;
  let base: string;
  let currentUser: any;
  let cookie: string;

  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    const app = express();
    app.use(express.json());
    server = await registerRoutes(app);
    currentUser = await storage.createUser({
      email: `p0-ws-${randomUUID()}@ci.example`,
      firstName: "Socket", lastName: "Test", role: "broker",
      isActive: true, status: "active",
    } as any);
    app.get("/__ci__/session-login", (req: any, res: any) => {
      req.logIn(currentUser, (error: any) => {
        if (error) return res.status(500).json({ message: "Login failed" });
        return res.json({ ok: true });
      });
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1",resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected TCP port");
    base = `ws://127.0.0.1:${address.port}`;
    // Perform a true Passport login through the same express-session store.
    const response = await request(app).get("/__ci__/session-login");
    expect(response.status).toBe(200);
    const setCookie = response.headers["set-cookie"];
    const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    expect(raw).toMatch(/connect\.sid=/);
    cookie = String(raw).split(";")[0];
  });

  afterAll(async () => {
    cron.getTasks().forEach((task: any) => task.stop());
    if (server?.listening) {
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
    try { await pool.end(); } catch {}
  });

  async function rejected(path: string, opts: WebSocket.ClientOptions = {}) {
    return await new Promise<string>((resolve,reject) => {
      const ws = new WebSocket(base+path,opts);
      ws.once("open", () => { ws.close(); reject(new Error("Unauthenticated WS upgraded")); });
      ws.once("error", (error: Error) => resolve(error.message));
    });
  }

  it("rejects a forged query-string user ID without a cookie", async () => {
    const reason = await rejected("/ws?userId="+encodeURIComponent(currentUser.id), {
      headers: { Origin: base.replace(/^ws:/,"http:") },
    });
    expect(reason).toMatch(/401|403/);
  });

  it("authenticates a real Passport session cookie and opens the socket", async () => {
    const ws = new WebSocket(base+"/ws", {
      headers: { Cookie: cookie, Origin: base.replace(/^ws:/,"http:") },
    });
    await new Promise<void>((resolve,reject)=>{
      ws.once("open", () => resolve());
      ws.once("error", reject);
    });
    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
    await new Promise<void>(resolve => ws.once("close", () => resolve()));
  });

  it("rejects cross-origin cookie reuse even with a valid session", async () => {
    const reason = await rejected("/ws", {
      headers: { Cookie: cookie, Origin: "https://untrusted.example" },
    });
    expect(reason).toMatch(/401|403/);
  });
});
