import { Download, ListMinus, ListPlus, Share2, ShieldCheck, Tag, Trash2 } from "lucide-react";

import { limparSeparadores, type AcaoItem } from "@/components/ui/acoes";

/**
 * Ações sobre os documentos SELECIONADOS da aba Arquivos (ADR-0002, regra 3: onde há seleção, o
 * menu age sobre a seleção). O mesmo array alimenta a barra da seleção e o menu de contexto de uma
 * linha marcada quando há mais de uma — antes o botão direito oferecia baixar só a linha sob o
 * cursor, com três marcadas. As ações de um documento só (renomear, detalhes…) ficam FORA desse
 * menu, sem item desabilitado: o mesmo motivo repetido em nove itens enterrava as ações da seleção
 * (emenda de 2026-10-04 na ADR-0002). Continuam no `...` de cada linha.
 */
export const SELECAO_BAIXAR = "selecao-baixar";
export const SELECAO_VALIDAR = "selecao-validar";
export const SELECAO_ALTERAR_STATUS = "selecao-alterar-status";
export const SELECAO_ADICIONAR_LISTA = "selecao-adicionar-lista";
export const SELECAO_REMOVER_LISTA = "selecao-remover-lista";
export const SELECAO_LINK_PUBLICO = "selecao-link-publico";
export const SELECAO_EXCLUIR = "selecao-excluir";

export type ContextoSelecaoDocumentos = {
  totalDocumentos: number;
  /** Arquivos da seleção que ainda podem ser validados. */
  totalValidaveis: number;
  podeValidar: boolean;
  /** Documentos da seleção cujo status documental a pessoa pode mudar (permissão + muralha da disciplina). */
  totalStatusAlteravel?: number;
  podeExcluir: boolean;
  podeGerirListas: boolean;
  temListas: boolean;
  /** Lista aberta no painel — só com ela existe "Remover da lista". */
  listaAberta: boolean;
  podeGerirLink: boolean;
  /** `true` no menu de contexto: lá não há a contagem da barra ao lado, então o rótulo a repete. */
  comContagem?: boolean;
};

function documentos(n: number): string {
  return `${n} ${n === 1 ? "documento" : "documentos"}`;
}

export function itensDaSelecaoDeDocumentos(ctx: ContextoSelecaoDocumentos): AcaoItem[] {
  const n = ctx.totalDocumentos;
  const itens: (AcaoItem | null)[] = [
    {
      tipo: "acao",
      id: SELECAO_BAIXAR,
      rotulo: ctx.comContagem ? `Baixar ${documentos(n)} (.zip)` : "Baixar",
      icone: Download,
    },
    ctx.podeValidar && ctx.totalValidaveis > 0
      ? { tipo: "acao", id: SELECAO_VALIDAR, rotulo: `Validar (${ctx.totalValidaveis})`, icone: ShieldCheck }
      : null,
    // Só quem altera status de algum selecionado vê o item; os demais ficam de fora e o diálogo diz quantos.
    (ctx.totalStatusAlteravel ?? 0) > 0
      ? {
          tipo: "acao",
          id: SELECAO_ALTERAR_STATUS,
          rotulo: ctx.totalStatusAlteravel === n ? "Alterar status" : `Alterar status (${ctx.totalStatusAlteravel})`,
          icone: Tag,
        }
      : null,
    ctx.podeGerirListas && ctx.temListas
      ? { tipo: "acao", id: SELECAO_ADICIONAR_LISTA, rotulo: "Adicionar à lista", icone: ListPlus }
      : null,
    ctx.podeGerirListas && ctx.listaAberta
      ? { tipo: "acao", id: SELECAO_REMOVER_LISTA, rotulo: "Remover da lista", icone: ListMinus }
      : null,
    ctx.podeGerirLink ? { tipo: "acao", id: SELECAO_LINK_PUBLICO, rotulo: "Link público", icone: Share2 } : null,
    { tipo: "separador", id: "sep-selecao-excluir" },
    // Sem `confirmar`: quem confirma é o diálogo de escopo da exclusão (uma escolha por documento).
    ctx.podeExcluir
      ? {
          tipo: "acao",
          id: SELECAO_EXCLUIR,
          rotulo: ctx.comContagem ? `Excluir ${documentos(n)}` : "Excluir",
          icone: Trash2,
          variant: "destructive",
        }
      : null,
  ];
  return limparSeparadores(itens.filter((i): i is AcaoItem => i !== null));
}
