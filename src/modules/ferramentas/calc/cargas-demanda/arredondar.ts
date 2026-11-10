/**
 * Arredondamentos das regras de norma — **puro**. "Para cada 3,5 m, ou fração" e "4 m² inteiros" são contas de
 * quociente; em ponto flutuante 12,6 ÷ 4,2 pode dar 3,0000000000000004 e o `ceil` cru somaria um ponto que a norma
 * não pede. Tolerância de 1e-9 só absorve esse ruído (muito abaixo das 2 casas exibidas).
 */

const EPS = 1e-9;

/** "Ou fração": arredonda para cima. */
export function arredondarParaCima(x: number): number {
  return Math.ceil(x - EPS);
}

/** "Inteiros": parte inteira. */
export function parteInteira(x: number): number {
  return Math.floor(x + EPS);
}
