/**
 * Mapeamento puro de itens da proposta → disciplinas do projeto (F1.3).
 * Sem I/O. É o único pedaço genuinamente puro dentro do aceite, e o que decide o que o
 * projeto gerado vai conter — por isso vive aqui, testado, e não inline na transação.
 */

export type DisciplinaNova<V> = { nome: string; valor: V; ordem: number };

/** O mínimo para resolver o nome de uma disciplina de item de proposta (F1.19). */
export type ItemComDisciplina = {
  disciplina?: { nome: string } | null;
  disciplinaTextoLegado: string;
};

/**
 * Nome da disciplina de um item de proposta: prefere o catálogo, cai no texto original (F1.19).
 *
 * O fallback não é temporário nem defensivo — é o estado correto enquanto houver item cuja
 * grafia não casou com o catálogo. Produção tem 24 grafias, 18 batendo exato e 6 pendentes de
 * consolidação manual (F1.21). Sem o fallback, a proposta pública e o PDF passariam a mostrar
 * disciplina em branco nesses casos.
 */
export function nomeDisciplinaItem(item: ItemComDisciplina): string {
  return item.disciplina?.nome ?? item.disciplinaTextoLegado;
}

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
  itens: (ItemComDisciplina & { valor: V })[],
): DisciplinaNova<V>[] {
  return itens.map((it, idx) => ({
    // Prefere o nome do catálogo (F1.19). A `Disciplina` do projeto continua guardando o NOME
    // como texto — vira FK só quando a Fase 2 tocar `Projeto.Disciplina`.
    nome: nomeDisciplinaItem(it),
    valor: it.valor,
    ordem: idx,
  }));
}
