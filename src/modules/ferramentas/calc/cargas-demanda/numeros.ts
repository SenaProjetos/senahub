/**
 * Formatação de números da Calculadora de cargas e demanda — **pura**.
 * Spec §5: cálculo em precisão total, exibição com 2 casas decimais em todo valor (vírgula decimal e ponto de milhar).
 */

const DUAS_CASAS = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const INTEIRO = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

/** 1520 → "1.520,00". Valor não finito → "—". */
export function fmt2(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const s = DUAS_CASAS.format(n);
  return s === "-0,00" ? "0,00" : s;
}

/** Contagens (aparelhos, apartamentos, medidores): 1600 → "1.600". */
export function fmtInteiro(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return INTEIRO.format(n);
}

/** Igualdade com a tolerância dos testes da spec (±0,01), para comparar números já calculados. */
export function quase(a: number, b: number, tol = 1e-9): boolean {
  return Math.abs(a - b) <= tol;
}
