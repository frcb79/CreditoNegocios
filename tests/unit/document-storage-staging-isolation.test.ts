import { assertDocumentStorageEnvironmentIsolated } from "../../server/documentStorage";

describe("SEC-P0-STORAGE: Staging requires a separate Supabase PROJECT", () => {
  const previousName = process.env.RAILWAY_ENVIRONMENT_NAME;
  const previousFlag = process.env.STAGING_DOCUMENT_STORAGE_ISOLATED;
  const stagingRef = "aaaaaaaaaaaaaaaaaaaa";
  const productionRef = "bbbbbbbbbbbbbbbbbbbb";
  const fakeKey = (role: string, ref: string) => {
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const claims = Buffer.from(JSON.stringify({ role, ref })).toString("base64url");
    return `${header}.${claims}.non-production-test-signature`;
  };
  const validConfig = {
    stagingProjectRef: stagingRef, productionProjectRef: productionRef,
    supabaseUrl: `https://${stagingRef}.supabase.co`,
    serviceRoleKey: fakeKey("service_role", stagingRef),
  };
  afterEach(() => {
    if (previousName === undefined) delete process.env.RAILWAY_ENVIRONMENT_NAME;
    else process.env.RAILWAY_ENVIRONMENT_NAME = previousName;
    if (previousFlag === undefined) delete process.env.STAGING_DOCUMENT_STORAGE_ISOLATED;
    else process.env.STAGING_DOCUMENT_STORAGE_ISOLATED = previousFlag;
  });
  beforeEach(() => {
    process.env.RAILWAY_ENVIRONMENT_NAME = "staging";
    process.env.STAGING_DOCUMENT_STORAGE_ISOLATED = "true";
  });

  it("blocks uploads when not explicitly approved", () => {
    delete process.env.STAGING_DOCUMENT_STORAGE_ISOLATED;
    expect(() => assertDocumentStorageEnvironmentIsolated("staging-cn", "staging-cn",validConfig))
      .toThrow("STAGING_DOCUMENT_STORAGE_NOT_ISOLATED");
  });
  it("rejects an ordinary Production bucket, even with Staging key", () => {
    expect(() => assertDocumentStorageEnvironmentIsolated("documents", "documents",validConfig))
      .toThrow("STAGING_DOCUMENT_STORAGE_NOT_ISOLATED");
  });
  it("rejects cross-bucket access and historical Production file references", () => {
    expect(() => assertDocumentStorageEnvironmentIsolated("staging-cn", "documents",validConfig))
      .toThrow("STAGING_DOCUMENT_STORAGE_NOT_ISOLATED");
  });
  it("rejects Staging URL pointing to Production Supabase project", () => {
    expect(() => assertDocumentStorageEnvironmentIsolated("staging-cn","staging-cn",{
      ...validConfig, supabaseUrl:`https://${productionRef}.supabase.co`,
    })).toThrow("STAGING_DOCUMENT_STORAGE_NOT_ISOLATED");
  });
  it("rejects service_role key issued for Production project", () => {
    expect(() => assertDocumentStorageEnvironmentIsolated("staging-cn","staging-cn",{
      ...validConfig, serviceRoleKey: fakeKey("service_role",productionRef),
    })).toThrow("STAGING_DOCUMENT_STORAGE_NOT_ISOLATED");
  });
  it("rejects project refs that are missing, equal or malformed", () => {
    for(const config of [
      { ...validConfig, stagingProjectRef: "" },
      { ...validConfig, productionProjectRef: stagingRef },
      { ...validConfig, stagingProjectRef: "not-a-project-ref" },
    ])expect(() => assertDocumentStorageEnvironmentIsolated("staging-cn","staging-cn",config))
      .toThrow("STAGING_DOCUMENT_STORAGE_NOT_ISOLATED");
  });
  it("rejects anon keys and opaque tokens without verifiable project identity", () => {
    for(const key of [fakeKey("anon",stagingRef),"sb_secret_not_jwt","invalid"]) {
      expect(() => assertDocumentStorageEnvironmentIsolated("staging-cn","staging-cn",{
        ...validConfig,serviceRoleKey:key,
      })).toThrow("STAGING_DOCUMENT_STORAGE_NOT_ISOLATED");
    }
  });
  it("permits the separate project and matching Staging bucket after verification", () => {
    expect(() => assertDocumentStorageEnvironmentIsolated("staging-cn","staging-cn",validConfig))
      .not.toThrow();
  });
  it("leaves Production Storage behavior unchanged", () => {
    process.env.RAILWAY_ENVIRONMENT_NAME = "production";
    delete process.env.STAGING_DOCUMENT_STORAGE_ISOLATED;
    expect(() => assertDocumentStorageEnvironmentIsolated("documents","documents"))
      .not.toThrow();
  });
});
