import { normalizar } from "@/lib/disciplinas-core";
import type { CardNaVersao, LinhaCatalogo } from "./versao";

/** Como a lente de uma versão se apresenta — **puro**: agrupamento, busca e as opções do seletor. */

export const SEM_CATEGORIA = "Outras";

/** Cards por categoria (ordem alfabética, "Outras" por último); a ordem dentro de cada grupo é a de entrada. */
export function agruparCards(cards: readonly CardNaVersao[]): { categoria: string; cards: CardNaVersao[] }[] {
  const mapa = new Map<string, CardNaVersao[]>();
  for (const c of cards) {
    const chave = c.categoria || SEM_CATEGORIA;
    (mapa.get(chave) ?? mapa.set(chave, []).get(chave)!).push(c);
  }
  return [...mapa.entries()]
    .sort(([a], [b]) => (a === SEM_CATEGORIA ? 1 : b === SEM_CATEGORIA ? -1 : a.localeCompare(b, "pt-BR")))
    .map(([categoria, lista]) => ({ categoria, cards: lista }));
}

function casa(linha: LinhaCatalogo, q: string): boolean {
  return (
    normalizar(linha.nome).includes(q) ||
    normalizar(linha.sigla ?? "").includes(q) ||
    linha.sinonimos.some((s) => normalizar(s).includes(q))
  );
}

/**
 * Busca por nome, sigla ou sinônimo (sem acento nem caixa). O card aparece se ele ou uma sub casar;
 * se só subs casam, mostra só elas. Busca vazia devolve a própria lista.
 */
export function filtrarCatalogo(cards: CardNaVersao[], busca: string): CardNaVersao[] {
  const q = normalizar(busca);
  if (!q) return cards;
  const saida: CardNaVersao[] = [];
  for (const c of cards) {
    if (casa(c, q)) saida.push(c);
    else {
      const subs = c.subs.filter((s) => casa(s, q));
      if (subs.length > 0) saida.push({ ...c, subs });
    }
  }
  return saida;
}

/** Mesma busca, para as listas planas (fases e tipos). Busca vazia devolve a própria lista. */
export function filtrarLinhas(linhas: LinhaCatalogo[], busca: string): LinhaCatalogo[] {
  const q = normalizar(busca);
  return q ? linhas.filter((l) => casa(l, q)) : linhas;
}

export type OpcaoVersao = { numero: number; nome: string; rascunho: boolean; vigente: boolean };

/** Versões para o seletor: mais nova primeiro; vigente = a publicada de maior número. */
export function opcoesDeVersao(versoes: readonly { numero: number; nome: string; publicadaEm: Date | null }[]): OpcaoVersao[] {
  const vigente = Math.max(0, ...versoes.filter((v) => v.publicadaEm).map((v) => v.numero));
  return [...versoes]
    .sort((a, b) => b.numero - a.numero)
    .map((v) => ({ numero: v.numero, nome: v.nome, rascunho: !v.publicadaEm, vigente: !!v.publicadaEm && v.numero === vigente }));
}
