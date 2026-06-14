import "server-only";
import { prisma } from "@/lib/prisma";

/** Funcionários (CLT/estagiário) com seus dependentes — base p/ folha e dedução de IRRF. */
export async function listarFuncionarios() {
  const us = await prisma.user.findMany({
    where: { ativo: true, role: { in: ["clt", "estagiario"] } },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      role: true,
      salarioBase: true,
      dependentes: {
        orderBy: { createdAt: "asc" },
        select: { id: true, nome: true, nascimento: true, parentesco: true },
      },
      funcDocumentos: {
        orderBy: { createdAt: "desc" },
        select: { id: true, tipo: true, nome: true, nomeArquivo: true, tamanho: true, createdAt: true },
      },
    },
  });
  return us.map((u) => ({
    id: u.id,
    name: u.name,
    role: u.role,
    salarioBase: u.salarioBase != null ? Number(u.salarioBase) : null,
    dependentes: u.dependentes.map((d) => ({
      id: d.id,
      nome: d.nome,
      nascimento: d.nascimento ? d.nascimento.toISOString().slice(0, 10) : null,
      parentesco: d.parentesco,
    })),
    documentos: u.funcDocumentos.map((d) => ({
      id: d.id,
      tipo: d.tipo,
      nome: d.nome,
      nomeArquivo: d.nomeArquivo,
      tamanho: d.tamanho,
      criadoEm: d.createdAt.toISOString(),
    })),
  }));
}

/** Nº de dependentes por usuário (p/ a folha). */
export async function dependentesPorUsuario(userIds: string[]): Promise<Record<string, number>> {
  const grupos = await prisma.dependente.groupBy({
    by: ["userId"],
    where: { userId: { in: userIds } },
    _count: { _all: true },
  });
  const mapa: Record<string, number> = {};
  for (const g of grupos) mapa[g.userId] = g._count._all;
  return mapa;
}
