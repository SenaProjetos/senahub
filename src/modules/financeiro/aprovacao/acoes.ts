import { Check, ExternalLink, X } from "lucide-react";

import { limparSeparadores, type AcaoItem } from "@/components/ui/acoes";

/**
 * Ações de uma despesa que espera aprovação (ADR-0002) — **puro**. O mesmo array alimenta o menu de
 * contexto da linha, o `...` e a barra de seleção. Quem não tem `financeiro:aprovar` não vê ação de
 * decisão (só o atalho para o lançamento).
 *
 * O ÚNICO motivo de desabilitar é a alçada por faixa, com a mesma frase que `aprovarLancamento`
 * devolve — a regra vive no servidor (`papeisAprovadores`) e a tela só repete o que ela diria.
 * Nada aqui inventa regra nova: se amanhã o escritório decidir que ninguém aprova a própria
 * despesa, isso nasce na action primeiro.
 */

export const ACAO_APROVAR = "aprovar";
export const ACAO_REJEITAR = "rejeitar";
export const ACAO_ABRIR = "abrir";

export const MOTIVO_SEM_ALCADA = "Você não tem alçada para aprovar este valor.";

export type DespesaParaAprovar = {
  id: string;
  /** `true` quando o papel de quem está na tela não cobre o valor (regra do servidor). */
  semAlcada: boolean;
};

export type ContextoAprovacao = { podeAprovar: boolean };

export function itensDeAprovacao(d: DespesaParaAprovar, ctx: ContextoAprovacao): AcaoItem[] {
  const motivo = d.semAlcada ? MOTIVO_SEM_ALCADA : undefined;
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
