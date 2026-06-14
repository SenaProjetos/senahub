"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";

const base = { modulo: "recursos", recurso: "recursos", permissao: "gerir" } as const;
const rev = () => revalidatePath("/recursos");

export const criarHabilidade = defineAction(
  { ...base, acao: "criar-habilidade", entidade: "Habilidade", schema: z.object({ nome: z.string().min(1) }) },
  async (i) => {
    const h = await prisma.habilidade.upsert({
      where: { nome: i.nome.trim() },
      create: { nome: i.nome.trim() },
      update: {},
    });
    rev();
    return { id: h.id };
  },
);

export const excluirHabilidade = defineAction(
  { ...base, acao: "excluir-habilidade", entidade: "Habilidade", schema: z.object({ id: z.string().min(1) }) },
  async (i) => {
    await prisma.habilidade.delete({ where: { id: i.id } });
    rev();
    return { id: i.id };
  },
);

/** Vincula/desvincula habilidade de um usuário. */
export const alternarHabilidadeUsuario = defineAction(
  {
    ...base,
    acao: "toggle-habilidade",
    entidade: "UserHabilidade",
    schema: z.object({ userId: z.string().min(1), habilidadeId: z.string().min(1) }),
  },
  async (i) => {
    const existente = await prisma.userHabilidade.findUnique({
      where: { userId_habilidadeId: { userId: i.userId, habilidadeId: i.habilidadeId } },
    });
    if (existente) await prisma.userHabilidade.delete({ where: { id: existente.id } });
    else await prisma.userHabilidade.create({ data: { userId: i.userId, habilidadeId: i.habilidadeId } });
    rev();
    return { ativo: !existente };
  },
);
