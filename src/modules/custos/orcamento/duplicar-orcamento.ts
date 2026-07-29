/**
 * Duplicação de orçamento como modelo — PURO.
 *
 * Remapeia a árvore inteira para ids novos preservando hierarquia, ordem, WBS e todos os valores
 * materializados. É aqui que mora o erro clássico da duplicação: um filho continuar apontando para
 * o `parentId` do orçamento ORIGINAL, misturando as duas árvores. Por isso é módulo puro testado,
 * e não um `map` solto dentro da action.
 */

export type ItemParaDuplicar = {
  id: string;
  parentId: string | null;
  tipo: "grupo" | "servico";
  codigo: string;
  ordem: number;
  descricao: string;
  unidade: string | null;
  quantidade: number;
  custoUnitario: number;
  bdiPercentual: number | null;
  bloqueado: boolean;
  totalSemBdi: number;
  totalComBdi: number;
  composicaoId: string | null;
  basePrecoUsadaId: string | null;
};

export type ItemDuplicado = Omit<ItemParaDuplicar, "id" | "parentId"> & {
  id: string;
  parentId: string | null;
  orcamentoId: string;
};

export type ResultadoDuplicacao =
  | { ok: true; itens: ItemDuplicado[]; mapaIds: Map<string, string> }
  | { ok: false; erro: string };

/**
 * `gerarId` é injetado (em produção, `cuid()`) para o teste ser determinístico.
 * Valida que todo `parentId` existe no conjunto — árvore quebrada não vira cópia quebrada.
 */
export function duplicarItens(
  itens: ItemParaDuplicar[],
  orcamentoIdNovo: string,
  gerarId: (index: number) => string,
): ResultadoDuplicacao {
  const idsOriginais = new Set(itens.map((i) => i.id));
  for (const item of itens) {
    if (item.parentId !== null && !idsOriginais.has(item.parentId)) {
      return { ok: false, erro: `Item "${item.id}" aponta para o pai inexistente "${item.parentId}".` };
    }
  }

  const mapaIds = new Map<string, string>();
  itens.forEach((item, i) => mapaIds.set(item.id, gerarId(i)));

  const duplicados: ItemDuplicado[] = itens.map((item) => ({
    ...item,
    id: mapaIds.get(item.id)!,
    parentId: item.parentId === null ? null : mapaIds.get(item.parentId)!,
    orcamentoId: orcamentoIdNovo,
  }));

  return { ok: true, itens: duplicados, mapaIds };
}
