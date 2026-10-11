/**
 * Regras da disciplina da sessão e de quem pode marcar horas num projeto (R2 do rateio,
 * decisões 8, 11, 12 e 44 do spec 2026-09-15-rateio-horas-decisoes.md). PURO.
 */
export const MSG_SEM_ACESSO_PROJETO =
  "Você não faz parte deste projeto: só a equipe, os responsáveis pelas disciplinas e quem tem card no projeto marcam horas nele.";
export const MSG_TAREFA_OBRIGATORIA =
  "Você é responsável por mais de uma disciplina neste projeto: escolha a tarefa em que vai trabalhar.";

export function motivoParaNaoMarcarNoProjeto(p: { membro: boolean; responsavelDeDisciplina: boolean; temCardAberto: boolean }): string | null {
  return p.membro || p.responsavelDeDisciplina || p.temCardAberto ? null : MSG_SEM_ACESSO_PROJETO;
}

/**
 * Disciplina da sessão: a da tarefa escolhida; sem tarefa, a única de que a pessoa é responsável no
 * projeto; nenhuma = coordenação/apoio (null). Com 2+ e sem tarefa, a marcação AO VIVO exige a
 * tarefa (`exigirTarefa`); a correção do dia nunca falha e deixa sem disciplina.
 */
export function disciplinaDaSessao(p: {
  disciplinaDaTarefa: string | null | undefined;
  tarefaEscolhida: boolean;
  disciplinasDaPessoa: string[];
  exigirTarefa: boolean;
}): { disciplinaId: string | null } | { erro: string } {
  if (p.tarefaEscolhida) return { disciplinaId: p.disciplinaDaTarefa ?? null };
  const unicas = [...new Set(p.disciplinasDaPessoa)];
  if (unicas.length === 1) return { disciplinaId: unicas[0] };
  if (unicas.length === 0) return { disciplinaId: null };
  return p.exigirTarefa ? { erro: MSG_TAREFA_OBRIGATORIA } : { disciplinaId: null };
}
