/**
 * Níveis de alçada por faixa de valor (puro, testável). Roteamento por faixa:
 * cada faixa cobre valores até `ate` (null = sem teto / catch-all) e define os papéis
 * que podem aprovar. Faixa com `papeis` vazio = aprovação automática (sem alçada).
 */
export type FaixaAlcada = { ate: number | null; papeis: string[] };

/** Papéis que podem ser aprovadores de alçada (os internos com poder de decisão). */
export const PAPEIS_APROVADORES = ["admin", "supervisor", "administrativo"] as const;

/** Faixa que cobre o valor: a de menor teto cujo `ate` >= valor; `ate=null` é catch-all. */
export function faixaPara(valor: number, faixas: FaixaAlcada[]): FaixaAlcada | null {
  const ordenadas = [...faixas].sort((a, b) => (a.ate ?? Infinity) - (b.ate ?? Infinity));
  for (const f of ordenadas) {
    if (f.ate == null || valor <= f.ate) return f;
  }
  return null;
}

/** Despesa precisa de aprovação quando a faixa do valor exige papéis aprovadores. */
export function precisaAprovacao(tipo: "receita" | "despesa", valor: number, faixas: FaixaAlcada[]): boolean {
  if (tipo !== "despesa") return false;
  const f = faixaPara(valor, faixas);
  return !!f && f.papeis.length > 0;
}

/** Papéis aptos a aprovar uma despesa do valor informado (vazio = nenhum / automático). */
export function papeisAprovadores(valor: number, faixas: FaixaAlcada[]): string[] {
  return faixaPara(valor, faixas)?.papeis ?? [];
}
