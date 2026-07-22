/**
 * Coordenação BIM — filtros PUROS sobre o índice de elementos (Onda 0): isolar por
 * pavimento e/ou categoria (IfcClass). Sem dependência de three/fragments — opera só
 * sobre `ElementoIndex[]` (já produzido por `indice-elementos.ts`).
 *
 * Filtro por Pset fica fora do v1: o índice atual não carrega propriedades por
 * elemento (custaria um getItemsData por item); adicionar exigiria estender
 * ElementoIndex, não é necessário para o caso de uso atual (isolar por andar/tipo).
 */
import type { ElementoIndex } from "@/modules/coordenacao/indice-elementos";

export type FiltroElementos = {
  /** Pavimentos (localId; null = "sem pavimento") a manter. Undefined = todos. */
  pavimentos?: (number | null)[];
  /** Categorias (IfcClass) a manter. Undefined = todas. */
  categorias?: string[];
};

/** True quando o filtro não restringe nada (equivale a "mostrar tudo"). */
export function filtroVazio(filtro: FiltroElementos): boolean {
  return !filtro.pavimentos && !filtro.categorias;
}

/** Aplica o filtro, retornando só os elementos que passam em AMBOS os critérios informados. */
export function aplicarFiltro(elementos: readonly ElementoIndex[], filtro: FiltroElementos): ElementoIndex[] {
  if (filtroVazio(filtro)) return [...elementos];
  return elementos.filter((e) => {
    if (filtro.pavimentos && !filtro.pavimentos.includes(e.pavimentoLocalId)) return false;
    if (filtro.categorias && !filtro.categorias.includes(e.category)) return false;
    return true;
  });
}

/** Atalho: localIds dos elementos que passam no filtro (para setVisible/isolarElementos). */
export function localIdsVisiveis(elementos: readonly ElementoIndex[], filtro: FiltroElementos): number[] {
  return aplicarFiltro(elementos, filtro).map((e) => e.localId);
}
