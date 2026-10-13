import pg from "pg";
import { DbStorage } from "../../server/dbStorage";
import { assertSafeIsolatedTestDatabase } from "../testDbSafety";

const url = process.env.TEST_DATABASE_URL;
if (url) assertSafeIsolatedTestDatabase(url);
const describePg = url ? describe : describe.skip;
const update = (masterBrokerId: string, newRates: Record<string, unknown>, changedBy = masterBrokerId) =>
  DbStorage.prototype.updateNetworkRatesWithVersionAtomic({ masterBrokerId, newRates, changedBy });

describePg("COM-27 Master Broker network rates: atomic contractual publication", () => {
  let pgPool: pg.Pool;
  beforeAll(async () => {
    pgPool = new pg.Pool({ connectionString: url });
    await pgPool.query("DROP TABLE IF EXISTS legal_document_versions CASCADE");
    await pgPool.query("DROP TABLE IF EXISTS users CASCADE");
    await pgPool.query(`CREATE TABLE users (
      id varchar PRIMARY KEY, role varchar NOT NULL, brand_name varchar,
      first_name varchar, last_name varchar,
      network_commission_rates jsonb DEFAULT '{}'::jsonb,
      updated_at timestamp DEFAULT now()
    )`);
    await pgPool.query(`CREATE TABLE legal_document_versions (
      id varchar PRIMARY KEY, document varchar(64) NOT NULL, title varchar(255) NOT NULL,
      version varchar(32) NOT NULL, source_file varchar(255) NOT NULL,
      content text NOT NULL, content_sha256 varchar(64) NOT NULL,
      effective_at timestamp, created_at timestamp DEFAULT now() NOT NULL
    )`);
  });
  afterAll(async () => { await pgPool?.end(); });
  beforeEach(async () => {
    await pgPool.query("DELETE FROM legal_document_versions");
    await pgPool.query("DELETE FROM users");
    await pgPool.query(`INSERT INTO users(id,role,brand_name,network_commission_rates)
      VALUES ('master-one','master_broker','Master Uno','{}'::jsonb),
             ('master-two','master_broker','Master Dos','{}'::jsonb),
             ('broker-one','broker',null,'{}'::jsonb)`);
  });
  async function state(masterId = "master-one") {
    const user = await pgPool.query("SELECT network_commission_rates AS rates FROM users WHERE id=$1",[masterId]);
    const docs = await pgPool.query(
      "SELECT id,version,content,content_sha256 FROM legal_document_versions WHERE id LIKE $1 ORDER BY version",
      [`comisiones-red:${masterId}:%`]
    );
    return { rates:user.rows[0].rates, versions:docs.rows };
  }

  it("persists one Master-scoped immutable version and the rates together", async () => {
    const newRates = { instA: { apertura: 1.5, sobretasa: 0, renovacion: 1 } };
    const result = await update("master-one",newRates);
    expect(result.changed).toBe(true);
    expect(result.version?.version).toBe("net-1.0");
    const current = await state();
    expect(current.rates).toEqual(newRates);
    expect(current.versions).toHaveLength(1);
    expect(current.versions[0].content_sha256).toBe(result.version?.contentSha256);
    expect(current.versions[0].content).toContain('"versionData"');
    expect((await state("master-two")).versions).toHaveLength(0);
  });

  it("rolls back version and rate update on immutable-document write failure", async () => {
    await pgPool.query(`CREATE FUNCTION fail_network_doc() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'injected network publication failure'; END $$`);
    await pgPool.query(`CREATE TRIGGER fail_network_doc_trigger BEFORE INSERT ON legal_document_versions
      FOR EACH ROW EXECUTE FUNCTION fail_network_doc()`);
    try {
      await expect(update("master-one",{ instA:{apertura:1.5} }))
        .rejects.toThrow(/injected network publication failure/);
      expect((await state()).rates).toEqual({});
      expect((await state()).versions).toHaveLength(0);
    } finally {
      await pgPool.query("DROP TRIGGER fail_network_doc_trigger ON legal_document_versions");
      await pgPool.query("DROP FUNCTION fail_network_doc()");
    }
  });

  it("serializes concurrent distinct updates and generates consecutive versions", async () => {
    const results = await Promise.all([
      update("master-one",{ instA:{apertura:1} }),
      update("master-one",{ instA:{apertura:2} }),
    ]);
    expect(results.map(x=>x.version?.version).sort()).toEqual(["net-1.0","net-2.0"]);
    const current = await state();
    expect(current.versions.map(x=>x.version)).toEqual(["net-1.0","net-2.0"]);
    expect([1,2]).toContain(current.rates.instA.apertura);
  });

  it("returns idempotent no-op for concurrent identical economic rates", async () => {
    const payload = {instA:{apertura:1,updatedAt:"2026-10-12T00:00:00Z"}};
    const results = await Promise.all([
      update("master-one",payload),
      update("master-one",{instA:{apertura:1,updatedAt:"2026-10-13T00:00:00Z"}}),
    ]);
    expect(results.filter(x=>x.changed)).toHaveLength(1);
    expect((await state()).versions).toHaveLength(1);
  });

  it("rejects attempts to apply network rates through another identity or a Broker account", async () => {
    await expect(update("master-one",{instA:{apertura:1}},"master-two"))
      .rejects.toThrow("NETWORK_RATES_INVALID_INPUT");
    await expect(update("broker-one",{instA:{apertura:1}}))
      .rejects.toThrow("NETWORK_RATES_MASTER_NOT_FOUND");
    expect((await state()).versions).toHaveLength(0);
  });
});
