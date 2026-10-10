/**
 * Grupos de CONTRATAÇÃO — o eixo que substituiu os grupos de papel trabalhistas (`CLT_ROLES`,
 * `PJ_ROLES`) na Onda F, bloco D (plano de Setor × Contratação × Perfil de acesso, §16).
 *
 * `User.contratacao` é o cache do vínculo ATIVO, escrito só por `aplicarVinculo()`. Nulo = sem
 * vínculo ativo, e sem vínculo não há jornada, nem NF, nem pagamento por entrega (decisão 1 do
 * dono, §16.4) — por isso o backfill de vínculos é pré-requisito do deploy.
 *
 * Puro e client-safe (sem Prisma, sem `server-only`): telas importam daqui.
 */
import type { Contratacao } from "@/generated/prisma/enums";

/** Jornada controlada: bate ponto, tem espelho, banco de horas e férias. */
export const CONTRATACOES_JORNADA = ["clt", "estagio"] as const satisfies readonly Contratacao[];

/**
 * Prestador: emite NF (ou recibo), pode ser ligado a uma pessoa jurídica e recebe por entrega
 * (pool `Disciplina.valor`). O freelancer foi migrado como `pj` aguardando reclassificação
 * para `autonomo_rpa` — os dois ficam juntos para ninguém mudar de lado nessa troca.
 */
export const CONTRATACOES_PRESTADOR = ["pj", "autonomo_rpa"] as const satisfies readonly Contratacao[];

/**
 * Registra horas por APONTAMENTO (não bate ponto): prestador e sócio de pró-labore — o sócio
 * entra no rateio de horas com custo/hora explícito.
 */
export const CONTRATACOES_APONTAMENTO = ["pj", "autonomo_rpa", "pro_labore"] as const satisfies readonly Contratacao[];

type ComContratacao = Contratacao | null | undefined;

export function ehJornada(c: ComContratacao): boolean {
  return c != null && (CONTRATACOES_JORNADA as readonly string[]).includes(c);
}

export function ehPrestador(c: ComContratacao): boolean {
  return c != null && (CONTRATACOES_PRESTADOR as readonly string[]).includes(c);
}

export function usaApontamento(c: ComContratacao): boolean {
  return c != null && (CONTRATACOES_APONTAMENTO as readonly string[]).includes(c);
}
