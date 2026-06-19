"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { semearModalidadesPadrao } from "./queries";

const base = { modulo: "licitacoes", recurso: "licitacoes", permissao: "gerir" } as const;
const rev = () => revalidatePath("/configuracoes/modalidades");

export const salvarModalidade = defineAction(
  {
    ...base,
    acao: "salvar-modalidade",
    entidade: "Modalidade",
    schema: z.object({
      id: z.string().optional(),
      nome: z.string().min(1, "Informe o nome da modalidade."),
      ordem: z.number().int().optional(),
    }),
  },
  async (i) => {
    const nome = i.nome.trim();
    const conflito = await prisma.modalidade.findUnique({ where: { nome } });
    if (conflito && conflito.id !== i.id) {
      throw new ActionError("Já existe uma modalidade com esse nome.");
    }
    if (i.id) {
      await prisma.modalidade.update({ where: { id: i.id }, data: { nome, ordem: i.ordem } });
    } else {
      const total = await prisma.modalidade.count();
      await prisma.modalidade.create({ data: { nome, ordem: i.ordem ?? total } });
    }
    rev();
    return { ok: true };
  },
);

export const alternarModalidade = defineAction(
  {
    ...base,
    acao: "alternar-modalidade",
    entidade: "Modalidade",
    schema: z.object({ id: z.string().min(1), ativo: z.boolean() }),
  },
  async (i) => {
    await prisma.modalidade.update({ where: { id: i.id }, data: { ativo: i.ativo } });
    rev();
    return { ok: true };
  },
);

export const excluirModalidade = defineAction(
  {
    ...base,
    acao: "excluir-modalidade",
    entidade: "Modalidade",
    schema: z.object({ id: z.string().min(1) }),
  },
  async (i) => {
    await prisma.modalidade.delete({ where: { id: i.id } });
    rev();
    return { id: i.id };
  },
);

/** Restaura/garante as modalidades padrão (idempotente). */
export const restaurarModalidadesPadrao = defineAction(
  { ...base, acao: "restaurar-modalidades", entidade: "Modalidade" },
  async () => {
    const total = await semearModalidadesPadrao();
    rev();
    return { total };
  },
);
