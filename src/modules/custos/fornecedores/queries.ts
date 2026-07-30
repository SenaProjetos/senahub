import "server-only";
import { prisma } from "@/lib/prisma";

export function listarFornecedores(incluirInativos = true) {
  return prisma.custoFornecedor.findMany({
    where: incluirInativos ? {} : { ativo: true },
    orderBy: { nome: "asc" },
    include: {
      representantes: { where: { ativo: true }, orderBy: { nome: "asc" } },
    },
  });
}
