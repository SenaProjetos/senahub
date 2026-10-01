import { Download, Pencil, Share2, Trash2, Upload } from "lucide-react";

import { limparSeparadores, type AcaoItem } from "@/components/ui/acoes";

/**
 * Ações de um documento das áreas Base Arquitetônica, Recebidos do cliente e Geral — **puro** (ADR-0002). O mesmo
 * array alimenta o menu de contexto e o `...` da linha na tabela. O que o perfil não permite não entra; a tela
 * mapeia cada `id` à action que já existia (nova versão, editar, compartilhar, excluir).
 *
 * "Ver" (PDF/DWG) não está aqui: são botões com janela própria, na coluna de visualização da linha.
 */

export type AreaDocumento = "recebidos" | "base" | "geral";

export const ACAO_DOC_BAIXAR = "baixar";
export const ACAO_DOC_NOVA_VERSAO = "nova-versao";
export const ACAO_DOC_EDITAR = "editar";
export const ACAO_DOC_EXIBIR_RECEBIDOS = "exibir-recebidos";
export const ACAO_DOC_EXCLUIR = "excluir";
export const ACAO_VERSAO_BAIXAR = "baixar-versao";
export const ACAO_VERSAO_EXCLUIR = "excluir-versao";

export type DocumentoParaAcoes = {
  nome: string;
  /** `interno` em Recebidos = compartilhado da pasta Geral, que se gere lá. */
  origem: string;
  exibirEmRecebidos: boolean;
  /** Link da versão vigente; `null` = documento sem arquivo. */
  downloadUrl: string | null;
  totalVersoes: number;
};

export function itensDeDocumentoArea(
  d: DocumentoParaAcoes,
  ctx: { area: AreaDocumento; podeGerir: boolean; podeExcluir: boolean },
): AcaoItem[] {
  // Documento do Geral compartilhado em Recebidos: quem o edita é a pasta Geral, não esta lista.
  const geridAqui = !(ctx.area === "recebidos" && d.origem === "interno");
  const ehGeral = ctx.area === "geral";
  const podeGerirAqui = ctx.podeGerir && geridAqui;

  const itens: (AcaoItem | null)[] = [
    d.downloadUrl ? { tipo: "link", id: ACAO_DOC_BAIXAR, rotulo: "Baixar", icone: Download, href: d.downloadUrl } : null,
    podeGerirAqui ? { tipo: "acao", id: ACAO_DOC_NOVA_VERSAO, rotulo: "Enviar nova versão", icone: Upload } : null,
    podeGerirAqui && ehGeral ? { tipo: "acao", id: ACAO_DOC_EDITAR, rotulo: "Editar nome, categoria e descrição", icone: Pencil } : null,
    podeGerirAqui && ehGeral
      ? {
          tipo: "acao",
          id: ACAO_DOC_EXIBIR_RECEBIDOS,
          rotulo: d.exibirEmRecebidos ? "Parar de exibir em Recebidos do cliente" : "Exibir também em Recebidos do cliente",
          icone: Share2,
          dica: d.exibirEmRecebidos ? undefined : "Aparece em Recebidos sem duplicar o arquivo.",
        }
      : null,
    ctx.podeExcluir && geridAqui ? { tipo: "separador", id: "sep-excluir" } : null,
    ctx.podeExcluir && geridAqui
      ? {
          tipo: "acao",
          id: ACAO_DOC_EXCLUIR,
          rotulo: "Excluir",
          icone: Trash2,
          variant: "destructive",
          confirmar: {
            titulo: `Excluir "${d.nome}"?`,
            descricao:
              d.totalVersoes > 1
                ? `O documento e as ${d.totalVersoes} versões dele serão excluídos. Não dá para desfazer.`
                : "O documento será excluído. Não dá para desfazer.",
            rotuloConfirmar: "Excluir",
          },
        }
      : null,
  ];
  return limparSeparadores(itens.filter((i): i is AcaoItem => i !== null));
}

/** Ações de uma versão ANTIGA (linha recuada do histórico): baixar e, para quem exclui, apagar só ela. */
export function itensDeVersaoDocumento(
  v: { numero: number; downloadUrl: string },
  ctx: { podeExcluir: boolean },
): AcaoItem[] {
  const itens: (AcaoItem | null)[] = [
    { tipo: "link", id: ACAO_VERSAO_BAIXAR, rotulo: "Baixar esta versão", icone: Download, href: v.downloadUrl },
    ctx.podeExcluir ? { tipo: "separador", id: "sep-excluir" } : null,
    ctx.podeExcluir
      ? {
          tipo: "acao",
          id: ACAO_VERSAO_EXCLUIR,
          rotulo: "Excluir esta versão",
          icone: Trash2,
          variant: "destructive",
          confirmar: {
            titulo: `Excluir a versão ${v.numero}?`,
            descricao: "Só esta versão é excluída; as outras ficam. Não dá para desfazer.",
            rotuloConfirmar: "Excluir",
          },
        }
      : null,
  ];
  return limparSeparadores(itens.filter((i): i is AcaoItem => i !== null));
}
