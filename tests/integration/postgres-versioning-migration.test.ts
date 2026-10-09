import pg from "pg";
import { computeInstitutionProductVersionHash } from "../../server/offerVersionService";
import { assertSafeIsolatedTestDatabase } from "../testDbSafety";

/**
 * Suite de Integración Real en PostgreSQL A1
 * Requiere estrictamente TEST_DATABASE_URL apuntando a un PostgreSQL aislado de pruebas.
 * NUNCA utiliza DATABASE_URL de la aplicación ni ejecuta operaciones destructivas fuera de pruebas aisladas.
 */

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const isConfigured = Boolean(testDatabaseUrl);

if (isConfigured) {
  assertSafeIsolatedTestDatabase(testDatabaseUrl);
}

const describePg = isConfigured ? describe : describe.skip;

describePg("Integración PostgreSQL Real: Validación Canónica A1 de Migración y Versionado", () => {
  let pool: pg.Pool;

  beforeAll(async () => {
    pool = new pg.Pool({
      connectionString: testDatabaseUrl,
      max: 5,
    });
    const client = await pool.connect();
    client.release();
  });

  afterAll(async () => {
    if (pool) {
      await pool.end();
    }
  });

  describe("1. Migración 0005 desde un esquema legacy preexistente con dependencias reales", () => {
    const fixtureUserId = "usr-test-admin-1";
    const institutionId = "fin-pg-test-1";
    const activeLegacyProductId = "prod-pg-active-1";
    const inactiveLegacyProductId = "prod-pg-inactive-2";

    beforeAll(async () => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN;");
        await client.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto";');

        // Limpieza de objetos de prueba previos en orden de llaves foráneas
        await client.query("DROP VIEW IF EXISTS public.financial_institution_offers CASCADE;");
        await client.query("DROP TABLE IF EXISTS public.institution_product_versions CASCADE;");
        await client.query("DROP TABLE IF EXISTS public.app_migrations CASCADE;");
        await client.query("DROP TABLE IF EXISTS public.institution_products CASCADE;");
        await client.query("DROP TABLE IF EXISTS public.financial_institutions CASCADE;");
        await client.query("DROP TABLE IF EXISTS public.users CASCADE;");

        // Dependencia real 1: users (referenciado por published_by y created_by)
        await client.query(`
          CREATE TABLE public.users (
            id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
            email VARCHAR UNIQUE NOT NULL,
            first_name VARCHAR,
            last_name VARCHAR,
            role VARCHAR DEFAULT 'super_admin',
            created_at TIMESTAMP DEFAULT NOW()
          );
        `);

        // Insertar usuario fixture para resolver foreign keys
        await client.query(`
          INSERT INTO public.users (id, email, first_name, last_name, role)
          VALUES ('${fixtureUserId}', 'admin@creditonegocios-test.com', 'Admin', 'Fixture', 'super_admin');
        `);

        // Dependencia real 2: financial_institutions (referenciado por institution_id)
        await client.query(`
          CREATE TABLE public.financial_institutions (
            id VARCHAR PRIMARY KEY,
            name VARCHAR NOT NULL,
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT NOW()
          );
        `);

        // Dependencia real 3: esquema legacy de institution_products (SIN name, product_type, slug, description, status, current_version_number)
        await client.query(`
          CREATE TABLE public.institution_products (
            id VARCHAR PRIMARY KEY,
            template_id VARCHAR,
            institution_id VARCHAR NOT NULL REFERENCES public.financial_institutions(id) ON DELETE CASCADE,
            custom_name VARCHAR,
            configuration JSONB DEFAULT '{}',
            target_profiles TEXT[] DEFAULT ARRAY[]::TEXT[],
            active_variables JSONB DEFAULT '{}',
            is_active BOOLEAN DEFAULT TRUE,
            created_by VARCHAR REFERENCES public.users(id),
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
          );
        `);

        // Insertar financiera
        await client.query(`
          INSERT INTO public.financial_institutions (id, name, is_active)
          VALUES ('${institutionId}', 'Banco Test PG A1', true);
        `);

        // Insertar producto legacy activo
        await client.query(`
          INSERT INTO public.institution_products (
            id, institution_id, custom_name, configuration, target_profiles, active_variables, is_active, created_by
          ) VALUES (
            '${activeLegacyProductId}',
            '${institutionId}',
            'Crédito PyME Legacy Activo',
            '{"minAmount": 100000, "maxAmount": 5000000, "interestRate": 16.5}'::jsonb,
            ARRAY['persona_moral', 'fisica_empresarial'],
            '{"plazoMax": 36}'::jsonb,
            true,
            '${fixtureUserId}'
          );
        `);

        // Insertar producto legacy inactivo
        await client.query(`
          INSERT INTO public.institution_products (
            id, institution_id, custom_name, configuration, target_profiles, active_variables, is_active, created_by
          ) VALUES (
            '${inactiveLegacyProductId}',
            '${institutionId}',
            'Crédito PyME Legacy Inactivo',
            '{"minAmount": 50000, "maxAmount": 1000000}'::jsonb,
            ARRAY['persona_moral'],
            '{}'::jsonb,
            false,
            '${fixtureUserId}'
          );
        `);

        await client.query("COMMIT;");
      } catch (err) {
        await client.query("ROLLBACK;");
        throw err;
      } finally {
        client.release();
      }
    });

    it("ejecuta exitosamente la migración 0005 con función determinista de hashes", async () => {
      const fs = await import("fs");
      const path = await import("path");
      const sqlMigrationPath = path.resolve(process.cwd(), "migrations/0005_institution_offers_versioning.sql");
      const sqlContent = fs.readFileSync(sqlMigrationPath, "utf-8");

      const client = await pool.connect();
      try {
        await client.query(sqlContent);
      } finally {
        client.release();
      }

      // Verificar que app_migrations registró la migración
      const res = await pool.query(
        "SELECT * FROM public.app_migrations WHERE id = '0005_legacy_institution_products_backfill_a1';"
      );
      expect(res.rows.length).toBe(1);
    });

    it("2a. Preserva productos legacy activos como operativos y publicados", async () => {
      const prodRes = await pool.query(
        `SELECT * FROM public.institution_products WHERE id = '${activeLegacyProductId}';`
      );
      expect(prodRes.rows.length).toBe(1);
      const prod = prodRes.rows[0];
      expect(prod.status).toBe("published");
      expect(prod.current_version_number).toBe(1);
      expect(prod.is_active).toBe(true);

      const verRes = await pool.query(
        `SELECT * FROM public.institution_product_versions WHERE institution_product_id = '${activeLegacyProductId}';`
      );
      expect(verRes.rows.length).toBe(1);
      const version = verRes.rows[0];
      expect(version.version_number).toBe(1);
      expect(version.status).toBe("published");
      expect(version.effective_from).toBeDefined();
      expect(version.effective_to).toBeNull();
      expect(version.version_hash).toBeDefined();
      expect(version.version_hash).toHaveLength(64);
    });

    it("2b. Preserva productos legacy inactivos como archivados e inoperativos", async () => {
      const prodRes = await pool.query(
        `SELECT * FROM public.institution_products WHERE id = '${inactiveLegacyProductId}';`
      );
      expect(prodRes.rows.length).toBe(1);
      const prod = prodRes.rows[0];
      expect(prod.status).toBe("archived");
      expect(prod.current_version_number).toBe(1);
      expect(prod.is_active).toBe(false);

      const verRes = await pool.query(
        `SELECT * FROM public.institution_product_versions WHERE institution_product_id = '${inactiveLegacyProductId}';`
      );
      expect(verRes.rows.length).toBe(1);
      const version = verRes.rows[0];
      expect(version.version_number).toBe(1);
      expect(version.status).toBe("archived");
      expect(version.effective_to).toBeDefined();
      expect(version.version_hash).toBeDefined();
      expect(version.version_hash).toHaveLength(64);
    });

    it("2c. Compara hashes SQL con computeInstitutionProductVersionHash de Node para los mismos datos (coincidencia 100%)", async () => {
      // 1. Verificar hash del producto activo
      const activeVerRes = await pool.query(
        `SELECT ipv.version_hash, ip.id, ip.configuration, ip.target_profiles, ip.active_variables
         FROM public.institution_product_versions ipv
         JOIN public.institution_products ip ON ipv.institution_product_id = ip.id
         WHERE ip.id = '${activeLegacyProductId}';`
      );
      const activeRow = activeVerRes.rows[0];

      const expectedActiveHash = computeInstitutionProductVersionHash({
        institutionProductId: activeRow.id,
        versionNumber: 1,
        conditions: activeRow.configuration,
        requirements: { targetProfiles: activeRow.target_profiles },
        requiredDocuments: [],
        variablesConfiguration: activeRow.active_variables,
      });

      expect(activeRow.version_hash).toBe(expectedActiveHash);

      // 2. Verificar hash del producto inactivo
      const inactiveVerRes = await pool.query(
        `SELECT ipv.version_hash, ip.id, ip.configuration, ip.target_profiles, ip.active_variables
         FROM public.institution_product_versions ipv
         JOIN public.institution_products ip ON ipv.institution_product_id = ip.id
         WHERE ip.id = '${inactiveLegacyProductId}';`
      );
      const inactiveRow = inactiveVerRes.rows[0];

      const expectedInactiveHash = computeInstitutionProductVersionHash({
        institutionProductId: inactiveRow.id,
        versionNumber: 1,
        conditions: inactiveRow.configuration,
        requirements: { targetProfiles: inactiveRow.target_profiles },
        requiredDocuments: [],
        variablesConfiguration: inactiveRow.active_variables,
      });

      expect(inactiveRow.version_hash).toBe(expectedInactiveHash);
    });

    it("2d. Borradores nuevos: nunca se convierten en publicados durante reinicio o autoMigrate", async () => {
      const newDraftId = "prod-pg-new-draft-" + Date.now();
      await pool.query(`
        INSERT INTO public.institution_products (
          id, institution_id, name, product_type, status, current_version_number, is_active, created_by
        ) VALUES (
          '${newDraftId}', '${institutionId}', 'Nueva Oferta en Borrador Real', 'credito_simple', 'draft', 1, true, '${fixtureUserId}'
        );
      `);

      await pool.query(`
        INSERT INTO public.institution_product_versions (
          id, institution_product_id, version_number, status, conditions, created_by
        ) VALUES (
          gen_random_uuid(), '${newDraftId}', 1, 'draft', '{"minAmount": 50000}'::jsonb, '${fixtureUserId}'
        );
      `);

      // Simular segundo arranque ejecutando de nuevo la migración 0005
      const fs = await import("fs");
      const path = await import("path");
      const sqlMigrationPath = path.resolve(process.cwd(), "migrations/0005_institution_offers_versioning.sql");
      const sqlContent = fs.readFileSync(sqlMigrationPath, "utf-8");
      await pool.query(sqlContent);

      // Verificar que la nueva oferta sigue estando estrictamente en 'draft'
      const checkDraft = await pool.query(
        `SELECT * FROM public.institution_products WHERE id = '${newDraftId}';`
      );
      expect(checkDraft.rows[0].status).toBe("draft");

      const checkDraftVer = await pool.query(
        `SELECT * FROM public.institution_product_versions WHERE institution_product_id = '${newDraftId}';`
      );
      expect(checkDraftVer.rows.length).toBe(1);
      expect(checkDraftVer.rows[0].status).toBe("draft");
    });

    it("2e. Segundo arranque (Idempotencia): no altera registros ni duplica versiones", async () => {
      const countsBefore = await pool.query(
        "SELECT COUNT(*) AS c FROM public.institution_product_versions;"
      );
      const fs = await import("fs");
      const path = await import("path");
      const sqlMigrationPath = path.resolve(process.cwd(), "migrations/0005_institution_offers_versioning.sql");
      const sqlContent = fs.readFileSync(sqlMigrationPath, "utf-8");

      // Tercera ejecución
      await pool.query(sqlContent);

      const countsAfter = await pool.query(
        "SELECT COUNT(*) AS c FROM public.institution_product_versions;"
      );
      expect(countsAfter.rows[0].c).toBe(countsBefore.rows[0].c);
    });

    it("2f. Publicación concurrente y rollback seguro: el índice parcial único ipv_published_unique rechaza colisiones y ejecuta ROLLBACK antes de otras consultas", async () => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN;");
        let collisionError: any = null;
        try {
          await client.query(`
            INSERT INTO public.institution_product_versions (
              id, institution_product_id, version_number, status, created_by
            ) VALUES (
              gen_random_uuid(), '${activeLegacyProductId}', 2, 'published', '${fixtureUserId}'
            );
          `);
        } catch (err) {
          collisionError = err;
        }

        expect(collisionError).toBeDefined();
        expect(collisionError.message).toMatch(/ipv_published_unique/);

        // OBLIGATORIO: ROLLBACK inmediato tras error dentro de transacción antes de realizar consultas posteriores en la conexión
        await client.query("ROLLBACK;");

        // Comprobar limpiamente en la conexión tras el ROLLBACK que sigue existiendo únicamente 1 versión publicada
        const checkCount = await client.query(
          `SELECT COUNT(*) AS c FROM public.institution_product_versions WHERE institution_product_id = '${activeLegacyProductId}' AND status = 'published';`
        );
        expect(Number(checkCount.rows[0].c)).toBe(1);
      } finally {
        client.release();
      }
    });

    it("2g. Fallo crítico de migración y rollback seguro: error en transacción ejecuta ROLLBACK antes de consultas posteriores", async () => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN;");
        // Quitar marcador de app_migrations para forzar reintento
        await client.query(
          "DELETE FROM public.app_migrations WHERE id = '0005_legacy_institution_products_backfill_a1';"
        );

        // Insertar un producto corrupto sin versión
        const orphanId = "prod-pg-orphan-" + Date.now();
        await client.query(`
          INSERT INTO public.institution_products (
            id, institution_id, custom_name, is_active, created_by
          ) VALUES (
            '${orphanId}', '${institutionId}', 'Producto Huérfano Test', true, '${fixtureUserId}'
          );
        `);

        // Simular bloque que verifica integridad
        const checkUnversionedSql = `
          DO $$
          DECLARE
            unversioned_count INTEGER;
          BEGIN
            SELECT COUNT(*) INTO unversioned_count
            FROM public.institution_products ip
            WHERE NOT EXISTS (
              SELECT 1 FROM public.institution_product_versions ipv WHERE ipv.institution_product_id = ip.id
            );

            IF unversioned_count > 0 THEN
              RAISE EXCEPTION 'Backfill legacy incompleto: % productos sin versión asociada.', unversioned_count;
            END IF;

            INSERT INTO public.app_migrations (id, executed_at)
            VALUES ('0005_legacy_institution_products_backfill_a1', NOW());
          END $$;
        `;

        let migrationError: any = null;
        try {
          await client.query(checkUnversionedSql);
        } catch (err) {
          migrationError = err;
        }

        expect(migrationError).toBeDefined();
        expect(migrationError.message).toMatch(/Backfill legacy incompleto/);

        // OBLIGATORIO: ROLLBACK inmediato tras error dentro de transacción antes de realizar consultas posteriores en la conexión
        await client.query("ROLLBACK;");

        // Ahora que la transacción fue revertida, verificar limpiamente que app_migrations NO tiene el marcador
        const markerCheck = await client.query(
          "SELECT * FROM public.app_migrations WHERE id = '0005_legacy_institution_products_backfill_a1';"
        );
        expect(markerCheck.rows.length).toBe(0);
      } finally {
        client.release();
      }
    });
  });
});
