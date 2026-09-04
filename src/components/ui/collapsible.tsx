"use client"

import * as React from "react"
import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible"
import { ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"

function Collapsible({ ...props }: CollapsiblePrimitive.Root.Props) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />
}

function CollapsibleTrigger({
  className,
  ...props
}: CollapsiblePrimitive.Trigger.Props) {
  return (
    <CollapsiblePrimitive.Trigger
      data-slot="collapsible-trigger"
      className={cn(
        "flex w-full items-center gap-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
      {...props}
    />
  )
}

function CollapsiblePanel({
  className,
  children,
  ...props
}: CollapsiblePrimitive.Panel.Props) {
  return (
    <CollapsiblePrimitive.Panel
      data-slot="collapsible-panel"
      className={cn(
        // A altura vem do base-ui em `--collapsible-panel-height`; os estados de entrada/saída
        // zeram para animar. `overflow-hidden` é o que impede o conteúdo vazar durante a animação.
        "h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-150 ease-out data-ending-style:h-0 data-starting-style:h-0",
        className
      )}
      {...props}
    >
      {children}
    </CollapsiblePrimitive.Panel>
  )
}

/**
 * Seção dobrável com cabeçalho clicável — o formato usado nos formulários longos, pra tela caber
 * no celular sem virar um rolo único. `resumo` aparece à direita do título e serve pra denunciar
 * estado não-padrão de dentro da seção fechada (ex.: "superusuário ligado"), que senão só
 * apareceria depois de abrir.
 */
function CollapsibleSection({
  titulo,
  descricao,
  resumo,
  defaultOpen = false,
  className,
  children,
}: {
  titulo: string
  descricao?: string
  resumo?: React.ReactNode
  defaultOpen?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <Collapsible
      defaultOpen={defaultOpen}
      className={cn("rounded-sm border", className)}
    >
      <CollapsibleTrigger className="group/sec rounded-sm p-3 hover:bg-muted/50">
        <ChevronDown
          aria-hidden
          className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-data-[panel-open]/sec:rotate-180"
        />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{titulo}</span>
          {descricao && (
            <span className="block text-xs text-muted-foreground">{descricao}</span>
          )}
        </span>
        {resumo && <span className="shrink-0">{resumo}</span>}
      </CollapsibleTrigger>
      <CollapsiblePanel>
        <div className="space-y-3 border-t p-3">{children}</div>
      </CollapsiblePanel>
    </Collapsible>
  )
}

export {
  Collapsible,
  CollapsiblePanel,
  CollapsibleSection,
  CollapsibleTrigger,
}
