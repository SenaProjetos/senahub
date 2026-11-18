import type { ReactNode } from "react";
import { TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Faixa "Em validação" de uma calculadora cujo motor ainda não foi conferido por um engenheiro.
 * `children` entra à direita do texto (a tela larga põe ali a disciplina e a norma).
 */
export function AvisoValidacao({ className, children }: { className?: string; children?: ReactNode }) {
  return (
    <div
      role="note"
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-warning/50 border-l-4 border-l-warning bg-warning/10 px-4 py-2.5 text-sm",
        className,
      )}
    >
      <p className="flex min-w-0 flex-[1_1_24rem] items-start gap-2">
        <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning-text" />
        <span>
          <strong className="font-semibold">Em validação.</strong> Um engenheiro da casa ainda não conferiu as fórmulas e
          tabelas desta calculadora. Só quem gere as ferramentas a vê, e a memória sai marcada como &quot;não usar em projeto&quot;.
        </span>
      </p>
      {children}
    </div>
  );
}
