"use client";

import type { ConteudoPublico } from "@/modules/projetos/arquivos/link-publico";
import { rotuloRevisao } from "@/lib/utils";
import { SeloPedidoAguardando } from "@/components/arquivos/selos-pedido";
import { ArvoreEntregas, ProvedorAcoesDoArquivo, type ArquivoPublicoView } from "@/components/arquivos/arquivos-publico-view";
import { PedirRevisaoDialog } from "@/components/portal/pedir-revisao-dialog";

/**
 * A árvore das Entregas no portal do cliente: a mesma do link público, com o que só o portal tem na linha do PDF
 * ("Pedir revisão") e o olho do IFC (modelo 3D). PDF bloqueado ou fora do disco não recebe o botão (o servidor recusaria).
 */
export function EntregasDoPortal({
  base,
  conteudo,
  projetoId,
  aguardando = [],
  modeloPorUpload = {},
}: {
  base: string;
  conteudo: ConteudoPublico;
  projetoId: string;
  aguardando?: string[];
  /** IFC das Entregas → modelo servido no 3D (o realinhado mais recente, ou ele mesmo). Fora daqui = sem olho. */
  modeloPorUpload?: Record<string, string>;
}) {
  const podePedir = (a: ArquivoPublicoView) => a.ehPdf && !a.bloqueado && !a.indisponivel;
  return (
    <ProvedorAcoesDoArquivo
      valor={{
        selos: (a) =>
          aguardando.includes(a.id) ? <SeloPedidoAguardando /> : null,
        // O olho do PDF abre o visualizador do portal (ver, dar zoom e pedir revisão com marcações); o do IFC, o
        // modelo 3D com aquele modelo em destaque.
        hrefVer: (a) => {
          if (a.ehPdf) return `/portal/${projetoId}/prancha/${a.id}`;
          const modelo = modeloPorUpload[a.id];
          return modelo ? `/portal/${projetoId}/modelo?modelo=${encodeURIComponent(modelo)}` : null;
        },
        extras: (a) =>
          podePedir(a) ? <PedirRevisaoDialog projetoId={projetoId} uploadId={a.id} nome={a.nome} revisao={rotuloRevisao(a.versao)} /> : null,
      }}
    >
      <ArvoreEntregas base={base} conteudo={conteudo} />
    </ProvedorAcoesDoArquivo>
  );
}
