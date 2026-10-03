/**
 * Indicadores gerenciais (M6). Puro, sem I/O — as fórmulas isoladas de `queries.ts` para serem testadas sem banco.
 *
 * Ponto de equilíbrio por MARGEM DE CONTRIBUIÇÃO (decisão do dono, 2026-10-03): cada categoria de despesa é custo
 * fixo ou variável (`CategoriaFinanceira.tipoCusto`, herdado da mãe; sem nada na cadeia vale fixo).
 */

export type TipoCusto = "fixo" | "variavel";

/** Custo efetivo de uma categoria: o próprio, senão o do ancestral mais próximo que tiver; sem nenhum, fixo. */
export function tipoCustoEfetivo(cadeia: readonly (TipoCusto | null | undefined)[]): TipoCusto {
  for (const t of cadeia) if (t) return t;
  return "fixo";
}

export function margemLiquida(receita: number, resultado: number): number | null {
  if (!(receita > 0)) return null;
  return Math.round((resultado / receita) * 1000) / 10;
}

/** Pontos percentuais entre duas margens (ambas já em %, ou null se faltar uma). */
export function variacaoPontosPercentuais(atual: number | null, anterior: number | null): number | null {
  if (atual == null || anterior == null) return null;
  return Math.round((atual - anterior) * 10) / 10;
}

/**
 * Receita por mês que paga os custos: fixos ÷ (1 − variáveis ÷ receita). Os variáveis entram como fração da receita
 * (a margem de contribuição); sem receita no período não há essa fração, então só os fixos contam. `null` quando os
 * variáveis comem toda a receita — não existe faturamento que cubra os fixos.
 */
export function pontoDeEquilibrio(p: { fixos: number; variaveis: number; receita: number }): number | null {
  if (!(p.receita > 0)) return Math.round(p.fixos * 100) / 100;
  const margem = 1 - p.variaveis / p.receita;
  if (!(margem > 0)) return null;
  return Math.round((p.fixos / margem) * 100) / 100;
}

/** Vencido há mais de 30 dias ÷ faturado nos últimos 12 meses. `null` sem faturamento no período. */
export function percentualInadimplencia(vencidoMais30: number, faturado12Meses: number): number | null {
  if (!(faturado12Meses > 0)) return null;
  return Math.round((vencidoMais30 / faturado12Meses) * 1000) / 10;
}

/** Média simples (por quantidade, não ponderada por valor) dos dias entre dois marcos. `null` sem nenhum item. */
export function prazoMedioDias(itens: readonly { dias: number }[]): number | null {
  if (itens.length === 0) return null;
  const soma = itens.reduce((s, i) => s + i.dias, 0);
  return Math.round(soma / itens.length);
}

export function receitaPorProjetoAtivo(receita: number, projetosAtivos: number): number | null {
  if (!(projetosAtivos > 0)) return null;
  return Math.round((receita / projetosAtivos) * 100) / 100;
}
