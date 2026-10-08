import { runAutoMigration } from "../../server/autoMigrate";
import { pool } from "../../server/db";

describe("P0 - Startup & Migration Security (autoMigrate & Zero-Destructive Startup)", () => {
  let executedQueries: { sql: string; params?: any[] }[] = [];
  let existingUserCount = 5;
  let existingMarkers = new Set<string>();

  beforeEach(() => {
    executedQueries = [];
    existingUserCount = 5;
    existingMarkers = new Set<string>();

    // Mock pool.connect to capture all SQL queries executed during runAutoMigration
    jest.spyOn(pool, "connect").mockImplementation(async () => {
      const mockClient: any = {
        query: jest.fn(async (sqlOrConfig: any, params?: any[]) => {
          const sql = typeof sqlOrConfig === "string" ? sqlOrConfig : sqlOrConfig.text;
          executedQueries.push({ sql, params });

          // Mock responses for branching logic
          if (sql.includes("SELECT count(*)::int as count FROM public.users")) {
            return { rows: [{ count: existingUserCount }] };
          }

          if (sql.includes("SELECT EXISTS") && sql.includes("information_schema.columns") && sql.includes("origin_master_broker_id")) {
            return { rows: [{ exists: true }] };
          }

          if (sql.includes("SELECT id, email, password, role, is_active FROM public.users")) {
            return { rows: [{ id: "existing-user-id", email: params?.[0], role: "broker", is_active: false }] };
          }

          return { rows: [], rowCount: 0 };
        }),
        release: jest.fn(),
      };
      return mockClient;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("Security: server startup NEVER overwrites passwords on existing accounts", async () => {
    process.env.USE_MEMORY_STORAGE = "false";
    await runAutoMigration();

    const passwordUpdateQueries = executedQueries.filter(q =>
      /UPDATE\s+public\.users\s+SET[\s\S]*password\s*=/i.test(q.sql)
    );

    expect(passwordUpdateQueries.length).toBe(0);
  });

  it("Security: server startup NEVER alters user roles or reactivates inactive accounts", async () => {
    process.env.USE_MEMORY_STORAGE = "false";
    await runAutoMigration();

    const roleOrReactivationQueries = executedQueries.filter(q =>
      /UPDATE\s+public\.users\s+SET[\s\S]*(role\s*=|is_active\s*=\s*(TRUE|true))/i.test(q.sql)
    );

    expect(roleOrReactivationQueries.length).toBe(0);
  });

  it("Security: server startup NEVER forcibly reassigns broker network affiliations", async () => {
    process.env.USE_MEMORY_STORAGE = "false";
    await runAutoMigration();

    const forcedReassignment = executedQueries.filter(q =>
      /UPDATE\s+public\.users\s+SET\s+master_broker_id\s*=\s*\$1\s+WHERE[\s\S]*francocb79@yahoo\.com/i.test(q.sql)
    );

    expect(forcedReassignment.length).toBe(0);
  });

  it("Integrity: server startup NEVER reactivates disabled financial institutions in bulk", async () => {
    process.env.USE_MEMORY_STORAGE = "false";
    await runAutoMigration();

    const institutionReactivation = executedQueries.filter(q =>
      /UPDATE\s+public\.financial_institutions\s+SET[\s\S]*is_active\s*=\s*(TRUE|true)/i.test(q.sql)
    );

    expect(institutionReactivation.length).toBe(0);
  });

  it("Integrity: server startup NEVER deletes financial institutions or unlinks credits on boot", async () => {
    process.env.USE_MEMORY_STORAGE = "false";
    await runAutoMigration();

    const deleteInstitutions = executedQueries.filter(q =>
      /DELETE\s+FROM\s+public\.financial_institutions/i.test(q.sql)
    );

    expect(deleteInstitutions.length).toBe(0);
  });

  it("Idempotence: system_migration_markers table is verified and backfills use persistent markers", async () => {
    process.env.USE_MEMORY_STORAGE = "false";
    await runAutoMigration();

    // Verify system_migration_markers table creation was executed
    const markerTableQuery = executedQueries.find(q =>
      /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.system_migration_markers/i.test(q.sql)
    );
    expect(markerTableQuery).toBeDefined();

    // Verify credits backfill is guarded with marker and c.origin_master_broker_id IS NULL
    const creditsBackfillQuery = executedQueries.find(q =>
      q.sql.includes("credits_origin_master_snapshot_v1")
    );
    expect(creditsBackfillQuery).toBeDefined();
    expect(creditsBackfillQuery?.sql).toContain("c.origin_master_broker_id IS NULL");
  });

  it("Zero Mutation on Repeated Restarts: running runAutoMigration multiple times preserves database state", async () => {
    process.env.USE_MEMORY_STORAGE = "false";

    // Run 1
    await runAutoMigration();
    const countRun1 = executedQueries.length;

    // Run 2
    executedQueries = [];
    await runAutoMigration();

    // Verify zero user mutations occurred on subsequent run
    const anyUserMutation = executedQueries.filter(q =>
      /UPDATE\s+public\.users\s+SET\s+(password|role|is_active|master_broker_id)\s*=/i.test(q.sql)
    );
    expect(anyUserMutation.length).toBe(0);

    const anyFinancialMutation = executedQueries.filter(q =>
      /(DELETE\s+FROM\s+public\.financial_institutions|UPDATE\s+public\.financial_institutions\s+SET\s+is_active)/i.test(q.sql)
    );
    expect(anyFinancialMutation.length).toBe(0);
  });
});
