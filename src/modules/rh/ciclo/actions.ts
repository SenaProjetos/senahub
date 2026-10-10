"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";

import { abrirCicloNoBanco, cancelarCicloNoBanco, marcarItemNoBanco } from "./service";

const rhBase = { modulo: "rh", gereRh: true } as const;

function revalidar(userId?: string) {
  revalidatePath("/rh/admin");
  revalidatePath("/rh");
  revalidatePath("/minha-ficha");
  if (userId) revalidatePath(`/rh/pessoas/${userId}`);
}

const tipoSchema = z.enum(["entrada", "saida"]);

/** Abre a lista de entrada ou de saída de uma pessoa a partir de uma lista-modelo. */
export const abrirCiclo = defineAction(
  {
    ...rhBase,
    acao: "abrir-ciclo-rh",
    entidade: "OnboardingProcesso",
    schema: z.object({ userId: z.string().min(1), tipo: tipoSchema, templateId: z.string().min(1, "Escolha a lista-modelo.") }),
    entidadeId: (d) => (d as { id: string }).id,
  },
  async (i) => {
    const r = await abrirCicloNoBanco(i);
    revalidar(i.userId);
    return r;
  },
);

/**
 * Marca ou desmarca um item. O RH marca qualquer um; a TI (`patrimonio:ti`) os da TI; a própria
 * pessoa os dela — por isso o gate de papel é amplo e a regra fina fica em `motivoParaNaoMarcar`.
 */
export const marcarItemCiclo = defineAction(
  {
    modulo: "rh",
    interno: true,
    acao: "marcar-item-ciclo-rh",
    entidade: "OnboardingItem",
    schema: z.object({
      id: z.string().min(1),
      concluido: z.boolean(),
      evidencia: z.string().max(300, "Evidência com no máximo 300 caracteres.").nullable().optional(),
    }),
    entidadeId: (_d, i) => i.id,
    capturarAntes: (i) =>
      prisma.onboardingItem.findUnique({ where: { id: i.id }, select: { concluido: true, evidencia: true, concluidoPorId: true } }),
  },
  async (i, { user }) => {
    const ehRh = user.gereRh;
    const ehTi = ehRh ? false : await can(user, "patrimonio", "ti");
    const r = await marcarItemNoBanco(i, { id: user.id, ehRh, ehTi });
    const ciclo = await prisma.onboardingProcesso.findUnique({ where: { id: r.processoId }, select: { userId: true } });
    revalidar(ciclo?.userId);
    return r;
  },
);

/** Cancela um ciclo em andamento (ex.: desligamento cancelado). O histórico fica. */
export const cancelarCiclo = defineAction(
  {
    ...rhBase,
    acao: "cancelar-ciclo-rh",
    entidade: "OnboardingProcesso",
    schema: z.object({ id: z.string().min(1) }),
    entidadeId: (_d, i) => i.id,
    capturarAntes: (i) => prisma.onboardingProcesso.findUnique({ where: { id: i.id }, select: { status: true, userId: true } }),
  },
  async (i) => {
    const ciclo = await prisma.onboardingProcesso.findUnique({ where: { id: i.id }, select: { userId: true } });
    const r = await cancelarCicloNoBanco(i.id);
    revalidar(ciclo?.userId);
    return r;
  },
);

// ── Listas-modelo ─────────────────────────────────────────────

const itemModeloSchema = z.object({
  descricao: z.string().trim().min(1, "Descreva o item.").max(200, "Item com no máximo 200 caracteres."),
  responsavel: z.enum(["rh", "ti", "lider", "coordenador", "pessoa"]),
  prazoDias: z.number().int().min(-90, "Prazo entre -90 e 365 dias.").max(365, "Prazo entre -90 e 365 dias.").nullable(),
  patrimonio: z.boolean(),
});

/**
 * Cria ou edita uma lista-modelo inteira (cabeçalho + itens, que são substituídos). Ciclos já
 * abertos não mudam: eles copiaram os itens quando abriram.
 */
export const salvarModeloCiclo = defineAction(
  {
    ...rhBase,
    acao: "salvar-modelo-ciclo-rh",
    entidade: "OnboardingTemplate",
    schema: z.object({
      id: z.string().min(1).optional(),
      nome: z.string().trim().min(1, "Dê um nome à lista.").max(80, "Nome com no máximo 80 caracteres."),
      tipo: tipoSchema,
      publico: z.enum(["clt_estagio", "pj", "todos"]),
      itens: z.array(itemModeloSchema).min(1, "A lista precisa de pelo menos um item.").max(60, "No máximo 60 itens."),
    }),
    entidadeId: (d) => (d as { id: string }).id,
    capturarAntes: async (i) =>
      i.id ? prisma.onboardingTemplate.findUnique({ where: { id: i.id }, include: { itens: { orderBy: { ordem: "asc" } } } }) : null,
  },
  async (i) => {
    const itens = i.itens.map((it, ordem) => ({ ...it, ordem }));
    try {
      const id = await prisma.$transaction(async (tx) => {
        if (i.id) {
          await tx.onboardingTemplate.update({ where: { id: i.id }, data: { nome: i.nome, tipo: i.tipo, publico: i.publico } });
          await tx.onboardingTemplateItem.deleteMany({ where: { templateId: i.id } });
          await tx.onboardingTemplateItem.createMany({ data: itens.map((it) => ({ ...it, templateId: i.id! })) });
          return i.id;
        }
        const criado = await tx.onboardingTemplate.create({
          data: { nome: i.nome, tipo: i.tipo, publico: i.publico, itens: { create: itens } },
          select: { id: true },
        });
        return criado.id;
      });
      revalidar();
      return { id };
    } catch (e) {
      if ((e as { code?: string }).code === "P2002") throw new ActionError("Já existe uma lista com esse nome.", { nome: "Já existe uma lista com esse nome." });
      throw e;
    }
  },
);

/** Arquiva ou reativa uma lista-modelo. Arquivada não aparece para abrir ciclo novo. */
export const arquivarModeloCiclo = defineAction(
  {
    ...rhBase,
    acao: "arquivar-modelo-ciclo-rh",
    entidade: "OnboardingTemplate",
    schema: z.object({ id: z.string().min(1), ativo: z.boolean() }),
    entidadeId: (_d, i) => i.id,
    capturarAntes: (i) => prisma.onboardingTemplate.findUnique({ where: { id: i.id }, select: { ativo: true } }),
  },
  async (i) => {
    await prisma.onboardingTemplate.update({ where: { id: i.id }, data: { ativo: i.ativo } });
    revalidar();
    return { id: i.id };
  },
);
