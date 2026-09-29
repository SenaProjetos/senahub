/**
 * Situação de uma solicitação de revisão (2026-09-29). A solicitação nasce do envio de
 * apontamentos da prancha e não guarda estado: está EM ABERTO enquanto algum apontamento daquela
 * rodada ainda demanda trabalho — a mesma definição de "em aberto" de toda contagem de
 * apontamentos (`STATUS_ABERTOS`: aberta e em correção; adiado sai da fila de propósito).
 * Puro e client-safe: o card da disciplina e a Visão Geral leem a mesma regra.
 */
import { estaAberta } from "@/modules/projetos/pendencias/helpers";

export type SituacaoSolicitacao = "em_aberto" | "atendida";

export type ApontamentosDaRodada = { total: number; abertos: number };

/** Conta os apontamentos (não excluídos) de uma rodada pelo status de cada um. */
export function contarApontamentos(statuses: readonly string[]): ApontamentosDaRodada {
  return { total: statuses.length, abertos: statuses.filter(estaAberta).length };
}

/**
 * Nulo quando não há apontamento vinculado — solicitação antiga, feita à mão na aba Extras, ou
 * rodada cujos apontamentos foram todos excluídos: não há de onde tirar a situação.
 */
export function situacaoSolicitacao(a: ApontamentosDaRodada): SituacaoSolicitacao | null {
  if (a.total === 0) return null;
  return a.abertos > 0 ? "em_aberto" : "atendida";
}

/** Quantas solicitações em aberto cada disciplina tem (só as que têm alguma). */
export function emAbertoPorDisciplina(
  solicitacoes: readonly { disciplinaId: string; situacao: SituacaoSolicitacao | null }[],
): Map<string, number> {
  const porDisciplina = new Map<string, number>();
  for (const s of solicitacoes) {
    if (s.situacao !== "em_aberto") continue;
    porDisciplina.set(s.disciplinaId, (porDisciplina.get(s.disciplinaId) ?? 0) + 1);
  }
  return porDisciplina;
}
