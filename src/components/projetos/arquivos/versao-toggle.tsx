"use client";

import { ChevronRight, History } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Botão que expande/colapsa as versões anteriores de um arquivo (acordeão). Só
 * aparece quando há histórico (>0 versões antigas). Compartilhado por disciplina,
 * Geral e Recebidos.
 */
export function VersaoToggle({
  n,
  aberto,
  onClick,
  nome,
}: {
  n: number;
  aberto: boolean;
  onClick: () => void;
  nome: string;
}) {
  return (
    <button
      type="button"
      className="flex shrink-0 items-center gap-0.5 rounded-sm px-1 text-xs text-muted-foreground hover:text-foreground"
      aria-expanded={aberto}
      aria-label={`${n} versão(ões) anterior(es) de ${nome}`}
      title={aberto ? "Ocultar versões anteriores" : `Ver ${n} versão(ões) anterior(es)`}
      onClick={onClick}
    >
      <History className="size-3.5" />
      <span className="font-mono">{n}</span>
      <ChevronRight className={cn("size-3 transition-transform", aberto && "rotate-90")} />
    </button>
  );
}
