const baseUrl = process.env.BACKEND_URL || "https://creditonegocios-staging.up.railway.app";
const email = process.env.STAGING_EMAIL || "francocb79@gmail.com";
const password = process.env.STAGING_PASSWORD || "Prueba1$";


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
  console.log(`\n========================================================`);
  console.log(`📡 CONECTADO A: ${baseUrl}`);
  console.log(`👤 USUARIO: ${email}`);
  console.log(`📊 TOTAL INSTITUCIONES DEVUELTAS: ${data.length}`);
  console.log(`========================================================\n`);

  // Target institutions check
  const targets = ["Jeeves", "Kapital", "Altum", "Cualli", "Aspiria", "Pretmex"];
  console.log(`=== ESTADO DE FINANCIERAS OBJETIVO ===`);
  targets.forEach(t => {
    const matches = data.filter(fi => fi.name.trim().toLowerCase() === t.toLowerCase() || fi.name.toLowerCase().includes(t.toLowerCase()));
    if (matches.length === 1) {
      const fi = matches[0];
      console.log(`  ✅ ${t}: ACTIVA (ID: ${fi.id}, Nombre: "${fi.name}", Activa: ${fi.isActive}, Admin: ${fi.createdByAdmin})`);
    } else if (matches.length > 1) {
      console.log(`  ⚠️ ${t}: DUPLICADA (${matches.length} encontradas): ${matches.map(m => m.id).join(', ')}`);
    } else {
      console.log(`  ❌ ${t}: NO ENCONTRADA`);
    }
  });

  // Duplicate detection across all institutions
  console.log(`\n=== AUDITORÍA DE DUPLICADOS EN CATÁLOGO ===`);
  const nameMap = new Map();
  data.forEach(fi => {
    const norm = fi.name.trim().toLowerCase();
    if (!nameMap.has(norm)) nameMap.set(norm, []);
    nameMap.get(norm).push(fi);
  });

  let duplicatesFound = 0;
  nameMap.forEach((list, norm) => {
    if (list.length > 1) {
      duplicatesFound++;
      console.log(`  ⚠️ DUPLICADO DETECTADO: "${list[0].name}" (${list.length} registros: ${list.map(f => f.id).join(', ')})`);
    }
  });
  if (duplicatesFound === 0) {
    console.log(`  ✅ CERO DUPLICADOS: Todas las ${data.length} financieras tienen nombres únicos.`);
  }

  // Full listing
  console.log(`\n=== LISTADO COMPLETO DE INSTITUCIONES (${data.length}) ===`);
  data.forEach((fi, idx) => {
    const comm = fi.commissionRates || {};
    const fin = comm.financiera || {};
    const ap = fin.apertura || fi.openingCommissionRate || 'N/A';
    const tot = fin.total || 'N/A';
    const status = fi.isActive ? 'ACTIVA' : 'INACTIVA';
    console.log(`${String(idx + 1).padStart(2, ' ')}. [${status}] ${fi.name.padEnd(25, ' ')} | ID: ${fi.id.slice(0, 8)}... | Apertura: ${ap}% | Total: ${tot}%`);
  });
}

run().catch(console.error);
