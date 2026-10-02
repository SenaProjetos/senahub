import "server-only";
import { prisma } from "@/lib/prisma";
import type { OpcoesCartoes } from "@/components/financeiro/cartoes/dialogos";

/** O que os diálogos de cartão e de compra oferecem (categorias de despesa, contatos, contas, sócios). */
export async function opcoesDosCartoes(): Promise<OpcoesCartoes> {
  const [categorias, centros, projetos, fornecedores, contas, socios] = await Promise.all([
    prisma.categoriaFinanceira.findMany({ where: { ativo: true }, orderBy: { codigo: "asc" }, select: { id: true, codigo: true, nome: true, tipo: true } }),
    prisma.centroCusto.findMany({ where: { ativo: true }, orderBy: { ordem: "asc" }, select: { id: true, nome: true } }),
    prisma.projeto.findMany({ orderBy: [{ ano: "desc" }, { sequencial: "desc" }], select: { id: true, codigo: true, nome: true } }),
    prisma.fornecedor.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prisma.contaBancaria.findMany({ where: { ativo: true }, orderBy: { ordem: "asc" }, select: { id: true, nome: true } }),
    prisma.socio.findMany({ where: { ativo: true }, select: { id: true, user: { select: { name: true } } } }),
  ]);
  return { categorias, centros, projetos, fornecedores, contas, socios: socios.map((s) => ({ id: s.id, nome: s.user.name })) };
}
