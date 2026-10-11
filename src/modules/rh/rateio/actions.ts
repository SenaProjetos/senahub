"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";

import { calcularRateioDoMes } from "@/modules/rh/rateio/queries";

/**
 * Fecha o rateio do mês: grava o cabeçalho (`FechamentoRateio`, com o cálculo usado) e o snapshot
 * das linhas, inclusive "não alocado". Refechar substitui o anterior — a trava e a reabertura com
 * motivo são a R3 do roteiro (docs/superpowers/plans/2026-10-11-rateio-horas-r1-custo-da-hora.md).
 */
export const fecharRateioMes = defineAction(
  {
    modulo: "rh",
    acao: "fechar-rateio",
    gereRh: true,
    entidade: "RateioHora",
    schema: z.object({
      ano: z.number().int().min(2000).max(2100),
      mes: z.number().int().min(1).max(12),
    }),
  },
  async ({ ano, mes }, { user }) => {
    const { calculo, linhas } = await calcularRateioDoMes(ano, mes);
    const result = await prisma.$transaction(async (tx) => {
      // Cabeçalho ANTES das linhas: o upsert trava a linha do mês, e um segundo "Fechar mês" ao
      // mesmo tempo espera este terminar em vez de gravar as linhas por cima (contaria em dobro).
      await tx.fechamentoRateio.upsert({
        where: { ano_mes: { ano, mes } },
        create: { ano, mes, calculo, fechadoPorId: user.id },
        update: { calculo, fechadoEm: new Date(), fechadoPorId: user.id },
      });
      await tx.rateioHora.deleteMany({ where: { ano, mes } });
      if (linhas.length === 0) return 0;
      await tx.rateioHora.createMany({
        data: linhas.map((l) => ({
          userId: l.userId,
          projetoId: l.projetoId,
          natureza: l.natureza,
          contratacao: l.contratacao,
          ano,
          mes,
          minutos: l.minutos,
          custoHora: l.minutos > 0 ? Math.round((l.custoCent * 60) / l.minutos) / 100 : 0,
          custo: l.custoCent / 100,
        })),
      });
      return linhas.length;
    });
    revalidatePath("/ponto");
    return { linhas: result, calculo };
  },
);
