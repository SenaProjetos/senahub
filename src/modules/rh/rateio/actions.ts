"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { HR_ADMIN_ROLES } from "@/lib/roles";
import { calcularRateioDetalhado } from "@/modules/rh/rateio/queries";

/**
 * Fecha o rateio do mês: congela um snapshot do custo de horas por projeto.
 * Idempotente — recalcula e regrava as linhas do mês (substitui fechamento anterior).
 */
export const fecharRateioMes = defineAction(
  {
    modulo: "rh",
    acao: "fechar-rateio",
    roles: HR_ADMIN_ROLES,
    entidade: "RateioHora",
    schema: z.object({
      ano: z.number().int().min(2000).max(2100),
      mes: z.number().int().min(1).max(12),
    }),
  },
  async ({ ano, mes }) => {
    const rows = await calcularRateioDetalhado(ano, mes);
    const result = await prisma.$transaction(async (tx) => {
      await tx.rateioHora.deleteMany({ where: { ano, mes } });
      if (rows.length === 0) return 0;
      await tx.rateioHora.createMany({
        data: rows.map((r) => ({
          userId: r.userId,
          projetoId: r.projetoId,
          ano,
          mes,
          minutos: r.minutos,
          custoHora: r.custoHora,
          custo: Number(r.custo.toFixed(2)),
        })),
      });
      return rows.length;
    });
    revalidatePath("/ponto");
    return { linhas: result };
  },
);
