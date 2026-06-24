/**
 * Bitolas comerciais de barras de aço (NBR 7480) e seleção de barras.
 * Puro. Áreas em cm², diâmetros em mm.
 */

/** Diâmetros nominais comerciais (mm). */
export const BITOLAS_MM = [5.0, 6.3, 8.0, 10.0, 12.5, 16.0, 20.0, 25.0, 32.0, 40.0] as const;
export type Bitola = (typeof BITOLAS_MM)[number];

/** Área da seção transversal de uma barra (cm²) para o diâmetro em mm. */
export function areaBarra(phiMm: number): number {
  const phiCm = phiMm / 10;
  return (Math.PI / 4) * phiCm * phiCm;
}

/** Massa linear da barra (kg/m) — aço 7850 kg/m³. */
export function massaLinear(phiMm: number): number {
  return areaBarra(phiMm) * 1e-4 * 7850; // cm²→m²: ×1e-4; ×ρ
}

export type SelecaoBarras = {
  n: number;
  phiMm: number;
  asEf: number; // cm²
};

/**
 * Seleciona o número de barras de uma bitola para cobrir `asNec` (mínimo 2 barras).
 * Não otimiza por largura/espaçamento — é detalhamento preliminar.
 */
export function selecionarBarras(asNec: number, phiMm: number): SelecaoBarras {
  const a = areaBarra(phiMm);
  const n = Math.max(2, Math.ceil(asNec / a - 1e-9));
  return { n, phiMm, asEf: n * a };
}
