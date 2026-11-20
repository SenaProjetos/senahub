"use client";

import { useRef, useState } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Raio útil do controle (px): o pino anda até aqui; mais longe conta como curso cheio. */
const RAIO_PX = 44;

/**
 * Controle de direção na tela (toque) do modo andar: arrastar o pino para cima anda para a frente, para os lados anda
 * de lado; o quanto se afasta do centro é a velocidade. Solto, para. Devolve x para a direita e y para baixo, em −1…1.
 */
export function ControleAndar({ onMudar }: { onMudar: (v: { x: number; y: number } | null) => void }) {
  const baseRef = useRef<HTMLDivElement>(null);
  const ponteiroRef = useRef<number | null>(null);
  const [pino, setPino] = useState({ x: 0, y: 0 });

  const mover = (clientX: number, clientY: number) => {
    const base = baseRef.current;
    if (!base) return;
    const r = base.getBoundingClientRect();
    let dx = clientX - (r.left + r.width / 2);
    let dy = clientY - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy);
    if (d > RAIO_PX) {
      dx = (dx / d) * RAIO_PX;
      dy = (dy / d) * RAIO_PX;
    }
    setPino({ x: dx, y: dy });
    onMudar({ x: dx / RAIO_PX, y: dy / RAIO_PX });
  };
  const soltar = () => {
    ponteiroRef.current = null;
    setPino({ x: 0, y: 0 });
    onMudar(null);
  };

  return (
    <div
      ref={baseRef}
      role="application"
      aria-label="Controle de direção: arraste para andar"
      className="relative size-28 shrink-0 touch-none select-none rounded-full border bg-background/70 shadow-sm backdrop-blur"
      onPointerDown={(e) => {
        if (ponteiroRef.current !== null) return;
        ponteiroRef.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        mover(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (ponteiroRef.current === e.pointerId) mover(e.clientX, e.clientY);
      }}
      onPointerUp={(e) => {
        if (ponteiroRef.current === e.pointerId) soltar();
      }}
      onPointerCancel={(e) => {
        if (ponteiroRef.current === e.pointerId) soltar();
      }}
    >
      <span
        aria-hidden
        className="absolute left-1/2 top-1/2 size-12 rounded-full bg-primary/80 shadow"
        style={{ transform: `translate(calc(-50% + ${pino.x}px), calc(-50% + ${pino.y}px))` }}
      />
    </div>
  );
}

/**
 * Camada do modo andar sobre o visualizador (portal e Coordenação): ajuda curta das teclas e "Sair do modo andar" no
 * canto inferior esquerdo; no toque (`pointer: coarse`) a ajuda vira uma frase e o controle de direção aparece embaixo.
 * Quem posiciona é o pai (o quadro do visualizador é `relative`).
 */
export function CamadaAndar({
  onSair,
  onJoystick,
}: {
  onSair: () => void;
  onJoystick: (v: { x: number; y: number } | null) => void;
}) {
  return (
    // Deixa o canto direito livre para o indicador de eixos (96 px).
    <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex max-w-[calc(100%-8rem)] flex-col items-start gap-2">
      <div className="pointer-events-auto flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border bg-background/90 px-3 py-2 text-xs shadow-sm backdrop-blur">
        {/* Só a ajuda é anunciada ao entrar; o botão Sair fica fora da região de status. */}
        <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <p className="font-medium">Modo andar</p>
          <p className="text-muted-foreground pointer-coarse:hidden">
            <kbd className="font-sans font-medium text-foreground">W A S D</kbd> ou setas: andar ·{" "}
            <kbd className="font-sans font-medium text-foreground">Q</kbd>/<kbd className="font-sans font-medium text-foreground">E</kbd>:
            subir e descer · <kbd className="font-sans font-medium text-foreground">Shift</kbd>: correr · arrastar: olhar ·{" "}
            <kbd className="font-sans font-medium text-foreground">Esc</kbd>: sair
          </p>
          <p className="hidden text-muted-foreground pointer-coarse:block">Use o controle para andar e arraste a tela para olhar.</p>
        </div>
        <Button size="sm" variant="secondary" onClick={onSair}>
          <LogOut className="size-4" /> Sair do modo andar
        </Button>
      </div>
      <div className="pointer-events-auto hidden pointer-coarse:block">
        <ControleAndar onMudar={onJoystick} />
      </div>
    </div>
  );
}
