// Staging-only RLS guard: no production DB access or record writes.
const { TABLES, assertStagingRailwayEnvironment, analyzeCatalog } =
  require("../../scripts/staging-rls-hardening.cjs");

describe("Railway staging RLS hardening safety guard", () => {
  const allowed = {
    RAILWAY_ENVIRONMENT_NAME: "staging",
    RAILWAY_ENVIRONMENT_ID: "e3134695-aaec-41e2-8622-41e3701ed985",
    DATABASE_URL: "postgresql://ci:ci@postgres.railway.internal:5432/staging_db"
  };
  it("covers precisely the nine audited commercial tables", () => {
    expect(TABLES).toHaveLength(9);
    expect(new Set(TABLES).size).toBe(9);
    expect(TABLES).toContain("origin_attribution_reviews");
    expect(TABLES).toContain("commercial_resource_topics");
  });
  it("refuses production, wrong environment ID, other databases and malformed URLs", () => {
    expect(() => assertStagingRailwayEnvironment(allowed)).not.toThrow();
    for (const changed of [
      { RAILWAY_ENVIRONMENT_NAME: "production" },
      { RAILWAY_ENVIRONMENT_ID: "ef78e3eb-2937-4c51-8fed-771d78240773" },
      { DATABASE_URL: "postgresql://ci:ci@db.supabase.co:5432/prod" },
      { DATABASE_URL: "malformed" },
    ]) {
      expect(() => assertStagingRailwayEnvironment({...allowed, ...changed})).toThrow("STAGING_RLS_GUARD");
    }
  });
  it("prevents RLS changes when a table is missing or the backend cannot bypass it", () => {
    const rows = TABLES.map((name: string) => ({name, rls_enabled:false, owner:"postgres",
      db_role:"postgres", is_superuser:true, bypasses_rls:true,
      can_select:true, can_insert:true, can_update:true, can_delete:true}));
    const ok = analyzeCatalog(rows);
    expect(ok).toMatchObject({ missing:[], unsafeOwner:[], noAccess:[], enabled:0, total:9 });
    expect(analyzeCatalog(rows.slice(1)).missing).toContain(TABLES[0]);
    const withoutPrivilege = rows.map((r: (typeof rows)[number], i: number)=>i? r : {...r, can_update:false});
    expect(analyzeCatalog(withoutPrivilege).noAccess).toContain(TABLES[0]);
    const unsafe = rows.map((r: (typeof rows)[number], i: number)=>i? r : {...r,owner:"somebody",
      is_superuser:false,bypasses_rls:false});
    expect(analyzeCatalog(unsafe).unsafeOwner).toContain(TABLES[0]);
  });
});
