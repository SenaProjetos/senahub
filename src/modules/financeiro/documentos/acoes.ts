import { Download, ListPlus, Trash2 } from "lucide-react";

import { limparSeparadores, type AcaoItem } from "@/components/ui/acoes";

/**
 * Ações de um documento financeiro (NF, contrato, proposta, medição) — ADR-0002, **puro**. O mesmo
 * array alimenta o menu de contexto da linha e o `...`.
 *
 * Excluir apaga o ARQUIVO guardado e desliga os lançamentos gerados (eles ficam, sem documento) — por
 * isso pede confirmação e diz quantos lançamentos perdem o vínculo.
 */

export const ACAO_BAIXAR = "baixar";
export const ACAO_GERAR_PARCELAS = "gerar-parcelas";
export const ACAO_EXCLUIR = "excluir";

export type DocumentoParaAcoes = {
  id: string;
  temArquivo: boolean;
  /** Lançamentos vinculados — continuam existindo, só perdem o vínculo. */
  lancamentos: number;
};

export type ContextoDocumento = { podeGerir: boolean };

export function itensDeDocumento(d: DocumentoParaAcoes, ctx: ContextoDocumento): AcaoItem[] {
  const vinculo =
    d.lancamentos === 0
      ? "Nenhum lançamento está ligado a ele."
      : `${d.lancamentos === 1 ? "O lançamento ligado a ele continua" : `Os ${d.lancamentos} lançamentos ligados a ele continuam`}, só sem o documento.`;
  const itens: (AcaoItem | null)[] = [
    d.temArquivo
      ? { tipo: "link", id: ACAO_BAIXAR, rotulo: "Baixar arquivo", icone: Download, href: `/api/financeiro/documentos/${d.id}/download` }
      : null,
    ctx.podeGerir ? { tipo: "acao", id: ACAO_GERAR_PARCELAS, rotulo: "Gerar parcelas…", icone: ListPlus } : null,
    ctx.podeGerir ? { tipo: "separador", id: "sep" } : null,
    ctx.podeGerir
      ? {
          tipo: "acao",
          id: ACAO_EXCLUIR,
          rotulo: "Excluir documento",
          icone: Trash2,
          variant: "destructive",
          confirmar: {
            titulo: "Excluir este documento?",
            descricao: `${d.temArquivo ? "O arquivo guardado é apagado. " : ""}${vinculo}`,
            rotuloConfirmar: "Excluir",
          },
        }
      : null,
  ];
  return limparSeparadores(itens.filter((i): i is AcaoItem => i !== null));
}
