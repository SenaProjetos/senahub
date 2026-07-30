/**
 * Compara propostas de uma RFQ pelo TOTAL COMPARÁVEL em R$ — nunca por uma nota composta/ponderada
 * (preço, prazo, validade e avaliação do fornecedor pesarem juntos exigiria pesos que ninguém
 * definiu; isso é decisão de negócio do humano que escolhe, não do sistema). PURO: só soma o que a
 * proposta já declara. Proposta parcial (faltando item da RFQ) nunca fica à frente de uma completa,
 * mesmo com total menor — ela está incompleta, não "mais barata".
 */

export type ItemComparado = {
  rfqItemId: string;
  precoUnitario: number;
  quantidadeItem: number;
};

export type PropostaEntrada = {
  propostaId: string;
  fornecedorNome: string;
  itens: ItemComparado[];
  frete: number;
  /// true = precoUnitario já inclui imposto; false = soma impostosValor ao total comparável.
  impostosInclusos: boolean;
  impostosValor: number | null;
  prazoEntregaDias: number | null;
  validadeAte: Date | null;
  avaliacaoFornecedor: number | null;
};

export type PropostaComparada = PropostaEntrada & {
  totalComparavel: number;
  /// rfqItemIds da RFQ que esta proposta não cotou.
  itensFaltando: string[];
};

function totalComparavel(entrada: PropostaEntrada): number {
  const totalItens = entrada.itens.reduce((soma, item) => soma + item.precoUnitario * item.quantidadeItem, 0);
  const imposto = entrada.impostosInclusos ? 0 : (entrada.impostosValor ?? 0);
  return totalItens + entrada.frete + imposto;
}

function comparar(a: PropostaComparada, b: PropostaComparada): number {
  if (a.totalComparavel !== b.totalComparavel) return a.totalComparavel - b.totalComparavel;
  const prazoA = a.prazoEntregaDias ?? Number.POSITIVE_INFINITY;
  const prazoB = b.prazoEntregaDias ?? Number.POSITIVE_INFINITY;
  return prazoA - prazoB;
}

/** Ordena por total comparável crescente; propostas completas sempre antes de parciais. */
export function compararPropostas(entradas: PropostaEntrada[], rfqItemIds: string[]): PropostaComparada[] {
  const comparadas: PropostaComparada[] = entradas.map((entrada) => {
    const cotados = new Set(entrada.itens.map((i) => i.rfqItemId));
    return {
      ...entrada,
      totalComparavel: totalComparavel(entrada),
      itensFaltando: rfqItemIds.filter((id) => !cotados.has(id)),
    };
  });

  const completas = comparadas.filter((p) => p.itensFaltando.length === 0).sort(comparar);
  const parciais = comparadas.filter((p) => p.itensFaltando.length > 0).sort(comparar);
  return [...completas, ...parciais];
}

/** A proposta no topo do ranking completo — `null` se nenhuma proposta cotou todos os itens. */
export function melhorPropostaCompleta(comparadas: PropostaComparada[]): PropostaComparada | null {
  return comparadas.find((p) => p.itensFaltando.length === 0) ?? null;
}
