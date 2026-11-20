"use client";

import { useEffect, useRef } from "react";
import { ViewerEngine, type SelecaoInfo } from "@/modules/coordenacao/viewer/engine";
import { atalhoDeVistaPermitido } from "@/modules/coordenacao/viewer/vistas";
import { comandoDeHistorico } from "@/modules/coordenacao/historico-realinhamento";
import { TECLAS_DO_ANDAR } from "@/modules/coordenacao/viewer/andar";

/**
 * Wrapper React do ViewerEngine (three + fragments). SEMPRE importado via
 * next/dynamic com ssr:false — este módulo puxa todo o stack 3D.
 * Clique vs. órbita: só dispara seleção se o ponteiro moveu < 5px (vale também no modo andar, onde arrastar gira o olhar).
 */
export default function Viewer3D({
  onReady,
  onSelecionar,
  onAndar,
}: {
  onReady: (engine: ViewerEngine) => void;
  onSelecionar: (info: SelecaoInfo | null) => void;
  /** Entrou/saiu do modo andar (inclusive pelo Esc ou quando o motor sai sozinho). */
  onAndar?: (andando: boolean) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<ViewerEngine | null>(null);
  const callbacksRef = useRef({ onReady, onSelecionar, onAndar });
  callbacksRef.current = { onReady, onSelecionar, onAndar };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const engine = new ViewerEngine(container, {
      onSelecionar: (info) => callbacksRef.current.onSelecionar(info),
      onAndar: (andando) => callbacksRef.current.onAndar?.(andando),
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
    // Teclado do visualizador, sempre fora de campos de digitação: no modo andar, W/A/S/D,
    // setas, Q/E, PageUp/PageDown e Shift andam e Esc sai (essas teclas são do andar enquanto
    // ele está ativo); no realinhamento, Ctrl+Z/Ctrl+Shift+Z desfazem/refazem e setas,
    // PageUp/PageDown e Q/E movem a prévia; teclas 1–7 vão para as vistas padrão.
    const teclasAndar = new Set<string>();
    const soltarTeclasAndar = () => {
      if (teclasAndar.size === 0) return;
      teclasAndar.clear();
      engine.definirTeclasAndar(teclasAndar);
    };
    const onKey = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      const alvoEditavel =
        !!alvo && (alvo.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName) || !!alvo.closest("[role=dialog]"));
      if (!engine.andando) teclasAndar.clear();
      else if (!alvoEditavel && !e.defaultPrevented && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.key === "Escape") {
          e.preventDefault();
          soltarTeclasAndar();
          void engine.sairAndar();
          return;
        }
        if (TECLAS_DO_ANDAR.has(e.code)) {
          e.preventDefault();
          teclasAndar.add(e.code);
          engine.definirTeclasAndar(teclasAndar);
          return;
        }
      }
      if (engine.realinhamentoAtivo && !alvoEditavel) {
        const comando = comandoDeHistorico(e);
        if (comando) {
          e.preventDefault();
          engine.desfazerRealinhamento(comando);
          return;
        }
        if (engine.moverRealinhamentoPeloTeclado(e)) {
          e.preventDefault();
          return;
        }
      }
      const vista = atalhoDeVistaPermitido({
        key: e.key,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        altKey: e.altKey,
        alvoEditavel,
      });
      if (!vista) return;
      e.preventDefault();
      void engine.irParaVista(vista);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (teclasAndar.delete(e.code)) engine.definirTeclasAndar(teclasAndar);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    // Janela sem foco não recebe o keyup: solta tudo para o andar não seguir sozinho.
    window.addEventListener("blur", soltarTeclasAndar);
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
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", soltarTeclasAndar);
      engineRef.current = null;
      void engine.dispose();
    };
  }, []);

  return <div ref={containerRef} className="size-full" />;
}
