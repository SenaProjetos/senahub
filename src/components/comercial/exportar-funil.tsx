"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/** As três exportações do funil num menu só, para caber no cabeçalho. Tarefa de mesa: fora do celular. */
export function ExportarFunil({ qs }: { qs: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm" className="hidden sm:inline-flex">
            <Download className="size-4" /> Exportar
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuItem render={<a href={`/api/comercial/export/prospeccoes?${qs}`} />}>Prospecções</DropdownMenuItem>
        <DropdownMenuItem render={<a href={`/api/comercial/export/negociacoes?${qs}`} />}>Negociações</DropdownMenuItem>
        <DropdownMenuItem render={<a href={`/api/comercial/export/contatos?${qs}`} />}>Contatos</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
