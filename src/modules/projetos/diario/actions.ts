"use server";

import { revalidatePath } from "next/cache";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { criarEntradaDiarioSchema, editarEntradaDiarioSchema } from "./schemas";
import { podeEscreverNoDiario, podeGerirEntrada } from "./acesso";
import { ultimasEntradasDisciplina } from "./queries";
import { escopoProjeto } from "@/modules/projetos/queries";
import { INTERNAL_ROLES } from "@/lib/roles";
import { z } from "zod";

// Gate grosso = acesso ao projeto (projetos:ver); o gate fino (responsável da
// disciplina / autor da entrada) é verificado dentro de cada handler.
const base = { modulo: "projetos", recurso: "projetos", permissao: "ver", entidade: "DiarioEntrada" } as const;

export const criarEntradaDiario = defineAction(
  { ...base, acao: "criar-entrada-diario", schema: criarEntradaDiarioSchema, entidadeId: (d) => (d as { projetoId: string }).projetoId },
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
    return { id: entrada.id, projetoId: disciplina.projetoId };
  },
);

export const editarEntradaDiario = defineAction(
  { ...base, acao: "editar-entrada-diario", schema: editarEntradaDiarioSchema, entidadeId: (d) => (d as { projetoId: string }).projetoId },
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
    return { id: i.id, projetoId: entrada.projetoId };
  },
);

export const excluirEntradaDiario = defineAction(
  { ...base, acao: "excluir-entrada-diario", schema: z.object({ id: z.string().min(1) }), entidadeId: (d) => (d as { projetoId: string }).projetoId },
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
    return { id: i.id, projetoId: entrada.projetoId };
  },
);

// ── Leitura para o atalho do diário (card disciplina + ponto) ───────────────

/**
 * Últimas 5 entradas de uma disciplina, para o modal do atalho (fora do painel).
 * `roles: INTERNAL_ROLES` = mesmo piso da página `/diario`: o diário é da equipe
 * interna, cliente NUNCA lê (escopoProjeto sozinho deixaria o cliente ver o
 * diário do próprio projeto, pois ele tem `projetos:ver`).
 */
export const buscarUltimasEntradasDiario = defineAction(
  { ...base, acao: "buscar-ultimas-entradas-diario", roles: INTERNAL_ROLES, schema: z.object({ disciplinaId: z.string().min(1) }), audit: false },
  async ({ disciplinaId }, { user }) => {
    const disciplina = await prisma.disciplina.findFirst({
      where: { id: disciplinaId, projeto: { AND: [escopoProjeto(user)] } },
      select: { id: true },
    });
    if (!disciplina) throw new ActionError("Disciplina não encontrada.");
    return ultimasEntradasDisciplina(disciplinaId);
  },
);
