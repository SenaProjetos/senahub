import { Copy, FileText, Link2, Undo2 } from "lucide-react";

import { limparSeparadores, type AcaoItem } from "@/components/ui/acoes";
import { MOTIVO_CONCILIADO, MOTIVO_PROJETISTA } from "@/modules/financeiro/lancamentos/transicoes";

/**
 * Ações de uma linha do Extrato por conta — **puro** (ADR-0002). Navegar (ver o lançamento, ir conciliar)
 * é link de verdade; estornar e copiar são ações. Estado proibido fica desabilitado com a frase da máquina
 * de situações: conciliado não estorna, pagamento de produção estorna pela Produção.
 */

export const ACAO_ESTORNAR_LINHA = "estornar";
export const ACAO_COPIAR_LINHA = "copiar-descricao";
export const ACAO_VER_LANCAMENTO = "ver-lancamento";
export const ACAO_CONCILIAR_LINHA = "conciliar";

export const MOTIVO_JA_CONCILIADO = "Já está conciliado com o extrato do banco.";

export type LinhaParaAcoes = { id: string; conciliado: boolean; deProducao: boolean };

export function itensDeLinhaDoExtrato(l: LinhaParaAcoes, ctx: { podeGerir: boolean; podeConciliar: boolean }): AcaoItem[] {
  const itens: (AcaoItem | null)[] = [
    { tipo: "link", id: ACAO_VER_LANCAMENTO, rotulo: "Ver o lançamento", icone: FileText, href: `/financeiro/lancamentos?lancamento=${l.id}` },
    ctx.podeConciliar
      ? l.conciliado
        ? { tipo: "acao", id: ACAO_CONCILIAR_LINHA, rotulo: "Conciliar com o extrato…", icone: Link2, desabilitado: MOTIVO_JA_CONCILIADO }
        : { tipo: "link", id: ACAO_CONCILIAR_LINHA, rotulo: "Conciliar com o extrato…", icone: Link2, href: "/financeiro/conciliacao" }
      : null,
    { tipo: "acao", id: ACAO_COPIAR_LINHA, rotulo: "Copiar descrição", icone: Copy },
    ctx.podeGerir ? { tipo: "separador", id: "sep-estorno" } : null,
    ctx.podeGerir
      ? {
          tipo: "acao",
          id: ACAO_ESTORNAR_LINHA,
          rotulo: "Estornar pagamento",
          icone: Undo2,
          desabilitado: l.deProducao ? MOTIVO_PROJETISTA : l.conciliado ? MOTIVO_CONCILIADO : undefined,
          confirmar: {
            titulo: "Estornar este lançamento?",
            descricao: "Ele volta a ficar em aberto e sai do extrato desta conta.",
            rotuloConfirmar: "Estornar",
          },
        }
      : null,
  ];
  return limparSeparadores(itens.filter((i): i is AcaoItem => i !== null));
}
