import { randomUUID } from "node:crypto";
import express from "express";
// @ts-ignore — supertest types are provided by runtime test tooling.
import request from "supertest";
import { storage } from "../../server/storage";
import { registerLegalRoutes } from "../../server/legalRoutes";
import { getApprovedLegalDocument } from "../../server/legalDocuments";
import type { User } from "../../shared/schema";

describe("Admin legal evidence — exclusive Super Admin and immutable history", () => {
  let app: express.Express;
  let acting: User | null = null;
  let sa: User, admin: User, broker: User, master: User, other: User;
  let brokerAgreementId: string;

  beforeAll(async () => {
    const make = (role: string, firstName: string) => storage.createUser({
      email: `legal-admin-${role}-${randomUUID()}@example.test`,
      firstName, lastName: "QA", role, isActive: true, status: "active",
    } as any);
    [sa, admin, broker, master, other] = await Promise.all([
      make("super_admin","Supervisor"), make("admin","Admin"),
      make("broker","Broker"), make("master_broker","Master"), make("broker","Otro"),
    ]);
    const agreement = getApprovedLegalDocument("convenio", "1.0")!;
    const rules = getApprovedLegalDocument("reglas-red", "1.0")!;
    const add = async (user: User, doc: typeof agreement) => storage.createLegalAcceptance({
      userId: user.id, userName: [user.firstName,user.lastName].join(" "),
      userEmail: user.email!, documentId: doc.id, document: doc.document,
      version: doc.version, contentSha256: doc.contentSha256,
      acceptanceType: doc.document === "convenio" ? "accept_convenio" : "accept_reglas_red",
      ipAddress: "127.0.0.1", userAgent: "QA-test",
      acceptedAt: new Date("2026-10-19T12:00:00Z"),
    } as any);
    brokerAgreementId = (await add(broker,agreement)).id;
    await add(broker,rules);
    await add(master,agreement); // Master remains incomplete: still needs two rules.

    app = express();
    app.use(express.json());
    app.use((req: any,_res,next) => {
      req.isAuthenticated = () => Boolean(acting);
      req.user = acting ? { ...acting, claims: { sub: acting.id } } : null;
      req.dbUser = acting;
      next();
    });
    registerLegalRoutes(app);
  });
  afterEach(() => { acting = null; });

  it("allows only actual Super Admin for global legal lookup", async () => {
    const overview = "/api/admin/legal/users/overview";
    expect((await request(app).get(overview)).status).toBe(401);
    for(const account of [admin,broker,master]) {
      acting = account;
      expect((await request(app).get(overview)).status).toBe(403);
      expect((await request(app).get(`/api/admin/legal/users/${broker.id}/acceptances`)).status).toBe(403);
      expect((await request(app).get(`/api/admin/legal/users/${broker.id}/acceptances/${brokerAgreementId}`)).status).toBe(403);
      expect((await request(app).get(`/api/admin/legal/users/${broker.id}/acceptances/${brokerAgreementId}/comprobante`)).status).toBe(403);
    }
  });
  it("lists Broker complete and Master incomplete with no private credentials", async () => {
    acting = sa;
    const response = await request(app).get("/api/admin/legal/users/overview");
    expect(response.status).toBe(200);
    const own = response.body.users.find((u: any) => u.userId === broker.id);
    const masterStatus = response.body.users.find((u: any) => u.userId === master.id);
    expect(own.status).toBe("formalized");
    expect(own.requiredDocuments).toEqual(["convenio","reglas-red"]);
    expect(own.acceptedDocuments).toEqual(["convenio","reglas-red"]);
    expect(masterStatus.status).toBe("pending");
    expect(masterStatus.requiredDocuments).toHaveLength(3);
    expect(JSON.stringify(response.body)).not.toContain(broker.email);
    expect(JSON.stringify(response.body)).not.toContain("password");
  });
  it("reads ONLY selected user's immutable historical evidence and exports PDF", async () => {
    acting = sa;
    const endpoint = `/api/admin/legal/users/${broker.id}/acceptances`;
    const list = await request(app).get(endpoint);
    expect(list.status).toBe(200);
    expect(list.headers["cache-control"]).toBe("private, no-store");
    expect(list.body.acceptances).toHaveLength(2);
    expect(list.body.formalization.status).toBe("formalized");
    expect(list.body.user.password).toBeUndefined();
    const detail = await request(app).get(endpoint + "/" + brokerAgreementId);
    expect(detail.status).toBe(200);
    expect(detail.body.acceptance.document).toBe("convenio");
    expect(detail.body.document.content).toContain("CONVENIO");
    expect(detail.body.acceptance.userAgent).toBe("QA-test");
    expect(detail.body.acceptance.password).toBeUndefined();
    const pdf = await request(app).get(endpoint + "/" + brokerAgreementId + "/comprobante").buffer(true).parse((res: any, callback: any) => {
      const chunks: Buffer[] = [];
      res.on("data", (data: Buffer) => chunks.push(data));
      res.on("end", () => callback(null, Buffer.concat(chunks)));
    });
    expect(pdf.status).toBe(200);
    expect(pdf.headers["content-type"]).toMatch(/application\/pdf/);
    expect(pdf.headers["cache-control"]).toBe("private, no-store");
    expect((pdf.body as Buffer).subarray(0,4).toString()).toBe("%PDF");
    expect((await storage.getLegalAcceptanceById(brokerAgreementId))?.id).toBe(brokerAgreementId);
  });
  it("cannot use a valid acceptance ID to fetch another account's evidence", async () => {
    acting = sa;
    const otherEndpoint = `/api/admin/legal/users/${other.id}/acceptances/${brokerAgreementId}`;
    expect((await request(app).get(otherEndpoint)).status).toBe(404);
    expect((await request(app).get(otherEndpoint + "/comprobante")).status).toBe(404);
    expect((await request(app).get("/api/admin/legal/users/missing-account/acceptances")).status).toBe(404);
    expect((await request(app).get(`/api/admin/legal/users/${sa.id}/acceptances`)).status).toBe(400);
  });
  it("keeps original self-only detail and voucher endpoints forbidden for other users", async () => {
    acting = other;
    expect((await request(app).get(`/api/legal/my-acceptances/${brokerAgreementId}`)).status).toBe(403);
    expect((await request(app).get(`/api/legal/my-acceptances/${brokerAgreementId}/comprobante`)).status).toBe(403);
    acting = broker;
    expect((await request(app).get(`/api/legal/my-acceptances/${brokerAgreementId}`)).status).toBe(200);
  });
});
