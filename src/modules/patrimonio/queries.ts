import "server-only";
import { prisma } from "@/lib/prisma";

/** Inventário do escritório (com filtros simples). */
export async function listarAtivos(opts?: { q?: string; categoria?: string; status?: string }) {
  const and: import("@/generated/prisma/client").Prisma.AtivoWhereInput[] = [];
  if (opts?.q) {
    and.push({
      OR: [
        { nome: { contains: opts.q, mode: "insensitive" } },
        { categoria: { contains: opts.q, mode: "insensitive" } },
        { localizacao: { contains: opts.q, mode: "insensitive" } },
      ],
    });
  }
  if (opts?.categoria) and.push({ categoria: opts.categoria });
  if (opts?.status) and.push({ status: opts.status });

  return prisma.ativo.findMany({
    where: and.length ? { AND: and } : undefined,
    orderBy: [{ createdAt: "desc" }],
    include: { responsavel: { select: { id: true, name: true } } },
  });
}

/** Categorias distintas já usadas (para o filtro). */
export async function categoriasAtivo(): Promise<string[]> {
  const rows = await prisma.ativo.findMany({
    where: { categoria: { not: null } },
    select: { categoria: true },
    distinct: ["categoria"],
    orderBy: { categoria: "asc" },
  });
  return rows.map((r) => r.categoria!).filter(Boolean);
}

/** Máquinas de TI com contagem de peças/manutenções e responsável. */
export async function listarMaquinas() {
  return prisma.maquinaTI.findMany({
    orderBy: [{ nome: "asc" }],
    include: {
      responsavel: { select: { id: true, name: true } },
      patrimonio: { select: { id: true, nome: true } },
      _count: { select: { componentes: true, manutencoes: true } },
    },
  });
}

/** Detalhe da máquina (relatório por PC): specs + peças + histórico. */
export async function obterMaquina(id: string) {
  return prisma.maquinaTI.findUnique({
    where: { id },
    include: {
      responsavel: { select: { id: true, name: true } },
      patrimonio: { select: { id: true, nome: true, categoria: true, localizacao: true } },
      componentes: { orderBy: { createdAt: "asc" } },
      manutencoes: { orderBy: { data: "desc" } },
    },
  });
}

/** Colaboradores internos (para o seletor de responsável). */
export async function colaboradoresInternos() {
  return prisma.user.findMany({
    where: { ativo: true, role: { not: "cliente" } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

/** Ativos sem máquina vinculada (para vincular ao cadastrar um PC). */
export async function ativosSemMaquina() {
  return prisma.ativo.findMany({
    where: { maquina: null },
    select: { id: true, nome: true },
    orderBy: { nome: "asc" },
  });
}

export type AtivoListItem = Awaited<ReturnType<typeof listarAtivos>>[number];
export type MaquinaListItem = Awaited<ReturnType<typeof listarMaquinas>>[number];
export type MaquinaDetalhe = NonNullable<Awaited<ReturnType<typeof obterMaquina>>>;
