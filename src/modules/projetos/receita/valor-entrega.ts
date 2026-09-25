import { normalizar } from "@/lib/disciplinas-core";

/**
 * Valor SUGERIDO para faturar a entrega de uma disciplina: o que a proposta cobrou do CLIENTE por ela.
 *
 * Nunca o `Disciplina.valor` — esse é o pool que se PAGA ao projetista (custo). Faturar o cliente por
 * ele cobrava a receita com o número do custo.
 *
 * O item da proposta casa com a disciplina pelo catálogo (`disciplinaId`) e, quando um dos lados
 * ainda não foi resolvido para o catálogo, pelo nome sem acento e sem caixa. Sem item, sem sugestão:
 * quem fatura digita o valor combinado.
 */

export type DisciplinaParaFaturar = { id: string; disciplinaId: string | null; nome: string };
export type ItemDaProposta = { disciplinaId: string | null; disciplinaTextoLegado: string; valor: number };

export function valorSugeridoPorDisciplina(
  disciplinas: readonly DisciplinaParaFaturar[],
  itens: readonly ItemDaProposta[],
): Map<string, number | null> {
  const sugeridos = new Map<string, number | null>();
  for (const d of disciplinas) {
    const doItem = itens.filter((it) =>
      d.disciplinaId && it.disciplinaId
        ? it.disciplinaId === d.disciplinaId
        : normalizar(it.disciplinaTextoLegado) === normalizar(d.nome),
    );
    if (doItem.length === 0) {
      sugeridos.set(d.id, null);
      continue;
    }
    const centavos = doItem.reduce((s, it) => s + Math.round(it.valor * 100), 0);
    sugeridos.set(d.id, centavos > 0 ? centavos / 100 : null);
  }
  return sugeridos;
}
