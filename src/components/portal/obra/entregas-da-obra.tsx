"use client";

import type { ConteudoPublico } from "@/modules/projetos/arquivos/link-publico";
import { ArvoreEntregas, ProvedorAcoesDoArquivo } from "@/components/arquivos/arquivos-publico-view";

/**
 * A pasta "Liberado para obra" da conta de obra (spec 2026-11-25): a mesma árvore do portal, só para ver e baixar — sem "Pedir
 * revisão", sem selos de pedido. O olho do PDF abre o visualizador só de leitura; o do IFC, o modelo 3D da obra.
 */
export function EntregasDaObra({
  base,
  conteudo,
  projetoId,
  modeloPorUpload,
}: {
  base: string;
  conteudo: ConteudoPublico;
  projetoId: string;
  /** IFC da pasta → modelo servido no 3D. Fora daqui = sem olho. */
  modeloPorUpload: Record<string, string>;
}) {
  return (
    <ProvedorAcoesDoArquivo
      valor={{
        hrefVer: (a) => {
          if (a.ehPdf) return `/portal/${projetoId}/prancha/${a.id}`;
          const modelo = modeloPorUpload[a.id];
          return modelo ? `/portal/${projetoId}/modelo?modelo=${encodeURIComponent(modelo)}` : null;
        },
      }}
    >
      <ArvoreEntregas base={base} conteudo={conteudo} />
    </ProvedorAcoesDoArquivo>
  );
}
