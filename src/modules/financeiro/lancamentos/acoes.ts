import { Ban, Check, Copy, Paperclip, Pencil, RotateCcw, Trash2, Undo2 } from "lucide-react";

import type { AcaoItem } from "@/components/ui/acoes";
import { MOTIVO_ACESSORIO, MOTIVO_CONCILIADO, MOTIVO_PAGO_ESTORNE } from "@/modules/financeiro/lancamentos/transicoes";
import { itemCriarRegra } from "@/modules/financeiro/regras/acoes";
import { itensDaTransferencia } from "@/modules/financeiro/transferencias/acoes";
import { itemCorrigirPagamento } from "@/modules/financeiro/lancamentos/acoes-corrigir";

/**
 * Ações de um lançamento (livro-caixa) — **puro**, sem React e sem I/O. O mesmo array alimenta o
 * menu de contexto da linha, o `...` e a barra de seleção (ADR-0002, regra 2).
 *
 * As regras de estado seguem a máquina de situações (`transicoes.ts`, N1): confirmar só no previsto,
 * estornar só no pago, reabrir só no cancelado; pago não se cancela (estorna antes) e conciliado não
 * se estorna nem se exclui — desabilitados com a mesma frase do servidor. O que só o servidor sabe
 * (produção, ART) ele recusa com a frase dele.
 */

export const ACAO_DETALHES = "detalhes";
export const ACAO_EDITAR = "editar";
export const ACAO_CONFIRMAR = "confirmar";
export const ACAO_CANCELAR = "cancelar";
export const ACAO_ESTORNAR = "estornar";
export const ACAO_REABRIR = "reabrir";
export const ACAO_EXCLUIR = "excluir";
export const ACAO_COPIAR_DESCRICAO = "copiar-descricao";
export const ACAO_LOTE_BAIXAR = "lote-baixar";
export const ACAO_LOTE_CANCELAR = "lote-cancelar";
export const ACAO_LOTE_EXCLUIR = "lote-excluir";

/** O que o descritor precisa saber do lançamento. */
export type LancamentoParaAcoes = {
  status: string;
  anexos: number;
  /** Tem transação do banco conciliada. */
  conciliado?: boolean;
  /** Informado = o menu oferece "Criar regra a partir deste lançamento" (sem categoria, desabilitado). */
  temCategoria?: boolean;
  /** Perna de transferência entre contas (M8): o menu é o da transferência inteira. */
  deTransferencia?: boolean;
  /** Juros/multa/desconto de uma baixa (M7): só anda com o principal. */
  deAcessorio?: boolean;
};

export function itensDeLancamento(l: LancamentoParaAcoes): AcaoItem[] {
  if (l.deAcessorio) {
    return [
      { tipo: "acao", id: ACAO_DETALHES, rotulo: l.anexos > 0 ? `Detalhes (${l.anexos})` : "Detalhes", icone: Paperclip },
      { tipo: "acao", id: ACAO_COPIAR_DESCRICAO, rotulo: "Copiar descrição", icone: Copy },
      { tipo: "acao", id: ACAO_ESTORNAR, rotulo: "Estornar", icone: Undo2, desabilitado: MOTIVO_ACESSORIO },
    ];
  }
  if (l.deTransferencia) {
    return [
      { tipo: "acao", id: ACAO_DETALHES, rotulo: l.anexos > 0 ? `Detalhes (${l.anexos})` : "Detalhes", icone: Paperclip },
      { tipo: "acao", id: ACAO_COPIAR_DESCRICAO, rotulo: "Copiar descrição", icone: Copy },
      { tipo: "separador", id: "sep-transferencia-lanc" },
      ...itensDaTransferencia({ realizada: l.status === "confirmado", conciliada: l.conciliado === true }, { podeGerir: true }),
    ];
  }
  const cancelado = l.status === "cancelado";
  const pago = l.status === "confirmado";
  const conciliado = l.conciliado === true;
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
    l.temCategoria === undefined ? null : itemCriarRegra(l.temCategoria),
    pago ? itemCorrigirPagamento() : null,
    cancelado ? null : { tipo: "separador", id: "sep-estado" },
    pago
      ? {
          tipo: "acao",
          id: ACAO_ESTORNAR,
          rotulo: "Estornar",
          icone: Undo2,
          desabilitado: conciliado ? MOTIVO_CONCILIADO : undefined,
          confirmar: {
            titulo: "Estornar este lançamento?",
            descricao:
              "Ele volta a ficar em aberto, sem data nem valor pagos. O saldo restante de uma baixa parcial e a distribuição entre caixinhas saem junto.",
            rotuloConfirmar: "Estornar",
          },
        }
      : null,
    cancelado ? { tipo: "acao", id: ACAO_REABRIR, rotulo: "Reabrir", icone: RotateCcw } : null,
    cancelado
      ? null
      : {
          tipo: "acao",
          id: ACAO_CANCELAR,
          rotulo: "Cancelar lançamento",
          icone: Ban,
          desabilitado: pago ? (conciliado ? MOTIVO_CONCILIADO : MOTIVO_PAGO_ESTORNE) : undefined,
        },
    cancelado
      ? null
      : {
          tipo: "acao",
          id: ACAO_EXCLUIR,
          rotulo: "Excluir",
          icone: Trash2,
          variant: "destructive",
          desabilitado: conciliado ? MOTIVO_CONCILIADO : undefined,
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
