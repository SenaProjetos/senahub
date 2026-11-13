/**
 * Status da disciplina calculado a partir das fases (spec
 * `docs/superpowers/specs/2026-11-13-status-disciplina-pelas-fases.md`, decisão do dono de 2026-11-13).
 *
 * PURO: sem Prisma/Next. O serviço (`status-pelas-fases-service.ts`) lê as fases, chama isto e grava.
 *
 * Origem: o card mostrava a disciplina "Em revisão" e, logo abaixo, a fase "Aguardando" — duas máquinas de
 * estado independentes sobre o mesmo enum. Daqui em diante, disciplina com fase (e fora do fluxo de pastas)
 * tem o status que as fases dizem, e a troca manual é recusada (`MOTIVO_STATUS_DAS_FASES`).
 */
import type { StatusDisciplina } from "@/generated/prisma/enums";

/** A mesma frase é o `ActionError` da troca manual/em massa e o motivo na tela. */
export const MOTIVO_STATUS_DAS_FASES = "O status desta disciplina vem das fases. Mude o status da fase.";

/** Texto de apoio da pílula de status no card (visível a leitor de tela, e no `title`). */
export const DICA_STATUS_DAS_FASES = "Calculado a partir das fases";

/**
 * A disciplina tem o status calculado pelas fases? Só com pelo menos uma fase E fora do fluxo de pastas
 * (aprovação/laudo em 2 etapas), que grava o status da disciplina por conta própria (ponto 1 da seção 9).
 */
export function statusVemDasFases(d: { qtdFases: number; usaPastas: boolean }): boolean {
  return d.qtdFases > 0 && !d.usaPastas;
}

/**
 * As regras são lidas em ordem; a primeira que vale decide.
 *
 *   1. sem fase                          → `atual` (continua manual)
 *   2. alguma fase em revisão            → em_revisao
 *   3. todas aprovadas                   → aprovado
 *   4. `atual` é aprovado                → aprovado (só a regra 2 tira uma disciplina de aprovado)
 *   5. todas entregues ou aprovadas      → entregue
 *   6. alguma fora de "aguardando"       → em_andamento
 *   7. senão                             → aguardando
 *
 * A regra 4 cobre a disciplina aprovada antes de ganhar fases (paga inteira) e a fase acrescentada depois
 * da aprovação. NÃO passa pela máquina `TRANSICOES_DISCIPLINA`: o resultado pode saltar de aguardando para
 * entregue quando a única fase é enviada — a máquina continua valendo para disciplina sem fase.
 */
export function statusDaDisciplinaPelasFases(
  fases: readonly StatusDisciplina[],
  atual: StatusDisciplina,
): StatusDisciplina {
  if (fases.length === 0) return atual;
  if (fases.some((s) => s === "em_revisao")) return "em_revisao";
  if (fases.every((s) => s === "aprovado")) return "aprovado";
  if (atual === "aprovado") return "aprovado";
  if (fases.every((s) => s === "entregue" || s === "aprovado")) return "entregue";
  if (fases.some((s) => s !== "aguardando")) return "em_andamento";
  return "aguardando";
}

/**
 * `entregueEm` acompanhando o status calculado, com a regra que a troca manual já seguia: guarda a 1ª data
 * de entrega, limpa ao voltar para antes da entrega e, em aprovado, grava a data da aprovação (como
 * `validarEntrega` e `confirmarAprovacaoDisciplina`). `undefined` = não mexe.
 */
export function entregueEmAposRecalculo(
  novo: StatusDisciplina,
  antes: { status: StatusDisciplina; entregueEm: Date | null },
  agora: Date,
): Date | null | undefined {
  if (novo === antes.status) return undefined;
  if (novo === "aprovado") return agora;
  if (novo === "entregue" || novo === "em_revisao") return antes.entregueEm ?? agora;
  return antes.entregueEm == null ? undefined : null;
}
