/**
 * PROCEDIMIENTO ADMINISTRATIVO EXPLÍCITO Y PROTEGIDO DE BOOTSTRAP Y MANTENIMIENTO
 *
 * Este script NUNCA debe ejecutarse automáticamente al iniciar el servidor.
 * Requiere invocación deliberada y explícita por parte de un operador o pipeline de CI/Staging.
 *
 * Uso:
 *   npx tsx scripts/admin-bootstrap-environment.ts --seed-test-accounts
 *   npx tsx scripts/admin-bootstrap-environment.ts --cleanup-test-institutions
 *   npx tsx scripts/admin-bootstrap-environment.ts --sanitize-rbac
 *   npx tsx scripts/admin-bootstrap-environment.ts --all
 */

import { pool } from "../server/db";
import bcrypt from "bcrypt";

export async function bootstrapTestAccounts(options: { forceResetPasswords?: boolean } = {}): Promise<void> {
  const client = await pool.connect();
  try {
    const testPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD || process.env.ADMIN_FALLBACK_PASSWORD || 'Prueba1$';
    const defaultHashedPassword = await bcrypt.hash(testPassword, 10);

    const dedicatedAccounts = [
      { 
        email: 'francocb79@gmail.com', 
        firstName: 'Franco', 
        lastName: 'Admin', 
        role: 'super_admin',
        referralCode: null,
        permissions: JSON.stringify({ modules: ["*"], actions: ["*"] }),
      },
      { 
        email: 'fcb@creditonegocios.com.mx', 
        firstName: 'Franco', 
        lastName: 'Carreño', 
        role: 'master_broker',
        referralCode: 'MB-FRANCO',
        permissions: JSON.stringify({ 
          modules: [
            "dashboard", "clientes", "creditos", "comisiones", "financieras",
            "sistema_productos", "red_brokers", "documentos", "reportes", "usuarios", "configuracion"
          ], 
          actions: ["view", "edit", "submit_proposals", "manage_users"],
          scope: "network"
        }),
      },
      { 
        email: 'francocb79@yahoo.com', 
        firstName: 'Franco', 
        lastName: 'Broker', 
        role: 'broker',
        referralCode: null,
        permissions: JSON.stringify({ 
          modules: [
            "dashboard", "clientes", "creditos", "comisiones", "financieras",
            "sistema_productos", "documentos", "configuracion"
          ], 
          actions: ["view", "edit", "submit_proposals"],
          scope: "own"
        }),
      },
    ];

    let masterBrokerDbId: string | null = null;

    for (const acc of dedicatedAccounts) {
      const existing = await client.query(
        `SELECT id, email, role, is_active FROM public.users WHERE lower(trim(email)) = lower(trim($1))`,
        [acc.email]
      );

      if (existing.rows.length === 0) {
        const insertRes = await client.query(
          `INSERT INTO public.users (
            id, email, password, auth_method, first_name, last_name, role, referral_code, is_active, permissions, created_at, updated_at
          ) VALUES (
            gen_random_uuid(), lower(trim($1)), $2, 'local', $3, $4, $5, $6, true, $7::jsonb, NOW(), NOW()
          ) RETURNING id`,
          [acc.email, defaultHashedPassword, acc.firstName, acc.lastName, acc.role, acc.referralCode, acc.permissions]
        );
        console.log(`✅ [AdminBootstrap] Creada cuenta de prueba: ${acc.email} (${acc.role})`);
        if (acc.role === 'master_broker') {
          masterBrokerDbId = insertRes.rows[0]?.id;
        }
      } else {
        if (options.forceResetPasswords) {
          console.warn(`⚠️ [AdminBootstrap] REINICIO FORZADO de contraseña y permisos para cuenta: ${acc.email}`);
          await client.query(
            `UPDATE public.users 
             SET role = $2, 
                 is_active = TRUE, 
                 auth_method = 'local',
                 permissions = $3::jsonb,
                 password = $4,
                 updated_at = NOW()
             WHERE lower(trim(email)) = lower(trim($1))`,
            [acc.email, acc.role, acc.permissions, defaultHashedPassword]
          );
        } else {
          console.log(`ℹ️ [AdminBootstrap] Cuenta existente respetada sin alteraciones: ${acc.email} (${existing.rows[0]?.role})`);
        }
        if (acc.role === 'master_broker') {
          masterBrokerDbId = existing.rows[0]?.id;
        }
      }
    }

    if (masterBrokerDbId && options.forceResetPasswords) {
      await client.query(
        `UPDATE public.users 
         SET master_broker_id = $1 
         WHERE lower(trim(email)) = 'francocb79@yahoo.com'`,
        [masterBrokerDbId]
      );
      console.log(`🔗 [AdminBootstrap] Vinculado broker francocb79@yahoo.com a Master Broker`);
    }
  } finally {
    client.release();
  }
}

export async function cleanupTestInstitutions(): Promise<void> {
  const client = await pool.connect();
  try {
    const deleteResult = await client.query(`
      WITH test_insts AS (
        SELECT id FROM public.financial_institutions
        WHERE name ILIKE 'E2E Flujo Completo%' 
           OR name IN ('Financiera Demo', 'Financiera Prueba Franco')
      ),
      del_targets AS (
        DELETE FROM public.credit_submission_targets
        WHERE financial_institution_id IN (SELECT id FROM test_insts)
      ),
      upd_credits AS (
        UPDATE public.credits
        SET financial_institution_id = NULL
        WHERE financial_institution_id IN (SELECT id FROM test_insts)
      ),
      upd_prod_reqs AS (
        UPDATE public.product_requests
        SET existing_institution_id = NULL
        WHERE existing_institution_id IN (SELECT id FROM test_insts)
      ),
      del_inst_prods AS (
        DELETE FROM public.institution_products
        WHERE institution_id IN (SELECT id FROM test_insts)
      ),
      del_prods AS (
        DELETE FROM public.products
        WHERE institution_id IN (SELECT id FROM test_insts)
      )
      DELETE FROM public.financial_institutions
      WHERE id IN (SELECT id FROM test_insts)
      RETURNING id, name;
    `);

    if (deleteResult.rowCount && deleteResult.rowCount > 0) {
      console.log(`🧹 [AdminBootstrap] Eliminadas ${deleteResult.rowCount} financieras de prueba:`, deleteResult.rows.map(r => r.name).join(', '));
    } else {
      console.log("✅ [AdminBootstrap] No se encontraron financieras de prueba para eliminar.");
    }
  } finally {
    client.release();
  }
}

export async function sanitizeRbacPermissions(): Promise<void> {
  const client = await pool.connect();
  try {
    const sanitizeRes = await client.query(`
      SELECT id, email, role, permissions 
      FROM public.users 
      WHERE role IN ('broker', 'master_broker') 
        AND permissions IS NOT NULL 
        AND permissions != '{}'::jsonb
    `);

    let sanitizedCount = 0;
    for (const row of sanitizeRes.rows) {
      const perms = row.permissions || {};
      if (Array.isArray(perms.modules) && perms.modules.length > 0) {
        const mods = new Set<string>(perms.modules);
        let changed = false;

        if (!mods.has('comisiones')) {
          mods.add('comisiones');
          changed = true;
        }
        if (!mods.has('financieras')) {
          mods.add('financieras');
          changed = true;
        }
        if (!mods.has('sistema_productos')) {
          mods.add('sistema_productos');
          changed = true;
        }

        if (changed) {
          perms.modules = Array.from(mods);
          await client.query(
            `UPDATE public.users SET permissions = $1::jsonb, updated_at = NOW() WHERE id = $2`,
            [JSON.stringify(perms), row.id]
          );
          sanitizedCount++;
        }
      }
    }
    console.log(`🛡️ [AdminBootstrap] Sanitizados permisos de módulos para ${sanitizedCount} usuarios.`);
  } finally {
    client.release();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const doAll = args.includes('--all');
  const doSeed = doAll || args.includes('--seed-test-accounts');
  const doReset = args.includes('--force-reset-passwords');
  const doCleanup = doAll || args.includes('--cleanup-test-institutions');
  const doSanitize = doAll || args.includes('--sanitize-rbac');
  const hasEnvConfirm = args.includes('--confirm-environment=staging-or-local');
  const hasDestructiveConfirm = args.includes('--confirm-destructive-operations');

  // 1. Bloqueo estricto contra producción
  const isProd = process.env.NODE_ENV === "production" || process.env.RAILWAY_ENVIRONMENT === "production";
  const databaseUrl = (process.env.DATABASE_URL || "").toLowerCase();
  const isProdDb = databaseUrl.includes("production") || (process.env.RAILWAY_SERVICE_NAME || "").toLowerCase().includes("prod");

  if (isProd || isProdDb) {
    console.error("🛑 [AdminBootstrap] BLOQUEO DE SEGURIDAD CRÍTICO: Este script administrativo está estrictamente PROHIBIDO en entornos de producción.");
    process.exit(1);
  }

  if (!doSeed && !doCleanup && !doSanitize) {
    console.log(`
Uso de script administrativo de bootstrap y mantenimiento:
  --confirm-environment=staging-or-local   [OBLIGATORIO] Validación explícita de entorno seguro
  --seed-test-accounts                    Crea cuentas de prueba si no existen (sin sobrescribir existentes)
  --force-reset-passwords                 Fuerza reseteo de password y permisos en cuentas de prueba (PELIGROSO)
  --cleanup-test-institutions             Elimina financieras ficticias de prueba (E2E Flujo Completo, etc.)
  --sanitize-rbac                         Agrega módulos básicos en usuarios legacy que carecen de ellos
  --confirm-destructive-operations        [OBLIGATORIO para --force-reset-passwords o --cleanup-test-institutions]
  --all                                   Ejecuta seed, cleanup y sanitización
    `);
    process.exit(0);
  }

  // 2. Validación de entorno explícita
  if (!hasEnvConfirm) {
    console.error("❌ [AdminBootstrap] ERROR DE SEGURIDAD: Se requiere la bandera explícita '--confirm-environment=staging-or-local' para autorizar el entorno.");
    process.exit(1);
  }

  // 3. Validación de operaciones destructivas
  if ((doReset || doCleanup || doAll) && !hasDestructiveConfirm) {
    console.error("❌ [AdminBootstrap] ERROR DE SEGURIDAD: Las operaciones destructivas (--force-reset-passwords, --cleanup-test-institutions, --all) requieren la bandera explícita '--confirm-destructive-operations'.");
    process.exit(1);
  }

  console.log("🚀 [AdminBootstrap] Iniciando procedimiento administrativo...");

  if (doSeed) {
    await bootstrapTestAccounts({ forceResetPasswords: doReset });
  }

  if (doCleanup) {
    await cleanupTestInstitutions();
  }

  if (doSanitize) {
    await sanitizeRbacPermissions();
  }

  console.log("✨ [AdminBootstrap] Procedimiento administrativo completado.");
  process.exit(0);
}

// Ejecutar CLI si se llama directamente
if (process.argv[1]?.endsWith('admin-bootstrap-environment.ts') || process.argv[1]?.endsWith('admin-bootstrap-environment.js')) {
  main().catch((err) => {
    console.error("❌ [AdminBootstrap] Error fatal:", err);
    process.exit(1);
  });
}
