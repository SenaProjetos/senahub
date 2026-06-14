"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";

const base = { modulo: "projetos", recurso: "projetos", permissao: "gerir" } as const;
const opt = (s: z.ZodString) => s.optional().or(z.literal(""));

async function revProjetoDaDisciplina(disciplinaId: string) {
  const d = await prisma.disciplina.findUnique({ where: { id: disciplinaId }, select: { projetoId: true } });
  if (d) revalidatePath(`/projetos/${d.projetoId}/pranchas`);
}

const pranchaSchema = z.object({
  disciplinaId: z.string().min(1),
  codigo: z.string().min(1, "Informe o código."),
  titulo: z.string().min(1, "Informe o título."),
  revisao: opt(z.string()),
  escala: opt(z.string()),
});

export const criarPrancha = defineAction(
  { ...base, acao: "criar-prancha", entidade: "Prancha", schema: pranchaSchema },
  async (i) => {
    const max = await prisma.prancha.aggregate({ where: { disciplinaId: i.disciplinaId }, _max: { ordem: true } });
    const p = await prisma.prancha.create({
      data: {
        disciplinaId: i.disciplinaId,
        codigo: i.codigo,
        titulo: i.titulo,
        revisao: i.revisao || null,
        escala: i.escala || null,
        ordem: (max._max.ordem ?? -1) + 1,
      },
    });
    await revProjetoDaDisciplina(i.disciplinaId);
    return { id: p.id };
  },
);

export const editarPrancha = defineAction(
  { ...base, acao: "editar-prancha", entidade: "Prancha", schema: pranchaSchema.extend({ id: z.string().min(1) }) },
  async (i) => {
    await prisma.prancha.update({
      where: { id: i.id },
      data: { codigo: i.codigo, titulo: i.titulo, revisao: i.revisao || null, escala: i.escala || null },
    });
    await revProjetoDaDisciplina(i.disciplinaId);
    return { id: i.id };
  },
);

export const excluirPrancha = defineAction(
  { ...base, acao: "excluir-prancha", entidade: "Prancha", schema: z.object({ id: z.string().min(1) }) },
  async (i) => {
    const p = await prisma.prancha.findUnique({ where: { id: i.id }, select: { disciplinaId: true } });
    if (!p) throw new ActionError("Prancha não encontrada.");
    await prisma.prancha.delete({ where: { id: i.id } });
    await revProjetoDaDisciplina(p.disciplinaId);
    return { id: i.id };
  },
);
