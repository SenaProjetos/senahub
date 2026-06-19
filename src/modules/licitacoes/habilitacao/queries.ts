import "server-only";
import { prisma } from "@/lib/prisma";

export async function listarChecklistModelos(incluirInativos = false) {
  return prisma.checklistHabilitacaoModelo.findMany({
    where: incluirInativos ? {} : { ativo: true },
    orderBy: [{ ordem: "asc" }, { nome: "asc" }],
    include: { itens: { orderBy: { ordem: "asc" } } },
  });
}
