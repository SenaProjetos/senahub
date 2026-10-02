/**
 * Quanto de fato entrou ou saiu num lançamento REALIZADO. Puro, sem I/O.
 *
 * O pago (`valorEfetivo`: parcial, juros, desconto) vence o nominal (`valor`). Somar `valor` dos
 * confirmados conta o que se esperava, não o que se recebeu — e `_sum.valorEfetivo ?? _sum.valor`
 * também erra: basta UM lançamento com `valorEfetivo` para a soma inteira ignorar os outros.
 * Por isso a soma é feita linha a linha, em centavos.
 */
import { paraCentavos, paraReais } from "@/modules/financeiro/liquidez/dinheiro";

type Valor = number | string | { toString(): string };
export type LinhaPaga = { valor: Valor; valorEfetivo: Valor | null };

/** Valor pago de UM lançamento realizado, em centavos. */
export function valorPagoCentavos(l: LinhaPaga): number {
  return paraCentavos(l.valorEfetivo ?? l.valor);
}

/** Soma do valor pago de lançamentos realizados, em reais (centavos somados, sem erro de ponto flutuante). */
export function somaPaga(linhas: readonly LinhaPaga[]): number {
  return paraReais(linhas.reduce((s, l) => s + valorPagoCentavos(l), 0));
}

/**
 * Valor pago de UM lançamento em reais, exato em 2 casas (passa por centavos). Para acumuladores de
 * relatório: cada parcela entra sem ruído de ponto flutuante e `acc = arredondar(acc + v)` não deriva.
 */
export function valorPagoReais(l: LinhaPaga): number {
  return paraReais(valorPagoCentavos(l));
}

/** Soma de dois valores em reais sem deriva de ponto flutuante (via centavos). */
export function somarReais(a: number, b: number): number {
  return paraReais(paraCentavos(a) + paraCentavos(b));
}
