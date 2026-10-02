import { Check, ExternalLink, X } from "lucide-react";

import { limparSeparadores, type AcaoItem } from "@/components/ui/acoes";

/**
 * Ações de uma despesa que espera aprovação (ADR-0002) — **puro**. O mesmo array alimenta o menu de
 * contexto da linha, o `...` e a barra de seleção. Quem não tem `financeiro:aprovar` não vê ação de
 * decisão (só o atalho para o lançamento).
 *
 * O motivo de desabilitar vem pronto do servidor (`bloqueio`, de `motivoParaNaoAprovar`: alçada
 * pelo total do parcelamento e "quem lançou não aprova"), com a mesma frase que `aprovarLancamento`
 * devolve. Nada aqui inventa regra.
 */

export const ACAO_APROVAR = "aprovar";
export const ACAO_REJEITAR = "rejeitar";
export const ACAO_ABRIR = "abrir";

export { MOTIVO_PROPRIA_DESPESA, MOTIVO_SEM_ALCADA } from "@/modules/financeiro/aprovacao/niveis";

export type DespesaParaAprovar = {
  id: string;
  /** Por que quem está na tela não pode decidir (regra do servidor); `null` = pode. */
  bloqueio: string | null;
};

export type ContextoAprovacao = { podeAprovar: boolean };

export function itensDeAprovacao(d: DespesaParaAprovar, ctx: ContextoAprovacao): AcaoItem[] {
  const motivo = d.bloqueio ?? undefined;
  const itens: (AcaoItem | null)[] = [
    ctx.podeAprovar ? { tipo: "acao", id: ACAO_APROVAR, rotulo: "Aprovar", icone: Check, desabilitado: motivo } : null,
    ctx.podeAprovar
      ? {
          tipo: "acao",
          id: ACAO_REJEITAR,
          rotulo: "Rejeitar…",
          icone: X,
          variant: "destructive",
          desabilitado: motivo,
          // O diálogo da tela pede o motivo e confirma — por isso sem `confirmar` aqui.
          dica: "Pede o motivo, que vai para quem lançou",
        }
      : null,
    ctx.podeAprovar ? { tipo: "separador", id: "sep" } : null,
    { tipo: "link", id: ACAO_ABRIR, rotulo: "Ver no livro caixa", icone: ExternalLink, href: `/financeiro/lancamentos?lancamento=${d.id}` },
  ];
  return limparSeparadores(itens.filter((i): i is AcaoItem => i !== null));
}
