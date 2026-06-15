"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";

const base = { modulo: "comercial", recurso: "comercial", permissao: "gerir" } as const;
const opt = (s: z.ZodString) => s.optional().or(z.literal(""));
const rev = () => revalidatePath("/comercial/oportunidades");

export const criarOportunidade = defineAction(
  {
    ...base,
    acao: "criar-oportunidade",
    entidade: "Oportunidade",
    schema: z.object({
      titulo: z.string().min(1, "Informe o título."),
      clienteId: opt(z.string()),
      valorEstimado: z.number().min(0).optional(),
      etapa: z.string().default("qualificacao"),
      responsavelId: opt(z.string()),
      observacao: opt(z.string()),
    }),
  },
  async (i) => {
    const o = await prisma.oportunidade.create({
      data: {
        titulo: i.titulo,
        clienteId: i.clienteId || null,
        valorEstimado: i.valorEstimado ?? null,
        etapa: i.etapa || "qualificacao",
        responsavelId: i.responsavelId || null,
        observacao: i.observacao || null,
      },
    });
    rev();
    return { id: o.id };
  },
);

export const atualizarOportunidade = defineAction(
  {
    ...base,
    acao: "atualizar-oportunidade",
    entidade: "Oportunidade",
    schema: z.object({
      id: z.string().min(1),
      etapa: z.string().optional(),
      status: z.enum(["aberta", "ganha", "perdida"]).optional(),
    }),
  },
  async (i) => {
    await prisma.oportunidade.update({
      where: { id: i.id },
      data: { etapa: i.etapa ?? undefined, status: i.status ?? undefined },
    });
    rev();
    return { id: i.id };
  },
);

export const registrarAtividadeOportunidade = defineAction(
  {
    ...base,
    acao: "registrar-atividade-op",
    entidade: "AtividadeOportunidade",
    schema: z.object({ oportunidadeId: z.string().min(1), tipo: z.string().default("nota"), descricao: z.string().min(1, "Descreva a atividade.") }),
  },
  async (i, ctx) => {
    await prisma.atividadeOportunidade.create({
      data: { oportunidadeId: i.oportunidadeId, tipo: i.tipo || "nota", descricao: i.descricao, autorId: ctx.user.id },
    });
    await prisma.oportunidade.update({ where: { id: i.oportunidadeId }, data: { updatedAt: new Date() } });
    rev();
    return { ok: true };
  },
);

export const excluirOportunidade = defineAction(
  { ...base, acao: "excluir-oportunidade", entidade: "Oportunidade", schema: z.object({ id: z.string().min(1) }) },
  async (i) => {
    const o = await prisma.oportunidade.findUnique({ where: { id: i.id }, select: { id: true } });
    if (!o) throw new ActionError("Oportunidade não encontrada.");
    await prisma.oportunidade.delete({ where: { id: i.id } });
    rev();
    return { id: i.id };
  },
);
