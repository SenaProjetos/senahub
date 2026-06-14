import "server-only";
import { prisma } from "@/lib/prisma";

/** Pranchas agrupadas por disciplina de um projeto. */
export async function pranchasDoProjeto(projetoId: string) {
  const discs = await prisma.disciplina.findMany({
    where: { projetoId },
    orderBy: { ordem: "asc" },
    select: {
      id: true,
      nome: true,
      pranchas: {
        orderBy: [{ ordem: "asc" }, { codigo: "asc" }],
        select: { id: true, codigo: true, titulo: true, revisao: true, escala: true },
      },
    },
  });
  return discs;
}
