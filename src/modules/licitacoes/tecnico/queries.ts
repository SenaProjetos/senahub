import "server-only";
import { prisma } from "@/lib/prisma";

export async function listarResponsaveisTecnicos(incluirInativos = false) {
  return prisma.responsavelTecnico.findMany({
    where: incluirInativos ? {} : { ativo: true },
    orderBy: { nome: "asc" },
  });
}
