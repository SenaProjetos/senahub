import "server-only";
import { prisma } from "@/lib/prisma";
import { condicoesDoJson } from "@/modules/financeiro/regras/service";
import type { Condicao } from "@/modules/financeiro/regras/motor";

export type RegraPreenchimentoDto = {
  id: string;
  ordem: number;
  ativo: boolean;
  condicoes: Condicao[];
  categoriaId: string | null;
  centroId: string | null;
  formaId: string | null;
  projetoId: string | null;
  fornecedorId: string | null;
  clienteId: string | null;
  tags: string[];
  usos: number;
  ultimoUsoEm: string | null;
};

/** Regras na ordem da lista (a primeira que casa vale). */
export async function carregarRegrasDePreenchimento(): Promise<RegraPreenchimentoDto[]> {
  const rs = await prisma.regraCategorizacao.findMany({ orderBy: [{ ordem: "asc" }, { id: "asc" }] });
  return rs.map((r) => ({
    id: r.id,
    ordem: r.ordem,
    ativo: r.ativo,
    condicoes: condicoesDoJson(r.condicoes),
    categoriaId: r.categoriaId,
    centroId: r.centroId,
    formaId: r.formaId,
    projetoId: r.projetoId,
    fornecedorId: r.fornecedorId,
    clienteId: r.clienteId,
    tags: r.tags,
    usos: r.usos,
    ultimoUsoEm: r.ultimoUsoEm ? r.ultimoUsoEm.toISOString() : null,
  }));
}

export type OpcoesDasRegras = {
  categorias: { id: string; codigo: string; nome: string; tipo: string }[];
  centros: { id: string; nome: string }[];
  formas: { id: string; nome: string }[];
  projetos: { id: string; nome: string }[];
  fornecedores: { id: string; nome: string }[];
  clientes: { id: string; nome: string }[];
  contas: { id: string; nome: string }[];
};

/** O que o editor oferece em cada lista. */
export async function opcoesDasRegras(): Promise<OpcoesDasRegras> {
  const [categorias, centros, formas, projetos, fornecedores, clientes, contas] = await Promise.all([
    prisma.categoriaFinanceira.findMany({ where: { ativo: true }, orderBy: { codigo: "asc" }, select: { id: true, codigo: true, nome: true, tipo: true } }),
    prisma.centroCusto.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prisma.formaPagamento.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prisma.projeto.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prisma.fornecedor.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prisma.cliente.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prisma.contaBancaria.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
  ]);
  return { categorias, centros, formas, projetos, fornecedores, clientes, contas };
}
