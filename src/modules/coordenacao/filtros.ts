/**
 * Coordenação BIM — filtros PUROS sobre o índice de elementos (Onda 0): isolar por
 * pavimento e/ou categoria (IfcClass). Sem dependência de three/fragments — opera só
 * sobre `ElementoIndex[]` (já produzido por `indice-elementos.ts`). Os critérios
 * de uma mesma dimensão são OR (dois pavimentos, por exemplo); dimensões diferentes
 * e propriedades Pset selecionadas são combinadas com AND.
 */
import type { ElementoIndex } from "@/modules/coordenacao/indice-elementos";

export type FiltroPset = { pset: string; nome: string; valor: string };

export type FiltroElementos = {
  /** Pavimentos (localId; null = "sem pavimento") a manter. Undefined = todos. */
  pavimentos?: (number | null)[];
  /** Categorias (IfcClass) a manter. Undefined = todas. */
  categorias?: string[];
  /** Propriedades IFC que o elemento deve possuir (todas devem casar). */
  psets?: FiltroPset[];
};

/** True quando o filtro não restringe nada (equivale a "mostrar tudo"). */
export function filtroVazio(filtro: FiltroElementos): boolean {
  return !filtro.pavimentos && !filtro.categorias && !filtro.psets;
}

/** Aplica o filtro, retornando só os elementos que passam em AMBOS os critérios informados. */
export function aplicarFiltro(elementos: readonly ElementoIndex[], filtro: FiltroElementos): ElementoIndex[] {
  if (filtroVazio(filtro)) return [...elementos];
  return elementos.filter((e) => {
    if (filtro.pavimentos && !filtro.pavimentos.includes(e.pavimentoLocalId)) return false;
    if (filtro.categorias && !filtro.categorias.includes(e.category)) return false;
    if (
      filtro.psets &&
      !filtro.psets.every((alvo) =>
        e.propriedades?.some(
          (p) => p.pset === alvo.pset && p.nome === alvo.nome && p.valor === alvo.valor,
        ),
      )
    ) {
      return false;
    }
    return true;
  });
}

/** Atalho: localIds dos elementos que passam no filtro (para setVisible/isolarElementos). */
export function localIdsVisiveis(elementos: readonly ElementoIndex[], filtro: FiltroElementos): number[] {
  return aplicarFiltro(elementos, filtro).map((e) => e.localId);
}

/** Opções Pset distintas disponíveis no índice, ordenadas para uma UI estável. */
export function psetsDistintos(elementos: readonly ElementoIndex[]): FiltroPset[] {
  const unicos = new Map<string, FiltroPset>();
  for (const elemento of elementos) {
    for (const propriedade of elemento.propriedades ?? []) {
      const chave = JSON.stringify([propriedade.pset, propriedade.nome, propriedade.valor]);
      unicos.set(chave, propriedade);
    }
  }
  return [...unicos.values()].sort(
    (a, b) =>
      a.pset.localeCompare(b.pset, "pt-BR") ||
      a.nome.localeCompare(b.nome, "pt-BR") ||
      a.valor.localeCompare(b.valor, "pt-BR"),
  );
}

/** Busca textual e limite de renderização para modelos com milhares de valores Pset distintos. */
export function buscarPsets(
  opcoes: readonly FiltroPset[],
  busca: string,
  limite = 200,
): { itens: FiltroPset[]; total: number } {
  const normalizar = (valor: string) =>
    valor
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLocaleLowerCase("pt-BR");
  const termo = normalizar(busca.trim());
  const filtradas = termo
    ? opcoes.filter((opcao) =>
        normalizar(`${opcao.pset} ${opcao.nome} ${opcao.valor}`).includes(termo),
      )
    : [...opcoes];
  return {
    itens: filtradas.slice(0, Math.max(0, limite)),
    total: filtradas.length,
  };
}
