"use client";

import type { ReactElement, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Botão só com ícone da barra do visualizador de pranchas. O nome e a função aparecem na dica
 * (hover/foco): rótulo em destaque, a tecla de atalho e uma frase do que faz. O `aria-label` é o
 * rótulo — o leitor de tela não depende da dica.
 *
 * `ativo` = ferramenta em uso (vira `aria-pressed`); `render` troca o `<button>` por um link.
 */
export function BotaoFerramenta({
  rotulo,
  dica,
  atalho,
  ativo,
  destaque,
  onClick,
  disabled,
  render,
  className,
  children,
}: {
  rotulo: string;
  dica?: string;
  atalho?: string;
  ativo?: boolean;
  /** Ação principal da barra (ex.: Enviar) — cor cheia mesmo sem estar "ativa". */
  destaque?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  render?: ReactElement;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            size="icon-sm"
            variant={ativo || destaque ? "default" : "ghost"}
            className={cn("relative shrink-0", className)}
            onClick={onClick}
            disabled={disabled}
            aria-label={rotulo}
            aria-pressed={ativo}
            render={render}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-64 flex-col items-start gap-0.5">
        <span className="flex w-full items-center gap-2 font-semibold">
          {rotulo}
          {atalho && (
            <kbd className="ml-auto rounded-sm border border-background/30 px-1 font-mono text-[10px] font-normal">{atalho}</kbd>
          )}
        </span>
        {dica && <span className="text-pretty text-background/80">{dica}</span>}
      </TooltipContent>
    </Tooltip>
  );
}

/** Divisória vertical entre grupos da barra. No celular a barra quebra em várias linhas e a
 *  divisória sobrava solta no fim de uma delas — lá, some. */
export function SeparadorBarra() {
  return <span aria-hidden className="mx-0.5 hidden h-5 w-px shrink-0 bg-border sm:block" />;
}
