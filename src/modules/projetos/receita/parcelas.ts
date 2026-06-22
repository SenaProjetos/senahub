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
