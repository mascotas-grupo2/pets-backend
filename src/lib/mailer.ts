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

console.log(`[Mailer] Configurado para host: ${process.env.SMTP_HOST || 'localhost (default)'} en puerto: ${process.env.SMTP_PORT || 587}`);

export async function sendVerificationMail(to: string, name: string, url: string) {
  const from = process.env.SMTP_FROM || `"Huellitas Unidas" <${process.env.SMTP_USER}>`;

  await transporter.sendMail({
    from,
    to,
    subject: "Verifica tu cuenta en Huellitas Unidas - NO RESPONDER",
    html: `
      <h1>Hola, ${name}!</h1>
      <p>Gracias por unirte. Para activar tu cuenta, haz clic en el siguiente enlace:</p>
      <p><a href="${url}">${url}</a></p>
      <p>Si no creaste esta cuenta, puedes ignorar este correo.</p>
    `,
  });
}
