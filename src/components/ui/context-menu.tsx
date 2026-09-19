"use client"

import { ContextMenu as ContextMenuPrimitive } from "@base-ui/react/context-menu"

import { MENU_POPUP_CLASSES } from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

/**
 * Menu de contexto próprio (botão direito / toque longo de 500 ms) — regras na ADR-0002.
 *
 * **Este é o único lugar de `src/` onde o menu nativo do navegador é suprimido.** Quem faz a
 * supressão é o `Trigger` do base-ui, que chama `preventDefault()` + `stopPropagation()` no
 * evento `contextmenu` (por isso um Trigger aninhado não dispara o do pai). Nenhum outro arquivo
 * escreve `onContextMenu` à mão — há teste-guarda varrendo `src/`.
 *
 * Use **só onde há uma entidade sob o cursor** (card de tarefa, linha de documento) e o menu
 * **repõe** o que o nativo dava ali (abrir em nova aba, copiar link, copiar texto). Espaço vazio,
 * cabeçalho e texto corrido mantêm o menu nativo.
 *
 * As peças do popup são as mesmas do `Menu`, então `DropdownMenuItem`, `DropdownMenuLinkItem`,
 * `DropdownMenuSub*` e `DropdownMenuSeparator` funcionam aqui sem alteração — não duplicar.
 * O menu de contexto **não abre por teclado**: toda ação daqui precisa existir também num `...`
 * (regra 2 da ADR-0002).
 */
function ContextMenu({ ...props }: ContextMenuPrimitive.Root.Props) {
  return <ContextMenuPrimitive.Root {...props} />
}

/**
 * A área que responde ao botão direito. Renderiza um `<div>`; use `render` para virar outro
 * elemento (`render={<TableRow />}`, `render={<li />}`).
 *
 * O `select-none` fica só em ponteiro grosso: no desktop a seleção de texto continua livre, no
 * toque ele evita que o toque longo comece a selecionar o texto do card.
 */
function ContextMenuTrigger({ className, ...props }: ContextMenuPrimitive.Trigger.Props) {
  return (
    <ContextMenuPrimitive.Trigger
      data-slot="context-menu-trigger"
      className={cn("pointer-coarse:select-none", className)}
      {...props}
    />
  )
}

/**
 * Popup ancorado no ponto do cursor. A âncora tem largura 0, então a largura é do conteúdo
 * (`w-auto`) — diferente do `DropdownMenuContent`, que acompanha a largura do gatilho.
 */
function ContextMenuContent({
  align = "start",
  alignOffset = 0,
  side = "bottom",
  sideOffset = 2,
  className,
  ...props
}: ContextMenuPrimitive.Popup.Props &
  Pick<
    ContextMenuPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  >) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Positioner
        className="isolate z-50 outline-none"
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
      >
        <ContextMenuPrimitive.Popup
          data-slot="context-menu-content"
          className={cn(MENU_POPUP_CLASSES, "w-auto min-w-48", className)}
          {...props}
        />
      </ContextMenuPrimitive.Positioner>
    </ContextMenuPrimitive.Portal>
  )
}

export { ContextMenu, ContextMenuTrigger, ContextMenuContent }
