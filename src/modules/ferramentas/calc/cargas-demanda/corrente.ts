/**
 * Corrente, corrente corrigida e disjuntor sugerido — **puro**. Spec §5, passos 19 a 21.
 * Mesmas fórmulas da calculadora "Corrente e Demanda" (`calc/electrical-demand.ts`, que não é alterada):
 *   circuito:    Ib  = P_abs ÷ (k·V·fp)
 *   CMD e CPG:   I   = S ÷ (k·V)
 *   corrigida:   Ib′ = Ib ÷ (FCT × FCA)
 * k = 1 (monofásica, ou bifásica entre fases, como a calculadora existente trata "fase-fase") ou √3 (trifásica).
 */

import { MAIOR_DISJUNTOR_A, SERIE_DISJUNTORES_A } from "./biblioteca/disjuntores";
import { MSG, type Mensagem } from "./mensagens";

/** Sistema de tensões (fase-neutro / fase-fase). */
export const SISTEMAS = { "220/127": { faseNeutro: 127, faseFase: 220 }, "380/220": { faseNeutro: 220, faseFase: 380 } } as const;
export type Sistema = keyof typeof SISTEMAS;

export const LIGACOES = ["mono", "bi", "tri"] as const;
export type Ligacao = (typeof LIGACOES)[number];

export const LIGACAO_ROTULO: Record<Ligacao, string> = { mono: "Monofásica", bi: "Bifásica", tri: "Trifásica" };

/** Tensão usada na conta e o k: monofásica = fase-neutro, k 1; bifásica = fase-fase, k 1; trifásica = fase-fase, k √3. */
export function tensaoDaLigacao(sistema: Sistema, ligacao: Ligacao): { v: number; k: number } {
  const s = SISTEMAS[sistema];
  if (ligacao === "mono") return { v: s.faseNeutro, k: 1 };
  if (ligacao === "bi") return { v: s.faseFase, k: 1 };
  return { v: s.faseFase, k: Math.sqrt(3) };
}

/** Passo 19, circuito: Ib = P_abs ÷ (k·V·fp). */
export function correnteDoCircuito(pAbsW: number, v: number, k: number, fp: number): number {
  return pAbsW / (k * v * fp);
}

/** Passo 19, CMD e CPG: I = S ÷ (k·V), com S em VA. */
export function correnteDaDemanda(sVA: number, v: number, k: number): number {
  return sVA / (k * v);
}

export type ResultadoCorrigida = { ibCorrigida: number; fatorCombinado: number; avisos: Mensagem[] };

/** Passo 20 — Ib′ = Ib ÷ (FCT × FCA); alerta da spec §6 quando FCT × FCA < 0,5. */
export function correnteCorrigida(ib: number, fct: number, fca: number): ResultadoCorrigida {
  const fatorCombinado = fct * fca;
  return {
    ibCorrigida: ib / fatorCombinado,
    fatorCombinado,
    avisos: fatorCombinado < 0.5 ? [MSG.fatorCombinadoBaixo()] : [],
  };
}

export type ResultadoDisjuntor = { sugeridoA: number | null; avisos: Mensagem[] };

/** Passo 21 — menor valor da série ≥ Ib. Acima de 1.600 A: sem sugestão e alerta. */
export function disjuntorSugerido(ibA: number): ResultadoDisjuntor {
  const sugeridoA = SERIE_DISJUNTORES_A.find((x) => x >= ibA - 1e-9) ?? null;
  return { sugeridoA, avisos: ibA > MAIOR_DISJUNTOR_A ? [MSG.correnteAcimaSerie()] : [] };
}
