/**
 * ISSUE-63 · Broker/Master commercial activation welcome
 * Transactional message only. No internal platform margins in any output.
 */
export type WelcomeRole = "broker" | "master_broker";
export type WelcomeCopyInput = {
  firstName: string;
  role: WelcomeRole;
  appBaseUrl: string;
  campaignToken: string;
};
function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function absolute(base: string, path: string) {
  const url = new URL(path, base);
  if (url.protocol !== "https:") throw new Error("Bienvenida requiere HTTPS");
  return url;
}
export function renderCommercialActivationWelcome(input: WelcomeCopyInput) {
  const name = input.firstName.trim().slice(0, 80) || "asesor";
  const displayName = escapeHtml(name);
  const master = input.role === "master_broker";
  const roleName = master ? "Master Broker" : "Broker";
  if (!/^[A-Za-z0-9_-]{32}$/.test(input.campaignToken)) throw new Error("Token comercial inválido");
  const home = absolute(input.appBaseUrl, "/").toString();
  const library = absolute(input.appBaseUrl, "/recursos-comerciales").toString();
  const customers = absolute(input.appBaseUrl, "/clientes").toString();
  const referral = absolute(input.appBaseUrl, "/c/" + input.campaignToken);
  referral.searchParams.set("utm_source", "redes_sociales");
  referral.searchParams.set("utm_medium", "social");
  referral.searchParams.set("utm_campaign", "productos_financieros");
  referral.searchParams.set("utm_content", "inicio");
  const capture = referral.toString();
  const masterStep = master
    ? "Como Master Broker, además puedes invitar y activar a los asesores de tu red y dar seguimiento a su operación."
    : "Cada solicitud que registres podrás perfilarla, identificar alternativas y seguir su avance desde la plataforma.";
  const statement =
    "Ejemplos exclusivamente ilustrativos: un crédito empresarial de $1,000,000 MXN al 1.5% representaría $15,000 MXN; " +
    "un arrendamiento empresarial de $1,000,000 MXN al 2% representaría $20,000 MXN. " +
    "No son promesas ni porcentajes garantizados. Las comisiones reales dependen de tu asignación, el producto, " +
    "la institución y las condiciones efectivas de cada operación.";
  const subject = "¡" + name + ", tu plataforma ya está lista! Consigue tu primer prospecto";
  const text = [
    "¡Bienvenido, " + name + "! Ya puedes comenzar a operar como " + roleName + ".",
    "",
    "Tu meta para los próximos 10 minutos:",
    "1. Abre Recursos Comerciales: hay plantillas listas para compartir por WhatsApp y redes sociales.",
    "2. Comparte una plantilla e incorpora tu enlace personal de captación (ya preparado con etiquetas generales):",
    capture,
    "3. En Clientes, utiliza «Crear Enlace a Prospecto» para pedir a un interesado sus datos sin capturarlos tú.",
    "4. Revisa los prospectos recibidos y gestiona el perfilamiento, alternativas financieras, solicitudes y comisiones desde la plataforma.",
    "",
    "Los interesados que respondan a tu enlace aparecen en tus prospectos recibidos; desde el flujo público pueden ampliar",
    "su información para iniciar su solicitud. La atribución corresponde a tu cuenta.",
    "",
    masterStep,
    "",
    statement,
    "",
    "Consigue tu primer prospecto hoy: " + library,
    "Biblioteca Comercial: " + library,
    "Crear Enlace a Prospecto: " + customers,
    "Entrar a tu plataforma: " + home,
    "",
    "Este correo corresponde a la activación de tu cuenta. No implica suscripción a newsletters.",
    "Crédito Negocios"
  ].join("\n");
  const html = '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body style="margin:0;background:#f3f6fa;font-family:Arial,sans-serif;color:#172d48">' +
    '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f3f6fa"><tr><td align="center" style="padding:24px">' +
    '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:620px;background:#fff;border-radius:12px;overflow:hidden">' +
    '<tr><td style="background:#103d72;padding:26px 32px;color:#fff"><h1 style="font-size:25px;margin:0">¡Bienvenido, ' + displayName + '!</h1>' +
    '<p style="margin:10px 0 0">Ya puedes comenzar a operar como ' + roleName + '.</p></td></tr>' +
    '<tr><td style="padding:30px 32px">' +
    '<h2 style="font-size:20px;margin:0 0 16px">Tu primer prospecto en 10 minutos</h2>' +
    '<ol style="padding-left:20px;line-height:1.8">' +
    '<li>Abre <a href="' + library + '">Recursos Comerciales</a> y elige una plantilla lista para redes sociales o WhatsApp.</li>' +
    '<li>Compártela junto con <a href="' + escapeHtml(capture) + '">tu enlace personal de captación</a>.</li>' +
    '<li>En <a href="' + customers + '">Clientes</a>, utiliza «Crear Enlace a Prospecto» para un contacto interesado.</li>' +
    '<li>Revisa tus prospectos recibidos y da seguimiento a sus solicitudes, alternativas financieras y comisiones.</li>' +
    '</ol>' +
    '<p>Los interesados que envíen sus datos desde tu enlace aparecerán en tu módulo de prospectos recibidos. ' +
    'Pueden ampliar la información desde el mismo flujo público.</p>' +
    '<p>' + escapeHtml(masterStep) + '</p>' +
    '<div style="text-align:center;margin:28px 0"><a href="' + library +
    '" style="display:inline-block;padding:15px 24px;background:#134e93;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold">Consigue tu primer prospecto hoy</a></div>' +
    '<p style="font-size:14px">Tu enlace personal: <a href="' + escapeHtml(capture) + '">' + escapeHtml(capture) + '</a></p>' +
    '<p style="font-size:14px"><a href="' + library + '">Biblioteca Comercial</a> · ' +
    '<a href="' + customers + '">Crear Enlace a Prospecto</a> · <a href="' + home + '">Tu plataforma</a></p>' +
    '<p style="border-top:1px solid #e4e9f0;padding-top:18px;font-size:12px;color:#56677b;line-height:1.6">' +
    escapeHtml(statement) + '</p></td></tr>' +
    '<tr><td style="background:#f7f9fc;padding:18px 32px;font-size:12px;color:#56677b">' +
    'Mensaje transaccional por activación de tu cuenta. No te suscribe a newsletters. Crédito Negocios.</td></tr></table>' +
    '</td></tr></table></body></html>';
  return { subject, html, text, libraryUrl: library, captureUrl: capture, customersUrl: customers };
}
