#!/usr/bin/env node

const { Client } = require("pg");

const sourceUrl = process.env.SOURCE_DATABASE_URL;
const targetUrl = process.env.TARGET_DATABASE_URL;
const tableFilter = process.env.TABLES;

if (!sourceUrl || !targetUrl) {
  console.error("SOURCE_DATABASE_URL and TARGET_DATABASE_URL are required.");
  console.error("PowerShell example:");
  console.error("$env:SOURCE_DATABASE_URL='postgres://...'; $env:TARGET_DATABASE_URL='postgres://...'; npm run db:compare-counts");
  console.error("Bash example:");
  console.error("SOURCE_DATABASE_URL=postgres://... TARGET_DATABASE_URL=postgres://... npm run db:compare-counts");
  process.exit(1);
}

function parseTableFilter() {
  if (!tableFilter || !tableFilter.trim()) {
    return null;
  }

  return new Set(
    tableFilter
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean),
  );
}

async function getTables(client, filterSet) {
  const { rows } = await client.query(`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_type = 'BASE TABLE'
    order by table_name asc
  `);

  const tables = rows.map((row) => row.table_name);

  if (!filterSet) {
    return tables;
  }

  return tables.filter((name) => filterSet.has(name));
}

async function getRowCounts(client, tables) {
  const counts = new Map();

  for (const tableName of tables) {
    const escaped = `"${tableName.replace(/"/g, '""')}"`;
    const { rows } = await client.query(`select count(*)::bigint as count from public.${escaped}`);
    counts.set(tableName, Number(rows[0].count));
  }

  return counts;
}

async function run() {
  const sourceClient = new Client({ connectionString: sourceUrl });
  const targetClient = new Client({ connectionString: targetUrl });
  const filterSet = parseTableFilter();

  await sourceClient.connect();
  await targetClient.connect();

  try {
    const sourceTables = await getTables(sourceClient, filterSet);
    const targetTables = await getTables(targetClient, filterSet);

    const allTables = Array.from(new Set([...sourceTables, ...targetTables])).sort();
    if (allTables.length === 0) {
      console.log("No tables to compare.");
      return;
    }

    const [sourceCounts, targetCounts] = await Promise.all([
      getRowCounts(sourceClient, allTables),
      getRowCounts(targetClient, allTables),
    ]);

    let mismatches = 0;

    console.log("Table\tSource\tTarget\tDelta");
    for (const tableName of allTables) {
      const sourceCount = sourceCounts.get(tableName) ?? 0;
      const targetCount = targetCounts.get(tableName) ?? 0;
      const delta = targetCount - sourceCount;

      if (delta !== 0) {
        mismatches += 1;
      }

      console.log(`${tableName}\t${sourceCount}\t${targetCount}\t${delta}`);
    }

    if (mismatches > 0) {
      console.error(`Count comparison found ${mismatches} mismatched table(s).`);
      process.exitCode = 1;
      return;
    }

    console.log("Row-count comparison passed.");
  } finally {
    await Promise.allSettled([sourceClient.end(), targetClient.end()]);
  }
}

run().catch((error) => {
  console.error("db:compare-counts failed:", error);
  process.exit(1);
});
