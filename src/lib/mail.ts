import "server-only";
import nodemailer from "nodemailer";

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (transporter) return transporter;
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
  return transporter;
}

export function smtpConfigurado(): boolean {
  return !!process.env.SMTP_HOST;
}

/** Anexo de e-mail (formato aceito pelo nodemailer). */
export type EmailAnexo = {
  filename: string;
  content: Buffer;
  contentType?: string;
  /** Content-ID para imagem inline: referenciada no HTML por `src="cid:<cid>"`. */
  cid?: string;
};

/** Envia e-mail. Retorna false se SMTP não configurado ou falha. */
export async function enviarEmail(opts: {
  to: string;
  subject: string;
  html: string;
  attachments?: EmailAnexo[];
}): Promise<boolean> {
  const t = getTransporter();
  if (!t) return false;
  const remetente = process.env.SMTP_FROM || process.env.SMTP_USER;
  try {
    await t.sendMail({
      from: remetente && !remetente.includes("<") ? `"SenaHub" <${remetente}>` : remetente,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      attachments: opts.attachments,
    });
    return true;
  } catch (err) {
    console.error("[mail] falha ao enviar:", err);
    return false;
  }
}
