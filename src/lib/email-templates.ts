import "server-only";
import { marked } from "marked";
import { prisma } from "@/lib/prisma";
import { enviarEmail, type EmailAnexo } from "@/lib/mail";
import { metaTemplate } from "@/lib/email-templates-meta";

export type TemplateVars = Record<string, string | number | null | undefined>;

/** Substitui `{{variavel}}` pelo valor (cru). Aplicado antes do Markdown. */
export function substituirVariaveis(tpl: string, vars: TemplateVars): string {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, chave: string) => {
    const v = vars[chave];
    return v === null || v === undefined ? "" : String(v);
  });
}

/** Converte o corpo (Markdown, GFM) em HTML para o e-mail. */
export function markdownParaHtml(md: string): string {
  return marked.parse(md, { async: false, gfm: true, breaks: true }) as string;
}

/**
 * Escolhe o modelo (sorteio entre os ativos; 1 ativo = fixo; nenhum = padrão do
 * catálogo) e já substitui as variáveis, SEM converter o Markdown. Serve de base
 * comum para o e-mail (vira HTML) e para o sino (texto) — garantindo que ambos
 * usem o MESMO conteúdo resolvido numa única escolha.
 */
export async function resolverTemplate(
  slug: string,
  vars: TemplateVars,
): Promise<{ assunto: string; corpo: string }> {
  const meta = metaTemplate(slug);
  let assuntoRaw = meta?.assuntoPadrao ?? "";
  let corpoRaw = meta?.corpoPadrao ?? "";

  const ativos = await prisma.emailTemplateVariante.findMany({ where: { slug, ativo: true } });
  if (ativos.length > 0) {
    const escolhida = ativos[Math.floor(Math.random() * ativos.length)];
    assuntoRaw = escolhida.assunto;
    corpoRaw = escolhida.corpoHtml;
  }

  return {
    assunto: substituirVariaveis(assuntoRaw, vars),
    corpo: substituirVariaveis(corpoRaw, vars),
  };
}

/**
 * Resolve assunto + corpo de um tipo de e-mail (corpo em HTML). O corpo é
 * Markdown convertido em HTML; o assunto é texto puro (sem Markdown).
 */
export async function renderTemplate(
  slug: string,
  vars: TemplateVars,
): Promise<{ assunto: string; html: string }> {
  const { assunto, corpo } = await resolverTemplate(slug, vars);
  return { assunto, html: markdownParaHtml(corpo) };
}

/** Renderiza e envia um e-mail templated. Retorna false se SMTP off/falha. */
export async function enviarEmailTemplate(
  to: string,
  slug: string,
  vars: TemplateVars,
  attachments?: EmailAnexo[],
): Promise<boolean> {
  const { assunto, html } = await renderTemplate(slug, vars);
  return enviarEmail({ to, subject: assunto, html, attachments });
}
