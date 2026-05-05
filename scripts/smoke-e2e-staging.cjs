#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const baseUrl = (process.env.BACKEND_URL || "").replace(/\/$/, "");
const reportPath = process.env.E2E_GAP_REPORT_PATH || "e2e-gap-report.json";
const minPerProfile = Number(process.env.E2E_MIN_CASES_PER_PROFILE || "2");

const ALLOWED_COMMISSION_TYPES = new Set(["apertura", "sobretasa", "renovacion", "total", null, undefined]);
const ALLOWED_COMMISSION_STATUS = new Set(["pending", "paid", "advance_requested", "advance_paid"]);

function assertEnvOrThrow() {
  if (!baseUrl) {
    throw new Error("BACKEND_URL es requerido para smoke E2E staging");
  }
}

function extractSessionCookie(setCookieHeaders) {
  if (!Array.isArray(setCookieHeaders) || setCookieHeaders.length === 0) return "";
  return setCookieHeaders
    .map((entry) => String(entry).split(";")[0])
    .filter(Boolean)
    .join("; ");
}

async function authenticate() {
  if (process.env.STAGING_AUTH_COOKIE) {
    return process.env.STAGING_AUTH_COOKIE;
  }

  const email = process.env.STAGING_EMAIL;
  const password = process.env.STAGING_PASSWORD;

  if (!email || !password) {
    throw new Error("Define STAGING_AUTH_COOKIE o STAGING_EMAIL/STAGING_PASSWORD para ejecutar smoke E2E");
  }

  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Login falló (${response.status}): ${body.slice(0, 300)}`);
  }

  const setCookie = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
  const cookie = extractSessionCookie(setCookie);
  if (!cookie) throw new Error("No se obtuvo cookie de sesión tras login");

  return cookie;
}

async function apiGet(route, cookie) {
  const response = await fetch(`${baseUrl}${route}`, {
    method: "GET",
    headers: {
      cookie,
      accept: "application/json",
    },
  });

  const raw = await response.text();
  let json;
  try {
    json = raw ? JSON.parse(raw) : null;
  } catch {
    json = { raw };
  }

  return {
    ok: response.ok,
    status: response.status,
    body: json,
  };
}

function addFinding(collection, severity, code, message, detail = {}) {
  collection.push({ severity, code, message, detail });
}

function collectProfileCoverage(clients) {
  const buckets = {
    persona_moral: 0,
    fisica_empresarial: 0,
    fisica: 0,
    sin_sat: 0,
  };

  for (const client of clients || []) {
    const type = String(client.type || "").toLowerCase();
    if (buckets[type] !== undefined) {
      buckets[type] += 1;
    }
  }

  return buckets;
}

function checkInstitutionProductCoherence(financieras, institutionProducts) {
  const findings = [];
  const institutionMap = new Map((financieras || []).map((f) => [f.id, f]));

  for (const product of institutionProducts || []) {
    const institution = institutionMap.get(product.institutionId);
    if (!institution) {
      addFinding(findings, "high", "PRODUCT_WITHOUT_INSTITUTION", "Producto institucional sin financiera asociada", {
        productId: product.id,
      });
      continue;
    }

    if (product.isActive && institution.isActive === false) {
      addFinding(findings, "critical", "ACTIVE_PRODUCT_IN_INACTIVE_INSTITUTION", "Producto activo en financiera inactiva", {
        institutionId: institution.id,
        institutionName: institution.name,
        productId: product.id,
      });
    }

    const profiles = Array.isArray(product.targetProfiles) ? product.targetProfiles : [];
    if (profiles.length === 0) {
      addFinding(findings, "medium", "PRODUCT_WITHOUT_TARGET_PROFILES", "Producto sin perfiles objetivo definidos", {
        productId: product.id,
      });
    }
  }

  return findings;
}

function checkCommissionData(commissions) {
  const findings = [];

  for (const c of commissions || []) {
    if (!ALLOWED_COMMISSION_TYPES.has(c.commissionType)) {
      addFinding(findings, "high", "INVALID_COMMISSION_TYPE", "Tipo de comisión inválido", {
        commissionId: c.id,
        commissionType: c.commissionType,
      });
    }

    if (!ALLOWED_COMMISSION_STATUS.has(c.status)) {
      addFinding(findings, "high", "INVALID_COMMISSION_STATUS", "Estatus de comisión inválido", {
        commissionId: c.id,
        status: c.status,
      });
    }

    const amount = Number(c.amount || 0);
    if (!Number.isFinite(amount) || amount < 0) {
      addFinding(findings, "high", "INVALID_COMMISSION_AMOUNT", "Monto de comisión inválido", {
        commissionId: c.id,
        amount: c.amount,
      });
    }
  }

  return findings;
}

function checkFlowConsistency(targets, credits, commissions) {
  const findings = [];
  const creditsMap = new Map((credits || []).map((c) => [c.id, c]));
  const commissionByCredit = new Map();

  for (const c of commissions || []) {
    const bucket = commissionByCredit.get(c.creditId) || [];
    bucket.push(c);
    commissionByCredit.set(c.creditId, bucket);
  }

  const dispersedTargets = (targets || []).filter((t) => t.status === "dispersed");

  for (const target of dispersedTargets) {
    if (!target.creditId) {
      addFinding(findings, "critical", "DISPERSED_WITHOUT_CREDIT", "Target dispersado sin creditId", {
        targetId: target.id,
      });
      continue;
    }

    const credit = creditsMap.get(target.creditId);
    if (!credit) {
      addFinding(findings, "critical", "DISPERSED_CREDIT_NOT_FOUND", "Target dispersado apunta a crédito inexistente", {
        targetId: target.id,
        creditId: target.creditId,
      });
      continue;
    }

    const creditCommissions = commissionByCredit.get(target.creditId) || [];
    if (creditCommissions.length === 0) {
      addFinding(findings, "high", "DISPERSED_WITHOUT_COMMISSIONS", "Crédito dispersado sin comisiones", {
        targetId: target.id,
        creditId: target.creditId,
      });
    }
  }

  return findings;
}

async function run() {
  const startedAt = new Date().toISOString();
  assertEnvOrThrow();

  const cookie = await authenticate();

  const endpoints = {
    health: await apiGet("/api/health", cookie),
    authUser: await apiGet("/api/auth/user", cookie),
    financieras: await apiGet("/api/financial-institutions", cookie),
    templates: await apiGet("/api/product-templates", cookie),
    institutionProducts: await apiGet("/api/institution-products", cookie),
    clients: await apiGet("/api/clients", cookie),
    submissionTargets: await apiGet("/api/credit-submission-targets", cookie),
    credits: await apiGet("/api/credits", cookie),
    commissions: await apiGet("/api/commissions", cookie),
  };

  const findings = [];

  for (const [name, result] of Object.entries(endpoints)) {
    if (!result.ok) {
      addFinding(findings, "critical", "ENDPOINT_UNAVAILABLE", `Endpoint ${name} no disponible`, {
        status: result.status,
      });
    }
  }

  const financieras = endpoints.financieras.body || [];
  const templates = endpoints.templates.body || [];
  const institutionProducts = endpoints.institutionProducts.body || [];
  const clients = endpoints.clients.body || [];
  const targets = endpoints.submissionTargets.body || [];
  const credits = endpoints.credits.body || [];
  const commissions = endpoints.commissions.body || [];

  if (Array.isArray(financieras) && financieras.length === 0) {
    addFinding(findings, "high", "NO_FINANCIERAS", "No hay financieras cargadas en staging", {});
  }

  if (Array.isArray(templates) && templates.length === 0) {
    addFinding(findings, "high", "NO_TEMPLATES", "No hay plantillas de producto cargadas", {});
  }

  if (Array.isArray(institutionProducts) && institutionProducts.length === 0) {
    addFinding(findings, "high", "NO_INSTITUTION_PRODUCTS", "No hay productos asignados a financieras", {});
  }

  const profileCoverage = collectProfileCoverage(Array.isArray(clients) ? clients : []);
  for (const [profile, count] of Object.entries(profileCoverage)) {
    if (count < minPerProfile) {
      addFinding(findings, "medium", "PROFILE_CASE_COVERAGE_LOW", `Cobertura baja para perfil ${profile}`, {
        profile,
        count,
        minRequired: minPerProfile,
      });
    }
  }

  findings.push(...checkInstitutionProductCoherence(Array.isArray(financieras) ? financieras : [], Array.isArray(institutionProducts) ? institutionProducts : []));
  findings.push(...checkCommissionData(Array.isArray(commissions) ? commissions : []));
  findings.push(...checkFlowConsistency(Array.isArray(targets) ? targets : [], Array.isArray(credits) ? credits : [], Array.isArray(commissions) ? commissions : []));

  const summary = {
    totalFindings: findings.length,
    critical: findings.filter((f) => f.severity === "critical").length,
    high: findings.filter((f) => f.severity === "high").length,
    medium: findings.filter((f) => f.severity === "medium").length,
    low: findings.filter((f) => f.severity === "low").length,
  };

  const report = {
    startedAt,
    finishedAt: new Date().toISOString(),
    baseUrl,
    minPerProfile,
    endpointStatus: Object.fromEntries(
      Object.entries(endpoints).map(([name, result]) => [name, { ok: result.ok, status: result.status }]),
    ),
    inventory: {
      financieras: Array.isArray(financieras) ? financieras.length : 0,
      templates: Array.isArray(templates) ? templates.length : 0,
      institutionProducts: Array.isArray(institutionProducts) ? institutionProducts.length : 0,
      clients: Array.isArray(clients) ? clients.length : 0,
      submissionTargets: Array.isArray(targets) ? targets.length : 0,
      credits: Array.isArray(credits) ? credits.length : 0,
      commissions: Array.isArray(commissions) ? commissions.length : 0,
      profileCoverage,
    },
    summary,
    findings,
  };

  fs.writeFileSync(path.resolve(process.cwd(), reportPath), JSON.stringify(report, null, 2), "utf8");

  if (summary.critical > 0) {
    console.error(`[result] smoke E2E con fallas críticas (${summary.critical}). Revisa ${reportPath}`);
    process.exit(1);
  }

  if (summary.high > 0) {
    console.error(`[result] smoke E2E con fallas altas (${summary.high}). Revisa ${reportPath}`);
    process.exit(1);
  }

  console.log(`[result] smoke E2E aprobado. Reporte: ${reportPath}`);
}

run().catch((error) => {
  console.error("[error]", error.message || error);
  process.exit(1);
});
