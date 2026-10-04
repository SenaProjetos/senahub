"use client";

import { ArtsPasta, LixeiraPasta } from "@/components/projetos/arquivos-explorer";
import { TabelaAreaDocumentos } from "@/components/projetos/arquivos/tabela-area-documentos";
import { TabelaModeloFederado } from "@/components/projetos/arquivos/tabela-modelo-federado";
import type { AreaProjeto } from "@/modules/uploads/areas-projeto";
import type { DocumentoItem } from "@/modules/documentos-cliente/queries";
import type { LixeiraItem } from "@/modules/uploads/queries";
import type { ArtListItem } from "@/modules/projetos/art/queries";
import type { VersaoFederada } from "@/modules/coordenacao/federado/service";

/**
 * Conteúdo da área do projeto selecionada no painel esquerdo.
 *
 * Base, Recebidos e Geral são a MESMA tabela (`TabelaAreaDocumentos`, reunião de 29/09/2026: "converter para a
 * tabela nova") com o mesmo fluxo de antes — enviar, nova versão, histórico de versões, excluir, compartilhar.
 * ARTs e Lixeira seguem no explorer antigo (outras entidades).
 *
 * Cada área ocupa a página inteira, então a pasta de dentro já nasce ABERTA (reunião de 29/09/2026: a Base
 * Arquitetônica abria como "pasta dentro de pasta, fechada"). Recebidos e Geral já faziam isso.
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
  modeloFederado: VersaoFederada[];
  podeGerirFederado: boolean;
};

export function ConteudoAreaProjeto({ area, dados }: { area: AreaProjeto; dados: DadosAreas }) {
  switch (area) {
    case "recebidos":
      return (
        <TabelaAreaDocumentos
          area="recebidos"
          projetoId={dados.projetoId}
          clienteId={dados.clienteId}
          documentos={dados.recebidos}
          podeGerir={dados.podeGerirRecebidos}
          podeExcluir={dados.podeExcluirDocumento}
        />
      );
    case "base":
      return (
        <TabelaAreaDocumentos
          area="base"
          projetoId={dados.projetoId}
          clienteId={dados.clienteId}
          documentos={dados.baseArquitetonica}
          podeGerir={dados.podeGerirRecebidos}
          podeExcluir={dados.podeExcluirDocumento}
        />
      );
    case "geral":
      return (
        <TabelaAreaDocumentos
          area="geral"
          projetoId={dados.projetoId}
          clienteId={dados.clienteId}
          documentos={dados.geral}
          podeGerir={dados.podeGerirGeral}
          podeExcluir={dados.podeExcluirDocumento}
        />
      );
    case "arts":
      return <ArtsPasta projetoId={dados.projetoId} arts={dados.arts} abertoInicial />;
    case "lixeira":
      return <LixeiraPasta itens={dados.lixeira} abertoInicial />;
    case "federado":
      return <TabelaModeloFederado versoes={dados.modeloFederado} podeGerir={dados.podeGerirFederado} />;
  }
}
