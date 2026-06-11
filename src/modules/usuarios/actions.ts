"use server";

import { revalidatePath } from "next/cache";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
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
    entidadeId: (d) => (d as { id: string }).id,
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
    entidadeId: (d) => (d as { id: string }).id,
  },
  async (input) => {
    await prisma.user.update({
      where: { id: input.id },
      data: { name: input.name, role: input.role },
    });
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
    entidadeId: (d) => (d as { id: string }).id,
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

export const reativarUsuario = defineAction(
  {
    modulo: "configuracoes",
    acao: "reativar-usuario",
    recurso: "usuarios",
    permissao: "gerir",
    entidade: "User",
    schema: usuarioIdSchema,
    entidadeId: (d) => (d as { id: string }).id,
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
    entidadeId: (d) => (d as { id: string }).id,
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
