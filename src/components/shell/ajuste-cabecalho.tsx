"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * Tira o `CabecalhoPagina` da barra do topo quando ele não cabe nela — botões demais, ou título
 * longo com o menu aberto. Mede no desenho fundido, antes da pintura, e marca `data-apertado`; a
 * regra em globals.css devolve o cabeçalho para uma linha própria, como abaixo de `xl`.
 * Descrição cortada com reticências ganha o texto inteiro como dica ao passar o mouse.
 */
export function AjusteCabecalho() {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const cab = ref.current?.parentElement;
    if (!cab) return;
    const xl = window.matchMedia("(min-width: 80rem)");
    const medir = () => {
      cab.removeAttribute("data-apertado");
      if (xl.matches && (cab.scrollHeight > cab.clientHeight + 1 || cab.scrollWidth > cab.clientWidth + 1)) {
        cab.setAttribute("data-apertado", "");
      }
      const desc = cab.querySelector<HTMLElement>("h1 + p");
      if (!desc) return;
      if (desc.scrollWidth > desc.clientWidth + 1) desc.title = (desc.textContent ?? "").replace(/^·\s*/, "").trim();
      else desc.removeAttribute("title");
    };
    medir();
    // O `main` muda de largura quando o menu abre ou fecha; o próprio cabeçalho, quando um botão
    // aparece depois de carregar os dados. Ao fim de `medir` o tamanho é o mesmo da entrada, então
    // o observador não entra em laço.
    const ro = new ResizeObserver(medir);
    ro.observe(cab);
    if (cab.parentElement) ro.observe(cab.parentElement);
    xl.addEventListener("change", medir);
    return () => {
      ro.disconnect();
      xl.removeEventListener("change", medir);
    };
  }, []);
  return <span ref={ref} hidden />;
}
