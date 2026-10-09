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

// ── Filtro em VÁRIOS modelos ao mesmo tempo ─────────────────────────────────
//
// Na compatibilização o pavimento "TÉRREO" do ARQ e o do EST são o mesmo andar, mas
// cada modelo tem seus próprios localIds. O filtro multi-modelo casa pavimentos pelo
// NOME (sem diferenciar maiúsculas/espaços) e devolve os localIds de cada modelo, para
// o viewer isolar o andar em todas as disciplinas carregadas de uma vez.

export type ElementoDeModelo = ElementoIndex & { modeloId: string };

/** Chave do "Sem pavimento" — não colide com nenhum nome real. */
export const SEM_PAVIMENTO = "\u0000sem-pavimento";

/** Nome do pavimento → chave de agrupamento entre modelos. */
export function chavePavimento(nome: string | null | undefined): string {
  const limpo = nome?.trim().replace(/\s+/g, " ");
  return limpo ? limpo.toLocaleUpperCase("pt-BR") : SEM_PAVIMENTO;
}

export type PavimentoUnificado = {
  chave: string;
  /** Nome como aparece no primeiro modelo; null = "Sem pavimento". */
  nome: string | null;
  total: number;
  /** Menor cota encontrada entre os modelos (unidade do arquivo); null se nenhum informa. */
  elevacao: number | null;
  /** Em quantos modelos o pavimento aparece. */
  modelos: number;
};

/**
 * Pavimentos de todos os modelos, unidos pelo nome e ordenados de baixo para cima
 * pela cota (sem cota no fim, na ordem em que aparecem; "Sem pavimento" por último).
 */
export function pavimentosUnificados(elementos: readonly ElementoDeModelo[]): PavimentoUnificado[] {
  const grupos = new Map<string, PavimentoUnificado & { ordem: number; modelosVistos: Set<string> }>();
  for (const e of elementos) {
    const chave = chavePavimento(e.pavimentoNome);
    let g = grupos.get(chave);
    if (!g) {
      g = {
        chave,
        nome: chave === SEM_PAVIMENTO ? null : e.pavimentoNome!.trim(),
        total: 0,
        elevacao: null,
        modelos: 0,
        ordem: grupos.size,
        modelosVistos: new Set(),
      };
      grupos.set(chave, g);
    }
    g.total += 1;
    g.modelosVistos.add(e.modeloId);
    const elevacao = e.pavimentoElevacao;
    if (elevacao != null && Number.isFinite(elevacao)) {
      g.elevacao = g.elevacao == null ? elevacao : Math.min(g.elevacao, elevacao);
    }
  }
  return [...grupos.values()]
    .sort((x, y) => {
      if (x.chave === SEM_PAVIMENTO) return 1;
      if (y.chave === SEM_PAVIMENTO) return -1;
      if (x.elevacao != null && y.elevacao != null) return x.elevacao - y.elevacao || x.ordem - y.ordem;
      if (x.elevacao != null) return -1;
      if (y.elevacao != null) return 1;
      return x.ordem - y.ordem;
    })
    .map(({ chave, nome, total, elevacao, modelosVistos }) => ({
      chave,
      nome,
      total,
      elevacao,
      modelos: modelosVistos.size,
    }));
}

export type FiltroMultiModelo = {
  /** Chaves de pavimento (`chavePavimento`) a manter. Undefined = todos. */
  pavimentos?: string[];
  categorias?: string[];
  psets?: FiltroPset[];
};

export function filtroMultiVazio(filtro: FiltroMultiModelo): boolean {
  return !filtro.pavimentos && !filtro.categorias && !filtro.psets;
}

/** Elementos que passam no filtro, em todos os modelos. */
export function aplicarFiltroMulti(
  elementos: readonly ElementoDeModelo[],
  filtro: FiltroMultiModelo,
): ElementoDeModelo[] {
  if (filtroMultiVazio(filtro)) return [...elementos];
  const pavimentos = filtro.pavimentos ? new Set(filtro.pavimentos) : null;
  return elementos.filter((e) => {
    if (pavimentos && !pavimentos.has(chavePavimento(e.pavimentoNome))) return false;
    return aplicarFiltro([e], { categorias: filtro.categorias, psets: filtro.psets }).length === 1;
  });
}

/** localIds visíveis por modelo — todo modelo informado aparece, mesmo com lista vazia. */
export function localIdsPorModelo(
  elementos: readonly ElementoDeModelo[],
  filtro: FiltroMultiModelo,
  modeloIds: readonly string[],
): Map<string, number[]> {
  const mapa = new Map<string, number[]>(modeloIds.map((id) => [id, []]));
  for (const e of aplicarFiltroMulti(elementos, filtro)) mapa.get(e.modeloId)?.push(e.localId);
  return mapa;
}
