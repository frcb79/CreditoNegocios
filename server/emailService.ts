import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_EMAIL = 'Crédito Negocios <noreply@creditonegocios.com.mx>';
const APP_NAME = 'Crédito Negocios';

export async function sendPasswordResetEmail(
  to: string,
  resetToken: string,
  userName?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Use FRONTEND_BASE_URL for custom domain, or get from REPLIT_DOMAINS, or fallback to localhost
    let baseUrl = process.env.FRONTEND_BASE_URL;
    
    if (!baseUrl && process.env.REPLIT_DOMAINS) {
      // REPLIT_DOMAINS contains comma-separated list of domains, use the first one
      const domains = process.env.REPLIT_DOMAINS.split(',');
      baseUrl = `https://${domains[0]}`;
    }
    
    if (!baseUrl) {
      baseUrl = 'http://localhost:5000';
    }
    
    const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;
    console.log('[Email] Generated reset URL:', resetUrl);
    const greeting = userName ? `Hola ${userName},` : 'Hola,';

    const { data, error } = await resend.emails.send({
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
      console.error('Resend email error:', error);
      return { success: false, error: error.message };
    }

    console.log('Password reset email sent successfully:', data?.id);
    return { success: true };
  } catch (error: any) {
    console.error('Error sending password reset email:', error);
    return { success: false, error: error.message || 'Error desconocido' };
  }
}
