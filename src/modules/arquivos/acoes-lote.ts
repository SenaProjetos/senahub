import { Copy, FileArchive, ShieldCheck, ShieldX, Trash2 } from "lucide-react";

import type { AcaoItem } from "@/components/ui/acoes";

/**
 * Ações em lote do diretório geral — **puro**, sem React e sem I/O. O diretório é tela de
 * CONSULTA (decisão do dono, 2026-09-17): nada aqui muda documento, então o lote é só leitura —
 * baixar e copiar. Validar/excluir seguem na aba do projeto, junto do contexto que a decisão pede.
 *
 * A lista alimenta a barra de seleção e o menu de contexto de uma linha selecionada (regra 3 da
 * ADR-0002: com seleção, o menu age sobre a seleção).
 */

export const ACAO_LOTE_ZIP = "lote-baixar-zip";
export const ACAO_LOTE_COPIAR_NOMES = "lote-copiar-nomes";

export function itensDeLoteDiretorio(): AcaoItem[] {
  return [
    // Sem `desabilitado`: o tamanho em ARQUIVOS só é conhecido depois de buscar as linhas (a
    // seleção atravessa páginas e filtros, então parte dela não está carregada). O limite é
    // conferido na hora de baixar, com a mensagem do teto.
    { tipo: "acao", id: ACAO_LOTE_ZIP, rotulo: "Baixar (.zip)", icone: FileArchive },
    { tipo: "acao", id: ACAO_LOTE_COPIAR_NOMES, rotulo: "Copiar nomes", icone: Copy },
  ];
}

/** URL do .zip — a mesma rota da aba do projeto, que confere o escopo de CADA upload. */
export function urlDoZip(uploadIds: readonly string[]): string {
  return `/api/uploads/zip?ids=${uploadIds.join(",")}`;
}

/** Nomes, um por linha, na ordem em que vieram — o que "Copiar nomes" põe na área de transferência. */
export function textoDosNomes(nomes: readonly string[]): string {
  return nomes.join("\n");
}

// ── Fila de aprovações ─────────────────────────────────────────────────────────────────────────

export const ACAO_LOTE_APROVAR = "lote-aprovar";

/**
 * Lote da fila de aprovações. "Aprovar" pede confirmação com a contagem: aprovar em massa o que
 * deveria ser olhado item a item é o risco desta tela. Cada arquivo é validado pela action de UM
 * item, que devolve o motivo específico de quem não passou (apontamento em aberto, por exemplo) —
 * a versão em lote só dizia quantos foram ignorados.
 */
export function itensDeLoteAprovacoes(): AcaoItem[] {
  return [
    {
      tipo: "acao",
      id: ACAO_LOTE_APROVAR,
      rotulo: "Aprovar",
      icone: ShieldCheck,
      confirmar: {
        titulo: "Aprovar os arquivos selecionados?",
        descricao: "Cada arquivo é validado individualmente. Os que tiverem apontamento em aberto ficam de fora e aparecem no relatório.",
        rotuloConfirmar: "Aprovar",
      },
    },
    ...itensDeLoteDiretorio(),
  ];
}

// ── Fila de pedidos de exclusão ────────────────────────────────────────────────────────────────

export const ACAO_LOTE_EXCLUIR = "lote-excluir-pedidos";
export const ACAO_LOTE_MANTER = "lote-manter-pedidos";

/**
 * Lote dos pedidos de exclusão: aprovar manda os arquivos para a lixeira (restaurável), e manter
 * exige um motivo, que volta para quem pediu — um só, para todos os pedidos selecionados.
 */
export function itensDeLotePedidosExclusao(): AcaoItem[] {
  return [
    { tipo: "acao", id: ACAO_LOTE_MANTER, rotulo: "Manter arquivos", icone: ShieldX },
    {
      tipo: "acao",
      id: ACAO_LOTE_EXCLUIR,
      rotulo: "Excluir",
      icone: Trash2,
      variant: "destructive",
      confirmar: {
        titulo: "Aprovar a exclusão dos arquivos selecionados?",
        descricao: "Os arquivos vão para a lixeira do projeto e podem ser restaurados.",
        rotuloConfirmar: "Mover para a lixeira",
      },
    },
  ];
}
