"use client";

import type { ConteudoPublico } from "@/modules/projetos/arquivos/link-publico";
import { rotuloRevisao } from "@/lib/utils";
import { ArvoreEntregas, ProvedorAcoesDoArquivo, type ArquivoPublicoView } from "@/components/arquivos/arquivos-publico-view";
import { PedirRevisaoDialog } from "@/components/portal/pedir-revisao-dialog";

/**
 * A árvore das Entregas no portal do cliente: a mesma do link público, com o que só o portal tem na linha do PDF
 * ("Pedir revisão"). PDF bloqueado ou fora do disco não recebe o botão (o servidor recusaria).
 */
export function EntregasDoPortal({ base, conteudo, projetoId }: { base: string; conteudo: ConteudoPublico; projetoId: string }) {
  const podePedir = (a: ArquivoPublicoView) => a.ehPdf && !a.bloqueado && !a.indisponivel;
  return (
    <ProvedorAcoesDoArquivo
      valor={{
        // O olho do PDF abre o visualizador do portal (ver, dar zoom e pedir revisão com marcações).
        hrefVer: (a) => `/portal/${projetoId}/prancha/${a.id}`,
        extras: (a) =>
          podePedir(a) ? <PedirRevisaoDialog projetoId={projetoId} uploadId={a.id} nome={a.nome} revisao={rotuloRevisao(a.versao)} /> : null,
      }}
    >
      <ArvoreEntregas base={base} conteudo={conteudo} />
    </ProvedorAcoesDoArquivo>
  );
}
