import { randomUUID } from "node:crypto";
import express from "express";
// @ts-ignore runtime test dependency
import request from "supertest";
import { storage } from "../../server/storage";
import { registerBrokerDossierRoutes } from "../../server/brokerDossierRoutes";
import { confirmAccountAccess, withAccountAccess } from "../../server/accountAccess";
import { summarizeCommercialAccountActivity } from "../../server/dashboardVisibility";

describe("Broker dossier and confirmed access", () => {
  const app = express();
  let acting: any;
  let broker: any, other: any, sa: any, admin: any;
  beforeAll(async () => {
    const make = (role: string) => storage.createUser({ email: `${randomUUID()}@example.test`, role, password: "hash", firstName: role,
      profileData: { phone: "5512345678", rfc: "AAA010101AAA", resetToken: "never-return", address: { street: "Ejemplo", password: "never-return" } },
      status: "active", isActive: true } as any);
    [broker, other, sa, admin] = await Promise.all([make("broker"), make("master_broker"), make("super_admin"), make("admin")]);
    app.use((req: any, _res, next) => { req.isAuthenticated = () => Boolean(acting); req.user = acting ? { claims: { sub: acting.id } } : null; next(); });
    registerBrokerDossierRoutes(app);
    await storage.createDocument({ brokerId: broker.id, type: "ine", fileName: "identificacion.pdf", filePath: "/private/never-return", uploadedBy: broker.id } as any);
    await storage.createDocument({ brokerId: broker.id, clientId: "client-other", type: "csf", fileName: "client-only.pdf", filePath: "/private/client" } as any);
  });
  afterEach(() => { acting = null; });
  it("does not label enabled registration as confirmed first access", async () => {
    const [before] = await withAccountAccess([broker]);
    expect(before.registrationStatus).toBe("awaiting_first_access");
    expect(before.hasAccessed).toBe(false);
    expect(summarizeCommercialAccountActivity([before]).activeBrokers).toBe(0);
    await confirmAccountAccess(broker.id);
    const [after] = await withAccountAccess([broker]);
    expect(after.registrationStatus).toBe("registered");
    expect(after.hasAccessed).toBe(true);
    expect(after.firstAccessAt).toBeTruthy();
    await confirmAccountAccess(broker.id);
    expect((await withAccountAccess([broker]))[0].firstAccessAt).toBe(after.firstAccessAt);
    expect(summarizeCommercialAccountActivity([after]).activeBrokers).toBe(1);
  });
  it("restricts dossier and personal file downloads to actual Super Admin", async () => {
    const endpoint = `/api/admin/brokers/${broker.id}/dossier`;
    expect((await request(app).get(endpoint)).status).toBe(401);
    for (const actor of [admin, broker, other]) {
      acting = actor;
      expect((await request(app).get(endpoint)).status).toBe(403);
      expect((await request(app).get(`/api/admin/brokers/${broker.id}/documents/any/download`)).status).toBe(403);
    }
  });
  it("returns all dossier sections without credentials, storage paths or client files", async () => {
    acting = sa;
    const result = await request(app).get(`/api/admin/brokers/${broker.id}/dossier`);
    expect(result.status).toBe(200);
    expect(result.headers["cache-control"]).toBe("private, no-store");
    expect(result.body.documents.map((d: any) => d.fileName)).toEqual(["identificacion.pdf"]);
    expect(result.body.user.profileData.phone).toBe("5512345678");
    expect(result.body.user.hasAccessed).toBe(true);
    expect(result.body).toHaveProperty("acceptances");
    expect(result.body).toHaveProperty("activity");
    expect(JSON.stringify(result.body)).not.toMatch(/never-return|filePath|password|resetToken/);
    const own = result.body.documents[0].id;
    expect((await request(app).get(`/api/admin/brokers/${other.id}/documents/${own}/download`)).status).toBe(404);
    expect((await request(app).get(`/api/admin/brokers/${sa.id}/dossier`)).status).toBe(404);
  });
});
