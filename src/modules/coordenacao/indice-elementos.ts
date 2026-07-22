/**
 * Coordenação BIM — índice de elementos do modelo: normaliza a árvore espacial
 * (`FragmentsModel.getSpatialStructure()`) em formas puras/testáveis, e agrupa
 * elementos por pavimento (storey) e por categoria (IfcClass).
 *
 * PURO: recebe o shape cru já retornado pela API do fragments (client) — sem
 * dependência de three/@thatopen/fragments — para poder rodar em vitest (node) e ser
 * reaproveitado por qualquer ferramenta que precise "que elementos existem, em que
 * pavimento, de que tipo" (filtros F5, clash F1 broadphase, diff F4).
 *
 * Fonte dos dados: decidida no spike da Onda 0 (ver docs/superpowers/plans/
 * 2026-07-21-compatibilizacao-ferramentas.md) — client fragments API, SEM
 * persistência. O adapter que chama getSpatialStructure()/getCategories() fica no
 * viewer/engine.ts (client-only); este módulo só organiza o resultado.
 */

/** Shape cru de um nó da árvore espacial (mesma forma de SpatialTreeItem do fragments). */
export type NoArvoreBruto = {
  category: string | null;
  localId: number | null;
  children?: NoArvoreBruto[];
};

/** Nó normalizado: children sempre é array (nunca undefined). */
export type NoEspacial = {
  category: string | null;
  localId: number | null;
  children: NoEspacial[];
};

/** Um elemento "folha" localizado na árvore: sabe seu pavimento (storey) mais próximo. */
export type ElementoIndex = {
  localId: number;
  category: string;
  /** Categoria do pavimento ancestral mais próximo (ex.: "IFCBUILDINGSTOREY"), se houver. */
  pavimentoLocalId: number | null;
  /** Rótulo do pavimento — preenchido por quem tem o nome (a árvore só traz category). */
  pavimentoNome: string | null;
};

/** Categorias espaciais reconhecidas como "pavimento" na hierarquia Project→Site→Building→Storey. */
const CATEGORIAS_PAVIMENTO = new Set(["IFCBUILDINGSTOREY"]);

/** Categorias puramente estruturais (não são elementos "de obra") — ficam de fora do índice de elementos. */
const CATEGORIAS_ESTRUTURAIS = new Set([
  "IFCPROJECT",
  "IFCSITE",
  "IFCBUILDING",
  "IFCBUILDINGSTOREY",
  "IFCSPATIALZONE",
]);

/** Normaliza um nó cru (children pode faltar) em NoEspacial (children sempre array). */
export function normalizarNo(bruto: NoArvoreBruto): NoEspacial {
  return {
    category: bruto.category,
    localId: bruto.localId,
    children: (bruto.children ?? []).map(normalizarNo),
  };
}

/**
 * Lista todos os elementos "de obra" (exclui nós puramente espaciais/estruturais)
 * da árvore, com o pavimento ancestral mais próximo anotado em cada um.
 */
export function listarElementos(raiz: NoEspacial): ElementoIndex[] {
  const elementos: ElementoIndex[] = [];

  function visitar(no: NoEspacial, pavimentoAtual: { localId: number | null; nome: string | null }) {
    const ehPavimento = no.category != null && CATEGORIAS_PAVIMENTO.has(no.category);
    const proximoPavimento = ehPavimento
      ? { localId: no.localId, nome: no.category }
      : pavimentoAtual;

    const ehEstrutural = no.category == null || CATEGORIAS_ESTRUTURAIS.has(no.category);
    if (!ehEstrutural && no.localId != null && no.category != null) {
      elementos.push({
        localId: no.localId,
        category: no.category,
        pavimentoLocalId: proximoPavimento.localId,
        pavimentoNome: proximoPavimento.nome,
      });
    }

    for (const filho of no.children) visitar(filho, proximoPavimento);
  }

  visitar(raiz, { localId: null, nome: null });
  return elementos;
}

/** Agrupa elementos por pavimento (chave = pavimentoLocalId; null = "sem pavimento"). */
export function agruparPorPavimento(elementos: readonly ElementoIndex[]): Map<number | null, ElementoIndex[]> {
  const grupos = new Map<number | null, ElementoIndex[]>();
  for (const el of elementos) {
    const grupo = grupos.get(el.pavimentoLocalId);
    if (grupo) grupo.push(el);
    else grupos.set(el.pavimentoLocalId, [el]);
  }
  return grupos;
}

/** Agrupa elementos por categoria (IfcClass). */
export function agruparPorCategoria(elementos: readonly ElementoIndex[]): Map<string, ElementoIndex[]> {
  const grupos = new Map<string, ElementoIndex[]>();
  for (const el of elementos) {
    const grupo = grupos.get(el.category);
    if (grupo) grupo.push(el);
    else grupos.set(el.category, [el]);
  }
  return grupos;
}

/** Lista de pavimentos distintos presentes no índice, na ordem de primeira aparição. */
export function pavimentosDistintos(
  elementos: readonly ElementoIndex[],
): { localId: number | null; nome: string | null }[] {
  const vistos = new Set<number | null>();
  const lista: { localId: number | null; nome: string | null }[] = [];
  for (const el of elementos) {
    if (vistos.has(el.pavimentoLocalId)) continue;
    vistos.add(el.pavimentoLocalId);
    lista.push({ localId: el.pavimentoLocalId, nome: el.pavimentoNome });
  }
  return lista;
}

/** Lista de categorias distintas presentes no índice, ordenada alfabeticamente. */
export function categoriasDistintas(elementos: readonly ElementoIndex[]): string[] {
  return [...new Set(elementos.map((e) => e.category))].sort();
}
