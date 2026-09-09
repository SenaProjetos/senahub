"use client";

import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import type { Components } from "react-markdown";

/**
 * Metade PESADA do `CorpoAviso` (react-markdown + remark ≈ 44 kB) — importada sob demanda
 * por `corpo-aviso.tsx`, nunca direto. O `AvisoProvider` mora no layout do dashboard, então
 * importar isto de forma estática somava esses 44 kB ao First Load JS de TODA página do
 * sistema por causa de um modal que quase nunca abre.
 *
 * Render do corpo formatado de um Aviso — mesma saída no modal do destinatário, no
 * detalhe do admin e na pré-visualização de quem escreve.
 *
 * Duas travas de segurança, porque isso é escrito por quem tem `avisos:enviar`
 * (permissão fina, não é só admin) e é lido por TODA a base, cliente incluído:
 *
 * 1. `react-markdown` não renderiza HTML cru sem `rehype-raw` — que de propósito não
 *    entra aqui. `<script>` digitado no campo sai como texto literal.
 * 2. `a` e `img` são desmontados abaixo (viram texto/nada): a barra de formatação não
 *    oferece link nem imagem remota, então permitir `[x](javascript:…)` ou um pixel de
 *    rastreio de fora seria superfície de graça.
 *
 * `remarkBreaks` casa com o `breaks: true` do `marked` no caminho do e-mail
 * (`lib/email-markdown.ts`): quebra de linha simples vale nos dois.
 */
const COMPONENTES: Components = {
  // Títulos = os três "tamanhos de fonte" que a barra oferece.
  h1: ({ children }) => <p className="mt-3 mb-1 text-lg font-bold first:mt-0">{children}</p>,
  h2: ({ children }) => <p className="mt-3 mb-1 text-base font-bold first:mt-0">{children}</p>,
  h3: ({ children }) => <p className="mt-3 mb-1 text-sm font-bold first:mt-0">{children}</p>,
  p: ({ children }) => <p className="my-2 leading-relaxed first:mt-0 last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  ul: ({ children }) => <ul className="my-2 ml-5 list-disc space-y-0.5">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 ml-5 list-decimal space-y-0.5">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-current/30 pl-3 italic">{children}</blockquote>
  ),
  hr: () => <hr className="my-3 border-current/20" />,
  code: ({ children }) => <code className="rounded-sm bg-current/10 px-1 py-0.5 text-[0.9em]">{children}</code>,
  // Link vira texto puro e imagem some — ver trava 2 no comentário acima.
  a: ({ children }) => <>{children}</>,
  img: () => null,
};

export default function CorpoAvisoMarkdown({ corpo }: { corpo: string }) {
  return (
    <Markdown remarkPlugins={[remarkGfm, remarkBreaks]} components={COMPONENTES}>
      {corpo}
    </Markdown>
  );
}
