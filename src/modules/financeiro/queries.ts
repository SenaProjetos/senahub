import "server-only";
import { prisma } from "@/lib/prisma";

/** Extrato próprio do projetista: pagamentos por entrega validada. */
export async function meuExtrato(userId: string) {
  const pagamentos = await prisma.pagamentoProjetista.findMany({
    where: { projetistaId: userId },
    orderBy: { liberadoEm: "desc" },
    include: {
      disciplina: {
        select: { nome: true, projeto: { select: { codigo: true, nome: true } } },
      },
    },
  });
  const total = pagamentos.reduce((s, p) => s + Number(p.valor), 0);
  const pago = pagamentos.filter((p) => p.status === "pago").reduce((s, p) => s + Number(p.valor), 0);
  const aberto = pagamentos
    .filter((p) => p.status === "pendente")
    .reduce((s, p) => s + Number(p.valor), 0);
  return { pagamentos, total, pago, aberto };
}

export type ExtratoItem = Awaited<ReturnType<typeof meuExtrato>>["pagamentos"][number];
