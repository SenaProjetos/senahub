/**
 * Zoom dos visualizadores de PDF (prancha com apontamentos e documento somente-leitura) —
 * regras puras, sem DOM. Os componentes medem e aplicam; as contas ficam aqui para serem
 * testadas.
 *
 * O teto era 500% e não bastava para ler detalhe de planta (chamado de 2026-09-28). Subir o
 * teto sozinho não resolve: a página inteira num canvas só estoura o limite de pixels do
 * navegador (a prancha some, fica em branco) muito antes de 2000%. Por isso a página é
 * desenhada em resolução LIMITADA (`escalaDoCanvas`) e, por cima, só o trecho visível em
 * resolução cheia (`regiaoDetalhe`) — o mesmo desenho do "detail view" do pdf.js.
 */

export const ZOOM_PDF_MIN = 0.5;
export const ZOOM_PDF_MAX = 20;

/**
 * Degraus dos botões +/−. Somar 25% a cada clique levava 60 cliques de 500% a 2000%; em
 * degraus, perto de 100% o passo é fino e lá em cima ele cresce, como nos visualizadores de CAD.
 */
export const DEGRAUS_ZOOM = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12, 16, 20] as const;

/** Fator por "clique" de roda com Ctrl: multiplicativo, então subir e descer voltam ao mesmo ponto. */
const FATOR_RODA = 1.2;

/** Pixels do canvas da página inteira. pdf.js usa os mesmos tetos (2^25; 2^24 em aparelho de toque). */
export const MAX_PIXELS_PAGINA = 2 ** 25;
export const MAX_PIXELS_PAGINA_TOQUE = 2 ** 24;
/** Pixels do canvas do trecho visível — a tela inteira de um monitor 4K com folga cabe aqui. */
export const MAX_PIXELS_DETALHE = 2 ** 24;

export function limitarZoomPdf(z: number): number {
  if (!Number.isFinite(z)) return 1;
  return Math.min(ZOOM_PDF_MAX, Math.max(ZOOM_PDF_MIN, Math.round(z * 1000) / 1000));
}

/** Próximo degrau acima (`1`) ou abaixo (`-1`) do zoom atual — que pode estar entre degraus (roda, pinça). */
export function passoZoom(atual: number, direcao: 1 | -1): number {
  const eps = 1e-3;
  if (direcao === 1) {
    const prox = DEGRAUS_ZOOM.find((d) => d > atual + eps);
    return limitarZoomPdf(prox ?? ZOOM_PDF_MAX);
  }
  const ant = [...DEGRAUS_ZOOM].reverse().find((d) => d < atual - eps);
  return limitarZoomPdf(ant ?? ZOOM_PDF_MIN);
}

/** Ctrl+roda: `deltaY < 0` aproxima. */
export function zoomPelaRodaPdf(atual: number, deltaY: number): number {
  if (deltaY === 0) return limitarZoomPdf(atual);
  return limitarZoomPdf(deltaY < 0 ? atual * FATOR_RODA : atual / FATOR_RODA);
}

/**
 * Pixels do canvas por pixel CSS para a página inteira: a densidade da tela (`dpr`), a menos que
 * isso passe de `maxPixels` — aí desce até caber. Abaixo de `dpr`, a página sai borrada e o
 * trecho visível precisa do canvas de detalhe.
 */
export function escalaDoCanvas(larguraCss: number, alturaCss: number, dpr: number, maxPixels: number): number {
  const area = larguraCss * alturaCss;
  if (area <= 0) return dpr;
  return Math.min(dpr, Math.sqrt(maxPixels / area));
}

/** A página inteira ficou abaixo da densidade da tela? Então vale desenhar o trecho visível por cima. */
export function precisaDetalhe(escala: number, dpr: number): boolean {
  return escala < dpr * 0.98;
}

type Caixa = { left: number; top: number; width: number; height: number };

/**
 * Trecho da página a desenhar em resolução cheia: o que está visível no visor, mais uma folga
 * para um arraste curto não mostrar a borda borrada, tudo recortado à página. Coordenadas de
 * entrada são de tela (`getBoundingClientRect`); a saída é em px CSS DENTRO da página.
 *
 * Devolve `null` quando a página não aparece no visor. A folga encolhe (e, no limite, a
 * densidade também) para o trecho caber em `maxPixels`.
 */
export function regiaoDetalhe({
  pagina,
  visor,
  dpr,
  maxPixels,
  folga = 0.25,
}: {
  pagina: Caixa;
  visor: Caixa;
  dpr: number;
  maxPixels: number;
  folga?: number;
}): { x: number; y: number; w: number; h: number; escala: number } | null {
  const esq = Math.max(pagina.left, visor.left);
  const topo = Math.max(pagina.top, visor.top);
  const dir = Math.min(pagina.left + pagina.width, visor.left + visor.width);
  const base = Math.min(pagina.top + pagina.height, visor.top + visor.height);
  if (dir <= esq || base <= topo) return null;

  const visW = dir - esq;
  const visH = base - topo;
  // Folga em px CSS: fração do lado maior, reduzida até o trecho caber no orçamento.
  let m = Math.max(visW, visH) * folga;
  const cabe = (mm: number) => (visW + 2 * mm) * (visH + 2 * mm) * dpr * dpr <= maxPixels;
  while (m > 1 && !cabe(m)) m /= 2;
  if (!cabe(m)) m = 0;

  const x = Math.max(0, esq - pagina.left - m);
  const y = Math.max(0, topo - pagina.top - m);
  const w = Math.min(pagina.width, esq - pagina.left + visW + m) - x;
  const h = Math.min(pagina.height, topo - pagina.top + visH + m) - y;
  return { x, y, w, h, escala: escalaDoCanvas(w, h, dpr, maxPixels) };
}
