/**
 * Saldo remanescente de um pagamento/recebimento parcial.
 *
 * Retorna o valor que ainda resta a pagar/receber (arredondado a centavos) ou `null`
 * quando não há parcial: efetivo ausente, efetivo ≥ total, ou diferença < 1 centavo.
 */
export function saldoRestante(total: number, efetivo: number | null | undefined): number | null {
  if (efetivo == null) return null;
  const resto = Math.round((total - efetivo) * 100) / 100;
  return resto >= 0.01 ? resto : null;
}
