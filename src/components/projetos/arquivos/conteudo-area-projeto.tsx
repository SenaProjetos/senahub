"use client";

import {
  RecebidosPasta,
  PastaBaseArquitetonica,
  PastaGeral,
  ArtsPasta,
  LixeiraPasta,
} from "@/components/projetos/arquivos-explorer";
import type { AreaProjeto } from "@/modules/uploads/areas-projeto";
import type { DocumentoItem } from "@/modules/documentos-cliente/queries";
import type { LixeiraItem } from "@/modules/uploads/queries";
import type { ArtListItem } from "@/modules/projetos/art/queries";

/**
 * Conteúdo da área do projeto selecionada no painel esquerdo.
 *
 * REUSA os componentes do explorer antigo em vez de reescrevê-los. Cada um carrega um fluxo
 * inteiro já testado em produção — upload, versionamento, exclusão, compartilhamento em
 * Recebidos — e reimplementar isso na estética nova seria trocar código que funciona por
 * código novo sem ganho para quem usa. A diferença visual (árvore, não tabela) é o preço
 * honesto de não duplicar essa lógica.
 */

export type DadosAreas = {
  projetoId: string;
  clienteId: string | null;
  recebidos: DocumentoItem[];
  baseArquitetonica: DocumentoItem[];
  geral: DocumentoItem[];
  arts: ArtListItem[];
  lixeira: LixeiraItem[];
  podeGerirRecebidos: boolean;
  podeGerirGeral: boolean;
  podeExcluirDocumento: boolean;
};

export function ConteudoAreaProjeto({ area, dados }: { area: AreaProjeto; dados: DadosAreas }) {
  switch (area) {
    case "recebidos":
      return (
        <RecebidosPasta
          projetoId={dados.projetoId}
          clienteId={dados.clienteId}
          recebidos={dados.recebidos}
          podeGerir={dados.podeGerirRecebidos}
          podeExcluir={dados.podeExcluirDocumento}
        />
      );
    case "base":
      return (
        <PastaBaseArquitetonica
          projetoId={dados.projetoId}
          clienteId={dados.clienteId}
          arquivos={dados.baseArquitetonica}
          podeGerir={dados.podeGerirRecebidos}
          podeExcluir={dados.podeExcluirDocumento}
        />
      );
    case "geral":
      return (
        <PastaGeral
          projetoId={dados.projetoId}
          clienteId={dados.clienteId}
          geral={dados.geral}
          podeGerir={dados.podeGerirGeral}
          podeExcluir={dados.podeExcluirDocumento}
        />
      );
    case "arts":
      return <ArtsPasta projetoId={dados.projetoId} arts={dados.arts} />;
    case "lixeira":
      return <LixeiraPasta itens={dados.lixeira} />;
  }
}
