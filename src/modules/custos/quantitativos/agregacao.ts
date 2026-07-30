/**
 * Soma quantidades já resolvidas (uma por elemento — `escolherQuantidade` já decidiu qual) por
 * categoria (IfcClass) e por pavimento, sobre `ElementoIndex[]` (índice espacial que a
 * coordenação já expõe — não reimplementa). PURO: não sabe de onde veio o valor (IFC/Pset/manual),
 * só soma e conta o que faltou — a transparência do §2.1 do plano (`semQuantidade`).
 */
import type { ElementoIndex } from "@/modules/coordenacao/indice-elementos";

export type LinhaAgregada = {
  chave: string;
  totalElementos: number;
  comQuantidade: number;
  semQuantidade: number;
  soma: number;
};

function agregarPorChave(
  elementos: readonly ElementoIndex[],
  valorPorLocalId: ReadonlyMap<number, number>,
  chaveDe: (el: ElementoIndex) => string,
): LinhaAgregada[] {
  const grupos = new Map<string, LinhaAgregada>();
  for (const el of elementos) {
    const chave = chaveDe(el);
    const linha = grupos.get(chave) ?? { chave, totalElementos: 0, comQuantidade: 0, semQuantidade: 0, soma: 0 };
    linha.totalElementos++;
    const valor = valorPorLocalId.get(el.localId);
    if (valor != null) {
      linha.comQuantidade++;
      linha.soma += valor;
    } else {
      linha.semQuantidade++;
    }
    grupos.set(chave, linha);
  }
  return [...grupos.values()];
}

/** Agrupa por categoria (IfcClass), ordenado alfabeticamente. */
export function agregarPorCategoria(
  elementos: readonly ElementoIndex[],
  valorPorLocalId: ReadonlyMap<number, number>,
): LinhaAgregada[] {
  return agregarPorChave(elementos, valorPorLocalId, (el) => el.category).sort((a, b) => a.chave.localeCompare(b.chave));
}

/** Agrupa por pavimento (rótulo; "(sem pavimento)" quando o elemento não está sob nenhum storey). */
export function agregarPorPavimento(
  elementos: readonly ElementoIndex[],
  valorPorLocalId: ReadonlyMap<number, number>,
): LinhaAgregada[] {
  return agregarPorChave(elementos, valorPorLocalId, (el) => el.pavimentoNome ?? "(sem pavimento)");
}
