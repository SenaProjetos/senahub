/**
 * Iluminação por iluminância (método do fluxo total) — **puro**. Spec §5, passos 1 a 6.
 * Em é a iluminância mantida (NBR ISO/CIE 8995-1:2013, seção 5), sugerida pela atividade e editável.
 * Fu e Fm são sempre digitados. K serve só para o projetista consultar o Fu no catálogo.
 */

import { arredondarParaCima } from "./arredondar";
import { MSG, type Mensagem } from "./mensagens";

export type EntradaLux = {
  areaM2: number;
  perimetroM: number;
  peDireitoM: number;
  alturaPlanoM: number;
  emLux: number;
  fu: number;
  fm: number;
  luminaria: { fluxoLm: number; potenciaW: number; fp: number };
  /** Quantidade escolhida; ausente = adota a sugerida. */
  quantidade?: number;
};

export type ResultadoLux = {
  alturaUtilM: number;
  indiceK: number;
  fluxoNecessarioLm: number;
  quantidadeSugerida: number;
  quantidade: number;
  iluminanciaFinalLux: number;
  potenciaW: number;
  potenciaVA: number;
  avisos: Mensagem[];
};

/** Passo 1 — h = pé-direito − altura do plano de trabalho. */
export function alturaUtil(peDireitoM: number, alturaPlanoM: number): number {
  return peDireitoM - alturaPlanoM;
}

/** Passo 2 — K = 2·A ÷ (h·P) (prática da casa, ambiente retangular). */
export function indiceDoRecinto(areaM2: number, alturaUtilM: number, perimetroM: number): number {
  return (2 * areaM2) / (alturaUtilM * perimetroM);
}

/** Passo 3 — Φ = Em·A ÷ (Fu·Fm). */
export function fluxoNecessario(emLux: number, areaM2: number, fu: number, fm: number): number {
  return (emLux * areaM2) / (fu * fm);
}

/** Passo 5 — E = N · Φ_lum · Fu · Fm ÷ A. */
export function iluminanciaFinal(n: number, fluxoLm: number, fu: number, fm: number, areaM2: number): number {
  return (n * fluxoLm * fu * fm) / areaM2;
}

export function calcularLux(e: EntradaLux): ResultadoLux {
  const h = alturaUtil(e.peDireitoM, e.alturaPlanoM);
  const phi = fluxoNecessario(e.emLux, e.areaM2, e.fu, e.fm);
  const quantidadeSugerida = arredondarParaCima(phi / e.luminaria.fluxoLm); // passo 4
  const quantidade = e.quantidade ?? quantidadeSugerida;
  const E = iluminanciaFinal(quantidade, e.luminaria.fluxoLm, e.fu, e.fm, e.areaM2);
  const potenciaW = quantidade * e.luminaria.potenciaW; // passo 6
  const avisos: Mensagem[] = [];
  if (E < e.emLux) avisos.push(MSG.iluminanciaAbaixo());
  return {
    alturaUtilM: h,
    indiceK: indiceDoRecinto(e.areaM2, h, e.perimetroM),
    fluxoNecessarioLm: phi,
    quantidadeSugerida,
    quantidade,
    iluminanciaFinalLux: E,
    potenciaW,
    potenciaVA: potenciaW / e.luminaria.fp,
    avisos,
  };
}
