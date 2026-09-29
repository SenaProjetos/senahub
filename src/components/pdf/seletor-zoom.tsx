"use client";

import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ZOOM_PREDEFINIDOS } from "@/lib/pdf-zoom";
import { cn } from "@/lib/utils";

/**
 * A caixa da % de zoom dos visualizadores de PDF: mostra o zoom atual e, clicada, lista os
 * zooms prontos (`ZOOM_PREDEFINIDOS`) — ir direto a 800% em vez de subir degrau por degrau ou
 * girar a roda até lá. O atual fica marcado quando coincide com um da lista.
 */
export function SeletorZoom({
  zoom,
  onEscolher,
  className,
}: {
  zoom: number;
  onEscolher: (zoom: number) => void;
  className?: string;
}) {
  const pct = Math.round(zoom * 100);
  const marcado = ZOOM_PREDEFINIDOS.find((z) => Math.round(z * 100) === pct);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={`Zoom de ${pct}% — escolher outro`}
            title="Escolher o zoom"
            className={cn(
              "inline-flex h-7 min-w-[7ch] items-center justify-center gap-0.5 rounded-sm px-1 text-xs tabular-nums text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[popup-open]:bg-accent data-[popup-open]:text-foreground",
              className,
            )}
          />
        }
      >
        {pct}%
        <ChevronDown className="size-3 shrink-0" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="w-48">
        <DropdownMenuRadioGroup value={marcado !== undefined ? String(marcado) : ""} onValueChange={(v) => onEscolher(Number(v))}>
          {ZOOM_PREDEFINIDOS.map((z) => (
            // Item de opção do base-ui não fecha o menu sozinho; aqui escolher é o fim da conversa.
            <DropdownMenuRadioItem key={z} value={String(z)} closeOnClick className="tabular-nums">
              {Math.round(z * 100)}%
              {z === 1 && <span className="text-xs text-muted-foreground">largura da tela</span>}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
