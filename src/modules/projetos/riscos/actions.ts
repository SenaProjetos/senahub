"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { STATUS_RISCO } from "@/modules/projetos/riscos/regras";

// Registro de riscos do projeto. Moram na Visão Geral desde 2026-09-29 (a aba Extras saiu); as
// `acao` de auditoria são as de antes, para o histórico continuar contínuo.
const gerir = { modulo: "projetos", recurso: "projetos", permissao: "gerir" } as const;

const grau = z.number().int().min(1).max(3);
const camposRisco = {
  descricao: z.string().trim().min(1, "Descreva o risco."),
  probabilidade: grau,
  impacto: grau,
  mitigacao: z.string().trim().optional().or(z.literal("")),
};

function revalidar(projetoId: string) {
  revalidatePath(`/projetos/${projetoId}`);
}

export const criarRisco = defineAction(
  {
    ...gerir,
    acao: "criar-risco-projeto",
    entidade: "Projeto",
    schema: z.object({ projetoId: z.string().min(1), ...camposRisco }),
    entidadeId: (_d, i) => i.projetoId,
  },
  async (input) => {
    const risco = await prisma.riscoProjeto.create({
      data: {
        projetoId: input.projetoId,
        descricao: input.descricao,
        probabilidade: input.probabilidade,
        impacto: input.impacto,
        mitigacao: input.mitigacao || null,
      },
    });
    revalidar(input.projetoId);
    return { id: risco.id };
  },
);

export const atualizarRisco = defineAction(
  {
    ...gerir,
    acao: "atualizar-risco-projeto",
    entidade: "RiscoProjeto",
    schema: z.object({ riscoId: z.string().min(1), ...camposRisco, status: z.enum(STATUS_RISCO) }),
    entidadeId: (d) => (d as { projetoId: string }).projetoId,
    capturarAntes: async (input) => prisma.riscoProjeto.findUnique({ where: { id: input.riscoId } }),
  },
  async (input) => {
    const risco = await prisma.riscoProjeto.findUnique({ where: { id: input.riscoId }, select: { projetoId: true } });
    if (!risco) throw new ActionError("Risco não encontrado.");
    await prisma.riscoProjeto.update({
      where: { id: input.riscoId },
      data: {
        descricao: input.descricao,
        probabilidade: input.probabilidade,
        impacto: input.impacto,
        mitigacao: input.mitigacao || null,
        status: input.status,
      },
    });
    revalidar(risco.projetoId);
    return { riscoId: input.riscoId, projetoId: risco.projetoId };
  },
);

export const excluirRisco = defineAction(
  {
    ...gerir,
    acao: "excluir-risco-projeto",
    entidade: "RiscoProjeto",
    schema: z.object({ riscoId: z.string().min(1) }),
    entidadeId: (d) => (d as { projetoId: string }).projetoId,
    capturarAntes: async (input) => prisma.riscoProjeto.findUnique({ where: { id: input.riscoId } }),
  },
  async (input) => {
    const risco = await prisma.riscoProjeto.findUnique({ where: { id: input.riscoId }, select: { projetoId: true } });
    if (!risco) throw new ActionError("Risco não encontrado.");
    await prisma.riscoProjeto.delete({ where: { id: input.riscoId } });
    revalidar(risco.projetoId);
    return { riscoId: input.riscoId, projetoId: risco.projetoId };
  },
);
