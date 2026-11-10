/**
 * Peças comuns dos métodos de área útil — **puro**: faixas de área das tabelas, fórmula Y = c · X^e e a linha de cada
 * tipo de apartamento (um fator "demanda por apartamento" por tipo).
 */

import { valorPorLimiteSuperior, type Faixa } from "../fd";
import { MSG, type Mensagem } from "../mensagens";
import { fator, type Ajustes, type FatorDoMetodo, type TipoApartamento } from "./tipos";

/** Linha de tabela de área ({ de, ate } com "até X" = de nulo) → `Faixa`. */
export function faixasDeArea<L>(linhas: readonly L[], area: (l: L) => { de: number | null; ate: number }, valor: (l: L) => number): Faixa<number>[] {
  return linhas.map((l) => ({ de: area(l).de ?? 0, ate: area(l).ate, valor: valor(l) }));
}

/** Maior limite superior das faixas (acima dele a tabela não vale). */
export function limiteDaTabela(faixas: readonly Faixa<number>[]): number {
  return Math.max(...faixas.map((f) => f.ate ?? Number.POSITIVE_INFINITY));
}

/** Valor da tabela de área (regra de limite superior, pergunta 3 do plano). Acima da tabela: `null`. */
export function valorDaArea(faixas: readonly Faixa<number>[], areaM2: number): number | null {
  return areaM2 > limiteDaTabela(faixas) + 1e-9 ? null : valorPorLimiteSuperior(faixas, areaM2);
}

/** Y = c · X^e (Equatorial, Celesc, Copel acima da tabela). */
export function formulaDaArea(coef: number, expoente: number, areaM2: number): number {
  return coef * areaM2 ** expoente;
}

/** Recusa "campo âmbar" de cada fator do método sem valor (nem sugerido nem digitado). */
export function avisosDeFaltantes(fatores: readonly FatorDoMetodo[]): Mensagem[] {
  return fatores
    .filter((f) => f.adotado == null)
    .map((f) => MSG.campoObrigatorio(f.rotulo.charAt(0).toLowerCase() + f.rotulo.slice(1)));
}

/** Um fator "demanda por apartamento" para cada tipo, chave `<prefixo>:<índice>`. */
export function fatoresPorTipo(
  tipos: readonly TipoApartamento[],
  prefixo: string,
  rotulo: (t: TipoApartamento) => string,
  sugerido: (t: TipoApartamento) => { valor: number | null; referencia: string },
  ajustes: Ajustes | undefined,
  extra?: { simbolo?: string; unidade?: string },
): FatorDoMetodo[] {
  return tipos.map((t, i) => {
    const s = sugerido(t);
    return fator(`${prefixo}:${i}`, rotulo(t), s.valor, s.referencia, ajustes, extra);
  });
}
