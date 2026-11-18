/**
 * Habitação pela NBR 5410:2004, 9.5.2 — **puro**. Spec §5, passos 7 a 10, e §8.
 *
 * - Iluminação: o SUGERIDO tem folga (fração de 4 m² acima de 6 m² conta como acréscimo completo); o ALERTA compara
 *   com o mínimo da norma (só 4 m² inteiros). Decisão do usuário (spec §8, caso 23).
 * - Tomadas da cozinha e análogos: o piso de 2 (acima da bancada) conta DENTRO do total por perímetro.
 * - Potência: regra geral por padrão; a alternativa "conjunto com mais de 6 pontos" (600 VA até 2) é escolha do
 *   projetista.
 */

import { arredondarParaCima, parteInteira } from "./arredondar";
import {
  ILUMINACAO_HABITACAO as IL,
  noGrupoDe600,
  POTENCIA_TOMADAS_HABITACAO as PT,
  TOMADAS_HABITACAO as TO,
  type TipoComodo,
} from "./biblioteca/nbr5410-habitacao";
import { MSG, type Mensagem } from "./mensagens";

/** Passo 7 — iluminação sugerida (VA): 100 + 60 · ⌈(A − 6) ÷ 4⌉ acima de 6 m². */
export function iluminacaoSugeridaVA(areaM2: number): number {
  if (areaM2 <= IL.areaBaseM2) return IL.cargaBaseVA;
  return IL.cargaBaseVA + IL.acrescimoVA * arredondarParaCima((areaM2 - IL.areaBaseM2) / IL.passoM2);
}

/** Passo 7 — iluminação mínima da norma (VA): 100 + 60 · ⌊(A − 6) ÷ 4⌋ acima de 6 m². */
export function iluminacaoMinimaVA(areaM2: number): number {
  if (areaM2 <= IL.areaBaseM2) return IL.cargaBaseVA;
  return IL.cargaBaseVA + IL.acrescimoVA * parteInteira((areaM2 - IL.areaBaseM2) / IL.passoM2);
}

/** Passo 8 — número mínimo de pontos de tomada (9.5.2.2.1). */
export function tomadasMinimas(tipo: TipoComodo, areaM2: number, perimetroM: number): number {
  switch (tipo) {
    case "banheiro":
      return TO.banheiro;
    case "cozinha":
      return Math.max(arredondarParaCima(perimetroM / TO.cozinhaPerimetroM), TO.cozinhaMinimoBancada);
    case "varanda":
      return TO.varanda;
    case "sala":
    case "dormitorio":
      return arredondarParaCima(perimetroM / TO.salaPerimetroM);
    case "demais":
      return areaM2 <= TO.demaisAreaLimiteM2 ? TO.demaisAteLimite : arredondarParaCima(perimetroM / TO.demaisPerimetroM);
  }
}

/**
 * Passo 9 — potência mínima do conjunto de tomadas de UM ambiente (VA), para `n` pontos (9.5.2.2.2).
 * `alternativa` = o projetista escolheu o critério de "conjunto com mais de 6 pontos" (600 VA até 2 pontos).
 */
export function potenciaTomadasMinimaVA(tipo: TipoComodo, n: number, alternativa = false): number {
  if (!noGrupoDe600(tipo)) return PT.demaisVA * n;
  const ate = alternativa ? PT.alternativaAtePontos : PT.grupoAtePontos;
  return PT.grupoVA * Math.min(n, ate) + PT.excedenteVA * Math.max(n - ate, 0);
}

/** A alternativa só é admitida quando o conjunto de banheiros, cozinhas e análogos passa de 6 pontos. */
export function alternativaAdmitida(pontosDoConjunto: number): boolean {
  return pontosDoConjunto > PT.alternativaConjuntoAcimaDe;
}

/** Passo 10 — W = VA × FP. */
export function wDeVA(va: number, fp: number): number {
  return va * fp;
}

export type ComodoHabitacao = {
  tipo: TipoComodo;
  areaM2: number;
  perimetroM: number;
  /** Valores adotados (o projetista pode aumentar o sugerido). */
  iluminacaoVA: number;
  tomadas: number;
  tomadasVA: number;
  alternativa?: boolean;
};

export type ResultadoComodo = {
  iluminacaoSugeridaVA: number;
  iluminacaoMinimaVA: number;
  tomadasSugeridas: number;
  tomadasVASugerido: number;
  /** Mínimo de potência para a quantidade ADOTADA de tomadas. */
  tomadasVAMinimo: number;
  avisos: Mensagem[];
};

/** Sugestões e alertas de um cômodo de habitação. */
export function avaliarComodo(c: ComodoHabitacao): ResultadoComodo {
  const tomadasSugeridas = tomadasMinimas(c.tipo, c.areaM2, c.perimetroM);
  const ilMin = iluminacaoMinimaVA(c.areaM2);
  const vaMin = potenciaTomadasMinimaVA(c.tipo, c.tomadas, c.alternativa);
  const avisos: Mensagem[] = [];
  if (c.iluminacaoVA < ilMin) avisos.push(MSG.iluminacaoAbaixoMinimo(ilMin));
  if (c.tomadas < tomadasSugeridas) avisos.push(MSG.tugAbaixoMinimo(tomadasSugeridas));
  if (c.tomadasVA < vaMin) avisos.push(MSG.potenciaTomadaAbaixoMinimo(vaMin));
  return {
    iluminacaoSugeridaVA: iluminacaoSugeridaVA(c.areaM2),
    iluminacaoMinimaVA: ilMin,
    tomadasSugeridas,
    tomadasVASugerido: potenciaTomadasMinimaVA(c.tipo, tomadasSugeridas, c.alternativa),
    tomadasVAMinimo: vaMin,
    avisos,
  };
}
