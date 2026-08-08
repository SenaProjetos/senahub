"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ItemPagina } from "@/lib/pdf-busca";
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
};

/**
 * Canvas + camada de texto (pdf.js `TextLayer`) de UMA página, compartilhado entre
 * `PdfViewer` (prancha + apontamentos) e `DocumentoViewer` (somente-leitura). Antes desta
 * extração o mesmo código de render existia duplicado nos dois arquivos.
 *
 * Pinta as marcas de busca com `<mark>` via DOM API (createTextNode/createElement) — nunca
 * `innerHTML`: o texto vem do PDF e não é confiável como HTML.
 */
export function PdfPagina({ pdf, pagina, largura, registrar, onTexto, marcas, ocgConfig, ocgVersao, children }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textLayerRef = useRef<HTMLDivElement | null>(null);
  const [dim, setDim] = useState<{ w: number; h: number; wPt: number; hPt: number } | null>(null);

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

  // Canvas + extração de texto + camada de texto (deps: página/largura mudam → re-render completo).
  useEffect(() => {
    let cancelado = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let renderTask: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let textLayer: any;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        const page = await pdf.getPage(pagina);
        const base = page.getViewport({ scale: 1 });
        const scale = largura / base.width;
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas || cancelado) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        renderTask = page.render({
          canvasContext: ctx,
          viewport,
          transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
          optionalContentConfigPromise: ocgConfig ? Promise.resolve(ocgConfig) : undefined,
        });
        await renderTask.promise;
        if (cancelado) return;
        // `wPt`/`hPt` são as dimensões do viewport em escala 1 — ou seja, a página em PONTOS
        // do PDF, com `/Rotate` JÁ aplicado (espaço visual). É o que a medição (item 28)
        // precisa: usar a MediaBox não rotacionada erraria 41% numa prancha /Rotate 270.
        setDim({
          w: Math.floor(viewport.width),
          h: Math.floor(viewport.height),
          wPt: base.width,
          hPt: base.height,
        });

        // Extração de texto: independente do canvas, mas reaproveita a mesma página já aberta.
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
        pintarMarcas();
      } catch (e) {
        // Cancelamento de render/textLayer dispara exceção esperada ao trocar largura.
        if (!cancelado) console.debug("[pdf-pagina] falha pág.", pagina, e);
      }
    })();
    return () => {
      cancelado = true;
      textDivsRef.current = null;
      textosRef.current = null;
      try {
        renderTask?.cancel?.();
      } catch {
        /* noop */
      }
      try {
        textLayer?.cancel?.();
      } catch {
        /* noop */
      }
    };
    // ocgVersao (não ocgConfig): a config MUTA em memória a cada toggle, a referência do
    // objeto não muda — só o contador força este efeito (que re-renderiza o canvas do zero,
    // já que camada visível/oculta é decidida DENTRO do `page.render()`) a rodar de novo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf, pagina, largura, ocgVersao]);

  return (
    <div ref={registrar} className="relative mx-auto shadow-sm" style={{ width: dim?.w }}>
      <canvas ref={canvasRef} className="block bg-white" />
      <div ref={textLayerRef} className="textLayer" style={{ width: dim?.w, height: dim?.h }} />
      {/* Overlay do chamador (pinos/formas/clique) — ele mesmo é responsável pelo próprio
          `absolute inset-0`, igual já fazia antes desta extração. A forma de função só é
          chamada depois de a página medir, senão o SVG nasceria com viewBox 0x0. */}
      {typeof children === "function" ? (dim ? children(dim) : null) : children}
    </div>
  );
}
