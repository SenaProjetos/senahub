export type ItemComposicao = { quantidade: number; valorUnitario: number };

/** Subtotal de um item, arredondado a centavos. */
export function subtotalItem(item: ItemComposicao): number {
  return Math.round(item.quantidade * item.valorUnitario * 100) / 100;
}

/** Soma dos subtotais, arredondada a centavos. */
export function totalComposicao(itens: ItemComposicao[]): number {
  return Math.round(itens.reduce((s, it) => s + it.quantidade * it.valorUnitario, 0) * 100) / 100;
}
