"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { HR_ADMIN_ROLES } from "@/lib/roles";
import { espelhoMes } from "@/modules/ponto/queries";

/**
 * Fecha o banco de horas do mês para CLT/estagiário:
 * congela o saldo do mês e o acumulado (acumulado anterior + saldo). Idempotente (upsert).
 */
export const fecharBancoMesEquipe = defineAction(
  {
    modulo: "rh",
    acao: "fechar-banco-horas",
    roles: HR_ADMIN_ROLES,
    entidade: "BancoHorasMensal",
    schema: z.object({
      ano: z.number().int().min(2000).max(2100),
      mes: z.number().int().min(1).max(12),
    }),
  },
  async ({ ano, mes }) => {
    const users = await prisma.user.findMany({
      where: { ativo: true, role: { in: ["clt", "estagiario"] } },
      select: { id: true },
    });
    const prevMes = mes === 1 ? 12 : mes - 1;
    const prevAno = mes === 1 ? ano - 1 : ano;

    let fechados = 0;
    for (const u of users) {
      const esp = await espelhoMes(u.id, ano, mes);
      const prev = await prisma.bancoHorasMensal.findUnique({
        where: { userId_ano_mes: { userId: u.id, ano: prevAno, mes: prevMes } },
        select: { acumuladoMinutos: true },
      });
      const acumulado = (prev?.acumuladoMinutos ?? 0) + esp.saldoMinutos;
      await prisma.bancoHorasMensal.upsert({
        where: { userId_ano_mes: { userId: u.id, ano, mes } },
        create: { userId: u.id, ano, mes, saldoMinutos: esp.saldoMinutos, acumuladoMinutos: acumulado },
        update: { saldoMinutos: esp.saldoMinutos, acumuladoMinutos: acumulado, fechadoEm: new Date() },
      });
      fechados++;
    }
    revalidatePath("/rh/admin");
    return { fechados };
  },
);
