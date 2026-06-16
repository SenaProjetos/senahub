import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

const INCLUDE = {
  categoria: { select: { codigo: true, nome: true } },
  centro: { select: { nome: true } },
  conta: { select: { nome: true } },
  transacao: { select: { id: true } },
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

/**
 * Dados da tela unificada "Contas a pagar e receber": todos os pendentes
 * (previstos + aguardando aprovação) de ambos os tipos. Filtragem por período,
 * dimensões, busca etc. é feita no cliente (volume = só pendentes).
 */
export async function dadosContas() {
  const rows = await prisma.lancamento.findMany({
    where: { status: { in: ["previsto", "aguardando_aprovacao"] } },
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

/**
 * Dados do livro-caixa (tela "Lançamentos"): TODOS os lançamentos (qualquer status)
 * + contas bancárias com saldo inicial. Filtragem por período, conta, situação etc.
 * é feita no cliente; o saldo acumulado precisa da série completa.
 */
export async function dadosLivroCaixa() {
  const [rows, contas] = await Promise.all([
    prisma.lancamento.findMany({ orderBy: [{ data: "asc" }, { createdAt: "asc" }], include: INCLUDE }),
    prisma.contaBancaria.findMany({
      where: { ativo: true },
      orderBy: { ordem: "asc" },
      select: { id: true, nome: true, saldoInicial: true },
    }),
  ]);
  return {
    itens: rows.map((l) => ({ ...serializar(l), conciliado: l.transacao != null })),
    contas: contas.map((c) => ({ id: c.id, nome: c.nome, saldoInicial: Number(c.saldoInicial) })),
  };
}

export type OpcoesLancamento = Awaited<ReturnType<typeof opcoesLancamento>>;
export type LancamentoItem = Awaited<ReturnType<typeof listarLancamentos>>[number];
export type LivroCaixaDados = Awaited<ReturnType<typeof dadosLivroCaixa>>;
export type LivroCaixaItem = LivroCaixaDados["itens"][number];
