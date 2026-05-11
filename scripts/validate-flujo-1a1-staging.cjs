#!/usr/bin/env node
/*
 * Validador E2E de flujo 1 a 1 (sin plantilla masiva)
 * 1) Login (cookie)
 * 2) Crear financiera
 * 3) Obtener plantillas
 * 4) Asignar 1 producto a la financiera
 * 5) Verificar que el producto aparece por institutionId
 */

const fs = require("fs");
const path = require("path");

function loadLocalEnvFiles() {
  const files = [
    path.resolve(process.cwd(), ".env.staging.local"),
    path.resolve(process.cwd(), ".env.local"),
  ];

  for (const file of files) {
    if (!fs.existsSync(file)) continue;

    const content = fs.readFileSync(file, "utf8");
    const lines = content.split(/\r?\n/);

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const idx = trimmed.indexOf("=");
      if (idx <= 0) continue;

      const key = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim().replace(/^['\"]|['\"]$/g, "");

      if (!key) continue;
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
}

loadLocalEnvFiles();

const baseUrl = (process.env.BACKEND_URL || "https://creditonegocios-staging.up.railway.app").replace(/\/$/, "");
const reportPath = path.resolve(process.cwd(), process.env.FLUJO_1A1_REPORT_PATH || "flujo-1a1-report.json");

function nowIso() {
  return new Date().toISOString();
}

function extractSessionCookie(headers) {
  if (!headers) return "";

  if (typeof headers.getSetCookie === "function") {
    const cookies = headers.getSetCookie();
    if (Array.isArray(cookies) && cookies.length > 0) {
      return cookies
        .map((entry) => String(entry).split(";")[0])
        .filter(Boolean)
        .join("; ");
    }
  }

  const raw = headers.get("set-cookie");
  if (!raw) return "";
  return String(raw)
    .split(",")
    .map((entry) => entry.split(";")[0].trim())
    .filter(Boolean)
    .join("; ");
}

async function loginAndGetCookie() {
  if (process.env.STAGING_AUTH_COOKIE) {
    return process.env.STAGING_AUTH_COOKIE;
  }

  const email = process.env.STAGING_EMAIL;
  const password = process.env.STAGING_PASSWORD;

  if (!email || !password) {
    throw new Error("Define STAGING_AUTH_COOKIE o STAGING_EMAIL/STAGING_PASSWORD (puedes guardarlo en .env.staging.local o .env.local)");
  }

  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`Login fallo (${response.status}): ${raw.slice(0, 300)}`);
  }

  const cookie = extractSessionCookie(response.headers);
  if (!cookie) {
    throw new Error("Login exitoso pero sin cookie de sesion");
  }

  return cookie;
}

async function apiJson(method, route, cookie, body) {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      accept: "application/json",
      cookie,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const raw = await response.text();
  let json;
  try {
    json = raw ? JSON.parse(raw) : {};
  } catch {
    json = { raw };
  }

  return {
    ok: response.ok,
    status: response.status,
    body: json,
  };
}

(async () => {
  const startedAt = nowIso();
  const report = {
    startedAt,
    finishedAt: null,
    baseUrl,
    summary: {
      success: false,
      stepsPassed: 0,
      stepsFailed: 0,
    },
    steps: [],
    ids: {
      institutionId: null,
      templateId: null,
      assignmentId: null,
    },
  };

  function pushStep(name, result, meta = {}) {
    const step = {
      name,
      ok: !!result.ok,
      status: result.status,
      at: nowIso(),
      ...meta,
      body: result.body,
    };
    report.steps.push(step);
    if (step.ok) report.summary.stepsPassed += 1;
    else report.summary.stepsFailed += 1;
    return step;
  }

  try {
    const cookie = await loginAndGetCookie();

    const me = await apiJson("GET", "/api/auth/me", cookie);
    pushStep("auth.me", me);
    if (!me.ok) throw new Error("No se pudo validar sesion con /api/auth/me");

    const role = me.body?.role;
    if (!["admin", "super_admin"].includes(role)) {
      throw new Error(`El usuario autenticado debe ser admin/super_admin. Rol actual: ${role || "desconocido"}`);
    }

    const suffix = Date.now();
    const institutionPayload = {
      name: `Flujo 1a1 ${suffix}`,
      contactPerson: "QA Flujo",
      email: `qa.flujo.${suffix}@example.com`,
      phone: "5512345678",
      street: "Av Reforma",
      number: "100",
      interior: "10",
      city: "CDMX",
      postalCode: "06600",
      state: "CDMX",
      description: "Validacion automatica flujo 1 a 1",
    };

    const createInstitution = await apiJson("POST", "/api/financial-institutions", cookie, institutionPayload);
    pushStep("financialInstitutions.create", createInstitution, { payload: institutionPayload });
    if (!createInstitution.ok) throw new Error("Fallo crear financiera en flujo 1 a 1");

    const institutionId = createInstitution.body?.id;
    if (!institutionId) throw new Error("Respuesta de crear financiera no contiene id");
    report.ids.institutionId = institutionId;

    const templates = await apiJson("GET", "/api/product-templates", cookie);
    pushStep("productTemplates.list", templates);
    if (!templates.ok) throw new Error("Fallo listar plantillas de producto");

    const templateList = Array.isArray(templates.body) ? templates.body : [];
    const firstTemplate = templateList.find((t) => t && t.id);
    if (!firstTemplate) throw new Error("No hay plantillas disponibles para asignar");

    report.ids.templateId = firstTemplate.id;

    const assignPayload = {
      templateId: firstTemplate.id,
      institutionId,
      customName: `${firstTemplate.name || "Producto"} - Flujo1a1`,
      configuration: {},
      activeVariables: {},
    };

    const assign = await apiJson("POST", "/api/institution-products", cookie, assignPayload);
    pushStep("institutionProducts.assign", assign, { payload: assignPayload });
    if (!assign.ok) throw new Error("Fallo asignar producto a financiera");

    report.ids.assignmentId = assign.body?.id || null;

    const verify = await apiJson("GET", `/api/institution-products?institutionId=${institutionId}`, cookie);
    pushStep("institutionProducts.verifyByInstitution", verify);
    if (!verify.ok) throw new Error("Fallo consulta de productos por financiera");

    const assigned = Array.isArray(verify.body) ? verify.body : [];
    const found = assigned.some((item) => item && item.institutionId === institutionId && item.templateId === firstTemplate.id);
    if (!found) {
      throw new Error("Asignacion no visible en GET /api/institution-products?institutionId=...");
    }

    report.summary.success = true;
    report.finishedAt = nowIso();
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log("[ok] Flujo 1 a 1 validado correctamente");
    console.log(`[ok] Institucion: ${institutionId}`);
    console.log(`[ok] Plantilla: ${firstTemplate.id}`);
    console.log(`[ok] Reporte: ${reportPath}`);
    process.exit(0);
  } catch (error) {
    report.summary.success = false;
    report.finishedAt = nowIso();
    report.error = {
      message: error.message || String(error),
    };
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.error(`[error] ${report.error.message}`);
    console.error(`[error] Revisa reporte: ${reportPath}`);
    process.exit(1);
  }
})();
