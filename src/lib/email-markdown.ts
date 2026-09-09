/**
 * Parte PURA/client-safe de `email-templates.ts` (sem `server-only`) — separada
 * pra poder ser usada tanto no envio real (server) quanto na pré-visualização
 * ao vivo da tela de admin (`/configuracoes/emails`, client component), sem
 * duplicar a lógica de substituição/Markdown em dois lugares.
 */
import { marked } from "marked";

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
