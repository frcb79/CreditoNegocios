import pg from "pg";
import { db } from "../../server/db";
import { desc, eq } from "drizzle-orm";
import {
  commercialConfigurations, commercialConfigAuditLogs, legalDocumentVersions,
  DEFAULT_COMMERCIAL_RULES_CONFIG,
} from "../../shared/schema";
import { DrizzleCommercialConfigStorage } from "../../server/commercialConfigService";
import { assertSafeIsolatedTestDatabase } from "../testDbSafety";

const url = process.env.TEST_DATABASE_URL;
if (url) assertSafeIsolatedTestDatabase(url);
const describePg = url ? describe : describe.skip;

describePg("COM-27: commercial config and immutable version atomic PostgreSQL publication", () => {
  let pool: pg.Pool;
  const store = new DrizzleCommercialConfigStorage(db);

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url });
    // All destructive fixtures are restricted to a validated, isolated PostgreSQL.
    await pool.query("DROP TABLE IF EXISTS commercial_config_audit_logs CASCADE");
    await pool.query("DROP TABLE IF EXISTS commercial_configurations CASCADE");
    await pool.query("DROP TABLE IF EXISTS legal_document_versions CASCADE");
    await pool.query(`CREATE TABLE commercial_configurations (
      id varchar PRIMARY KEY,
      active_relationship_validity_days integer NOT NULL DEFAULT 90,
      initial_opportunity_hold_days integer NOT NULL DEFAULT 7,
      opportunity_inactivity_protection_days integer NOT NULL DEFAULT 45,
      inbound_priority_hours integer NOT NULL DEFAULT 48,
      renewal_window_days_before_maturity integer NOT NULL DEFAULT 180,
      renewal_originator_priority_days integer NOT NULL DEFAULT 15,
      broker_election_token_validity_hours integer NOT NULL DEFAULT 72,
      updated_by varchar, updated_at timestamp DEFAULT now()
    )`);
    await pool.query(`CREATE TABLE commercial_config_audit_logs (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      parameter_key varchar NOT NULL, previous_value varchar NOT NULL,
      new_value varchar NOT NULL, changed_by varchar,
      change_reason text, created_at timestamp DEFAULT now() NOT NULL
    )`);
    await pool.query(`CREATE TABLE legal_document_versions (
      id varchar PRIMARY KEY, document varchar(64) NOT NULL, title varchar(255) NOT NULL,
      version varchar(32) NOT NULL, source_file varchar(255) NOT NULL,
      content text NOT NULL, content_sha256 varchar(64) NOT NULL,
      effective_at timestamp, created_at timestamp DEFAULT now() NOT NULL
    )`);
  });
  afterAll(async () => { await pool?.end(); });
  beforeEach(async () => {
    await pool.query("DELETE FROM commercial_config_audit_logs");
    await pool.query("DELETE FROM legal_document_versions");
    await pool.query("DELETE FROM commercial_configurations");
  });

  async function state() {
    const config = await db.select().from(commercialConfigurations);
    const versions = await db.select().from(legalDocumentVersions)
      .orderBy(desc(legalDocumentVersions.version));
    const audits = await db.select().from(commercialConfigAuditLogs);
    return { config, versions, audits };
  }

  it("publishes rules, full metadata/hash and audit in one commit", async () => {
    const result = await store.updateConfigWithVersionAtomic(
      { activeRelationshipValidityDays: 105 }, null, "Cambio material validado"
    );
    expect(result.modifiedParams).toEqual(["activeRelationshipValidityDays"]);
    expect(result.publishedVersion?.version).toBe("1.1");
    const stored = await state();
    expect(stored.config).toHaveLength(1);
    expect(stored.config[0].activeRelationshipValidityDays).toBe(105);
    expect(stored.versions).toHaveLength(1);
    expect(stored.versions[0].contentSha256).toBe(result.publishedVersion?.contentSha256);
    expect(stored.versions[0].content).toContain('"versionData"');
    expect(stored.audits).toHaveLength(1);
    expect(stored.audits[0].previousValue).toBe("90");
    expect(stored.audits[0].newValue).toBe("105");
  });

  it("rolls back ALL side effects if document publication fails", async () => {
    await pool.query(`CREATE FUNCTION fail_commercial_document() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'forced document publication error'; END $$`);
    await pool.query(`CREATE TRIGGER fail_commercial_document_trigger
      BEFORE INSERT ON legal_document_versions FOR EACH ROW EXECUTE FUNCTION fail_commercial_document()`);
    try {
      await expect(store.updateConfigWithVersionAtomic({
        activeRelationshipValidityDays: 112,
      })).rejects.toThrow(/forced document publication error/);
      const stored = await state();
      expect(stored.config).toHaveLength(0);
      expect(stored.versions).toHaveLength(0);
      expect(stored.audits).toHaveLength(0);
    } finally {
      await pool.query("DROP TRIGGER fail_commercial_document_trigger ON legal_document_versions");
      await pool.query("DROP FUNCTION fail_commercial_document()");
    }
  });

  it("rolls back the rules AND document if audit recording fails", async () => {
    await pool.query(`CREATE FUNCTION fail_commercial_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'forced commercial audit error'; END $$`);
    await pool.query(`CREATE TRIGGER fail_commercial_audit_trigger
      BEFORE INSERT ON commercial_config_audit_logs FOR EACH ROW EXECUTE FUNCTION fail_commercial_audit()`);
    try {
      await expect(store.updateConfigWithVersionAtomic({
        initialOpportunityHoldDays: 9,
      })).rejects.toThrow(/forced commercial audit error/);
      const stored = await state();
      expect(stored.config).toHaveLength(0);
      expect(stored.versions).toHaveLength(0);
      expect(stored.audits).toHaveLength(0);
    } finally {
      await pool.query("DROP TRIGGER fail_commercial_audit_trigger ON commercial_config_audit_logs");
      await pool.query("DROP FUNCTION fail_commercial_audit()");
    }
  });

  it("serializes two updates into separate versions and retains both rule changes", async () => {
    const results = await Promise.all([
      store.updateConfigWithVersionAtomic({ activeRelationshipValidityDays: 115 }),
      store.updateConfigWithVersionAtomic({ initialOpportunityHoldDays: 11 }),
    ]);
    expect(results.map(r => r.publishedVersion?.version).sort()).toEqual(["1.1", "1.2"]);
    const saved = await state();
    expect(saved.config).toHaveLength(1);
    expect(saved.config[0].activeRelationshipValidityDays).toBe(115);
    expect(saved.config[0].initialOpportunityHoldDays).toBe(11);
    expect(saved.versions.map(v => v.version).sort()).toEqual(["1.1", "1.2"]);
    expect(saved.audits).toHaveLength(2);
  });

  it("does not create a document/audit on a no-op", async () => {
    const noOp = await store.updateConfigWithVersionAtomic({
      activeRelationshipValidityDays: DEFAULT_COMMERCIAL_RULES_CONFIG.activeRelationshipValidityDays,
    });
    expect(noOp.modifiedParams).toHaveLength(0);
    expect(noOp.publishedVersion).toBeNull();
    const saved = await state();
    expect(saved.versions).toHaveLength(0);
    expect(saved.audits).toHaveLength(0);
  });
});
