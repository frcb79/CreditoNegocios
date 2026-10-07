import express from "express";
import { createHash } from "node:crypto";
import catalog from "../../server/legalDocumentCatalog.json";
import { getPublishedLegalDocument } from "../../server/legalDocuments";
import { registerLegalRoutes } from "../../server/legalRoutes";

const request = require("supertest");
const afterPublication = new Date("2026-10-07T12:00:00Z");
// Fingerprints of the approved V1.0 source; future versions must be appended.
const approvedFingerprints: Record<string, string> = {
  "convenio:1.0": "8da70ad24e725d7d9e1a15dee77b6058f6e2a41ea6fe996ab3d3e1cf6400824a",
  "reglas-red:1.0": "0b63f36bbefc7e94cb35be0fd98816c4773f1409b576b83769cebdd5f879014c",
  "reglas-master:1.0": "d7f3aca19b76f7b551a2a3f6df623bd9f236513a15c8410be4d9eaea4cc56760",
  "terminos:1.0": "e2ec998a066e702a43ee0f69dbadce692a5dac6171774254664d372423f1f2eb",
  "aviso:1.0": "66b082fab14d3aded2362796ded41f88b6ee71e2452208f024c48e16f1416efd"
};

describe("Approved legal documents and public read-only routes", () => {
  afterEach(() => jest.useRealTimers());

  it("preserves each approved source and its content fingerprint", () => {
    expect(new Set(catalog.map((entry) => entry.id)).size).toBe(catalog.length);
    for (const [id, digest] of Object.entries(approvedFingerprints)) {
      expect(catalog.find((entry) => entry.id === id)?.contentSha256).toBe(digest);
    }
    for (const entry of catalog) {
      expect(entry.id).toBe(`${entry.document}:${entry.version}`);
      expect(createHash("sha256").update(entry.content).digest("hex")).toBe(entry.contentSha256);
    }
  });

  it.each(["terminos", "aviso"])("resolves %s by its exact version and declines unknown versions", (slug) => {
    const current = getPublishedLegalDocument(slug, undefined, afterPublication);
    expect(current?.id).toBe(`${slug}:1.0`);
    expect(getPublishedLegalDocument(slug, "1.0", afterPublication)).toBe(current);
    expect(getPublishedLegalDocument(slug, "2.0", afterPublication)).toBeUndefined();
    expect(Object.isFrozen(current)).toBe(true);
  });

  it("does not publish a future version, including when explicitly requested", () => {
    const beforePublication = new Date("2026-10-06T05:59:59Z");
    expect(getPublishedLegalDocument("terminos", undefined, beforePublication)).toBeUndefined();
    expect(getPublishedLegalDocument("aviso", "1.0", beforePublication)).toBeUndefined();
    expect(getPublishedLegalDocument("aviso", "1.0", new Date("2026-10-06T06:00:00Z"))).toBeDefined();
  });

  it("does not expose Broker or Master templates through the public resolver", () => {
    for (const slug of ["convenio", "reglas-red", "reglas-master", "desconocido"]) {
      expect(getPublishedLegalDocument(slug, "1.0", afterPublication)).toBeUndefined();
    }
  });

  it("serves terms and privacy without authentication or a database", async () => {
    jest.useFakeTimers({ now: afterPublication, doNotFake: ["nextTick", "setImmediate"] });
    const app = express();
    registerLegalRoutes(app);
    for (const slug of ["terminos", "aviso"]) {
      const response = await request(app).get(`/api/legal/${slug}?version=1.0`).expect(200);
      expect(response.body.id).toBe(`${slug}:1.0`);
      expect(response.headers.etag).toBeDefined();
      expect(response.headers["set-cookie"]).toBeUndefined();
    }
    await request(app).post("/api/legal/terminos").expect(404);
  });

  it("returns errors for unknown, private or malformed requests", async () => {
    jest.useFakeTimers({ now: afterPublication, doNotFake: ["nextTick", "setImmediate"] });
    const app = express();
    registerLegalRoutes(app);
    for (const path of ["convenio", "reglas-master", "aviso?version=9.0", "desconocido"]) {
      await request(app).get(`/api/legal/${path}`).expect(404);
    }
    await request(app).get("/api/legal/aviso?version=1.0&version=2.0").expect(400);
    await request(app).get("/api/legal/aviso?version=").expect(400);
  });
});
