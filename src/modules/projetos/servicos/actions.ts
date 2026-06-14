"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";

const base = { modulo: "projetos", recurso: "projetos", permissao: "gerir" } as const;
const opt = (s: z.ZodString) => s.optional().or(z.literal(""));
const rev = (projetoId: string) => revalidatePath(`/projetos/${projetoId}/servicos`);

const servicoSchema = z.object({
  projetoId: z.string().min(1),
  fornecedorId: opt(z.string()),
  descricao: z.string().min(1, "Informe a descrição."),
  valor: z.number().nonnegative().optional(),
  status: z.enum(["contratado", "concluido", "cancelado"]).default("contratado"),
});

export const criarServico = defineAction(
  { ...base, acao: "criar-servico", entidade: "ServicoTerceirizado", schema: servicoSchema },
  async (i) => {
    const s = await prisma.servicoTerceirizado.create({
      data: {
        projetoId: i.projetoId,
        fornecedorId: i.fornecedorId || null,
        descricao: i.descricao,
        valor: i.valor,
        status: i.status,
      },
    });
    rev(i.projetoId);
    return { id: s.id };
  },
);

export const editarServico = defineAction(
  { ...base, acao: "editar-servico", entidade: "ServicoTerceirizado", schema: servicoSchema.extend({ id: z.string().min(1) }) },
  async (i) => {
    await prisma.servicoTerceirizado.update({
      where: { id: i.id },
      data: {
        fornecedorId: i.fornecedorId || null,
        descricao: i.descricao,
        valor: i.valor ?? null,
        status: i.status,
      },
    });
    rev(i.projetoId);
    return { id: i.id };
  },
);

export const excluirServico = defineAction(
  { ...base, acao: "excluir-servico", entidade: "ServicoTerceirizado", schema: z.object({ id: z.string().min(1) }) },
  async (i) => {
    const s = await prisma.servicoTerceirizado.findUnique({ where: { id: i.id }, select: { projetoId: true } });
    if (!s) throw new ActionError("Serviço não encontrado.");
    await prisma.servicoTerceirizado.delete({ where: { id: i.id } });
    rev(s.projetoId);
    return { id: i.id };
  },
);
