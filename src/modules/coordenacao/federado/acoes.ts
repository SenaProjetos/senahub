import { Download, Trash2 } from "lucide-react";
import { limparSeparadores, type AcaoItem } from "@/components/ui/acoes";

/**
 * Ações de uma versão do modelo federado (ADR-0002) — puro. Não tem "nova versão" nem editar: a versão só nasce
 * da geração na Compatibilização, senão a composição gravada mentiria (spec 2026-10-04 §8).
 */
export const ACAO_FED_BAIXAR = "fed-baixar";
export const ACAO_FED_EXCLUIR_VERSAO = "fed-excluir-versao";
export const ACAO_FED_EXCLUIR_TUDO = "fed-excluir-tudo";

export function itensDaVersaoFederada(
  v: { revisao: string; downloadUrl: string; vigente: boolean },
  ctx: { podeGerir: boolean; totalVersoes: number },
): AcaoItem[] {
  const unica = ctx.totalVersoes <= 1;
  const itens: (AcaoItem | null)[] = [
    { tipo: "link", id: ACAO_FED_BAIXAR, rotulo: v.vigente ? "Baixar" : "Baixar esta versão", icone: Download, href: v.downloadUrl },
    ctx.podeGerir ? { tipo: "separador", id: "sep-excluir" } : null,
    ctx.podeGerir && !unica
      ? {
          tipo: "acao", id: ACAO_FED_EXCLUIR_VERSAO, rotulo: "Excluir esta versão", icone: Trash2, variant: "destructive",
          confirmar: { titulo: `Excluir a versão ${v.revisao}?`, descricao: "Só esta versão é excluída; as outras ficam. Não dá para desfazer.", rotuloConfirmar: "Excluir" },
        }
      : null,
    ctx.podeGerir && unica
      ? {
          tipo: "acao", id: ACAO_FED_EXCLUIR_TUDO, rotulo: "Excluir o modelo federado", icone: Trash2, variant: "destructive",
          confirmar: { titulo: "Excluir o modelo federado?", descricao: "A pasta some até a próxima geração. Não dá para desfazer.", rotuloConfirmar: "Excluir" },
        }
      : null,
  ];
  return limparSeparadores(itens.filter((i): i is AcaoItem => i !== null));
}
