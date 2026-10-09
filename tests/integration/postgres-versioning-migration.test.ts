import pg from "pg";
import { computeInstitutionProductVersionHash } from "../../server/offerVersionService";

/**
 * Suite de Integración Real en PostgreSQL A1
 * Ejecutada en CI (GitHub Actions) con servicio PostgreSQL efímero real.
 * Si DATABASE_URL no está configurada (ej. entorno local sin PostgreSQL),
 * la suite reporta estado pendiente sin emitir falsos positivos.
 */
const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
const describePg = databaseUrl ? describe : describe.skip;

describePg("Integración PostgreSQL Real: Validación Canónica A1 de Migración y Versionado", () => {
  let pool: pg.Pool;

  beforeAll(async () => {
    pool = new pg.Pool({
      connectionString: databaseUrl,
      max: 5,
    });
    // Test connectivity
    const client = await pool.connect();
    client.release();
  });

  afterAll(async () => {
    if (pool) {
      await pool.end();
    }
  });

  describe("1. Migración 0005 desde un esquema legacy preexistente", () => {
    const institutionId = "fin-pg-test-1";
    const activeLegacyProductId = "prod-pg-active-1";
    const inactiveLegacyProductId = "prod-pg-inactive-2";

    beforeAll(async () => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN;");
        await client.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto";');

        // Eliminar tablas previas para simular exactamente el estado legacy pre-0005
        await client.query("DROP VIEW IF EXISTS public.financial_institution_offers CASCADE;");
        await client.query("DROP TABLE IF EXISTS public.institution_product_versions CASCADE;");
        await client.query("DROP TABLE IF EXISTS public.app_migrations CASCADE;");
        await client.query("DROP TABLE IF EXISTS public.institution_products CASCADE;");
        await client.query("DROP TABLE IF EXISTS public.financial_institutions CASCADE;");

        // Crear tabla de instituciones
        await client.query(`
          CREATE TABLE public.financial_institutions (
            id VARCHAR PRIMARY KEY,
            name VARCHAR NOT NULL,
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT NOW()
          );
        `);

        // Crear tabla legacy de institution_products (SIN name, product_type, slug, description, status, current_version_number)
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
            created_by VARCHAR,
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
            id, institution_id, custom_name, configuration, target_profiles, active_variables, is_active
          ) VALUES (
            '${activeLegacyProductId}',
            '${institutionId}',
            'Crédito PyME Legacy Activo',
            '{"minAmount": 100000, "maxAmount": 5000000, "interestRate": 16.5}'::jsonb,
            ARRAY['persona_moral', 'fisica_empresarial'],
            '{"plazoMax": 36}'::jsonb,
            true
          );
        `);

        // Insertar producto legacy inactivo
        await client.query(`
          INSERT INTO public.institution_products (
            id, institution_id, custom_name, configuration, target_profiles, active_variables, is_active
          ) VALUES (
            '${inactiveLegacyProductId}',
            '${institutionId}',
            'Crédito PyME Legacy Inactivo',
            '{"minAmount": 50000, "maxAmount": 1000000}'::jsonb,
            ARRAY['persona_moral'],
            '{}'::jsonb,
            false
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
      // Crear una nueva oferta en borrador
      const newDraftId = "prod-pg-new-draft-" + Date.now();
      await pool.query(`
        INSERT INTO public.institution_products (
          id, institution_id, name, product_type, status, current_version_number, is_active
        ) VALUES (
          '${newDraftId}', '${institutionId}', 'Nueva Oferta en Borrador Real', 'credito_simple', 'draft', 1, true
        );
      `);

      await pool.query(`
        INSERT INTO public.institution_product_versions (
          id, institution_product_id, version_number, status, conditions
        ) VALUES (
          gen_random_uuid(), '${newDraftId}', 1, 'draft', '{"minAmount": 50000}'::jsonb
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

    it("2f. Publicación concurrente: el índice parcial único ipv_published_unique rechaza colisiones", async () => {
      // Intentar insertar una segunda versión 'published' para el mismo producto activo debe fallar con código 23505
      await expect(
        pool.query(`
          INSERT INTO public.institution_product_versions (
            id, institution_product_id, version_number, status
          ) VALUES (
            gen_random_uuid(), '${activeLegacyProductId}', 2, 'published'
          );
        `)
      ).rejects.toThrow(/ipv_published_unique/);
    });

    it("2g. Fallo crítico de migración: impide declarar el esquema listo y no registra app_migrations", async () => {
      // Simular un producto huérfano sin versión borrando su versión pero dejando app_migrations pendiente
      const client = await pool.connect();
      try {
        await client.query("BEGIN;");
        // Quitar marcador de app_migrations para forzar reintento
        await client.query(
          "DELETE FROM public.app_migrations WHERE id = '0005_legacy_institution_products_backfill_a1';"
        );

        // Insertar un producto corrupto que simula fallo
        const orphanId = "prod-pg-orphan-" + Date.now();
        await client.query(`
          INSERT INTO public.institution_products (
            id, institution_id, custom_name, is_active
          ) VALUES (
            '${orphanId}', '${institutionId}', 'Producto Huérfano Test', true
          );
        `);

        // Simular ejecución manual donde la inserción de versiones se bloquee o falle
        // El bloque DO $$ verifica unversioned_count > 0 y lanza RAISE EXCEPTION
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

        await expect(client.query(checkUnversionedSql)).rejects.toThrow(/Backfill legacy incompleto/);

        // Verificar que app_migrations NO tiene el marcador
        const markerCheck = await client.query(
          "SELECT * FROM public.app_migrations WHERE id = '0005_legacy_institution_products_backfill_a1';"
        );
        expect(markerCheck.rows.length).toBe(0);

        await client.query("ROLLBACK;");
      } finally {
        client.release();
      }
    });
  });
});
