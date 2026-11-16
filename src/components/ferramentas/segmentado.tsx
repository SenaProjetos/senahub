"use client";

import { cn } from "@/lib/utils";

export type OpcaoSegmentada<T extends string> = { valor: T; rotulo: string; /** Nome completo, quando o rótulo é abreviado. */ titulo?: string };

/**
 * Escolha exclusiva entre poucas opções curtas, todas à vista (ligação mono/tri, isolação). Cada opção é
 * um botão com `aria-pressed`; o grupo leva o nome acessível (`rotulo` ou `rotuladoPor`).
 */
export function Segmentado<T extends string>({
  opcoes,
  valor,
  onChange,
  rotulo,
  rotuladoPor,
  className,
}: {
  opcoes: readonly OpcaoSegmentada<T>[];
  valor: T;
  onChange: (valor: T) => void;
  rotulo?: string;
  rotuladoPor?: string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={rotulo}
      aria-labelledby={rotuladoPor}
      className={cn("flex h-8 min-w-0 overflow-hidden rounded-sm border border-input bg-card pointer-coarse:h-10", className)}
    >
      {opcoes.map((o) => {
        const ativo = o.valor === valor;
        return (
          <button
            key={o.valor}
            type="button"
            aria-pressed={ativo}
            title={o.titulo}
            onClick={() => onChange(o.valor)}
            className={cn(
              "min-w-0 flex-1 truncate border-input px-1 text-xs font-medium text-muted-foreground transition-colors not-last:border-r",
              "hover:bg-muted/60 hover:text-foreground focus-visible:relative focus-visible:z-10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
              ativo && "bg-primary font-semibold text-primary-foreground hover:bg-primary hover:text-primary-foreground",
            )}
          >
            {o.rotulo}
          </button>
        );
      })}
    </div>
  );
}
