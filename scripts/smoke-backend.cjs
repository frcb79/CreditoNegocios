#!/usr/bin/env node

const defaultBaseUrl = "http://127.0.0.1:5000";
const baseUrl = (process.env.BACKEND_URL || defaultBaseUrl).replace(/\/$/, "");
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS || "8000");

console.log(`[info] Running smoke test against ${baseUrl}`);

async function request(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      signal: controller.signal,
    });
    const text = await response.text();
    return { response, text };
  } finally {
    clearTimeout(timer);
  }
}

async function run() {
  let failures = 0;

  const health = await request("/api/health");
  if (!health.response.ok) {
    failures += 1;
    console.error("[fail] GET /api/health", health.response.status, health.text);
  } else {
    console.log("[ok] GET /api/health");
  }

  const user = await request("/api/auth/user", {
    headers: {
      accept: "application/json",
    },
  });

  // Expected for unauthenticated requests.
  if (user.response.status === 401 || user.response.status === 200) {
    console.log(`[ok] GET /api/auth/user (${user.response.status})`);
  } else {
    failures += 1;
    console.error("[fail] GET /api/auth/user", user.response.status, user.text);
  }

  if (failures > 0) {
    console.error(`Smoke test failed with ${failures} issue(s).`);
    process.exit(1);
  }

  console.log("Smoke test passed.");
}

run().catch((error) => {
  console.error("Smoke test error:", error);
  console.error("Hint: set BACKEND_URL to your deployed API if testing remote.");
  process.exit(1);
});
