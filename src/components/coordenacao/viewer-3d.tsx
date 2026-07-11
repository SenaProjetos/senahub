"use client";

import { useEffect, useRef } from "react";
import { ViewerEngine, type SelecaoInfo } from "@/modules/coordenacao/viewer/engine";

/**
 * Wrapper React do ViewerEngine (three + fragments). SEMPRE importado via
 * next/dynamic com ssr:false — este módulo puxa todo o stack 3D.
 * Clique vs. órbita: só dispara seleção se o ponteiro moveu < 5px.
 */
export default function Viewer3D({
  onReady,
  onSelecionar,
}: {
  onReady: (engine: ViewerEngine) => void;
  onSelecionar: (info: SelecaoInfo | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<ViewerEngine | null>(null);
  const callbacksRef = useRef({ onReady, onSelecionar });
  callbacksRef.current = { onReady, onSelecionar };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const engine = new ViewerEngine(container, {
      onSelecionar: (info) => callbacksRef.current.onSelecionar(info),
    });
    engineRef.current = engine;
    callbacksRef.current.onReady(engine);

    let inicio: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => {
      if (e.button === 0) inicio = { x: e.clientX, y: e.clientY };
    };
    const onUp = (e: PointerEvent) => {
      if (e.button !== 0 || !inicio) return;
      const moveu = Math.hypot(e.clientX - inicio.x, e.clientY - inicio.y);
      inicio = null;
      if (moveu < 5) void engine.selecionarEm(e.clientX, e.clientY, e.shiftKey);
    };
    container.addEventListener("pointerdown", onDown);
    container.addEventListener("pointerup", onUp);

    return () => {
      container.removeEventListener("pointerdown", onDown);
      container.removeEventListener("pointerup", onUp);
      engineRef.current = null;
      void engine.dispose();
    };
  }, []);

  return <div ref={containerRef} className="size-full" />;
}
