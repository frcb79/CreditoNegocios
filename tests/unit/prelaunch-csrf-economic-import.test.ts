import express from "express";
import request from "supertest";
import { rejectCrossSiteMutations } from "../../server/csrfProtection";
import { isAllowedOrigin } from "../../server/runtimeConfig";
import { blockLegacyEconomicExcelImport, blockLegacyEconomicExcelType } from "../../server/prelaunchEconomicImportGuard";

describe("SEC-P1 CSRF / version-safe Excel import gates", () => {
  const app = express();
  let mutations = 0;
  app.use(rejectCrossSiteMutations);
  app.post("/api/commissions/:id/cancel", express.urlencoded({ extended: false }), (_req, res) => {
    mutations++;
    res.json({ success: true });
  });
  app.patch("/api/commissions/:id", express.json(), (_req, res) => {
    mutations++;
    res.json({ success: true });
  });
  app.post("/api/documents", (_req, res) => { mutations++; res.json({ success: true }); });
  app.get("/api/commissions", (_req, res) => res.json([]));

  beforeEach(() => { mutations = 0; });

  it("blocks attacker cross-site HTML form with valid session cookie and no mutation", async () => {
    const response = await request(app).post("/api/commissions/one/cancel")
      .set("Origin", "https://evil.example.org").set("Cookie", "connect.sid=s%3Avalid-cookie")
      .type("form").send({ status: "cancelled" }).expect(403);
    expect(response.body.code).toBe("CSRF_ORIGIN_REJECTED");
    expect(mutations).toBe(0);
  });
  it("blocks crafted lookalike origins previously allowed by substring and Vercel suffix", async () => {
    expect(isAllowedOrigin("https://evil-creditonegocios.attacker.com")).toBe(false);
    expect(isAllowedOrigin("https://attacker.vercel.app")).toBe(false);
    await request(app).patch("/api/commissions/one").set("Origin", "https://creditonegocios-attacker.com")
      .set("Cookie", "connect.sid=valid").send({ amount: 1 }).expect(403);
    expect(mutations).toBe(0);
  });
  it("rejects missing Origin with cookie and cross-site Fetch Metadata", async () => {
    await request(app).post("/api/commissions/one/cancel").set("Cookie", "connect.sid=valid")
      .type("form").send({ status: "cancelled" }).expect(403);
    await request(app).post("/api/documents").set("Sec-Fetch-Site", "cross-site").expect(403);
    expect(mutations).toBe(0);
  });
  it("blocks multipart uploads from foreign origins before reading any body", async () => {
    await request(app).post("/api/documents").set("Origin", "https://outside.example")
      .set("Cookie", "connect.sid=valid").field("filename", "bad.txt").expect(403);
    expect(mutations).toBe(0);
  });
  it("allows legitimate first-party POST, explicit Vercel frontend and non-cookie API calls", async () => {
    await request(app).post("/api/commissions/one/cancel")
      .set("Origin", "https://creditonegocios-staging.up.railway.app")
      .set("Cookie", "connect.sid=valid").type("form").send({ ok: true }).expect(200);
    await request(app).patch("/api/commissions/one")
      .set("Origin", "https://credito-negocios-staging.vercel.app")
      .set("Cookie", "connect.sid=valid").send({ amount: 2 }).expect(200);
    await request(app).post("/api/commissions/one/cancel")
      .type("form").send({ ok: true }).expect(200);
    expect(mutations).toBe(3);
  });
  it("rejects cross-site preflights but keeps reads operational", async () => {
    await request(app).options("/api/commissions").set("Origin", "https://evil.example").expect(403);
    await request(app).get("/api/commissions").set("Origin", "https://evil.example").expect(200);
    expect(mutations).toBe(0);
  });
});

describe("SEC-P1 economic Excel fail closed", () => {
  const app = express();
  let committed = 0;
  const write = (_req: express.Request, res: express.Response) => { committed++; res.json({ imported: 1 }); };
  app.get("/api/import/template/:type", blockLegacyEconomicExcelType, write);
  app.post("/api/import/preview/:type", blockLegacyEconomicExcelType, write);
  for (const type of ["commissions", "financieras", "financieras-soc"]) {
    app.post("/api/import/" + type, blockLegacyEconomicExcelImport, write);
  }
  app.post("/api/import/clients", write);
  beforeEach(() => { committed = 0; });

  it("refuses every economic write and aliases before file parsing", async () => {
    for (const type of ["commissions", "financieras", "financieras-soc"]) {
      const response = await request(app).post("/api/import/" + type).expect(409);
      expect(response.body.code).toBe("OFFER_VERSIONED_IMPORT_REQUIRED");
    }
    expect(committed).toBe(0);
  });
  it("blocks previews/templates that disclose economic values while preserving client imports", async () => {
    for (const type of ["commissions", "comisiones", "financieras"]) {
      await request(app).get("/api/import/template/" + type).expect(409);
      await request(app).post("/api/import/preview/" + type).expect(409);
    }
    await request(app).post("/api/import/clients").expect(200);
    await request(app).post("/api/import/preview/clients").expect(200);
    expect(committed).toBe(2);
  });
});
