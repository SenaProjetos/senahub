/** Modalidades semeadas por padrão (Lei 14.133/2021 + contratação direta). A ordem vira `ordem`. */
export const MODALIDADES_PADRAO = [
  "Pregão",
  "Concorrência",
  "Concurso",
  "Leilão",
  "Diálogo competitivo",
  "Dispensa",
  "Inexigibilidade",
] as const;

/**
 * Validação de modalidade contra a lista configurável (config-driven, tabela Modalidade).
 * Modalidade é opcional: vazio/nulo é sempre aceito. Match exato (case-sensitive).
 */
export function modalidadePermitida(
  nome: string | null | undefined,
  ativas: readonly string[],
): boolean {
  if (!nome) return true;
  return ativas.includes(nome);
}
