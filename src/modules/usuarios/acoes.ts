import { Copy, KeyRound, Pencil, Trash2, UserCheck, UserX } from "lucide-react";

import type { AcaoItem } from "@/components/ui/acoes";

/**
 * Ações de uma linha da lista de usuários (Configurações) — **puro**. O mesmo array alimenta o menu
 * de contexto, o `...` e a barra de seleção (ADR-0002, regra 2). Os gates só escondem itens; o
 * gate real segue nas actions.
 */

export const ACAO_EDITAR = "editar";
export const ACAO_REINICIAR_SENHA = "reiniciar-senha";
export const ACAO_DESATIVAR = "desativar";
export const ACAO_REATIVAR = "reativar";
export const ACAO_EXCLUIR = "excluir";
export const ACAO_COPIAR_NOME = "copiar-nome";
export const ACAO_COPIAR_EMAIL = "copiar-email";
export const ACAO_LOTE_DESATIVAR = "lote-desativar";
export const ACAO_LOTE_REATIVAR = "lote-reativar";
export const ACAO_LOTE_EXCLUIR = "lote-excluir";

export const MOTIVO_UM_POR_VEZ = "Só funciona com um usuário por vez.";
export const MOTIVO_TODOS_INATIVOS = "Todos os selecionados já estão desativados.";
export const MOTIVO_TODOS_ATIVOS = "Todos os selecionados já estão ativos.";
export const MOTIVO_EXCLUIR_SO_INATIVOS = "Só contas desativadas podem ser excluídas.";

export type UsuarioParaAcoes = { ativo: boolean };

export function itensDeUsuario(u: UsuarioParaAcoes, ctx: { podeExcluir: boolean }): AcaoItem[] {
  const itens: (AcaoItem | null)[] = [
    { tipo: "acao", id: ACAO_EDITAR, rotulo: "Editar", icone: Pencil },
    { tipo: "acao", id: ACAO_REINICIAR_SENHA, rotulo: "Reiniciar senha", icone: KeyRound },
    { tipo: "separador", id: "sep-copiar" },
    { tipo: "acao", id: ACAO_COPIAR_NOME, rotulo: "Copiar nome", icone: Copy },
    { tipo: "acao", id: ACAO_COPIAR_EMAIL, rotulo: "Copiar e-mail", icone: Copy },
    { tipo: "separador", id: "sep-estado" },
    u.ativo
      ? {
          tipo: "acao",
          id: ACAO_DESATIVAR,
          rotulo: "Desativar",
          icone: UserX,
          variant: "destructive",
          // Antes desativava direto, sem perguntar: regra 4 da ADR-0002 exige confirmação.
          confirmar: {
            titulo: "Desativar este usuário?",
            descricao: "Ele perde o acesso ao sistema. O histórico é mantido e a conta pode ser reativada.",
            rotuloConfirmar: "Desativar",
          },
        }
      : { tipo: "acao", id: ACAO_REATIVAR, rotulo: "Reativar", icone: UserCheck },
    // Excluir tem confirmação própria na tela (com o nome da pessoa e o aviso de irreversível): é ela
    // que cumpre a regra 4, por isso não leva `confirmar` aqui — perguntar duas vezes seria ruído.
    ctx.podeExcluir && !u.ativo
      ? { tipo: "acao", id: ACAO_EXCLUIR, rotulo: "Excluir", icone: Trash2, variant: "destructive" }
      : null,
  ];
  return itens.filter((i): i is AcaoItem => i !== null);
}

/**
 * Lote sobre vários usuários. Editar e reiniciar senha só fazem sentido para UM usuário (o segundo
 * mostra uma credencial temporária), então aparecem desabilitados, com o motivo — regra 5.
 */
export function itensDeLoteUsuarios(
  selecionados: readonly UsuarioParaAcoes[],
  ctx: { podeExcluir: boolean },
): AcaoItem[] {
  const todosInativos = selecionados.length > 0 && selecionados.every((s) => !s.ativo);
  const todosAtivos = selecionados.length > 0 && selecionados.every((s) => s.ativo);
  const algumAtivo = selecionados.some((s) => s.ativo);
  const itens: (AcaoItem | null)[] = [
    { tipo: "acao", id: ACAO_EDITAR, rotulo: "Editar", icone: Pencil, desabilitado: MOTIVO_UM_POR_VEZ },
    { tipo: "acao", id: ACAO_REINICIAR_SENHA, rotulo: "Reiniciar senha", icone: KeyRound, desabilitado: MOTIVO_UM_POR_VEZ },
    { tipo: "separador", id: "sep-estado" },
    {
      tipo: "acao",
      id: ACAO_LOTE_DESATIVAR,
      rotulo: "Desativar",
      icone: UserX,
      variant: "destructive",
      desabilitado: todosInativos ? MOTIVO_TODOS_INATIVOS : undefined,
      confirmar: {
        titulo: "Desativar os usuários selecionados?",
        descricao: "Eles perdem o acesso ao sistema. O histórico é mantido e as contas podem ser reativadas.",
        rotuloConfirmar: "Desativar",
      },
    },
    {
      tipo: "acao",
      id: ACAO_LOTE_REATIVAR,
      rotulo: "Reativar",
      icone: UserCheck,
      desabilitado: todosAtivos ? MOTIVO_TODOS_ATIVOS : undefined,
    },
    ctx.podeExcluir
      ? {
          tipo: "acao",
          id: ACAO_LOTE_EXCLUIR,
          rotulo: "Excluir",
          icone: Trash2,
          variant: "destructive",
          // Só conta desativada e sem histórico pode ser excluída; a action de UM usuário confere e o
          // relatório do lote diz quem ficou de fora.
          desabilitado: algumAtivo && selecionados.every((s) => s.ativo) ? MOTIVO_EXCLUIR_SO_INATIVOS : undefined,
          confirmar: {
            titulo: "Excluir os usuários selecionados?",
            descricao: "Remove as contas definitivamente. Só vale para contas desativadas e sem histórico. Não pode ser desfeito.",
            rotuloConfirmar: "Excluir",
          },
        }
      : null,
  ];
  return itens.filter((i): i is AcaoItem => i !== null);
}
