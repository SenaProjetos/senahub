"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, MoveHorizontal, MoveVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PdfDoc = any;

export type OrientacaoCortina = "vertical" | "horizontal";

/** Renderiza uma página num canvas usando um viewport já calculado, com fundo branco. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function desenhar(canvas: HTMLCanvasElement, pg: any, vp: any) {
  canvas.width = Math.floor(vp.width);
  canvas.height = Math.floor(vp.height);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await pg.render({ canvasContext: ctx, viewport: vp }).promise;
}

/**
 * Cortina de comparação (item 6, modo "swipe"): as duas revisões ocupam EXATAMENTE o mesmo
 * espaço, e uma barra arrastável decide até onde se enxerga cada uma. Arrastando, o desenho
 * "vira" de uma revisão pra outra no lugar — é o modo que responde "o que mudou aqui" sem tirar
 * os olhos do ponto, ao contrário do lado-a-lado (que obriga a alternar o olhar) e da
 * sobreposição (que mistura os dois traços).
 *
 * A barra vai na vertical (esquerda/direita) ou na horizontal (cima/baixo) — pedido do
 * solicitante, e útil de verdade: prancha deitada se compara melhor com corte vertical, e um
 * carimbo/legenda no rodapé, com corte horizontal.
 *
 * O recorte é `clip-path` sobre o canvas de cima: nada é redesenhado ao arrastar, só a área
 * visível muda. Por isso o arrasto é fluido mesmo numa A1 — redesenhar a cada movimento
 * engasgaria.
 */
export function CortinaRevisoes({
  pdfA,
  pdfB,
  rotuloA,
  rotuloB,
  pagina,
  largura,
}: {
  pdfA: PdfDoc;
  pdfB: PdfDoc;
  rotuloA: string;
  rotuloB: string;
  pagina: number;
  largura: number;
}) {
  const refA = useRef<HTMLCanvasElement | null>(null);
  const refB = useRef<HTMLCanvasElement | null>(null);
  const caixaRef = useRef<HTMLDivElement | null>(null);
  const [dim, setDim] = useState<{ w: number; h: number } | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [orientacao, setOrientacao] = useState<OrientacaoCortina>("vertical");
  /** Posição da barra, 0..100 (% da largura ou da altura, conforme a orientação). */
  const [pos, setPos] = useState(50);
  const [arrastando, setArrastando] = useState(false);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      setCarregando(true);
      try {
        const [pgA, pgB] = await Promise.all([pdfA.getPage(pagina), pdfB.getPage(pagina)]);
        if (cancelado) return;
        const base = pgA.getViewport({ scale: 1 });
        const escala = largura / base.width;
        const vpA = pgA.getViewport({ scale: escala });
        const vpB = pgB.getViewport({ scale: escala });
        // Fixa o tamanho da caixa ANTES de rasterizar (mesma ordem do `PaginaSobreposta`).
        // Fazer isso só no fim deixava o container com altura 0 enquanto renderizava — os
        // canvas são `absolute`, então não seguram altura nenhuma —, e o `ResizeObserver` do
        // comparador remedia a largura a cada mudança de layout, cancelando o efeito antes de
        // chegar no `setDim`. Resultado: altura zero permanente, e o corte HORIZONTAL dividia
        // por zero (o vertical só não quebrava porque a largura vinha do elemento pai).
        setDim({
          w: Math.floor(Math.max(vpA.width, vpB.width)),
          h: Math.floor(Math.max(vpA.height, vpB.height)),
        });
        if (refA.current) await desenhar(refA.current, pgA, vpA);
        if (cancelado) return;
        if (refB.current) await desenhar(refB.current, pgB, vpB);
      } catch (e) {
        if (!cancelado) console.debug("[cortina] falha ao renderizar pág.", pagina, e);
      } finally {
        if (!cancelado) setCarregando(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [pdfA, pdfB, pagina, largura]);

  const mover = useCallback(
    (clientX: number, clientY: number) => {
      const el = caixaRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const bruto =
        orientacao === "vertical" ? ((clientX - r.left) / r.width) * 100 : ((clientY - r.top) / r.height) * 100;
      setPos(Math.min(100, Math.max(0, bruto)));
    },
    [orientacao],
  );

  // Escuta no documento durante o arrasto: se o ponteiro sair da imagem, a barra continua
  // acompanhando em vez de travar na borda.
  useEffect(() => {
    if (!arrastando) return;
    const onMove = (e: PointerEvent) => mover(e.clientX, e.clientY);
    const onUp = () => setArrastando(false);
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
    };
  }, [arrastando, mover]);

  function aoTeclar(e: React.KeyboardEvent) {
    const passo = e.shiftKey ? 10 : 2;
    const menos = orientacao === "vertical" ? "ArrowLeft" : "ArrowUp";
    const mais = orientacao === "vertical" ? "ArrowRight" : "ArrowDown";
    if (e.key === menos) setPos((p) => Math.max(0, p - passo));
    else if (e.key === mais) setPos((p) => Math.min(100, p + passo));
    else if (e.key === "Home") setPos(0);
    else if (e.key === "End") setPos(100);
    else return;
    e.preventDefault();
  }

  const vertical = orientacao === "vertical";
  // B fica por cima, recortado: aparece do corte pra frente. A ocupa o resto.
  const clipB = vertical ? `inset(0 0 0 ${pos}%)` : `inset(${pos}% 0 0 0)`;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-center gap-2 text-xs">
        <span className="font-medium text-destructive">{rotuloA}</span>
        <span className="text-muted-foreground">{vertical ? "à esquerda" : "acima"} ·</span>
        <span className="font-medium text-blue-600">{rotuloB}</span>
        <span className="text-muted-foreground">{vertical ? "à direita" : "abaixo"}</span>
        <div className="mx-1 h-4 w-px bg-border" />
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1 px-2 text-xs"
          onClick={() => setOrientacao((o) => (o === "vertical" ? "horizontal" : "vertical"))}
          title="Alternar entre corte vertical e horizontal"
        >
          {vertical ? <MoveHorizontal className="size-3.5" /> : <MoveVertical className="size-3.5" />}
          Corte {vertical ? "vertical" : "horizontal"}
        </Button>
        <span className="tabular-nums text-muted-foreground">{Math.round(pos)}%</span>
      </div>

      {carregando && (
        <p className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Renderizando as duas revisões…
        </p>
      )}

      <div
        ref={caixaRef}
        className={cn("relative mx-auto shadow-sm select-none", arrastando && "cursor-grabbing")}
        style={{ width: dim?.w, height: dim?.h, touchAction: "none" }}
        onPointerDown={(e) => {
          // Clicar em qualquer ponto joga a barra pra lá e já engata o arrasto — evita ter que
          // acertar a linha de 2px antes de poder mover.
          if (e.button !== 0) return;
          setArrastando(true);
          mover(e.clientX, e.clientY);
        }}
      >
        <canvas ref={refA} className="absolute inset-0 block bg-white" />
        <canvas ref={refB} className="absolute inset-0 block bg-white" style={{ clipPath: clipB }} />

        {/* Barra + alça. `pointer-events-none` na linha para não brigar com o clique do container. */}
        <div
          className="pointer-events-none absolute bg-primary"
          style={
            vertical
              ? { left: `${pos}%`, top: 0, bottom: 0, width: 2, transform: "translateX(-1px)" }
              : { top: `${pos}%`, left: 0, right: 0, height: 2, transform: "translateY(-1px)" }
          }
        />
        <div
          role="separator"
          aria-orientation={vertical ? "vertical" : "horizontal"}
          aria-label={`Divisor entre ${rotuloA} e ${rotuloB}`}
          aria-valuenow={Math.round(pos)}
          aria-valuemin={0}
          aria-valuemax={100}
          tabIndex={0}
          onKeyDown={aoTeclar}
          className={cn(
            "absolute flex items-center justify-center rounded-full border-2 border-primary bg-background shadow",
            "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
            vertical ? "cursor-ew-resize" : "cursor-ns-resize",
          )}
          style={
            vertical
              ? { left: `${pos}%`, top: "50%", width: 26, height: 26, transform: "translate(-50%, -50%)" }
              : { top: `${pos}%`, left: "50%", width: 26, height: 26, transform: "translate(-50%, -50%)" }
          }
        >
          {vertical ? (
            <MoveHorizontal className="size-3.5 text-primary" />
          ) : (
            <MoveVertical className="size-3.5 text-primary" />
          )}
        </div>
      </div>
      <p className="mt-2 text-center text-[11px] text-muted-foreground">
        Arraste a alça (ou clique na imagem) para varrer. Com a alça em foco: setas movem, Shift+seta
        move mais rápido, Home/End vão às pontas.
      </p>
    </div>
  );
}
