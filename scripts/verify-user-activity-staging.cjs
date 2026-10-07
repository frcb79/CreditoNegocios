#!/usr/bin/env node

const baseUrl = (process.env.BACKEND_URL || "").replace(/\/$/, "");
const email = process.env.STAGING_EMAIL;
const password = process.env.STAGING_PASSWORD;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function cookieFrom(response) {
  const values = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie")].filter(Boolean);
  return values.map((value) => String(value).split(";")[0]).filter(Boolean).join("; ");
}

async function request(route, { method = "GET", cookie = "", body } = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      accept: "application/json",
      ...(cookie ? { cookie } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    redirect: "manual",
  });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = { raw }; }
  return { response, data };
}

async function main() {
  assert(baseUrl, "BACKEND_URL es requerido");
  assert(email && password, "STAGING_EMAIL y STAGING_PASSWORD son requeridos");

  const login = await request("/api/auth/login", {
    method: "POST",
    body: { email, password },
  });
  assert(login.response.ok, `Login falló (${login.response.status}): ${JSON.stringify(login.data)}`);
  const cookie = cookieFrom(login.response);
  assert(cookie, "No se recibió cookie de sesión");

  const auth = await request("/api/auth/user", { cookie });
  assert(auth.response.ok && auth.data?.id, "No se pudo resolver el usuario autenticado");
  const userId = auth.data.id;

  const heartbeat1 = await request("/api/activity/heartbeat", {
    method: "POST",
    cookie,
    body: { moduleId: "dashboard", active: true },
  });
  assert(heartbeat1.response.ok && heartbeat1.data?.ok, "Primer heartbeat falló");

  await new Promise((resolve) => setTimeout(resolve, 1100));

  const heartbeat2 = await request("/api/activity/heartbeat", {
    method: "POST",
    cookie,
    body: { moduleId: "clientes", active: true },
  });
  assert(heartbeat2.response.ok && heartbeat2.data?.ok, "Segundo heartbeat falló");
  assert(heartbeat2.data.sessionId, "No se creó sesión de actividad");

  // Give the post-response auth observer a moment to persist login telemetry.
  await new Promise((resolve) => setTimeout(resolve, 300));

  const overview = await request("/api/user-activity/overview?days=30", { cookie });
  assert(
    overview.response.ok,
    `Overview falló (${overview.response.status}). Usa una cuenta con usuarios + view_user_activity/manage_users.`,
  );
  for (const key of ["totalUsers", "activeUsers", "sessions", "activeSeconds", "noRecordedLogin"]) {
    assert(Object.prototype.hasOwnProperty.call(overview.data || {}, key), `Falta campo overview.${key}`);
  }

  const users = await request(
    `/api/user-activity/users?days=30&search=${encodeURIComponent(email)}&limit=10`,
    { cookie },
  );
  assert(users.response.ok && Array.isArray(users.data), "Listado de actividad de usuarios inválido");
  assert(users.data.some((row) => row.id === userId), "El usuario autenticado no aparece en el listado visible");

  const detail = await request(`/api/user-activity/users/${encodeURIComponent(userId)}?days=30`, { cookie });
  assert(detail.response.ok && detail.data?.user?.id === userId, "Detalle de actividad inválido");
  const moduleIds = new Set((detail.data.modules || []).map((row) => row.module_id));
  assert(moduleIds.has("dashboard"), "No se registró el módulo dashboard");
  assert(moduleIds.has("clientes"), "No se registró la transición al módulo clientes");

  const events = await request(
    `/api/user-activity/users/${encodeURIComponent(userId)}/events?limit=50`,
    { cookie },
  );
  assert(events.response.ok && Array.isArray(events.data), "Bitácora de eventos inválida");
  assert(
    events.data.some((event) => event.event_type === "auth.login_succeeded"),
    "No se encontró auth.login_succeeded en la bitácora",
  );

  console.log("✅ Bloque 3.1 Activity smoke OK");
  console.log(JSON.stringify({
    userId,
    sessionId: heartbeat2.data.sessionId,
    overview: {
      totalUsers: overview.data.totalUsers,
      activeUsers: overview.data.activeUsers,
      sessions: overview.data.sessions,
      activeSeconds: overview.data.activeSeconds,
    },
    modules: [...moduleIds],
    recentEventTypes: events.data.slice(0, 10).map((event) => event.event_type),
  }, null, 2));
}

main().catch((error) => {
  console.error("❌ Bloque 3.1 Activity smoke FAILED");
  console.error(error?.stack || error);
  process.exit(1);
});
