/**
 * SCRIPT DE SANEAMIENTO Y MIGRACIÓN IDEMPOTENTE: RBAC & COMISIONES (BLOQUE 5)
 *
 * Objetivo:
 * - Restaurar el módulo 'comisiones' a brokers, master brokers y miembros con canOriginate: true
 *   que lo hayan perdido debido a los presets históricos o valores predeterminados de formularios.
 * - Asegurar módulos de consulta 'financieras' y 'sistema_productos'.
 * - Excluir estrictamente a colaboradores con canOriginate: false.
 * - NO sobrescribir personalizaciones válidas ni borrar permisos existentes.
 * - Idempotente: ejecutarlo múltiples veces produce el mismo resultado.
 *
 * Uso:
 *   npx tsx scripts/sanitize-rbac-commissions.ts [--apply]
 *   (Por defecto se ejecuta en modo DRY-RUN sin modificar la base de datos)
 */

export interface UserSanitizationResult {
  userId: string;
  email: string | null;
  role: string;
  reason: string;
  oldModules: string[];
  newModules: string[];
}

export interface SanitizationSummary {
  dryRun: boolean;
  totalUsers: number;
  usersInspected: number;
  usersModified: number;
  nonOriginatorsExcluded: number;
  details: UserSanitizationResult[];
}

export async function runSanitization(options: { dryRun?: boolean; dbPool?: any } = {}): Promise<SanitizationSummary> {
  const isDryRun = options.dryRun !== false;
  let p = options.dbPool;
  if (!p) {
    const dbModule = await import("../server/db");
    p = dbModule.pool;
  }

  console.log(`\n======================================================`);
  console.log(`🛡️  INICIANDO AUDITORÍA Y SANEAMIENTO DE PERMISOS RBAC`);
  console.log(`Modo: ${isDryRun ? "🔍 DRY-RUN (Solo lectura)" : "🚀 APPLY (Modificando base de datos)"}`);
  console.log(`======================================================\n`);

  // 1. Obtener todos los usuarios
  const usersRes = await p.query(`
    SELECT id, email, role, permissions 
    FROM users 
    ORDER BY created_at ASC
  `);
  const allUsers = usersRes.rows;

  // 2. Obtener todas las membresías activas para evaluar canOriginate
  let membersRows: any[] = [];
  try {
    const membersRes = await p.query(`
      SELECT user_id, tenant_id, role, can_originate, is_active 
      FROM tenant_members 
      WHERE is_active = true
    `);
    membersRows = membersRes.rows;
  } catch (err) {
    console.warn("⚠️ [Aviso] Tabla tenant_members no disponible o sin columna can_originate:", (err as any)?.message);
  }

  const membershipsByUser = new Map<string, any[]>();
  for (const m of membersRows) {
    if (!membershipsByUser.has(m.user_id)) {
      membershipsByUser.set(m.user_id, []);
    }
    membershipsByUser.get(m.user_id)!.push(m);
  }

  const details: UserSanitizationResult[] = [];
  let nonOriginatorsExcluded = 0;

  for (const user of allUsers) {
    const userMemberships = membershipsByUser.get(user.id) || [];
    const hasNonOriginatorOnly = userMemberships.length > 0 && userMemberships.every(m => m.role === 'member' && m.can_originate === false);
    
    // Regla de Negocio: Si es exclusivamente colaborador con canOriginate: false, NO otorgar comisiones
    if (hasNonOriginatorOnly && user.role !== 'super_admin' && user.role !== 'admin') {
      nonOriginatorsExcluded++;
      // Si por alguna razón tenía comisiones en sus módulos personalizados, purgarlo
      const perms = (user.permissions as any) || {};
      if (Array.isArray(perms.modules) && perms.modules.includes('comisiones')) {
        const cleanedModules = perms.modules.filter((m: string) => m !== 'comisiones');
        details.push({
          userId: user.id,
          email: user.email,
          role: user.role,
          reason: "Colaborador canOriginate:false -> Removiendo 'comisiones'",
          oldModules: perms.modules,
          newModules: cleanedModules,
        });

        if (!isDryRun) {
          const updatedPerms = { ...perms, modules: cleanedModules };
          await p.query(`UPDATE users SET permissions = $1 WHERE id = $2`, [JSON.stringify(updatedPerms), user.id]);
        }
      }
      continue;
    }

    // Regla de Negocio: Para brokers, master brokers, owners y originadores con permissions.modules definidos
    const perms = (user.permissions as any) || {};
    if (Array.isArray(perms.modules) && perms.modules.length > 0) {
      const currentMods = new Set<string>(perms.modules);
      let needsUpdate = false;
      const reasons: string[] = [];

      // 1. Restaurar 'comisiones' si es broker o master_broker
      if (!currentMods.has('comisiones')) {
        const isEligibleForCommissions = 
          user.role === 'broker' || 
          user.role === 'master_broker' || 
          user.role === 'admin' || 
          user.role === 'super_admin' ||
          userMemberships.some(m => m.role === 'owner' || m.can_originate === true);

        if (isEligibleForCommissions) {
          currentMods.add('comisiones');
          needsUpdate = true;
          reasons.push("Restaurando 'comisiones'");
        }
      }

      // 2. Restaurar 'financieras' para consulta operativa si no la tenía
      if (!currentMods.has('financieras') && (user.role === 'broker' || user.role === 'master_broker')) {
        currentMods.add('financieras');
        needsUpdate = true;
        reasons.push("Habilitando consulta de 'financieras'");
      }

      // 3. Restaurar 'sistema_productos' para master broker o broker
      if (!currentMods.has('sistema_productos') && (user.role === 'broker' || user.role === 'master_broker')) {
        currentMods.add('sistema_productos');
        needsUpdate = true;
        reasons.push("Habilitando consulta de 'sistema_productos'");
      }

      if (needsUpdate) {
        const newModulesList = Array.from(currentMods);
        details.push({
          userId: user.id,
          email: user.email,
          role: user.role,
          reason: reasons.join(", "),
          oldModules: perms.modules,
          newModules: newModulesList,
        });

        if (!isDryRun) {
          const updatedPerms = { ...perms, modules: newModulesList };
          await p.query(`UPDATE users SET permissions = $1 WHERE id = $2`, [JSON.stringify(updatedPerms), user.id]);
        }
      }
    }
  }

  const summary: SanitizationSummary = {
    dryRun: isDryRun,
    totalUsers: allUsers.length,
    usersInspected: allUsers.length,
    usersModified: details.length,
    nonOriginatorsExcluded,
    details,
  };

  console.log(`📊 RESUMEN DE EJECUCIÓN:`);
  console.log(`- Total usuarios inspeccionados: ${summary.totalUsers}`);
  console.log(`- Usuarios a modificar: ${summary.usersModified}`);
  console.log(`- Colaboradores no-originadores respetados/excluidos: ${summary.nonOriginatorsExcluded}`);
  console.log(`------------------------------------------------------`);
  for (const d of details) {
    console.log(`  👤 [${d.role.toUpperCase()}] ${d.email || d.userId}: ${d.reason}`);
    console.log(`     Antes: [${d.oldModules.join(", ")}]`);
    console.log(`     Ahora: [${d.newModules.join(", ")}]`);
  }
  console.log(`======================================================\n`);

  return summary;
}

// Ejecución directa por CLI
if (process.argv[1] && process.argv[1].includes("sanitize-rbac-commissions")) {
  const applyFlag = process.argv.includes("--apply");
  runSanitization({ dryRun: !applyFlag })
    .then((summary) => {
      console.log(`✅ Finalizado exitosamente (${summary.dryRun ? "DRY-RUN" : "APPLIED"}).`);
      process.exit(0);
    })
    .catch((err) => {
      console.error("❌ Error en script de saneamiento:", err);
      process.exit(1);
    });
}
