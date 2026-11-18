"use client";

import { useRef } from "react";
import { MoveHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  /** 0..1 da largura do palco. */
  corte: number;
  onCorte: (corte: number) => void;
  rotuloEsquerda: string;
  rotuloDireita: string;
};

/**
 * Divisória da Cortina, por cima do palco (mesma interação de `cortina-revisoes.tsx`): arrastar a alça,
 * ou setas com ela em foco (Shift = passo maior, Home/End = pontas). Só a alça e a faixa da linha pegam o
 * ponteiro — o resto do palco continua com zoom e pan.
 */
export function CortinaDivisor({ corte, onCorte, rotuloEsquerda, rotuloDireita }: Props) {
  const caixaRef = useRef<HTMLDivElement>(null);
  const pct = Math.round(corte * 100);

  function mover(clientX: number) {
    const r = caixaRef.current?.getBoundingClientRect();
    if (!r || r.width <= 0) return;
    onCorte(Math.min(1, Math.max(0, (clientX - r.left) / r.width)));
  }

  function aoDescer(ev: React.PointerEvent<HTMLElement>) {
    if (ev.pointerType === "mouse" && ev.button !== 0) return;
    ev.preventDefault();
    ev.currentTarget.setPointerCapture(ev.pointerId);
    mover(ev.clientX);
  }

  function aoMover(ev: React.PointerEvent<HTMLElement>) {
    if (ev.currentTarget.hasPointerCapture(ev.pointerId)) mover(ev.clientX);
  }

  function aoTeclar(ev: React.KeyboardEvent) {
    const passo = ev.shiftKey ? 0.1 : 0.02;
    if (ev.key === "ArrowLeft") onCorte(Math.max(0, corte - passo));
    else if (ev.key === "ArrowRight") onCorte(Math.min(1, corte + passo));
    else if (ev.key === "Home") onCorte(0);
    else if (ev.key === "End") onCorte(1);
    else return;
    ev.preventDefault();
  }

  return (
    <div ref={caixaRef} className="pointer-events-none absolute inset-0">
      <span className="absolute top-2 left-2 max-w-[45%] truncate rounded bg-background/90 px-1.5 py-0.5 text-xs font-medium shadow-sm">
        {rotuloEsquerda}
      </span>
      <span className="absolute top-2 right-2 max-w-[45%] truncate rounded bg-background/90 px-1.5 py-0.5 text-xs font-medium shadow-sm">
        {rotuloDireita}
      </span>
      {/* Faixa larga e invisível em volta da linha: arrastar sem precisar acertar os 2 px. */}
      <div
        className="pointer-events-auto absolute top-0 bottom-0 w-3 -translate-x-1/2 cursor-ew-resize touch-none"
        style={{ left: `${corte * 100}%` }}
        onPointerDown={aoDescer}
        onPointerMove={aoMover}
        aria-hidden
      >
        <div className="mx-auto h-full w-0.5 bg-primary" />
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={`Divisor entre ${rotuloEsquerda} e ${rotuloDireita}`}
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        tabIndex={0}
        onKeyDown={aoTeclar}
        onPointerDown={aoDescer}
        onPointerMove={aoMover}
        className={cn(
          "pointer-events-auto absolute top-1/2 flex size-7 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize touch-none items-center justify-center",
          "rounded-full border-2 border-primary bg-background shadow focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        )}
        style={{ left: `${corte * 100}%` }}
      >
        <MoveHorizontal className="size-3.5 text-primary" />
      </div>
    </div>
  );
}
