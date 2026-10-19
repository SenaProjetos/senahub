"use client";

import { Badge } from "@/components/ui/badge";

/**
 * Badge de extensão: só o rótulo (PDF, DWG, IFC…), e o clique baixa o arquivo.
 *
 * Visualizar é o clique no título do documento (`TituloDocumento` → `visualizadorDoDocumento`:
 * PDF com pinos, DWG no 2D, IFC na Compatibilização). O badge antigo repetia isso com um olho
 * ao lado de um ícone de download — duas ações para o mesmo lugar e uma coluna larga à toa.
 *
 * Repetido lado a lado quando a revisão tem mais de um arquivo (PDF + DWG da mesma prancha).
 */
export function BadgeExtensao({ nome, ext, downloadUrl }: { nome: string; ext: string; downloadUrl: string }) {
  if (!ext) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  return (
    <Badge
      variant="outline"
      className="cursor-pointer font-mono text-[10px] tracking-wide uppercase hover:border-ring hover:bg-accent"
      render={<a href={downloadUrl} title={`Baixar ${nome}`} aria-label={`Baixar ${nome}`} />}
    >
      {ext.toUpperCase()}
    </Badge>
  );
}
