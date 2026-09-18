const baseUrl = process.env.BACKEND_URL || "https://creditonegocios-staging.up.railway.app";
const password = process.env.STAGING_PASSWORD || "Prueba1$";

const accounts = [
  { email: "francocb79@gmail.com", roleName: "Super Admin" },
  { email: "fcb@creditonegocios.com.mx", roleName: "Master Broker" },
  { email: "francocb79@yahoo.com", roleName: "Broker" },
];

async function checkAccount(acc) {
  try {
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: acc.email, password }),
    });

    if (!loginRes.ok) {
      console.log(`[${acc.roleName}] Login falló (${loginRes.status})`);
      return;
    }

    const setCookie = loginRes.headers.getSetCookie ? loginRes.headers.getSetCookie() : [];
    const cookie = setCookie.map((entry) => String(entry).split(";")[0]).join("; ");

    const res = await fetch(`${baseUrl}/api/financial-institutions`, {
      headers: { cookie },
    });

    if (!res.ok) {
      console.log(`[${acc.roleName}] /api/financial-institutions falló (${res.status})`);
      return;
    }

    const list = await res.json();
    console.log(`\n=== [${acc.roleName} (${acc.email})] Total devueltas: ${list.length} ===`);
    
    const targetNames = ["Jeeves", "Kapital", "Altum", "Cualli", "Aspiria", "Pretmex"];
    targetNames.forEach(name => {
      const found = list.find(fi => fi.name.toLowerCase().includes(name.toLowerCase()));
      if (found) {
        console.log(`  ✅ ${name}: ENCONTRADA (id=${found.id}, isActive=${found.isActive}, createdByAdmin=${found.createdByAdmin})`);
      } else {
        console.log(`  ❌ ${name}: NO ENCONTRADA`);
      }
    });

    // Also list all names
    const allNames = list.map(fi => fi.name).sort();
    console.log(`  Todas las financieras visibles:`, allNames.join(", "));
  } catch (err) {
    console.error(`[${acc.roleName}] Error:`, err.message);
  }
}

async function run() {
  for (const acc of accounts) {
    await checkAccount(acc);
  }
}

run();
