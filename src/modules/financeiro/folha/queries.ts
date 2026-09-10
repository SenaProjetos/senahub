import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

export async function listarFolha(opts?: { status?: "pendente" | "pago" | "cancelado" }) {
  const where: Prisma.PagamentoProjetistaWhereInput = {};
  if (opts?.status) where.status = opts.status;
  const [itens, semValor] = await Promise.all([
    prisma.pagamentoProjetista.findMany({
      where,
      orderBy: [{ status: "asc" }, { liberadoEm: "desc" }],
      include: {
        projetista: { select: { name: true } },
        disciplina: { select: { disciplinaTextoLegado: true, projeto: { select: { codigo: true, nome: true } } } },
      },
    }),
    // Contado no banco, não sobre `itens`: quando a lista for paginada, um `.filter()`
    // aqui passaria a contar só a página (ver D11 no plano de refatoração).
    prisma.pagamentoProjetista.count({ where: { status: "pendente", valor: { lte: 0 } } }),
  ]);
  const pendente = itens
    .filter((i) => i.status === "pendente")
    .reduce((s, i) => s + Number(i.valor), 0);
  const pago = itens.filter((i) => i.status === "pago").reduce((s, i) => s + Number(i.valor), 0);
  // Serializa Decimal → number (Client Components não aceitam Decimal).
  const itensSerial = itens.map((i) => ({ ...i, valor: Number(i.valor) }));
  return { itens: itensSerial, pendente, pago, semValor };
}

export type FolhaItem = Awaited<ReturnType<typeof listarFolha>>["itens"][number];
