/**
 * Regras puras de pendências (sem I/O, testáveis). O rótulo do item de checklist e o
 * cálculo do próximo número são a "cola" entre pendência e tarefa — mantê-los puros
 * garante o mapeamento pendência↔item estável e o número sequencial por prancha.
 */

import { extrairMencoes } from "@/modules/chat/mencoes";

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

/**
 * Classificação estruturada (item 11) — catálogo em CÓDIGO, não tabela: é vocabulário fixo
 * do escritório (não é dado que o usuário cadastra, ao contrário da futura biblioteca de
 * apontamentos-padrão do item 10). Fica aqui, junto de `STATUS_PENDENCIA`, porque este
 * arquivo é client-safe (sem `server-only`) — action e componente leem a MESMA lista.
 *
 * `impeditivo` é o topo da ESCALA de severidade, não um flag paralelo (decidido pelo
 * solicitante em 2026-08-06): o item 19 vai bloquear a aprovação da disciplina enquanto
 * houver apontamento aberto com `severidade === "impeditivo"` — uma leitura só, sem
 * combinar duas colunas.
 */
export const SEVERIDADES = ["impeditivo", "alta", "media", "baixa"] as const;
export type Severidade = (typeof SEVERIDADES)[number];

export const SEVERIDADE_LABEL: Record<Severidade, string> = {
  impeditivo: "Impeditivo",
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
};

export const TIPOS_PENDENCIA = [
  "incompatibilidade",
  "falta_informacao",
  "erro_tecnico",
  "norma",
  "representacao",
  "outro",
] as const;
export type TipoPendencia = (typeof TIPOS_PENDENCIA)[number];

export const TIPO_PENDENCIA_LABEL: Record<TipoPendencia, string> = {
  incompatibilidade: "Incompatibilidade",
  falta_informacao: "Falta informação",
  erro_tecnico: "Erro técnico",
  norma: "Norma",
  representacao: "Representação",
  outro: "Outro",
};

/**
 * Ordem de gravidade pra ordenar lista (menor = mais grave). Apontamento SEM severidade vai
 * pro fim: não classificado não é o mesmo que "pouco grave", e empurrá-lo pro topo faria a
 * lista mentir sobre prioridade.
 */
export function pesoSeveridade(s: string | null | undefined): number {
  const i = SEVERIDADES.indexOf(s as Severidade);
  return i === -1 ? SEVERIDADES.length : i;
}

/** Um apontamento aberto e impeditivo trava a aprovação da entrega (base do item 19). */
export function temImpeditivoAberto<T extends { status: string; severidade?: string | null }>(
  pendencias: readonly T[],
): boolean {
  return pendencias.some((p) => p.status === "aberta" && p.severidade === "impeditivo");
}

/** Só apontamentos abertos e ainda sem tarefa entram numa nova rodada de envio. */
export function enviaveis<T extends { status: string; tarefaId: string | null }>(pendencias: readonly T[]): T[] {
  return pendencias.filter((p) => p.status === "aberta" && p.tarefaId === null);
}

/**
 * Menções (item 33) — mesmo casamento do chat (`modules/chat/actions.ts`): token @nome
 * casa pelo PRIMEIRO nome do candidato, case-insensitive. Sem relação formal no banco
 * (decidido: R13, "parse-and-notify", igual ao chat já faz) — resolve na hora, a partir de
 * quem já é candidato natural a receber notificação daquele apontamento (responsáveis da
 * disciplina + autor do upload), não de todo usuário do sistema.
 */
export function resolverMencionados<T extends { userId: string; nome: string }>(
  texto: string,
  candidatos: readonly T[],
): T[] {
  const nomes = new Set(extrairMencoes(texto).map((t) => t.slice(1).toLowerCase()));
  if (nomes.size === 0) return [];
  return candidatos.filter((c) => nomes.has(c.nome.split(" ")[0].toLowerCase()));
}

/** Menções presentes em `novo` mas ausentes em `anterior` — evita renotificar a cada edição. */
export function mencionadosNovos<T extends { userId: string; nome: string }>(
  anterior: string,
  novo: string,
  candidatos: readonly T[],
): T[] {
  const antesIds = new Set(resolverMencionados(anterior, candidatos).map((c) => c.userId));
  return resolverMencionados(novo, candidatos).filter((c) => !antesIds.has(c.userId));
}
