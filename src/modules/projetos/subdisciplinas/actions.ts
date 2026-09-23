"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { subdisciplinasDoCard } from "./queries";

const base = { modulo: "configuracoes", recurso: "configuracoes", permissao: "gerir" } as const;

function rev() {
  revalidatePath("/configuracoes/disciplinas");
}

export const listarSubdisciplinasAction = defineAction(
  { ...base, acao: "listar-subdisciplinas", audit: false, schema: z.object({ disciplinaCatalogoId: z.string().min(1) }) },
  async (i) => subdisciplinasDoCard(i.disciplinaCatalogoId),
);

export const criarSubdisciplina = defineAction(
  {
    ...base,
    acao: "criar-subdisciplina",
    entidade: "SubdisciplinaCatalogo",
    schema: z.object({ disciplinaCatalogoId: z.string().min(1), nome: z.string().trim().min(1).max(80) }),
    entidadeId: (d) => (d as { id: string }).id,
  },
  async (i) => {
    const existe = await prisma.subdisciplinaCatalogo.findUnique({
      where: { disciplinaCatalogoId_nome: { disciplinaCatalogoId: i.disciplinaCatalogoId, nome: i.nome } },
      select: { id: true },
    });
    if (existe) throw new ActionError(`"${i.nome}" já existe neste card.`);
    const max = await prisma.subdisciplinaCatalogo.aggregate({
      where: { disciplinaCatalogoId: i.disciplinaCatalogoId },
      _max: { ordem: true },
    });
    const criada = await prisma.subdisciplinaCatalogo.create({
      data: { disciplinaCatalogoId: i.disciplinaCatalogoId, nome: i.nome, ordem: (max._max.ordem ?? -1) + 1 },
    });
    rev();
    return { id: criada.id };
  },
);

export const editarSubdisciplina = defineAction(
  {
    ...base,
    acao: "editar-subdisciplina",
    entidade: "SubdisciplinaCatalogo",
    entidadeId: (_d, i) => i.id,
    schema: z.object({ id: z.string().min(1), nome: z.string().trim().min(1).max(80), ativo: z.boolean() }),
    capturarAntes: (i) => prisma.subdisciplinaCatalogo.findUnique({ where: { id: i.id } }),
  },
  async (i) => {
    const existe = await prisma.subdisciplinaCatalogo.findUnique({ where: { id: i.id }, select: { disciplinaCatalogoId: true } });
    if (!existe) throw new ActionError("Sub-disciplina não encontrada.");
    const conflito = await prisma.subdisciplinaCatalogo.findFirst({
      where: { disciplinaCatalogoId: existe.disciplinaCatalogoId, nome: i.nome, id: { not: i.id } },
      select: { id: true },
    });
    if (conflito) throw new ActionError(`"${i.nome}" já existe neste card.`);
    await prisma.subdisciplinaCatalogo.update({ where: { id: i.id }, data: { nome: i.nome, ativo: i.ativo } });
    rev();
    return { id: i.id };
  },
);

/** Exclusão definitiva — bloqueada se algum documento já apontar para esta sub (arquive em vez disso). */
export const excluirSubdisciplina = defineAction(
  {
    ...base,
    acao: "excluir-subdisciplina",
    entidade: "SubdisciplinaCatalogo",
    entidadeId: (_d, i) => i.id,
    schema: z.object({ id: z.string().min(1) }),
  },
  async (i) => {
    const uso = await prisma.documentoDisciplina.count({ where: { subdisciplinaId: i.id } });
    if (uso > 0) throw new ActionError(`Em uso em ${uso} documento(s) — desative em vez de excluir.`);
    await prisma.subdisciplinaCatalogo.delete({ where: { id: i.id } });
    rev();
    return { id: i.id };
  },
);
