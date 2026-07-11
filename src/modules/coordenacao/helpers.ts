/**
 * Regras puras dos apontamentos de coordenação (sem I/O, testáveis). Mesma
 * lógica de pendencias/helpers.ts, adaptada: numeração é por PROJETO (não por
 * prancha), pois o apontamento de coordenação é transversal a disciplinas.
 */

export type ApontamentoBase = { numero: number; titulo: string };

/** Rótulo do item de checklist gerado a partir de um apontamento de coordenação. */
export function rotuloItemApontamento(a: ApontamentoBase): string {
  return `#${a.numero} — ${a.titulo}`;
}

/** Próximo número sequencial por projeto (maior número existente + 1). */
export function proximoNumero(numerosExistentes: readonly number[]): number {
  return numerosExistentes.reduce((m, n) => (n > m ? n : m), 0) + 1;
}

export const STATUS_APONTAMENTO = ["aberta", "resolvida", "fechada", "descartada"] as const;
export type StatusApontamento = (typeof STATUS_APONTAMENTO)[number];

/** Só apontamentos abertos e ainda sem tarefa entram numa nova rodada de envio. */
export function enviaveis<T extends { status: string; tarefaId: string | null }>(
  apontamentos: readonly T[],
): T[] {
  return apontamentos.filter((a) => a.status === "aberta" && a.tarefaId === null);
}
