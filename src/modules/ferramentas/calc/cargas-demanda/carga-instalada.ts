/**
 * Carga instalada e demanda por linha de tipo de carga — **puro**. Spec §5, passos 13 e 14:
 *   carga do escopo = Σ (quantidade × potência) × N            (kW; kVA = kW ÷ FP)
 *   demanda         = Σ (P · FD ÷ FP)                          (kVA)
 * A contagem que escolhe o FD é a do ESCOPO (quantidade × N), nunca a de um cálculo isolado (spec §3.1, regra 4):
 * `aparelhosNoEscopo` é o número que cada concessionária usa para procurar o FD na sua tabela.
 */

import { aplicarProgressivo, type Degrau, type ParteProgressiva } from "./fd";

/** Uma linha de carga: `quantidade` aparelhos iguais de `potenciaW` W, com o FP da linha. */
export type LinhaCarga = { quantidade: number; potenciaW: number; fp: number };

/** Nº de aparelhos da linha no escopo (quantidade × N). */
export function aparelhosNoEscopo(linha: Pick<LinhaCarga, "quantidade">, escopoN = 1): number {
  return linha.quantidade * escopoN;
}

/** Passo 13 — carga instalada da linha no escopo, em kW e kVA. */
export function cargaDaLinha(linha: LinhaCarga, escopoN = 1): { kW: number; kVA: number } {
  const kW = (aparelhosNoEscopo(linha, escopoN) * linha.potenciaW) / 1000;
  return { kW, kVA: kW / linha.fp };
}

/** Passo 13 — carga instalada de várias linhas (soma). */
export function cargaInstalada(linhas: readonly LinhaCarga[], escopoN = 1): { kW: number; kVA: number } {
  return linhas.reduce(
    (s, l) => {
      const c = cargaDaLinha(l, escopoN);
      return { kW: s.kW + c.kW, kVA: s.kVA + c.kVA };
    },
    { kW: 0, kVA: 0 },
  );
}

/** Passo 14, FD único na linha: P (kW) · FD ÷ FP, em kVA. */
export function demandaDaLinha(linha: LinhaCarga, fd: number, escopoN = 1): number {
  return (cargaDaLinha(linha, escopoN).kW * fd) / linha.fp;
}

/** Passo 14, progressivo por faixa de carga (kW): degraus sobre a carga total do grupo e um FP do grupo. kVA. */
export function demandaProgressiva(
  linhas: readonly LinhaCarga[],
  degraus: readonly Degrau[],
  fp: number,
  escopoN = 1,
): { cargaKW: number; partes: ParteProgressiva[]; demandaKVA: number } {
  const cargaKW = cargaInstalada(linhas, escopoN).kW;
  const r = aplicarProgressivo(cargaKW, degraus);
  return { cargaKW, partes: r.partes, demandaKVA: r.demanda / fp };
}
