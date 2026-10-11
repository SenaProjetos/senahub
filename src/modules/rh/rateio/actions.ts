"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ActionError, defineAction } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";

import { calcularRateioDoMes } from "@/modules/rh/rateio/queries";
import { mesTerminou } from "@/modules/rh/rateio/custo-hora/distribuicao";

/** Foto do mês antes de refechar: o AuditLog mostra o que o fechamento substituiu. */
async function fechamentoAtual(ano: number, mes: number) {
  const [cabecalho, linhas] = await Promise.all([
    prisma.fechamentoRateio.findUnique({ where: { ano_mes: { ano, mes } }, select: { calculo: true, fechadoEm: true, fechadoPorId: true } }),
    prisma.rateioHora.aggregate({ where: { ano, mes }, _count: { _all: true }, _sum: { custo: true } }),
  ]);
  return cabecalho ? { ...cabecalho, linhas: linhas._count._all, custoTotal: Number(linhas._sum.custo ?? 0) } : null;
}

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
    entidade: "FechamentoRateio",
    schema: z.object({
      ano: z.number().int().min(2000).max(2100),
      mes: z.number().int().min(1).max(12),
    }),
    entidadeId: (_d, i) => `${i.ano}-${String(i.mes).padStart(2, "0")}`,
    capturarAntes: async (i) => fechamentoAtual(i.ano, i.mes),
  },
  async ({ ano, mes }, { user }) => {
    if (!mesTerminou(ano, mes, new Date())) {
      throw new ActionError("Este mês ainda não terminou. O rateio só fecha depois do último dia do mês.");
    }
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
