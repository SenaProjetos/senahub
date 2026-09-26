"use client";

import { useLayoutEffect, useRef, useState } from "react";

/**
 * Altura que sobra na janela abaixo do elemento, para quadros que devem caber na tela em vez de
 * fazer a página inteira rolar (plano 2026-09-25, lote 6). Medida, e não um `calc(100vh - Npx)`:
 * o que vem acima (cabeçalho do projeto, avisos, barra do módulo) varia por tela e por perfil —
 * o `100vh - 160px` da Compatibilização errava por ~140 px justamente por isso.
 *
 * `aPartirDe`: media query em que a altura vale; fora dela a página rola normalmente (celular).
 * Reajusta ao redimensionar a janela e quando algo dispara `resize` (o modo foco faz isso).
 */
export function useAlturaRestante<T extends HTMLElement>({
  minimo = 352,
  folga = 16,
  aPartirDe = "(min-width: 48rem)",
}: { minimo?: number; folga?: number; aPartirDe?: string } = {}) {
  const ref = useRef<T>(null);
  const [altura, setAltura] = useState<number | undefined>(undefined);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () => {
      if (!window.matchMedia(aPartirDe).matches) return setAltura(undefined);
      const topo = el.getBoundingClientRect().top + window.scrollY;
      setAltura(Math.max(minimo, Math.round(window.innerHeight - topo - folga)));
    };
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, [minimo, folga, aPartirDe]);

  return { ref, style: altura ? ({ height: `${altura}px` } as const) : undefined };
}
