import { CopyPlus, Trash2 } from "lucide-react";

import type { AcaoItem } from "@/components/ui/acoes";

/**
 * Ações de uma linha da lista de furos do teste de percolação (Destino final do esgoto) — **puro**.
 * O mesmo array alimenta o menu de contexto e o `...` (ADR-0002, regra 2).
 */

export const ACAO_FURO_DUPLICAR = "duplicar";
export const ACAO_FURO_REMOVER = "remover";

export const MAX_FUROS_LISTA = 20;

export const MOTIVO_ULTIMO_FURO = "A lista precisa de ao menos um furo.";
export const MOTIVO_LISTA_CHEIA_FUROS = `A lista já tem o máximo de ${MAX_FUROS_LISTA} furos.`;

export function itensDeFuro(ctx: { total: number }): AcaoItem[] {
  return [
    {
      tipo: "acao",
      id: ACAO_FURO_DUPLICAR,
      rotulo: "Duplicar furo",
      icone: CopyPlus,
      desabilitado: ctx.total >= MAX_FUROS_LISTA ? MOTIVO_LISTA_CHEIA_FUROS : undefined,
    },
    { tipo: "separador", id: "sep-remover" },
    {
      tipo: "acao",
      id: ACAO_FURO_REMOVER,
      rotulo: "Remover furo",
      icone: Trash2,
      variant: "destructive",
      desabilitado: ctx.total <= 1 ? MOTIVO_ULTIMO_FURO : undefined,
      confirmar: {
        titulo: "Remover este furo?",
        descricao: "O furo sai do cálculo. Dá para digitá-lo de novo, mas não há desfazer.",
        rotuloConfirmar: "Remover",
      },
    },
  ];
}
