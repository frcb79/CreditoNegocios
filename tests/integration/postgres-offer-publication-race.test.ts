import pg from "pg";
import { eq } from "drizzle-orm";
import { DbStorage } from "../../server/dbStorage";
import { db } from "../../server/db";
import { institutionProductVersions } from "../../shared/schema";
import { computeInstitutionProductVersionHash } from "../../server/offerVersionService";
import { buildOfferCommissionDocument } from "../../server/offerCommissionAcceptance";
import { acceptOfferCommission } from "../../server/offerCommissionAcceptance";
import { assertOfferCommissionAcceptanceInTransaction } from "../../server/offerCommissionTransactionalGate";
import { assertSafeIsolatedTestDatabase } from "../testDbSafety";

const testUrl = process.env.TEST_DATABASE_URL;
if (testUrl) assertSafeIsolatedTestDatabase(testUrl);
const describePg = testUrl ? describe : describe.skip;

describePg("ASTRA-07: published offer versions remain immutable under concurrent draft editing", () => {
  let pool: pg.Pool;
  const offerId = "astra-race-offer";
  const draftId = "astra-race-draft";
  const originalConditions = {
    minAmount: 10000, maxAmount: 1000000,
    minInterestRate: 10, maxInterestRate: 25,
    minTermMonths: 6, maxTermMonths: 36,
    commissionRates: {
      financiera: { apertura: 6 }, masterBroker: { apertura: 4 }, broker: { apertura: 3 },
    },
  };
  const requirements = { targetProfiles: ["persona_moral"] };
  const documents = ["INE", "CSF"];

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: testUrl, max: 5 });
    await pool.query("DROP TABLE IF EXISTS institution_product_versions CASCADE");
    await pool.query("DROP TABLE IF EXISTS institution_products CASCADE");
    await pool.query(`CREATE TABLE institution_products (
      id varchar PRIMARY KEY, template_id varchar, institution_id varchar NOT NULL,
      name varchar, custom_name varchar, product_type varchar, slug varchar,
      description text, configuration jsonb DEFAULT '{}', target_profiles text[],
      active_variables jsonb DEFAULT '{}', status varchar NOT NULL DEFAULT 'draft',
      current_version_number integer NOT NULL DEFAULT 1,
      is_active boolean DEFAULT true, created_by varchar,
      created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now()
    )`);
    await pool.query(`CREATE TABLE institution_product_versions (
      id varchar PRIMARY KEY,
      institution_product_id varchar NOT NULL REFERENCES institution_products(id),
      version_number integer NOT NULL DEFAULT 1, status varchar NOT NULL DEFAULT 'draft',
      effective_from timestamp, effective_to timestamp,
      conditions jsonb DEFAULT '{}', requirements jsonb DEFAULT '{}',
      required_documents text[] DEFAULT ARRAY[]::text[],
      variables_configuration jsonb DEFAULT '{}',
      change_reason text, version_hash varchar,
      published_at timestamp, published_by varchar, created_by varchar,
      created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now(),
      UNIQUE(institution_product_id,version_number)
    )`);
    // Dedicated synthetic PostgreSQL only. Recreate legal fixtures to avoid
    // relying on whichever migration suite ran first in the CI job.
    await pool.query("DROP TABLE IF EXISTS legal_acceptances CASCADE");
    await pool.query("DROP TABLE IF EXISTS legal_document_versions CASCADE");
    await pool.query("DROP TABLE IF EXISTS users CASCADE");
    await pool.query(`CREATE TABLE users (
      id varchar PRIMARY KEY, role varchar NOT NULL DEFAULT 'broker',
      master_broker_id varchar
    )`);
    await pool.query(`CREATE TABLE legal_document_versions (
      id varchar PRIMARY KEY, document varchar(64) NOT NULL, title varchar(255) NOT NULL,
      version varchar(32) NOT NULL, source_file varchar(255) NOT NULL,
      content text NOT NULL, content_sha256 varchar(64) NOT NULL,
      effective_at timestamp, created_at timestamp DEFAULT now() NOT NULL
    )`);
    await pool.query(`CREATE TABLE legal_acceptances (
      id varchar PRIMARY KEY,
      user_id varchar NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      user_email varchar NOT NULL, user_name varchar,
      document_id varchar NOT NULL REFERENCES legal_document_versions(id),
      document varchar(64) NOT NULL, version varchar(32) NOT NULL,
      content_sha256 varchar(64) NOT NULL, acceptance_type varchar(64) NOT NULL,
      ip_address varchar(128), user_agent text NOT NULL,
      accepted_at timestamp DEFAULT now() NOT NULL, template_sha256 varchar(64),
      personalized_sha256 varchar(64), personalized_snapshot jsonb
    )`);
  });
  afterAll(async () => { await pool?.end(); });
  beforeEach(async () => {
    await pool.query("DELETE FROM legal_acceptances");
    await pool.query("DELETE FROM users");
    await pool.query("DELETE FROM legal_document_versions");
    await pool.query("DELETE FROM institution_product_versions");
    await pool.query("DELETE FROM institution_products");
    await pool.query(`INSERT INTO institution_products
      (id,institution_id,name,product_type,status,configuration,target_profiles)
      VALUES ($1,'financial-test','Simple PYME','credito_simple','draft',$2::jsonb,$3::text[])`,
      [offerId,JSON.stringify(originalConditions),requirements.targetProfiles]);
    const hash = computeInstitutionProductVersionHash({
      institutionProductId: offerId, versionNumber: 1,
      conditions: originalConditions, requirements,
      requiredDocuments: documents, variablesConfiguration: {},
    });
    await pool.query(`INSERT INTO institution_product_versions
      (id,institution_product_id,version_number,status,conditions,requirements,
       required_documents,variables_configuration,change_reason,version_hash)
      VALUES ($1,$2,1,'draft',$3::jsonb,$4::jsonb,$5::text[],'{}'::jsonb,'Primera publicación',$6)`,
      [draftId,offerId,JSON.stringify(originalConditions),JSON.stringify(requirements),documents,hash]);
  });

  const publish = () =>
    DbStorage.prototype.publishInstitutionProductVersion(offerId,draftId,{
      changeReason:"Aprobación comercial y publicación",
    });
  const edit = (rate: number) =>
    DbStorage.prototype.updateInstitutionProductDraftAndParent(offerId,draftId,{
      conditions: {
        ...originalConditions,
        commissionRates: {
          ...originalConditions.commissionRates,
          financiera: { apertura: rate },
        },
      },
      changeReason: "Revisión del borrador",
    });
  const read = async () => {
    const [version] = await db.select().from(institutionProductVersions)
      .where(eq(institutionProductVersions.id,draftId));
    return version;
  };

  it("rejects a late edit after publishing without changing conditions or hash",async()=>{
    const committed = await publish();
    expect(committed.status).toBe("published");
    const before = await read();
    await expect(edit(7)).rejects.toThrow(/Solo las versiones en borrador|OFFER_DRAFT_ALREADY_PUBLISHED/);
    const after = await read();
    expect(after.status).toBe("published");
    expect(after.conditions).toEqual(before.conditions);
    expect(after.versionHash).toBe(before.versionHash);
  });

  it("never lets racing edit mutate a version after publication commits",async()=>{
    const results = await Promise.allSettled([edit(7),publish()]);
    const published = results[1];
    expect(published.status).toBe("fulfilled");
    const version = await read();
    expect(version.status).toBe("published");
    const expectedHash = computeInstitutionProductVersionHash({
      institutionProductId: offerId, versionNumber: 1,
      conditions: version.conditions,
      requirements: version.requirements,
      requiredDocuments: version.requiredDocuments || [],
      variablesConfiguration: version.variablesConfiguration,
    });
    expect(version.versionHash).toBe(expectedHash);
    const conditions = version.conditions;
    await expect(edit(8)).rejects.toThrow(/Solo las versiones en borrador|OFFER_DRAFT_ALREADY_PUBLISHED/);
    expect((await read()).conditions).toEqual(conditions);
  });
  async function prepareSecondDraft(nextBrokerRate: number, nextMasterRate: number) {
    await publish(); // initial publication never demands retroactive acceptance
    const nextConditions = {
      ...originalConditions,
      commissionRates: {
        ...originalConditions.commissionRates,
        broker: { apertura: nextBrokerRate },
        masterBroker: { apertura: nextMasterRate },
      },
    };
    const hash = computeInstitutionProductVersionHash({
      institutionProductId: offerId, versionNumber: 2,
      conditions: nextConditions, requirements,
      requiredDocuments: documents, variablesConfiguration: {},
    });
    await pool.query(`INSERT INTO institution_product_versions
      (id,institution_product_id,version_number,status,conditions,requirements,
       required_documents,variables_configuration,change_reason,version_hash)
      VALUES ('astra-race-v2',$1,2,'draft',$2::jsonb,$3::jsonb,$4::text[],'{}'::jsonb,'Cambio de comisión',$5)`,
      [offerId, JSON.stringify(nextConditions), JSON.stringify(requirements), documents, hash]);
  }

  it("atomic offer publication records the versioned economic document with the same hash", async () => {
    await prepareSecondDraft(3.5, 4.5);
    const storedBefore = await pool.query("SELECT * FROM institution_product_versions WHERE id = 'astra-race-draft'");
    const published = await DbStorage.prototype.publishInstitutionProductVersion(offerId, "astra-race-v2", {
      changeReason: "Cambio de comisión aprobado",
    });
    const economicDoc = buildOfferCommissionDocument({
      ...storedBefore.rows[0],
      versionNumber: 1,
      institutionProductId: offerId,
      versionHash: storedBefore.rows[0].version_hash,
      requiredDocuments: storedBefore.rows[0].required_documents,
      variablesConfiguration: storedBefore.rows[0].variables_configuration,
    } as any, published)!;
    const found = await pool.query("SELECT * FROM legal_document_versions WHERE id = $1", [economicDoc.id]);
    expect(found.rows).toHaveLength(1);
    expect(found.rows[0].content_sha256).toBe(economicDoc.contentSha256);
    expect(JSON.parse(found.rows[0].content).affected).toEqual({
      directBroker: true, masterBroker: true,
    });
    expect((await pool.query("SELECT status FROM institution_product_versions WHERE id = 'astra-race-draft'")).rows[0].status)
      .toBe("superseded");
  });

  it("serializes financial acceptance: deny without PG evidence, allow exact SHA, then deny wrong payee", async () => {
    await prepareSecondDraft(3.5, 4.5);
    await DbStorage.prototype.publishInstitutionProductVersion(offerId, "astra-race-v2", {
      changeReason: "Cambio material de cuotas",
    });
    await pool.query("INSERT INTO users (id,role) VALUES ('com28-broker','broker'),('com28-other','broker')");
    const params = {
      offerId, versionNumber: 2,
      brokerId: "com28-broker", originMasterBrokerId: null,
      financialInstitutionId: "financial-test",
    };
    const check = () => db.transaction(async tx =>
      assertOfferCommissionAcceptanceInTransaction(tx, params));
    await expect(check()).rejects.toThrow("OFFER_COMMISSION_ACCEPTANCE_REQUIRED");
    // Acceptance must be durable in the SAME isolated PostgreSQL database.
    const broker = { id: "com28-broker", email: "com28@example.test", role: "broker",
      firstName: "Prueba", lastName: "PG", masterBrokerId: null } as any;
    const accepted = await acceptOfferCommission(new DbStorage(), broker, offerId, 2,
      "127.0.0.1", "pg-regression");
    expect(accepted.status.accepted).toBe(true);
    await expect(check()).resolves.toBeUndefined();
    await expect(db.transaction(async tx =>
      assertOfferCommissionAcceptanceInTransaction(tx, { ...params, brokerId: "com28-other" })))
      .rejects.toThrow("OFFER_COMMISSION_ACCEPTANCE_REQUIRED");
  });

  it("network operation requires Master acceptance, not the Broker's wholesale signature", async () => {
    await prepareSecondDraft(3.5, 4.5);
    await DbStorage.prototype.publishInstitutionProductVersion(offerId, "astra-race-v2", {
      changeReason: "Cambio de condiciones pagaderas al Master",
    });
    await pool.query(`INSERT INTO users (id,role,master_broker_id)
      VALUES ('com28-master','master_broker',NULL),
             ('com28-network-broker','broker','com28-master')`);
    const params = {
      offerId, versionNumber: 2, brokerId: "com28-network-broker",
      originMasterBrokerId: "com28-master", financialInstitutionId: "financial-test",
    };
    const check = () => db.transaction(async tx =>
      assertOfferCommissionAcceptanceInTransaction(tx, params));
    await expect(check()).rejects.toThrow("OFFER_COMMISSION_ACCEPTANCE_REQUIRED");
    await acceptOfferCommission(new DbStorage(), {
      id: "com28-master", role: "master_broker", email: "master@example.test",
      firstName: "Master", lastName: "QA",
    } as any, offerId, 2, null, "pg-master");
    await expect(check()).resolves.toBeUndefined();
    const evidence = await pool.query(
      "SELECT user_id, personalized_snapshot FROM legal_acceptances WHERE document='comisiones-oferta'");
    expect(evidence.rows).toHaveLength(1);
    expect(evidence.rows[0].user_id).toBe("com28-master");
    expect(evidence.rows[0].personalized_snapshot.applicableRole).toBe("master_broker");
  });

  it("tampered acceptance snapshot cannot satisfy a PostgreSQL payout/version check", async () => {
    await prepareSecondDraft(3.5, 4.5);
    await DbStorage.prototype.publishInstitutionProductVersion(offerId, "astra-race-v2", {
      changeReason: "Condiciones verificables",
    });
    await pool.query("INSERT INTO users (id,role) VALUES ('com28-broker','broker')");
    await acceptOfferCommission(new DbStorage(), {
      id: "com28-broker", role: "broker", email: "broker@example.test",
      firstName: "Broker", lastName: "QA",
    } as any, offerId, 2, null, "pg-tamper");
    const params = {
      offerId, versionNumber: 2, brokerId: "com28-broker",
      originMasterBrokerId: null, financialInstitutionId: "financial-test",
    };
    await expect(db.transaction(async tx =>
      assertOfferCommissionAcceptanceInTransaction(tx, params))).resolves.toBeUndefined();
    // Synthetic isolated fixture permits the mutation to prove the verifier
    // fails closed; real deployed tables prohibit UPDATE via immutable triggers.
    await pool.query(`UPDATE legal_acceptances SET
      personalized_snapshot = jsonb_set(personalized_snapshot, '{applicableRole}', '"master_broker"'::jsonb)
      WHERE user_id = 'com28-broker'`);
    await expect(db.transaction(async tx =>
      assertOfferCommissionAcceptanceInTransaction(tx, params)))
      .rejects.toThrow("OFFER_COMMISSION_ACCEPTANCE_REQUIRED");
  });

  it("rolls back offer publication if an immutable economic document hash conflicts", async () => {
    await prepareSecondDraft(3.5, 4.5);
    await pool.query(`INSERT INTO legal_document_versions
      (id,document,title,version,source_file,content,content_sha256)
      VALUES ($1,'comisiones-oferta','Documento adulterado','2','test','bad-document','bad-hash')`,
      [`comisiones-oferta:${offerId}:2`]);
    await expect(DbStorage.prototype.publishInstitutionProductVersion(offerId, "astra-race-v2", {
      changeReason: "Cambio de comisión con conflicto",
    })).rejects.toThrow("OFFER_COMMISSION_DOCUMENT_HASH_CONFLICT");
    const statuses = await pool.query("SELECT id,status FROM institution_product_versions WHERE institution_product_id = $1", [offerId]);
    expect(statuses.rows.find((row: any) => row.id === "astra-race-draft")?.status).toBe("published");
    expect(statuses.rows.find((row: any) => row.id === "astra-race-v2")?.status).toBe("draft");
  });

});
