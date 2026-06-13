"use client";

import Link from "next/link";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Botão "Gerar documento" para os módulos: lista os modelos do Estúdio da fonte
 * e abre o preview com o parâmetro (ex.: projetoId) pré-preenchido.
 */
export function GerarDocumentoButton({
  modelos,
  paramId,
  valor,
  variant = "outline",
  size = "sm",
}: {
  modelos: { id: string; nome: string }[];
  paramId: string;
  valor: string;
  variant?: "outline" | "ghost" | "default";
  size?: "sm" | "default" | "icon";
}) {
  if (modelos.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant={variant} size={size}>
            <FileText className="size-4" /> Gerar documento
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Modelos disponíveis</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {modelos.map((m) => (
          <DropdownMenuItem
            key={m.id}
            render={
              <Link href={`/documentos/${m.id}/preview?${paramId}=${encodeURIComponent(valor)}`} />
            }
          >
            {m.nome}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
