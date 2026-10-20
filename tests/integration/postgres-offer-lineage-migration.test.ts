import fs from "fs";
import path from "path";
import pg from "pg";
import { assertSafeIsolatedTestDatabase } from "../testDbSafety";

const testUrl = process.env.TEST_DATABASE_URL;
if (testUrl) assertSafeIsolatedTestDatabase(testUrl);
const describePg = testUrl ? describe : describe.skip;

describePg("FIN-P0 migration 0009: exact offer/version references", () => {
  let pool: pg.Pool;
  const migration = fs.readFileSync(
    path.join(process.cwd(), "migrations/0009_financial_offer_version_lineage.sql"), "utf8");
  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: testUrl });
    for (const table of ["credit_submission_targets","credits","commissions","institution_product_versions"]) {
      await pool.query(`DROP TABLE IF EXISTS public.${table} CASCADE`);
    }
    await pool.query(`CREATE TABLE public.institution_product_versions (
      institution_product_id VARCHAR NOT NULL, version_number INTEGER NOT NULL,
      UNIQUE (institution_product_id, version_number)
    )`);
    for (const table of ["credit_submission_targets","credits","commissions"]) {
      await pool.query(`CREATE TABLE public.${table} (id VARCHAR PRIMARY KEY)`);
    }
  });
  afterAll(async () => { await pool?.end(); });

  it("creates additive columns and constraints idempotently, preserving legacy NULLs", async () => {
    await pool.query(migration);
    await pool.query(migration);
    for (const table of ["credit_submission_targets","credits","commissions"]) {
      await pool.query(`INSERT INTO public.${table} (id) VALUES ($1)`, [`legacy-${table}`]);
      const { rows } = await pool.query(`SELECT institution_product_id,version_number FROM public.${table} WHERE id=$1`, [`legacy-${table}`]);
      expect(rows[0]).toEqual({ institution_product_id: null, version_number: null });
    }
  });

  it("enforces a real offer/version and rejects invented or partial references", async () => {
    await pool.query(`INSERT INTO public.institution_product_versions
      (institution_product_id,version_number) VALUES ('real-offer',2)`);
    for (const table of ["credit_submission_targets","credits","commissions"]) {
      await pool.query(`INSERT INTO public.${table} (id,institution_product_id,version_number)
        VALUES ($1,'real-offer',2)`, [`verified-${table}`]);
      await expect(pool.query(`INSERT INTO public.${table}
        (id,institution_product_id,version_number) VALUES ($1,'real-offer',NULL)`,
        [`missing-version-${table}`])).rejects.toThrow();
      await expect(pool.query(`INSERT INTO public.${table}
        (id,institution_product_id,version_number) VALUES ($1,'real-offer',3)`,
        [`invented-version-${table}`])).rejects.toThrow();
    }
  });
});
