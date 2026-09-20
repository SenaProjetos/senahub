"use client";

import { ListChecks } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * "Selecionados (N)" na barra de filtros — liga e desliga a visão só do que foi marcado.
 *
 * Existe porque a seleção atravessa filtro e página (decisão do dono, 2026-09-20): sem este botão
 * não haveria como rever um conjunto montado em filtros diferentes, já que parte dele está fora do
 * filtro atual. Ligado, a lista ignora os demais filtros e mostra só os marcados.
 *
 * Some quando não há seleção: botão que não faz nada só ocupa a barra.
 */
export function BotaoSelecionados({
  total,
  ativo,
  onChange,
  className,
}: {
  total: number;
  ativo: boolean;
  onChange: (ativo: boolean) => void;
  className?: string;
}) {
  if (total === 0) return null;

  return (
    <Button
      type="button"
      size="sm"
      variant={ativo ? "secondary" : "outline"}
      className={cn("h-8", className)}
      aria-pressed={ativo}
      onClick={() => onChange(!ativo)}
      title={ativo ? "Voltar a ver a lista com os filtros" : "Ver só as linhas selecionadas, de todos os filtros"}
    >
      <ListChecks className="size-4" aria-hidden />
      Selecionados ({total})
    </Button>
  );
}
