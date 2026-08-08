"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

type Opts = {
  zoom: number;
  setZoom: (fn: (z: number) => number) => void;
  min: number;
  max: number;
};

/**
 * Zoom por pinça de 2 dedos (item 34, parte touch — pan por 1 dedo já funcionava via
 * Pointer Events antes desta feature; o zoom só tinha Ctrl+scroll, sem equivalente em
 * tablet/celular). Listeners nativos (não handlers React) no container, porque precisa
 * rastrear pointers "soltos" fora do elemento que recebeu o `pointerdown` inicial — comum
 * quando o segundo dedo toca fora da área exata do primeiro evento.
 *
 * Só reage a `pointerType === "touch"`: mouse/caneta já têm Ctrl+scroll; um pen digitalizador
 * disparando isto por engano seria pior que não ter a feature.
 */
export function usePinchZoom(containerRef: RefObject<HTMLElement | null>, opts: Opts) {
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const distanciaInicial = useRef<number | null>(null);
  const zoomInicial = useRef(1);
  const [pinching, setPinching] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function distanciaAtual(): number | null {
      const pts = [...pointers.current.values()];
      if (pts.length < 2) return null;
      return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    }

    function onDown(e: PointerEvent) {
      if (e.pointerType !== "touch") return;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.current.size === 2) {
        distanciaInicial.current = distanciaAtual();
        zoomInicial.current = optsRef.current.zoom;
        setPinching(true);
      }
    }
    function onMove(e: PointerEvent) {
      if (!pointers.current.has(e.pointerId)) return;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.current.size !== 2 || !distanciaInicial.current) return;
      e.preventDefault();
      const d = distanciaAtual();
      if (!d) return;
      const { min, max, setZoom } = optsRef.current;
      const fator = d / distanciaInicial.current;
      const novo = Math.min(max, Math.max(min, +(zoomInicial.current * fator).toFixed(2)));
      setZoom(() => novo);
    }
    function onFim(e: PointerEvent) {
      pointers.current.delete(e.pointerId);
      if (pointers.current.size < 2) {
        distanciaInicial.current = null;
        setPinching(false);
      }
    }

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove, { passive: false });
    el.addEventListener("pointerup", onFim);
    el.addEventListener("pointercancel", onFim);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onFim);
      el.removeEventListener("pointercancel", onFim);
    };
  }, [containerRef]);

  return { pinching };
}
