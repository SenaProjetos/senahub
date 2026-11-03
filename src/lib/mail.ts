import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { wrapEmail } from "@/lib/email-layout";

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
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
    // Sem teto, o nodemailer espera minutos; a borda (Cloudflare) corta a requisição em 100 s, a pessoa vê erro,
    // o envio termina mesmo assim e ela manda de novo. Com teto, o erro chega antes e é o de verdade.
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
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

/** Detecta um documento HTML já completo (evita moldura dupla). */
function jaEhDocumento(html: string): boolean {
  return /^\s*<(!doctype|html)/i.test(html);
}

/**
 * Envia e-mail. Retorna false se SMTP não configurado ou falha.
 *
 * O `html` recebido é um FRAGMENTO (corpo) — aqui ele é envolvido na moldura branded
 * do sistema (`wrapEmail`), garantindo visual consistente em TODOS os e-mails. Passe
 * `wrap: false` (ou um documento já completo) para escapar da moldura.
 */
export async function enviarEmail(opts: {
  to: string;
  subject: string;
  html: string;
  attachments?: EmailAnexo[];
  /** Desliga a moldura branded (padrão: liga, exceto se `html` já for um documento). */
  wrap?: boolean;
  /** Cópia oculta (ex.: quem clicou em "enviar", para o envio aparecer na caixa dessa pessoa). */
  bcc?: string;
  /** Para onde vai a resposta do destinatário. */
  replyTo?: string;
  /** Encadeamento de conversa: `Message-ID` próprio e o que ele responde (`In-Reply-To`/`References`). */
  messageId?: string;
  inReplyTo?: string;
  references?: string;
}): Promise<boolean> {
  const t = getTransporter();
  if (!t) return false;
  const remetente = process.env.SMTP_FROM || process.env.SMTP_USER;
  const html =
    opts.wrap === false || jaEhDocumento(opts.html) ? opts.html : wrapEmail(opts.html, { preheader: opts.subject });
  try {
    await t.sendMail({
      from: remetente && !remetente.includes("<") ? `"SenaHub" <${remetente}>` : remetente,
      to: opts.to,
      subject: opts.subject,
      html,
      attachments: opts.attachments,
      bcc: opts.bcc,
      replyTo: opts.replyTo,
      messageId: opts.messageId,
      inReplyTo: opts.inReplyTo,
      references: opts.references,
    });
    return true;
  } catch (err) {
    console.error("[mail] falha ao enviar:", err);
    return false;
  }
}
