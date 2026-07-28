"use server";

import { revalidatePath } from "next/cache";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { HR_ADMIN_ROLES } from "@/lib/roles";
import { criarOverrideSchema, revogarOverrideSchema } from "@/modules/perfis/schemas";

/**
 * Override individual de permissão (`PermissaoUsuario`) — gerido por quem já administra RH
 * (mesmo gate de `usuarios:gerir`, não é escrita nova de risco maior que editar o próprio
 * usuário). `motivo` é obrigatório no schema — sem isso vira lixo em 12 meses (exigência do
 * conselho, §8.3 item 5 do plano).
 */
const base = { modulo: "configuracoes", roles: HR_ADMIN_ROLES } as const;
const rev = (userId: string) => {
  revalidatePath("/configuracoes/usuarios");
  revalidatePath(`/rh/pessoas/${userId}`);
};

export const criarOverride = defineAction(
  { ...base, acao: "criar-override", entidade: "PermissaoUsuario", schema: criarOverrideSchema },
  async (i, { user }) => {
    await prisma.permissaoUsuario.upsert({
      where: { userId_recurso_acao: { userId: i.userId, recurso: i.recurso, acao: i.acao } },
      create: {
        userId: i.userId,
        recurso: i.recurso,
        acao: i.acao,
        permitido: i.permitido,
        motivo: i.motivo,
        expiraEm: i.expiraEm ? new Date(i.expiraEm) : null,
        concedidoPorId: user.id,
      },
      update: {
        permitido: i.permitido,
        motivo: i.motivo,
        expiraEm: i.expiraEm ? new Date(i.expiraEm) : null,
        concedidoPorId: user.id,
      },
    });
    rev(i.userId);
    return { ok: true };
  },
);

export const revogarOverride = defineAction(
  {
    ...base,
    acao: "revogar-override",
    entidade: "PermissaoUsuario",
    schema: revogarOverrideSchema,
    capturarAntes: (input) => prisma.permissaoUsuario.findUnique({ where: { id: input.id } }),
  },
  async (i) => {
    const o = await prisma.permissaoUsuario.findUnique({ where: { id: i.id }, select: { userId: true } });
    if (!o) throw new ActionError("Override não encontrado.");
    await prisma.permissaoUsuario.delete({ where: { id: i.id } });
    rev(o.userId);
    return { ok: true };
  },
);
