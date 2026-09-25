import { CalendarCheck, IndentDecrease, IndentIncrease, ListPlus, Pencil, Plus, Trash2 } from "lucide-react";

import { limparSeparadores, type AcaoItem } from "@/components/ui/acoes";
import { MOTIVO_IRMA_E_MARCO, MOTIVO_NIVEL_MAIS_ALTO, MOTIVO_SEM_IRMA_ACIMA } from "./arvore-eap";

/**
 * Ações de uma linha do cronograma (EAP) — **puro**. O mesmo array alimenta o menu de contexto, o `...` e os
 * atalhos de teclado (ADR-0002, regra 2). O que o perfil não permite não entra; o que o estado da linha impede
 * entra desabilitado com o motivo — a MESMA frase do `ActionError` do servidor (regra 5). Os gates só escondem
 * itens: o gate real segue nas actions.
 */

export const ACAO_ABRIR = "abrir";
export const ACAO_INSERIR_ACIMA = "inserir-acima";
export const ACAO_RECUAR = "recuar";
export const ACAO_AVANCAR = "avancar";
export const ACAO_ATUALIZAR = "atualizar";
export const ACAO_GERAR_CARD = "gerar-card";
export const ACAO_EXCLUIR = "excluir";

export const MOTIVO_SEM_CARD_EM_RASCUNHO = "O card nasce quando o cronograma é aprovado — rascunho não gera card.";

export type LinhaParaAcoes = {
  nome: string;
  /** Tem subtarefas (agrupamento). */
  ehResumo: boolean;
  temIrmaAcima: boolean;
  irmaAcimaEMarco: boolean;
  nivel: number;
  subtarefas: number;
};

export function itensDeLinhaEap(
  l: LinhaParaAcoes,
  ctx: { podeGerir: boolean; podeExecutado: boolean; cronogramaAprovado: boolean },
): AcaoItem[] {
  const motivoRecuar = !l.temIrmaAcima ? MOTIVO_SEM_IRMA_ACIMA : l.irmaAcimaEMarco ? MOTIVO_IRMA_E_MARCO : undefined;
  const motivoAvancar = l.nivel <= 1 ? MOTIVO_NIVEL_MAIS_ALTO : undefined;

  const itens: (AcaoItem | null)[] = [
    ctx.podeGerir ? { tipo: "acao", id: ACAO_ABRIR, rotulo: "Informações da tarefa", icone: Pencil } : null,
    ctx.podeGerir ? { tipo: "acao", id: ACAO_INSERIR_ACIMA, rotulo: "Inserir tarefa acima", icone: Plus } : null,
    ctx.podeGerir
      ? { tipo: "acao", id: ACAO_RECUAR, rotulo: "Recuar (tornar subtarefa)", icone: IndentIncrease, desabilitado: motivoRecuar }
      : null,
    ctx.podeGerir
      ? { tipo: "acao", id: ACAO_AVANCAR, rotulo: "Avançar (subir um nível)", icone: IndentDecrease, desabilitado: motivoAvancar }
      : null,
    { tipo: "separador", id: "sep-execucao" },
    ctx.podeExecutado && !l.ehResumo
      ? { tipo: "acao", id: ACAO_ATUALIZAR, rotulo: "Atualizar tarefa (datas reais)", icone: CalendarCheck }
      : null,
    ctx.podeGerir && !l.ehResumo
      ? {
          tipo: "acao",
          id: ACAO_GERAR_CARD,
          rotulo: "Gerar tarefa no kanban",
          icone: ListPlus,
          desabilitado: ctx.cronogramaAprovado ? undefined : MOTIVO_SEM_CARD_EM_RASCUNHO,
        }
      : null,
    ctx.podeGerir ? { tipo: "separador", id: "sep-excluir" } : null,
    ctx.podeGerir
      ? {
          tipo: "acao",
          id: ACAO_EXCLUIR,
          rotulo: "Excluir tarefa",
          icone: Trash2,
          variant: "destructive",
          confirmar: {
            titulo: `Excluir "${l.nome}"?`,
            descricao:
              l.subtarefas > 0
                ? `Ela tem ${l.subtarefas} subtarefa${l.subtarefas > 1 ? "s" : ""}, que também ${l.subtarefas > 1 ? "serão excluídas" : "será excluída"}. Os cards já gerados no quadro de tarefas ficam.`
                : "Os cards já gerados no quadro de tarefas ficam.",
            rotuloConfirmar: "Excluir",
          },
        }
      : null,
  ];
  return limparSeparadores(itens.filter((i): i is AcaoItem => i !== null));
}
