"use client";

import type { ConteudoPublico } from "@/modules/projetos/arquivos/link-publico";
import { cn, rotuloRevisao } from "@/lib/utils";
import { classeDoStatus } from "@/modules/uploads/status-documento";
import { ArvoreEntregas, ProvedorAcoesDoArquivo, type ArquivoPublicoView } from "@/components/arquivos/arquivos-publico-view";
import { PedirRevisaoDialog } from "@/components/portal/pedir-revisao-dialog";

/**
 * A árvore das Entregas no portal do cliente: a mesma do link público, com o que só o portal tem na linha do PDF
 * ("Pedir revisão"). PDF bloqueado ou fora do disco não recebe o botão (o servidor recusaria).
 */
export function EntregasDoPortal({
  base,
  conteudo,
  projetoId,
  aguardando = [],
}: {
  base: string;
  conteudo: ConteudoPublico;
  projetoId: string;
  aguardando?: string[];
}) {
  const podePedir = (a: ArquivoPublicoView) => a.ehPdf && !a.bloqueado && !a.indisponivel;
  return (
    <ProvedorAcoesDoArquivo
      valor={{
        selos: (a) =>
          aguardando.includes(a.id) ? (
            <span className={cn("shrink-0 rounded-sm border px-1.5 py-0.5 text-[10px] font-medium leading-none", classeDoStatus("aguardando"))}>
              Pedido aguardando
            </span>
          ) : null,
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
