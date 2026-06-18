/**
 * Análise de DRE (puro, sem I/O): análise vertical (AV%), horizontal (AH%) e
 * EBITDA gerencial. Isolado de Prisma para ser testável e reutilizável.
 *
 * EBITDA (gerencial): resultado das categorias operacionais (grupoDfc = "operacional";
 * null conta como operacional — mesma convenção do DFC). É uma aproximação: o plano de
 * contas não separa resultado financeiro / D&A / tributos.
 */

export type LinhaBaseDRE = {
  codigo: string;
  nome: string;
  tipo: string; // "receita" | "despesa"
  grupoDfc?: string | null;
  valor: number;
};

export type LinhaDREAnalise = LinhaBaseDRE & {
  /** % da linha sobre o total de receitas do período (análise vertical). */
  av: number;
  /** Variação % vs. período anterior (análise horizontal). null se não houver base. */
  ah: number | null;
};

export type TotaisDRE = {
  totalReceitas: number;
  totalDespesas: number;
  resultado: number;
  ebitda: number;
};

export type DREComparativo = TotaisDRE & {
  de: string;
  ate: string;
  receitas: LinhaDREAnalise[];
  despesas: LinhaDREAnalise[];
  anterior: TotaisDRE & { de: string; ate: string };
};

export function ehOperacional(grupoDfc?: string | null): boolean {
  return (grupoDfc ?? "operacional") === "operacional";
}

/** EBITDA gerencial: (receitas − despesas) restrito às categorias operacionais. */
export function calcularEbitda(linhas: LinhaBaseDRE[]): number {
  let v = 0;
  for (const l of linhas) {
    if (!ehOperacional(l.grupoDfc)) continue;
    v += l.tipo === "receita" ? l.valor : -l.valor;
  }
  return v;
}

function totais(linhas: LinhaBaseDRE[]): TotaisDRE {
  const totalReceitas = linhas.filter((l) => l.tipo === "receita").reduce((s, l) => s + l.valor, 0);
  const totalDespesas = linhas.filter((l) => l.tipo === "despesa").reduce((s, l) => s + l.valor, 0);
  return {
    totalReceitas,
    totalDespesas,
    resultado: totalReceitas - totalDespesas,
    ebitda: calcularEbitda(linhas),
  };
}

/** Variação horizontal: (atual − anterior) / |anterior| * 100. null se anterior == 0. */
export function variacaoHorizontal(atual: number, anterior: number): number | null {
  if (anterior === 0) return null;
  return ((atual - anterior) / Math.abs(anterior)) * 100;
}

/**
 * Monta o DRE comparativo: enriquece cada linha do período atual com AV (sobre receita)
 * e AH (vs. mesma categoria no período anterior), e calcula os totais/EBITDA dos dois períodos.
 */
export function analisarDRE(
  atuais: LinhaBaseDRE[],
  anteriores: LinhaBaseDRE[],
  periodo: { de: string; ate: string; deAnt: string; ateAnt: string },
): DREComparativo {
  const tAtual = totais(atuais);
  const tAnt = totais(anteriores);
  const baseAV = tAtual.totalReceitas || 1;
  const antPorCodigo = new Map(anteriores.map((l) => [l.codigo, l.valor]));

  const enriquecer = (linhas: LinhaBaseDRE[]): LinhaDREAnalise[] =>
    linhas
      .map((l) => ({
        ...l,
        av: (l.valor / baseAV) * 100,
        ah: variacaoHorizontal(l.valor, antPorCodigo.get(l.codigo) ?? 0),
      }))
      .sort((a, b) => a.codigo.localeCompare(b.codigo));

  return {
    ...tAtual,
    de: periodo.de,
    ate: periodo.ate,
    receitas: enriquecer(atuais.filter((l) => l.tipo === "receita")),
    despesas: enriquecer(atuais.filter((l) => l.tipo === "despesa")),
    anterior: { ...tAnt, de: periodo.deAnt, ate: periodo.ateAnt },
  };
}
