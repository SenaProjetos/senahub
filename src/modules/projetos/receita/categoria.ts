/** Categoria de receita por tipo de projeto (ver seed PLANO_CONTAS). */
export const CATEGORIA_RECEITA: Record<string, string> = {
  particular: "1.01",
  licitacao: "1.02",
};

export function codigoCategoriaReceita(tipoProjeto: string): string {
  return CATEGORIA_RECEITA[tipoProjeto] ?? CATEGORIA_RECEITA.particular;
}
