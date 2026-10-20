import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const FROM_EMAIL = process.env.EMAIL_FROM || 'Crédito Negocios <noreply@creditonegocios.com.mx>';
const APP_NAME = 'Crédito Negocios';
const INTERNAL_EMAIL_TO = process.env.INTERNAL_EMAIL_TO || process.env.BROKER_LEADS_TO || 'info@creditonegocios.com.mx';
export const SUPERADMIN_NOTIFICATION_EMAIL = process.env.SUPERADMIN_NOTIFICATION_EMAIL || 'fcb@creditonegocios.com.mx';

type BrokerLeadPayload = {
  name: string;
  email: string;
  phone: string;
  company?: string;
  brokerProfile: 'pro' | 'referidor';
  brokerType: string;
  message?: string;
};

const brokerProfileLabels: Record<BrokerLeadPayload['brokerProfile'], string> = {
  pro: 'Broker profesional',
  referidor: 'Aliado referidor',
};

type WebsiteLeadPayload = {
  name: string;
  email: string;
  phone: string;
  company?: string;
  solutionType: string;
  amountRange: string;
  message?: string;
};

export async function sendPasswordResetEmail(
  to: string,
  resetToken: string,
  userName?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!resend) {
      console.warn('❌ [Email] Email service disabled: missing RESEND_API_KEY');
      return { success: false, error: 'Email service not configured (RESEND_API_KEY missing)' };
    }
    console.log(`[Email] Service initialized. Target: ${to}`);
    // Use FRONTEND_BASE_URL for custom domain, or get from REPLIT_DOMAINS, or fallback to localhost
    let baseUrl = process.env.FRONTEND_BASE_URL;

    if (!baseUrl && process.env.REPLIT_DOMAINS) {
      // REPLIT_DOMAINS contains comma-separated list of domains, use the first one
      const domains = process.env.REPLIT_DOMAINS.split(',');
      baseUrl = `https://${domains[0]}`;
    }

    if (!baseUrl && process.env.RAILWAY_STATIC_URL) {
      baseUrl = `https://${process.env.RAILWAY_STATIC_URL}`;
    }

    if (!baseUrl && process.env.VERCEL_URL) {
      baseUrl = `https://${process.env.VERCEL_URL}`;
    }

    if (!baseUrl) {
      baseUrl = 'https://creditonegocios-staging.up.railway.app';
      console.warn(`[Email] FRONTEND_BASE_URL not set, falling back to: ${baseUrl}`);
    }

    const resetUrl = `${baseUrl.replace(/\/$/, '')}/reset-password?token=${resetToken}`;
    // Never log invitation/password-reset links: they contain bearer tokens.
    const greeting = userName ? `Hola ${userName},` : 'Hola,';

    console.log(`[Email] Preparing to send reset email to ${to}...`);
    let { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [to],
      subject: `Restablecer contraseña - ${APP_NAME}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Restablecer Contraseña</title>
        </head>
        <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
          <div style="background-color: #ffffff; border-radius: 8px; padding: 40px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #1a365d; margin: 0; font-size: 28px;">${APP_NAME}</h1>
              <p style="color: #718096; margin-top: 5px; font-size: 14px;">Sistema de Gestión de Brokers</p>
            </div>

            <h2 style="color: #2d3748; margin-bottom: 20px; font-size: 22px;">Restablecer Contraseña</h2>

            <p style="margin-bottom: 15px;">${greeting}</p>

            <p style="margin-bottom: 20px;">
              Recibimos una solicitud para restablecer la contraseña de tu cuenta.
              Si no realizaste esta solicitud, puedes ignorar este correo de forma segura.
            </p>

            <p style="margin-bottom: 25px;">
              Para restablecer tu contraseña, haz clic en el siguiente botón:
            </p>

            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}"
                 style="background-color: #3182ce; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block; font-size: 16px;">
                Restablecer Contraseña
              </a>
            </div>

            <p style="margin-bottom: 15px; color: #718096; font-size: 14px;">
              O copia y pega el siguiente enlace en tu navegador:
            </p>
            <p style="margin-bottom: 25px; word-break: break-all; background-color: #f7fafc; padding: 12px; border-radius: 4px; font-size: 13px; color: #4a5568;">
              ${resetUrl}
            </p>

            <div style="border-top: 1px solid #e2e8f0; margin-top: 30px; padding-top: 20px;">
              <p style="color: #a0aec0; font-size: 13px; margin-bottom: 10px;">
                <strong>Nota:</strong> Este enlace expirará en 1 hora por motivos de seguridad.
              </p>
              <p style="color: #a0aec0; font-size: 13px; margin: 0;">
                Si no solicitaste este cambio, ignora este correo. Tu contraseña permanecerá sin cambios.
              </p>
            </div>
          </div>

          <div style="text-align: center; margin-top: 20px; color: #a0aec0; font-size: 12px;">
            <p>&copy; ${new Date().getFullYear()} ${APP_NAME}. Todos los derechos reservados.</p>
          </div>
        </body>
        </html>
      `,
      text: `
${greeting}

Recibimos una solicitud para restablecer la contraseña de tu cuenta en ${APP_NAME}.

Para restablecer tu contraseña, visita el siguiente enlace:
${resetUrl}

Este enlace expirará en 1 hora por motivos de seguridad.

Si no solicitaste este cambio, ignora este correo. Tu contraseña permanecerá sin cambios.

---
${APP_NAME}
Sistema de Gestión de Brokers
      `.trim(),
    });

    if (error) {
      console.error('❌ [Email] Resend password reset email error:', error);
      return { success: false, error: error.message };
    }

    console.log('✅ [Email] Password reset email sent successfully via Resend:', data?.id);
    return { success: true };
  } catch (error: any) {
    console.error('Error sending password reset email:', error);
    return { success: false, error: error.message || 'Error desconocido' };
  }
}


/** Personal welcome + one-time activation link; shared between single and bulk sends. */
/**
 * Shared approved launch invitation for individual and Excel onboarding.
 * Keep copy/layout identical across both flows; never interpolate user HTML.
 */
export function buildAccountInvitationEmail(
  to: string,
  token: string,
  role: "broker" | "master_broker",
  name?: string,
  personalMessage?: string,
  baseUrl = process.env.FRONTEND_BASE_URL,
  courtesy?: { code: string; name: string; durationMonths: 12 },
): { subject: string; html: string; text: string } {
  const url = baseUrl?.trim();
  if (!url || !/^https:\/\/[^\s]+$/i.test(url)) {
    throw new Error("La URL segura de invitaciones no está configurada.");
  }
  const link = url.replace(/\/$/, "") + "/reset-password?token=" + encodeURIComponent(token);
  const safe = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const greeting = name?.trim() || "colaborador";
  const message = personalMessage?.trim().slice(0, 500) || "";
  const subject = "Más oportunidades para tus clientes. Más negocios para ti. 🚀";
  // Role is retained for personalization rules at the calling layer. The approved
  // email sells the opportunity without distinguishing Brokers vs Master Brokers.
  void role;
  const benefits = [
    {
      icon: "🚀", title: "1. Más soluciones para tus clientes",
      body: "Explora alternativas de financiamiento para empresas y personas: Crédito Simple, Crédito Revolvente, Factoraje, Arrendamiento, Crédito Hipotecario, Anticipo de Ventas y otras soluciones para negocios.",
    },
    {
      icon: "📊", title: "2. Todo tu negocio organizado en un solo lugar",
      body: "Registra y administra tus prospectos y clientes, identifica alternativas compatibles, gestiona solicitudes y da seguimiento a tus operaciones desde una sola plataforma.",
    },
    {
      icon: "💰", title: "3. Convierte oportunidades en comisiones",
      body: "Aprovecha tus relaciones comerciales, desarrolla nuevas oportunidades y consulta el avance de tus operaciones y las comisiones que te correspondan.",
    },
    {
      icon: "🤝", title: "4. Amplía tu red. Multiplica tus oportunidades.",
      body: "Invita a más personas, fortalece tus relaciones comerciales y desarrolla una red que siga creciendo contigo. Entre más oportunidades generes, mayor será tu potencial de comisiones.",
    },
  ];
  const html = [
    "<!doctype html><html lang='es'><head><meta charset='utf-8'>",
    "<meta name='viewport' content='width=device-width,initial-scale=1'></head>",
    "<body style='margin:0;padding:24px 12px;background:#f2f5f8;color:#22334d;font-family:Arial,Helvetica,sans-serif'>",
    "<table role='presentation' cellpadding='0' cellspacing='0' border='0' style='width:100%;max-width:620px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden'>",
    "<tr><td style='background:#142e4a;padding:34px 34px 38px;color:#ffffff'>",
    "<div style='font-size:16px;font-weight:700;letter-spacing:.5px;color:#c8e1d5'>CRÉDITO NEGOCIOS</div>",
    "<h1 style='font-size:28px;line-height:1.28;margin:22px 0 0;color:#ffffff'>",
    "Tus relaciones tienen valor. Tus oportunidades tienen potencial. ",
    "<span style='color:#a9e0c1'>Nosotros queremos ayudarte a convertirlas en negocios.</span></h1>",
    "</td></tr><tr><td style='padding:32px 34px'>",
    "<p style='margin:0 0 18px;font-size:16px'>Hola, <strong>" + safe(greeting) + "</strong>:</p>",
    ...(message ? [
      "<div style='background:#f0f8f3;border-left:4px solid #147d52;padding:16px 18px;margin:4px 0 24px'>",
      "<div style='font-weight:700;font-size:13px;color:#147d52;margin-bottom:8px'>UN MENSAJE PERSONAL PARA TI</div>",
      "<div style='font-size:15px;line-height:1.65'>" + safe(message).replace(/\r?\n/g, "<br>") + "</div></div>",
    ] : []),
    "<p style='line-height:1.65;margin:0 0 16px'>Las mejores oportunidades de negocio comienzan cuando tienes las herramientas y las conexiones adecuadas.</p>",
    "<h2 style='font-size:23px;color:#142e4a;margin:0 0 14px'>¡Bienvenido a Crédito Negocios!</h2>",
    "<p style='line-height:1.65;margin:0 0 24px'>Estamos construyendo una plataforma que busca acercarte opciones de financiamiento de <strong>decenas de financieras</strong>, para ayudarte a convertir las necesidades de tus clientes en nuevas oportunidades de negocio.</p>",

    "<h2 style='font-size:19px;color:#142e4a;margin:0 0 12px'>¿Qué puedes hacer con Crédito Negocios?</h2>",
    ...benefits.map(b =>
      "<div style='padding:15px 0;border-bottom:1px solid #e6ebef'>" +
      "<div style='font-size:16px;font-weight:bold;color:#142e4a;margin-bottom:7px'>" + b.icon + " " + safe(b.title) + "</div>" +
      "<div style='font-size:15px;line-height:1.65'>" + safe(b.body) + "</div></div>"
    ),
    "<h2 style='font-size:22px;color:#142e4a;margin:26px 0 12px'>¡Es momento de comenzar!</h2>",
    "<p style='line-height:1.65'>Tu acceso a Crédito Negocios está preparado.</p>",
    "<p style='margin:14px 0'><strong>Tu usuario:</strong> " + safe(to) + "</p>",
    "<div style='text-align:center;margin:26px 0'>",
    "<a href='" + safe(link) + "' style='display:inline-block;background:#147d52;color:#ffffff;font-weight:bold;text-decoration:none;border-radius:7px;padding:16px 31px;font-size:16px'>ACTIVAR MI CUENTA</a>",
    "</div>",
    ...(courtesy ? [
      "<div style='background:#e9f8ef;border:1px solid #90ccab;border-radius:8px;padding:17px 20px;margin:14px 0 22px'>",
      "<h2 style='font-size:18px;color:#146b48;margin:0 0 8px'>Tu invitación incluye 12 meses sin costo</h2>",
      "<p style='font-size:14px;line-height:1.5;margin:0 0 8px'>Beneficio especial de cortesía <strong>" + safe(courtesy.name) + "</strong> otorgado mediante el código:</p>",
      "<p style='font-size:22px;font-weight:800;letter-spacing:.5px;margin:8px 0;color:#142e4a'>" + safe(courtesy.code) + "</p>",
      "<p style='font-size:13px;line-height:1.55;margin:8px 0 0'>Los 12 meses comienzan cuando actives tu cuenta. El beneficio quedará registrado en Configuración → Beneficios y acceso. No se realizará ningún cobro automático al finalizar: cualquier esquema de pago futuro deberá informarse por separado.</p>",
      "</div>",
    ] : []),
    "<p style='line-height:1.65'>Activa tu cuenta, crea tu contraseña y descubre todo lo que podemos construir juntos.</p>",
    "<p style='font-size:13px;line-height:1.55;color:#63738a'>Tu enlace de activación es personal, de un solo uso y tiene una vigencia de <strong>24 horas</strong>.</p>",
    "<p style='line-height:1.65;margin-top:28px'>¡Nos entusiasma que formes parte de esta nueva etapa!</p>",
    "<p style='margin:22px 0 5px'><strong>Equipo Crédito Negocios</strong></p>",
    "<p style='margin:0;color:#147d52;font-style:italic'>Conectamos oportunidades. Impulsamos negocios.</p>",
    "</td></tr><tr><td style='padding:18px 34px;background:#f5f7fa;color:#738194;font-size:12px;line-height:1.5'>",
    "Si no esperabas esta invitación, puedes ignorarla. Este correo no solicita tu contraseña.</td></tr>",
    "</table></body></html>",
  ].join("");
  const text = [
    "Crédito Negocios",
    "Tus relaciones tienen valor. Tus oportunidades tienen potencial. Nosotros queremos ayudarte a convertirlas en negocios.",
    "",
    "Hola, " + greeting + ":",
    ...(message ? ["", "UN MENSAJE PERSONAL PARA TI", message] : []),
    "",
    "Las mejores oportunidades de negocio comienzan cuando tienes las herramientas y las conexiones adecuadas.",
    "¡Bienvenido a Crédito Negocios!",
    "Estamos construyendo una plataforma que busca acercarte opciones de financiamiento de decenas de financieras, para ayudarte a convertir las necesidades de tus clientes en nuevas oportunidades de negocio.",

    "",
    "¿Qué puedes hacer con Crédito Negocios?",
    ...benefits.flatMap(b => ["", b.title, b.body]),
    "",
    "¡Es momento de comenzar!",
    "Tu acceso a Crédito Negocios está preparado.",
    "Tu usuario: " + to,
    "ACTIVAR MI CUENTA: " + link,
    ...(courtesy ? ["", "TU CORTESÍA DE LANZAMIENTO: 12 MESES SIN COSTO",
      "Código: " + courtesy.code,
      "Promoción: " + courtesy.name,
      "Comienza al activar tu cuenta y se reflejará en Configuración > Beneficios y acceso.",
      "No se hará ningún cobro automático al finalizar el periodo de cortesía.",
    ] : []),
    "Activa tu cuenta, crea tu contraseña y descubre todo lo que podemos construir juntos.",
    "Tu enlace de activación es personal, de un solo uso y tiene una vigencia de 24 horas.",
    "",
    "¡Nos entusiasma que formes parte de esta nueva etapa!",
    "Equipo Crédito Negocios",
    "Conectamos oportunidades. Impulsamos negocios.",
    "Si no esperabas esta invitación, puedes ignorarla.",
  ].join("\n");
  return { subject, html, text };
}

export async function sendAccountInvitationEmail(
  to: string, token: string, role: "broker" | "master_broker",
  name?: string, personalMessage?: string,
  courtesy?: { code: string; name: string; durationMonths: 12 },
): Promise<{success:boolean;error?:string}> {
  try {
    if (!resend) return { success: false, error: "Servicio de correo no configurado" };
    const invitation = buildAccountInvitationEmail(to, token, role, name, personalMessage,
      process.env.FRONTEND_BASE_URL, courtesy);
    const result = await resend.emails.send({
      from: FROM_EMAIL, to: [to],
      subject: invitation.subject, html: invitation.html, text: invitation.text,
    });
    return result.error ? { success: false, error: result.error.message } : { success: true };
  } catch (error: any) {
    return { success: false, error: error?.message || "Error al enviar la invitación" };
  }
}

export async function sendBrokerLeadEmail(
  payload: BrokerLeadPayload,
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!resend) {
      const isProduction = process.env.NODE_ENV === 'production';
      if (isProduction) {
        console.error('Broker lead email failed: missing RESEND_API_KEY in production');
        return { success: false, error: 'Email service not configured' };
      }

      // Do not block lead capture in local/dev preview where email is optional.
      console.warn('Broker lead email skipped in non-production: missing RESEND_API_KEY');
      return { success: true };
    }
    const brokerProfile = payload.brokerProfile || 'pro';
    const brokerProfileLabel = brokerProfileLabels[brokerProfile] || brokerProfile;

    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [INTERNAL_EMAIL_TO],
      replyTo: payload.email,
      subject: `Nuevo lead brokers [${brokerProfileLabel}] - ${APP_NAME}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Nuevo lead brokers</title>
        </head>
        <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #334155; max-width: 680px; margin: 0 auto; padding: 24px; background: #f8fafc;">
          <div style="background: #ffffff; border-radius: 18px; overflow: hidden; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08); border: 1px solid #e2e8f0;">
            <div style="background: linear-gradient(135deg, #05478a 0%, #1e3a5f 100%); color: white; padding: 28px 32px;">
              <p style="margin: 0 0 6px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.16em; color: #bfdbfe;">Programa Brokers</p>
              <h1 style="margin: 0; font-size: 28px;">Nuevo lead interesado</h1>
              <p style="margin: 8px 0 0 0; font-size: 14px; color: #dbeafe;">Solicitud enviada desde la página /brokers</p>
            </div>

            <div style="padding: 28px 32px;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0; width: 180px; font-weight: 600; color: #0f172a;">Nombre</td>
                  <td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0;">${payload.name}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #0f172a;">Email</td>
                  <td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0;">${payload.email}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #0f172a;">Teléfono</td>
                  <td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0;">${payload.phone}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #0f172a;">Perfil</td>
                  <td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0;">${brokerProfileLabel}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #0f172a;">Tipo de broker</td>
                  <td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0;">${payload.brokerType}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #0f172a;">Despacho / empresa</td>
                  <td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0;">${payload.company || 'No especificado'}</td>
                </tr>
              </table>

              <div style="margin-top: 24px; border-radius: 16px; background: #f8fafc; border: 1px solid #e2e8f0; padding: 18px 20px;">
                <p style="margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.12em; color: #64748b;">Mensaje</p>
                <p style="margin: 0; white-space: pre-wrap; color: #334155;">${payload.message || 'Sin mensaje adicional.'}</p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
Nuevo lead brokers - ${APP_NAME}

Nombre: ${payload.name}
Email: ${payload.email}
Teléfono: ${payload.phone}
Perfil: ${brokerProfileLabel}
Tipo de broker: ${payload.brokerType}
Despacho / empresa: ${payload.company || 'No especificado'}

Mensaje:
${payload.message || 'Sin mensaje adicional.'}
      `.trim(),
    });

    if (error) {
      console.error('Resend broker lead email error:', error);
      return { success: false, error: error.message };
    }

    console.log('Broker lead email sent successfully:', data?.id);
    return { success: true };
  } catch (error: any) {
    console.error('Error sending broker lead email:', error);
    return { success: false, error: error.message || 'Error desconocido' };
  }
}

export async function sendWebsiteLeadEmail(
  payload: WebsiteLeadPayload,
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!resend) {
      const isProduction = process.env.NODE_ENV === 'production';
      if (isProduction) {
        console.error('Website lead email failed: missing RESEND_API_KEY in production');
        return { success: false, error: 'Email service not configured' };
      }

      // Do not block lead capture in local/dev preview where email is optional.
      console.warn('Website lead email skipped in non-production: missing RESEND_API_KEY');
      return { success: true };
    }

    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [INTERNAL_EMAIL_TO],
      replyTo: payload.email,
      subject: `Nuevo lead sitio web - ${APP_NAME}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Nuevo lead sitio web</title>
        </head>
        <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #334155; max-width: 680px; margin: 0 auto; padding: 24px; background: #f8fafc;">
          <div style="background: #ffffff; border-radius: 18px; overflow: hidden; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08); border: 1px solid #e2e8f0;">
            <div style="background: linear-gradient(135deg, #0f766e 0%, #155e75 100%); color: white; padding: 28px 32px;">
              <p style="margin: 0 0 6px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.16em; color: #ccfbf1;">Sitio web</p>
              <h1 style="margin: 0; font-size: 28px;">Nueva solicitud de cotizacion</h1>
              <p style="margin: 8px 0 0 0; font-size: 14px; color: #ccfbf1;">Formulario enviado desde creditonegocios.com.mx</p>
            </div>

            <div style="padding: 28px 32px;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0; width: 200px; font-weight: 600; color: #0f172a;">Nombre</td>
                  <td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0;">${payload.name}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #0f172a;">Email</td>
                  <td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0;">${payload.email}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #0f172a;">Telefono</td>
                  <td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0;">${payload.phone}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #0f172a;">Empresa</td>
                  <td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0;">${payload.company || 'No especificado'}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #0f172a;">Tipo de solucion</td>
                  <td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0;">${payload.solutionType}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #0f172a;">Monto aproximado</td>
                  <td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0;">${payload.amountRange}</td>
                </tr>
              </table>

              <div style="margin-top: 24px; border-radius: 16px; background: #f8fafc; border: 1px solid #e2e8f0; padding: 18px 20px;">
                <p style="margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.12em; color: #64748b;">Mensaje</p>
                <p style="margin: 0; white-space: pre-wrap; color: #334155;">${payload.message || 'Sin mensaje adicional.'}</p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
Nuevo lead sitio web - ${APP_NAME}

Nombre: ${payload.name}
Email: ${payload.email}
Telefono: ${payload.phone}
Empresa: ${payload.company || 'No especificado'}
Tipo de solucion: ${payload.solutionType}
Monto aproximado: ${payload.amountRange}

Mensaje:
${payload.message || 'Sin mensaje adicional.'}
      `.trim(),
    });

    if (error) {
      console.error('Resend website lead email error:', error);
      return { success: false, error: error.message };
    }

    console.log('Website lead email sent successfully:', data?.id);
    return { success: true };
  } catch (error: any) {
    console.error('Error sending website lead email:', error);
    return { success: false, error: error.message || 'Error desconocido' };
  }
}

export async function sendWelcomeEmail(
  to: string,
  userName: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!resend) {
      console.warn('❌ [Email] Welcome email skipped: missing RESEND_API_KEY');
      return { success: false, error: 'Email service not configured' };
    }

    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [to],
      subject: `¡Bienvenido a ${APP_NAME}! 🚀`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Bienvenido a ${APP_NAME}</title>
        </head>
        <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8fafc;">
          <div style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
            <div style="background: linear-gradient(135deg, #05478a 0%, #1e3a5f 100%); padding: 40px 20px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 32px; font-weight: 800;">¡Bienvenido, ${userName}!</h1>
              <p style="color: #dbeafe; margin-top: 10px; font-size: 18px;">Estamos emocionados de tenerte con nosotros.</p>
            </div>

            <div style="padding: 40px;">
              <p style="font-size: 16px; margin-bottom: 25px;">
                Gracias por unirte a <strong>${APP_NAME}</strong>, la plataforma líder para la gestión y colocación de créditos empresariales.
              </p>

              <p style="font-size: 16px; margin-bottom: 25px;">
                Desde ahora, tienes acceso a un ecosistema diseñado para potenciar tu negocio:
              </p>

              <div style="background-color: #f1f5f9; border-radius: 12px; padding: 25px; margin-bottom: 30px;">
                <ul style="margin: 0; padding-left: 20px; color: #475569;">
                  <li style="margin-bottom: 12px;"><strong>Gestión Centralizada:</strong> Administra todos tus clientes y solicitudes en un solo lugar.</li>
                  <li style="margin-bottom: 12px;"><strong>Múltiples Financieras:</strong> Acceso a las mejores instituciones financieras del país.</li>
                  <li style="margin-bottom: 12px;"><strong>Seguimiento en Tiempo Real:</strong> Conoce el estado de tus expedientes en cada etapa.</li>
                  <li style="margin-bottom: 0;"><strong>Comisiones Transparentes:</strong> Visualiza y gestiona tus ganancias de forma clara.</li>
                </ul>
              </div>

              <div style="text-align: center; margin: 40px 0;">
                <a href="https://app.creditonegocios.com.mx"
                   style="background-color: #05478a; color: #ffffff; padding: 16px 36px; text-decoration: none; border-radius: 8px; font-weight: 700; display: inline-block; font-size: 16px; box-shadow: 0 4px 6px rgba(5, 71, 138, 0.2);">
                  Comenzar ahora
                </a>
              </div>

              <p style="font-size: 14px; color: #64748b; text-align: center;">
                Si tienes alguna duda, nuestro equipo de soporte está listo para ayudarte.
              </p>
            </div>

            <div style="background-color: #f8fafc; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="color: #94a3b8; font-size: 12px; margin: 0;">
                &copy; ${new Date().getFullYear()} ${APP_NAME}. Todos los derechos reservados.
              </p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
¡Bienvenido a ${APP_NAME}, ${userName}!

Estamos muy contentos de que te hayas unido a nuestra plataforma.

Con ${APP_NAME} podrás:
- Gestionar todos tus clientes y solicitudes en un solo lugar.
- Acceder a las mejores instituciones financieras.
- Dar seguimiento en tiempo real a tus expedientes.
- Gestionar tus comisiones de forma transparente.

Comienza ahora en: https://app.creditonegocios.com.mx

¡Mucho éxito!
El equipo de ${APP_NAME}
      `.trim(),
    });

    if (error) {
      console.error('Welcome email error:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error sending welcome email:', error);
    return { success: false, error: error.message || 'Error desconocido' };
  }
}

export async function sendBrokerDeactivationRequestEmail(payload: {
  firstName?: string | null;
  lastName?: string | null;
  email: string;
  userId: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    if (!resend) {
      const isProduction = process.env.NODE_ENV === 'production';
      if (isProduction) {
        console.error('Deactivation request email failed: missing RESEND_API_KEY in production');
        return { success: false, error: 'Email service not configured' };
      }
      console.warn('Deactivation request email skipped in non-production: missing RESEND_API_KEY');
      return { success: true };
    }

    const fullName = `${payload.firstName || ''} ${payload.lastName || ''}`.trim() || 'Usuario sin nombre';

    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [INTERNAL_EMAIL_TO],
      replyTo: payload.email,
      subject: `Solicitud de baja de broker - ${APP_NAME}`,
      html: `
        <h2>Solicitud de baja de broker</h2>
        <p>Se recibió una solicitud de baja de cuenta.</p>
        <ul>
          <li><strong>Nombre:</strong> ${fullName}</li>
          <li><strong>Email:</strong> ${payload.email}</li>
          <li><strong>User ID:</strong> ${payload.userId}</li>
          <li><strong>Fecha:</strong> ${new Date().toISOString()}</li>
        </ul>
      `,
      text: `
Solicitud de baja de broker

Nombre: ${fullName}
Email: ${payload.email}
User ID: ${payload.userId}
Fecha: ${new Date().toISOString()}
      `.trim(),
    });

    if (error) {
      console.error('Resend deactivation request email error:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error sending deactivation request email:', error);
    return { success: false, error: error.message || 'Error desconocido' };
  }
}

export interface SuperAdminNotificationPayload {
  title: string;
  message: string;
  type?: string;
  clientName?: string;
  brokerName?: string;
  amount?: string | number;
  financialInstitutionName?: string;
  actionUrl?: string;
  details?: Record<string, any>;
}

const notificationDedupeCache = new Map<string, number>();

export async function sendSuperAdminNotificationEmail(
  payload: SuperAdminNotificationPayload
): Promise<{ success: boolean; error?: string }> {
  try {
    const dedupeKey = `${payload.type || ''}_${payload.title}_${payload.clientName || ''}_${payload.amount || ''}_${payload.actionUrl || ''}`;
    const now = Date.now();
    const lastSent = notificationDedupeCache.get(dedupeKey);
    if (lastSent && now - lastSent < 10000) {
      console.log(`[Email] Deduplicated super admin notification within 10s: "${payload.title}"`);
      return { success: true };
    }
    notificationDedupeCache.set(dedupeKey, now);

    if (notificationDedupeCache.size > 200) {
      notificationDedupeCache.forEach((timestamp, key) => {
        if (now - timestamp > 60000) notificationDedupeCache.delete(key);
      });
    }

    if (!resend) {
      console.warn(`[Email] Super admin email skipped (RESEND_API_KEY missing): "${payload.title}" -> ${SUPERADMIN_NOTIFICATION_EMAIL}`);
      return { success: true };
    }

    let baseUrl = process.env.FRONTEND_BASE_URL || 'https://app.creditonegocios.com.mx';
    const targetUrl = payload.actionUrl
      ? `${baseUrl.replace(/\/$/, '')}/${payload.actionUrl.replace(/^\//, '')}`
      : baseUrl;

    let formattedAmount: string | null = null;
    if (payload.amount !== undefined && payload.amount !== null && payload.amount !== '') {
      if (typeof payload.amount === 'number') {
        formattedAmount = `$${payload.amount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;
      } else {
        const raw = String(payload.amount).trim();
        if (raw.startsWith('$')) {
          formattedAmount = raw;
        } else {
          const num = parseFloat(raw);
          formattedAmount = isNaN(num) ? raw : `$${num.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;
        }
      }
    }

    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [SUPERADMIN_NOTIFICATION_EMAIL],
      subject: `[Alerta Plataforma] ${payload.title}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${payload.title}</title>
        </head>
        <body style="font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif; line-height: 1.6; color: #1e293b; max-width: 650px; margin: 0 auto; padding: 20px; background-color: #f1f5f9;">
          <div style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08); border: 1px solid #e2e8f0;">
            <!-- Header con gradiente institucional -->
            <div style="background: linear-gradient(135deg, #065f46 0%, #0f766e 50%, #1e3a8a 100%); color: white; padding: 28px 32px;">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.15em; font-weight: 700; color: #a7f3d0; background: rgba(255,255,255,0.15); padding: 4px 10px; rounded-full: 9999px; border-radius: 20px;">
                  Panel Super Admin
                </span>
                <span style="font-size: 12px; color: #cbd5e1;">${new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <h1 style="margin: 0; font-size: 24px; font-weight: 800; color: #ffffff; line-height: 1.2;">
                ${payload.title}
              </h1>
              <p style="margin: 6px 0 0 0; font-size: 13px; color: #ccfbf1;">
                Notificación automática de actividad en Crédito Negocios
              </p>
            </div>

            <!-- Cuerpo del mensaje -->
            <div style="padding: 28px 32px;">
              <p style="font-size: 15px; color: #334155; margin-top: 0; margin-bottom: 24px; font-weight: 500;">
                ${payload.message}
              </p>

              <!-- Tabla de datos estructurados -->
              <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; background: #f8fafc; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0;">
                ${payload.clientName ? `
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-size: 13px; font-weight: 600; color: #64748b; width: 140px;">Cliente</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-size: 14px; font-weight: 700; color: #0f172a;">${payload.clientName}</td>
                </tr>` : ''}
                ${formattedAmount ? `
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-size: 13px; font-weight: 600; color: #64748b;">Monto</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-size: 16px; font-weight: 800; color: #059669;">${formattedAmount}</td>
                </tr>` : ''}
                ${payload.brokerName ? `
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-size: 13px; font-weight: 600; color: #64748b;">Bróker Originador</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-size: 14px; color: #1e293b; font-weight: 600;">${payload.brokerName}</td>
                </tr>` : ''}
                ${payload.financialInstitutionName ? `
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-size: 13px; font-weight: 600; color: #64748b;">Financiera</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-size: 14px; color: #1e293b; font-weight: 600;">${payload.financialInstitutionName}</td>
                </tr>` : ''}
                ${payload.details ? Object.entries(payload.details).map(([k, v]) => `
                <tr>
                  <td style="padding: 10px 16px; border-bottom: 1px solid #e2e8f0; font-size: 13px; font-weight: 600; color: #64748b;">${k}</td>
                  <td style="padding: 10px 16px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #334155;">${String(v)}</td>
                </tr>`).join('') : ''}
              </table>

              <!-- Botón de acción -->
              <div style="text-align: center; margin: 32px 0 16px 0;">
                <a href="${targetUrl}"
                   style="display: inline-block; background: linear-gradient(135deg, #059669 0%, #0d9488 100%); color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 10px; font-weight: 700; font-size: 14px; box-shadow: 0 4px 12px rgba(5, 150, 105, 0.3);">
                  Gestionar en la Plataforma &rarr;
                </a>
              </div>
              <p style="text-align: center; font-size: 11px; color: #94a3b8; margin: 0;">
                Enlace directo: <a href="${targetUrl}" style="color: #0d9488; word-break: break-all;">${targetUrl}</a>
              </p>
            </div>

            <!-- Footer -->
            <div style="padding: 16px 32px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #64748b;">
              <p style="margin: 0;">Crédito Negocios &bull; Enviado automáticamente a <strong>${SUPERADMIN_NOTIFICATION_EMAIL}</strong></p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
[Alerta Plataforma] ${payload.title}

${payload.message}

${payload.clientName ? `Cliente: ${payload.clientName}\n` : ''}${formattedAmount ? `Monto: ${formattedAmount}\n` : ''}${payload.brokerName ? `Broker: ${payload.brokerName}\n` : ''}${payload.financialInstitutionName ? `Financiera: ${payload.financialInstitutionName}\n` : ''}
Ir a la plataforma: ${targetUrl}

--
Crédito Negocios - Notificación para ${SUPERADMIN_NOTIFICATION_EMAIL}
      `.trim(),
    });

    if (error) {
      console.error('[Email] Resend super admin notification error:', error);
      return { success: false, error: error.message };
    }

    console.log(`[Email] Super admin email notification sent to ${SUPERADMIN_NOTIFICATION_EMAIL}: "${payload.title}"`);
    return { success: true };
  } catch (error: any) {
    console.error('[Email] Error sending super admin notification email:', error);
    return { success: false, error: error.message || 'Error desconocido' };
  }
}

// In-memory test store for test suites to capture simulated emails without logging plaintext secrets
export const _testEmailStore: {
  lastFormalizationOtp?: {
    to: string;
    code: string;
    role: string;
    documents: Array<{ title: string; version: string }>;
  };
  simulateFailure?: boolean;
} = {};

export async function sendFormalizationOtpEmail(payload: {
  to: string;
  userName?: string;
  code: string;
  role: string;
  documents: Array<{ title: string; version: string }>;
}): Promise<{ success: boolean; error?: string }> {
  try {
    if (process.env.NODE_ENV === "test") {
      if (_testEmailStore.simulateFailure) {
        return { success: false, error: "Simulated email delivery failure in test" };
      }
      _testEmailStore.lastFormalizationOtp = {
        to: payload.to,
        code: payload.code,
        role: payload.role,
        documents: payload.documents,
      };
      return { success: true };
    }

    if (!resend) {
      console.error("[Email] Formalization OTP email failed: missing email service provider configuration (RESEND_API_KEY)");
      return { success: false, error: "Servicio de correo electrónico no configurado" };
    }

    const roleLabel = payload.role === "master_broker" ? "Master Broker" : "Broker";
    const greeting = payload.userName ? `Hola ${payload.userName},` : "Hola,";
    const docsListHtml = payload.documents
      .map((d) => `<li style="margin-bottom: 4px;"><strong>${d.title}</strong> (Versión ${d.version})</li>`)
      .join("");
    const docsListText = payload.documents
      .map((d) => `- ${d.title} (Versión ${d.version})`)
      .join("\n");

    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [payload.to],
      subject: `Código de verificación para Convenio de Colaboración - ${APP_NAME}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Código de verificación</title>
        </head>
        <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8fafc;">
          <div style="background-color: #ffffff; border-radius: 12px; padding: 36px; box-shadow: 0 4px 16px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
            <div style="text-align: center; margin-bottom: 28px;">
              <h1 style="color: #05478a; margin: 0; font-size: 26px; font-weight: 800;">${APP_NAME}</h1>
              <p style="color: #64748b; margin-top: 4px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.1em;">Formalización de Colaborador (${roleLabel})</p>
            </div>

            <p style="margin-bottom: 16px; font-size: 15px;">${greeting}</p>

            <p style="margin-bottom: 20px; font-size: 14px; color: #334155;">
              Recibimos tu solicitud para formalizar tu relación comercial como <strong>${roleLabel}</strong> mediante la aceptación de los siguientes documentos legales vigentes:
            </p>

            <ul style="margin-bottom: 24px; padding-left: 20px; font-size: 14px; color: #1e293b;">
              ${docsListHtml}
            </ul>

            <p style="margin-bottom: 12px; font-size: 14px; color: #334155; text-align: center;">
              Tu código de verificación de un solo uso es:
            </p>

            <div style="text-align: center; margin: 24px 0;">
              <div style="display: inline-block; background-color: #f0fdf4; border: 2px dashed #16a34a; border-radius: 10px; padding: 16px 36px; font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #15803d; font-family: monospace;">
                ${payload.code}
              </div>
            </div>

            <div style="background-color: #f8fafc; border-radius: 8px; padding: 14px; margin-bottom: 20px; border: 1px solid #e2e8f0; font-size: 13px; color: #475569;">
              <p style="margin: 0 0 6px 0;"><strong>Seguridad y Vigencia:</strong></p>
              <ul style="margin: 0; padding-left: 18px;">
                <li>Este código expirará en <strong>10 minutos</strong>.</li>
                <li>Es de uso único y está vinculado a tu cuenta y a los documentos aprobados.</li>
                <li>Tienes un máximo de 5 intentos para ingresarlo correctamente.</li>
              </ul>
            </div>

            <p style="font-size: 12px; color: #94a3b8; margin: 0; text-align: center;">
              Si no realizaste esta solicitud, puedes ignorar este mensaje de forma segura o comunicarte con nuestro equipo.
            </p>
          </div>
          <div style="text-align: center; margin-top: 16px; font-size: 11px; color: #94a3b8;">
            <p>&copy; ${new Date().getFullYear()} ${APP_NAME}. Todos los derechos reservados.</p>
          </div>
        </body>
        </html>
      `.trim(),
      text: `
${greeting}

Recibimos tu solicitud para formalizar tu relación comercial como ${roleLabel} en ${APP_NAME}.

Documentos a formalizar:
${docsListText}

Tu código de verificación de un solo uso es:
${payload.code}

Seguridad:
- Este código expirará en 10 minutos.
- Es de uso único y está vinculado exclusivamente a tu cuenta y versiones exactas de los documentos.
- Tienes un máximo de 5 intentos.

Si no realizaste esta solicitud, ignora este mensaje.

---
${APP_NAME}
      `.trim(),
    });

    if (error) {
      console.error("[Email] Resend formalization OTP error:", error);
      return { success: false, error: error.message };
    }

    console.log(`[Email] Formalization OTP email sent successfully to ${payload.to}`);
    return { success: true };
  } catch (error: any) {
    console.error("[Email] Error sending formalization OTP email:", error);
    return { success: false, error: error.message || "Error desconocido" };
  }
}


/** LEG-10: client consent is unrelated to the Broker/Master convenio.
 * Never log one-time URLs or numeric codes. */
export const _testClientConsentMail: {
  lastLink?: { to:string; link:string };
  lastOtp?: { to:string; code:string };
  simulateFailure?:boolean;
} = {};

export async function sendClientConsentLinkEmail(input: {
  to:string; signerName:string; institutionName:string; token:string;
}):Promise<{success:boolean;error?:string}> {
  if (process.env.NODE_ENV === "test") {
    if (_testClientConsentMail.simulateFailure) return {success:false,error:"Simulated failure"};
    _testClientConsentMail.lastLink = {to:input.to,link:"/autorizar-expediente/"+input.token};
    return {success:true};
  }
  const base = process.env.FRONTEND_BASE_URL?.trim();
  if (!base || !/^https:\/\/[^/]+/.test(base) || !resend)
    return {success:false,error:"Enlace HTTPS o servicio de correo sin configurar"};
  const link=base.replace(/\/$/,"")+"/autorizar-expediente/"+encodeURIComponent(input.token);
  const esc=(v:string)=>v.replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
  try {
    const result=await resend.emails.send({
      from:FROM_EMAIL,to:[input.to],subject:"Autorización de expediente — Crédito Negocios",
      html:"<h2>Crédito Negocios — autorización del cliente</h2><p>Hola "+
        esc(input.signerName)+",</p><p>Se solicita tu autorización para compartir un expediente con "+
        esc(input.institutionName)+". Revisa la información y confirma personalmente.</p>"+
        "<p><a href='"+esc(link)+"'>Revisar autorización</a></p>"+
        "<p>Enlace personal válido por 48 horas. Si no reconoces esta solicitud, no lo utilices.</p>",
      text:"Crédito Negocios\nHola "+input.signerName+
        "\nRevisa la autorización específica para "+input.institutionName+
        ":\n"+link+"\nEnlace personal válido por 48 horas. Si no reconoces esta solicitud, ignóralo."
    });
    return result.error?{success:false,error:result.error.message}:{success:true};
  } catch(e:any) {return {success:false,error:e?.message||"Error al enviar correo"};}
}
export async function sendClientConsentOtpEmail(input:{
  to:string;signerName:string;code:string;
}):Promise<{success:boolean;error?:string}> {
  if (process.env.NODE_ENV === "test") {
    if (_testClientConsentMail.simulateFailure) return {success:false,error:"Simulated failure"};
    _testClientConsentMail.lastOtp={to:input.to,code:input.code};
    return {success:true};
  }
  if (!resend) return {success:false,error:"Servicio de correo no configurado"};
  try {
    const result=await resend.emails.send({
      from:FROM_EMAIL,to:[input.to],subject:"Código de autorización — Crédito Negocios",
      html:"<h2>Confirma la autorización del expediente</h2>"+
        "<p>Tu código personal es <strong>"+input.code+"</strong>.</p>"+
        "<p>Caduca en 10 minutos y sólo es válido para esta autorización.</p>",
      text:"Tu código para autorizar el expediente es: "+input.code+
        "\nVálido por 10 minutos. No lo compartas."
    });
    return result.error?{success:false,error:result.error.message}:{success:true};
  } catch(e:any) {return {success:false,error:e?.message||"Error al enviar OTP"};}
}
