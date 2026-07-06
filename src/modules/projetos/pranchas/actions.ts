"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { proporPranchasImport } from "./queries";

const base = {
  modulo: "projetos",
  recurso: "projetos",
  permissao: "gerir",
  // Correlação do histórico do projeto: toda ação de prancha carrega o disciplinaId.
  entidadeId: (d: unknown, i: unknown) =>
    (i as { disciplinaId?: string })?.disciplinaId ?? (d as { disciplinaId?: string } | undefined)?.disciplinaId,
} as const;

async function revProjetoDaDisciplina(disciplinaId: string) {
  const d = await prisma.disciplina.findUnique({ where: { id: disciplinaId }, select: { projetoId: true } });
  if (d) revalidatePath(`/projetos/${d.projetoId}/lista-mestre`);
}

const pranchaFields = {
  folha: z.string().min(1, "Informe a folha."),
  tipo: z.string().min(1, "Informe o tipo."),
  fase: z.string().min(1, "Informe a fase."),
  numeracao: z.number().int().min(0),
  revisao: z.number().int().min(0).default(0),
  conteudo: z.string().max(1000).optional(),
};

const criarSchema = z.object({ disciplinaId: z.string().min(1), ...pranchaFields });

export const criarPrancha = defineAction(
  { ...base, acao: "criar-prancha", entidade: "Prancha", schema: criarSchema },
  async (i) => {
    const max = await prisma.prancha.aggregate({ where: { disciplinaId: i.disciplinaId }, _max: { ordem: true } });
    const p = await prisma.prancha.create({
      data: {
        disciplinaId: i.disciplinaId,
        folha: i.folha,
        tipo: i.tipo,
        fase: i.fase,
        numeracao: i.numeracao,
        revisao: i.revisao,
        conteudo: i.conteudo || null,
        ordem: (max._max.ordem ?? -1) + 1,
      },
    });
    await revProjetoDaDisciplina(i.disciplinaId);
    return { id: p.id };
  },
);

export const editarPrancha = defineAction(
  { ...base, acao: "editar-prancha", entidade: "Prancha", schema: criarSchema.extend({ id: z.string().min(1) }) },
  async (i) => {
    await prisma.prancha.update({
      where: { id: i.id },
      data: {
        folha: i.folha,
        tipo: i.tipo,
        fase: i.fase,
        numeracao: i.numeracao,
        revisao: i.revisao,
        conteudo: i.conteudo || null,
      },
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
    return { id: i.id, disciplinaId: p.disciplinaId };
  },
);

/** Lê os PDFs do pacote A e devolve a proposta de import (sem gravar). */
export const proporPranchas = defineAction(
  { ...base, acao: "propor-pranchas", audit: false, schema: z.object({ disciplinaId: z.string().min(1) }) },
  async (i) => {
    const r = await proporPranchasImport(i.disciplinaId);
    if (!r) throw new ActionError("Disciplina não encontrada.");
    return r;
  },
);

const loteSchema = z.object({
  disciplinaId: z.string().min(1),
  pranchas: z.array(z.object(pranchaFields)).min(1, "Nenhuma prancha para salvar."),
});

export const salvarPranchasLote = defineAction(
  { ...base, acao: "importar-pranchas", entidade: "Prancha", schema: loteSchema },
  async (i) => {
    const max = await prisma.prancha.aggregate({ where: { disciplinaId: i.disciplinaId }, _max: { ordem: true } });
    let ordem = (max._max.ordem ?? -1) + 1;
    await prisma.prancha.createMany({
      data: i.pranchas.map((p) => ({
        disciplinaId: i.disciplinaId,
        folha: p.folha,
        tipo: p.tipo,
        fase: p.fase,
        numeracao: p.numeracao,
        revisao: p.revisao,
        conteudo: p.conteudo || null,
        ordem: ordem++,
      })),
    });
    await revProjetoDaDisciplina(i.disciplinaId);
    return { total: i.pranchas.length };
  },
);
