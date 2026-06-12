import "server-only";
import { prisma } from "@/lib/prisma";

export function listarCategorias() {
  return prisma.categoriaFinanceira.findMany({ orderBy: { codigo: "asc" } });
}

export function listarCentros() {
  return prisma.centroCusto.findMany({ orderBy: { ordem: "asc" } });
}

export function listarContasBancarias() {
  return prisma.contaBancaria.findMany({ orderBy: [{ padrao: "desc" }, { ordem: "asc" }] });
}

export function listarFormasPagamento() {
  return prisma.formaPagamento.findMany({ orderBy: { ordem: "asc" } });
}

export function listarFornecedores(incluirInativos = true) {
  return prisma.fornecedor.findMany({
    where: incluirInativos ? {} : { ativo: true },
    orderBy: { nome: "asc" },
  });
}

export async function listarSocios() {
  return prisma.socio.findMany({
    include: { user: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
}

/** Usuários internos elegíveis a sócio (ainda não cadastrados). */
export async function usuariosParaSocio() {
  const socios = await prisma.socio.findMany({ select: { userId: true } });
  const ids = socios.map((s) => s.userId);
  return prisma.user.findMany({
    where: { ativo: true, role: { not: "cliente" }, id: { notIn: ids } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export type Categoria = Awaited<ReturnType<typeof listarCategorias>>[number];
export type ContaBancaria = Awaited<ReturnType<typeof listarContasBancarias>>[number];
export type Fornecedor = Awaited<ReturnType<typeof listarFornecedores>>[number];
export type SocioItem = Awaited<ReturnType<typeof listarSocios>>[number];
