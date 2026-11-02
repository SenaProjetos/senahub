import { Pencil, Trash2 } from "lucide-react";

import type { AcaoItem } from "@/components/ui/acoes";

/**
 * Ações de uma linha de "Competências que o projeto precisa" (Visão Geral do projeto) — **puro**
 * (ADR-0002). O mesmo array alimenta o menu de contexto e o `...`. Quem não pode editar o projeto
 * não recebe nenhum item: a linha fica só de leitura.
 */

export const ACAO_NECESSIDADE_EDITAR = "editar";
export const ACAO_NECESSIDADE_REMOVER = "remover";

export function itensDeNecessidade(ctx: { podeEditar: boolean; competencia: string }): AcaoItem[] {
  if (!ctx.podeEditar) return [];
  return [
    { tipo: "acao", id: ACAO_NECESSIDADE_EDITAR, rotulo: "Alterar nível e observação", icone: Pencil },
    { tipo: "separador", id: "sep-remover" },
    {
      tipo: "acao",
      id: ACAO_NECESSIDADE_REMOVER,
      rotulo: "Remover do projeto",
      icone: Trash2,
      variant: "destructive",
      confirmar: {
        titulo: `Remover "${ctx.competencia}" das necessidades do projeto?`,
        descricao: "A competência continua no catálogo e nas pessoas; só deixa de ser exigida por este projeto.",
        rotuloConfirmar: "Remover",
      },
    },
  ];
}
