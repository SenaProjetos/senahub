const round2 = (n: number) => Math.round(n * 100) / 100;

/** Percentual parte/total (0–100), arredondado a 2 casas. total ≤ 0 → 0. */
export function percentual(parte: number, total: number): number {
  if (total <= 0) return 0;
  return round2((parte / total) * 100);
}

/** Taxa de vitória = ganhas / (ganhas + perdidas) * 100. Sem decididas → 0. */
export function taxaVitoria(ganhas: number, perdidas: number): number {
  return percentual(ganhas, ganhas + perdidas);
}
