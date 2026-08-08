import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Ordenação canônica dos catálogos. `ordem` empata com frequência (seed e backfill numeram
 * cada um a partir de zero), então o nome desempata — sem isso a lista sai não-determinística
 * e a tela "muda de ordem sozinha" entre recarregamentos.
 */
const ORDEM = [{ ordem: "asc" as const }, { nome: "asc" as const }];

/** Cargos ativos — alimenta os selects dos formulários de cadastro. */
export async function catalogoCargos() {
  return prisma.cargo.findMany({ where: { ativo: true }, orderBy: ORDEM, select: { id: true, nome: true } });
}

/** Departamentos ativos — idem. `setor` acompanha para a tela poder agrupar. */
export async function catalogoDepartamentos() {
  return prisma.departamento.findMany({
    where: { ativo: true },
    orderBy: ORDEM,
    select: { id: true, nome: true, setor: true },
  });
}

/**
 * Visão de administração: ativos **e** arquivados, com quantas pessoas usam cada item.
 * A contagem é o que impede excluir um item em uso (só arquivar).
 */
export async function catalogosAdmin() {
  const [cargos, departamentos] = await Promise.all([
    prisma.cargo.findMany({
      orderBy: ORDEM,
      select: { id: true, nome: true, ativo: true, ordem: true, _count: { select: { users: true } } },
    }),
    prisma.departamento.findMany({
      orderBy: ORDEM,
      select: { id: true, nome: true, setor: true, ativo: true, ordem: true, _count: { select: { users: true } } },
    }),
  ]);
  return {
    cargos: cargos.map((c) => ({ id: c.id, nome: c.nome, ativo: c.ativo, ordem: c.ordem, emUso: c._count.users })),
    departamentos: departamentos.map((d) => ({
      id: d.id, nome: d.nome, setor: d.setor, ativo: d.ativo, ordem: d.ordem, emUso: d._count.users,
    })),
  };
}

export type CatalogosAdmin = Awaited<ReturnType<typeof catalogosAdmin>>;
export type CargoOpcao = Awaited<ReturnType<typeof catalogoCargos>>[number];
export type DepartamentoOpcao = Awaited<ReturnType<typeof catalogoDepartamentos>>[number];
