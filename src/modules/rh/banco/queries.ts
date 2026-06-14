import "server-only";
import { prisma } from "@/lib/prisma";

/** Fechamentos de banco de horas de um mês, com nome do colaborador. */
export async function fechamentosDoMes(ano: number, mes: number) {
  const rows = await prisma.bancoHorasMensal.findMany({
    where: { ano, mes },
    include: { user: { select: { name: true } } },
    orderBy: { user: { name: "asc" } },
  });
  return rows.map((r) => ({
    userId: r.userId,
    nome: r.user.name,
    saldoMinutos: r.saldoMinutos,
    acumuladoMinutos: r.acumuladoMinutos,
    fechadoEm: r.fechadoEm.toISOString(),
  }));
}

/** Histórico de fechamentos de um colaborador (mais recentes primeiro). */
export async function bancoHorasDe(userId: string) {
  const rows = await prisma.bancoHorasMensal.findMany({
    where: { userId },
    orderBy: [{ ano: "desc" }, { mes: "desc" }],
    take: 24,
  });
  return rows.map((r) => ({
    ano: r.ano,
    mes: r.mes,
    saldoMinutos: r.saldoMinutos,
    acumuladoMinutos: r.acumuladoMinutos,
  }));
}

/** Acumulado fechado mais recente do colaborador (até o mês informado, exclusivo). */
export async function acumuladoAte(userId: string, ano: number, mes: number) {
  const row = await prisma.bancoHorasMensal.findFirst({
    where: { userId, OR: [{ ano: { lt: ano } }, { ano, mes: { lt: mes } }] },
    orderBy: [{ ano: "desc" }, { mes: "desc" }],
    select: { ano: true, mes: true, acumuladoMinutos: true },
  });
  return row;
}
