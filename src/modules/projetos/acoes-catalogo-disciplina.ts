import { Archive, ArchiveRestore, Pencil, Trash2 } from "lucide-react";

import type { AcaoItem } from "@/components/ui/acoes";

/**
 * Ações de uma linha do Catálogo de Disciplinas (Configurações) — **puro**. O mesmo array alimenta
 * o menu de contexto, o `...` e a barra de seleção (ADR-0002, regra 2). Os gates só escondem itens;
 * o gate real segue nas actions.
 */

export const ACAO_EDITAR = "editar";
export const ACAO_SUBIR = "subir";
export const ACAO_DESCER = "descer";
export const ACAO_ARQUIVAR = "arquivar";
export const ACAO_DESARQUIVAR = "desarquivar";
export const ACAO_EXCLUIR = "excluir";
export const ACAO_LOTE_ARQUIVAR = "lote-arquivar";
export const ACAO_LOTE_DESARQUIVAR = "lote-desarquivar";
export const ACAO_LOTE_EXCLUIR = "lote-excluir";

export const MOTIVO_UMA_POR_VEZ = "Só funciona com uma disciplina por vez.";
export const MOTIVO_LIMPAR_BUSCA = "Limpe a busca para reordenar.";
export const MOTIVO_PRIMEIRA = "Já é a primeira da categoria.";
export const MOTIVO_ULTIMA = "Já é a última da categoria.";
export const MOTIVO_TODAS_ARQUIVADAS = "Todas as selecionadas já estão arquivadas.";
export const MOTIVO_TODAS_ATIVAS = "Todas as selecionadas já estão ativas.";
export const MOTIVO_TODAS_EM_USO = "Todas as selecionadas estão em uso em projetos — arquive em vez de excluir.";

export type DisciplinaParaAcoes = { ativo: boolean; uso: number };

/** Disciplinas que a exclusão em lote pode remover: as que nenhum projeto usa. */
export function excluiveis<T extends DisciplinaParaAcoes>(lista: readonly T[]): T[] {
  return lista.filter((d) => d.uso === 0);
}

/**
 * Lote sobre várias disciplinas. Editar e reordenar são de UMA — aparecem desabilitados, com o
 * motivo. Excluir só alcança as que nenhum projeto usa; as demais o relatório do lote nomeia.
 */
export function itensDeLoteDisciplinas(selecionadas: readonly DisciplinaParaAcoes[]): AcaoItem[] {
  const todasArquivadas = selecionadas.length > 0 && selecionadas.every((d) => !d.ativo);
  const todasAtivas = selecionadas.length > 0 && selecionadas.every((d) => d.ativo);
  const todasEmUso = selecionadas.length > 0 && excluiveis(selecionadas).length === 0;
  return [
    { tipo: "acao", id: ACAO_EDITAR, rotulo: "Editar", icone: Pencil, desabilitado: MOTIVO_UMA_POR_VEZ },
    { tipo: "separador", id: "sep-estado" },
    {
      tipo: "acao",
      id: ACAO_LOTE_ARQUIVAR,
      rotulo: "Arquivar",
      icone: Archive,
      desabilitado: todasArquivadas ? MOTIVO_TODAS_ARQUIVADAS : undefined,
    },
    {
      tipo: "acao",
      id: ACAO_LOTE_DESARQUIVAR,
      rotulo: "Desarquivar",
      icone: ArchiveRestore,
      desabilitado: todasAtivas ? MOTIVO_TODAS_ATIVAS : undefined,
    },
    {
      tipo: "acao",
      id: ACAO_LOTE_EXCLUIR,
      rotulo: "Excluir",
      icone: Trash2,
      variant: "destructive",
      desabilitado: todasEmUso ? MOTIVO_TODAS_EM_USO : undefined,
      confirmar: {
        titulo: "Excluir as disciplinas selecionadas?",
        descricao: "Elas saem do catálogo em definitivo. Não pode ser desfeito.",
        rotuloConfirmar: "Excluir",
      },
    },
  ];
}
