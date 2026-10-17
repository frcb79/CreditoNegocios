import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import express from "express";
// @ts-ignore
import request from "supertest";
import cron from "node-cron";
import { storage } from "../../server/storage";
import { registerRoutes } from "../../server/routes";
import { validateBeneficiaryPayoutDocuments } from "../../server/commissionDocumentValidationService";
import { pool } from "../../server/db";

describe("PAG-01 expediente personal Broker/Master con aislamiento", () => {
  let app: express.Express;
  let server: Server;
  let user: any = null;
  const createUser = (role: string) => storage.createUser({
    email: `exp-${randomUUID()}@example.com`, role,
    firstName: "Usuario", lastName: "Prueba", status: "active", isActive: true,
  } as any);
  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    app = express(); app.use(express.json());
    app.use((req: any, _res, next) => {
      req.isAuthenticated = () => Boolean(user);
      req.user = user ? { ...user, claims: { sub: user.id } } : null;
      req.dbUser = user;
      next();
    });
    server = await registerRoutes(app);
  });
  afterAll(async () => {
    cron.getTasks().forEach((task: any) => task.stop());
    if (server?.listening) await new Promise<void>(resolve => server.close(() => resolve()));
    try { await pool.end(); } catch (_) {}
  });
  beforeEach(() => { user = null; });

  it("solo acepta Broker/Master autenticados y oculta expedientes de otros beneficiarios", async () => {
    const broker = await createUser("broker");
    const master = await createUser("master_broker");
    const doc = await storage.createDocument({
      brokerId: broker.id, uploadedBy: broker.id, type: "ine",
      fileName: "ine.pdf", filePath: "/uploads/nonexistent-private.pdf",
      extractedData: { status: "pending" },
    } as any);
    expect((await request(app).get("/api/broker/profile-documents")).status).toBe(401);
    user = master;
    const mine = await request(app).get("/api/broker/profile-documents");
    expect(mine.status).toBe(200);
    expect(mine.body.documents.some((x: any) => x.id === doc.id)).toBe(false);
    expect((await request(app).delete(`/api/broker/profile-documents/${doc.id}`)).status).toBe(403);
    expect((await request(app).get(`/api/broker/profile-documents/${doc.id}/download`)).status).toBe(403);
    expect(await storage.getDocument(doc.id)).toBeDefined();
  });

  it("permite cargar INE propia, no confiar en brokerId externo, y marca pendiente", async () => {
    const broker = await createUser("broker");
    const other = await createUser("broker");
    user = broker;
    const res = await request(app).post("/api/broker/profile-documents")
      .field("type", "ine").field("brokerId", other.id)
      .attach("file", Buffer.from("%PDF-1.4\nprueba"), { filename: "ine.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(201);
    const doc = await storage.getDocument(res.body.document.id);
    expect(doc?.brokerId).toBe(broker.id);
    expect(doc?.isValid).toBe(false);
    expect((doc?.extractedData as any)?.status).toBe("pending");
    const list = await request(app).get("/api/broker/profile-documents");
    expect(list.body.documents.find((x: any) => x.id === doc?.id)?.filePath).toBeUndefined();
    user = other;
    expect((await request(app).get("/api/broker/profile-documents")).body.documents.some((x: any) => x.id === doc?.id)).toBe(false);
  });

  it("reemplazo de CSF invalida aprobación anterior, preserva identidad y exige nueva revisión", async () => {
    user = await createUser("master_broker");
    const previous = await storage.createDocument({
      brokerId: user.id, uploadedBy: user.id, type: "csf",
      fileName: "vieja.pdf", filePath: "/uploads/older-document.pdf",
      isValid: true, extractedData: { status: "approved", reviewedBy: "super-admin", reviewRole: "super_admin" },
    } as any);
    const response = await request(app).post("/api/broker/profile-documents")
      .field("type", "csf")
      .attach("file", Buffer.from("%PDF-1.4\nreemplazo"), { filename: "nueva.pdf", contentType: "application/pdf" });
    expect(response.status).toBe(200);
    expect(response.body.document.id).toBe(previous.id);
    const updated = await storage.getDocument(previous.id);
    expect(updated?.fileName).toBe("nueva.pdf");
    expect(updated?.isValid).toBe(false);
    expect((updated?.extractedData as any)?.reviewedBy).toBeNull();
    const payout = await validateBeneficiaryPayoutDocuments(user.id, storage);
    expect(payout.documents.csf.status).toBe("pending");
  });

  it("documentos de clientes no acreditan el expediente personal del beneficiario", async () => {
    user = await createUser("broker");
    await storage.createDocument({
      brokerId: user.id, uploadedBy: user.id, clientId: "test-client",
      type: "ine", fileName: "cliente.pdf", filePath: "/uploads/test-client.pdf",
      isValid: true, extractedData: { status: "approved", reviewedBy: "superadmin" },
    } as any);
    const payout = await validateBeneficiaryPayoutDocuments(user.id, storage);
    expect(payout.documents.ine.status).toBe("missing");
    expect((await request(app).get("/api/broker/profile-documents")).body.documents).toEqual([]);
  });
});
