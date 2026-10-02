/**
 * Divide um total em `n` parcelas com 2 casas, colocando os centavos restantes na
 * primeira parcela para que a soma seja exatamente o total (sem perder/criar centavos).
 */
export function dividirEmParcelas(total: number, n: number): number[] {
  if (n < 1) return [];
  const parcela = Math.floor((total / n) * 100) / 100;
  const primeira = Number((total - parcela * (n - 1)).toFixed(2));
  return Array.from({ length: n }, (_, k) => (k === 0 ? primeira : parcela));
}

/** Tag que identifica os lançamentos de receita gerados como parcelas de contrato. */
export const TAG_PARCELA_CONTRATO = "contrato";

/** Prefixo de tag que vincula um recebível a uma disciplina faturada por entrega. */
export const TAG_ENTREGA_PREFIXO = "entrega:";

/**
 * Parcela criada por "Gerar parcelas" (ou o resto de um parcial dela, que herda as tags). O
 * faturamento por entrega também leva a tag `contrato`, mas é um recebível de verdade, ligado a
 * uma disciplina: regenerar as parcelas nunca pode apagá-lo (A6).
 */
export function ehParcelaGerada(tags: readonly string[]): boolean {
  return tags.includes(TAG_PARCELA_CONTRATO) && !tags.some((t) => t.startsWith(TAG_ENTREGA_PREFIXO));
}

/**
 * Quanto ainda falta parcelar: o total do contrato menos o que já entrou pelas parcelas geradas.
 * Antes, regenerar redividia o total inteiro e cobrava de novo o que o cliente já tinha pago.
 * Em centavos; `null` quando nada falta.
 */
export function saldoAParcelar(totalCentavos: number, recebidoCentavos: number): number | null {
  const falta = totalCentavos - recebidoCentavos;
  return falta > 0 ? falta : null;
}
