/**
 * Quando uma disciplina NÃO pode ser excluída (PURO). A frase é o erro da ação.
 * Horas do ponto e linhas do rateio apontam para a disciplina: excluir deixaria essas horas sem
 * disciplina — inclusive as de mês já fechado (decisão do dono, 2026-10-11: recusar).
 */
export const MSG_DISCIPLINA_COM_ARQUIVOS = "Não é possível excluir uma disciplina com arquivos enviados.";
export const MSG_DISCIPLINA_COM_PAGAMENTOS = "Não é possível excluir uma disciplina com pagamentos liberados.";
export const MSG_DISCIPLINA_COM_HORAS =
  "Não é possível excluir uma disciplina com horas registradas no ponto ou no rateio: as horas perderiam a disciplina.";

export function motivoParaNaoExcluirDisciplina(p: { uploads: number; pagamentos: number; sessoes: number; rateios: number }): string | null {
  if (p.uploads > 0) return MSG_DISCIPLINA_COM_ARQUIVOS;
  if (p.pagamentos > 0) return MSG_DISCIPLINA_COM_PAGAMENTOS;
  if (p.sessoes > 0 || p.rateios > 0) return MSG_DISCIPLINA_COM_HORAS;
  return null;
}
