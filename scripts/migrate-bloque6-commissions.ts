/**
 * SCRIPT OFICIAL DE MIGRACIÓN Y BACKFILL: BLOQUE 6 — COMISIONES Y DISPERSIÓN
 *
 * Tareas:
 * 1. Asegurar nuevas columnas en la tabla `commissions`.
 * 2. Deduplicar registros previos de (credit_id, commission_type) preservando el pagado o más reciente.
 * 3. Crear índice único en (credit_id, commission_type) para evitar doble comisión.
 * 4. Crear índice único para idempotency_key.
 * 5. Crear tabla `commission_audit_logs`.
 * 6. Migrar estados: 'pending' -> 'generated', preservando 'paid' intacto.
 * 7. Backfill de tenant_id desde credits.tenant_id.
 * 8. Crear entradas iniciales de auditoría para comisiones existentes.
 *
 * Idempotente: puede ejecutarse múltiples veces de forma segura sin alterar registros históricos pagados.
 */

async function runBloque6Migration() {
  console.log("================================================================================");
  console.log("🚀 INICIANDO MIGRACIÓN Y BACKFILL: BLOQUE 6 — COMISIONES Y DISPERSIÓN");
  console.log("================================================================================\n");

  if (!process.env.DATABASE_URL) {
    console.log("ℹ️ [Migración Bloque 6] DATABASE_URL no está configurada en este entorno local.");
    console.log("   La estructura del esquema ha sido integrada en `shared/schema.ts` y las consultas");
    console.log("   de migración SQL se ejecutarán automáticamente en staging/producción a través de `server/autoMigrate.ts`.");
    return;
  }

  const { pool } = await import("../server/db");

  let client;
  try {
    client = await pool.connect();
  } catch (err: any) {
    console.error("❌ Error conectando a la base de datos:", err.message);
    process.exit(1);
  }

  try {
    await client.query("BEGIN;");

    // 1. Agregar columnas a commissions
    console.log("1. Verificando y agregando columnas en tabla `commissions`...");
    await client.query(`
      ALTER TABLE public.commissions
        ADD COLUMN IF NOT EXISTS tenant_id VARCHAR,
        ADD COLUMN IF NOT EXISTS master_broker_id VARCHAR,
        ADD COLUMN IF NOT EXISTS commission_type VARCHAR,
        ADD COLUMN IF NOT EXISTS broker_share NUMERIC(15, 2),
        ADD COLUMN IF NOT EXISTS master_broker_share NUMERIC(15, 2),
        ADD COLUMN IF NOT EXISTS app_share NUMERIC(15, 2),
        ADD COLUMN IF NOT EXISTS frozen_amount NUMERIC(15, 2),
        ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS approved_by VARCHAR,
        ADD COLUMN IF NOT EXISTS paid_by VARCHAR,
        ADD COLUMN IF NOT EXISTS payment_method VARCHAR,
        ADD COLUMN IF NOT EXISTS clabe VARCHAR,
        ADD COLUMN IF NOT EXISTS bank_name VARCHAR,
        ADD COLUMN IF NOT EXISTS account_holder VARCHAR,
        ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR,
        ADD COLUMN IF NOT EXISTS tracking_key VARCHAR,
        ADD COLUMN IF NOT EXISTS provider_response JSONB DEFAULT '{}',
        ADD COLUMN IF NOT EXISTS notes TEXT,
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT now();
    `);
    console.log("   ✅ Columnas verificadas.");

    // 2. Limpieza de duplicados previos de (credit_id, commission_type)
    console.log("2. Analizando duplicados históricos en (credit_id, commission_type)...");
    const dupCheck = await client.query(`
      SELECT credit_id, commission_type, count(*) as cnt
      FROM public.commissions
      WHERE credit_id IS NOT NULL AND commission_type IS NOT NULL
      GROUP BY credit_id, commission_type
      HAVING count(*) > 1;
    `);

    if (dupCheck.rows.length > 0) {
      console.log(`   ⚠️ Encontrados ${dupCheck.rows.length} grupos de duplicados. Limpiando para mantener el más seguro (pagado o más reciente)...`);
      const deleteDups = await client.query(`
        DELETE FROM public.commissions
        WHERE id IN (
          SELECT id FROM (
            SELECT id, ROW_NUMBER() OVER (
              PARTITION BY credit_id, commission_type 
              ORDER BY CASE WHEN status = 'paid' THEN 0 ELSE 1 END, created_at DESC
            ) as rn
            FROM public.commissions
            WHERE credit_id IS NOT NULL AND commission_type IS NOT NULL
          ) t WHERE t.rn > 1
        );
      `);
      console.log(`   ✅ Eliminados ${deleteDups.rowCount} registros duplicados superfluos.`);
    } else {
      console.log("   ✅ Sin duplicados de (credit_id, commission_type).");
    }

    // 3. Crear índices únicos y auxiliares
    console.log("3. Creando índices y restricciones únicas...");
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS commissions_credit_type_unique 
        ON public.commissions (credit_id, commission_type);
      CREATE UNIQUE INDEX IF NOT EXISTS commissions_idempotency_key_unique 
        ON public.commissions (idempotency_key) WHERE idempotency_key IS NOT NULL;
      CREATE INDEX IF NOT EXISTS commissions_tenant_idx ON public.commissions (tenant_id);
      CREATE INDEX IF NOT EXISTS commissions_status_idx ON public.commissions (status);
    `);
    console.log("   ✅ Índices únicos y auxiliares asegurados.");

    // 4. Crear tabla de auditoría
    console.log("4. Creando tabla de auditoría `commission_audit_logs`...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.commission_audit_logs (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        commission_id VARCHAR NOT NULL REFERENCES public.commissions(id) ON DELETE CASCADE,
        action VARCHAR NOT NULL,
        performed_by VARCHAR,
        previous_status VARCHAR,
        new_status VARCHAR,
        details JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS comm_audit_commission_idx ON public.commission_audit_logs (commission_id);
      CREATE INDEX IF NOT EXISTS comm_audit_created_at_idx ON public.commission_audit_logs (created_at);
    `);
    console.log("   ✅ Tabla `commission_audit_logs` e índices listos.");

    // 5. Migración de estados: 'pending' -> 'generated', preservar 'paid'
    console.log("5. Migrando estados de comisiones...");
    const statusUpdate = await client.query(`
      UPDATE public.commissions
      SET status = 'generated'
      WHERE status = 'pending';
    `);
    console.log(`   ✅ ${statusUpdate.rowCount} comisiones actualizadas de 'pending' a 'generated'.`);

    // 6. Backfill de tenant_id desde credits
    console.log("6. Ejecutando backfill de tenant_id desde los créditos asociados...");
    const tenantBackfill = await client.query(`
      UPDATE public.commissions c
      SET tenant_id = cr.tenant_id
      FROM public.credits cr
      WHERE c.credit_id = cr.id AND c.tenant_id IS NULL AND cr.tenant_id IS NOT NULL;
    `);
    console.log(`   ✅ ${tenantBackfill.rowCount} comisiones asociadas a su tenant correspondiente.`);

    // 7. Auditoría inicial para comisiones existentes sin log
    console.log("7. Generando logs de auditoría inicial para trazabilidad histórica...");
    const auditInit = await client.query(`
      INSERT INTO public.commission_audit_logs (commission_id, action, previous_status, new_status, details)
      SELECT c.id, 'migrated_bloque6', c.status, c.status, jsonb_build_object('reason', 'Migración Bloque 6 - inicialización de trazabilidad')
      FROM public.commissions c
      WHERE NOT EXISTS (
        SELECT 1 FROM public.commission_audit_logs cal WHERE cal.commission_id = c.id
      );
    `);
    console.log(`   ✅ ${auditInit.rowCount} registros de auditoría inicial creados.`);

    await client.query("COMMIT;");

    console.log("\n================================================================================");
    console.log("🎉 MIGRACIÓN Y BACKFILL DEL BLOQUE 6 COMPLETADOS EXITOSAMENTE");
    console.log("================================================================================\n");
  } catch (err: any) {
    await client.query("ROLLBACK;");
    console.error("❌ Error ejecutando migración del Bloque 6:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runBloque6Migration();
