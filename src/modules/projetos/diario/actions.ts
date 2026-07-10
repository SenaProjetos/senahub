"use server";

import { revalidatePath } from "next/cache";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { criarEntradaDiarioSchema, editarEntradaDiarioSchema } from "./schemas";
import { podeEscreverNoDiario, podeGerirEntrada } from "./acesso";
import { ultimasEntradasDisciplina, disciplinasEscreviveisNoProjeto } from "./queries";
import { escopoProjeto } from "@/modules/projetos/queries";
import { z } from "zod";

// Gate grosso = acesso ao projeto (projetos:ver); o gate fino (responsável da
// disciplina / autor da entrada) é verificado dentro de cada handler.
const base = { modulo: "projetos", recurso: "projetos", permissao: "ver", entidade: "DiarioEntrada" } as const;

export const criarEntradaDiario = defineAction(
  { ...base, acao: "criar-entrada-diario", schema: criarEntradaDiarioSchema },
  async (i, { user }) => {
    const disciplina = await prisma.disciplina.findUnique({
      where: { id: i.disciplinaId },
      select: { projetoId: true, responsaveis: { select: { userId: true } } },
    });
    if (!disciplina) throw new ActionError("Disciplina não encontrada.");
    const ehResp = disciplina.responsaveis.some((r) => r.userId === user.id);
    if (!podeEscreverNoDiario({ role: user.role, ehResponsavelDaDisciplina: ehResp })) {
      throw new ActionError("Só o responsável pela disciplina (ou admin/supervisor) pode escrever no diário.");
    }
    const entrada = await prisma.diarioEntrada.create({
      data: {
        projetoId: disciplina.projetoId,
        disciplinaId: i.disciplinaId,
        autorId: user.id,
        data: new Date(`${i.data}T00:00:00.000Z`),
        texto: i.texto,
      },
      select: { id: true },
    });
    revalidatePath(`/projetos/${disciplina.projetoId}/diario`);
    return { id: entrada.id };
  },
);

export const editarEntradaDiario = defineAction(
  { ...base, acao: "editar-entrada-diario", schema: editarEntradaDiarioSchema },
  async (i, { user }) => {
    const entrada = await prisma.diarioEntrada.findUnique({
      where: { id: i.id },
      select: { autorId: true, projetoId: true },
    });
    if (!entrada) throw new ActionError("Entrada não encontrada.");
    if (!podeGerirEntrada({ userId: user.id, role: user.role, autorId: entrada.autorId })) {
      throw new ActionError("Só o autor (ou admin/supervisor) pode editar esta entrada.");
    }
    await prisma.diarioEntrada.update({ where: { id: i.id }, data: { texto: i.texto } });
    revalidatePath(`/projetos/${entrada.projetoId}/diario`);
    return { id: i.id };
  },
);

export const excluirEntradaDiario = defineAction(
  { ...base, acao: "excluir-entrada-diario", schema: z.object({ id: z.string().min(1) }) },
  async (i, { user }) => {
    const entrada = await prisma.diarioEntrada.findUnique({
      where: { id: i.id },
      select: { autorId: true, projetoId: true },
    });
    if (!entrada) throw new ActionError("Entrada não encontrada.");
    if (!podeGerirEntrada({ userId: user.id, role: user.role, autorId: entrada.autorId })) {
      throw new ActionError("Só o autor (ou admin/supervisor) pode excluir esta entrada.");
    }
    await prisma.diarioEntrada.delete({ where: { id: i.id } });
    revalidatePath(`/projetos/${entrada.projetoId}/diario`);
    return { id: i.id };
  },
);

// ── Leituras para os atalhos (card disciplina + ponto) ──────────────────────

/** Últimas 5 entradas de uma disciplina, para o modal do atalho (fora do painel). */
export const buscarUltimasEntradasDiario = defineAction(
  { ...base, acao: "buscar-ultimas-entradas-diario", schema: z.object({ disciplinaId: z.string().min(1) }), audit: false },
  async ({ disciplinaId }, { user }) => {
    const disciplina = await prisma.disciplina.findFirst({
      where: { id: disciplinaId, projeto: { AND: [escopoProjeto(user)] } },
      select: { id: true },
    });
    if (!disciplina) throw new ActionError("Disciplina não encontrada.");
    return ultimasEntradasDisciplina(disciplinaId);
  },
);

/** Disciplinas do projeto em que o usuário pode escrever — atalho do ponto (seletor quando houver mais de uma). */
export const buscarDisciplinasEscreviveis = defineAction(
  { ...base, acao: "buscar-disciplinas-escreviveis", schema: z.object({ projetoId: z.string().min(1) }), audit: false },
  async ({ projetoId }, { user }) => {
    const projeto = await prisma.projeto.findFirst({
      where: { id: projetoId, AND: [escopoProjeto(user)] },
      select: { id: true },
    });
    if (!projeto) throw new ActionError("Projeto não encontrado.");
    return disciplinasEscreviveisNoProjeto(user, projetoId);
  },
);
