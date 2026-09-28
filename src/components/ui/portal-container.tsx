"use client"

import { createContext, useContext, type ReactNode } from "react"

/**
 * Onde as camadas flutuantes (janela, menu, lista do `Select`, popover, dica) se penduram.
 * Padrão = `document.body`. Existe por causa da **tela cheia** (Fullscreen API): só o elemento em
 * tela cheia e seus descendentes aparecem, e uma janela pendurada no `body` abre invisível atrás
 * dele — foi o que acontecia no visualizador de pranchas ao criar apontamento em tela cheia.
 *
 * Quem entra em tela cheia envolve o conteúdo com `PortalContainerProvider container={elemento}`
 * enquanto estiver nela; fora dela, `null` devolve o padrão.
 */
const PortalContainerContext = createContext<HTMLElement | null>(null)

function PortalContainerProvider({ container, children }: { container: HTMLElement | null; children: ReactNode }) {
  return <PortalContainerContext.Provider value={container}>{children}</PortalContainerContext.Provider>
}

/** Contêiner para o `container` do `Portal` do base-ui; `undefined` = o `body` de sempre. */
function usePortalContainer(): HTMLElement | undefined {
  return useContext(PortalContainerContext) ?? undefined
}

export { PortalContainerProvider, usePortalContainer }
