#!/usr/bin/env node
/*
 * Validador E2E de flujo completo (staging)
 * 1) Login admin/super_admin
 * 2) Crear financiera + comisiones + perfiles
 * 3) Asignar plantilla a financiera
 * 4) Crear cliente
 * 5) Crear submission (cliente -> financiera)
 * 6) Aprobar target (admin)
 * 7) Registrar respuesta de institucion (approved + propuesta)
 * 8) Seleccionar ganador
 * 9) Marcar dispersado
 * 10) Validar credito y comisiones creadas
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
const reportPath = path.resolve(
  process.cwd(),
  process.env.FLUJO_COMPLETO_REPORT_PATH || "flujo-completo-report.json",
);

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
    throw new Error(
      "Define STAGING_AUTH_COOKIE o STAGING_EMAIL/STAGING_PASSWORD en .env.staging.local/.env.local",
    );
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
    throw new Error(`Login fallo (${response.status}): ${raw.slice(0, 400)}`);
  }

  const cookie = extractSessionCookie(response.headers);
  if (!cookie) {
    throw new Error("Login exitoso pero no se obtuvo cookie de sesion");
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
  const report = {
    startedAt: nowIso(),
    finishedAt: null,
    baseUrl,
    summary: {
      success: false,
      stepsPassed: 0,
      stepsFailed: 0,
    },
    ids: {
      userId: null,
      institutionId: null,
      templateId: null,
      institutionProductId: null,
      clientId: null,
      submissionId: null,
      targetId: null,
      creditId: null,
    },
    steps: [],
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

    const me = await apiJson("GET", "/api/auth/user", cookie);
    pushStep("auth.user", me);
    if (!me.ok) throw new Error("No se pudo validar sesion con /api/auth/user");

    const role = me.body?.role;
    const userId = me.body?.id;
    report.ids.userId = userId || null;

    if (!["admin", "super_admin"].includes(role)) {
      throw new Error(`Se requiere admin/super_admin para esta prueba. Rol actual: ${role || "desconocido"}`);
    }

    const suffix = Date.now();

    const templates = await apiJson("GET", "/api/product-templates", cookie);
    pushStep("productTemplates.list", templates);
    if (!templates.ok) throw new Error("No se pudieron listar plantillas");

    const templateList = Array.isArray(templates.body) ? templates.body : [];
    const template = templateList.find((t) => t && t.id);
    if (!template) throw new Error("No hay plantillas disponibles para la prueba");

    report.ids.templateId = template.id;

    const targetProfiles = Array.isArray(template.targetProfiles) ? template.targetProfiles : [];
    const primaryProfile =
      targetProfiles.find((p) => ["persona_moral", "fisica_empresarial", "fisica", "sin_sat"].includes(p)) ||
      "persona_moral";

    const institutionPayload = {
      name: `E2E Flujo Completo ${suffix}`,
      contactPerson: "QA Full Flow",
      email: `qa.fullflow.${suffix}@example.com`,
      phone: "5512345678",
      street: "Av Reforma",
      number: "100",
      interior: "10",
      city: "CDMX",
      postalCode: "06600",
      state: "CDMX",
      description: "Validacion automatica flujo completo",
      acceptedProfiles: [primaryProfile],
      commissionRates: {
        broker: {
          apertura: "2.50",
          sobretasa: "0",
          renovacion: "0",
          total: "2.50",
        },
        masterBroker: {
          apertura: "1.00",
          sobretasa: "0",
          renovacion: "0",
          total: "1.00",
        },
      },
    };

    const createInstitution = await apiJson("POST", "/api/financial-institutions", cookie, institutionPayload);
    pushStep("financialInstitutions.create", createInstitution, { payload: institutionPayload });
    if (!createInstitution.ok) throw new Error("No se pudo crear financiera de prueba");

    const institutionId = createInstitution.body?.id;
    if (!institutionId) throw new Error("La financiera creada no devolvio id");
    report.ids.institutionId = institutionId;

    const assignPayload = {
      templateId: template.id,
      institutionId,
      customName: `${template.name || "Producto"} E2E`,
      configuration: {},
      activeVariables: {},
    };

    const assign = await apiJson("POST", "/api/institution-products", cookie, assignPayload);
    pushStep("institutionProducts.assign", assign, { payload: assignPayload });
    if (!assign.ok) throw new Error("No se pudo asignar plantilla a financiera");

    report.ids.institutionProductId = assign.body?.id || null;

    const clientPayload = {
      type: primaryProfile,
      businessName: primaryProfile === "persona_moral" ? `Cliente PM ${suffix}` : undefined,
      firstName: primaryProfile === "persona_moral" ? undefined : "Cliente",
      lastName: primaryProfile === "persona_moral" ? undefined : `QA ${suffix}`,
      email: `cliente.qa.${suffix}@example.com`,
      phone: "5511111111",
      street: "Calle Prueba",
      number: "123",
      postalCode: "01000",
      state: "CDMX",
      industry: "servicios",
      yearsInBusiness: 3,
    };

    const createClient = await apiJson("POST", "/api/clients", cookie, clientPayload);
    pushStep("clients.create", createClient, { payload: clientPayload });
    if (!createClient.ok) throw new Error("No se pudo crear cliente de prueba");

    const clientId = createClient.body?.id;
    if (!clientId) throw new Error("El cliente creado no devolvio id");
    report.ids.clientId = clientId;

    const requestedAmount = "250000.00";

    const createSubmissionPayload = {
      clientId,
      productTemplateId: template.id,
      requestedAmount,
      purpose: "Capital de trabajo",
      brokerNotes: "Solicitud de prueba automatizada de flujo completo",
      financialInstitutionIds: [institutionId],
    };

    const createSubmission = await apiJson("POST", "/api/credit-submissions", cookie, createSubmissionPayload);
    pushStep("creditSubmissions.create", createSubmission, { payload: createSubmissionPayload });
    if (!createSubmission.ok) throw new Error("No se pudo crear credit submission");

    const submissionId = createSubmission.body?.submission?.id;
    const targetId = createSubmission.body?.targets?.[0]?.id;

    if (!submissionId || !targetId) {
      throw new Error("La creacion del submission no devolvio submission.id o target.id");
    }

    report.ids.submissionId = submissionId;
    report.ids.targetId = targetId;

    const approveTarget = await apiJson("PATCH", `/api/credit-submission-targets/${targetId}/approve`, cookie, {
      adminNotes: "Aprobado por validacion automatizada",
      details: "Enviar propuesta formal a institucion",
    });
    pushStep("creditSubmissionTargets.approve", approveTarget);
    if (!approveTarget.ok) throw new Error("No se pudo aprobar target por admin");

    const institutionProposalPayload = {
      approved: true,
      adminNotes: "Respuesta de institucion registrada en prueba automatizada",
      proposal: {
        approvedAmount: Number(requestedAmount),
        interestRate: 24,
        term: 24,
        openingCommission: 2.5,
      },
    };

    const institutionResponse = await apiJson(
      "PATCH",
      `/api/credit-submission-targets/${targetId}/mark-institution-response`,
      cookie,
      institutionProposalPayload,
    );
    pushStep("creditSubmissionTargets.markInstitutionResponse", institutionResponse, {
      payload: institutionProposalPayload,
    });
    if (!institutionResponse.ok) throw new Error("No se pudo registrar respuesta de institucion");

    const selectWinner = await apiJson("PATCH", `/api/credit-submission-targets/${targetId}/select-winner`, cookie, {});
    pushStep("creditSubmissionTargets.selectWinner", selectWinner);
    if (!selectWinner.ok) throw new Error("No se pudo seleccionar ganador");

    const creditId = selectWinner.body?.credit?.id;
    if (!creditId) throw new Error("No se genero credito al seleccionar ganador");
    report.ids.creditId = creditId;

    const markDispersed = await apiJson("PATCH", `/api/credit-submission-targets/${targetId}/mark-dispersed`, cookie, {});
    pushStep("creditSubmissionTargets.markDispersed", markDispersed);
    if (!markDispersed.ok) throw new Error("No se pudo marcar como dispersado");

    const credits = await apiJson("GET", "/api/credits", cookie);
    pushStep("credits.list", credits);
    if (!credits.ok) throw new Error("No se pudo listar creditos para validacion");

    const creditList = Array.isArray(credits.body) ? credits.body : [];
    const credit = creditList.find((item) => item && item.id === creditId);
    if (!credit) throw new Error("El credito generado no aparece en /api/credits");

    if (credit.status !== "disbursed" && credit.status !== "dispersado") {
      throw new Error(`Estatus de credito inesperado: ${credit.status}`);
    }

    const commissions = await apiJson("GET", "/api/commissions", cookie);
    pushStep("commissions.list", commissions);
    if (!commissions.ok) throw new Error("No se pudieron listar comisiones");

    const commissionList = Array.isArray(commissions.body) ? commissions.body : [];
    const creditCommissions = commissionList.filter((c) => c && c.creditId === creditId);

    if (creditCommissions.length === 0) {
      throw new Error("No se generaron comisiones para el credito dispersado");
    }

    const brokerOpening = creditCommissions.find(
      (c) => c.commissionType === "apertura" && Number(c.brokerShare || 0) > 0,
    );

    if (!brokerOpening) {
      throw new Error("No se encontro comision de apertura para broker");
    }

    report.summary.success = true;
    report.finishedAt = nowIso();
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

    console.log("[ok] Flujo completo validado correctamente");
    console.log(`[ok] Cliente: ${clientId}`);
    console.log(`[ok] Submission: ${submissionId}`);
    console.log(`[ok] Target: ${targetId}`);
    console.log(`[ok] Credito: ${creditId}`);
    console.log(`[ok] Comisiones para credito: ${creditCommissions.length}`);
    console.log(`[ok] Reporte: ${reportPath}`);
    process.exit(0);
  } catch (error) {
    report.summary.success = false;
    report.finishedAt = nowIso();
    report.error = {
      message: error.message || String(error),
    };

    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

    console.error(`[error] ${report.error.message}`);
    console.error(`[error] Revisa reporte: ${reportPath}`);
    process.exit(1);
  }
})();

