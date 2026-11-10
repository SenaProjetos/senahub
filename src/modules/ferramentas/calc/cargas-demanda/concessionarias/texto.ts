/**
 * Constantes de norma que só existem em TEXTO (fórmula impressa no item, não em tabela) — **puro**. Em vez de digitar
 * o número, o motor o LÊ do trecho literal da biblioteca (ex.: "D1 = ( 1 , 4 . f . a )" → 1,4). Trecho que não casa
 * com o padrão é erro de carregamento (o teste de cada concessionária o pega), nunca um valor inventado.
 */

import type { TrechoNorma } from "../biblioteca/tipos";

/** "1,4" / "1 , 4" / "0,034939" / "1.000" → número. */
export function numeroBr(s: string): number {
  const t = s.replace(/\s/g, "");
  return Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t.replace(/\.(?=\d{3}\b)/g, ""));
}

export type ConstanteDeTexto = { valores: number[]; trecho: TrechoNorma; referencia: string };

/**
 * Procura, entre os trechos, o do `item` (começo do rótulo) cujo texto casa com `padrao`, e devolve os grupos como
 * números. Lança erro se nenhum trecho casar: a biblioteca mudou e o motor precisa ser revisto.
 */
export function lerDoTrecho(trechos: readonly TrechoNorma[], item: string, padrao: RegExp): ConstanteDeTexto {
  for (const t of trechos) {
    if (!t.item.startsWith(item)) continue;
    const m = padrao.exec(t.texto.replace(/\s+/g, " "));
    if (m) {
      return { valores: m.slice(1).map(numeroBr), trecho: t, referencia: `${t.fonte.documento} ${t.fonte.edicao}, ${item}` };
    }
  }
  throw new Error(`Constante não encontrada no trecho ${item} (${padrao}).`);
}

/** Lê uma constante de uma nota de tabela ("2 - Para unidades … igual a 1,00."). */
export function lerDaNota(notas: readonly string[] | undefined, padrao: RegExp): number {
  for (const n of notas ?? []) {
    const m = padrao.exec(n.replace(/\s+/g, " "));
    if (m) return numeroBr(m[1]);
  }
  throw new Error(`Constante não encontrada nas notas (${padrao}).`);
}
