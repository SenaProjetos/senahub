"use client";

import Link from "next/link";
import { Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { VisualizarDwgButton } from "@/components/dwg/visualizar-dwg-button";

/**
 * Badge de extensão com a ação apropriada ao tipo (F1-PR4, item 9 da spec).
 *
 * Cada extensão abre o visualizador que JÁ existe no sistema — nada de visualizador novo:
 *  - `pdf`  → rota `/projetos/[id]/arquivos/[uploadId]/visualizar` (PdfViewer, com pinos)
 *  - `ifc`  → aba Coordenação do projeto (viewer BIM federado); sem `coordenacao:ver`, baixa
 *  - `dwg`  → baixa pelo badge e, ao lado, o `VisualizarDwgButton` existente, que já conhece
 *             o estado real da conversão (fila/processando/erro/pronto). Não dá para embutir
 *             esse estado no próprio badge sem refazer a consulta que aquele componente já faz.
 *  - resto  → download
 *
 * Fase 1 mostra UMA extensão por linha porque hoje cada `Upload` é um registro independente;
 * várias extensões sob a mesma revisão dependem do merge da Fase 2 (D1). O componente já
 * aceita ser repetido lado a lado quando isso existir.
 */
export function BadgeExtensao({
  projetoId,
  uploadId,
  nome,
  ext,
  downloadUrl,
  podeCoordenacao,
  showDwgViewer = true,
}: {
  projetoId: string;
  uploadId: string;
  nome: string;
  ext: string;
  downloadUrl: string;
  podeCoordenacao: boolean;
  /** Cabeçalhos compactos mantêm o download, mas não iniciam o probe de conversão DWG. */
  showDwgViewer?: boolean;
}) {
  if (!ext) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  const rotulo = ext.toUpperCase();
  const classe =
    "cursor-pointer font-mono text-[10px] tracking-wide uppercase hover:border-ring hover:bg-accent";

  if (ext === "pdf") {
    return (
      <Badge
        variant="outline"
        className={classe}
        render={
          <Link
            href={`/projetos/${projetoId}/arquivos/${uploadId}/visualizar`}
            target="_blank"
            rel="noopener"
            title={`Visualizar ${nome}`}
            aria-label={`Visualizar ${nome}`}
          />
        }
      >
        {rotulo}
      </Badge>
    );
  }

  if (ext === "ifc" && podeCoordenacao) {
    return (
      <Badge
        variant="outline"
        className={classe}
        render={
          <Link
            href={`/projetos/${projetoId}/coordenacao`}
            title={`Abrir ${nome} no visualizador BIM`}
            aria-label={`Abrir ${nome} no visualizador BIM`}
          />
        }
      >
        {rotulo}
      </Badge>
    );
  }

  const baixar = (
    <Badge
      variant="outline"
      className={classe}
      render={<a href={downloadUrl} title={`Baixar ${nome}`} aria-label={`Baixar ${nome}`} />}
    >
      {rotulo}
      <Download className="size-3" aria-hidden />
    </Badge>
  );

  if (ext === "dwg") {
    if (!showDwgViewer) return baixar;
    return (
      <span className="flex items-center gap-1">
        {baixar}
        <VisualizarDwgButton desenhoId={uploadId} nomeArquivo={nome} titulo={nome} />
      </span>
    );
  }

  return baixar;
}
