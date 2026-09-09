"use client";

import { Suspense, lazy } from "react";
import { cn } from "@/lib/utils";

/**
 * Corpo formatado de um Aviso (Markdown) — mesma saída no modal do destinatário, no
 * detalhe do admin e na pré-visualização de quem escreve.
 *
 * O render de verdade mora em `corpo-aviso-markdown.tsx` e entra por `lazy`: o
 * `AvisoProvider` está montado no layout do dashboard, e importar react-markdown de forma
 * estática somava ~44 kB ao First Load JS de toda página do sistema.
 *
 * O fallback do `Suspense` é o texto cru com `whitespace-pre-wrap` — mesmo render que
 * existia antes da formatação. Enquanto o chunk não chega (e no HTML do servidor), a
 * mensagem já está legível; a formatação entra por cima, sem buraco na tela.
 */
const CorpoAvisoMarkdown = lazy(() => import("./corpo-aviso-markdown"));

export function CorpoAviso({ corpo, className }: { corpo: string; className?: string }) {
  return (
    <div className={cn("text-sm break-words", className)}>
      <Suspense fallback={<p className="whitespace-pre-wrap">{corpo}</p>}>
        <CorpoAvisoMarkdown corpo={corpo} />
      </Suspense>
    </div>
  );
}
