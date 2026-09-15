/**
 * Sinônimos iniciais (D2 da spec `2026-09-15-motor-nomenclatura.md`), levantados do acervo de
 * produção em 2026-09-15 e confirmados pelo dono.
 *
 * Fonte única de três consumidores: a carga inicial da F2 (migration), o catálogo de teste do
 * motor e o script de diagnóstico enquanto a coluna `sinonimos` não existe no banco. Depois da
 * F2, quem manda é o banco — aqui fica só a semente (ADR-0003, regra 4).
 */

export const SINONIMOS_DISCIPLINA: Record<string, string[]> = {
  HID: ["HDR", "ESG"],
  LOG: ["CAB"],
  PCI: ["INC"],
  EST: ["ESTR"],
};

export const SINONIMOS_FASE: Record<string, string[]> = {
  EX: ["PE", "EXE"],
  BS: ["PB"],
};

export const SINONIMOS_TIPO: Record<string, string[]> = {
  DET: ["DTC", "DE"],
  MEM: ["MED", "MD"],
  PQT: ["PLQ"],
  LMS: ["LME"],
};

/** Sinônimos de uma sigla, na categoria pedida. Sigla fora do mapa → lista vazia. */
export function sinonimosDe(
  categoria: "disciplina" | "fase" | "tipo",
  sigla: string | null | undefined,
): string[] {
  if (!sigla) return [];
  const mapa =
    categoria === "disciplina" ? SINONIMOS_DISCIPLINA : categoria === "fase" ? SINONIMOS_FASE : SINONIMOS_TIPO;
  return mapa[sigla.toUpperCase()] ?? [];
}
