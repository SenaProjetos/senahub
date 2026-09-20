"use client";

import { cloneElement, type ReactElement, type ReactNode } from "react";

import type { AcaoItem, AcaoItemAcao } from "@/components/ui/acoes";
import { AcoesMenuItens } from "@/components/ui/acoes-menu";
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "@/components/ui/context-menu";

/**
 * Linha de lista que abre o menu de contexto (botão direito / toque longo) — o invólucro que cada
 * tela repetiria: `ContextMenu` + `Trigger` + conteúdo, ligado ao mesmo `AcaoItem[]` do `...`.
 *
 * `render` é o elemento da linha (`<TableRow />`, `<div className="grid …" />`, `<li />`); o
 * Trigger do base-ui vira esse elemento, então a marcação da tela não muda.
 *
 * **Sem itens, a linha fica sem menu e o botão direito volta ao menu nativo** (ADR-0002, regra 1):
 * só se suprime o menu do navegador onde o nosso repõe o que ele dava.
 *
 * `aoAbrir` é onde a tela aplica a regra da seleção (regra 3): botão direito fora da seleção passa
 * a valer só para a linha clicada.
 *
 * `desabilitado` serve ao menu que ENVOLVE outro (o dia que contém compromissos): no toque, o dedo
 * soltando depois do toque longo dispara um segundo evento de menu, que cairia no pai e abriria o
 * dele por cima do filho. Enquanto o filho estiver aberto, a tela desabilita o pai.
 */
export function LinhaComMenu({
  itens,
  onSelect,
  aoAbrir,
  desabilitado,
  render,
  children,
}: {
  itens: readonly AcaoItem[];
  onSelect: (item: AcaoItemAcao) => void;
  aoAbrir?: (aberto: boolean) => void;
  desabilitado?: boolean;
  render: ReactElement<{ children?: ReactNode }>;
  children: ReactNode;
}) {
  if (itens.length === 0) return cloneElement(render, undefined, children);

  return (
    <ContextMenu onOpenChange={aoAbrir} disabled={desabilitado}>
      <ContextMenuTrigger render={render}>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <AcoesMenuItens itens={itens} onSelect={onSelect} />
      </ContextMenuContent>
    </ContextMenu>
  );
}
