"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { invalidatePermissions } from "@/lib/permissions";
import { ROLES } from "@/lib/roles";

const setPermissaoSchema = z.object({
  role: z.enum(ROLES),
  recurso: z.string().min(1),
  acao: z.string().min(1),
  permitido: z.boolean(),
});

export const setPermissao = defineAction(
  {
    modulo: "configuracoes",
    acao: "set-permissao",
    recurso: "permissoes",
    permissao: "gerir",
    entidade: "Permissao",
    schema: setPermissaoSchema,
  },
  async (input) => {
    if (input.role === "admin") {
      throw new ActionError("O perfil admin tem acesso total e não é editável.");
    }
    await prisma.permissao.upsert({
      where: {
        role_recurso_acao: { role: input.role, recurso: input.recurso, acao: input.acao },
      },
      create: {
        role: input.role,
        recurso: input.recurso,
        acao: input.acao,
        permitido: input.permitido,
      },
      update: { permitido: input.permitido },
    });
    // Cache de permissões tem TTL de 10min; invalida na hora para refletir já.
    invalidatePermissions(input.role);
    revalidatePath("/configuracoes/permissoes");
    return { role: input.role };
  },
);
