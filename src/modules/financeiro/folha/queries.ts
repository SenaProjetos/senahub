import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

export async function listarFolha(opts?: { status?: "pendente" | "pago" | "cancelado" }) {
  const where: Prisma.PagamentoProjetistaWhereInput = {};
  if (opts?.status) where.status = opts.status;
  const itens = await prisma.pagamentoProjetista.findMany({
    where,
    orderBy: [{ status: "asc" }, { liberadoEm: "desc" }],
    include: {
      projetista: { select: { name: true } },
      disciplina: { select: { nome: true, projeto: { select: { codigo: true, nome: true } } } },
    },
  });
  const pendente = itens
    .filter((i) => i.status === "pendente")
    .reduce((s, i) => s + Number(i.valor), 0);
  const pago = itens.filter((i) => i.status === "pago").reduce((s, i) => s + Number(i.valor), 0);
  return { itens, pendente, pago };
}

export type FolhaItem = Awaited<ReturnType<typeof listarFolha>>["itens"][number];
