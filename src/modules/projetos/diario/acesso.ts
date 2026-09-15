/**
 * Regras de acesso PURAS do diário de projeto (sem I/O — testáveis).
 * Escrita numa disciplina: responsável dela ou quem atua em disciplina alheia.
 * Edição/exclusão de uma entrada: autor da entrada ou quem atua em disciplina alheia.
 *
 * `atuaEmDisciplinaAlheia` é `projetos:atuar_disciplina_alheia` já resolvido pelo chamador
 * (`podeAtuarEmDisciplinaAlheia`). Até 2026-09-15 estas funções recebiam o `role` e decidiam pelo
 * papel (`GLOBAL_ROLES`).
 */

/** Pode escrever no diário da disciplina: responsável dela OU atua em disciplina alheia. */
export function podeEscreverNoDiario(params: {
  atuaEmDisciplinaAlheia: boolean;
  ehResponsavelDaDisciplina: boolean;
}): boolean {
  return params.atuaEmDisciplinaAlheia || params.ehResponsavelDaDisciplina;
}

/** Pode editar/excluir uma entrada: autor dela OU atua em disciplina alheia. */
export function podeGerirEntrada(params: {
  userId: string;
  atuaEmDisciplinaAlheia: boolean;
  autorId: string;
}): boolean {
  return params.atuaEmDisciplinaAlheia || params.userId === params.autorId;
}
