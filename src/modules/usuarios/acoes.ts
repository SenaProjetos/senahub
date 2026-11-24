import { Copy, IdCard, KeyRound, MailCheck, Pencil, ShieldCheck, Trash2, UserCheck, UserX } from "lucide-react";

import type { AcaoItem } from "@/components/ui/acoes";
import { MOTIVO_LINK_CONTA_INATIVA, MOTIVO_LINK_SEM_EMAIL_DO_SISTEMA } from "@/modules/auth/redefinir-senha";

/**
 * Ações de uma linha da lista de usuários (Configurações) — **puro**. O mesmo array alimenta o menu
 * de contexto, o `...` e a barra de seleção (ADR-0002, regra 2). Os gates só escondem itens; o
 * gate real segue nas actions.
 */

export const ACAO_EDITAR = "editar";
export const ACAO_VER_FICHA = "ver-ficha";
export const ACAO_PERMISSOES = "permissoes";
export const ACAO_ENVIAR_LINK_SENHA = "enviar-link-senha";
export const ACAO_REINICIAR_SENHA = "reiniciar-senha";
export const ACAO_DESATIVAR = "desativar";
export const ACAO_REATIVAR = "reativar";
export const ACAO_EXCLUIR = "excluir";
export const ACAO_COPIAR_NOME = "copiar-nome";
export const ACAO_COPIAR_EMAIL = "copiar-email";
export const ACAO_LOTE_DESATIVAR = "lote-desativar";
export const ACAO_LOTE_REATIVAR = "lote-reativar";
export const ACAO_LOTE_EXCLUIR = "lote-excluir";
export const ACAO_LOTE_ENVIAR_LINK_SENHA = "lote-enviar-link-senha";

export const MOTIVO_UM_POR_VEZ = "Só funciona com um usuário por vez.";
export const MOTIVO_TODOS_INATIVOS = "Todos os selecionados já estão desativados.";
export const MOTIVO_TODOS_ATIVOS = "Todos os selecionados já estão ativos.";
export const MOTIVO_EXCLUIR_SO_INATIVOS = "Só contas desativadas podem ser excluídas.";
export const MOTIVO_LINK_TODOS_INATIVOS =
  "Todos os selecionados estão desativados ou com acesso encerrado: essas contas não recebem link.";

/**
 * O que a tela sabe para montar o menu. `emailDoSistema` = SMTP configurado no servidor;
 * `souSuperUsuario` = quem olha a tela é superusuário (só ele mexe na senha de outro superusuário).
 */
export type ContextoAcoesUsuario = { podeExcluir: boolean; emailDoSistema: boolean; souSuperUsuario: boolean };

/** Conta que não recebe link: desativada ou com `acessoAte` vencido (a tela calcula com `acessoBloqueado`). */
const semAcesso = (u: UsuarioParaAcoes) => !u.ativo || u.acessoEncerrado === true;

/** Senha de superusuário só por outro superusuário — os itens somem para os demais (regra 5). */
export const podeMexerNaSenha = (u: UsuarioParaAcoes, ctx: ContextoAcoesUsuario) =>
  ctx.souSuperUsuario || u.superUsuario !== true;

/** "Enviar link de nova senha": desabilitado (com o motivo) sem e-mail do sistema ou em conta desativada. */
function itemEnviarLink(id: string, motivoEstado: string | undefined, ctx: ContextoAcoesUsuario): AcaoItem {
  return {
    tipo: "acao",
    id,
    rotulo: "Enviar link de nova senha",
    icone: MailCheck,
    desabilitado: !ctx.emailDoSistema ? MOTIVO_LINK_SEM_EMAIL_DO_SISTEMA : motivoEstado,
  };
}

export type UsuarioParaAcoes = {
  ativo: boolean;
  tipo: "interno" | "externo";
  acessoEncerrado?: boolean;
  superUsuario?: boolean;
};

export function itensDeUsuario(u: UsuarioParaAcoes, ctx: ContextoAcoesUsuario): AcaoItem[] {
  // Ficha e permissões individuais moram em RH → Pessoas, que só existe para a equipe interna.
  const interno = u.tipo === "interno";
  const senha = podeMexerNaSenha(u, ctx);
  const itens: (AcaoItem | null)[] = [
    { tipo: "acao", id: ACAO_EDITAR, rotulo: "Editar", icone: Pencil },
    interno ? { tipo: "acao", id: ACAO_VER_FICHA, rotulo: "Ver ficha (RH → Pessoas)", icone: IdCard } : null,
    interno ? { tipo: "acao", id: ACAO_PERMISSOES, rotulo: "Permissões desta pessoa", icone: ShieldCheck } : null,
    senha ? itemEnviarLink(ACAO_ENVIAR_LINK_SENHA, semAcesso(u) ? MOTIVO_LINK_CONTA_INATIVA : undefined, ctx) : null,
    // Para quem perdeu o acesso ao e-mail: troca a senha na hora e mostra a temporária ao admin.
    senha ? { tipo: "acao", id: ACAO_REINICIAR_SENHA, rotulo: "Gerar senha temporária", icone: KeyRound } : null,
    { tipo: "separador", id: "sep-copiar" },
    { tipo: "acao", id: ACAO_COPIAR_NOME, rotulo: "Copiar nome", icone: Copy },
    { tipo: "acao", id: ACAO_COPIAR_EMAIL, rotulo: "Copiar e-mail", icone: Copy },
    { tipo: "separador", id: "sep-estado" },
    u.ativo
      ? {
          tipo: "acao",
          id: ACAO_DESATIVAR,
          rotulo: "Desativar acesso…",
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

/** Dos selecionados, quem recebe o link em lote: com acesso e cuja senha quem olha pode mexer. */
export function recebemLinkEmLote<T extends UsuarioParaAcoes>(selecionados: readonly T[], ctx: ContextoAcoesUsuario): T[] {
  return selecionados.filter((u) => !semAcesso(u) && podeMexerNaSenha(u, ctx));
}

/**
 * Lote sobre vários usuários. Editar e gerar senha temporária só fazem sentido para UM usuário (o
 * segundo mostra uma credencial temporária), então aparecem desabilitados, com o motivo — regra 5.
 * O link de nova senha vai em lote (só para os ativos).
 */
export function itensDeLoteUsuarios(
  selecionados: readonly UsuarioParaAcoes[],
  ctx: ContextoAcoesUsuario,
): AcaoItem[] {
  const todosInativos = selecionados.length > 0 && selecionados.every((s) => !s.ativo);
  const todosAtivos = selecionados.length > 0 && selecionados.every((s) => s.ativo);
  const algumAtivo = selecionados.some((s) => s.ativo);
  const itens: (AcaoItem | null)[] = [
    { tipo: "acao", id: ACAO_EDITAR, rotulo: "Editar", icone: Pencil, desabilitado: MOTIVO_UM_POR_VEZ },
    // O link vai para cada um e ninguém vê senha: em lote faz sentido (useLote repete a action, só
    // para quem pode receber — ver `recebemLinkEmLote`). Sai da empresa, então confirma com a contagem.
    {
      ...itemEnviarLink(
        ACAO_LOTE_ENVIAR_LINK_SENHA,
        recebemLinkEmLote(selecionados, ctx).length === 0 ? MOTIVO_LINK_TODOS_INATIVOS : undefined,
        ctx,
      ),
      confirmar: {
        titulo: "Enviar link de nova senha aos selecionados?",
        descricao: "Cada pessoa recebe um e-mail com um link para criar uma senha nova. A senha atual continua valendo até ela usar o link.",
        rotuloConfirmar: "Enviar",
      },
    } as AcaoItem,
    { tipo: "acao", id: ACAO_REINICIAR_SENHA, rotulo: "Gerar senha temporária", icone: KeyRound, desabilitado: MOTIVO_UM_POR_VEZ },
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
