import type { TipoPendencia } from "./pendencias";

export type LinhaFiltravel = {
  tipo: TipoPendencia | "corrigida";
  projetoId: string;
  documentoNome: string;
  dispensa: unknown | null;
};

/**
 * Filtro da lista (puro). Padrão: só pendências abertas. A dispensada entra com "Mostrar dispensadas";
 * a corrigida automaticamente só aparece no chip dela (não é pendência, é histórico).
 */
export function filtrarPendencias<T extends LinhaFiltravel>(
  linhas: readonly T[],
  f: { tipo: string; projetoId: string; q: string; mostrarDispensadas: boolean },
): T[] {
  const q = f.q.trim().toLowerCase();
  return linhas.filter((l) => {
    if (f.tipo === "corrigida") {
      if (l.tipo !== "corrigida") return false;
    } else {
      if (l.tipo === "corrigida") return false;
      if (f.tipo !== "todas" && l.tipo !== f.tipo) return false;
      if (l.dispensa && !f.mostrarDispensadas) return false;
    }
    if (f.projetoId && l.projetoId !== f.projetoId) return false;
    if (q && !l.documentoNome.toLowerCase().includes(q)) return false;
    return true;
  });
}

/** Contagem dos chips: abertas por tipo (dispensada não conta) e as corrigidas à parte. */
export function contarPendencias(linhas: readonly LinhaFiltravel[]): Record<"todas" | TipoPendencia | "corrigida", number> {
  const c = { todas: 0, publicada_com_lixeira: 0, analise_parada: 0, duas_publicadas: 0, corrigida: 0 };
  for (const l of linhas) {
    if (l.tipo === "corrigida") c.corrigida++;
    else if (!l.dispensa) {
      c.todas++;
      c[l.tipo]++;
    }
  }
  return c;
}
