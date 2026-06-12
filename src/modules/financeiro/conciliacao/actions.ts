"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";

const base = { modulo: "financeiro", recurso: "financeiro", permissao: "gerir" } as const;
const rev = () => {
  revalidatePath("/financeiro/conciliacao");
  revalidatePath("/financeiro/lancamentos");
  revalidatePath("/financeiro/fluxo-caixa");
};

const conciliarSchema = z.object({ transacaoId: z.string().min(1), lancamentoId: z.string().min(1) });
const criarSchema = z.object({ transacaoId: z.string().min(1), categoriaId: z.string().min(1) });
const ignorarSchema = z.object({ transacaoId: z.string().min(1) });

/** Concilia a transação com um lançamento previsto existente → confirma-o. */
export const conciliarComLancamento = defineAction(
  { ...base, acao: "conciliar-transacao", entidade: "TransacaoBancaria", schema: conciliarSchema },
  async (i) => {
    const t = await prisma.transacaoBancaria.findUnique({ where: { id: i.transacaoId } });
    if (!t) throw new ActionError("Transação não encontrada.");
    if (t.conciliado) throw new ActionError("Transação já conciliada.");

    await prisma.$transaction([
      prisma.lancamento.update({
        where: { id: i.lancamentoId },
        data: { status: "confirmado", dataConfirmacao: t.data, contaId: t.contaId },
      }),
      prisma.transacaoBancaria.update({
        where: { id: t.id },
        data: { conciliado: true, lancamentoId: i.lancamentoId },
      }),
    ]);
    rev();
    return { id: t.id };
  },
);

/** Cria um novo lançamento confirmado a partir da transação e concilia. */
export const criarLancamentoDaTransacao = defineAction(
  { ...base, acao: "criar-lancamento-transacao", entidade: "Lancamento", schema: criarSchema },
  async (i, { user }) => {
    const t = await prisma.transacaoBancaria.findUnique({ where: { id: i.transacaoId } });
    if (!t) throw new ActionError("Transação não encontrada.");
    if (t.conciliado) throw new ActionError("Transação já conciliada.");

    const valor = Math.abs(Number(t.valor));
    const tipo = Number(t.valor) > 0 ? "receita" : "despesa";

    await prisma.$transaction(async (tx) => {
      const lanc = await tx.lancamento.create({
        data: {
          tipo,
          descricao: t.descricao,
          valor,
          status: "confirmado",
          data: t.data,
          dataConfirmacao: t.data,
          categoriaId: i.categoriaId,
          contaId: t.contaId,
          autorId: user.id,
        },
      });
      await tx.transacaoBancaria.update({
        where: { id: t.id },
        data: { conciliado: true, lancamentoId: lanc.id },
      });
    });
    rev();
    return { id: t.id };
  },
);

/** Marca a transação como conciliada sem gerar lançamento (ignorar). */
export const ignorarTransacao = defineAction(
  { ...base, acao: "ignorar-transacao", entidade: "TransacaoBancaria", schema: ignorarSchema },
  async (i) => {
    await prisma.transacaoBancaria.update({
      where: { id: i.transacaoId },
      data: { conciliado: true },
    });
    rev();
    return { id: i.transacaoId };
  },
);
