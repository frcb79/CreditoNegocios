import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import express from "express";
// @ts-ignore
import request from "supertest";
import cron from "node-cron";
import { storage } from "../../server/storage";
import { registerRoutes } from "../../server/routes";
import { pool } from "../../server/db";

describe("SEC-P0: authenticated resource-scope HTTP regressions", () => {
  let app: express.Express;
  let server: Server;
  let current: any = null;
  let broker: any, sibling: any, oldMaster: any, newMaster: any, admin: any;
  let client: any, original: any, newer: any, doc: any;

  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    app = express();
    app.use(express.json());
    // The in-memory session actor is injected for CI only; no live staging
    // credentials, data or production users are involved.
    app.use((req: any, _res: any, next: any) => {
      req.isAuthenticated = () => Boolean(current);
      req.user = current ? { ...current, claims: { sub: current.id } } : null;
      req.dbUser = current;
      next();
    });
    server = await registerRoutes(app);
    // Use authentic role defaults: '*' is NOT an RBAC wildcard.
    const createUser = async (role: string, masterBrokerId?: string) =>
      storage.createUser({
        email: `p0-origin-${randomUUID()}@ci.example`, firstName: role,
        lastName: "Test", role, isActive: true, status: "active",
        ...(masterBrokerId ? { masterBrokerId } : {}),
      } as any);
    oldMaster = await createUser("master_broker");
    newMaster = await createUser("master_broker");
    broker = await createUser("broker", newMaster.id); // Moved from old Master
    sibling = await createUser("broker", newMaster.id);
    admin = await createUser("admin");

    client = await storage.createClient({
      type: "persona_moral", brokerId: broker.id,
      businessName: `Cliente P0 ${randomUUID()}`,
    } as any);
    original = await storage.createCredit({
      clientId: client.id, brokerId: broker.id,
      originMasterBrokerId: oldMaster.id, amount: "100000.00", status: "approved",
      finalProposal: {
        interestRate: 24, commissionRates: {
          broker: { apertura: "1.8" }, financiera: { apertura: "3.0" },
        }, platformMargin: 2500, sobretasa: 4,
      },
    } as any);
    newer = await storage.createCredit({
      clientId: client.id, brokerId: sibling.id,
      originMasterBrokerId: newMaster.id, amount: "90000.00", status: "approved",
    } as any);
    doc = await storage.createDocument({
      clientId: client.id, creditId: original.id, brokerId: broker.id,
      uploadedBy: broker.id, type: "ine", fileName: "p0.pdf",
      filePath: "/nonexistent-p0-ci-only.pdf", fileSize: 128,
      mimeType: "application/pdf",
    } as any);
  });

  afterAll(async () => {
    current = null;
    cron.getTasks().forEach((task: any) => task.stop());
    if (server && (server as any).listening) {
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
    try { await pool.end(); } catch {}
  });

  beforeEach(() => { current = null; });

  it("former Master READs old credit, not the new Master's credit", async () => {
    current = oldMaster;
    const res = await request(app).get("/api/credits");
    expect(res.status).toBe(200);
    expect(res.body.some((c: any) => c.id === original.id)).toBe(true);
    expect(res.body.some((c: any) => c.id === newer.id)).toBe(false);
  });

  it("new Master cannot inherit old credit via moved Broker or client scope", async () => {
    current = newMaster;
    const all = await request(app).get("/api/credits");
    expect(all.status).toBe(200);
    expect(all.body.some((c: any) => c.id === original.id)).toBe(false);
    expect(all.body.some((c: any) => c.id === newer.id)).toBe(true);
    const byClient = await request(app).get(`/api/credits/client/${client.id}`);
    expect(byClient.status).toBe(200);
    expect(byClient.body.some((c: any) => c.id === original.id)).toBe(false);
  });

  it("other Broker cannot list or edit a moved Broker's historical credit", async () => {
    current = sibling;
    const all = await request(app).get("/api/credits");
    expect(all.status).toBe(200);
    expect(all.body.some((c: any) => c.id === original.id)).toBe(false);
    const edit = await request(app).put(`/api/credits/${original.id}`).send({purpose:"intrusion"});
    expect(edit.status).toBe(403);
  });

  it("former and new Masters cannot mutate Broker-owned old credit", async () => {
    for (const master of [oldMaster,newMaster]) {
      current = master;
      const res = await request(app).put(`/api/credits/${original.id}`).send({purpose:"no"});
      expect(res.status).toBe(403);
    }
  });

  it("original Broker may edit own operation, with economics redacted in HTTP", async () => {
    current = broker;
    const res = await request(app).put(`/api/credits/${original.id}`)
      .send({ purpose: "Capital de trabajo" });
    expect(res.status).toBe(200);
    expect(res.body.purpose).toBe("Capital de trabajo");
    expect(res.body.finalProposal.commissionRates).toBeUndefined();
    expect(res.body.finalProposal.sobretasa).toBeUndefined();
    expect(res.body.finalProposal.platformMargin).toBeUndefined();
    const persisted = await storage.getCredit(original.id);
    expect((persisted?.finalProposal as any)?.commissionRates?.broker?.apertura).toBe("1.8");
  });

  it("non-Super roles never receive frozen internal economics on credit lists", async () => {
    for (const actor of [oldMaster,broker,admin]) {
      current = actor;
      const res = await request(app).get("/api/credits");
      expect(res.status).toBe(200);
      const c = res.body.find((x: any) => x.id === original.id);
      expect(c).toBeDefined();
      expect(c.finalProposal.commissionRates).toBeUndefined();
      expect(c.finalProposal.sobretasa).toBeUndefined();
      expect(c.finalProposal.platformMargin).toBeUndefined();
    }
  });

  it("historic Master may list its linked documents, new Master and sibling cannot", async () => {
    current = oldMaster;
    const old = await request(app).get(`/api/documents/client/${client.id}`);
    expect(old.status).toBe(200);
    expect(old.body.some((x: any) => x.id === doc.id)).toBe(true);
    for (const actor of [newMaster,sibling]) {
      current = actor;
      const r = await request(app).get(`/api/documents/client/${client.id}`);
      expect([200,403]).toContain(r.status);
      if (r.status === 200) expect(r.body.some((x: any) => x.id === doc.id)).toBe(false);
    }
  });

  it("download denied at authorization boundary before file storage for new Master", async () => {
    current = newMaster;
    const download = await request(app).get(`/api/documents/${doc.id}/download`);
    expect(download.status).toBe(403);
    const inline = await request(app).get(`/api/documents/${doc.id}/file`);
    expect(inline.status).toBe(403);
  });
});
