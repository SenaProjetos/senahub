"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { ActionError, defineAction } from "@/lib/with-action";
import {
  CHAVE_FILTROS_SALVOS,
  CHAVES_PARAM_INTELIGENCIA,
  LIMITE_FILTROS_SALVOS,
  normalizarParams,
  parseFiltrosSalvos,
} from "@/modules/comercial/inteligencia/filtros-salvos";

const paramsSchema = z
  .record(z.string().max(30), z.string().max(150))
  .superRefine((params, ctx) => {
    const permitidas = new Set<string>(CHAVES_PARAM_INTELIGENCIA);
    for (const chave of Object.keys(params)) {
      if (!permitidas.has(chave)) {
        ctx.addIssue({ code: "custom", message: `Filtro desconhecido: ${chave}.` });
      }
    }
  });

const salvarSchema = z.object({
  nome: z.string().trim().min(2, "Informe um nome para o filtro.").max(60),
  params: paramsSchema,
});

const excluirSchema = z.object({ id: z.string().min(1).max(80) });

async function gravarFiltros(userId: string, filtros: unknown[]) {
  const pref = await prisma.userPreference.findUnique({ where: { userId } });
  const dados = { ...((pref?.dados as Record<string, unknown> | null) ?? {}) };
  dados[CHAVE_FILTROS_SALVOS] = filtros;
  const valor = dados as Prisma.InputJsonObject;
  await prisma.userPreference.upsert({
    where: { userId },
    create: { userId, dados: valor },
    update: { dados: valor },
  });
}

export const salvarFiltroInteligencia = defineAction(
  {
    modulo: "comercial",
    recurso: "comercial",
    permissao: "ver",
    acao: "salvar-filtro-inteligencia",
    entidade: "UserPreference",
    schema: salvarSchema,
    entidadeId: (d) => (d as { id: string }).id,
  },
  async (input, ctx) => {
    const pref = await prisma.userPreference.findUnique({ where: { userId: ctx.user.id } });
    const dados = (pref?.dados as Record<string, unknown> | null) ?? {};
    const atuais = parseFiltrosSalvos(dados[CHAVE_FILTROS_SALVOS]);
    const existente = atuais.find(
      (filtro) => filtro.nome.toLocaleLowerCase("pt-BR") === input.nome.toLocaleLowerCase("pt-BR"),
    );
    if (!existente && atuais.length >= LIMITE_FILTROS_SALVOS) {
      throw new ActionError(`Você pode salvar até ${LIMITE_FILTROS_SALVOS} filtros.`);
    }
    const filtro = {
      id: existente?.id ?? randomBytes(10).toString("hex"),
      nome: input.nome,
      params: normalizarParams(input.params),
    };
    const proximos = existente
      ? atuais.map((item) => (item.id === existente.id ? filtro : item))
      : [...atuais, filtro];
    await gravarFiltros(ctx.user.id, proximos);
    revalidatePath("/comercial/inteligencia");
    return { id: filtro.id };
  },
);

export const excluirFiltroInteligencia = defineAction(
  {
    modulo: "comercial",
    recurso: "comercial",
    permissao: "ver",
    acao: "excluir-filtro-inteligencia",
    entidade: "UserPreference",
    schema: excluirSchema,
    entidadeId: (_d, input) => (input as { id: string }).id,
  },
  async (input, ctx) => {
    const pref = await prisma.userPreference.findUnique({ where: { userId: ctx.user.id } });
    const dados = (pref?.dados as Record<string, unknown> | null) ?? {};
    const atuais = parseFiltrosSalvos(dados[CHAVE_FILTROS_SALVOS]);
    await gravarFiltros(
      ctx.user.id,
      atuais.filter((filtro) => filtro.id !== input.id),
    );
    revalidatePath("/comercial/inteligencia");
    return { id: input.id };
  },
);
