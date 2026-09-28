"use client";

import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { limitarZoomPdf } from "@/lib/pdf-zoom";

/** Ponto da tela que deve ficar parado no zoom (cursor da roda, centro da pinça). */
export type FocoZoom = { clientX: number; clientY: number };

type Ancora = { pagina: HTMLElement; fx: number; fy: number; px: number; py: number };

/**
 * Zoom que mantém parado o ponto que a pessoa está olhando — o cursor na roda, o meio dos dedos
 * na pinça, o centro do visor nos botões. Sem isso, a 2000% cada passo de zoom jogava a planta
 * para longe e a pessoa tinha de procurar de novo onde estava.
 *
 * Antes de mudar o zoom, guarda o ponto como FRAÇÃO da página sob ele; depois que o layout muda
 * (`useLayoutEffect`, antes de pintar), rola o visor até a mesma fração cair no mesmo ponto da
 * tela. Depende de as páginas (`[data-pdf-pagina]`, de `PdfPagina`) mudarem de tamanho no mesmo
 * render do zoom — o que `PdfPagina` garante ao dimensionar a caixa por `largura` × proporção.
 */
export function useZoomAncorado(visorRef: RefObject<HTMLElement | null>) {
  const [zoom, setZoomBruto] = useState(1);
  const ancoraRef = useRef<Ancora | null>(null);

  const setZoom = useCallback(
    (prox: number | ((z: number) => number), foco?: FocoZoom) => {
      const visor = visorRef.current;
      ancoraRef.current = null;
      if (visor) {
        const rv = visor.getBoundingClientRect();
        const px = foco?.clientX ?? rv.left + visor.clientWidth / 2;
        const py = foco?.clientY ?? rv.top + visor.clientHeight / 2;
        const paginas = [...visor.querySelectorAll<HTMLElement>("[data-pdf-pagina]")];
        // A página sob o ponto; entre páginas (no vão), a mais próxima na vertical.
        let alvo: HTMLElement | null = null;
        let menor = Infinity;
        for (const p of paginas) {
          const r = p.getBoundingClientRect();
          const d = py < r.top ? r.top - py : py > r.bottom ? py - r.bottom : 0;
          if (d < menor) {
            menor = d;
            alvo = p;
          }
        }
        if (alvo) {
          const r = alvo.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) {
            ancoraRef.current = { pagina: alvo, fx: (px - r.left) / r.width, fy: (py - r.top) / r.height, px, py };
          }
        }
      }
      setZoomBruto((z) => limitarZoomPdf(typeof prox === "function" ? prox(z) : prox));
    },
    [visorRef],
  );

  useLayoutEffect(() => {
    const a = ancoraRef.current;
    const visor = visorRef.current;
    ancoraRef.current = null;
    if (!a || !visor || !a.pagina.isConnected) return;
    const r = a.pagina.getBoundingClientRect();
    visor.scrollLeft += r.left + a.fx * r.width - a.px;
    visor.scrollTop += r.top + a.fy * r.height - a.py;
  }, [zoom, visorRef]);

  return { zoom, setZoom };
}
