"use client";

import { useSyncExternalStore } from "react";

/** Mesmo corte do `sm:` do Tailwind: abaixo disso a tela é de celular. */
const CONSULTA = "(min-width: 640px)";

function assinar(aoMudar: () => void) {
  const m = window.matchMedia(CONSULTA);
  m.addEventListener("change", aoMudar);
  return () => m.removeEventListener("change", aoMudar);
}

/**
 * `true` a partir de 640 px (o `sm:` do Tailwind). Para o que NÃO dá para resolver só com CSS — montar
 * um painel numa gaveta em vez de num card, por exemplo. No servidor responde `true` (computador); só use
 * em algo que aparece depois de uma ação da pessoa, para a troca nunca piscar na primeira pintura.
 */
export function useTelaLarga(): boolean {
  return useSyncExternalStore(
    assinar,
    () => window.matchMedia(CONSULTA).matches,
    () => true,
  );
}
