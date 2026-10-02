import { ArrowLeftRight, Check, Trash2, Undo2 } from "lucide-react";

import { limparSeparadores, type AcaoItem } from "@/components/ui/acoes";
import { MOTIVO_CONCILIADO } from "@/modules/financeiro/lancamentos/transicoes";

/**
 * Ações de uma TRANSFERÊNCIA entre contas, vistas a partir de uma das pernas (M8, ADR-0002) — **puro**.
 * Quem abre o menu é a perna (a linha do livro caixa, de Contas, de Pagas ou do extrato); o que o menu
 * oferece é da transferência inteira, porque as duas pernas andam juntas. O servidor confere de novo
 * lendo o par (`transferencias/calculo.ts`): aqui o estado só desabilita o que ele recusaria.
 */

export const ACAO_TRANSFERENCIA_EDITAR = "transferencia-editar";
export const ACAO_TRANSFERENCIA_BAIXAR = "transferencia-baixar";
export const ACAO_TRANSFERENCIA_ESTORNAR = "transferencia-estornar";
export const ACAO_TRANSFERENCIA_EXCLUIR = "transferencia-excluir";

/** Os ids deste descritor: quem recebe o clique sabe que é da transferência pelo prefixo. */
export const ehAcaoDeTransferencia = (id: string) => id.startsWith("transferencia-");

export type PernaParaAcoes = {
  /** A perna está paga/recebida (a outra anda junto). */
  realizada: boolean;
  /** A perna está conciliada com o extrato do banco da conta dela. */
  conciliada: boolean;
};

export function itensDaTransferencia(p: PernaParaAcoes, ctx: { podeGerir: boolean }): AcaoItem[] {
  if (!ctx.podeGerir) return [];
  const travada = p.conciliada ? MOTIVO_CONCILIADO : undefined;
  const itens: (AcaoItem | null)[] = [
    { tipo: "acao", id: ACAO_TRANSFERENCIA_EDITAR, rotulo: "Editar transferência…", icone: ArrowLeftRight, desabilitado: travada },
    p.realizada
      ? {
          tipo: "acao",
          id: ACAO_TRANSFERENCIA_ESTORNAR,
          rotulo: "Estornar transferência",
          icone: Undo2,
          desabilitado: travada,
          confirmar: {
            titulo: "Estornar esta transferência?",
            descricao: "As duas pernas voltam a ficar em aberto: o dinheiro deixa de ter saído de uma conta e entrado na outra.",
            rotuloConfirmar: "Estornar",
          },
        }
      : {
          tipo: "acao",
          id: ACAO_TRANSFERENCIA_BAIXAR,
          rotulo: "Dar baixa na transferência",
          icone: Check,
          confirmar: {
            titulo: "Dar baixa nesta transferência?",
            descricao: "As duas pernas ficam pagas hoje: o dinheiro sai de uma conta e entra na outra.",
            rotuloConfirmar: "Dar baixa",
          },
        },
    { tipo: "separador", id: "sep-transferencia" },
    {
      tipo: "acao",
      id: ACAO_TRANSFERENCIA_EXCLUIR,
      rotulo: "Excluir transferência…",
      icone: Trash2,
      variant: "destructive",
      desabilitado: travada,
      confirmar: {
        titulo: "Excluir esta transferência?",
        descricao: "As duas pernas saem do livro caixa e o saldo das duas contas volta ao que era.",
        rotuloConfirmar: "Excluir",
      },
    },
  ];
  return limparSeparadores(itens.filter((i): i is AcaoItem => i !== null));
}
