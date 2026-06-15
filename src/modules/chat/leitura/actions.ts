"use server";

import { z } from "zod";
import { defineAction } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";

/** Marca uma mensagem como lida pelo usuário atual (recibo de leitura) (E6). */
export const marcarMensagemLida = defineAction(
  { modulo: "chat", acao: "marcar-lida", entidade: "MensagemLeitura", audit: false, schema: z.object({ mensagemId: z.string().min(1) }) },
  async (i, ctx) => {
    await prisma.mensagemLeitura.upsert({
      where: { mensagemId_userId: { mensagemId: i.mensagemId, userId: ctx.user.id } },
      create: { mensagemId: i.mensagemId, userId: ctx.user.id },
      update: { lidaEm: new Date() },
    });
    return { ok: true };
  },
);
