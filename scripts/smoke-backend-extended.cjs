#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const defaultBaseUrl = "http://127.0.0.1:5000";
const baseUrl = (process.env.BACKEND_URL || defaultBaseUrl).replace(/\/$/, "");
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS || "8000");
const reportPath = process.env.SMOKE_REPORT_PATH || "smoke-report.json";

const checks = [
  { method: "GET", route: "/api/health", expected: [200] },
  { method: "GET", route: "/api/auth/user", expected: [200, 401] },
  { method: "GET", route: "/api/clients", expected: [200, 401] },
  { method: "GET", route: "/api/credits", expected: [200, 401] },
  { method: "GET", route: "/api/documents", expected: [200, 401] },
  { method: "GET", route: "/api/dashboard/metrics", expected: [200, 401] },
];

console.log(`[info] Running extended smoke test against ${baseUrl}`);
console.log(`[info] Report output: ${reportPath}`);

async function request(check) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  try {
    const response = await fetch(`${baseUrl}${check.route}`, {
      method: check.method,
      headers: {
        accept: "application/json",
      },
      signal: controller.signal,
    });

    const body = await response.text();
    return {
      ok: check.expected.includes(response.status),
      status: response.status,
      bodyPreview: body.slice(0, 400),
      durationMs: Date.now() - startedAt,
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      bodyPreview: "",
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function run() {
  const results = [];
  let failures = 0;

  for (const check of checks) {
    const result = await request(check);
    const row = {
      ...check,
      ...result,
    };

    // Keep expected statuses in report for easier troubleshooting.
    row.expected = check.expected;
    results.push(row);

    if (!row.ok) {
      failures += 1;
      console.error(`[fail] ${check.method} ${check.route} status=${row.status} error=${row.error || "none"}`);
    } else {
      console.log(`[ok] ${check.method} ${check.route} status=${row.status} (${row.durationMs}ms)`);
    }
  }

  const report = {
    timestamp: new Date().toISOString(),
    baseUrl,
    timeoutMs,
    summary: {
      total: results.length,
      failures,
      passed: results.length - failures,
    },
    results,
  };

  fs.writeFileSync(path.resolve(process.cwd(), reportPath), JSON.stringify(report, null, 2), "utf8");

  if (failures > 0) {
    console.error(`Extended smoke test failed with ${failures} issue(s).`);
    process.exit(1);
  }

  console.log("Extended smoke test passed.");
}

run().catch((error) => {
  console.error("Extended smoke test error:", error);
  console.error("Hint: set BACKEND_URL to your deployed API if testing remote.");
  process.exit(1);
});
