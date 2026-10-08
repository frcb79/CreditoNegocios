/**
 * PROCEDIMIENTO EXPLÍCITO DE MIGRACIÓN HISTÓRICA Y BACKFILL DE DATOS
 *
 * Este script contiene los backfills y normalizaciones que fueron desacoplados
 * de server/autoMigrate.ts para garantizar un arranque seguro y no destructivo.
 *
 * NUNCA se ejecuta automáticamente al iniciar la aplicación.
 * Requiere:
 *   1. Preflight y verificación de entorno.
 *   2. Confirmación explícita de respaldo previo (--confirm-backup).
 *   3. Autorización explícita del operador (--authorize-historical-backfill).
 *   4. Bloqueo automático si se detecta entorno productivo no autorizado.
 *
 * Uso:
 *   npx tsx scripts/explicit-historical-backfills.ts --preflight-only
 *   npx tsx scripts/explicit-historical-backfills.ts --confirm-backup --authorize-historical-backfill
 */

import { pool } from "../server/db";

interface BackfillSummary {
  creditsAffected: number;
  opportunitiesAffected: number;
  submissionsAffected: number;
  commissionsNormalized: number;
  tenantsNormalized: number;
  usersNormalized: number;
}

export async function runPreflight(): Promise<BackfillSummary> {
  const client = await pool.connect();
  try {
    const isProd = process.env.NODE_ENV === "production" || process.env.RAILWAY_ENVIRONMENT === "production";
    console.log(`🔍 [Preflight] Entorno detectado: ${process.env.NODE_ENV || 'development'}`);
    if (isProd) {
      console.warn("⚠️ [Preflight] ATENCIÓN: Se detecta entorno de producción o Railway.");
    }

    // Comprobar créditos pendientes de origin_master_broker_id
    const creditsRes = await client.query(`
      SELECT COUNT(*)::int as count 
      FROM public.credits c
      JOIN public.users u ON c.broker_id = u.id
      WHERE c.origin_master_broker_id IS NULL 
        AND (u.role = 'master_broker' OR (u.role = 'broker' AND u.master_broker_id IS NOT NULL));
    `);

    // Comprobar oportunidades pendientes
    const oppsRes = await client.query(`
      SELECT COUNT(*)::int as count 
      FROM public.commercial_opportunities o
      JOIN public.users u ON o.broker_id = u.id
      WHERE o.master_broker_id IS NULL;
    `);

    // Comprobar solicitudes de crédito
    const subsRes = await client.query(`
      SELECT COUNT(*)::int as count 
      FROM public.credit_submission_requests s
      JOIN public.users u ON s.broker_id = u.id
      WHERE s.origin_master_broker_id IS NULL;
    `);

    // Comprobar comisiones pendientes de normalizar estado
    const commsRes = await client.query(`
      SELECT COUNT(*)::int as count 
      FROM public.commissions 
      WHERE status = 'pending';
    `);

    // Comprobar brokers directos legacy
    const directBrokersRes = await client.query(`
      SELECT COUNT(*)::int as count 
      FROM public.users broker
      WHERE broker.role = 'broker'
        AND broker.master_broker_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.users parent 
          WHERE parent.id = broker.master_broker_id AND parent.role = 'master_broker'
        );
    `);

    const summary: BackfillSummary = {
      creditsAffected: Number(creditsRes.rows[0]?.count ?? 0),
      opportunitiesAffected: Number(oppsRes.rows[0]?.count ?? 0),
      submissionsAffected: Number(subsRes.rows[0]?.count ?? 0),
      commissionsNormalized: Number(commsRes.rows[0]?.count ?? 0),
      tenantsNormalized: Number(directBrokersRes.rows[0]?.count ?? 0),
      usersNormalized: Number(directBrokersRes.rows[0]?.count ?? 0),
    };

    console.log("📊 [Preflight] Resumen de registros elegibles para backfill histórico:");
    console.table(summary);
    return summary;
  } finally {
    client.release();
  }
}

export async function executeHistoricalBackfills(): Promise<void> {
  const client = await pool.connect();
  try {
    console.log("🚀 [HistoricalBackfill] Iniciando ejecución de backfills históricos bajo transacción...");

    await client.query("BEGIN;");

    // 1. Backfill de credits.origin_master_broker_id
    await client.query(`
      WITH marker AS (
        INSERT INTO public.system_migration_markers (key, metadata)
        VALUES ('credits_origin_master_snapshot_v1', '{"purpose":"freeze pre-transition Master Broker affiliation on legacy credits"}'::jsonb)
        ON CONFLICT (key) DO NOTHING
        RETURNING key
      )
      UPDATE public.credits AS c
      SET origin_master_broker_id = CASE
        WHEN u.role = 'master_broker' THEN u.id
        WHEN u.role = 'broker' AND mb.role = 'master_broker' THEN mb.id
        ELSE NULL
      END
      FROM public.users AS u
      LEFT JOIN public.users AS mb ON mb.id = u.master_broker_id,
      marker
      WHERE c.broker_id = u.id
        AND c.origin_master_broker_id IS NULL;
    `);
    console.log("  ✅ Créditos históricos snapshot completado.");

    // 2. Normalización de Casa Matriz legacy (brokers directos asociados a admin)
    await client.query(`
      WITH marker AS (
        INSERT INTO public.system_migration_markers (key, metadata)
        VALUES ('legacy_direct_brokers_normalize_v1', '{"purpose":"normalize legacy Casa Matriz links to platform"}'::jsonb)
        ON CONFLICT (key) DO NOTHING
        RETURNING key
      ),
      platform_tenant AS (
        SELECT id
        FROM public.tenants
        WHERE type = 'platform' OR slug = 'platform'
        ORDER BY CASE WHEN type = 'platform' THEN 0 ELSE 1 END
        LIMIT 1
      ),
      legacy_direct_brokers AS (
        SELECT broker.id
        FROM public.users AS broker
        WHERE broker.role = 'broker'
          AND broker.master_broker_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM public.users AS parent_user
            WHERE parent_user.id = broker.master_broker_id
              AND parent_user.role = 'master_broker'
          )
      )
      UPDATE public.tenants AS broker_tenant
      SET parent_tenant_id = platform_tenant.id,
          updated_at = NOW()
      FROM platform_tenant, legacy_direct_brokers, marker
      WHERE broker_tenant.type = 'broker'
        AND broker_tenant.settings->>'legacyOwnerUserId' = legacy_direct_brokers.id;

      WITH marker AS (
        SELECT key FROM public.system_migration_markers WHERE key = 'legacy_direct_brokers_normalize_v1'
      )
      UPDATE public.users AS broker
      SET master_broker_id = NULL,
          updated_at = NOW()
      FROM marker
      WHERE broker.role = 'broker'
        AND broker.master_broker_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM public.users AS parent_user
          WHERE parent_user.id = broker.master_broker_id
            AND parent_user.role = 'master_broker'
        );
    `);
    console.log("  ✅ Casa Matriz legacy normalizada a plataforma.");

    // 3. Oportunidades comerciales snapshot
    await client.query(`
      WITH marker AS (
        INSERT INTO public.system_migration_markers (key, metadata)
        VALUES ('broker_network_opportunity_snapshot_v1', '{"purpose":"freeze pre-transition Master Broker affiliation on commercial opportunities"}'::jsonb)
        ON CONFLICT (key) DO NOTHING
        RETURNING key
      )
      UPDATE public.commercial_opportunities AS opportunity
      SET master_broker_id = CASE
        WHEN broker.role = 'master_broker' THEN broker.id
        WHEN broker.role = 'broker' AND parent_master.role = 'master_broker' THEN parent_master.id
        ELSE NULL
      END
      FROM public.users AS broker
      LEFT JOIN public.users AS parent_master ON parent_master.id = broker.master_broker_id,
      marker
      WHERE opportunity.broker_id = broker.id
        AND opportunity.master_broker_id IS NULL;
    `);
    console.log("  ✅ Oportunidades comerciales snapshot completado.");

    // 4. Solicitudes de crédito snapshot
    await client.query(`
      WITH marker AS (
        INSERT INTO public.system_migration_markers (key, metadata)
        VALUES ('broker_network_submission_snapshot_v1', '{"purpose":"freeze pre-transition Master Broker affiliation on credit submissions"}'::jsonb)
        ON CONFLICT (key) DO NOTHING
        RETURNING key
      )
      UPDATE public.credit_submission_requests AS submission
      SET origin_master_broker_id = CASE
        WHEN broker.role = 'master_broker' THEN broker.id
        WHEN broker.role = 'broker' AND parent_master.role = 'master_broker' THEN parent_master.id
        ELSE NULL
      END
      FROM public.users AS broker
      LEFT JOIN public.users AS parent_master ON parent_master.id = broker.master_broker_id,
      marker
      WHERE submission.broker_id = broker.id
        AND submission.origin_master_broker_id IS NULL;
    `);
    console.log("  ✅ Solicitudes de crédito snapshot completado.");

    // 5. Comisiones: vinculación de tenant_id desde créditos
    await client.query(`
      UPDATE public.commissions c
      SET tenant_id = cr.tenant_id
      FROM public.credits cr
      WHERE c.credit_id = cr.id AND c.tenant_id IS NULL AND cr.tenant_id IS NOT NULL;
    `);
    console.log("  ✅ Comisiones tenant_id sincronizado desde créditos.");

    await client.query("COMMIT;");
    console.log("✨ [HistoricalBackfill] Migraciones y backfills completados y confirmados exitosamente.");
  } catch (err) {
    await client.query("ROLLBACK;");
    console.error("❌ [HistoricalBackfill] Error durante el proceso. Transacción revertida (ROLLBACK):", err);
    throw err;
  } finally {
    client.release();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const isPreflightOnly = args.includes("--preflight-only");
  const hasBackupConfirm = args.includes("--confirm-backup");
  const hasAuthConfirm = args.includes("--authorize-historical-backfill");

  const isProd = process.env.NODE_ENV === "production" || process.env.RAILWAY_ENVIRONMENT === "production";
  if (isProd && !args.includes("--force-production-execution")) {
    console.error("🛑 [HistoricalBackfill] ERROR: Ejecución bloqueada en entorno de producción sin bandera explícita --force-production-execution.");
    process.exit(1);
  }

  if (isPreflightOnly || (!hasBackupConfirm || !hasAuthConfirm)) {
    console.log("ℹ️ [HistoricalBackfill] Ejecutando análisis en modo preflight (lectura)...");
    await runPreflight();
    if (!hasBackupConfirm || !hasAuthConfirm) {
      console.log(`
Para ejecutar las modificaciones de datos, se requiere invocar explícitamente con ambas banderas:
  --confirm-backup                     Confirma que existe respaldo reciente de la base de datos
  --authorize-historical-backfill      Autoriza la ejecución de las sentencias DML históricas
      `);
    }
    process.exit(0);
  }

  await runPreflight();
  await executeHistoricalBackfills();
  process.exit(0);
}

if (process.argv[1]?.endsWith("explicit-historical-backfills.ts") || process.argv[1]?.endsWith("explicit-historical-backfills.js")) {
  main().catch((err) => {
    console.error("❌ [HistoricalBackfill] Error fatal:", err);
    process.exit(1);
  });
}
