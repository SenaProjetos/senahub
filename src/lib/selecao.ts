/**
 * Regras da seleção de linhas em lista — puras, sem React, para serem testadas sozinhas.
 * O estado vive no `useSelecao`; aqui ficam as decisões.
 *
 * Decisões do dono (2026-09-20, onda 2 do menu de contexto):
 * - a seleção **atravessa filtro e página**: marcar algumas linhas de um filtro e outras de outro
 *   é caso de uso, não acidente. Quem devolve a visão do conjunto é o botão "Selecionados (N)";
 * - botão direito numa linha **fora** da seleção seleciona só ela e limpa o resto — é o que o
 *   explorador de arquivos faz, e evita a ação em lote surpresa;
 * - "selecionar todos" vale para a **página atual**, nunca para o que não está na tela.
 */

/** Marca ou desmarca uma linha. */
export function alternar(ids: ReadonlySet<string>, id: string): Set<string> {
  const proxima = new Set(ids);
  if (!proxima.delete(id)) proxima.add(id);
  return proxima;
}

/**
 * Caixa do cabeçalho: marca ou desmarca **as linhas da página**, preservando o que foi marcado em
 * outras páginas ou filtros.
 */
export function alternarPagina(ids: ReadonlySet<string>, idsDaPagina: readonly string[]): Set<string> {
  const proxima = new Set(ids);
  if (estadoDaPagina(ids, idsDaPagina) === "todos") {
    for (const id of idsDaPagina) proxima.delete(id);
  } else {
    for (const id of idsDaPagina) proxima.add(id);
  }
  return proxima;
}

/** Botão direito fora da seleção: a linha clicada vira a seleção inteira. */
export function selecionarSomente(id: string): Set<string> {
  return new Set([id]);
}

/**
 * O que o botão direito faz numa linha: dentro da seleção, mantém tudo (a ação vale para o
 * conjunto); fora dela, passa a valer só a linha clicada.
 */
export function selecaoAoAbrirMenu(ids: ReadonlySet<string>, id: string): Set<string> {
  return ids.has(id) ? new Set(ids) : selecionarSomente(id);
}

/** Estado da caixa do cabeçalho para a página atual. */
export function estadoDaPagina(
  ids: ReadonlySet<string>,
  idsDaPagina: readonly string[],
): "nenhum" | "alguns" | "todos" {
  if (idsDaPagina.length === 0) return "nenhum";
  let marcados = 0;
  for (const id of idsDaPagina) if (ids.has(id)) marcados++;
  if (marcados === 0) return "nenhum";
  return marcados === idsDaPagina.length ? "todos" : "alguns";
}

/** Quantos dos selecionados não estão na página atual — o que o botão "Selecionados" revela. */
export function foraDaPagina(ids: ReadonlySet<string>, idsDaPagina: readonly string[]): number {
  const naPagina = new Set(idsDaPagina);
  let fora = 0;
  for (const id of ids) if (!naPagina.has(id)) fora++;
  return fora;
}
