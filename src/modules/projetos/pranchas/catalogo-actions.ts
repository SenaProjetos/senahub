"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";

const base = { modulo: "configuracoes", recurso: "configuracoes", permissao: "gerir" } as const;
const categoria = z.enum(["folha", "tipo", "fase"]);

function rev() {
  revalidatePath("/configuracoes/lista-mestre");
}

export const criarCatalogoPrancha = defineAction(
  {
    ...base,
    acao: "criar-catalogo-prancha",
    entidade: "PranchaCatalogo",
    schema: z.object({
      categoria,
      sigla: z.string().min(1).max(10),
      nome: z.string().min(1).max(80),
      projetoId: z.string().optional(),
    }),
  },
  async (i) => {
    const max = await prisma.pranchaCatalogo.aggregate({
      where: { categoria: i.categoria, projetoId: i.projetoId ?? null },
      _max: { ordem: true },
    });
    const c = await prisma.pranchaCatalogo.create({
      data: {
        categoria: i.categoria,
        sigla: i.sigla.toUpperCase(),
        nome: i.nome,
        projetoId: i.projetoId ?? null,
        ordem: (max._max.ordem ?? -1) + 1,
      },
    });
    rev();
    return { id: c.id };
  },
);

export const editarCatalogoPrancha = defineAction(
  {
    ...base,
    acao: "editar-catalogo-prancha",
    entidade: "PranchaCatalogo",
    schema: z.object({
      id: z.string().min(1),
      sigla: z.string().min(1).max(10),
      nome: z.string().min(1).max(80),
      ativo: z.boolean(),
    }),
  },
  async (i) => {
    await prisma.pranchaCatalogo.update({
      where: { id: i.id },
      data: { sigla: i.sigla.toUpperCase(), nome: i.nome, ativo: i.ativo },
    });
    rev();
    return { id: i.id };
  },
);

export const excluirCatalogoPrancha = defineAction(
  { ...base, acao: "excluir-catalogo-prancha", entidade: "PranchaCatalogo", schema: z.object({ id: z.string().min(1) }) },
  async (i) => {
    await prisma.pranchaCatalogo.delete({ where: { id: i.id } });
    rev();
    return { id: i.id };
  },
);
