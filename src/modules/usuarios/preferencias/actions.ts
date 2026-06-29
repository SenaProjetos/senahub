"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

/** Atualiza o próprio perfil (nome + telefone). E-mail/login e dados de RH não são editáveis aqui. */
export const atualizarMeuPerfil = defineAction(
  {
    modulo: "usuarios",
    acao: "atualizar-meu-perfil",
    entidade: "User",
    schema: z.object({
      name: z.string().min(1, "Informe o nome.").max(120),
      telefone: z.string().max(40).optional().or(z.literal("")),
    }),
  },
  async (i, ctx) => {
    await prisma.user.update({
      where: { id: ctx.user.id },
      data: { name: i.name, telefone: i.telefone || null },
    });
    revalidatePath("/preferencias");
    return { ok: true };
  },
);

/** Salva uma preferência (chave-valor) do usuário atual no store dedicado (E8). */
export const salvarPreferencia = defineAction(
  { modulo: "configuracoes", acao: "salvar-preferencia", entidade: "UserPreference", audit: false, schema: z.object({ chave: z.string().min(1), valor: z.unknown() }) },
  async (i, ctx) => {
    const pref = await prisma.userPreference.findUnique({ where: { userId: ctx.user.id } });
    const dados = { ...((pref?.dados as Record<string, unknown> | null) ?? {}) };
    dados[i.chave] = i.valor;
    const valor = dados as Prisma.InputJsonObject;
    await prisma.userPreference.upsert({
      where: { userId: ctx.user.id },
      create: { userId: ctx.user.id, dados: valor },
      update: { dados: valor },
    });
    return { ok: true };
  },
);
