"use client";

import { useEffect } from "react";

/**
 * Abre uma janela quando alguém dispara `evento` na `window`. Serve para itens de um ⋯ abrirem
 * janelas que moram fora do menu (dentro dele, a janela desmontaria junto com o menu ao fechar).
 * `evento` indefinido desliga a escuta.
 */
export function useAbrirPorEvento(evento: string | undefined, abrir: () => void) {
  useEffect(() => {
    if (!evento) return;
    window.addEventListener(evento, abrir);
    return () => window.removeEventListener(evento, abrir);
  }, [evento, abrir]);
}
