import { runAutoMigration } from "../../server/autoMigrate";
import { pool } from "../../server/db";

describe("P0 - Stateful PostgreSQL Simulation: Startup & Migration Security (Zero-Destructive Startup)", () => {
  // Base de datos PostgreSQL en memoria con almacenamiento de estado real por tablas y filas
  interface MockDbState {
    users: any[];
    financial_institutions: any[];
    commissions: any[];
    legal_acceptances: any[];
    system_migration_markers: any[];
    credits: any[];
    tenants: any[];
    tenant_members: any[];
  }

  let dbState: MockDbState;

  function createMockClient() {
    return {
      query: jest.fn(async (sqlOrConfig: any, params?: any[]) => {
        const sql = typeof sqlOrConfig === "string" ? sqlOrConfig : sqlOrConfig.text;
        const normalizedSql = sql.replace(/\s+/g, " ").trim();

        // 1. SELECT count(*)::int as count FROM public.users
        if (/SELECT count\(\*\)::int as count FROM public\.users/i.test(normalizedSql)) {
          return { rows: [{ count: dbState.users.length }] };
        }

        // 2. Information schema column existence checks
        if (/SELECT EXISTS/i.test(normalizedSql) && /information_schema\.columns/i.test(normalizedSql)) {
          return { rows: [{ exists: true }] };
        }

        // 3. System user user-super-admin insertion (ON CONFLICT DO NOTHING)
        if (/INSERT INTO public\.users/i.test(normalizedSql) && /user-super-admin/i.test(normalizedSql)) {
          const exists = dbState.users.find(u => u.id === 'user-super-admin');
          if (!exists) {
            dbState.users.push({
              id: 'user-super-admin',
              email: 'system-admin@creditonegocios.com.mx',
              password: 'DISABLED_SYSTEM_ACCOUNT',
              role: 'super_admin',
              is_active: true,
              status: 'active',
            });
          }
          return { rows: [], rowCount: exists ? 0 : 1 };
        }

        // 4. Any UPDATE users
        if (/UPDATE public\.users/i.test(normalizedSql)) {
          // Si autoMigrate intentara ejecutar un UPDATE, afectaría el estado
          // Simulamos la mutación si la consulta se ejecutara
          if (/password\s*=/i.test(normalizedSql)) {
            dbState.users.forEach(u => u.password = "OVERWRITTEN_PASSWORD");
          }
          if (/role\s*=/i.test(normalizedSql)) {
            dbState.users.forEach(u => u.role = "OVERWRITTEN_ROLE");
          }
          if (/is_active\s*=\s*TRUE/i.test(normalizedSql)) {
            dbState.users.forEach(u => u.is_active = true);
          }
          if (/master_broker_id\s*=/i.test(normalizedSql)) {
            dbState.users.forEach(u => u.master_broker_id = "FORCED_MASTER");
          }
          return { rows: [], rowCount: dbState.users.length };
        }

        // 5. Any UPDATE financial_institutions
        if (/UPDATE public\.financial_institutions/i.test(normalizedSql)) {
          if (/is_active\s*=\s*TRUE/i.test(normalizedSql)) {
            dbState.financial_institutions.forEach(f => f.is_active = true);
          }
          return { rows: [], rowCount: dbState.financial_institutions.length };
        }

        // 6. Any DELETE FROM financial_institutions
        if (/DELETE FROM public\.financial_institutions/i.test(normalizedSql)) {
          dbState.financial_institutions = dbState.financial_institutions.filter(f => !f.name.includes("Demo"));
          return { rows: [], rowCount: 1 };
        }

        // 7. Any DELETE FROM commissions
        if (/DELETE FROM public\.commissions/i.test(normalizedSql)) {
          dbState.commissions = [];
          return { rows: [], rowCount: 1 };
        }

        // 8. Any UPDATE commissions
        if (/UPDATE public\.commissions/i.test(normalizedSql)) {
          if (/status\s*=\s*'generated'/i.test(normalizedSql)) {
            dbState.commissions.forEach(c => c.status = 'generated');
          }
          return { rows: [], rowCount: dbState.commissions.length };
        }

        // 9. SELECT queries para comprobaciones
        if (/SELECT\s+id,\s*email,\s*password,\s*role,\s*is_active,\s*status,\s*master_broker_id\s+FROM public\.users/i.test(normalizedSql)) {
          const filterEmail = params?.[0];
          const found = filterEmail ? dbState.users.filter(u => u.email === filterEmail) : dbState.users;
          return { rows: found };
        }

        if (/SELECT\s+id,\s*name,\s*is_active\s+FROM public\.financial_institutions/i.test(normalizedSql)) {
          return { rows: dbState.financial_institutions };
        }

        if (/SELECT\s+id,\s*status\s+FROM public\.commissions/i.test(normalizedSql)) {
          return { rows: dbState.commissions };
        }

        if (/SELECT\s+id,\s*user_id,\s*document,\s*version\s+FROM public\.legal_acceptances/i.test(normalizedSql)) {
          return { rows: dbState.legal_acceptances };
        }

        // Sentencias DDL estándar (CREATE TABLE, ALTER TABLE, CREATE INDEX, etc.)
        return { rows: [], rowCount: 0 };
      }),
      release: jest.fn(),
    };
  }

  beforeEach(() => {
    // Inicialización del estado aislado de la base de datos con registros reales
    dbState = {
      users: [
        {
          id: "user-super-1",
          email: "francocb79@gmail.com",
          password: "$2b$10$RealCustomAdminHashedPassword123",
          role: "super_admin",
          is_active: true,
          status: "active",
          master_broker_id: null,
        },
        {
          id: "user-broker-suspended",
          email: "francocb79@yahoo.com",
          password: "$2b$10$RealCustomBrokerHashedPassword456",
          role: "broker",
          is_active: false,
          status: "suspended",
          master_broker_id: "master-network-uuid-001",
        },
      ],
      financial_institutions: [
        {
          id: "fin-inactive-1",
          name: "Financiera Desactivada por Riesgo",
          is_active: false,
        },
        {
          id: "fin-test-demo",
          name: "Financiera Demo",
          is_active: true,
        },
      ],
      commissions: [
        {
          id: "comm-pending-1",
          status: "pending",
          broker_share: "15000.00",
        },
      ],
      legal_acceptances: [
        {
          id: "acc-101",
          user_id: "user-broker-suspended",
          document: "terminos",
          version: "1.0",
        },
      ],
      system_migration_markers: [],
      credits: [],
      tenants: [],
      tenant_members: [],
    };

    jest.spyOn(pool, "connect").mockImplementation(async () => createMockClient() as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("Validación PostgreSQL real: el arranque preserva contraseñas, roles, estados de suspensión y redes", async () => {
    process.env.USE_MEMORY_STORAGE = "false";

    // 1. Ejecutar arranque del servidor
    await runAutoMigration();

    // 2. Verificar Super Admin
    const superAdmin = dbState.users.find(u => u.email === "francocb79@gmail.com");
    expect(superAdmin).toBeDefined();
    expect(superAdmin.password).toBe("$2b$10$RealCustomAdminHashedPassword123");
    expect(superAdmin.role).toBe("super_admin");
    expect(superAdmin.is_active).toBe(true);

    // 3. Verificar Broker Suspendido
    const broker = dbState.users.find(u => u.email === "francocb79@yahoo.com");
    expect(broker).toBeDefined();
    expect(broker.password).toBe("$2b$10$RealCustomBrokerHashedPassword456");
    expect(broker.role).toBe("broker");
    expect(broker.is_active).toBe(false);
    expect(broker.status).toBe("suspended");
    expect(broker.master_broker_id).toBe("master-network-uuid-001");
  });

  it("Validación PostgreSQL real: el arranque NUNCA reactiva financieras en bulk ni purga instituciones de prueba", async () => {
    process.env.USE_MEMORY_STORAGE = "false";

    await runAutoMigration();

    // Financiera inactiva debe PERMANECER inactiva
    const inactiveFin = dbState.financial_institutions.find(f => f.id === "fin-inactive-1");
    expect(inactiveFin?.is_active).toBe(false);

    // Financiera Demo NO debe ser eliminada
    const demoFin = dbState.financial_institutions.find(f => f.name === "Financiera Demo");
    expect(demoFin).toBeDefined();
  });

  it("Validación PostgreSQL real: el arranque NUNCA borra comisiones ni muta automáticamente sus estados", async () => {
    process.env.USE_MEMORY_STORAGE = "false";

    await runAutoMigration();

    const comm = dbState.commissions.find(c => c.id === "comm-pending-1");
    expect(comm).toBeDefined();
    expect(comm?.status).toBe("pending"); // No convertido a 'generated' en frío
  });

  it("Validación PostgreSQL real: las aceptaciones legales e histórico permanecen 100% íntegros", async () => {
    process.env.USE_MEMORY_STORAGE = "false";

    await runAutoMigration();

    const acceptance = dbState.legal_acceptances.find(a => a.id === "acc-101");
    expect(acceptance).toBeDefined();
    expect(acceptance?.version).toBe("1.0");
  });

  it("Validación de Reinicios Repetidos (Cold Starts Consecutivos): Idempotencia absoluta con cero mutaciones", async () => {
    process.env.USE_MEMORY_STORAGE = "false";

    // Reinicio 1
    await runAutoMigration();

    // Reinicio 2
    await runAutoMigration();

    // Reinicio 3
    await runAutoMigration();

    // Snapshot exacto de verificación
    expect(dbState.users.find(u => u.email === "francocb79@gmail.com")?.password)
      .toBe("$2b$10$RealCustomAdminHashedPassword123");
    expect(dbState.users.find(u => u.email === "francocb79@yahoo.com")?.status)
      .toBe("suspended");
    expect(dbState.users.find(u => u.email === "francocb79@yahoo.com")?.is_active)
      .toBe(false);
    expect(dbState.users.find(u => u.email === "francocb79@yahoo.com")?.master_broker_id)
      .toBe("master-network-uuid-001");
    expect(dbState.financial_institutions.find(f => f.id === "fin-inactive-1")?.is_active)
      .toBe(false);
    expect(dbState.financial_institutions.find(f => f.name === "Financiera Demo"))
      .toBeDefined();
    expect(dbState.commissions.find(c => c.id === "comm-pending-1")?.status)
      .toBe("pending");
  });
});
