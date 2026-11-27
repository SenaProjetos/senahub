"use client";

import { useCallback, useSyncExternalStore } from "react";

/** Mesmo corte do `sm:` do Tailwind: abaixo disso a tela é de celular. */
const CONSULTA = "(min-width: 640px)";

/**
 * `true` a partir de 640 px (o `sm:` do Tailwind). Para o que NÃO dá para resolver só com CSS — montar
 * um painel numa gaveta em vez de num card, por exemplo. No servidor responde `true` (computador); só use
 * em algo que aparece depois de uma ação da pessoa, para a troca nunca piscar na primeira pintura.
 */
export function useTelaLarga(): boolean {
  return useTelaAPartirDe(CONSULTA);
}

/**
 * `true` quando a consulta de mídia (`(min-width: …)`) vale. Mesma regra do `useTelaLarga`: no servidor responde
 * `true`, então só para o que aparece depois de uma ação da pessoa (um item de menu, por exemplo).
 */
export function useTelaAPartirDe(consulta: string): boolean {
  const assinar = useCallback(
    (aoMudar: () => void) => {
      const m = window.matchMedia(consulta);
      m.addEventListener("change", aoMudar);
      return () => m.removeEventListener("change", aoMudar);
    },
    [consulta],
  );
  return useSyncExternalStore(
    assinar,
    () => window.matchMedia(consulta).matches,
    () => true,
  );
}
