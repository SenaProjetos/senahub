import { Download, Eye, FileArchive, History, PenLine, Trash2, Upload } from "lucide-react";

import type { AcaoItem } from "@/components/ui/acoes";

/**
 * Ações de uma linha da tela de Certidões — **puro**. O mesmo array alimenta o menu de contexto, o
 * `...` e a barra de seleção (ADR-0002, regra 2). Os gates só escondem itens; o gate real segue nas
 * actions.
 */

export const ACAO_DETALHES = "detalhes";
export const ACAO_VISUALIZAR = "visualizar";
export const ACAO_BAIXAR = "baixar";
export const ACAO_NOVA_VERSAO = "nova-versao";
export const ACAO_EDITAR = "editar";
export const ACAO_EXCLUIR = "excluir";
export const ACAO_LOTE_ZIP = "lote-zip";
export const ACAO_LOTE_RENOVAR = "lote-renovar";
export const ACAO_LOTE_EXCLUIR = "lote-excluir";

export const MOTIVO_UMA_POR_VEZ = "Só funciona com uma certidão por vez.";
export const MOTIVO_SEM_DOCUMENTO = "Nenhuma das certidões selecionadas tem documento.";

export type CertidaoParaAcoes = { arquivoNome: string | null };

/** Endereço do download em lote; a rota valida o acesso a cada certidão. */
export function urlDoZip(ids: readonly string[]): string {
  return `/api/certidoes/zip?ids=${ids.join(",")}`;
}

const ehPdf = (c: CertidaoParaAcoes) => !!c.arquivoNome && c.arquivoNome.toLowerCase().endsWith(".pdf");

export function itensDeCertidao(c: CertidaoParaAcoes, ctx: { podeGerir: boolean }): AcaoItem[] {
  const temArquivo = !!c.arquivoNome;
  const itens: (AcaoItem | null)[] = [
    { tipo: "acao", id: ACAO_DETALHES, rotulo: "Abrir detalhes e histórico", icone: History },
    ehPdf(c) ? { tipo: "acao", id: ACAO_VISUALIZAR, rotulo: "Visualizar documento", icone: Eye } : null,
    temArquivo ? { tipo: "acao", id: ACAO_BAIXAR, rotulo: "Baixar documento", icone: Download } : null,
    ctx.podeGerir
      ? {
          tipo: "acao",
          id: ACAO_NOVA_VERSAO,
          rotulo: temArquivo ? "Nova versão" : "Adicionar documento",
          icone: Upload,
        }
      : null,
    ctx.podeGerir ? { tipo: "acao", id: ACAO_EDITAR, rotulo: "Editar", icone: PenLine } : null,
    ctx.podeGerir ? { tipo: "separador", id: "sep-excluir" } : null,
    // Excluir tem confirmação própria na tela (com o nome da certidão e o aviso de que dá para
    // restaurar): é ela que cumpre a regra 4, por isso não leva `confirmar` aqui.
    ctx.podeGerir
      ? { tipo: "acao", id: ACAO_EXCLUIR, rotulo: "Excluir", icone: Trash2, variant: "destructive" }
      : null,
  ];
  return itens.filter((i): i is AcaoItem => i !== null);
}

/**
 * Lote sobre várias certidões. Detalhes e edição só fazem sentido para UMA — aparecem
 * desabilitados, com o motivo (regra 5). "Renovar selecionadas" é a nova versão em lote, e o
 * download vira o `.zip`.
 */
export function itensDeLoteCertidoes(
  selecionadas: readonly CertidaoParaAcoes[],
  ctx: { podeGerir: boolean },
): AcaoItem[] {
  const algumComDocumento = selecionadas.some((c) => !!c.arquivoNome);
  const itens: (AcaoItem | null)[] = [
    { tipo: "acao", id: ACAO_DETALHES, rotulo: "Abrir detalhes e histórico", icone: History, desabilitado: MOTIVO_UMA_POR_VEZ },
    ctx.podeGerir
      ? { tipo: "acao", id: ACAO_EDITAR, rotulo: "Editar", icone: PenLine, desabilitado: MOTIVO_UMA_POR_VEZ }
      : null,
    { tipo: "separador", id: "sep-lote" },
    {
      tipo: "acao",
      id: ACAO_LOTE_ZIP,
      rotulo: "Baixar (.zip)",
      icone: FileArchive,
      desabilitado: algumComDocumento ? undefined : MOTIVO_SEM_DOCUMENTO,
    },
    ctx.podeGerir ? { tipo: "acao", id: ACAO_LOTE_RENOVAR, rotulo: "Renovar selecionadas", icone: Upload } : null,
    ctx.podeGerir
      ? {
          tipo: "acao",
          id: ACAO_LOTE_EXCLUIR,
          rotulo: "Excluir",
          icone: Trash2,
          variant: "destructive",
          confirmar: {
            titulo: "Excluir as certidões selecionadas?",
            descricao:
              'Elas saem da lista e dos alertas de vencimento, mas o histórico de versões e a auditoria são mantidos — dá para restaurar em "Excluídas".',
            rotuloConfirmar: "Excluir",
          },
        }
      : null,
  ];
  return itens.filter((i): i is AcaoItem => i !== null);
}
