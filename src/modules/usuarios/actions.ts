"use server";

import { revalidatePath } from "next/cache";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { ensureCanalSocios } from "@/modules/chat/service";
import { notificarNovosMembros, emitParaUsuario } from "@/lib/socket";
import {
  criarUsuarioComCredencial,
  resetarSenha,
} from "@/lib/auth-admin";
import {
  criarUsuarioSchema,
  editarUsuarioSchema,
  usuarioIdSchema,
} from "@/modules/usuarios/schemas";

const REVALIDATE = "/configuracoes/usuarios";

export const criarUsuario = defineAction(
  {
    modulo: "configuracoes",
    acao: "criar-usuario",
    recurso: "usuarios",
    permissao: "gerir",
    entidade: "User",
    schema: criarUsuarioSchema,
    entidadeId: (d, i) => ((d ?? i) as { id: string }).id,
  },
  async (input) => {
    const existing = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase().trim() },
    });
    if (existing) throw new ActionError("Já existe um usuário com esse e-mail.");

    const { id, senhaTemporaria } = await criarUsuarioComCredencial(input);
    revalidatePath(REVALIDATE);
    return { id, email: input.email, senhaTemporaria };
  },
);

export const editarUsuario = defineAction(
  {
    modulo: "configuracoes",
    acao: "editar-usuario",
    recurso: "usuarios",
    permissao: "gerir",
    entidade: "User",
    schema: editarUsuarioSchema,
    entidadeId: (d, i) => ((d ?? i) as { id: string }).id,
    capturarAntes: async (input) =>
      prisma.user.findUnique({
        where: { id: input.id },
        select: {
          name: true,
          role: true,
          clienteId: true,
          socio: { select: { ativo: true } },
        },
      }),
  },
  async (input, ctx) => {
    // Sócio: soft-toggle no registro Socio (nunca exclui — preserva retiradas).
    // Perfil cliente nunca é sócio (mesma regra de usuariosParaSocio no financeiro).
    const desejaSocio = input.role === "cliente" && input.ehSocio ? false : input.ehSocio;
    let socioMudou = false;
    let socio: { id: string; ativo: boolean } | null = null;
    if (desejaSocio !== undefined) {
      socio = await prisma.socio.findUnique({
        where: { userId: input.id },
        select: { id: true, ativo: true },
      });
      socioMudou = desejaSocio !== (socio?.ativo === true);
      // Valida ANTES de gravar qualquer coisa — evita atualização parcial.
      if (socioMudou && ctx.user.role !== "admin") {
        throw new ActionError("Apenas administradores podem definir quem é sócio.");
      }
    }

    await prisma.user.update({
      where: { id: input.id },
      data: {
        name: input.name,
        role: input.role,
        clienteId: input.role === "cliente" ? input.clienteId || null : null,
      },
    });

    if (socioMudou) {
      if (desejaSocio) {
        if (socio) {
          await prisma.socio.update({ where: { id: socio.id }, data: { ativo: true } });
        } else {
          // Percentual de participação é gerido em Financeiro → Cadastros → Sócios.
          await prisma.socio.create({ data: { userId: input.id, percentual: 0 } });
        }
      } else if (socio) {
        await prisma.socio.update({ where: { id: socio.id }, data: { ativo: false } });
      }
      // Reconcilia o canal "Sócios" do chat e reflete ao vivo (entrar/sair).
      const sync = await ensureCanalSocios();
      notificarNovosMembros(sync.adicionados);
      for (const r of sync.removidos) emitParaUsuario(r.userId, "sair-canal", { canalId: r.canalId });
    }

    revalidatePath(REVALIDATE);
    return { id: input.id };
  },
);

export const desativarUsuario = defineAction(
  {
    modulo: "configuracoes",
    acao: "desativar-usuario",
    recurso: "usuarios",
    permissao: "gerir",
    entidade: "User",
    schema: usuarioIdSchema,
    entidadeId: (d, i) => ((d ?? i) as { id: string }).id,
  },
  async (input, ctx) => {
    if (input.id === ctx.user.id) {
      throw new ActionError("Você não pode desativar o próprio usuário.");
    }
    // Nunca exclui — apenas desativa (regra de negócio).
    await prisma.user.update({ where: { id: input.id }, data: { ativo: false } });
    // Encerra sessões ativas do usuário desativado.
    await prisma.session.deleteMany({ where: { userId: input.id } });
    revalidatePath(REVALIDATE);
    return { id: input.id };
  },
);

/**
 * Exclusão DEFINITIVA (admin) de um usuário já desativado e SEM histórico de atividade.
 * Só remove contas "vazias" (criadas por engano / nunca usadas): usa a auditoria como prova
 * de atividade e deixa o banco barrar (P2003) qualquer registro de negócio vinculado.
 * Usuários com histórico permanecem desativados — nunca são apagados (integridade/legal).
 */
export const excluirUsuario = defineAction(
  {
    modulo: "configuracoes",
    acao: "excluir-usuario",
    recurso: "usuarios",
    permissao: "gerir",
    roles: ["admin"],
    entidade: "User",
    schema: usuarioIdSchema,
    entidadeId: (d, i) => ((d ?? i) as { id: string }).id,
    capturarAntes: async (input) =>
      prisma.user.findUnique({
        where: { id: input.id },
        select: { name: true, email: true, role: true, ativo: true },
      }),
  },
  async (input, ctx) => {
    if (input.id === ctx.user.id) {
      throw new ActionError("Você não pode excluir o próprio usuário.");
    }
    const alvo = await prisma.user.findUnique({ where: { id: input.id }, select: { ativo: true } });
    if (!alvo) throw new ActionError("Usuário não encontrado.");
    if (alvo.ativo) throw new ActionError("Desative o usuário antes de excluí-lo.");

    // Proxy de atividade: toda mutação passa por auditoria. Se há qualquer registro, o
    // usuário já atuou (histórico/financeiro/ponto vinculados) → não pode ser apagado.
    const atividade = await prisma.auditLog.count({ where: { userId: input.id } });
    if (atividade > 0) {
      throw new ActionError(
        "Este usuário possui histórico de atividade e não pode ser excluído — mantenha-o desativado.",
      );
    }

    try {
      // Cascata remove sessões/contas/preferências (artefatos de autenticação, sem valor).
      await prisma.user.delete({ where: { id: input.id } });
    } catch (e) {
      // FK (P2003): sobrou algum registro de negócio vinculado → não apaga.
      if (e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "P2003") {
        throw new ActionError(
          "Não é possível excluir: o usuário possui registros vinculados (arquivos, tarefas, financeiro, ponto). Mantenha-o desativado.",
        );
      }
      throw e;
    }

    revalidatePath(REVALIDATE);
    return { id: input.id };
  },
);

export const reativarUsuario = defineAction(
  {
    modulo: "configuracoes",
    acao: "reativar-usuario",
    recurso: "usuarios",
    permissao: "gerir",
    entidade: "User",
    schema: usuarioIdSchema,
    entidadeId: (d, i) => ((d ?? i) as { id: string }).id,
  },
  async (input) => {
    await prisma.user.update({ where: { id: input.id }, data: { ativo: true } });
    revalidatePath(REVALIDATE);
    return { id: input.id };
  },
);

export const resetarSenhaUsuario = defineAction(
  {
    modulo: "configuracoes",
    acao: "resetar-senha-usuario",
    recurso: "usuarios",
    permissao: "gerir",
    entidade: "User",
    schema: usuarioIdSchema,
    entidadeId: (d, i) => ((d ?? i) as { id: string }).id,
  },
  async (input) => {
    const senhaTemporaria = await resetarSenha(input.id);
    // Marca solicitações de reset pendentes como resolvidas.
    await prisma.solicitacaoResetSenha.updateMany({
      where: { userId: input.id, resolvida: false },
      data: { resolvida: true },
    });
    revalidatePath(REVALIDATE);
    return { id: input.id, senhaTemporaria };
  },
);
