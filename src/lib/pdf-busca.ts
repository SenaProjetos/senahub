/**
 * Busca textual sobre o conteúdo extraído de um PDF (pdf.js `getTextContent`).
 * Pura, sem I/O — quem chama já buscou o texto de cada página.
 *
 * Concatenação de página segue o mesmo critério do próprio pdf.js (ver
 * `pdfjs-dist/web/pdf_viewer.mjs`, `_extractText`): concatena `item.str` DIRETO, sem
 * espaço sintético entre itens, inserindo `"\n"` só quando `item.hasEOL`. Inserir espaço
 * (alternativa mais óbvia) desalinha com o texto real — palavras já espaçadas no PDF
 * ganhariam espaço duplicado, e itens sem espaço real entre si (comum em desenhos de CAD,
 * onde cada glifo/palavra é um item próprio) deixariam de casar.
 *
 * Normalização (acento/case) é `toLowerCase + NFD + strip \p{M}`, NÃO a normalização
 * completa do pdf.js (que também lida com CJK, ligaduras, aspas curvas e hífen de quebra
 * de linha via uma tabela de diffs — não é exportada publicamente pelo pacote, só usada
 * internamente pela classe `PDFFindController`). Para o alfabeto acentuado do português
 * (á à â ã é ê í ó ô õ ú ü ç) a decomposição NFD + remoção da marca combinante preserva o
 * comprimento 1:1 (1 char vira base+marca vira base — sempre length 1 no fim), então os
 * offsets do match no texto normalizado mapeiam direto para o texto original sem precisar
 * de tabela de diffs. Fora desse alfabeto (CJK, ligaduras) o comprimento pode divergir —
 * fora de escopo aqui.
 *
 * Limitação aceita: uma palavra quebrada por hífen no fim de linha justificada (comum em
 * contratos/memoriais) não casa como palavra única, porque a quebra de linha vira um "\n"
 * real no texto concatenado e a busca não atravessa esse caractere.
 */

export type ItemPagina = {
  texto: string;
  /** Espelha `TextItem.hasEOL` do pdf.js — insere quebra de linha após este item. */
  temQuebraLinha: boolean;
  /**
   * Posição normalizada (0..1) do item na página, quando conhecida. A busca ignora; quem usa
   * é a ancoragem de apontamentos (`modules/projetos/pendencias/ancora.ts`). Opcional porque
   * a geometria só existe quando o extrator a calcula.
   */
  x?: number;
  y?: number;
  /** Largura normalizada do item. `x` é a ORIGEM (início do texto), não o centro. */
  largura?: number;
};

export type PaginaTexto = {
  pagina: number;
  itens: ItemPagina[];
};

/** Um trecho de uma ocorrência dentro de um item específico da página. */
export type ParteOcorrencia = {
  itemIndex: number;
  inicio: number;
  fim: number;
};

/** Uma ocorrência lógica do termo — normalmente 1 parte; 2+ só quando o match cruza itens adjacentes sem separador. */
export type Ocorrencia = {
  id: string;
  pagina: number;
  partes: ParteOcorrencia[];
};

/** `toLowerCase + NFD + strip marcas combinantes` — ver nota de comprimento no topo do arquivo. */
export function normalizarBusca(texto: string): string {
  return texto.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
}

function juntarItens(itens: readonly ItemPagina[]): { juntado: string; offsets: number[] } {
  const offsets: number[] = [];
  const partes: string[] = [];
  let pos = 0;
  for (const item of itens) {
    offsets.push(pos);
    partes.push(item.texto);
    pos += item.texto.length;
    if (item.temQuebraLinha) {
      partes.push("\n");
      pos += 1;
    }
  }
  return { juntado: partes.join(""), offsets };
}

/** Mapeia um range [inicio,fim) do texto juntado de volta para partes por item. */
function mapearParaItens(inicio: number, fim: number, offsets: readonly number[], itens: readonly ItemPagina[]): ParteOcorrencia[] {
  const partes: ParteOcorrencia[] = [];
  let i = offsets.findIndex((o, idx) => o <= inicio && inicio < o + itens[idx].texto.length);
  if (i === -1) return partes;
  let cursor = inicio;
  while (cursor < fim && i < itens.length) {
    const itemInicio = offsets[i];
    const itemFimTexto = itemInicio + itens[i].texto.length;
    const ate = Math.min(fim, itemFimTexto);
    partes.push({ itemIndex: i, inicio: cursor - itemInicio, fim: ate - itemInicio });
    cursor = ate;
    i++;
  }
  return partes;
}

/**
 * Todas as ocorrências de `termo` nas páginas dadas, ordenadas por página e posição.
 * Busca case/acento-insensível, substring literal (sem regex — não é linguagem de padrão).
 * Matches sobrepostos contam separado (ex.: "aa" em "aaa" dá 2 ocorrências).
 */
export function localizarOcorrencias(paginas: readonly PaginaTexto[], termo: string): Ocorrencia[] {
  const termoNorm = normalizarBusca(termo.trim());
  if (!termoNorm) return [];

  const ocorrencias: Ocorrencia[] = [];
  for (const { pagina, itens } of paginas) {
    if (itens.length === 0) continue;
    const { juntado, offsets } = juntarItens(itens);
    const normalizado = normalizarBusca(juntado);

    let from = 0;
    while (from <= normalizado.length - termoNorm.length) {
      const idx = normalizado.indexOf(termoNorm, from);
      if (idx === -1) break;
      const fim = idx + termoNorm.length;
      const partes = mapearParaItens(idx, fim, offsets, itens);
      if (partes.length > 0) {
        ocorrencias.push({ id: `${pagina}:${idx}`, pagina, partes });
      }
      from = idx + 1;
    }
  }
  return ocorrencias;
}

/** false quando nenhuma página tem texto extraível — sinal de PDF escaneado (sem OCR). */
export function paginaTemTextoPesquisavel(paginas: readonly PaginaTexto[]): boolean {
  return paginas.some((p) => p.itens.some((i) => i.texto.trim().length > 0));
}
