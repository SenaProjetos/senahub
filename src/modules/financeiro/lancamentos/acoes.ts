import { Ban, Check, Copy, Paperclip, Pencil, Trash2 } from "lucide-react";

import type { AcaoItem } from "@/components/ui/acoes";

/**
 * Ações de um lançamento (livro-caixa) — **puro**, sem React e sem I/O. O mesmo array alimenta o
 * menu de contexto da linha, o `...` e a barra de seleção (ADR-0002, regra 2).
 *
 * As regras de estado são as que o `...` já tinha: editar/cancelar/excluir só em lançamento que não
 * está cancelado, confirmar só no previsto. Os gates de servidor continuam nas actions.
 */

export const ACAO_DETALHES = "detalhes";
export const ACAO_EDITAR = "editar";
export const ACAO_CONFIRMAR = "confirmar";
export const ACAO_CANCELAR = "cancelar";
export const ACAO_EXCLUIR = "excluir";
export const ACAO_COPIAR_DESCRICAO = "copiar-descricao";
export const ACAO_LOTE_BAIXAR = "lote-baixar";
export const ACAO_LOTE_CANCELAR = "lote-cancelar";
export const ACAO_LOTE_EXCLUIR = "lote-excluir";

/** O que o descritor precisa saber do lançamento. */
export type LancamentoParaAcoes = {
  status: string;
  anexos: number;
};

export function itensDeLancamento(l: LancamentoParaAcoes): AcaoItem[] {
  const cancelado = l.status === "cancelado";
  const itens: (AcaoItem | null)[] = [
    {
      tipo: "acao",
      id: ACAO_DETALHES,
      rotulo: l.anexos > 0 ? `Detalhes (${l.anexos})` : "Detalhes",
      icone: Paperclip,
    },
    cancelado ? null : { tipo: "acao", id: ACAO_EDITAR, rotulo: "Editar", icone: Pencil },
    l.status === "previsto" ? { tipo: "acao", id: ACAO_CONFIRMAR, rotulo: "Confirmar", icone: Check } : null,
    // Reposição do "Copiar" que o menu nativo dava no texto da linha (ADR-0002, regra 1).
    { tipo: "acao", id: ACAO_COPIAR_DESCRICAO, rotulo: "Copiar descrição", icone: Copy },
    cancelado ? null : { tipo: "separador", id: "sep-estado" },
    cancelado ? null : { tipo: "acao", id: ACAO_CANCELAR, rotulo: "Cancelar lançamento", icone: Ban },
    cancelado
      ? null
      : {
          tipo: "acao",
          id: ACAO_EXCLUIR,
          rotulo: "Excluir",
          icone: Trash2,
          variant: "destructive",
          // Antes excluía direto, sem perguntar: regra 4 da ADR-0002 exige confirmação.
          confirmar: {
            titulo: "Excluir este lançamento?",
            descricao: "O lançamento sai do livro-caixa.",
            rotuloConfirmar: "Excluir",
          },
        },
  ];
  return itens.filter((i): i is AcaoItem => i !== null);
}

/** Motivo de um item de lote não ter o que fazer. */
export const MOTIVO_SO_CANCELADOS = "Todos os selecionados já estão cancelados.";
export const MOTIVO_NENHUM_PREVISTO = "Nenhum dos selecionados está previsto — só previsto pode ser baixado.";

/**
 * Lote sobre vários lançamentos. "Baixar" é o que já existia (abre o diálogo de conta/forma/data e
 * roda a ação atômica do servidor); cancelar e excluir repetem a ação de UM lançamento.
 */
export function itensDeLoteLancamentos(selecionados: readonly { status: string }[]): AcaoItem[] {
  const algumPrevisto = selecionados.some((s) => s.status === "previsto");
  const todosCancelados = selecionados.length > 0 && selecionados.every((s) => s.status === "cancelado");
  return [
    {
      tipo: "acao",
      id: ACAO_LOTE_BAIXAR,
      rotulo: "Baixar",
      icone: Check,
      desabilitado: algumPrevisto ? undefined : MOTIVO_NENHUM_PREVISTO,
    },
    {
      tipo: "acao",
      id: ACAO_LOTE_CANCELAR,
      rotulo: "Cancelar",
      icone: Ban,
      desabilitado: todosCancelados ? MOTIVO_SO_CANCELADOS : undefined,
      confirmar: {
        titulo: "Cancelar os lançamentos selecionados?",
        descricao: "Os que já estiverem cancelados ficam de fora.",
        rotuloConfirmar: "Cancelar lançamentos",
      },
    },
    {
      tipo: "acao",
      id: ACAO_LOTE_EXCLUIR,
      rotulo: "Excluir",
      icone: Trash2,
      variant: "destructive",
      desabilitado: todosCancelados ? MOTIVO_SO_CANCELADOS : undefined,
      confirmar: {
        titulo: "Excluir os lançamentos selecionados?",
        descricao: "Os lançamentos saem do livro-caixa.",
        rotuloConfirmar: "Excluir",
      },
    },
  ];
}
