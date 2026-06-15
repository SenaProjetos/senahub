import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

const INCLUDE = {
  categoria: { select: { codigo: true, nome: true } },
  conta: { select: { nome: true } },
  projeto: { select: { codigo: true, nome: true } },
  fornecedor: { select: { nome: true } },
  cliente: { select: { nome: true } },
  documentoFinanceiro: { select: { id: true, tipo: true, numero: true } },
  anexos: { orderBy: { createdAt: "desc" }, select: { id: true, nome: true, mime: true, tamanho: true, createdAt: true } },
  statusHistorico: { orderBy: { createdAt: "desc" }, select: { de: true, para: true, createdAt: true } },
} satisfies Prisma.LancamentoInclude;

type LancRaw = Prisma.LancamentoGetPayload<{ include: typeof INCLUDE }>;
/** Serializa Decimal → number (Client Components não aceitam Decimal). */
function serializar(l: LancRaw) {
  return {
    ...l,
    valor: Number(l.valor),
    valorEfetivo: l.valorEfetivo != null ? Number(l.valorEfetivo) : null,
  };
}

export async function listarLancamentos(opts?: {
  tipo?: "receita" | "despesa";
  status?: "previsto" | "confirmado" | "cancelado";
  de?: string;
  ate?: string;
  q?: string;
}) {
  const where: Prisma.LancamentoWhereInput = {};
  if (opts?.tipo) where.tipo = opts.tipo;
  if (opts?.status) where.status = opts.status;
  if (opts?.q) where.descricao = { contains: opts.q, mode: "insensitive" };
  if (opts?.de || opts?.ate) {
    where.data = {};
    if (opts.de) (where.data as Prisma.DateTimeFilter).gte = new Date(opts.de);
    if (opts.ate) (where.data as Prisma.DateTimeFilter).lte = new Date(opts.ate);
  }
  const rows = await prisma.lancamento.findMany({ where, orderBy: { data: "desc" }, include: INCLUDE });
  return rows.map(serializar);
}

/** Contas a pagar: despesas previstas, ordenadas por vencimento. */
export async function contasAPagar() {
  const rows = await prisma.lancamento.findMany({
    where: { tipo: "despesa", status: "previsto" },
    orderBy: [{ vencimento: "asc" }, { data: "asc" }],
    include: INCLUDE,
  });
  return rows.map(serializar);
}

/** Contas a receber: receitas previstas, ordenadas por vencimento. */
export async function contasAReceber() {
  const rows = await prisma.lancamento.findMany({
    where: { tipo: "receita", status: "previsto" },
    orderBy: [{ vencimento: "asc" }, { data: "asc" }],
    include: INCLUDE,
  });
  return rows.map(serializar);
}

/** Opções para os selects do formulário de lançamento. */
export async function opcoesLancamento() {
  const [categorias, centros, contas, formas, projetos, fornecedores, clientes] = await Promise.all([
    prisma.categoriaFinanceira.findMany({ where: { ativo: true }, orderBy: { codigo: "asc" }, select: { id: true, codigo: true, nome: true, tipo: true } }),
    prisma.centroCusto.findMany({ where: { ativo: true }, orderBy: { ordem: "asc" }, select: { id: true, nome: true } }),
    prisma.contaBancaria.findMany({ where: { ativo: true }, orderBy: { ordem: "asc" }, select: { id: true, nome: true } }),
    prisma.formaPagamento.findMany({ where: { ativo: true }, orderBy: { ordem: "asc" }, select: { id: true, nome: true } }),
    prisma.projeto.findMany({ orderBy: [{ ano: "desc" }, { sequencial: "desc" }], select: { id: true, codigo: true, nome: true } }),
    prisma.fornecedor.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prisma.cliente.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
  ]);
  return { categorias, centros, contas, formas, projetos, fornecedores, clientes };
}

export type OpcoesLancamento = Awaited<ReturnType<typeof opcoesLancamento>>;
export type LancamentoItem = Awaited<ReturnType<typeof listarLancamentos>>[number];
