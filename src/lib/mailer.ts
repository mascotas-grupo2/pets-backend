import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/** Escapa datos del usuario (nombre) antes de incrustarlos en el HTML del correo. */
function escapeHtml(value: string): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Verificar la conexión al inicio para detectar errores de SMTP rápido
transporter.verify((error) => {
  if (error) {
    console.error("[Mailer] Error de configuración SMTP:", error.message);
  } else {
    console.log("[Mailer] Servidor de correo listo para enviar mensajes");
  }
});

export async function sendVerificationMail(to: string, name: string, url: string) {
  const from = process.env.SMTP_FROM || `"Huellitas Unidas" <${process.env.SMTP_USER}>`;

  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject: "Verifica tu cuenta en Huellitas Unidas - NO RESPONDER",
      html: `
        <h1>Hola, ${escapeHtml(name)}!</h1>
        <p>Gracias por unirte. Para activar tu cuenta, haz clic en el siguiente enlace:</p>
        <p><a href="${url}">${url}</a></p>
        <p>Si no creaste esta cuenta, puedes ignorar este correo.</p>
      `,
    });
    console.log(`[Mailer] Correo de verificación enviado a: ${to} (ID: ${info.messageId})`);
    return info;
  } catch (error) {
    console.error(`[Mailer] Falló el envío a ${to}:`, error);
    // Relanzamos el error para que el controlador pueda informar al usuario
    throw error;
  }
}

export async function sendPasswordResetMail(to: string, name: string, url: string) {
  const from = process.env.SMTP_FROM || `"Huellitas Unidas" <${process.env.SMTP_USER}>`;

  await transporter.sendMail({
    from,
    to,
    subject: "Restablece tu contraseña en Huellitas Unidas - NO RESPONDER",
    html: `
      <h1>Hola, ${escapeHtml(name)}!</h1>
      <p>Recibimos una solicitud para restablecer tu contraseña.</p>
      <p>Para crear una nueva, haz clic en el siguiente enlace:</p>
      <p><a href="${url}">${url}</a></p>
      <p>Este enlace vence en 1 hora.</p>
      <p>Si no solicitaste este cambio, puedes ignorar este correo.</p>
    `,
  });
}
