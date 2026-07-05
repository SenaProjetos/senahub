/**
 * Regras puras de pendências (sem I/O, testáveis). O rótulo do item de checklist e o
 * cálculo do próximo número são a "cola" entre pendência e tarefa — mantê-los puros
 * garante o mapeamento pendência↔item estável e o número sequencial por prancha.
 */

export type PendenciaBase = { numero: number; pagina: number; texto: string };

/** Rótulo do item de checklist gerado a partir de um apontamento. */
export function rotuloItemPendencia(p: PendenciaBase): string {
  return `#${p.numero} (pág. ${p.pagina}) — ${p.texto}`;
}

/** Próximo número sequencial por prancha (maior número existente + 1). */
export function proximoNumero(numerosExistentes: readonly number[]): number {
  return numerosExistentes.reduce((m, n) => (n > m ? n : m), 0) + 1;
}

export const STATUS_PENDENCIA = ["aberta", "resolvida", "fechada", "descartada"] as const;
export type StatusPendencia = (typeof STATUS_PENDENCIA)[number];

/** Só apontamentos abertos e ainda sem tarefa entram numa nova rodada de envio. */
export function enviaveis<T extends { status: string; tarefaId: string | null }>(pendencias: readonly T[]): T[] {
  return pendencias.filter((p) => p.status === "aberta" && p.tarefaId === null);
}
