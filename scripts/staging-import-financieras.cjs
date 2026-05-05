#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const baseUrl = (process.env.BACKEND_URL || "").replace(/\/$/, "");
const batchSize = Number(process.env.IMPORT_BATCH_SIZE || "100");
const reportPath = process.env.IMPORT_REPORT_PATH || "import-financieras-report.json";
const strictMode = (process.env.IMPORT_STRICT_MODE || "true").toLowerCase() !== "false";

const FINANCIERA_HEADERS = [
  "nombre_financiera",
  "tipo_producto",
  "perfil_cliente",
  "monto_minimo",
  "monto_maximo",
  "plazo_meses",
  "tasa_interes",
  "comision_apertura",
  "destinos_credito",
  "edad_minima",
  "edad_maxima",
  "antiguedad_meses_min",
  "ingreso_mensual_min",
  "buro_accionista_min",
  "buro_empresa_min",
  "buro_persona_fisica_min",
  "tipo_garantia",
  "opinion_cumplimiento",
  "participacion_ventas_gob_max",
  "giros_prohibidos",
  "presencia",
  "tiempo_respuesta",
  "comision_apertura_broker",
  "comision_sobretasa_broker",
  "comision_renovacion_broker",
  "comision_apertura_master",
  "comision_sobretasa_master",
  "comision_renovacion_master",
  "contacto",
  "email_contacto",
  "telefono_contacto",
  "observaciones",
];

const REQUIRED_FIELDS = ["nombre_financiera", "tipo_producto", "perfil_cliente"];
const VALID_PROFILES = new Set(["persona_moral", "fisica_empresarial", "fisica", "sin_sat"]);

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = { file: "", sheet: "Financieras" };

  for (let i = 0; i < args.length; i += 1) {
    const current = args[i];
    if (current === "--file") {
      parsed.file = args[i + 1] || "";
      i += 1;
    } else if (current === "--sheet") {
      parsed.sheet = args[i + 1] || "Financieras";
      i += 1;
    }
  }

  return parsed;
}

function assertEnvOrThrow() {
  if (!baseUrl) {
    throw new Error("BACKEND_URL es requerido. Ejemplo: https://staging-api.example.com");
  }
}

function normalizeProfile(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
}

function parseSheet(filePath, sheetName) {
  const wb = XLSX.readFile(filePath);
  const actualSheet = wb.Sheets[sheetName] ? sheetName : (wb.SheetNames.find((n) => n !== "Instrucciones") || wb.SheetNames[0]);
  const ws = wb.Sheets[actualSheet];
  const matrix = XLSX.utils.sheet_to_json(ws, { header: 1 });

  if (!Array.isArray(matrix) || matrix.length < 2) {
    throw new Error("El archivo no contiene filas de datos en la hoja seleccionada");
  }

  const headers = matrix[0].map((h) => String(h || "").trim().toLowerCase());
  const rows = matrix.slice(1).filter((row) => Array.isArray(row) && row.some((cell) => cell !== undefined && cell !== null && String(cell).trim() !== ""));

  return { headers, rows, actualSheet };
}

function validateLocally(headers, rows) {
  const errors = [];
  const warnings = [];

  const missingHeaders = FINANCIERA_HEADERS.filter((h) => !headers.includes(h));
  if (missingHeaders.length > 0) {
    warnings.push(`Faltan columnas del template: ${missingHeaders.join(", ")}`);
  }

  for (let idx = 0; idx < rows.length; idx += 1) {
    const row = rows[idx];
    const rowNum = idx + 2;

    for (const field of REQUIRED_FIELDS) {
      const col = headers.indexOf(field);
      const value = col >= 0 ? row[col] : undefined;
      if (value === undefined || value === null || String(value).trim() === "") {
        errors.push({ row: rowNum, field, message: "Campo obligatorio vacío", value });
      }
    }

    const profileIdx = headers.indexOf("perfil_cliente");
    if (profileIdx >= 0) {
      const normalized = normalizeProfile(row[profileIdx]);
      if (normalized && !VALID_PROFILES.has(normalized)) {
        errors.push({
          row: rowNum,
          field: "perfil_cliente",
          message: "Perfil inválido. Permitidos: persona_moral, fisica_empresarial, fisica, sin_sat",
          value: row[profileIdx],
        });
      }
    }
  }

  return { errors, warnings };
}

function makeWorkbookBuffer(headers, rows) {
  const wb = XLSX.utils.book_new();
  const data = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, "Financieras");
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

function splitInBatches(rows, size) {
  const chunks = [];
  for (let i = 0; i < rows.length; i += size) {
    chunks.push(rows.slice(i, i + size));
  }
  return chunks;
}

function extractSessionCookie(setCookieHeaders) {
  if (!Array.isArray(setCookieHeaders) || setCookieHeaders.length === 0) return "";
  return setCookieHeaders
    .map((entry) => String(entry).split(";")[0])
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
    throw new Error("Define STAGING_AUTH_COOKIE o STAGING_EMAIL/STAGING_PASSWORD para autenticar el import");
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
  if (!cookie) {
    throw new Error("Login exitoso pero no se obtuvo cookie de sesión");
  }

  return cookie;
}

async function callImportEndpoint(route, buffer, cookie) {
  const form = new FormData();
  form.append("file", new Blob([buffer]), "financieras_batch.xlsx");

  const response = await fetch(`${baseUrl}${route}`, {
    method: "POST",
    headers: {
      cookie,
      accept: "application/json",
    },
    body: form,
  });

  const raw = await response.text();
  let json;
  try {
    json = raw ? JSON.parse(raw) : {};
  } catch {
    json = { raw };
  }

  if (!response.ok) {
    return { ok: false, status: response.status, body: json };
  }

  return { ok: true, status: response.status, body: json };
}

async function run() {
  const startedAt = new Date().toISOString();
  const args = parseArgs();

  assertEnvOrThrow();

  if (!args.file) {
    throw new Error("Uso: node scripts/staging-import-financieras.cjs --file <ruta.xlsx>");
  }

  const fullPath = path.resolve(process.cwd(), args.file);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Archivo no encontrado: ${fullPath}`);
  }

  const { headers, rows, actualSheet } = parseSheet(fullPath, args.sheet);
  const localValidation = validateLocally(headers, rows);

  if (strictMode && localValidation.errors.length > 0) {
    const report = {
      startedAt,
      finishedAt: new Date().toISOString(),
      baseUrl,
      file: fullPath,
      sheet: actualSheet,
      strictMode,
      summary: {
        totalRows: rows.length,
        imported: 0,
        failed: rows.length,
        batches: 0,
      },
      localValidation,
      batches: [],
    };

    fs.writeFileSync(path.resolve(process.cwd(), reportPath), JSON.stringify(report, null, 2), "utf8");
    throw new Error(`Validación local falló con ${localValidation.errors.length} errores. Revisa ${reportPath}`);
  }

  const cookie = await loginAndGetCookie();
  const batches = splitInBatches(rows, Math.max(batchSize, 1));
  const batchReports = [];
  let totalImported = 0;
  let totalRemoteErrors = 0;

  console.log(`[info] Archivo: ${fullPath}`);
  console.log(`[info] Hoja: ${actualSheet}`);
  console.log(`[info] Filas: ${rows.length}`);
  console.log(`[info] Batches: ${batches.length} (size=${batchSize})`);

  for (let i = 0; i < batches.length; i += 1) {
    const chunk = batches[i];
    const buffer = makeWorkbookBuffer(headers, chunk);
    const batchNo = i + 1;

    const preview = await callImportEndpoint("/api/import/preview/financieras", buffer, cookie);
    if (!preview.ok) {
      batchReports.push({ batch: batchNo, rows: chunk.length, preview, import: null });
      totalRemoteErrors += chunk.length;
      console.error(`[fail] batch ${batchNo}: preview status ${preview.status}`);
      continue;
    }

    const imported = await callImportEndpoint("/api/import/financieras", buffer, cookie);
    batchReports.push({ batch: batchNo, rows: chunk.length, preview, import: imported });

    if (!imported.ok) {
      totalRemoteErrors += chunk.length;
      console.error(`[fail] batch ${batchNo}: import status ${imported.status}`);
      continue;
    }

    const importedCount = Number(imported.body?.imported || 0);
    const errorsCount = Array.isArray(imported.body?.errors) ? imported.body.errors.length : 0;

    totalImported += importedCount;
    totalRemoteErrors += errorsCount;

    console.log(`[ok] batch ${batchNo}: imported=${importedCount} errors=${errorsCount}`);
  }

  const report = {
    startedAt,
    finishedAt: new Date().toISOString(),
    baseUrl,
    file: fullPath,
    sheet: actualSheet,
    strictMode,
    summary: {
      totalRows: rows.length,
      imported: totalImported,
      failed: Math.max(rows.length - totalImported, 0),
      batches: batches.length,
      localErrors: localValidation.errors.length,
      remoteErrors: totalRemoteErrors,
    },
    localValidation,
    batches: batchReports,
  };

  fs.writeFileSync(path.resolve(process.cwd(), reportPath), JSON.stringify(report, null, 2), "utf8");

  if (totalRemoteErrors > 0) {
    console.error(`[result] import completado con errores. Revisa ${reportPath}`);
    process.exit(1);
  }

  console.log(`[result] import staging exitoso. Reporte: ${reportPath}`);
}

run().catch((error) => {
  console.error("[error]", error.message || error);
  process.exit(1);
});
