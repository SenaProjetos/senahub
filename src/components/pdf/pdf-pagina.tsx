"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ItemPagina } from "@/lib/pdf-busca";
import {
  escalaDoCanvas,
  MAX_PIXELS_DETALHE,
  MAX_PIXELS_PAGINA,
  MAX_PIXELS_PAGINA_TOQUE,
  precisaDetalhe,
  regiaoDetalhe,
} from "@/lib/pdf-zoom";
import { posicaoNormalizadaItem } from "@/modules/projetos/pendencias/ancora";

// pdf.js é carregado dinamicamente no cliente pelo componente pai (evita SSR e mantém o
// chunk fora do bundle inicial) — este componente só recebe o doc já aberto.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PdfDoc = any;

/** Marca de busca já resolvida para UM item de texto desta página. */
export type MarcaTexto = {
  itemIndex: number;
  inicio: number;
  fim: number;
  atual: boolean;
  ocorrenciaId: string;
};

type Props = {
  pdf: PdfDoc;
  pagina: number;
  largura: number;
  registrar?: (el: HTMLDivElement | null) => void;
  /** Reporta o texto extraído assim que a página resolve — para indexação de busca. */
  onTexto?: (pagina: number, itens: ItemPagina[]) => void;
  /** Marcas de busca já filtradas para esta página (vem de `usePdfBusca`). */
  marcas?: MarcaTexto[];
  /**
   * Config de camadas/OCG (item 27, `usePdfCamadas`) — passada direto pro `page.render()`.
   * `undefined`/`null`: renderiza sem restrição (comportamento de sempre, PDF sem camadas).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ocgConfig?: any;
  /** Muda a cada `alternar()` de `usePdfCamadas` — força re-render do canvas com o novo estado. */
  ocgVersao?: number;
  /**
   * Overlay do chamador (pinos, formas, captura de clique) — absoluto, ocupa o mesmo box do
   * canvas. A forma de FUNÇÃO recebe o tamanho real renderizado da página em px: um overlay
   * SVG precisa dele para o `viewBox`, porque desenhar num viewBox unitário com
   * `preserveAspectRatio="none"` distorceria espessura de traço e curvatura de arco de forma
   * não-uniforme (a nuvem de revisão sairia amassada num eixo). Pinos, que são posicionados em
   * `%`, seguem podendo usar a forma simples.
   */
  children?: ReactNode | ((dim: { w: number; h: number; wPt: number; hPt: number }) => ReactNode);
  /**
   * Giro da página em graus (0|90|180|270), somado ao `/Rotate` do próprio PDF. Só afeta a
   * exibição — quem usa camada de coordenadas (pinos, medição) tem de tratar o giro por
   * conta, porque `x`/`y` normalizados continuam no espaço NÃO rotacionado.
   */
  rotacao?: 0 | 90 | 180 | 270;
};

/** Densidade da tela, com teto 2 (acima disso o ganho não paga a memória). */
function dprDaTela(): number {
  return Math.min(window.devicePixelRatio || 1, 2);
}

/** Aparelho de toque tem menos memória para canvas (iOS recusa acima de ~16,7 Mpx). */
function maxPixelsPagina(): number {
  return window.matchMedia?.("(pointer: coarse)").matches ? MAX_PIXELS_PAGINA_TOQUE : MAX_PIXELS_PAGINA;
}

/** Primeiro ancestral que rola — é o "visor" da página. Sem nenhum, vale a janela. */
function ancestralRolavel(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const { overflowX, overflowY } = getComputedStyle(p);
    if (/(auto|scroll)/.test(overflowX + overflowY)) return p;
  }
  return null;
}

/** Copia o que foi desenhado fora da tela para o canvas visível, de uma vez (sem piscar em branco). */
function transferir(de: HTMLCanvasElement, para: HTMLCanvasElement) {
  para.width = de.width;
  para.height = de.height;
  para.getContext("2d")?.drawImage(de, 0, 0);
  // Solta a memória do canvas temporário já, sem esperar o coletor de lixo.
  de.width = 0;
  de.height = 0;
}

/**
 * Canvas + camada de texto (pdf.js `TextLayer`) de UMA página, compartilhado entre
 * `PdfViewer` (prancha + apontamentos) e `DocumentoViewer` (somente-leitura). Antes desta
 * extração o mesmo código de render existia duplicado nos dois arquivos.
 *
 * Pinta as marcas de busca com `<mark>` via DOM API (createTextNode/createElement) — nunca
 * `innerHTML`: o texto vem do PDF e não é confiável como HTML.
 *
 * **Zoom alto (até 2000%, `lib/pdf-zoom.ts`).** A página inteira vai para um canvas de
 * resolução limitada; quando esse limite deixa a página abaixo da densidade da tela, um segundo
 * canvas desenha SÓ o trecho visível em resolução cheia, e é refeito ao rolar/arrastar. O
 * tamanho da caixa segue `largura` na hora (proporção da última renderização), com o desenho
 * antigo esticado até o novo ficar pronto: o zoom responde no clique e quem chama consegue
 * manter o ponto sob o cursor parado, porque o layout já mudou quando o efeito dele roda.
 */
export function PdfPagina({ pdf, pagina, largura, registrar, onTexto, marcas, ocgConfig, ocgVersao, rotacao = 0, children }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const detalheRef = useRef<HTMLCanvasElement | null>(null);
  const caixaRef = useRef<HTMLDivElement | null>(null);
  const textLayerRef = useRef<HTMLDivElement | null>(null);
  const [dim, setDim] = useState<{ w: number; h: number; wPt: number; hPt: number } | null>(null);
  /** altura/largura da página (com giro). Conhecida, a caixa acompanha `largura` sem esperar o desenho. */
  const [proporcao, setProporcao] = useState<number | null>(null);
  /** Sobe a cada página inteira desenhada; o trecho em detalhe é refeito em seguida. */
  const [versaoBase, setVersaoBase] = useState(0);
  const [comDetalhe, setComDetalhe] = useState(false);
  /** Giro com que o detalhe atual foi desenhado — com outro giro ele estaria no lugar errado. */
  const giroDetalheRef = useRef(rotacao);
  /**
   * O que está no canvas da página inteira agora. No teto de pixels o bitmap tem SEMPRE o mesmo
   * tamanho, qualquer que seja o zoom — redesenhá-lo a cada passo era refazer a prancha inteira
   * (~134 MB por canvas, dois de uma vez) sem ganhar um pixel de nitidez, e travava a tela.
   */
  const desenhoRef = useRef<{ pdf: PdfDoc; pagina: number; rotacao: number; ocgVersao?: number; w: number; h: number } | null>(null);
  /** Camada de texto viva e a página dela: o zoom só a reajusta (`update`), sem refazer. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const camadaTextoRef = useRef<{ textLayer: any; page: any } | null>(null);
  const larguraRef = useRef(largura);
  larguraRef.current = largura;

  // Sobrevive entre a troca de `marcas` sem precisar re-render da página inteira.
  const textDivsRef = useRef<HTMLElement[] | null>(null);
  const textosRef = useRef<string[] | null>(null);
  const marcasRef = useRef<MarcaTexto[]>(marcas ?? []);
  marcasRef.current = marcas ?? [];

  function pintarMarcas() {
    const divs = textDivsRef.current;
    const textos = textosRef.current;
    if (!divs || !textos) return;
    const porItem = new Map<number, MarcaTexto[]>();
    for (const m of marcasRef.current) {
      const lista = porItem.get(m.itemIndex);
      if (lista) lista.push(m);
      else porItem.set(m.itemIndex, [m]);
    }
    divs.forEach((div, i) => {
      const texto = textos[i] ?? "";
      const doItem = (porItem.get(i) ?? []).slice().sort((a, b) => a.inicio - b.inicio);
      div.textContent = "";
      if (doItem.length === 0) {
        div.textContent = texto;
        return;
      }
      let cursor = 0;
      for (const m of doItem) {
        if (m.inicio > cursor) div.appendChild(document.createTextNode(texto.slice(cursor, m.inicio)));
        const mark = document.createElement("mark");
        mark.dataset.ocorrencia = m.ocorrenciaId;
        mark.style.color = "transparent";
        mark.className = m.atual ? "bg-orange-400/70" : "bg-yellow-300/60";
        mark.textContent = texto.slice(m.inicio, m.fim);
        div.appendChild(mark);
        cursor = m.fim;
      }
      if (cursor < texto.length) div.appendChild(document.createTextNode(texto.slice(cursor)));
    });
  }

  // Repinta quando SÓ as marcas mudam (a cada tecla da busca) — sem re-renderizar canvas/texto.
  useEffect(() => {
    pintarMarcas();
  }, [marcas]);

  // Canvas da página inteira (deps: página/largura/giro/camadas). Só redesenha quando o bitmap
  // muda de tamanho: no teto de pixels o zoom só estica o que já existe, e a nitidez do trecho
  // visível fica com o canvas de detalhe (refeito logo abaixo, a cada `versaoBase`).
  useEffect(() => {
    let cancelado = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let renderTask: any;
    (async () => {
      try {
        const page = await pdf.getPage(pagina);
        const base = page.getViewport({ scale: 1, rotation: rotacao });
        const scale = largura / base.width;
        const viewport = page.getViewport({ scale, rotation: rotacao });
        const canvas = canvasRef.current;
        if (!canvas || cancelado) return;
        setProporcao(viewport.height / viewport.width);
        // Girou: o detalhe desenhado com o giro antigo está no lugar errado até ser refeito.
        if (giroDetalheRef.current !== rotacao && detalheRef.current) detalheRef.current.style.display = "none";
        const dpr = dprDaTela();
        const escala = escalaDoCanvas(viewport.width, viewport.height, dpr, maxPixelsPagina());
        const alvoW = Math.floor(viewport.width * escala);
        const alvoH = Math.floor(viewport.height * escala);
        const atual = desenhoRef.current;
        const mesmoBitmap =
          atual !== null &&
          atual.pdf === pdf &&
          atual.pagina === pagina &&
          atual.rotacao === rotacao &&
          atual.ocgVersao === ocgVersao &&
          Math.abs(atual.w - alvoW) <= 1 &&
          Math.abs(atual.h - alvoH) <= 1 &&
          canvas.width > 0;
        if (!mesmoBitmap) {
          // Desenha fora da tela e só então troca: o desenho anterior (esticado) fica à vista
          // enquanto o novo não termina, em vez de a página piscar em branco a cada zoom.
          const fora = document.createElement("canvas");
          fora.width = alvoW;
          fora.height = alvoH;
          const ctx = fora.getContext("2d");
          if (!ctx) return;
          renderTask = page.render({
            canvasContext: ctx,
            viewport,
            transform: escala !== 1 ? [escala, 0, 0, escala, 0, 0] : undefined,
            optionalContentConfigPromise: ocgConfig ? Promise.resolve(ocgConfig) : undefined,
          });
          await renderTask.promise;
          if (cancelado) {
            fora.width = 0;
            fora.height = 0;
            return;
          }
          transferir(fora, canvas);
          desenhoRef.current = { pdf, pagina, rotacao, ocgVersao, w: alvoW, h: alvoH };
        }
        setComDetalhe(precisaDetalhe(escala, dpr));
        setVersaoBase((v) => v + 1);
        // `wPt`/`hPt` são as dimensões do viewport em escala 1 — ou seja, a página em PONTOS
        // do PDF, com `/Rotate` JÁ aplicado (espaço visual). É o que a medição (item 28)
        // precisa: usar a MediaBox não rotacionada erraria 41% numa prancha /Rotate 270.
        setDim({
          w: Math.floor(viewport.width),
          h: Math.floor(viewport.height),
          wPt: base.width,
          hPt: base.height,
        });
      } catch (e) {
        // Cancelamento de render dispara exceção esperada ao trocar largura.
        if (!cancelado) console.debug("[pdf-pagina] falha pág.", pagina, e);
      }
    })();
    return () => {
      cancelado = true;
      try {
        renderTask?.cancel?.();
      } catch {
        /* noop */
      }
    };
    // ocgVersao (não ocgConfig): a config MUTA em memória a cada toggle, a referência do
    // objeto não muda — só o contador força este efeito (que re-renderiza o canvas do zero,
    // já que camada visível/oculta é decidida DENTRO do `page.render()`) a rodar de novo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf, pagina, largura, ocgVersao, rotacao]);

  // Extração de texto + camada de texto: UMA vez por página/giro. O texto não muda com o zoom
  // (a posição de cada item vai normalizada, em escala 1); antes ele era pedido de novo ao worker
  // e a camada refeita do zero a cada passo de zoom.
  useEffect(() => {
    let cancelado = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let textLayer: any;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        const page = await pdf.getPage(pagina);
        if (cancelado) return;
        const base = page.getViewport({ scale: 1, rotation: rotacao });
        const viewport = page.getViewport({ scale: larguraRef.current / base.width, rotation: rotacao });
        const textContent = await page.getTextContent();
        // `items` mistura TextItem (tem `.str`) e TextMarkedContent (não tem) — só o primeiro
        // grupo tem texto pesquisável, e é exatamente o subconjunto que o TextLayer usa pra
        // gerar `textDivs` (mesma ordem, garantida pelo contrato público da lib).
        // A posição normalizada de cada item alimenta a ancoragem de apontamentos (item 3);
        // a busca ignora. Vem do viewport em escala 1 de propósito: assim o valor não muda
        // com o zoom, que é o que torna a âncora comparável entre revisões.
        const vpBase = page.getViewport({ scale: 1 });
        const itensTexto: ItemPagina[] = textContent.items
          .filter((it: unknown): it is { str: string; hasEOL: boolean; transform: number[]; width: number } => typeof (it as { str?: unknown }).str === "string")
          .map((it: { str: string; hasEOL: boolean; transform: number[]; width: number }) => {
            const pos = posicaoNormalizadaItem(it.transform, vpBase.transform, vpBase.width, vpBase.height);
            return {
              texto: it.str,
              temQuebraLinha: it.hasEOL,
              x: pos?.x,
              y: pos?.y,
              // `width` do pdf.js já vem em pontos da página no viewport de escala 1.
              largura: pos && typeof it.width === "number" ? it.width / vpBase.width : undefined,
            };
          });
        if (cancelado) return;
        onTexto?.(pagina, itensTexto);

        const container = textLayerRef.current;
        if (!container) return;
        container.replaceChildren();
        textLayer = new pdfjs.TextLayer({ textContentSource: textContent, container, viewport });
        await textLayer.render();
        if (cancelado) return;

        textDivsRef.current = textLayer.textDivs as HTMLElement[];
        textosRef.current = textLayer.textContentItemsStr as string[];
        camadaTextoRef.current = { textLayer, page };
        // O zoom pode ter mudado enquanto o texto carregava.
        textLayer.update({ viewport: page.getViewport({ scale: larguraRef.current / base.width, rotation: rotacao }) });
        pintarMarcas();
      } catch (e) {
        // Cancelamento do textLayer dispara exceção esperada ao trocar de página.
        if (!cancelado) console.debug("[pdf-pagina] falha no texto pág.", pagina, e);
      }
    })();
    return () => {
      cancelado = true;
      textDivsRef.current = null;
      textosRef.current = null;
      camadaTextoRef.current = null;
      try {
        textLayer?.cancel?.();
      } catch {
        /* noop */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf, pagina, rotacao]);

  // Zoom: a camada de texto só é reajustada (`TextLayer.update` remede cada trecho), com uma
  // pausa curta — numa sequência de roda do mouse ela acerta uma vez só, no fim. Invisível, ela
  // pode ficar um instante na escala anterior sem ninguém notar.
  useEffect(() => {
    const timer = setTimeout(() => {
      const camada = camadaTextoRef.current;
      if (!camada) return;
      const base = camada.page.getViewport({ scale: 1, rotation: rotacao });
      camada.textLayer.update({ viewport: camada.page.getViewport({ scale: largura / base.width, rotation: rotacao }) });
    }, 150);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [largura]);

  // Trecho visível em resolução cheia (só quando a página inteira ficou abaixo da densidade da
  // tela). Refeito depois de cada página inteira desenhada e, com uma pausa curta, ao rolar.
  useEffect(() => {
    const detalhe = detalheRef.current;
    const caixa = caixaRef.current;
    if (!detalhe || !caixa) return;
    if (!comDetalhe) {
      detalhe.style.display = "none";
      detalhe.width = 0;
      detalhe.height = 0;
      return;
    }
    const visor = ancestralRolavel(caixa);
    let cancelado = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let tarefa: any;

    async function desenhar() {
      try {
        tarefa?.cancel?.();
      } catch {
        /* noop */
      }
      if (!caixa || !detalhe) return;
      const rp = caixa.getBoundingClientRect();
      const rv = visor ? visor.getBoundingClientRect() : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
      const reg = regiaoDetalhe({ pagina: rp, visor: rv, dpr: dprDaTela(), maxPixels: MAX_PIXELS_DETALHE });
      if (!reg || rp.width <= 0) return;
      try {
        const page = await pdf.getPage(pagina);
        if (cancelado) return;
        const base = page.getViewport({ scale: 1, rotation: rotacao });
        // Escala pela caixa MEDIDA: é nela que o trecho foi calculado.
        const viewport = page.getViewport({ scale: rp.width / base.width, rotation: rotacao });
        const fora = document.createElement("canvas");
        fora.width = Math.max(1, Math.floor(reg.w * reg.escala));
        fora.height = Math.max(1, Math.floor(reg.h * reg.escala));
        const ctx = fora.getContext("2d");
        if (!ctx) return;
        const e = reg.escala;
        tarefa = page.render({
          canvasContext: ctx,
          viewport,
          // Leva o canto do trecho para a origem do canvas; o que cai fora é recortado.
          transform: [e, 0, 0, e, -reg.x * e, -reg.y * e],
          optionalContentConfigPromise: ocgConfig ? Promise.resolve(ocgConfig) : undefined,
        });
        await tarefa.promise;
        if (cancelado) {
          fora.width = 0;
          fora.height = 0;
          return;
        }
        transferir(fora, detalhe);
        // Em % da página: num zoom seguinte o trecho estica junto com a página até ser refeito.
        detalhe.style.left = `${(reg.x / rp.width) * 100}%`;
        detalhe.style.top = `${(reg.y / rp.height) * 100}%`;
        detalhe.style.width = `${(reg.w / rp.width) * 100}%`;
        detalhe.style.height = `${(reg.h / rp.height) * 100}%`;
        detalhe.style.display = "block";
        giroDetalheRef.current = rotacao;
      } catch (err) {
        // Cancelar o desenho (rolou de novo, zoom mudou) dispara exceção esperada.
        if (!cancelado) console.debug("[pdf-pagina] falha no detalhe pág.", pagina, err);
      }
    }

    const agendar = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void desenhar(), 150);
    };
    agendar();
    const alvo: HTMLElement | Window = visor ?? window;
    alvo.addEventListener("scroll", agendar, { passive: true });
    window.addEventListener("resize", agendar);
    return () => {
      cancelado = true;
      clearTimeout(timer);
      alvo.removeEventListener("scroll", agendar);
      window.removeEventListener("resize", agendar);
      try {
        tarefa?.cancel?.();
      } catch {
        /* noop */
      }
    };
    // `versaoBase` cobre largura/giro/camadas: toda página inteira nova refaz o detalhe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comDetalhe, versaoBase]);

  return (
    <div
      ref={(el) => {
        caixaRef.current = el;
        registrar?.(el);
      }}
      data-pdf-pagina={pagina}
      className="relative mx-auto shadow-sm"
      style={{ width: largura, height: proporcao ? Math.round(largura * proporcao) : undefined }}
    >
      {/* Antes da primeira medida o canvas fica no tamanho natural; depois, preenche a caixa
          (e estica o desenho anterior durante um zoom, até o novo ficar pronto). */}
      <canvas ref={canvasRef} className={proporcao ? "block size-full bg-white" : "block bg-white"} />
      <canvas ref={detalheRef} className="pointer-events-none absolute hidden" aria-hidden />
      <div ref={textLayerRef} className="textLayer" style={{ width: dim?.w, height: dim?.h }} />
      {/* Overlay do chamador (pinos/formas/clique) — ele mesmo é responsável pelo próprio
          `absolute inset-0`, igual já fazia antes desta extração. A forma de função só é
          chamada depois de a página medir, senão o SVG nasceria com viewBox 0x0. */}
      {typeof children === "function" ? (dim ? children(dim) : null) : children}
    </div>
  );
}
