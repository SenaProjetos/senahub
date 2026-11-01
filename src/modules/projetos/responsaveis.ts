/** Responsáveis por disciplina ao longo do tempo (R5 do rateio, decisão 13 do spec 2026-09-15). PURO. */

export function diffResponsaveis(atuais: string[], novos: string[]): { entram: string[]; saem: string[] } {
  const a = new Set(atuais);
  const n = new Set(novos);
  return { entram: [...n].filter((u) => !a.has(u)), saem: [...a].filter((u) => !n.has(u)) };
}

/** Disciplinas em que a pessoa era responsável na data: `inicio` inclusive, `fim` exclusivo (nulo = aberta). */
export function disciplinasNaData(
  historico: { disciplinaId: string; inicio: Date; fim: Date | null }[],
  quando: Date,
): string[] {
  const t = quando.getTime();
  const ids = historico
    .filter((h) => h.inicio.getTime() <= t && (h.fim === null || t < h.fim.getTime()))
    .map((h) => h.disciplinaId);
  return [...new Set(ids)];
}
