import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import { assertSafeIsolatedTestDatabase } from "../testDbSafety";

const url = process.env.TEST_DATABASE_URL;
if (url) assertSafeIsolatedTestDatabase(url);
const describePg = url ? describe : describe.skip;

/** MIG-01: PostgreSQL efímero únicamente; nunca apuntar a Railway ni producción. */
describePg("MIG-01 — 0004 no inventa atribución histórica de Masters", () => {
  let pool: pg.Pool;
  const migration = fs.readFileSync(
    path.resolve(process.cwd(), "migrations/0004_broker_network_transitions.sql"),
    "utf8"
  );

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url });
    // Este fixture es destructivo sólo sobre DB local de pruebas aislada y expresamente validada.
    await pool.query(`
      DROP TABLE IF EXISTS public.origin_attribution_reviews CASCADE;
      DROP VIEW IF EXISTS public.financial_institution_offers CASCADE;
      DROP TABLE IF EXISTS public.institution_product_versions CASCADE;
      DROP TABLE IF EXISTS public.app_migrations CASCADE;
      DROP TABLE IF EXISTS public.institution_products CASCADE;
      DROP TABLE IF EXISTS public.financial_institutions CASCADE;
      DROP TABLE IF EXISTS public.commercial_opportunities CASCADE;
      DROP TABLE IF EXISTS public.credit_submission_requests CASCADE;
      DROP TABLE IF EXISTS public.credits CASCADE;
      DROP TABLE IF EXISTS public.users CASCADE;
      CREATE TABLE public.users (
        id VARCHAR PRIMARY KEY,
        role VARCHAR,
        master_broker_id VARCHAR
      );
      CREATE TABLE public.credits (
        id VARCHAR PRIMARY KEY,
        broker_id VARCHAR
      );
      CREATE TABLE public.credit_submission_requests (
        id VARCHAR PRIMARY KEY,
        broker_id VARCHAR
      );
      CREATE TABLE public.commercial_opportunities (
        id VARCHAR PRIMARY KEY,
        master_broker_id VARCHAR
      );
      INSERT INTO public.users(id, role, master_broker_id) VALUES
        ('master-actual', 'master_broker', NULL),
        ('master-historico', 'master_broker', NULL),
        ('broker-historico', 'broker', 'master-actual');
      INSERT INTO public.credits(id, broker_id)
        VALUES ('credito-anterior-al-cambio', 'broker-historico');
      INSERT INTO public.credit_submission_requests(id, broker_id)
        VALUES ('solicitud-anterior-al-cambio', 'broker-historico');
    `);
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it("aborta si hay créditos/solicitudes históricas sin snapshot, en lugar de asignar Master actual", async () => {
    const connection = await pool.connect();
    try {
      await expect(connection.query(migration)).rejects.toThrow(/MIG-01/);
    } finally {
      // Si una instrucción del script falló tras BEGIN, limpiar la sesión.
      await connection.query("ROLLBACK");
      connection.release();
    }
    const existingColumns = await pool.query(`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema='public' AND column_name='origin_master_broker_id'
        AND table_name IN ('credits','credit_submission_requests')
    `);
    expect(existingColumns.rows).toHaveLength(0);
    expect((await pool.query("SELECT COUNT(*)::int AS n FROM public.credits")).rows[0].n).toBe(1);
  });

  it("migra únicamente revisiones documentadas: Master anterior en crédito y canal directo en solicitud", async () => {
    const preflight = fs.readFileSync(
      path.resolve(process.cwd(), "migrations/preflight_0004_origin_attribution_reviews.sql"),
      "utf8"
    );
    await pool.query(preflight);
    await pool.query(`
      INSERT INTO public.origin_attribution_reviews
        (record_type, record_id, channel_type, origin_master_broker_id, evidence_reference, reviewed_by)
      VALUES
        ('credits', 'credito-anterior-al-cambio', 'master_network', 'master-historico', 'fixture-contrato-fechado', 'ci-reviewer'),
        ('credit_submission_requests', 'solicitud-anterior-al-cambio', 'direct', NULL, 'fixture-directo-fechado', 'ci-reviewer');
    `);
    await pool.query(migration);
    expect((await pool.query("SELECT origin_master_broker_id FROM public.credits WHERE id='credito-anterior-al-cambio'")).rows[0].origin_master_broker_id).toBe('master-historico');
    await pool.query(migration); // idempotencia sin reinterpretar por afiliación actual
    expect((await pool.query("SELECT origin_master_broker_id FROM public.credit_submission_requests")).rows[0].origin_master_broker_id).toBeNull();
    expect((await pool.query("SELECT COUNT(*)::int n FROM public.app_migrations WHERE id='0004_origin_attribution_reviewed_v1'")).rows[0].n).toBe(1);
  });

  it("prohíbe cambios retroactivos de Master una vez instalado el trigger", async () => {
    await expect(
      pool.query("UPDATE public.credits SET origin_master_broker_id='master-actual' WHERE id='credito-anterior-al-cambio'")
    ).rejects.toThrow(/immutable/);
  });
});
