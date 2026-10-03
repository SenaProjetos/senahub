/**
 * Indicadores gerenciais (M6). Puro, sem I/O — as fórmulas isoladas de `queries.ts` para serem testadas sem banco.
 *
 * `pontoDeEquilibrio` é uma aproximação deliberada: o plano de contas não separa custo fixo de variável (como o
 * EBITDA gerencial em `dre.ts` já documenta para grupoDfc), então o ponto de equilíbrio aqui é "a receita que, se
 * fosse exatamente essa no mês, deixaria o resultado em zero" — ou seja, as despesas do próprio mês. Não é uma
 * margem de contribuição de verdade; a tela explica isso.
 */

export function margemLiquida(receita: number, resultado: number): number | null {
  if (!(receita > 0)) return null;
  return Math.round((resultado / receita) * 1000) / 10;
}

/** Pontos percentuais entre duas margens (ambas já em %, ou null se faltar uma). */
export function variacaoPontosPercentuais(atual: number | null, anterior: number | null): number | null {
  if (atual == null || anterior == null) return null;
  return Math.round((atual - anterior) * 10) / 10;
}

/** A receita do mês que cobriria exatamente as despesas do mês (ver limitação no topo do arquivo). */
export function pontoDeEquilibrio(despesasDoMes: number): number {
  return Math.round(despesasDoMes * 100) / 100;
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
