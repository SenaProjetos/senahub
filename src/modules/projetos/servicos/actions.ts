"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { sincronizarDespesaServico } from "@/modules/financeiro/custo/lancamento-custo";

const base = { modulo: "projetos", recurso: "projetos", permissao: "gerir" } as const;
const opt = (s: z.ZodString) => s.optional().or(z.literal(""));
const rev = (projetoId: string) => {
  revalidatePath(`/projetos/${projetoId}/servicos`);
  revalidatePath(`/projetos/${projetoId}`);
  revalidatePath("/financeiro/lancamentos");
  revalidatePath("/financeiro/contas-a-pagar");
};

const servicoSchema = z.object({
  projetoId: z.string().min(1),
  fornecedorId: opt(z.string()),
  descricao: z.string().min(1, "Informe a descrição."),
  valor: z.number().nonnegative().optional(),
  status: z.enum(["contratado", "concluido", "cancelado"]).default("contratado"),
});

export const criarServico = defineAction(
  { ...base, acao: "criar-servico", entidade: "ServicoTerceirizado", schema: servicoSchema },
  async (i, { user }) => {
    const projeto = await prisma.projeto.findUnique({
      where: { id: i.projetoId },
      select: { codigo: true },
    });
    if (!projeto) throw new ActionError("Projeto não encontrado.");

    const s = await prisma.$transaction(async (tx) => {
      const servico = await tx.servicoTerceirizado.create({
        data: {
          projetoId: i.projetoId,
          fornecedorId: i.fornecedorId || null,
          descricao: i.descricao,
          valor: i.valor,
          status: i.status,
        },
      });
      // Espelha no financeiro (despesa prevista/confirmada conforme status).
      const lancamentoId = await sincronizarDespesaServico(tx, {
        servicoLancamentoId: null,
        valor: i.valor ?? null,
        status: i.status,
        fornecedorId: i.fornecedorId || null,
        descricao: i.descricao,
        projetoId: i.projetoId,
        projetoCodigo: projeto.codigo,
        autorId: user.id,
      });
      if (lancamentoId) {
        await tx.servicoTerceirizado.update({ where: { id: servico.id }, data: { lancamentoId } });
      }
      return servico;
    });

    rev(i.projetoId);
    return { id: s.id };
  },
);

export const editarServico = defineAction(
  { ...base, acao: "editar-servico", entidade: "ServicoTerceirizado", schema: servicoSchema.extend({ id: z.string().min(1) }) },
  async (i, { user }) => {
    const atual = await prisma.servicoTerceirizado.findUnique({
      where: { id: i.id },
      select: { lancamentoId: true, projeto: { select: { codigo: true } } },
    });
    if (!atual) throw new ActionError("Serviço não encontrado.");

    await prisma.$transaction(async (tx) => {
      await tx.servicoTerceirizado.update({
        where: { id: i.id },
        data: {
          fornecedorId: i.fornecedorId || null,
          descricao: i.descricao,
          valor: i.valor ?? null,
          status: i.status,
        },
      });
      const lancamentoId = await sincronizarDespesaServico(tx, {
        servicoLancamentoId: atual.lancamentoId,
        valor: i.valor ?? null,
        status: i.status,
        fornecedorId: i.fornecedorId || null,
        descricao: i.descricao,
        projetoId: i.projetoId,
        projetoCodigo: atual.projeto.codigo,
        autorId: user.id,
      });
      // Mantém o vínculo coerente (cria/limpa conforme o resultado).
      if (lancamentoId !== atual.lancamentoId) {
        await tx.servicoTerceirizado.update({ where: { id: i.id }, data: { lancamentoId } });
      }
    });

    rev(i.projetoId);
    return { id: i.id };
  },
);

export const excluirServico = defineAction(
  { ...base, acao: "excluir-servico", entidade: "ServicoTerceirizado", schema: z.object({ id: z.string().min(1) }) },
  async (i) => {
    const s = await prisma.servicoTerceirizado.findUnique({
      where: { id: i.id },
      select: { projetoId: true, lancamentoId: true },
    });
    if (!s) throw new ActionError("Serviço não encontrado.");

    await prisma.$transaction(async (tx) => {
      // Cancela o lançamento vinculado (preserva histórico) antes de remover o serviço.
      if (s.lancamentoId) {
        await tx.lancamento.updateMany({
          where: { id: s.lancamentoId, status: { not: "cancelado" } },
          data: { status: "cancelado" },
        });
      }
      await tx.servicoTerceirizado.delete({ where: { id: i.id } });
    });

    rev(s.projetoId);
    return { id: i.id };
  },
);
