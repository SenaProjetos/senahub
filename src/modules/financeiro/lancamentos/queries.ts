import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { hojeParaBanco, utcFimDoDia, utcInicioDoDia } from "@/lib/data";
import { SEM_TRANSFERENCIA } from "@/modules/financeiro/natureza";

const INCLUDE = {
  // Prioridade padrão (da categoria e da mãe): a efetiva do planejador, mostrada em Contas.
  // `natureza` (ADR-0008): o livro caixa separa transferência e fora do resultado por ela, nunca pelo nome.
  categoria: { select: { codigo: true, nome: true, natureza: true, prioridadePadrao: true, pai: { select: { prioridadePadrao: true } } } },
  centro: { select: { nome: true } },
  conta: { select: { nome: true } },
  transacao: { select: { id: true } },
  projeto: { select: { codigo: true, nome: true } },
  fornecedor: { select: { nome: true } },
  cliente: { select: { nome: true } },
  documentoFinanceiro: { select: { id: true, tipo: true, numero: true } },
  anexos: { orderBy: { createdAt: "desc" }, select: { id: true, nome: true, mime: true, tamanho: true, createdAt: true } },
  statusHistorico: { orderBy: { createdAt: "desc" }, select: { de: true, para: true, createdAt: true } },
  // M10: rateio entre centros/projetos — só para o menu saber se já tem rateio e pré-preencher o diálogo.
  rateios: { select: { centroId: true, projetoId: true, percentualBp: true } },
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
  // Previsão do cronograma (F7.2) não é lançamento do livro — vive na projeção de caixa e no contrato.
  const where: Prisma.LancamentoWhereInput = { status: { not: "previsao" } };
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
  const [categorias, centros, contas, formas, projetos, fornecedores, clientes, caixinhas] = await Promise.all([
    prisma.categoriaFinanceira.findMany({ where: { ativo: true }, orderBy: { codigo: "asc" }, select: { id: true, codigo: true, nome: true, tipo: true } }),
    prisma.centroCusto.findMany({ where: { ativo: true }, orderBy: { ordem: "asc" }, select: { id: true, nome: true } }),
    // M4: a conta de um investimento só se mexe pela tela de Investimentos (aporte, resgate, rendimento).
    prisma.contaBancaria.findMany({ where: { ativo: true, investimento: null }, orderBy: { ordem: "asc" }, select: { id: true, nome: true } }),
    prisma.formaPagamento.findMany({ where: { ativo: true }, orderBy: { ordem: "asc" }, select: { id: true, nome: true } }),
    prisma.projeto.findMany({ orderBy: [{ ano: "desc" }, { sequencial: "desc" }], select: { id: true, codigo: true, nome: true } }),
    prisma.fornecedor.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prisma.cliente.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prisma.caixinha.findMany({ where: { ativo: true }, orderBy: [{ ordem: "asc" }, { nome: "asc" }], select: { id: true, nome: true } }),
  ]);
  return { categorias, centros, contas, formas, projetos, fornecedores, clientes, caixinhas };
}

/**
 * Dados do livro-caixa (tela "Lançamentos"): TODOS os lançamentos (qualquer status)
 * + contas bancárias com saldo inicial. Filtragem por período, conta, situação etc.
 * é feita no cliente; o saldo acumulado precisa da série completa.
 */
export async function dadosLivroCaixa() {
  const [rows, contas] = await Promise.all([
    // Todo status MENOS a previsão do cronograma (F7.2): ela não é lançamento, é projeção.
    prisma.lancamento.findMany({
      where: { status: { not: "previsao" } },
      orderBy: [{ data: "asc" }, { createdAt: "asc" }],
      include: INCLUDE,
    }),
    prisma.contaBancaria.findMany({
      where: { ativo: true },
      orderBy: { ordem: "asc" },
      select: { id: true, nome: true, saldoInicial: true, saldoInicialEm: true },
    }),
  ]);
  return {
    itens: rows.map((l) => ({ ...serializar(l), conciliado: l.transacao != null })),
    // M8: o saldo inicial vale no começo de `saldoInicialEm` — o painel de contas do livro caixa não soma de novo o
    // que foi pago antes (mesma regra de `saldoBase`, `saldoDoSistema` e do Extrato).
    contas: contas.map((c) => ({
      id: c.id,
      nome: c.nome,
      saldoInicial: Number(c.saldoInicial),
      saldoInicialEm: c.saldoInicialEm ? c.saldoInicialEm.toISOString().slice(0, 10) : null,
    })),
  };
}

export type OpcoesLancamento = Awaited<ReturnType<typeof opcoesLancamento>>;
export type LancamentoItem = Awaited<ReturnType<typeof listarLancamentos>>[number];
export type LivroCaixaDados = Awaited<ReturnType<typeof dadosLivroCaixa>>;
export type LivroCaixaItem = LivroCaixaDados["itens"][number];

/** Contas em aberto já vencidas (selo de "Contas" na barra do Financeiro). Perna de transferência não é cobrança. */
export async function totalContasVencidas(): Promise<number> {
  return prisma.lancamento.count({
    where: { status: "previsto", vencimento: { lt: hojeParaBanco() }, ...SEM_TRANSFERENCIA },
  });
}

/**
 * Pagas e recebidas de um mês (aba de Contas): lançamentos realizados, pela DATA DO PAGAMENTO. Transferência
 * entre contas próprias fica de fora (não é conta paga nem recebida — aparece no Extrato por conta).
 */
export async function dadosPagas(mes: string) {
  const [ano, m] = mes.split("-").map(Number);
  const rows = await prisma.lancamento.findMany({
    where: {
      status: "confirmado",
      dataConfirmacao: { gte: utcInicioDoDia(ano, m - 1), lte: utcFimDoDia(ano, m, 0) },
      ...SEM_TRANSFERENCIA,
    },
    orderBy: [{ dataConfirmacao: "desc" }, { createdAt: "desc" }],
    include: INCLUDE,
  });
  return rows.map((l) => ({ ...serializar(l), conciliado: l.transacao != null }));
}
export type PagaItem = Awaited<ReturnType<typeof dadosPagas>>[number];

/** Quantas contas estão em aberto (aba "Em aberto"). */
export async function totalContasEmAberto(): Promise<number> {
  return prisma.lancamento.count({ where: { status: { in: ["previsto", "aguardando_aprovacao"] } } });
}
