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
  /** Cota do pavimento (atributo Elevation, unidade do arquivo) — ordena a lista; null se ausente. */
  pavimentoElevacao?: number | null;
  /** Propriedades IFC carregadas sob demanda para o multifiltro por Pset. */
  propriedades?: PropriedadePsetIndex[];
  /** True quando limites defensivos impediram materializar todos os Psets do item/modelo. */
  propriedadesParciais?: boolean;
};

export type PropriedadePsetIndex = {
  pset: string;
  nome: string;
  valor: string;
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
 *
 * O fragments 3.x devolve a árvore AGRUPADA: um nó de grupo (category preenchida,
 * localId null) e, abaixo dele, os itens daquela categoria (localId preenchido,
 * category null) — ex.: grupo IFCBUILDINGSTOREY → item #25 (o pavimento) → grupo
 * IFCDOOR → itens das portas. O item herda a categoria do grupo logo acima. Um nó
 * com as duas coisas (forma antiga) continua aceito.
 */
export function listarElementos(raiz: NoEspacial): ElementoIndex[] {
  const elementos: ElementoIndex[] = [];

  function visitar(
    no: NoEspacial,
    pavimentoAtual: { localId: number | null; nome: string | null },
    categoriaDoGrupo: string | null,
  ) {
    const categoria = no.category ?? (no.localId != null ? categoriaDoGrupo : null);
    const ehItem = no.localId != null && categoria != null;

    // Só um ITEM de pavimento (com localId) muda o pavimento dos descendentes; o nó de
    // grupo IFCBUILDINGSTOREY não tem localId e só repassa a categoria.
    const ehPavimento = ehItem && CATEGORIAS_PAVIMENTO.has(categoria);
    const proximoPavimento = ehPavimento ? { localId: no.localId, nome: categoria } : pavimentoAtual;

    if (ehItem && !CATEGORIAS_ESTRUTURAIS.has(categoria)) {
      elementos.push({
        localId: no.localId!,
        category: categoria,
        pavimentoLocalId: proximoPavimento.localId,
        pavimentoNome: proximoPavimento.nome,
      });
    }

    // Grupo repassa a própria categoria aos itens; item não repassa nada (os filhos de
    // um item vêm em grupos próprios, ex.: escada → grupo IFCSTAIRFLIGHT).
    const categoriaFilhos = no.localId == null ? no.category : null;
    for (const filho of no.children) visitar(filho, proximoPavimento, categoriaFilhos);
  }

  visitar(raiz, { localId: null, nome: null }, null);
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

/**
 * Pavimentos distintos presentes no índice, de baixo para cima pela cota (Elevation);
 * sem cota ficam depois, na ordem de primeira aparição, e "sem pavimento" por último.
 */
export function pavimentosDistintos(
  elementos: readonly ElementoIndex[],
): { localId: number | null; nome: string | null; elevacao: number | null }[] {
  const vistos = new Set<number | null>();
  const lista: { localId: number | null; nome: string | null; elevacao: number | null; ordem: number }[] = [];
  for (const el of elementos) {
    if (vistos.has(el.pavimentoLocalId)) continue;
    vistos.add(el.pavimentoLocalId);
    const elevacao = el.pavimentoElevacao != null && Number.isFinite(el.pavimentoElevacao) ? el.pavimentoElevacao : null;
    lista.push({ localId: el.pavimentoLocalId, nome: el.pavimentoNome, elevacao, ordem: lista.length });
  }
  return lista
    .sort((x, y) => {
      if (x.localId == null) return 1;
      if (y.localId == null) return -1;
      if (x.elevacao != null && y.elevacao != null) return x.elevacao - y.elevacao || x.ordem - y.ordem;
      if (x.elevacao != null) return -1;
      if (y.elevacao != null) return 1;
      return x.ordem - y.ordem;
    })
    .map(({ localId, nome, elevacao }) => ({ localId, nome, elevacao }));
}

/** Lista de categorias distintas presentes no índice, ordenada alfabeticamente. */
export function categoriasDistintas(elementos: readonly ElementoIndex[]): string[] {
  return [...new Set(elementos.map((e) => e.category))].sort();
}
