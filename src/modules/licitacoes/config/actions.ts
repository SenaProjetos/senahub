"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { CHAVE_CONFIG_LICITACOES, parseConfigLicitacoes } from "@/modules/licitacoes/config/defaults";

const schema = z.object({
  recurso: z
    .object({
      alertaDiasPadrao: z.array(z.number().int().nonnegative()).optional(),
    })
    .optional(),
  aditivo: z
    .object({
      limiteAcrescimoPctPadrao: z.number().nonnegative().optional(),
      fatorAviso: z.number().nonnegative().optional(),
    })
    .optional(),
  pncp: z
    .object({
      modo: z.enum(["manual", "api"]).optional(),
    })
    .optional(),
  reajuste: z
    .object({
      modo: z.enum(["manual", "automatico"]).optional(),
      indices: z.array(z.string()).optional(),
      percentualPadrao: z.number().optional(),
    })
    .optional(),
  datasChave: z
    .object({
      alertaDiasPadrao: z.array(z.number().int().nonnegative()).optional(),
    })
    .optional(),
});

/** Salva a configuração do módulo de licitações. Requer role admin. */
export const salvarConfigLicitacoes = defineAction(
  {
    modulo: "licitacoes",
    recurso: "configuracoes",
    permissao: "gerir",
    acao: "salvar-config-licitacoes",
    entidade: "ConfigSistema",
    roles: ["admin"],
    schema,
  },
  async (i) => {
    const valor = parseConfigLicitacoes(i);
    await prisma.configSistema.upsert({
      where: { chave: CHAVE_CONFIG_LICITACOES },
      create: { chave: CHAVE_CONFIG_LICITACOES, valor },
      update: { valor },
    });
    revalidatePath("/configuracoes/licitacoes");
    return { ok: true };
  },
);
