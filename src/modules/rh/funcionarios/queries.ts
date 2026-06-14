import "server-only";
import { prisma } from "@/lib/prisma";
import { periodosAquisitivos, resumoAquisitivo } from "@/lib/aquisitivo";

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
      dataAdmissao: true,
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

  // Férias aprovadas de todos (1 query) p/ calcular dias gozados por período aquisitivo.
  const feriasAprovadas = await prisma.ferias.findMany({
    where: { userId: { in: us.map((u) => u.id) }, status: "aprovado" },
    select: { userId: true, inicio: true, fim: true },
  });
  const feriasPorUser = new Map<string, { inicio: Date; fim: Date }[]>();
  for (const f of feriasAprovadas) {
    const arr = feriasPorUser.get(f.userId) ?? [];
    arr.push({ inicio: f.inicio, fim: f.fim });
    feriasPorUser.set(f.userId, arr);
  }

  return us.map((u) => ({
    id: u.id,
    name: u.name,
    role: u.role,
    salarioBase: u.salarioBase != null ? Number(u.salarioBase) : null,
    dataAdmissao: u.dataAdmissao ? u.dataAdmissao.toISOString().slice(0, 10) : null,
    aquisitivo: u.dataAdmissao
      ? resumoAquisitivo(periodosAquisitivos(u.dataAdmissao, feriasPorUser.get(u.id) ?? []))
      : null,
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
