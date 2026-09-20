import {
  ChevronDown,
  ChevronUp,
  FolderPlus,
  Link2,
  Lock,
  LockOpen,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";

import type { AcaoItem } from "@/components/ui/acoes";

/**
 * Ações de uma linha da planilha orçamentária — **puro**. O mesmo array alimenta o menu de contexto,
 * o `...` e a barra de seleção (ADR-0002, regra 2). Quem só lê a planilha não recebe menu: a tela
 * passa lista vazia, e o botão direito fica com o navegador.
 */

export const ACAO_SUBGRUPO = "subgrupo";
export const ACAO_SERVICO_COMPOSICAO = "servico-composicao";
export const ACAO_SERVICO_INSUMO = "servico-insumo";
export const ACAO_EDITAR = "editar";
export const ACAO_VINCULAR_COMPOSICAO = "vincular-composicao";
export const ACAO_VINCULAR_INSUMO = "vincular-insumo";
export const ACAO_SUBIR = "subir";
export const ACAO_DESCER = "descer";
export const ACAO_TRAVAR = "travar";
export const ACAO_DESTRAVAR = "destravar";
export const ACAO_EXCLUIR = "excluir";
export const ACAO_LOTE_TRAVAR = "lote-travar";
export const ACAO_LOTE_DESTRAVAR = "lote-destravar";
export const ACAO_LOTE_EXCLUIR = "lote-excluir";

export const MOTIVO_SEM_BASE = "Escolha a base de preço na aba Cabeçalho.";
export const MOTIVO_UM_POR_VEZ = "Só funciona com um item por vez.";
export const MOTIVO_SO_SERVICO = "Só serviços têm preço para travar — grupos não.";
export const MOTIVO_TODOS_TRAVADOS = "Todos os serviços selecionados já estão travados.";
export const MOTIVO_NENHUM_TRAVADO = "Nenhum dos serviços selecionados está travado.";

export type ItemParaAcoes = { tipo: string; bloqueado: boolean };

const ehGrupo = (i: ItemParaAcoes) => i.tipo === "grupo";

export function itensDeItemOrcamento(item: ItemParaAcoes, ctx: { temBasePreco: boolean }): AcaoItem[] {
  const semBase = ctx.temBasePreco ? undefined : MOTIVO_SEM_BASE;
  const itens: (AcaoItem | null)[] = [
    ehGrupo(item)
      ? { tipo: "acao", id: ACAO_SUBGRUPO, rotulo: "Subgrupo aqui", icone: FolderPlus }
      : null,
    ehGrupo(item)
      ? { tipo: "acao", id: ACAO_SERVICO_COMPOSICAO, rotulo: "Serviço (composição)", icone: Plus, desabilitado: semBase }
      : null,
    ehGrupo(item)
      ? { tipo: "acao", id: ACAO_SERVICO_INSUMO, rotulo: "Item (insumo)", icone: Plus, desabilitado: semBase }
      : null,
    { tipo: "acao", id: ACAO_EDITAR, rotulo: "Editar", icone: Pencil },
    !ehGrupo(item)
      ? { tipo: "acao", id: ACAO_VINCULAR_COMPOSICAO, rotulo: "Vincular composição", icone: Link2, desabilitado: semBase }
      : null,
    !ehGrupo(item)
      ? { tipo: "acao", id: ACAO_VINCULAR_INSUMO, rotulo: "Vincular insumo", icone: Link2, desabilitado: semBase }
      : null,
    { tipo: "separador", id: "sep-ordem" },
    { tipo: "acao", id: ACAO_SUBIR, rotulo: "Mover para cima", icone: ChevronUp },
    { tipo: "acao", id: ACAO_DESCER, rotulo: "Mover para baixo", icone: ChevronDown },
    !ehGrupo(item)
      ? item.bloqueado
        ? { tipo: "acao", id: ACAO_DESTRAVAR, rotulo: "Destravar preço", icone: LockOpen }
        : { tipo: "acao", id: ACAO_TRAVAR, rotulo: "Travar preço", icone: Lock }
      : null,
    { tipo: "separador", id: "sep-excluir" },
    // Excluir tem confirmação própria na tela (avisa quando leva a subárvore junto): é ela que
    // cumpre a regra 4, por isso não leva `confirmar` aqui.
    { tipo: "acao", id: ACAO_EXCLUIR, rotulo: "Excluir", icone: Trash2, variant: "destructive" },
  ];
  return itens.filter((i): i is AcaoItem => i !== null);
}

/**
 * Lote sobre vários itens da planilha. Editar é de UM (desabilitado, com o motivo). Travar e
 * destravar só valem para serviços; excluir leva a subárvore de cada item marcado.
 */
export function itensDeLoteItensOrcamento(selecionados: readonly ItemParaAcoes[]): AcaoItem[] {
  const servicos = selecionados.filter((i) => !ehGrupo(i));
  const motivoTravar =
    servicos.length === 0
      ? MOTIVO_SO_SERVICO
      : servicos.every((i) => i.bloqueado)
        ? MOTIVO_TODOS_TRAVADOS
        : undefined;
  const motivoDestravar =
    servicos.length === 0
      ? MOTIVO_SO_SERVICO
      : servicos.every((i) => !i.bloqueado)
        ? MOTIVO_NENHUM_TRAVADO
        : undefined;
  return [
    { tipo: "acao", id: ACAO_EDITAR, rotulo: "Editar", icone: Pencil, desabilitado: MOTIVO_UM_POR_VEZ },
    { tipo: "separador", id: "sep-trava" },
    { tipo: "acao", id: ACAO_LOTE_TRAVAR, rotulo: "Travar preço", icone: Lock, desabilitado: motivoTravar },
    { tipo: "acao", id: ACAO_LOTE_DESTRAVAR, rotulo: "Destravar preço", icone: LockOpen, desabilitado: motivoDestravar },
    { tipo: "separador", id: "sep-excluir" },
    {
      tipo: "acao",
      id: ACAO_LOTE_EXCLUIR,
      rotulo: "Excluir",
      icone: Trash2,
      variant: "destructive",
      confirmar: {
        titulo: "Excluir os itens selecionados?",
        descricao: "Os grupos levam a subárvore inteira junto. Não pode ser desfeito.",
        rotuloConfirmar: "Excluir",
      },
    },
  ];
}

/**
 * Tira da lista o item cujo ancestral também está nela: excluir o pai já leva o filho, e excluir
 * o filho depois falharia com "não encontrado", enchendo o relatório do lote de ruído.
 */
export function semDescendentesDeSelecionados<T extends { id: string; parentId: string | null }>(
  selecionados: readonly T[],
  todos: readonly { id: string; parentId: string | null }[],
): T[] {
  const ids = new Set(selecionados.map((s) => s.id));
  const paiDe = new Map(todos.map((i) => [i.id, i.parentId]));
  const temAncestralSelecionado = (id: string): boolean => {
    let atual = paiDe.get(id) ?? null;
    // O limite protege de um ciclo de dados corrompido; a planilha real nunca passa de poucos níveis.
    for (let n = 0; atual && n < 64; n++) {
      if (ids.has(atual)) return true;
      atual = paiDe.get(atual) ?? null;
    }
    return false;
  };
  return selecionados.filter((s) => !temAncestralSelecionado(s.id));
}
