/**
 * Regras puras da folha de projetistas (Produção) — sem Prisma client, sem Next.
 * Compartilhadas pelas actions de pagamento individual e de lote.
 */

/** Decimal do Prisma ou número já serializado — `Number()` resolve os dois. */
type Valor = number | { toString(): string };

export const MSG_PAGAMENTO_SEM_VALOR =
  "Este pagamento está sem valor — corrija o valor antes de pagar.";

export const MSG_LOTE_SEM_VALOR =
  "Todos os pagamentos pendentes deste lote estão sem valor — corrija os valores antes de pagar.";

/**
 * Pagamento só pode ser efetivado com valor positivo. Pagar R$ 0,00 cria um `Lancamento`
 * CONFIRMADO de R$ 0,00 no caixa (`confirmarDespesaProjetista` não tem previsto para
 * reaproveitar nessas linhas, então cria um novo) — sujeira contábil sem volta pela tela.
 */
export function temValorPagavel(valor: Valor): boolean {
  return Number(valor) > 0;
}

/**
 * Separa os pendentes de um lote entre pagáveis e sem valor. O lote paga os pagáveis e
 * deixa os sem valor pendentes — um lote com linha zerada não bloqueia o resto.
 */
export function separarPagaveis<T extends { valor: Valor }>(pagamentos: T[]) {
  const pagaveis: T[] = [];
  const semValor: T[] = [];
  for (const p of pagamentos) (temValorPagavel(p.valor) ? pagaveis : semValor).push(p);
  return { pagaveis, semValor };
}
