import "server-only";
import { prisma } from "@/lib/prisma";

export async function listarSancoesProprias() {
  return prisma.sancaoPropria.findMany({ orderBy: { createdAt: "desc" } });
}

export async function listarSancoesConcorrentes() {
  return prisma.sancaoConcorrente.findMany({
    orderBy: { createdAt: "desc" },
    include: { fornecedor: { select: { nome: true } } },
  });
}
