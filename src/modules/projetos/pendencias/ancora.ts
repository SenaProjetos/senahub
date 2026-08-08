/**
 * Ancoragem resiliente de apontamentos (item 3 da análise).
 *
 * Problema: a posição de um pino é `(x, y)` normalizado na página. Quando o apontamento é
 * herdado por uma revisão nova (carry-over, item 2), o layout pode ter mudado e a mesma
 * coordenada passa a apontar para outro lugar — silenciosamente, que é o pior caso.
 *
 * Solução: no momento em que o pino nasce, guarda-se também um TRECHO DE TEXTO próximo dele.
 * Na revisão seguinte, procura-se esse trecho no texto da página; achando-o de forma
 * inequívoca, o pino é reposicionado junto com o conteúdo. Não achando (ou achando em vários
 * lugares), o pino fica onde estava e é marcado como "posição incerta" — a ferramenta admite
 * que não sabe em vez de fingir precisão.
 *
 * Puro, sem I/O. A extração de texto vem do mesmo caminho da busca textual (item 26) e a
 * concatenação/normalização reusa `lib/pdf-busca.ts` — a âncora é, por construção, um
 * substring localizável pela mesma máquina de busca.
 *
 * Ao contrário dos vizinhos desta pasta, este módulo NÃO tem `server-only`, de propósito: a
 * relocalização só pode acontecer no cliente (é lá que o PDF da revisão atual está
 * renderizado). O servidor usa daqui apenas o tipo `Ancora`.
 *
 * ── Medido no acervo real (39 PDFs de dev, 2026-08-06, grid de 1152 pontos de amostra) ──
 * Com `RAIO` 0.06 e `TAMANHO_MIN` 40: 71% dos pontos têm âncora capturável e 80% dessas são
 * únicas na página — ou seja, ~57% dos cliques ficam relocalizáveis com confiança e o resto
 * cai na flag de incerteza. Raio maior (0.10) sobe a captura para 82% sem perder unicidade,
 * mas afasta a âncora do clique: `dx/dy` vira um vetor longo e um deslocamento relativo do
 * texto na revisão nova joga o pino para longe. 0.06 é o meio-termo escolhido.
 *
 * Limitações aceitas (documentadas, não contornadas):
 * - `dx/dy` é normalizado à página, então NÃO sobrevive a mudança de escala do desenho entre
 *   revisões (mesma fragilidade já anotada no item 5, sobreposição).
 * - A busca é na MESMA página; conteúdo que mudou de página entre revisões não é seguido.
 * - Prancha sem camada de texto (CAD que exportou texto como curva, ~18% do acervo) nunca
 *   gera âncora — o pino herdado sempre aparece como incerto.
 */

import { normalizarBusca, type ItemPagina } from "@/lib/pdf-busca";

/** Raio de captura, em fração da página (distância euclidiana normalizada). */
export const RAIO_ANCORA = 0.06;
/** Tamanho mínimo do trecho de contexto, em chars. Abaixo disso a âncora não é distintiva. */
export const TAMANHO_ANCORA = 40;

/** Item de texto cuja posição na página é conhecida — só estes podem ancorar. */
export type ItemComPosicao = ItemPagina & { x: number; y: number };

export type Ancora = {
  /** Trecho contíguo do texto da página, normalizado. Serve de contexto de desambiguação. */
  texto: string;
  /** Offset (chars) do item-âncora dentro de `texto` — o trecho é maior que o item. */
  offset: number;
  /** Deslocamento normalizado do item-âncora até o ponto clicado. */
  dx: number;
  dy: number;
};

function temPosicao(item: ItemPagina): item is ItemComPosicao {
  const i = item as ItemComPosicao;
  return typeof i.x === "number" && typeof i.y === "number";
}

/** Concatena igual ao `lib/pdf-busca.ts` (item.texto direto, "\n" só em `temQuebraLinha`). */
function juntar(itens: readonly ItemPagina[]) {
  const faixas: { inicio: number; fim: number; item: ItemPagina }[] = [];
  let texto = "";
  for (const item of itens) {
    const inicio = texto.length;
    texto += item.texto;
    faixas.push({ inicio, fim: texto.length, item });
    if (item.temQuebraLinha) texto += "\n";
  }
  return { texto: normalizarBusca(texto), faixas };
}

/** Índice da faixa que contém `pos`; se `pos` cai num separador, a faixa imediatamente anterior. */
function faixaEm(faixas: readonly { inicio: number; fim: number }[], pos: number): number {
  let anterior = -1;
  for (let i = 0; i < faixas.length; i++) {
    if (pos >= faixas[i].inicio && pos < faixas[i].fim) return i;
    if (faixas[i].fim <= pos) anterior = i;
  }
  return anterior;
}

const limitar = (v: number) => Math.min(1, Math.max(0, v));

/**
 * Posição normalizada (0..1) de um `TextItem` do pdf.js na página RENDERIZADA.
 *
 * É a translação do produto `viewport.transform × item.transform` — a mesma conta que o
 * pdf.js faz em `Util.transform` para posicionar as divs da camada de texto. Reproduzida
 * aqui (5 linhas) em vez de importada porque `Util` não é API pública do pacote. Passar pelo
 * `viewport.transform` (em vez de usar `item.transform` cru) é o que faz a conta valer também
 * para página rotacionada ou com cropbox deslocada — nesses casos a matriz do item sozinha
 * daria coordenada errada.
 */
export function posicaoNormalizadaItem(
  transformItem: readonly number[],
  transformViewport: readonly number[],
  largura: number,
  altura: number,
): { x: number; y: number } | null {
  if (!(largura > 0) || !(altura > 0)) return null;
  if (transformItem?.length !== 6 || transformViewport?.length !== 6) return null;
  const v = transformViewport;
  const i = transformItem;
  const e = v[0] * i[4] + v[2] * i[5] + v[4];
  const f = v[1] * i[4] + v[3] * i[5] + v[5];
  if (!Number.isFinite(e) || !Number.isFinite(f)) return null;
  return { x: e / largura, y: f / altura };
}

/**
 * Distância do ponto ao item, tratando o item como o SEGMENTO que o texto ocupa e não como
 * o ponto onde ele começa. Sem isso, um clique no meio de um rótulo longo (`VIGA V12 SECAO
 * 20x50 CONCRETO...`) fica a meia largura do rótulo de distância da origem e escapa do raio —
 * justamente o rótulo mais informativo é o que deixaria de ancorar.
 *
 * A extensão é considerada horizontal: para texto rotacionado a conta degrada de volta para
 * a distância à origem, o que só torna a captura mais conservadora (nunca posiciona errado —
 * quem posiciona é a origem, via `dx/dy`).
 */
function distanciaAoItem(item: ItemComPosicao, x: number, y: number): number {
  const fim = item.x + (item.largura ?? 0);
  const maisProximoX = Math.min(Math.max(x, Math.min(item.x, fim)), Math.max(item.x, fim));
  return Math.hypot(maisProximoX - x, item.y - y);
}

/**
 * Monta a âncora de um clique em `(x, y)` (normalizado 0..1 na página).
 * `null` quando não há texto posicionado dentro do raio — pino sem âncora, por definição
 * insuficiente para relocalizar depois.
 */
export function construirAncora(itens: readonly ItemPagina[], x: number, y: number): Ancora | null {
  const { texto, faixas } = juntar(itens);

  let melhor = -1;
  let melhorDist = Infinity;
  for (let i = 0; i < faixas.length; i++) {
    const item = faixas[i].item;
    if (!temPosicao(item) || !item.texto.trim()) continue;
    const d = distanciaAoItem(item, x, y);
    if (d < melhorDist) {
      melhorDist = d;
      melhor = i;
    }
  }
  if (melhor === -1 || melhorDist > RAIO_ANCORA) return null;

  // Expande simetricamente em torno do item até o trecho ficar distintivo. O trecho pode
  // conter texto que está longe na página (ordem de documento ≠ ordem espacial) — tudo bem:
  // ele só desambigua. Quem posiciona é o item-âncora, via `offset`.
  const faixa = faixas[melhor];
  let ini = faixa.inicio;
  let fim = faixa.fim;
  while (fim - ini < TAMANHO_ANCORA && (ini > 0 || fim < texto.length)) {
    if (fim < texto.length) fim++;
    else if (ini > 0) ini--;
    if (fim - ini >= TAMANHO_ANCORA) break;
    if (ini > 0) ini--;
  }

  const trecho = texto.slice(ini, fim);
  if (trecho.trim().length < 3) return null;

  const item = faixa.item as ItemComPosicao;
  return {
    texto: trecho,
    offset: faixa.inicio - ini,
    dx: x - item.x,
    dy: y - item.y,
  };
}

/**
 * Reposiciona um pino na página dada, procurando a âncora no texto dela.
 * `null` quando a âncora não aparece OU aparece em mais de um lugar (ambígua) OU o item
 * encontrado não tem posição — em todos esses casos quem chama deve manter o `(x, y)`
 * gravado e sinalizar incerteza.
 */
export function relocalizarAncora(itens: readonly ItemPagina[], ancora: Ancora): { x: number; y: number } | null {
  if (!ancora.texto) return null;
  const { texto, faixas } = juntar(itens);

  const primeiro = texto.indexOf(ancora.texto);
  if (primeiro === -1) return null;
  // Ambígua: mais de uma ocorrência na página. Melhor admitir incerteza que chutar.
  if (texto.indexOf(ancora.texto, primeiro + 1) !== -1) return null;

  const idx = faixaEm(faixas, primeiro + ancora.offset);
  if (idx === -1) return null;
  const item = faixas[idx].item;
  if (!temPosicao(item)) return null;

  return { x: limitar(item.x + ancora.dx), y: limitar(item.y + ancora.dy) };
}
