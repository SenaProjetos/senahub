/**
 * Mapeamento puro de itens da proposta → disciplinas do projeto (F1.3).
 * Sem I/O. É o único pedaço genuinamente puro dentro do aceite, e o que decide o que o
 * projeto gerado vai conter — por isso vive aqui, testado, e não inline na transação.
 */

export type DisciplinaNova<V> = { nome: string; valor: V; ordem: number };

/**
 * Cada `PropostaItem` vira uma `Disciplina` do projeto criado no aceite.
 *
 * A `ordem` vem do ÍNDICE do array recebido, não do campo `ordem` do item — o chamador busca
 * os itens já ordenados (`orderBy: { ordem: "asc" }`), então o índice reflete essa ordenação e
 * renumera a partir de 0 sem buracos. Comportamento preservado da versão original (o `idx` do
 * `.map()` dentro de `aceitarProposta`).
 *
 * `valor` é genérico e passa adiante SEM conversão: na prática é `Decimal` do Prisma indo para
 * outro campo `Decimal`. Converter para `number` aqui perderia precisão em valor monetário — e o
 * genérico garante isso no compilador, em vez de depender de `unknown` com cast na outra ponta.
 */
export function disciplinasDeItens<V>(
  itens: { disciplina: string; valor: V }[],
): DisciplinaNova<V>[] {
  return itens.map((it, idx) => ({
    nome: it.disciplina,
    valor: it.valor,
    ordem: idx,
  }));
}
