"use client";

import { useEffect, useRef } from "react";
import { ViewerEngine, type SelecaoInfo } from "@/modules/coordenacao/viewer/engine";
import { atalhoDeVistaPermitido } from "@/modules/coordenacao/viewer/vistas";

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
      if (moveu >= 5) return;
      // Clique numa letra do indicador de eixos leva à vista daquele lado.
      const vistaEixo = engine.vistaNoIndicador(e.clientX, e.clientY);
      if (vistaEixo) {
        void engine.irParaVista(vistaEixo);
        return;
      }
      // "Mover por pontos" do realinhamento e medição: o clique marca um ponto em vez
      // de selecionar um elemento.
      if (engine.pegandoPontoRealinhamento) void engine.registrarPontoRealinhamento(e.clientX, e.clientY);
      else if (engine.medindo) void engine.registrarPontoMedicao(e.clientX, e.clientY);
      else void engine.selecionarEm(e.clientX, e.clientY, e.shiftKey);
    };
    const onMove = (e: PointerEvent) => {
      // Indicador visual de snap (vértice/aresta) — só custa o raycast em modo medição;
      // durante o arraste de realinhamento o próprio engine já cuida disso.
      if (engine.medindo) void engine.atualizarSnapHover(e.clientX, e.clientY);
    };
    const onLeave = () => engine.ocultarSnapHover();
    // Teclas 1–7: vistas padrão. Fora de campos de digitação e sem modificador.
    const onKey = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      const vista = atalhoDeVistaPermitido({
        key: e.key,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        altKey: e.altKey,
        alvoEditavel:
          !!alvo && (alvo.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName) || !!alvo.closest("[role=dialog]")),
      });
      if (!vista) return;
      e.preventDefault();
      void engine.irParaVista(vista);
    };
    window.addEventListener("keydown", onKey);
    container.addEventListener("pointerdown", onDown);
    container.addEventListener("pointerup", onUp);
    container.addEventListener("pointermove", onMove);
    container.addEventListener("pointerleave", onLeave);

    return () => {
      container.removeEventListener("pointerdown", onDown);
      container.removeEventListener("pointerup", onUp);
      container.removeEventListener("pointermove", onMove);
      container.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("keydown", onKey);
      engineRef.current = null;
      void engine.dispose();
    };
  }, []);

  return <div ref={containerRef} className="size-full" />;
}
