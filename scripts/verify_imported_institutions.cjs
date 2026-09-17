const baseUrl = process.env.BACKEND_URL || "https://creditonegocios-staging.up.railway.app";
const email = process.env.STAGING_EMAIL || "francocb79@gmail.com";
const password = process.env.STAGING_PASSWORD;

if (!password) {
  console.error("ERROR: Debes definir la variable de entorno STAGING_PASSWORD antes de ejecutar este script.");
  console.error("Ejemplo (PowerShell):");
  console.error('  $env:STAGING_PASSWORD = "tu_password"');
  console.error("  node scripts/verify_imported_institutions.cjs\n");
  process.exit(1);
}

async function run() {
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!loginRes.ok) {
    throw new Error(`Login falló: ${loginRes.status}`);
  }

  const setCookie = loginRes.headers.getSetCookie ? loginRes.headers.getSetCookie() : [];
  const cookie = setCookie.map((entry) => String(entry).split(";")[0]).join("; ");

  const res = await fetch(`${baseUrl}/api/financial-institutions`, {
    headers: { cookie },
  });

  if (!res.ok) {
    throw new Error(`Error al obtener financieras: ${res.status}`);
  }

  const data = await res.json();
  console.log(`\n=== Total de Financieras en Plataforma: ${data.length} ===`);
  data.forEach((fi, idx) => {
    const comm = fi.commissionRates || {};
    const fin = comm.financiera || {};
    console.log(`${idx + 1}. [${fi.id.slice(0, 8)}...] ${fi.name} | Apertura: ${fin.apertura || fi.openingCommissionRate || 'N/A'}% | Total: ${fin.total || 'N/A'}% | Perfiles: ${(fi.acceptedProfiles || []).join(', ')}`);
  });
}

run().catch(console.error);
