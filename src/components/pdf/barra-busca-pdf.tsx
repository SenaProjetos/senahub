"use client";

import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  query: string;
  onQueryChange: (v: string) => void;
  total: number;
  indiceAtual: number;
  pronto: boolean;
  onProxima: () => void;
  onAnterior: () => void;
  className?: string;
};

/** Barra de busca textual (destaca tudo + contador "X de Y" + navegação), pros dois visualizadores de PDF. */
export function BarraBuscaPdf({ query, onQueryChange, total, indiceAtual, pronto, onProxima, onAnterior, className }: Props) {
  const temQuery = query.trim().length > 0;
  return (
    <div className={className}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Buscar no documento…"
          className="h-7 w-36 rounded-sm border bg-background pl-7 pr-6 text-xs outline-none focus:border-primary sm:w-52"
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            if (e.shiftKey) onAnterior();
            else onProxima();
          }}
        />
        {temQuery && (
          <button
            type="button"
            onClick={() => onQueryChange("")}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Limpar busca"
            title="Limpar busca"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
      {temQuery && (
        <span className="min-w-[4.5ch] text-center text-xs tabular-nums text-muted-foreground">
          {!pronto ? "…" : `${total > 0 ? indiceAtual + 1 : 0} de ${total}`}
        </span>
      )}
      <Button
        size="icon"
        variant="ghost"
        className="size-7"
        onClick={onAnterior}
        disabled={total === 0}
        aria-label="Ocorrência anterior"
        title="Anterior (Shift+Enter)"
      >
        <ChevronUp className="size-4" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="size-7"
        onClick={onProxima}
        disabled={total === 0}
        aria-label="Próxima ocorrência"
        title="Próxima (Enter)"
      >
        <ChevronDown className="size-4" />
      </Button>
    </div>
  );
}
