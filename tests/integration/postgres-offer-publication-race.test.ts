import pg from "pg";
import { eq } from "drizzle-orm";
import { DbStorage } from "../../server/dbStorage";
import { db } from "../../server/db";
import { institutionProductVersions } from "../../shared/schema";
import { computeInstitutionProductVersionHash } from "../../server/offerVersionService";
import { buildOfferCommissionDocument } from "../../server/offerCommissionAcceptance";
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
    await pool.query(`CREATE TABLE IF NOT EXISTS legal_document_versions (
      id varchar PRIMARY KEY, document varchar(64) NOT NULL, title varchar(255) NOT NULL,
      version varchar(32) NOT NULL, source_file varchar(255) NOT NULL,
      content text NOT NULL, content_sha256 varchar(64) NOT NULL,
      effective_at timestamp, created_at timestamp DEFAULT now() NOT NULL
    )`);
  });
  afterAll(async () => { await pool?.end(); });
  beforeEach(async () => {
    await pool.query("DELETE FROM legal_document_versions WHERE document = 'comisiones-oferta' AND id LIKE $1", [`%:${offerId}:%`]);
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
