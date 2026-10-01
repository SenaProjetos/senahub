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

/** Campos do planejador de caixa que o resto de um parcial herda do lançamento original. */
export type CamposDoPlanejador = {
  prioridade: "p1" | "p2" | "p3" | "p4" | null;
  confianca: "confirmada_cliente" | "provavel" | "estimada" | "incerta" | null;
  transferenciaId: string | null;
  caixinhaId: string | null;
};

/**
 * O resto de um pagamento parcial é o MESMO compromisso, só menor: sem estes campos ele perderia
 * a prioridade, a confiança e o par de transferência, e o planejador o trataria como outra conta
 * (spec 2026-09-30 §5e). A caixinha também: sem ela o resto deixaria de sair do reservado. Sócio entra
 * aqui quando a coluna existir (F6A).
 */
export function camposDoPlanejador(l: {
  prioridade?: CamposDoPlanejador["prioridade"];
  confianca?: CamposDoPlanejador["confianca"];
  transferenciaId?: string | null;
  caixinhaId?: string | null;
}): CamposDoPlanejador {
  return {
    prioridade: l.prioridade ?? null,
    confianca: l.confianca ?? null,
    transferenciaId: l.transferenciaId ?? null,
    caixinhaId: l.caixinhaId ?? null,
  };
}
