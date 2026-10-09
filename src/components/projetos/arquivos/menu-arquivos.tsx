"use client";

import { ListChecks, Maximize2, MoreHorizontal, Settings2, Share2, Tags } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EVENTO_MODO_FOCO } from "@/components/ui/modo-foco-botao";

/** Eventos que os itens do ⋯ disparam para abrir as janelas, que ficam montadas fora do menu. */
export const EVENTO_ARQUIVOS = {
  nomenclatura: "senahub:arquivos:nomenclatura",
  listaMestre: "senahub:arquivos:lista-mestre",
  linkPublico: "senahub:arquivos:link-publico",
  configCiclo: "senahub:arquivos:config-ciclo",
} as const;

const disparar = (evento: string) => window.dispatchEvent(new Event(evento));

/**
 * O ⋯ da barra de Arquivos (modelo aprovado, Fase 2): Nomenclatura, Lista Mestre, Link público e o
 * modo foco, fora da linha para a tabela subir.
 */
export function MenuArquivos({
  listaMestre,
  linkPublico,
  configCiclo = false,
}: {
  /** null = a pessoa não gera Lista Mestre; false = sem disciplina que use a lista. */
  listaMestre: boolean | null;
  /** null = sem permissão para links; número = links ativos. */
  linkPublico: number | null;
  /** Admin: configura o ciclo documental do projeto (A9). */
  configCiclo?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="icon" className="size-8 shrink-0" aria-label="Mais ações de Arquivos" title="Nomenclatura · Lista Mestre · Link público">
            <MoreHorizontal className="size-4" />
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuItem className="gap-2" onClick={() => disparar(EVENTO_ARQUIVOS.nomenclatura)}>
          <Tags className="size-4" /> Nomenclatura
        </DropdownMenuItem>
        {listaMestre !== null && (
          <DropdownMenuItem className="gap-2" disabled={!listaMestre} onClick={() => disparar(EVENTO_ARQUIVOS.listaMestre)}>
            <ListChecks className="size-4" /> Gerar Lista Mestre
          </DropdownMenuItem>
        )}
        {linkPublico !== null && (
          <DropdownMenuItem className="gap-2" onClick={() => disparar(EVENTO_ARQUIVOS.linkPublico)}>
            <Share2 className="size-4" /> Link público
            {linkPublico > 0 && <span className="ml-auto font-mono text-xs text-muted-foreground">{linkPublico} ativo(s)</span>}
          </DropdownMenuItem>
        )}
        {configCiclo && (
          <DropdownMenuItem className="gap-2" onClick={() => disparar(EVENTO_ARQUIVOS.configCiclo)}>
            <Settings2 className="size-4" /> Ciclo dos documentos
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator className="hidden md:block" />
        <DropdownMenuItem className="hidden gap-2 md:flex" onClick={() => disparar(EVENTO_MODO_FOCO)}>
          <Maximize2 className="size-4" /> Modo foco <span className="ml-auto text-xs text-muted-foreground">Esc sai</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
