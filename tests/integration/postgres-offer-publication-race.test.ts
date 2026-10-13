import pg from "pg";
import { eq } from "drizzle-orm";
import { DbStorage } from "../../server/dbStorage";
import { db } from "../../server/db";
import { institutionProductVersions } from "../../shared/schema";
import { computeInstitutionProductVersionHash } from "../../server/offerVersionService";
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
  });
  afterAll(async () => { await pool?.end(); });
  beforeEach(async () => {
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
});
