/**
 * Utilidad de Verificación de Seguridad para Entornos PostgreSQL de Pruebas
 * Garantiza que TEST_DATABASE_URL apunte a un entorno de pruebas aislado y efímero.
 * Impide terminantemente la ejecución de pruebas destructivas o DROP sobre bases productivas o de aplicación.
 */

export function assertSafeIsolatedTestDatabase(url: string | undefined): boolean {
  if (!url) return false;

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SEGURIDAD CRÍTICA: Intento de ejecutar pruebas PostgreSQL en NODE_ENV=production. Abortado."
    );
  }

  const forbiddenHosts = [
    "railway.app",
    "supabase.co",
    "supabase.com",
    "neon.tech",
    "rds.amazonaws.com",
    "render.com",
    "heroku.com",
    "cockroachlabs.cloud",
  ];

  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.toLowerCase();

    for (const forbidden of forbiddenHosts) {
      if (host.includes(forbidden)) {
        throw new Error(
          `SEGURIDAD CRÍTICA: TEST_DATABASE_URL apunta a un host no permitido (${host}). Prohibido ejecutar DROP o pruebas destructivas en bases de datos no aisladas.`
        );
      }
    }

    const isLocalOrContainer =
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host === "postgres";

    const isTestDb =
      pathname.includes("test") ||
      pathname.includes("ephemeral") ||
      pathname.includes("_ci") ||
      pathname.includes("ci_") ||
      pathname.includes("-ci") ||
      pathname.includes("ci-") ||
      pathname === "/ci" ||
      pathname === "/postgres";

    if (!isLocalOrContainer) {
      throw new Error(
        `SEGURIDAD CRÍTICA: TEST_DATABASE_URL debe apuntar a un host local o contenedor de prueba efímero (${host} no permitido).`
      );
    }

    if (!isTestDb) {
      throw new Error(
        `SEGURIDAD CRÍTICA: TEST_DATABASE_URL debe apuntar a una base de datos de pruebas (nombre de BD: ${pathname}).`
      );
    }

    return true;
  } catch (err: any) {
    if (err.message?.startsWith("SEGURIDAD CRÍTICA")) {
      throw err;
    }
    throw new Error(`TEST_DATABASE_URL inválida: ${err.message}`);
  }
}
