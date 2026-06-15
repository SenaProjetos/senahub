"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";

const base = { modulo: "financeiro", recurso: "financeiro", permissao: "gerir" } as const;

/**
 * Agrupa em um lote mensal os pagamentos de projetistas liberados no mês e ainda sem lote.
 * Idempotente: se o lote do mês já existe, anexa os novos e recalcula o total.
 */
export const gerarFolhaDoMes = defineAction(
  {
    ...base,
    acao: "gerar-folha-lote",
    entidade: "FolhaProjetista",
    schema: z.object({ ano: z.number().int().min(2000).max(2100), mes: z.number().int().min(1).max(12) }),
  },
  async ({ ano, mes }) => {
    const ini = new Date(ano, mes - 1, 1);
    const fim = new Date(ano, mes, 1);
    const pend = await prisma.pagamentoProjetista.findMany({
      where: { folhaId: null, liberadoEm: { gte: ini, lt: fim } },
      select: { id: true },
    });
    if (pend.length === 0) throw new ActionError("Nenhum pagamento liberado no mês fora de lote.");

    const folha = await prisma.$transaction(async (tx) => {
      const existente = await tx.folhaProjetista.findUnique({ where: { ano_mes: { ano, mes } } });
      const f = existente ?? (await tx.folhaProjetista.create({ data: { ano, mes, status: "fechada", fechadaEm: new Date() } }));
      await tx.pagamentoProjetista.updateMany({ where: { id: { in: pend.map((p) => p.id) } }, data: { folhaId: f.id } });
      const agg = await tx.pagamentoProjetista.aggregate({ where: { folhaId: f.id }, _sum: { valor: true } });
      return tx.folhaProjetista.update({
        where: { id: f.id },
        data: { total: agg._sum.valor ?? 0, status: "fechada", fechadaEm: existente?.fechadaEm ?? new Date() },
      });
    });
    revalidatePath("/financeiro/folha-projetistas");
    return { id: folha.id, vinculados: pend.length };
  },
);
