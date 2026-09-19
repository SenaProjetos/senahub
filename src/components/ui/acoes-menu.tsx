"use client";

import { MoreHorizontal } from "lucide-react";

import type { AcaoItem, AcaoItemAcao } from "@/components/ui/acoes";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLinkItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * Renderizador único de `AcaoItem[]`. Serve tanto ao menu de contexto quanto ao `...`, que é
 * como a paridade da ADR-0002 fica garantida: as duas superfícies leem a mesma lista.
 */
export function AcoesMenuItens({
  itens,
  onSelect,
}: {
  itens: readonly AcaoItem[];
  onSelect: (item: AcaoItemAcao) => void;
}) {
  return (
    <>
      {itens.map((item) => {
        if (item.tipo === "separador") return <DropdownMenuSeparator key={item.id} />;

        if (item.tipo === "link") {
          const Icone = item.icone;
          return (
            <DropdownMenuLinkItem
              key={item.id}
              href={item.href}
              target={item.novaAba ? "_blank" : undefined}
              rel={item.novaAba ? "noopener noreferrer" : undefined}
            >
              {Icone ? <Icone aria-hidden /> : null}
              {item.rotulo}
            </DropdownMenuLinkItem>
          );
        }

        if (item.tipo === "sub") {
          const Icone = item.icone;
          return (
            <DropdownMenuSub key={item.id}>
              <DropdownMenuSubTrigger>
                {Icone ? <Icone aria-hidden /> : null}
                {item.rotulo}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <AcoesMenuItens itens={item.itens} onSelect={onSelect} />
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          );
        }

        const Icone = item.icone;
        if (item.desabilitado) {
          // O motivo vai como texto, não como `title`: item desabilitado tem
          // `pointer-events-none` e nunca receberia o hover da dica nativa.
          // Sem o `opacity-50` padrão: ele cobriria também o motivo e o deixaria abaixo do
          // contraste AA. O item continua inerte; quem sinaliza isso é o cinza do token.
          return (
            <DropdownMenuItem
              key={item.id}
              disabled
              className="max-w-72 items-start text-muted-foreground data-disabled:opacity-100"
            >
              {Icone ? <Icone aria-hidden className="mt-0.5" /> : null}
              <span className="flex min-w-0 flex-col">
                <span>{item.rotulo}</span>
                <span className="text-xs leading-tight text-pretty">{item.desabilitado}</span>
              </span>
            </DropdownMenuItem>
          );
        }

        return (
          <DropdownMenuItem key={item.id} variant={item.variant} onClick={() => onSelect(item)}>
            {Icone ? <Icone aria-hidden /> : null}
            {item.rotulo}
          </DropdownMenuItem>
        );
      })}
    </>
  );
}

/**
 * O `...` da entidade — o caminho acessível das mesmas ações (regra 2 da ADR-0002: o menu de
 * contexto do base-ui não abre por teclado).
 *
 * Em lista/quadro o botão costuma aparecer só no hover: esconda com **opacidade**
 * (`opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100`),
 * nunca com `hidden`/`display:none` — botão escondido assim não recebe Tab, o foco nunca entra,
 * o `focus-within` nunca dispara e a paridade morre em silêncio.
 */
export function BotaoAcoes({
  itens,
  onSelect,
  rotulo,
  className,
}: {
  itens: readonly AcaoItem[];
  onSelect: (item: AcaoItemAcao) => void;
  /** Nome acessível do botão, com a entidade: "Ações da tarefa Revisar fundação". */
  rotulo: string;
  className?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={rotulo}
            className={cn("size-6 shrink-0 text-muted-foreground data-[popup-open]:opacity-100", className)}
          />
        }
      >
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto min-w-48">
        <AcoesMenuItens itens={itens} onSelect={onSelect} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
