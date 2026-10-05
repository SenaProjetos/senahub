"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { campo } from "@/lib/campos/zod";
import { exigirCamposValidos } from "@/lib/campos/exigir";

/** Atualiza o próprio perfil (nome + telefone). E-mail/login e dados de RH não são editáveis aqui. */
export const atualizarMeuPerfil = defineAction(
  {
    modulo: "usuarios",
    acao: "atualizar-meu-perfil",
    entidade: "User",
    schema: z.object({
      name: z.string().min(1, "Informe o nome.").max(120),
      telefone: campo.telefone({ legado: true }),
    }),
  },
  async (i, ctx) => {
    // Antes de qualquer escrita: só o telefone que MUDOU é validado; o inválido já gravado segue salvando (D4).
    const antes = await prisma.user.findUnique({ where: { id: ctx.user.id }, select: { telefone: true } });
    exigirCamposValidos(i, antes, { telefone: "telefone" });
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
